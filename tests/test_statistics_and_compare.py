"""The numbers a reader draws conclusions from, and the Compare page in the browser's own script.

Compare is written twice, by the build (the first pair) and by a script in the page (any other pair); a visitor must see the same thing either way."""
from __future__ import annotations

import json
import re
import shutil
import subprocess

import pytest

from conftest import HERE
from sitebuild.data import Model, fmt, median, mwu, p1, signed
from helpers import read

NODE = shutil.which("node")


def test_the_statistics_are_the_textbook_ones():
    """Median, Mann-Whitney U and the Vargha-Delaney A12 (the chance that a run of A beats a run of B, a tie counting half), on cases worked by hand."""
    assert median([3, 1, 2]) == 2 and median([1, 2]) == 1.5 and median([2, 4]) == 3
    assert mwu([5, 6, 7], [1, 2, 3])["A12"] == 1.0
    assert mwu([1, 2, 3], [1, 2, 3])["A12"] == 0.5
    r = mwu([1, 4, 4], [2, 4, 6])
    assert r["U"] == 3.0 and abs(r["A12"] - 1 / 3) < 1e-12      # 1 loses to all three; each 4 beats 2, ties 4 and loses to 6
    assert mwu([5, 6, 7], [1, 2, 3])["U"] == 9.0


def test_numbers_are_written_the_way_a_reader_expects():
    assert fmt(1234567) == "1,234,567" and fmt(12.0) == "12" and fmt(323.5) == "323.5"
    assert p1(75.39) == "75.4" and signed(-1234) == "−1,234" and signed(5) == "+5" and signed(0) == "0"


def _pairs(real_results):
    """A pair of tools on one track, and a pair on different tracks, chosen from the data."""
    m = Model(real_results, HERE / "content")
    ids = [s["id"] for s in m.study_entries(m.primary)]
    like = [(a, b) for a in ids for b in ids if a < b and (m.S[a]["track"], m.S[a]["cores"]) == (m.S[b]["track"], m.S[b]["cores"])][:2]
    cross = [(a, b) for a in ids for b in ids if a < b and m.S[a]["track"] != m.S[b]["track"]][:1]
    assert like and cross
    return m, like, cross


def _render(dist, pairs):
    out = subprocess.run([NODE, str(HERE / "scripts/render_compare.mjs"), str(dist)] + [f"{a}:{b}" for a, b in pairs], capture_output=True, text=True, check=True, timeout=120).stdout
    return json.loads(out)


@pytest.mark.skipif(not NODE, reason="node is not installed")
def test_compare_in_the_page_script_is_the_page_the_build_wrote(real_dist, real_results):
    """For the pair the page opens on, and for pairs of both kinds, the script's table is the table the build writes for that pair, character for character."""
    from sitebuild import pages
    from sitebuild.html import Ctx
    from sitebuild.site import load_config
    m, like, cross = _pairs(real_results)
    ctx = Ctx(load_config(HERE / "site.json"), m, m.facts(), extras={"p_min": 0.1})
    page = read(real_dist / "compare.html")
    a, b = re.search(r'<div id="cmp-out" data-a="([^"]*)" data-b="([^"]*)"', page).groups()
    default = re.search(r'<div id="cmp-out" data-a="[^"]*" data-b="[^"]*">(.*?)</div>\n</main>', page, re.S).group(1)
    pairs = [(a, b)] + like + cross
    rendered = _render(real_dist, pairs)
    assert rendered[0] == default
    for (x, y), html in zip(pairs, rendered):
        assert html == pages.compare_html(ctx, x, y)[0], (x, y)


@pytest.mark.skipif(not NODE, reason="node is not installed")
def test_compare_in_the_page_script_gives_the_a12_of_the_data(real_dist, real_results):
    """The effect size a visitor reads for a pair in the browser is the A12 computed from the runs of the release, program by program."""
    import csv
    m, like, cross = _pairs(real_results)
    covered = {}
    for r in csv.DictReader(open(real_results / "runs.csv", newline="")):
        covered.setdefault((r["system_id"], r["program"]), []).append(int(r["covered"]))
    checked = 0
    for (a, b), html in zip(like, _render(real_dist, like)):
        for prog in {p for (s, p) in covered if s == a} & {p for (s, p) in covered if s == b}:
            row = re.search(rf'href="programs/{prog}.html">.*?</tr>', html, re.S)
            if not row:
                continue
            want = mwu(covered[(a, prog)], covered[(b, prog)])["A12"]
            assert f'<td class="num r">{want:.2f}</td>' in row.group(0), (a, b, prog)
            checked += 1
    assert checked >= 5


def test_tools_on_different_tracks_get_a_notice_and_no_effect_size(real_results):
    """Tools on different tracks ran under different rules; the site says so and offers no A12 for such a pair."""
    from sitebuild import pages
    from sitebuild.html import Ctx
    m, like, cross = _pairs(real_results)
    ctx = Ctx({}, m, m.facts())
    html = pages.compare_html(ctx, *cross[0])[0]
    assert "not comparable" in html and not re.search(r'<td class="num r">\d\.\d\d</td>', html)
    html = pages.compare_html(ctx, *like[0])[0]
    assert "not comparable" not in html


def _lum(hexv):
    c = [int(hexv[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def _contrast(a, b):
    hi, lo = sorted((_lum(a), _lum(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


@pytest.mark.parametrize("mode", ["LIGHT", "DARK"])
def test_text_and_marks_can_be_read_in_both_themes(mode):
    """Contrast of text on its backgrounds (4.5 to 1), and of control outlines, focus rings and chart marks (3 to 1), in the light and the dark theme; the dark theme defines every colour the light one does."""
    from sitebuild import tokens
    assert set(tokens.LIGHT) == set(tokens.DARK)
    tk = getattr(tokens, mode)
    for text in ("--ink", "--ink-2", "--ink-3", "--accent"):
        for ground in ("--bg", "--surface", "--surface-2"):
            assert _contrast(tk[text], tk[ground]) >= 4.5, (mode, text, ground)
    for mark in ("--focus", "--ctl-line", "--map-unique", "--cmp-a", "--cmp-b"):
        for ground in ("--bg", "--surface"):
            assert _contrast(tk[mark], tk[ground]) >= 3, (mode, mark, ground)
    for i in range(1, 9):
        assert _contrast(tk[f"--s{i}"], tk["--surface"]) >= 3, (mode, i)
