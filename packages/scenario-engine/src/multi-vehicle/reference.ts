import { sceneSpecV2Schema, type SceneSpecV2 } from "@groundwork/contracts";
import type { MapModel } from "../index.js";
import { bodyWithinLanes, dimensions, overlaps, wgs } from "./geometry.js";
import { approachCruiseStats, crossingRisk } from "./risk-metrics.js";
import { evaluateRiskMechanism } from "./risk-objectives.js";

type Sample = [number, number, number, number];
const angle = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));
/** Uniform cubic B-spline: C2 path smoothing in source time, no random jitter. */
export function referencePoint(samples: Sample[], time: number) {
  const u = (time - samples[0]![0]) / 0.1,
    i = Math.floor(u),
    t = u - i;
  const b = [
    Math.pow(1 - t, 3) / 6,
    (3 * t * t * t - 6 * t * t + 4) / 6,
    (-3 * t * t * t + 3 * t * t + 3 * t + 1) / 6,
    (t * t * t) / 6,
  ];
  const points = [i - 1, i, i + 1, i + 2].map(
    (k) => samples[Math.max(0, Math.min(samples.length - 1, k))]!,
  );
  return {
    x: points.reduce((s, p, k) => s + p[1] * b[k]!, 0),
    y: points.reduce((s, p, k) => s + p[2] * b[k]!, 0),
    heading: points[1]![3],
  };
}
export function validateReference(map: MapModel, input: unknown) {
  const spec = sceneSpecV2Schema.parse(input);
  const hasJunction = map.roads.some((r) => r.junction);
  if (
    !spec.reference ||
    map.mapId !== spec.mapId ||
    (spec.reference.mode === "indexed_reference_replay" && !hasJunction)
  )
    throw new Error("索引轨迹当前仅支持包含路口连接的地图");
  if (spec.riskDesign) {
    const movements = spec.riskDesign.movementIds.map((id) =>
      map.roads.find((r) => r.id === id),
    );
    if (movements.some((r) => !r))
      throw new Error("目标地图缺少指定的冲突路径");
    if (
      spec.riskDesign.request &&
      spec.riskDesign.request.mechanism !== spec.riskDesign.kind
    )
      throw new Error("场景需求与实际冲突机制不一致");
  }
  return spec;
}
export function simulateReference(map: MapModel, input: SceneSpecV2) {
  const spec = validateReference(map, input),
    ref = spec.reference!;
  const actors = [...spec.actors].sort((a, b) => a.id.localeCompare(b.id));
  const paths = new Map(ref.tracks.map((t) => [t.actorId, t.samples]));
  const boxes = map.roads
    .filter((r) => r.polygon)
    .map((r) => ({
      r,
      minX: Math.min(...r.polygon!.map((p) => p[0])) - 4,
      maxX: Math.max(...r.polygon!.map((p) => p[0])) + 4,
      minY: Math.min(...r.polygon!.map((p) => p[1])) - 4,
      maxY: Math.max(...r.polygon!.map((p) => p[1])) + 4,
    }));
  const violations = new Map<
    string,
    { actorId: string; kind: string; time: number; value: number }
  >();
  const collisions = new Map<
    string,
    { actors: string[]; time: number; expected: boolean }
  >();
  const fail = (actorId: string, kind: string, time: number, value: number) => {
    if (!violations.has(actorId + kind))
      violations.set(actorId + kind, { actorId, kind, time, value });
  };
  const features: Array<{
    type: "Feature";
    properties: Record<string, unknown>;
    geometry: { type: "Point"; coordinates: [number, number] };
  }> = [];
  let maxRatio = 1;
  const stats = actors.map((a) => ({
    id: a.id,
    minimumSpeedMps: Infinity,
    maximumBrakingMps2: 0,
    responseBrakingMps2: 0,
    brakingOnsetS: null,
  }));
  for (let step = 0; step <= Math.ceil(spec.durationS / 0.05); step++) {
    const time = Math.min(step * 0.05, spec.durationS),
      sourceTime = time * ref.appliedSpeedFactor;
    const bodies = actors.map((a, index) => {
      const samples = paths.get(a.id)!;
      const delta = 0.025 * ref.appliedSpeedFactor;
      const p = referencePoint(samples, sourceTime),
        m = referencePoint(samples, sourceTime - delta),
        n = referencePoint(samples, sourceTime + delta);
      const mm = referencePoint(samples, sourceTime - 2 * delta),
        nn = referencePoint(samples, sourceTime + 2 * delta);
      const vx = (n.x - m.x) / 0.05,
        vy = (n.y - m.y) / 0.05,
        speed = Math.hypot(vx, vy);
      const ax = (n.x - 2 * p.x + m.x) / (0.025 * 0.025),
        ay = (n.y - 2 * p.y + m.y) / (0.025 * 0.025);
      const acceleration =
        speed > 0.1 ? (vx * ax + vy * ay) / speed : Math.hypot(ax, ay);
      const jx = (nn.x - 2 * n.x + 2 * m.x - mm.x) / (2 * Math.pow(0.025, 3));
      const jy = (nn.y - 2 * n.y + 2 * m.y - mm.y) / (2 * Math.pow(0.025, 3));
      const jerk = Math.hypot(jx, jy),
        yaw = speed > 0.5 ? (vx * ay - vy * ax) / (speed * speed) : 0;
      const lateral = Math.abs(yaw * speed);
      const heading = speed > 0.5 ? Math.atan2(vy, vx) : angle(p.heading);
      const limits = [
        ["speed", speed, spec.constraints.maxSpeedMps, 1],
        [
          "acceleration",
          Math.max(0, acceleration),
          a.profile.maxAccelerationMps2,
          2,
        ],
        [
          "deceleration",
          Math.max(0, -acceleration),
          spec.constraints.maxDecelerationMps2,
          2,
        ],
        ["jerk", jerk, spec.constraints.maxJerkMps3, 3],
        ["yaw_rate", Math.abs(yaw), spec.constraints.maxYawRateRadS, 1],
        [
          "lateral_acceleration",
          lateral,
          spec.constraints.maxLateralAccelerationMps2,
          2,
        ],
      ] as const;
      for (const [kind, value, limit, power] of limits) {
        maxRatio = Math.max(maxRatio, Math.pow(value / limit, 1 / power));
        if (value > limit * 1.03 + 0.02) fail(a.id, kind, time, value);
      }
      const body = { ...p, heading, ...dimensions(a.vehicleType) };
      const nearby = boxes
        .filter(
          (b) =>
            p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY,
        )
        .map((b) => b.r);
      if (!bodyWithinLanes(body, nearby)) fail(a.id, "lane_boundary", time, 1);
      stats[index]!.minimumSpeedMps = Math.min(
        stats[index]!.minimumSpeedMps,
        speed,
      );
      stats[index]!.maximumBrakingMps2 = Math.max(
        stats[index]!.maximumBrakingMps2,
        -acceleration,
      );
      features.push({
        type: "Feature",
        properties: {
          actor: a.id,
          name: a.name,
          role: a.role === "ego" ? "ego" : a.id,
          actorRole: a.role,
          featureType: "trajectoryPoint",
          t: time,
          localX: p.x,
          localY: p.y,
          headingRad: heading,
          speedMps: speed,
          accelerationMps2: acceleration,
          laneId: a.laneId,
          ...dimensions(a.vehicleType),
        },
        geometry: { type: "Point", coordinates: wgs(map, body) },
      });
      return body;
    });
    for (let i = 0; i < bodies.length; i++)
      for (let j = i + 1; j < bodies.length; j++)
        if (overlaps(bodies[i]!, bodies[j]!)) {
          const a = actors[i]!.id,
            b = actors[j]!.id,
            key = a + "/" + b;
          if (!collisions.has(key))
            collisions.set(key, {
              actors: [a, b],
              time,
              expected: spec.constraints.allowedCollisionPairs.some(
                (p) => p.includes(a) && p.includes(b),
              ),
            });
        }
  }
  const physicalPassed = violations.size === 0,
    riskPassed = ![...collisions.values()].some((c) => !c.expected);
  // 按 actor 预分组，避免多次 O(n) filter
  const framesByActor = new Map<
    string,
    Array<{
      t: number;
      x: number;
      y: number;
      heading: number;
      speed: number;
    }>
  >();
  for (const f of features) {
    if (f.properties.featureType !== "trajectoryPoint") continue;
    const id = String(f.properties.actor);
    const arr = framesByActor.get(id);
    const frame = {
      t: Number(f.properties.t),
      x: Number(f.properties.localX),
      y: Number(f.properties.localY),
      heading: Number(f.properties.headingRad),
      speed: Number(f.properties.speedMps),
    };
    if (arr) arr.push(frame);
    else framesByActor.set(id, [frame]);
  }
  const frames = (id: string) => framesByActor.get(id) ?? [];
  const riskObjective = spec.riskDesign
    ? {
        ...crossingRisk(frames("Ego"), frames("Conflict")),
        causalCheck: spec.riskDesign.causalCheck,
        attempts: spec.riskDesign.attempts,
        sourceMapId: spec.riskDesign.sourceMapId,
        meanLateralOffsetM:
          spec.riskDesign.sourceProfiles.reduce(
            (sum, p) =>
              sum +
              p.lateralOffsetsM.reduce((s, n) => s + Math.abs(n), 0) /
                p.lateralOffsetsM.length,
            0,
          ) / 5,
        movingActors: actors.filter((a) => {
          const fs = frames(a.id);
          return (
            fs.reduce(
              (sum, p, i) =>
                sum +
                (i ? Math.hypot(p.x - fs[i - 1]!.x, p.y - fs[i - 1]!.y) : 0),
              0,
            ) > 5
          );
        }).length,
      }
    : undefined;
  const mechanism = riskObjective
    ? evaluateRiskMechanism(map, spec, frames, riskObjective.peakTimeS)
    : undefined;
  const request = spec.riskDesign?.request;
  const outcome = request?.outcome ?? "danger";
  const outcomePassed =
    !riskObjective ||
    (outcome === "collision"
      ? riskObjective.collision
      : outcome === "near_miss"
        ? !riskObjective.collision
        : true);
  // 实际碰撞自动满足任何 TTC 阈值；否则要求预测窗口内出现 minimumTtcS ≤ 阈值。
  const ttcPassed =
    !riskObjective ||
    request?.maxTtcS === undefined ||
    riskObjective.collision ||
    (riskObjective.minimumTtcS !== null &&
      riskObjective.minimumTtcS <= request.maxTtcS);
  // 显式间隙走廊：碰撞（间隙 0）自动满足上限；下限只用于 near_miss，碰撞已被结局门控排除。
  const gapPassed =
    !riskObjective ||
    ((request?.maxGapM === undefined ||
      riskObjective.collision ||
      riskObjective.minimumGapM <= request.maxGapM) &&
      (request?.minGapM === undefined ||
        riskObjective.minimumGapM + 1e-9 >= request.minGapM));
  // PET=0 即碰撞，自动满足上限；PET 为空表示从未共同占用最近相遇位置，不满足。
  const petPassed =
    !riskObjective ||
    request?.maxPetS === undefined ||
    riskObjective.collision ||
    (riskObjective.petS !== null && riskObjective.petS <= request.maxPetS);
  const closingSpeedPassed =
    !riskObjective ||
    request?.minClosingSpeedMps === undefined ||
    riskObjective.closingSpeedMps + 1e-9 >= request.minClosingSpeedMps;
  // 接近段巡航速度：只核验两名主角入弯/冲突反应制动之前的稳定直线窗口，
  // 与生成门控共用 approachCruiseStats 这同一把尺子；窗口不足直接判失败。
  const conflictPoint = spec.riskDesign?.conflictPoint;
  const cruiseStats =
    riskObjective && conflictPoint
      ? {
          ego: approachCruiseStats(frames("Ego"), {
            x: conflictPoint[0],
            y: conflictPoint[1],
          }),
          event: approachCruiseStats(frames("Conflict"), {
            x: conflictPoint[0],
            y: conflictPoint[1],
          }),
        }
      : undefined;
  const speedPassed =
    !riskObjective ||
    request?.minSpeedMps === undefined ||
    (cruiseStats !== undefined &&
      cruiseStats.ego.available &&
      cruiseStats.event.available &&
      Math.min(cruiseStats.ego.minSpeedMps!, cruiseStats.event.minSpeedMps!) +
        1e-9 >=
        request.minSpeedMps);
  const objectivePassed =
    !riskObjective ||
    (riskObjective.achieved &&
      riskObjective.movingActors >= mechanism!.minimumMovingActors &&
      mechanism!.passed &&
      outcomePassed &&
      ttcPassed &&
      gapPassed &&
      petPassed &&
      closingSpeedPassed &&
      speedPassed &&
      riskObjective.causalCheck.egoBrakingGainMps2 > 0.5);
  const report = {
    passed: physicalPassed && riskPassed && objectivePassed,
    riskObjective: riskObjective
      ? {
          ...riskObjective,
          achieved: objectivePassed,
          mechanism,
          outcome,
          outcomePassed,
          ttcPassed,
          ttcThresholdS: request?.maxTtcS ?? null,
          gapPassed,
          maxGapThresholdM: request?.maxGapM ?? null,
          minGapThresholdM: request?.minGapM ?? null,
          petPassed,
          petThresholdS: request?.maxPetS ?? null,
          closingSpeedPassed,
          closingSpeedThresholdMps: request?.minClosingSpeedMps ?? null,
          speedPassed,
          speedThresholdMps: request?.minSpeedMps ?? null,
          approachCruise: cruiseStats
            ? {
                ego: cruiseStats.ego,
                event: cruiseStats.event,
              }
            : null,
        }
      : undefined,
    junction: undefined,
    reference: {
      mode: ref.mode,
      sourceKey: ref.sourceKey,
      sourceId: ref.sourceId,
      sourceSha256: ref.sourceSha256,
      sourceOffsetS: ref.sourceOffsetS,
      requestedSpeedFactor: ref.requestedSpeedFactor,
      appliedSpeedFactor: ref.appliedSpeedFactor,
      requiredSlowdown: maxRatio,
      sourceActors: ref.tracks.map((t) => ({
        actorId: t.actorId,
        uuid: t.sourceUuid,
        sourceOffsetS: spec.riskDesign?.sourceProfiles.find(
          (p) => p.actorId === t.actorId,
        )?.sourceOffsetS,
      })),
      limitation: spec.riskDesign
        ? "目标地图路径与真实驾驶偏移/速度特征结合，搜索冲突时机并用内部驾驶策略生成响应；产物为固定轨迹回放，不响应外接被测系统，碰撞后不模拟接触动力学。"
        : "多车共同时间缩放的参考轨迹回放，不响应外部被测车；碰撞后不模拟接触动力学。",
    },
    semantic: {
      passed: objectivePassed,
      eventPassed: !riskObjective || riskObjective.achieved,
      responsePassed:
        !riskObjective || riskObjective.causalCheck.egoBrakingGainMps2 > 0.5,
      missingResponses: [] as string[],
    },
    physical: { passed: physicalPassed, violations: [...violations.values()] },
    roadGeometry: {
      passed: ![...violations.values()].some((v) => v.kind === "lane_boundary"),
      boundaryBacked: false,
      junctionBacked: true,
      scope: spec.riskDesign
        ? "按目标地图连通路径适配，检查实际车身在车道/路口多边形并集内；法定转向许可仍依赖地图数据。"
        : "按经纬度映射路口地图 0001，检查车道与路口多边形并集；未验证法定方向和类型字典。",
    },
    risk: {
      passed: riskPassed,
      collisionFree: collisions.size === 0,
      collisions: [...collisions.values()],
    },
    events: [] as {
      id: string;
      actorId: string;
      status: "waiting" | "running" | "completed" | "missed";
      startedAt?: number;
      completedAt?: number;
      reason?: string;
    }[],
    actors: stats,
  };
  const lines = actors.map((a) => ({
    type: "Feature" as const,
    properties: {
      actor: a.id,
      role: a.role === "ego" ? "ego" : a.id,
      featureType: "trajectory",
    },
    geometry: {
      type: "LineString" as const,
      coordinates: features
        .filter((f) => f.properties.actor === a.id)
        .map((f) => f.geometry.coordinates),
    },
  }));
  return {
    type: "FeatureCollection" as const,
    properties: {
      originWgs84: map.origin,
      engineVersion: "2.3.0",
      mapVersion: spec.mapVersion,
      seed: spec.seed,
      validationReport: report,
    },
    features: [...lines, ...features],
  };
}

/** Solve a common time-dilation factor, retaining all inter-actor time relations. */
export function optimizeReference(map: MapModel, spec: SceneSpecV2) {
  const candidate = structuredClone(spec);
  for (let i = 0; i < 4; i++) {
    const report = simulateReference(map, candidate).properties
      .validationReport;
    if (report.physical.violations.some((v) => v.kind === "lane_boundary"))
      throw new Error("参考片段车身超出已匹配地图范围");
    if (report.passed) return candidate;
    if (!report.risk.passed) throw new Error("参考片段包含未允许的碰撞");
    const factor =
      candidate.reference!.appliedSpeedFactor /
      (report.reference.requiredSlowdown * 1.05);
    if (
      factor < 0.05 ||
      candidate.reference!.sourceDurationS / factor >
        Math.min(120, 1500 / candidate.actors.length)
    )
      throw new Error("参考片段无法在仿真预算内满足运动约束");
    candidate.reference!.appliedSpeedFactor = factor;
    candidate.durationS = candidate.reference!.sourceDurationS / factor;
    for (const actor of candidate.actors) {
      actor.replay![1]!.t = candidate.durationS;
      actor.speedMps = 0;
    }
  }
  throw new Error("参考片段运动约束优化未收敛");
}
