/*
 * parity.mjs - check the JS port against swimsets.py over every workout.
 *
 *   venv/bin/python web/tools/reference.py > /tmp/ref.txt
 *   node web/tools/parity.mjs /tmp/ref.txt
 *
 * Exits non-zero on the first workout whose rendering differs.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.join(here, "..", "..");

const YamlLite = require(path.join(here, "..", "js", "yaml.js"));
const { SwimSet, buildStrokes } = require(path.join(here, "..", "js", "model.js"));

const refPath = process.argv[2];
if (!refPath) {
  console.error("usage: node web/tools/parity.mjs <reference-output.txt>");
  process.exit(2);
}

const strokes = buildStrokes(YamlLite.parse(fs.readFileSync(path.join(root, "strokes.yaml"), "utf8")));

const reference = new Map();
let current = null;
for (const line of fs.readFileSync(refPath, "utf8").split("\n")) {
  if (line.startsWith("===== ")) {
    current = line.slice(6).trim();
    reference.set(current, []);
  } else if (current) {
    reference.get(current).push(line);
  }
}

let failures = 0;
for (const [name, lines] of reference) {
  const file = name === "example-workout.yaml" ? path.join(root, name) : path.join(root, "workouts", name);
  const workout = SwimSet.buildFromNestedDict(
    YamlLite.parse(fs.readFileSync(file, "utf8")),
    strokes,
  );
  // Same call order as swimsets.py's main(): swimmer view first, then coach
  // view, because pprint() mutates intervals for zero-round lanes.
  const actual = `${workout.toString()}\n${workout.pprint(true)}\n`.split("\n");
  const expected = lines;

  const n = Math.max(actual.length, expected.length);
  for (let i = 0; i < n; i++) {
    if ((actual[i] ?? "") !== (expected[i] ?? "")) {
      failures++;
      console.error(`FAIL ${name} line ${i + 1}`);
      console.error(`  python: ${JSON.stringify(expected[i] ?? null)}`);
      console.error(`  js:     ${JSON.stringify(actual[i] ?? null)}`);
      break;
    }
  }
}

if (failures) {
  console.error(`\n${failures}/${reference.size} workouts differ`);
  process.exit(1);
}
console.log(`ok - ${reference.size} workouts render identically`);
