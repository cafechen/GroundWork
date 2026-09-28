// Hand-authored synthetic data; no changes to the engine or collision rules.
export function readyYard({
  mapId = "demo-map",
  modelId = "demo-model",
  gatewayId = "demo-gateway",
} = {}) {
  const points = [
    [8, 6],
    [24, 6],
  ];
  for (let i = 1; i <= 12; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 24;
    points.push([24 + 6 * Math.cos(a), 12 + 6 * Math.sin(a)]);
  }
  points.push([30, 18]);
  for (let i = 1; i <= 12; i++) {
    const a = (i * Math.PI) / 24;
    points.push([24 + 6 * Math.cos(a), 18 + 6 * Math.sin(a)]);
  }
  points.push([10, 24]);
  const vertices = [
    [0, 0],
    [40, 0],
    [40, 32],
    [0, 32],
    [12, 12],
    [22, 12],
    [22, 18],
    [12, 18],
    ...points,
  ].map(([x, y], id) => ({ id, x, y, z: 0, name: "", parameters: {} }));
  const walls = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
  ].map(([start, end], id) => ({ id, start, end, parameters: {} }));
  const map = {
    name: "演示物流园底图（合成） / Synthetic yard",
    data: {
      schemaVersion: 1,
      id: "ready-yard",
      name: { zh: "演示物流园（合成）", en: "Synthetic logistics yard" },
      units: { length: "m", angle: "rad" },
      source: {
        kind: "hand-authored-synthetic",
        description:
          "GroundWork illustrative example; not RMF Hotel or a surveyed site",
      },
      coordinateTransform: { source: "local-metres", origin: [0, 0] },
      capabilities: {
        geometry: true,
        navigation: true,
        simulation: false,
        liveControl: false,
      },
      warnings: ["SYNTHETIC_NOT_SURVEYED", "PLANAR_UNCALIBRATED"],
      lifts: [],
      levels: [
        {
          id: "L1",
          elevation: 0,
          vertices,
          walls,
          lanes: points
            .slice(1)
            .map((_, i) => ({
              id: i,
              start: 8 + i,
              end: 9 + i,
              graph: 0,
              bidirectional: false,
              parameters: {},
            })),
          doors: [],
          floors: [{ vertices: [0, 1, 2, 3], parameters: {} }],
          holes: [],
          models: [],
          graphs: [0],
          bounds: { x: -2, y: -2, w: 44, h: 36 },
        },
      ],
    },
  };
  const model = {
    name: "演示牵引车＋单挂车 / Demo tugger",
    data: {
      category: "tugger",
      description:
        "Generic uncalibrated planar tugger, one on-axle trailer; not a manufacturer model.",
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
    },
  };
  const object = (id, name, type, x, y, w, h, extra = {}) => ({
    id,
    name,
    type,
    mapId,
    level: "L1",
    x,
    y,
    yaw: 0,
    w,
    h,
    value: 0,
    points: [],
    ...extra,
  });
  const park = {
    name: "可运行示例 · 牵引车物流园",
    data: {
      description:
        "合成演示：单挂车从装货点出发，经过限速区、沿已绘路线绕过仓库，到达卸货点。平面运动学；装卸仅为站点标注，无实际装卸动作。",
      maps: [{ id: mapId, version: 1, pose: [0, 0, 0] }],
      models: [{ id: modelId, version: 1 }],
      gateways: [gatewayId],
      objects: [
        object(
          "delivery-route",
          "运输路线 / Delivery route",
          "route",
          8,
          6,
          1,
          1,
          { points },
        ),
        object("loading", "起点·装货位 / Start", "loading", 8, 6, 3, 3),
        object("unloading", "终点·卸货位 / Goal", "unloading", 10, 24, 3, 3),
        object(
          "warehouse",
          "仓库·禁行 / Warehouse",
          "restricted",
          17,
          15,
          10,
          6,
        ),
        object("slow", "限速 0.6 m/s / Slow zone", "speed", 17, 6, 6, 5, {
          value: 0.6,
        }),
        object(
          "charging",
          "充电位（标注） / Charging marker",
          "charging",
          35,
          26,
          3,
          3,
        ),
      ],
      devices: [
        {
          id: "demo-tugger",
          name: "演示牵引车 A",
          kind: "virtual",
          model: { id: modelId, version: 1 },
          mapId,
          level: "L1",
          pose: [8, 6, 0],
          gatewayId,
          serial: "",
          channels: ["state", "events"],
        },
      ],
      tasks: [
        {
          id: "demo-delivery",
          name: "绕仓运输演示 / Yard delivery",
          deviceId: "demo-tugger",
          routeId: "delivery-route",
          duration: 65,
          speed: 1.2,
          engine: "kinematic",
        },
      ],
    },
  };
  return { map, model, park };
}
