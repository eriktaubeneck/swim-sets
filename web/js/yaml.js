/*
 * yaml.js - a deliberately small YAML reader/writer for workout files.
 *
 * This handles exactly the subset of YAML that swimsets.py workouts use:
 * block mappings, block sequences, flow sequences of scalars, and plain or
 * quoted scalars. No anchors, tags, multi-line scalars, or nested flow
 * collections. Keeping it in-repo means the editor has zero dependencies and
 * runs straight from the filesystem.
 *
 * Scalar typing follows YAML 1.2 core (what ruamel's `typ="safe"` does), which
 * is why `1:30` and `:00` stay strings instead of becoming sexagesimal ints.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.YamlLite = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------- parsing

  function stripComment(line) {
    let quote = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
        return line.slice(0, i);
      }
    }
    return line;
  }

  function tokenize(text) {
    const out = [];
    text.split(/\r?\n/).forEach((raw, i) => {
      const line = stripComment(raw.replace(/\s+$/, ""));
      if (!line.trim()) return;
      out.push({ indent: line.match(/^ */)[0].length, text: line.trim(), no: i + 1 });
    });
    return out;
  }

  const isSeqItem = (t) => t === "-" || t.startsWith("- ");

  /** Index of the `:` that separates a mapping key from its value, or -1. */
  function keyColon(text) {
    let quote = null;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === "[" || c === "{") {
        return -1; // a flow collection, not a mapping key
      } else if (c === ":" && (i === text.length - 1 || text[i + 1] === " ")) {
        return i;
      }
    }
    return -1;
  }

  function parseNode(lines, i, indent) {
    if (isSeqItem(lines[i].text)) return parseSequence(lines, i, indent);
    return parseMapping(lines, i, indent);
  }

  function parseSequence(lines, i, indent) {
    const arr = [];
    while (i < lines.length && lines[i].indent === indent && isSeqItem(lines[i].text)) {
      const rest = lines[i].text.slice(1).trim();
      if (!rest) {
        i++;
        if (i < lines.length && lines[i].indent > indent) {
          const r = parseNode(lines, i, lines[i].indent);
          arr.push(r.value);
          i = r.next;
        } else {
          arr.push(null);
        }
        continue;
      }
      if (keyColon(rest) !== -1) {
        // `- key: value` starts a mapping whose remaining keys line up under it
        const offset = lines[i].text.indexOf(rest);
        lines[i] = { indent: indent + offset, text: rest, no: lines[i].no };
        const r = parseMapping(lines, i, indent + offset);
        arr.push(r.value);
        i = r.next;
      } else {
        arr.push(parseValue(rest));
        i++;
      }
    }
    return { value: arr, next: i };
  }

  function parseMapping(lines, i, indent) {
    const map = {};
    while (i < lines.length && lines[i].indent === indent && !isSeqItem(lines[i].text)) {
      const line = lines[i];
      const ci = keyColon(line.text);
      if (ci === -1) throw new Error(`line ${line.no}: expected "key: value" but got "${line.text}"`);
      const key = String(parseScalar(line.text.slice(0, ci).trim()));
      const rest = line.text.slice(ci + 1).trim();
      i++;
      if (rest) {
        map[key] = parseValue(rest);
      } else if (i < lines.length && lines[i].indent > indent) {
        const r = parseNode(lines, i, lines[i].indent);
        map[key] = r.value;
        i = r.next;
      } else if (i < lines.length && lines[i].indent === indent && isSeqItem(lines[i].text)) {
        const r = parseSequence(lines, i, indent);
        map[key] = r.value;
        i = r.next;
      } else {
        map[key] = null;
      }
    }
    return { value: map, next: i };
  }

  /** Split a flow sequence body on top-level commas. */
  function splitFlow(body) {
    const parts = [];
    let depth = 0;
    let quote = null;
    let start = 0;
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === "[" || c === "{") {
        depth++;
      } else if (c === "]" || c === "}") {
        depth--;
      } else if (c === "," && depth === 0) {
        parts.push(body.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(body.slice(start));
    return parts.map((p) => p.trim()).filter((p) => p !== "");
  }

  function parseValue(text) {
    if (text.startsWith("[") && text.endsWith("]")) {
      const body = text.slice(1, -1).trim();
      if (!body) return [];
      return splitFlow(body).map(parseValue);
    }
    return parseScalar(text);
  }

  function unquote(text) {
    const q = text[0];
    const body = text.slice(1, -1);
    if (q === "'") return body.replace(/''/g, "'");
    return body.replace(/\\(["\\/nrt])/g, (_, c) =>
      c === "n" ? "\n" : c === "r" ? "\r" : c === "t" ? "\t" : c,
    );
  }

  function parseScalar(text) {
    if (text.length > 1 && (text[0] === '"' || text[0] === "'") && text[text.length - 1] === text[0]) {
      return unquote(text);
    }
    if (text === "" || text === "~" || text === "null" || text === "Null" || text === "NULL") return null;
    if (/^(true|True|TRUE)$/.test(text)) return true;
    if (/^(false|False|FALSE)$/.test(text)) return false;
    if (/^[-+]?\d+$/.test(text)) return parseInt(text, 10);
    if (/^[-+]?(\d+\.\d*|\.\d+)([eE][-+]?\d+)?$/.test(text)) return parseFloat(text);
    return text;
  }

  function parse(text) {
    const lines = tokenize(text);
    if (!lines.length) return null;
    const r = parseNode(lines, 0, lines[0].indent);
    if (r.next < lines.length) {
      throw new Error(`line ${lines[r.next].no}: unexpected indentation`);
    }
    return r.value;
  }

  // ---------------------------------------------------------------- writing

  const NEEDS_QUOTES = /^$|^[-?:,\[\]{}#&*!|>'"%@`]|: |\s#|^\s|\s$/;

  function formatScalar(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean") return v ? "True" : "False";
    if (typeof v === "number") return String(v);
    const s = String(v);
    // Anything with a line break or a tab has to be double-quoted so the
    // escapes survive -- a few workouts put multi-line notes in `msg`.
    if (/[\n\r\t\\]/.test(s)) {
      const escaped = s
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
      return `"${escaped}"`;
    }
    // `:00` and `1:30` are the one family of leading/embedded-colon strings we
    // want to keep bare, since that is how the python workouts are written.
    const timeish = /^-?\d*:\d{2}$/.test(s);
    if (!timeish && (NEEDS_QUOTES.test(s) || /^(true|false|null|~)$/i.test(s) || /^[-+]?[\d.]+$/.test(s))) {
      return "'" + s.replace(/'/g, "''") + "'";
    }
    return s;
  }

  const isScalar = (v) => v === null || ["string", "number", "boolean"].includes(typeof v);

  function dumpValue(value, indent, keyOrder) {
    const pad = " ".repeat(indent);
    if (Array.isArray(value)) {
      if (!value.length) return " []\n";
      if (value.every(isScalar)) return " [" + value.map(formatScalar).join(", ") + "]\n";
      return (
        "\n" +
        value
          .map((item) => pad + "- " + dumpValue(item, indent + 2, keyOrder).replace(/^[ \n]*/, ""))
          .join("")
      );
    }
    if (value && typeof value === "object") {
      const keys = Object.keys(value);
      if (keyOrder) {
        keys.sort((a, b) => {
          const ai = keyOrder.indexOf(a);
          const bi = keyOrder.indexOf(b);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });
      }
      if (!keys.length) return " {}\n";
      return (
        "\n" +
        keys
          .map((k) => pad + formatScalar(k) + ":" + dumpValue(value[k], indent + 2, keyOrder))
          .join("")
      );
    }
    return " " + formatScalar(value) + "\n";
  }

  /**
   * Serialize to block YAML. `keyOrder` lists mapping keys in the order they
   * should be emitted; anything not listed sorts after, in insertion order.
   */
  function dump(value, keyOrder) {
    if (isScalar(value)) return formatScalar(value) + "\n";
    const out = dumpValue(value, 0, keyOrder);
    return out.replace(/^\n/, "");
  }

  return { parse, dump };
});
