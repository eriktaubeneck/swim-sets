from swimsets import SwimSet, Stroke


free = Stroke('Free', ['1:20', '1:30', '1:40', '1:50'])
stroke = Stroke('Stroke', ['1:35', '1:45', '1:55', '2:10'])
choice = Stroke('Choice', ['1:30', '1:40', '1:50', '2:00'])
im = Stroke('Choice', ['1:35', '1:45', '2:00', '2:10'])
kick = Stroke('Kick', ['2:00', '2:10', '2:30', '2:40'])
ez = Stroke('EZ', ['2:00', '2:00', '2:00', '2:00'])

print(free)

warmup = dict(
    msg='Warmup',
    time='10:00',
    subsets=[
        dict(distance=250, stroke=free, time='0:00'),
        dict(distance=100, stroke=im, time='0:00'),
        dict(distance=150, stroke=free, msg='Pull', time='0:00'),
        dict(distance=100, stroke=kick, time='0:00'),
    ],
    print_full_stats=True,
)

preset = dict(
    msg='Preset',
    subsets=[
        dict(
            distance=50,
            stroke=choice,
            msg='Drill/Swim',
            additional=':10',
            rounds=6
        ),
        dict(
            distance=25,
            stroke=stroke,
            msg='Build',
            additional=':10',
            rounds=6
        ),
        dict(
            distance=50,
            stroke=kick,
            rounds=4
        ),
        dict(
            distance=50,
            stroke=free,
            msg='Desc',
            additional=':10',
            rounds=3
        ),
        dict(
            distance_by_lanes=[200, 200, 200, 100],
            stroke=im,
            rounds=1
        ),
    ],
    print_full_stats=True,
)

mainset = dict(
    msg='Main Set',
    rounds_by_lanes=[1, 1, 1, 2],
    subsets=[
        dict(
            distance_by_lanes=[250, 250, 250, 150],
            stroke=free,
            additional=':10',
        ),

        dict(
            distance_by_lanes=[350, 350, 350, 250],
            stroke=free,
            additional=':10',
        ),

        dict(
            distance_by_lanes=[450, 450, 450, 350],
            stroke=free,
            additional=':10',
        ),

        dict(
            distance=50,
            stroke=ez,
        ),

        dict(
            distance_by_lanes=[200, 200, 200, 0],
            stroke=im,
            rounds_by_lanes=[3, 2, 1, 0]
        ),

    ],
    print_full_stats=True,
)

workout = SwimSet.build_from_nested_dict(
    dict(
        msg='TNYA - LIU - Mon 2019-02-11',
        print_full_stats=True,
        subsets=[warmup, preset, mainset],
    )
)


print(workout)
