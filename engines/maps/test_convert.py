import json
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as E
from convert import convert

class ConversionTests(unittest.TestCase):
    def fixture(self, directory, local=True, building=False):
        line=[[0,0],[20,0]] if local else [[116,40],[116.001,40]]
        features=[{'type':'Feature','properties':{'layer':'centerline','widthM':4},'geometry':{'type':'LineString','coordinates':line}}]
        if building:features.append({'type':'Feature','properties':{'kind':'building','heightM':3},'geometry':{'type':'Polygon','coordinates':[[[5,-2],[10,-2],[10,2],[5,2],[5,-2]]]}})
        source=directory/'input.json';source.write_text(json.dumps({'type':'FeatureCollection','properties':{'coordinateSystem':'local-metres'} if local else {},'features':features}));return source
    def test_local_direction_and_obstacle_semantics(self):
        with tempfile.TemporaryDirectory(prefix='groundwork-map-') as temp:
            root=Path(temp);source=self.fixture(root,building=True);out=root/'output';report=convert(source,out)
            self.assertEqual(len(report['conflicts']),1)
            graph=json.loads((out/'nav_graph.json').read_text());self.assertEqual(len(graph['levels']['L1']['lanes']),5)
            tree=E.parse(out/'scene.sdf');self.assertEqual(len(tree.findall(".//model[@name='unconfirmed-1']//collision")),0)
            self.assertTrue((out/'assets/unconfirmed-1.dae').exists())
            self.assertNotIn(str(root),(out/'scene.sdf').read_text())
            with self.assertRaises(FileExistsError):convert(source,out)
    def test_explicit_projection_and_no_double_transform(self):
        with tempfile.TemporaryDirectory(prefix='groundwork-map-') as temp:
            root=Path(temp);source=self.fixture(root,local=False)
            with self.assertRaises(ValueError):convert(source,root/'missing-origin')
            convert(source,root/'projected',[116,40]);data=json.loads((root/'projected/roads.local.geojson').read_text());xy=data['features'][0]['geometry']['coordinates'];self.assertAlmostEqual(xy[0][0],0,places=6);self.assertTrue(85<xy[1][0]<86)
            source=self.fixture(root,local=True)
            with self.assertRaises(ValueError):convert(source,root/'double-transform',[116,40])

if __name__=='__main__':unittest.main()
