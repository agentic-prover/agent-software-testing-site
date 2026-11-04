# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 The Agent Software Testing authors
"""Where a style sheet or a script of a built site is. The build publishes them under content-hashed names (assets/site.css is written as
assets/site.<ten hex digits>.css), so the checks find a file by the name that a page asks for."""
from __future__ import annotations

import re
from pathlib import Path

PAGES = ("404.html", "programs/krep.html", "compare.html", "method.html", "results.html", "index.html")


def asset(dist: Path, name: str) -> Path:
    """The published file for `name` (site.css, app.js, branchmap/krep.js, ...): the one that a page of the build refers to."""
    stem, ext = name.rsplit(".", 1)
    rx = re.compile(r"assets/" + re.escape(stem) + r"\.[0-9a-f]{10}\." + re.escape(ext) + r"\b")
    # the map script of a program is named by the page of that program only
    pages = (f"programs/{stem.split('/', 1)[1]}.html",) + PAGES if stem.startswith("branchmap/") else PAGES
    for page in pages:
        f = Path(dist) / page
        if f.is_file():
            m = rx.search(f.read_text(encoding="utf-8"))
            if m:
                return Path(dist) / m.group(0)
    raise FileNotFoundError(f"{dist}: no page refers to assets/{stem}.<hash>.{ext}")
