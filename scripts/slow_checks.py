#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 The Agent Software Testing authors
"""The slow browser sweeps, one command, side by side. The everyday tests do not run them.

    python scripts/slow_checks.py RESULTS_DIR [--work DIR] [--only layout,regroup,home,strip,parity,interact]

RESULTS_DIR is the results repository. The sweeps are scripts/layout.mjs (phones, large text, forced colours, no script, touch targets), regroup.mjs (the
arranged branch map), home.mjs (the front page figures), strip.mjs (the strip, with a wide synthetic release), css_parity.mjs (the shipped style sheets against one
sheet as written) and interact.mjs. Each runs in its own process with a time limit and prints PASS or FAIL lines; the command prints a table of results and
times and exits 1 if any sweep failed or timed out. Builds go to a new folder under --work (default: a new folder in the system temp folder); nothing is deleted.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE / "tests"))
NODE = shutil.which("node")


def run(name, cmd, limit, env=None):
    t0 = time.time()
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=limit, env=env)
        out, ok = r.stdout + r.stderr, r.returncode == 0 and "FAIL" not in r.stdout
        status = "ok" if ok else "FAILED"
    except subprocess.TimeoutExpired as e:
        out, status = ((e.stdout or b"").decode() if isinstance(e.stdout, bytes) else (e.stdout or "")), f"TIMED OUT after {limit}s"
    secs = time.time() - t0
    fails = [l for l in out.splitlines() if l.startswith("FAIL")]
    lines = [f"{name:10s} {status:10s} {secs:6.0f}s  {sum(1 for l in out.splitlines() if l.startswith('PASS'))} passed, {len(fails)} failed"]
    lines += ["    " + l for l in fails[:10]]
    if status != "ok" and not fails:
        lines.append("    " + out[-600:].replace("\n", "\n    "))
    print("\n".join(lines), flush=True)
    return status == "ok"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("results")
    ap.add_argument("--work")
    ap.add_argument("--only", default="layout,regroup,home,strip,parity,interact")
    ap.add_argument("--limit", type=int, default=1500, help="seconds allowed to each sweep")
    a = ap.parse_args(argv)
    if not NODE or not Path(os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")).is_file():
        sys.exit("the slow sweeps need node and Google Chrome (set CHROME to the browser binary); nothing was run")
    work = Path(a.work) if a.work else Path(tempfile.mkdtemp(prefix="slow-checks-"))
    if work.exists() and any(work.iterdir()):
        sys.exit(f"{work} is not empty; give a new folder")
    work.mkdir(parents=True, exist_ok=True)
    chosen = set(a.only.split(","))
    py = sys.executable
    ship = work / "ship"
    # layout.mjs also checks the page for an unknown address of a site hosted in a sub-folder, which needs a build without base_url
    sub_cfg = work / "site-in-sub-folder.json"
    sub_cfg.write_text(json.dumps({**json.loads((HERE / "site.json").read_text(encoding="utf-8")), "base_url": ""}), encoding="utf-8")
    subprocess.run([py, str(HERE / "build.py"), a.results, "--config", str(sub_cfg), "--out", str(ship)], check=True, capture_output=True)
    env = {**os.environ, "PYTHON": py, "AGENT_SOFTWARE_TESTING_RESULTS": str(Path(a.results).resolve())}
    sweeps = []
    if "layout" in chosen:
        sweeps.append(("layout", [NODE, str(HERE / "scripts/layout.mjs"), "--dist", str(ship), "--port", "9475", "--sweep"], env))
    if "regroup" in chosen:
        sweeps.append(("regroup", [NODE, str(HERE / "scripts/regroup.mjs"), "--dist", str(ship), "--port", "9482"], None))
    if "home" in chosen:
        sweeps.append(("home", [NODE, str(HERE / "scripts/home.mjs"), "--dist", str(ship), "--port", "9455"], None))
    if "interact" in chosen:
        sweeps.append(("interact", [NODE, str(HERE / "scripts/interact.mjs"), "--dist", str(ship), "--port", "9446"], None))
    if "parity" in chosen:
        ref = work / "one-sheet"
        subprocess.run([py, str(HERE / "build.py"), a.results, "--config", str(sub_cfg), "--out", str(ref), "--no-minify", "--no-split"], check=True, capture_output=True)
        sweeps.append(("parity", [NODE, str(HERE / "scripts/css_parity.mjs"), str(ref), "--dist", str(ship), "--port", "9491", "--quick"], None))
    if "strip" in chosen:
        from conftest import build_site, make_wide_content, make_wide_release
        wide = work / "wide"
        build_site(make_wide_release(work / "wide-release"), wide, content=make_wide_content(work / "wide-content"), minify=True)
        sweeps.append(("strip", [NODE, str(HERE / "scripts/strip.mjs"), "--dist", str(ship), "--wide", str(wide), "--port", "9456"], None))
    # each sweep has its own browser, port and profile, so they do not disturb one another
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(sweeps) or 1) as pool:
        results = list(pool.map(lambda sw: run(sw[0], sw[1], a.limit, sw[2]), sweeps))
    print("all sweeps passed" if all(results) else "SOME SWEEPS FAILED")
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
