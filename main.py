from datetime import timedelta

from swimsets import SwimSet


warmup = SwimSet(
    msg='Warmup',
    time=timedelta(minutes=10),
    subsets=[
        SwimSet(200, msg='Free'),
        SwimSet(100, msg='Kick'),
        SwimSet(200, msg='Pull'),
        SwimSet(100, msg='IM'),
    ]
)

# LANE 1
preset1 = SwimSet(
    msg='Preset',
    subsets=[
        SwimSet(50, 'Free, DPS', time=timedelta(seconds=50), rounds=4),
        SwimSet(100, 'IM', time=timedelta(minutes=1, seconds=40), rounds=1),
        SwimSet(50, 'Free, Descend', time=timedelta(seconds=55), rounds=3),
        SwimSet(100, 'IM', time=timedelta(minutes=1, seconds=45), rounds=2),
    ],
    print_full_stats=True,
)

mainset1 = SwimSet(
    msg='Main Set',
    rounds=3,
    subsets=[
        SwimSet(100, 'Kick (Fins Optional)', time=timedelta(minutes=1, seconds=50)),
        SwimSet(75, 'Free, Desc', time=timedelta(minutes=1, seconds=5), rounds=4),
        SwimSet(0, 'Rest', time=timedelta(seconds=60)),
        SwimSet(25, 'DPS', time=timedelta(seconds=30)),
        SwimSet(25, 'Build to High Rev', time=timedelta(seconds=30)),
        SwimSet(25, 'Build to Sprint', time=timedelta(seconds=30)),
        SwimSet(25, 'Sprint', time=timedelta(seconds=30)),
        SwimSet(100, 'Smooth', time=timedelta(minutes=1, seconds=45)),
    ],
    print_full_stats=True,
)

workout1 = SwimSet(
    msg='TNYA Lane 1 - LIU - Mon 2019-01-28',
    subsets=[warmup, preset1, mainset1],
    print_full_stats=True,
)

print(workout1)
