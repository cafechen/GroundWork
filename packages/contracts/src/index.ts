import { z } from "zod";

/**
 * 契约层数据流向：
 *
 *   ScenarioPlan (scenario-agent.ts)  — Agent 规划输入，movement 级，版本 1
 *        │  compileScenarioPlan
 *        ▼
 *   SceneSpecV2 (multi-vehicle.ts)   — 场景引擎输入规格，lane 级，版本 2
 *        │  simulateMultiVehicle / simulateReference
 *        ▼
 *   FeatureCollection (trajectory)    — 仿真输出轨迹，GeoJSON 格式
 *
 * 遗留类型（仅旧代码使用，新代码请勿依赖）：
 *   - ScenePlan / scenePlanSchema — V1.0 关键帧驱动方案，仅 legacy-planning.service 使用
 */

export * from "./multi-vehicle.js";
export * from "./risk-capabilities.js";
export * from "./workspace.js";

const identifierSchema = z.string().trim().min(1).max(64);
const titleSchema = z.string().trim().min(1).max(200);

export const sceneStatusSchema = z.enum([
  "draft",
  "editing",
  "validating",
  "ready",
  "confirmed",
  "published",
]);
export type SceneStatus = z.infer<typeof sceneStatusSchema>;

export const sceneSummarySchema = z.object({
  id: identifierSchema,
  name: titleSchema,
  description: z.string(),
  source: z.enum(["discover", "asset", "project"]),
  status: sceneStatusSchema,
  tags: z.array(z.string()),
  updatedAt: z.string(),
});
export type SceneSummary = z.infer<typeof sceneSummarySchema>;

export const conversationSummarySchema = z.object({
  id: identifierSchema,
  title: titleSchema,
  projectName: z.string().optional(),
  archived: z.boolean(),
  pinned: z.boolean(),
  updatedAt: z.string(),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

export const keyframeSchema = z.object({
  t: z.number().finite().min(0).max(3_600),
  s: z.number().finite().min(-100_000).max(100_000),
  speedMps: z.number().finite().min(0).max(100),
});
export const planActorSchema = z.object({
  name: titleSchema,
  role: z.enum(["ego", "danger"]),
  vehicleType: z.enum(["car", "heavy_truck"]),
  startLaneId: identifierSchema,
  targetLaneId: identifierSchema,
  initialPositionM: z.number().finite().min(-100_000).max(100_000).optional(),
  initialSpeedMps: z.number().finite().min(0).max(100).optional(),
  keyframes: z.array(keyframeSchema).min(2).max(1_000),
});
export const scenePhaseSchema = z.object({
  name: titleSchema,
  startTimeS: z.number().finite().min(0).max(3_600),
  endTimeS: z.number().finite().min(0).max(3_600),
  description: z.string().max(2_000).optional(),
});
export const sceneConstraintsSchema = z.object({
  maxAccelerationMps2: z.number().finite().positive().max(30),
  maxDecelerationMps2: z.number().finite().positive().max(30),
  maxSpeedMps: z.number().finite().positive().max(100),
  minimumGapM: z.number().finite().min(0).max(1_000),
  collisionFree: z.boolean(),
});

/**
 * 遗留 V1.0 场景方案（关键帧驱动）。
 *
 * @deprecated 新代码使用 SceneSpecV2（多车 v2，车道级）或 ScenarioPlan（Agent 规划，movement 级）。
 *             此类型仅 legacy-planning.service 使用，不建议新代码引入。
 */
export const scenePlanSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    title: titleSchema,
    summary: z.string().trim().min(1).max(4_000),
    durationS: z.number().finite().positive().max(600),
    behaviorType: z.enum([
      "overtake",
      "turn_conflict",
      "crossing",
      "following",
    ]),
    actors: z.array(planActorSchema).min(2).max(10),
    phases: z.array(scenePhaseSchema).min(1).max(100),
    constraints: sceneConstraintsSchema,
    confirmationText: z.string().trim().min(1).max(8_000),
  })
  .superRefine((plan, context) => {
    const roles = new Set(plan.actors.map((actor) => actor.role));
    if (!roles.has("ego") || !roles.has("danger"))
      context.addIssue({
        code: "custom",
        path: ["actors"],
        message: "方案必须包含 ego 和 danger",
      });
    for (const [actorIndex, actor] of plan.actors.entries())
      for (let index = 1; index < actor.keyframes.length; index++) {
        if (actor.keyframes[index]!.t <= actor.keyframes[index - 1]!.t)
          context.addIssue({
            code: "custom",
            path: ["actors", actorIndex, "keyframes", index, "t"],
            message: "关键帧时间必须严格递增",
          });
      }
  });
/**
 * 遗留 V1.0 场景方案类型。
 *
 * @deprecated 见 scenePlanSchema
 */
export type ScenePlan = z.infer<typeof scenePlanSchema>;

export const createConversationSchema = z
  .object({
    title: titleSchema.optional(),
    projectId: identifierSchema.optional(),
  })
  .strict();
export type CreateConversationRequest = z.infer<
  typeof createConversationSchema
>;
export const updateConversationSchema = z
  .object({
    title: titleSchema.optional(),
    status: z.enum(["active", "archived"]).optional(),
    pinned: z.boolean().optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
    activeSceneId: identifierSchema.nullable().optional(),
  })
  .strict();
export type UpdateConversationRequest = z.infer<
  typeof updateConversationSchema
>;
export const addMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(100_000),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type AddMessageRequest = z.infer<typeof addMessageSchema>;
export const updateSceneSchema = z
  .object({
    name: titleSchema.optional(),
    description: z.string().max(20_000).optional(),
    tags: z.array(z.string().trim().min(1).max(64)).max(100).optional(),
    content: z.record(z.string(), z.unknown()).optional(),
    mapId: identifierSchema.optional(),
  })
  .strict();
export type UpdateSceneRequest = z.infer<typeof updateSceneSchema>;
export const agentChatRequestSchema = z
  .object({
    sceneId: identifierSchema.optional(),
    content: z.string().trim().min(1).max(20_000),
    mapId: identifierSchema,
    conversationId: identifierSchema.optional(),
  })
  .strict();
export type AgentChatRequest = z.infer<typeof agentChatRequestSchema>;
export const agentPlanRequestSchema = z
  .object({
    description: z.string().trim().min(1).max(20_000),
    mapId: identifierSchema,
    conversationId: identifierSchema.optional(),
  })
  .strict();
export type AgentPlanRequest = z.infer<typeof agentPlanRequestSchema>;

export interface HealthResponse {
  status: "ok";
  service: string;
  timestamp: string;
}

export * from "./scenario-agent.js";
export * from "./risk-location.js";
