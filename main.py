from swimsets import SwimSet


warmup = dict(
    msg='Warmup',
    time='10:00',
    subsets=[
        dict(distance=250, msg='Free'),
        dict(distance=100, msg='IM'),
        dict(distance=150, msg='Pull'),
        dict(distance=100, msg='Kick'),
    ],
    print_full_stats=True,
)

preset = dict(
    msg='Preset',
    subsets=[
        dict(
            distance=50,
            msg='Choice, Drill/Swim',
            time_by_lanes=['0:55', '1:00', '1:05', '1:10'],
            rounds=6
        ),
        dict(
            distance=25,
            msg='Stroke, Build',
            time_by_lanes=[':30', ':35', ':35', ':40'],
            rounds=6
        ),
        dict(
            distance=50,
            msg='Kick',
            time_by_lanes=['1:00', '1:05', '1:15', '1:20'],
            rounds=4
        ),
        dict(
            distance=50,
            msg='Free, Desc',
            time_by_lanes=[':50', '0:55', '1:00', '1:05'],
            rounds=3
        ),
        dict(
            distance_by_lanes=[200, 200, 200, 100],
            msg='IM',
            time_by_lanes=['3:10', '3:35', '4:00', '2:10'],
            rounds=1
        ),
    ],
    print_full_stats=True,
)

mainset = dict(
    msg='Main Set',
    rounds=1,
    subsets=[
        dict(
            distance_by_lanes=[250, 250, 250, 150],
            msg='Free',
            time_by_lanes=['3:30', '3:55', '4:20', '2:45'],
        ),

        dict(
            distance_by_lanes=[350, 350, 350, 250],
            msg='Free',
            time_by_lanes=['4:50', '5:25', '6:00', '4:35'],
        ),

        dict(
            distance_by_lanes=[450, 450, 450, 350],
            msg='Free',
            time_by_lanes=['6:10', '6:55', '7:40', '5:25'],
        ),

        dict(
            distance=50,
            msg='EZ',
            time='1:00',
        ),

        dict(
            distance_by_lanes=[200, 200, 200, 0],
            msg='IM',
            time_by_lanes=['3:10', '3:35', '4:00', '0:00'],
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
