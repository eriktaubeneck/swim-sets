from datetime import timedelta
import yaml


zero_seconds = timedelta(seconds=0)


def build_timedelta(time):
    mult = 1
    if time.startswith('-'):
        mult = -1
        time = time[1:]
    minutes, seconds = map(lambda t: int(t or 0), time.split(':'))
    return mult * timedelta(minutes=minutes, seconds=seconds)


def calc_set_time(
        distance, base, additional_base, additional,
        _round=5
        ):
    t = distance / 100 * (base + additional_base) + additional
    if t.microseconds:
        t += timedelta(seconds=1, microseconds=-t.microseconds)
    t = t + timedelta(seconds=(- t.seconds % -_round))
    return t


class Stroke:
    def __init__(
            self,
            name,
            base_times,
            _round=5,
    ):
        self.name = name
        self.base_times = [build_timedelta(t) for t in base_times]
        self._round = _round

    def calc_time_by_lane(self, distance, additional_base, additional):
        return [
            calc_set_time(d, b, build_timedelta(ab), build_timedelta(a), self._round)
            for d, b, ab, a
            in zip(distance, self.base_times, additional_base, additional)
        ]

    def __repr__(self):
        return self.name


class SwimSet:
    def __init__(
            self,
            distance=0,
            distance_by_lanes=None,
            stroke=None,
            msg='',
            time=None,
            time_by_lanes=None,
            rounds=1,
            rounds_by_lanes=None,
            additional_base='0:00',
            additional_base_by_lanes=None,
            additional='0:00',
            additional_by_lanes=None,
            lanes=4,
            subsets=None,
            print_full_stats=False,
    ):
        self.stroke = stroke
        self.msg = msg
        self.lanes = lanes
        self.distance = self.init_by_lanes(distance, distance_by_lanes)
        self.additional_base = self.init_by_lanes(
            additional_base, additional_base_by_lanes
        )
        self.additional = self.init_by_lanes(
            additional, additional_by_lanes
        )
        self.time = self.init_time(time, time_by_lanes)
        self.rounds = self.init_by_lanes(rounds, rounds_by_lanes)
        self.subsets = subsets or []
        self.print_full_stats = print_full_stats

    def init_by_lanes(self, var, var_by_lanes, fn=lambda x: x):
        if var_by_lanes:
            return [fn(v) for v in var_by_lanes]
        return [fn(var) for _ in range(self.lanes)]

    def init_time(self, time, time_by_lanes):
        if time_by_lanes:
            return [build_timedelta(t) for t in time_by_lanes]
        elif time:
            return [build_timedelta(time), ] * self.lanes
        elif self.stroke:
            return self.stroke.calc_time_by_lane(
                self.distance, self.additional_base, self.additional
            )
        return [zero_seconds, ] * self.lanes

    @classmethod
    def build_from_nested_dict(cls, _dict, strokes_config=None):
        if 'stroke_str' in _dict:
            _dict['stroke'] = strokes_config[_dict['stroke_str']]
            del _dict['stroke_str']
        _dict['subsets'] = [
            cls.build_from_nested_dict(s, strokes_config)
            for s in _dict.get('subsets', [])
        ]
        return cls(**_dict)

    @property
    def is_superset(self):
        return bool(self.subsets)

    @property
    def max_distance(self):
        return max(self.distance)

    @property
    def max_rounds(self):
        return max(self.rounds)

    @property
    def max_time(self):
        return max(self.time)

    @property
    def total_time(self):
        if self.max_time != zero_seconds or not self.is_superset:
            return [t*r for t, r in zip(self.time, self.rounds)]
        return [self.rounds[l] * sum((s.total_time[l] for s in self.subsets), zero_seconds)
                for l in range(self.lanes)]

    @staticmethod
    def print_dt(dt):
        hours, minutes, seconds = str(dt).split(':')
        if hours != '0':
            return str(dt)
        elif minutes != '00':
            return str(int(minutes)) + ':' + seconds
        elif seconds != '00':
            return ':' + seconds
        return '--'

    @property
    def total_distance(self):
        if not self.is_superset:
            return [d*r for d, r in zip(self.distance,  self.rounds)]
        return [self.rounds[l] * sum(s.total_distance[l] for s in self.subsets)
                for l in range(self.lanes)]

    @property
    def rounds_str(self):
        if self.max_rounds == 1:
            return ''
        return f'{self.max_rounds}x '

    @property
    def round_edits(self):
        if len(set(self.rounds)) == 1 or self.max_time:
            return ''
        return '(' + ', '.join(
            f'L{i+1}: {r}x'
            for i, r in enumerate(self.rounds)
            if r != self.max_rounds
        ) + ')'

    @property
    def distance_str(self):
        if not self.max_distance:
            return ''
        return f'{self.max_distance} '

    @property
    def time_str(self):
        if not self.max_time:
            return ''
        dist = [f'{d}' if d != self.max_distance else '' for d in self.distance]
        rnds = [f'{r}' if r != self.max_rounds else '' for r in self.rounds]

        dist_rnds = []
        for d, r in zip(dist, rnds):
            if d and r and not (d == '0' or r == '0'):
                dist_rnds.append(f'({r}x, {d})')
            elif r:
                dist_rnds.append(f'({r}x)')
            elif d:
                dist_rnds.append(f'({d})')
            else:
                dist_rnds.append('')

        tm_str = "  ".join(
            [self.print_dt(t) + dr for t, dr in zip(self.time, dist_rnds)]
        )
        return f'\n    @ {tm_str} '

    @property
    def full_stats_str(self):
        if not self.print_full_stats:
            return ''
        totals = ', '.join(
            f'L{i+1}:{d}@{self.print_dt(t)}' for i, (t, d)
            in enumerate(zip(self.total_time, self.total_distance))
        )

        if self.max_rounds > 1:
            per_round = ', '.join(
                f'L{i+1}:{int(d/r)}@{self.print_dt(t/r)}' for i, (t, d, r)
                in enumerate(zip(self.total_time, self.total_distance, self.rounds))
            )
            fs_str = f'\ntotal     - {totals} '
            fs_str += f'\nper round - {per_round}'
        else:
            fs_str = f'\ntotal - {totals} '
        return fs_str

    def pprint(self, coach_view=False):
        msg = f'{self.rounds_str}{self.distance_str}'
        msg += f'{bool(self.stroke)*(" "+str(self.stroke)+" "*bool(self.msg))}{self.msg} '
        msg += f'{self.round_edits}'
        if coach_view:
            msg += f'{self.full_stats_str}'
        msg += f'{self.time_str}\n'

        submsgs = ''.join([s.pprint(coach_view) for s in self.subsets]).split('\n')
        submsg = ''.join([f'    {s}\n' for s in submsgs if s])
        msg += f'{submsg}'
        return msg

    def __repr__(self):
        return self.pprint()


if __name__ == '__main__':
    strokes_yaml = 'strokes.yaml'
    with open(strokes_yaml, 'r') as f:
        strokes_dict = yaml.safe_load(f)

    strokes = {
        k: Stroke(**v) for k, v in strokes_dict.items()
    }

    workout_yaml = 'example-workout.yaml'
    with open(workout_yaml, 'r') as f:
        workout_dict = yaml.safe_load(f)
    workout = SwimSet.build_from_nested_dict(workout_dict, strokes_config=strokes)
    print(workout)
    print(workout.pprint(coach_view=True))
