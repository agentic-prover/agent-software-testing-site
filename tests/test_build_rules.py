"""The build refuses data that would make the site wrong, and does not harm what it must not touch.

A small made-up release (conftest.make_release: two programs, four tools) is damaged in one way at a time. Each damage is a mistake that really happens
when a release is assembled by hand or by a script."""
from __future__ import annotations

import gzip
import json

import pytest

from conftest import build_site
from sitebuild.data import BuildError, Model
from sitebuild import mapdata
from helpers import read


def _edit(name, old, new, count=1):
    def mutate(root):
        text = read(root / name)
        assert old in text, (name, old)
        (root / name).write_text(text.replace(old, new, count), encoding="utf-8")
    return mutate


def _set_file(sid, prog, run, change):
    def mutate(root):
        path = root / f"sets/{sid}/{prog}/r{run}.json.gz"
        doc = json.load(gzip.open(path, "rt"))
        change(doc)
        with gzip.open(path, "wt") as fh:
            json.dump(doc, fh)
    return mutate


def _move(path, to):
    return lambda root: (root / path).rename(root / to)


BAD_DATA = {
    "a median in finals.csv that the runs do not give": _edit("derived/finals.csv", "s-agent,alpha,3,10,9,11,20,50.00", "s-agent,alpha,3,12,9,11,20,60.00"),
    "a program whose universe has a different size than programs.csv says": _edit("programs.csv", ",20,", ",21,"),
    "a missing universe file": _move("universe/beta.txt.gz", "universe/beta.moved"),
    "a run whose set file is missing": _move("sets/s-sym/alpha/r1.json.gz", "sets/s-sym/alpha/r1.moved"),
    "a set that claims more branches than it lists": _set_file("s-agent", "alpha", 1, lambda d: d.update(branch_covered=d["branch_covered"] + 3)),
    "a track that is neither fixed nor open": _edit("systems.csv", ",open,", ",opened,"),
    "a measure nobody defined": _edit("runs.csv", ",canonical,", ",invented,"),
    "a tool on a fixed track on a program that has none": _edit("runs.csv", "s-fuzz,beta", "s-fuzz,alpha"),
    "a run listed for a program the release does not have": _edit("runs.csv", "s-sym,beta,1", "s-sym,gamma,1"),
}


@pytest.mark.parametrize("name", sorted(BAD_DATA))
def test_the_build_stops_on(synth, tmp_path, name):
    """A release with this fault does not build; the person assembling it is told, and no half-made site is left as if it were good."""
    r, c = synth(BAD_DATA[name])
    with pytest.raises(BuildError):
        build_site(r, tmp_path / "out", content=c)
    assert not (tmp_path / "out/index.html").exists()


def test_the_made_up_release_itself_builds(synth, tmp_path):
    """The control for the tests above, so that they fail for their fault and not for the made-up release."""
    r, c = synth()
    build_site(r, tmp_path / "out", content=c)
    assert (tmp_path / "out/programs/alpha.html").is_file()


def test_a_branch_outside_the_universe_is_counted_and_never_drawn(synth):
    r, c = synth(_set_file("s-agent", "alpha", 1, lambda d: (d["covered_branch_keys"].append("zzz.c:1:0:0"), d.update(branch_covered=len(d["covered_branch_keys"])))))
    doc = mapdata.build_program(Model(r, c), "alpha")
    assert doc["summary"]["outside_universe"]["s-agent"] == 1
    assert doc["total"] == 20 and len(doc["mask"]) == 20


def test_building_into_a_folder_that_is_not_the_sites_leaves_it_alone(synth, tmp_path):
    """A mistyped --out must never write into, or remove anything from, somebody's folder."""
    r, c = synth()
    out = tmp_path / "notmine"
    out.mkdir()
    (out / "keep.txt").write_text("mine", encoding="utf-8")
    with pytest.raises(BuildError):
        build_site(r, out, content=c)
    assert read(out / "keep.txt") == "mine" and sorted(p.name for p in out.iterdir()) == ["keep.txt"]


def test_a_rebuild_removes_nothing_unless_asked(synth, tmp_path):
    r, c = synth()
    out = tmp_path / "out"
    build_site(r, out, content=c)
    (out / "old.html").write_text("old", encoding="utf-8")
    manifest = out.parent / (out.name + ".build-manifest")
    manifest.write_text(read(manifest) + "old.html\n", encoding="utf-8")
    build_site(r, out, content=c)
    assert (out / "old.html").is_file()


def test_text_from_the_data_cannot_inject_markup(synth, tmp_path):
    """Descriptions come from files that other people write; angle brackets and quotes arrive on the page as text."""
    r, c = synth()
    pj = json.loads(read(c / "programs.json"))
    pj["programs"]["alpha"]["description"] = "<script>alert(1)</script> & \"quotes\""
    (c / "programs.json").write_text(json.dumps(pj), encoding="utf-8")
    sj = json.loads(read(c / "systems.json"))
    sj["systems"]["s-agent"]["description"] = "<img src=x onerror=alert(1)>"
    (c / "systems.json").write_text(json.dumps(sj), encoding="utf-8")
    build_site(r, tmp_path / "out", content=c)
    for f in ("programs/alpha.html", "tools.html"):
        text = read(tmp_path / "out" / f)
        assert "<script>alert(1)" not in text and "<img src=x" not in text, f
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in read(tmp_path / "out/programs/alpha.html")


def test_an_address_from_the_data_becomes_a_link_only_if_it_is_http_or_https(real_results):
    """A citation or project address of the release is shown as a link only when following it cannot run code."""
    from conftest import HERE
    from sitebuild import pages
    from sitebuild.html import Ctx, http_url
    from sitebuild.site import load_config
    assert http_url("https://example.org/x?a=1") == "https://example.org/x?a=1"
    for bad in ("javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,<script>1</script>", " vbscript:x", "//example.org", "/relative", ""):
        assert http_url(bad) == "", bad
    m = Model(real_results, HERE / "content")
    ctx = Ctx(load_config(HERE / "site.json"), m, m.facts(), extras={"p_min": 0.1})
    tool = dict(next(t for t in m.tools if t["id"] == "aflpp"), url="javascript:alert(1)", reference="javascript:alert(2)")
    assert 'href="javascript' not in pages.tool_page(ctx, tool).lower()
