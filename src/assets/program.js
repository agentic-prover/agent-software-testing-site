/* SPDX-License-Identifier: Apache-2.0
   Copyright 2026 The Agent Software Testing authors

   Controller of a program page: the chart (views, legend, family chips, chart and table tabs), the branch map, the final
   coverage table and the bar with its section links. The page is complete without this file; it adds interaction. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var main = $("#main");
  if (!main) return;
  // Each script of the page stands on its own: if app.js did not load, the chart and the map still draw (without the sorting, the announcements and the section links);
  // if charts.js did not load, the map still draws and the plate of the chart says so; if the map script did not load, the chart still draws.
  var A = window.CRApp || { say: function () {}, swapIn: function () {}, attachSort: function () {}, root: main.getAttribute("data-root") || "" };
  var id = main.getAttribute("data-program"), holder = $("#cr-chart"), D = holder ? JSON.parse(holder.textContent) : null;
  // the default chart view is the one the build checked; its name is also in the data of the chart
  var PRIMARY = (D && D.primary) || ($('input[name="cview"]:checked') || {}).value || "main";
  var chart = null, mapView = null, tab = "chart", view = PRIMARY, range = "full";

  function legendOf(v) { return $('.legend-view[data-view="' + v + '"]'); }
  function boxes(v) { return $$("input.lgcb[data-sys]", legendOf(v)); }
  function visibleIds() {
    var ids = boxes(view).filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute("data-sys"); });
    ids.sort(function (a, b) { return (D.series[a] ? D.series[a].o : 0) - (D.series[b] ? D.series[b].o : 0); });
    return ids;
  }
  function syncLegend() {
    var lv = legendOf(view), all = boxes(view), n = all.filter(function (c) { return c.checked; }).length;
    all.forEach(function (c) { c.closest(".lgrow").classList.toggle("off", !c.checked); });
    $("[data-lg-head]", lv).textContent = "Showing " + n + " of " + all.length;
    $$("#famchips .chip").forEach(function (b) {
      var ids = b.getAttribute("data-ids").split(" "), k = ids.filter(function (x) { var c = $('#legend input.lgcb[data-sys="' + x + '"]'); return c && c.checked; }).length;
      b.setAttribute("aria-pressed", k === ids.length ? "true" : k ? "mixed" : "false");
      var sm = $("small", b); if (sm) sm.textContent = k && k < ids.length ? k + " of " + ids.length + " on" : String(ids.length);
    });
  }
  // The plate of the chart (and of the table beside it) when the chart script is missing or fails: a short sentence in the place of the drawing.
  var CHART_FAILED = "The chart did not load. Reload the page.";
  function chartFailed() {
    var host = $("#chart"), tbl = $("#panel-table");
    if (host) {
      ["tabindex", "aria-valuenow", "aria-valuemin", "aria-valuemax", "aria-valuetext", "aria-label", "aria-describedby"].forEach(function (a) { host.removeAttribute(a); });
      host.setAttribute("role", "status"); host.innerHTML = '<p class="empty">' + CHART_FAILED + "</p>";
    }
    if (tbl) tbl.innerHTML = '<p class="muted pad">' + CHART_FAILED + "</p>";
  }
  function drawAll() {
    syncLegend();
    var ids = visibleIds();
    if (!window.CRChart) { chartFailed(); return; }
    if (tab === "chart") { if (!chart) chart = new window.CRChart.Chart($("#chart")); chart.set(D, ids, range); }
    else $("#panel-table").innerHTML = window.CRChart.timeTable(D, ids);
  }

  $$('input[name="cview"]').forEach(function (r) {
    r.addEventListener("change", function () {
      view = r.value;
      $$(".legend-view").forEach(function (v) { v.hidden = v.getAttribute("data-view") !== view; });
      var fc = $("#famchips"); fc.classList.toggle("is-off", view !== PRIMARY); fc.parentNode.classList.toggle("is-off", view !== PRIMARY); if (view !== PRIMARY) fc.setAttribute("aria-hidden", "true"); else fc.removeAttribute("aria-hidden");
      drawAll();
      var n = visibleIds().length;
      A.say(r.nextElementSibling.textContent + " group, " + n + (n === 1 ? " line" : " lines"));
    });
  });
  $("#legend").addEventListener("change", function (e) {
    if (e.target.getAttribute("data-sys")) drawAll();
  });
  // A legend row that is hovered or focused emphasises its line in the chart and dims the others.
  function hot(e, on) {
    var row = e.target.closest && e.target.closest("label.lgrow"); if (!row || !chart || tab !== "chart") return;
    var c = $("input.lgcb", row), sid = c && c.getAttribute("data-sys");
    row.classList.toggle("hot", on);
    chart.highlight(on && c.checked ? sid : null);
  }
  var lg = $("#legend");
  lg.addEventListener("mouseover", function (e) { hot(e, true); });
  lg.addEventListener("mouseout", function (e) { hot(e, false); });
  lg.addEventListener("focusin", function (e) { hot(e, true); });
  lg.addEventListener("focusout", function (e) { hot(e, false); });
  $$('input[name="trange"]').forEach(function (r) {
    r.addEventListener("change", function () { range = r.value; drawAll(); A.say(r.value === "2h" ? "Two hours" : "Full campaign"); });
  });
  $("#famchips").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-fam]"); if (!b) return;
    var ids = b.getAttribute("data-ids").split(" "), bx = ids.map(function (x) { return $('#legend input.lgcb[data-sys="' + x + '"]'); }).filter(Boolean);
    var all = bx.every(function (c) { return c.checked; });
    bx.forEach(function (c) { c.checked = !all; });
    drawAll();
    // the change is said (the legend line has already said how many lines are on)
    var nm = b.firstChild && b.firstChild.nextSibling ? b.firstChild.nextSibling.nodeValue.trim() : "", all = ids.length, on = bx.filter(function (c) { return c.checked; }).length;
    A.say(nm + " lines: " + (on === all ? "all " + all + " on" : on === 0 ? "all off" : on + " of " + all + " on"));
  });

  function setTab(name) {
    tab = name;
    $("#tab-chart").setAttribute("aria-selected", String(name === "chart")); $("#tab-chart").tabIndex = name === "chart" ? 0 : -1;
    $("#tab-table").setAttribute("aria-selected", String(name === "table")); $("#tab-table").tabIndex = name === "table" ? 0 : -1;
    $("#panel-chart").hidden = name !== "chart"; $("#panel-table").hidden = name !== "table";
    A.swapIn($(name === "chart" ? "#panel-chart" : "#panel-table"));
    drawAll();
  }
  $$('[role="tab"]', main).forEach(function (t) {
    t.addEventListener("click", function () { setTab(t.id === "tab-table" ? "table" : "chart"); });
    t.addEventListener("keydown", function (e) { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); var o = t.id === "tab-chart" ? $("#tab-table") : $("#tab-chart"); o.focus(); o.click(); } });
  });

  var ft = $('table[data-sortable="grouped"]', main); if (ft) A.attachSort(ft, { grouped: true });
  var fw = $("#final .tbl-wrap");
  if (fw) fw.addEventListener("click", function (e) {
    var g = e.target.closest("button[data-grp]"); if (!g) return;
    var open = g.getAttribute("aria-expanded") !== "true"; g.setAttribute("aria-expanded", String(open));
    $$('tr[data-g="' + g.getAttribute("data-grp") + '"]:not(.grp)', fw).forEach(function (r) { r.hidden = !open; });
  });

  // Choosing another program in the list only prepares the move: Open or Enter makes it (a change of the list by the arrow keys must not load a page).
  var sel = $("#psel"), go = $("#pgo");
  if (sel) {
    var current = sel.value;
    var leave = function () { if (sel.value !== current) location.href = sel.value + ".html"; };
    sel.addEventListener("change", function () {
      var other = sel.value !== current;
      if (go) go.hidden = !other;
      if (other) A.say(sel.options[sel.selectedIndex].text + " selected. Press Enter or Open to go to it.");
    });
    sel.addEventListener("keydown", function (e) { if (e.key === "Enter" && sel.value !== current) { e.preventDefault(); leave(); } });
    if (go) go.addEventListener("click", leave);
  }

  try { if (D) drawAll(); } catch (e) { chartFailed(); }      // a failure of the chart never stops the map below
  // The map is opened in a task of its own, after the chart: a large one takes about 60 ms on a slow machine, and the chart and the map together were one task of
  // twice that. The box keeps its height meanwhile (--mhp to --mhw, one for each band of widths), so nothing moves when the map arrives.
  var box = $("#mapbox");
  function mountMap() {
    if (box && window.BranchMap && window.BranchMapData && window.BranchMapData[id]) {
      mapView = window.BranchMap.mount(box, window.BranchMapData[id], { name: D ? D.name : id, dataUrl: A.root + "data/branchmap/" + id + ".json", reveal: false });
      // The key of the map repeats the classes of the skyline's key under the skyline, so that key is for the eye only once the map is drawn (without the map it is the only one).
      $$("[data-sky-lg]").forEach(function (k) { k.setAttribute("aria-hidden", "true"); });
    } else if (box) {
      box.innerHTML = '<p class="muted">The map did not load. Reload the page.</p>';
    }
  }
  if (box) setTimeout(mountMap, 0);
})();
