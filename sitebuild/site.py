# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 The Agent Software Testing authors
"""Write the site: pages and assets (and the branch maps that the program pages fetch)."""
from __future__ import annotations

import gzip
import hashlib
import json
import re
from pathlib import Path

from . import assets, herodata, mapdata, pages, strip, tokens
from .data import BuildError, Model, fmt
from .html import FONT_LICENCES, SELF_FONTS, Ctx

HERE = Path(__file__).resolve().parent.parent
MANIFEST = ".build-manifest"      # suffix of the sidecar record (see Site.manifest): state for the next build, never a file of the site
STYLESHEETS = ("site.css", "branchmap.css", "popup.css", "forced-colors.css")      # in cascade order; the forced-colours rules come last
PRECOMPRESS = {".html", ".css", ".js", ".json", ".svg"}                  # what --precompress writes a .gz beside


REF_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")      # a tag or branch name for the links to files of the results repository


def hashed(rel: str, data: bytes) -> str:
    """The published name of a style sheet or a script: its name with the first ten hex digits of the SHA-256 of its content before the extension
    (assets/site.css -> assets/site.3f9a1c0b27.css). The same content gives the same name, so the build stays deterministic, and a changed file gets a new
    name, so a host can let a browser keep the old one for a year."""
    stem, ext = rel.rsplit(".", 1)
    return f"{stem}.{hashlib.sha256(data).hexdigest()[:10]}.{ext}"


class Site:
    def __init__(self, results: Path, out: Path, cfg: dict, content: Path | None = None, prune: bool = False, precompress: bool = False,
                 minify: bool = True, split: bool = True):
        self.results = Path(results)
        self.out = Path(out)
        self.cfg = cfg
        self.content = content or HERE / "content"
        self.prune = prune
        self.precompress = precompress
        self.minify = minify
        self.split = split
        self.assets: dict[str, str] = {}      # logical name (assets/app.js) -> published name (assets/app.<hash>.js)
        self.written: dict[str, int] = {}
        self.model: Model | None = None

    # -- output ------------------------------------------------------------------------------------------------

    @property
    def manifest(self) -> Path:
        """The record of what the last build wrote, kept beside the output folder rather than in it: it is state for the
        next build (what to prune), not a file of the site, and nothing that is served may carry it."""
        return self.out.parent / (self.out.name + MANIFEST)

    def prepare_out(self):
        if self.out.exists() and any(self.out.iterdir()) and not self.manifest.is_file():
            raise BuildError(f"{self.out} is not empty and was not made by this build; choose another --out")
        self.out.mkdir(parents=True, exist_ok=True)
        self.previous = set()
        mf = self.manifest
        if mf.is_file():
            self.previous = {ln for ln in mf.read_text(encoding="utf-8").split("\n") if ln}

    def write(self, rel: str, data):
        path = self.out / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        b = data.encode("utf-8") if isinstance(data, str) else data
        path.write_bytes(b)
        self.written[rel] = len(b)

    def copy(self, rel: str, src: Path):
        self.write(rel, Path(src).read_bytes())

    def publish(self, rel: str, data) -> str:
        """Write a style sheet or a script under its content-hashed name and remember it; the pages ask for the published name by the logical one."""
        b = data.encode("utf-8") if isinstance(data, str) else data
        pub = hashed(rel, b)
        self.write(pub, b)
        self.assets[rel] = pub
        return pub

    # -- build -------------------------------------------------------------------------------------------------

    def build(self) -> "Site":
        self.prepare_out()
        m = self.model = Model(self.results, self.content)
        facts = m.facts()
        maps = mapdata.build_all(m)
        manifests = sorted((self.results / "submissions").glob("*.json")) if (self.results / "submissions").is_dir() else []
        manifests = [p for p in manifests if p.name != "schema.json"]
        extras = {"maps": maps, "content_dir": self.content, "manifests": len(manifests), "assets": self.assets}
        ref = self.cfg.get("release_ref", "")
        if ref and not REF_RE.fullmatch(ref):
            raise BuildError(f"site.json: release_ref must be a tag or branch name (letters, digits, dots, hyphens), not {ref!r}")
        base_url = self.cfg.get("base_url", "")
        if base_url and not re.fullmatch(r"https?://[^\s\"<>]+/|/|/[^\s\"<>]+/", base_url):
            raise BuildError("site.json: base_url must be a path that starts and ends with / (for example \"/\" or \"/results/\") or an address that ends with /")
        for s in self.cfg.get("sibling_sites", []):
            if not (isinstance(s, dict) and s.get("name") and re.fullmatch(r"https?://[^\s\"<>]+", s.get("url", ""))):
                raise BuildError(f"site.json: each entry of sibling_sites needs a name and an http(s) url, not {s!r}")
        ctx = Ctx(self.cfg, m, facts, 0, extras=extras)

        # The order matters: tokens, the components, the branch map, and last the forced-colours rules, so that nothing above can override them. The rules that only a
        # program page needs (the chart, the branch map, the facts, the tables of its sections) are a style sheet of their own that only those pages ask for, with its
        # own forced-colours rules last (assets.split_css); --no-split keeps one style sheet, as the sources are written.
        read = lambda name: (HERE / "src/assets" / name).read_text(encoding="utf-8")
        google = self.cfg.get("fonts", "self") == "google"
        site_src = re.sub(r"/\*SELF-FONTS-START\*/.*?/\*SELF-FONTS-END\*/", "", read("site.css"), flags=re.S) if google else read("site.css")
        if self.split:
            site_s, forced_s, map_s = assets.split_css(site_src), assets.split_css(read("forced-colors.css")), assets.split_css(read("branchmap.css"), "program")
            css = "\n".join([tokens.css(), site_s["base"], forced_s["base"]])
            # a sheet of a kind of page: its rules, the branch map for the program pages, and last the forced-colours rules of that kind of page
            sheets = {k: "\n".join(x for x in (site_s[k], map_s[k], forced_s[k]) if x.strip()) for k in assets.SHEETS}
            sheets["popup"] = read("popup.css")      # the detail of a cell of a branch map: the program pages and the front page ask for it
        else:
            css = "\n".join([tokens.css(), site_src] + [read(name) for name in STYLESHEETS[1:]])
            sheets = {}
        extras["sheets"] = sorted(k for k, v in sheets.items() if v.strip())
        if not google:
            missing = [f for f in SELF_FONTS + FONT_LICENCES if not (HERE / "src/assets/fonts" / f).is_file()]
            if missing:
                raise BuildError("site.json asks for self-hosted fonts, and src/assets/fonts lacks " + ", ".join(missing)
                                 + " (Source Serif 4 and IBM Plex Sans, variable, Latin subset, and their licences); put them there or set \"fonts\": \"google\"")
            for f in SELF_FONTS + FONT_LICENCES:
                self.copy(f"assets/fonts/{f}", HERE / "src/assets/fonts" / f)      # the files of the two families and their licences, nothing else of the folder
        mini_css = (lambda t: assets.LICENSE_LINE + assets.minify_css(t)) if self.minify else (lambda t: t)
        # The page for an unknown address carries the style sheet itself (it cannot ask for a file before it knows where the site's root is) and, for the same reason,
        # without the font files of the self-hosted mode (the faces of Google Fonts, which are an absolute address, are asked for as on every page).
        no_faces = re.sub(r"/\*SELF-FONTS-START\*/.*?/\*SELF-FONTS-END\*/", "", css, flags=re.S)
        extras["css_404"] = mini_css(re.sub(r"/\*.*?\*/", "", no_faces, flags=re.S))      # (no comments in the page, whether the files are minified or not)
        self.publish("assets/site.css", mini_css(css.replace("@@FONTS@@", "fonts/")))
        for k in extras["sheets"]:
            self.publish(f"assets/{k}.css", mini_css(sheets[k]))
        for name in ("app.js", "charts.js", "program.js", "compare.js", "branchmap.js", "entries.js", "home.js"):
            text = read(name)
            self.publish(f"assets/{name}", assets.LICENSE_LINE + assets.minify_js(text) if self.minify else text.encode("utf-8"))
        # The logo files are the favicon set only (the plate and its PNG renderings); the large mark and the lockup are not shipped.
        for f in sorted((HERE / "src/logo").glob("*")):
            if f.name == "favicon.svg":
                self.write("assets/favicon.svg", tokens.favicon_svg() + "\n")      # written from the logo colours of tokens.py
            elif f.name.startswith(("favicon", "apple")):
                self.copy(f"assets/{f.name}", f)
        for pid, doc in maps.items():
            self.publish(f"assets/branchmap/{pid}.js", mapdata.map_script(doc))
            self.write(f"data/branchmap/{pid}.json", mapdata.compact(doc))      # the only files of data/: the map script of a program page fetches its own copy
        for pid in maps:
            self.publish(f"assets/hero/{pid}.js", herodata.hero_script(maps[pid]))      # the map of the front page of each program, fetched when the box beside the map names it
        folder = f"data/{strip.data_folder(m)}"
        for rel, text in strip.files(m, lambda pid: self.assets[f"assets/hero/{pid}.js"], lambda pid: self.assets[f"assets/branchmap/{pid}.js"]).items():
            self.write(f"{folder}/{rel}", text)      # what the strip and the table of Results ask for when a visitor adds an entry or names a program (never by themselves)
        self.publish("assets/index.js", self.index_js(ctx))
        self.publish("assets/compare-data.js", "window.CRCompare=" + json.dumps(pages.compare_data(ctx), separators=(",", ":")) + ";\n")
        self.write_pages(ctx)
        self.write_sitemap()
        if self.precompress:
            # A .gz beside every text file, for a host that serves pre-compressed files (nginx gzip_static, for example). mtime 0 keeps the build deterministic.
            for rel in sorted(k for k in self.written if Path(k).suffix in PRECOMPRESS):
                self.write(rel + ".gz", gzip.compress((self.out / rel).read_bytes(), compresslevel=9, mtime=0))
        self.write(".nojekyll", "")      # GitHub Pages serves the files as they are, without running Jekyll (a folder starting with _ would be dropped)
        self.manifest.write_text("\n".join(sorted(self.written)) + "\n", encoding="utf-8")
        stale = sorted(self.previous - set(self.written))
        if stale:
            if self.prune:
                for rel in stale:
                    p = self.out / rel
                    if p.is_file():
                        p.unlink()
            else:
                print(f"note: {len(stale)} files from an earlier build are no longer written (use --prune to remove them): {', '.join(stale[:5])}{' ...' if len(stale) > 5 else ''}")
        return self

    # -- for search engines ----------------------------------------------------------------------------------------

    def write_sitemap(self):
        base = str(self.cfg.get("site_url", "")).rstrip("/")
        if not base:      # without an address of its own there is nothing to list
            return
        names = sorted(n for n in self.written if n.endswith(".html") and n != "404.html")
        urls = [f"{base}/" if n == "index.html" else f"{base}/{n}" for n in names]
        body = "".join(f"<url><loc>{u}</loc></url>\n" for u in urls)
        self.write("sitemap.xml", f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{body}</urlset>\n')
        self.write("robots.txt", f"User-agent: *\nAllow: /\nSitemap: {base}/sitemap.xml\n")

    # -- pages -------------------------------------------------------------------------------------------------

    def write_pages(self, ctx: Ctx):
        home = ctx.at(0)
        self.write("index.html", pages.home_page(home))
        def root_page(name: str, build) -> None:
            home.path = name   # the page's file, for the canonical URL of the public build
            self.write(name, build(home))
        root_page("results.html", pages.results_page)
        for p in ctx.model.programs:
            pctx = ctx.at(1)
            pctx.path = f"programs/{p['id']}.html"
            self.write(pctx.path, pages.program_page(pctx, p["id"]))
        root_page("all-versions.html", lambda c: pages.results_page(c, versions="all"))
        root_page("tools.html", pages.tools_page)
        seen: dict[str, str] = {}
        for tool in (ctx.model.tools if ctx.model.tools_csv else []):
            name = pages.tool_file(tool["id"])
            if name in seen:
                raise BuildError(f"tools.csv: the tools {seen[name]!r} and {tool['id']!r} would both be written to {name}")
            seen[name] = tool["id"]
            root_page(name, lambda c, t=tool: pages.tool_page(c, t))
        root_page("releases.html", pages.releases_page)
        root_page("compare.html", pages.compare_page)
        root_page("method.html", pages.method_page)
        root_page("contribute.html", pages.contribute_page)
        root_page("404.html", pages.not_found_page)

    def index_js(self, ctx: Ctx) -> str:
        """The search index of the palette: the pages, the programs, the tools, the words of the Terms and the questions that a submitter asks, so that a search for
        "gcov", "cost" or "privacy" finds where it is answered. A term leads to the Terms of the first page that offers it (the disclosure opens when the address
        names it)."""
        m = ctx.model
        items = [
            ["Pages", "Home", "index.html", "home front page branch map strip programs tools coverage release", "", ""],
            ["Pages", "Results", "results.html", "results table programs tools coverage median release", "", ""],
            ["Pages", "Tools", "tools.html", "tools table families", "", ""],
            ["Pages", "Compare", "compare.html", "compare two tools a12", "", ""],
            ["Pages", "Method", "method.html", "method coverage runs tracks statistics limits specification", "", ""],
            ["Pages", "Contribute", "contribute.html", "contribute submit results propose program report problem disclosure", "", ""],
            ["Pages", "Releases", "releases.html", "releases release date counts added superseded withdrawn measured", "", ""],
            ["Pages", "Results, all versions", "all-versions.html", "all versions superseded older entries latest", "", ""],
            ["Pages", "Terms", "results.html#terms", "terms glossary definitions definition help words meaning", "definitions of the words a page uses", ""],
        ]
        for p in m.programs:
            items.append(["Programs", p["name"], f"programs/{p['id']}.html", f"{p['name']} {p['id']} {p['desc']}".lower(), f"{fmt(p['total'])} branches", "p"])
        for s in m.systems:
            items.append(["Tools", s["label"], f"tools.html#{s['id']}", f"{s['label']} {s['id']} {s['family']} {s['backend']} {s['model']} {s['study']} {s['version']} {s['status']}".lower(),
                          m.ST[s["study"]]["title"], "t"])
        for tool in (m.tools if m.tools_csv else []):
            items.append(["Tools", f"{tool['name']}, every version", pages.tool_file(tool["id"]), f"{tool['name']} {tool['id']} versions releases {tool['desc']}".lower(), "Versions", "t"])
        first_page = {"results": "results.html", "tools": "tools.html", "compare": "compare.html", "method": "method.html", "contribute": "contribute.html",
                      "program": f"programs/{m.programs[0]['id']}.html", "releases": "releases.html", "tool": pages.tool_file(m.tools[0]["id"]) if m.tools_csv and m.tools else "tools.html"}
        for t in m.terms:
            page = next(k for k in ("results", "tools", "compare", "method", "contribute", "program", "releases", "tool") if k in t["pages"])
            items.append(["Terms", t["term"], f"{first_page[page]}#terms", f"{t['term']} {t['text']}".lower(), "Terms", "d"])
        for name, anchor, words in (("Cost and fee of a submission", "contribute.html#submit", "cost fee price charge free"),
                                    ("Privacy and what is public", "contribute.html#disclosure", "privacy public issue names consent personal data"),
                                    ("Contact and how to notify the maintainers", "contribute.html#report", "contact email notify route maintainers")):
            items.append(["Contribute", name, anchor, words, "", ""])
        return "window.CRIndex=" + json.dumps({"items": items}, separators=(",", ":"), ensure_ascii=False) + ";\n"


def load_config(path: Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))
