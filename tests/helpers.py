"""Small readers shared by the tests: the built pages and the results release, read without the site's own code."""
from __future__ import annotations

import csv
import gzip
import json
import re
from html.parser import HTMLParser
from pathlib import Path


def read(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def csv_rows(p: Path) -> list[dict]:
    with open(p, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def squash(text: str) -> str:
    """Letters and digits only, lower case: 'Agolic KLEE, GPT-5.5' and 'Agolic KLEE' + 'GPT-5.5' become the same string."""
    return re.sub(r"[^a-z0-9]", "", text.lower())


def strip_tags(html: str) -> str:
    """The text of a page as a reader sees it (scripts and styles dropped, entities decoded)."""
    import html as _h
    html = re.sub(r"<(script|style)\b.*?</\1>", "", html, flags=re.S)
    return _h.unescape(re.sub(r"<[^>]+>", " ", html))


class Refs(HTMLParser):
    """Every reference a page makes (links, scripts, styles, images), every id, and the facts a reader and a screen reader rely on."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.refs: list[tuple[str, str]] = []      # (tag, url)
        self.ids: list[str] = []
        self.h1 = 0
        self.title = ""
        self._in_title = False
        self.lang = ""
        self.meta: dict[str, str] = {}
        self.imgs_without_alt = 0
        self.controls: list[tuple[str, dict, str]] = []     # buttons and selects: (tag, attrs, text so far)
        self.labels_for: set[str] = set()
        self._open_button: list | None = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            self.ids.append(a["id"])
        if tag == "html":
            self.lang = a.get("lang", "")
        elif tag == "title":
            self._in_title = True
        elif tag == "h1":
            self.h1 += 1
        elif tag == "meta" and a.get("name"):
            self.meta[a["name"]] = a.get("content", "")
        elif tag == "label" and a.get("for"):
            self.labels_for.add(a["for"])
        if tag == "a" and a.get("href") is not None:
            self.refs.append(("a", a["href"]))
        elif tag == "link" and a.get("href"):
            self.refs.append(("link:" + a.get("rel", ""), a["href"]))
        elif tag in ("script", "img", "source") and a.get("src"):
            self.refs.append((tag, a["src"]))
        if tag == "img" and "alt" not in a:
            self.imgs_without_alt += 1
        if tag in ("button", "select") and "hidden" not in a:
            self._open_button = [tag, a, ""]
            self.controls.append(self._open_button)      # type: ignore[arg-type]

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        if tag in ("button", "select"):
            self._open_button = None

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._open_button is not None:
            self._open_button[2] += data


def parse(path: Path) -> Refs:
    r = Refs()
    r.feed(read(path))
    return r


def branch_sets(results: Path, system: str, program: str) -> list[set[str]]:
    """The branch keys each replayed run of a system covered on a program, from the release's own files."""
    out = []
    for row in csv_rows(results / "runs.csv"):
        if row["system_id"] == system and row["program"] == program:
            with gzip.open(results / row["set_path"], "rt", encoding="utf-8") as fh:
                out.append(set(json.load(fh)["covered_branch_keys"]))
    return out
