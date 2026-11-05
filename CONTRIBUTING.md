# Contributing to the Agent Software Testing site

This repository generates the static website of Agent Software Testing from the data of the results repository (`agent-software-testing-results`). The output
is plain HTML, CSS, JavaScript and data files with relative links only. The standard itself is in the `agent-software-testing` repository. Everyone who takes part
follows its Code of Conduct (`CODE_OF_CONDUCT.md`).

## Where to take a problem

| Problem | Where |
|---|---|
| The site (layout, text, links, charts, accessibility, the build) | An issue here, with the **Site issue** form. |
| A wrong or mislabelled number or label that comes from the data | `agent-software-testing-results`, **Data issue** form. The site displays the data and adds no numbers of its own. |
| The runner, the specification or a program definition | `agent-software-testing`. |
| A way to inject script or markup into a page | Privately, see `SECURITY.md` of the `agent-software-testing` repository. |

## Set up and build

You need Python 3.12 or later and `pytest` for the tests. `build.py` uses only the standard library. Put this repository next to
`agent-software-testing-results` or name the results checkout with the argument `RESULTS_DIR` or with the environment variable `AGENT_SOFTWARE_TESTING_RESULTS`.

```
python build.py [RESULTS_DIR] [--out dist] [--config site.json]
python -m http.server -d dist 8000
```

The build is deterministic and refuses to write into a non-empty folder that it did not create. `dist/` is generated and is not committed. `README.md` lists the
other options and describes how the site is deployed.

## Check your change

```
python scripts/check_site.py dist
python -m pytest
```

`check_site.py` serves the build locally, fetches every page and follows every relative link, script, style sheet and fragment. It checks the rules below that a
program can check, such as page titles, the viewport tag, the dark theme, external hosts, colour literals and the order of the forced-colour rules. The tests build a
small synthetic release and, when `AGENT_SOFTWARE_TESTING_RESULTS` names a results checkout, the real one. They include negative cases such as a broken link, a bad title, a foreign
script and hostile text in a label. `tests/README.md` lists what they guard and the slower browser checks.

## Where things are

```
build.py        the builder
sitebuild/         the generator (data.py, mapdata.py, herodata.py, strip.py, pages.py, html.py, tokens.py, assets.py, site.py)
content/        wording, constants and the prose of Method and Contribute (content/pages/*.html with {{placeholders}})
src/assets/     style sheets and scripts; the colour tokens are written by sitebuild/tokens.py and put in front of site.css by the build
scripts/        check_site.py and the browser checks
tests/          pytest tests
site.json       settings of the build
```

The prose of Method and Contribute can be edited without touching Python. Prose that quotes a number takes it from the data at build time; do not type
numbers that the data holds.

## Rules for the site

* **Short pages.** Detail that a first-time visitor does not need belongs in the specification and the results repository.
* **No overall ranking.** Tables and charts show medians per program. The site adds no total, no average over programs and no "best" marker. Every table states
  the track, budget, cores, number of runs and measure of each entry. Say which numbers are medians and over how many runs.
* **Counts only for sanitiser findings.** The site shows counts by error kind and nothing else about findings. No frames, file or function names, stack traces
  or inputs.
* **Relative links only**, so the site works under any base path. Every fragment link must point to an id that exists.
* **No external scripts.** The fonts are files of the site (`src/assets/fonts`). Do not add analytics, trackers or other third-party requests.
* **Everything is readable without JavaScript.** Without it every view is shown and the tables are complete. Scripts add sorting, switches, charts and
  the branch maps.
* **Escape everything that comes from the data.** Names and labels are HTML-escaped; scripts insert text with `textContent`.
* **Colour and themes.** Colour tokens are CSS custom properties written by `sitebuild/tokens.py`, light on `:root` and dark under `:root[data-theme="dark"]`. A
  visitor switches theme and the choice is kept. Each tool has one colour and each entry one line style on every page, derived from the data. Check both themes.
* **Phones.** No horizontal scroll of the page. Tables scroll inside their own frame.
* **Page titles** are a name of one to four words, before the site name that follows ` | `.
* **Plain and precise text.** Say what is measured and what is not. Do not claim more than the data shows.

## Adding a system

A new entry and a new version of a tool need no change of code. An entry is a row of `systems.csv` with the columns `tool_id`, `version`, `config`,
`config_sha256`, `submitted`, `first_release`, `status` and `supersedes`; its tool is a row of `tools.csv`. The build derives the colour (from the place of the tool in
`tools.csv`) and the line style (from the order of submission among the tool's entries), shows the current entries of every tool in the default view and the others
under "Versions: All" and writes a page for every tool and the Updates page. The name of the entry is built from its tool, a variant, its model (or cores) and a setting
(`content/systems.json`, `entry_name` in `sitebuild/data.py`). A chart draws every current entry of a view, one line each.

## Pull requests

1. Make a branch from `main` and keep the change focused.
2. Run `python scripts/check_site.py dist` and `python -m pytest` and say that you did.
3. For a visible change, add screenshots in light and dark mode and at phone width (about 375 px).
4. Add or update a test when you change what the builder or the checker does, including a negative test when you add a rule.
5. Maintainers review and merge. The results repository publishes the site the next time its workflows run.

The code is licensed under Apache-2.0 (`LICENSE`); by contributing you license your contribution the same way. The results data is licensed under CC BY 4.0.
