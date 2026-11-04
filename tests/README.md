# Tests of the Agent Software Testing site

A short list of what must never break, and the test that guards each item. Everything else about the site may change freely.

## What must never break

| What a visitor or maintainer relies on | Test |
|---|---|
| Every link, script, style sheet, font and icon leads somewhere, every `#section` link finds its section and every page can be reached | `test_pages.py` (links lead somewhere) |
| The site works at the root of a domain or in a sub-folder, and a mistyped address gets the site's own page | `test_pages.py` (relative links, page for an unknown address) |
| A visitor's browser contacts only this site, and the site hosts no data files | `test_pages.py` (another site) |
| Every page has a title of its own, one main heading, a language, a skip link, named buttons and fields | `test_pages.py` (title, reader basics) |
| Building twice from the same data gives the same files, and changed scripts get new names | `test_pages.py` (repeatable, content names) |
| Links to data files name the release, and search engines can find the public site | `test_pages.py` (release links, found and shared) |
| Results, program pages, Compare, the branch maps and the front page strip show the numbers of the data, under the right tool | `test_numbers.py` |
| Nothing in the release is left off the site, and the release and date shown are right | `test_numbers.py` (completeness, release facts) |
| A newer version of a tool replaces the old one in Results and both stay in all versions | `test_numbers.py` (newer version) |
| Median, A12 and number formats are right, and tools on different tracks get no effect size | `test_statistics_and_compare.py` |
| Compare in the page script shows what the build would have written for the same pair | `test_statistics_and_compare.py` (needs node) |
| Text can be read in the light and the dark theme | `test_statistics_and_compare.py` (both themes) |
| Data that would make the site wrong stops the build, and a build never writes into or removes from another folder | `test_build_rules.py` |
| Text and addresses from the data cannot inject markup or run code | `test_build_rules.py` |
| A visitor can switch theme and keep it, sort tables, compare tools, find a program with Ctrl+K, see the branch maps drawn, see the front page map finish, read the tables without scripts and use the pages on a phone | `scripts/smoke.mjs`, run by `test_browser.py` (needs node and Chrome) |
| Layout at many widths, large text, forced colours, touch targets and the arranged branch map | `scripts/slow_checks.py` (slow) |

## Not covered on purpose

The wording of pages and the choice of colours and fonts. They may change without notice.

## Running

You need Python 3.12 or later and pytest. Tests that read real data need a checkout of the results repository.

```
export AGENT_SOFTWARE_TESTING_RESULTS=/path/to/agent-software-testing-results
python -m pytest                 # everyday run, a few seconds, no browser
python -m pytest -m browser      # browser smoke test, about a minute
python scripts/slow_checks.py "$AGENT_SOFTWARE_TESTING_RESULTS"   # slow sweeps, about twenty minutes
python scripts/break_it.py "$AGENT_SOFTWARE_TESTING_RESULTS"      # breaks the site on purpose and shows which bugs the tests catch
```

Without `AGENT_SOFTWARE_TESTING_RESULTS` the tests that read real data are skipped and say so. The browser tests need node and Google Chrome (set `CHROME` to the browser binary if it is not in the usual place); without them they are skipped and say so.
