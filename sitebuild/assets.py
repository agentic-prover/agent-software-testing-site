# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 The Agent Software Testing authors
"""Style sheets and scripts as the build publishes them: the split of the style sheet into the part every page needs and the parts that only some pages need (the
program pages, Compare, the two pages of prose), and the minifier of style sheets and scripts (standard library only). `src/` stays readable; `python build.py
--no-minify` publishes the files as they are written (and `--no-split` keeps one style sheet).

The split is by selector: a selector goes to the sheet of a kind of page when it names something that only that kind of page has (for the program
pages the chart, its legend, the branch map, the facts row, the family chips, the skyline of a program page, the tables of its sections), and stays in the sheet of
every page otherwise. Rules keep their order inside each sheet, so a rule of such a sheet comes after the rules of the common sheet and never before one of them; the
check that the two builds (split or not) give every element of every page the same computed style is `scripts/css_parity.mjs`.
"""
from __future__ import annotations

import re

# What only a program page has. Compound names are listed so that a prefix does not take in a neighbour: .chips and its links (the programs on the page for an unknown address) stay with every page.
PROGRAM = re.compile(
    r"\.card(?![-\w])|\.card-head|\.card-body|\.kv(?![-\w])|\.chip(?![-\w])|\.chart-|\.ax(?![-\w])|\.ln(?![-\w])|\.band-a|\.endlab|\.leader(?![-\w])|\.cross(?![-\w])|\.dotr"
    r"|\.tip(?![-\w])|\.legend|\.lg-|\.lgrow|\.lgcb|\.tabs(?![-\w])|\.panel-table|\.mapbox|\.sky(?![-\w])|\.sky-(?:svg|lg)|\.cmp3|\.mob-flag|\.mob-bar"
    r"|\.bm(?![-\w])|\.bm-|(?<!\()\.pnav|\.subbar \.pn|\.subbar select|\.kinds|#pbar-total|\.more-row|\.callout-gap|\.seg input:disabled|\.grp(?![-\w])|td\.zero")

COMPARE = re.compile(r"\.pair(?![-\w])|\.a-fill|\.b-fill|\.stack(?![-\w])|\.ab(?![-\w])|\.pick(?![-\w])|\.cmp-|\.split(?![-\w])")
PROSE = re.compile(r"\.doc(?![-\w])|\.toc(?![-\w])|\.prose")
# What only the front page has: its figures (the branch map, the strip with its key and boxes, how a number is made) and the list of tasks. Names that PROGRAM takes (.lg-, .sky, .chip) are not used here.
HOME = re.compile(r"\.home(?![-\w])|\.home-|\.fig(?![-\w])|\.fig-|\.hm(?![-\w])|\.hm-|\.strip(?![-\w])|\.strip-|\.tool-key|\.tool-btn|\.tool-x|\.flow(?![-\w])|\.flow-|\.tasks(?![-\w])")
# the sheets, in the order of their patterns: a rule goes to the first one whose pattern every selector of the rule matches
SHEETS = {"program": PROGRAM, "compare": COMPARE, "prose": PROSE, "home": HOME}

BLOCK_AT = ("@media", "@supports", "@container", "@layer")


def _skip_string(t: str, i: int) -> int:
    q = t[i]
    i += 1
    while i < len(t):
        if t[i] == "\\":
            i += 2
            continue
        if t[i] == q:
            return i + 1
        i += 1
    return i


def _items(t: str):
    """The top-level items of a piece of style sheet text: (text before the item, its head, its body or None, text after the last item). A head ends at `{` (a block
    follows, up to its matching `}`) or at `;` (a statement)."""
    out, i, n = [], 0, len(t)
    while True:
        j = i
        while j < n and (t[j].isspace() or t.startswith("/*", j)):
            j = t.index("*/", j) + 2 if t.startswith("/*", j) else j + 1
        pre = t[i:j]
        if j >= n:
            return out, pre
        k, paren = j, 0
        while k < n:
            c = t[k]
            if c in "\"'":
                k = _skip_string(t, k)
                continue
            if t.startswith("/*", k):
                k = t.index("*/", k) + 2
                continue
            if c == "(":
                paren += 1
            elif c == ")":
                paren -= 1
            elif c in "{;" and paren == 0:
                break
            k += 1
        head = t[j:k]
        if k >= n or t[k] == ";":
            out.append((pre, head, None))
            i = k + 1
            continue
        depth, m = 1, k + 1
        while m < n and depth:
            c = t[m]
            if c in "\"'":
                m = _skip_string(t, m)
                continue
            if t.startswith("/*", m):
                m = t.index("*/", m) + 2
                continue
            depth += c == "{"
            depth -= c == "}"
            m += 1
        out.append((pre, head, t[k + 1:m - 1]))
        i = m


def _selectors(head: str) -> list[str]:
    """The selectors of a rule: split at the commas that are not inside parentheses or brackets."""
    sels, depth, cur = [], 0, ""
    for c in head:
        if c in "([":
            depth += 1
        elif c in ")]":
            depth -= 1
        if c == "," and depth == 0:
            sels.append(cur)
            cur = ""
        else:
            cur += c
    return sels + [cur]


def sheet_of(selector: str) -> str:
    """The sheet a selector belongs to: "base" (every page), or the name of the kind of page that alone has what the selector names."""
    for name, pat in SHEETS.items():
        if pat.search(selector):
            return name
    return "base"


def split_css(text: str, whole: str | None = None) -> dict[str, str]:
    """Split style sheet text into a dict of sheets ("base" and the names of SHEETS), keeping the text of each rule as written. With `whole`, the text is all
    one sheet of that name (the branch map). A block at-rule (@media, @container, @supports) is split rule by rule and written to a sheet only when a rule of it
    lands there; a font face and an animation stay with every page."""
    if whole:
        return {"base": "", **{k: "" for k in SHEETS}, whole: text}
    items, tail = _items(text)
    out: dict[str, list[str]] = {"base": [], **{k: [] for k in SHEETS}}
    for pre, head, body in items:
        if body is None:
            out["base"].append(pre + head + ";")
            continue
        h = head.lstrip()
        if h.startswith(BLOCK_AT):
            for name, inner in split_css(body).items():
                if inner.strip():
                    out[name].append(pre + head + "{" + inner + "}")
        elif h.startswith("@"):
            out["base"].append(pre + head + "{" + body + "}")
        else:
            # a rule with a list of selectors is split by selector: each sheet gets the selectors that belong to it, with the same declarations, at the same place in its
            # order (so a forced-colours rule for a selector of the branch map, which shares its declarations with a selector of every page, stays after the rules of the map)
            groups: dict[str, list[str]] = {}
            for sel in _selectors(head):
                groups.setdefault(sheet_of(sel), []).append(sel)
            if len(groups) == 1:
                out[next(iter(groups))].append(pre + head + "{" + body + "}")      # the whole rule, as written
                continue
            for k, (name, sels) in enumerate(groups.items()):
                lead = pre if (k == 0 or not pre.strip()) else ""      # a comment goes with the first group only; white space with each
                out[name].append(lead + ", ".join(x.strip() for x in sels) + " {" + body + "}")
    res = {k: "".join(v) for k, v in out.items()}
    if res["base"]:
        res["base"] += tail
    return res


# ---- minifiers --------------------------------------------------------------------------------------------------

LICENSE_LINE = "/*! SPDX-License-Identifier: Apache-2.0 | Copyright 2026 The Agent Software Testing authors */\n"


def minify_css(text: str) -> str:
    """Remove comments and the white space that does not matter: around braces, semicolons and commas, after a colon, around the combinators > + ~ outside
    parentheses, inside the edges of parentheses, and the last semicolon of a block. Inside parentheses (calc(), min()) the white space around + and - stays;
    strings are kept whole. A space before a colon stays (`a :hover` is not `a:hover`)."""
    out: list[str] = []
    i, n, paren, space = 0, len(text), 0, False
    while i < n:
        c = text[i]
        if text.startswith("/*", i):
            i = text.index("*/", i) + 2
            space = True
            continue
        if c.isspace():
            space = True
            i += 1
            continue
        prev = out[-1][-1] if out else ""
        if space and out:
            tight = (prev in "{};,:(" or c in "{};,)" or (paren == 0 and (prev in ">+~" or c in ">+~")))
            if not tight:
                out.append(" ")
        space = False
        if c in "\"'":
            j = _skip_string(text, i)
            out.append(text[i:j])
            i = j
            continue
        if c == "(":
            paren += 1
        elif c == ")":
            paren -= 1
        if c == "}" and out and out[-1] == ";":
            out.pop()
        out.append(c)
        i += 1
    return "".join(out).strip() + "\n"


# JavaScript: a tokenizer that knows strings, regular expression literals and comments, and writes the tokens back with the least white space that cannot change
# the meaning: a line break stays a line break wherever the source had one between two tokens (so automatic semicolon insertion works as it did), and a space is
# written only between two names or numbers, or where two signs would run together.
_WORD = re.compile(r"[A-Za-z0-9_$\u0080-￿]")
_PUNCT3 = (">>>=", "...", "===", "!==", "**=", "<<=", ">>=", ">>>", "&&=", "||=", "??=")
_PUNCT2 = ("=>", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<", ">>", "**")
_REGEX_AFTER_WORD = {"return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"}


def _tokens_js(src: str):
    """Yield (kind, text, newline_before) for the tokens of a script: kinds are name, num, str, regex, punct."""
    i, n, nl, prev = 0, len(src), False, None      # prev: the last significant token (kind, text)
    while i < n:
        c = src[i]
        if c in " \t\r\f\v ﻿":
            i += 1
            continue
        if c == "\n" or c in "  ":
            nl = True
            i += 1
            continue
        if src.startswith("//", i):
            j = src.find("\n", i)
            i = n if j < 0 else j
            continue
        if src.startswith("/*", i):
            j = src.index("*/", i) + 2
            if "\n" in src[i:j]:
                nl = True
            i = j
            continue
        if c in "\"'":
            j = _skip_string(src, i)
            tok = ("str", src[i:j])
        elif c == "`":
            raise ValueError("template literals are not supported by the minifier")
        elif c.isdigit() or (c == "." and i + 1 < n and src[i + 1].isdigit()):
            m = re.compile(r"0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?").match(src, i)
            j = m.end()
            tok = ("num", src[i:j])
        elif _WORD.match(c):
            j = i
            while j < n and _WORD.match(src[j]):
                j += 1
            tok = ("name", src[i:j])
        elif c == "/" and _regex_allowed(prev):
            j, in_class = i + 1, False
            while j < n:
                d = src[j]
                if d == "\\":
                    j += 2
                    continue
                if d == "[":
                    in_class = True
                elif d == "]":
                    in_class = False
                elif d == "/" and not in_class:
                    break
                j += 1
            j += 1
            while j < n and _WORD.match(src[j]):
                j += 1
            tok = ("regex", src[i:j])
        else:
            for p in _PUNCT3 + _PUNCT2:
                if src.startswith(p, i):
                    j = i + len(p)
                    tok = ("punct", p)
                    break
            else:
                j = i + 1
                tok = ("punct", c)
        yield tok[0], tok[1], nl
        nl, prev, i = False, tok, j


def _regex_allowed(prev) -> bool:
    """Whether a slash starts a regular expression: after an operator or an opening sign or a keyword, yes; after a name, a number, a string or a closing sign, it divides."""
    if prev is None:
        return True
    kind, text = prev
    if kind in ("num", "str", "regex"):
        return False
    if kind == "name":
        return text in _REGEX_AFTER_WORD
    return text not in (")", "]", "}")


def _needs_space(pk: str, pt: str, kind: str, text: str) -> bool:
    """Whether two neighbouring tokens would run together or change meaning without a space between them."""
    if pk in ("name", "num") and kind in ("name", "num"):
        return True
    if pk == "regex" and kind in ("name", "num"):
        return True          # /x/ in y: the name would be read as flags
    if pk == "num" and text.startswith("."):
        return True          # 1 .toString()
    if pt[-1:] in ("+", "-") and text[:1] == pt[-1:]:
        return True          # a + +b, a - -b, a + ++b
    if pt == "/" and text[:1] in ("/", "*"):
        return True          # a / /x/ is not a comment
    return False


def minify_js(src: str) -> str:
    """Comments out, white space to the least that keeps the meaning (see above); names are not shortened."""
    out: list[str] = []
    prev = None
    for kind, text, nl in _tokens_js(src):
        if prev is not None:
            out.append("\n" if nl else (" " if _needs_space(prev[0], prev[1], kind, text) else ""))
        out.append(text)
        prev = (kind, text)
    return "".join(out).strip() + "\n"
