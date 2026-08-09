/*
 * workout.js - the editor's document model, and its bridge to workout YAML.
 *
 * The editor keeps every per-lane value as a dense array of length `lanes`,
 * which makes the UI uniform (a lane always has a distance, a round count, an
 * interval). YAML is the wire format on both sides: `fromYaml` expands the
 * compact per-set forms swimsets.py accepts, and `toDict` compacts them back.
 *
 * `toDict` is also what feeds the live preview -- the numbers on screen are
 * computed from the same dictionary that gets written to disk, so the preview
 * cannot drift from what `make` would print.
 */
(function (root, factory) {
  const api = factory(
    typeof module === "object" && module.exports ? require("./model.js") : root.SwimModel,
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Workout = api;
})(typeof self !== "undefined" ? self : this, function (SwimModel) {
  "use strict";

  const { buildTimedelta, formatTimedelta, SwimSet } = SwimModel;

  const PYTHON_DEFAULT_LANES = 4;

  /** Mirrors strokes.yaml, so the editor has sensible defaults offline. */
  const DEFAULT_STROKES = {
    free: { name: "Free", base_times: ["1:20", "1:30", "1:45", "2:10"] },
    back: { name: "Back", base_times: ["1:25", "1:35", "1:50", "2:20"] },
    fly: { name: "Fly", base_times: ["1:30", "1:40", "1:55", "2:25"] },
    breast: { name: "Breast", base_times: ["1:35", "1:45", "2:00", "2:30"] },
    stroke: { name: "Stroke", base_times: ["1:35", "1:45", "2:00", "2:30"] },
    choice: { name: "Choice", base_times: ["1:30", "1:40", "1:55", "2:30"] },
    im: { name: "IM", base_times: ["1:40", "1:50", "2:15", "2:40"] },
    kick: { name: "Kick", base_times: ["2:00", "2:10", "2:40", "3:00"] },
    ez: { name: "EZ", base_times: ["2:30", "3:00", "3:30", "4:00"] },
  };

  const KEY_ORDER = [
    "msg",
    "lanes",
    "print_full_stats",
    "rounds",
    "distance",
    "stroke",
    "time",
    "additional_base",
    "additional",
    "subsets",
  ];

  let nextId = 1;
  const newId = () => `s${nextId++}`;

  /** After loading a saved tree, keep new ids from colliding with old ones. */
  function reserveIds(node) {
    const n = parseInt(String(node.id || "").slice(1), 10);
    if (Number.isFinite(n)) nextId = Math.max(nextId, n + 1);
    (node.subsets || []).forEach(reserveIds);
  }

  /** Force `value` into a dense array of length `lanes`. */
  function spread(value, lanes, fn = (x) => x) {
    if (!Array.isArray(value)) return new Array(lanes).fill(null).map(() => fn(value));
    const out = value.slice(0, lanes).map(fn);
    while (out.length < lanes) out.push(out.length ? out[out.length - 1] : fn(value[0]));
    return out;
  }

  const allEqual = (arr) => arr.every((v) => v === arr[0]);

  /** Collapse a per-lane array back to a scalar when every lane agrees. */
  const compact = (arr) => (arr.length && allEqual(arr) ? arr[0] : arr.slice());

  // ------------------------------------------------------------- editor node

  function newSet(lanes, overrides = {}) {
    return Object.assign(
      {
        id: newId(),
        msg: "",
        printFullStats: false,
        rounds: new Array(lanes).fill(1),
        distance: new Array(lanes).fill(100),
        strokeKey: "free",
        time: null, // null = derive the interval from the stroke's base time
        additional: new Array(lanes).fill(0),
        additionalBase: new Array(lanes).fill(0),
        subsets: [],
        collapsed: false,
      },
      overrides,
    );
  }

  function newWorkout(lanes = PYTHON_DEFAULT_LANES) {
    const today = new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const root = newSet(lanes, {
      msg: today,
      printFullStats: true,
      strokeKey: null,
      distance: new Array(lanes).fill(0),
      subsets: [
        newSet(lanes, {
          msg: "Warm Up",
          printFullStats: true,
          strokeKey: null,
          distance: new Array(lanes).fill(0),
          subsets: [newSet(lanes, { distance: new Array(lanes).fill(300), time: new Array(lanes).fill(0) })],
        }),
        newSet(lanes, {
          msg: "Main Set",
          printFullStats: true,
          strokeKey: null,
          distance: new Array(lanes).fill(0),
          subsets: [newSet(lanes, { rounds: new Array(lanes).fill(4) })],
        }),
      ],
    });
    return { lanes, root };
  }

  function cloneNode(node, fresh = true) {
    return Object.assign({}, node, {
      id: fresh ? newId() : node.id,
      rounds: node.rounds.slice(),
      distance: node.distance.slice(),
      additional: node.additional.slice(),
      additionalBase: node.additionalBase.slice(),
      time: node.time ? node.time.slice() : null,
      subsets: node.subsets.map((s) => cloneNode(s, fresh)),
    });
  }

  /** Grow or shrink every per-lane array in the tree to `lanes`. */
  function setLaneCount(node, lanes) {
    node.rounds = spread(node.rounds, lanes);
    node.distance = spread(node.distance, lanes);
    node.additional = spread(node.additional, lanes);
    node.additionalBase = spread(node.additionalBase, lanes);
    if (node.time) node.time = spread(node.time, lanes);
    node.subsets.forEach((s) => setLaneCount(s, lanes));
  }

  function setStrokeLaneCount(strokes, lanes) {
    const out = {};
    for (const [key, s] of Object.entries(strokes)) {
      const times = s.base_times.slice(0, lanes);
      while (times.length < lanes) times.push(times[times.length - 1] || "2:00");
      out[key] = { name: s.name, base_times: times };
    }
    return out;
  }

  // ------------------------------------------------------------------ import

  /** Largest explicitly declared `lanes:` anywhere in the tree. */
  function declaredLanes(dict) {
    let max = 0;
    (function walk(d) {
      if (!d || typeof d !== "object") return;
      if (typeof d.lanes === "number") max = Math.max(max, d.lanes);
      (d.subsets || []).forEach(walk);
    })(dict);
    return max || PYTHON_DEFAULT_LANES;
  }

  function fromYaml(dict, warnings = []) {
    const lanes = declaredLanes(dict);

    function build(d, path) {
      const where = path || "the workout";
      const rawTime = d.time;
      const explicit =
        rawTime !== null &&
        rawTime !== undefined &&
        rawTime !== "" &&
        rawTime !== 0 &&
        !(Array.isArray(rawTime) && !rawTime.length);

      for (const [key, value] of Object.entries(d)) {
        if (Array.isArray(value) && value.length !== lanes && key !== "subsets") {
          warnings.push(`${where}: "${key}" had ${value.length} values for ${lanes} lanes`);
        }
      }
      if (d.stroke && !(d.stroke in DEFAULT_STROKES)) {
        warnings.push(`${where}: unknown stroke "${d.stroke}"`);
      }

      const msg = d.msg == null ? "" : String(d.msg);
      return {
        id: newId(),
        msg,
        printFullStats: d.print_full_stats === true,
        rounds: spread(d.rounds == null ? 1 : d.rounds, lanes, (v) => Number(v) || 0),
        distance: spread(d.distance == null ? 0 : d.distance, lanes, (v) => Number(v) || 0),
        strokeKey: d.stroke || null,
        time: explicit ? spread(rawTime, lanes, buildTimedelta) : null,
        additional: spread(d.additional == null ? 0 : d.additional, lanes, buildTimedelta),
        additionalBase: spread(d.additional_base == null ? 0 : d.additional_base, lanes, buildTimedelta),
        subsets: (d.subsets || []).map((s, i) => build(s, `${msg || where} > set ${i + 1}`)),
        collapsed: false,
      };
    }

    return { lanes, root: build(dict, "") };
  }

  function strokesFromYaml(dict) {
    const out = {};
    for (const [key, value] of Object.entries(dict || {})) {
      if (!value || !Array.isArray(value.base_times)) continue;
      out[key] = { name: String(value.name || key), base_times: value.base_times.map(String) };
    }
    return Object.keys(out).length ? out : null;
  }

  // ------------------------------------------------------------------ export

  /**
   * Editor node -> the plain dictionary swimsets.py consumes.
   *
   * `lanes` is written on every set rather than only on supersets: the python
   * defaults each set to 4 lanes independently, so a 3-lane workout whose
   * subsets omit the key ends up with 4-lane subsets whose extra values are
   * only hidden by zip() truncation later.
   */
  function toDict(node, lanes) {
    const d = {};
    if (node.msg) d.msg = node.msg;
    if (lanes !== PYTHON_DEFAULT_LANES) d.lanes = lanes;
    if (node.printFullStats) d.print_full_stats = true;
    if (!node.rounds.every((r) => r === 1)) d.rounds = compact(node.rounds);
    if (!node.distance.every((v) => v === 0)) d.distance = compact(node.distance);
    if (node.strokeKey) d.stroke = node.strokeKey;
    if (node.time) {
      const t = compact(node.time.map(formatTimedelta));
      d.time = t;
    }
    if (!node.additionalBase.every((v) => v === 0)) {
      d.additional_base = compact(node.additionalBase.map(formatTimedelta));
    }
    if (!node.additional.every((v) => v === 0)) {
      d.additional = compact(node.additional.map(formatTimedelta));
    }
    if (node.subsets.length) d.subsets = node.subsets.map((s) => toDict(s, lanes));
    return d;
  }

  /** Build the calculation tree from the same dict that gets exported. */
  function toSwimSet(node, lanes, strokes, rounding) {
    const strokeObjects = {};
    for (const [key, s] of Object.entries(strokes)) {
      strokeObjects[key] = new SwimModel.Stroke({ name: s.name, base_times: s.base_times, _round: rounding });
    }
    return SwimSet.buildFromNestedDict(toDict(node, lanes), strokeObjects);
  }

  return {
    DEFAULT_STROKES,
    KEY_ORDER,
    PYTHON_DEFAULT_LANES,
    cloneNode,
    fromYaml,
    newId,
    newSet,
    newWorkout,
    reserveIds,
    setLaneCount,
    setStrokeLaneCount,
    spread,
    strokesFromYaml,
    toDict,
    toSwimSet,
  };
});
