# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 The Agent Software Testing authors
"""The strip of the front page and the small files behind it.

The strip draws the entries a visitor has picked, one row for each program that has a result for at least one of them. The page is written complete for the
opening view (the main group's default entries, two entries for each tool at most, 30 rows at most); everything that grows with the number of tools,
entries and programs is a small file that the browser asks for only when the visitor does something: `data/<release>/programs.json`, `entries.json` and one file
for each entry, `e/<entry>.json`. The rows that src/assets/home.js writes later are the strings that `row` writes here (a test keeps the two equal).
"""
from __future__ import annotations

import json
import re

from .data import PALETTE, BuildError, Model, fmt, median, p1, plural
from .html import esc

PAGE_ROWS = 30             # programs on one page of the strip; the box to find one and the buttons to turn the page appear only above it
PER_TOOL = 2               # entries of one tool on show at once: a dot and a ring


def alphabetical(m: Model) -> list[dict]:
    """The programs in alphabetical order of their names; no program is placed ahead of another for any other reason."""
    return sorted(m.programs, key=lambda p: (p["name"].casefold(), p["id"]))


def entry_name(s: dict) -> str:
    """How an entry is named on the strip, in a dot's hover text and in the numbers that are written out."""
    return s["label"]


def cell(m: Model, sid: str, pid: str) -> tuple | None:
    """(median, lowest, highest, runs, branches) of an entry on a program over the runs that this replay measured, or None where it has none. A count that was published
    earlier and not replayed is never drawn on the strip: the cell of a run set that mixes both is the median of its replayed runs, as the table of Results tells apart."""
    s = m.S[sid]
    if not s["in_release"] or (sid, pid) not in m.fin:
        return None
    f = m.fin[(sid, pid)]
    if "published" not in f["measures"]:
        return f["med"], f["min"], f["max"], f["n"], f["total"]
    cov = [r["c"] for r in m.runs_by[(sid, pid)] if r["m"] != "published"]
    return (median(cov), min(cov), max(cov), len(cov), f["total"]) if cov else None


def cells_of(m: Model, sid: str) -> dict[str, tuple]:
    return {p["id"]: c for p in m.programs if (c := cell(m, sid, p["id"]))}


def has_cells(m: Model, s: dict) -> bool:
    return bool(cells_of(m, s["id"]))


def ranks(m: Model) -> dict[str, int]:
    """The place of each entry in the order of submission (ties in the order of systems.csv): of two entries of a tool on show the earlier is drawn as a dot and the
    later as a ring, whichever was picked first."""
    order = sorted(m.systems, key=lambda s: (s["submitted_ord"], s["order"]))
    return {s["id"]: i for i, s in enumerate(order)}


def free_slot(tool: dict, taken: set[int]) -> int:
    """The colour of a tool that comes on show: its own where that is free, otherwise the lowest free one; its own again when the palette is used up."""
    if tool["slot"] not in taken:
        return tool["slot"]
    free = [x for x in range(1, PALETTE + 1) if x not in taken]
    return free[0] if free else tool["slot"]


def opening(m: Model) -> list[tuple[dict, int]]:
    """The entries the strip opens on, as (entry, colour): the default entries of the default study (the current ones, as the Results table opens), for the tools in
    the order of tools.csv and at most two entries for each, in the order of the columns of Results."""
    cols = [c["s"] for c in m.study_columns(m.primary, "latest") if has_cells(m, c["s"])]
    tools, taken, slot = [], set(), {}
    for t in m.tools:
        if any(s["tool"] == t["id"] for s in cols):
            slot[t["id"]] = free_slot(t, taken)
            taken.add(slot[t["id"]])
            tools.append(t["id"])
    out, count = [], {}
    for s in cols:
        if s["tool"] in slot and count.get(s["tool"], 0) < PER_TOOL:
            count[s["tool"]] = count.get(s["tool"], 0) + 1
            out.append((s, slot[s["tool"]]))
    return out


def shown_tools(m: Model, shown: list[tuple[dict, int]]) -> list[tuple[dict, int]]:
    """The tools of the shown entries as (tool, colour), by colour: the order of the key. The opening tools keep the order of tools.csv."""
    seen = {}
    for s, slot in shown:
        seen.setdefault(s["tool"], slot)
    return sorted(((m.T[t], slot) for t, slot in seen.items()), key=lambda x: x[1])


def marks_of(m: Model, shown: list[tuple[dict, int]]) -> list[dict]:
    """The look of each shown entry: its tool, its colour and whether it is a ring (the later of two entries of its tool)."""
    rk = ranks(m)
    by_tool: dict[str, list] = {}
    for s, _ in shown:
        by_tool.setdefault(s["tool"], []).append(s["id"])
    out = []
    for s, slot in shown:
        first = min(by_tool[s["tool"]], key=lambda i: rk[i])
        out.append({"s": s, "slot": slot, "ring": s["id"] != first})
    return out


def row(m: Model, p: dict, marks: list[dict], href: str) -> str:
    """One program of the strip: its name and size, and in a track from 0 to 100 percent a dot for the median of each shown entry with a line from its lowest to
    its highest run (a ring for the second entry of a tool). The numbers are also written out for assistive technology, and the table of Results holds them."""
    dots, lines, said = "", "", []
    for k in marks:
        s = k["s"]
        c = cell(m, s["id"], p["id"])
        if c is None:
            continue
        med, mn, mx, n, total = c
        pct, lo, hi = med / total * 100, 100 * mn / total, 100 * mx / total
        name = entry_name(s)
        ring = " ring" if k["ring"] else ""
        title = f'{name}: {p1(pct)}%, runs {p1(lo)}% to {p1(hi)}%'
        lines += f'<i class="wh c{k["slot"]}" data-tool="{esc(s["tool"])}" style="--a:{lo:.2f};--b:{hi:.2f}"></i>'
        dots += f'<i class="dot c{k["slot"]}{ring}" data-tool="{esc(s["tool"])}" style="--x:{pct:.2f}" title="{esc(title)}"></i>'
        said.append(f'<li>{esc(name)}: {p1(pct)} percent, {n} {plural(n, "run", "runs")}, from {p1(lo)} to {p1(hi)} percent</li>')
    return (f'<tr><th scope="row"><a class="pname" href="{href}">{esc(p["name"])}</a><span class="sub">{fmt(p["total"])} branches</span></th>'
            f'<td><div class="trk" aria-hidden="true">{lines}{dots}</div><ul class="sr">{"".join(said)}</ul></td></tr>')


def rows_of(m: Model, marks: list[dict]) -> list[dict]:
    """The programs that have a result for at least one shown entry, in alphabetical order."""
    return [p for p in alphabetical(m) if any(cell(m, k["s"]["id"], p["id"]) for k in marks)]


# ---- the files behind the strip -----------------------------------------------------------------------------------

SAFE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")


def data_folder(m: Model) -> str:
    """The folder of the release in data/: its name, so that a page of one release never reads the files of another."""
    return re.sub(r"[^A-Za-z0-9._-]+", "-", m.release_id).strip("-.") or "release"


def labels(entries: list[dict]) -> dict[str, str]:
    """A name for each entry that no other entry has: its label, with the version where two share one (and the key where that is not enough)."""
    count: dict[str, int] = {}
    for s in entries:
        count[s["label"]] = count.get(s["label"], 0) + 1
    out = {s["id"]: s["label"] if count[s["label"]] == 1 else f'{s["label"]} ({s["version"]})' for s in entries}
    again: dict[str, int] = {}
    for v in out.values():
        again[v] = again.get(v, 0) + 1
    return {k: v if again[v] == 1 else f"{v} [{k}]" for k, v in out.items()}


def files(m: Model, map_file, cells_file) -> dict[str, str]:
    """The small data files of the strip, by path below data/<release>/: the programs (id, name, branches, the script of the program's map on the front page, which
    `map_file(id)` names, and the script that holds the cells of its branch map, which `cells_file(id)` names), the tools (id, name, colour) and the entries that have a result (id, a name that no other entry has, tool, its name, group, programs with a
    result, place in the order of submission, version, track and family), and for each entry its cells (median, lowest,
    highest and number of runs on each program, as counts)."""
    cells = {s["id"]: cells_of(m, s["id"]) for s in m.systems}
    entries = [s for s in m.systems if cells[s["id"]]]
    for s in entries:
        if not SAFE.fullmatch(s["id"]):
            raise BuildError(f"systems.csv: the entry {s['id']!r} cannot be a file name; the strip writes one file for each entry")
        for pid, c in cells[s["id"]].items():
            if c[4] != m.P[pid]["total"]:
                raise BuildError(f"derived/finals.csv: {s['id']} on {pid} has a total of {c[4]} branches, programs.csv says {m.P[pid]['total']}")
    rk = ranks(m)
    lab = labels(entries)
    tools = [[t["id"], t["name"], t["slot"]] for t in m.tools if any(s["tool"] == t["id"] for s in entries)]
    ent = [[s["id"], lab[s["id"]], s["tool"], s["label"], m.ST[s["study"]]["title"], len(cells[s["id"]]), rk[s["id"]], s["version"], s["track"], s["family"]] for s in entries]
    out = {"programs.json": {"programs": [[p["id"], p["name"], p["total"], map_file(p["id"]), cells_file(p["id"])] for p in alphabetical(m)]},
           "entries.json": {"tools": tools, "entries": ent}}
    for s in entries:
        out[f'e/{s["id"]}.json'] = {pid: list(c[:4]) for pid, c in sorted(cells[s["id"]].items())}
    return {k: json.dumps(v, separators=(",", ":"), ensure_ascii=False) + "\n" for k, v in out.items()}
