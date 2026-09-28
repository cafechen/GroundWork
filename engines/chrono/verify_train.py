"""Validate composition changes and multi-trailer turns from recorded states."""
import argparse
import itertools
import json
import math
from pathlib import Path

def main():
    p=argparse.ArgumentParser();p.add_argument('directory',type=Path);args=p.parse_args()
    expected=[f'tugger{i:02d}' for i in range(1,6)];stats={n:{'counts':set(),'max_hitch_m':0.,'max_fold_deg':0.,'max_tilt_deg':0.,'max_head_error_m':0.,'three_wagon_turn_deg':0.} for n in expected}
    errors=[];minimum=math.inf;step=0.;previous=None;frames=0
    def check(value,msg):
        if not value and msg not in errors:errors.append(msg)
    for line in (args.directory/'chrono.jsonl').open():
        row=json.loads(line);frames+=1
        check([r['name'] for r in row['robots']]==expected,'Five vehicles required')
        for r in row['robots']:
            check(not r['error'],r['name']+': '+r['error']);m=stats[r['name']];n=r['trailer_count'];m['counts'].add(n)
            check(0<=n<=3,'Invalid composition');check(len(r['poses'])==7,'Seven pose slots per tractor required')
            check(len(r['wagons'])==n,'Incorrect number of dynamic hitch metrics')
            check(all(math.isfinite(v) for pose in r['poses'] for v in pose),'Non-finite pose')
            for k,v in [('max_hitch_m',r['hitch_error_m']),('max_fold_deg',r['trailer_angle_deg']),('max_tilt_deg',r['trailer_tilt_deg']),('max_head_error_m',r['route_error_m'])]:m[k]=max(m[k],v)
            if n==3:m['three_wagon_turn_deg']=max(m['three_wagon_turn_deg'],r['trailer_angle_deg'])
            for e in r['events']:
                if e['kind'] in ('attach','detach'):check(e['speed']<.03,'Coupling/uncoupling while moving')
        for a,b in itertools.combinations(row['robots'],2):
            pa=[a['poses'][0]]+[a['poses'][2*i+1] for i in range(a['trailer_count'])]
            pb=[b['poses'][0]]+[b['poses'][2*i+1] for i in range(b['trailer_count'])]
            minimum=min(minimum,min(math.dist(x[:2],y[:2]) for x in pa for y in pb))
        if previous:
            check(row['seq']==previous['seq']+1,'Frame sequence gap')
            for a,b in zip(row['robots'],previous['robots']):
                for i in range(1+2*min(a['trailer_count'],b['trailer_count'])):step=max(step,math.dist(a['poses'][i][:3],b['poses'][i][:3]))
        previous=row
    check(frames>0,'Empty log')
    for r in previous['robots']:
        m=stats[r['name']];m['counts']=sorted(m['counts']);m.update(charges=r['charges'],cycles=r['cycles'],attached=r['attached'],detached=r['detached'])
        check(m['counts']==[0,1,2,3],r['name']+': missing composition transition')
        check(m['charges']>=1 and m['cycles']>=1,r['name']+': no full service/charge cycle')
        check(m['attached']>=3 and m['detached']>=3,r['name']+': missing attachment events')
        check(m['three_wagon_turn_deg']>8,r['name']+': three-wagon turn not demonstrated')
        check(m['max_hitch_m']<.001,r['name']+': hitch error >= 1 mm')
        check(m['max_fold_deg']<60 and m['max_tilt_deg']<5,r['name']+': trailer attitude outside envelope')
        check(m['max_head_error_m']<1,r['name']+': tractor path error >= 1 m')
    check(minimum>1.5,'Inter-train center clearance <= 1.5 m')
    check(step<.05,'Existing bodies moved >= 5 cm per step')
    print(json.dumps({'pass':not errors,'frames':frames,'seconds':previous['time'],'minimum_body_center_distance_m':minimum,
                      'maximum_existing_body_step_m':step,'robots':stats,'errors':errors},ensure_ascii=False,indent=2))
    raise SystemExit(bool(errors))

if __name__=='__main__':main()
