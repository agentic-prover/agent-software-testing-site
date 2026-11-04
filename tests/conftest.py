# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 The Agent Software Testing authors
"""Fixtures: the real results release (when it is next to this repository) and a small synthetic release for the rules."""
from __future__ import annotations

import csv
import gzip
import json
import os
import shutil
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent.parent
# The browser checks of the tests listen on fixed ports of the debugging protocol; PORT_OFFSET moves them all (a second checkout running its tests at the same time sets another one).
PORT_OFFSET = int(os.environ.get("PORT_OFFSET", "0"))
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "scripts"))

from sitebuild.site import Site, load_config  # noqa: E402

# The results release the real-release tests read: the repository next to this one, or the folder named in AGENT_SOFTWARE_TESTING_RESULTS (a worktree of this
# repository has no neighbour, and a release under test may live anywhere).
REAL = Path(os.environ["AGENT_SOFTWARE_TESTING_RESULTS"]) if os.environ.get("AGENT_SOFTWARE_TESTING_RESULTS") else HERE.parent / "agent-software-testing-results"


def write_csv(path: Path, header: list[str], rows: list[list]):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(header)
        w.writerows(rows)


def median(v):
    s = sorted(v)
    n = len(s)
    m = s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2
    return int(m) if m == int(m) else m


VERSION_COLUMNS = ["tool_id", "version", "config", "config_sha256", "submitted", "first_release", "status", "supersedes"]
# tool, version, configuration, configuration hash, submitted, first release, status, supersedes: what a release that records versions says of each synthetic system
VERSION_ROWS = {"s-agent": ["agent", "1.0", "KLEE; effort medium", "unknown", "2026-10-01", "2026.1", "current", ""],
                "s-sym": ["sym", "3.1", "fixed options", "unknown", "2026-10-02", "2026.1", "current", ""],
                "s-fuzz": ["fuzz", "5.0", "CmpLog build", "unknown", "2026-10-03", "2026.1", "current", ""],
                "s-abl": ["agent", "1.0", "KLEE; part off", "unknown", "2026-10-01", "2026.1", "current", ""]}
TOOLS = [["sym", "Symbolic Engine", "https://example.org/sym", "", "A symbolic engine."], ["fuzz", "Fuzzer Tool", "", "https://doi.org/10.0000/example", "A fuzzer."],
         ["agent", "Agent Tool", "", "", "An agent that plans runs."]]


def make_release(root: Path, mutate=None, versions: bool = False) -> Path:
    """A release with 2 programs (alpha: open track, 20 branches; beta: fixed track on standard input, 10 branches) and
    4 systems, built to follow every rule the site checks. `mutate(root)` may break one of them. With `versions` the release records the identity of each
    system (tools.csv, and the columns tool_id, version, config, config_sha256, submitted, first_release, status and supersedes of systems.csv) and names itself 2026.1;
    without, it is a release made before versions were recorded."""
    root.mkdir(parents=True, exist_ok=True)
    progs = [("alpha", "Alpha", "1.0", 20, "argv;files;stdin;env", "https://example.org/alpha-1.0.tar.gz", ""),
             ("beta", "Beta", "2.0", 10, "stdin", "https://example.org/beta-2.0.tar.gz", "stdin")]
    systems = [
        ("s-agent", "Agent with KLEE, Model A", "agent", "klee", "model-a", 6, 21600, "open", "standard", "main", "An agent plans runs.", "ref"),
        ("s-sym", "Symbolic engine", "symbolic", "klee", "", 6, 21600, "open", "canonical", "main", "A symbolic engine.", "ref"),
        ("s-fuzz", "Fuzzer", "fuzzer", "aflplusplus", "", 1, 21600, "fixed", "canonical", "main", "A fuzzer.", "ref"),
        ("s-abl", "Agent without part", "agent", "klee", "model-a", 6, 21600, "open", "common-observer", "ablation", "An ablation.", "ref"),
    ]
    write_csv(root / "programs.csv", ["program", "name", "version", "branch_total", "inputs", "source_url", "fixed_track"], [list(p) for p in progs])
    head = ["system_id", "label", "family", "backend", "model", "cores", "budget_s", "track", "measure", "group", "description", "reference"]
    write_csv(root / "systems.csv", head + (VERSION_COLUMNS if versions else []), [list(s) + (VERSION_ROWS[s[0]] if versions else []) for s in systems])
    if versions:
        write_csv(root / "tools.csv", ["tool_id", "name", "url", "reference", "description"], TOOLS)
    keys = {"alpha": [f"a.c:{i + 1}:0:{b}" for i in range(10) for b in (0, 1)], "beta": [f"b.c:{i + 1}:0:{b}" for i in range(5) for b in (0, 1)]}
    for pid, ks in keys.items():
        (root / "universe").mkdir(exist_ok=True)
        with gzip.open(root / "universe" / f"{pid}.txt.gz", "wt", encoding="utf-8") as fh:
            fh.write("\n".join(sorted(ks)) + "\n")
    plan = {("s-agent", "alpha"): 3, ("s-sym", "alpha"): 3, ("s-abl", "alpha"): 3, ("s-agent", "beta"): 3, ("s-sym", "beta"): 3, ("s-fuzz", "beta"): 3}
    runs, finals, unions = [], [], {}
    for (sid, pid), n in plan.items():
        ks = keys[pid]
        sysrow = next(s for s in systems if s[0] == sid)
        cov_list = []
        union = set()
        for r in range(1, n + 1):
            off = {"s-agent": 8, "s-sym": 5, "s-fuzz": 3, "s-abl": 6}[sid] + r
            covered = sorted(ks[: min(len(ks), off)])
            union |= set(covered)
            cov_list.append(len(covered))
            sp = f"sets/{sid}/{pid}/r{r}.json.gz"
            (root / sp).parent.mkdir(parents=True, exist_ok=True)
            with gzip.open(root / sp, "wt", encoding="utf-8") as fh:
                json.dump({"schema": "agent-software-testing/branch-set@0.1", "program": pid, "branch_key_format": "file:line:block_id:branch_id",
                           "branch_total": len(ks), "branch_covered": len(covered), "covered_branch_keys": covered}, fh)
            cp = f"curves/{sid}/{pid}/r{r}.csv"
            (root / cp).parent.mkdir(parents=True, exist_ok=True)
            vals = [min(len(covered), 1 + (i * len(covered)) // 24) for i in range(25)]
            vals[-1] = len(covered)
            (root / cp).write_text("t_s,covered\n" + "\n".join(f"{i * 900},{v}" for i, v in enumerate(vals)) + "\n", encoding="utf-8")
            tok = 1000 * r if sysrow[2] == "agent" else ""
            runs.append([sid, pid, r, len(covered), len(ks), sysrow[8], sp, cp, tok, ""])
        unions[(sid, pid)] = union
        total = len(ks)
        finals.append([sid, pid, n, median(cov_list), min(cov_list), max(cov_list), total, f"{median(cov_list) / total * 100:.2f}"])
    write_csv(root / "runs.csv", ["system_id", "program", "repeat", "covered", "total", "measure", "set_path", "curve_path", "output_tokens", "notes"], runs)
    write_csv(root / "derived/finals.csv", ["system_id", "program", "n_runs", "median", "min", "max", "total", "median_pct"], finals)
    ov = []
    ids = [s[0] for s in systems]
    for pid in keys:
        for i, a in enumerate(ids):
            for b in ids[i + 1:]:
                if (a, pid) in unions and (b, pid) in unions:
                    ua, ub = unions[(a, pid)], unions[(b, pid)]
                    ov.append([pid, a, b, len(ua - ub), len(ub - ua), len(ua & ub)])
    write_csv(root / "derived/overlap.csv", ["program", "system_a", "system_b", "a_only", "b_only", "both"], ov)
    write_csv(root / "derived/signatures.csv", ["system_id", "program", "sanitizer", "kind", "signatures", "runs"],
              [["s-agent", "alpha", "ASan", "none", 0, 3], ["s-agent", "alpha", "UBSan", "left shift out of range", 2, 3]])
    write_csv(root / "derived/measure_agreement.csv", ["system_id", "program", "repeat", "measure_used", "measure_other", "only_used", "only_other", "note"], [])
    release = {"name": "test", "version": "0.0.1", "date": "2026-01-02", "counts": {"systems": 4, "programs": 2},
               "public": False, "licences": {"data": "CC-BY-4.0", "scripts": "Apache-2.0"}, "citation": "TBA"}
    if versions:
        release.update({"release": "2026.1", "suite": None, "specification": "0.1", "previous_release": None, "unrecorded": {"suite": "No suite is named."}})
    (root / "RELEASE.json").write_text(json.dumps(release), encoding="utf-8")
    (root / "LICENSE-DATA.md").write_text("Data licence.\n", encoding="utf-8")
    (root / "submissions").mkdir(exist_ok=True)
    if mutate:
        mutate(root)
    return root


WIDE_TOOLS = 10
WIDE_EXTRA = ["t01-b", "t01-c", "t02-b"]      # a second and a third entry of the first tool, and a second entry of the second


def make_wide_release(root: Path, programs: int = 65) -> Path:
    """A release with many programs and ten tools (the default study only), for the strip: `programs` programs of 20 branches each, ten tools of one entry each and three
    more entries (two of tool t01, one of t02), every entry with two replayed runs on every program, so that the strip has more than 30 rows, more tools than the palette
    has colours and a tool with more entries than it may show. Branch sets and no curves; the release follows every rule the site checks."""
    root.mkdir(parents=True, exist_ok=True)
    pids = [f"p{i:02d}" for i in range(1, programs + 1)]
    ids = [f"t{i:02d}-a" for i in range(1, WIDE_TOOLS + 1)] + WIDE_EXTRA
    tool_of = lambda sid: sid.split("-")[0]
    write_csv(root / "programs.csv", ["program", "name", "version", "branch_total", "inputs", "source_url", "fixed_track"],
              [[p, f"Program {p[1:]}", "1.0", 20, "stdin" if p == pids[-1] else "argv;files;stdin;env", f"https://example.org/{p}.tar.gz", "stdin" if p == pids[-1] else ""] for p in pids])
    head = ["system_id", "label", "family", "backend", "model", "cores", "budget_s", "track", "measure", "group", "description", "reference"]
    day = {"t01-a": "2026-10-01", "t01-b": "2026-10-02", "t01-c": "2026-10-03", "t02-a": "2026-10-01", "t02-b": "2026-10-02"}
    rows = [[sid, f"Tool {tool_of(sid)[1:]} entry {sid[-1]}", "symbolic", "klee", "", 6, 21600, "open", "canonical", "main", "A tool.", "ref"]
            + [tool_of(sid), "1.0", "options", "unknown", day.get(sid, "2026-10-01"), "2026.1", "current", ""] for sid in ids]
    write_csv(root / "systems.csv", head + VERSION_COLUMNS, rows)
    write_csv(root / "tools.csv", ["tool_id", "name", "url", "reference", "description"], [[f"t{i:02d}", f"Tool {i:02d}", "", "", "A tool."] for i in range(1, WIDE_TOOLS + 1)])
    (root / "universe").mkdir(exist_ok=True)
    keys = [f"a.c:{i + 1}:0:{b}" for i in range(10) for b in (0, 1)]
    for pid in pids:
        with gzip.open(root / "universe" / f"{pid}.txt.gz", "wt", encoding="utf-8") as fh:
            fh.write("\n".join(sorted(keys)) + "\n")
    runs, finals = [], []
    for si, sid in enumerate(ids):
        for pi, pid in enumerate(pids):
            cov = []
            for r in (1, 2):
                n = 3 + (si * 3 + pi * 2 + r) % 15      # between 3 and 17 of the 20 branches
                cov.append(n)
                sp = f"sets/{sid}/{pid}/r{r}.json.gz"
                (root / sp).parent.mkdir(parents=True, exist_ok=True)
                with gzip.open(root / sp, "wt", encoding="utf-8") as fh:
                    json.dump({"schema": "agent-software-testing/branch-set@0.1", "program": pid, "branch_key_format": "file:line:block_id:branch_id", "branch_total": 20,
                               "branch_covered": n, "covered_branch_keys": sorted(keys)[:n]}, fh)
                runs.append([sid, pid, r, n, 20, "canonical", sp, "", "", ""])
            finals.append([sid, pid, 2, median(cov), min(cov), max(cov), 20, f"{median(cov) / 20 * 100:.2f}"])
    write_csv(root / "runs.csv", ["system_id", "program", "repeat", "covered", "total", "measure", "set_path", "curve_path", "output_tokens", "notes"], runs)
    write_csv(root / "derived/finals.csv", ["system_id", "program", "n_runs", "median", "min", "max", "total", "median_pct"], finals)
    write_csv(root / "derived/overlap.csv", ["program", "system_a", "system_b", "a_only", "b_only", "both"], [])
    write_csv(root / "derived/signatures.csv", ["system_id", "program", "sanitizer", "kind", "signatures", "runs"], [])
    write_csv(root / "derived/measure_agreement.csv", ["system_id", "program", "repeat", "measure_used", "measure_other", "only_used", "only_other", "note"], [])
    (root / "RELEASE.json").write_text(json.dumps({"name": "wide", "version": "0.0.1", "date": "2026-01-02", "counts": {"systems": len(ids), "programs": programs}, "public": False,
                                                   "licences": {"data": "CC-BY-4.0", "scripts": "Apache-2.0"}, "citation": "TBA", "release": "2026.1", "suite": None,
                                                   "specification": "0.1", "previous_release": None, "unrecorded": {"suite": "No suite is named."}}), encoding="utf-8")
    (root / "LICENSE-DATA.md").write_text("Data licence.\n", encoding="utf-8")
    (root / "submissions").mkdir(exist_ok=True)
    return root


def make_wide_content(dest: Path, programs: int = 65) -> Path:
    shutil.copytree(HERE / "content" / "pages", dest / "pages")
    shutil.copy(HERE / "content" / "spec.json", dest / "spec.json")
    pids = [f"p{i:02d}" for i in range(1, programs + 1)]
    progs = {p: {"id": p, "name": f"Program {p[1:]}", "language": "C", "description": f"{p} is a test program.", "input_summary": "Arguments.", "testing_fact": "A fact.",
                 "upstream": {"homepage": "https://example.org/" + p, "source_sha256": "0" * 64, "note": ""}} for p in pids}
    (dest / "programs.json").write_text(json.dumps({"programs": progs}), encoding="utf-8")
    ids = [f"t{i:02d}-a" for i in range(1, WIDE_TOOLS + 1)] + WIDE_EXTRA
    sysj = {s: {"id": s, "variant": f"entry {s[-1]}", "description": f"Description of {s}.", "budget_text": "six hours", "measures": [], "reference": {"citation": "ref", "url": None, "status": "x"},
                "see_also": []} for s in ids}
    (dest / "systems.json").write_text(json.dumps({"systems": sysj, "groups": {}}), encoding="utf-8")
    return dest


def add_entry(root: Path, new_id: str, copy_of: str, supersedes: bool = True, programs: tuple = ("alpha", "beta"), **fields) -> None:
    """Add an entry to a synthetic release that records versions, as a submission would: a row of systems.csv with the identity in `fields` (version, submitted, status ...),
    and runs, sets, curves and finals copied from the entry `copy_of` on `programs`. With `supersedes` the copied entry becomes superseded and the new one names it."""
    rows = list(csv.DictReader(open(root / "systems.csv", newline="", encoding="utf-8")))
    head = list(rows[0].keys())
    old = next(r for r in rows if r["system_id"] == copy_of)
    new = dict(old, system_id=new_id, label=fields.pop("label", f"{old['label']} again"), **fields)
    if supersedes:
        old["status"], new["supersedes"] = "superseded", copy_of
    write_csv(root / "systems.csv", head, [[r[h] for h in head] for r in rows + [new]])
    runs = list(csv.reader(open(root / "runs.csv", newline="", encoding="utf-8")))
    finals = list(csv.reader(open(root / "derived/finals.csv", newline="", encoding="utf-8")))
    added, added_f = [], []
    for r in runs[1:]:
        if r[0] == copy_of and r[1] in programs:
            r = [new_id] + r[1:]
            for k, folder in ((6, "sets"), (7, "curves")):
                if r[k]:
                    src = root / r[k]
                    r[k] = r[k].replace(f"{folder}/{copy_of}/", f"{folder}/{new_id}/", 1)
                    (root / r[k]).parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy(src, root / r[k])
            added.append(r)
    for f in finals[1:]:
        if f[0] == copy_of and f[1] in programs:
            added_f.append([new_id] + f[1:])
    write_csv(root / "runs.csv", runs[0], runs[1:] + added)
    write_csv(root / "derived/finals.csv", finals[0], finals[1:] + added_f)
    release = json.loads((root / "RELEASE.json").read_text(encoding="utf-8"))
    release["counts"]["systems"] += 1
    (root / "RELEASE.json").write_text(json.dumps(release), encoding="utf-8")


def make_content(dest: Path) -> Path:
    shutil.copytree(HERE / "content" / "pages", dest / "pages")
    shutil.copy(HERE / "content" / "spec.json", dest / "spec.json")
    progs = {"alpha": {"id": "alpha", "name": "Alpha", "language": "C", "description": "Alpha is a test program.", "input_summary": "Arguments.", "testing_fact": "A fact.",
                       "upstream": {"homepage": "https://example.org/alpha", "source_sha256": "0" * 64, "note": ""}},
             "beta": {"id": "beta", "name": "Beta", "language": "C", "description": "Beta is a test program.", "input_summary": "Standard input.", "testing_fact": "",
                      "upstream": {"homepage": "https://example.org/beta", "source_sha256": "1" * 64, "note": ""}}}
    (dest / "programs.json").write_text(json.dumps({"programs": progs}), encoding="utf-8")
    sysj = {s: {"id": s, "description": f"Description of {s}.", "budget_text": "six hours", "measures": [], "reference": {"citation": "ref", "url": None, "status": "x"},
                "see_also": []} for s in ("s-agent", "s-sym", "s-fuzz", "s-abl")}
    sysj["s-agent"]["model"] = {"key": "model-a", "name": "Model A"}
    sysj["s-abl"]["model"] = {"key": "model-a", "name": "Model A"}
    sysj["s-abl"]["setting"] = "part off"
    (dest / "systems.json").write_text(json.dumps({"systems": sysj, "groups": {}}), encoding="utf-8")
    return dest


def build_site(results: Path, out: Path, content: Path | None = None, cfg: dict | None = None, precompress: bool = False, minify: bool = False,
               split: bool = True) -> Site:
    """The tests read the style sheets and scripts as they are written (minify=False); real_dist_min is the build that ships (minified), for the tests that measure it."""
    config = load_config(HERE / "site.json")
    config.update(cfg or {})
    return Site(results, out, config, content=content, precompress=precompress, minify=minify, split=split).build()


@pytest.fixture(scope="session")
def real_results():
    if not (REAL / "RELEASE.json").is_file():
        pytest.skip("the tests that read real data were NOT run: set AGENT_SOFTWARE_TESTING_RESULTS to a checkout of the results repository (see tests/README.md)")
    return REAL


@pytest.fixture(scope="session")
def real_dist(real_results, tmp_path_factory):
    """The site as it ships: `python build.py` (style sheets split, files minified)."""
    out = tmp_path_factory.mktemp("real") / "dist"
    build_site(real_results, out, minify=True)
    return out


@pytest.fixture()
def synth(tmp_path):
    """Factory: synth(mutate=None) -> (results dir, content dir)."""
    def make(mutate=None):
        r = make_release(tmp_path / "release", mutate)
        c = make_content(tmp_path / "content")
        return r, c
    return make
