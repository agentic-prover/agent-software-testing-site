# Agent Software Testing site

The website of Agent Software Testing. It shows the branch coverage of test generators on open-source programs, with every run replayed the same way.
The site is generated from the data of the results repository (`agent-software-testing-results`). The output is plain HTML, CSS, JavaScript and small data
files with relative links only, so any static file server can host it, at the root of a domain or in a sub-folder.

The site has a front page with a branch map and a strip of every program, Results (the sortable table of median final branch coverage), a page for every
program, Tools, a page for every tool, Compare, Updates, Method, Contribute and a page for an unknown address. It hosts no results files. The pages
link to them in the results repository.

## Build

You need Python 3.12 or later. The build uses only the standard library.

```
python build.py [RESULTS_DIR] [--out DIR] [--config site.json] [--prune] [--precompress] [--no-minify] [--no-split]
```

`RESULTS_DIR` is a checkout of the results repository. It defaults to the folder named in the environment variable `AGENT_SOFTWARE_TESTING_RESULTS` and otherwise to
`../agent-software-testing-results`. The output goes to `dist/` unless `--out` names another folder.

- The build is deterministic. The same data gives byte-identical files.
- It refuses to write into a non-empty folder that it did not create. It records what it wrote in a file beside the output folder (`dist.build-manifest`),
  and files from an earlier build that this one no longer writes are reported and kept unless `--prune` is given.
- Style sheets and scripts are published under names that carry a hash of their content (`assets/site.4de0e12b91.css`). `--no-minify` and `--no-split`
  publish them as they are written in `src/assets/`.
- `--precompress` also writes a gzip copy of every text file, for a host that serves pre-compressed files.
- `site.json` holds the settings: the site name, the description for search results, the public address (`site_url`), the base path (`base_url`), whether
  search engines are asked to stay away (`noindex`), the tag or commit that links to results files name (`release_ref`), the repository addresses, the fonts
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

The results repository publishes the site at `https://agent-software-testing.aprover.ai/`. Its workflows check out `main` of this repository, build
with `scripts/pages_build.py` and deploy to GitHub Pages after each merge of a submission, after a withdrawal and when "Publish" is run by hand. A change
here reaches the site the next time they run. To publish it at once, run "Publish" in the results repository with both fields empty.

```
python scripts/pages_build.py RESULTS_DIR OUT [--preview CANDIDATE_DIR]
```

It builds with the settings of `site.json`, links results files to the exact commit of `RESULTS_DIR` and writes `OUT` only after `check_site.py` has
passed. With `--preview` it adds a build from `CANDIDATE_DIR` under `preview/`, hidden from search engines.

Pages does not serve `.gz` files, so do not use `--precompress` for it. A host that is configured by hand should serve `404.html` for an unknown address with
status 404 and compress text files. It can send `Cache-Control: public, max-age=31536000, immutable` for the files under `assets/` whose names carry a hash.

## Where things come from

Every number on a page comes from the results data. The build checks the data for contradictions and stops when it finds one. Wording lives in `content/`.

| What | Source |
|---|---|
| Descriptions of programs, tools and entries, citations, the order of the groups | `content/programs.json`, `content/systems.json`, `content/styles.json` |
| The words in the Terms list of each page | `content/terms.json` |
| Constants of the replay standard that Method quotes | `content/spec.json` |
| The prose of Method and Contribute (with `{{placeholders}}` filled from the data) | `content/pages/*.html` |
| Height reserved for the branch map on a program page | `content/mapheights.json`, written by `node scripts/mapheights.mjs` (run it again after a change to the text the map writes, then rebuild) |

## Layout

```
build.py        command line of the generator
sitebuild/         the generator: data.py (data, rules, statistics), mapdata.py, herodata.py, strip.py, pages.py, html.py, tokens.py (colours), assets.py, site.py
content/        wording and constants (above)
src/assets/     style sheets, scripts and the fonts that the pages use
src/logo/       the favicon set
scripts/        check_site.py, pages_build.py and the browser checks that tests/README.md describes
tests/          pytest suite
site.json       settings of the build
```

## Licence

Apache-2.0 (see `LICENSE`). Copyright 2026 The Agent Software Testing authors. The results data is under CC BY 4.0.
