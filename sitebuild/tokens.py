# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 The Agent Software Testing authors
"""Colour tokens, the only place where colours are written.

Light values go on bare :root, dark values when the visitor chooses the dark theme. The series colours are the eight categorical slots of the
data-visualisation palette in their fixed order; the branch-map ramp is five steps of one blue (ordinal). In light mode slots 3, 4 and 5 are darker steps of the same
hues (hue and chroma kept, lightness lowered), so that every series colour is at least 3:1 against the white surface (WCAG 1.4.11).
"""
from __future__ import annotations

LIGHT = {
    "--bg": "#ffffff", "--surface": "#ffffff", "--surface-2": "#f3f5f8", "--surface-3": "#e4e9f0",
    "--line": "#e1e5ec", "--line-2": "#c9d0db",
    "--ink": "#14213a", "--ink-2": "#3a4760", "--ink-3": "#566377",
    "--accent": "#1c5cab", "--accent-ink": "#ffffff", "--accent-wash": "rgba(28, 92, 171, 0.08)", "--focus": "#1c5cab",
    "--ctl-line": "#7d8794", "--bar": "#566377", "--cmp-a": "#14213a", "--cmp-b": "#8a93a0",
    "--grid": "#e8ebef", "--axis": "#c3c9d1", "--hover": "rgba(20, 33, 58, 0.05)", "--edge": "rgba(20, 33, 58, 0.16)",
    "--pop-shadow": "rgba(20, 33, 58, 0.16)", "--scrim": "rgba(20, 33, 58, 0.4)", "--lw-weak": "2.5px",
    "--s1": "#2a78d6", "--s2": "#eb6834", "--s3": "#04a571", "--s4": "#c38400",
    "--s5": "#e56a99", "--s6": "#008300", "--s7": "#4a3aa7", "--s8": "#e34948",
    "--ramp-1": "#86b6ef", "--ramp-2": "#5194e2", "--ramp-3": "#2171ce", "--ramp-4": "#0b52a2", "--ramp-5": "#013573",
    "--reached": "var(--ramp-4)", "--map-none": "#7d8794",
    "--map-empty": "#d5dbe3", "--map-dim": "#f3f5f8", "--map-unique": "#b3329e", "--map-unique-dot": "#ffffff",
    "--map-selected": "#1c5cab", "--map-ghost": "#b7d3f6", "--map-none-focus": "#3a4760",
}

DARK = {
    "--bg": "#0e1625", "--surface": "#0e1625", "--surface-2": "#16213a", "--surface-3": "#212e4b",
    "--line": "#222e47", "--line-2": "#34425f",
    "--ink": "#e9eef6", "--ink-2": "#b9c4d6", "--ink-3": "#93a0b6",
    "--accent": "#86b6ef", "--accent-ink": "#0e1625", "--accent-wash": "rgba(134, 182, 239, 0.12)", "--focus": "#86b6ef",
    "--ctl-line": "#6b7a93", "--bar": "#93a0b6", "--cmp-a": "#e9eef6", "--cmp-b": "#6b7a93",
    "--grid": "#1a2539", "--axis": "#34425f", "--hover": "rgba(233, 238, 246, 0.06)", "--edge": "rgba(0, 0, 0, 0.5)",
    "--pop-shadow": "rgba(0, 0, 0, 0.55)", "--scrim": "rgba(0, 0, 0, 0.6)", "--lw-weak": "2px",
    "--s1": "#3987e5", "--s2": "#d95926", "--s3": "#199e70", "--s4": "#c98500",
    "--s5": "#d55181", "--s6": "#008300", "--s7": "#9085e9", "--s8": "#e66767",
    "--ramp-1": "#184f95", "--ramp-2": "#1c6dca", "--ramp-3": "#4d90de", "--ramp-4": "#82b2eb", "--ramp-5": "#b7d3f5",
    "--reached": "var(--ramp-3)", "--map-none": "#6b7480",
    "--map-empty": "#243049", "--map-dim": "#16213a", "--map-unique": "#f86be5", "--map-unique-dot": "#0e1625",
    "--map-selected": "#86b6ef", "--map-ghost": "#1f3d66", "--map-none-focus": "#b9c4d6",
}

# Non-colour tokens, written once on :root.
SCALE = """  --font-serif: "Source Serif 4", "Source Serif 4 Fallback", Charter, Georgia, "Times New Roman", serif;
  --font-display: "Source Serif 4", "Source Serif 4 Display Fallback", Charter, Georgia, "Times New Roman", serif;
  --font-sans: "IBM Plex Sans", "IBM Plex Sans Fallback", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  --fs-sm: 0.8125rem;
  --fs-base: 0.9375rem;
  --fs-lg: 1.125rem;
  --fs-xl: 1.625rem;
  --fs-2xl: 2.25rem;
  --fs-display: clamp(2.125rem, 1.2rem + 3.6vw, 3.5rem);
  --r-1: 3px;
  --r-2: 4px;
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 24px;
  --sp-6: 40px;
  --sp-7: 64px;
  --col: 38rem;
  --wide: 72rem;
  --ease: cubic-bezier(0.2, 0, 0, 1);
  --dur-1: 120ms;
  --dur-2: 180ms;
  --bar-h: 64px;
  --font-head: "Funnel Display", ui-sans-serif, system-ui, sans-serif;
  --font-head-text: "Funnel Sans", ui-sans-serif, system-ui, sans-serif;
  --gutter: 16px;"""

# The favicon: the plate is the ink of the light theme, the reached node the colour of the dark theme's --reached (a step of the ramp), the loop and the
# other node an off-white of the logo. The drawing is on the 16 by 16 grid (the ring is 2 px wide and lies on whole pixels, so it stays crisp at 16 px and, as
# an integer multiple, at 32 px). The second node is solid on purpose: a hollow one is a grey ring at 16 px.
LOGO = {"plate": LIGHT["--ink"], "glyph": "#f2f4f7", "blue": DARK["--ramp-3"]}


def favicon_svg() -> str:
    """src/logo/favicon.svg and assets/favicon.svg, written from LOGO so that no colour of the favicon is a literal that the tokens do not know."""
    c = LOGO
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"><rect width="16" height="16" rx="3.5" fill="{c["plate"]}"/>'
            f'<path d="M9.28 11.29A4 4 0 1 1 6 5H8" fill="none" stroke="{c["glyph"]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
            f'<path d="M8 5L11.4 3M8 5L12.4 7.5" fill="none" stroke="{c["glyph"]}" stroke-width="1.2" stroke-linecap="round"/>'
            f'<circle cx="11.7" cy="3" r="1.8" fill="{c["blue"]}"/><circle cx="12.7" cy="7.8" r="1.5" fill="{c["glyph"]}"/></svg>')


def _block(values: dict, indent: str) -> str:
    return "\n".join(f"{indent}{k}: {v};" for k, v in values.items())


def css() -> str:
    """Tokens: light on bare :root, dark when the visitor chooses it (data-theme on the root element)."""
    return (
        ":root {\n  color-scheme: light;\n" + _block(LIGHT, "  ") + "\n" + SCALE + "\n}\n\n"
        ":root[data-theme=\"dark\"] {\n  color-scheme: dark;\n" + _block(DARK, "  ") + "\n}\n\n"
        "@media (min-width: 720px) {\n  :root { --gutter: 24px; }\n}\n"
        "/* Below 900 px, or on a screen less than 521 px high, the top bar scrolls away; only the section bars stick. */\n"
        "@media (max-width: 899px), (max-height: 520px) {\n  :root { --bar-h: 0px; }\n}\n"
    )
