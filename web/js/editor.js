/*
 * editor.js - the WYSIWYG document.
 *
 * Sets are edited in the shape they print in: "5x 150 Free pull" on one line,
 * the per-lane intervals underneath. Fields are inputs styled as text, so the
 * document reads like the practice sheet while staying editable in place.
 *
 * Two update paths, deliberately separate:
 *   render()   rebuilds the DOM. Used when structure changes (add, delete,
 *              move, indent, lane count) where losing focus is expected.
 *   refresh()  recomputes only the derived text -- intervals, per-set totals,
 *              lane totals -- so typing never rebuilds the field being typed
 *              into and the numbers still move on every keystroke.
 */
(function (root, factory) {
  const api = factory(root.SwimModel, root.Workout, root.Render);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Editor = api;
})(typeof self !== "undefined" ? self : this, function (SwimModel, Workout, Render) {
  "use strict";

  const { buildTimedelta, formatTimedelta, printDt, numStr } = SwimModel;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function button(className, label, title, onClick) {
    const b = el("button", className, label);
    b.type = "button";
    if (title) b.title = title;
    b.addEventListener("click", onClick);
    return b;
  }

  /** An <input> that grows with its contents, so it reads as inline text. */
  function field(className, value, onCommit, opts = {}) {
    const input = el("input", "f " + className);
    input.type = "text";
    input.value = value;
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.title) input.title = opts.title;
    const size = () => {
      const len = Math.max((input.value || input.placeholder || "").length, opts.min || 1);
      input.style.width = `${len + (opts.pad || 0)}ch`;
    };
    size();
    input.addEventListener("input", () => {
      size();
      if (opts.live) onCommit(input.value, input);
    });
    input.addEventListener("change", () => onCommit(input.value, input));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      } else if (e.key === "Escape") {
        input.value = value;
        size();
        input.blur();
      }
    });
    return input;
  }

  const parseIntOr = (text, fallback) => {
    const n = parseFloat(String(text).replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : fallback;
  };

  function parseDuration(text, fallback) {
    const t = String(text).trim();
    if (!t) return fallback;
    if (/^-?\d*:\d{1,2}$/.test(t)) return buildTimedelta(t.replace(/:(\d)$/, ":0$1"));
    const n = parseFloat(t);
    return Number.isFinite(n) ? Math.round(n) : fallback;
  }

  class DocEditor {
    /**
     * @param {HTMLElement} container
     * @param {object} ctx  { state, onChange(structural), pushUndo() }
     */
    constructor(container, ctx) {
      this.container = container;
      this.ctx = ctx;
      this.detailOpen = new Set();
      this.dragId = null;
    }

    get state() {
      return this.ctx.state;
    }

    /** Depth-first walk yielding [node, parent, index]. */
    *walk(node = this.state.root, parent = null, index = 0) {
      yield [node, parent, index];
      for (let i = 0; i < node.subsets.length; i++) {
        yield* this.walk(node.subsets[i], node, i);
      }
    }

    find(id) {
      for (const entry of this.walk()) if (entry[0].id === id) return entry;
      return [null, null, -1];
    }

    // -------------------------------------------------------------- mutation

    change(structural = true) {
      this.ctx.onChange(structural);
    }

    edit(fn) {
      this.ctx.pushUndo();
      fn();
    }

    addSibling(node) {
      const [, parent, index] = this.find(node.id);
      const target = parent || node; // adding beside the root means adding into it
      const at = parent ? index + 1 : target.subsets.length;
      this.edit(() => {
        target.subsets.splice(at, 0, Workout.newSet(this.state.lanes));
        target.collapsed = false;
      });
      this.change();
    }

    addSubset(node) {
      this.edit(() => {
        node.subsets.push(Workout.newSet(this.state.lanes));
        node.collapsed = false;
      });
      this.change();
    }

    duplicate(node) {
      const [, parent, index] = this.find(node.id);
      if (!parent) return;
      this.edit(() => parent.subsets.splice(index + 1, 0, Workout.cloneNode(node)));
      this.change();
    }

    remove(node) {
      const [, parent, index] = this.find(node.id);
      if (!parent) return;
      this.edit(() => parent.subsets.splice(index, 1));
      this.change();
    }

    move(node, delta) {
      const [, parent, index] = this.find(node.id);
      if (!parent) return;
      const to = index + delta;
      if (to < 0 || to >= parent.subsets.length) return;
      this.edit(() => {
        parent.subsets.splice(index, 1);
        parent.subsets.splice(to, 0, node);
      });
      this.change();
    }

    /** Make this set a subset of the sibling above it. */
    indent(node) {
      const [, parent, index] = this.find(node.id);
      if (!parent || index === 0) return;
      const target = parent.subsets[index - 1];
      this.edit(() => {
        parent.subsets.splice(index, 1);
        target.subsets.push(node);
        target.collapsed = false;
      });
      this.change();
    }

    /** Lift this set to sit just after its parent. */
    outdent(node) {
      const [, parent] = this.find(node.id);
      if (!parent) return;
      const [, grand, parentIndex] = this.find(parent.id);
      if (!grand) return;
      this.edit(() => {
        parent.subsets.splice(parent.subsets.indexOf(node), 1);
        grand.subsets.splice(parentIndex + 1, 0, node);
      });
      this.change();
    }

    /** Drop `dragged` immediately before/after `target`, or inside it. */
    drop(draggedId, targetId, where) {
      if (draggedId === targetId) return;
      const [dragged, dragParent] = this.find(draggedId);
      const [target] = this.find(targetId);
      if (!dragged || !target || !dragParent) return;
      // refuse to drop a set into its own subtree
      for (const [n] of this.walk(dragged)) if (n.id === targetId) return;

      this.edit(() => {
        dragParent.subsets.splice(dragParent.subsets.indexOf(dragged), 1);
        if (where === "inside") {
          target.subsets.push(dragged);
          target.collapsed = false;
          return;
        }
        const [, targetParent] = this.find(targetId);
        const holder = targetParent || target;
        const at = targetParent ? holder.subsets.indexOf(target) + (where === "after" ? 1 : 0) : 0;
        holder.subsets.splice(at, 0, dragged);
      });
      this.change();
    }

    setAllLanes(node, key, value) {
      this.edit(() => {
        node[key] = node[key].map(() => value);
      });
    }

    /**
     * Freeze the currently computed intervals into explicit per-lane times.
     * The python model has no per-lane override -- `time` is all-or-nothing --
     * so editing one lane pins the rest at what they already showed.
     */
    makeExplicit(node) {
      if (node.time) return;
      const stroke = this.state.strokes[node.strokeKey];
      // Recomputed from the stroke rather than read off the rendered tree,
      // whose intervals have already been zeroed for any lane sitting out.
      node.time = node.distance.map((d, lane) => {
        if (!stroke) return 0;
        return SwimModel.calcSetTime(
          d,
          buildTimedelta(stroke.base_times[lane] || "0:00"),
          node.additionalBase[lane],
          node.additional[lane],
          this.state.rounding,
        );
      });
    }

    // ----------------------------------------------------------------- render

    render() {
      const scroll = this.container.scrollTop;
      this.container.textContent = "";
      this.container.appendChild(this.renderSet(this.state.root, null, 0));
      this.container.scrollTop = scroll;
      this.refresh();
    }

    renderSet(node, parent, depth) {
      const wrap = el("div", "e-set");
      wrap.dataset.id = node.id;
      wrap.dataset.depth = String(depth);
      if (node.collapsed) wrap.classList.add("collapsed");
      wrap.appendChild(this.renderHead(node, parent, depth));
      wrap.appendChild(this.renderIntervals(node));
      wrap.appendChild(el("div", "e-stats"));
      if (this.detailOpen.has(node.id)) wrap.appendChild(this.renderDetail(node));

      const kids = el("div", "e-children");
      node.subsets.forEach((s) => kids.appendChild(this.renderSet(s, node, depth + 1)));
      wrap.appendChild(kids);
      this.attachDrag(wrap, node, parent);
      return wrap;
    }

    renderHead(node, parent, depth) {
      const head = el("div", "e-head");
      if (depth === 0) head.classList.add("e-head-root");
      if (node.subsets.length) head.classList.add("has-subsets");

      if (node.subsets.length) {
        const twisty = button("e-twisty", node.collapsed ? "▸" : "▾", "Collapse or expand", () => {
          node.collapsed = !node.collapsed;
          this.change();
        });
        head.appendChild(twisty);
      } else {
        head.appendChild(el("span", "e-twisty-spacer"));
      }

      if (parent) {
        const grip = el("span", "e-grip", "⠿");
        grip.title = "Drag to move";
        grip.draggable = true;
        head.appendChild(grip);
      }

      const maxRounds = Math.max(...node.rounds);
      const rounds = field(
        "f-rounds",
        maxRounds > 1 ? String(maxRounds) : "",
        (v) => {
          const n = Math.max(0, Math.round(parseIntOr(v, 1)));
          this.setAllLanes(node, "rounds", n);
          this.change(false);
        },
        { placeholder: "1", min: 1, title: "Rounds (all lanes)" },
      );
      if (maxRounds <= 1) rounds.classList.add("is-default");
      head.appendChild(rounds);
      head.appendChild(el("span", "e-x", "x"));

      const maxDistance = Math.max(...node.distance);
      const distance = field(
        "f-distance",
        maxDistance ? numStr(maxDistance, !Number.isInteger(maxDistance)) : "",
        (v) => {
          this.setAllLanes(node, "distance", Math.max(0, parseIntOr(v, 0)));
          this.change(false);
        },
        { placeholder: "dist", min: 3, title: "Distance (all lanes)" },
      );
      if (!maxDistance) distance.classList.add("is-default");
      head.appendChild(distance);

      const select = el("select", "f f-stroke");
      const none = el("option", null, "—");
      none.value = "";
      select.appendChild(none);
      for (const [key, s] of Object.entries(this.state.strokes)) {
        const opt = el("option", null, s.name);
        opt.value = key;
        select.appendChild(opt);
      }
      if (node.strokeKey && !(node.strokeKey in this.state.strokes)) {
        const opt = el("option", null, `${node.strokeKey} (unknown)`);
        opt.value = node.strokeKey;
        select.appendChild(opt);
      }
      select.value = node.strokeKey || "";
      select.title = "Stroke";
      if (!node.strokeKey) select.classList.add("is-default");
      select.addEventListener("change", () => {
        this.edit(() => {
          node.strokeKey = select.value || null;
        });
        this.change(false);
      });
      head.appendChild(select);

      head.appendChild(
        field(
          "f-msg",
          node.msg,
          (v) => {
            this.edit(() => {
              node.msg = v;
            });
            this.change(false);
          },
          { placeholder: depth === 0 ? "Practice title" : "notes", min: 8, live: true },
        ),
      );

      head.appendChild(el("span", "e-edits"));
      head.appendChild(el("span", "e-spacer"));

      const stats = el("label", "e-statstoggle");
      const box = el("input");
      box.type = "checkbox";
      box.checked = node.printFullStats;
      box.title = "Show totals for this set in the coach view";
      box.addEventListener("change", () => {
        this.edit(() => {
          node.printFullStats = box.checked;
        });
        this.change(false);
      });
      stats.appendChild(box);
      stats.appendChild(el("span", null, "Σ"));
      head.appendChild(stats);

      const actions = el("span", "e-actions");
      actions.appendChild(
        button("e-act", "⋯", "Per-lane detail", () => {
          if (this.detailOpen.has(node.id)) this.detailOpen.delete(node.id);
          else this.detailOpen.add(node.id);
          this.change();
        }),
      );
      actions.appendChild(button("e-act", "＋", "Add a set below", () => this.addSibling(node)));
      actions.appendChild(button("e-act", "⤵", "Add a subset", () => this.addSubset(node)));
      if (parent) {
        actions.appendChild(button("e-act", "⧉", "Duplicate", () => this.duplicate(node)));
        actions.appendChild(button("e-act", "↑", "Move up", () => this.move(node, -1)));
        actions.appendChild(button("e-act", "↓", "Move down", () => this.move(node, 1)));
        actions.appendChild(button("e-act", "⇥", "Make a subset of the set above", () => this.indent(node)));
        actions.appendChild(button("e-act", "⇤", "Lift out of its parent", () => this.outdent(node)));
        actions.appendChild(button("e-act e-danger", "✕", "Delete", () => this.remove(node)));
      }
      head.appendChild(actions);
      return head;
    }

    renderIntervals(node) {
      const row = el("div", "e-intervals");
      row.appendChild(el("span", "e-at", "@"));
      for (let lane = 0; lane < this.state.lanes; lane++) {
        const cell = el("span", "e-time");
        cell.appendChild(el("span", "e-lane", `L${lane + 1}`));
        const input = field(
          "f-time",
          "",
          (v, inputEl) => {
            this.edit(() => {
              this.makeExplicit(node);
              node.time[lane] = parseDuration(v, node.time[lane]);
            });
            inputEl.value = formatTimedelta(node.time[lane]);
            this.change(false);
          },
          { min: 4, title: `Lane ${lane + 1} interval` },
        );
        input.dataset.lane = String(lane);
        cell.appendChild(input);
        cell.appendChild(el("span", "e-note"));
        row.appendChild(cell);
      }
      row.appendChild(
        button("e-reset", "↺", "Back to the stroke's base time", () => {
          this.edit(() => {
            node.time = null;
          });
          this.change(false);
        }),
      );
      return row;
    }

    renderDetail(node) {
      const wrap = el("div", "e-detail");
      const table = el("table", "e-grid");
      const head = el("tr");
      head.appendChild(el("th", null, ""));
      for (let lane = 0; lane < this.state.lanes; lane++) head.appendChild(el("th", null, `L${lane + 1}`));
      table.appendChild(head);

      const numericRow = (label, key, title) => {
        const tr = el("tr");
        tr.appendChild(el("th", null, label));
        for (let lane = 0; lane < this.state.lanes; lane++) {
          const td = el("td");
          td.appendChild(
            field(
              "f-cell",
              String(node[key][lane]),
              (v) => {
                this.edit(() => {
                  node[key][lane] = Math.max(0, parseIntOr(v, node[key][lane]));
                });
                this.change(false);
              },
              { min: 3, title },
            ),
          );
          tr.appendChild(td);
        }
        table.appendChild(tr);
      };

      const durationRow = (label, key, title) => {
        const tr = el("tr");
        tr.appendChild(el("th", null, label));
        for (let lane = 0; lane < this.state.lanes; lane++) {
          const td = el("td");
          td.appendChild(
            field(
              "f-cell",
              formatTimedelta(node[key][lane]),
              (v, inputEl) => {
                this.edit(() => {
                  node[key][lane] = parseDuration(v, node[key][lane]);
                });
                inputEl.value = formatTimedelta(node[key][lane]);
                this.change(false);
              },
              { min: 4, title },
            ),
          );
          tr.appendChild(td);
        }
        table.appendChild(tr);
      };

      numericRow("rounds", "rounds", "Rounds for this lane (0 sits the lane out)");
      numericRow("distance", "distance", "Distance for this lane");
      durationRow("+ per 100", "additionalBase", "Added to the base time for every 100");
      durationRow("+ once", "additional", "Added once to the whole swim");
      wrap.appendChild(table);

      const note = el("p", "hint");
      note.textContent = node.time
        ? "Intervals are set by hand. ↺ on the interval line hands them back to the stroke."
        : "Intervals come from the stroke's base time. Typing one takes over all lanes.";
      wrap.appendChild(note);
      return wrap;
    }

    attachDrag(wrap, node, parent) {
      const grip = wrap.querySelector(":scope > .e-head > .e-grip");
      if (grip) {
        grip.addEventListener("dragstart", (e) => {
          this.dragId = node.id;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", node.id);
          wrap.classList.add("dragging");
        });
        grip.addEventListener("dragend", () => {
          this.dragId = null;
          wrap.classList.remove("dragging");
          this.container.querySelectorAll(".drop-before,.drop-after,.drop-inside").forEach((n) =>
            n.classList.remove("drop-before", "drop-after", "drop-inside"),
          );
        });
      }

      const head = wrap.querySelector(":scope > .e-head");
      const zone = (e) => {
        const r = head.getBoundingClientRect();
        const y = (e.clientY - r.top) / r.height;
        if (e.clientX - r.left > r.width * 0.45 && y > 0.25 && y < 0.75) return "inside";
        return y < 0.5 ? "before" : "after";
      };
      head.addEventListener("dragover", (e) => {
        if (!this.dragId || this.dragId === node.id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const where = parent ? zone(e) : "inside";
        head.classList.remove("drop-before", "drop-after", "drop-inside");
        head.classList.add(`drop-${where}`);
      });
      head.addEventListener("dragleave", () => {
        head.classList.remove("drop-before", "drop-after", "drop-inside");
      });
      head.addEventListener("drop", (e) => {
        if (!this.dragId) return;
        e.preventDefault();
        const where = parent ? zone(e) : "inside";
        head.classList.remove("drop-before", "drop-after", "drop-inside");
        this.drop(this.dragId, node.id, where);
      });
    }

    // ---------------------------------------------------------------- refresh

    /** Update every computed readout in place, without rebuilding fields. */
    refresh() {
      const root = this.ctx.swimSetFor(this.state.root);
      if (!root) return;
      Render.settle(root);
      this.refreshSet(this.state.root, root);
    }

    refreshSet(node, set) {
      const wrap = this.container.querySelector(`.e-set[data-id="${node.id}"]`);
      if (!wrap) return;

      const edits = wrap.querySelector(":scope > .e-head > .e-edits");
      if (edits) edits.textContent = set.roundEdits;

      const row = wrap.querySelector(":scope > .e-intervals");
      const explicit = Boolean(node.time);
      row.classList.toggle("is-explicit", explicit);
      row.classList.toggle("is-empty", !set.maxTime);
      const cells = row.querySelectorAll(":scope > .e-time");
      cells.forEach((cell, lane) => {
        const input = cell.querySelector("input");
        const value = set.time[lane];
        if (document.activeElement !== input) {
          // a zero interval prints as "--"; leave the field blank so it reads
          // as "nothing set here" rather than as a value you have to clear
          input.value = value ? printDt(value) : "";
          input.placeholder = "--";
          input.style.width = `${Math.max(input.value.length, 4)}ch`;
        }
        input.classList.toggle("computed", !explicit);
        const noteEl = cell.querySelector(".e-note");
        const d = set.distance[lane];
        const r = set.rounds[lane];
        const parts = [];
        if (r !== set.maxRounds) parts.push(`${r}x`);
        if (d !== set.maxDistance) parts.push(numStr(d, set.distanceIsFloat[lane]));
        noteEl.textContent = parts.join(", ");
      });

      const stats = wrap.querySelector(":scope > .e-stats");
      stats.textContent = "";
      if (node.printFullStats) {
        const totalTime = set.totalTime;
        const totalDistance = set.totalDistance;
        const isFloat = set.totalDistanceIsFloat;
        const n = Math.min(totalTime.length, totalDistance.length);
        for (let i = 0; i < n; i++) {
          const chip = el("span", "e-chip");
          chip.appendChild(el("span", "e-lane", `L${i + 1}`));
          chip.appendChild(
            el("span", null, `${numStr(totalDistance[i], isFloat[i])} @ ${printDt(totalTime[i])}`),
          );
          stats.appendChild(chip);
        }
      }

      node.subsets.forEach((child, i) => this.refreshSet(child, set.subsets[i]));
    }
  }

  return { DocEditor, field, button, el, parseDuration, parseIntOr };
});
