# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 The Agent Software Testing authors
"""The branch map of the front page: every branch of one program as a cell, in source order, file by file.

The map is drawn here, once, as SVG: a cell is a stretch of a stroke (a run of cells of one class in one row is one segment of a path, and a dash pattern cuts the
segment into cells), so the picture of a program of 50,000 branches is a few thousand segments. The page carries the map of its first program as markup and the other
programs as scripts (assets/hero/<program>.js) that home.js fetches when the box beside the map names one (programs.json holds the file of each); both are the strings that this module writes, so the page without a
script, the page with one and the program picked later show the same drawing.

Two layouts are written for each program, one for a wide figure (a drawing 1152 units wide, shown at about its size from 1000 px) and one for a phone (358 units). A layout
takes the largest cell pitch at which the map is not taller than the height asked for. Each file is one group that a style rule reveals from its top to its bottom, one
file after the other, in `REVEAL_MS` milliseconds for the whole map; a file takes as long as its share of the program's branches (the delays are written into the markup).
The rules that play it are in site.css (the group `.hm`), apply only when a script ran and the visitor has not asked for less motion, and the end state of the animation is
the plain drawing.
"""
from __future__ import annotations

import json
import math

from . import mapdata
from .data import fmt, p1

REVEAL_MS = 1200
LAYOUTS = {"wide": (1152, 440, 124), "narrow": (358, 560, 0)}      # drawing width in units, the height at which the layout stops making the cells smaller, and the width of the column of file names (none: the name stands above its file)
PITCHES = (16, 14, 12, 10, 8, 7, 6, 5, 4, 3, 2)
LABEL_H = 18               # the room above a file that carries its name
NAME_ALL = 14             # a program of up to this many files has every file named
LABEL_MIN = 0.03           # a file is named when it holds at least this share of the branches ...
LABEL_MAX = 6              # ... and at most this many files are named (the largest)


def esc(s) -> str:
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def n(v: float) -> str:
    """A coordinate: whole where it is whole."""
    return f"{v:g}"


def branch_classes(doc: dict) -> list[int]:
    """For each branch, 0 when no tool reaches it, otherwise 1 + the index of its class of the legend (mapdata.count_classes)."""
    S = len(doc["systems"])
    cl = mapdata.count_classes(S)
    of = {}
    for k, (lo, hi) in enumerate(cl):
        for c in range(lo, hi + 1):
            of[c] = k + 1
    return [of.get(bin(m).count("1"), 0) for m in doc["mask"]]


def named_files(doc: dict) -> set[int]:
    """The indices of the files that carry their name: all of them when the program has up to NAME_ALL files, otherwise the largest ones of at least LABEL_MIN of the
    branches (never a system header), so that no block of a map stands without a name beside its neighbours."""
    files, total = doc["files"], doc["total"]
    if len(files) <= NAME_ALL:
        return set(range(len(files)))
    big = [(f["count"], -i) for i, f in enumerate(files) if f["count"] / total >= LABEL_MIN and not f["name"].startswith("/usr/")]
    return {-i for _c, i in sorted(big, reverse=True)[:LABEL_MAX]}


def choose_pitch(doc: dict, W: int, hmax: int, named: set[int], gutter: int) -> tuple[int, int, int]:
    """(pitch, cell, columns): the largest pitch whose map is at most hmax units tall; the smallest pitch where none is."""
    for p in PITCHES:
        gap = 2 if p >= 9 else (1 if p >= 5 else 0)
        cols = max(1, (W - gutter + gap) // p)
        sep = 10 if p >= 8 else (6 if p >= 5 else 3)
        h = sum(math.ceil(f["count"] / cols) * p - gap + (0 if gutter or i not in named else LABEL_H) for i, f in enumerate(doc["files"])) + sep * (len(doc["files"]) - 1)
        if h <= hmax:
            break
    return p, p - gap, cols


def short(name: str, room: int) -> str:
    """A file name that fits `room` units of 12 px type (about 6.6 units a letter), shortened in the middle of its stem with an ellipsis."""
    most = max(4, int(room / 6.6))
    if len(name) <= most:
        return name
    stem, dot, ext = name.rpartition(".")
    keep = most - len(dot + ext) - 1
    return (stem[:max(1, keep)] + "…" + dot + ext) if dot and keep >= 2 else name[:most - 1] + "…"


def draw(doc: dict, classes: list[int], W: int, hmax: int, gutter: int = 0) -> dict:
    """One layout of the map: {"w", "h", "svg"} where svg is the content of the <svg> element (its viewBox is 0 0 w h). With a gutter, the names of the files stand in a
    column to the left of the cells, level with the first row of each file (a name that would run into the one above is left out); without one, a name stands above its file."""
    total, files = doc["total"], doc["files"]
    S = len(doc["systems"])
    ncls = len(mapdata.count_classes(S))
    named = named_files(doc)
    p, s, cols = choose_pitch(doc, W, hmax, named, gutter)
    gap = p - s
    sep = 10 if p >= 8 else (6 if p >= 5 else 3)
    y, last_name = 0, -99
    out, tops = [], []
    for i, f in enumerate(files):
        label = LABEL_H if (i in named and not gutter) else 0
        tops.append(f"{f['start']},{n(y + label)}")
        rows = math.ceil(f["count"] / cols)
        d0 = round(REVEAL_MS * f["start"] / total)
        dur = max(1, round(REVEAL_MS * f["count"] / total))
        segs: dict[int, list[str]] = {}
        for r in range(rows):
            lo, hi = r * cols, min((r + 1) * cols, f["count"])
            yy = y + label + r * p + s / 2
            c0, start = classes[f["start"] + lo], lo
            for c in range(lo + 1, hi + 1):
                if c == hi or classes[f["start"] + c] != c0:
                    segs.setdefault(c0, []).append(f"M{n(gutter + (start - lo) * p)} {n(yy)}h{n((c - start) * p - gap)}")
                    if c < hi:
                        c0, start = classes[f["start"] + c], c
        base = f["name"].rsplit("/", 1)[-1]
        g = f'<g class="hm-f" style="--d:{d0}ms;--t:{dur}ms"><title>{esc(base)}, {fmt(f["count"])} {"branch" if f["count"] == 1 else "branches"}</title>'
        if label:
            g += f'<text x="0" y="{n(y + 12)}">{esc(base)}</text>'
        elif gutter and i in named and y + 11 - last_name >= 14:
            g += f'<text x="0" y="{n(y + 11)}">{esc(short(base, gutter - 8))}</text>'
            last_name = y + 11
        for k in sorted(segs):
            cls = "n" if k == 0 else f"r{mapdata.ramp_index(ncls, k - 1)}"
            g += f'<path class="{cls}" d="{"".join(segs[k])}"/>'
        out.append(g + "</g>")
        y += label + rows * p - gap + sep
    h = max(y - sep, 1)
    dash = f' stroke-dasharray="{s} {gap}"' if gap else ""
    svg = f'<g fill="none" stroke-width="{s}"{dash}>{"".join(out)}</g>'
    # where the cells are, for a script that finds the cell under a point: the pitch, the size of a cell, the cells in a row, the width of the column of file names, the number of
    # branches, and for each file the number of its first branch and the top of its first row (a cell is at column c and row r of its file, left gutter + c * pitch and top the top
    # of the file + r * pitch)
    geo = ",".join([str(p), str(s), str(cols), str(gutter), str(total)] + tops)
    return {"w": W, "h": h, "svg": svg, "pitch": p, "geo": geo}


def legend(doc: dict) -> str:
    """The key of the colours, with the number of branches in each class; the counts add up to the branches of the program."""
    S = len(doc["systems"])
    cl, counts = mapdata.count_classes(S), mapdata.class_counts(doc)
    items = "".join(f'<span><i class="sw r{mapdata.ramp_index(len(cl), k)}"></i>{esc(mapdata.class_label(S, lo, hi))} <b>{fmt(counts[k + 1])}</b></span>'
                    for k, (lo, hi) in enumerate(cl))
    return items + f'<span><i class="sw n"></i>Unreached <b>{fmt(counts[0])}</b></span>'


def caption(doc: dict) -> str:
    """What the picture is, in the numbers of this program (the figure's one sentence besides the title)."""
    S, total, none = len(doc["systems"]), doc["total"], doc["summary"]["none"]
    return (f"Each cell is one branch of {esc(doc['name'])}, in source order, file by file. Colour counts the tools that reach it among the {S} that ran on "
            f"{esc(doc['name'])}; {fmt(none)} branches ({p1(100 * none / total)}%) are reached by none.")


def head_line(doc: dict) -> str:
    nf = len(doc["files"])
    return f"{fmt(doc['total'])} branches in {nf} {'file' if nf == 1 else 'files'}"


def hero(doc: dict) -> dict:
    """Everything the front page shows of one program: the two layouts, the key, the sentence and the count line."""
    classes = branch_classes(doc)
    return {"id": doc["program"], "name": doc["name"], "head": head_line(doc), "legend": legend(doc), "caption": caption(doc),
            **{k: draw(doc, classes, w, h, g) for k, (w, h, g) in LAYOUTS.items()}}


def svg_tag(layout: dict, cls: str, label: str) -> str:
    return (f'<svg class="hm-svg {cls}" viewBox="0 0 {layout["w"]} {layout["h"]}" role="img" aria-label="{esc(label)}" focusable="false" preserveAspectRatio="xMinYMin meet" data-geo="{layout["geo"]}">'
            f'{layout["svg"]}</svg>')


def figure_label(doc: dict) -> str:
    return f"Branch map of {doc['name']}: {head_line(doc)}, coloured by the number of tools that reach each."


def stage(h: dict, doc: dict) -> str:
    """The content of the stage of the figure: the two drawings, of which the style sheet shows the one that fits the width of the window."""
    label = figure_label(doc)
    return svg_tag(h["wide"], "wide", label) + svg_tag(h["narrow"], "narrow", label)


def hero_script(doc: dict) -> str:
    """assets/hero/<program>.js: registers the map of one program for home.js, with the strings that the page writes for its own program."""
    h = hero(doc)
    out = {"id": h["id"], "name": h["name"], "head": h["head"], "legend": h["legend"], "caption": h["caption"], "stage": stage(h, doc)}
    return "(window.CRHero=window.CRHero||{})[" + json.dumps(doc["program"]) + "]=" + json.dumps(out, separators=(",", ":"), ensure_ascii=False) + ";\n"
