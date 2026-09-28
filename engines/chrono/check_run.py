"""Portable synthetic-run acceptance derived from the migrated train verifier.

These are engineering regression thresholds, not calibrated safety limits.
Ground-inclusive Chrono contact totals are deliberately not accident counts.
"""
import argparse
import json
import math
from pathlib import Path

def verify(directory, require_cycle=True):
    summary=json.loads((directory/'summary.json').read_text())
    scene=json.loads((directory/'scene.json').read_text())
    expected={r['name']:r['trailers'] for r in scene['robots']}
    seen={name:set() for name in expected}
    previous={}
    rows=0
    for line in (directory/'chrono.jsonl').open():
        row=json.loads(line); rows+=1
        assert len(row['robots'])==len(expected)
        for r in row['robots']:
            name=r['name']; seen[name].add(r['trailer_count'])
            assert not r['error'], r['error']
            assert all(math.isfinite(v) for p in r['poses'] for v in p)
            assert 0<=r['trailer_count']<=expected[name]
            if name in previous:
                assert math.dist((r['x'],r['y']),previous[name])<.05, 'Tractor discontinuity'
            previous[name]=(r['x'],r['y'])
        for i,a in enumerate(row['robots']):
            for b in row['robots'][i+1:]:
                assert math.hypot(a['x']-b['x'],a['y']-b['y'])>1.5
    for r in summary['robots']:
        assert not r['error']
        assert r['max_hitch_error_m']<.001
        assert r['max_trailer_angle_deg']<60
        assert r['max_trailer_tilt_deg']<5
        assert r['max_route_error_m']<1
        assert all(e['speed']<.03 for e in r['events'] if e['kind'] in ('attach','detach'))
        if require_cycle:
            assert r['cycles']>=1 and r['charges']>=1, 'Full mission/charge cycle not observed'
            assert seen[r['name']]==set(range(expected[r['name']]+1))
    return {'checked_rows':rows,'vehicles':len(expected),'seconds':summary['seconds'],'full_cycle_required':require_cycle,'status':'PASS_REGRESSION_NOT_SAFETY'}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('directory',type=Path);parser.add_argument('--partial',action='store_true');args=parser.parse_args()
    print(json.dumps(verify(args.directory,not args.partial),indent=2))
