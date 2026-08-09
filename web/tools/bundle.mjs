/*
 * bundle.mjs - inline styles.css and js/*.js into one standalone HTML file.
 *
 *   node web/tools/bundle.mjs web/swim-sets.html
 *
 * The result has no external references at all, so it works from a thumb
 * drive, an email attachment, or a `file://` URL on a pool deck laptop.
 */
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const web = path.join(here, "..");
const out = process.argv[2] || path.join(web, "swim-sets.html");

const read = (p) => fs.readFileSync(path.join(web, p), "utf8");

let html = read("index.html");

html = html.replace(
  /<link rel="stylesheet" href="styles\.css"\s*\/?>/,
  `<style>\n${read("styles.css")}\n</style>`,
);

html = html.replace(/(\s*<script src="js\/[^"]+"><\/script>)+/, () => {
  const scripts = ["yaml.js", "model.js", "workout.js", "render.js", "editor.js", "app.js"];
  return (
    "\n" +
    scripts.map((f) => `    <script>\n${read(path.join("js", f))}\n    </script>`).join("\n") +
    "\n  "
  );
});

if (html.includes('href="styles.css"') || html.includes('src="js/')) {
  console.error("bundle: something is still linked externally");
  process.exit(1);
}

fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(1)} kB)`);
