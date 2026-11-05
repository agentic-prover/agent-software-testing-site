#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 The Agent Software Testing authors
"""Build the website for GitHub Pages from a checkout of the results.

    python scripts/pages_build.py RESULTS OUT [--preview CANDIDATE]

OUT gets the public site from RESULTS and, with --preview, a copy built from CANDIDATE under OUT/preview/, hidden from
search engines. Links to results files name the exact commit of RESULTS. Each build must pass scripts/check_site.py, and
OUT is written only after both have. The results repository's workflows run this.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent


def config_for(base: dict, commit: str, preview: bool) -> dict:
    """The settings of one build: those of site.json, with links that name the commit. A preview is one folder down and asks
    search engines to stay away."""
    cfg = dict(base, release_ref=commit)
    if preview:
        cfg.update(base_url=base["base_url"] + "preview/", site_url=base["site_url"] + "preview/", noindex=True)
    return cfg


def build_and_check(results: Path, cfg: dict, folder: Path, name: str) -> Path:
    config = folder / f"{name}.json"
    config.write_text(json.dumps(cfg), encoding="utf-8")
    out = folder / name
    subprocess.run([sys.executable, str(HERE / "build.py"), str(results), "--config", str(config), "--out", str(out)], cwd=HERE, check=True)
    subprocess.run([sys.executable, str(HERE / "scripts" / "check_site.py"), str(out)], cwd=HERE, check=True)
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("results", type=Path)
    parser.add_argument("out", type=Path)
    parser.add_argument("--preview", type=Path)
    args = parser.parse_args(argv)
    if args.out.exists():
        raise SystemExit(f"{args.out} already exists")
    results = args.results.resolve()
    commit = subprocess.run(["git", "-C", str(results), "rev-parse", "HEAD"], check=True, text=True, capture_output=True).stdout.strip()
    base = json.loads((HERE / "site.json").read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory() as temp:
        folder = Path(temp)
        public = build_and_check(results, config_for(base, commit, False), folder, "public")
        preview = None
        if args.preview:
            preview = build_and_check(args.preview.resolve(), config_for(base, commit, True), folder, "preview")
        args.out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(public, args.out)
        if preview:
            shutil.copytree(preview, args.out / "preview")
    print(f"{args.out} is ready" + (" with a preview" if preview else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
