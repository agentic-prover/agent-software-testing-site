#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 The Agent Software Testing authors
"""Break the site on purpose and see whether the tests notice.

    python scripts/break_it.py RESULTS_DIR [--work NEW_FOLDER] [--jobs 3] [--only id,id]

Each bug below is a mistake somebody could really make while editing the builder, the scripts, the style sheets or the settings. It is applied alone to a
throwaway copy of this repository (under NEW_FOLDER, which must not exist yet and is left in place), the whole test suite including the browser checks runs on the
copy against RESULTS_DIR, and the table says CAUGHT (with the tests that failed) or MISSED. Nothing in this repository is touched.
Needs node and Google Chrome (set CHROME to the browser binary); about ten minutes.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

RELEASE_REF = re.search(r'"release_ref": "[^"]*"', (Path(__file__).resolve().parent.parent / "site.json").read_text(encoding="utf-8")).group(0)

HERE = Path(__file__).resolve().parent.parent

# (id, what a reader or maintainer cares about, the mistake, file, text to find, text to put in its place)
BUGS = [
    ("results-wrong-column", "numbers", "Results shows the lowest run where it should show the median", "sitebuild/pages.py",
     'data-pct="{f["pct"]:.2f}" data-med="{f["med"]}" data-lo', 'data-pct="{f["pct"]:.2f}" data-med="{f["min"]}" data-lo'),
    ("results-wrong-percentage", "numbers", "Results divides by the wrong total", "sitebuild/data.py", "pct = med / total * 100", "pct = med / (total + 1) * 100"),
    ("program-final-wrong", "numbers", "a program page shows the highest run as its final", "sitebuild/pages.py", 'data-med="{f["med"]}" data-pct="{f["pct"]:.2f}" data-n=', 'data-med="{f["max"]}" data-pct="{f["pct"]:.2f}" data-n='),
    ("compare-columns-swapped", "numbers", "Compare puts the B-only and A-only counts in each other's column", "sitebuild/pages.py",
     '<td class="num r">{fmt(o["a"])}</td><td class="num r">{fmt(o["both"])}</td>\'\n              f\'<td class="num r">{fmt(o["b"])}</td>',
     '<td class="num r">{fmt(o["b"])}</td><td class="num r">{fmt(o["both"])}</td>\'\n              f\'<td class="num r">{fmt(o["a"])}</td>'),
    ("overlap-pair-turned", "numbers", "an overlap row stored the other way round is not turned back", "sitebuild/data.py", 'return {"a": b, "b": a, "both": both}', 'return {"a": a, "b": b, "both": both}'),
    ("strip-median-for-lowest", "numbers", "the front page strip files hold the lowest run as the median", "sitebuild/strip.py", 'return f["med"], f["min"], f["max"], f["n"], f["total"]', 'return f["min"], f["min"], f["max"], f["n"], f["total"]'),
    ("map-first-run-only", "numbers", "a branch map counts only the first run of each tool", "sitebuild/mapdata.py", "for rp in runs:\n            union.update", "for rp in runs[:1]:\n            union.update"),
    ("sanitiser-single-findings-hidden", "numbers", "a program page leaves out kinds found only once", "sitebuild/pages.py", 'x["san"] == san and x["n"] > 0', 'x["san"] == san and x["n"] > 1'),
    ("tools-last-entry-missing", "numbers", "Tools skips the last entry of the release", "sitebuild/pages.py", "    dash = '<span class=\"muted\">–</span>'\n    for s in m.systems:", "    dash = '<span class=\"muted\">–</span>'\n    for s in m.systems[:-1]:"),
    ("release-date-wrong-field", "numbers", "the page states the release name where the date belongs", "sitebuild/html.py", 'day = ctx.facts.get("date_long", "")', 'day = ctx.facts.get("release", "")'),
    ("superseded-in-latest", "numbers", "Results keeps superseded entries in its default view", "sitebuild/data.py", 's["status"] == "current" and s["in_release"]]', 's["in_release"]]', "all"),
    ("median-of-even-runs", "statistics", "the median of an even number of runs takes the lower middle one", "sitebuild/data.py", "m = (s[n // 2 - 1] + s[n // 2]) / 2", "m = s[n // 2 - 1]"),
    ("a12-ties-python", "statistics", "ties count as wins in A12 (build)", "sitebuild/data.py", "u += 1.0 if x > y else (0.5 if x == y else 0.0)", "u += 1.0 if x >= y else 0.0"),
    ("a12-inverted-script", "statistics", "A12 in the page script compares the wrong way round", "src/assets/compare.js", "u += a[i] > b[j] ? 1 : a[i] === b[j] ? 0.5 : 0;", "u += a[i] < b[j] ? 1 : a[i] === b[j] ? 0.5 : 0;"),
    ("cross-track-statistics", "statistics", "pairs on different tracks get statistics", "sitebuild/pages.py", 'xt = A["track"] != B["track"]', "xt = False"),
    ("build-accepts-wrong-finals", "build", "the build no longer checks finals.csv against the runs", "sitebuild/data.py", 'if n != len(rs) or med != median(cov) or mn != min(cov) or mx != max(cov):', "if False:"),
    ("build-writes-into-any-folder", "build", "the build no longer refuses a folder that is not its own", "sitebuild/site.py", "if self.out.exists() and any(self.out.iterdir()) and not self.manifest.is_file():", "if False:"),
    ("html-not-escaped", "build", "text from the data is written into pages as it is", "sitebuild/html.py", 'return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")', 'return t.replace("&", "&amp;")'),
    ("javascript-links-allowed", "build", "any address from the data becomes a link", "sitebuild/html.py", 'return t if re.match(r"https?://", t, re.IGNORECASE) else ""', "return t"),
    ("build-not-repeatable", "build", "the build stamps the time into every page", "sitebuild/html.py", '<title>{esc(title)}</title>', '<title>{esc(title)}</title><!--{__import__("time").time()}-->', "all"),
    ("script-names-unhashed", "build", "scripts and styles lose the hash in their names", "sitebuild/site.py", 'return f"{stem}.{hashlib.sha256(data).hexdigest()[:10]}.{ext}"', "return rel"),
    ("program-link-typo", "links", "Compare links programs to .htm pages", "sitebuild/pages.py", 'href="programs/{esc(p["id"])}.html">{esc(p["name"])}</a></th><td class="num r">{fmt(o["a"])}', 'href="programs/{esc(p["id"])}.htm">{esc(p["name"])}</a></th><td class="num r">{fmt(o["a"])}'),
    ("font-file-renamed", "links", "a font file is not where the style sheet says", "src/assets/site.css", "url(@@FONTS@@funnel-display-latin.woff2)", "url(@@FONTS@@funnel-display.woff2)"),
    ("root-relative-nav", "links", "the bar links by a path from the root", "sitebuild/html.py", "'<a href=\"%s\"%s>%s</a>' % (ctx.page(h),", "'<a href=\"/%s\"%s>%s</a>' % (ctx.page(h),"),
    ("fonts-from-google", "private", "the configuration asks for web fonts from Google", "site.json", '"fonts": "self"', '"fonts": "google"'),
    ("release-tag-missing", "links", "links to data files stop naming the release", "site.json", RELEASE_REF, '"release_ref": ""'),
    ("search-hidden", "findable", "the public site asks search engines to stay away", "site.json", '"noindex": false', '"noindex": true'),
    ("base-address-lost", "links", "the configuration loses its base address", "site.json", '"base_url": "/"', '"base_url": ""'),
    ("theme-not-applied", "theme", "the switch no longer turns the site dark", "src/assets/app.js", 'if (dark) root.setAttribute("data-theme", "dark"); else root.removeAttribute("data-theme");', 'root.removeAttribute("data-theme");'),
    ("theme-not-kept", "theme", "the theme choice is not saved", "src/assets/app.js", 'try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch (e) {}', ""),
    ("dark-text-unreadable", "theme", "a dark-theme grey becomes too dark to read", "sitebuild/tokens.py", '"--ink-3": "#93a0b6"', '"--ink-3": "#3a4760"'),
    ("light-text-pale", "theme", "a restyle makes light-theme secondary text too pale", "sitebuild/tokens.py", '"--ink-3": "#566377"', '"--ink-3": "#a3adbb"'),
    ("sort-as-text", "interaction", "number columns sort as text", "src/assets/app.js", 'var c = typeof x === "string" ? x.localeCompare(y) : x - y;', "var c = String(x).localeCompare(String(y));"),
    ("compare-picker-b-dead", "interaction", "choosing the second tool in Compare does nothing", "src/assets/compare.js", 'selB.addEventListener("change", function () { show(selA.value, selB.value, false); });', ""),
    ("compare-swap-no-swap", "interaction", "Swap leaves A and B as they are", "src/assets/compare.js", "show(b, a, false); selA.focus();", "show(a, b, false); selA.focus();"),
    ("finder-shortcut", "interaction", "the finder opens on Alt+K instead of Ctrl+K", "src/assets/app.js", "(e.metaKey || e.ctrlKey) && (e.key === \"k\"", "(e.altKey) && (e.key === \"k\""),
    ("finder-match-offset", "interaction", "the finder misses names that start with what was typed", "src/assets/app.js", "return it[3].indexOf(t) >= 0; });", "return it[3].indexOf(t) >= 1; });"),
    ("branch-map-not-drawn", "interaction", "the branch map is painted with the wrong canvas call", "src/assets/branchmap.js", "ctx.fillRect(", "ctx.clearRect(", "all"),
    ("front-map-never-ends", "interaction", "the front page map animation repeats for ever", "src/assets/site.css", "var(--d, 0ms) backwards;", "var(--d, 0ms) infinite alternate;"),
    ("dead-sort-buttons-without-script", "no script", "sort buttons show when no script runs", "src/assets/site.css", ".no-js .tbl th button.sort { display: none; }", ""),
    ("table-frame-overflow", "phone", "tables no longer scroll inside their frame", "src/assets/site.css", "max-width: 100%; overflow: auto; scroll-padding-left", "max-width: 100%; overflow: visible; scroll-padding-left"),
    ("all-titles-equal", "reader", "every page gets the same title", "sitebuild/html.py", "<title>{esc(title)}</title>", "<title>{esc(site_name(ctx))}</title>", "all"),
    ("skip-target-renamed", "reader", "the main area is renamed so the skip link leads nowhere", "sitebuild/html.py", "<main id=\"main\" class=\"shell no-js\"", "<main id=\"content\" class=\"shell no-js\""),
]


def apply(text: str, bug) -> str:
    old, new = bug[4], bug[5]
    mode = bug[6] if len(bug) > 6 else "one"
    assert old in text, f"{bug[0]}: not found in {bug[3]}: {old[:60]!r}"
    return text.replace(old, new) if mode == "all" else text.replace(old, new, 1)


def pytest_cmd(extra=()):
    return [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "-m", "browser or not browser", "-rfx", "--tb=no", *extra]


def run_one(bug, results: Path, work: Path, slot: int):
    d = work / bug[0]
    shutil.copytree(HERE, d, ignore=shutil.ignore_patterns("dist", ".chrome-profile", "__pycache__", ".pytest_cache", ".git"))
    (d / "_tmp").mkdir()
    f = d / bug[3]
    f.write_text(apply(f.read_text(encoding="utf-8"), bug), encoding="utf-8")
    env = {**os.environ, "AGENT_SOFTWARE_TESTING_RESULTS": str(results), "PORT_OFFSET": str(slot * 5), "TMPDIR": str(d / "_tmp")}
    r = subprocess.run(pytest_cmd(), cwd=d, capture_output=True, text=True, timeout=900, env=env)
    out = r.stdout + r.stderr
    failed = sorted(set(re.findall(r"^FAILED \S+?::(\S+)", out, re.M)))
    if r.returncode not in (0, 1):
        failed.append(f"(pytest stopped with status {r.returncode})")
    return bug, r.returncode != 0, failed


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("results")
    ap.add_argument("--work")
    ap.add_argument("--jobs", type=int, default=3)
    ap.add_argument("--only", default="")
    a = ap.parse_args(argv)
    if not shutil.which("node") or not Path(os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")).is_file():
        sys.exit("break_it needs node and Google Chrome (set CHROME to the browser binary)")
    results = Path(a.results).resolve()
    work = Path(a.work).resolve() if a.work else Path(tempfile.mkdtemp(prefix="break-it-"))
    if work.exists() and any(work.iterdir()):
        sys.exit(f"{work} is not empty; give a new folder")
    work.mkdir(parents=True, exist_ok=True)
    bugs = [b for b in BUGS if not a.only or b[0] in a.only.split(",")]
    for b in bugs:      # every bug must apply to the code as it is, or the table would be wrong
        apply((HERE / b[3]).read_text(encoding="utf-8"), b)
    base = subprocess.run(pytest_cmd(), cwd=HERE, capture_output=True, text=True, timeout=900, env={**os.environ, "AGENT_SOFTWARE_TESTING_RESULTS": str(results), "TMPDIR": tempfile.gettempdir()})
    if base.returncode != 0:
        sys.exit("the tests fail on the unbroken site, so the table would mean nothing:\n" + base.stdout[-2000:])
    with cf.ThreadPoolExecutor(a.jobs) as ex:
        rows = [f.result() for f in [ex.submit(run_one, b, results, work, i % a.jobs) for i, b in enumerate(bugs)]]
    seen: dict[str, int] = {}
    print(f"{'bug':34s} {'about':12s} result  tests that failed")
    for bug, caught, failed in rows:
        print(f"{bug[0]:34s} {bug[1]:12s} {'CAUGHT' if caught else 'MISSED':7s} {', '.join(failed)}")
        for t in failed:
            seen[t.split('[')[0]] = seen.get(t.split('[')[0], 0) + 1
    n = sum(1 for r in rows if r[1])
    print(f"\n{n} of {len(rows)} bugs caught, {len(rows) - n} missed.  Copies are in {work}")
    collected = subprocess.run(pytest_cmd(["--collect-only", "-q"]), cwd=HERE, capture_output=True, text=True, env={**os.environ, "AGENT_SOFTWARE_TESTING_RESULTS": str(results)}).stdout
    every = {m.group(1).split("[")[0] for m in re.finditer(r"::(\S+)", collected)}
    print("tests that caught no bug:", ", ".join(sorted(every - set(seen))) or "none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
