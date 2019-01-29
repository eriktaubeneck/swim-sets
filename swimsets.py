from datetime import timedelta


zero_seconds = timedelta(seconds=0)


class SwimSet:
    def __init__(
            self,
            distance=0,
            msg='',
            time=zero_seconds,
            rounds=1,
            subsets=None,
            print_full_stats=False):
        self.distance = distance
        self.time = time
        self.rounds = rounds
        self.msg = msg
        self.subsets = subsets or []
        self.print_full_stats = print_full_stats

    @property
    def is_superset(self):
        return bool(self.subsets)

    @property
    def total_time(self):
        if self.time != zero_seconds or not self.is_superset:
            return self.time * self.rounds
        return self.rounds * sum((s.total_time for s in self.subsets), zero_seconds)

    @property
    def total_distance(self):
        if not self.is_superset:
            return self.distance * self.rounds
        return self.rounds * sum(s.total_distance for s in self.subsets)

    def pprint(self):
        msg = ''
        if self.rounds > 1:
            msg += f'{self.rounds}x '
        if self.distance:
            msg += f'{self.distance} '
        msg += f'{self.msg} '
        if self.time:
            msg += f'@{self.time} '
        if self.print_full_stats:
            if self.rounds > 1:
                msg += f'(total time: {self.total_time}, {self.total_time/self.rounds} per round, '
            else:
                msg += f'(total time: {self.total_time}, '
            msg += f'total distance: {self.total_distance})'
        msg += '\n'

        submsgs = ''.join([s.pprint() for s in self.subsets]).split('\n')
        submsg = ''.join([f'    {s}\n' for s in submsgs if s])
        msg += f'{submsg}'
        return msg

    def __repr__(self):
        return self.pprint()
