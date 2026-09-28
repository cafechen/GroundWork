import copy
import json
import math
from pathlib import Path
import tempfile
import unittest

import yaml
from import_rmf import (ASSETS, MAPS, align_level, apply_image, build, convert,
                        image_transform, reference_scale, safe_filename)


class RmfTests(unittest.TestCase):
    def test_measured_scale_and_image_axes(self):
        level = dict(vertices=[[0, 0], [100, 0], [0, 50]],
                     measurements=[[0, 1, {'distance': [3, 10]}], [0, 2, {'distance': [3, 5]}]])
        self.assertAlmostEqual(reference_scale(level), .1)
        self.assertEqual(apply_image(image_transform(.1), [20, 30]), [2, -3])
        with self.assertRaises(ValueError):
            reference_scale(dict(vertices=[], measurements=[]))

    def test_floor_alignment_analytic_rotated_scaled_translated(self):
        ref = {'fiducials': [[0, 0, 'a'], [100, 0, 'b'], [0, 100, 'c']]}
        # Target image transformed by +90 degrees and x2 in Cartesian image-flipped frame.
        target = {'fiducials': [[50, -30, 'a'], [50, -230, 'b'], [250, -30, 'c']]}
        t = align_level(ref, target, .1)
        self.assertAlmostEqual(t['scale'], .05)
        self.assertAlmostEqual(t['rotation'], -math.pi/2)
        for a,b in zip(ref['fiducials'],target['fiducials']):
            p=apply_image(t,b)
            self.assertAlmostEqual(p[0], a[0]*.1)
            self.assertAlmostEqual(p[1], -a[1]*.1)

    def test_svy21_origin_and_axis_order(self):
        # EPSG:3414 natural origin: lon 103°50', lat 1°22', false E 28001.642, N 38744.572.
        data=dict(coordinate_system='wgs84', parameters={
            'generate_crs':[1,'EPSG:3414'],'suggested_offset_x':[3,22000], 'suggested_offset_y':[3,31500]},
            levels={'L1':{'vertices':[[103+50/60,1+22/60,0,'origin']]}})
        point=convert(data,'campus',{})['levels'][0]['vertices'][0]
        self.assertAlmostEqual(point['x'],6001.642,places=5)
        self.assertAlmostEqual(point['y'],7244.572,places=5)

    def test_sources_conversion_and_determinism(self):
        with tempfile.TemporaryDirectory(prefix='groundwork-rmf-test-') as temp:
            output=Path(temp)
            build(output)
            for p in output.glob('*.json'):
                self.assertEqual(p.read_bytes(), (ASSETS/p.name).read_bytes(),p.name)
        for map_id,_,_ in MAPS:
            m=json.loads((ASSETS/f'{map_id}.json').read_text())
            if map_id=='campus':
                self.assertEqual(m['levels'][0]['transform']['offset'],[22000,31500])
                self.assertEqual(m['levels'][0]['transform']['coordinateQuantumMetres'],.000001)
                for v in m['levels'][0]['vertices']:
                    self.assertEqual(v['x'],round(v['x'],6))
                    self.assertEqual(v['y'],round(v['y'],6))
            else:
                for l in m['levels']:
                    self.assertGreater(l['transform']['scale'],0)
                    # Measured inter-floor fiducials are approximate; report residual, not exact registration.
                    if l['id'] != m['levels'][0]['id']:
                        ref={f['name']:f['position'] for f in m['levels'][0]['fiducials']}
                        self.assertLess(max(math.dist(f['position'],ref[f['name']]) for f in l['fiducials']),.2)

    def test_bad_inputs_rejected(self):
        original=yaml.safe_load((ASSETS/'source/office/office.building.yaml').read_text())
        for mutate in [lambda d:d.update(coordinate_system='bad'),
                       lambda d:d['levels']['L1']['lanes'][0].__setitem__(0,-1),
                       lambda d:d['levels']['L1']['vertices'][0].__setitem__(0,float('nan')),
                       lambda d:d['levels']['L1'].__setitem__('measurements',[])]:
            data=copy.deepcopy(original);mutate(data)
            with self.assertRaises(ValueError):convert(data,'office',{})
        for name in ['../../bad.png','/bad.png','https://example.com/a.png']:
            with self.assertRaises(ValueError):safe_filename(name)

    def test_pinned_upstream_reference_values(self):
        # From unmodified upstream Transform at 06e91e59830804848bf127ba1d8882bc968084d0.
        hotel=json.loads((ASSETS/'hotel.json').read_text())
        t=hotel['levels'][1]['transform']
        self.assertAlmostEqual(t['scale'],0.05619863521097145,places=14)
        self.assertAlmostEqual(t['rotation'],0.0008162312333664333,places=14)
        self.assertAlmostEqual(t['translation'][0],0.2679510266971021,places=12)
        self.assertAlmostEqual(t['translation'][1],-2.8739795897664897,places=12)


if __name__=='__main__':unittest.main()
