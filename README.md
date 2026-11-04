# Agent Software Testing site

The website of Agent Software Testing. It shows the branch coverage of test generators on open-source programs, with every run replayed the same way.
The site is generated from a results release (the `agent-software-testing-results` repository). The output is plain HTML, CSS, JavaScript and small data
files with relative links only, so any static file server can host it, at the root of a domain or in a sub-folder.

The site has a front page with a branch map and a strip of every program, Results (the sortable table of median final branch coverage), a page for every
program, Tools, a page for every tool, Compare, Releases, Method, Contribute and a page for an unknown address. It hosts no results files. The pages
link to them in the results repository.

## Build

You need Python 3.12 or later. The build uses only the standard library.

```
python build.py [RESULTS_DIR] [--out DIR] [--config site.json] [--prune] [--precompress] [--no-minify] [--no-split]
```

`RESULTS_DIR` is a checkout of the results repository. It defaults to the folder named in the environment variable `AGENT_SOFTWARE_TESTING_RESULTS` and otherwise to
`../agent-software-testing-results`. The output goes to `dist/` unless `--out` names another folder.

- The build is deterministic. The same release gives byte-identical files.
- It refuses to write into a non-empty folder that it did not create. It records what it wrote in a file beside the output folder (`dist.build-manifest`),
  and files from an earlier build that this one no longer writes are reported and kept unless `--prune` is given.
- Style sheets and scripts are published under names that carry a hash of their content (`assets/site.4de0e12b91.css`). `--no-minify` and `--no-split`
  publish them as they are written in `src/assets/`.
- `--precompress` also writes a gzip copy of every text file, for a host that serves pre-compressed files.
- `site.json` holds the settings: the site name, the description for search results, the public address (`site_url`), the base path (`base_url`), whether
  search engines are asked to stay away (`noindex`), the tag that links to results files name (`release_ref`), the repository addresses, the fonts
  (`self` or `google`), the links in the bar and the foot.

To look at a build, serve the folder, for example with `python -m http.server -d dist 8000`.

## Check and test

```
python scripts/check_site.py dist       # serves a build on loopback, follows every link, asset and fragment; checks the rules of the site
python -m pytest                        # the everyday tests, a few seconds
python -m pytest -m browser             # the browser smoke test, needs node and Google Chrome
```

`tests/README.md` lists what the tests guard and describes the slower checks (`scripts/slow_checks.py` and `scripts/break_it.py`). The tests that read real
data need `AGENT_SOFTWARE_TESTING_RESULTS` to name a results checkout. Without it they are skipped and say so.

## Deploy

GitHub Pages serves the built pages from `docs/` on `main` at `https://agent-software-testing.aprover.ai/`, with no build step.

1. Build into a new folder with the results release to publish: `python build.py RESULTS_DIR --out NEW_FOLDER`.
2. Check it: `python scripts/check_site.py NEW_FOLDER`.
3. Replace the pages in `docs/` with the build and keep `docs/CNAME`. Leave the hashed style sheets and scripts of the previous deploy in place for one more
   deploy, because Pages lets browsers keep files for ten minutes.
4. Commit and push.

Pages does not serve `.gz` files, so do not use `--precompress` for it. A host that is configured by hand should serve `404.html` for an unknown address with
status 404 and compress text files. It can send `Cache-Control: public, max-age=31536000, immutable` for the files under `assets/` whose names carry a hash.

## Where things come from

Every number on a page comes from the release. The build checks the release for contradictions and stops when it finds one. Wording lives in `content/`.

| What | Source |
|---|---|
| Descriptions of programs, tools and entries, citations, the order of the groups | `content/programs.json`, `content/systems.json`, `content/styles.json` |
| The words in the Terms list of each page | `content/terms.json` |
| Constants of the replay standard that Method quotes | `content/spec.json` |
| The prose of Method and Contribute (with `{{placeholders}}` filled from the release) | `content/pages/*.html` |
| Height reserved for the branch map on a program page | `content/mapheights.json`, written by `node scripts/mapheights.mjs` (run it again after a change to the text the map writes, then rebuild) |

## Layout

```
build.py        command line of the generator
sitebuild/         the generator: data.py (release, rules, statistics), mapdata.py, herodata.py, strip.py, pages.py, html.py, tokens.py (colours), assets.py, site.py
content/        wording and constants (above)
src/assets/     style sheets, scripts and the fonts that the pages use
src/logo/       the favicon set
scripts/        check_site.py and the browser checks that tests/README.md describes
tests/          pytest suite
docs/           the built site that GitHub Pages serves
site.json       settings of the build
```

## Licence

Apache-2.0 (see `LICENSE`). Copyright 2026 The Agent Software Testing authors. The data of a release is under CC BY 4.0.
