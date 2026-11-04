"""What a visitor does in a browser, on the site as it ships. Not part of the everyday run; start it with  pytest -m browser  (about a minute).

The checks are in scripts/smoke.mjs. It stops itself after its own time limit and the test adds another one on top, so a hung browser cannot hold the run."""
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

from conftest import HERE, PORT_OFFSET

pytestmark = pytest.mark.browser
NODE = shutil.which("node")
CHROME = os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")


def test_a_visitor_can_use_the_site_in_a_browser(real_dist):
    if not NODE or not Path(CHROME).is_file():
        pytest.skip("the browser checks need node and Google Chrome (set CHROME to the browser binary); they were not run")
    try:
        r = subprocess.run([NODE, str(HERE / "scripts/smoke.mjs"), "--dist", str(real_dist), "--port", str(9500 + PORT_OFFSET), "--limit", "240"], capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired as e:
        pytest.fail("the browser checks did not finish in 300 seconds\n" + (e.stdout.decode() if isinstance(e.stdout, bytes) else (e.stdout or ""))[-1500:])
    assert r.returncode == 0, "\n".join(l for l in r.stdout.splitlines() if l.startswith("FAIL")) + "\n" + r.stderr[-800:]
    assert "all checks passed" in r.stdout
