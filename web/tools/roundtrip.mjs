/*
 * roundtrip.mjs - import every workout into the editor model, export it again,
 * and check swimsets.py still prints the same practice.
 *
 *   node web/tools/roundtrip.mjs <out-dir>
 *   venv/bin/python web/tools/reference.py <out-dir> > /tmp/rt.txt
 *   node web/tools/parity.mjs /tmp/rt.txt   # compares against the JS render
 *
 * The Makefile's `roundtrip` target wires those three steps together and also
 * diffs the re-rendered output against the original.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.join(here, "..", "..");

const YamlLite = require(path.join(here, "..", "js", "yaml.js"));
const Workout = require(path.join(here, "..", "js", "workout.js"));

const outDir = process.argv[2];
if (!outDir) {
  console.error("usage: node web/tools/roundtrip.mjs <out-dir>");
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const files = fs
  .readdirSync(path.join(root, "workouts"))
  .filter((f) => f.endsWith(".yaml"))
  .map((f) => path.join(root, "workouts", f));
files.push(path.join(root, "example-workout.yaml"));

const allWarnings = [];
for (const file of files) {
  const dict = YamlLite.parse(fs.readFileSync(file, "utf8"));
  const warnings = [];
  const { lanes, root: node } = Workout.fromYaml(dict, warnings);
  warnings.forEach((w) => allWarnings.push(`${path.basename(file)}: ${w}`));
  const out = YamlLite.dump(Workout.toDict(node, lanes), Workout.KEY_ORDER);
  fs.writeFileSync(path.join(outDir, path.basename(file)), out);
}

console.log(`wrote ${files.length} re-exported workouts to ${outDir}`);
if (allWarnings.length) {
  console.log(`\n${allWarnings.length} import warnings:`);
  allWarnings.forEach((w) => console.log(`  ${w}`));
}
