"""Read-only acceptance checks for five-tugger Chrono journals (stdlib only).

No log truncation, restart, state changes or task counter resets. Output JSON
to stdout. An unfinished run fails the requested minimum-cycle requirement.
"""
import argparse
import itertools
import json
import math
from pathlib import Path

def main():
    p=argparse.ArgumentParser();p.add_argument('directory',type=Path)
    p.add_argument('--min-cycles',type=int,default=1);args=p.parse_args()
    previous=None;frames=0;min_gap=math.inf;max_jump=0.;errors=[]
    expected=[f'tugger{i:02d}' for i in range(1,6)]
    maxima={n:{'route_m':0.,'hitch_m':0.,'fold_deg':0.,'tilt_deg':0.,'speed':0.} for n in expected}
    stages={n:set() for n in expected}
    def check(ok,message):
        if not ok and message not in errors:errors.append(message)
    with (args.directory/'chrono.jsonl').open() as f:
        for line in f:
            row=json.loads(line);frames+=1;robots=row['robots']
            check([r['name'] for r in robots]==expected,'Expected exactly five named tuggers')
            for r in robots:
                check(not r['error'],f"{r['name']}: {r['error']}")
                check(len(r['poses'])==3,'Expected tractor, trailer and cargo poses')
                values=[v for pose in r['poses'] for v in pose]
                check(all(math.isfinite(v) for v in values),'Non-finite pose')
                stats=maxima[r['name']];stages[r['name']].add(r['stage'])
                for key,value in [('route_m',r['route_error_m']),('hitch_m',r['hitch_error_m']),
                                  ('fold_deg',abs(r['trailer_angle_deg'])),('tilt_deg',r['trailer_tilt_deg']),('speed',r['speed'])]:
                    stats[key]=max(stats[key],value)
            # Conservative center clearance, not a contact-force measurement.
            for a,b in itertools.combinations(robots,2):
                for pa in a['poses'][:2]:
                    for pb in b['poses'][:2]:min_gap=min(min_gap,math.dist(pa[:2],pb[:2]))
            if previous:
                check(row['seq']==previous['seq']+1,'Frame sequence gap')
                check(abs(row['time']-previous['time']-.02)<1e-6,'Unexpected physics step')
                for r,old in zip(robots,previous['robots']):
                    for a,b in zip(r['poses'],old['poses']):max_jump=max(max_jump,math.dist(a[:3],b[:3]))
            previous=row
    check(frames>0,'Empty journal')
    if previous:
        for r in previous['robots']:
            n=r['name'];m=maxima[n]
            check(r['cycles']>=args.min_cycles,f'{n}: incomplete round trips')
            check(stages[n]=={'loading','outbound','unloading','return'},f'{n}: missing transport phases')
            check(m['route_m']<1.0,f'{n}: path deviation >= 1 m')
            check(m['hitch_m']<.001,f'{n}: hitch separation >= 1 mm')
            check(m['fold_deg']<60,f'{n}: fold angle >= 60 deg')
            check(m['tilt_deg']<5,f'{n}: tilt >= 5 deg')
            check(1.2<m['speed']<1.8,f'{n}: speed envelope violated')
    check(min_gap>1.5,'Inter-vehicle center clearance <= 1.5 m')
    check(max_jump<.05,'Body displacement >= 5 cm per 20 ms step')
    report={'pass':not errors,'frames':frames,'sim_seconds':previous['time'] if previous else 0,
        'minimum_body_center_distance_m':min_gap,'max_step_displacement_m':max_jump,'maxima':maxima,
        'round_trips':{r['name']:r['cycles'] for r in previous['robots']} if previous else {},'errors':errors}
    print(json.dumps(report,ensure_ascii=False,indent=2))
    raise SystemExit(0 if report['pass'] else 1)

if __name__=='__main__':main()
