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

    @staticmethod
    def init_time(time):
        minutes, seconds = map(lambda t: int(t or 0), time.split(':'))
        return timedelta(minutes=minutes, seconds=seconds)

    @property
    def is_superset(self):
        return bool(self.subsets)

    @property
    def total_time(self):
        if max(self.time) != zero_seconds or not self.is_superset:
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
        if not max(self.rounds) > 1:
            return ''
        return f'{max(self.rounds)}x '

    @property
    def distance_str(self):
        if not max(self.distance):
            return ''
        return f'{max(self.distance)} '

    @property
    def time_str(self):
        if not max(self.time):
            return ''
        max_dist = max(self.distance)
        dist = [f'{d}' if d != max_dist else '' for d in self.distance]
        max_rounds = max(self.rounds)
        rnds = [f'{r}' if r != max_rounds else '' for r in self.rounds]

        dist_rnds = []
        for d, r in zip(dist, rnds):
            if d and r:
                if d == '0' or r == '0':
                    dist_rnds.append('')
                else:
                    dist_rnds.append(f'({r}x, {d})')
            elif d:
                dist_rnds.append(f'({d})')
            elif r:
                dist_rnds.append(f'({r}x)')
            else:
                dist_rnds.append('')

        tm_str = [self.print_dt(t) + dr for t, dr in zip(self.time, dist_rnds)]

        return f'\n    @ {"  ".join(tm_str)} '

    @property
    def full_stats_str(self):
        if not self.print_full_stats:
            return ''
        total_times = '[' + ', '.join([self.print_dt(t) for t in self.total_time]) + ']'
        if max(self.rounds) > 1:
            per_round = [self.print_dt(self.total_time[l]/self.rounds[l]) for l in self.lanes]
            return (
                f'\n        (total time: {total_times}, '
                f'\n         per round:  {per_round}, '
                f'\n         total dist: {self.total_distance}'
            )
        else:
            return (
                f'\n        (total time: {total_times} '
                f'\n         total dist: {self.total_distance}) '
            )

    def pprint(self):
        msg = f'{self.rounds_str}{self.distance_str}'
        msg += f'{self.msg} {self.full_stats_str}{self.time_str}\n'

        submsgs = ''.join([s.pprint() for s in self.subsets]).split('\n')
        submsg = ''.join([f'    {s}\n' for s in submsgs if s])
        msg += f'{submsg}'
        return msg

    def __repr__(self):
        return self.pprint()
