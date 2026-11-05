# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 The Agent Software Testing authors
"""The pages. Every number comes from the model (the results release); every sentence of prose from `content/`."""
from __future__ import annotations

import json
import re

from . import herodata, strip
from .data import (FAMILY, FAMILY_ORDER, Model, fmt, hours, kind_slug, median, mwu, name_lines,
                   p1, plural, r1, round_half_up, signed, words)
from .html import (ICON, Ctx, dag, esc, http_url, line_key, nb, page, release_line, sort_head, sort_th, sky_full,
                   sky_legend, sparkline, tbl_wrap, terms, title_of)

# ---- Home: the front page --------------------------------------------------------------------------------------

HOME_TITLE = "Branch coverage"
STRIP_NOTE = "A dot is the median over the runs of one entry; its line runs from the lowest to the highest run."
RING_NOTE = "A filled dot and a ring are two entries of one tool, such as two models."


def hero_first(ctx: Ctx) -> str:
    """The program whose map the page carries as markup: the first in alphabetical order that has one, so that no program is a favourite."""
    maps = ctx.extras["maps"]
    return next(p["id"] for p in strip.alphabetical(ctx.model) if p["id"] in maps)


def strip_figure(ctx: Ctx) -> str:
    """The strip: one row for each program with a result for a shown entry, a dot at the median of each (a line from the lowest to the highest run, a ring for the
    second entry of a tool), the key with a button for each tool, and the boxes that a script adds (an entry to add, the programs to find). The page is written
    for the opening view; home.js draws the others."""
    m: Model = ctx.model
    shown = strip.opening(m)
    marks = strip.marks_of(m, shown)
    progs = strip.rows_of(m, marks)
    rows = "".join(strip.row(m, p, marks, ctx.prog(p["id"])) for p in progs[:strip.PAGE_ROWS])
    keys = "".join(f'<li data-tool="{esc(t["id"])}"><i class="dot c{slot}"></i>{esc(t["name"])}</li>' for t, slot in strip.shown_tools(m, shown))
    axis = "".join(f'<span style="--x:{v}">{v}%</span>' if v else '<span style="--x:0">0</span>' for v in (0, 25, 50, 75, 100))
    two = any(k["ring"] for k in marks)
    many = len(progs) > strip.PAGE_ROWS
    pager = (f'<p id="st-range">Programs 1 to {strip.PAGE_ROWS} of {fmt(len(progs))}</p>' if many else '<p id="st-range"></p>')
    return ('<section class="fig strip-fig" id="strip" aria-labelledby="h-strip" data-open="' + esc(",".join(f'{s["id"]}:{slot}' for s, slot in shown)) + '">\n'
            f'<div class="fig-head"><h2 id="h-strip">Median coverage on each program</h2><p class="fig-sub">{esc(STRIP_NOTE)}</p></div>\n'
            f'<ul class="tool-key" aria-label="Tools">{keys}</ul>\n'
            '<div class="strip-ctl js-only"><div class="strip-add"><label for="st-add">Add an entry</label>'
            f'<input class="namebox" id="st-add" type="text" list="st-list" placeholder="Tool, model or version" autocomplete="off" spellcheck="false" aria-describedby="st-note">'
            '<datalist id="st-list"></datalist></div>'
            '<button class="reset" id="st-reset" type="button" hidden>Reset</button>'
            f'<div class="findbox" id="st-findbox"{"" if many else " hidden"}><label for="st-find">Find a program</label>'
            '<input class="namebox" id="st-find" type="search" autocomplete="off" spellcheck="false"></div>'
            '<p class="strip-note" id="st-note"></p></div>\n'
            '<div class="strip-wrap"><table class="strip"><caption class="sr">Median final branch coverage of each entry on each program, with the lowest and highest run</caption>'
            f'<thead><tr><th scope="col"><span class="sr">Program</span></th><th scope="col"><span class="sr">Median final branch coverage, 0 to 100 percent</span>'
            f'<div class="axis" aria-hidden="true">{axis}</div></th></tr></thead><tbody id="st-rows">{rows}</tbody></table></div>\n'
            f'<div class="strip-pager" id="st-pager"{"" if many else " hidden"}>{pager}'
            '<span class="js-only"><button class="btn" id="st-prev" type="button" aria-label="Previous programs" disabled>Previous</button><button class="btn" id="st-next" type="button" aria-label="Next programs">Next</button></span></div>\n'
            f'<p class="tkey" id="st-ring"{"" if two else " hidden"}>{esc(RING_NOTE)}</p>\n'
            '</section>\n')


def hero_figure(ctx: Ctx) -> str:
    """The branch map of one program, drawn by the build as markup: the page shows it complete without a script, and with one it fills file by file once. The box
    beside the title names another program (a script finds it in programs.json, which holds the script of each map) and draws it with the same markup."""
    pid = hero_first(ctx)
    doc = ctx.extras["maps"][pid]
    hero = herodata.hero(doc)
    return ('<figure class="fig hm" id="map" data-program="' + esc(pid) + f'" data-bm="{ctx.asset("assets/branchmap.js")}">\n'
            '<div class="fig-head"><h2 id="hm-t">Branch map of <span id="hm-name">' + esc(doc["name"]) + '</span></h2>'
            f'<p class="fig-sub" id="hm-count">{esc(hero["head"])}</p>'
            f'<div class="hm-ctl js-only"><label for="hm-sel">Program</label><input class="namebox" id="hm-sel" type="text" list="hm-list" value="{esc(doc["name"])}" '
            'autocomplete="off" spellcheck="false" aria-controls="hm-stage"><datalist id="hm-list"></datalist></div></div>\n'
            '<div class="hm-stage" id="hm-stage">' + herodata.stage(hero, doc) + '</div>\n'
            f'<div class="hm-lg" id="hm-lg">{hero["legend"]}</div>\n'
            f'<figcaption class="hm-cap"><p id="hm-cap">{hero["caption"]}</p>'
            f'<p><a id="hm-open" href="{ctx.prog(pid)}#map">Open the page of <span id="hm-open-name">{esc(doc["name"])}</span></a></p></figcaption>\n</figure>\n')


def flow_figure() -> str:
    items = [
        ("Test cases in", "A tool hands in the test cases that its runs generated."),
        ("One pinned replay", "One gcov build of each program, pinned, replays the test cases."),
        ("Branch sets out", "Each run leaves the set of branches it reached."),
    ]
    lis = "".join(f'<li><h3>{esc(a)}</h3><p>{esc(b)}</p></li>' for a, b in items)
    return ('<section class="fig flow" aria-labelledby="h-flow">\n<div class="fig-head"><h2 id="h-flow">How a number is made</h2></div>\n'
            f'<ol class="flow-list">{lis}</ol>\n</section>\n')


def task_list(ctx: Ctx) -> str:
    items = [
        ("Read the results", ctx.results, "Median coverage of every tool on every program, as a table.", ' data-results'),
        ("Compare two tools", ctx.page("compare.html"), "Two tools side by side on the programs both ran on.", ""),
        ("Submit a tool", ctx.page("contribute.html") + "#submit", "For authors of a test generator who want it measured beside these.", ""),
        ("See what changed", ctx.page("releases.html"), "What is new, and what the data was measured with.", ""),
    ]
    lis = "".join(f'<li><a href="{h}"{x}>{a}</a><p>{b}</p></li>' for a, h, b, x in items)
    return f'<nav class="tasks" aria-label="Tasks"><h2 class="sr">Tasks</h2><ul>{lis}</ul></nav>\n'


def home_page(ctx: Ctx) -> str:
    """The front page: the heading and the line that says when the data last changed, one real branch map, the strip of every program, how a number is
    made, and where to go next. Every count on the page is computed from the release at build time."""
    m, f = ctx.model, ctx.facts
    body = (f'<div class="home" data-src="data/{strip.data_folder(m)}/">\n<header class="home-head col">\n'
            f'<h1 class="home-title">{esc(HOME_TITLE)}</h1>\n'
            + release_line(ctx) + '\n</header>\n'
            + hero_figure(ctx) + strip_figure(ctx) + flow_figure() + task_list(ctx) + '</div>')
    # The sentence for search engines and link previews is the "description" of site.json.
    home_desc = ctx.cfg.get("description") or (
        "Branch coverage of test generators on open-source programs, every run replayed the same way.")
    return page(ctx, key="home", title=title_of(ctx, HOME_TITLE), active="",
                desc=home_desc,
                body=body, extra_styles=["assets/home.css", "assets/popup.css"], early_scripts=["assets/entries.js"], extra_scripts=["assets/home.js"])


# ---- Results ---------------------------------------------------------------------------------------------------

def study_blurb(study: str) -> str:
    """How a study is named in a caption: 'the main group'."""
    return f"the {study} group"


def results_columns(m: Model, g: str, versions: str = "latest") -> list[tuple[dict, bool]]:
    """The columns of the table of study g as (entry, is a reference). The ablation and control tables also carry the default study's columns of the tools
    they are read against, as the chart of the program page does. versions is "latest" (the default entries) or "all" (every entry, an older one beside its tool)."""
    return [(c["s"], c["ref"]) for c in m.study_columns(g, versions)]


def release_ref(ctx: Ctx) -> str:
    """The tag that links to files of the results repository name (site.json release_ref); the moving ref HEAD where none is set."""
    return ctx.cfg.get("release_ref") or "HEAD"


def results_file(ctx: Ctx, path: str) -> str:
    """A file of the results release, named where it lives: a link to it once the repository has an address in site.json, its name in code before that.
    The site hosts no data files (the repository and its archived release do)."""
    return repo_file(ctx.cfg.get("results_repo_url", ""), path, release_ref(ctx)) + " in the results repository"


def band_name(fam: str, ref: bool = False) -> str:
    """The name of a family band over the columns of Results. A band of main-group tools shown beside an ablation or control group, to read it against, says so."""
    return FAMILY[fam] + (" (main)" if ref else "")


def pool_text(doc: dict) -> str:
    """The tools behind a program's share of unreached branches: the main-group tools that have runs on it."""
    n = len(doc["systems"])
    return f"{n} {plural(n, 'tool', 'tools')}"


def version_html(s: dict) -> str:
    """The version of an entry as the free text it is, broken after a plus sign so that a hash does not widen a narrow column."""
    return esc(s["version"]).replace("+", "+<wbr>")


def cell_state(m: Model, x: dict, p: dict) -> str:
    """What a table cell of entry x on program p holds: "run" (it has runs), "not-in-release" (the entry first appears in a later release than this one, so
    nothing is recorded for it here), "no-track" (a fixed-track entry on a program without a fixed track) or "no-run" (the entry has no run on this program).
    A cell is never filled from another entry, whether of the same tool or not."""
    if not x["in_release"]:
        return "not-in-release"
    if (x["id"], p["id"]) in m.fin:
        return "run"
    return "no-track" if x["track"] == "fixed" and p["id"] not in m.fixed_programs else "no-run"


def missing_cell(state: str, attrs: str = "", cls: str = "") -> str:
    """The cell of a state other than "run", on Results (attrs: its sort attributes) and the tool page. The words are read out; the mark is the same for the cells that are
    missing for the same reason and differs between the reasons: a dash for no run, n/a for no fixed track, a dot for an entry that is not in this release."""
    mark, why, tip = {
        "not-in-release": ("·", "not in this release", "This entry is not in this release"),
        "no-track": ("n/a", "no fixed track", "This program has no fixed track"),
        "no-run": ("–", "no runs", ""),
    }[state]
    kind = {"not-in-release": " nir", "no-track": " na", "no-run": ""}[state]
    title = f' title="{tip}"' if tip else ""
    return (f'<td class="cell r miss{kind}{cls}"{attrs}{title} data-state="{state}">'
            f'<span class="v" aria-hidden="true">{mark}</span><span class="sr">{why}</span></td>')


def column_head(ci: int, x: dict, ncols: int, versions: str) -> str:
    """The head of one column of Results: the name of the entry in two lines, and the track. The version is read out (and is the tooltip of the head) in the default
    view, where a line more would cost the sideways phone a row of the table, and is written under the name with all versions, with the date of the submission and,
    for an entry that is not current, its status."""
    trk = (f'<span class="th-trk">{x["track"]} <span class="trk-last">{{ind}}track</span></span>' if ncols > 8
           else f'<span class="th-trk">{{ind}}{x["track"]} track</span>')
    first, rest = name_lines(x["label"])
    extra = f'<span class="th-sub">{nb(rest)}</span>'
    if versions != "all":
        extra += f'<span class="sr">, version {esc(x["version"])}</span>'
    else:
        extra += f'<span class="th-sub th-ver">{version_html(x)}</span><span class="th-sub th-date">{esc(x["submitted"] or "date unknown")}</span>'
        if x["status"] != "current":
            extra += f'<span class="th-sub th-status">{esc(x["status"])}</span>'
    return sort_head(f"c{ci}", nb(first), extra + trk, right=True)


def results_table(ctx: Ctx, g: str, versions: str = "latest") -> tuple[str, int, int, int]:
    m: Model = ctx.model
    cols_ref = results_columns(m, g, versions)
    cols = [x for x, _ in cols_ref]
    rows = m.programs_with_runs([x for x, ref in cols_ref if not ref])
    maps = ctx.extras["maps"]
    bands: list[list] = []
    for x, ref in cols_ref:
        if bands and bands[-1][0] == (x["family"], ref):
            bands[-1][1] += 1
        else:
            bands.append([(x["family"], ref), 1])
    starts, at = set(), 0
    for _fam, n in bands:
        starts.add(at)
        at += n
    h = (f'<table class="tbl res" data-unit="pct" data-sortable="1"><caption class="sr">Median final branch coverage by program and tool, {study_blurb(g)}'
         f'{", all versions" if versions == "all" else ""}</caption><thead><tr>'
         + sort_th("name", "Program", "sticky").replace('<th class="sticky"', '<th class="sticky" rowspan="2"').replace("</th>", '<span class="th-sub mob-only duo"><span>branches</span><span>unreached</span></span></th>')
         + '<th class="r col-total" scope="col" aria-sort="none" rowspan="2">'
         + sort_head("total", "Total branches", '<span class="th-sub">{ind}unreached (tools that ran)</span>', right=True) + "</th>")
    for (fam, ref), n in bands:
        h += f'<th class="band bstart" colspan="{n}" scope="colgroup">{esc(band_name(fam, ref))}</th>'
    h += "</tr><tr>"
    for ci, (x, ref) in enumerate(cols_ref):
        h += (f'<th class="r cell{" bstart" if ci in starts else ""}{"" if x["status"] == "current" else " old"}" scope="col" aria-sort="none"'
              f' title="Version {esc(x["version"])}{", submitted " + esc(x["submitted"]) if x["submitted"] else ""}">'
              + column_head(ci, x, len(cols), versions) + "</th>")
    h += "</tr></thead><tbody>"
    for pi, p in enumerate(rows):
        doc = maps[p["id"]]
        unre = p1(100 * doc["summary"]["none"] / p["total"])
        pool = pool_text(doc)
        h += (f'<tr data-i="{pi}" data-name="{esc(p["name"].lower())}" data-total="{p["total"]}">'
              f'<th class="sticky" scope="row"><a class="pname" href="{ctx.prog(p["id"])}">{esc(p["name"])}</a>'
              f'<span class="sub mono mob-only duo"><span aria-hidden="true">{fmt(p["total"])}</span><span aria-hidden="true">{unre}%</span><span class="sr">{fmt(p["total"])} branches, {unre}% unreached by {pool}</span></span></th>'
              f'<td class="num r muted col-total" data-v="{p["total"]}"><span class="v">{fmt(p["total"])}</span><span class="sub">{unre}% ({pool})</span></td>')
        for ci, x in enumerate(cols):
            bs = " bstart" if ci in starts else ""
            state = cell_state(m, x, p)
            f = m.fin.get((x["id"], p["id"]))
            if state != "run":
                h += missing_cell(state, f' data-c="c{ci}" data-pct="" data-med=""', bs)
            else:
                tip = f"{fmt(f['med'])} of {fmt(f['total'])} branches, {f['n']} {plural(f['n'], 'run', 'runs')}"
                h += (f'<td class="cell r{bs}" data-c="c{ci}" data-pct="{f["pct"]:.2f}" data-med="{f["med"]}" data-lo="{f["min"]}" data-hi="{f["max"]}" title="{esc(tip)}">'
                      f'<span class="v u-pct">{p1(f["pct"])}%</span><span class="v u-n">{fmt(f["med"])}</span>'
                      f'<span class="sr">, {f["n"]} {plural(f["n"], "run", "runs")}</span>'
                      f'<span class="mb u-bar"><i style="width:{f["pct"]:.1f}%"></i></span></td>')
        h += "</tr>"
    h += "</tbody></table>"
    return h, len(rows), len(cols), len(m.programs) - len(rows)


def versions_control(ctx: Ctx, versions: str) -> str:
    """The choice between the latest entries and all of them, as two plain links (two pages, so it works without scripts)."""
    def link(name, label, href):
        cur = ' aria-current="page"' if versions == name else ""
        return f'<a href="{href}"{cur}>{label}</a>'
    return ('<div class="ctl"><span class="k" id="lbl-v">Versions</span><nav class="seg seg-links" aria-labelledby="lbl-v">'
            + link("latest", "Latest", ctx.results) + link("all", "All", ctx.page("all-versions.html")) + "</nav></div>")


VERSIONS_KEY = {
    "latest": "Latest: the current entries of each tool. All adds the superseded and withdrawn ones.",
    "all": "All: every entry, an older one beside its tool, dated by its submission.",
}


def results_page(ctx: Ctx, versions: str = "latest") -> str:
    """Results: the table of the latest entries (with the switches of version, group and unit). With versions="all" the page of every entry. The page of the
    latest entries also opens on the entries that the front page has on show, when its address names them (home.js writes it; app.js reads it)."""
    m, f = ctx.model, ctx.facts
    latest = versions == "latest"
    panels = []
    for st in m.studies:
        g = st["id"]
        table, nrows, ncols, hidden = results_table(ctx, g, versions)
        hid = "" if g == m.primary else " hidden"
        panels.append(
            f'<div class="gpanel" id="g-{st["slug"]}" data-group="{st["slug"]}" data-rows="{nrows}" data-cols="{ncols}"{hid}><h2 class="gp-title sr">{esc(st["title"])} group</h2>'
            + tbl_wrap(table, f"Median final branch coverage by program and tool, {study_blurb(g)}", "stickyhead") + "</div>")
    grp = "".join(
        f'<label><input type="radio" name="rgroup" value="{st["slug"]}"{" checked" if st["id"] == m.primary else ""} aria-controls="g-{st["slug"]}"><span>{esc(st["title"])}</span></label>'
        for st in m.studies)
    body = (f'<div class="page-head">\n<h1>Results{", all versions" if versions == "all" else ""}</h1>\n'
            + release_line(ctx, f'<span>{fmt(f["entries"])} entries, {f["programs"]} programs, {fmt(f["runs"])} runs</span>') + "\n"
            '<p class="lede">Median final branch coverage of test cases replayed on one pinned gcov build per program.</p>\n</div>\n'
            + f'<div class="controls">\n{versions_control(ctx, versions)}\n'
            f'<div class="ctl js-only"><span class="k" id="lbl-g">Group</span><div class="seg seg-scroll fade-x" role="radiogroup" aria-labelledby="lbl-g">{grp}</div></div>\n'
            '<div class="ctl js-only"><span class="k" id="lbl-u">Show</span><div class="seg seg-scroll fade-x" role="radiogroup" aria-labelledby="lbl-u">'
            '<label><input type="radio" name="unit" value="pct" checked><span>Percent</span></label>'
            '<label><input type="radio" name="unit" value="n"><span>Count</span></label>'
            '<label><input type="radio" name="unit" value="spread"><span>Median (min to max)</span></label></div></div>\n'
            f'<span class="ctl">{terms(ctx, "results")}</span><span class="grow"></span><span class="ctl">{results_file(ctx, "derived/finals.csv")}</span>\n</div>\n'
            f'<p class="key-line tkey">{VERSIONS_KEY[versions]}</p>\n'
            + "\n".join(panels))
    return page(ctx, key="results", title=title_of(ctx, "Results, all versions" if versions == "all" else "Results"), active="results",
                desc=(f"Median final branch coverage of every version of every tool on {f['programs']} programs, every run replayed the same way." if versions == "all"
                      else f"Median final branch coverage of tools on {f['programs']} programs, every run replayed the same way."), body=body,
                main_attrs=f' data-src="data/{strip.data_folder(m)}/"' if latest else "", early_scripts=["assets/entries.js"] if latest else None)


# ---- Tools -----------------------------------------------------------------------------------------------------

def tool_file(tid: str) -> str:
    """The page of a tool: its id in an address-safe form."""
    return "tool-" + re.sub(r"[^a-z0-9._-]+", "-", tid.lower()).strip("-") + ".html"


def status_tag(s: dict) -> str:
    """The mark of an entry that is new or not current (superseded or withdrawn), with the entry that replaced it where there is one."""
    if s["status"] == "current":
        return ' <span class="tag status" title="Added recently">new</span>' if s.get("new") else ""
    by = f' title="Superseded by {esc(", ".join(s["superseded_by"]))}"' if s["superseded_by"] else ""
    return f' <span class="tag status"{by}>{esc(s["status"])}</span>'


def version_line(m: Model, s: dict) -> str:
    """What identifies an entry beyond its name: version, submission date and status, and the entry it replaces or was replaced by."""
    bits = [f"Version {s['version']}"]
    if s["submitted"]:
        bits.append(f"submitted {s['submitted']}")
    bits.append(s["status"])
    if s["supersedes"] and s["supersedes"] in m.S:
        bits.append(f"supersedes {m.S[s['supersedes']]['label']}")
    if s["superseded_by"]:
        bits.append("superseded by " + name_list([m.S[x]["label"] for x in s["superseded_by"]]))
    return ", ".join(bits) + "."


def partner_of(m: Model, sid: str) -> str:
    """The tool that a row of Tools offers to compare with: another tool of the same family (the main group first) that shares the most programs with
    it, otherwise any other tool that does."""
    me = m.S[sid]
    mine = set(m.fin_by_sys.get(sid, {}))

    def key(x):
        return (-(x["family"] == me["family"]), -(x["study"] == m.primary), -len(mine & set(m.fin_by_sys.get(x["id"], {}))), x["order"])
    cand = [x for x in m.systems if x["id"] != sid and mine & set(m.fin_by_sys.get(x["id"], {}))]
    return sorted(cand, key=key)[0]["id"] if cand else sid


def tools_table(ctx: Ctx) -> str:
    m: Model = ctx.model
    h = ('<table class="tbl tools recs" data-sortable="1"><caption class="sr">Every tool</caption><thead><tr>'
         + sort_th("name", "Tool", "sticky") + sort_th("family", "Family")
         + '<th scope="col">Model</th><th scope="col">Version</th>'
         + sort_th("cores", "Cores", "r") + '<th class="r" scope="col">Budget</th><th scope="col">Track</th>'
         + sort_th("group", "Group") + sort_th("programs", "Programs", "r") + "</tr></thead><tbody>")
    dash = '<span class="muted">–</span>'
    for s in m.systems:
        np_ = len(m.fin_by_sys.get(s["id"], {}))
        main = s["study"] == m.primary
        h += (f'<tr class="trow" id="{esc(s["id"])}" data-id="{esc(s["id"])}" data-name="{esc(s["label"].lower())}" data-family="{FAMILY_ORDER.index(s["family"])}" '
              f'data-cores="{"" if s["cores"] is None else s["cores"]}" data-group="{[x["id"] for x in m.studies].index(s["study"])}" data-programs="{np_}" data-g="{m.ST[s["study"]]["slug"]}">')
        cores = s["cores"] if s["cores"] is not None else None
        backend = esc(s["backend_name"])
        bk = f'<span class="sub bk">{backend}</span>' if backend else ""
        h += (f'<th class="sticky wrap" scope="row" aria-label="{esc(s["label"])}" aria-describedby="desc-{esc(s["id"])}"><div class="toolcell"><button class="rowbtn js-only" type="button" aria-expanded="false" aria-controls="d-{esc(s["id"])}" '
              f'aria-label="Results of {esc(s["label"])}">{ICON["chev"]}</button><span class="gap"></span>{line_key(s, neutral=not main)}'
              f'<span class="t"><a class="pname" href="#{esc(s["id"])}">{esc(s["label"])}</a>{status_tag(s)}'
              f'<span class="sub desc" id="desc-{esc(s["id"])}" aria-hidden="true">{esc(s["summary"])}</span></span></div></th>')
        h += (f'<td data-label="Family">{esc(FAMILY[s["family"]])}{bk}</td>'
              f'<td data-label="Model">{esc(s["model_name"]) if s["model_name"] else dash}</td>'
              f'<td class="ver" data-label="Version">{version_html(s)}</td>'
              f'<td class="num r" data-label="Cores">{cores if cores is not None else dash}</td>'
              f'<td class="num r" data-label="Budget">{"≤ " + hours(s["budget"]) if s["budget"] else dash}</td><td data-label="Track">{esc(s["track"])}</td>'
              f'<td data-label="Group">{esc(m.ST[s["study"]]["title"])}</td>'
              f'<td class="num r" data-label="Programs"><a class="plink" href="#{esc(s["id"])}" aria-label="{np_} {plural(np_, "program", "programs")} of {esc(s["label"])}">{np_}</a></td></tr>')
        h += f'<tr class="detail" id="d-{esc(s["id"])}" data-for="{esc(s["id"])}" data-g="{m.ST[s["study"]]["slug"]}" hidden><td colspan="9">{tool_detail(ctx, s)}</td></tr>'
    return h + "</tbody></table>"


def name_list(names: list[str]) -> str:
    """A list in prose: commas and a last "and"; semicolons when a name holds a comma itself ("KLEE, fixed options")."""
    if len(names) == 1:
        return names[0]
    sep = "; " if any("," in n for n in names) else ", "
    return sep.join(names[:-1]) + " and " + names[-1]


def tool_detail(ctx: Ctx, s: dict) -> str:
    m: Model = ctx.model
    main = s["study"] == m.primary
    h = f'<div class="detail-in"><div class="txt"><p>{esc(s["desc"])}</p>'
    refs = []      # a citation ends without its full stop, so that "; " and "." never meet
    if s["ref"]["citation"]:
        c0 = s["ref"]["citation"].rstrip(".")
        u0 = http_url(s["ref"]["url"])
        refs.append(f'<a href="{esc(u0)}" rel="noopener">{esc(c0)}</a>' if u0 else esc(c0))
    for r in s["see"]:
        c1 = r["citation"].split(". ")[0].rstrip(".")
        u1 = http_url(r["url"])
        refs.append(f'<a href="{esc(u1)}" rel="noopener">{esc(c1)}</a>' if u1 else esc(r["citation"].rstrip(".")))
    if refs:
        mu = http_url(s["model_url"])
        mdl = (f'; model: <a href="{esc(mu)}" rel="noopener">{esc(s["model_name"])}</a>' if mu
               else (f'; model: {esc(s["model_name"])}' if s["model_url"] else ""))
        h += f'<p class="muted">Citation: {"; ".join(refs)}{mdl}.</p>'
    partner = partner_of(m, s["id"])
    cmp_link = (f'<a href="{ctx.page("compare.html")}#{esc(s["id"])}_vs_{esc(partner)}">Compare with {esc(m.S[partner]["label"])}</a>' if partner != s["id"] else "")
    h += f'<p class="muted">{esc(version_line(m, s))}</p>'
    h += f'<p class="muted">System id in the CSV files: <code>{esc(s["id"])}</code></p>'
    more = [cmp_link] if cmp_link else []
    if m.tools_csv:
        more.append(f'<a href="{ctx.page(tool_file(s["tool"]))}">All versions of {esc(s["tool_name"])}</a>')
    h += ('<p class="rowlinks">' + "".join(more) + "</p></div>" if more else "</div>")
    rows = [p for p in m.programs if (s["id"], p["id"]) in m.fin]
    h += (f'<div class="tbl-wrap" tabindex="0" role="region" aria-label="Results of {esc(s["label"])} by program"><table class="tbl fit msc recs">'
          f'<caption class="sr">Results of {esc(s["label"])} by program</caption><thead><tr>'
          '<th scope="col" class="sticky">Program</th><th class="r" scope="col">Runs</th><th class="r" scope="col">Median</th><th class="r" scope="col">Min to max</th>'
          '<th scope="col">Share (median)</th><th scope="col">Median curve</th><th class="r" scope="col">Output tokens</th></tr></thead><tbody>')
    for p in rows:
        f = m.fin[(s["id"], p["id"])]
        mc = m.median_curve(p["id"], s["id"])
        if f["tok_med"] is not None:
            tok = fmt(f["tok_med"])
        elif s["model_name"]:
            tok = '<span class="muted" title="The release holds no token count for these runs">not reported</span>'
        else:
            tok = '<span class="muted" title="The tool uses no model">not applicable</span>'
        h += (f'<tr><th class="sticky" scope="row"><a class="pname" href="{ctx.prog(p["id"])}">{esc(p["name"])}</a></th>'
              f'<td class="num r" data-label="Runs">{f["n"]}{dag(runs_tip(f["n"])) if f["inc"] else ""}</td><td class="num r" data-label="Median">{fmt(f["med"])}</td>'
              f'<td class="num r muted" data-label="Min to max">{fmt(f["min"])}–{fmt(f["max"])}</td>'
              f'<td class="share" data-label="Share (median)"><span class="v">{p1(f["pct"])}%</span><span class="mb"><i style="width:{f["pct"]:.1f}%"></i></span></td>'
              f'<td data-label="Median curve">{sparkline(mc, s, "Median coverage over time of " + s["label"] + " on " + p["name"], neutral=not main, ymax=p["total"], hidden=True)}</td>'
              f'<td class="num r" data-label="Output tokens">{tok}</td></tr>')
    return h + "</tbody></table></div></div>"


def runs_tip(n: int) -> str:
    """Tooltip of a dagger on a run count."""
    return f"Fewer than three runs ({n})"


def tool_chips(ctx: Ctx) -> str:
    """A link to the page of every tool, with the number of its entries."""
    m: Model = ctx.model
    if not m.tools_csv:
        return ""
    links = "".join(f'<a href="{ctx.page(tool_file(t["id"]))}">{esc(t["name"])} <small>{sum(1 for s in m.systems if s["tool"] == t["id"])}</small></a>' for t in m.tools)
    return f'<nav class="tool-links" aria-label="Pages of the tools">{links}</nav>'


def tools_page(ctx: Ctx) -> str:
    m, f = ctx.model, ctx.facts
    seg = "".join(
        f'<label><input type="radio" name="tgroup" value="{slug}"{" checked" if slug == "all" else ""}><span>{esc(title)} <span class="muted">{n}</span></span></label>'
        for slug, title, n in [("all", "All", f["entries"])] + [(st["slug"], st["title"], len(m.study_entries(st["id"]))) for st in m.studies])
    body = (f'<div class="page-head"><h1>Tools</h1>\n{release_line(ctx)}\n<p class="lede lede-sm">A row expands to its results on each program it ran.</p></div>\n'
            f'<div class="controls"><div class="ctl js-only"><span class="k" id="lbl-t">Group</span><div class="seg seg-scroll fade-x" role="radiogroup" aria-labelledby="lbl-t">{seg}</div></div>'
            f'<span class="ctl">{terms(ctx, "tools")}</span><span class="grow"></span><span class="ctl">{results_file(ctx, "runs.csv")}</span></div>\n'
            + tool_chips(ctx) + "\n"
            + tbl_wrap(tools_table(ctx), "Every entry in the release", "stickyhead recsframe").replace('class="tbl-wrap', 'id="tools-wrap" class="tbl-wrap', 1))
    return page(ctx, key="tools", title=title_of(ctx, "Tools"), active="tools",
                desc="Every entry in the release with its tool, version, family, model, budget and track.", body=body)


# ---- Program ---------------------------------------------------------------------------------------------------

def legend_name(s: dict) -> str:
    """The name of an entry in a legend row: the first line of its name, and the rest, with its status where it is not current, in small type."""
    first, rest = name_lines(s["label"])
    tail = ", ".join(x for x in (rest, "" if s["status"] == "current" else s["status"]) if x)
    return esc(first) + (f" <small>{esc(tail)}</small>" if tail else "")


def lines_status(n: int, total: int) -> str:
    """The status line over the legend: how many lines are on of how many there are."""
    return f"Showing {n} of {total}"


def legend_view(ctx: Ctx, pid: str, view: str) -> str:
    """The legend of one chart view: a row for every tool with a curve (the swatch is the switch). Its header says how many lines are shown of how many there are."""
    m: Model = ctx.model
    vis = m.default_visible(pid, view)
    hid = f"lg-h-{m.ST[view]['slug']}"
    total = sum(1 for s in m.view_members(view) if m.has_curve(pid, s["id"]))
    h = f'<div class="lg-h" id="{hid}" data-lg-head role="status" aria-live="polite">{lines_status(len(vis), total)}</div>'
    for s in m.view_members(view):
        if not m.has_curve(pid, s["id"]):
            continue
        f = m.fin.get((s["id"], pid))
        on = s["id"] in vis
        h += (f'<label class="lgrow{"" if on else " off"}"><input type="checkbox" class="lgcb" data-sys="{esc(s["id"])}" aria-describedby="{hid}"'
              f'{" checked" if on else ""}>{line_key(s)}<span class="lt">{legend_name(s)}</span><span class="lv">{fmt(f["med"])}</span></label>')
    return h


def family_chips(ctx: Ctx, pid: str) -> str:
    m: Model = ctx.model
    vis = m.default_visible(pid, m.primary)
    mem = [s for s in m.view_members(m.primary) if m.has_curve(pid, s["id"])]
    h = ""
    for fam in FAMILY_ORDER:
        ids = [s["id"] for s in mem if s["family"] == fam]
        if not ids:
            continue
        k = sum(1 for i in ids if i in vis)
        state = "true" if k == len(ids) else ("mixed" if k else "false")
        count = f"{k} of {len(ids)} on" if state == "mixed" else str(len(ids))
        h += (f'<button type="button" class="chip" data-fam="{fam}" data-ids="{" ".join(ids)}" aria-pressed="{state}"><span class="cm" aria-hidden="true"></span>'
              f'{esc(FAMILY[fam])} <small>{count}</small></button>')
    return h


def final_table(ctx: Ctx, pid: str) -> str:
    """Final coverage of every tool on a program, in groups. Its sparklines share one scale (0 to the largest curve value of the table), so a short
    curve looks short. On a phone it keeps three columns (tool, median, share): the cells of class opt are hidden below 720 px."""
    m: Model = ctx.model
    prog = m.P[pid]
    ymax = max((max(mc) for s in m.systems if (s["id"], pid) in m.fin for mc in [m.median_curve(pid, s["id"])] if mc), default=None)
    h = (f'<table class="tbl msc cmp3" data-sortable="grouped"><caption class="sr">Final coverage of every tool on {esc(prog["name"])}</caption><thead><tr>'
         '<th class="sticky" scope="col">Tool</th>' + sort_th("med", "Median", "r") + '<th class="r opt opt-m" scope="col">Min to max</th>' + sort_th("pct", "Share (median)")
         + sort_th("n", "Runs", "r opt") + '<th class="opt opt-m" scope="col">Median curve</th>'
         '<th class="r opt" scope="col" title="Model output tokens of the whole campaign, reasoning included, median per run, as self-reported in the release">Output tokens</th></tr></thead><tbody>')
    for st in m.studies:
        g = st["slug"]
        # the entries of the study in the order of its columns (the default ones first, an older one after its tool), without the columns it is read against
        lst = [c["s"] for c in m.study_columns(st["id"], "all") if not c["ref"] and (c["s"]["id"], pid) in m.fin]
        if not lst:
            continue
        open_ = st["id"] == m.primary
        gl = f'{esc(st["title"])} group, {len(lst)} {plural(len(lst), "tool", "tools")}'
        h += (f'<tr class="grp" data-g="{g}"><th scope="rowgroup" colspan="7"><span class="grp-static">{gl}</span>'
              f'<button type="button" aria-expanded="{str(open_).lower()}" data-grp="{g}">{ICON["chev"]}{gl}</button></th></tr>')
        for s in lst:
            f = m.fin[(s["id"], pid)]
            mc = m.median_curve(pid, s["id"])
            cores = f", {words(s['cores'])} {'core' if s['cores'] == 1 else 'cores'}" if s["cores"] else ""
            fixed_flag = ' <span class="muted mob-flag">fixed track</span>' if s["track"] == "fixed" else ""      # a phone has no Track column
            co = (f' <span class="muted" title="Final count and curve published earlier; no branch set held">({"all" if f["count_only"] == f["n"] else f["count_only"]} count only)</span>' if f["count_only"] else "")
            if f["tok_med"] is not None:
                tok = fmt(f["tok_med"]) + (f' <span class="muted" title="Reported for {f["tok_n"]} of {f["n"]} runs">({f["tok_n"]}/{f["n"]})</span>' if f["tok_n"] < f["n"] else "")
            elif s["model_name"]:
                tok = '<span class="muted" title="The release holds no token count for these runs">not reported</span>'
            else:
                tok = '<span class="muted" title="The tool uses no model">not applicable</span>'
            flag = dag(runs_tip(f["n"])) if f["inc"] else ""
            h += (f'<tr data-g="{g}" data-med="{f["med"]}" data-pct="{f["pct"]:.2f}" data-n="{f["n"]}"{"" if open_ else " hidden"}>'
                  f'<th class="sticky wrap" scope="row"><div class="toolcell">{line_key(s)}<span class="t"><a class="pname" href="{ctx.page("tools.html")}#{esc(s["id"])}">{esc(s["label"])}</a>'
                  f'{fixed_flag}{status_tag(s)}'
                  f'<span class="sub opt">{esc(FAMILY[s["family"]].lower())}, {esc(s["track"])} track{cores}, version {version_html(s)}</span></span></div></th>'
                  f'<td class="num r" data-label="Median">{fmt(f["med"])}<span class="mob-flag">{flag}</span></td><td class="num r muted opt opt-m" data-label="Min to max">{fmt(f["min"])}–{fmt(f["max"])}</td>'
                  f'<td class="share" data-label="Share (median)"><span class="v">{p1(f["pct"])}%</span><span class="mb"><i style="width:{f["pct"]:.1f}%"></i></span></td>'
                  f'<td class="num r opt" data-label="Runs">{f["n"]}{flag}{co}</td>'
                  f'<td class="opt opt-m" data-label="Median curve">{sparkline(mc, s, "Median coverage over time of " + s["label"] + " on " + prog["name"], ymax=ymax, hidden=True)}</td>'
                  f'<td class="num r opt" data-label="Output tokens">{tok}</td></tr>')
    return h + "</tbody></table>"


def one_tool_table(ctx: Ctx, pid: str) -> str:
    """The table of the section: for each main-group tool with runs on the program, the branches it reaches (over all its runs) and the branches only it reaches. On a
    phone the table keeps the tool, the branches it reaches and the branches only it reaches."""
    m: Model = ctx.model
    prog = m.P[pid]
    doc = ctx.extras["maps"][pid]
    sm, ids, runs, total = doc["summary"], doc["systems"], doc["runs"], prog["total"]
    h = (f'<div class="tbl-wrap" tabindex="0" role="region" aria-label="Branches reached by one tool only, on {esc(prog["name"])}"><table class="tbl fit msc cmp3">'
         f'<caption class="sr">Branches reached by each main-group tool and by it only, on {esc(prog["name"])}</caption><thead><tr>'
         '<th class="sticky" scope="col">Tool</th><th class="r opt" scope="col">Runs in union</th><th class="r" scope="col">Branches reached</th>'
         '<th class="opt" scope="col">Share (union)</th><th class="r" scope="col">Reached by this tool only</th></tr></thead><tbody>')
    for i, sid in enumerate(ids):
        s = m.S[sid]
        r, u = sm["reached"][sid], sm["unique"][sid]
        flag = dag(runs_tip(runs[i])) if runs[i] < 3 else ""
        h += (f'<tr><th class="sticky wrap" scope="row"><div class="toolcell">{line_key(s)}<span class="t">{esc(s["label"])}</span></div></th>'
              f'<td class="num r opt" data-label="Runs in union">{runs[i]}{flag}</td><td class="num r" data-label="Branches reached">{fmt(r)}<span class="mob-flag">{flag}</span>'
              f'<span class="mb mob-bar"><i style="width:{100 * r / total:.1f}%"></i></span></td>'
              f'<td class="share opt" data-label="Share (union)"><span class="v">{p1(100 * r / total)}%</span><span class="mb"><i style="width:{100 * r / total:.1f}%"></i></span></td>'
              f'<td class="num r{"" if u else " zero"}" data-label="Reached by this tool only">{fmt(u)}</td></tr>')
    return h + "</tbody></table></div>"


def sanitiser_block(ctx: Ctx, pid: str) -> str:
    """Sanitiser signature counts. Every main-group tool with runs on the program has a row; one that was not replayed says so."""
    m: Model = ctx.model
    prog = m.P[pid]
    sg = m.sigs.get(pid)
    if not sg:
        return f'<p class="muted">No tool has a sanitiser replay on {esc(prog["name"])}.</p>'
    order = [s for s in m.systems if s["id"] in sg or (s["study"] == m.primary and (s["id"], pid) in m.fin)]
    h = (f'<div class="tbl-wrap" tabindex="0" role="region" aria-label="Sanitiser signature counts on {esc(prog["name"])}"><table class="tbl fit msc recs">'
         f'<caption class="sr">Distinct sanitiser signatures of each tool on {esc(prog["name"])}</caption><thead><tr>'
         '<th class="sticky" scope="col">Tool</th><th class="r" scope="col">Runs replayed</th><th scope="col">AddressSanitizer<span class="th-sub">kind, signatures</span></th><th scope="col">UndefinedBehaviorSanitizer<span class="th-sub">kind, signatures</span></th></tr></thead><tbody>')
    for s in order:
        if s["id"] not in sg:
            nr = '<span class="muted">not replayed</span>'
            h += (f'<tr><th class="sticky wrap" scope="row"><div class="toolcell">{line_key(s)}<span class="t">{esc(s["label"])}</span></div></th>'
                  f'<td class="num r" data-label="Runs replayed"><span class="muted">–</span></td><td class="wrap stk" data-label="AddressSanitizer">{nr}</td>'
                  f'<td class="wrap stk" data-label="UndefinedBehaviorSanitizer">{nr}</td></tr>')
            continue
        rows = sg[s["id"]]
        runs = rows[0]["runs"]

        def cell(san):
            real = [x for x in rows if x["san"] == san and x["n"] > 0]
            if not real:
                return '<span class="muted">none found</span>'
            out = []
            for x in real:
                slug = kind_slug(x["kind"])
                tip = ' title="A crash that the sanitiser could not classify"' if slug == "unknown-crash" else ""
                name = f'<span class="kind mono"{tip}>{esc(slug)}</span>'
                out.append(f'<li>{name}<span class="cnt num" title="{x["n"]} {plural(x["n"], "signature", "signatures")}">{x["n"]}</span></li>')
            return '<ul class="kinds">' + "".join(out) + "</ul>"
        low = dag(runs_tip(runs)) if runs < 3 else ""
        h += (f'<tr><th class="sticky wrap" scope="row"><div class="toolcell">{line_key(s)}<span class="t">{esc(s["label"])}</span></div></th>'
              f'<td class="num r" data-label="Runs replayed">{runs}{low}</td><td class="wrap stk" data-label="AddressSanitizer">{cell("ASan")}</td>'
              f'<td class="wrap stk" data-label="UndefinedBehaviorSanitizer">{cell("UBSan")}</td></tr>')
    return h + "</tbody></table></div>"


def chart_data(ctx: Ctx, pid: str) -> dict:
    m: Model = ctx.model
    series = {}
    for s in m.systems:
        b = m.band(pid, s["id"])
        if b:
            series[s["id"]] = {"n": s["label"], "k": s["slot"], "d": s["dash"], "o": s["order"], "med": b["med"], "lo": b["lo"], "hi": b["hi"]}
    return {"p": pid, "name": m.P[pid]["name"], "t": m.checkpoints, "series": series, "primary": m.ST[m.primary]["slug"]}


def first_sentence(text: str) -> str:
    """A description's first sentence: it goes under the program name."""
    t = text.strip()
    mo = re.match(r"(.+?[.!?])(?:\s+|$)", t)
    return mo.group(1) if mo else t


def program_bar(ctx: Ctx, pid: str) -> str:
    m: Model = ctx.model
    i = [p["id"] for p in m.programs].index(pid)
    prev = m.programs[(i - 1) % len(m.programs)]
    nxt = m.programs[(i + 1) % len(m.programs)]
    opts = "".join(f'<option value="{esc(p["id"])}"{" selected" if p["id"] == pid else ""}>{esc(p["name"])}</option>' for p in m.programs)
    return ('<div class="subbar"><div class="subbar-in fade-x"><nav class="pnav" aria-label="Programs"><label class="sr" for="psel">Program</label>'
            f'<select id="psel" class="js-only">{opts}</select><button class="btn js-only" type="button" id="pgo" hidden>Open</button>'
            f'<span class="muted num" id="pbar-total">{fmt(m.P[pid]["total"])} branches</span>'
            f'<span class="pn"><a class="btn" id="pprev" href="{ctx.prog(prev["id"])}" rel="prev" aria-label="Previous program, {esc(prev["name"])}">Previous</a>'
            f'<a class="btn" id="pnext" href="{ctx.prog(nxt["id"])}" rel="next" aria-label="Next program, {esc(nxt["name"])}">Next</a></span></nav>'
            '<nav aria-label="On this page"><a href="#map" data-sec="map">Branch map</a><a href="#curves" data-sec="curves">Coverage over time</a>'
            '<a href="#final" data-sec="final">Final coverage</a><a href="#only" data-sec="only">Branches reached by one tool only</a><a href="#sanitisers" data-sec="sanitisers">Sanitiser findings</a></nav></div></div>\n')


# The card of the branch map reserves the height of the map before it is drawn, so that the page does not move. The map is taller or shorter at different widths, so
# there is one reserve for each band of widths (the custom property that site.css reads at that width): the largest height measured (scripts/mapheights.mjs) at
# the widths of the band, plus the padding of the card.
BANDS = {"--mhp": ("390",), "--mht": ("720", "768", "999"), "--mhl": ("1000", "1024", "1099"), "--mhd": ("1100", "1279"), "--mhw": ("1280", "1440")}
BAND_DEFAULT = {"--mhp": 860, "--mht": 860, "--mhl": 740, "--mhd": 700, "--mhw": 640}      # before the heights are measured


def map_reserve(heights: dict | None) -> str:
    out = []
    for prop, widths in BANDS.items():
        got = [heights[w] for w in widths if heights and w in heights]
        out.append(f"{prop}:{(max(got) + 34) if got else BAND_DEFAULT[prop]}px")
    return ";".join(out)


INPUT_WORDS = {"argv": "command-line arguments", "files": "files", "stdin": "standard input", "env": "environment"}


def program_page(ctx: Ctx, pid: str) -> str:
    m = ctx.model
    p = m.P[pid]
    doc = ctx.extras["maps"][pid]
    n_tools = len(m.fin_by_prog.get(pid, {}))
    n_main = len(doc["systems"])
    runs_p = [r for r in m.runs if r["p"] == pid]
    n_sets = sum(1 for r in runs_p if r["m"] != "published")
    fixed = "none agreed" if not p["fixed"] else ("standard input" if p["fixed"] == "stdin" else f"<code>{esc(p['fixed'])}</code>")
    mapH = map_reserve(m.map_heights.get(pid))
    vname = p["version"] if len(p["version"]) <= 16 else p["version"][:12]
    lede = first_sentence(p["desc"])
    unre = p1(100 * doc["summary"]["none"] / p["total"])
    inputs = ", ".join(INPUT_WORDS.get(x, x) for x in p["inputs"])
    h = (f'<div class="page-head" id="top"><div class="titleline"><h1>{esc(p["name"])}</h1><span class="muted mono" title="{esc(p["version"])}">{esc(vname)}</span>'
         f'<span class="grow"></span>{terms(ctx, "program")}</div>'
         f'{release_line(ctx)}<p class="lede lede-sm">{esc(lede)}</p></div>\n'
         f'<dl class="kv"><div><dt>Branches</dt><dd class="n">{fmt(p["total"])}<small>{unre}% unreached ({pool_text(doc)})</small></dd></div><div><dt>Language</dt><dd>{esc(p["lang"] or "C")}</dd></div>'
         f'<div><dt>Inputs</dt><dd>{esc(inputs)}</dd></div><div><dt>Fixed track</dt><dd>{fixed}</dd></div>'
         f'<div><dt>Tools with runs</dt><dd class="n">{n_tools}<small>{n_main} {esc(m.primary)}</small></dd></div>'
         f'<div><dt>Runs</dt><dd class="n">{len(runs_p)}<small>{n_sets} with branch sets</small></dd></div></dl>\n')
    h += (f'<section class="section" id="map"><div class="section-head"><h2 id="h-map">Branch map</h2></div>'
          f'<div class="sky">{sky_full(doc, p["name"])}{sky_legend(doc)}</div>'
          f'<div class="card"><div class="card-body mapbox" id="mapbox" style="{mapH}"><noscript><p class="muted">The map needs JavaScript. '
          f'The counts per tool are in the tables below.</p></noscript></div></div></section>\n')
    h += ('<section class="section" id="curves"><div class="section-head"><h2 id="h-curves">Coverage over time</h2></div>'
          '<div class="card"><div class="card-head"><div class="seg seg-scroll fade-x js-only" role="radiogroup" aria-label="Group of tools">')
    for st in m.studies:
        has = any(m.has_curve(pid, s["id"]) for s in m.view_members(st["id"]))
        dis = "" if has else f' disabled title="No tool of the {st["title"].lower()} group has a curve on {esc(p["name"])}"'
        none = ' <span class="muted">(no curves)</span>' if not has else ""
        h += f'<label><input type="radio" name="cview" value="{st["slug"]}"{" checked" if st["id"] == m.primary else ""}{dis}><span>{esc(st["title"])}{none}</span></label>'
    # row one: the group and the choice of chart or table; row two: the family chips of the main group and the time range, in a row of one height whether the
    # chips are there or not, so that switching the group moves nothing. On a phone the order is the group, the chips (one row that scrolls, with the edge of a scroller), then the choice of
    # chart or table and the range side by side.
    h += ('</div><div class="tabs js-only" role="tablist" aria-label="Chart or table"><button type="button" role="tab" id="tab-chart" aria-selected="true" aria-controls="panel-chart">Chart</button>'
          '<button type="button" role="tab" id="tab-table" aria-selected="false" aria-controls="panel-table" tabindex="-1">Table</button></div><span class="brk js-only"></span>'
          f'<div class="tbl-cue chips-cue js-only"><div class="chips js-only" id="famchips" role="group" aria-label="Switch all lines of a family on or off">{family_chips(ctx, pid)}</div></div>'
          '<div class="seg js-only range" role="radiogroup" aria-label="Time range"><label><input type="radio" name="trange" value="full" checked><span>Full</span></label>'
          '<label><input type="radio" name="trange" value="2h"><span>0 to 2 h</span></label></div></div>\n'
          '<div class="chart-grid"><div id="panel-chart" role="tabpanel" aria-labelledby="tab-chart"><p class="sr chart-help" id="chart-help">Use the left and right arrow keys, Home and End to move along the time axis. '
          'The value of every line at that time is read out.</p><p class="muted pad chart-nojs">The chart needs JavaScript. The final values are in the Final coverage table below.</p>'
          '<div class="chart-host" id="chart"></div></div>'
          '<div class="panel-table" id="panel-table" role="tabpanel" aria-labelledby="tab-table" hidden></div><div class="legend fade-y" id="legend" tabindex="0" role="region" aria-label="Chart legend">')
    for st in m.studies:
        h += f'<div class="legend-view" data-view="{st["slug"]}"{"" if st["id"] == m.primary else " hidden"}>{legend_view(ctx, pid, st["id"])}</div>'
    h += ('</div></div>\n<div class="chart-foot"><span>Curves: ' + results_file(ctx, "curves/") + '</span></div></div></section>\n')
    few = any(v["inc"] for (_s, q), v in m.fin.items() if q == pid)
    h += ('<section class="section" id="final"><div class="section-head"><h2 id="h-final">Final coverage</h2>'
          + ('<p class="sub">† marks fewer than three runs.</p>' if few else '') + '</div>'
          + tbl_wrap(final_table(ctx, pid), "Final coverage table", "cmp3-wrap")
          + f'<div class="more-row"><span>{results_file(ctx, "derived/finals.csv")}</span></div></section>\n')
    h += ('<section class="section" id="only"><div class="section-head"><h2 id="h-only">Branches reached by one tool only</h2></div>'
          + one_tool_table(ctx, pid) + "</section>\n")
    san = sanitiser_block(ctx, pid)
    callout = ""
    if m.sigs.get(pid):
        keys = ["unknown-crash: a crash the sanitiser could not classify."] if ">unknown-crash<" in san else []
        callout = ((f'<p class="tkey">{" ".join(keys)}</p>' if keys else "")
                   + '<div class="callout callout-gap"><p><b>Counts are of untriaged signatures.</b> † marks fewer than three runs.</p></div>')
    h += ('<section class="section" id="sanitisers"><div class="section-head"><h2 id="h-san">Sanitiser findings</h2><p class="sub">Signatures in each '
          'tool’s final test cases.</p></div>' + san + callout + '</section>\n')
    cj = json.dumps(chart_data(ctx, pid), separators=(",", ":")).replace("</", "<\\/")
    h += f'<script type="application/json" id="cr-chart">{cj}</script>'
    return page(ctx, key="program", title=title_of(ctx, p["name"]), active="results/", bar=program_bar(ctx, pid), main_attrs=f' data-program="{esc(pid)}"',
                desc=f"Branch map, coverage over time, final coverage and sanitiser counts for {p['name']}.", body=h,
                extra_scripts=[f"assets/branchmap/{pid}.js", "assets/branchmap.js", "assets/charts.js", "assets/program.js"], extra_styles=["assets/popup.css", "assets/program.css"])


# ---- Compare ---------------------------------------------------------------------------------------------------

def option_tail(m: Model, s: dict) -> str:
    """What follows an entry's label in the picker of Compare when the label does not say it: the study it belongs to (unless it is the default one) and a status
    that is not current. compare.js writes the same."""
    bits = []
    title = m.ST[s["study"]]["title"].lower()
    if s["study"] != m.primary and not s["label"].lower().endswith(f"({title})"):
        bits.append(title)
    if s["status"] != "current":
        bits.append(s["status"])
    return f" ({', '.join(bits)})" if bits else ""


def compare_options(m: Model, selected: str) -> str:
    h = ""
    for fam in FAMILY_ORDER:
        lst = [s for s in m.systems if s["family"] == fam]
        if not lst:
            continue
        h += f'<optgroup label="{esc(FAMILY[fam])}">'
        for s in lst:
            tail = option_tail(m, s)
            h += f'<option value="{esc(s["id"])}"{" selected" if s["id"] == selected else ""}>{esc(s["label"])}{tail}</option>'
        h += "</optgroup>"
    return h


NO_CORES = "not stated"      # one phrase for a tool whose core count the release does not give (the reason, where there is one, is in its row on Tools)


def cores_words(s: dict) -> str:
    return NO_CORES if s["cores"] is None else words(s["cores"])


def budget_text(s: dict) -> str:
    return hours(s["budget"]) if s["budget"] else s["no_budget_text"]


def tool_key(s: dict) -> str:
    """The line key of a tool on Compare: its colour only where it has one on every page (the main group), a neutral ink otherwise."""
    return line_key(s, neutral=not s["primary"])


def differ_note(A: dict, B: dict) -> str:
    """One line above the tables when A and B ran on different tracks or with different cores or budgets."""
    parts = []
    if A["track"] != B["track"]:
        parts.append(f"track (A {A['track']}, B {B['track']})")
    if A["cores"] != B["cores"]:
        parts.append(f"cores (A {cores_words(A)}, B {cores_words(B)})")
    if A["budget"] != B["budget"]:
        parts.append(f"budget (A {budget_text(A)}, B {budget_text(B)})")
    if not parts:
        return ""
    t = "A and B differ in " + (parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " and " + parts[-1]) + "."
    if A["track"] != B["track"]:
        t += " Results of the two tracks are not comparable."
    return f'<p class="callout cmp-warn">{t}</p>'


NA_TRACKS = '<span class="muted">n/a (different tracks)</span>'


def compare_html(ctx: Ctx, a_id: str, b_id: str) -> tuple[str, int]:
    """The tables of a comparison. compare.js builds the same strings in the browser. When the two tools are on different tracks the difference, A12
    and the split of the union are not given (the medians and the branches only one reaches are)."""
    m = ctx.model
    A, B = m.S[a_id], m.S[b_id]
    if a_id == b_id:
        return '<p class="callout">Choose two different tools.</p>', 0
    both = [p for p in m.programs if (a_id, p["id"]) in m.fin and (b_id, p["id"]) in m.fin]
    xt = A["track"] != B["track"]
    shared = [p["id"] for p in both]
    # The two tools are named in words ("A: ..., B: ..."), not only by the colours of their swatches, so that a page without scripts (which shows this pair
    # and offers no selects) and a reader who does not see colour know which tool is which.
    h = (f'<div class="cmp-key"><span class="cmp-side"><span class="ab a"></span>{tool_key(A)}<b class="cmp-l">A:</b> {esc(A["label"])}</span>'
         f'<span class="cmp-side"><span class="ab b"></span>{tool_key(B)}<b class="cmp-l">B:</b> {esc(B["label"])}</span></div>')
    h += (f'<p class="lede lede-sm cmp-intro">Both ran on {words(len(both))} {"program" if len(both) == 1 else "programs"}{"." if both else ", so there is nothing to compare."}</p>')
    h += differ_note(A, B)
    if not both:
        return h, 0
    h += ('<section class="section" id="medians"><div class="section-head"><h2 id="h-med">Median final coverage</h2></div>'
          '<div class="tbl-wrap" tabindex="0" role="region" aria-label="Median final coverage of A and B by program"><table class="tbl fit"><caption class="sr">Median final coverage of A and B by program, with A12</caption>'
          '<thead><tr><th class="sticky" scope="col">Program</th><th scope="col">Median share</th><th class="r" scope="col"><span class="ab a"></span>A median</th>'
          '<th class="r" scope="col"><span class="ab b"></span>B median</th>'
          + ('<th class="r" scope="col" colspan="2">Comparison</th>' if xt else
             '<th class="r" scope="col" title="B minus A, in branches">B − A</th><th class="r" scope="col">A12</th>')
          + '<th class="r" scope="col">Runs A / B</th><th scope="col">Curves</th></tr></thead><tbody>')
    any_inc = False
    for p in both:
        fa, fb = m.fin[(a_id, p["id"])], m.fin[(b_id, p["id"])]
        inc = fa["inc"] or fb["inc"]
        any_inc = any_inc or inc
        st = None if (inc or xt) else mwu(m.finals_of(a_id, p["id"]), m.finals_of(b_id, p["id"]))
        d = fb["med"] - fa["med"]
        ca, cb = m.median_curve(p["id"], a_id), m.median_curve(p["id"], b_id)
        cv = "–"
        if ca and cb:
            w, hg = 88, 22
            mx = max(max(ca), max(cb))

            def pts(v):
                return "L".join(f"{r1(2 + 84 * i / (len(v) - 1))} {r1(hg - 2 - 18 * y / mx)}" for i, y in enumerate(v))
            cv = (f'<svg class="spark" viewBox="0 0 {w} {hg}" role="img" aria-label="Median curves of A and B on {esc(p["name"])}"><path class="ca" d="M{pts(ca)}"/><path class="cb" d="M{pts(cb)}"/></svg>')
        if xt:
            stats = f'<td class="r na-cell" colspan="2">{NA_TRACKS}</td>'
        else:
            stats = (f'<td class="num r">{signed(d)}</td>'
                     f'<td class="num r">{("%.2f" % st["A12"]) if st else "<span class=\"muted\" title=\"Fewer than three runs\">n/a</span>"}</td>')
        h += (f'<tr><th class="sticky" scope="row"><a class="pname" href="programs/{esc(p["id"])}.html">{esc(p["name"])}</a><span class="sub mono">{fmt(p["total"])} branches</span></th>'
              f'<td><div class="pair"><div class="row"><span class="l">A</span><i class="a-fill" style="width:{fa["pct"] * 1.5:.1f}px"></i><span class="n">{p1(fa["pct"])}%</span></div>'
              f'<div class="row"><span class="l">B</span><i class="b-fill" style="width:{fb["pct"] * 1.5:.1f}px"></i><span class="n">{p1(fb["pct"])}%</span></div></div></td>'
              f'<td class="num r">{fmt(fa["med"])}</td><td class="num r">{fmt(fb["med"])}</td>{stats}'
              f'<td class="num r">{fa["n"]} / {fb["n"]}{dag() if inc else ""}</td><td>{cv}</td></tr>')
    h += '</tbody></table></div>' + ('<p class="key-line">† fewer than three runs; A12 is left out.</p>' if any_inc and not xt else '') + '</section>'
    h += ('<section class="section" id="only"><div class="section-head"><h2 id="h-only">Branches only each tool reaches</h2></div>'
          '<div class="tbl-wrap" tabindex="0" role="region" aria-label="Branches only A reaches, both reach and only B reaches"><table class="tbl fit"><caption class="sr">Branches reached by only A, by both and by only B</caption>'
          '<thead><tr><th class="sticky" scope="col">Program</th><th class="r" scope="col"><span class="ab a"></span>Only A</th><th class="r" scope="col">Both</th>'
          '<th class="r" scope="col"><span class="ab b"></span>Only B</th><th scope="col" class="split">Split of the union</th></tr></thead><tbody>')
    any_ov = False
    for p in both:
        o = m.overlap_of(p["id"], a_id, b_id)
        if not o:
            h += (f'<tr><th class="sticky" scope="row"><a class="pname" href="programs/{esc(p["id"])}.html">{esc(p["name"])}</a></th>'
                  '<td class="num r miss muted left" colspan="3">Not every run of both tools has a branch set</td><td></td></tr>')
            continue
        any_ov = True
        bar = (NA_TRACKS if xt else f'<div class="stack" role="img" aria-label="{esc(fmt(o["a"]) + " only A, " + fmt(o["both"]) + " both, " + fmt(o["b"]) + " only B")}">'
               f'<i class="a-fill" style="flex:{o["a"]}"></i><i class="both" style="flex:{o["both"]}"></i><i class="b-fill" style="flex:{o["b"]}"></i></div>')
        h += (f'<tr><th class="sticky" scope="row"><a class="pname" href="programs/{esc(p["id"])}.html">{esc(p["name"])}</a></th><td class="num r">{fmt(o["a"])}</td><td class="num r">{fmt(o["both"])}</td>'
              f'<td class="num r">{fmt(o["b"])}</td><td>{bar}</td></tr>')
    h += "</tbody></table></div>" + ("" if any_ov else '<p class="notes">The release holds no overlap rows for this pair.</p>') + '</section>'

    def runs_on(s):
        return sum(m.fin[(s["id"], q)]["n"] for q in shared)

    def tok(s):
        if not s["model_name"]:
            return '<span class="muted">not applicable (no model)</span>'
        toks = [r["tok"] for q in shared for r in m.runs_by[(s["id"], q)] if r["tok"] is not None]
        if not toks:
            return '<span class="muted">not reported</span>'
        n = runs_on(s)
        return f'{fmt(round_half_up(median(toks)))} <span class="muted">({len(toks)} {plural(len(toks), "run", "runs") if len(toks) == n else "of " + str(n) + " runs"})</span>'
    rows = [
        ("Family", lambda s: esc(FAMILY[s["family"]])),
        ("Backend", lambda s: esc(s["backend_name"])),
        ("Model", lambda s: esc(s["model_name"]) if s["model_name"] else '<span class="muted">none</span>'),
        ("Track", lambda s: esc(s["track"])),
        ("Cores per campaign", lambda s: f'<span class="muted">{NO_CORES}</span>' if s["cores"] is None else str(s["cores"])),
        ("Budget per campaign", lambda s: hours(s["budget"]) if s["budget"] else f'<span class="muted">{esc(s["no_budget_text"])}</span>'),
        ("Runs, on the shared programs", lambda s: str(runs_on(s))),
        ("Output tokens per run, median, on the shared programs", tok),
    ]
    h += ('<section class="section" id="resources"><div class="section-head"><h2 id="h-res">Resources</h2></div>'
          '<div class="tbl-wrap" tabindex="0" role="region" aria-label="Resources of A and B"><table class="tbl fit recs"><caption class="sr">Resources of tool A and tool B</caption><thead><tr><th class="sticky" scope="col"><span class="sr">Resource</span></th>'
          f'<th scope="col"><span class="ab a"></span>{tool_key(A)}{esc(A["label"])}</th><th scope="col"><span class="ab b"></span>{tool_key(B)}{esc(B["label"])}</th></tr></thead><tbody>')
    for label, fn in rows:
        h += f'<tr><th class="sticky rowlab" scope="row">{esc(label)}</th><td data-label="Tool A">{fn(A)}</td><td data-label="Tool B">{fn(B)}</td></tr>'
    h += '</tbody></table></div></section>'
    return h, len(both)


def compare_data(ctx: Ctx) -> dict:
    """What compare.js needs to build any comparison in the browser: compact arrays indexed by tool and program."""
    m: Model = ctx.model
    sidx = {s["id"]: i for i, s in enumerate(m.systems)}
    pidx = {p["id"]: i for i, p in enumerate(m.programs)}
    systems = []
    for s in m.systems:
        systems.append({"id": s["id"], "label": s["label"], "family": s["family"], "backend": s["backend_name"], "model": s["model_name"],
                        "track": s["track"], "cores": s["cores"], "budget": s["budget"], "nocores": NO_CORES, "nobudget": s["no_budget_text"],
                        "study": s["study"], "primary": s["primary"], "status": s["status"], "slot": s["slot"], "dash": s["dash"]})
    fin, runs, curves, toks = {}, {}, {}, {}
    for (sid, pid), v in m.fin.items():
        fin.setdefault(sid, {})[pid] = [v["n"], v["med"], v["pct"], 1 if v["inc"] else 0]
        runs.setdefault(sid, {})[pid] = m.finals_of(sid, pid)
        tk = [r["tok"] for r in m.runs_by[(sid, pid)] if r["tok"] is not None]
        if tk:
            toks.setdefault(sid, {})[pid] = tk
        mc = m.median_curve(pid, sid)
        if mc:
            curves.setdefault(sid, {})[pid] = mc
    ovl = []
    for pid, d in m.overlap.items():
        for (a, b), (ao, bo, both) in d.items():
            ovl.append([pidx[pid], sidx[a], sidx[b], ao, bo, both])
    return {"release": ctx.facts["version"], "primary": m.primary, "studies": {st["id"]: st["title"] for st in m.studies},
            "programs": [{"id": p["id"], "name": p["name"], "total": p["total"]} for p in m.programs],
            "systems": systems, "fin": fin, "runs": runs, "curves": curves, "toks": toks, "ovl": ovl}


def default_pair(m: Model) -> tuple[str, str]:
    """The pair Compare opens on: the first two default entries of different tools that share a family, a track and a core count, so that the first view compares like
    with like. Where no two do, the first two entries."""
    cols = [c["s"] for c in m.study_columns(m.primary)] or m.systems
    for i, x in enumerate(cols):
        for y in cols[i + 1:]:
            if x["tool"] != y["tool"] and (x["family"], x["track"], x["cores"]) == (y["family"], y["track"], y["cores"]):
                return x["id"], y["id"]
    ids = [s["id"] for s in m.systems]
    return ids[0], ids[min(1, len(ids) - 1)]


def compare_page(ctx: Ctx) -> str:
    m = ctx.model
    a, b = default_pair(m)
    out, _ = compare_html(ctx, a, b)
    body = ('<div class="page-head"><h1>Compare</h1>\n' + release_line(ctx) + '\n<p class="lede lede-sm">Two tools side by side on the programs both ran on.</p></div>\n'
            f'<div class="controls"><span class="ctl">{terms(ctx, "compare")}</span></div>\n'
            '<div class="pick"><label><span><span class="ab a"></span>Tool A</span><select id="sel-a">' + compare_options(m, a) + '</select></label>'
            '<button class="btn js-only" type="button" id="swap" aria-label="Swap A and B">Swap</button>'
            '<label><span><span class="ab b"></span>Tool B</span><select id="sel-b">' + compare_options(m, b) + '</select></label></div>\n'
            '<noscript><p class="key-line">Choosing another pair needs scripts.</p></noscript>\n'
            f'<div id="cmp-out" data-a="{esc(a)}" data-b="{esc(b)}">{out}</div>')
    bar = ('<div class="subbar"><div class="subbar-in fade-x"><nav class="left" aria-label="On this page"><a href="#medians" data-sec="medians">Median final coverage</a>'
           '<a href="#only" data-sec="only">Branches only each tool reaches</a><a href="#resources" data-sec="resources">Resources</a></nav></div></div>\n')
    return page(ctx, key="compare", title=title_of(ctx, "Compare"), active="compare", bar=bar,
                desc="Compare two tools program by program: medians, A12, branches only one tool reaches and resources.", body=body,
                extra_scripts=["assets/compare-data.js", "assets/compare.js"], extra_styles=["assets/compare.css"])


# ---- A tool, and the releases ----------------------------------------------------------------------------------

def programs_covered(m: Model, s: dict) -> str:
    """'12 of 18': the programs on which an entry has runs, out of the programs of the release."""
    return f"{len(m.fin_by_sys.get(s['id'], {}))} of {len(m.programs)}"


def tool_versions_table(ctx: Ctx, tool: dict) -> str:
    """The version table of a tool: one row for each entry, newest submitted first."""
    m: Model = ctx.model
    h = ('<table class="tbl fit recs"><caption class="sr">Every entry of ' + esc(tool["name"]) + '</caption><thead><tr>'
         '<th class="sticky" scope="col">Entry</th><th scope="col">Version</th><th scope="col">Model</th><th scope="col">Configuration</th><th scope="col">Submitted</th>'
         '<th class="r" scope="col">Programs covered</th><th scope="col">Status</th></tr></thead><tbody>')
    dash = '<span class="muted">–</span>'
    for s in m.tool_entries(tool["id"]):
        status = esc(s["status"]) + (f' <span class="muted">by {esc(name_list([m.S[x]["label"] for x in s["superseded_by"]]))}</span>' if s["superseded_by"] else "")
        h += (f'<tr><th class="sticky wrap" scope="row"><a class="pname" href="{ctx.page("tools.html")}#{esc(s["id"])}">{esc(s["label"])}</a></th>'
              f'<td class="ver" data-label="Version">{version_html(s)}</td>'
              f'<td data-label="Model">{esc(s["model_name"]) if s["model_name"] else dash}</td>'
              f'<td class="wrap" data-label="Configuration" data-verbatim>{esc(s["config"]) if s["config"] else dash}</td>'
              f'<td class="num" data-label="Submitted">{esc(s["submitted"]) if s["submitted"] else dash}</td>'
              f'<td class="num r" data-label="Programs covered">{programs_covered(m, s)}</td>'
              f'<td data-label="Status">{status}</td></tr>')
    return h + "</tbody></table>"


def tool_coverage_table(ctx: Ctx, tool: dict) -> str:
    """Median final coverage on every program, one column for each entry of the tool in the default study (the others are variants that their own study compares),
    newest first. A missing cell stays missing: the entry has no runs on the program, the program has no fixed track for it, or the entry is not in this release;
    no cell is filled from another entry."""
    m: Model = ctx.model
    entries = [s for s in m.tool_entries(tool["id"]) if s["primary"]]
    h = ('<table class="tbl fit"><caption class="sr">Median final branch coverage of every entry of ' + esc(tool["name"]) + ' by program</caption><thead><tr>'
         '<th class="sticky" scope="col">Program</th>')
    for s in entries:
        first, rest = name_lines(s["label"])
        h += (f'<th class="r" scope="col"><span class="th-top">{nb(first)}</span><span class="th-sub">{nb(rest)}</span>'
              f'<span class="th-sub th-ver">{version_html(s)}</span><span class="th-sub th-date">{esc(s["submitted"] or "date unknown")}</span></th>')
    h += "</tr></thead><tbody>"
    for p in m.programs:
        if not any(cell_state(m, s, p) == "run" for s in entries):
            continue
        h += f'<tr><th class="sticky" scope="row"><a class="pname" href="{ctx.prog(p["id"])}">{esc(p["name"])}</a></th>'
        for s in entries:
            state = cell_state(m, s, p)
            if state != "run":
                h += missing_cell(state).replace('class="cell r miss', 'class="num r miss', 1)
                continue
            f = m.fin[(s["id"], p["id"])]
            d = dag(f"Fewer than three runs ({f['n']})") if f["inc"] else ""
            h += f'<td class="num r">{p1(f["pct"])}%{d}<span class="sr">, {f["n"]} {plural(f["n"], "run", "runs")}</span></td>'
        h += "</tr>"
    return h + "</tbody></table>"


def tool_page(ctx: Ctx, tool: dict) -> str:
    m = ctx.model
    entries = m.tool_entries(tool["id"])
    links = []
    for label, address in (("Project", tool["url"]), ("Reference", tool["reference"])):
        url = http_url(address)
        text = esc(str(address).split("//", 1)[-1])
        if url:
            links.append(f'{label}: <a href="{esc(url)}" rel="noopener">{text}</a>')
        elif address:
            links.append(f"{label}: {text}")  # not an http(s) address: the text, never a link
    body = (f'<div class="page-head"><h1>{esc(tool["name"])}</h1>\n{release_line(ctx)}\n'
            + (f'<p class="lede lede-sm" data-verbatim>{esc(tool["desc"])}</p>' if tool["desc"] else "") + '</div>\n'
            f'<div class="controls"><span class="ctl">{terms(ctx, "tool")}</span><span class="grow"></span><span class="ctl"><a href="{ctx.page("tools.html")}">All tools</a></span></div>\n'
            + "".join(f'<p class="key-line">{x}</p>\n' for x in links)
            + '<section class="section" id="versions"><div class="section-head"><h2 id="h-versions">Versions</h2></div>'
            + tbl_wrap(tool_versions_table(ctx, tool), f"Entries of {tool['name']}", "recsframe") + '</section>\n')
    if sum(1 for s in entries if s["primary"]) > 1:
        body += ('<section class="section" id="coverage"><div class="section-head"><h2 id="h-coverage">Median coverage by version</h2></div>'
                 + tbl_wrap(tool_coverage_table(ctx, tool), f"Median final coverage of the entries of {tool['name']}", "narrow") + '</section>\n')
    return page(ctx, key="tool", title=title_of(ctx, tool["name"]), active="tools", desc=f"Every version of {tool['name']} in the data: model, configuration, dates, programs covered and status.", body=body)


def releases_page(ctx: Ctx) -> str:
    """Updates: when the data last changed, its counts, the entries added recently and what the data was measured with. Every number is counted from the results
    files at build time. Git holds the rest of the history."""
    m, f = ctx.model, ctx.facts
    rel = m.release
    cols = [("Updated", esc(f["date_long"])), ("Entries", fmt(f["entries"])), ("Tools", fmt(f["tools"])), ("Programs", fmt(f["programs"])), ("Runs", fmt(f["runs"])),
            ("New", fmt(f["n_new"])), ("Superseded", fmt(f["n_superseded"])), ("Withdrawn", fmt(f["n_withdrawn"]))]
    head = "".join(f'<th{" class=" + chr(34) + "sticky" + chr(34) if i == 0 else " class=" + chr(34) + "r" + chr(34)} scope="col">{k}</th>' for i, (k, _) in enumerate(cols))
    cells = f'<th class="sticky" scope="row">{cols[0][1]}</th>' + "".join(f'<td class="num r" data-label="{k}">{v}</td>' for k, v in cols[1:])
    table = f'<table class="tbl fit recs"><caption class="sr">The data now</caption><thead><tr>{head}</tr></thead><tbody><tr>{cells}</tr></tbody></table>'
    fresh = sorted((s for s in m.systems if s["new"]), key=lambda s: (s["submitted"], s["id"]), reverse=True)
    new_rows = "".join(f'<tr><th class="sticky wrap" scope="row"><a class="pname" href="{ctx.page("tools.html")}#{esc(s["id"])}">{esc(s["label"])}</a></th>'
                       f'<td class="num" data-label="Added">{esc(s["submitted"])}</td></tr>' for s in fresh)
    new_table = ('<table class="tbl fit recs"><caption class="sr">Entries added recently</caption><thead><tr><th class="sticky" scope="col">Entry</th><th scope="col">Added</th></tr></thead>'
                 f'<tbody>{new_rows}</tbody></table>')
    rows = []
    for key, label in (("specification", "Specification"), ("image", "Replay image"), ("runner", "Runner"), ("profile", "Profile")):
        v = rel.get(key)
        if v:
            rows.append((label, esc(str(v))))
    measured = "".join(f"<div><dt>{k}</dt><dd>{v}</dd></div>" for k, v in rows)
    body = (f'<div class="page-head"><h1>Updates</h1>\n{release_line(ctx)}\n'
            '<p class="lede lede-sm">The data changes when a submission is accepted. A snapshot is a tagged copy that a paper can cite.</p></div>\n'
            f'<div class="controls"><span class="ctl">{terms(ctx, "releases")}</span><span class="grow"></span><span class="ctl">{results_file(ctx, "RELEASE.json")}</span></div>\n'
            + tbl_wrap(table, "The data now", "recsframe") + "\n"
            + (f'<section class="section" id="new"><div class="section-head"><h2 id="h-new">New</h2></div>{tbl_wrap(new_table, "Entries added recently", "recsframe")}</section>\n' if fresh else "")
            + (f'<section class="section" id="measured"><div class="section-head"><h2 id="h-measured">Measured with</h2></div><dl class="notes-dl">{measured}</dl></section>\n' if measured else ""))
    return page(ctx, key="releases", title=title_of(ctx, "Updates"), active="",
                desc="When the data last changed, what is new and what the data was measured with.", body=body)


# ---- Documents (Method, Contribute) ----------------------------------------------------------------------

PLACEHOLDER = re.compile(r"\{\{([a-z0-9_]+)\}\}")


def fill(text: str, values: dict, where: str) -> str:
    used = set()

    def sub(mo):
        k = mo.group(1)
        if k not in values:
            raise KeyError(f"{where}: placeholder {{{{{k}}}}} has no value")
        used.add(k)
        return str(values[k])
    return PLACEHOLDER.sub(sub, text)


def repo_ref(name: str, url: str) -> str:
    href = http_url(url)
    return f'<a href="{esc(href)}" rel="noopener"><code>{esc(name)}</code></a>' if href else f"<code>{esc(name)}</code>"


def repo_file(url: str, path: str, ref: str = "HEAD") -> str:
    """A file (or, with a trailing slash, a folder) of a repository at a tag or branch: a link to it when the repository has an address, its name in code otherwise."""
    is_dir = path.endswith("/")
    name = path.rstrip("/").rsplit("/", 1)[-1] + ("/" if is_dir else "")
    href = http_url(url)
    return f'<a href="{esc(href)}/{"tree" if is_dir else "blob"}/{esc(ref)}/{esc(path)}" rel="noopener"><code>{esc(name)}</code></a>' if href else f"<code>{esc(name)}</code>"


def issue_form(url: str, template: str, text: str) -> str:
    """An issue form of a repository: a link to it when the repository has an address, its name otherwise."""
    href = http_url(url)
    return f'<a href="{esc(href)}/issues/new?template={esc(template)}" rel="noopener">{esc(text)}</a>' if href else esc(text)


def doc_values(ctx: Ctx) -> dict:
    """The values that the prose of Method and Contribute may use as {{placeholders}}; every number comes from the release."""
    f, cfg, sp = ctx.facts, ctx.cfg, ctx.model.spec
    v = {k: (fmt(x) if isinstance(x, int) and not isinstance(x, bool) else x) for k, x in f.items()}
    v.update({f"spec_{k}": (fmt(x) if isinstance(x, int) else x) for k, x in sp.items()})
    v["licence_data_text"] = esc(f["licence_data"].replace("CC-BY-", "CC BY "))
    spec_url, res_url = cfg.get("runner_repo_url", ""), cfg.get("results_repo_url", "")
    runner_name = spec_url.rstrip("/").rsplit("/", 1)[-1] or "the runner"
    v["spec_repo"] = repo_ref(runner_name, spec_url)
    v["results_repo"] = repo_ref("agent-software-testing-results", res_url)
    ref = release_ref(ctx)
    v["submitting_md"] = repo_file(res_url, "docs/SUBMITTING.md", ref)
    v["disclosure_md"] = repo_file(res_url, "DISCLOSURE.md", ref)
    v["proposing_md"] = repo_file(spec_url, "docs/PROPOSING-A-PROGRAM.md")
    v["security_md"] = repo_file(spec_url, "SECURITY.md")
    v["data_form"] = issue_form(res_url, "data-issue.yml", "data form")
    v["bug_form"] = issue_form(spec_url, "bug.yml", "bug form")
    v["spec_change_form"] = issue_form(spec_url, "spec-change.yml", "specification change form")
    v["program_form"] = issue_form(spec_url, "program-proposal.yml", "program proposal form")
    v["site_form"] = issue_form(cfg.get("site_repo_url", ""), "site-issue.yml", "website form")
    v["min_repeats_word"] = words(sp["min_repeats"])
    v["disclosure_days"] = str(sp["disclosure_days"])
    v["budget_hours_word"] = words(sp.get("standard_budget_h") or f["budget_max_h"])
    v["n_agent_seeds_clause"] = (f" {words(f['n_agent_seeds']).capitalize()} more start{'s' if f['n_agent_seeds'] == 1 else ''} from its seeds."
                                 if f["n_agent_seeds"] else "")
    return v


def doc_page(ctx: Ctx, name: str, title: str, desc: str, lede: str, toc: list[tuple[str, str]]) -> str:
    """A page of prose from content/pages. A page with no table of contents (Method) is one column. Its Terms (the words the prose uses without explaining
    them) are one disclosure above the prose, as on the pages of tables."""
    text = (ctx.extras["content_dir"] / "pages" / f"{name}.html").read_text(encoding="utf-8")
    prose = fill(text, doc_values(ctx), f"content/pages/{name}.html")
    tocs = "".join(f'<li><a href="#{i}">{esc(t)}</a></li>' for i, t in toc)
    nav = f'<nav class="toc fade-x" aria-label="On this page"><ol>{tocs}</ol></nav>' if toc else ""
    lede_p = f'<p class="lede lede-sm lede-wide">{esc(lede)}</p>' if lede else ""
    words_of = terms(ctx, name)
    body = (f'<div class="page-head"><h1>{esc(title)}</h1>{lede_p}</div>\n'
            + (f'<div class="controls"><span class="ctl">{words_of}</span></div>\n' if words_of else "")
            + f'<div class="doc{"" if toc else " doc-solo"}">{nav}<article class="prose">{prose}</article></div>')
    return page(ctx, key="doc", title=title_of(ctx, title), active=name, desc=desc, body=body, extra_styles=["assets/prose.css"])


def method_page(ctx: Ctx) -> str:
    return doc_page(ctx, "method", "Method", "What is measured, how runs are summarised and what the numbers cannot show.", "", [])


def contribute_page(ctx: Ctx) -> str:
    toc = [("submit", "Submit results"), ("propose", "Propose a program"), ("report", "Report a problem"), ("disclosure", "Disclosure policy")]
    return doc_page(ctx, "contribute", "Contribute", "Submit results, propose a program, report a problem and read the disclosure policy.",
                    "For authors of a test generator who want it measured beside these tools without building baselines.", toc)


# ---- 404 -------------------------------------------------------------------------------------------------------

def not_found_page(ctx: Ctx) -> str:
    m = ctx.model
    pages = "".join(f'<li><a href="{ctx.page(h)}">{t}</a></li>' for t, h in (("Tools", "tools.html"), ("Compare", "compare.html"), ("Method", "method.html"), ("Contribute", "contribute.html")))
    progs = "".join(f'<a href="{ctx.prog(p["id"])}">{esc(p["name"])}</a>' for p in m.programs)
    body = ('<div class="page-head"><h1>Page not found</h1><p class="lede lede-sm">There is no page at this address. The link may be mistyped or out of date.</p></div>\n'
            f'<p>Start from <a href="{ctx.home}">the front page</a> or <a href="{ctx.results}">Results</a>, or go to one of the pages or programs below.</p>\n'
            f'<ul class="plain-list">{pages}</ul>\n'
            f'<h2 class="h2-gap">Programs</h2><nav class="link-cols" aria-label="Programs">{progs}</nav>')
    return page(ctx, key="notfound", title=title_of(ctx, "Page not found"), active="", desc="There is no page at this address.", body=body, not_found=True)
