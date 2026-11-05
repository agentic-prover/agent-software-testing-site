"""scripts/rebuild.py: the published site follows a new results release, keeps its address and is replaced only after its check."""
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("rebuild", HERE / "scripts" / "rebuild.py")
rebuild = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rebuild)


def test_links_follow_the_release(tmp_path):
    config = tmp_path / "site.json"
    config.write_text((HERE / "site.json").read_text(encoding="utf-8"), encoding="utf-8")
    rebuild.set_release_ref(config, "9.8.7")
    assert json.loads(config.read_text(encoding="utf-8"))["release_ref"] == "v9.8.7"


def test_docs_are_replaced_and_keep_the_address(tmp_path):
    build, docs = tmp_path / "build", tmp_path / "docs"
    (build / "assets").mkdir(parents=True)
    (docs / "old").mkdir(parents=True)
    (build / "index.html").write_text("new")
    (build / "assets" / "a.css").write_text("css")
    (build / "CNAME").write_text("wrong.example")
    (docs / "CNAME").write_text("right.example")
    (docs / "index.html").write_text("old")
    (docs / "gone.html").write_text("old")
    (docs / "old" / "x").write_text("old")
    rebuild.replace_docs(build, docs)
    assert sorted(p.relative_to(docs).as_posix() for p in docs.rglob("*") if p.is_file()) == ["CNAME", "assets/a.css", "index.html"]
    assert (docs / "CNAME").read_text() == "right.example" and (docs / "index.html").read_text() == "new"


def test_a_failed_build_or_check_leaves_docs_alone():
    source = (HERE / "scripts" / "rebuild.py").read_text(encoding="utf-8")
    assert source.index("check_site.py") < source.index("replace_docs(build")
    assert source.count("check=True") == 2
