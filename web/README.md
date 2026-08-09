# swim sets — front end editor

A WYSIWYG editor for the same workout YAML `swimsets.py` reads. It is a static
page: no build step, no dependencies, no server. Open `web/index.html` in a
browser, or run `make serve` and visit <http://localhost:8000>.

Everything runs in the front end. The interval maths, the totals, and the YAML
reading and writing are all ported to JavaScript, so the page works offline and
with no python installed.

## what it does

- **Edit in place.** A set reads the way it prints — `4x 25 Free drill` — and
  every part of that line is editable where it sits. Fields that print as
  nothing (one round, no distance, no stroke) stay hidden until you hover.
- **Collapsible rendered page.** A live preview of the printed practice, in
  either the swimmer view or the coach view, with every superset collapsible.
  `Page` gives it the full window; `Print` sends it to paper fully expanded.
- **Totals per lane.** Distance and time for the whole practice, always
  visible, with a per-set breakdown one click away. Sets flagged with `Σ` also
  carry their own totals inline, which is `print_full_stats` in the YAML.
- **Configurable lanes.** 1 to 10. Changing the count reshapes every per-lane
  value in the practice and every stroke's base times.
- **Configurable base times.** The full stroke × lane grid, editable, plus the
  rounding increment intervals snap to.
- **YAML in and out.** Open or drop a workout file, paste into the YAML panel,
  or download what you have. Drop a `strokes.yaml` to load base times.
- Undo/redo, drag to reorder, indent/outdent to nest, and autosave to
  `localStorage`.

## how it maps onto swimsets.py

| editor | YAML |
| --- | --- |
| the rounds field before `x` | `rounds` |
| the distance field | `distance` |
| the stroke dropdown | `stroke` |
| free text after the stroke | `msg` |
| the `@` line | computed from the stroke, or `time` when set by hand |
| `Σ` on a set | `print_full_stats` |
| `+ per 100` / `+ once` in the `⋯` panel | `additional_base` / `additional` |
| nesting | `subsets` |

`time` is all-or-nothing per set in the python model — there is no per-lane
override. Typing an interval into one lane therefore freezes what the other
lanes were already showing and writes the whole list. `↺` on the `@` line hands
the set back to its stroke's base time.

One thing the editor writes that the workouts in `workouts/` mostly do not:
`lanes:` on **every** set rather than only on supersets. `SwimSet` defaults each
set to 4 lanes independently, so in a 3-lane practice a subset that omits the
key silently becomes a 4-lane set. Usually `zip()` truncation hides it; sometimes
it does not, and a phantom lane 4 appears in the printout.

## checking the port

The JavaScript is a port of `swimsets.py`, so it is checked against it rather
than trusted:

```
make web-parity      # the JS renders all 69 workouts exactly as python does
make web-roundtrip   # every workout survives import -> export -> python
make web-test        # both
```

`web-parity` passes on all 69 workouts, byte for byte, including the
microsecond-carry rounding, python's `zip()` truncation when a set's lane
arrays disagree in length, and floats printing as `2750.0`.

`web-roundtrip` reports 66 of 69 unchanged. The three that differ are all
3-lane practices whose subsets omit `lanes: 3`:

- `20230425` and `20231005` print a fourth interval per set that no lane swims;
  the editor drops it.
- `20230410` declares `rounds: [3, 3, 2, 2]` on a 3-lane set, so python prints
  `(L3: 2x, L4: 2x)`; the editor keeps three values and warns on import.

In each case the editor's output is the practice as actually swum. If you want
the original printout preserved, don't round-trip those three through the
editor.

`workouts/20190415-tnya-liu.yaml` has a duplicate `msg` key, which `ruamel`
refuses to load — `swimsets.py` cannot render that file at all. The editor is
more forgiving (last key wins) and re-exports it cleanly.

## files

```
index.html          markup shell
styles.css          practice-sheet styling, light and dark, plus print rules
js/yaml.js          small YAML reader/writer for the workout subset
js/model.js         port of swimsets.py: Stroke, SwimSet, the rounding rules
js/workout.js       editor document model, YAML import/export
js/render.js        the read-only rendered page
js/editor.js        the WYSIWYG document
js/app.js           shell: state, undo, storage, config panels, files
tools/reference.py  dump swimsets.py's rendering of every workout
tools/parity.mjs    diff the JS rendering against it
tools/roundtrip.mjs re-export every workout through the editor model
tools/compare.py    diff two reference dumps
tools/bundle.mjs    inline everything into one standalone HTML file
```

`node web/tools/bundle.mjs web/swim-sets.html` produces a single self-contained
file — useful for a phone, a thumb drive, or a pool deck with no wifi.

## what this sketch does not do

- No per-lane `time` override (the python model has no place to put it).
- No `_round` per stroke — it is one global setting, written to `strokes.yaml`
  as `_round` on each stroke when it is not 5.
- The YAML reader covers the subset these workouts use: block mappings and
  sequences, flow sequences of scalars, plain and quoted scalars. No anchors,
  tags, or block scalars.
- Nothing is saved anywhere but your own browser. Use `Save` to keep a workout.
