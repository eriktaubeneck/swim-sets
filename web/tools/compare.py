"""Compare two reference dumps, ignoring workouts only present in one.

Used by `make web-roundtrip` to show which practices render differently after
a trip through the editor's import/export. Three workouts are expected to
differ, all of them 3-lane practices whose subsets omit `lanes: 3` and so pick
up python's 4-lane default; the editor normalises them. See web/README.md.
"""

import sys
from typing import Dict, List


def load(path: str) -> Dict[str, List[str]]:
    out: Dict[str, List[str]] = {}
    current = ""
    with open(path, "r") as f:
        for line in f:
            if line.startswith("====="):
                current = line.split(maxsplit=1)[1].strip()
                out[current] = []
            elif current:
                out[current].append(line.rstrip("\n"))
    return out


def main() -> int:
    before, after = load(sys.argv[1]), load(sys.argv[2])
    shared = [k for k in before if k in after]
    differing = [k for k in shared if before[k] != after[k]]

    for name in differing:
        print(f"--- {name}")
        for a, b in zip(before[name], after[name]):
            if a != b:
                print(f"  before: {a!r}")
                print(f"  after:  {b!r}")

    print(f"\n{len(shared) - len(differing)}/{len(shared)} workouts round-trip unchanged")
    if differing:
        print(f"{len(differing)} differ: {', '.join(differing)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
