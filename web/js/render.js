/*
 * render.js - the read-only "rendered page", i.e. what swimsets.py prints,
 * laid out as collapsible HTML instead of indented text.
 *
 * Every string here comes from the same SwimSet getters the python uses, so
 * the page and `make` agree line for line.
 */
(function (root, factory) {
  const api = factory(root.SwimModel);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Render = api;
})(typeof self !== "undefined" ? self : this, function (SwimModel) {
  "use strict";

  const { printDt, divTime, numStr } = SwimModel;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /**
   * swimsets.py's time_str zeroes the interval of any lane sitting out a set,
   * mutating SwimSet.time as a side effect of printing. Totals read that same
   * list, so the coach view only matches `make` once a print pass has run.
   * One throwaway pprint() settles the tree before we render.
   */
  function settle(set) {
    set.pprint();
    return set;
  }

  /** The headline of a set: "5x 150 Free pull (L4: 4x)". */
  function titleOf(set) {
    let text = `${set.roundsStr}${set.distanceStr}`;
    if (set.stroke) text += String(set.stroke) + (set.msg ? " " : "");
    text += set.msg;
    const edits = set.roundEdits;
    return { text: text.trim(), edits };
  }

  /** The interval line: "@ 1:50  2:05  2:20  2:50(4x)". */
  function intervalRow(set) {
    if (!set.maxTime) return null;
    const row = el("div", "r-intervals");
    row.appendChild(el("span", "r-at", "@"));
    const dist = set.distance.map((d, i) => (d !== set.maxDistance ? numStr(d, set.distanceIsFloat[i]) : ""));
    const rnds = set.rounds.map((r) => (r !== set.maxRounds ? `${r}` : ""));
    const n = Math.min(set.time.length, dist.length, rnds.length);
    for (let i = 0; i < n; i++) {
      const cell = el("span", "r-time");
      cell.appendChild(el("span", "r-lane", `L${i + 1}`));
      cell.appendChild(el("span", "r-value", printDt(set.time[i])));
      const d = dist[i];
      const r = rnds[i];
      let note = "";
      if (d && r && !(d === "0" || r === "0")) note = `${r}x, ${d}`;
      else if (r) note = `${r}x`;
      else if (d) note = `${d}`;
      if (note) cell.appendChild(el("span", "r-note", note));
      row.appendChild(cell);
    }
    return row;
  }

  function statsRows(set) {
    const rows = [];
    const totalTime = set.totalTime;
    const totalDistance = set.totalDistance;
    const isFloat = set.totalDistanceIsFloat;
    const line = el("div", "r-stats");
    line.appendChild(el("span", "r-stats-label", "total"));
    for (let i = 0; i < Math.min(totalTime.length, totalDistance.length); i++) {
      const cell = el("span", "r-stat");
      cell.appendChild(el("span", "r-lane", `L${i + 1}`));
      const d = numStr(totalDistance[i], isFloat[i]);
      cell.appendChild(el("span", "r-value", `${d} @ ${printDt(totalTime[i])}`));
      line.appendChild(cell);
    }
    rows.push(line);

    if (set.maxRounds > 1) {
      const per = el("div", "r-stats r-stats-secondary");
      per.appendChild(el("span", "r-stats-label", "per round"));
      const n = Math.min(totalTime.length, totalDistance.length, set.rounds.length);
      for (let i = 0; i < n; i++) {
        const r = set.rounds[i];
        const cell = el("span", "r-stat");
        cell.appendChild(el("span", "r-lane", `L${i + 1}`));
        cell.appendChild(
          el("span", "r-value", `${Math.trunc(totalDistance[i] / r)} @ ${printDt(divTime(totalTime[i], r))}`),
        );
        per.appendChild(cell);
      }
      rows.push(per);
    }
    return rows;
  }

  function renderSet(set, opts, depth, path) {
    const wrap = el("div", "r-set");
    wrap.dataset.depth = String(depth);
    wrap.dataset.path = path;

    const collapsed = opts.collapsed && opts.collapsed.has(path);
    if (collapsed) wrap.classList.add("collapsed");

    const head = el("div", "r-head");
    if (set.isSuperset) {
      const twisty = el("button", "r-twisty");
      twisty.type = "button";
      twisty.setAttribute("aria-expanded", String(!collapsed));
      twisty.textContent = collapsed ? "▸" : "▾";
      twisty.addEventListener("click", () => {
        const nowCollapsed = wrap.classList.toggle("collapsed");
        twisty.textContent = nowCollapsed ? "▸" : "▾";
        twisty.setAttribute("aria-expanded", String(!nowCollapsed));
        if (opts.onToggle) opts.onToggle(path, nowCollapsed);
      });
      head.appendChild(twisty);
    } else {
      head.appendChild(el("span", "r-twisty-spacer"));
    }

    const { text, edits } = titleOf(set);
    head.appendChild(el("span", depth === 0 ? "r-title r-title-root" : "r-title", text || "(untitled)"));
    if (edits) head.appendChild(el("span", "r-edits", edits));
    wrap.appendChild(head);

    if (opts.coachView && set.printFullStats) {
      const box = el("div", "r-statsbox");
      statsRows(set).forEach((r) => box.appendChild(r));
      wrap.appendChild(box);
    }

    const intervals = intervalRow(set);
    if (intervals) wrap.appendChild(intervals);

    if (set.isSuperset) {
      const kids = el("div", "r-children");
      set.subsets.forEach((s, i) => kids.appendChild(renderSet(s, opts, depth + 1, `${path}.${i}`)));
      wrap.appendChild(kids);
    }
    return wrap;
  }

  /**
   * Render a whole practice.
   *   opts.coachView  add the total / per-round lines for flagged sets
   *   opts.collapsed  Set of collapsed set paths ("0.1.2")
   *   opts.onToggle   called with (path, collapsed) when a twisty is clicked
   */
  function renderPage(set, opts = {}) {
    settle(set);
    const page = el("div", "r-page");
    page.appendChild(renderSet(set, opts, 0, "0"));
    return page;
  }

  /** Per-lane grand totals, for the always-visible summary. */
  function laneTotals(set) {
    settle(set);
    const totalTime = set.totalTime;
    const totalDistance = set.totalDistance;
    const out = [];
    for (let i = 0; i < Math.min(totalTime.length, totalDistance.length); i++) {
      out.push({ lane: i + 1, distance: totalDistance[i], time: totalTime[i], timeStr: printDt(totalTime[i]) });
    }
    return out;
  }

  return { renderPage, laneTotals, settle, printDt };
});
