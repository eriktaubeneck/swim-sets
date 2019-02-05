from datetime import timedelta


zero_seconds = timedelta(seconds=0)


class SwimSet:
    def __init__(
            self,
            distance=0,
            distance_by_lanes=None,
            msg='',
            time='0:00',
            time_by_lanes=None,
            rounds=1,
            rounds_by_lanes=None,
            lanes=4,
            subsets=None,
            print_full_stats=False):
        self.lanes = list(range(lanes))
        if distance_by_lanes:
            self.distance = distance_by_lanes
        else:
            self.distance = [distance for _ in self.lanes]
        if time_by_lanes:
            self.time = [self.init_time(t) for t in time_by_lanes]
        else:
            self.time = [self.init_time(time) for _ in self.lanes]
        if rounds_by_lanes:
            self.rounds = rounds_by_lanes
        else:
            self.rounds = [rounds for _ in self.lanes]
        self.msg = msg
        self.subsets = subsets or []
        self.print_full_stats = print_full_stats

    @classmethod
    def build_from_nested_dict(cls, _dict):
        _dict['subsets'] = [
            cls.build_from_nested_dict(s)
            for s in _dict.get('subsets', [])
        ]
        return cls(**_dict)

    @staticmethod
    def init_time(time):
        minutes, seconds = map(lambda t: int(t or 0), time.split(':'))
        return timedelta(minutes=minutes, seconds=seconds)

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
            return [self.time[l] * self.rounds[l] for l in self.lanes]
        return [self.rounds[l] * sum((s.total_time[l] for s in self.subsets), zero_seconds)
                for l in self.lanes]

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
            return [self.distance[l] * self.rounds[l] for l in self.lanes]
        return [self.rounds[l] * sum(s.total_distance[l] for s in self.subsets)
                for l in self.lanes]

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
        fs_str = f'\n            total - {totals} '
        if self.max_rounds > 1:
            per_round = ', '.join(
                f'L{i+1}:{int(d/r)}@{self.print_dt(t/r)}' for i, (t, d, r)
                in enumerate(zip(self.total_time, self.total_distance, self.rounds))
            )
            fs_str += f'\n        per round - {per_round}'
        return fs_str

    def pprint(self):
        msg = f'{self.rounds_str}{self.distance_str}'
        msg += f'{self.msg} {self.round_edits}{self.full_stats_str}{self.time_str}\n'

        submsgs = ''.join([s.pprint() for s in self.subsets]).split('\n')
        submsg = ''.join([f'    {s}\n' for s in submsgs if s])
        msg += f'{submsg}'
        return msg

    def __repr__(self):
        return self.pprint()
