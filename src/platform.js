import { ParkViewer } from "./park-viewer.js";
import { escapeText as esc } from "./map-data.js";
const $ = (s) => document.querySelector(s),
  app = $("#platform");
let lang = localStorage.getItem("groundwork-language") || "zh",
  data = null,
  park = null,
  draft = null,
  dirty = false,
  undo = [],
  redo = [],
  view = null,
  mapId = "",
  floorId = "",
  mapData = null,
  mode = "2d",
  tool = "select",
  routeDraft = [],
  run = null,
  runId = null,
  frame = 0,
  playing = false,
  epoch = 0,
  jobs = [],
  timer;
const cache = new Map();
const t = (zh, en) => (lang === "zh" ? zh : en);
const names = () => ({
  overview: t("总览", "Overview"),
  maps: t("地图管理", "Maps"),
  models: t("设备模型管理", "Device models"),
  gateways: t("接入网关", "Gateways"),
  parks: t("园区管理", "Parks"),
});
const tabs = () => ({
  overview: t("园区概览", "Overview"),
  scene: t("场景编辑", "Scene editor"),
  devices: t("设备实例", "Devices"),
  operations: t("作业管理", "Operations"),
  control: t("控制面板", "Control panel"),
  analytics: t("统计分析", "Analytics"),
  settings: t("园区配置", "Settings"),
});
const types = () => ({
  charging: t("充电点", "Charging"),
  parking: t("停靠点", "Parking"),
  loading: t("装货点", "Loading"),
  unloading: t("卸货点", "Unloading"),
  waypoint: t("站点", "Waypoint"),
  door: t("门", "Door"),
  restricted: t("禁行区", "Restricted"),
  speed: t("限速区", "Speed zone"),
  route: t("路线", "Route"),
});
const route = () => {
  const [section = "overview", id, tab = "overview"] = location.hash
    .slice(1)
    .split("/");
  return { section, id, tab };
};
const api = async (url, input) => {
  const r = await fetch(
    url,
    input === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
  );
  const d = await r.json();
  if (!r.ok) throw Error(d.error || r.status);
  return d;
};
function toast(msg, error = false) {
  clearTimeout(timer);
  $("#toast").hidden = false;
  $("#toast").className = error ? "error" : "";
  $("#toast").textContent = msg;
  timer = setTimeout(() => ($("#toast").hidden = true), error ? 12000 : 4000);
}
const guard = (fn) =>
  Promise.resolve()
    .then(fn)
    .catch((e) => toast(e.message, true));
const btn = (label, action, id = "", klass = "") =>
  `<button class="${klass}" data-action="${action}" data-id="${esc(id)}">${label}</button>`;
const field = (label, name, value = "", type = "text", extra = "") =>
  `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const select = (label, name, choices, value) =>
  `<label class="field">${label}<select name="${name}">${choices.map(([v, n]) => `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>`;
const area = (label, name, value) =>
  `<label class="field wide">${label}<textarea name="${name}">${esc(typeof value === "string" ? value : JSON.stringify(value, null, 2))}</textarea></label>`;
const stamp = (r) =>
  `v${r.version} · ${new Date(r.updatedAt).toLocaleDateString()}`;
const active = (kind) => data[kind].filter((r) => !r.archived);
const empty = (msg) => `<div class="empty">${msg}</div>`;
const banner = (msg) => `<div class="banner warning">${msg}</div>`;
const num = (form, key) => Number(form.get(key));
// LAN HTTP is not a secure context: randomUUID may be unavailable there.
const freshId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
function download(name, value) {
  const u = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 2000);
}
async function record(kind, id, version) {
  const key = `${kind}/${id}/${version || "latest"}`;
  if (!version || !cache.has(key))
    cache.set(
      key,
      await api(
        `/api/platform/${kind}/${id}${version ? `?version=${version}` : ""}`,
      ),
    );
  return cache.get(key);
}
function dispose() {
  view?.dispose();
  view = null;
  playing = false;
}
async function reload() {
  data = await api("/api/platform");
  await page();
}
async function page() {
  const token = ++epoch;
  dispose();
  const r = route();
  if (r.section === "parks" && r.id) {
    const p = await record("parks", r.id);
    if (token !== epoch) return;
    if (park?.id !== p.id || !dirty) {
      if (park?.id !== p.id) {
        run = null;
        runId = null;
        routeDraft = [];
      }
      park = p;
      draft = structuredClone(p.data);
      dirty = false;
      undo = [];
      redo = [];
    }
    if (!mapId || !draft.maps.some((m) => m.id === mapId))
      mapId = draft.maps[0].id;
    jobs = await api(`/api/platform/parks/${p.id}/runs`);
    if (token !== epoch) return;
  } else {
    park = null;
    draft = null;
    dirty = false;
    run = null;
    runId = null;
    mapId = "";
    floorId = "";
  }
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  app.innerHTML = `<div class="layout"><aside class="sidebar"><a class="brand" href="#overview"><img src="/assets/mark.svg" alt="">GroundWork</a><div class="small muted">${t("资源 · 园区 · 运行 · 证据", "Resources · Parks · Evidence")}</div><nav>${Object.entries(
    names(),
  )
    .map(
      ([key, name], i) =>
        `<a href="#${key}" class="${r.section === key ? "active" : ""}"><span class="small">0${i + 1}</span>　${name}</a>`,
    )
    .join(
      "",
    )}</nav><div class="side-foot"><strong>ground.</strong><br>${t("回到问题本身。", "Back to the fundamentals.")}<br><a href="/workbench">${t("旧版 / Chrono 力学实验室 ↗", "Legacy / Chrono mechanics lab ↗")}</a><br><a href="/maps">${t("RMF 地图查看器 ↗", "RMF map viewer ↗")}</a></div></aside><div class="main"><header class="topbar"><span>GROUND / ${t("园区研发平台", "PARK ENGINEERING PLATFORM")}</span><div><span>${t("可信局域网 · 单用户 · 无登录", "TRUSTED LAN · SINGLE USER · NO AUTH")}</span>${btn(lang === "zh" ? "EN" : "中文", "language")}</div></header><main class="content" id="content"></main></div></div>`;
  if (park) {
    await parkPage(r.tab, token);
    return;
  }
  if (r.section === "overview") overview();
  else if (["maps", "models", "gateways"].includes(r.section))
    resources(r.section);
  else if (r.section === "parks") parks();
  else location.hash = "overview";
}
function heading(title, sub, actions = "") {
  return `<div class="heading"><div><div class="eyebrow">GROUNDWORK / ${esc(route().section.toUpperCase())}</div><h1>${esc(title)}</h1><p>${sub}</p></div><div class="actions">${actions}</div></div>`;
}
function overview() {
  $("#content").innerHTML =
    heading(
      t("从园区开始组织业务", "Organize operations around a park"),
      t(
        "管理可复用资源，在园区里创建设备、配置场景和运行实验。",
        "Manage reusable resources. Create devices, configure scenes and run experiments inside a park.",
      ),
      `<a class="button primary" href="#parks">${t("进入园区管理", "Open parks")} →</a>`,
    ) +
    `<div class="stats">${[
      ["maps", t("已导入地图", "Imported maps")],
      ["models", t("设备模型", "Device models")],
      ["gateways", t("网关配置", "Gateway configurations")],
      ["parks", t("园区", "Parks")],
    ]
      .map(
        ([k, n]) =>
          `<a class="stat" href="#${k}"><strong>${active(k).length}</strong><span>${n}</span></a>`,
      )
      .join("")}</div>` +
    banner(
      t(
        "当前是研发预览：实机通道尚未连接，不能远程接管。统计只来自实际保存的数据和计算结果。",
        "Engineering preview: real-device channels are not connected; no remote takeover. Counts and metrics come only from stored records and computed results.",
      ),
    ) +
    `<div class="panel"><div class="panel-head"><h2>${t("最近园区", "Recent parks")}</h2>${btn(t("创建园区", "Create park"), "new", "parks", "primary")}</div>${active("parks").length ? `<div class="cards">${active("parks").map(parkCard).join("")}</div>` : empty(t("先准备地图、设备模型和网关，再创建你的第一个园区。", "Prepare maps, models and a gateway, then create your first park."))}</div><div class="panel" style="margin-top:20px"><h2>${t("最近资源变更", "Recent resource changes")}</h2><ul class="rows">${data.audit
      .slice(0, 8)
      .map(
        (a) =>
          `<li><span>${esc(names()[a.kind] || a.kind)} · ${esc(a.action)} · v${a.version}</span><span class="muted small">${esc(a.at)}</span></li>`,
      )
      .join("")}</ul></div>`;
}
function parkCard(p) {
  return `<article class="card"><h2>${esc(p.name)}</h2><p class="muted">${esc(p.data.description || t("园区业务容器", "Park operations container"))}</p><div class="meta">${p.data.maps.length} ${t("地图", "maps")} · ${p.data.devices.length} ${t("设备", "devices")} · ${p.data.tasks.length} ${t("任务", "tasks")}</div><div class="actions"><a class="button primary" href="#parks/${p.id}/overview">${t("进入园区", "Enter park")} →</a>${btn(t("配置", "Configure"), "edit", `parks:${p.id}`)}</div></article>`;
}
function parks() {
  $("#content").innerHTML =
    heading(
      t("园区管理", "Parks"),
      t(
        "一个园区，关联地图、模型和网关；设备和作业在这里运行。",
        "A park binds maps, models and gateways; devices and operations belong here.",
      ),
      btn(t("创建园区", "Create park"), "new", "parks", "primary"),
    ) +
    `<div class="cards">${active("parks").map(parkCard).join("")}</div>` +
    (active("parks").length
      ? ""
      : empty(
          t(
            "暂无园区，点击“创建园区”开始。",
            "No parks yet. Select Create park.",
          ),
        ));
}
function modelIcon(m) {
  return `<svg viewBox="0 0 260 90" aria-label="Model proxy"><rect x="${130 - Math.min(m.length * 17, 75)}" y="${45 - Math.min(m.width * 16, 24)}" width="${Math.min(m.length * 34, 150)}" height="${Math.min(m.width * 32, 48)}" rx="5" fill="#5e8e78"/><path d="M180 45 L160 35 L160 55 Z" fill="#d9e6d3"/>${m.trailers ? '<rect x="30" y="26" width="54" height="38" fill="#9cbaa1"/><path d="M84 45 H110" stroke="#7b9275" stroke-width="5"/>' : ""}</svg>`;
}
function resources(kind) {
  const icons = { maps: "⌑", models: "▰", gateways: "⇄" };
  $("#content").innerHTML =
    heading(
      names()[kind],
      kind === "models"
        ? t(
            "设备类型、几何参数和传感器定义；版本固定后供园区实例引用。",
            "Device types, geometry and sensor definitions; parks pin a model version.",
          )
        : kind === "maps"
          ? t(
              "共享底图独立于园区业务图层，编辑产生新版本。",
              "Shared base maps are separate from park overlays. Edits create new versions.",
            )
          : t(
              "配置接入位置和数据通道；保存配置不会自动连接外部服务。",
              "Configure endpoints and channels. Saving never connects to external services.",
            ),
      btn(t("创建", "Create"), "new", kind, "primary") +
        btn(t("导入 JSON", "Import JSON"), "import", kind),
    ) +
    `<div class="cards">${active(kind)
      .map(
        (r) =>
          `<article class="card"><div class="card-top">${kind === "models" ? modelIcon(r.data) : icons[kind]}</div><div><h2>${esc(r.name)}</h2><span class="tag">${kind === "maps" ? `${r.data.levels.length} ${t("个楼层", "floors")}` : kind === "models" ? (r.data.category === "quadruped" || r.data.category === "custom" ? t("仅定义 · 无仿真适配", "Definition only") : t("平面运动学 · 未标定", "Planar kinematics · uncalibrated")) : r.data.adapter === "simulation" ? t("本地仿真数据", "Local simulation data") : t("仅配置 · 未连接", "Configured · not connected")}</span></div><div class="meta">${stamp(r)}${kind === "models" ? `<br>${r.data.length} × ${r.data.width} × ${r.data.height} m · ${r.data.mass} kg` : ""}</div><div class="actions">${kind === "maps" ? btn(t("预览", "Preview"), "preview", r.id) : ""}${btn(t("编辑", "Edit"), "edit", `${kind}:${r.id}`)}${btn(t("复制", "Clone"), "clone", `${kind}:${r.id}`)}${btn(t("版本", "Versions"), "versions", `${kind}:${r.id}`)}${btn(t("导出", "Export"), "export", `${kind}:${r.id}`)}${btn(t("归档", "Archive"), "archive", `${kind}:${r.id}`)}</div></article>`,
      )
      .join(
        "",
      )}${kind === "maps" ? `<article class="card"><h2>${t("制造与物流", "Manufacturing & Logistics")}</h2><span class="tag warn">${t("待补源码 · 不可选择", "Awaiting source · unavailable")}</span><p class="muted">${t("上游演示没有对应可用地图源码，本批不伪造替代地图。", "The requested upstream demo lacks available map source. No substitute is fabricated.")}</p></article>` : ""}</div>`;
}
function modal(title, html, onSave, label = t("保存", "Save")) {
  const d = $("#dialog");
  d.innerHTML = `<form id="edit-form"><h2>${title}</h2>${html}<div class="error" id="form-error" role="alert"></div><footer><button type="button" id="dialog-cancel">${t("取消", "Cancel")}</button><button class="primary" type="submit">${label}</button></footer></form>`;
  d.showModal();
  $("#dialog-cancel").onclick = () => d.close();
  $("#edit-form").onsubmit = async (e) => {
    e.preventDefault();
    const b = e.submitter;
    b.disabled = true;
    try {
      await onSave(new FormData(e.target));
      d.close();
    } catch (error) {
      $("#form-error").textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
}
async function editResource(kind, id) {
  const old = id ? await record(kind, id) : null;
  if (kind === "parks") return parkDialog(old);
  let d = old?.data;
  if (kind === "models") {
    d = d || {
      category: "tugger",
      description: "",
      length: 3,
      width: 1.5,
      height: 1.4,
      wheelbase: 1.8,
      maxSpeed: 1.2,
      maxSteer: 0.6,
      mass: 1000,
      trailers: 1,
      trailerLength: 2.3,
      trailerWidth: 1.65,
      hitchLength: 2.5,
      sensors: [{ name: "ground-truth", kind: "pose" }],
    };
    const params = [
      ["length", "车长 / Length (m)"],
      ["width", "车宽 / Width (m)"],
      ["height", "车高 / Height (m)"],
      ["wheelbase", "轴距 / Wheelbase (m)"],
      ["maxSpeed", "最高速度 / Max speed (m/s)"],
      ["maxSteer", "最大转角 / Steering (rad)"],
      ["mass", "质量 / Mass (kg)"],
      ["trailers", "挂车数 / Trailers (0–1)"],
      ["trailerLength", "挂车长 / Trailer length (m)"],
      ["trailerWidth", "挂车宽 / Trailer width (m)"],
      ["hitchLength", "铰接至挂车轴 / Hitch length (m)"],
    ];
    modal(
      t("设备模型", "Device model"),
      banner(
        t(
          "平面仿真使用尺寸、轴距、速度、转角和挂车参数；质量、传感器仅保存定义，未参与当前运动学计算。未实现 CAD、URDF 或厂商模型接入。",
          "Planar simulation uses dimensions, wheelbase, speed, steering and trailer parameters. Mass/sensors are definitions only. CAD/URDF/vendor adapters are not implemented.",
        ),
      ) +
        `<div class="form-grid">${field(t("名称", "Name"), "name", old?.name || "", "text", 'required maxlength="120"')}${select(
          t("设备类型", "Device type"),
          "category",
          [
            ["tugger", t("牵引车", "Tugger")],
            ["forklift", t("叉车", "Forklift")],
            ["amr", t("轮式机器人", "Wheeled robot")],
            ["quadruped", t("机器狗（仅定义）", "Quadruped (definition only)")],
            ["custom", t("自定义（仅定义）", "Custom (definition only)")],
          ],
          d.category,
        )}${params.map(([k, l]) => field(l, k, d[k], "number", 'step="any" required')).join("")}${area(t("传感器定义 JSON（不是已生成的感知数据）", "Sensor definitions JSON (not generated perception)"), "sensors", d.sensors)}${area(t("说明", "Description"), "description", d.description)}</div>`,
      async (f) => {
        const next = {
          ...d,
          category: f.get("category"),
          description: f.get("description"),
          sensors: JSON.parse(f.get("sensors")),
        };
        params.forEach(([k]) => (next[k] = num(f, k)));
        await saveRecord(kind, old, f.get("name"), next);
      },
    );
  } else if (kind === "gateways") {
    d = d || {
      location: "cloud",
      adapter: "external",
      endpoint: "",
      description: "",
      channels: [{ name: "state", kind: "telemetry", topic: "robot/state" }],
    };
    modal(
      t("接入网关", "Gateway"),
      banner(
        t(
          "这里只保存无密钥的接入配置；外部网关握手、视频、点云和实机控制适配器尚未接通。",
          "Configuration only, without secrets. External handshake, video, point clouds and real control adapters are not connected.",
        ),
      ) +
        `<div class="form-grid">${field(t("名称", "Name"), "name", old?.name || "", "text", "required")}${select(
          t("部署位置", "Location"),
          "location",
          [
            ["local", "Local"],
            ["edge", "Edge"],
            ["cloud", "Cloud"],
          ],
          d.location,
        )}${select(
          t("适配器", "Adapter"),
          "adapter",
          [
            ["simulation", t("内置本地仿真", "Built-in simulation")],
            ["external", t("外部接口（待适配）", "External (not integrated)")],
          ],
          d.adapter,
        )}${field("Endpoint (https / wss / mqtts)", "endpoint", d.endpoint)}${area(t("通道 JSON：telemetry / events / video / pointcloud / logs", "Channels JSON: telemetry / events / video / pointcloud / logs"), "channels", d.channels)}${area(t("说明", "Description"), "description", d.description)}</div>`,
      async (f) =>
        saveRecord(kind, old, f.get("name"), {
          location: f.get("location"),
          adapter: f.get("adapter"),
          endpoint: f.get("endpoint"),
          channels: JSON.parse(f.get("channels")),
          description: f.get("description"),
        }),
    );
  } else {
    modal(
      t("地图创建 / 结构化编辑", "Create / structured map edit"),
      banner(
        t(
          "支持本平台标准化地图 JSON；修改生成新版本，不影响已经引用旧版本的园区。业务站点请在园区场景编辑器中添加。",
          "Supports normalized GroundWork map JSON. Edits create a new version; existing park references stay pinned. Add business stations in the park editor.",
        ),
      ) +
        field(
          t("地图名称", "Map name"),
          "name",
          old?.name || "",
          "text",
          "required",
        ) +
        (d
          ? area(t("标准化地图 JSON", "Normalized map JSON"), "map", d)
          : `<div class="form-grid">${field(t("宽度（米）", "Width (m)"), "width", 60, "number", 'min="5" max="1000" required')}${field(t("高度（米）", "Height (m)"), "height", 40, "number", 'min="5" max="1000" required')}</div>`),
      async (f) => {
        const next = d
          ? JSON.parse(f.get("map"))
          : blankMap(f.get("name"), num(f, "width"), num(f, "height"));
        await saveRecord(kind, old, f.get("name"), next);
      },
    );
  }
}
function blankMap(name, w, h) {
  return {
    schemaVersion: 1,
    id: "custom",
    name: { zh: name, en: name },
    units: { length: "m", angle: "rad" },
    source: { kind: "user-created" },
    coordinateTransform: { source: "local-metres" },
    capabilities: {
      geometry: true,
      navigation: true,
      simulation: false,
      liveControl: false,
    },
    warnings: ["USER_MAP_NOT_CALIBRATED"],
    lifts: [],
    levels: [
      {
        id: "L1",
        elevation: 0,
        vertices: [
          [0, 0],
          [w, 0],
          [w, h],
          [0, h],
        ].map(([x, y], id) => ({ id, x, y, z: 0, name: "", parameters: {} })),
        lanes: [],
        walls: [],
        doors: [],
        floors: [{ vertices: [0, 1, 2, 3], parameters: {} }],
        holes: [],
        models: [],
        graphs: [],
        bounds: { x: -2, y: -2, w: w + 4, h: h + 4 },
      },
    ],
  };
}
async function saveRecord(kind, old, name, next) {
  await api(`/api/platform/${kind}${old ? `/${old.id}` : ""}`, {
    name,
    data: next,
    ...(old ? { version: old.version } : {}),
  });
  toast(t("已保存新版本", "New version saved"));
  await reload();
}
function parkDialog(old) {
  const d = old?.data;
  const choices = (kind) =>
    active(kind)
      .map((r) => {
        const ref = d?.[kind]?.find?.((x) => x.id === r.id),
          checked =
            kind === "gateways" ? d?.gateways.includes(r.id) : Boolean(ref);
        return `<div class="choice"><label><input type="checkbox" name="${kind}" value="${r.id}" ${checked ? "checked" : ""}> ${esc(r.name)}</label>${kind === "gateways" ? "" : `<label>v <input type="number" min="1" max="${r.version}" name="version-${r.id}" value="${ref?.version || r.version}"></label>`}${kind === "maps" ? `<input class="transform" name="pose-${r.id}" aria-label="Map transform" value="${esc(JSON.stringify(ref?.pose || [0, 0, 0]))}" title="[x,y,yaw] m/m/rad">` : ""}</div>`;
      })
      .join("");
  modal(
    t("园区配置", "Park configuration"),
    `<div class="form-grid">${field(t("园区名称", "Park name"), "name", old?.name || "", "text", "required")}${field(t("说明", "Description"), "description", d?.description || "")}</div><fieldset><legend>${t("选择一个或多个地图 · 固定版本 · 园区变换 [x,y,yaw]", "Select maps · pinned versions · park transforms [x,y,yaw]")}</legend>${choices("maps")}</fieldset><fieldset><legend>${t("选择可用设备模型", "Select available device models")}</legend>${choices("models")}</fieldset><fieldset><legend>${t("选择接入网关", "Select gateways")}</legend>${choices("gateways")}</fieldset><p class="small muted">${t("当前按地图/楼层独立编辑与运行；变换记录用于后续跨图关联，尚不支持跨图路线。", "Editing/runs are scoped to a map floor. Transforms are recorded; cross-map routes are not yet supported.")}</p>`,
    async (f) => {
      const next = {
        description: f.get("description"),
        maps: f.getAll("maps").map((id) => ({
          id,
          version: num(f, `version-${id}`),
          pose: JSON.parse(f.get(`pose-${id}`)),
        })),
        models: f
          .getAll("models")
          .map((id) => ({ id, version: num(f, `version-${id}`) })),
        gateways: f.getAll("gateways"),
        objects: d?.objects || [],
        devices: d?.devices || [],
        tasks: d?.tasks || [],
      };
      const saved = await api(`/api/platform/parks${old ? `/${old.id}` : ""}`, {
        name: f.get("name"),
        data: next,
        ...(old ? { version: old.version } : {}),
      });
      dirty = false;
      await reload();
      location.hash = `parks/${saved.id}/overview`;
    },
  );
}
async function previewMap(id) {
  const r = await record("maps", id);
  modal(
    esc(r.name),
    '<div id="asset-preview" class="viewport"></div>',
    async () => {},
    t("关闭", "Close"),
  );
  const pv = new ParkViewer($("#asset-preview"));
  pv.setMode("2d");
  pv.setMap(r.data, r.data.levels[0], {
    graph: "all",
    walls: true,
    lanes: true,
    facilities: true,
    models: false,
    labels: false,
  });
  $("#dialog").addEventListener("close", () => pv.dispose(), { once: true });
}
async function parkPage(tab, token) {
  const title = tabs()[tab] || tabs().overview;
  $("#content").innerHTML =
    heading(
      park.name,
      `${title} · v${park.version}${dirty ? t(" · 未保存", " · Unsaved") : ""}`,
      `<a class="button" href="#parks">← ${t("园区列表", "Parks")}</a>`,
    ) +
    `<nav class="tabs">${Object.entries(tabs())
      .map(
        ([key, name]) =>
          `<a href="#parks/${park.id}/${key}" class="${tab === key ? "active" : ""}">${name}</a>`,
      )
      .join("")}</nav><div id="park-body"></div>`;
  if (tab === "settings") {
    $("#park-body").innerHTML =
      `<div class="panel"><h2>${t("园区资源与版本", "Park resources & versions")}</h2><p>${draft.maps.length} ${t("张地图", "maps")} · ${draft.models.length} ${t("种模型", "models")} · ${draft.gateways.length} ${t("个网关", "gateways")}</p><div class="actions">${btn(t("编辑配置", "Edit configuration"), "park-config", "", "primary")}${btn(t("导出园区", "Export park"), "park-export")}${btn(t("复制园区", "Clone park"), "clone", `parks:${park.id}`)}${btn(t("归档园区", "Archive park"), "archive", `parks:${park.id}`)}</div><hr><h3>${t("成员与权限", "Members & permissions")}</h3>${banner(t("本轮按确认保留可信局域网单用户预览，没有账号系统、成员隔离或远程接管权限。请勿存放密钥或敏感实机数据。", "As agreed: single-user trusted-LAN preview, no accounts, member isolation or takeover authority. Do not store secrets or sensitive device data."))}<pre>${esc(JSON.stringify({ maps: draft.maps, models: draft.models, gateways: draft.gateways }, null, 2))}</pre></div>`;
    return;
  }
  if (tab === "devices") {
    deviceList();
    return;
  }
  if (tab === "operations") {
    operations();
    return;
  }
  if (tab === "analytics") {
    await analytics(token);
    return;
  }
  const editing = tab === "scene",
    control = tab === "control";
  $("#park-body").innerHTML =
    (tab === "overview"
      ? `<div class="stats">${[
          [
            draft.devices.filter((d) => d.kind === "virtual").length,
            t("虚拟设备", "Virtual devices"),
          ],
          [
            draft.devices.filter((d) => d.kind === "physical").length,
            t("真实设备登记（未连接）", "Registered physical (not connected)"),
          ],
          [draft.objects.length, t("场景对象", "Scene objects")],
          [jobs.length, t("实验记录", "Runs")],
        ]
          .map(
            ([n, l]) =>
              `<div class="stat"><strong>${n}</strong><span>${l}</span></div>`,
          )
          .join("")}</div>`
      : "") +
    (control
      ? banner(
          t(
            "控制面板当前提供仿真作业控制和结果回放。实机接管、视频和点云未连接；播放/暂停仅控制回放，不控制真实设备。",
            "Controls operate simulation jobs and result replay. Real takeover/video/point clouds are not connected. Playback never commands physical devices.",
          ),
        )
      : "") +
    `<div class="split"><div class="panel"><div class="tools"><select id="park-map" aria-label="Map">${draft.maps.map((m) => `<option value="${m.id}" ${m.id === mapId ? "selected" : ""}>${esc(data.maps.find((v) => v.id === m.id)?.name)} · v${m.version}</option>`).join("")}</select><select id="park-floor" aria-label="Floor"></select>${btn("2D", "mode", "2d")}${btn("3D", "mode", "3d")}${btn(t("全景", "Fit"), "fit")}</div>${
      editing
        ? `<div class="tools"><select id="draw-tool" aria-label="Tool"><option value="select">${t("浏览 / 平移", "Browse / pan")}</option>${Object.entries(
            types(),
          )
            .map(
              ([k, n]) =>
                `<option value="${k}" ${tool === k ? "selected" : ""}>${t("添加", "Add")} ${n}</option>`,
            )
            .join(
              "",
            )}</select>${btn(t("完成路线", "Finish route"), "finish-route")}${btn(t("撤销", "Undo"), "undo")}${btn(t("重做", "Redo"), "redo")}${btn(t("保存场景", "Save scene"), "save-park", "", "primary")}</div><p class="small muted">${t("2D 点击地图放置对象；路线连续点击后“完成路线”。对象位置、朝向、尺寸可在右侧编辑。", "In 2D, click to place objects; click multiple points then Finish route. Edit positions, headings and dimensions in the inspector.")}</p>`
        : ""
    }<div id="park-viewport" class="viewport"></div>${control ? `<div class="replay">${btn("▶", "play")}<input id="park-timeline" aria-label="Timeline" type="range" min="0" max="0" value="0"><span id="park-clock">0.0 s</span></div>` : ""}<p class="notice-line" id="map-caption"></p></div><aside class="panel"><h2>${editing ? t("业务对象", "Business objects") : control ? t("实验与通道", "Runs & channels") : t("园区结构", "Park structure")}</h2><div id="scene-inspector"></div></aside></div>`;
  const ref = draft.maps.find((m) => m.id === mapId),
    r = await record("maps", mapId, ref.version);
  if (token !== epoch) return;
  mapData = r.data;
  if (!mapData.levels.some((l) => l.id === floorId))
    floorId = mapData.levels[0].id;
  $("#park-floor").innerHTML = mapData.levels
    .map(
      (l) =>
        `<option value="${esc(l.id)}" ${l.id === floorId ? "selected" : ""}>${esc(l.id)} · ${l.elevation} m</option>`,
    )
    .join("");
  $("#park-map").onchange = (e) => {
    routeDraft = [];
    mapId = e.target.value;
    floorId = "";
    run = null;
    guard(page);
  };
  $("#park-floor").onchange = (e) => {
    routeDraft = [];
    floorId = e.target.value;
    run = null;
    guard(page);
  };
  if (editing)
    $("#draw-tool").onchange = (e) => {
      tool = e.target.value;
      routeDraft = [];
    };
  const level = mapData.levels.find((l) => l.id === floorId);
  view = new ParkViewer($("#park-viewport"), editing ? pick : null);
  view.setMode(mode);
  view.setMap(mapData, level, {
    graph: "all",
    walls: true,
    lanes: true,
    facilities: true,
    models: false,
    labels: false,
  });
  view.element.dataset.mapId = mapId;
  view.element.dataset.floorId = floorId;
  overlay();
  $("#map-caption").textContent = t(
    "m / rad · 单层独立视图 · 底图墙体与导航来自固定版本；外部模型网格缺失，不是完整数字孪生。",
    "m / rad · Single-floor view · Pinned base-map walls/navigation; external meshes may be missing. Not a complete digital twin.",
  );
  if (editing)
    $("#scene-inspector").innerHTML =
      `<span class="tag ${dirty ? "warn" : ""}">${dirty ? t("未保存修改", "Unsaved changes") : t("已保存", "Saved")}</span><ul class="rows scroll">${draft.objects
        .filter((o) => o.mapId === mapId && o.level === floorId)
        .map(
          (o) =>
            `<li><span>${esc(o.name)}<br><small class="muted">${types()[o.type]}</small></span><div>${btn(t("编辑", "Edit"), "object-edit", o.id)}${btn("×", "object-delete", o.id)}</div></li>`,
        )
        .join(
          "",
        )}</ul><p class="small muted">${t("禁行区参与采样接触检测，限速区影响速度；充电、门、装卸点目前为语义对象，没有设备动作仿真。", "Restricted zones participate in sampled contact; speed zones constrain speed. Charging/door/loading objects are semantic annotations, not actuator simulations.")}</p>`;
  else if (control) {
    $("#scene-inspector").innerHTML =
      `<div class="scroll"><ul class="rows">${jobs.map((j) => `<li><span>${esc(j.taskName || j.id.slice(0, 8))}<br><small>${esc(j.status)} · ${esc(j.verdict || "")}</small></span>${j.status === "completed" ? btn(t("回放", "Replay"), "replay", j.id) : ["queued", "running"].includes(j.status) ? btn(t("取消", "Cancel"), "cancel-run", j.id) : ""}</li>`).join("")}</ul></div>${btn(t("刷新状态", "Refresh status"), "refresh-runs")}<hr><span class="tag">${t("仿真真值 / 事件", "Simulation ground truth / events")}</span><p class="small">${t("视频：未接通<br>点云：未接通<br>实机接管：禁用", "Video: not connected<br>Point cloud: not connected<br>Real takeover: disabled")}</p><div id="run-details"></div>`;
    $("#park-timeline").oninput = (e) => {
      playing = false;
      frame = +e.target.value;
      showFrame();
    };
    if (run) await showRun(run, token);
  } else
    $("#scene-inspector").innerHTML =
      `<p>${esc(park.data.description)}</p><ul class="rows">${draft.devices.map((d) => `<li><span>${esc(d.name)}</span><span class="tag">${d.kind === "virtual" ? t("虚拟", "Virtual") : t("实机 · 未连接", "Physical · not connected")}</span></li>`).join("")}</ul><p class="small muted">${t("先在场景编辑中添加路线，再创建设备实例与任务。", "Add a route in the scene editor, then create a device and a task.")}</p><a class="button primary" href="#parks/${park.id}/scene">${t("编辑场景", "Edit scene")}</a>`;
}
function overlay() {
  if (!view || !draft) return;
  const objects = draft.objects.filter(
    (o) => o.mapId === mapId && o.level === floorId,
  );
  if (routeDraft.length)
    objects.push({
      id: "draft",
      name: t("未完成路线", "Draft route"),
      type: "route",
      points: routeDraft,
      x: routeDraft[0][0],
      y: routeDraft[0][1],
    });
  view.overlay(
    objects,
    draft.devices.filter((d) => d.mapId === mapId && d.level === floorId),
  );
}
function change(fn) {
  undo.push(structuredClone(draft));
  if (undo.length > 30) undo.shift();
  redo = [];
  fn(draft);
  dirty = true;
  run = null;
}
async function savePark() {
  const saved = await api(`/api/platform/parks/${park.id}`, {
    name: park.name,
    version: park.version,
    data: draft,
  });
  park = saved;
  dirty = false;
  undo = [];
  redo = [];
  data = await api("/api/platform");
  toast(t("园区已保存", "Park saved"));
  await page();
}
function pick(x, y) {
  if (tool === "select") return;
  if (tool === "route") {
    routeDraft.push([+x.toFixed(3), +y.toFixed(3)]);
    overlay();
    return;
  }
  objectDialog(
    {
      id: freshId(),
      name: types()[tool],
      type: tool,
      mapId,
      level: floorId,
      x: +x.toFixed(3),
      y: +y.toFixed(3),
      yaw: 0,
      w: 2,
      h: 2,
      value: tool === "speed" ? 0.5 : 0,
      points: [],
    },
    false,
  );
}
function objectDialog(o, existing) {
  modal(
    t("场景对象", "Scene object"),
    `<div class="form-grid">${field(t("名称", "Name"), "name", o.name, "text", "required")}${field(t("类型", "Type"), "type", o.type, "text", "readonly")}${["x", "y", "yaw", "w", "h", "value"].map((k) => field({ x: "X (m)", y: "Y (m)", yaw: t("朝向 (rad)", "Yaw (rad)"), w: t("宽/长 (m)", "Width/length (m)"), h: t("高/宽 (m)", "Height/width (m)"), value: t("限速值 (m/s) / 保留参数", "Speed limit (m/s) / reserved") }[k], k, o[k], "number", 'step="any" required')).join("")}${o.type === "route" ? area(t("路线点 [x,y]，单位米", "Route points [x,y], metres"), "points", o.points) : ""}</div>`,
    async (f) => {
      const next = { ...o, name: f.get("name") };
      ["x", "y", "yaw", "w", "h", "value"].forEach(
        (k) => (next[k] = num(f, k)),
      );
      if (o.type === "route") next.points = JSON.parse(f.get("points"));
      if (
        !Array.isArray(next.points) ||
        next.points.length > 500 ||
        next.points.some(
          (p) =>
            !Array.isArray(p) ||
            p.length !== 2 ||
            p.some(
              (v) =>
                typeof v !== "number" ||
                !Number.isFinite(v) ||
                Math.abs(v) > 100000,
            ),
        )
      )
        throw Error(
          t(
            "路线必须是有限数字 [x,y] 的数组，最多 500 点",
            "Route must contain finite numeric [x,y] pairs, at most 500 points",
          ),
        );
      change((d) => {
        if (existing)
          d.objects = d.objects.map((v) => (v.id === o.id ? next : v));
        else d.objects.push(next);
      });
      routeDraft = [];
      await page();
    },
  );
}
function deviceList() {
  $("#park-body").innerHTML =
    `<div class="panel"><div class="panel-head"><h2>${t("设备实例", "Device instances")}</h2>${btn(t("创建设备实例", "Create device"), "device-new", "", "primary")}</div>${banner(t("虚拟设备用于仿真；真实设备仅登记资产与通道配置，未接通前不显示“在线”。", "Virtual devices run simulations; physical devices are registered assets/configurations and are not shown online without a connection."))}<div class="table-wrap"><table><thead><tr>${[t("名称", "Name"), t("类型", "Kind"), t("模型版本", "Model version"), t("地图/楼层", "Map/floor"), t("状态", "Status"), t("操作", "Actions")].map((n) => `<th>${n}</th>`).join("")}</tr></thead><tbody>${draft.devices.map((d) => `<tr><td>${esc(d.name)}</td><td>${d.kind === "virtual" ? t("虚拟", "Virtual") : t("实机", "Physical")}</td><td>${esc(data.models.find((m) => m.id === d.model.id)?.name)} v${d.model.version}</td><td>${esc(data.maps.find((m) => m.id === d.mapId)?.name)} / ${esc(d.level)}</td><td>${d.kind === "virtual" ? t("已配置", "Configured") : t("未连接", "Not connected")}</td><td>${btn(t("编辑", "Edit"), "device-edit", d.id)}${btn(t("删除", "Remove"), "device-delete", d.id)}</td></tr>`).join("")}</tbody></table></div></div>`;
}
async function deviceDialog(id) {
  const old = draft.devices.find((d) => d.id === id),
    mapRef =
      draft.maps.find((m) => m.id === (old?.mapId || mapId)) || draft.maps[0],
    mr = await record("maps", mapRef.id, mapRef.version),
    m = old?.model || draft.models[0];
  modal(
    t("设备实例", "Device instance"),
    `<div class="form-grid">${field(t("设备名称", "Device name"), "name", old?.name || "", "text", "required")}${select(
      t("实例类型", "Instance kind"),
      "kind",
      [
        ["virtual", t("虚拟设备", "Virtual")],
        ["physical", t("真实设备（未接通）", "Physical (not connected)")],
      ],
      old?.kind || "virtual",
    )}${select(
      t("设备模型（园区固定版本）", "Model (park-pinned version)"),
      "model",
      draft.models.map((m) => [
        m.id,
        `${data.models.find((v) => v.id === m.id)?.name} v${m.version}`,
      ]),
      m.id,
    )}${select(
      t("地图", "Map"),
      "map",
      draft.maps.map((m) => [m.id, data.maps.find((v) => v.id === m.id)?.name]),
      mapRef.id,
    )}${select(
      t("楼层", "Floor"),
      "level",
      mr.data.levels.map((l) => [l.id, l.id]),
      old?.level || mr.data.levels[0].id,
    )}${select(t("网关", "Gateway"), "gateway", [["", t("未绑定", "Unbound")], ...draft.gateways.map((id) => [id, data.gateways.find((g) => g.id === id)?.name])], old?.gatewayId || "")}${field("X (m)", "x", old?.pose[0] ?? 0, "number", 'step="any" required')}${field("Y (m)", "y", old?.pose[1] ?? 0, "number", 'step="any" required')}${field(t("朝向 (rad)", "Yaw (rad)"), "yaw", old?.pose[2] ?? 0, "number", 'step="any" required')}${field(t("实机序列号（虚拟设备留空）", "Physical serial (blank for virtual)"), "serial", old?.serial || "")}${area(t("绑定通道名称 JSON", "Bound channel names JSON"), "channels", old?.channels || [])}</div>`,
    async (f) => {
      const next = {
        id: old?.id || freshId(),
        name: f.get("name"),
        kind: f.get("kind"),
        model: draft.models.find((m) => m.id === f.get("model")),
        mapId: f.get("map"),
        level: f.get("level"),
        pose: [num(f, "x"), num(f, "y"), num(f, "yaw")],
        serial: f.get("serial"),
        channels: JSON.parse(f.get("channels")),
        ...(f.get("gateway") ? { gatewayId: f.get("gateway") } : {}),
      };
      const nextData = structuredClone(draft);
      nextData.devices = old
        ? nextData.devices.map((d) => (d.id === old.id ? next : d))
        : [...nextData.devices, next];
      const saved = await api(`/api/platform/parks/${park.id}`, {
        name: park.name,
        version: park.version,
        data: nextData,
      });
      park = saved;
      draft = saved.data;
      dirty = false;
      await reload();
    },
  );
  $("#edit-form [name=map]").onchange = async (e) => {
    const ref = draft.maps.find((m) => m.id === e.target.value),
      m = await record("maps", ref.id, ref.version);
    $("#edit-form [name=level]").innerHTML = m.data.levels
      .map((l) => `<option>${esc(l.id)}</option>`)
      .join("");
  };
}
function operations() {
  $("#park-body").innerHTML =
    `<div class="panel"><div class="panel-head"><h2>${t("任务与执行", "Tasks & execution")}</h2>${btn(t("创建任务", "Create task"), "task-new", "", "primary")}</div>${banner(t("园区仿真：单设备、单地图楼层、显式路线的平面运动学。墙体/禁行区参与检测；不运行实机，不生成视频或点云。Chrono 为独立实验室，尚未接入任意园区地图。", "Park simulation: one device, one map floor, explicit route, planar kinematics. Walls/restricted zones are checked. No physical execution, video or point clouds. Chrono remains a separate lab, not an arbitrary-park engine."))}<div class="table-wrap"><table><thead><tr>${[t("任务", "Task"), t("设备", "Device"), t("时长/速度", "Duration/speed"), t("操作", "Actions")].map((n) => `<th>${n}</th>`).join("")}</tr></thead><tbody>${draft.tasks
      .map((j) => {
        const d = draft.devices.find((d) => d.id === j.deviceId);
        return `<tr><td>${esc(j.name)}</td><td>${esc(d?.name)}</td><td>${j.duration} s / ${j.speed} m/s</td><td>${btn(t("编辑", "Edit"), "task-edit", j.id)}${d?.kind === "virtual" ? btn(t("开始仿真", "Run simulation"), "run-task", j.id, "primary") : `<button disabled>${t("实机作业未接通", "Physical operation unavailable")}</button>`}${btn(t("删除", "Remove"), "task-delete", j.id)}</td></tr>`;
      })
      .join(
        "",
      )}</tbody></table></div></div><div class="panel" style="margin-top:18px"><h2>${t("执行记录", "Execution history")}</h2>${jobTable()}<p><a href="/workbench" class="button">${t("独立 Chrono 力学实验室（合成场景）↗", "Separate Chrono mechanics lab (synthetic scene) ↗")}</a></p></div>`;
}
function jobTable() {
  return jobs.length
    ? `<div class="table-wrap"><table><thead><tr><th>${t("任务", "Task")}</th><th>${t("状态", "Status")}</th><th>${t("判定", "Verdict")}</th><th>${t("园区版本", "Park version")}</th><th>${t("操作", "Actions")}</th></tr></thead><tbody>${jobs.map((j) => `<tr><td>${esc(j.taskName)}</td><td>${esc(j.status)}</td><td>${esc(j.verdict || "—")}</td><td>v${j.parkVersion}</td><td>${j.status === "completed" ? btn(t("回放", "Replay"), "replay", j.id) : ["queued", "running"].includes(j.status) ? btn(t("取消", "Cancel"), "cancel-run", j.id) : esc(j.error || "")}</td></tr>`).join("")}</tbody></table></div>`
    : empty(t("暂无执行记录", "No executions yet"));
}
function taskDialog(id) {
  if (!draft.devices.length || !draft.objects.some((o) => o.type === "route"))
    throw Error(
      t(
        "请先创建设备实例，并在场景编辑中添加路线。",
        "Create a device and a route first.",
      ),
    );
  const old = draft.tasks.find((t) => t.id === id);
  modal(
    t("作业任务", "Operation task"),
    `<div class="form-grid">${field(t("任务名称", "Task name"), "name", old?.name || "", "text", "required")}${select(
      t("设备", "Device"),
      "device",
      draft.devices.map((d) => [d.id, d.name]),
      old?.deviceId,
    )}${select(
      t("路线（与设备同地图同楼层）", "Route (same map/floor as device)"),
      "route",
      draft.objects
        .filter((o) => o.type === "route")
        .map((o) => [o.id, o.name]),
      old?.routeId,
    )}${field(t("仿真时长 (s)", "Duration (s)"), "duration", old?.duration || 60, "number", 'min="1" max="180" required')}${field(t("速度 (m/s)", "Speed (m/s)"), "speed", old?.speed || 1, "number", 'step="0.1" min="0.1" max="5" required')}</div>`,
    async (f) => {
      const next = {
          id: old?.id || freshId(),
          name: f.get("name"),
          deviceId: f.get("device"),
          routeId: f.get("route"),
          duration: num(f, "duration"),
          speed: num(f, "speed"),
          engine: "kinematic",
        },
        nextData = structuredClone(draft);
      nextData.tasks = old
        ? nextData.tasks.map((t) => (t.id === old.id ? next : t))
        : [...nextData.tasks, next];
      const saved = await api(`/api/platform/parks/${park.id}`, {
        name: park.name,
        version: park.version,
        data: nextData,
      });
      park = saved;
      draft = saved.data;
      dirty = false;
      await reload();
    },
  );
}
async function startTask(id) {
  if (dirty) throw Error(t("先保存园区修改", "Save park edits first"));
  const j = await api(`/api/platform/parks/${park.id}/runs`, {
    version: park.version,
    taskId: id,
  });
  toast(
    t(
      "仿真作业已创建，控制面板将自动更新并回放",
      "Simulation submitted; the control panel will update and replay automatically",
    ),
  );
  run = null;
  runId = j.id;
  location.hash = `parks/${park.id}/control`;
}
async function showRun(result, token = epoch) {
  const s = result.request.snapshot;
  if (s.parkId !== park.id) throw Error("Run belongs to another park");
  const m = await record("maps", s.mapId, s.mapVersion);
  if (token !== epoch || !view) return;
  run = result;
  mapId = s.mapId;
  floorId = s.levelId;
  frame = Math.min(frame, result.frames.length - 1);
  view.setMap(
    m.data,
    m.data.levels.find((l) => l.id === s.levelId),
    {
      graph: "all",
      walls: true,
      lanes: true,
      facilities: true,
      models: false,
      labels: false,
    },
  );
  $("#park-map").value = mapId;
  $("#park-floor").innerHTML = `<option>${esc(floorId)}</option>`;
  $("#park-timeline").max = result.frames.length - 1;
  $("#run-details").innerHTML =
    `<hr><strong>${esc(result.verdict)}</strong><p class="small">${t("历史快照", "Historical snapshot")} v${s.parkVersion} · ${esc(s.taskName)}<br>${esc(s.mapName)} v${s.mapVersion}</p><pre>${esc(JSON.stringify(result.metrics, null, 2))}</pre><p class="small">${t("仅校验已建模障碍物，不代表园区安全。", "Only modeled obstacles are checked; not park safety validation.")}</p><div class="actions"><a class="button" href="/api/runs/${result.provenance.jobId}/result" download>JSON</a><a class="button" href="/api/runs/${result.provenance.jobId}/report" target="_blank" rel="noopener">${t("报告", "Report")}</a></div>`;
  showFrame();
}
function showFrame() {
  if (!run || !view || !$("#park-timeline")) return;
  const f = run.frames[frame];
  view.overlay(run.request.snapshot.objects, [], f);
  $("#park-timeline").value = frame;
  $("#park-clock").textContent =
    `${f.t.toFixed(1)} / ${run.frames.at(-1).t.toFixed(1)} s`;
  $("#map-caption").textContent = t(
    "回放实验冻结的地图版本和业务对象；不是当前可编辑场景。",
    "Replaying frozen map version and business objects, not the current editable scene.",
  );
}
async function analytics(token) {
  const complete = jobs.filter((j) => j.status === "completed");
  const results = await Promise.all(
    complete.slice(0, 30).map((j) => api(`/api/runs/${j.id}/result`)),
  );
  if (token !== epoch) return;
  $("#park-body").innerHTML = `<div class="stats">${[
    [jobs.length, t("实验总数", "Total runs")],
    [
      complete.length,
      t("已计算完成（非安全通过）", "Computed (not safety pass)"),
    ],
    [
      jobs.filter((j) => j.verdict === "COMPLETED").length,
      t("任务到达终点", "Reached goal"),
    ],
    [
      jobs.filter((j) => j.verdict === "CONTACT").length,
      t("出现采样接触", "Sampled contacts"),
    ],
  ]
    .map(
      ([v, l]) =>
        `<div class="stat"><strong>${v}</strong><span>${l}</span></div>`,
    )
    .join(
      "",
    )}</div><div class="panel"><h2>${t("实验指标与证据", "Run metrics & evidence")}</h2>${banner(t("不同地图、路线和模型版本不能直接判定回归优劣；下表仅并列展示。真实设备统计、能耗和自动根因诊断尚无数据。", "Different map/route/model versions cannot establish regressions. Values below are side-by-side evidence only. No physical telemetry, energy or automatic root-cause data."))}<div class="table-wrap"><table><thead><tr>${[t("任务/版本", "Task/version"), t("时间", "Time"), t("距离 m", "Distance m"), t("最大路径偏差 m", "Max path error m"), t("接触段数", "Contact episodes"), t("证据", "Evidence")].map((n) => `<th>${n}</th>`).join("")}</tr></thead><tbody>${results.map((r) => `<tr><td>${esc(r.request.snapshot.taskName)} / v${r.request.snapshot.parkVersion}</td><td>${esc(r.provenance.createdAt)}</td><td>${r.metrics.distanceM.toFixed(2)}</td><td>${r.metrics.maxPathError.toFixed(3)}</td><td>${r.metrics.contactEpisodes}</td><td>${btn(t("回放", "Replay"), "replay", r.provenance.jobId)}<a href="/api/runs/${r.provenance.jobId}/report" target="_blank" rel="noopener">${t("报告", "Report")}</a></td></tr>`).join("")}</tbody></table></div><p class="small muted">${t("展示最近 30 次完成实验；事件证据包括采样接触和路径偏差超限。", "Showing latest 30 completed runs; evidence includes sampled contacts and tracking-limit events.")}</p></div>`;
}
app.addEventListener("click", (e) => {
  const b = e.target.closest("[data-action]");
  if (b) guard(() => action(b.dataset.action, b.dataset.id, b));
});
async function action(a, id, b) {
  const r = route();
  if (a === "language") {
    lang = lang === "zh" ? "en" : "zh";
    localStorage.setItem("groundwork-language", lang);
    return page();
  }
  if (a === "new") return editResource(id);
  if (a === "edit") {
    const [kind, key] = id.split(":");
    return editResource(kind, key);
  }
  if (a === "preview") return previewMap(id);
  if (["clone", "archive", "versions", "export"].includes(a)) {
    const [kind, key] = id.split(":"),
      old = await record(kind, key);
    if (a === "clone") {
      await api(`/api/platform/${kind}/${key}/clone`, {
        name: `${old.name} ${t("副本", "copy")}`,
      });
      return reload();
    }
    if (a === "archive") {
      if (
        !confirm(
          t(
            "归档此资源？有园区引用时会拒绝，历史版本仍保留。",
            "Archive this resource? References prevent archival; historical versions remain.",
          ),
        )
      )
        return;
      await api(`/api/platform/${kind}/${key}/archive`, {
        version: old.version,
      });
      if (kind === "parks") {
        dirty = false;
        location.hash = "parks";
      }
      return reload();
    }
    if (a === "export")
      return download(`${kind}-${key}.json`, {
        name: old.name,
        data: old.data,
      });
    const versions = await api(`/api/platform/${kind}/${key}/versions`);
    return modal(
      t("历史版本（不可变）", "Immutable versions"),
      `<ul class="rows">${versions.map((v) => `<li><span>v${v.version}</span><a href="/api/platform/${kind}/${key}?version=${v.version}" target="_blank" rel="noopener">${esc(v.updatedAt)} ↗</a></li>`).join("")}</ul>`,
      async () => {},
      t("关闭", "Close"),
    );
  }
  if (a === "import") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = () =>
      guard(async () => {
        const f = input.files[0];
        if (!f) return;
        if (f.size > 4 * 1024 * 1024) throw Error("4 MiB limit");
        const v = JSON.parse(await f.text());
        await api(`/api/platform/${id}`, {
          name: v.name?.zh || v.name || f.name,
          data: v.data || v,
        });
        await reload();
        toast(t("导入成功", "Imported"));
      });
    input.click();
    return;
  }
  if (a === "park-config") {
    if (dirty) throw Error(t("请先保存场景", "Save scene first"));
    return parkDialog(park);
  }
  if (a === "park-export")
    return download(`park-${park.id}.json`, { name: park.name, data: draft });
  if (a === "fit") return view?.reset();
  if (a === "mode") {
    mode = id;
    view?.setMode(mode);
    mode = view?.mode || mode;
    return;
  }
  if (a === "save-park") return savePark();
  if (a === "undo" || a === "redo") {
    const from = a === "undo" ? undo : redo,
      to = a === "undo" ? redo : undo;
    if (from.length) {
      to.push(structuredClone(draft));
      draft = from.pop();
      dirty = true;
    }
    return page();
  }
  if (a === "finish-route") {
    if (routeDraft.length < 2)
      throw Error(t("至少点击两个路线点", "Click at least two route points"));
    return objectDialog(
      {
        id: freshId(),
        name: t("运输路线", "Transport route"),
        type: "route",
        mapId,
        level: floorId,
        x: routeDraft[0][0],
        y: routeDraft[0][1],
        yaw: 0,
        w: 1,
        h: 1,
        value: 0,
        points: routeDraft,
      },
      false,
    );
  }
  if (a === "object-edit")
    return objectDialog(
      draft.objects.find((o) => o.id === id),
      true,
    );
  if (a === "object-delete") {
    if (draft.tasks.some((t) => t.routeId === id))
      throw Error(t("路线仍被任务引用", "Route is used by a task"));
    change((d) => (d.objects = d.objects.filter((o) => o.id !== id)));
    return page();
  }
  if (a === "device-new" || a === "device-edit") return deviceDialog(id);
  if (a === "task-new" || a === "task-edit") return taskDialog(id);
  if (a === "device-delete" || a === "task-delete") {
    if (a === "device-delete" && draft.tasks.some((t) => t.deviceId === id))
      throw Error(t("设备仍被任务引用", "Device is used by a task"));
    change((d) => {
      const k = a === "device-delete" ? "devices" : "tasks";
      d[k] = d[k].filter((x) => x.id !== id);
    });
    return savePark();
  }
  if (a === "run-task") {
    b.disabled = true;
    try {
      return await startTask(id);
    } finally {
      b.disabled = false;
    }
  }
  if (a === "refresh-runs") return page();
  if (a === "cancel-run") {
    await api(`/api/runs/${id}/cancel`, {});
    return page();
  }
  if (a === "replay") {
    const selectedPark = park.id,
      token = ++epoch,
      result = await api(`/api/runs/${id}/result`);
    if (token !== epoch || park?.id !== selectedPark) return;
    run = result;
    runId = id;
    frame = 0;
    location.hash = `parks/${park.id}/control`;
    return page();
  }
  if (a === "play") {
    if (!run)
      throw Error(t("先选择一条完成记录回放", "Choose a completed run"));
    playing = !playing;
    b.textContent = playing ? "Ⅱ" : "▶";
  }
}
let last = 0;
function animate(now) {
  if (playing && run && now - last > 100) {
    frame = (frame + 1) % run.frames.length;
    showFrame();
    last = now;
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
let lastHash = location.hash;
window.addEventListener("hashchange", () => {
  const r = route();
  if (
    (dirty || routeDraft.length) &&
    (r.section !== "parks" || r.id !== park?.id)
  ) {
    if (
      !confirm(
        t("离开将丢弃未保存修改，确定吗？", "Discard unsaved edits and leave?"),
      )
    ) {
      history.replaceState(null, "", lastHash || "#overview");
      return;
    }
    dirty = false;
    routeDraft = [];
  }
  lastHash = location.hash;
  guard(page);
});
let polling = false;
setInterval(async () => {
  if (
    polling ||
    !park ||
    document.hidden ||
    !["control", "operations"].includes(route().tab) ||
    $("#dialog").open
  )
    return;
  if (!runId && !jobs.some((j) => ["queued", "running"].includes(j.status)))
    return;
  polling = true;
  const token = epoch,
    id = park.id;
  try {
    const next = await api(`/api/platform/parks/${id}/runs`);
    if (token !== epoch || park?.id !== id) return;
    const selected = next.find((j) => j.id === runId);
    const changed = JSON.stringify(next) !== JSON.stringify(jobs);
    if (
      selected?.status === "completed" &&
      run?.provenance.jobId !== selected.id &&
      route().tab === "control"
    ) {
      const result = await api(`/api/runs/${selected.id}/result`);
      if (token !== epoch || park?.id !== id) return;
      run = result;
      frame = 0;
      await page();
      playing = true;
    } else if (changed) await page();
  } catch (error) {
    toast(error.message, true);
  } finally {
    polling = false;
  }
}, 1500);
window.addEventListener("beforeunload", (e) => {
  if (dirty || routeDraft.length) {
    e.preventDefault();
    e.returnValue = "";
  }
});
guard(reload);
