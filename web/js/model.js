/*
 * model.js - a JavaScript port of swimsets.py.
 *
 * This is a deliberately faithful port: the same rounding, the same
 * per-lane zip-truncation, the same string formatting. `web/tools/parity.mjs`
 * diffs this module's pprint() against the python script's output over every
 * file in workouts/, so any drift shows up as a failing check rather than as a
 * workout that quietly disagrees with the printout a coach is holding.
 *
 * Durations are integer seconds. Where python's timedelta arithmetic has
 * observable behaviour (microsecond rounding, floor-division normalisation,
 * str() formatting), it is reproduced here rather than approximated.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SwimModel = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const US = 1000000; // microseconds per second, python timedelta's resolution
  const DAY_US = 86400 * US;

  /** python's `%`: the result takes the sign of the divisor. */
  const pyMod = (a, b) => a - b * Math.floor(a / b);

  /** python's zip(): stops at the shortest sequence. */
  function zip2(a, b, fn) {
    const n = Math.min(a.length, b.length);
    const out = [];
    for (let i = 0; i < n; i++) out.push(fn(a[i], b[i], i));
    return out;
  }

  /**
   * python's str() for a number: ints print bare, floats keep a decimal point.
   * Workouts use floats only for half-lengths (12.5, 37.5, 62.5), so a
   * non-integral value is a reliable stand-in for "was a float literal"; the
   * flag is then carried through the totals, where 12.5 * 2 must still print
   * as "25.0" and not "25".
   */
  function numStr(v, isFloat) {
    if (isFloat && Number.isInteger(v)) return v.toFixed(1);
    return String(v);
  }

  /** python's round-half-to-even, used by timedelta arithmetic. */
  function roundHalfEven(x) {
    const f = Math.floor(x);
    const diff = x - f;
    if (diff > 0.5) return f + 1;
    if (diff < 0.5) return f;
    return f % 2 === 0 ? f : f + 1;
  }

  /** python's timedelta / int: exact, then rounded to the nearest microsecond. */
  const divTime = (seconds, n) => roundHalfEven((seconds * US) / n) / US;

  /** "1:30" -> 90, ":45" -> 45, "-0:10" -> -10. Mirrors build_timedelta. */
  function buildTimedelta(time) {
    if (typeof time === "number") return time;
    let mult = 1;
    let t = String(time).trim();
    if (t.startsWith("-")) {
      mult = -1;
      t = t.slice(1);
    }
    const parts = t.split(":");
    if (parts.length !== 2) {
      throw new Error(`"${time}" is not a m:ss duration`);
    }
    const [minutes, seconds] = parts.map((p) => parseInt(p, 10) || 0);
    return mult * (minutes * 60 + seconds);
  }

  /** Inverse of buildTimedelta, for round-tripping back out to YAML. */
  function formatTimedelta(seconds) {
    const sign = seconds < 0 ? "-" : "";
    const abs = Math.abs(Math.round(seconds));
    return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
  }

  /**
   * Interval for `distance` at `base` per 100, rounded down to a multiple of
   * `_round` seconds (after rounding any fractional second up, which is what
   * timedelta's microsecond carry does in the python).
   */
  function calcSetTime(distance, base, additionalBase, additional, _round = 5) {
    if (distance === 0) return 0;
    let us = roundHalfEven((distance / 100) * (base + additionalBase) * US) + additional * US;
    const microseconds = pyMod(us, US);
    if (microseconds) us += US - microseconds;
    // timedelta normalises to (days, seconds); `.seconds` is the within-day part
    const withinDay = pyMod(us, DAY_US) / US;
    us += pyMod(-withinDay, -_round) * US;
    return us / US;
  }

  /** python's str(timedelta): "0:01:35", "1:26:15", "-1 day, 23:58:25". */
  function strTimedelta(seconds) {
    const days = Math.floor(seconds / 86400);
    const rem = seconds - days * 86400;
    const hh = Math.floor(rem / 3600);
    const mm = Math.floor((rem % 3600) / 60);
    const ss = rem % 60;
    const clock = `${hh}:${String(mm).padStart(2, "0")}:${String(Math.floor(ss)).padStart(2, "0")}`;
    if (days === 0) return clock;
    return `${days} day${Math.abs(days) === 1 ? "" : "s"}, ${clock}`;
  }

  /** The compact display form: "1:35", ":35", "1:26:15", or "--". */
  function printDt(seconds) {
    const parts = strTimedelta(seconds).split(":");
    const [hours, minutes, secs] = parts;
    if (hours !== "0") return strTimedelta(seconds);
    if (minutes !== "00") return String(parseInt(minutes, 10)) + ":" + secs;
    if (secs !== "00") return ":" + secs;
    return "--";
  }

  class Stroke {
    constructor({ name, base_times, baseTimes, _round = 5 }) {
      this.name = name;
      this.baseTimes = (base_times || baseTimes || []).map(buildTimedelta);
      this._round = _round;
    }

    calcTimeByLane(distance, additionalBase, additional) {
      // zip() stops at the shortest sequence, so a 3-lane set against 4 base
      // times yields 3 intervals -- same as the python.
      const n = Math.min(distance.length, this.baseTimes.length, additionalBase.length, additional.length);
      const out = [];
      for (let i = 0; i < n; i++) {
        out.push(calcSetTime(distance[i], this.baseTimes[i], additionalBase[i], additional[i], this._round));
      }
      return out;
    }

    toString() {
      return this.name;
    }
  }

  class SwimSet {
    constructor(opts = {}) {
      const {
        distance = 0,
        stroke = null,
        msg = "",
        time = null,
        rounds = 1,
        additional_base = "0:00",
        additional = "0:00",
        lanes = 4,
        subsets = null,
        print_full_stats = false,
      } = opts;

      this.stroke = stroke;
      this.msg = msg;
      this.lanes = lanes;
      this.distance = this.initByLanes(distance);
      this.distanceIsFloat = this.initByLanes(distance, (v) => typeof v === "number" && !Number.isInteger(v));
      this.additionalBase = this.initByLanes(additional_base, buildTimedelta);
      this.additional = this.initByLanes(additional, buildTimedelta);
      this.rawTime = time; // kept so export can tell "explicit" from "computed"
      this.time = this.initTime(time);
      this.rounds = this.initByLanes(rounds);
      this.subsets = subsets || [];
      this.printFullStats = print_full_stats;
    }

    initByLanes(v, fn = (x) => x) {
      if (Array.isArray(v)) return v.map(fn);
      return new Array(this.lanes).fill(null).map(() => fn(v));
    }

    initTime(time) {
      // Note the python truthiness check is on the *raw* value, so `time: 0:00`
      // counts as "explicitly set" and pins the set to a zero interval.
      if (time !== null && time !== undefined && time !== "" && time !== 0 && !(Array.isArray(time) && !time.length)) {
        if (Array.isArray(time)) return time.map(buildTimedelta);
        return new Array(this.lanes).fill(buildTimedelta(time));
      }
      if (this.stroke) {
        return this.stroke.calcTimeByLane(this.distance, this.additionalBase, this.additional);
      }
      return new Array(this.lanes).fill(0);
    }

    static buildFromNestedDict(dict, strokesConfig = {}) {
      const d = Object.assign({}, dict);
      if ("stroke" in d && d.stroke !== null && !(d.stroke instanceof Stroke)) {
        const found = strokesConfig[d.stroke];
        if (!found) throw new Error(`unknown stroke "${d.stroke}"`);
        d.stroke = found;
      }
      d.subsets = (dict.subsets || []).map((s) => SwimSet.buildFromNestedDict(s, strokesConfig));
      return new SwimSet(d);
    }

    get isSuperset() {
      return this.subsets.length > 0;
    }

    get maxDistance() {
      return Math.max(...this.distance);
    }

    get maxRounds() {
      return Math.max(...this.rounds);
    }

    get maxTime() {
      return Math.max(...this.time);
    }

    /**
     * How many lanes an aggregate actually spans. The python indexes
     * `self.rounds[l]` for l in range(self.lanes) and would raise if a set
     * declared more lanes than it has rounds for; clamping keeps a
     * half-edited workout renderable instead of blowing up mid-keystroke.
     */
    get aggregateLanes() {
      return Math.min(this.lanes, this.rounds.length);
    }

    get totalTime() {
      if (this.maxTime !== 0 || !this.isSuperset) {
        return zip2(this.time, this.rounds, (t, r) => t * r);
      }
      const subsetTotal = [];
      for (let l = 0; l < this.aggregateLanes; l++) {
        subsetTotal.push(this.subsets.reduce((acc, s) => acc + (s.totalTime[l] || 0), 0));
      }
      return zip2(subsetTotal, this.rounds, (t, r) => t * r);
    }

    get totalDistance() {
      if (!this.isSuperset) {
        return zip2(this.distance, this.rounds, (d, r) => d * r);
      }
      const out = [];
      for (let l = 0; l < this.aggregateLanes; l++) {
        out.push(this.rounds[l] * this.subsets.reduce((acc, s) => acc + (s.totalDistance[l] || 0), 0));
      }
      return out;
    }

    /** Per-lane "this total came from a float distance" flags, for printing. */
    get totalDistanceIsFloat() {
      if (!this.isSuperset) {
        return zip2(this.distanceIsFloat, this.rounds, (f) => f);
      }
      const out = [];
      for (let l = 0; l < this.aggregateLanes; l++) {
        out.push(this.subsets.some((s) => s.totalDistanceIsFloat[l]));
      }
      return out;
    }

    get roundsStr() {
      if (this.maxRounds === 1) return "";
      return `${this.maxRounds}x `;
    }

    get roundEdits() {
      if (new Set(this.rounds).size === 1 || this.maxTime) return "";
      return (
        "(" +
        this.rounds
          .map((r, i) => (r !== this.maxRounds ? `L${i + 1}: ${r}x` : null))
          .filter((s) => s !== null)
          .join(", ") +
        ")"
      );
    }

    get distanceStr() {
      if (!this.maxDistance) return "";
      const i = this.distance.indexOf(this.maxDistance);
      return `${numStr(this.maxDistance, this.distanceIsFloat[i])} `;
    }

    get timeStr() {
      if (!this.maxTime) return "";
      const dist = this.distance.map((d, i) =>
        d !== this.maxDistance ? numStr(d, this.distanceIsFloat[i]) : "",
      );
      const rnds = this.rounds.map((r) => (r !== this.maxRounds ? `${r}` : ""));
      // Matches the python's in-place zeroing of intervals for skipped lanes.
      // The zip also truncates: a set with more lanes of distance than of
      // rounds loses its extra intervals here, permanently.
      this.time = zip2(this.time, this.rounds, (t, r) => (r > 0 ? t : 0));

      const distRnds = zip2(dist, rnds, (d, r) => {
        if (d && r && !(d === "0" || r === "0")) return `(${r}x, ${d})`;
        if (r) return `(${r}x)`;
        if (d) return `(${d})`;
        return "";
      });

      const tmStr = zip2(this.time, distRnds, (t, dr) => printDt(t) + dr).join("  ");
      return `\n    @ ${tmStr} `;
    }

    get fullStatsStr() {
      if (!this.printFullStats) return "";
      const totalTime = this.totalTime;
      const totalDistance = this.totalDistance;
      const isFloat = this.totalDistanceIsFloat;
      const totals = zip2(
        totalTime,
        totalDistance,
        (t, d, i) => `L${i + 1}:${numStr(d, isFloat[i])}@${printDt(t)}`,
      ).join(", ");
      if (this.maxRounds > 1) {
        const n = Math.min(totalTime.length, totalDistance.length, this.rounds.length);
        const perRound = [];
        for (let i = 0; i < n; i++) {
          const r = this.rounds[i];
          const d = Math.trunc(totalDistance[i] / r);
          perRound.push(`L${i + 1}:${d}@${printDt(divTime(totalTime[i], r))}`);
        }
        return `\ntotal     - ${totals} \nper round - ${perRound.join(", ")}`;
      }
      return `\ntotal - ${totals} `;
    }

    pprint(coachView = false) {
      let msg = `${this.roundsStr}${this.distanceStr}`;
      msg += `${this.stroke ? " " + String(this.stroke) + (this.msg ? " " : "") : ""}${this.msg} `;
      msg += `${this.roundEdits}`;
      if (coachView) msg += `${this.fullStatsStr}`;
      msg += `${this.timeStr}\n`;

      const submsgs = this.subsets.map((s) => s.pprint(coachView)).join("").split("\n");
      msg += submsgs.filter((s) => s).map((s) => `    ${s}\n`).join("");
      return msg;
    }

    toString() {
      return this.pprint()
        .split("\n")
        .map((l) => (l.startsWith("    ") ? l.slice(4) : l))
        .join("\n");
    }
  }

  function buildStrokes(dict) {
    const out = {};
    for (const [key, value] of Object.entries(dict || {})) {
      out[key] = new Stroke(value);
    }
    return out;
  }

  return {
    Stroke,
    SwimSet,
    buildStrokes,
    buildTimedelta,
    formatTimedelta,
    calcSetTime,
    divTime,
    numStr,
    printDt,
    strTimedelta,
  };
});
