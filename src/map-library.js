import { MapViewer } from "./map-viewer.js";
import {
  escapeText as esc,
  mapIds,
  validateMap,
  visibleLanes,
} from "./map-data.js";

const app = document.querySelector("#map-app");
let lang =
  new URLSearchParams(location.search).get("lang") === "en" ? "en" : "zh";
let catalog = [],
  current = null,
  floor = null,
  epoch = 0,
  viewer;
let mode = "2d";
const options = {
  graph: "all",
  walls: true,
  lanes: true,
  facilities: true,
  models: false,
  labels: false,
};
const t = (zh, en) => (lang === "zh" ? zh : en);
const $ = (s) => document.querySelector(s);
function status(message, error = false) {
  $("#map-status").textContent = message;
  $("#map-status").className = `notice${error ? " error" : ""}`;
  $("#map-status").hidden = !message;
}
async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw Error(`${t("读取失败", "Load failed")}: HTTP ${r.status}`);
  return r.json();
}
function shell() {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  app.innerHTML = `<div class="map-page"><header class="map-header"><a href="/" class="wordmark"><img src="/assets/mark.svg" alt="">GroundWork</a><nav><a href="/">← ${t("返回实验工作台", "Experiment workbench")}</a><button id="map-language">${lang === "zh" ? "EN" : "中文"}</button></nav></header>
  <section class="map-intro"><div class="eyebrow">MODULE A / MAP LIBRARY</div><h1>${t("从场景地图结构开始", "Start with the map structure")}</h1><p>${t("Open-RMF 示例地图 · 5 张已导入，1 张待取得源码。此处只查看静态几何与导航拓扑，不运行车辆、门禁或电梯。", "Open-RMF demo maps · 5 imported, 1 awaiting source. Inspect static geometry and navigation topology here; vehicles, doors and lifts are not simulated.")}</p></section>
  <div id="map-status" role="status" hidden></div><div class="map-grid"><aside id="map-list" class="map-list" aria-label="Maps"></aside><section class="map-main"><div class="map-tools"><strong id="map-name"></strong><label>${t("楼层", "Floor")} <select id="map-floor" aria-label="Floor"></select></label><label>${t("导航图", "Graph")} <select id="map-graph" aria-label="Graph"></select></label><button data-map-mode="2d">2D</button><button data-map-mode="3d">3D</button><button id="map-reset">${t("全景", "Fit")}</button></div><div class="map-checks">${[
    ["walls", "墙体", "Walls"],
    ["lanes", "路线", "Lanes"],
    ["facilities", "门/电梯", "Doors/lifts"],
    ["models", "模型位置标记", "Model anchors"],
    ["labels", "站点名称（2D）", "Names (2D)"],
  ]
    .map(
      ([key, zh, en]) =>
        `<label><input type="checkbox" data-layer="${key}" ${options[key] ? "checked" : ""}>${t(zh, en)}</label>`,
    )
    .join(
      "",
    )}</div><div id="map-viewport" class="map-viewport"></div><div class="map-legend"><span style="color:#27745d">● ${t("导航 · 箭头为单向", "Lanes · arrows are one-way")}</span><span style="color:#c38b36">━ ${t("门", "Door")}</span><span style="color:#8062ad">□ ${t("电梯", "Lift")}</span><span style="color:#9b7e63">● ${t("模型位置，不是轮廓", "Model anchor, not footprint")}</span></div><div class="map-caption" id="map-caption"></div></section><aside id="map-inspector" class="map-inspector"></aside></div><details class="map-source"><summary>${t("来源、坐标变换与文件校验值", "Source, coordinate transforms & file hashes")}</summary><pre id="map-source"></pre></details></div>`;
  viewer = new MapViewer($("#map-viewport"));
  viewer.setMode(mode);
  $("#map-language").onclick = () => {
    lang = lang === "zh" ? "en" : "zh";
    viewer.observer?.disconnect();
    viewer.clear(viewer.fixed);
    viewer.clear(viewer.dynamic);
    viewer.renderer?.dispose();
    shell();
  };
  $("#map-floor").onchange = (e) => {
    floor = e.target.value;
    options.graph = "all";
    viewer.reset();
    render();
  };
  $("#map-graph").onchange = (e) => {
    options.graph = e.target.value;
    render();
  };
  $("#map-reset").onclick = () => viewer.reset();
  document.querySelectorAll("[data-layer]").forEach(
    (el) =>
      (el.onchange = () => {
        options[el.dataset.layer] = el.checked;
        render();
      }),
  );
  document.querySelectorAll("[data-map-mode]").forEach(
    (el) =>
      (el.onclick = () => {
        mode = el.dataset.mapMode;
        viewer.setMode(mode);
        mode = viewer.mode;
        render();
        if (viewer.error)
          status(
            t("WebGL 不可用，已使用 2D。", "WebGL unavailable; using 2D."),
            true,
          );
      }),
  );
  renderList();
  if (current) render();
}
function renderList() {
  $("#map-list").innerHTML = catalog
    .map(
      (m) =>
        `<button class="map-tile${m.id === current?.id ? " active" : ""}" data-map-id="${esc(m.id)}" ${m.available ? "" : "disabled"}><strong>${esc(m.name[lang])}</strong><small>${esc(m.name.en)} World</small><small>${m.available ? `${m.levels.length} ${t("层 · 地图已导入", "floor(s) · imported")}` : t("待补 · 尚无地图源码", "Pending · source unavailable")}</small></button>`,
    )
    .join("");
  document
    .querySelectorAll("[data-map-id]:not(:disabled)")
    .forEach((el) => (el.onclick = () => load(el.dataset.mapId)));
}
async function load(id) {
  if (!mapIds.includes(id)) return;
  const token = ++epoch;
  status(t("正在载入地图…", "Loading map…"));
  try {
    const data = validateMap(await json(`/assets/maps/rmf/${id}.json`), id);
    if (token !== epoch) return;
    current = data;
    floor = data.levels[0].id;
    options.graph = "all";
    viewer.reset();
    render();
    status("");
  } catch (error) {
    if (token === epoch)
      status(
        `${error.message} · ${t("保留之前的地图", "Previous map preserved")}`,
        true,
      );
  }
}
function render() {
  if (!current) return;
  const l = current.levels.find((x) => x.id === floor),
    lanes = visibleLanes(l, options.graph);
  $("#map-name").textContent = current.name[lang];
  $("#map-floor").innerHTML = current.levels
    .map(
      (x) =>
        `<option value="${esc(x.id)}">${esc(x.id)} · ${x.elevation} m</option>`,
    )
    .join("");
  $("#map-floor").value = floor;
  $("#map-graph").innerHTML =
    `<option value="all">${t("全部", "All")}</option>` +
    l.graphs.map((x) => `<option value="${x}">Graph ${x}</option>`).join("");
  $("#map-graph").value = options.graph;
  document
    .querySelectorAll("[data-map-mode]")
    .forEach((el) =>
      el.classList.toggle("selected", el.dataset.mapMode === mode),
    );
  const lifts = current.lifts.filter((x) => x.levels.includes(l.id));
  const nodes = new Set(lanes.flatMap((e) => [e.start, e.end]));
  const entries = [
    [t("楼层标高", "Floor elevation"), `${l.elevation} m`],
    [t("导航顶点", "Navigation vertices"), nodes.size],
    [
      t("路线 / 单向", "Lanes / one-way"),
      `${lanes.length} / ${lanes.filter((e) => !e.bidirectional).length}`,
    ],
    [
      t("墙段 / 地板多边形", "Wall segments / floors"),
      `${l.walls.length} / ${l.floors.length}`,
    ],
    [t("门 / 电梯", "Doors / lifts"), `${l.doors.length} / ${lifts.length}`],
    [t("外部模型位置", "External model anchors"), l.models.length],
  ];
  const list = (title, values) =>
    `<details><summary>${title} (${values.length})</summary><ul>${values.map((v) => `<li>${esc(v)}</li>`).join("")}</ul></details>`;
  $("#map-inspector").innerHTML =
    `<h2>${t("地图结构", "Map structure")}</h2><span class="pill">${t("静态地图 · 不可运行实验", "STATIC MAP · NOT SIMULATION")}</span><dl>${entries.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl><p>${t("墙体按上游默认高度 2.5 m 示意；外部 Gazebo 模型仅保留位置，不代表障碍物尺寸或碰撞体。", "Walls use the upstream 2.5 m display default. External Gazebo models retain anchors only, not dimensions or collision geometry.")}</p>${current.id === "campus" ? `<p class="notice">${t("Campus 的建筑环境来自外部模型，本批未包含其网格；当前显示导航拓扑。源图片仅供参考，未做贴图配准。", "Campus buildings come from an external mesh, not included here. This view shows navigation topology. Source images are unregistered references only.")}</p>` : ""}${list(
      t("命名站点", "Named waypoints"),
      l.vertices.filter((v) => v.name).map((v) => `#${v.id} · ${v.name}`),
    )}${list(t("设施", "Facilities"), [...l.doors.map((d) => `${d.parameters.name} · ${d.parameters.type}`), ...lifts.map((v) => `${v.id} · ${v.levels.join(" / ")}`)])}${list(t("模型引用（未加载网格）", "Model references (meshes not loaded)"), [...new Set(l.models.map((v) => v.model))])}<div class="map-links"><a download href="/assets/maps/rmf/${current.id}.json">↓ ${t("标准化地图 JSON", "Normalized map JSON")}</a><a download href="/assets/maps/rmf/source/${current.id}/${current.id}.building.yaml">↓ ${t("原始 RMF YAML", "Original RMF YAML")}</a>${l.drawing ? `<a href="${esc(l.drawing)}" target="_blank" rel="noopener">${t("查看原始平面图", "View original drawing")} ↗</a>` : ""}${current.id === "campus" ? `<a href="/assets/maps/rmf/source/campus/campus_reference.png" target="_blank" rel="noopener">${t("未配准参考图", "Unregistered reference image")} ↗</a>` : ""}<a href="/assets/maps/rmf/licenses/rmf_demos.txt" target="_blank" rel="noopener">Apache-2.0 ↗</a></div>`;
  $("#map-source").textContent = JSON.stringify(
    {
      source: current.source,
      coordinateTransform: current.coordinateTransform,
      levelTransform: l.transform,
      capabilities: current.capabilities,
      warnings: current.warnings,
    },
    null,
    2,
  );
  $("#map-caption").textContent = t(
    "m / rad · 单层视图，3D 中本层地面置于 z=0，标高单独保留。拖拽平移（2D）或旋转（3D），滚轮缩放。原始底图保留供核对，不作为碰撞模型。",
    "m / rad · Single-floor view; 3D places this floor at z=0 and retains its elevation separately. Drag to pan (2D) or orbit (3D); scroll to zoom. Source drawings are references, not collision models.",
  );
  viewer.setMap(current, l, options);
  renderList();
}
shell();
try {
  const data = await json("/assets/maps/rmf/catalog.json");
  if (
    data.schemaVersion !== 1 ||
    !Array.isArray(data.maps) ||
    data.maps.length !== 6 ||
    data.maps.filter((m) => m.available).length !== 5 ||
    data.maps.some((m) => m.available && !mapIds.includes(m.id))
  )
    throw Error("Invalid map catalog");
  catalog = data.maps;
  renderList();
  await load("hotel");
} catch (error) {
  status(error.message, true);
}
