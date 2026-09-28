// Static-map schema is deliberately separate from executable run requests.
export const mapIds = [
  "hotel",
  "office",
  "airport_terminal",
  "clinic",
  "campus",
];
export const escapeText = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function validateMap(data, expectedId) {
  const fail = () => {
    throw Error("Invalid static map / 地图数据无效");
  };
  const finite = (n) =>
    typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e7;
  if (
    !data ||
    data.schemaVersion !== 1 ||
    data.id !== expectedId ||
    !mapIds.includes(data.id) ||
    data.capabilities?.simulation !== false ||
    data.units?.length !== "m" ||
    data.units?.angle !== "rad" ||
    !Array.isArray(data.levels) ||
    !data.levels.length ||
    data.levels.length > 10
  )
    fail();
  if (!/^[a-f0-9]{40}$/.test(data.source?.revision ?? "")) fail();
  if (new Set(data.levels.map((l) => l.id)).size !== data.levels.length) fail();
  for (const l of data.levels) {
    if (
      typeof l.id !== "string" ||
      !finite(l.elevation) ||
      !l.bounds ||
      !["x", "y", "w", "h"].every((k) => finite(l.bounds[k])) ||
      Math.min(l.bounds.w, l.bounds.h) <= 0
    )
      fail();
    for (const key of [
      "vertices",
      "lanes",
      "walls",
      "doors",
      "floors",
      "holes",
      "models",
      "graphs",
    ])
      if (!Array.isArray(l[key]) || l[key].length > 20000) fail();
    if (
      !l.vertices.length ||
      !l.vertices.every(
        (v, i) => v.id === i && ["x", "y", "z"].every((k) => finite(v[k])),
      )
    )
      fail();
    const index = (i) => Number.isInteger(i) && i >= 0 && i < l.vertices.length;
    for (const e of [...l.lanes, ...l.walls, ...l.doors])
      if (!index(e.start) || !index(e.end)) fail();
    for (const e of l.lanes)
      if (typeof e.bidirectional !== "boolean" || !Number.isInteger(e.graph))
        fail();
    for (const p of [...l.floors, ...l.holes])
      if (
        !Array.isArray(p.vertices) ||
        p.vertices.length < 3 ||
        !p.vertices.every(index)
      )
        fail();
    for (const m of l.models)
      if (
        !Array.isArray(m.position) ||
        m.position.length !== 3 ||
        !m.position.every(finite) ||
        !finite(m.yaw)
      )
        fail();
    if (
      l.drawing &&
      !new RegExp(
        `^/assets/maps/rmf/source/${data.id}/[A-Za-z0-9_-]+\\.png$`,
      ).test(l.drawing)
    )
      fail();
  }
  if (!Array.isArray(data.lifts) || data.lifts.length > 100) fail();
  for (const l of data.lifts)
    if (
      !Array.isArray(l.position) ||
      l.position.length !== 2 ||
      !l.position.every(finite) ||
      ![l.yaw, l.width, l.depth].every(finite) ||
      Math.min(l.width, l.depth) <= 0 ||
      !Array.isArray(l.levels) ||
      !l.levels.every((id) => data.levels.some((v) => v.id === id))
    )
      fail();
  return data;
}
export function visibleLanes(level, graph = "all") {
  return level.lanes.filter(
    (e) => graph === "all" || e.graph === Number(graph),
  );
}
export function liftPolygon(lift) {
  const c = Math.cos(lift.yaw),
    s = Math.sin(lift.yaw);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => ({
    x: lift.position[0] + (c * a * lift.width) / 2 - (s * b * lift.depth) / 2,
    y: lift.position[1] + (s * a * lift.width) / 2 + (c * b * lift.depth) / 2,
  }));
}
