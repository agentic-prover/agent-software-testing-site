"""What a visitor can rely on in the published files.

The pages are read from disk exactly as a static host would serve them."""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import urllib.parse
from pathlib import Path

import pytest

from conftest import HERE, build_site
from helpers import parse, read

NODE = shutil.which("node")


def _pages(dist: Path) -> list[Path]:
    return sorted(dist.rglob("*.html"))


def _is_external(url: str) -> bool:
    return bool(re.match(r"^(?:[a-z][a-z0-9+.-]*:|//)", url, re.I))


def test_every_link_script_style_font_and_image_leads_somewhere(real_dist):
    """Starting from the front page and the page for an unknown address, every internal link, script, style sheet, icon and font resolves to a file, a
    link to #something names an id on that page, and every page of the site is reached by a link."""
    ids = {p: set(parse(p).ids) for p in _pages(real_dist)}
    seen, queue = set(), [real_dist / "index.html", real_dist / "404.html"]
    problems = []
    while queue:
        page = queue.pop()
        if page in seen:
            continue
        seen.add(page)
        for tag, url in parse(page).refs:
            if _is_external(url) or url.startswith("mailto:"):
                continue
            u = urllib.parse.urlsplit(url)
            # the page for an unknown address is served from any depth, so its links are read from the root of the site
            base = real_dist / "404.html" if page.name == "404.html" else page
            target = (base.parent / urllib.parse.unquote(u.path)).resolve() if u.path else page
            if not target.is_relative_to(real_dist.resolve()):
                problems.append(f"{page.name}: {url} leaves the site")
                continue
            if target.is_dir():
                target = target / "index.html"
            if not target.is_file():
                problems.append(f"{page.name}: {url} is not a file")
                continue
            if u.fragment and target.suffix == ".html" and "_vs_" not in u.fragment and u.fragment not in ids.get(target, set()):
                problems.append(f"{page.name}: {url} names no id")
            if target.suffix == ".html":
                queue.append(target)
            elif target.suffix == ".css":
                for ref in re.findall(r"url\(([^)]+)\)", read(target)):
                    ref = ref.strip("'\"")
                    if not ref.startswith("data:") and not _is_external(ref) and not (target.parent / ref.split("#")[0].split("?")[0]).is_file():
                        problems.append(f"{target.name}: url({ref}) is not a file")
    assert not problems, "\n".join(problems[:20])
    unreached = {p.relative_to(real_dist).as_posix() for p in _pages(real_dist)} - {p.relative_to(real_dist).as_posix() for p in seen}
    assert not unreached, f"pages no link leads to: {sorted(unreached)[:10]}"


def test_links_are_relative_so_the_site_works_under_any_address(real_dist):
    """No page, style sheet or script refers to the site by a path from the root, so the same files work at the root of a domain or in a sub-folder."""
    for page in _pages(real_dist):
        if page.name == "404.html":
            continue      # it sets its own base (see the 404 test)
        for tag, url in parse(page).refs:
            assert not url.startswith("/") and not url.startswith("file:"), (page.name, url)
    for css in real_dist.rglob("*.css"):
        assert not re.search(r"url\(\s*['\"]?/(?!/)", read(css)), css.name


def test_nothing_is_loaded_from_another_site(real_dist):
    """A visitor's browser contacts only this site (no fonts, scripts, styles, images, frames or data from elsewhere), and the site hosts no data files of the release."""
    for page in _pages(real_dist):
        p = parse(page)
        for tag, url in p.refs:
            if tag in ("script", "img", "source") or re.search(r"stylesheet|preload|icon|manifest", tag):
                assert not _is_external(url), (page.name, tag, url)
        assert not re.search(r"<(?:iframe|embed|object)\b", read(page)), page.name
    for f in list(real_dist.rglob("*.css")) + list(real_dist.rglob("*.js")):
        assert not re.search(r"@import\s+url\(\s*['\"]?https?:|url\(\s*['\"]?https?:", read(f)), f.name
        assert not re.search(r"""(?:fetch|XMLHttpRequest|open|import)\s*\(\s*['"]https?://""", read(f)), f.name
    hosted = [f.name for f in real_dist.rglob("*") if f.is_file() and (f.suffix == ".csv" or f.name == "SHA256SUMS")]
    assert not hosted, hosted


def test_every_page_has_a_title_one_h1_a_language_a_skip_link_and_named_controls(real_dist):
    """What a reader using a screen reader or a phone needs on every page."""
    for page in _pages(real_dist):
        p = parse(page)
        assert p.title.strip(), page.name
        assert p.h1 == 1, (page.name, p.h1)
        assert p.lang, page.name
        assert "width=device-width" in p.meta.get("viewport", ""), page.name
        assert len(p.ids) == len(set(p.ids)), (page.name, sorted({i for i in p.ids if p.ids.count(i) > 1}))
        assert 'href="#main"' in read(page) and "main" in p.ids, page.name
        assert p.imgs_without_alt == 0, page.name
        for tag, attrs, text in p.controls:
            named = text.strip() or attrs.get("aria-label") or attrs.get("aria-labelledby") or attrs.get("title") or attrs.get("id") in p.labels_for
            assert named, (page.name, tag, attrs)


def test_the_title_of_each_page_says_which_page_it_is(real_dist):
    """Two pages never share a title (tabs, history and search results would look the same)."""
    titles = {}
    for page in _pages(real_dist):
        titles.setdefault(parse(page).title.strip(), []).append(page.name)
    assert all(len(v) == 1 for v in titles.values()), {t: v for t, v in titles.items() if len(v) > 1}


def test_the_build_gives_the_same_files_every_time(real_results, real_dist, tmp_path):
    """Building twice from the same data writes identical files (so a change in the files is a change in the data or the code)."""
    out = tmp_path / "again"
    build_site(real_results, out, minify=True)
    a = {p.relative_to(real_dist).as_posix(): p.read_bytes() for p in real_dist.rglob("*") if p.is_file()}
    b = {p.relative_to(out).as_posix(): p.read_bytes() for p in out.rglob("*") if p.is_file()}
    assert a.keys() == b.keys()
    assert [k for k in a if a[k] != b[k]] == []


def test_scripts_and_styles_are_named_by_their_content_so_visitors_never_run_a_stale_one(real_dist):
    """Scripts and style sheets are published under names that carry a hash of their content; a page always asks for the file it was built with."""
    for page in _pages(real_dist):
        for tag, url in parse(page).refs:
            if tag == "script" or url.endswith(".css"):
                if not _is_external(url):
                    assert re.search(r"\.[0-9a-f]{10}\.(?:js|css)$", url), (page.name, url)


def test_links_into_the_results_repository_name_the_release_so_they_keep_working(real_dist, real_results):
    """A reader who follows a link to a data file, now or in a year, reaches the file of the release the page shows (a tag, never a branch that moves)."""
    tag = "v" + json.loads(read(real_results / "RELEASE.json"))["version"]      # the release is tagged with its version
    repo = json.loads(read(HERE / "site.json"))["results_repo_url"]
    n = 0
    for page in _pages(real_dist):
        for tagname, url in parse(page).refs:
            if url.startswith(repo + "/blob/") or url.startswith(repo + "/tree/"):
                assert url.startswith((f"{repo}/blob/{tag}/", f"{repo}/tree/{tag}/")), (page.name, url)
                n += 1
    assert n >= 5


def test_the_public_pages_can_be_found_and_shared(real_dist):
    """The public build is indexable, names its own address and describes itself for search results and link previews."""
    cfg = json.loads(read(HERE / "site.json"))
    page = read(real_dist / "index.html")
    assert 'name="robots"' not in page or "noindex" not in page
    assert f'rel="canonical" href="{cfg["site_url"]}"' in page
    assert parse(real_dist / "index.html").meta.get("description")
    assert 'property="og:title"' in page
    for p in _pages(real_dist):
        if p.name != "404.html":
            assert parse(p).meta.get("description"), p.name
    listed = set(read(real_dist / "sitemap.xml").split("<loc>")[1:])
    listed = {u.split("</loc>")[0] for u in listed}
    base = cfg["site_url"].rstrip("/")
    wanted = {f"{base}/" if p.relative_to(real_dist).as_posix() == "index.html" else f"{base}/{p.relative_to(real_dist).as_posix()}"
              for p in _pages(real_dist) if p.name != "404.html"}
    assert listed == wanted
    assert f"Sitemap: {base}/sitemap.xml" in read(real_dist / "robots.txt")


def test_the_page_for_an_unknown_address_is_served_from_the_site_root(real_dist):
    """A host serves 404.html at whatever address was asked for, so it names the site root as its base and everything it loads is found from there."""
    assert '<base href="/">' in read(real_dist / "404.html")


@pytest.mark.skipif(not NODE, reason="node is not installed")
@pytest.mark.parametrize("path,root", [("/missing.html", ""), ("/programs/nope.html", "../"), ("/assets/x/y.html", "../../")])
def test_without_a_base_address_the_404_page_finds_the_site_root_itself(real_results, tmp_path_factory, path, root):
    """For a site hosted in a sub-folder (no base address configured), the page's script points links and files back to the site root from one level down or two."""
    out = tmp_path_factory.mktemp("sub") / "dist"
    build_site(real_results, out, cfg={"base_url": ""})
    page = read(out / "404.html")
    script = re.search(r"<script>(\(function\(\)\{var p=location.*?)</script>", page, re.S).group(1)
    js = ("var made=[];var window={};var location={pathname:%s};var document={createElement:function(t){return {tag:t}},head:{appendChild:function(b){if(b.tag==='base')made.push(b.href)}}};%s;"
          "console.log(JSON.stringify(made.length?made[0]:''))" % (json.dumps(path), script))
    assert json.loads(subprocess.run([NODE, "-e", js], capture_output=True, text=True, check=True, timeout=30).stdout) == root
