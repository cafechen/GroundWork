import { simulate } from './simulation.js';
import { ENGINE_VERSION } from './scenario.js';

export function compareRuns(baseline, candidate) {
  return { baseline:baseline.status,candidate:candidate.status,
    waitDelta:candidate.metrics.totalWait-baseline.metrics.totalWait,
    collisionDelta:candidate.metrics.collisionEpisodes-baseline.metrics.collisionEpisodes,
    durationDelta:candidate.metrics.duration-baseline.metrics.duration,
    regression:baseline.status==='PASS' && candidate.status!=='PASS' };
}

/** Six matched conditions; only policy changes between each baseline/candidate pair. */
export function runBatch(config) {
  const cases=[];
  for (const seed of [11,42]) for (const doorDelay of [0,8,18]) {
    const common={ ...config,seed,doorDelay };
    const baseline=simulate({ ...common,policy:'fifo' });
    const candidate=simulate({ ...common,policy:'none' });
    cases.push({ seed,doorDelay,baseline:{status:baseline.status,metrics:baseline.metrics},candidate:{status:candidate.status,metrics:candidate.metrics},comparison:compareRuns(baseline,candidate) });
  }
  return { schemaVersion:1,engineVersion:ENGINE_VERSION,config:{...config},baselinePolicy:'fifo',candidatePolicy:'none',cases,
    summary:{runs:cases.length*2,regressions:cases.filter(c=>c.comparison.regression).length,
      baselinePass:cases.filter(c=>c.baseline.status==='PASS').length,candidatePass:cases.filter(c=>c.candidate.status==='PASS').length} };
}

const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function htmlReport(run, batch=null) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>GroundWork report</title><style>body{font:16px system-ui;max-width:960px;margin:48px auto;padding:24px;color:#192d28}table{border-collapse:collapse;width:100%}td,th{text-align:left;border-bottom:1px solid #ddd;padding:10px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f5f0;padding:16px}</style><h1>GroundWork · Run report / 实验报告</h1><p>Prototype / 原型 · Engine ${escape(run.engineVersion)} · ${escape(run.status)}</p><p>Synthetic scene, sampled geometry and simplified planar kinematics. Not a safety certification. / 合成场景、离散几何检测与简化平面运动学，不构成安全认证。</p><h2>Metrics / 指标</h2><pre>${escape(JSON.stringify(run.metrics,null,2))}</pre><h2>Reproduction config / 复现配置</h2><pre>${escape(JSON.stringify(run.scenario.config,null,2))}</pre><h2>Events / 事件</h2><table><tr><th>t (s)</th><th>Event</th><th>Vehicle</th><th>Detail</th></tr>${run.events.map(e=>`<tr><td>${e.t}</td><td>${escape(e.type)}</td><td>${escape(e.vehicle)}</td><td>${escape(e.detail)}</td></tr>`).join('')}</table>${batch?`<h2>Matched regression / 配对回归</h2><pre>${escape(JSON.stringify(batch,null,2))}</pre>`:''}</html>`;
}
