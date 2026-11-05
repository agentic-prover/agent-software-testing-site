# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 The Agent Software Testing authors
"""Read a results release (the `agent-software-testing-results` repository), check it, and derive what the pages show.

Everything a page prints as a number comes from here, and everything here comes from the release files:
`programs.csv`, `systems.csv`, `runs.csv`, `derived/*.csv`, `RELEASE.json`, `curves/` and (in `mapdata.py`)
`sets/` and `universe/`. Wording about programs and systems comes from `content/`.
"""
from __future__ import annotations

import csv
import datetime
import gzip
import json
import math
import re
from collections import defaultdict
from pathlib import Path

FAMILY = {"agent": "Agent", "llm": "Language model", "symbolic": "Symbolic", "fuzzer": "Fuzzer", "hybrid": "Hybrid", "other": "Other"}
FAMILY_ORDER = ["agent", "llm", "symbolic", "fuzzer", "hybrid", "other"]
DASH = ["", "6 4", "0.1 4.5", "9 3.5 0.1 3.5"]
PALETTE = 8      # the colours of the style sheet (c1 to c8); a ninth tool takes the first colour again
# Versions. An entry (a row of systems.csv) is a tool in one version and configuration with a model, a track and a budget. The default view of the data shows the
# current entries; the superseded and withdrawn ones are shown under "Versions: All". Current means not replaced, never best.
STATUSES = ("current", "superseded", "withdrawn")
UNKNOWN = "unknown"
TRACKS = ("fixed", "open")
MEASURES = ("canonical", "standard", "common-observer", "published")
CHECKPOINT_STEP = 900
REQUIRED = ("RELEASE.json", "programs.csv", "systems.csv", "runs.csv", "derived/finals.csv", "derived/overlap.csv",
            "derived/signatures.csv", "derived/measure_agreement.csv")
STUDY_LAYOUTS = ("none", "before", "beside")      # how a study that is not the default one carries the columns it is read against (content/systems.json, study_views)
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]


class BuildError(Exception):
    """The release breaks a rule the site relies on."""


# ---- small helpers ---------------------------------------------------------------------------------------------

def read_csv(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def num(s):
    """'' -> None, '12' -> 12, '12.5' -> 12.5"""
    if s is None or s == "":
        return None
    f = float(s)
    return int(f) if f == int(f) else f


def median(values):
    s = sorted(values)
    n = len(s)
    if not n:
        return None
    if n % 2:
        return s[n // 2]
    m = (s[n // 2 - 1] + s[n // 2]) / 2
    return int(m) if m == int(m) else m


def fmt(n) -> str:
    """Thousands separators; one decimal only when the value has one (medians over an even number of runs)."""
    if n is None:
        return ""
    if isinstance(n, float):
        if n == int(n):
            n = int(n)
        else:
            return f"{n:,.1f}"
    return f"{n:,}"


def p1(x) -> str:
    return f"{x:.1f}"


def signed(n) -> str:
    if n == 0:
        return "0"
    return ("+" if n > 0 else "−") + fmt(abs(n))


NEW_DAYS = 30      # how long an entry is marked as new


def date_long(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{int(d)} {MONTHS[int(m) - 1]} {y}"


def date_ordinal(iso) -> int:
    """The day number of an ISO date, 0 for anything else (an entry without a recorded date is the oldest)."""
    try:
        return datetime.date.fromisoformat(iso).toordinal()
    except (TypeError, ValueError):
        return 0


def release_key(name) -> tuple[int, int] | None:
    """('2026.1' -> (2026, 1)): the order of release names (YYYY.N); None for a name of another form, which is never compared."""
    mo = re.fullmatch(r"(\d{4})\.(\d+)", name or "")
    return (int(mo.group(1)), int(mo.group(2))) if mo else None


def hours(s) -> str:
    if s % 3600 == 0:
        return f"{s // 3600} h"
    return (f"{s / 3600:.2f}").rstrip("0").rstrip(".") + " h"


WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]


def words(n, cap: bool = False) -> str:
    """A count in prose: spelled out below ten (capitalised where it opens a sentence), a numeral from ten."""
    t = WORDS[n] if isinstance(n, int) and 0 <= n < 10 else fmt(n)
    return t[:1].upper() + t[1:] if cap else t


def plural(n, a: str, b: str) -> str:
    return a if n == 1 else b


def entry_name(tool: str, variant: str = "", model: str = "", cores=None, setting: str = "") -> str:
    """The one name of an entry, built from its structured fields and used on every page: the tool and its variant, then the model (an entry without a model has its
    cores in its place), then the setting that tells it from the other entries of the tool. "Agolic KLEE, GPT-5.5, effort low"; "KLEE fixed options, 6 cores"."""
    detail = model or (f"{cores} {'core' if cores == 1 else 'cores'}" if cores else "")
    return ", ".join(x for x in (f"{tool} {variant}".strip(), detail, setting) if x)


def name_lines(name: str) -> tuple[str, str]:
    """A name in the two lines of a narrow column head: what stands before the first comma, and the rest. compare.js, app.js and charts.js split a name the same way."""
    first, _, rest = name.partition(", ")
    return first, rest


def kind_slug(kind: str) -> str:
    """Display form of a sanitiser error kind: lower case, words joined by hyphens, as the replay specification writes kinds."""
    return re.sub(r"[^a-z0-9]+", "-", kind.lower()).strip("-")


def r1(x: float) -> str:
    """One decimal with half-way values going up, as compare.js writes them (so the page and the script agree to the digit)."""
    return f"{math.floor(x * 10 + 1e-9 + 0.5) / 10:.1f}"


def round_half_up(x: float) -> int:
    return int(math.floor(x + 0.5))


def mwu(a: list, b: list) -> dict:
    """Vargha-Delaney A12 and Mann-Whitney U of sample a against b; ties count one half."""
    u = 0.0
    for x in a:
        for y in b:
            u += 1.0 if x > y else (0.5 if x == y else 0.0)
    return {"U": u, "A12": u / (len(a) * len(b)), "n1": len(a), "n2": len(b)}


# ---- the release -----------------------------------------------------------------------------------------------

class Model:
    """The release plus the site's own wording, indexed for the page renderers."""

    def __init__(self, root: Path, content: Path):
        self.root = Path(root)
        self.content = Path(content)
        for needed in REQUIRED:
            if not (self.root / needed).is_file():
                raise BuildError(f"{self.root} is not a results release: {needed} is missing")
        self.release = json.loads((self.root / "RELEASE.json").read_text(encoding="utf-8"))
        self.counts = self.release.get("counts", {})
        self.warnings: list[str] = []
        self.release_id = str(self.release.get("release") or "")
        self._load_content()
        self._load_programs()
        self._load_tools()
        self._load_systems()
        self._load_runs()
        self._load_derived()
        self._load_curves()
        self.maps: dict = {}

    # -- content ------------------------------------------------------------------------------------------------

    def _load_content(self):
        c = self.content
        self.prog_content = json.loads((c / "programs.json").read_text(encoding="utf-8"))["programs"]
        sj = json.loads((c / "systems.json").read_text(encoding="utf-8"))
        self.sys_content = sj["systems"]
        self.group_text = sj.get("groups", {})      # the studies in the order of their first appearance in the file, each with its description
        self.study_views = sj.get("study_views", {})
        for k, v in self.study_views.items():
            if v.get("references", "none") not in STUDY_LAYOUTS:
                raise BuildError(f"content/systems.json: study_views of {k!r} has references {v['references']!r}; the vocabulary is {', '.join(STUDY_LAYOUTS)}")
        self.backend_text = sj.get("backends", {})
        tj = c / "terms.json"
        self.terms = json.loads(tj.read_text(encoding="utf-8"))["terms"] if tj.is_file() else []
        self.spec = json.loads((c / "spec.json").read_text(encoding="utf-8"))
        mh = c / "mapheights.json"
        self.map_heights = json.loads(mh.read_text(encoding="utf-8")) if mh.is_file() else {}

    # -- programs -----------------------------------------------------------------------------------------------

    def _load_programs(self):
        rows = read_csv(self.root / "programs.csv")
        self.programs = []
        for r in rows:
            j = self.prog_content.get(r["program"])
            if j is None:
                self.warnings.append(f"content/programs.json has no entry for {r['program']}")
                j = {}
            ft = r["fixed_track"]
            if ft and ft != "stdin" and "{input}" not in ft:
                raise BuildError(f"programs.csv: fixed track of {r['program']} is neither empty, stdin nor an argument list with {{input}}")
            inputs = [x for x in r["inputs"].split(";") if x]
            if ft == "stdin" and "stdin" not in inputs:
                self.warnings.append(f"programs.csv: {r['program']} has a fixed track that reads standard input, but its input channels do not include stdin")
            self.programs.append({
                "id": r["program"], "name": r["name"], "version": r["version"], "total": int(r["branch_total"]),
                "inputs": inputs, "fixed": ft, "url": r["source_url"],
                "lang": j.get("language", ""), "desc": j.get("description", ""),
            })
        self.P = {p["id"]: p for p in self.programs}
        self.programs_alphabetical = [p["id"] for p in self.programs] == sorted(p["id"] for p in self.programs)
        universes = self.root / "universe"
        self.universe_sizes: dict[str, int] = {}
        if universes.is_dir():
            for p in self.programs:
                path = universes / f"{p['id']}.txt.gz"
                if not path.is_file():
                    raise BuildError(f"universe/{p['id']}.txt.gz is missing")
                with gzip.open(path, "rt", encoding="utf-8") as fh:
                    n = sum(1 for line in fh if line.strip())
                if n != p["total"]:
                    raise BuildError(f"universe/{p['id']}.txt.gz has {n} keys, programs.csv says {p['total']}")
                self.universe_sizes[p["id"]] = n

    # -- tools --------------------------------------------------------------------------------------------------

    def _load_tools(self):
        """tools.csv: one row per tool, in the order that gives each tool its colour. A release made before versions were recorded has none; every tool
        is then found in systems.csv and ordered by its first appearance."""
        path = self.root / "tools.csv"
        rows = read_csv(path) if path.is_file() else []
        self.tools_csv = bool(rows)      # without it the tools are made up from the systems, and the pages of the tools are not written
        if not rows:
            self.warnings.append("the release has no tools.csv: every system is shown as a tool of its own, in the order of systems.csv, and no page is written for a tool")
        self.tools: list[dict] = []
        self.T: dict[str, dict] = {}
        for r in rows:
            self._add_tool(r["tool_id"], r.get("name") or r["tool_id"], r.get("url", ""), r.get("reference", ""), r.get("description", ""), True)

    def _add_tool(self, tid, name, url="", reference="", description="", listed=False):
        if tid in self.T:
            self.warnings.append(f"tools.csv lists the tool {tid!r} twice; the first row is used")
            return self.T[tid]
        tool = {"id": tid, "name": name, "url": url, "reference": reference, "desc": description, "listed": listed, "order": len(self.tools),
                "slot": len(self.tools) % PALETTE + 1}
        if len(self.tools) == PALETTE:
            self.warnings.append(f"the release has more than {PALETTE} tools, so colours repeat from the ninth")
        self.tools.append(tool)
        self.T[tid] = tool
        return tool

    # -- systems ------------------------------------------------------------------------------------------------

    def _load_systems(self):
        rows = read_csv(self.root / "systems.csv")
        self.systems = []
        fixed_programs = {p["id"] for p in self.programs if p["fixed"]}
        self.fixed_programs = fixed_programs
        if rows and "tool_id" not in rows[0]:
            self.warnings.append("systems.csv has no tool_id column (a release made before versions were recorded): the version, dates and status of every entry are unknown")
        rk = release_key(self.release_id)
        for i, r in enumerate(rows):
            sid = r["system_id"]
            if r["track"] not in TRACKS:
                raise BuildError(f"systems.csv: system {sid!r} has track {r['track']!r}; the vocabulary is {' and '.join(TRACKS)}")
            if r["family"] not in FAMILY:
                raise BuildError(f"systems.csv: system {sid!r} has family {r['family']!r}")
            j = self.sys_content.get(sid, {})
            ref = j.get("reference")
            tid = (r.get("tool_id") or "").strip() or sid
            tool = self.T.get(tid)
            if tool is None:
                if "tool_id" in r:
                    self.warnings.append(f"systems.csv: {sid} names the tool {tid!r}, which tools.csv does not list; it is shown under the name of the system")
                tool = self._add_tool(tid, r["label"])
            tag = (r.get("study") or r.get("group") or j.get("group") or "").strip()
            if not tag:
                self.warnings.append(f"systems.csv: {sid} has no study (group); it is listed under 'other'")
                tag = "other"
            status = (r.get("status") or "current").strip()
            if status not in STATUSES:
                self.warnings.append(f"systems.csv: {sid} has status {status!r}; the vocabulary is {', '.join(STATUSES)}, and it is treated as current")
                status = "current"
            first = (r.get("first_release") or "").strip()
            submitted = (r.get("submitted") or "").strip()
            fk = release_key(first)
            in_release = not (rk and fk and fk > rk)
            if not in_release:
                self.warnings.append(f"systems.csv: {sid} first appears in release {first}, which is later than this release ({self.release_id}); it is not in this release")
            model = r["model"]
            model_name = (j.get("model") or {}).get("name", "") or ""
            cores = num(r["cores"])
            # the one name of the entry: from its tool, variant, model (or cores) and setting; a tool that tools.csv does not list is named by the label of its system
            name = entry_name(tool["name"], j.get("variant", ""), model_name or model, cores, j.get("setting", "")) if tool["listed"] else r["label"]
            self.systems.append({
                "id": sid, "order": i, "label": name, "summary": j.get("summary", ""),
                "slot": 0, "dash": 0, "family": r["family"], "backend": r["backend"],
                "backend_name": j.get("backend_text") or self.backend_text.get(r["backend"], r["backend"]),
                "model": model, "model_name": model_name,
                "cores": cores, "budget": num(r["budget_s"]), "budget_text": j.get("budget_text", ""),
                "track": r["track"], "measure": r["measure"].split("+"), "study": tag,
                "tool": tid, "tool_name": tool["name"], "version": (r.get("version") or "").strip() or UNKNOWN, "config": (r.get("config") or "").strip(),
                "config_sha256": (r.get("config_sha256") or "").strip(), "submitted": submitted, "first_release": first, "new": self.is_new(submitted),
                "status": status, "supersedes": (r.get("supersedes") or "").strip(), "superseded_by": [], "in_release": in_release,
                "desc": j.get("description") or r["description"],
                "uses_agent_seeds": bool(j.get("uses_agent_seeds")), "no_cores_text": j.get("no_cores_text", "not stated"),
                "no_budget_text": j.get("no_budget_text", "not stated"),
                "ref": {"citation": ref["citation"], "url": ref.get("url"), "status": ref.get("status", "")} if ref else {"citation": r["reference"], "url": None, "status": ""},
                "see": [{"citation": x["citation"], "url": x.get("url")} for x in j.get("see_also", [])],
                "model_url": (j.get("model_reference") or {}).get("url"),
            })
        for s in self.systems:
            s["submitted_ord"] = date_ordinal(s["submitted"])
        self.S = {s["id"]: s for s in self.systems}
        for s in self.systems:
            if s["supersedes"]:
                target = self.S.get(s["supersedes"])
                if target is None:
                    self.warnings.append(f"systems.csv: {s['id']} supersedes {s['supersedes']!r}, which is not a system")
                else:
                    target["superseded_by"].append(s["id"])
        self._order_studies()
        for s in self.systems:
            s["primary"] = s["study"] == self.primary
        # A tool's entries stand together, and the default study is listed by family, then by tool (the order of tools.csv), then in the order of systems.csv.
        main_at = [i for i, x in enumerate(self.systems) if x["study"] == self.primary]
        ordered = sorted((self.systems[i] for i in main_at),
                         key=lambda x: (FAMILY_ORDER.index(x["family"]), self.T[x["tool"]]["order"], x["order"]))
        for i, x in zip(main_at, ordered):
            self.systems[i] = x
        for i, x in enumerate(self.systems):
            x["order"] = i
        self.S = {s["id"]: s for s in self.systems}
        self._derive_styles()

    def _order_studies(self):
        """The studies (what the data calls its groups) in the order of content/systems.json, then any other study tag in the order of first appearance. The
        first one that has entries is the default study: the view that opens first, whose columns the other studies are read against."""
        seen = [s["study"] for s in self.systems]
        known = [k for k in self.group_text if k in seen]
        unknown = []
        for k in seen:
            if k not in known and k not in unknown:
                unknown.append(k)
        for k in unknown:
            if self.group_text:
                self.warnings.append(f"study {k!r} is not described in content/systems.json (groups); it is shown after the described ones")
        self.studies = []
        for k in known + unknown:
            slug = re.sub(r"[^a-z0-9]+", "", k.lower()) or "study"
            while slug in {x["slug"] for x in self.studies}:
                slug += "x"
            if slug != k:
                self.warnings.append(f"study {k!r} is written {slug!r} in addresses")
            view = self.study_views.get(k, {})
            self.studies.append({"id": k, "slug": slug, "title": k[:1].upper() + k[1:], "text": self.group_text.get(k, ""),
                                 "layout": view.get("references", "none")})
        self.primary = self.studies[0]["id"] if self.studies else ""
        self.ST = {x["id"]: x for x in self.studies}

    def _derive_styles(self):
        """Colour follows the tool and line style follows the version. In the default study a tool has the colour of its place in tools.csv and its entries take
        the line styles in the order they were submitted (ties in the order of systems.csv), so adding an entry never changes another one. In the other studies
        the entries of a tool keep the tool's colour and take the next line styles after those of the entry they are read against; when a tool has more entries
        in a study than there are line styles, they take the free colours, as the lines of a chart that shows nothing else. Nothing here names a system."""
        n_dash = len(DASH)
        by_tool: dict[str, list] = defaultdict(list)
        for s in self.systems:
            if s["study"] == self.primary:
                by_tool[s["tool"]].append(s)
        for tid, lst in by_tool.items():
            for k, s in enumerate(sorted(lst, key=lambda x: (x["submitted_ord"], x["order"]))):
                s["slot"], s["dash"] = self.T[tid]["slot"], k % n_dash
        for st in self.studies:
            if st["id"] == self.primary:
                continue
            members = [c["s"] for c in self.study_columns(st["id"], "all")]
            tools = []
            for s in members:
                if s["tool"] not in tools:
                    tools.append(s["tool"])
            tool_slots = {self.T[t]["slot"] for t in tools}
            for tid in tools:
                lines = [s for s in members if s["tool"] == tid]
                mine = [s for s in lines if s["study"] != self.primary]      # the entries of this study; the others are read against it and keep their style
                taken = {(s["slot"], s["dash"]) for s in lines if s["study"] == self.primary}
                slot = self.T[tid]["slot"]
                own = sorted(mine, key=lambda x: x["order"])      # in the order of systems.csv, never by status, so that a change of status moves no style
                if len(lines) <= n_dash:
                    free = [(slot, d) for d in range(n_dash) if (slot, d) not in taken]
                else:
                    others = [x for x in range(1, PALETTE + 1) if x not in tool_slots] or [x for x in range(1, PALETTE + 1) if x != slot]
                    free = [(c, d) for d in range(n_dash) for c in others if (c, d) not in taken]
                free = free or [(slot, 0)]
                for k, s in enumerate(own):
                    s["slot"], s["dash"] = free[k % len(free)]

    # -- runs ---------------------------------------------------------------------------------------------------

    def _load_runs(self):
        raw = read_csv(self.root / "runs.csv")
        self.runs = []
        self.runs_by: dict[tuple, list] = defaultdict(list)
        for r in raw:
            sid, pid = r["system_id"], r["program"]
            if sid not in self.S or pid not in self.P:
                raise BuildError(f"runs.csv names an unknown system or program: {sid} / {pid}")
            where = f"runs.csv: {sid} on {pid}, repeat {r['repeat']}"
            if r["measure"] not in MEASURES:
                raise BuildError(f"{where}: unknown measure {r['measure']!r}")
            if (r["measure"] == "published") == bool(r["set_path"]):
                raise BuildError(f"{where}: a run has the measure 'published' exactly when it has no branch set "
                                 f"(measure {r['measure']!r}, set_path {r['set_path']!r})")
            if self.S[sid]["track"] == "fixed" and pid not in self.fixed_programs:
                raise BuildError(f"{where}: the system is on the fixed track, but the program has no fixed track")
            run = {"s": sid, "p": pid, "r": int(r["repeat"]), "c": int(r["covered"]), "t": int(r["total"]), "m": r["measure"],
                   "tok": num(r["output_tokens"]), "note": r["notes"], "set": r["set_path"], "curve": r["curve_path"]}
            if run["t"] != self.P[pid]["total"]:
                raise BuildError(f"{where}: total {run['t']} differs from the program's branch total {self.P[pid]['total']}")
            self.runs.append(run)
            self.runs_by[(sid, pid)].append(run)
        for lst in self.runs_by.values():
            lst.sort(key=lambda x: x["r"])

    # -- derived tables -----------------------------------------------------------------------------------------

    def _load_derived(self):
        finals = read_csv(self.root / "derived/finals.csv")
        self.fin: dict[tuple, dict] = {}
        for f in finals:
            sid, pid = f["system_id"], f["program"]
            rs = self.runs_by.get((sid, pid), [])
            if not rs:
                raise BuildError(f"derived/finals.csv has a row for {sid} on {pid} without runs")
            n, med, mn, mx, total = int(f["n_runs"]), num(f["median"]), num(f["min"]), num(f["max"]), int(f["total"])
            cov = [r["c"] for r in rs]
            if n != len(rs) or med != median(cov) or mn != min(cov) or mx != max(cov):
                raise BuildError(f"derived/finals.csv: {sid} on {pid} does not match the runs of runs.csv")
            pct = med / total * 100
            if abs(pct - float(f["median_pct"])) > 0.006:
                raise BuildError(f"derived/finals.csv: median_pct of {sid} on {pid} differs from median/total")
            toks = [r["tok"] for r in rs if r["tok"] is not None]
            meas = []
            for r in rs:
                if r["m"] not in meas:
                    meas.append(r["m"])
            self.fin[(sid, pid)] = {
                "n": n, "med": med, "min": mn, "max": mx, "total": total, "pct": pct,
                "inc": n < 3 or any("incomplete" in r["note"] for r in rs),
                "count_only": sum(1 for r in rs if "count only" in r["note"]),
                "tok_med": round_half_up(median(toks)) if toks else None, "tok_n": len(toks), "measures": meas,
            }
        self.fin_by_sys: dict[str, dict] = defaultdict(dict)
        self.fin_by_prog: dict[str, dict] = defaultdict(dict)
        for (sid, pid), v in self.fin.items():
            self.fin_by_sys[sid][pid] = v
            self.fin_by_prog[pid][sid] = v
        self.overlap: dict[str, dict] = defaultdict(dict)
        for o in read_csv(self.root / "derived/overlap.csv"):
            self.overlap[o["program"]][(o["system_a"], o["system_b"])] = (int(o["a_only"]), int(o["b_only"]), int(o["both"]))
        self.sigs: dict[str, dict] = defaultdict(lambda: defaultdict(list))
        self.sig_rows = read_csv(self.root / "derived/signatures.csv")
        for g in self.sig_rows:
            self.sigs[g["program"]][g["system_id"]].append({"san": g["sanitizer"], "kind": g["kind"], "n": int(g["signatures"]), "runs": int(g["runs"])})
        agree = read_csv(self.root / "derived/measure_agreement.csv")
        runs_agree = {(r["system_id"], r["program"], r["repeat"]) for r in agree}
        self.agree = {"total": len(agree), "exact": sum(1 for r in agree if int(r["only_used"]) == 0 and int(r["only_other"]) == 0),
                      "runs": len(runs_agree), "rows": agree}

    # -- curves -------------------------------------------------------------------------------------------------

    def _load_curves(self):
        self.cur: dict[str, dict] = defaultdict(dict)
        self.curve_runs: dict[tuple, list] = defaultdict(list)
        self.checkpoints: list[int] | None = None
        for r in self.runs:
            if r["set"] and not (self.root / r["set"]).is_file():
                raise BuildError(f"runs.csv: set {r['set']} is missing")
        for r in sorted(self.runs, key=lambda x: (x["s"], x["p"], x["r"])):
            if not r["curve"]:
                continue
            path = self.root / r["curve"]
            if not path.is_file():
                raise BuildError(f"runs.csv: curve {r['curve']} is missing")
            lines = path.read_text(encoding="utf-8").strip().split("\n")[1:]
            ts, vals = [], []
            for ln in lines:
                a, b = ln.split(",")
                ts.append(int(a))
                vals.append(int(b))
            # A curve follows its own budget: every checkpoint on the grid, then the budget itself. A budget off the grid
            # is left out of the chart; its final count is in the tables.
            if ts[:-1] != [i * CHECKPOINT_STEP for i in range(len(ts) - 1)] or (len(ts) > 1 and not ts[-2] < ts[-1] <= ts[-2] + CHECKPOINT_STEP):
                raise BuildError(f"{r['curve']}: checkpoints are not 0, {CHECKPOINT_STEP}, ...")
            if ts[-1] % CHECKPOINT_STEP:
                ts, vals = ts[:-1], vals[:-1]
            if len(vals) < 2:
                continue
            if self.checkpoints is None or len(ts) > len(self.checkpoints):
                self.checkpoints = ts
            self.cur[r["p"]].setdefault(r["s"], []).append(vals)
            self.curve_runs[(r["s"], r["p"])].append((r["r"], vals))
        self.checkpoints = self.checkpoints or []

    def has_curve(self, pid, sid) -> bool:
        return bool(self.cur.get(pid, {}).get(sid))

    def band(self, pid, sid):
        reps = self.cur.get(pid, {}).get(sid)
        if not reps:
            return None
        n = min(len(r) for r in reps)
        col = [[r[i] for r in reps] for i in range(n)]
        return {"med": [median(c) for c in col], "lo": [min(c) for c in col], "hi": [max(c) for c in col], "n": len(reps)}

    def median_curve(self, pid, sid):
        b = self.band(pid, sid)
        return b["med"] if b else None

    # -- queries used by several pages --------------------------------------------------------------------------

    # -- studies, versions and the columns of a view ------------------------------------------------------------

    def study_entries(self, study):
        """Every entry of a study, whatever its status, in the order of the pages."""
        return [s for s in self.systems if s["study"] == study]

    def default_entries(self, study) -> list[dict]:
        """The entries a study shows by default: the current ones that are in this release. The branch maps count the tools of the default study from this list too,
        so that the columns of Results and the tools behind "reached by none" and "reached by one tool only" are the same entries."""
        return [s for s in self.study_entries(study) if s["status"] == "current" and s["in_release"]]

    def study_columns(self, study, versions="latest") -> list[dict]:
        """The columns of a study as {"s": entry, "ref": whether it belongs to the default study and is shown beside another study, "default": whether the default
        view shows it}. With versions "latest" only the default entries; with "all" every entry, an entry of a tool beside the others of its tool, the default
        ones first and the rest newest first (so a superseded entry stands next to its tool, dated by its submission). A study that is not the default one
        carries the default study's columns of the tools it holds, as its entry in study_views of content/systems.json says (before, beside or none)."""
        allv = versions == "all"
        defaults = {s["id"] for s in self.default_entries(study)}
        own_all = [s for s in self.study_entries(study) if allv or s["id"] in defaults]
        own = self._tool_adjacent(own_all, defaults)
        cols = [{"s": s, "ref": False, "default": s["id"] in defaults} for s in own]
        layout = self.ST[study]["layout"] if study in self.ST else "none"
        if study == self.primary or layout == "none":
            return cols
        tools = {s["tool"] for s in own}
        # what the study is read against: the default study's columns of its tools, and the entries of those tools that are no longer current (a current entry beyond
        # the cap is not something this study is read against)
        refs = [dict(c, ref=True) for c in self.study_columns(self.primary, versions)
                if c["s"]["tool"] in tools and (c["default"] or c["s"]["status"] != "current")]
        if layout == "before":
            return refs + cols
        fam_order: list[str] = []
        for c in cols:
            if c["s"]["family"] not in fam_order:
                fam_order.append(c["s"]["family"])
        fam_order += [f for f in dict.fromkeys(c["s"]["family"] for c in refs) if f not in fam_order]
        return [c for f in fam_order for part in (cols, refs) for c in part if c["s"]["family"] == f]      # per family: the study's own columns, then those they are read against

    def _tool_adjacent(self, entries: list[dict], defaults: set) -> list[dict]:
        """The entries with those of one tool together, in the order the tools first appear; within a tool the default entries first (in the order of the pages), then
        the others newest first."""
        tools: list[str] = []
        for s in entries:
            if s["tool"] not in tools:
                tools.append(s["tool"])
        out = []
        for tid in tools:
            mine = [s for s in entries if s["tool"] == tid]
            out += [s for s in mine if s["id"] in defaults]
            out += sorted((s for s in mine if s["id"] not in defaults), key=lambda x: (-x["submitted_ord"], x["order"]))
        return out

    def view_members(self, study):
        """The lines of the chart view of a study (and the rows of its legend): every entry of the study that the view carries, whatever its status."""
        return [c["s"] for c in self.study_columns(study, "all")]

    def default_visible(self, pid, study):
        """The lines that are on when a chart opens: the current ones that have a curve (all of the entries when none is current). A superseded or withdrawn line
        is off until a visitor turns it on."""
        mem = [s for s in self.view_members(study) if self.has_curve(pid, s["id"])]
        cur = [s for s in mem if s["status"] == "current" and s["in_release"]] or mem
        return [s["id"] for s in cur]

    def tool_entries(self, tid) -> list[dict]:
        """Every entry of a tool in any study, newest submitted first."""
        return sorted((s for s in self.systems if s["tool"] == tid), key=lambda x: (-x["submitted_ord"], x["order"]))

    def programs_with_runs(self, systems):
        return [p for p in self.programs if any((s["id"], p["id"]) in self.fin for s in systems)]

    def overlap_of(self, pid, x, y):
        o = self.overlap.get(pid)
        if not o:
            return None
        if (x, y) in o:
            a, b, both = o[(x, y)]
            return {"a": a, "b": b, "both": both}
        if (y, x) in o:
            a, b, both = o[(y, x)]
            return {"a": b, "b": a, "both": both}
        return None

    def finals_of(self, sid, pid):
        return [r["c"] for r in self.runs_by.get((sid, pid), [])]

    # -- numbers the prose uses ---------------------------------------------------------------------------------

    def is_new(self, submitted: str) -> bool:
        """An entry submitted since the last snapshot of the data, for its first NEW_DAYS days."""
        snapshot, updated = self.release.get("snapshot_date"), self.release.get("date")
        if not (submitted and snapshot and updated) or submitted < snapshot:
            return False
        return date_ordinal(updated) - date_ordinal(submitted) <= NEW_DAYS

    def facts(self) -> dict:
        """Counts and ranges quoted in prose, all computed from the release files."""
        totals = [p["total"] for p in self.programs]
        mn = min(self.programs, key=lambda p: p["total"])
        mx = max(self.programs, key=lambda p: p["total"])
        by_measure = defaultdict(int)
        for r in self.runs:
            by_measure[r["m"]] += 1
        budgets = [s["budget"] for s in self.systems if s["budget"]]
        return {
            "systems": len(self.systems), "programs": len(self.programs), "runs": len(self.runs),
            "runs_with_sets": sum(1 for r in self.runs if r["set"]), "runs_with_curves": sum(1 for r in self.runs if r["curve"]),
            "universes": len(self.universe_sizes) or len(self.programs),
            **{f"n_{st['slug']}": len(self.study_entries(st["id"])) for st in self.studies},
            "release": self.release_id, "tools": len(self.tools), "entries": len(self.systems), "n_studies": len(self.studies),
            "n_current": sum(1 for x in self.systems if x["status"] == "current"), "n_superseded": sum(1 for x in self.systems if x["status"] == "superseded"),
            "n_withdrawn": sum(1 for x in self.systems if x["status"] == "withdrawn"),
            "n_new": sum(1 for x in self.systems if x["new"]),
            "n_fixed_programs": len(self.fixed_programs),
            "n_fixed_default": sum(1 for x in self.study_entries(self.primary) if x["track"] == "fixed"),
            "n_agent": sum(1 for x in self.systems if x["family"] == "agent"),
            "n_agent_seeds": sum(1 for x in self.systems if x["uses_agent_seeds"]),
            "observer_agent_runs": sum(1 for r in self.runs if r["m"] == "common-observer" and self.S[r["s"]]["family"] == "agent"),
            "agree_runs": self.agree["runs"],
            "n_measures": len({r["m"] for r in self.runs}),
            "branch_min": mn["total"], "branch_min_name": mn["name"], "branch_max": mx["total"], "branch_max_name": mx["name"],
            "branch_sum": sum(totals),
            "published_runs": by_measure["published"], "canonical_runs": by_measure["canonical"],
            "standard_runs": by_measure["standard"], "observer_runs": by_measure["common-observer"],
            "agree_total": self.agree["total"], "agree_exact": self.agree["exact"], "agree_diff": self.agree["total"] - self.agree["exact"],
            "agree_max_diff": max((max(int(r["only_used"]), int(r["only_other"])) for r in self.agree["rows"]), default=0),
            "agree_programs": len({r["program"] for r in self.agree["rows"]}),
            "budget_max_h": max(budgets) // 3600 if budgets else 0, "budget_max_s": max(budgets) if budgets else 0,
            "checkpoint_step": CHECKPOINT_STEP, "checkpoint_min": CHECKPOINT_STEP // 60,
            "checkpoints": len(self.checkpoints),
            "version": self.release.get("version", ""), "date": self.release.get("date", ""),
            "date_long": date_long(self.release["date"]) if self.release.get("date") else "",
            "public": bool(self.release.get("public")), "citation": self.release.get("citation", ""),
            "licence_data": self.release.get("licences", {}).get("data", ""), "licence_code": self.release.get("licences", {}).get("scripts", ""),
        }
