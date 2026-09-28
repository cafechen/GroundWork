"""Portable extraction of Robots' GeoJSON -> SDF/RMF converter.

No private map, office world, vehicle model or source checkout is required.
Input: local-metres GeoJSON, or WGS84 with explicit --origin LON LAT.
Polygons must have an explicit kind=building; unclassified geometry is not
silently promoted to physical obstacles. Heights are explicit assumptions.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import xml.etree.ElementTree as E
from pyproj import CRS, Transformer
from shapely.geometry import shape
from shapely.ops import transform, unary_union, triangulate
from shapely.geometry.polygon import orient

def sub(parent, tag, text=None, **attrs):
    node=E.SubElement(parent,tag,attrs)
    if text is not None: node.text=str(text)
    return node

def polys(geometry):
    if geometry.geom_type=='Polygon': return [geometry]
    return [p for g in getattr(geometry,'geoms',[]) for p in polys(g)]

def mesh(name, geometry, height, output, world, collision=True):
    # Source algorithm preserves polygon holes and nonconvex footprints.
    vertices=[]
    for polygon in polys(geometry.buffer(0)):
        polygon=orient(polygon,1)
        for triangle in triangulate(polygon):
            if polygon.covers(triangle):
                vertices.extend((x,y,height) for x,y in list(orient(triangle,1).exterior.coords)[:3])
        if height:
            for ring in [polygon.exterior,*polygon.interiors]:
                for a,b in zip(ring.coords,list(ring.coords)[1:]):
                    vertices.extend([(*a,0),(*b,0),(*b,height),(*a,0),(*b,height),(*a,height)])
    if not vertices: return
    data=' '.join(f'{v:.6f}' for point in vertices for v in point)
    indexes=' '.join(str(i) for i in range(len(vertices)))
    dae=f'<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1"><asset><unit meter="1"/><up_axis>Z_UP</up_axis></asset><library_geometries><geometry id="geom"><mesh><source id="pos"><float_array id="data" count="{len(vertices)*3}">{data}</float_array><technique_common><accessor source="#data" count="{len(vertices)}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source><vertices id="vertices"><input semantic="POSITION" source="#pos"/></vertices><triangles count="{len(vertices)//3}"><input semantic="VERTEX" source="#vertices" offset="0"/><p>{indexes}</p></triangles></mesh></geometry></library_geometries><library_visual_scenes><visual_scene id="scene"><node><instance_geometry url="#geom"/></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#scene"/></scene></COLLADA>'
    (output/'assets'/f'{name}.dae').write_text(dae)
    model=sub(world,'model',name=name);sub(model,'static','true');link=sub(model,'link',name='geometry')
    for tag in ['visual']+(['collision'] if collision else []):
        node=sub(link,tag,name=tag);sub(sub(sub(node,'geometry'),'mesh'),'uri',f'assets/{name}.dae')

def convert(source, output, origin=None):
    data=json.loads(source.read_text())
    if data.get('type')!='FeatureCollection': raise ValueError('FeatureCollection required')
    local=data.get('properties',{}).get('coordinateSystem')=='local-metres'
    if not local and origin is None: raise ValueError('WGS84 input requires explicit --origin LON LAT')
    if local and origin is not None: raise ValueError('Do not project local-metres input a second time')
    tf=None
    if origin:
        lon,lat=origin
        if not -180<=lon<=180 or not -90<=lat<=90: raise ValueError('Invalid WGS84 origin')
        crs=CRS.from_proj4(f'+proj=aeqd +lat_0={lat} +lon_0={lon} +datum=WGS84 +units=m')
        tf=Transformer.from_crs(4326,crs,always_xy=True)
    features=[]
    for i,f in enumerate(data['features']):
        g=shape(f['geometry']);g=transform(tf.transform,g) if tf else g
        if g.is_empty or not g.is_valid or not all(math.isfinite(v) and abs(v)<10000 for v in g.bounds):raise ValueError(f'Invalid/beyond 10 km geometry: {i}')
        features.append((i,f.get('properties',{}),g))
    centers=[(i,p,g) for i,p,g in features if g.geom_type=='LineString' and (p.get('layer')=='centerline' or ('layer' not in p and 'kind' not in p))]
    if not centers: raise ValueError('No centreline LineStrings')
    output.mkdir(parents=True,exist_ok=False);(output/'assets').mkdir()
    sdf=E.Element('sdf',version='1.9');world=sub(sdf,'world',name='groundwork');sub(world,'gravity','0 0 -9.81')
    floor=sub(world,'model',name='ground');sub(floor,'static','true');link=sub(floor,'link',name='floor')
    for tag in ['visual','collision']:
        plane=sub(sub(sub(link,tag,name=tag),'geometry'),'plane');sub(plane,'normal','0 0 1');sub(plane,'size','20000 20000')
    envelope=unary_union([g for _,_,g in centers]).buffer(1.2)
    conflicts=[];assumptions=[]
    for i,p,g in features:
        if p.get('kind')!='building':continue
        height=float(p.get('heightM',6));assert 0<height<=50
        if 'heightM' not in p:assumptions.append({'feature':i,'heightM':6,'reason':'default, not surveyed'})
        if g.intersects(envelope):
            conflicts.append({'feature':i,'handling':'outline only; obstacle semantics require review'})
            mesh(f'unconfirmed-{i}',g.boundary.buffer(.12),.02,output,world,False)
        else:mesh(f'building-{i}',g,height,output,world)
    vertices=[];lanes=[];provenance=[];local_features=[]
    def vertex(point):
        for index,v in enumerate(vertices):
            if math.dist(v[:2],point)<.20:return index
        index=len(vertices);vertices.append([float(point[0]),float(point[1]),{'name':f'wp_{index}'}]);return index
    for i,p,line in centers:
        distances=[0.,*range(4,math.ceil(line.length),4),line.length];ids=[]
        for d in distances:
            point=line.interpolate(d);ids.append(vertex((point.x,point.y)))
        for a,b in zip(ids,ids[1:]):
            if a==b:continue
            lanes.append([a,b,{}]);provenance.append({'from':a,'to':b,'source_feature':i})
        local_features.append({'type':'Feature','properties':{'id':f'road-{i}','widthM':float(p.get('widthM',4))},'geometry':{'type':'LineString','coordinates':list(line.coords)}})
    graph={'building_name':'GroundWork','levels':{'L1':{'vertices':vertices,'lanes':lanes}},'doors':{},'lifts':{}}
    report={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'frame':{'coordinateSystem':'local-metres','origin_wgs84':origin,'projection':'AEQD' if origin else 'none','axis':'x east, y north, z up'},'cad_transform_applied_again':False,'conflicts':conflicts,'assumptions':assumptions,'directed_edges':len(lanes),'notes':['Route direction preserved; connections merged only within 0.20 m','Graph export is not a running RMF integration','SDF meshes require downstream Gazebo validation','No measured vehicle or obstacle calibration']}
    for name,value in [('nav_graph.json',graph),('conversion_report.json',report),('lane_provenance.json',provenance),('roads.local.geojson',{'type':'FeatureCollection','properties':{'coordinateSystem':'local-metres','sourceFrame':report['frame']},'features':local_features})]:
        (output/name).write_text(json.dumps(value,ensure_ascii=False,indent=2))
    E.indent(sdf);E.ElementTree(sdf).write(output/'scene.sdf',encoding='unicode')
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('output',type=Path);parser.add_argument('--origin',nargs=2,type=float);args=parser.parse_args()
    print(json.dumps(convert(args.source,args.output,args.origin),indent=2))
