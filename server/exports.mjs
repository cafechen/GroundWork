import { escapeHtml } from "./domain.mjs";
const esc = escapeHtml;
function legacyOnly(run) {
  if (run.engine === "park")
    throw Error(
      "Park geometry export adapter is not implemented; use frozen JSON or HTML evidence",
    );
}
// Local-metre exports; no hard-coded private site georeference.
export function exportXosc(run) {
  legacyOnly(run);
  if (run.engine === "chrono")
    throw Error(
      "Dynamic trailer insertion/removal is not supported by this fixed-entity XOSC exporter",
    );
  const actors = new Map();
  for (const frame of run.frames)
    for (const b of frame.bodies) {
      if (b.kind === "drawbar") continue;
      const track = actors.get(b.id) ?? [];
      const p = b.polygon;
      track.push({
        t: frame.t,
        x: p.reduce((s, v) => s + v.x, 0) / p.length,
        y: p.reduce((s, v) => s + v.y, 0) / p.length,
        h: Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x),
      });
      actors.set(b.id, track);
    }
  // A trajectory-library artifact, not a complete executable OpenSCENARIO story.
  return `<?xml version="1.0" encoding="UTF-8"?><OpenSCENARIO><FileHeader revMajor="1" revMinor="1" date="${new Date().toISOString()}" description="GroundWork trajectory catalog, local metres; external XSD/simulator validation required" author="GroundWork"/><Catalog name="GroundWorkTrajectories">${[...actors].map(([id, t]) => `<Trajectory name="${esc(id)}" closed="false"><ParameterDeclarations/><Shape><Polyline>${t.map((p) => `<Vertex time="${p.t}"><Position><WorldPosition x="${p.x}" y="${p.y}" z="0" h="${p.h}" p="0" r="0"/></Position></Vertex>`).join("")}</Polyline></Shape></Trajectory>`).join("")}</Catalog></OpenSCENARIO>`;
}
// Adapts the source converter's route-order graph principle. JSON is valid YAML
// 1.2; the .json artifact is intentionally not advertised as live RMF dispatch.
export function exportRmfGraph(run) {
  legacyOnly(run);
  const vertices = [],
    lanes = [];
  for (const route of run.map.routes) {
    let previous = null;
    for (const p of route) {
      const index = vertices.length;
      vertices.push([p[0], p[1], {}]);
      if (previous !== null) lanes.push([previous, index, {}]);
      previous = index;
    }
  }
  return {
    building_name: "groundwork-synthetic",
    levels: { L1: { vertices, lanes } },
    groundwork: {
      coordinateSystem: "local-metres",
      direction: "route-order-only",
      status: "export-not-live-dispatch",
    },
  };
}
export function exportSdf(run) {
  legacyOnly(run);
  return `<?xml version="1.0"?><sdf version="1.9"><world name="groundwork"><gravity>0 0 -9.81</gravity><model name="ground"><static>true</static><link name="ground"><collision name="floor"><geometry><plane><normal>0 0 1</normal><size>400 400</size></plane></geometry></collision><visual name="floor"><geometry><plane><normal>0 0 1</normal><size>400 400</size></plane></geometry></visual></link></model>${(run.map.obstacles ?? []).map((o, i) => `<model name="obstacle-${i}"><static>true</static><pose>${o.x + o.w / 2} ${o.y + o.h / 2} 1 0 0 0</pose><link name="body"><collision name="body"><geometry><box><size>${o.w} ${o.h} 2</size></box></geometry></collision><visual name="body"><geometry><box><size>${o.w} ${o.h} 2</size></box></geometry></visual></link></model>`).join("")}</world></sdf>`;
}
