from swimsets import SwimSet


warmup = SwimSet(
    msg='Warmup',
    time='10:00',
    subsets=[
        SwimSet(250, msg='Free'),
        SwimSet(100, msg='IM'),
        SwimSet(150, msg='Pull'),
        SwimSet(100, msg='Kick'),
    ],
    print_full_stats=True,
)


preset = SwimSet(
    msg='Preset',
    subsets=[
        SwimSet(
            distance=50,
            msg='Choice, Drill/Swim',
            time_by_lanes=['0:55', '1:00', '1:05', '1:10'],
            rounds=6
        ),
        SwimSet(
            distance=25,
            msg='Stroke, Build',
            time_by_lanes=[':30', ':35', ':35', ':40'],
            rounds=6
        ),
        SwimSet(
            distance=50,
            msg='Kick',
            time_by_lanes=['1:00', '1:05', '1:15', '1:20'],
            rounds=4
        ),
        SwimSet(
            distance=50,
            msg='Free, Desc',
            time_by_lanes=[':50', '0:55', '1:00', '1:05'],
            rounds=3
        ),
        SwimSet(
            distance_by_lanes=[200, 200, 200, 100],
            msg='IM',
            time_by_lanes=['3:10', '3:35', '4:00', '2:10'],
            rounds=1
        ),
    ],
    print_full_stats=True,
)

mainset = SwimSet(
    msg='Main Set',
    rounds=1,
    subsets=[
        SwimSet(
            distance_by_lanes=[250, 250, 250, 150],
            msg='Free',
            time_by_lanes=['3:30', '3:55', '4:20', '2:45'],
        ),

        SwimSet(
            distance_by_lanes=[350, 350, 350, 250],
            msg='Free',
            time_by_lanes=['4:50', '5:25', '6:00', '4:35'],
        ),

        SwimSet(
            distance_by_lanes=[450, 450, 450, 350],
            msg='Free',
            time_by_lanes=['6:10', '6:55', '7:40', '5:25'],
        ),

        SwimSet(
            distance=50,
            msg='EZ',
            time='1:00',
        ),

        SwimSet(
            distance_by_lanes=[200, 200, 200, 0],
            msg='IM',
            time_by_lanes=['3:10', '3:35', '4:00', '0:00'],
            rounds_by_lanes=[3, 2, 1, 0]
        ),

    ],
    print_full_stats=True,
)

workout1 = SwimSet(
    msg='TNYA Lane 1 - LIU - Mon 2019-02-04',
    subsets=[warmup, preset,  mainset],
    print_full_stats=True,
)

print(workout1)
