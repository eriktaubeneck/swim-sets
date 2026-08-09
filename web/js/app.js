/*
 * app.js - shell: state, undo, storage, config panels, file in/out.
 *
 * The whole practice lives in one plain object. Any change runs the same
 * cycle: mutate state -> rebuild the SwimSet tree -> repaint the derived
 * views. Nothing is persisted server-side; the app is a static page.
 */
(function () {
  "use strict";

  const { DocEditor, el, button, field, parseDuration } = Editor;
  const STORAGE_KEY = "swim-sets:v1";
  const UNDO_LIMIT = 100;

  const $ = (id) => document.getElementById(id);

  const state = {
    lanes: Workout.PYTHON_DEFAULT_LANES,
    root: null,
    strokes: null,
    rounding: 5,
    view: "coach",
    layout: "split",
    pageCollapsed: new Set(),
  };

  let rootSet = null;
  let editor = null;
  const undoStack = [];
  const redoStack = [];
  let suspendUndo = false;

  // ------------------------------------------------------------- persistence

  const snapshot = () =>
    JSON.stringify({
      lanes: state.lanes,
      root: state.root,
      strokes: state.strokes,
      rounding: state.rounding,
      view: state.view,
      layout: state.layout,
    });

  function restore(json) {
    const data = JSON.parse(json);
    state.lanes = data.lanes;
    state.root = data.root;
    state.strokes = data.strokes;
    state.rounding = data.rounding;
    if (data.view) state.view = data.view;
    if (data.layout) state.layout = data.layout;
    Workout.reserveIds(state.root);
  }

  function pushUndo() {
    if (suspendUndo) return;
    undoStack.push(snapshot());
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0;
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    restore(undoStack.pop());
    onChange(true, { skipUndo: true });
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    restore(redoStack.pop());
    onChange(true, { skipUndo: true });
  }

  // ------------------------------------------------------------- computation

  const setById = new Map();

  function recompute() {
    rootSet = Workout.toSwimSet(state.root, state.lanes, state.strokes, state.rounding);
    setById.clear();
    (function walk(node, set) {
      setById.set(node.id, set);
      node.subsets.forEach((child, i) => walk(child, set.subsets[i]));
    })(state.root, rootSet);
  }

  function onChange(structural = true, opts = {}) {
    recompute();
    if (structural) editor.render();
    else editor.refresh();
    paintTotals();
    paintPage();
    paintYaml();
    if (!opts.skipUndo) {
      try {
        localStorage.setItem(STORAGE_KEY, snapshot());
      } catch (err) {
        /* private mode, quota - the app still works, it just will not reopen */
      }
    } else {
      paintSetup();
      paintStrokes();
    }
    $("btn-undo").disabled = !undoStack.length;
    $("btn-redo").disabled = !redoStack.length;
  }

  // ------------------------------------------------------------------ totals

  function paintTotals() {
    const box = $("totals");
    box.textContent = "";
    const totals = Render.laneTotals(rootSet);

    const table = el("table", "totals-table");
    const head = el("tr");
    ["", "distance", "time"].forEach((h) => head.appendChild(el("th", null, h)));
    table.appendChild(head);
    totals.forEach((t) => {
      const tr = el("tr");
      tr.appendChild(el("th", null, `L${t.lane}`));
      tr.appendChild(el("td", "num", SwimModel.numStr(t.distance, !Number.isInteger(t.distance))));
      tr.appendChild(el("td", "num", t.timeStr));
      table.appendChild(tr);
    });
    box.appendChild(table);

    if (state.root.subsets.length) {
      const details = el("details", "sub");
      details.appendChild(el("summary", null, "By set"));
      const inner = el("div", "sub-body");
      state.root.subsets.forEach((node, i) => {
        const set = rootSet.subsets[i];
        const line = el("div", "sub-row");
        line.appendChild(el("div", "sub-name", node.msg || `Set ${i + 1}`));
        const chips = el("div", "sub-chips");
        Render.laneTotals(set).forEach((t) => {
          const chip = el("span", "e-chip");
          chip.appendChild(el("span", "e-lane", `L${t.lane}`));
          chip.appendChild(el("span", null, `${SwimModel.numStr(t.distance, !Number.isInteger(t.distance))} @ ${t.timeStr}`));
          chips.appendChild(chip);
        });
        line.appendChild(chips);
        inner.appendChild(line);
      });
      details.appendChild(inner);
      box.appendChild(details);
    }
  }

  // -------------------------------------------------------------- page panel

  function paintPage() {
    const box = $("page");
    box.textContent = "";
    box.appendChild(
      Render.renderPage(rootSet, {
        coachView: state.view === "coach",
        collapsed: state.pageCollapsed,
        onToggle: (path, collapsed) => {
          if (collapsed) state.pageCollapsed.add(path);
          else state.pageCollapsed.delete(path);
        },
      }),
    );
    document.querySelectorAll("#card-page .seg-mini .seg").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === state.view);
    });
  }

  // ------------------------------------------------------------- setup panel

  function paintSetup() {
    const box = $("setup");
    box.textContent = "";

    const lanes = el("div", "row");
    lanes.appendChild(el("label", null, "Lanes"));
    lanes.appendChild(
      button("step", "−", "One fewer lane", () => changeLanes(state.lanes - 1)),
    );
    const count = el("span", "lane-count", String(state.lanes));
    lanes.appendChild(count);
    lanes.appendChild(button("step", "+", "One more lane", () => changeLanes(state.lanes + 1)));
    box.appendChild(lanes);

    const rounding = el("div", "row");
    rounding.appendChild(el("label", null, "Round intervals to"));
    const select = el("select");
    [1, 5, 10, 15].forEach((n) => {
      const opt = el("option", null, `${n} sec`);
      opt.value = String(n);
      select.appendChild(opt);
    });
    select.value = String(state.rounding);
    select.addEventListener("change", () => {
      pushUndo();
      state.rounding = parseInt(select.value, 10);
      onChange(false);
    });
    rounding.appendChild(select);
    box.appendChild(rounding);

    box.appendChild(
      el(
        "p",
        "hint",
        "Intervals round down to a multiple of this, after any fraction of a second rounds up — the same rule swimsets.py uses.",
      ),
    );
  }

  function changeLanes(n) {
    const lanes = Math.max(1, Math.min(10, n));
    if (lanes === state.lanes) return;
    pushUndo();
    state.lanes = lanes;
    Workout.setLaneCount(state.root, lanes);
    state.strokes = Workout.setStrokeLaneCount(state.strokes, lanes);
    paintSetup();
    paintStrokes();
    onChange(true);
  }

  // ------------------------------------------------------------ strokes panel

  function paintStrokes() {
    const box = $("strokes");
    box.textContent = "";

    const table = el("table", "strokes-table");
    const head = el("tr");
    head.appendChild(el("th", null, "stroke"));
    for (let lane = 0; lane < state.lanes; lane++) head.appendChild(el("th", null, `L${lane + 1}`));
    head.appendChild(el("th", null, ""));
    table.appendChild(head);

    for (const [key, stroke] of Object.entries(state.strokes)) {
      const tr = el("tr");
      const nameCell = el("th");
      nameCell.appendChild(
        field(
          "f-cell f-strokename",
          stroke.name,
          (v) => {
            pushUndo();
            stroke.name = v || key;
            onChange(false);
          },
          { min: 6, title: `Display name (key: ${key})` },
        ),
      );
      tr.appendChild(nameCell);

      for (let lane = 0; lane < state.lanes; lane++) {
        const td = el("td");
        td.appendChild(
          field(
            "f-cell",
            stroke.base_times[lane] || "0:00",
            (v, input) => {
              pushUndo();
              const seconds = parseDuration(v, SwimModel.buildTimedelta(stroke.base_times[lane] || "0:00"));
              stroke.base_times[lane] = SwimModel.formatTimedelta(seconds);
              input.value = stroke.base_times[lane];
              onChange(false);
            },
            { min: 4, title: `${stroke.name} base per 100, lane ${lane + 1}` },
          ),
        );
        tr.appendChild(td);
      }

      const actions = el("td");
      actions.appendChild(
        button("e-act e-danger", "✕", `Remove ${stroke.name}`, () => {
          if (!confirm(`Remove the "${stroke.name}" stroke? Sets using it lose their stroke.`)) return;
          pushUndo();
          delete state.strokes[key];
          for (const [node] of editor.walk()) if (node.strokeKey === key) node.strokeKey = null;
          paintStrokes();
          onChange(true);
        }),
      );
      tr.appendChild(actions);
      table.appendChild(tr);
    }
    box.appendChild(table);

    const row = el("div", "row");
    row.appendChild(
      button(null, "Add stroke", "Add a new stroke and base times", () => {
        const name = prompt("Stroke name (e.g. Fly)");
        if (!name) return;
        const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
        if (state.strokes[key]) return alert(`"${key}" already exists.`);
        pushUndo();
        state.strokes[key] = {
          name,
          base_times: new Array(state.lanes).fill(null).map((_, i) => `${1 + Math.floor(i / 2)}:${i % 2 ? "30" : "00"}`),
        };
        paintStrokes();
        onChange(true);
      }),
    );
    row.appendChild(button(null, "Export strokes.yaml", "Download the base times", exportStrokes));
    box.appendChild(row);
    box.appendChild(
      el("p", "hint", "Drop a strokes.yaml onto the window to load a different set of base times."),
    );
  }

  // ---------------------------------------------------------------- yaml panel

  function workoutDict() {
    return Workout.toDict(state.root, state.lanes);
  }

  function workoutYaml() {
    return YamlLite.dump(workoutDict(), Workout.KEY_ORDER);
  }

  function paintYaml() {
    const area = $("yaml");
    if (document.activeElement === area) return;
    area.value = workoutYaml();
  }

  function strokesYaml() {
    const out = {};
    for (const [key, s] of Object.entries(state.strokes)) {
      out[key] = { name: s.name, base_times: s.base_times.slice() };
      if (state.rounding !== 5) out[key]._round = state.rounding;
    }
    return YamlLite.dump(out, ["name", "base_times", "_round"]);
  }

  // -------------------------------------------------------------------- files

  function download(name, text) {
    const blob = new Blob([text], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = el("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function slug(text) {
    return (
      String(text || "workout")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "workout"
    );
  }

  const exportStrokes = () => download("strokes.yaml", strokesYaml());

  function warn(messages) {
    const box = $("warnings");
    box.textContent = "";
    if (!messages.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    messages.slice(0, 8).forEach((m) => box.appendChild(el("div", null, m)));
    if (messages.length > 8) box.appendChild(el("div", null, `…and ${messages.length - 8} more`));
    box.appendChild(button("warn-dismiss", "dismiss", "Hide", () => (box.hidden = true)));
  }

  /** Load YAML text: either a workout or a strokes table. */
  function loadYaml(text, sourceName) {
    let dict;
    try {
      dict = YamlLite.parse(text);
    } catch (err) {
      warn([`Could not read ${sourceName || "that file"}: ${err.message}`]);
      return false;
    }
    if (!dict || typeof dict !== "object") {
      warn([`${sourceName || "That file"} did not contain a workout.`]);
      return false;
    }

    const strokes = Workout.strokesFromYaml(dict);
    if (strokes && !dict.subsets && !dict.msg) {
      pushUndo();
      state.strokes = Workout.setStrokeLaneCount(strokes, state.lanes);
      paintStrokes();
      onChange(true);
      warn([`Loaded ${Object.keys(strokes).length} strokes from ${sourceName || "file"}.`]);
      return true;
    }

    const warnings = [];
    const loaded = Workout.fromYaml(dict, warnings);
    pushUndo();
    state.lanes = loaded.lanes;
    state.root = loaded.root;
    state.strokes = Workout.setStrokeLaneCount(state.strokes, state.lanes);
    state.pageCollapsed.clear();
    paintSetup();
    paintStrokes();
    onChange(true);
    warn(warnings);
    return true;
  }

  // ------------------------------------------------------------------- wiring

  function wire() {
    $("btn-new").addEventListener("click", () => {
      if (!confirm("Start a new practice? The current one is replaced.")) return;
      pushUndo();
      const fresh = Workout.newWorkout(state.lanes);
      state.root = fresh.root;
      state.pageCollapsed.clear();
      onChange(true);
    });

    $("btn-open").addEventListener("click", () => $("file-input").click());
    $("file-input").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      file.text().then((text) => loadYaml(text, file.name));
      e.target.value = "";
    });

    $("btn-save").addEventListener("click", () => {
      download(`${slug(state.root.msg)}.yaml`, workoutYaml());
    });

    $("btn-undo").addEventListener("click", undo);
    $("btn-redo").addEventListener("click", redo);

    $("btn-collapse").addEventListener("click", () => setAllCollapsed(true));
    $("btn-expand").addEventListener("click", () => setAllCollapsed(false));

    document.querySelectorAll("[data-layout]").forEach((b) => {
      b.addEventListener("click", () => setLayout(b.dataset.layout));
    });

    document.querySelectorAll("#card-page .seg-mini .seg").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.preventDefault();
        state.view = b.dataset.view;
        paintPage();
      });
    });

    $("btn-print").addEventListener("click", printPage);

    $("btn-yaml-apply").addEventListener("click", () => {
      if (loadYaml($("yaml").value, "the YAML panel")) {
        $("yaml-status").textContent = "applied";
        setTimeout(() => ($("yaml-status").textContent = ""), 2000);
      }
    });
    $("btn-yaml-copy").addEventListener("click", () => {
      navigator.clipboard.writeText(workoutYaml()).then(() => {
        $("yaml-status").textContent = "copied";
        setTimeout(() => ($("yaml-status").textContent = ""), 2000);
      });
    });

    window.addEventListener("keydown", (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "s") {
        e.preventDefault();
        download(`${slug(state.root.msg)}.yaml`, workoutYaml());
      } else if (e.key === "p") {
        e.preventDefault();
        printPage();
      }
    });

    window.addEventListener("dragover", (e) => {
      if (e.dataTransfer.types.includes("Files")) e.preventDefault();
    });
    window.addEventListener("drop", (e) => {
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      e.preventDefault();
      file.text().then((text) => loadYaml(text, file.name));
    });
  }

  function setAllCollapsed(collapsed) {
    for (const [node] of editor.walk()) {
      if (node.subsets.length && node !== state.root) node.collapsed = collapsed;
    }
    state.pageCollapsed.clear();
    if (collapsed) {
      (function walk(node, path) {
        node.subsets.forEach((child, i) => {
          const childPath = `${path}.${i}`;
          if (child.subsets.length) state.pageCollapsed.add(childPath);
          walk(child, childPath);
        });
      })(state.root, "0");
    }
    onChange(true);
  }

  function setLayout(layout) {
    state.layout = layout;
    $("main").dataset.layout = layout;
    document.querySelectorAll("[data-layout]").forEach((b) => {
      b.classList.toggle("active", b.dataset.layout === layout);
    });
    if (layout === "page") $("card-page").open = true;
  }

  function printPage() {
    const box = $("print-page");
    box.textContent = "";
    box.appendChild(Render.renderPage(rootSet, { coachView: state.view === "coach" }));
    window.print();
  }

  // ---------------------------------------------------------------------- init

  function init() {
    let loaded = false;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        restore(saved);
        loaded = Boolean(state.root && state.strokes);
      }
    } catch (err) {
      loaded = false;
    }
    if (!loaded) {
      const fresh = Workout.newWorkout(Workout.PYTHON_DEFAULT_LANES);
      state.lanes = fresh.lanes;
      state.root = fresh.root;
      state.strokes = Workout.setStrokeLaneCount(
        JSON.parse(JSON.stringify(Workout.DEFAULT_STROKES)),
        fresh.lanes,
      );
    }

    editor = new DocEditor($("doc"), {
      state,
      pushUndo,
      onChange: (structural) => onChange(structural),
      swimSetFor: (node) => setById.get(node.id),
    });

    wire();
    setLayout(state.layout);
    paintSetup();
    paintStrokes();
    suspendUndo = true;
    onChange(true);
    suspendUndo = false;
    $("btn-undo").disabled = true;
    $("btn-redo").disabled = true;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
