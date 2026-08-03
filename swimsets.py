import argparse
import os
import subprocess
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any, Callable, Dict, List, Optional, Union, cast

from ruamel.yaml import YAML

from render import render_pdf

zero_seconds: timedelta = timedelta(seconds=0)


@dataclass
class Row:
    indent: int
    text: str
    lane_times: List[str] = field(default_factory=list)


def build_timedelta(time: str) -> timedelta:
    mult = 1
    if time.startswith("-"):
        mult = -1
        time = time[1:]
    minutes, seconds = map(lambda t: int(t or 0), time.split(":"))
    return mult * timedelta(minutes=minutes, seconds=seconds)


def calc_set_time(
    distance: int,
    base: timedelta,
    additional_base: timedelta,
    additional: timedelta,
    _round: int = 5,
) -> timedelta:
    if distance == 0:
        return timedelta(0.0)
    t = distance / 100 * (base + additional_base) + additional
    if t.microseconds:
        t += timedelta(seconds=1, microseconds=-t.microseconds)
    t = t + timedelta(seconds=(-t.seconds % -_round))
    return t


class Stroke:
    def __init__(
        self,
        name: str,
        base_times: List[str],
        _round: int = 5,
    ):
        self.name: str = name
        self.base_times: List[timedelta] = [build_timedelta(t) for t in base_times]
        self._round: int = _round

    def calc_time_by_lane(
        self,
        distance: List[int],
        additional_base: List[timedelta],
        additional: List[timedelta],
    ) -> List[timedelta]:
        return [
            calc_set_time(d, b, ab, a, self._round)
            for d, b, ab, a in zip(
                distance, self.base_times, additional_base, additional
            )
        ]

    def __repr__(self):
        return self.name


class SwimSet:
    def __init__(
        self,
        distance: Union[List[int], int] = 0,
        stroke: Optional[Stroke] = None,
        msg: str = "",
        time: Optional[Union[List[str], str]] = None,
        rounds: Union[List[int], int] = 1,
        additional_base: Union[List[str], str] = "0:00",
        additional: Union[List[str], str] = "0:00",
        lanes: int = 4,
        subsets: Optional[List["SwimSet"]] = None,
        print_full_stats: bool = False,
    ):
        self.stroke: Optional[Stroke] = stroke
        self.msg: str = msg
        self.lanes: int = lanes
        self.distance: List[int] = self.init_by_lanes(distance)
        self.additional_base: List[timedelta] = self.init_by_lanes(
            additional_base, build_timedelta
        )
        self.additional: List[timedelta] = self.init_by_lanes(
            additional, build_timedelta
        )
        self.time: List[timedelta] = self.init_time(time)
        self.rounds: List[int] = self.init_by_lanes(rounds)
        self.subsets: List[SwimSet] = subsets or []
        self.print_full_stats: bool = print_full_stats

    def init_by_lanes(
        self,
        var: Optional[Union[List[Any], Any]],
        fn: Callable[[Any], Any] = lambda x: x,
    ) -> List[Any]:
        if isinstance(var, list):
            return [fn(v) for v in var]
        return [fn(var) for _ in range(self.lanes)]

    def init_time(
        self,
        time: Optional[Union[List[str], str]] = None,
    ) -> List[timedelta]:
        if time:
            if isinstance(time, list):
                return [build_timedelta(t) for t in time]
            else:
                return [
                    build_timedelta(time),
                ] * self.lanes
        elif self.stroke:
            return self.stroke.calc_time_by_lane(
                self.distance, self.additional_base, self.additional
            )
        return [
            zero_seconds,
        ] * self.lanes

    @classmethod
    def build_from_nested_dict(
        cls, _dict: Dict[str, Any], strokes_config: Optional[Dict[str, Stroke]] = None
    ):
        if not strokes_config:
            strokes_config = {}
        if "stroke" in _dict:
            _dict["stroke"] = strokes_config[_dict["stroke"]]
        _dict["subsets"] = [
            cls.build_from_nested_dict(s, strokes_config)
            for s in _dict.get("subsets", [])
        ]
        return cls(**_dict)

    @property
    def is_superset(self) -> bool:
        return bool(self.subsets)

    @property
    def max_distance(self) -> int:
        return max(self.distance)

    @property
    def max_rounds(self) -> int:
        return max(self.rounds)

    @property
    def max_time(self) -> timedelta:
        return max(self.time)

    @property
    def total_time(self) -> List[timedelta]:
        if self.max_time != zero_seconds or not self.is_superset:
            return [t * r for t, r in zip(self.time, self.rounds)]
        subset_total_time: List[timedelta] = [
            sum((s.total_time[l] for s in self.subsets), zero_seconds)
            for l in range(self.lanes)
        ]
        return [t * r for t, r, in zip(subset_total_time, self.rounds)]

    @staticmethod
    def print_dt(dt: timedelta) -> str:
        hours, minutes, seconds = str(dt).split(":")
        if hours != "0":
            return str(dt)
        elif minutes != "00":
            return str(int(minutes)) + ":" + seconds
        elif seconds != "00":
            return ":" + seconds
        return "--"

    @property
    def total_distance(self) -> List[int]:
        if not self.is_superset:
            return [d * r for d, r in zip(self.distance, self.rounds)]
        return [
            self.rounds[l] * sum(s.total_distance[l] for s in self.subsets)
            for l in range(self.lanes)
        ]

    @property
    def rounds_str(self) -> str:
        if self.max_rounds == 1:
            return ""
        return f"{self.max_rounds}x "

    @property
    def round_edits(self) -> str:
        if len(set(self.rounds)) == 1 or self.max_time:
            return ""
        return (
            "("
            + ", ".join(
                f"L{i+1}: {r}x"
                for i, r in enumerate(self.rounds)
                if r != self.max_rounds
            )
            + ")"
        )

    @property
    def distance_str(self) -> str:
        if not self.max_distance:
            return ""
        return f"{self.max_distance} "

    def full_stats_lines(self) -> List[str]:
        if not self.print_full_stats:
            return []
        totals: str = ", ".join(
            f"L{i+1}:{d}@{self.print_dt(t)}"
            for i, (t, d) in enumerate(zip(self.total_time, self.total_distance))
        )
        if self.max_rounds > 1:
            per_round: str = ", ".join(
                f"L{i+1}:{int(d/r)}@{self.print_dt(t/r)}"
                for i, (t, d, r) in enumerate(
                    zip(self.total_time, self.total_distance, self.rounds)
                )
            )
            return [f"total     - {totals}", f"per round - {per_round}"]
        return [f"total - {totals}"]

    def rows(self, coach_view: bool = False, indent: int = 0) -> List[Row]:
        text: str = f"{self.rounds_str}{self.distance_str}"
        text += (
            f'{bool(self.stroke)*(" "+str(self.stroke)+" "*bool(self.msg))}{self.msg}'
        )
        rows: List[Row]
        if not self.max_time:
            text += f" {self.round_edits}"
            rows = [Row(indent, text.strip())]
        else:
            times: List[timedelta] = [
                t if r > 0 else zero_seconds for t, r in zip(self.time, self.rounds)
            ]
            uniform: bool = (
                len(set(self.distance)) == 1
                and len(set(self.rounds)) == 1
                and len(set(times)) == 1
            )
            if uniform:
                text += f" @ {self.print_dt(times[0])}"
                rows = [Row(indent, text.strip())]
            else:
                dist: List[str] = [
                    f"{d}" if d != self.max_distance else "" for d in self.distance
                ]
                rnds: List[str] = [
                    f"{r}" if r != self.max_rounds else "" for r in self.rounds
                ]
                annotations: List[str] = []
                for d, r in zip(dist, rnds):
                    if d and r and not (d == "0" or r == "0"):
                        annotations.append(f" ({r}x, {d})")
                    elif r:
                        annotations.append(f" ({r}x)")
                    elif d:
                        annotations.append(f" ({d})")
                    else:
                        annotations.append("")
                lane_times: List[str] = [
                    f"{self.print_dt(t)}{a}" for t, a in zip(times, annotations)
                ]
                rows = [
                    Row(indent, text.strip()),
                    Row(indent + 1, "@", lane_times),
                ]
        if coach_view:
            rows.extend(Row(indent, line) for line in self.full_stats_lines())
        for s in self.subsets:
            rows.extend(s.rows(coach_view, indent + 1))
        return rows


def render_text(rows: List[Row]) -> str:
    # the title (rows[0]) stays flush left; everything else is deindented by
    # one level, since a level was already "used up" wrapping the top-level
    # sections under the title
    cell_width: int = max(
        (len(t) for r in rows for t in r.lane_times), default=0
    )
    lines: List[str] = []
    for i, row in enumerate(rows):
        indent = row.indent if i == 0 else max(row.indent - 1, 0)
        pad = "    " * indent
        if row.lane_times:
            cells = "  ".join(t.rjust(cell_width) for t in row.lane_times)
            lines.append(f"{pad}{row.text} {cells}")
        else:
            lines.append(f"{pad}{row.text}")
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render a swim workout to printable PDFs: a coach copy with "
        "stats, and an athlete copy with all lanes' times."
    )
    parser.add_argument(
        "workout", nargs="?", default="example-workout.yaml", help="workout yaml file"
    )
    parser.add_argument("--strokes", default="strokes.yaml", help="strokes yaml file")
    parser.add_argument(
        "--outdir", default=".", help="directory to write PDFs to"
    )
    parser.add_argument(
        "--pages",
        type=int,
        default=1,
        help="max pages to fit each document onto (default: 1)",
    )
    parser.add_argument(
        "--print",
        dest="do_print",
        action="store_true",
        help="open the generated PDFs in Preview",
    )
    parser.add_argument(
        "--text",
        action="store_true",
        help="print plain text to stdout instead of generating PDFs",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    yaml = YAML(typ="safe")
    with open(args.strokes, "r") as f:
        strokes_dict: Dict[Any, Any] = yaml.load(f)
    strokes = {cast(str, k): Stroke(**v) for k, v in strokes_dict.items()}

    with open(args.workout, "r") as f:
        workout_dict: Dict[Any, Any] = yaml.load(f)
    workout: SwimSet = SwimSet.build_from_nested_dict(
        workout_dict,
        strokes_config=strokes,
    )

    if args.text:
        print(render_text(workout.rows(coach_view=False)))
        print()
        print(render_text(workout.rows(coach_view=True)))
        return

    os.makedirs(args.outdir, exist_ok=True)
    base: str = os.path.splitext(os.path.basename(args.workout))[0]

    coach_path = os.path.join(args.outdir, f"{base}-coach.pdf")
    render_pdf(render_text(workout.rows(coach_view=True)), coach_path, max_pages=args.pages)

    athlete_path = os.path.join(args.outdir, f"{base}-athlete.pdf")
    render_pdf(
        render_text(workout.rows(coach_view=False)), athlete_path, max_pages=args.pages
    )

    paths: List[str] = [coach_path, athlete_path]
    for path in paths:
        print(f"wrote {path}")

    if args.do_print:
        subprocess.run(["open", *paths], check=True)


if __name__ == "__main__":
    main()
