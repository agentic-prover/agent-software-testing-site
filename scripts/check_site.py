#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 The Agent Software Testing authors
"""Serve a built site on loopback, fetch every page and check it.

    python scripts/check_site.py [dist]            dist defaults to ./dist

Starting from index.html and 404.html the checker follows every link, script, stylesheet, icon and fragment (status 200, and a
#fragment must be an id in its target), then checks site-wide rules: page titles of one to four words before the site name, the viewport meta tag, the
dark-mode rules in the stylesheet, scripts only from the site and stylesheets only from the site and Google Fonts,
relative links only, that the site hosts no data page and no data file of the release (no data.html, no CSV, no SHA256SUMS; only the branch maps that the program
pages fetch and the small files that the front page and Results ask for), no link to a bare "#", and that no page is missing from the output. It prints the weight of every page and exits
with status 0 when all checks pass.
"""
from __future__ import annotations

import functools
import http.server
import re
import socketserver
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
import zlib
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from assets_of import asset  # noqa: E402

HERE = Path(__file__).resolve().parent.parent


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):  # noqa: D401
        pass


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, str, str]] = []   # (kind, url, tag)
        self.ids: set[str] = set()
        self.title = ""
        self._in_title = False
        self._title_done = False
        self.meta: dict[str, str] = {}
        self.tags: list[str] = []
        self.inline_handlers: list[str] = []
        self.has_base = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        self.tags.append(tag)
        if "id" in a:
            self.ids.add(a["id"])
        if tag == "title" and not self._title_done:
            self._in_title = True
        if tag == "meta" and a.get("name"):
            self.meta[a["name"]] = a.get("content", "")
        for k in a:
            if k.startswith("on"):
                self.inline_handlers.append(f"{tag}[{k}]={a[k]}")
        if tag == "a" and a.get("href") is not None:
            self.links.append(("a", a["href"], tag))
        elif tag == "link" and a.get("href"):
            self.links.append(("link:" + (a.get("rel") or ""), a["href"], tag))
        elif tag == "script" and a.get("src"):
            self.links.append(("script", a["src"], tag))
        elif tag == "img" and a.get("src"):
            self.links.append(("img", a["src"], tag))

    def handle_endtag(self, tag):
        if tag == "title" and self._in_title:
            self._in_title = False
            self._title_done = True

    def handle_data(self, data):
        if self._in_title:
            self.title += data


def serve(root: Path):
    handler = functools.partial(Quiet, directory=str(root))
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}/"


def fetch(url: str):
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, b""


# The scroll edges are the only gradients of the site: the row or frame that scrolls sideways (the background of the frame, and the two edges drawn over a frame in a .tbl-cue,
# which also cover its head), the legend of the chart and the list of Terms, which scroll up and down; and the arrow of a select.
GRADIENT_SELECTORS = (".fade-x, .tbl-wrap", ".fade-y, .terms-dl", ".tbl-cue::before", ".tbl-cue::after", "select")


def main(argv=None) -> int:
    args = [a for a in (argv if argv is not None else sys.argv[1:]) if not a.startswith("--")]
    dist = Path(args[0]).resolve() if args else HERE / "dist"
    if not (dist / "index.html").is_file():
        print(f"{dist}: no index.html")
        return 1
    problems: list[str] = []

    def bad(msg):
        problems.append(msg)

    httpd, base = serve(dist)
    seen: dict[str, Page] = {}
    pages_to_check: list[tuple[str, str, str]] = []
    sizes: dict[str, int] = {}
    external: set[str] = set()
    queue = ["index.html", "404.html", "results.html"]
    done: set[str] = set()
    try:
        while queue:
            rel = queue.pop(0)
            if rel in done:
                continue
            done.add(rel)
            status, body = fetch(base + urllib.parse.quote(rel))
            if status != 200:
                bad(f"{rel}: status {status}")
                continue
            sizes[rel] = len(body)
            if not rel.endswith(".html"):
                continue
            page = Page()
            page.feed(body.decode("utf-8"))
            seen[rel] = page
            here = urllib.parse.urlsplit("/" + rel)
            for kind, url, tag in page.links:
                u = urllib.parse.urlsplit(url)
                if u.scheme in ("http", "https"):
                    external.add(u.netloc)
                    continue
                if u.scheme or url.startswith("//") or url.startswith("/"):
                    bad(f"{rel}: not a relative link: {url}")
                    continue
                if rel == "404.html" and url.startswith("#") and url != "#main":
                    bad("404.html: fragment-only link (the base tag set for it would redirect it); only the skip link may have one, and app.js handles it")
                path = urllib.parse.urljoin(here.path, u.path) if u.path else here.path
                target = path.lstrip("/")
                if target.endswith("/") or target == "":
                    target += "index.html"
                if rel == "404.html":
                    target = u.path or "404.html"  # a 404 page is read from the root of the site
                if target not in done and target not in queue:
                    queue.append(target)
                if u.fragment:
                    pages_to_check.append((rel, target, u.fragment))
    finally:
        httpd.shutdown()
    # fragments need the parsed targets, which exist after the crawl
    for src, target, frag in pages_to_check:
        if target == "compare.html" and "_vs_" in frag:
            continue      # a pair token: compare.js reads it, there is no element with that id
        t = seen.get(target)
        if target.endswith(".html") and t is not None and frag not in t.ids:
            bad(f"{src}: link to {target}#{frag}, which is not an id there")

    # ---- page rules
    for rel, page in sorted(seen.items()):
        raw = (dist / rel).read_text(encoding="utf-8")
        # the part before the site name: that label is fixed (site.json title_suffix) and does not count against the page's own one to four words
        stem = page.title.rsplit(" | ", 1)[0]
        words = re.findall(r"[A-Za-z0-9][A-Za-z0-9+.'-]*", stem)
        if not (1 <= len(words) <= 4):
            bad(f"{rel}: title {page.title!r} has {len(words)} words before the site name; the rule is one to four")
        if not re.match(r"\s*<!doctype html>", raw, re.I):
            bad(f"{rel}: no doctype")
        if "viewport" not in page.meta:
            bad(f"{rel}: no viewport meta tag")
        if "description" not in page.meta:
            bad(f"{rel}: no meta description")
        if re.search(r'<a[^>]*\shref="#"', raw):
            bad(f"{rel}: a link to a bare # (it goes nowhere)")
        for h in page.inline_handlers:
            if "this.media='all'" not in h:
                bad(f"{rel}: inline event handler {h}")
        for kind, url, tag in page.links:
            u = urllib.parse.urlsplit(url)
            if u.scheme in ("http", "https"):
                if kind == "script":
                    bad(f"{rel}: external script {url}")
                if kind.startswith("link:stylesheet") and u.netloc != "fonts.googleapis.com":
                    bad(f"{rel}: external stylesheet {url}")
        for mo in re.finditer(r"<th[^>]*>(.*?)</th>", raw, re.S):
            if re.search(r'<svg[^>]*role="img"', mo.group(1)):
                bad(f"{rel}: an svg with role img inside a table header (its description would be read before every cell)")
                break
        if not re.search(r"<main[^>]*\sid=\"main\"", raw):
            bad(f"{rel}: no <main id=\"main\">")
        if 'class="skip" href="#main"' not in raw:
            bad(f"{rel}: no skip link (404.html included)")
        if not re.search(r'<main[^>]*class="shell no-js"', raw) or 'classList.remove("no-js")' not in raw:
            bad(f"{rel}: <main> lacks the no-js class or the inline script that removes it")
        for mo in re.finditer(r"<th[^>]*>(?:(?!</th>).)*?<button class=\"sort\"(?:(?!</th>).)*</th>", raw, re.S):
            if 'class="th-static"' not in mo.group(0):
                bad(f"{rel}: a sort button without the plain label that shows while no script runs")
                break
        for mo in re.finditer(r"<t[dh][^>]*>(?:(?!</t[dh]>).)*?<button type=\"button\"[^>]*data-grp=(?:(?!</t[dh]>).)*</t[dh]>", raw, re.S):
            if 'class="grp-static"' not in mo.group(0):
                bad(f"{rel}: a group button without the plain label that shows while no script runs")
                break
        if rel == "404.html" and "a.skip" not in asset(dist, "app.js").read_text(encoding="utf-8"):
            bad("404.html: app.js does not handle the skip link of the page that sets a <base>")
        h1 = len(re.findall(r"<h1[\s>]", raw))
        if h1 != 1:
            bad(f"{rel}: {h1} h1 elements")

    # ---- the release id: a build of a release that has a name states it in the header of every data page (Method, Contribute and the 404 page are not data pages)
    data_pages = [rel for rel in seen if rel not in ("method.html", "contribute.html", "404.html")]
    stamped = [rel for rel in data_pages if 'class="relid"' in (dist / rel).read_text(encoding="utf-8")]
    if stamped and len(stamped) != len(data_pages):
        bad(f"the release id is missing from the header of: {', '.join(sorted(set(data_pages) - set(stamped))[:5])}")

    # ---- the pages that must exist
    programs = sorted(p.stem for p in (dist / "programs").glob("*.html")) if (dist / "programs").is_dir() else []
    for need in ["index.html", "results.html", "all-versions.html", "tools.html", "releases.html", "compare.html", "method.html", "contribute.html", "404.html"]:
        if need not in seen:
            bad(f"{need}: missing from the crawl")
    tool_pages = sorted(p.name for p in dist.glob("tool-*.html"))
    if not tool_pages and 'aria-label="Pages of the tools"' in (dist / "tools.html").read_text(encoding="utf-8"):
        bad("tool-*.html: no page for a tool")      # a release that has no tools.csv has no page for a tool
    for name in tool_pages:
        if name not in seen:
            bad(f"{name}: not reachable by links")
    if (dist / "data.html").exists():
        bad("data.html: the site hosts no data page; the data lives in the results repository")
    hosted = sorted(str(f.relative_to(dist)) for f in dist.rglob("*") if f.is_file() and (f.suffix == ".csv" or f.name == "SHA256SUMS"))
    if hosted:
        bad(f"the site hosts data files that belong to the results repository: {', '.join(hosted[:4])}")
    if len(programs) != 18:
        bad(f"programs/: {len(programs)} pages, expected 18")
    for p in programs:
        if f"programs/{p}.html" not in seen:
            bad(f"programs/{p}.html: not reachable by links")

    # ---- stylesheet rules
    # The build publishes a style sheet that every page asks for (site.css) and, for the pages that need them, one for the program pages, one for Compare and one for the
    # two pages of prose. Each is checked as written or as minified: the rules are the same, the white space is not.
    css_path = asset(dist, "site.css")
    css = css_path.read_text(encoding="utf-8") if css_path.is_file() else ""
    sheets = {"site.css": css}
    for extra in ("program.css", "compare.css", "prose.css", "home.css"):
        try:
            sheets[extra] = asset(dist, extra).read_text(encoding="utf-8")
        except FileNotFoundError:
            pass      # a build with --no-split has one style sheet
    allcss = "\n".join(sheets.values())
    if not re.search(r"^:root\s*\{", css, re.M):
        bad("site.css: no bare :root block")
    if not re.search(r':root\[data-theme="dark"\]\s*\{[^}]*color-scheme:\s*dark', css):
        bad("site.css: no dark tokens for the dark theme")
    if not re.search(r"body\s*\{[^}]*background:\s*var\(--bg\)", css):
        bad("site.css: body has no explicit background token")
    if "prefers-reduced-motion" not in css:
        bad("site.css: prefers-reduced-motion is not handled")
    if not re.search(r"@media \(forced-colors:\s*active\)", css):
        bad("site.css: no forced-colors rule (the chosen and the current state must survive Windows high contrast)")
    for name, text in sheets.items():
        # the forced-colours rules come last in each style sheet, so that no rule of the components or of the branch map overrides them
        if "@media (forced-colors" not in text:
            continue
        at = text.rfind("@media (forced-colors")
        depth, end = 0, None
        for i in range(text.index("{", at), len(text)):
            depth += text[i] == "{"
            depth -= text[i] == "}"
            if depth == 0:
                end = i + 1
                break
        if end is None or text[end:].strip():
            bad(f"{name}: rules follow the last forced-colors block; it must be the last thing in the stylesheet")
    map_sheet = "program.css" if "program.css" in sheets else "site.css"      # the branch map rules are in the program sheet (in the one sheet of a build with --no-split)
    mo = re.search(r"\.bm-tool\.is-on\s*\{", sheets[map_sheet])
    if mo and "@media (forced-colors" in sheets[map_sheet] and sheets[map_sheet].index("@media (forced-colors") < mo.start():
        bad(f"{map_sheet}: a forced-colors block comes before the branch map rules")
    nocomment = re.sub(r"/\*.*?\*/", "", allcss, flags=re.S)
    for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", nocomment):
        if "gradient(" in body and re.sub(r"\s*,\s*", ", ", sel.strip().split("\n")[-1].strip()) not in GRADIENT_SELECTORS:
            bad(f"site.css: a gradient outside the scroll edges ({', '.join(GRADIENT_SELECTORS[:-1])}) and the select caret: {sel.strip()[:60]}")
    if re.search(r"a\.pname\.go|content:\s*\"\\203A\"", css):
        bad("site.css: a chevron after a program name (a link carries no mark after it; Chrome would also read generated content into its name)")
    for need in (".no-js .tbl th button.sort", ".no-js .lgcb", ".no-js .pick", ".no-js .tbl th .th-static", ".no-js .tbl .grp button"):
        if need not in allcss:
            bad(f"site.css: no rule for {need} (controls that need a script are hidden while the page has no-js)")
    # rules to keep: no opacity on a legend row (a dimmed row fails contrast), fonts that exist
    for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", allcss):
        mo = re.search(r"(?<![-\w])opacity:\s*([\d.]+)", body)
        if "lgrow" in sel and mo and float(mo.group(1)) != 0:
            bad(f"site.css: opacity on a legend row ({sel.strip()[:60]})")
    for u in re.findall(r"url\(([^)]+\.woff2)\)", css):
        if not (dist / "assets" / u.strip("'\"")).is_file() and not (dist / u.strip("'\"")).is_file():
            bad(f"site.css: font file {u} is missing")
    if ":focus-visible" not in css:
        bad("site.css: no visible focus rule")
    # no colour literal outside the token blocks
    rest = re.sub(r":root\s*\{[^{}]*\}", "", allcss)
    rest = re.sub(r':root\[data-theme="dark"\]\s*\{[^{}]*\}', "", rest)
    lits = set(re.findall(r"#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(", re.sub(r"/\*.*?\*/", "", rest, flags=re.S)))
    if lits:
        bad(f"site.css: colour literals outside the tokens: {sorted(lits)[:5]}")
    for js in sorted((dist / "assets").glob("*.js")):
        t = js.read_text(encoding="utf-8")
        for mo in re.finditer(r'addEventListener\("change"', t):
            if re.search(r"location(\.href)?\s*=", t[mo.end(): mo.end() + 240].split("});")[0]):
                bad(f"{js.name}: a change handler sets the location (WCAG 3.2.2)")
        if re.search(r"#[0-9a-fA-F]{6}\b", t):
            bad(f"{js.name}: colour literal in a script")
        if re.search(r"(?<![\w.])(alert|confirm|prompt)\s*\(", t):
            bad(f"{js.name}: alert, confirm or prompt")
        if re.search(r"https?://", t) and not js.name.startswith("app."):
            bad(f"{js.name}: a script that names an external address")

    # ---- report
    total = sum(sizes.values())
    print(f"build: {len(seen)} pages fetched, {len(sizes)} files reached, {total / 1024:.0f} KiB")
    print("external hosts referenced:", ", ".join(sorted(external)) or "none")
    def gz(path: str) -> int:
        return len(zlib.compress((dist / path).read_bytes(), 9))

    print(f"  {'page':34s} {'html':>10s} {'gzip':>9s} {'first load, gzip (html, stylesheet, scripts)':>46s}")
    for rel in sorted(k for k in seen):
        parts = [rel]
        for kind, url, tag in seen[rel].links:
            if kind in ("script", "link:stylesheet") and not urllib.parse.urlsplit(url).scheme:
                parts.append((urllib.parse.urljoin("/" + rel, url)).lstrip("/"))
        total = sum(gz(x) for x in dict.fromkeys(parts) if (dist / x).is_file())
        print(f"  {rel:34s} {sizes[rel] / 1024:7.1f} KiB {gz(rel) / 1024:6.1f} KiB {total / 1024:12.1f} KiB")
    if problems:
        print(f"\n{len(problems)} problems:")
        for p in problems:
            print(" -", p)
        return 1
    print("\nall checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
