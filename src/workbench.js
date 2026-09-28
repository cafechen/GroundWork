import { Viewer } from "./viewer.js";
const app = document.querySelector("#app");
let selectionEpoch = 0,
  loadingId = null;
let lang = "zh",
  tab = 0,
  engine = "chrono",
  cap = null,
  run = null,
  jobId = null,
  jobs = [],
  playing = false,
  index = 0,
  mode = "3d",
  viewer = null,
  plan = null,
  mapInput = null,
  selected = new Set(),
  busy = false;
const t = (zh, en) => (lang === "zh" ? zh : en);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const labels = () => [
  t("场景与任务", "Scenario & tasks"),
  t("运动与车辆", "Motion & vehicles"),
  t("交通与作业", "Traffic & operations"),
  t("实验与证据", "Experiments & evidence"),
];
const api = async (url, data) => {
  const response = await fetch(
    url,
    data === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  const value = await response.json();
  if (!response.ok) throw Error(value.error ?? response.status);
  return value;
};
function notice(message, error = false) {
  const n = document.querySelector("#notice");
  n.hidden = !message;
  n.className = `notice${error ? " error" : ""}`;
  n.textContent = message;
}
function shell() {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  app.innerHTML = `<div class="shell"><aside class="rail"><div class="wordmark"><img src="/assets/mark.svg" alt="">GroundWork</div><small>SIMULATION · VALIDATION</small><div class="project-tag"><small>WORKSPACE 01</small><br>${t("封闭园区 · 运输实验室", "Closed-site transport lab")}<br><span class="pill">${t("独立运行 · 本地优先", "Standalone · local-first")}</span></div><nav>${labels()
    .map(
      (v, i) =>
        `<button data-tab="${i}" class="${tab === i ? "active" : ""}"><b>${"ABCD"[i]}</b>${v}</button>`,
    )
    .join(
      "",
    )}</nav><div class="rail-footer"><strong>ground.</strong>${t("回到问题本身。<br>用可复现的实验，建立判断。", "Back to first principles.<br>Build understanding with evidence.")}<br><br>v0.2 · unified workbench</div></aside><div class="body"><header class="top"><span>GROUND / ${t("研发工作台", "ENGINEERING WORKBENCH")}</span><div class="top-right"><span>● ${t("可信局域网预览", "TRUSTED LAN PREVIEW")}</span><button id="language">${lang === "zh" ? "EN" : "中文"}</button><a href="/classic">${t("原型实验台", "Classic lab")} ↗</a></div></header><main><div class="heading"><div><div class="eyebrow" id="eyebrow">MODULE A / SCENARIO</div><h1 id="title"></h1><p>${t("一个工程，从场景到轨迹，从作业到证据。", "One project. From scenarios to motion, from operations to evidence.")}</p></div><button class="primary" id="run">▶ ${t("运行实验", "Run experiment")}</button></div><div class="toolbar"><span>${t("仿真引擎", "ENGINE")}</span><select id="engine"><option value="chrono">Chrono · ${t("力矩驱动多挂车", "Torque-driven trailer train")}</option><option value="yard">${t("园区运动学 · 牵引车 + 叉车", "Yard kinematics · tugger + forklift")}</option><option value="road">${t("道路行为 · 结构化轨迹", "Road behavior · structured trajectories")}</option></select><span class="pill">${t("合成场景", "SYNTHETIC SCENE")}</span><span class="help">m / s / rad</span></div><div id="notice" class="notice" role="status" hidden></div><section class="workspace-grid"><div class="viewport-card"><div class="card-title"><span>${t("场景回放", "Scene replay")} <span id="run-label" class="mono"></span></span><div class="mode-buttons"><button data-mode="2d">2D</button><button data-mode="3d" class="selected">3D</button></div></div><div id="viewport" class="viewport"><div class="empty-preview" id="empty"><b>ground.</b>${t("运行实验，查看真实计算的轨迹", "Run an experiment to inspect computed motion")}</div></div><div class="viewer-caption"><span id="model-caption">${t("几何代理模型，不是车辆数字孪生", "Geometry proxies, not calibrated digital twins")}</span><span>${t("拖拽旋转 · 滚轮缩放", "Drag to orbit · scroll to zoom")}</span></div><div class="replay-bar"><button id="play" aria-label="Play">▶</button><input id="timeline" type="range" min="0" max="0" value="0" aria-label="Timeline"><label id="clock">0.0 / 0.0 s</label><select id="rate" aria-label="Playback speed"><option>1</option><option selected>2</option><option>4</option><option>8</option></select></div><div class="stats" id="stats"></div></div><aside class="inspector-card" id="inspector"></aside></section><section class="history"><div class="card-title"><span>${t("实验记录 · 持久化存储", "Experiment history · persistent storage")}</span><button id="compare">${t("对比所选两次", "Compare selected pair")}</button></div><div id="history" class="history-list"></div><div id="comparison"></div></section><section class="below"><div class="info-card"><div class="card-title">${t("作业状态 · 当前帧", "Operations · current frame")}</div><div class="content" id="actors"></div></div><div class="info-card"><div class="card-title">${t("事件证据 · 已发生", "Event evidence · elapsed")}</div><div class="content" id="events"></div></div></section><details class="wide-panel"><summary>${t("模型边界与复现信息", "Model boundaries & provenance")}</summary><pre id="provenance"></pre></details><footer class="footnote"><span>${t("非安全认证 · 无真实车辆控制 · 不上传数据", "Not safety certification · no real vehicle control · no telemetry uploads")}</span><span>GROUNDWORK / 0.2.0</span></footer></main></div></div>`;
  const mapsLink = document.createElement("a");
  mapsLink.href = `/maps?lang=${lang}`;
  mapsLink.id = "map-library-link";
  mapsLink.textContent = t(
    "地图资源库 · 5 张 RMF 地图 ↗",
    "Map library · 5 RMF maps ↗",
  );
  document.querySelector(".toolbar").append(mapsLink);
  const focusButton = document.createElement("button");
  focusButton.id = "focus";
  focusButton.textContent = t("聚焦/全景", "Focus/scene");
  document.querySelector(".mode-buttons").prepend(focusButton);
  viewer = new Viewer(document.querySelector("#viewport"));
  focusButton.onclick = () => {
    viewer.follow = !viewer.follow;
    viewer.zoom = 1;
    viewer.draw();
  };
  viewer.setMode(mode);
  document.querySelector("#engine").value = engine;
  if (run) {
    viewer.setRun(run);
    document.querySelector("#empty").hidden = true;
    document.querySelector("#timeline").max = run.frames.length - 1;
    document.querySelector("#timeline").value = index;
    document.querySelector("#run-label").textContent =
      `/ ${run.provenance.jobId.slice(0, 8)}`;
    document.querySelector("#provenance").textContent = JSON.stringify(
      {
        model: run.model,
        validity: run.validity,
        verdict: run.verdict,
        request: run.request,
        provenance: run.provenance,
      },
      null,
      2,
    );
  }
  inspector();
  renderHistory();
  update();
  document.querySelector("#language").onclick = () => {
    lang = lang === "zh" ? "en" : "zh";
    viewer.observer?.disconnect();
    viewer.renderer?.dispose();
    shell();
  };
  document.querySelectorAll("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        tab = +b.dataset.tab;
        document
          .querySelectorAll("[data-tab]")
          .forEach((x) => x.classList.toggle("active", x === b));
        inspector();
      }),
  );
  document.querySelector("#engine").onchange = (e) => {
    engine = e.target.value;
    inspector();
  };
  document.querySelector("#run").onclick = () => guard(start);
  document.querySelector("#play").onclick = () => {
    playing = !playing;
    document.querySelector("#play").textContent = playing ? "Ⅱ" : "▶";
  };
  document.querySelector("#timeline").oninput = (e) => {
    index = +e.target.value;
    playing = false;
    document.querySelector("#play").textContent = "▶";
    update();
  };
  document.querySelectorAll("[data-mode]").forEach(
    (b) =>
      (b.onclick = () => {
        mode = b.dataset.mode;
        viewer.setMode(mode);
        document
          .querySelectorAll("[data-mode]")
          .forEach((x) => x.classList.toggle("selected", x === b));
      }),
  );
  document.querySelector("#compare").onclick = () =>
    guard(async () => {
      if (selected.size !== 2)
        throw Error(
          t(
            "请选择同引擎、同地图的两次已完成实验",
            "Select two completed runs with the same engine and map",
          ),
        );
      const [baseline, candidate] = [...selected];
      const c = await api("/api/compare", { baseline, candidate });
      document.querySelector("#comparison").innerHTML =
        `<pre>${esc(JSON.stringify(c, null, 2))}</pre>`;
    });
}
const field = (key, label, value, min, max, step = 1) =>
  `<label>${label}<input id="${key}" type="number" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
const settings = {
  duration: 90,
  vehicles: 1,
  trailers: 3,
  speed: 1.3,
  friction: 0.8,
  seed: 42,
  doorDelay: 0,
  policy: "fifo",
  preset: "baseline",
};
function inspector() {
  document.querySelector("#title").textContent = labels()[tab];
  document.querySelector("#eyebrow").textContent =
    `MODULE ${"ABCD"[tab]} / ${["SCENARIO", "MOTION", "OPERATIONS", "EVIDENCE"][tab]}`;
  const enabled = cap?.engines[engine];
  document.querySelector("#run").disabled = !enabled || busy;
  let content = `<h2>${"ABCD"[tab]} · ${labels()[tab]}</h2><div class="status-line"><span>${engine.toUpperCase()}</span><span class="badge">${enabled ? t("可运行", "READY") : t("未配置", "NOT CONFIGURED")}</span></div>`;
  if (tab === 0)
    content += `<p class="help">${t("先明确实验问题，再调整车辆参数。当前地图与任务为合成输入；道路引擎支持编辑方案及导入本地米制道路。", "Define the experiment first, then tune the vehicle. Default maps/tasks are synthetic; the road engine accepts structured plans and local-metre roads.")}</p>`;
  if (tab === 1)
    content += `<details open><summary>${t("车辆模型说明", "Vehicle model")}</summary><p class="help">${engine === "chrono" ? t("40 kg 牵引车；每节刚性载货挂车 31 kg；被动轮 + 旋转铰链；控制器输出轮端力矩。无转向悬架/轮胎标定。", "40 kg tractor; 31 kg rigid loaded wagons; passive wheels and revolute joints. Controller outputs wheel torque. No calibrated tyres, steering or suspension.") : engine === "road" ? t("道路车辆运动行为模型。支持 car / heavy_truck，不包含挂车铰接、货叉或举升。", "Road motion/behavior model: car / heavy_truck; no articulated trailer, forks or lifting.") : t("前轮转向牵引车 + 单节轴上铰接拖车；叉车后轮转向。理想定位、离散轮廓检测。", "Front-steer tugger with an on-axle single trailer; rear-steer forklift. Ideal localization and sampled footprints.")}</p></details>`;
  if (tab === 2)
    content += `<details open><summary>${t("作业与资源边界", "Operations & resource boundary")}</summary><p class="help">${engine === "chrono" ? t("装挂 → 运输 A → 脱挂 A → 运输 B → 脱挂 B → 回站清空 → 充电。接挂/脱挂仅在静止时发生。每车独立环线，不是共享路网调度验证。", "Couple → haul A → detach A → haul B → detach B → return/empty → charge. Coupling happens only while stopped. Separate loops do not validate shared-network dispatch.") : engine === "yard" ? t("J-01 路口互斥；完整牵引组合驶离后释放。可切换无互斥策略观察接触退化。门禁为逻辑状态，不是物理门。", "J-01 mutex is released after the full train clears. Disable it to inspect contact regression. Gate is logical, not a physical door.") : t("编译后的事件时间窗、先后依赖、制动/换道与跟车响应。未连接生产调度系统。", "Compiled event windows/dependencies, braking/lane-change and following response. No production dispatcher.")}</p></details>`;
  if (tab === 3)
    content += `<p class="help">${t("实验参数与结果落盘；在下方勾选两次同引擎/同地图实验比较。完成计算与通过验证是不同状态。导出保留模型边界、原始报告与输入摘要。", "Inputs and results persist. Select two same-engine/map runs below to compare. Computation completion is separate from validation. Exports retain model boundaries and input provenance.")}</p>`;
  if (engine === "chrono") {
    content +=
      field(
        "duration",
        t("实验时长 / s", "Duration / s"),
        settings.duration,
        5,
        180,
      ) +
      field(
        "vehicles",
        t("牵引车数量", "Tugger count"),
        settings.vehicles,
        1,
        5,
      ) +
      field(
        "trailers",
        t("每车目标挂车数（静止接挂）", "Target trailers (coupled at rest)"),
        settings.trailers,
        1,
        3,
      ) +
      field(
        "speed",
        t("目标速度上限 / m/s", "Target speed cap / m/s"),
        settings.speed,
        0.4,
        2.5,
        0.1,
      ) +
      field(
        "friction",
        t("接触摩擦系数", "Contact friction"),
        settings.friction,
        0.2,
        1.2,
        0.05,
      );
    content += `<p class="help">${t("真实 Chrono 刚体计算；独立的合成环线。力矩驱动、静止接挂/脱挂、分站作业、充电状态。地面接触 ≠ 事故。180 s 内不保证完成整轮任务。", "Real Chrono rigid-body computation on independent synthetic loops. Torque drive, stationary coupling, depot phases and illustrative charging. Ground contacts ≠ accidents. A full mission may exceed 180 s.")}</p>`;
  }
  if (engine === "yard") {
    content += `<label>${t("场景预设", "Scenario preset")}<select id="preset"><option value="baseline">${t("基线 · 正常通行", "Baseline · normal clearance")}</option><option value="tight">${t("窄道 · 挂车碰撞", "Tight aisle · trailer contact")}</option><option value="delay">${t("门禁延迟", "Delayed gate")}</option></select></label><label>${t("路口互斥策略", "Intersection policy")}<select id="policy"><option value="fifo">FIFO</option><option value="none">${t("禁用互斥", "No mutex")}</option></select></label>${field("doorDelay", t("门禁延迟 / s", "Gate delay / s"), settings.doorDelay, 0, 60)}${field("seed", t("随机种子", "Seed"), settings.seed, 1, 1000000)}<p class="help">${t("牵引车单挂车 + 后轮转向叉车。保留车尾完全离开后才释放路权的逻辑。简化平面运动学，不是 Chrono。", "Single-trailer tugger + rear-steer forklift. Resource released only after the full train clears. Simplified planar kinematics, not Chrono.")}</p><button id="batch">${t("运行 6 组配对回归（12 次）", "Run 6 matched regression pairs (12 runs)")}</button>`;
  }
  if (engine === "road") {
    content += `<label>${t("结构化方案（可编辑 JSON）", "Structured plan (editable JSON)")}<textarea id="plan" rows="13">${esc(JSON.stringify(plan, null, 2))}</textarea></label><label class="file-label">${t("导入本地米制道路 GeoJSON", "Import local-metre road GeoJSON")}<input id="map-file" type="file" accept=".json,.geojson"></label><button id="reset-plan">${t("恢复合成地图与方案", "Reset synthetic map & plan")}</button><hr class="separator"><label>${t("可选模型网关 · 需管理员配置", "Optional model gateway · admin configuration")}<textarea id="prompt" rows="2" placeholder="${t("描述道路行为场景", "Describe a road behavior scenario")}"></textarea></label><button id="model-plan" ${cap?.modelGateway ? "" : "disabled"}>${t("生成并校验方案", "Generate & validate plan")}</button><p class="help">${t("复用车道、跟车、制动、换道、事件依赖与约束校验。当前为道路车辆模型，不冒充工业叉车。自然语言仅在真实模型网关配置后可用。", "Reuses lanes, following, braking, lane changes, event dependencies and validation. Road vehicles, not industrial forklifts. Natural language requires a real configured gateway.")}</p>`;
  }
  content += `<hr class="separator"><div id="job-status" class="help"></div><div class="exports" id="exports"></div><p class="help">${t("RMF：仅导航图导出，未连接调度器。<br>SDF：场景导出，未连接现有 Gazebo。", "RMF: navigation graph export, no live dispatcher.<br>SDF: scene export, no existing Gazebo connection.")}</p>`;
  document.querySelector("#inspector").innerHTML = content;
  for (const key of Object.keys(settings)) {
    const input = document.getElementById(key);
    if (input) {
      input.value = settings[key];
      input.onchange = () =>
        (settings[key] =
          input.type === "number" ? Number(input.value) : input.value);
    }
  }
  document.querySelector("#plan")?.addEventListener("change", (e) => {
    try {
      plan = JSON.parse(e.target.value);
      notice("");
    } catch (error) {
      notice(error.message, true);
    }
  });
  document.querySelector("#map-file")?.addEventListener("change", (e) =>
    guard(async () => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 1024 * 1024) throw Error("Map exceeds 1 MiB");
      const candidate = JSON.parse(await file.text());
      const result = await api("/api/plan", { map: candidate });
      mapInput = candidate;
      plan = result.plan;
      inspector();
      notice(
        t(
          "地图已验证；请检查新方案中的车辆起点。不会建立推测的道路拓扑。",
          "Map validated; review initial positions. No inferred road topology is created.",
        ),
      );
    }),
  );
  document.querySelector("#reset-plan")?.addEventListener("click", () => {
    mapInput = null;
    plan = structuredClone(cap.plan);
    inspector();
  });
  document.querySelector("#model-plan")?.addEventListener("click", () =>
    guard(async () => {
      const result = await api("/api/model-plan", {
        prompt: document.querySelector("#prompt").value,
        map: mapInput ?? undefined,
      });
      plan = result.plan;
      inspector();
      notice(
        t(
          "真实网关输出已通过方案编译校验，尚未运行仿真。",
          "Gateway output compiled successfully; simulation not yet run.",
        ),
      );
    }),
  );
  document.querySelector("#batch")?.addEventListener("click", () =>
    guard(async () => {
      for (const seed of [11, 42])
        for (const doorDelay of [0, 8, 18])
          for (const policy of ["fifo", "none"])
            await api("/api/runs", {
              engine: "yard",
              config: { seed, doorDelay, policy },
            });
      notice(
        t(
          "12 次配对实验已进入队列，结果将分别保留。",
          "12 matched experiments queued; each result will be retained.",
        ),
      );
      await refresh();
    }),
  );
  renderExports();
}
function request() {
  if (engine === "road") {
    plan = JSON.parse(document.querySelector("#plan").value);
    return { engine, plan, map: mapInput ?? undefined };
  }
  if (engine === "yard")
    return {
      engine,
      config: {
        seed: settings.seed,
        doorDelay: settings.preset === "delay" ? 18 : settings.doorDelay,
        policy: settings.policy,
        ...(settings.preset === "tight"
          ? { aisleWidth: 2.8, trailerLength: 4.5 }
          : {}),
      },
    };
  return {
    engine,
    duration: settings.duration,
    vehicles: settings.vehicles,
    trailers: settings.trailers,
    speed: settings.speed,
    friction: settings.friction,
  };
}
async function start() {
  selectionEpoch++;
  loadingId = null;
  jobId = null;
  const job = await api("/api/runs", request());
  jobId = job.id;
  playing = false;
  notice(
    t(
      "实验已提交。后台独立计算，结果完成后自动载入。",
      "Experiment submitted. It runs independently and loads when complete.",
    ),
  );
  await refresh();
}
async function guard(fn) {
  try {
    busy = true;
    document.querySelector("#run").disabled = true;
    await fn();
  } catch (error) {
    notice(error.message, true);
  } finally {
    busy = false;
    document.querySelector("#run").disabled = !cap?.engines[engine];
  }
}
async function load(id) {
  const epoch = ++selectionEpoch;
  jobId = id;
  loadingId = id;
  let result;
  try {
    result = await api(`/api/runs/${id}/result`);
  } catch (error) {
    if (epoch !== selectionEpoch) return;
    throw error;
  } finally {
    if (epoch === selectionEpoch) loadingId = null;
  }
  if (epoch !== selectionEpoch || jobId !== id) return;
  run = result;
  index = 0;
  playing = false;
  viewer.setRun(run);
  document.querySelector("#empty").hidden = true;
  document.querySelector("#timeline").max = run.frames.length - 1;
  document.querySelector("#timeline").value = 0;
  document.querySelector("#run-label").textContent = `/ ${id.slice(0, 8)}`;
  document.querySelector("#provenance").textContent = JSON.stringify(
    {
      model: run.model,
      validity: run.validity,
      verdict: run.verdict,
      request: run.request,
      provenance: run.provenance,
    },
    null,
    2,
  );
  update();
  renderExports();
  notice(
    t(
      "结果已载入。指标与判定保留引擎自身语义。",
      "Result loaded. Metrics and verdicts retain their engine-specific meaning.",
    ),
  );
}
function renderExports() {
  const el = document.querySelector("#exports");
  if (!el) return;
  el.innerHTML = run
    ? [
        "result",
        "report",
        "rmf",
        "sdf",
        ...(run.engine === "chrono" ? [] : ["xosc"]),
      ]
        .map(
          (k) =>
            `<a href="/api/runs/${run.provenance.jobId}/${k}" ${k === "result" ? 'download="groundwork-result.json"' : ""}>${{ result: "JSON", report: "HTML", rmf: "RMF graph", sdf: "SDF", xosc: "XOSC catalog" }[k]} ↓</a>`,
        )
        .join("")
    : "";
}
function renderHistory() {
  const container = document.querySelector("#history");
  container.innerHTML = jobs.length
    ? jobs
        .map(
          (j) =>
            `<div class="run-row"><input type="checkbox" aria-label="Select ${j.id}" data-select="${j.id}" ${selected.has(j.id) ? "checked" : ""} ${j.status === "completed" ? "" : "disabled"}><div class="mono">${j.id.slice(0, 8)}<small>${esc(j.engine)} · ${esc(j.verdict ?? "—")}</small></div><time>${new Date(j.createdAt).toLocaleTimeString(lang === "zh" ? "zh-CN" : "en-GB")}</time><span class="badge ${esc(j.status)}">${esc(j.status)}</span><button data-job="${j.id}" data-action="${j.status === "completed" ? "open" : "cancel"}" ${["completed", "queued", "running"].includes(j.status) ? "" : "disabled"}>${j.status === "completed" ? t("回放", "Replay") : ["queued", "running"].includes(j.status) ? t("取消", "Cancel") : t("已结束", "Ended")}</button></div>`,
        )
        .join("")
    : `<p class="help" style="padding:16px">${t("尚无实验。选择引擎，运行第一个场景。", "No experiments yet. Select an engine and run your first scenario.")}</p>`;
  container.querySelectorAll("[data-job]").forEach(
    (b) =>
      (b.onclick = () =>
        guard(async () => {
          if (b.dataset.action === "open") await load(b.dataset.job);
          else await api(`/api/runs/${b.dataset.job}/cancel`, {});
          await refresh();
        })),
  );
  container.querySelectorAll("[data-select]").forEach(
    (i) =>
      (i.onchange = () => {
        if (i.checked) selected.add(i.dataset.select);
        else selected.delete(i.dataset.select);
      }),
  );
}
async function refresh() {
  jobs = (await api("/api/runs")).filter((j) => j.engine !== "park");
  renderHistory();
  if (jobId) {
    const observed = jobId,
      epoch = selectionEpoch;
    const job = await api(`/api/runs/${observed}`);
    if (observed !== jobId || epoch !== selectionEpoch) return;
    const el = document.querySelector("#job-status");
    if (el) {
      el.innerHTML = `${esc(job.status)} · ${job.progress ? Math.round(job.progress * 100) : 0}%<div class="progress-track"><div style="width:${Math.round((job.progress ?? 0) * 100)}%"></div></div>${esc(job.error ?? "")}`;
    }
    if (
      job.status === "completed" &&
      run?.provenance.jobId !== job.id &&
      loadingId !== job.id
    )
      await load(job.id);
    if (job.status === "failed") notice(job.error, true);
  }
}
function update() {
  if (!run) {
    document.querySelector("#stats").innerHTML = [
      "ENGINE",
      "STATE",
      "DURATION",
      "EVIDENCE",
    ]
      .map(
        (k) => `<div class="stat"><small>${k}</small><strong>—</strong></div>`,
      )
      .join("");
    return;
  }
  const frame = run.frames[index];
  if (!frame) return;
  viewer.show(frame);
  document.querySelector("#clock").textContent =
    `${frame.t.toFixed(1)} / ${run.frames.at(-1).t.toFixed(1)} s`;
  document.querySelector("#timeline").value = index;
  const values =
    run.engine === "chrono"
      ? [
          [t("完成循环", "Cycles"), run.metrics.cycles],
          [t("已接挂", "Couplings"), run.metrics.attached],
          [
            t("最大铰接误差 / m", "Max hitch error / m"),
            Number(run.metrics.maxHitchError).toFixed(4),
          ],
          [
            t("最大跟踪误差 / m", "Max tracking error / m"),
            Number(run.metrics.maxTrackingError).toFixed(2),
          ],
        ]
      : run.engine === "yard"
        ? [
            [t("完成任务", "Completed"), run.metrics.completed],
            [t("接触事件", "Contact episodes"), run.metrics.collisionEpisodes],
            [
              t("最小间距 / m", "Min clearance / m"),
              Number(run.metrics.minClearance).toFixed(2),
            ],
            [
              t("等待 / s", "Wait / s"),
              Number(run.metrics.totalWait).toFixed(1),
            ],
          ]
        : [
            [t("参与车辆", "Actors"), frame.actors.length],
            [t("轨迹帧", "Frames"), run.frames.length],
            [t("事件记录", "Events"), run.events.length],
            [t("结果", "Verdict"), run.verdict],
          ];
  document.querySelector("#stats").innerHTML = values
    .map(
      ([k, v]) =>
        `<div class="stat"><small>${k}</small><strong>${esc(v)}</strong></div>`,
    )
    .join("");
  document.querySelector("#model-caption").textContent =
    `${run.engine.toUpperCase()} · ${run.verdict} · ${run.validity}`;
  document.querySelector("#actors").innerHTML =
    (frame.actors ?? [])
      .map(
        (a) =>
          `<div class="actor-row"><strong>${esc(a.name ?? a.id)}</strong> · ${esc(a.stage ?? a.status ?? "")} · ${Number(a.speed ?? a.v ?? 0).toFixed(2)} m/s${a.trailer_count !== undefined ? `<br>${t("挂车", "Trailers")} ${a.trailer_count}/${a.target_count} · ${t("作业进度", "Service")} ${Math.round((a.service_progress ?? 0) * 100)}%` : ""}${a.error ? `<br>${esc(a.error)}` : ""}</div>`,
      )
      .join("") +
    `${frame.owner ? `<div class="actor-row">J-01 → ${esc(frame.owner)}</div>` : ""}`;
  const events = run.events
    .filter((e) => e.t <= frame.t)
    .slice(-16)
    .reverse();
  document.querySelector("#events").innerHTML = events.length
    ? events
        .map(
          (e) =>
            `<div class="event-row"><span>${Number(e.t).toFixed(1)} s</span>${esc(e.type)} · ${esc(e.vehicle)}<br>${esc(e.detail)}</div>`,
        )
        .join("")
    : `<p class="help">${t("当前时间之前暂无事件", "No events before the current time")}</p>`;
}
let last = 0,
  accumulator = 0;
function animate(now) {
  if (playing && run) {
    accumulator +=
      Math.min(0.2, (now - last) / 1000) *
      Number(document.querySelector("#rate").value);
    let changed = false;
    while (
      index < run.frames.length - 1 &&
      accumulator >= run.frames[index + 1].t - run.frames[index].t
    ) {
      accumulator -= run.frames[index + 1].t - run.frames[index].t;
      index++;
      changed = true;
    }
    if (changed) update();
    if (index === run.frames.length - 1) {
      playing = false;
      document.querySelector("#play").textContent = "▶";
    }
  } else accumulator = 0;
  last = now;
  requestAnimationFrame(animate);
}
shell();
requestAnimationFrame(animate);
try {
  cap = await api("/api/capabilities");
  plan = cap.plan;
  if (!cap.engines.chrono) engine = "yard";
  document.querySelector("#engine").value = engine;
  inspector();
  await refresh();
  if (
    selectionEpoch === 0 &&
    !jobId &&
    jobs.find((j) => j.status === "completed")
  )
    await load(jobs.find((j) => j.status === "completed").id);
} catch (error) {
  notice(error.message, true);
}
let polling = false;
setInterval(async () => {
  if (polling || document.hidden) return;
  polling = true;
  try {
    await refresh();
  } catch (error) {
    notice(error.message, true);
  } finally {
    polling = false;
  }
}, 2000);
