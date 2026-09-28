import { messages } from './i18n.js';
import { DEFAULT_CONFIG, PRESETS, parseScenario } from './core/scenario.js';
import { simulate } from './core/simulation.js';
import { runBatch, htmlReport } from './core/experiments.js';

const app=document.querySelector('#app');
let lang='zh', active=0, config={...DEFAULT_CONFIG}, run=simulate(config), frameIndex=0;
let playing=false, playbackRate=2, sweep=false, batch=null, busy=false, notice='', lastTime=0, accumulator=0;
const tr=()=>messages[lang];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,d=1)=>Number(n).toFixed(d);
const icons={
  scene:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17h7m-3-3v7"/>',
  motion:'<path d="M3 16V9h10l3 7H3Zm13-5h4l2 5h-6"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  traffic:'<path d="M3 8h14m-4-4 4 4-4 4M21 16H7m4-4-4 4 4 4"/>',
  experiments:'<path d="M8 3h8m-6 0v6L4 19q-1 2 2 2h12q3 0 2-2L14 9V3M7 15h10"/>',
  play:'<path d="m8 5 11 7-11 7Z"/>',download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  reset:'<path d="M5 4v16m14-16L7 12l12 8Z"/>',chevron:'<path d="m9 5 7 7-7 7"/>',
};
const icon=(key)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[key]||icons.scene}</svg>`;
const badge=status=>`<span class="badge ${status.toLowerCase()}">${esc(status)}</span>`;
function range(key,label,min,max,step,unit) { return `<label class="field"><span>${label}<output>${config[key]} ${unit}</output></span><input type="range" data-config="${key}" min="${min}" max="${max}" step="${step}" value="${config[key]}" aria-label="${label}"></label>`; }
function sideContent() {
  const t=tr();
  if(active===0) return `<div class="panel-heading"><span class="letter">A</span><h2>${t.configuration}</h2></div>
    ${range('aisleWidth',t.aisle,2.4,8,0.2,'m')}
    <label class="field"><span>${t.seed}</span><input type="number" min="1" max="1000000" step="1" data-config="seed" value="${config.seed}"></label>
    <label class="field"><span>${t.fleet}</span><select data-config="vehicleCount"><option value="2" ${config.vehicleCount===2?'selected':''}>${t.two}</option><option value="1" ${config.vehicleCount===1?'selected':''}>${t.one}</option></select></label>
    <p class="help">${t.sceneNote}</p><hr><h3>${t.tasks}</h3><div class="task-card"><span class="vehicle-dot tug"></span><div><strong>${t.task1}</strong><small>${t.route1}</small></div></div>${config.vehicleCount===2?`<div class="task-card"><span class="vehicle-dot forklift"></span><div><strong>${t.task2}</strong><small>${t.route2}</small></div></div>`:''}
    <div class="side-actions"><button data-action="import">${t.import}</button><button data-action="scene-export">${t.export}</button></div>`;
  if(active===1) return `<div class="panel-heading"><span class="letter">B</span><h2>${t.configuration}</h2></div>${range('speed',t.speed,0.4,2.5,0.1,'m/s')}${range('trailerLength',t.trailer,2,5,0.1,'m')}
    <div class="vehicle-diagram"><svg viewBox="0 0 250 92" role="img" aria-label="Tractor with a single trailer"><rect x="17" y="26" width="68" height="39" rx="5" fill="#d3dce0" stroke="#607e8c"/><path d="M85 45h49" stroke="#607e8c" stroke-width="3"/><rect x="134" y="20" width="93" height="51" rx="6" fill="#24705b"/><rect x="185" y="25" width="20" height="41" rx="3" fill="#b8d0c5"/><path d="M45 78h109m-109-4v8m109-8v8" stroke="#7d8b85"/><text x="99" y="90" text-anchor="middle" fill="#56665f" font-size="10">${config.trailerLength} m</text></svg></div>
    <p class="help">${t.motionNote}</p><hr><h3>${t.model}</h3><p class="help">${t.modelText}</p><div class="detail-row"><span>${t.dt}</span><strong>${config.dt} s</strong></div><p class="help">${t.dtNote}</p>`;
  if(active===2) return `<div class="panel-heading"><span class="letter">C</span><h2>${t.configuration}</h2></div><label class="field"><span>${t.policy}</span><select data-config="policy"><option value="fifo" ${config.policy==='fifo'?'selected':''}>${t.fifo}</option><option value="none" ${config.policy==='none'?'selected':''}>${t.none}</option></select></label>${range('doorDelay',t.door,0,60,1,'s')}<p class="help">${t.logicNote}</p><hr><h3>${t.resource}</h3><div id="resource-details"></div>`;
  return `<div class="panel-heading"><span class="letter">D</span><h2>${t.runStatus}</h2></div><div class="result-row">${badge(run.status)}<span>${run.frames.length} ${t.frames}</span></div><div class="detail-row"><span>${t.duration}</span><strong>${fmt(run.metrics.duration)} s</strong></div><div class="detail-row"><span>${t.tracking}</span><strong>${fmt(run.metrics.maxTrackingError,2)} m</strong></div><div class="detail-row"><span>${t.dt}</span><strong>${config.dt} s</strong></div><hr><h3>${t.evidence}</h3><p class="help">${t.evidenceText}</p><div class="stack-actions"><button data-action="run-export">${icon('download')}${t.download}</button><button data-action="report">${icon('download')}${t.report}</button><button class="primary" data-action="batch" ${busy?'disabled':''}>${busy?t.batchBusy:t.batch}</button></div>`;
}

function render() {
  const t=tr(); document.documentElement.lang=lang==='zh'?'zh-CN':'en';
  const preset=Object.entries(PRESETS).find(([,v])=>JSON.stringify(v)===JSON.stringify(config))?.[0]||'custom';
  app.innerHTML=`<aside class="sidebar"><a class="brand" href="#" aria-label="GroundWork home"><img src="/assets/mark.svg" alt="" width="34" height="34"><span>Ground<span class="brand-light">Work</span></span></a><p class="tagline">${t.tagline}</p>
    <div class="workspace"><small>${t.workspace}</small><strong><span class="workspace-symbol">G</span>${t.project}</strong><span class="workspace-caption"><i></i>${t.local}</span></div>
    <nav aria-label="Modules">${t.modules.map((name,i)=>`<button class="nav-item ${active===i?'active':''}" data-module="${i}" aria-label="${name}" aria-current="${active===i?'page':'false'}">${icon(['scene','motion','traffic','experiments'][i])}<span>${name}</span><small>${'ABCD'[i]}</small></button>`).join('')}</nav>
    <div class="sidebar-bottom"><div class="ground-wordmark">ground.</div><p>${t.scope}</p><span class="version">${t.prototype}</span></div></aside>
    <div class="main-shell"><header class="topbar"><div class="breadcrumb">${t.workspace}<span>/</span><strong>${t.modules[active]}</strong></div><div class="top-actions"><span class="local-indicator"><i></i>${t.local}</span><button class="language" data-action="language" aria-label="Switch language">${lang==='zh'?'EN':'中文'}</button><a href="https://github.com/cafechen/GroundWork" target="_blank" rel="noreferrer">GitHub ↗</a></div></header>
    <main><section class="page-heading"><div><div class="eyebrow">${t.eyebrow[active]}</div><h1>${t.title[active]}</h1><p>${t.subtitle[active]}</p></div><button class="primary run-button" data-action="run">${icon('play')}${t.run}</button></section>
    <div class="scenario-bar"><label for="preset">${t.preset}</label><select id="preset">${preset==='custom'?`<option value="custom">${lang==='zh'?'自定义配置':'Custom configuration'}</option>`:''}${Object.keys(PRESETS).map((key,i)=>`<option value="${key}" ${preset===key?'selected':''}>${t.presets[i]}</option>`).join('')}</select><span class="scenario-id">crossing-yard / v1</span><span class="synthetic-label">${t.synthetic}</span></div>
    <div id="notice" class="notice" role="status" ${notice?'':'hidden'}>${esc(notice)}</div>
    <section class="workbench"><div class="visual-column"><div class="map-card"><div class="map-heading"><h2>${t.map}</h2><div class="map-tools"><label><input type="checkbox" id="sweep" ${sweep?'checked':''}>${t.sweep}</label><span>${t.plan}</span></div></div><div id="map" class="map"></div><div class="map-footer"><div class="legend"><span><i class="route-line"></i>${t.legendRoute}</span><span><i class="body-square"></i>${t.legendBody}</span><span><i class="resource-square"></i>${t.legendResource}</span></div><span id="playback-status"></span></div></div>
    <div class="replay"><button class="icon-button" data-action="reset" aria-label="${t.reset}">${icon('reset')}</button><button class="play-button" data-action="play" aria-label="${playing?t.pause:t.play}">${playing?'Ⅱ':'▶'}</button><div class="timeline"><div class="timeline-label"><span>${t.transport}</span><span id="time-label"></span></div><input id="timeline" type="range" min="0" max="${run.frames.length-1}" value="${frameIndex}" step="1" aria-label="${t.timeline}"></div><select id="playback-rate" aria-label="Playback speed">${[1,2,4,8].map(v=>`<option value="${v}" ${playbackRate===v?'selected':''}>${v}×</option>`).join('')}</select></div>
    <div class="metrics" aria-label="${t.summary}"><div class="metric"><span>${t.completed}</span><strong>${run.metrics.completed}<small> / ${run.metrics.total}</small></strong></div><div class="metric"><span>${t.contacts}</span><strong class="${run.metrics.collisionEpisodes?'danger-text':''}">${run.metrics.collisionEpisodes}</strong></div><div class="metric"><span>${t.clearance}</span><strong>${fmt(run.metrics.minClearance,2)}<small> m</small></strong></div><div class="metric"><span>${t.wait}</span><strong>${fmt(run.metrics.totalWait)}<small> s</small></strong></div><span class="metric-caption">${t.summary} · ${run.status}</span></div></div>
    <aside class="inspector">${sideContent()}</aside></section>
    ${active===3?`<section class="batch-panel"><div class="section-heading"><div><h2>${t.batchTitle}</h2><p>${t.batchIntro}</p></div>${batch?`<span class="badge ${batch.summary.regressions?'fail':'pass'}">${batch.summary.regressions} / 6 ${t.regression}</span>`:''}</div>${batch?`<div class="table-wrap"><table><thead><tr><th>${t.condition}</th><th>${t.baseline}</th><th>${t.candidate}</th><th>Δ ${t.wait} (s)</th><th></th></tr></thead><tbody>${batch.cases.map((c,i)=>`<tr><td>${c.seed} / ${c.doorDelay} s</td><td>${badge(c.baseline.status)}</td><td>${badge(c.candidate.status)}</td><td>${fmt(c.comparison.waitDelta)}</td><td><button class="text-button" data-case="${i}">${t.inspect} ↗</button></td></tr>`).join('')}</tbody></table></div>`:`<p class="empty-state">${t.noBatch}</p>`}</section>`:''}
    <section class="details-grid"><div class="events-panel"><div class="section-heading"><h2>${t.events}</h2><span class="subtle">${t.current}</span></div><div id="events"></div></div><div class="tasks-panel"><div class="section-heading"><h2>${t.tasks}</h2><span class="subtle">${t.current}</span></div><div id="tasks"></div></div></section>
    <footer class="page-footer"><span>${t.units}</span><span>GroundWork · ${run.engineVersion}</span></footer></main></div><input type="file" id="file-import" accept=".json,application/json" hidden>`;
  updateFrame();
}

const points=poly=>poly.map(p=>`${fmt(p.x,3)},${fmt(28-p.y,3)}`).join(' ');
function drawMap(frame) {
  const s=run.scenario,t=tr();
  const grid=Array.from({length:21},(_,i)=>`<path d="M${i*2} 0V28"/>`).join('')+Array.from({length:15},(_,i)=>`<path d="M0 ${i*2}H40"/>`).join('');
  const paths=s.routes.slice(0,config.vehicleCount).map((route,i)=>`<polyline points="${points(route)}" fill="none" stroke="${i?'#a68654':'#408b78'}" stroke-width=".075" stroke-dasharray=".28 .23"/>`).join('');
  const trails=run.frames.filter((_,i)=>i<=frameIndex && i%5===0).flatMap(f=>f.vehicles.map(v=>({x:v.x,y:v.y,id:v.id}))).reduce((acc,p)=>{(acc[p.id]??=[]).push(p);return acc;},{});
  const trailLines=Object.entries(trails).map(([id,p])=>`<polyline points="${points(p)}" fill="none" stroke="${id==='TUG-01'?'#2b715d':'#ba8b42'}" stroke-width=".10" opacity=".55"/>`).join('');
  const footprints=sweep?run.frames.filter((_,i)=>i<=frameIndex&&i%10===0).map(f=>f.vehicles.map(v=>v.bodies.filter(b=>b.kind!=='drawbar').map(b=>`<polygon points="${points(b.polygon)}" fill="${v.kind==='tug'?'#2b715d':'#b98c4d'}" fill-opacity=".025" stroke="${v.kind==='tug'?'#2b715d':'#b98c4d'}" stroke-opacity=".14" stroke-width=".035"/>`).join('')).join('')).join(''):'';
  const vehicleMarkup=frame.vehicles.map(v=>{
    const body=v.bodies.map(b=>{
      const contact=frame.contacts.some(c=>c.split('/').includes(b.id));
      return `<polygon points="${points(b.polygon)}" fill="${contact?'#c15e48':b.kind==='drawbar'?'#77928a':b.kind==='trailer'?'#bdd1c7':v.kind==='tug'?'#286e59':'#bf9453'}" stroke="${contact?'#922f24':v.kind==='tug'?'#245444':'#886939'}" stroke-width=".08"/>`;
    }).reverse().join('');
    const arrowX=v.x+1.3*Math.cos(v.yaw),arrowY=v.y+1.3*Math.sin(v.yaw);
    return `${body}<circle cx="${arrowX}" cy="${28-arrowY}" r=".18" fill="#edf5ee"/><g transform="translate(${v.x},${28-v.y-2.2})"><rect x="-1.9" y="-.65" width="3.8" height=".95" rx=".22" fill="#fff" opacity=".93"/><text text-anchor="middle" font-size=".52" font-weight="600" fill="#304f43">${v.id}</text></g>`;
  }).join('');
  return `<svg viewBox="-1 -1 42 30" role="img" aria-label="${t.map}, ${fmt(frame.t)} s"><defs><pattern id="rack-hatch" width=".6" height=".6" patternUnits="userSpaceOnUse"><path d="M0 .6.6 0" stroke="#ccd2c7" stroke-width=".035"/></pattern></defs><rect x="0" y="0" width="40" height="28" rx=".4" fill="#f1f3eb"/><g stroke="#dfe4d9" stroke-width=".025">${grid}</g><path d="M2 20H35V3M20 26V5H4" stroke="#fff" stroke-width="4.6" fill="none"/><rect x="17" y="17" width="6" height="6" rx=".3" fill="${frame.owner?'#e5d7ad':'#dce8cf'}" fill-opacity=".58" stroke="#b1bc92" stroke-width=".08" stroke-dasharray=".25 .15"/><text x="17.25" y="17.6" font-size=".46" fill="#788060">J-01</text>
    ${s.obstacles.map(o=>`<g><rect x="${o.x}" y="${28-o.y-o.h}" width="${o.w}" height="${o.h}" rx=".12" fill="${o.id.startsWith('R')?'#dde2d6':'#8d998e'}" stroke="#b9c3b3" stroke-width=".06"/>${o.id.startsWith('R')?`<rect x="${o.x}" y="${28-o.y-o.h}" width="${o.w}" height="${o.h}" fill="url(#rack-hatch)"/><text x="${o.x+o.w/2}" y="${28-o.y-o.h/2+.15}" text-anchor="middle" font-size=".6" fill="#819079">${o.id}</text>`:''}</g>`).join('')}
    ${paths}${footprints}${trailLines}${s.stations.slice(0,config.vehicleCount===1?2:4).map(st=>`<circle cx="${st.x}" cy="${28-st.y}" r=".3" fill="#f8faf6" stroke="#83927e" stroke-width=".08"/><text x="${st.x+.5}" y="${28-st.y+.2}" font-size=".45" fill="#82907b">${st.id}</text>`).join('')}
    <g stroke="${frame.doorOpen?'#80a992':'#c66c4b'}" stroke-width=".16" stroke-dasharray="${frame.doorOpen?'.2 .2':'none'}"><path d="M17 17V23M17 23H23"/></g><text x="23.25" y="23.65" font-size=".43" fill="#86917d">D-01</text>${vehicleMarkup}
    <g transform="translate(37 2)" fill="#748371"><text x="0" y="-.3" text-anchor="middle" font-size=".55">N</text><path d="m0 0-.3 1H.3Z"/></g><g transform="translate(34 26)" stroke="#84917c" stroke-width=".07"><path d="M0 0h4M0-.2v.4M4-.2v.4"/><text x="2" y="-.4" text-anchor="middle" font-size=".45" stroke="none" fill="#748371">4 m</text></g></svg>`;
}

function updateFrame() {
  const f=run.frames[frameIndex],t=tr();
  document.querySelector('#map').innerHTML=drawMap(f);
  document.querySelector('#timeline').value=frameIndex;
  document.querySelector('#time-label').textContent=`${fmt(f.t)} / ${fmt(run.metrics.duration)} s`;
  document.querySelector('#playback-status').textContent=`${playing?'●':'○'} ${playing?t.live:t.idle}`;
  const play=document.querySelector('[data-action="play"]'); play.textContent=playing?'Ⅱ':'▶';play.setAttribute('aria-label',playing?t.pause:t.play);
  const list=run.events.filter(e=>e.t<=f.t).reverse();
  document.querySelector('#events').innerHTML=list.length?list.map(e=>`<button class="event-row ${e.type==='collision'?'contact-event':''}" data-time="${e.t}"><time>${fmt(e.t)} s</time><span class="event-dot"></span><span>${esc(t.eventNames[e.type]||e.type)}</span><small>${esc(e.vehicle||e.detail)}</small></button>`).join(''):`<p class="help">${t.eventEmpty}</p>`;
  const stateName=v=>v.state==='completed'?t.completedState:t[v.state];
  document.querySelector('#tasks').innerHTML=f.vehicles.map(v=>`<div class="task-status"><div><span class="vehicle-dot ${v.kind}"></span><strong>${v.id}</strong><span class="task-state ${v.state}">${stateName(v)}</span></div><small>${v.reason==='door'?t.doorReason:v.reason==='resource'?t.resourceReason:`x ${fmt(v.x)} · y ${fmt(v.y)} m · ${fmt(v.speed)} m/s`}</small></div>`).join('');
  const details=document.querySelector('#resource-details');
  if(details) details.innerHTML=`<div class="detail-row"><span>${t.owner}</span><strong>${f.owner||t.available}</strong></div><div class="detail-row"><span>${t.queue}</span><strong>${f.queue.join(', ')||t.empty}</strong></div><div class="detail-row"><span>${t.doorState}</span><strong class="${f.doorOpen?'':'danger-text'}">${f.doorOpen?t.open:t.closed}</strong></div>`;
}

function compute(autoplay=false, preserveBatch=false) {
  run=simulate(config);frameIndex=0;playing=autoplay;accumulator=0;lastTime=0;
  if(!preserveBatch) batch=null;
  notice=''; render();
}

function download(name,content,type='application/json') {
  const url=URL.createObjectURL(new Blob([content],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

app.addEventListener('click',async event=>{
  const button=event.target.closest('button');
  if(!button) return;
  if(button.dataset.module!==undefined) {active=Number(button.dataset.module);render();return;}
  if(button.dataset.time!==undefined) {playing=false;frameIndex=run.frames.findIndex(f=>f.t>=Number(button.dataset.time));if(frameIndex<0)frameIndex=run.frames.length-1;updateFrame();return;}
  if(button.dataset.case!==undefined) {const c=batch.cases[Number(button.dataset.case)];config={...batch.config,seed:c.seed,doorDelay:c.doorDelay,policy:'none'};compute(false,true);return;}
  const action=button.dataset.action;
  if(action==='language'){lang=lang==='zh'?'en':'zh';render();}
  if(action==='run') compute(true);
  if(action==='reset'){playing=false;frameIndex=0;accumulator=0;updateFrame();}
  if(action==='play'){if(frameIndex===run.frames.length-1)frameIndex=0;playing=!playing;lastTime=0;updateFrame();}
  if(action==='scene-export') download('groundwork-scene.json',JSON.stringify({schemaVersion:1,id:run.scenario.id,config},null,2));
  if(action==='run-export') download('groundwork-run.json',JSON.stringify(run));
  if(action==='report') download('groundwork-report.html',htmlReport(run,batch),'text/html');
  if(action==='import') document.querySelector('#file-import').click();
  if(action==='batch') {
    playing=false;busy=true;render();
    setTimeout(()=>{try{batch=runBatch(config);}catch(error){notice=error.message;}finally{busy=false;render();}},30);
  }
});

app.addEventListener('input',event=>{
  const el=event.target;
  if(el.id==='timeline'){playing=false;frameIndex=Number(el.value);accumulator=0;updateFrame();}
  if(el.dataset.config && el.type==='range') el.closest('label').querySelector('output').textContent=`${el.value} ${el.dataset.config==='speed'?'m/s':el.dataset.config==='doorDelay'?'s':'m'}`;
});
app.addEventListener('change',async event=>{
  const el=event.target;
  if(el.id==='preset' && PRESETS[el.value]) {config={...PRESETS[el.value]};compute();}
  if(el.id==='sweep'){sweep=el.checked;updateFrame();}
  if(el.id==='playback-rate') playbackRate=Number(el.value);
  if(el.dataset.config){
    const old=config;config={...config,[el.dataset.config]:el.dataset.config==='policy'?el.value:Number(el.value)};
    try{compute();}catch(error){config=old;notice=error.message;render();}
  }
  if(el.id==='file-import' && el.files[0]) {
    try {
      if(el.files[0].size>1024*1024)throw new Error(tr().errorFile);
      config=parseScenario(await el.files[0].text()).config;compute();notice=tr().notice;render();
    }catch(error){notice=`${tr().error}: ${error.message}`;render();}
  }
});

function tick(now) {
  if(playing){
    if(lastTime) accumulator+=Math.min((now-lastTime)/1000,0.2)*playbackRate;
    if(accumulator>=config.dt){
      const steps=Math.floor(accumulator/config.dt);accumulator-=steps*config.dt;
      frameIndex=Math.min(run.frames.length-1,frameIndex+steps);
      if(frameIndex===run.frames.length-1)playing=false;
      updateFrame();
    }
  }
  lastTime=now;requestAnimationFrame(tick);
}
render();requestAnimationFrame(tick);
