"""What the pages say agrees with the data they come from.

Every expected value is read from the results release (the CSV files, the branch sets and the universes) by the helpers in helpers.py, not by the
site's own code, so a column read from the wrong place, a swapped pair or a dropped row shows up as a difference."""
from __future__ import annotations

import datetime
import gzip
import html as html_lib
import json
import re

from helpers import branch_sets, csv_rows, read, squash, strip_tags


def _finals(results):
    return {(r["system_id"], r["program"]): r for r in csv_rows(results / "derived/finals.csv")}


def _num(s: str) -> int:
    return int(s.replace(",", ""))


def test_results_tables_show_each_tools_median_on_each_program(real_dist, real_results):
    """Results (and the page of all versions) give, for every program and every tool, the median and the percentage of finals.csv, under the right tool.
    The columns are matched to the tools by the name in the column head, so two columns swapped or a column read from another one fails."""
    finals = _finals(real_results)
    labels = {r["system_id"]: squash(r["label"]) for r in csv_rows(real_results / "systems.csv")}
    by_label = {v: k for k, v in labels.items()}
    assert len(by_label) == len(labels)
    seen = set()
    for page in ("results.html", "all-versions.html"):
        html = read(real_dist / page)
        panels = re.split(r'<div class="gpanel"', html)[1:]
        assert panels, page
        for panel in panels:
            heads = re.findall(r'<th class="r cell[^>]*>.*?<span class="th-static">(.*?)</span><button class="sort" type="button" data-k="(c\d+)"', panel, re.S)
            col = {}
            for text, key in heads:
                text = re.sub(r'<span class="sr">.*?</span>', "", re.sub(r'<span class="th-sub th-\w+">.*?</span>', "", text.split('<span class="th-trk"')[0]), flags=re.S)
                col[key] = by_label[squash(html_lib.unescape(strip_tags(text)))]      # an unknown name is a KeyError: every column is a tool of the release
            assert col, page
            for row in re.findall(r"<tr data-i=.*?</tr>", panel, re.S):
                prog = re.search(r'href="programs/([a-z0-9]+)\.html"', row).group(1)
                for key, pct, med in re.findall(r'<td class="cell [^"]*" data-c="(c\d+)" data-pct="([^"]*)" data-med="([^"]*)"', row):
                    f = finals.get((col[key], prog))
                    if f is None:
                        assert pct == "" and med == "", (page, prog, key)
                        continue
                    assert float(med) == float(f["median"]), (page, prog, col[key])
                    assert abs(float(pct) - float(f["median_pct"])) <= 0.006, (page, prog, col[key])
                    seen.add((col[key], prog))
    assert seen == set(finals), "every row of finals.csv is on Results or all versions, and nothing else is"


def test_each_program_page_lists_the_finals_of_its_program(real_dist, real_results):
    """Final coverage on each program page: the same medians as finals.csv for that program, one row for every tool that ran, and the program's branch total from programs.csv."""
    finals = _finals(real_results)
    for prog in csv_rows(real_results / "programs.csv"):
        pid = prog["program"]
        html = read(real_dist / f"programs/{pid}.html")
        final = re.search(r'<section class="section" id="final".*?</section>', html, re.S).group(0)
        rows = re.findall(r'<tr data-g="\w+" data-med="([^"]+)" data-pct="([^"]+)" data-n="(\d+)"', final)
        want = sorted((float(v["median"]), int(v["n_runs"])) for (s, p), v in finals.items() if p == pid)
        assert sorted((float(m), int(n)) for m, _pct, n in rows) == want, pid
        for _m, pct, _n in rows:
            assert 0 <= float(pct) <= 100
        assert f"{int(prog['branch_total']):,}" in strip_tags(html), pid


def test_compare_opens_on_a_pair_with_the_overlap_of_the_data(real_dist, real_results):
    """Compare's first view: for every program the branches only A reaches, both reach and only B reaches are the numbers of overlap.csv."""
    html = read(real_dist / "compare.html")
    a, b = re.search(r'<div id="cmp-out" data-a="([^"]*)" data-b="([^"]*)"', html).groups()
    only = re.search(r'<section class="section" id="only".*?</section>', html, re.S).group(0)
    ov = {(r["program"], r["system_a"], r["system_b"]): r for r in csv_rows(real_results / "derived/overlap.csv")}
    n = 0
    for pid in sorted({k[0] for k in ov}):
        row = ov.get((pid, a, b)) or ov.get((pid, b, a))
        if row is None:
            continue
        if (pid, a, b) not in ov:
            row = dict(row, a_only=row["b_only"], b_only=row["a_only"])
        m = re.search(rf'<a class="pname" href="programs/{pid}.html">[^<]*</a></th>((?:<td class="num r">[\d,]+</td>){{3}})', only)
        assert m, pid
        got = [_num(x) for x in re.findall(r"([\d,]+)</td>", m.group(1))]
        assert got == [int(row["a_only"]), int(row["both"]), int(row["b_only"])], (pid, a, b)
        n += 1
    assert n >= 1, "the opening pair shares at least one program"


def test_branch_maps_agree_with_the_replayed_sets(real_dist, real_results):
    """For every program the map file holds the universe size of programs.csv, and for every tool the number of branches it reaches and the number only it reaches
    are what the branch sets of its runs say."""
    universes = {}
    for prog in csv_rows(real_results / "programs.csv"):
        pid = prog["program"]
        with gzip.open(real_results / "universe" / f"{pid}.txt.gz", "rt", encoding="utf-8") as fh:
            universes[pid] = {k for k in fh.read().split("\n") if k}
        doc = json.loads(read(real_dist / f"data/branchmap/{pid}.json"))
        assert doc["total"] == int(prog["branch_total"]) == len(universes[pid]) == len(doc["mask"]), pid
        reach = {s: set.union(*branch_sets(real_results, s, pid)) & universes[pid] for s in doc["systems"]}
        for s in doc["systems"]:
            assert doc["summary"]["reached"][s] == len(reach[s]), (pid, s)
            others = set().union(*(reach[o] for o in doc["systems"] if o != s))
            assert doc["summary"]["unique"][s] == len(reach[s] - others), (pid, s)
        assert doc["summary"]["none"] == len(universes[pid] - set().union(*reach.values())), pid


def test_the_front_page_strip_files_carry_the_finals(real_dist, real_results):
    """The small files the front page reads for its strip hold the lowest, median and highest final and the run count of finals.csv for every entry and program."""
    finals = _finals(real_results)
    entries = {e[0] for e in json.loads(read(real_dist / "data/2026.1/entries.json"))["entries"]}
    assert entries == {s for s, _ in finals}
    for sid in entries:
        doc = json.loads(read(real_dist / f"data/2026.1/e/{sid}.json"))
        mine = {p: f for (s, p), f in finals.items() if s == sid}
        assert doc.keys() == mine.keys(), sid
        for p, f in mine.items():
            assert doc[p] == [float(f["median"]), int(f["min"]), int(f["max"]), int(f["n_runs"])], (sid, p)


def test_every_tool_program_and_error_kind_of_the_release_is_on_a_page(real_dist, real_results):
    """Nothing the release holds is left off the site. Tools lists every entry of systems.csv, Compare offers every one, every program has a page,
    and each program page names every kind of sanitiser error the release counts for it."""
    tools, compare = read(real_dist / "tools.html"), read(real_dist / "compare.html")
    for r in csv_rows(real_results / "systems.csv"):
        assert f'id="d-{r["system_id"]}"' in tools, r["system_id"]
        assert f'value="{r["system_id"]}"' in compare, r["system_id"]
    for r in csv_rows(real_results / "programs.csv"):
        assert (real_dist / f"programs/{r['program']}.html").is_file(), r["program"]
    sig = csv_rows(real_results / "derived/signatures.csv")
    for pid in sorted({r["program"] for r in sig if r["kind"] != "none"}):
        page = squash(strip_tags(read(real_dist / f"programs/{pid}.html")))
        for kind in {r["kind"] for r in sig if r["program"] == pid and r["kind"] != "none"}:
            assert squash(kind) in page, (pid, kind)


def test_data_pages_state_the_release_and_its_date_and_counts(real_dist, real_results):
    """The release name, its date and the number of entries and programs at the head of the data pages are those of RELEASE.json and the CSV files."""
    meta = json.loads(read(real_results / "RELEASE.json"))
    day = datetime.date.fromisoformat(meta["date"])
    shown = f"{day.day} {day.strftime('%B %Y')}"
    n_sys, n_prog = len(csv_rows(real_results / "systems.csv")), len(csv_rows(real_results / "programs.csv"))
    for name, counts in (("index.html", False), ("releases.html", False), ("results.html", True), ("all-versions.html", True)):
        text = " ".join(strip_tags(read(real_dist / name)).split())
        assert meta["release"] in text and shown in text, name
        if counts:
            assert re.search(rf"\b{n_sys} entries, {n_prog} programs", text), name


def test_a_newer_version_of_a_tool_takes_the_place_of_the_old_one_in_results_and_both_are_kept_in_all_versions(tmp_path):
    """When a tool is submitted again, Results shows the new entry alone; the page of all versions shows both."""
    from conftest import add_entry, build_site, make_content, make_release
    r = make_release(tmp_path / "release", versions=True)
    c = make_content(tmp_path / "content")
    add_entry(r, "s-sym-2", "s-sym", version="3.2", submitted="2026-10-20", programs=("alpha",), label="Symbolic engine 3.2")
    build_site(r, tmp_path / "out", content=c)

    def versions(page):
        html = read(tmp_path / "out" / page)
        panel = re.search(r'<div class="gpanel" id="g-main".*?(?=<div class="gpanel"|\Z)', html, re.S).group(0)
        heads = re.findall(r'(<th class="r cell[^>]*>.*?)</th>', panel, re.S)
        return [re.search(r'title="Version ([\d.]+)', h).group(1) for h in heads if "Symbolic" in h]
    assert versions("results.html") == ["3.2"]
    assert sorted(versions("all-versions.html")) == ["3.1", "3.2"]


def test_compare_gives_the_same_overlap_whichever_way_round_the_pair_is_chosen(real_dist, real_results):
    """Choosing A and B the other way round swaps the two only-columns and nothing else, whichever order overlap.csv stores the pair in."""
    from conftest import HERE
    from sitebuild import pages
    from sitebuild.data import Model
    from sitebuild.html import Ctx
    ov = csv_rows(real_results / "derived/overlap.csv")
    stored = [(r["system_a"], r["system_b"]) for r in ov]
    m = Model(real_results, HERE / "content")
    ctx = Ctx({}, m, m.facts())
    for a, b in stored[:: max(1, len(stored) // 6)][:6]:
        for x, y in ((a, b), (b, a)):
            html = pages.compare_html(ctx, x, y)[0]
            only = re.search(r'<section class="section" id="only".*?</section>', html, re.S)
            if not only:
                continue
            for r in ov:
                if {r["system_a"], r["system_b"]} != {a, b}:
                    continue
                want = [int(r["a_only"]), int(r["both"]), int(r["b_only"])] if (r["system_a"], r["system_b"]) == (x, y) else [int(r["b_only"]), int(r["both"]), int(r["a_only"])]
                m2 = re.search(rf'<a class="pname" href="programs/{r["program"]}.html">[^<]*</a></th>((?:<td class="num r">[\d,]+</td>){{3}})', only.group(0))
                if m2:
                    assert [_num(v) for v in re.findall(r"([\d,]+)</td>", m2.group(1))] == want, (x, y, r["program"])
