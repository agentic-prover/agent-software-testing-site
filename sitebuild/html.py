# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 The Agent Software Testing authors
"""HTML helpers: escaping, the page shell (head, bar, footer, palette), small marks (line key, sparkline, strip)."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from . import mapdata, tokens
from .data import fmt

# Source Serif 4 (titles and prose, with its optical-size axis) and IBM Plex Sans (tables and controls, tabular figures). Both are under the SIL Open Font Licence.
FONTS_URL = ("https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400"
             "&family=Source+Serif+4:ital,opsz,wght@0,8..60,400..700;1,8..60,400..700&display=swap")
# The files of the self-hosted mode ("fonts": "self" in site.json): variable fonts, Latin subset, and the licence of each family, all in src/assets/fonts. The build
# stops with a list when one of the fonts is missing, and publishes these files only.
SELF_FONTS = ("source-serif-4-latin.woff2", "source-serif-4-latin-italic.woff2", "ibm-plex-sans-latin.woff2", "ibm-plex-sans-latin-italic.woff2", "funnel-display-latin.woff2", "funnel-sans-latin.woff2")
FONT_LICENCES = ("OFL-source-serif-4.txt", "OFL-ibm-plex-sans.txt", "OFL-funnel-display.txt", "OFL-funnel-sans.txt")
# Faces that every page needs at the first paint.
PRELOAD_FONTS = ("source-serif-4-latin.woff2", "ibm-plex-sans-latin.woff2", "funnel-display-latin.woff2")

# The mark is the Fork Loop: a C-shaped loop whose end splits into two nodes, drawn for 22 px (a heavier ring, thinner fork lines, larger nodes, so the two
# nodes stay apart). The filled node is a branch that is reached (the colour of the map's "reached" step, token --reached), the hollow one a branch that is
# not; the loop is currentColor. The favicon is the plate in src/logo/favicon.svg.
MARK = ('<svg class="mark" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">'
        '<path d="M11.1 11.87A5 5 0 1 1 7 4H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
        '<path d="M9 4L12.8 6.6M9 4L11.17 2.66" stroke="currentColor" stroke-width="1.2"/>'
        '<circle cx="12.4" cy="1.9" r="1.7" fill="var(--reached)"/><circle cx="14" cy="7.4" r="1.5" stroke="currentColor" stroke-width="1.1"/></svg>')

ICON = {
    "theme": '<svg class="i-moon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z"/></svg><svg class="i-sun" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"/></svg>',
    "search": '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/></svg>',
    "chev": '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1.5 7 5 3 8.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
}

# The colour of the browser's own frame on a phone, one per scheme (the --bg token of each).
THEME_COLOR = (f'<meta name="theme-color" content="{tokens.LIGHT["--bg"]}">\n'
               f'<script>try{{if(localStorage.getItem("theme")==="dark"){{document.documentElement.setAttribute("data-theme","dark");'
               f'document.querySelector(\'meta[name="theme-color"]\').content="{tokens.DARK["--bg"]}"}}}}catch(e){{}}</script>\n')

# For 404.html only. A host serves it for a missing address at any depth, so its relative links, style sheet, scripts and icons would break below the top level.
# With "base_url" in site.json the page names the site's root in a <base> element, and is then an ordinary page at any depth. Without it, a script finds how many folders
# below the root the address is by the names of the site's own folders (programs, data, assets) and points <base> at the root before any link is read; for an
# address below a folder of another name the root cannot be told, so the page is then a static one: it is styled (its style sheet is in the page, without the font
# files, which it would have to ask for) and asks for nothing else, and the controls that need a script are hidden (window.CR404 says which case it is).
NOT_FOUND_BASE = ("<script>(function(){var p=location.pathname.split('/');p.pop();var d=['programs','data','assets'],n=0,i;"
                  "for(i=p.length-1;i>=0;i--){if(d.indexOf(p[i])>=0){n=p.length-i;break;}}"
                  "if(n){var b=document.createElement('base');b.href=new Array(n+1).join('../');document.head.appendChild(b);}"
                  "window.CR404=n>0||p.length<2;"
                  "if(!window.CR404){var s=document.createElement('style');s.textContent='.js-only{display:none!important}';document.head.appendChild(s);"
                  "var l=document.createElement('link');l.rel='icon';l.href='data:,';document.head.appendChild(l);}})();</script>")

# The page for an unknown address names no icon, style sheet or script of the site in its markup, but has scripts add them once <base> is set. The browser reads a
# page's markup ahead of the parser (a preload scanner), before any script has run, so a link named in the markup would be asked for at the address of the missing page
# ("programs/assets/site.css", a second failing request for each file); an element that a script creates after the base is set is asked for at the right address.
# The style sheet is in the page when the build gives it (Site does), so the page is styled with no script and at any depth.
def not_found_loader(ctx: "Ctx") -> str:
    icons = ('["icon","assets/favicon.svg","image/svg+xml","any"],["icon","assets/favicon-32.png","image/png","32x32"],'
             '["icon","assets/favicon-16.png","image/png","16x16"],["apple-touch-icon","assets/apple-touch-icon.png"]')
    css = ctx.extras.get("css_404")
    sheet = "" if css else '["stylesheet","%s"],' % ctx.asset("assets/site.css").removeprefix(ctx.root)
    out = (f"<style>{css}</style>\n" if css else "")
    out += ('<script>(function(){if(!window.CR404)return;var h=[%s%s],i,l;for(i=0;i<h.length;i++){l=document.createElement("link");l.rel=h[i][0];l.href=h[i][1];'
            'if(h[i][2])l.type=h[i][2];if(h[i][3])l.sizes=h[i][3];document.head.appendChild(l);}})();</script>\n' % (sheet, icons))
    if not css:
        out += '<noscript><link rel="stylesheet" href="%s"></noscript>\n' % ctx.asset("assets/site.css")
    return out


def not_found_scripts(ctx: "Ctx", names: list[str]) -> str:
    """The scripts of the page for an unknown address (without a base_url), added in order after the page is read, and only where the root of the site is known."""
    paths = ",".join('"%s"' % ctx.asset(n).removeprefix(ctx.root) for n in names)
    return ('<script>(function(){if(!window.CR404)return;var s=[%s],i,e;for(i=0;i<s.length;i++){e=document.createElement("script");e.src=s[i];e.async=false;document.body.appendChild(e);}})();</script>\n' % paths)


# Without scripts, panels and rows that only a script can reveal are shown, and controls that need a script are hidden.
NOSCRIPT_STYLE = ('<noscript><style>.gpanel[hidden],.detail[hidden],tr[hidden]{display:revert!important}'
                  '.gp-title{position:static!important;width:auto!important;height:auto!important;margin:24px 0 8px!important;'
                  'clip:auto!important;clip-path:none!important;overflow:visible!important}'
                  '.js-only{display:none!important}.mapbox{min-height:0!important}.chart-host{height:auto!important}</style></noscript>')


# <main> starts with class no-js, which hides the controls that only a script can drive; this script, the first thing in <main>, removes the class
# before anything below it is painted (app.js removes it too, in case a host strips inline scripts).
MAIN_READY = '<script>document.getElementById("main").classList.remove("no-js")</script>\n'


def esc(s) -> str:
    """Escape text and attribute values. The browser-side renderers use the same replacements, so both give equal strings."""
    t = "" if s is None else str(s)
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;").replace("'", "&#39;")


def http_url(url) -> str:
    """The URL when it is an http(s) link, otherwise the empty string.

    Every address that comes from the release (a citation, a tool's project page, a reference) is written into an
    ``href``; a browser would follow ``javascript:`` there, so only these two schemes are allowed. Escaping cannot do
    this: it changes the characters, not the scheme.
    """
    t = "" if url is None else str(url)
    return t if re.match(r"https?://", t, re.IGNORECASE) else ""


@dataclass
class Ctx:
    """What a page needs to know about where it is written and how the site is built."""
    cfg: dict
    model: object
    facts: dict
    depth: int = 0                # 0 for pages in the site root, 1 for programs/<id>.html
    extras: dict = field(default_factory=dict)
    path: str = ""                # this page's file from the site root, "" for the home page; names it in the canonical URL

    @property
    def root(self) -> str:
        return "../" * self.depth

    @property
    def home(self) -> str:
        return self.root + "index.html"

    @property
    def results(self) -> str:
        return self.root + "results.html"

    def page(self, name: str) -> str:
        return self.root + name

    def asset(self, rel: str) -> str:
        """The address of a style sheet or a script as the pages write it: the content-hashed name that the build published, or the name itself where
        the page is made outside a build (the tests make pages from a bare context)."""
        return self.root + self.extras.get("assets", {}).get(rel, rel)

    def prog(self, pid: str, frag: str = "") -> str:
        base = f"{pid}.html" if self.depth else f"programs/{pid}.html"
        return base + (f"#{frag}" if frag else "")

    def at(self, depth: int) -> "Ctx":
        return Ctx(self.cfg, self.model, self.facts, depth, extras=self.extras)


NAV = [("Results", "results.html", "results"), ("Tools", "tools.html", "tools"), ("Compare", "compare.html", "compare"),
       ("Method", "method.html", "method"), ("Contribute", "contribute.html", "contribute")]


def site_name(ctx: Ctx) -> str:
    return ctx.cfg.get("site_name", "Agent Software Testing")


def title_of(ctx: Ctx, name: str) -> str:
    return f"{name} | {ctx.cfg.get('title_suffix', site_name(ctx))}"


def head(ctx: Ctx, title: str, desc: str, not_found: bool = False, extra_styles: list[str] | None = None) -> str:
    cfg = ctx.cfg
    r = ctx.root
    # display=swap: the web font is used as soon as it has loaded, also on a first visit over a slow network. The faces are files of the site ("fonts": "self" in
    # site.json, assets/fonts, see SELF_FONTS) and the two that every page needs are preloaded; "fonts": "google" asks Google Fonts for them instead.
    if cfg.get("fonts", "self") == "google":
        fonts = (f'<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
                 f'<link rel="stylesheet" href="{FONTS_URL}">\n')
    else:
        fonts = "".join(f'<link rel="preload" href="{r}assets/fonts/{f}" as="font" type="font/woff2" crossorigin>\n' for f in PRELOAD_FONTS)
    css = f'<link rel="stylesheet" href="{ctx.asset("assets/site.css")}">\n'
    # the style sheet that only some pages need (the program pages): after the common one, so that its rules come later in the cascade
    css += "".join(f'<link rel="stylesheet" href="{ctx.asset(x)}">\n' for x in (extra_styles or []) if x.removeprefix("assets/").removesuffix(".css") in ctx.extras.get("sheets", ["program", "compare", "prose", "home", "popup"]))
    robots = '<meta name="robots" content="noindex">\n' if cfg.get("noindex") else ""
    static_404 = not_found and bool(cfg.get("base_url"))      # a <base> in the markup: the page is then an ordinary one
    dynamic_404 = not_found and not static_404
    base = f'<base href="{esc(cfg["base_url"])}">\n' if static_404 else (NOT_FOUND_BASE + "\n" if dynamic_404 else "")
    icons = (f'<link rel="icon" href="{r}assets/favicon.svg" type="image/svg+xml" sizes="any">\n<link rel="icon" href="{r}assets/favicon-32.png" type="image/png" sizes="32x32">\n'
             f'<link rel="icon" href="{r}assets/favicon-16.png" type="image/png" sizes="16x16">\n'
             f'<link rel="apple-touch-icon" href="{r}assets/apple-touch-icon.png">\n')
    if dynamic_404:
        icons, tail = "", (fonts if cfg.get("fonts", "self") == "google" else "") + not_found_loader(ctx)
    else:
        tail = fonts + css
    # What a link preview and a search engine show, and the address that names this page when two addresses serve it. The
    # site's address is "site_url" in site.json; the 404 page carries none of this.
    social = ""
    if not not_found:
        base_url = str(cfg.get("site_url", "")).rstrip("/")
        # without the site's address there is no absolute URL to name, and a root-relative one would break the rule that the pages link to each other relatively
        canonical = f"{base_url}/{ctx.path}" if ctx.path else (base_url + "/" if base_url else "")
        social = (f'<meta property="og:type" content="website">\n'
                  f'<meta property="og:site_name" content="{esc(site_name(ctx))}">\n'
                  f'<meta property="og:title" content="{esc(title)}">\n'
                  f'<meta property="og:description" content="{esc(desc)}">\n')
        if base_url and canonical:
            social += f'<meta property="og:url" content="{esc(canonical)}">\n<link rel="canonical" href="{esc(canonical)}">\n'
        social += (f'<meta name="twitter:card" content="summary">\n'
                   f'<meta name="twitter:title" content="{esc(title)}">\n'
                   f'<meta name="twitter:description" content="{esc(desc)}">\n')
    return (f'<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            f'<meta name="color-scheme" content="light">\n<meta name="apple-mobile-web-app-title" content="{esc(site_name(ctx))}">\n{THEME_COLOR}{base}{robots}<title>{esc(title)}</title>\n'
            f'<meta name="description" content="{esc(desc)}">\n{social}{icons}{tail}\n{NOSCRIPT_STYLE}\n</head>\n')


def topbar(ctx: Ctx, active: str) -> str:
    # active "results/" marks Results as the parent of a program page (aria-current="true", the same look as the current page)
    parent = active.endswith("/")
    key = active.rstrip("/")
    nav = "".join(
        '<a href="%s"%s>%s</a>' % (ctx.page(h), (' aria-current="true"' if parent else ' aria-current="page"') if k == key else "", t)
        for t, h, k in NAV)
    # the maintainers' other sites (site.json "sibling_sites"): links after the pages of this one, in the same style (a navigation of their own, so that the pages keep one row on a phone)
    sites = "".join('<a href="%s">%s</a>' % (esc(s["url"]), esc(s["name"])) for s in ctx.cfg.get("sibling_sites", []))
    sites = f'<nav class="sites" aria-label="Other sites">{sites}</nav>\n' if sites else ""
    skip = '<a class="skip" href="#main">Skip to content</a>\n'      # on 404.html too; app.js moves the focus there, because that page sets a <base>
    # The bar holds the name, the five pages, the search and the switch between light and dark. White is the default.
    first, _, rest = site_name(ctx).partition(" ")
    wordmark = f"<b>{esc(first)}</b> {esc(rest)}" if rest else esc(first)
    return (f'{skip}<header class="topbar"><div class="topbar-in">\n'
            f'<a class="brand" href="{ctx.home}" aria-label="{esc(site_name(ctx))}, home">{MARK}<span>{wordmark}</span></a>\n'
            f'<nav class="nav fade-x" aria-label="Main">{nav}</nav>\n{sites}<div class="topbar-tools">\n'
            f'<button class="btn btn-search js-only" type="button" data-open-palette aria-label="Search programs and tools" aria-keyshortcuts="Control+K Meta+K">'
            f'{ICON["search"]}<span class="lbl">Search</span></button>'
            f'<button class="btn btn-theme js-only" type="button" data-theme-toggle aria-label="Switch between light and dark">{ICON["theme"]}</button></div></div></header>\n')


def palette() -> str:
    return ('<dialog class="pal" id="pal" aria-label="Search programs and tools">\n'
            '<input id="pal-in" type="text" role="combobox" aria-expanded="false" aria-controls="pal-list" aria-autocomplete="list" '
            'autocomplete="off" spellcheck="false" placeholder="Search programs and tools" aria-label="Search programs and tools">\n'
            '<ul id="pal-list" role="listbox" aria-label="Matches"></ul>\n'
            '<div class="sr" id="pal-status" role="status" aria-live="polite"></div>\n'
            '<div class="pal-foot"><button class="btn pal-close" type="button" data-close-palette>Close</button></div>\n</dialog>\n')


def release_line(ctx: Ctx, spans: str = "") -> str:
    """The line under the title of a data page: when the data last changed (a link to Updates) and, on the page that states them, the counts. It is part of the
    page frame, like the bar: a date and counts, no sentence."""
    day = ctx.facts.get("date_long", "")
    stamp = (f'<a class="relid" href="{ctx.page("releases.html")}" title="When the data last changed. Updates says what changed.">Updated {esc(day)}</a>' if day else "")
    return f'<div class="releaseline">{stamp}{spans}</div>'


TERM_GROUPS = ("Runs", "Tracks", "Measures", "Families", "Groups", "Versions", "Statistics")


def pool_range(ctx: Ctx) -> str:
    """The fewest and the most main-group tools that ran on a program ("4 to 12"), for the entry Unreached."""
    maps = ctx.extras.get("maps") or {}
    ns = [len(d["systems"]) for d in maps.values()]
    return f"{min(ns)} to {max(ns)}" if ns else "no"


def terms(ctx: Ctx, page_key: str) -> str:
    """The Terms disclosure of a page: one native details element (one tab stop, no script needed) that lists the words the page uses without
    explaining them, from content/terms.json, under sub-labels (Runs, Tracks, Measures, Families, Groups, Statistics). The text of each term has at most 20
    words; the list is page-specific."""
    items = [t for t in ctx.model.terms if page_key in t["pages"]]
    if not items:
        return ""
    rng = pool_range(ctx)
    out = ""
    for g in TERM_GROUPS:
        rows = ""
        for t in (x for x in items if x.get("group", "Runs") == g):
            more = f' <a href="{ctx.page("method.html")}#{esc(t["anchor"])}">Method</a>' if t.get("anchor") and page_key != "method" else ""
            dt = f'<span class="mono">{esc(t["term"])}</span>' if t.get("mono") else esc(t["term"])
            rows += f"<dt>{dt}</dt><dd>{esc(t['text']).replace('{pool_range}', rng)}{more}</dd>"
        if rows:
            out += f'<div class="tg" role="group" aria-label="{g}" data-g="{g}">{rows}</div>'
    return f'<details class="terms" id="terms"><summary aria-label="Terms, the words this page uses">Terms</summary><dl class="terms-dl" role="group" tabindex="0" aria-label="Terms">{out}</dl></details>'


def footer(ctx: Ctx) -> str:
    """The foot of every page: one line of links, from footer_links in site.json."""
    parts = [f'<a href="{esc(x["url"])}" rel="noopener">{esc(x["name"])}</a>' for x in ctx.cfg.get("footer_links", [])]
    line = " · ".join(parts)
    return (f'<footer class="foot"><div class="foot-in"><p>{line}</p></div></footer>\n'
            '<div id="live" class="sr" role="status" aria-live="polite"></div>\n')


def scripts(ctx: Ctx, extra: list[str] | None = None, not_found: bool = False, early: list[str] | None = None) -> str:
    """Deferred scripts, in order: the search index, the scripts that app.js uses (a page whose table needs the entries of the address), the behaviour shared by
    every page, then the scripts of the page."""
    if not_found and not ctx.cfg.get("base_url"):
        return not_found_scripts(ctx, ["assets/index.js", "assets/app.js"] + list(extra or []))
    tags = [f'<script src="{ctx.asset("assets/index.js")}" defer></script>']
    for s in early or []:
        tags.append(f'<script src="{ctx.asset(s)}" defer></script>')
    tags.append(f'<script src="{ctx.asset("assets/app.js")}" defer></script>')
    for s in extra or []:
        tags.append(f'<script src="{ctx.asset(s)}" defer></script>')
    return "\n".join(tags) + "\n"


def page(ctx: Ctx, *, key: str, title: str, desc: str, body: str, active: str = "", bar: str = "", main_attrs: str = "",
         extra_scripts: list[str] | None = None, extra_styles: list[str] | None = None, not_found: bool = False,
         early_scripts: list[str] | None = None) -> str:
    """One page: head, bar, main, footer and scripts."""
    attrs = f' data-page="{key}" data-root="{ctx.root}"{main_attrs}'
    hd = head(ctx, title, desc, not_found=not_found, extra_styles=extra_styles)
    inner = (topbar(ctx, active) + bar + f'<main id="main" class="shell no-js"{attrs} tabindex="-1">\n{MAIN_READY}{body}\n</main>\n'
             + footer(ctx) + palette() + scripts(ctx, extra_scripts, not_found, early_scripts))
    return hd + "<body>\n" + inner + "</body>\n</html>\n"


# ---- marks -----------------------------------------------------------------------------------------------------

def slot_of(s: dict, neutral: bool = False) -> int:
    """Colour slot of a tool in a mark: its own, or 0 (a neutral ink) where the colour would mean something else."""
    return 0 if neutral else s["slot"]


def line_key(s: dict, neutral: bool = False) -> str:
    dash = f" d{s['dash']}" if s["dash"] else ""
    return (f'<span class="keyswatch" aria-hidden="true"><svg viewBox="0 0 22 10"><line class="c{slot_of(s, neutral)}{dash}" x1="2" y1="5" x2="20" y2="5" '
            f'stroke-width="2" stroke-linecap="round"/></svg></span>')


def sparkline(vals, s: dict, label: str, neutral: bool = False, ymax: float | None = None, hidden: bool = False) -> str:
    """A small curve. `ymax` is the top of the scale (the largest value of the table, or the program's branch total), so that curves of one table are
    drawn on one scale; without it the curve fills its own box. `hidden` leaves it out for assistive technology: the numbers are in the cells beside it
    and the chart of the page has the series, so a named image that repeats the row would only be announced as an empty one."""
    if not vals:
        return '<span class="muted">–</span>'
    w, h, pad = 88, 22, 2
    mx, mn, n = (ymax if ymax else max(vals)), 0, len(vals)
    if mx <= mn:
        mx = mn + 1
    pts = [(pad + (w - 2 * pad) * i / (n - 1), h - pad - (h - 2 * pad) * (vals[i] - mn) / (mx - mn)) for i in range(n)]
    line = "M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in pts)
    area = f"{line}L{pts[-1][0]:.1f} {h - pad}L{pts[0][0]:.1f} {h - pad}Z"
    dash = f" d{s['dash']}" if s["dash"] else ""
    role = 'aria-hidden="true" focusable="false"' if hidden else f'role="img" aria-label="{esc(label)}"'
    return (f'<svg class="spark c{slot_of(s, neutral)}{dash}" viewBox="0 0 {w} {h}" {role}><path class="a" d="{area}"/>'
            f'<path d="{line}"/></svg>')


def _sky_paths(parts: list[dict], S: int, unit: int, hmax: int) -> str:
    """The bars of a skyline, drawn as vertical strokes (the shortest form): one path per class of the legend in a group that is shifted by half a part and
    sets the stroke width to the width of a part. A part is stacked from the baseline in the order of the legend; its bar is as tall as the share of its
    branches that some tool reaches and each segment is as tall as the share of its class (whole units of the drawing, mapdata.stack_edges). The rest of the
    column is the track, the colour of the branches that no tool reaches."""
    n = len(mapdata.count_classes(S))
    by: list[list[str]] = [[] for _ in range(n)]
    for i, q in enumerate(parts):
        if not q["reached"]:
            continue
        edges, lo = mapdata.stack_edges(q, hmax), 0
        for k, top in enumerate(edges):
            if top > lo:
                by[k].append(f"M{i * unit} {hmax - lo}v{lo - top}")
                lo = top
    half = f"{unit / 2:g}"
    paths = "".join(f'<path class="r{mapdata.ramp_index(n, k)}" d="{"".join(v)}"/>' for k, v in enumerate(by) if v)
    return f'<g transform="translate({half} 0)" stroke-width="{unit}" fill="none">' + paths + "</g>"


def sky_label(doc: dict, name: str) -> str:
    S, total, none = len(doc["systems"]), doc["total"], doc["summary"]["none"]
    nf = len(doc["files"])
    return (f"{name}: {fmt(total)} branches in {nf} {'file' if nf == 1 else 'files'}, in source order. A bar is as tall as the share of a part’s branches that some of the "
            f"{S} main-group {'tool' if S == 1 else 'tools'} reach, and its colours give how many tools reach each of them; {fmt(none)} branches ({none / total * 100:.1f}%) are unreached.")


SKY_LABELS = 5               # files named under a skyline: the largest ones
SKY_LABEL_MIN = 0.025        # and only those with at least this share of the branches


def sky_full(doc: dict, name: str) -> str:
    """The skyline of a program page: 240 parts in source order that partition the universe, stacked bars (height: the share of a part's branches that some tool reaches, colour: the classes of the map), the file boundaries,
    and the names of the five largest files of at least 2.5 percent of the branches (except system headers under /usr/); a name may run on over small files
    that follow, and is left out where it would run into the one before. A static drawing: it needs no script."""
    S, total = len(doc["systems"]), doc["total"]
    unit, hmax, W = 4, 52, 4 * mapdata.SKY_FULL
    parts = mapdata.sky_parts(doc, mapdata.SKY_FULL) if S else []
    seps, labels = [], []
    big = sorted((f for f in doc["files"] if f["count"] / total >= SKY_LABEL_MIN and not f["name"].startswith("/usr/")), key=lambda f: (-f["count"], f["start"]))[:SKY_LABELS]
    named = {f["start"] for f in big}
    end_prev = -1e9
    for f in doc["files"]:
        x = f["start"] / total * W
        seps.append(f"M{x:.1f} {hmax + 1}v4")
        if f["start"] in named:
            base = f["name"].rsplit("/", 1)[-1]
            if x + 3 >= end_prev + 6 and x + 3 + len(base) * 6.4 <= W:
                labels.append(f'<text x="{x + 3:.1f}" y="{hmax + 17}">{esc(base)}</text>')
                end_prev = x + 3 + len(base) * 6.4
    h = hmax + 22
    return (f'<svg class="sky-svg" viewBox="0 0 {W} {h}" role="img" aria-label="{esc("Skyline of " + sky_label(doc, name))}" focusable="false">'
            f'<rect class="trk" width="{W}" height="{hmax}"/>{_sky_paths(parts, S, unit, hmax)}'
            f'<path class="ax" d="M0 {hmax + 0.5}h{W}"/><path class="fs" d="{"".join(seps)}"/>{"".join(labels)}</svg>')


def sky_legend(doc: dict) -> str:
    """The legend of the skyline: the classes with the number of branches in each (they add up to the program's branch total, the unreached branches
    included), then the key of what height and colour mean. Once the branch map is drawn, its own key repeats the classes and this one is hidden from
    assistive technology (program.js)."""
    S = len(doc["systems"])
    cl, counts = mapdata.count_classes(S), mapdata.class_counts(doc)
    items = "".join(f'<span class="sk"><i class="sw r{mapdata.ramp_index(len(cl), k)}"></i>{esc(mapdata.class_label(S, lo, hi))} <b>{fmt(counts[k + 1])}</b></span>'
                    for k, (lo, hi) in enumerate(cl))
    items += f'<span class="sk"><i class="sw trk"></i>Unreached <b>{fmt(counts[0])}</b></span>'
    return f'<div class="sky-lg" data-sky-lg>{items}</div>'


def tbl_wrap(inner: str, label: str, cls: str = "") -> str:
    """The frame of a table: a focusable scrolling region inside a .tbl-cue, which carries the edges that show on which side a frame that scrolls sideways has
    more (they are drawn over the head as well; app.js sets which show). cls "stickyhead" is for the two long tables (Results, Tools): their head sticks under the bar."""
    c = f"tbl-wrap {cls}".strip()
    return f'<div class="tbl-cue"><div class="{c}" tabindex="0" role="region" aria-label="{esc(label)}">{inner}</div></div>'


IND = '<span class="ind"></span>'
NB_TOKENS = re.compile(r"(Direct-Input|GPT-5\.5)")


def nb(text: str) -> str:
    """Escaped text in which the names of a model or a backend that hold a hyphen or a dot are one unbreakable token, so that a narrow column heading never splits
    "Direct-Input" or "GPT-5.5" in the middle."""
    return NB_TOKENS.sub(r'<span class="nb">\1</span>', esc(text))


def sort_head(key: str, label: str, extra: str = "", right: bool = False) -> str:
    """The content of a sortable column heading: its label as plain text, which shows only while no script runs, and the sort button, which
    holds the same label and shows only when a script runs (site.css, .no-js). `extra` is what follows the label inside both (a sub-label, a track).
    The sort glyph is part of the text: at the end of the last line of the heading, or at the start of it in a right-aligned column. When `extra`
    holds the marker {ind}, the glyph goes there (into the last block of a heading of several lines); otherwise it follows the label."""
    in_extra = "{ind}" in extra
    top = f'<span class="th-top">{label}</span>' if in_extra else f'<span class="th-top">{IND + label if right else label + IND}</span>'
    return (f'<span class="th-static"><span class="th-top">{label}</span>{extra.replace("{ind}", "")}</span>'
            f'<button class="sort" type="button" data-k="{key}">{top}{extra.replace("{ind}", IND)}</button>')


def sort_th(key: str, label: str, cls: str = "") -> str:
    c = f' class="{cls}"' if cls else ""
    return f'<th{c} scope="col" aria-sort="none">{sort_head(key, label, right="r" in cls.split())}</th>'


def dag(title: str = "Fewer than three runs") -> str:
    return f'<sup class="dag" title="{esc(title)}">†</sup>'

