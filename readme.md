# swimsets.py

this is a very small python script which takes `example-workout.yaml` and turns it into two printable PDFs: a coach copy (with stats) and an athlete copy (all 4 lanes' times, no stats). the title is bold and everything below it is deindented one level; each set's lane times sit on their own line right underneath it (e.g. `4x 50  Kick` then `    @ 1:10  1:15  1:30  1:40`), each lane gets its own column width, and every lane-time line starts its numbers at the same column no matter how deeply nested its set is, so all four lanes line up down the page. (giving each lane its own width matters: one annotated cell like `3:20 (6x, 150)` would otherwise pad every lane on every line out to that width.) if a set's distance, rounds, and time are the same for every lane, the time is just written once inline instead (e.g. `Warm Up @ 12:00`). each PDF auto-shrinks its font to fit on a single page (or however many pages you ask for) — since times are on their own line, the font size is normally limited by the widest single line, not by needing to cram 4 columns next to the description.

## installation and run
- clone this repo
- `cd swim-sets`
- `virtualenv -p python3 venv`
- `source venv/bin/activate`
- edit `example-workout.yaml` and `strokes.yaml` as desired
- `make` — writes `example-workout-coach.pdf` and `example-workout-athlete.pdf` to the repo root
- `make print` — same, then opens both PDFs in Preview
- `make text` — prints the same plain-text layout (deindented, but without bold) to stdout

or run it directly for more control:
```
python swimsets.py path/to/workout.yaml --strokes strokes.yaml --outdir out/ --pages 1
python swimsets.py path/to/workout.yaml --print   # also opens the PDFs in Preview
```
`--pages n` sets the max pages each document should fit onto (default 1); the font size is picked automatically to fit. `--orientation` is `portrait`, `landscape`, or `auto` (default), where `auto` measures both and keeps whichever lets the font be larger, falling back to landscape when a line is too wide for portrait even at the smallest readable size.

the PDFs use [Berkeley Mono](https://berkeleygraphics.com/typefaces/berkeley-mono/) if it's installed (checked under `~/Library/Fonts`, `/Library/Fonts`, and `/System/Library/Fonts`), falling back to macOS's built-in Menlo, and finally to the PDF-standard Courier if neither is present — all three are monospace, which is what makes the lane-time columns line up.

## data structure

the basic idea is that a practice is just a collection of `SwimSets`. any set can have subsets, which are in turn `SwimSets`. this is infinitely recursive, but your swimmer might hate you if you go too deep... the code just adds up the time for you from all those recursive sets, so you can tweak and plan.

a `SwimSet` has the following properties that can be set in the `example-workout.yaml` file:
- `distance` (assumed in yards/meters)
- `stroke` (see `Stroke` below)
- msg: a message to print out for the set
- timing:
  - `time`: the total time for the distance specified (will take priority if set along with the following two)
  - `additional`: if a stroke is specified, a single increment of additional time to add to the distance
  - `additional_base`: if a stroke is specified, an increment of additional time to add per 100 of the distance
  - all time specified in the `0:00` format. negative additional is of the form `-0:10`.
- `rounds`: the number of times to repeat the set
- `print_full_stats`: defaults to False, set this to true for the levels that you want to see aggregate distance and time calculated. the code currently will print out both a version with these (then True) and a version will all False (meant for the swimmers.)
- `subsets`: nested sets of this form

The `distance`, `time`/`additional`/`additional_base`, and `rounds` can all be provide singular (for all lanes) or as an list for each lane. Currently the code assumes 4 lanes, and the `main` function would need to updated to change this.

a `Stroke` is a set of common stroke (with a name) and a base time (per 100 yards/meters) for each lane. This is simply to make it easier to specify and reuse common times, as well as think in terms of time from base.

### example

`example-workout.yaml`:
```
msg: Today's Practice
print_full_stats: True
subsets:
  - msg: Main Set
    print_full_stats: True
    rounds: 5
    subsets:
      - distance: 150
        rounds: [5, 5, 5, 4]
        stroke: free
        additional_base: -0:05
      - distance: 100
        rounds: 4
        stroke: im
        additional_base: 0:10
        time: :00
      - distance: 75
        stroke: free
        msg: pull
        rounds: 3
      - distance: 25
        stroke: ez
      - distance:  [100, 100, 50, 50]
        stroke: kick
        additional: 0:15
        rounds: 2
```

`strokes.yaml`
```
free:
  name: 'Free'
  base_times: ['1:20', '1:30', '1:40', '2:00']
stroke:
  name: 'Stroke'
  base_times: ['1:35', '1:45', '1:55', '2:20']
choice:
  name: 'Choice'
  base_times: ['1:30', '1:40', '1:50', '2:20']
im:
  name: 'IM'
  base_times: ['1:40', '1:50', '2:10', '2:30']
kick:
  name: 'Kick'
  base_times: ['2:00', '2:10', '2:30', '2:50']
ez:
  name: 'EZ'
  base_times: ['2:30', '3:00', '3:30', '4:00']
```

Running `make` with these files (the current defaults) results in the following output. Note there are two "versions"; the first is intended as the swimmers view without any stats, and the second is intended as the coaches view, with stats where `print_full_stats` was set to true.

```
Today's Practice
    5x Main Set
        5x 150  Free
            @ 1:50  2:05  2:20  2:50(4x)
        4x 100  IM
        3x 75  Free pull
            @ 1:00  1:05  1:15  1:30
        25  EZ
            @ :35  :45  :50  1:00
        2x 100  Kick
            @ 2:15  2:25  1:30(50)  1:40(50)

Today's Practice
total - L1:8000@1:26:15, L2:8000@1:36:15, L3:7500@1:36:15, L4:6750@1:40:50
    5x Main Set
    total     - L1:8000@1:26:15, L2:8000@1:36:15, L3:7500@1:36:15, L4:6750@1:40:50
    per round - L1:1600@17:15, L2:1600@19:15, L3:1500@19:15, L4:1350@20:10
        5x 150  Free
            @ 1:50  2:05  2:20  2:50(4x)
        4x 100  IM
        3x 75  Free pull
            @ 1:00  1:05  1:15  1:30
        25  EZ
            @ :35  :45  :50  1:00
        2x 100  Kick
            @ 2:15  2:25  1:30(50)  1:40(50)
```



## todo
i will likely never actually get to these, and highly encourage forking this repo if you want to expand on it at all

- better handling of lane count
- tests?
- package?
- other output? LaTeX? HTML?
