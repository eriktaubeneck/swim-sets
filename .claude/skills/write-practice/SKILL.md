---
name: write-practice
description: Write a new swim practice YAML in workouts/, modeled on similar past practices and balanced so every lane group hits the target practice length (default 1 hour). Use when the user asks to write, plan, or draft a practice or workout.
argument-hint: "[focus] [date] [target length]"
---

# Write a practice

Produce a new `workouts/YYYYMMDD-<location>.yaml` that follows this repo's conventions, is modeled on similar past practices, and lands every lane group near the target length.

## 1. Gather inputs

Anything already given in the arguments or conversation doesn't need to be asked again. Otherwise ask, in one `AskUserQuestion` call:

- **Focus.** Offer the recurring focuses from past titles as options (Sprint Free, Mid Distance, IM, Challenge Free; also seen: Long Axis, Fly, Breaststroke, Endurance Free). The user may instead describe a specific main set, e.g. "4 rounds of 4 min at 90% + 3 min easy"; in that case build around it exactly as described.
- **Target length.** Default 60 minutes.

Also settle, without asking unless it's unclear:

- **Date.** Default today. Check the weekday with `python3 -c` rather than working it out by hand.
- **Location suffix.** Default to the suffix of the most recent file in `workouts/` (currently `husky-viewridge`).

The user calls the lanes "groups": group 1 is lane 1 (fastest) through group 4 (slowest). The code assumes 4 lanes.

## 2. Find similar practices and propose a draft

1. List the titles: `for f in workouts/*.yaml; do printf '%s: ' "$f"; head -1 "$f"; done`. The focus follows ` - ` or ` | ` in the title.
2. Read the 2–3 most recent practices that match the focus in full. Also read the most recent practice overall, since conventions drift over time. If the user described a specific set, also grep `workouts/` for similar sets (e.g. `effort`, `descend`, `negative split`).
3. Read `strokes.yaml` for the per-lane base paces. Every `stroke:` used must be a key in it. If a new one is needed, propose base times and ask before adding it.
4. Draft the file following the conventions below. Borrow structure and sets from the similar practices instead of inventing everything from scratch.
5. Balance the lane totals (section 3) before showing anything.
6. Show the user the swimmer view plus the per-lane totals, and say which past practices it drew from. Iterate on their feedback, re-checking the totals after every change.

### Conventions

```yaml
msg: Thursday, Sep 17, 2026 - Norwegian 4x4
print_full_stats: True
subsets:
  - msg: Warm Up
    time: 12:00
    print_full_stats: True
    subsets:
      - distance: 300
        stroke: free
        time: 0:00
      - distance: 200
        stroke: kick
        time: 0:00
      - distance: 100
        stroke: im
        time: 0:00

  - msg: Preset
    print_full_stats: True
    ...

  - msg: Main Set
    print_full_stats: True
    ...
```

- Title format: `<Weekday>, <Mon> <D>, <YYYY> - <Focus>`.
- `print_full_stats: True` goes on the root and on every top-level section.
- Sections are Warm Up, Preset, and Main Set. An optional Post Set or cool-down can go at the end.
- The warm-up is almost always the one above: a 12:00 block whose legs carry `time: 0:00`, so they display without their own intervals.
- Distances are multiples of 25.
- `distance`, `time`, `rounds`, `additional`, and `additional_base` each take either one value or a list of 4 per-lane values.
- `time` overrides the pace calculation. `additional_base` is added per 100 of base pace, and `additional` is a flat addition. Negative values look like `-0:05`.

## 3. Balance every lane to the target length

Check the totals with:

```bash
venv/bin/python swimsets.py workouts/<file>.yaml --text
```

The first `total -` line of the coach view (the second block) gives each lane's total, e.g. `total - L1:3400@1:00:00, L2:...`. **Every lane must be within ±2 minutes of the target.** Being exactly on target is better.

Pace-based sets (a `stroke` with no `time`) take roughly 1.6× longer for lane 4 than for lane 1, because the base paces differ. More volume therefore won't balance the lanes, and slow lanes will run long while fast lanes run short. To bring them together:

- **Fixed intervals.** A single explicit `time` (e.g. `time: 4:00`) costs every lane the same amount. Use this for time-based sets. Give each lane a distance that fits the interval at its pace: distance ≈ interval ÷ (base + adjustment) × 100, then round up to the nearest 50. Don't vary the interval per lane unless asked.
- **Fill-to-interval legs.** Keep the work legs pace-based, then end each round with an easy leg whose per-lane `time` list is set to "the round interval minus that lane's work time", e.g. `msg: easy, fill to 5:00` with `time: [2:30, 2:15, 1:45, 1:10]`. Every lane's round then takes exactly the interval.
- **Per-lane rounds or distance.** For example `rounds: [4, 4, 3, 3]` or `distance: [200, 200, 150, 100]` to trim the slower lanes. This is common in past practices.
- **Recovery by time.** Easy swims use an explicit `time` (e.g. `time: 3:00`), with per-lane distances if the faster groups should cover more, e.g. `distance: [150, 150, 100, 100]`.

To get the exact time a set takes per lane, including the code's round-up-to-5-seconds behavior, call the real function rather than doing the arithmetic by hand:

```bash
venv/bin/python -c "
from swimsets import calc_set_time, build_timedelta as t
print(calc_set_time(100, t('1:20'), t('0:00'), t('0:10')))  # distance, base, additional_base, additional
"
```

## 4. Finish

Once the user is happy:

- Write the final file and confirm the totals one last time.
- Offer to generate and open the PDFs with `venv/bin/python swimsets.py workouts/<file>.yaml --print`. Add `--pages`/`--orientation` if needed. The PDFs are gitignored.
- Commit only if asked. Past practices are committed straight to `main` with a message like `20260917 practice`.
