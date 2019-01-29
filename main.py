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


# LANE 2
preset2 = SwimSet(
    msg='Preset',
    subsets=[
        SwimSet(50, 'Free, DPS', time=timedelta(seconds=55), rounds=4),
        SwimSet(100, 'IM', time=timedelta(minutes=1, seconds=50), rounds=1),
        SwimSet(50, 'Free, Descend', time=timedelta(seconds=60), rounds=3),
        SwimSet(100, 'IM', time=timedelta(minutes=1, seconds=55), rounds=2),
    ],
    print_full_stats=True,
)

mainset2 = SwimSet(
    msg='Main Set',
    rounds=3,
    subsets=[
        SwimSet(50, 'Kick (Fins Optional)', time=timedelta(minutes=1)),
        SwimSet(75, 'Free, Desc', time=timedelta(minutes=1, seconds=15), rounds=4),
        SwimSet(25, 'EZ', time=timedelta(seconds=60)),
        SwimSet(25, 'DPS', time=timedelta(seconds=35)),
        SwimSet(25, 'Build to High Rev', time=timedelta(seconds=35)),
        SwimSet(25, 'Build to Sprint', time=timedelta(seconds=35)),
        SwimSet(25, 'Sprint', time=timedelta(seconds=35)),
        SwimSet(50, 'Smooth', time=timedelta(minutes=1)),
    ],
    print_full_stats=True,
)

workout2 = SwimSet(
    msg='TNYA Lane 2 - LIU - Mon 2019-01-28',
    subsets=[warmup, preset2, mainset2],
    print_full_stats=True,
)

print(workout2)


# LANE 3
preset3 = SwimSet(
    msg='Preset',
    subsets=[
        SwimSet(50, 'Free, DPS', time=timedelta(seconds=60), rounds=4),
        SwimSet(100, 'IM', time=timedelta(minutes=2), rounds=1),
        SwimSet(50, 'Free, Descend', time=timedelta(seconds=65), rounds=3),
        SwimSet(100, 'IM', time=timedelta(minutes=2, seconds=5), rounds=2),
    ],
    print_full_stats=True,
)

mainset3 = SwimSet(
    msg='Main Set',
    rounds=3,
    subsets=[
        SwimSet(50, 'Kick (Fins Optional)', time=timedelta(minutes=1, seconds=15)),
        SwimSet(75, 'Free, Desc', time=timedelta(minutes=1, seconds=25), rounds=3),
        SwimSet(25, 'EZ', time=timedelta(seconds=60)),
        SwimSet(25, 'DPS', time=timedelta(seconds=40)),
        SwimSet(25, 'Build to High Rev', time=timedelta(seconds=40)),
        SwimSet(25, 'Build to Sprint', time=timedelta(seconds=40)),
        SwimSet(25, 'Sprint', time=timedelta(seconds=40)),
        SwimSet(50, 'Smooth', time=timedelta(minutes=1, seconds=10)),
    ],
    print_full_stats=True,
)

workout3 = SwimSet(
    msg='TNYA Lane 3 - LIU - Mon 2019-01-28',
    subsets=[warmup, preset3, mainset3],
    print_full_stats=True,
)

print(workout3)


# LANE 4
preset4 = SwimSet(
    msg='Preset',
    subsets=[
        SwimSet(50, 'Free, DPS', time=timedelta(seconds=70), rounds=4),
        SwimSet(100, 'IM', time=timedelta(minutes=2, seconds=15), rounds=1),
        SwimSet(50, 'Free, Descend', time=timedelta(seconds=75), rounds=3),
        SwimSet(100, 'IM', time=timedelta(minutes=2, seconds=20), rounds=2),
    ],
    print_full_stats=True,
)

mainset4 = SwimSet(
    msg='Main Set',
    rounds=2,
    subsets=[
        SwimSet(50, 'Kick (Fins Optional)', time=timedelta(minutes=1, seconds=30)),
        SwimSet(75, 'Free, Desc', time=timedelta(minutes=1, seconds=35), rounds=3),
        SwimSet(25, 'EZ', time=timedelta(seconds=60)),
        SwimSet(25, 'DPS', time=timedelta(seconds=50)),
        SwimSet(25, 'Build to High Rev', time=timedelta(seconds=50)),
        SwimSet(25, 'Build to Sprint', time=timedelta(seconds=50)),
        SwimSet(25, 'Sprint', time=timedelta(seconds=50)),
        SwimSet(50, 'Smooth', time=timedelta(minutes=1, seconds=20)),
    ],
    print_full_stats=True,
)

workout4 = SwimSet(
    msg='TNYA Lane 4 - LIU - Mon 2019-01-28',
    subsets=[warmup, preset4, mainset4],
    print_full_stats=True,
)

print(workout4)
