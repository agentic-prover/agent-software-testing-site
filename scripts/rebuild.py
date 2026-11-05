#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 The Agent Software Testing authors
"""Rebuild the published site from the latest results release.

    python scripts/rebuild.py RESULTS_DIR

Points the links to results files at the release's tag, builds, runs scripts/check_site.py and only then replaces docs/
(its CNAME stays). .github/workflows/rebuild.yml runs this and commits what changed.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
KEEP = {"CNAME"}


def set_release_ref(config: Path, version: str) -> None:
    text = config.read_text(encoding="utf-8")
    new, count = re.subn(r'("release_ref":\s*)"[^"]*"', rf'\1"v{version}"', text)
    if count != 1:
        raise SystemExit(f"{config}: expected one release_ref")
    config.write_text(new, encoding="utf-8")


def replace_docs(build: Path, docs: Path) -> None:
    """Make docs/ hold the build and whatever KEEP names."""
    for path in docs.iterdir():
        if path.name in KEEP:
            continue
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()
    for path in build.iterdir():
        if path.name in KEEP:
            continue
        target = docs / path.name
        if path.is_dir():
            shutil.copytree(path, target)
        else:
            shutil.copy2(path, target)


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print(__doc__)
        return 2
    results = Path(argv[0]).resolve()
    version = json.loads((results / "RELEASE.json").read_text(encoding="utf-8"))["version"]
    set_release_ref(HERE / "site.json", version)
    with tempfile.TemporaryDirectory() as folder:
        build = Path(folder) / "build"
        subprocess.run([sys.executable, str(HERE / "build.py"), str(results), "--config", str(HERE / "site.json"), "--out", str(build)], cwd=HERE, check=True)
        subprocess.run([sys.executable, str(HERE / "scripts" / "check_site.py"), str(build)], cwd=HERE, check=True)
        replace_docs(build, HERE / "docs")
    print(f"docs/ now holds release {version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
