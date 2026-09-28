import { z } from "zod";
import { riskRequestSchema } from "./risk-capabilities.js";
import { drivingProfileSchema } from "./multi-vehicle.js";
import { riskLocationSchema } from "./risk-location.js";

const planId = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[\w-]+$/);
const finiteRange = (min: number, max: number) =>
  z.number().finite().min(min).max(max);

export const mapMovementSchema = z
  .object({
    id: planId,
    laneIds: z.array(planId).min(1).max(30),
    kind: z.enum(["road", "junction"]),
    junctionId: z.string().min(1).max(128).optional(),
    turn: z.enum(["straight", "left", "right"]).optional(),
    lengthM: z.number().finite().positive(),
    initialCenterRangeM: z
      .object({
        car: z.tuple([z.number().finite(), z.number().finite()]).nullable(),
        heavy_truck: z
          .tuple([z.number().finite(), z.number().finite()])
          .nullable(),
      })
      .strict()
      .optional(),
    successorIds: z.array(planId).max(30),
    adjacent: z
      .array(
        z.object({
          movementId: planId,
          side: z.enum(["left", "right"]),
        }),
      )
      .max(10),
    distanceToJunctionM: z.number().finite().nullable().optional(),
    junctionRole: z
      .enum(["approach", "inside", "exit", "midblock"])
      .optional(),
  })
  .strict();

export const mapAffordanceCatalogSchema = z
  .object({
    mapId: planId,
    mapVersion: z.string().min(1).max(128),
    movements: z.array(mapMovementSchema).min(1).max(48),
    junctions: z
      .array(
        z
          .object({
            id: z.string().min(1).max(128),
            regionAvailable: z.boolean(),
          })
          .strict(),
      )
      .optional(),
    conflicts: z
      .array(
        z
          .object({
            id: planId,
            type: z.enum(["crossing", "opposing", "merge"]),
            movementIds: z.tuple([planId, planId]),
          })
          .strict(),
      )
      .max(96),
  })
  .strict();
export type MapAffordanceCatalog = z.infer<typeof mapAffordanceCatalogSchema>;

const plannedActorSchema = z
  .object({
    id: planId,
    name: z.string().min(1).max(100),
    role: z.enum(["ego", "event", "background"]),
    vehicleType: z.enum(["car", "heavy_truck"]).default("car"),
    movementId: planId,
    routeMovementIds: z.array(planId).max(30).default([]),
    positionM: finiteRange(0, 100000),
    speedMps: finiteRange(0, 40),
    profile: drivingProfileSchema,
  })
  .strict();

const plannedEventSchema = z
  .object({
    id: planId,
    actorId: planId,
    action: z.enum(["lane_change", "brake", "yield"]),
    targetMovementId: planId.optional(),
    trigger: z
      .object({
        earliestS: finiteRange(0, 120),
        latestS: finiteRange(0, 120),
        leaderGapBelowM: finiteRange(1, 150).optional(),
        afterEventId: planId.optional(),
      })
      .strict(),
    durationS: finiteRange(2, 12).default(4),
    targetSpeedMps: finiteRange(0, 40).optional(),
    minimumTargetGapM: finiteRange(0, 50).default(5),
  })
  .strict();

/**
 * Agent 生成的场景方案（movement 级）。
 *
 * 这是大模型输出的高层设计，使用地图可供性目录中的 movement ID 描述路线和事件。
 * 需经 compileScenarioPlan 编译为 SceneSpecV2（车道级）后，才能送入仿真引擎。
 */
export const scenarioPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string().min(1).max(200),
    summary: z.string().min(1).max(4000),
    mapId: planId,
    mapVersion: z.string().min(1).max(128),
    seed: z.number().int().min(0).max(4294967295),
    durationS: finiteRange(5, 120),
    actors: z.array(plannedActorSchema).min(2).max(50),
    events: z.array(plannedEventSchema).max(50),
    junction: z
      .object({
        priorities: z.record(planId, finiteRange(-100, 100)).default({}),
        nonYieldingActorIds: z.array(planId).max(50).default([]),
        requiredTraversalActorIds: z.array(planId).max(50).default([]),
      })
      .strict()
      .optional(),
    objectives: z
      .object({
        outcome: z.enum(["behavior", "danger", "collision", "near_miss"]),
        riskLocation: riskLocationSchema.nullish(),
        requiredEventIds: z.array(planId).max(50),
        respondingActorIds: z.array(planId).max(50).default([]),
        minimumResponseBrakingMps2: finiteRange(0.1, 5).default(0.3),
      })
      .strict(),
    constraints: z
      .object({
        maxSpeedMps: finiteRange(1, 40).default(25),
        maxDecelerationMps2: finiteRange(1, 10).default(6),
        maxLateralAccelerationMps2: finiteRange(0.5, 10).default(4),
        maxJerkMps3: finiteRange(1, 30).default(10),
        maxYawRateRadS: finiteRange(0.05, 1).default(0.6),
        allowedCollisionPairs: z
          .array(z.tuple([planId, planId]))
          .max(1225)
          .default([]),
      })
      .strict(),
    variations: z
      .array(
        z
          .object({
            target: z.enum([
              "actor_position",
              "actor_speed",
              "reaction_time",
              "event_start",
            ]),
            actorId: planId.optional(),
            eventId: planId.optional(),
            min: z.number().finite(),
            max: z.number().finite(),
          })
          .strict()
          .refine((v) => v.min <= v.max, "变化范围最小值不能大于最大值"),
      )
      .max(30)
      .default([]),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const actorIds = new Set(plan.actors.map((actor) => actor.id));
    const eventIds = new Set(plan.events.map((event) => event.id));
    if (actorIds.size !== plan.actors.length)
      ctx.addIssue({ code: "custom", message: "参与者 ID 必须唯一" });
    if (eventIds.size !== plan.events.length)
      ctx.addIssue({ code: "custom", message: "事件 ID 必须唯一" });
    for (const event of plan.events) {
      if (!actorIds.has(event.actorId))
        ctx.addIssue({
          code: "custom",
          message: `${event.id} 引用了未知参与者`,
        });
      if (event.action === "lane_change" && !event.targetMovementId)
        ctx.addIssue({
          code: "custom",
          message: `${event.id} 缺少目标 movement`,
        });
      if (
        event.trigger.afterEventId &&
        !eventIds.has(event.trigger.afterEventId)
      )
        ctx.addIssue({
          code: "custom",
          message: `${event.id} 的前置事件不存在`,
        });
    }
    if (plan.objectives.requiredEventIds.some((id) => !eventIds.has(id)))
      ctx.addIssue({ code: "custom", message: "验收目标引用了未知事件" });
    if (plan.objectives.respondingActorIds.some((id) => !actorIds.has(id)))
      ctx.addIssue({ code: "custom", message: "响应目标引用了未知参与者" });
    for (const variation of plan.variations) {
      if (variation.target === "event_start") {
        if (!variation.eventId)
          ctx.addIssue({
            code: "custom",
            message: "事件变化参数必须指定 eventId",
          });
        else if (!eventIds.has(variation.eventId))
          ctx.addIssue({ code: "custom", message: "变化参数引用了未知事件" });
      } else if (!variation.actorId || !actorIds.has(variation.actorId)) {
        ctx.addIssue({
          code: "custom",
          message: "变化参数引用了未知参与者",
        });
      }
    }
    if (plan.actors.length * plan.durationS > 1500)
      ctx.addIssue({ code: "custom", message: "场景超过 1500 车·秒预算" });
  });
export type ScenarioPlan = z.infer<typeof scenarioPlanSchema>;
const scenarioGoalObjectSchema = z.object({
  summary: z.string().min(1).max(4000),
  // A vehicle count is a hard constraint only when the user explicitly gave
  // one. When omitted, ScenarioPlan may choose any engine-supported count.
  count: z.number().int().min(2).max(50).optional(),
  outcome: z.enum(["behavior", "danger", "collision", "near_miss"]),
  requiredActions: z.array(z.enum(["lane_change", "brake"])).max(50),
  riskLocation: riskLocationSchema.nullish(),
  // Free-text soft preferences the user expressed (spacing, pacing, ordering…)
  // that have no dedicated structured constraint but should still be honored
  // with high priority by the design model.
  preferences: z.array(z.string().min(1).max(200)).max(8).optional(),
  // Explicit compatibility request; count/outcome remain in the original goal.
  legacyRisk: riskRequestSchema
    .pick({
      mechanism: true,
      approach: true,
      maxTtcS: true,
      maxGapM: true,
      minGapM: true,
      maxPetS: true,
      minClosingSpeedMps: true,
      minSpeedMps: true,
    })
    .nullish(),
});
export const scenarioGoalSchema = scenarioGoalObjectSchema
  .strict()
  .superRefine((goal, ctx) => {
    if (goal.riskLocation && goal.outcome === "behavior")
      ctx.addIssue({
        code: "custom",
        path: ["riskLocation"],
        message: "事故区域只用于危险、碰撞或近失目标",
      });
    const legacy = goal.legacyRisk;
    if (!legacy) return;
    if (legacy.minGapM !== undefined && goal.outcome !== "near_miss")
      ctx.addIssue({
        code: "custom",
        path: ["legacyRisk", "minGapM"],
        message: "近失间隙下限 minGapM 只能用于不碰撞（near_miss）目标",
      });
    if (
      legacy.minGapM !== undefined &&
      legacy.maxGapM !== undefined &&
      legacy.minGapM >= legacy.maxGapM
    )
      ctx.addIssue({
        code: "custom",
        path: ["legacyRisk", "minGapM"],
        message: "minGapM 必须小于 maxGapM，间隙走廊不能为空",
      });
  });
export const scenarioIntentSchema = z
  .object({
    action: z.enum(["generate", "revise", "question", "clarify"]),
    goal: scenarioGoalSchema.nullish(),
    answer: z.string().max(4000).nullish(),
    unsupported: z.string().max(4000).nullish(),
  })
  .strict();
export type ScenarioGoal = z.infer<typeof scenarioGoalSchema>;
/** Main conversation cannot ask the model to select a legacy solver. Historical
 * goals still use scenarioGoalSchema so old assets remain readable. */
export const scenarioPlanIntentSchema = scenarioIntentSchema.extend({
  goal: scenarioGoalObjectSchema
    .omit({ legacyRisk: true })
    .strict()
    .refine(
      (goal) => !goal.riskLocation || goal.outcome !== "behavior",
      "事故区域只用于危险、碰撞或近失目标",
    )
    .nullish(),
});
export const scenarioArtifactSchema = z.object({
  bucket: z.string().min(1),
  objectKey: z.string().min(1),
  etag: z.string().min(1),
});
export type ScenarioArtifact = z.infer<typeof scenarioArtifactSchema>;

export const behaviorObjectiveSummarySchema = z.object({
  passed: z.boolean(),
  outcome: scenarioGoalObjectSchema.shape.outcome,
  outcomePassed: z.boolean(),
  eventsPassed: z.boolean(),
  locationPassed: z.boolean().optional(),
});
export type BehaviorObjectiveSummary = z.infer<
  typeof behaviorObjectiveSummarySchema
>;
