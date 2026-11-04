/* SPDX-License-Identifier: Apache-2.0
   Copyright 2026 The Agent Software Testing authors

   The figures of the front page. The page is written complete by the build (the branch map of one program and the strip of the opening entries); this file adds what
   a person asks for. The box beside the map names another program, whose map is a script of its own (fetched when it is first named, and written with the same strings
   as the page's own). The key of the strip lets one tool's entries stand out and takes a tool off; the box under it adds an entry by name, a link returns to the opening
   entries, and above one page of programs a box finds one and two buttons turn the page. The entries on show and the program on the map are written to the address
   (entries.js) and nowhere else. A click, a tap or the Enter key on a cell of the map opens the popup that the program page shows for a cell, with a link to the page of the
   program; the cell under a point is found from the geometry that the build writes into the drawing (data-geo), and the detail comes from the program's map data, which is asked
   for with the popup (branchmap.js). Nothing here runs by itself: the small files of the strip are asked for when a visitor first does something that needs them. */
(function () {
  "use strict";
  var E = window.CREntries, home = document.querySelector(".home");
  if (!E || !home) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var say = function (t) { if (window.CRApp && window.CRApp.say) window.CRApp.say(t); };
  var data = E.Data(home.getAttribute("data-src") || "data/");
  var LIST = 50;      // the most that a list of matches holds
  var CROSS = '<svg viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M2 2l6 6M8 2l-6 6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
  var FAILED = "The map could not be loaded. The page of the program has it.";

  var strip = $("#strip"), map = $("#map");
  var open = strip ? strip.getAttribute("data-open").split(",").filter(Boolean).map(function (x) { var i = x.lastIndexOf(":"); return { id: x.slice(0, i), slot: Number(x.slice(i + 1)) }; }) : [];
  var shown = open.slice(), program = map ? map.getAttribute("data-program") : "", first = program;

  /* ---- the address -------------------------------------------------------------------------------------------- */
  function writeAddress() {
    var h = E.format({ e: E.same(shown, open) ? null : shown, p: program === first ? "" : program });
    try { history.replaceState(null, "", h ? "#" + h : location.pathname + location.search); } catch (e) { /* sandboxed */ }
    var at = "results.html" + (E.same(shown, open) ? "" : "#" + E.format({ e: shown }));
    $$("[data-results]").forEach(function (a) { a.setAttribute("href", at); });
  }

  /* ---- a list of matches for a box ----------------------------------------------------------------------------- */
  function fill(list, items) { list.innerHTML = items.slice(0, LIST).map(function (v) { return '<option value="' + E.esc(v) + '"></option>'; }).join(""); }
  // true when the input event is the choice of an option of the list (or a script's change of the value), not a key typed into the box
  function chosen(e) { return !e.inputType || /Replacement/i.test(e.inputType); }

  /* ---- the branch map ------------------------------------------------------------------------------------------ */
  var sel = $("#hm-sel"), stage = $("#hm-stage");
  var programs = function () { return data.programs(); };
  if (sel && stage && map) {
    var shownName = sel.value, busy = false;
    var text = function (id, v) { var e = document.getElementById(id); if (e) e.textContent = v; };
    var draw = function (h) {
      if (mapCells) mapCells.reset();
      stage.innerHTML = h.stage;          // new elements, so the reveal plays again; a visitor who asked for less motion sees the map at once (site.css)
      if (mapCells) mapCells.attach(h.name);
      text("hm-name", h.name); text("hm-count", h.head); text("hm-open-name", h.name);
      var lg = $("#hm-lg"); if (lg) lg.innerHTML = h.legend;
      var cap = $("#hm-cap"); if (cap) cap.innerHTML = h.caption;
      var op = $("#hm-open"); if (op) op.setAttribute("href", "programs/" + h.id + ".html#map");
      map.setAttribute("data-program", h.id);
      program = h.id; shownName = h.name; sel.value = h.name;
      writeAddress();
      say("Branch map of " + h.name + ": " + h.head);
    };
    var load = function (p, done) {
      if (window.CRHero && window.CRHero[p.id]) { done(window.CRHero[p.id]); return; }
      var s = document.createElement("script");
      s.src = p.map;
      s.onload = function () { done(window.CRHero && window.CRHero[p.id] ? window.CRHero[p.id] : null); };
      s.onerror = function () { done(null); };
      document.head.appendChild(s);
    };
    var show = function (p) {
      if (p.id === program) { sel.value = shownName; return; }
      if (busy) return;
      busy = true;
      load(p, function (h) { busy = false; if (h) draw(h); else { sel.value = shownName; say(FAILED); } });
    };
    var matches = function (P, q) {
      q = q.trim().toLowerCase();
      return P.list.filter(function (p) { return !q || p.name.toLowerCase().indexOf(q) >= 0 || p.id.indexOf(q) >= 0; });
    };
    // the program that a text names: its name or key, or the one program that holds the text
    var named = function (P, t) {
      var q = t.trim().toLowerCase(), hit = P.list.filter(function (p) { return p.name.toLowerCase() === q || p.id === q; });
      if (hit.length) return hit[0];
      hit = matches(P, q);
      return q && hit.length === 1 ? hit[0] : null;
    };
    var pick = function (t) {
      programs().then(function (P) { var p = named(P, t); if (p) show(p); else sel.value = shownName; }, function () { sel.value = shownName; say(FAILED); });
    };
    sel.addEventListener("focus", function () {
      sel.placeholder = shownName; sel.value = "";      // the list opens on every program, not on the one that is drawn
      programs().then(function (P) { fill($("#hm-list"), matches(P, sel.value).map(function (p) { return p.name; })); }, function () { /* the box then names no program */ });
    });
    sel.addEventListener("input", function (e) {
      programs().then(function (P) {
        fill($("#hm-list"), matches(P, sel.value).map(function (p) { return p.name; }));
        if (chosen(e) && sel.value) { var p = named(P, sel.value); if (p && p.name.toLowerCase() === sel.value.trim().toLowerCase()) show(p); }
      }, function () { /* see focus */ });
    });
    sel.addEventListener("change", function () { if (sel.value) pick(sel.value); });
    sel.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); if (sel.value) pick(sel.value); } });
    sel.addEventListener("blur", function () { if (!sel.value) sel.value = shownName; });
  }

  /* ---- a cell of the map ----------------------------------------------------------------------------------- */
  var mapCells = null;
  if (sel && stage && map) {
    var bmSrc = map.getAttribute("data-bm"), mapRing = document.createElement("div"), cur = -1, pop = null, popFor = "", keyOpen = false, down = null;
    mapRing.className = "hm-ring"; mapRing.hidden = true;
    var readers = {};
    var loadScript = function (src) {
      return new Promise(function (ok, no) { var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
    };
    // the reader of the program's cells: branchmap.js and the program's map data are asked for the first time a cell is picked
    var readerOf = function (id) {
      if (!readers[id]) {
        readers[id] = Promise.all([window.BranchMap ? 0 : loadScript(bmSrc), programs()]).then(function (r) {
          var p = r[1].by[id];
          return window.BranchMapData && window.BranchMapData[id] ? 0 : loadScript(p.cells);
        }).then(function () { return window.BranchMap.reader(window.BranchMapData[id]); }).catch(function (e) { delete readers[id]; throw e; });
      }
      return readers[id];
    };
    var svgOn = function () { return $$(".hm-svg", stage).filter(function (s) { return s.getBoundingClientRect().width > 0; })[0] || null; };
    // where the cells of the drawing are (herodata.py, draw): pitch, cell, cells in a row, gutter, branches, then the first branch and the top of the first row of each file
    var geoOf = function (svg) {
      var a = (svg.getAttribute("data-geo") || "").split(",").map(Number), files = [], i;
      for (i = 5; i + 1 < a.length; i += 2) files.push({ start: a[i], top: a[i + 1] });
      return { p: a[0], s: a[1], cols: a[2], gut: a[3], n: a[4], files: files };
    };
    var fileSpan = function (g, f) { var end = f + 1 < g.files.length ? g.files[f + 1].start : g.n; return { start: g.files[f].start, count: end - g.files[f].start }; };
    // the unit of the drawing in pixels, and the left and top of the drawing in the window
    var scaleOf = function (svg) { var r = svg.getBoundingClientRect(); return { k: r.width / svg.viewBox.baseVal.width, x: r.left, y: r.top }; };
    // the cell nearest to a point of the drawing within `reach` units of it (the gap between cells counts as part of a cell), or -1
    var cellAt = function (g, x, y, reach) {
      var best = -1, bd = reach * reach + 1e-6, f, sp, rows, r, c, k, x0, y0, dx, dy, d;
      for (f = 0; f < g.files.length; f++) {
        sp = fileSpan(g, f); rows = Math.ceil(sp.count / g.cols);
        if (y < g.files[f].top - reach || y > g.files[f].top + (rows - 1) * g.p + g.s + reach) continue;
        r = Math.max(0, Math.min(rows - 1, Math.floor((y - g.files[f].top) / g.p)));
        c = Math.max(0, Math.min(g.cols - 1, Math.floor((x - g.gut) / g.p)));
        k = r * g.cols + c;
        if (k >= sp.count) { k = sp.count - 1; c = k - r * g.cols; }
        x0 = g.gut + c * g.p; y0 = g.files[f].top + r * g.p;
        dx = Math.max(x0 - x, 0, x - (x0 + g.s)); dy = Math.max(y0 - y, 0, y - (y0 + g.s));
        d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = sp.start + k; }
      }
      return best;
    };
    var fileOf = function (g, idx) { var f = 0; while (f + 1 < g.files.length && g.files[f + 1].start <= idx) f++; return f; };
    // the window rectangle of a cell
    var rectOf = function (svg, g, idx) {
      var f = fileOf(g, idx), l = idx - g.files[f].start, r = Math.floor(l / g.cols), c = l - r * g.cols, u = scaleOf(svg);
      return { left: u.x + (g.gut + c * g.p) * u.k, top: u.y + (g.files[f].top + r * g.p) * u.k, size: Math.max(g.s * u.k, 4) };
    };
    // the branch that a key moves to from i, along the cells as they are drawn (the same moves as the map of the program page, in source order)
    var moveFrom = function (g, i, key, ctrl) {
      var f = fileOf(g, i), sp = fileSpan(g, f), l = i - sp.start, rows = Math.ceil(sp.count / g.cols), r = Math.floor(l / g.cols), j = i, nx;
      switch (key) {
        case "ArrowRight": j = Math.min(g.n - 1, i + 1); break;
        case "ArrowLeft": j = Math.max(0, i - 1); break;
        case "ArrowDown":
          if (l + g.cols < sp.count) j = i + g.cols;
          else if (r < rows - 1) j = sp.start + sp.count - 1;
          else if (f + 1 < g.files.length) { nx = fileSpan(g, f + 1); j = nx.start + Math.min(l % g.cols, nx.count - 1); }
          break;
        case "ArrowUp":
          if (l >= g.cols) j = i - g.cols;
          else if (f > 0) { nx = fileSpan(g, f - 1); j = nx.start + Math.min(nx.count - 1, Math.floor((nx.count - 1) / g.cols) * g.cols + l % g.cols); }
          break;
        case "Home": j = ctrl ? 0 : sp.start; break;
        case "End": j = ctrl ? g.n - 1 : sp.start + sp.count - 1; break;
        case "PageDown": j = f + 1 < g.files.length ? g.files[f + 1].start : g.n - 1; break;
        case "PageUp": j = l > 0 ? sp.start : (f > 0 ? g.files[f - 1].start : 0); break;
      }
      return j;
    };
    var showRing = function (svg, g, idx) {
      var q = rectOf(svg, g, idx), b = stage.getBoundingClientRect(), pad = q.size >= 8 ? 2 : 3;
      mapRing.hidden = false;
      mapRing.style.transform = "translate(" + Math.round(q.left - b.left - pad) + "px," + Math.round(q.top - b.top - pad) + "px)";
      mapRing.style.width = mapRing.style.height = Math.round(q.size + 2 * pad) + "px";
    };
    var hideRing = function () { mapRing.hidden = true; };
    var closePop = function () { if (pop) pop.close(); };
    var popOf = function (rd, id, name) {
      if (!pop || popFor !== id) {
        if (pop) pop.element.parentNode.removeChild(pop.element);
        pop = window.BranchMap.popup(rd, { href: "programs/" + id + ".html#map", text: "Open " + name, label: "Branch details of " + name, home: stage, stage: stage, onClose: function () { hideRing(); } });
        popFor = id;
      }
      return pop;
    };
    // show the detail of cell idx in the popup, beside the point cx, cy of the window
    var openCell = function (idx, cx, cy, fromKey) {
      var id = program, name = ($("#hm-name") || {}).textContent || id;
      return readerOf(id).then(function (rd) {
        if (id !== program) return;
        var svg = svgOn(); if (!svg) return;
        cur = idx; showRing(svg, geoOf(svg), idx);
        popOf(rd, id, name).open(idx, cx, cy, fromKey);
        if (!fromKey) say(rd.line(idx));
      }, function () { say("The details of the cell could not be loaded. The page of the program has the map."); });
    };
    var openAtRing = function () {
      var svg = svgOn(); if (!svg || cur < 0) return;
      var g = geoOf(svg), q = rectOf(svg, g, cur);
      return openCell(cur, q.left + q.size / 2, q.top + q.size / 2, true);
    };
    var pickAt = function (cx, cy, touch) {
      var svg = svgOn(); if (!svg) return;
      var g = geoOf(svg), u = scaleOf(svg), gap = (g.p - g.s) / 2;
      var idx = cellAt(g, (cx - u.x) / u.k, (cy - u.y) / u.k, Math.max(gap, touch ? 8 / u.k : 0));
      if (idx < 0) { closePop(); return; }
      openCell(idx, cx, cy, false);
    };
    stage.addEventListener("pointerdown", function (e) { down = { x: e.clientX, y: e.clientY, t: e.pointerType }; keyOpen = false; });
    stage.addEventListener("pointerup", function (e) {
      if (!down) return;
      var moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y), touch = down.t !== "mouse";
      down = null;
      if (moved <= 8) pickAt(e.clientX, e.clientY, touch);
    });
    stage.addEventListener("pointercancel", function () { down = null; });
    // a ring on the cell under the mouse (the geometry is in the page: nothing is asked for)
    stage.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse" || (pop && pop.isOpen())) return;
      var svg = svgOn(); if (!svg) return;
      var g = geoOf(svg), u = scaleOf(svg), idx = cellAt(g, (e.clientX - u.x) / u.k, (e.clientY - u.y) / u.k, (g.p - g.s) / 2);
      if (idx < 0) hideRing(); else showRing(svg, g, idx);
    });
    stage.addEventListener("pointerleave", function () { if (!(pop && pop.isOpen()) && document.activeElement !== stage) hideRing(); });
    stage.addEventListener("focus", function () {
      var svg = svgOn(); if (!svg || down) return;      // a press is on its way to a cell: the click picks it
      if (cur < 0) cur = 0;
      showRing(svg, geoOf(svg), cur);
      readerOf(program).then(function (rd) { if (document.activeElement === stage) say(rd.line(cur)); }, function () { /* the details are asked for again with the next key */ });
    });
    stage.addEventListener("blur", function () { if (!(pop && pop.isOpen())) hideRing(); });
    stage.addEventListener("keydown", function (e) {
      var svg = svgOn(), k = e.key;
      if (!svg || e.altKey || e.metaKey) return;
      if (k === "Enter" || k === " ") { e.preventDefault(); if (cur < 0) cur = 0; openAtRing(); return; }
      if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].indexOf(k) < 0) return;
      e.preventDefault();
      var g = geoOf(svg);
      cur = moveFrom(g, cur < 0 ? 0 : cur, k, e.ctrlKey);
      showRing(svg, g, cur);
      closePop();
      try { mapRing.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (x) { /* old engines */ }
      readerOf(program).then(function (rd) { say(rd.line(cur)); }, function () { /* see focus */ });
    });
    mapCells = {
      // the stage is new (a program was drawn): the ring goes back into it, and the cell and the popup are forgotten
      attach: function (name) {
        stage.appendChild(mapRing); hideRing(); cur = -1;
        stage.setAttribute("aria-label", "Branch map of " + name + ". Arrow keys move between branches; Enter shows one.");
      },
      reset: function () { closePop(); cur = -1; hideRing(); }
    };
    stage.tabIndex = 0;
    stage.setAttribute("role", "application");
    stage.setAttribute("aria-roledescription", "branch map");
    mapCells.attach(sel.value);
    window.addEventListener("resize", function () { closePop(); hideRing(); });
  }

  /* ---- the strip ----------------------------------------------------------------------------------------------- */
  var tbody = $("#st-rows"), key = $(".tool-key");
  if (strip && tbody && key) {
    var add = $("#st-add"), list = $("#st-list"), note = $("#st-note"), reset = $("#st-reset"), findBox = $("#st-findbox"), find = $("#st-find");
    var pager = $("#st-pager"), range = $("#st-range"), prev = $("#st-prev"), next = $("#st-next"), ring = $("#st-ring");
    var cells = {}, model = null, page = 0, focus = "";

    /* the key: a button for each tool on show, which makes the tool stand out, and a cross that takes the tool off */
    var keyItem = function (id, name, slot) {
      var li = document.createElement("li"), b = document.createElement("button"), x = document.createElement("button");
      li.setAttribute("data-tool", id);
      b.type = "button"; b.className = "tool-btn"; b.setAttribute("aria-pressed", String(focus === id));
      b.innerHTML = '<i class="dot c' + slot + '"></i>' + E.esc(name);
      x.type = "button"; x.className = "tool-x"; x.setAttribute("aria-label", "Remove " + name); x.title = "Remove " + name; x.innerHTML = CROSS;
      li.appendChild(b); li.appendChild(x);
      return li;
    };
    var lit = function () {
      $$(".trk i", tbody).forEach(function (m) { m.classList.toggle("off", !!focus && m.getAttribute("data-tool") !== focus); });
      $$("button.tool-btn", key).forEach(function (b) { b.setAttribute("aria-pressed", String(!!focus && b.parentNode.getAttribute("data-tool") === focus)); });
    };
    $$("li", key).slice().forEach(function (li) {
      var i = $(".dot", li), slot = Number((i.className.match(/\bc(\d)\b/) || [0, 0])[1]);
      key.replaceChild(keyItem(li.getAttribute("data-tool"), li.textContent, slot), li);
    });
    key.addEventListener("click", function (e) {
      var b = e.target.closest("button"), li = b && b.closest("li");
      if (!li) return;
      var id = li.getAttribute("data-tool");
      if (b.classList.contains("tool-x")) { removeTool(id, $$("li", key).indexOf(li)); return; }
      var on = b.getAttribute("aria-pressed") === "true";
      focus = on ? "" : id;
      lit();
      say(on ? "All tools shown" : b.textContent.replace(/\s+/g, " ").trim() + " highlighted");
    });

    /* the files: the programs and the entries, and the cells of each shown entry */
    var ready = function () {
      return model ? Promise.resolve(model) : Promise.all([data.programs(), data.entries()]).then(function (r) { return (model = { P: r[0], E: r[1] }); });
    };
    var cellsOf = function (ids) {
      return Promise.all(ids.filter(function (id) { return !cells[id]; }).map(function (id) { return data.cells(id).then(function (c) { cells[id] = c; }); }));
    };
    var notePut = function (t) { note.textContent = t; if (t) say(t); };

    var render = function () {
      return ready().then(function (M) {
        return cellsOf(shown.map(function (x) { return x.id; })).then(function () {
          var mk = E.marks(shown, M.E), all = E.rows(M.P, mk, cells), q = find.value.trim().toLowerCase();
          var vis = q ? all.filter(function (r) { return r.p.name.toLowerCase().indexOf(q) >= 0 || r.p.id.indexOf(q) >= 0; }) : all;
          var pg = E.pageOf(vis.length, page); page = pg.page;
          tbody.innerHTML = vis.slice(pg.from, pg.to).map(function (r) { return E.rowHtml(r, "programs/" + r.p.id + ".html"); }).join("")
            || '<tr><td colspan="2" class="strip-none">' + (shown.length ? "No program matches." : "No entries on show.") + "</td></tr>";
          var on = E.toolsOn(shown, M.E);
          if (focus && !on.some(function (t) { return t.id === focus; })) focus = "";
          while (key.firstChild) key.removeChild(key.firstChild);
          on.forEach(function (t) { key.appendChild(keyItem(t.id, M.E.tools[t.id].name, t.slot)); });
          lit();
          reset.hidden = E.same(shown, open);
          if (all.length <= E.PAGE_ROWS) find.value = "";
          findBox.hidden = all.length <= E.PAGE_ROWS;
          pager.hidden = vis.length <= E.PAGE_ROWS;
          range.textContent = vis.length ? "Programs " + E.fmt(pg.from + 1) + " to " + E.fmt(pg.to) + " of " + E.fmt(vis.length) : "";
          prev.disabled = pg.page === 0; next.disabled = pg.page >= pg.pages - 1;
          ring.hidden = !mk.some(function (m) { return m.ring; });
          writeAddress();
        });
      }).catch(function () { notePut("The entries could not be loaded."); });
    };

    var removeTool = function (id, at) {
      ready().then(function (M) {
        var name = M.E.tools[id] ? M.E.tools[id].name : id;
        shown = E.removeTool(shown, id, M.E); page = 0; notePut("");
        return render().then(function () {
          var b = $$("li .tool-btn", key); (b[Math.min(at, b.length - 1)] || add).focus();
          say(name + " removed");
        });
      });
    };
    reset.addEventListener("click", function () {
      shown = open.slice(); page = 0; focus = ""; find.value = ""; notePut("");
      render().then(function () { add.focus(); say("Back to the opening entries"); });
    });

    /* the box that adds an entry */
    var hay = function (M, e) { return [e.label, M.E.tools[e.tool].name, e.name, e.group, e.v].join(" ").toLowerCase(); };
    var offered = function (M, q) {
      q = q.trim().toLowerCase();
      return M.E.list.filter(function (e) { return !shown.some(function (x) { return x.id === e.id; }) && (!q || hay(M, e).indexOf(q) >= 0); })
        .sort(function (a, b) { return a.label < b.label ? -1 : a.label > b.label ? 1 : 0; });
    };
    var chooseEntry = function (t, exact) {
      var q = t.trim().toLowerCase();
      if (!q) return;
      ready().then(function (M) {
        var hit = M.E.list.filter(function (e) { return e.label.toLowerCase() === q; });
        if (!hit.length && !exact) hit = offered(M, q).length === 1 ? offered(M, q) : [];
        if (!hit.length) return;
        var r = E.add(shown, hit[0].id, M.E);
        if (!r.shown) {
          if (r.why === "two") notePut(r.tool + " has two entries on show. Remove it to pick others.");
          return;
        }
        shown = r.shown; page = 0; add.value = ""; notePut("");
        fill(list, offered(M, "").map(function (e) { return e.label; }));
        return render().then(function () { say("Added " + hit[0].label); });
      }, function () { notePut("The entries could not be loaded."); });
    };
    var offer = function () { return ready().then(function (M) { fill(list, offered(M, add.value).map(function (e) { return e.label; })); }, function () { notePut("The entries could not be loaded."); }); };
    add.addEventListener("focus", offer);
    add.addEventListener("input", function (e) { offer().then(function () { if (chosen(e) && add.value) chooseEntry(add.value, true); }); });
    add.addEventListener("change", function () { chooseEntry(add.value, false); });
    add.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); chooseEntry(add.value, false); } });

    /* the programs: a box to find one and the page of 30 */
    find.addEventListener("input", function () { page = 0; render(); });
    var turn = function (d) {
      page += d;
      render().then(function () {
        var top = $(".strip-wrap", strip).getBoundingClientRect().top;
        if (top < 0) $(".strip-wrap", strip).scrollIntoView({ block: "start" });
        say(range.textContent);
      });
    };
    prev.addEventListener("click", function () { turn(-1); });
    next.addEventListener("click", function () { turn(1); });

    /* the address names entries (a link that was shared, or Results' link back): they come on show once their files are in */
    var fromAddress = function () {
      var a = E.parse(location.hash);
      if (!a.e && E.same(shown, open)) return;
      ready().then(function (M) {
        var s = a.e ? E.fromAddress(a.e, M.E) : [];
        shown = s.length ? s : open.slice(); page = 0;
        return render();
      }, function () { notePut("The entries could not be loaded."); });
    };
    window.addEventListener("hashchange", function () { fromAddress(); });
    fromAddress();
  }

  /* the address names a program for the map */
  if (sel && stage && map) {
    var mapFromAddress = function () {
      var id = E.parse(location.hash).p || first;
      if (id === program) return;
      programs().then(function (P) { var p = P.by[id]; if (p) show(p); }, function () { say(FAILED); });
    };
    window.addEventListener("hashchange", mapFromAddress);
    mapFromAddress();
  }
})();
