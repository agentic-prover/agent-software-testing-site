# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 The Agent Software Testing authors
"""The branch map of each program, computed from `universe/` and `sets/` of the results release.

For each program the map holds its whole universe in source order (file name, then line, block and branch) and, per
branch, a bit mask of the main-group tools that reach it (the union of each tool's runs). A key in a set that is not
in the universe is counted per tool and reported; it never gets a cell.
"""
from __future__ import annotations

import gzip
import json
import re
from pathlib import Path

from .data import BuildError

SCHEMA = "agent-software-testing/branchmap@0.1"


def split_key(key: str) -> tuple[str, int, int, int]:
    file, line, block, branch = key.rsplit(":", 3)
    return file, int(line), int(block), int(branch)


def read_universe(path: Path) -> list[tuple[str, int, int, int]]:
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        keys = [ln for ln in fh.read().split("\n") if ln]
    parsed = [split_key(k) for k in keys]
    if len(set(parsed)) != len(parsed):
        raise BuildError(f"{path}: duplicate keys in the universe")
    parsed.sort()
    return parsed


def read_set_keys(path: Path) -> list[str]:
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        doc = json.load(fh)
    keys = doc["covered_branch_keys"]
    if doc.get("branch_covered") != len(keys):
        raise BuildError(f"{path}: branch_covered does not match the key list")
    return keys


def run_files(root: Path, system: str, program: str) -> list[Path]:
    d = root / "sets" / system / program
    if not d.is_dir():
        return []
    found = [(int(m.group(1)), p) for p in d.iterdir() if (m := re.fullmatch(r"r(\d+)\.json\.gz", p.name))]
    return [p for _, p in sorted(found)]


def build_program(model, pid: str) -> dict:
    root = model.root
    p = model.P[pid]
    universe = read_universe(root / "universe" / f"{pid}.txt.gz")
    total = len(universe)
    if total != p["total"]:
        raise BuildError(f"{pid}: universe has {total} keys, programs.csv says {p['total']}")
    index = {f"{f}:{l}:{b}:{r}": i for i, (f, l, b, r) in enumerate(universe)}
    present = []
    for s in model.default_entries(model.primary):      # the entries that Results shows as columns: the pool of the branch map is the same list
        runs = run_files(root, s["id"], pid)
        if runs:
            present.append((s, runs))
    mask = [0] * total
    outside: dict[str, int] = {}
    union_sizes: list[int] = []
    for bit, (s, runs) in enumerate(present):
        union: set[str] = set()
        for rp in runs:
            union.update(read_set_keys(rp))
        n_out = 0
        for key in union:
            i = index.get(key)
            if i is None:
                n_out += 1
            else:
                mask[i] |= 1 << bit
        outside[s["id"]] = n_out
        union_sizes.append(len(union) - n_out)
    files: list[dict] = []
    for i, (f, _l, _b, _r) in enumerate(universe):
        if not files or files[-1]["name"] != f:
            files.append({"name": f, "start": i, "count": 0})
        files[-1]["count"] += 1
    n_sys = len(present)
    hist = [0] * (n_sys + 1)
    reached = [0] * n_sys
    unique = [0] * n_sys
    for m in mask:
        hist[bin(m).count("1")] += 1
        for bit in range(n_sys):
            if m >> bit & 1:
                reached[bit] += 1
        if m and m & (m - 1) == 0:
            unique[m.bit_length() - 1] += 1
    for bit in range(n_sys):
        if reached[bit] != union_sizes[bit]:
            raise BuildError(f"{pid}/{present[bit][0]['id']}: map popcount {reached[bit]} differs from the union size {union_sizes[bit]}")
    ids = [s["id"] for s, _ in present]
    doc = {
        "schema": SCHEMA, "program": pid, "name": p["name"], "version": p["version"], "total": total,
        "systems": ids, "labels": [s["label"] for s, _ in present], "families": [s["family"] for s, _ in present],
        "runs": [len(r) for _, r in present], "files": files,
        "lines": [l for (_f, l, _b, _r) in universe], "branches": [r for (_f, _l, _b, r) in universe],
    }
    if any(b for (_f, _l, b, _r) in universe):
        doc["blocks"] = [b for (_f, _l, b, _r) in universe]
    doc["mask"] = mask
    doc["summary"] = {
        "none": hist[0], "all": hist[n_sys] if n_sys else 0, "histogram": hist,
        "reached": dict(zip(ids, reached)), "unique": dict(zip(ids, unique)), "outside_universe": outside,
    }
    return doc


def compact(doc: dict) -> str:
    parts = [json.dumps(k) + ":" + json.dumps(v, separators=(",", ":"), ensure_ascii=False) for k, v in doc.items()]
    return "{\n" + ",\n".join(parts) + "\n}\n"


def delta(values: list[int]) -> list[int]:
    """The first value, then each value minus the one before it (what branchmap.js undoes with a running sum)."""
    return values[:1] + [b - a for a, b in zip(values, values[1:])]


def map_script(doc: dict) -> str:
    """The script that registers a program's map on the page. The line numbers, which are most of the bytes, are written as differences from the one
    before (they rise within a file and are mostly a few apart), which halves what the page downloads; the JSON file of the same map (the published
    format, data/branchmap/) keeps them as they are."""
    out = {}
    for k, v in doc.items():
        if k == "lines":
            out["lines_encoding"] = "delta"
            v = delta(v)
        out[k] = v
    return ('(window.BranchMapData=window.BranchMapData||{})[' + json.dumps(doc["program"]) + "]=" + compact(out).rstrip("\n") + ";\n")


# ---- classes: how many tools reach a branch, in at most five steps of the ramp --------------------------------------
# One rule for the branch map (assets/branchmap.js, BranchMap.classes), the skyline of a program and the legends, so that a colour means the same
# everywhere. With S tools that have runs on the program: for S up to 5 one class per count; otherwise {1}, three near-equal ranges of 2 to S-1, and {S}.
# A branch that no tool reaches is the sixth state, "none", which has its own tint.

def count_classes(S: int) -> list[tuple[int, int]]:
    """The classes of reach counts 1..S as (lowest, highest) count, in order."""
    if S <= 5:
        return [(c, c) for c in range(1, S + 1)]
    out, m, lo = [(1, 1)], S - 2, 2
    base, extra = divmod(m, 3)
    for k in range(3):
        size = base + (1 if k < extra else 0)
        out.append((lo, lo + size - 1))
        lo += size
    out.append((S, S))
    return out


def ramp_index(n: int, i: int) -> int:
    """The step (0 to 4) of the five-step ramp for class i of n classes: the five steps directly when n is 5, evenly spread otherwise."""
    return 4 if n <= 1 else int(i * 4 / (n - 1) + 0.5)


def class_label(S: int, lo: int, hi: int) -> str:
    if lo == hi:
        return "1 tool" if lo == 1 else (f"all {S}" if lo == S and S > 2 else f"{lo} tools")
    return f"{lo} to {hi}"


def class_counts(doc: dict) -> list[int]:
    """Branches per class (None first, then the classes in order); they sum to the program's branch total."""
    S, hist = len(doc["systems"]), doc["summary"]["histogram"]
    cl = count_classes(S)
    return [hist[0]] + [sum(hist[c] for c in range(lo, hi + 1)) for lo, hi in cl]


SKY_FULL = 240            # parts of the skyline on a program page


def sky_parts(doc: dict, parts: int) -> list[dict]:
    """The program's branches in source order, cut into `parts` equal parts (they partition the universe exactly). For each part: how many of its
    branches some tool reaches (`reached`) and how many of them fall into each class of the legend (`by`, in legend order, so that over all parts each
    class adds up to its count in class_counts)."""
    mask, S, total = doc["mask"], len(doc["systems"]), doc["total"]
    cl = count_classes(S)
    cls_of = {}
    for k, (lo, hi) in enumerate(cl):
        for c in range(lo, hi + 1):
            cls_of[c] = k
    out = []
    for k in range(parts):
        lo_i, hi_i = k * total // parts, (k + 1) * total // parts
        by = [0] * len(cl)
        for i in range(lo_i, hi_i):
            c = bin(mask[i]).count("1")
            if c:
                by[cls_of[c]] += 1
        out.append({"start": lo_i, "end": hi_i, "n": hi_i - lo_i, "reached": sum(by), "by": by})
    return out


def stack_edges(q: dict, hmax: int) -> list[int]:
    """The tops of the stacked segments of one part, in whole units of a drawing `hmax` units high: the top of class k is the share of the part's
    branches in classes 0 to k, scaled to hmax and rounded, so the bar is as tall as the share that some tool reaches and a segment is as tall as its class.
    A part that has any reached branch is at least one unit tall (its largest class takes that unit)."""
    n, cum, edges = q["n"], 0, []
    for c in q["by"]:
        cum += c
        edges.append(int(cum * hmax / n + 0.5) if n else 0)
    if q["reached"] and edges[-1] == 0:
        big = q["by"].index(max(q["by"]))
        edges = [0] * big + [1] * (len(edges) - big)
    return edges


def build_all(model) -> dict:
    return {p["id"]: build_program(model, p["id"]) for p in model.programs}
