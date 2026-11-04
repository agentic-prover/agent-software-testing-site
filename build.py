#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 The Agent Software Testing authors
"""Build the Agent Software Testing site from a results release (standard library only, Python 3.12 or later).

    python build.py [RESULTS_DIR] [--out DIR] [--config site.json] [--prune] [--precompress] [--no-minify] [--no-split]

RESULTS_DIR is the `agent-software-testing-results` repository; it defaults to the folder named in AGENT_SOFTWARE_TESTING_RESULTS, or to ../agent-software-testing-results.
The build writes static files with relative links to `dist/` (or --out) and reads nothing but the results release and the files of this repository.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# The modules of sitebuild use syntax of Python 3.12 (a backslash inside an f-string expression); an older interpreter would stop with a SyntaxError that does not say so.
if sys.version_info < (3, 12):
    sys.exit(f"build.py needs Python 3.12 or later; this is Python {sys.version.split()[0]}. Run it with python3.12 or later.")

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from sitebuild.data import BuildError  # noqa: E402
from sitebuild.site import Site, load_config  # noqa: E402


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("results", nargs="?", default=os.environ.get("AGENT_SOFTWARE_TESTING_RESULTS") or str(HERE.parent / "agent-software-testing-results"),
                    help="the results repository (default: AGENT_SOFTWARE_TESTING_RESULTS, or ../agent-software-testing-results)")
    ap.add_argument("--out", help="output directory (default dist)")
    ap.add_argument("--config", default=str(HERE / "site.json"))
    ap.add_argument("--prune", action="store_true", help="remove files that an earlier build wrote and this one does not")
    ap.add_argument("--precompress", action="store_true", help="also write a gzip copy (.gz) of every page, script, style sheet, JSON and SVG file, for a host that serves pre-compressed files")
    ap.add_argument("--no-minify", action="store_true", help="publish the style sheets and scripts as they are written in src/ (default: comments and white space removed)")
    ap.add_argument("--no-split", action="store_true", help="publish one style sheet (default: the rules that only a program page needs are a second one, which only those pages ask for)")
    args = ap.parse_args(argv)
    out = Path(args.out) if args.out else HERE / "dist"
    try:
        site = Site(Path(args.results), out, load_config(Path(args.config)), prune=args.prune, precompress=args.precompress,
                    minify=not args.no_minify, split=not args.no_split).build()
    except BuildError as e:
        print(f"build stopped: {e}", file=sys.stderr)
        return 1
    for w in site.model.warnings:
        print(f"warning: {w}", file=sys.stderr)
    pages = sum(1 for k in site.written if k.endswith(".html"))
    total = sum(site.written.values())
    print(f"wrote {len(site.written)} files ({pages} pages, {total / 1048576:.1f} MiB) to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
