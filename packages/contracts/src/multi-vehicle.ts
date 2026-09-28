import { z } from "zod";
import { riskLocationSchema } from "./risk-location.js";
import {
  riskMechanismSchema,
  riskRequestStrictSchema,
} from "./risk-capabilities.js";

const id = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[\w-]+$/);
const num = (min: number, max: number) => z.number().finite().min(min).max(max);
/** 驾驶行为参数 — 跟驰、反应时间、加速度舒适性等纵向行为配置 */
export const drivingProfileSchema = z.object({
  desiredSpeedMps: num(0.1, 40).default(12),
  timeHeadwayS: num(0.5, 4).default(1.5),
  reactionTimeS: num(0, 2).default(0.5),
  minimumGapM: num(1, 15).default(3),
  maxAccelerationMps2: num(0.2, 4).default(2),
  comfortableBrakingMps2: num(0.5, 5).default(2.5),
  /** False only for an explicitly permitted target collision pair. */
  collisionAvoidance: z.boolean().optional(),
});
/** 多车场景参与者 — 车道级定位，含 route 路径、初始状态和驾驶配置 */
export const multiActorSchema = z.object({
  id,
  name: z.string().min(1).max(100),
  role: z.enum(["ego", "event", "background"]),
  controlMode: z.enum(["behavior", "replay", "external"]).default("behavior"),
  vehicleType: z.enum(["car", "heavy_truck"]).default("car"),
  laneId: id,
  route: z.array(id).max(30).default([]),
  positionM: num(0, 100000),
  speedMps: num(0, 40),
  profile: drivingProfileSchema,
  replay: z
    .array(z.object({ t: num(0, 120), positionM: num(0, 100000) }))
    .max(2401)
    .optional(),
});
/** 场景事件 — 由参与者执行的行为事件（变道、制动），支持时间窗和因果触发 */
export const scenarioEventSchema = z.object({
  id,
  actorId: id,
  action: z.enum(["lane_change", "brake"]),
  targetLaneId: id.optional(),
  trigger: z.object({
    earliestS: num(0, 120),
    latestS: num(0, 120),
    leaderGapBelowM: num(1, 150).optional(),
    afterEventId: id.optional(),
  }),
  durationS: num(2, 12).default(4),
  targetSpeedMps: num(0, 40).optional(),
  minimumTargetGapM: num(0, 50).default(5),
});
/**
 * 多车场景规格 V2（车道级）。
 *
 * 这是场景引擎的直接输入格式。由 ScenarioPlan（movement 级，Agent 生成）
 * 经过 compileScenarioPlan 编译而来；也可由 legacy 风险生成器直接构造。
 */
export const sceneSpecV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    title: z.string().min(1).max(200),
    mapId: id,
    mapVersion: z.string().min(1).max(128),
    seed: z.number().int().min(0).max(4294967295),
    reference: z
      .object({
        mode: z.enum(["indexed_reference_replay", "risk_adapted_replay"]),
        dataset: z.literal("wanji-50"),
        sourceId: id,
        sourceKey: z.string().max(500),
        sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
        sourceStartMs: z.number().finite(),
        sourceOffsetS: num(0, 10000),
        sourceDurationS: num(5, 60),
        requestedSpeedFactor: num(0.3, 2),
        appliedSpeedFactor: num(0.05, 2),
        tracks: z
          .array(
            z.object({
              actorId: id,
              sourceUuid: z.string().max(64),
              samples: z
                .array(
                  z.tuple([
                    num(-2, 62),
                    z.number().finite(),
                    z.number().finite(),
                    z.number().finite(),
                  ]),
                )
                .min(6)
                .max(1300),
            }),
          )
          .min(2)
          .max(50),
      })
      .optional(),
    riskDesign: z
      .object({
        kind: riskMechanismSchema,
        request: riskRequestStrictSchema.optional(),
        sourceMapId: id,
        movementIds: z.tuple([id, id]),
        conflictPoint: z.tuple([z.number().finite(), z.number().finite()]),
        attempts: z.number().int().positive(),
        arrivalOffsetS: num(-10, 10),
        sampledParameters: z
          .object({
            speedMps: num(0.1, 40),
            eventSpeedMps: num(0.1, 40).optional(),
            backgroundSpeedMps: num(0.1, 40).optional(),
            lanePairIndex: z.number().int().nonnegative(),
            speedOrderIndex: z.number().int().nonnegative(),
            timingOrderIndex: z.number().int().nonnegative(),
          })
          .optional(),
        sourceProfiles: z
          .array(
            z.object({
              actorId: id,
              sourceUuid: z.string(),
              sourceOffsetS: num(0, 10000).optional(),
              lateralOffsetsM: z.array(num(-1, 1)).min(2),
              speedRatios: z.array(num(0.5, 1.5)).min(2),
            }),
          )
          .length(5),
        causalCheck: z.object({
          egoBrakingGainMps2: z.number().finite(),
          followerBrakingGainMps2: z.number().finite(),
          removedActorId: z.literal("Conflict"),
        }),
      })
      .optional(),
    durationS: num(5, 120),
    actors: z.array(multiActorSchema).min(2).max(50),
    events: z.array(scenarioEventSchema).max(50),
    junction: z
      .object({
        priorities: z.record(id, num(-100, 100)).default({}),
        nonYieldingActorIds: z.array(id).max(50).default([]),
        requiredTraversalActorIds: z.array(id).max(50).default([]),
      })
      .optional(),
    objectives: z.object({
      riskLocation: riskLocationSchema.nullish(),
      requiredEventIds: z.array(id).max(50),
      respondingActorIds: z.array(id).max(50).default([]),
      minimumResponseBrakingMps2: num(0.1, 5).default(0.3),
    }),
    constraints: z.object({
      maxSpeedMps: num(1, 40).default(25),
      maxDecelerationMps2: num(1, 10).default(6),
      maxLateralAccelerationMps2: num(0.5, 10).default(4),
      maxJerkMps3: num(1, 30).default(10),
      maxYawRateRadS: num(0.05, 1).default(0.6),
      allowedCollisionPairs: z
        .array(z.tuple([id, id]))
        .max(1225)
        .default([]),
    }),
  })
  .superRefine((s, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (s.actors.length * s.durationS > 1500)
      issue("单次仿真预算为 1500 车·秒，请减少车辆数量或时长");
    const ids = new Set(s.actors.map((a) => a.id));
    const eventIds = new Set(s.events.map((e) => e.id));
    if (s.riskDesign) {
      if (!s.reference || s.actors.length !== 5)
        issue("危险左转设计需要五车适配轨迹");
      const profiles = s.riskDesign.sourceProfiles;
      if (
        new Set(profiles.map((p) => p.actorId)).size !== 5 ||
        profiles.some((p) => !ids.has(p.actorId))
      )
        issue("驾驶特征必须与五辆车一一对应");
    }
    if (s.reference) {
      if (
        (s.reference.mode === "risk_adapted_replay") !==
        Boolean(s.riskDesign)
      )
        issue("风险适配轨迹必须包含对应的风险设计");
      const referenceIds = s.reference.tracks.map((t) => t.actorId);
      if (
        new Set(referenceIds).size !== referenceIds.length ||
        referenceIds.length !== s.actors.length ||
        referenceIds.some((a) => !ids.has(a))
      )
        issue("参考轨迹必须与参与者一一对应");
      if (
        s.events.length ||
        s.junction ||
        s.actors.some((a) => a.controlMode !== "replay")
      )
        issue("索引参考回放不能混用行为事件或路口控制器");
      if (
        Math.abs(
          s.durationS -
            s.reference.sourceDurationS / s.reference.appliedSpeedFactor,
        ) > 0.01
      )
        issue("参考回放时长与时间缩放不一致");
      for (const t of s.reference.tracks) {
        if (
          t.samples[0]![0] > -0.2 ||
          t.samples.at(-1)![0] < s.reference.sourceDurationS + 0.2 ||
          t.samples.some(
            (p, i) =>
              i > 0 &&
              (p[0] <= t.samples[i - 1]![0] ||
                Math.abs(p[0] - t.samples[i - 1]![0] - 0.1) > 0.002),
          )
        )
          issue("参考轨迹需连续 10 Hz 采样并保留前后边界上下文");
      }
    }
    if (ids.size !== s.actors.length) issue("车辆 ID 必须唯一");
    if (eventIds.size !== s.events.length) issue("事件 ID 必须唯一");
    if (s.actors.filter((a) => a.role === "ego").length !== 1)
      issue("必须有且只有一辆被测车");
    for (const a of s.actors) {
      if (
        a.speedMps > s.constraints.maxSpeedMps ||
        a.profile.desiredSpeedMps > s.constraints.maxSpeedMps
      )
        issue(`${a.id} 速度超出场景限制`);
      if (
        a.controlMode === "replay" &&
        (!a.replay ||
          a.replay.length < 2 ||
          a.replay[0]!.t !== 0 ||
          a.replay[0]!.positionM !== a.positionM ||
          a.replay.at(-1)!.t < s.durationS)
      )
        issue(`${a.id} 回放必须从初始位置开始并覆盖场景时长`);
      if (
        a.replay?.some(
          (f, i, fs) =>
            i > 0 &&
            (f.t <= fs[i - 1]!.t || f.positionM < fs[i - 1]!.positionM),
        )
      )
        issue(`${a.id} 回放时间必须递增、位置不能倒退`);
    }
    for (const event of s.events) {
      const visited = new Set([event.id]);
      let predecessor = event.trigger.afterEventId;
      while (predecessor) {
        if (!eventIds.has(predecessor) || visited.has(predecessor)) {
          issue(`${event.id} 事件依赖不存在或存在循环依赖`);
          break;
        }
        visited.add(predecessor);
        predecessor = s.events.find((e) => e.id === predecessor)?.trigger
          .afterEventId;
      }
    }
    for (const e of s.events) {
      if (!ids.has(e.actorId)) issue(`${e.id} 引用了不存在的车辆`);
      if (s.actors.find((a) => a.id === e.actorId)?.controlMode !== "behavior")
        issue(`${e.id} 只能控制行为模型车辆`);
      if (
        e.trigger.latestS < e.trigger.earliestS ||
        e.trigger.latestS + e.durationS > s.durationS
      )
        issue(`${e.id} 触发窗口和执行时间超出场景时长`);
      if (e.action === "lane_change" && !e.targetLaneId)
        issue(`${e.id} 缺少目标车道`);
      if (e.action === "brake" && e.targetSpeedMps === undefined)
        issue(`${e.id} 缺少目标速度`);
    }
    if (
      s.objectives.requiredEventIds.some((e) => !eventIds.has(e)) ||
      s.objectives.respondingActorIds.some((a) => !ids.has(a))
    )
      issue("目标引用不存在的车辆或事件");
    for (const [a, b] of s.constraints.allowedCollisionPairs)
      if (a === b || !ids.has(a) || !ids.has(b))
        issue("允许碰撞对必须引用两辆不同的现有车辆");
    if (
      s.junction &&
      [
        ...Object.keys(s.junction.priorities),
        ...s.junction.nonYieldingActorIds,
        ...s.junction.requiredTraversalActorIds,
      ].some((a) => !ids.has(a))
    )
      issue("路口配置引用不存在的车辆");
  });
export type SceneSpecV2 = z.infer<typeof sceneSpecV2Schema>;
export type MultiActor = z.infer<typeof multiActorSchema>;
export type ScenarioEvent = z.infer<typeof scenarioEventSchema>;
