"""Emit the swimsets.py rendering of every workout, for the JS parity check.

Run from the repo root:  venv/bin/python web/tools/reference.py > /tmp/ref.txt
"""

import glob
import os
import sys
from typing import Any, Dict, cast

from ruamel.yaml import YAML

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from swimsets import Stroke, SwimSet  # noqa: E402


def main() -> None:
    yaml = YAML(typ="safe")
    root = os.path.join(os.path.dirname(__file__), "..", "..")
    with open(os.path.join(root, "strokes.yaml"), "r") as f:
        strokes = {cast(str, k): Stroke(**v) for k, v in yaml.load(f).items()}

    if len(sys.argv) > 1:
        paths = sorted(glob.glob(os.path.join(sys.argv[1], "*.yaml")))
    else:
        paths = sorted(glob.glob(os.path.join(root, "workouts", "*.yaml")))
        paths.append(os.path.join(root, "example-workout.yaml"))
    for path in paths:
        try:
            with open(path, "r") as f:
                workout_dict: Dict[Any, Any] = yaml.load(f)
            workout = SwimSet.build_from_nested_dict(workout_dict, strokes_config=strokes)
        except Exception as exc:  # a workout swimsets.py itself cannot load
            print(f"##### {os.path.basename(path)} {type(exc).__name__}", file=sys.stderr)
            continue
        print(f"===== {os.path.basename(path)}")
        print(workout)
        print(workout.pprint(coach_view=True))


if __name__ == "__main__":
    main()
