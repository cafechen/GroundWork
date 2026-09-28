import test from 'node:test';
import assert from 'node:assert/strict';
import { rectangle, intersects, polygonDistance, obstaclePolygon } from '../src/core/geometry.js';
import { DEFAULT_CONFIG, PRESETS, makeScenario, parseScenario, validateConfig } from '../src/core/scenario.js';
import { simulate } from '../src/core/simulation.js';
import { runBatch, compareRuns, htmlReport } from '../src/core/experiments.js';

test('SAT: overlap, separated, touching and rotated rectangles',()=>{
  const a=rectangle(0,0,2,2);
  assert.equal(intersects(a,rectangle(0.5,0,2,2)),true);
  assert.equal(intersects(a,rectangle(4,0,2,2)),false);
  assert.equal(intersects(a,rectangle(2,0,2,2)),true);
  assert.equal(intersects(a,rectangle(0,0,3,0.5,Math.PI/4)),true);
  assert.equal(polygonDistance(a,rectangle(4,0,2,2)),2);
  assert.equal(polygonDistance(a,a),0);
});
test('scenario rejects invalid and non-finite inputs',()=>{
  for(const invalid of [{speed:NaN},{seed:1.5},{vehicleCount:1.5},{policy:'random'},{dt:0},{duration:1},{speed:Infinity},{trailerLength:100}]) {
    assert.throws(()=>makeScenario(invalid));
  }
  assert.deepEqual(validateConfig(DEFAULT_CONFIG),[]);
});
test('configuration-only scene round trip and schema validation',()=>{
  const scene=makeScenario(PRESETS.tight);
  assert.deepEqual(parseScenario(JSON.stringify(scene)),scene);
  assert.throws(()=>parseScenario('{'));
  assert.throws(()=>parseScenario('{"schemaVersion":2}'));
});
test('fixed seed/config produces identical frames, events and results',()=>{
  assert.deepEqual(simulate(),simulate());
});
test('baseline completes both jobs without sampled contact',()=>{
  const result=simulate();
  assert.equal(result.status,'PASS');
  assert.equal(result.metrics.completed,2);
  assert.equal(result.metrics.collisionEpisodes,0);
  assert.ok(result.metrics.minClearance>0);
  assert.ok(result.frames.some(f=>f.vehicles.some(v=>v.speed>0)));
  assert.ok(result.frames.some(f=>f.vehicles.some(v=>v.state==='waiting')));
});
test('resource remains owned until all tractor/trailer/drawbar bodies clear',()=>{
  const result=simulate(), region=obstaclePolygon(result.scenario.resource);
  const release=result.events.find(e=>e.type==='resource.released'&&e.vehicle==='TUG-01');
  assert.ok(release);
  const index=result.frames.findIndex(f=>f.t===release.t);
  const previous=result.frames[index-1];
  assert.equal(previous.owner,'TUG-01');
  assert.ok(previous.vehicles[0].bodies.some(b=>intersects(b.polygon,region)));
  assert.ok(result.frames[index].vehicles[0].bodies.every(b=>!intersects(b.polygon,region)));
  for(const f of result.frames) {
    const occupants=f.vehicles.filter(v=>v.bodies.some(b=>intersects(b.polygon,region)));
    assert.ok(occupants.length<=1,`Overlapping resource occupants at ${f.t}`);
    if(occupants.length) assert.equal(f.owner,occupants[0].id);
  }
});
test('tight turn causes trailer contact, not a fabricated preset score',()=>{
  const result=simulate(PRESETS.tight);
  assert.equal(result.status,'FAIL');
  assert.ok(result.events.some(e=>e.type==='collision'&&e.detail.includes('TUG-01-T')));
  assert.ok(simulate({...PRESETS.tight,aisleWidth:8}).metrics.collisionEpisodes<result.metrics.collisionEpisodes);
});
test('disabling mutual exclusion reveals inter-vehicle contacts',()=>{
  const result=simulate({policy:'none'});
  assert.equal(result.status,'FAIL');
  assert.ok(result.events.some(e=>e.type==='collision'&&e.detail.includes('FLT-02')));
  assert.ok(result.frames.every(f=>f.owner===null && f.queue.length===0));
});
test('door delay adds explainable wait, never grants closed-door entry',()=>{
  const baseline=simulate(), delayed=simulate(PRESETS.delay);
  assert.ok(delayed.metrics.totalWait>baseline.metrics.totalWait);
  assert.ok(delayed.events.some(e=>e.type==='vehicle.waiting'&&e.detail==='door'));
  assert.ok(delayed.events.filter(e=>e.type==='resource.acquired').every(e=>e.t>=18));
});
test('one-vehicle and timeout paths are supported',()=>{
  assert.equal(simulate({vehicleCount:1}).metrics.completed,1);
  const timed=simulate({duration:10,doorDelay:60});
  assert.equal(timed.status,'FAIL');
  assert.ok(timed.events.some(e=>e.type==='run.timeout'));
});
test('all recorded positions and headings stay finite',()=>{
  for(const config of Object.values(PRESETS)) for(const f of simulate(config).frames) for(const v of f.vehicles)
    for(const key of ['x','y','yaw','trailerYaw','speed','steering']) assert.ok(Number.isFinite(v[key]));
});
test('batch runs six matched pairs and detects regressions',()=>{
  const batch=runBatch(DEFAULT_CONFIG);
  assert.equal(batch.cases.length,6);assert.equal(batch.summary.runs,12);
  assert.equal(batch.summary.baselinePass,6);assert.ok(batch.summary.regressions>0);
  const a=simulate(),b=simulate({policy:'none'});
  assert.equal(compareRuns(a,b).regression,true);
});
test('portable HTML report escapes data and contains provenance',()=>{
  const run=simulate();run.events.push({t:0,type:'<script>alert(1)</script>',vehicle:'',detail:''});
  const html=htmlReport(run);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('Reproduction config'));
});
