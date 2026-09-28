"""Reproducible, build-time import of the five pinned RMF demo maps.

Transform math adapted from Open-RMF rmf_traffic_editor (Apache-2.0),
revision 06e91e59830804848bf127ba1d8882bc968084d0; see THIRD_PARTY_NOTICES.md.
No ROS, model download or runtime YAML parsing. Not a general simulation importer.
"""
import argparse
import hashlib
import itertools
import json
import math
from pathlib import Path
import re

import yaml
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'assets/maps/rmf'
REV = '7851a5792d19a037833292a3e2a823b0f9e0c111'
REPO = 'https://github.com/open-rmf/rmf_demos'
MAPS = [('hotel', '酒店', 'Hotel'), ('office', '办公室', 'Office'),
        ('airport_terminal', '机场航站楼', 'Airport Terminal'),
        ('clinic', '诊所', 'Clinic'), ('campus', '校园', 'Campus')]


def number(value):
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value):
        raise ValueError('Expected finite number')
    return float(value)


def params(raw):
    out = {}
    for key, item in raw.items():
        if not isinstance(item, list) or len(item) != 2 or item[0] not in [1, 2, 3, 4]:
            raise ValueError('Invalid typed parameter')
        out[key] = item[1]
    return out


def xy(raw):
    return [number(raw[0]), -number(raw[1])]


def image_transform(scale, rotation=0, translation=(0, 0)):
    return dict(kind='reference_image', scale=scale, rotation=rotation,
                translation=list(translation), yFlip=True)


def apply_image(t, point):
    x, y = xy(point)
    c, s = math.cos(t['rotation']), math.sin(t['rotation'])
    return [(c*x-s*y)*t['scale']+t['translation'][0],
            (s*x+c*y)*t['scale']+t['translation'][1]]


def reference_scale(level):
    ratios = []
    for a, b, p in level.get('measurements', []):
        if not all(isinstance(i, int) and 0 <= i < len(level['vertices']) for i in (a, b)):
            raise ValueError('Invalid measurement vertex')
        length = math.dist(xy(level['vertices'][a]), xy(level['vertices'][b]))
        distance = number(params(p)['distance'])
        if length <= 0 or distance <= 0:
            raise ValueError('Invalid calibration')
        ratios.append(distance / length)
    if not ratios:
        raise ValueError('Missing metric calibration')
    return sum(ratios) / len(ratios)


def align_level(ref, target, scale):
    # Match upstream all-pair circular bearing mean and mean relative distance.
    pairs = [(xy(a), xy(b)) for a in ref.get('fiducials', [])
             for b in target.get('fiducials', []) if a[2] == b[2]]
    if len(pairs) < 2:
        raise ValueError('Insufficient shared floor fiducials')
    angles, ratios = [], []
    for (a, b), (c, d) in itertools.combinations(pairs, 2):
        lr, lt = math.dist(a, c), math.dist(b, d)
        if min(lr, lt) <= 0:
            raise ValueError('Degenerate fiducials')
        angles.append(math.atan2(d[1]-b[1], d[0]-b[0])-math.atan2(c[1]-a[1], c[0]-a[0]))
        ratios.append(lt/lr)
    rotation = -math.atan2(sum(map(math.sin, angles)), sum(map(math.cos, angles)))
    t = image_transform(scale/(sum(ratios)/len(ratios)), rotation)
    transformed = [apply_image(t, [b[0], -b[1]]) for a, b in pairs]
    t['translation'] = [sum(a[i]*scale-p[i] for (a, _), p in zip(pairs, transformed))/len(pairs) for i in (0, 1)]
    return t


def safe_filename(name):
    if not isinstance(name, str) or not re.fullmatch(r'[A-Za-z0-9_-]+\.png', name):
        raise ValueError('Unsafe image filename')
    return name


def convert(data, map_id, source):
    levels = data['levels']
    ref_id = data.get('reference_level_name', next(iter(levels)))
    ref = levels[ref_id]
    cs = data.get('coordinate_system', 'reference_image')
    if cs == 'reference_image':
        scale = reference_scale(ref)
        transforms = {key: image_transform(scale) if key == ref_id else align_level(ref, level, scale)
                      for key, level in levels.items()}
        def project(key, p):
            return apply_image(transforms[key], p)
    elif cs == 'wgs84':
        meta = params(data['parameters'])
        crs = meta['generate_crs']
        if crs != 'EPSG:3414':
            raise ValueError('Unsupported projection for pinned map collection')
        offset = [number(meta['suggested_offset_x']), number(meta['suggested_offset_y'])]
        transformer = Transformer.from_crs('EPSG:4326', crs, always_xy=True)
        transforms = {key: dict(kind='wgs84', crs=crs, offset=offset, rotation=0,
                                coordinateQuantumMetres=0.000001,
                                formula='project(lon,lat) - offset') for key in levels}
        def project(key, p):
            x, y = number(p[0]), number(p[1])
            if not (-180 <= x <= 180 and -90 <= y <= 90):
                raise ValueError('Invalid longitude/latitude')
            q = transformer.transform(x, y, errcheck=True)
            # PROJ/libm last bits differ across macOS ARM and Linux x86 even
            # at the same pinned version. Canonicalize projected coordinates
            # to micrometres; do not weaken the byte-identical rebuild test.
            return [round(number(q[i])-offset[i], 6) for i in (0, 1)]
    else:
        raise ValueError('Unsupported coordinate system')
    out = []
    for key, level in levels.items():
        elevation = number(level.get('elevation', 0))
        vertices = [dict(id=i, x=project(key, v)[0], y=project(key, v)[1],
                         z=elevation, sourceZ=number(v[2]), name=str(v[3]),
                         parameters=params(v[4] if len(v) > 4 else {}))
                    for i, v in enumerate(level['vertices'])]
        def indices(values):
            if not all(type(i) is int and 0 <= i < len(vertices) for i in values):
                raise ValueError('Broken vertex reference')
            return values
        item = dict(id=key, elevation=elevation, transform=transforms[key], vertices=vertices)
        for kind in ('lanes', 'walls', 'doors', 'measurements'):
            edges = []
            for i, edge in enumerate(level.get(kind, [])):
                a, b = indices(edge[:2])
                p = params(edge[2])
                e = dict(id=i, start=a, end=b, parameters=p)
                if kind == 'lanes':
                    if type(p.get('bidirectional', True)) is not bool or type(p.get('graph_idx', 0)) is not int:
                        raise ValueError('Invalid lane direction/graph')
                    e.update(bidirectional=p.get('bidirectional', True), graph=p.get('graph_idx', 0))
                edges.append(e)
            item[kind] = edges
        for kind in ('floors', 'holes'):
            item[kind] = [dict(vertices=indices(p['vertices']), parameters=params(p.get('parameters', {})))
                          for p in level.get(kind, [])]
        item['models'] = [dict(id=i, name=m.get('name', m['model_name']), model=m['model_name'],
                               position=[*project(key, [m['x'], m['y']]), elevation+number(m.get('z', 0))],
                               yaw=number(m['yaw'])+transforms[key]['rotation'], source=m,
                               representation='position-marker-only')
                          for i, m in enumerate(level.get('models', []))]
        item['fiducials'] = [dict(name=f[2], position=project(key, f)) for f in level.get('fiducials', [])]
        if 'drawing' in level:
            filename = safe_filename(level['drawing']['filename'])
            image = ASSETS / 'source' / map_id / filename
            if not image.is_file():
                raise ValueError('Missing source image')
            item['drawing'] = f'/assets/maps/rmf/source/{map_id}/{filename}'
        # Bounds include structural vertices, navigation and placed model anchors.
        points = [[v['x'], v['y']] for v in vertices] + [m['position'][:2] for m in item['models']]
        if not points:
            raise ValueError('Empty map')
        xmin, ymin = [min(p[i] for p in points) for i in (0, 1)]
        xmax, ymax = [max(p[i] for p in points) for i in (0, 1)]
        pad = max(xmax-xmin, ymax-ymin)*.04 + 1
        item['bounds'] = dict(x=xmin-pad, y=ymin-pad, w=xmax-xmin+2*pad, h=ymax-ymin+2*pad)
        item['graphs'] = sorted(set(e['graph'] for e in item['lanes']))
        out.append(item)
    lifts = []
    for key, lift in data.get('lifts', {}).items():
        floor = lift.get('reference_floor_name', ref_id)
        served = list(lift.get('level_doors', {}))
        if floor not in levels or any(k not in levels for k in served):
            raise ValueError('Unknown lift floor')
        width, depth = number(lift['width']), number(lift['depth'])
        if min(width, depth) <= 0:
            raise ValueError('Invalid lift dimensions')
        lifts.append(dict(id=key, position=project(floor, [lift['x'], lift['y']]),
                          width=width, depth=depth, yaw=number(lift['yaw']),
                          levels=served, source=lift))
    result = dict(schemaVersion=1, id=map_id, source=source, units=dict(length='m', angle='rad'),
                  coordinateTransform=dict(source=cs, referenceLevel=ref_id), levels=out, lifts=lifts,
                  capabilities=dict(geometry=True, navigation=True, simulation=False, liveControl=False),
                  warnings=['STATIC_MAP_ONLY', 'EXTERNAL_MODELS_ARE_POSITION_MARKERS',
                            'WALL_DISPLAY_HEIGHT_2_5_M_NOT_CALIBRATED',
                            *(['CAMPUS_EXTERNAL_ENVIRONMENT_MESH_NOT_INCLUDED'] if map_id == 'campus' else [])])
    json.dumps(result, allow_nan=False)
    return result


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def build(output):
    # Parse and validate every source before replacing any generated output.
    results, catalog = {}, []
    for map_id, zh, en in MAPS:
        directory = ASSETS / 'source' / map_id
        files = {str(p.relative_to(ASSETS)): sha(p) for p in sorted(directory.iterdir()) if p.is_file()}
        source = dict(repository=REPO, revision=REV, license='Apache-2.0', files=files,
                      yaml=f'/assets/maps/rmf/source/{map_id}/{map_id}.building.yaml')
        data = yaml.safe_load((directory / f'{map_id}.building.yaml').read_text())
        result = convert(data, map_id, source)
        result['name'] = dict(zh=zh, en=en)
        results[f'{map_id}.json'] = result
        catalog.append(dict(id=map_id, name=result['name'], available=True, simulation=False,
                            url=f'/assets/maps/rmf/{map_id}.json',
                            levels=[x['id'] for x in result['levels']], source=source))
    catalog.append(dict(id='manufacturing_logistics', name=dict(zh='制造与物流', en='Manufacturing & Logistics'),
                        available=False, simulation=False, reason='SOURCE_NOT_AVAILABLE',
                        reference=f'{REPO}/issues/314#issuecomment-3043337631'))
    results['catalog.json'] = dict(schemaVersion=1, maps=catalog)
    output.mkdir(parents=True, exist_ok=True)
    for name, result in results.items():
        (output / name).write_text(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False)+'\n')
    print(f'Generated {len(catalog)-1} maps; sixth explicitly unavailable: {output}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ASSETS)
    build(parser.parse_args().output)
