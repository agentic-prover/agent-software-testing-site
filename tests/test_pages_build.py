"""scripts/pages_build.py: the public site and its preview are built with the right settings and only after their checks."""
import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("pages_build", HERE / "scripts" / "pages_build.py")
pages_build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pages_build)
BASE = {"site_url": "https://example.org/", "base_url": "/", "release_ref": "v0.1.0", "noindex": False}


def test_the_public_build_stays_indexable_and_names_the_commit():
    cfg = pages_build.config_for(BASE, "abc123", False)
    assert (cfg["base_url"], cfg["site_url"], cfg["release_ref"], cfg["noindex"]) == ("/", "https://example.org/", "abc123", False)


def test_a_preview_is_one_folder_down_and_hidden_from_search_engines():
    cfg = pages_build.config_for(BASE, "abc123", True)
    assert (cfg["base_url"], cfg["site_url"], cfg["noindex"]) == ("/preview/", "https://example.org/preview/", True)


def test_nothing_is_written_before_the_checks_passed():
    source = (HERE / "scripts" / "pages_build.py").read_text(encoding="utf-8")
    assert source.index("check_site.py") < source.index("shutil.copytree(public")
    assert source.count("check=True") == 3
