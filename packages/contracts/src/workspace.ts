import type { SceneSpecV2 } from "./multi-vehicle.js";
import type { BehaviorObjectiveSummary } from "./scenario-agent.js";

// JSON response shapes consumed by the workspace, including historical scene formats.
// 注意：content 可能包含多个历史版本的格式，类型为放宽的兼容形状。
// 当前版本使用 SceneSpecV2（schemaVersion: 2），通过 content.spec 访问。
export type SceneResponse = {
  id: string;
  code: string;
  name: string;
  description: string;
  source: string;
  status: string;
  tags: string[];
  mapId?: string;
  updatedAt?: string;
  content?: {
    duration_s?: number; // 旧版蛇形命名，已废弃
    durationS?: number; // 当前规范命名（秒）
    actors?: unknown[];
    /** 场景规格 — 当前版本为 SceneSpecV2 (schemaVersion: 2)，保留宽松类型以兼容历史格式 */
    spec?: SceneSpecV2 | Record<string, unknown>;
    staleGeometry?: boolean;
    format?: string;
    xosc?: string;
    validation_report?: {
      behaviorObjective?: BehaviorObjectiveSummary;
      passed?: boolean;
      riskObjective?: {
        mechanism?: {
          label: string;
          passed: boolean;
          checks: Array<{ label: string; passed: boolean }>;
          minimumMovingActors: number;
        };
        achieved: boolean;
        collision: boolean;
        peakTimeS: number;
        minimumGapM: number;
      };
    };
  };
};
export type ConversationResponse = {
  id: string;
  title: string;
  pinned: boolean;
  status: string;
  updatedAt: string;
  project?: { name: string };
};
export type SimulationLogEntry = {
  time: string;
  level: "info" | "warn" | "error";
  text: string;
};
export type SimulationRunResponse = {
  id: string;
  sceneId: string;
  sceneName: string;
  remoteTaskId?: string;
  status: string;
  message?: string;
  /** 仿真任务与 WebSocket 连接生命周期日志，最近 300 条，仅存本地 metadata.json 与内存。 */
  logs: SimulationLogEntry[];
  frameCount: number;
  videoReady: boolean;
  sensors: Array<{ id: string; name: string; rate: number }>;
  imageCounts: Record<string, number>;
  videoSensors: string[];
  uploads: Array<{
    sensorId: string;
    bucket: string;
    objectKey: string;
    etag: string;
    sizeBytes: number;
  }>;
  uploadStatus: "pending" | "uploading" | "completed" | "failed";
  uploadError?: string;
  createdAt: string;
  updatedAt: string;
};
export type GeneralizationJobResponse = {
  id: string;
  sceneId: string;
  simulationRunId: string;
  sensorId: string;
  source: { bucket: string; objectKey: string; etag?: string };
  output: {
    bucket: string;
    objectKey: string;
    etag?: string;
    sizeBytes?: number;
  };
  targetWeather: string;
  engine: string;
  gpuCount?: number;
  status: string;
  stage?: string;
  progress: number;
  message?: string;
  media?: {
    duration_seconds?: number;
    width?: number;
    height?: number;
    fps?: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type MessageResponse = {
  id?: string;
  role: string;
  content: string;
  metadata?: {
    kind?: string;
    /** Common values: pending | running | generated | draft | needs_revision | needs_input | answered | failed | generating | superseded */
    status?: string;
    sceneId?: string;
    error?: string;
    suggestions?: string[];
    canPublishCandidate?: boolean;
    junctionChoices?: string[];
    toolLoop?: {
      status?: string;
      currentStage?: string;
      candidate?: {
        evaluation?: {
          passed?: boolean;
          draftReady?: boolean;
          outcomePassed?: boolean;
          locationPassed?: boolean;
          eventsPassed?: boolean;
          [key: string]: unknown;
        };
      };
      stages?: Array<{
        name: string;
        status: "running" | "completed" | "failed";
        durationMs?: number;
        error?: {
          phase: string;
          kind: "timeout" | "cancelled" | "error";
          message: string;
          timeoutMs?: number;
          occurredAt: string;
        };
      }>;
    };
  };
};
export type ConversationDetailResponse = {
  title: string;
  activeSceneId?: string | null;
  messages: MessageResponse[];
};
export type MapSummaryResponse = { id: string; name: string };
export type AgentStatusResponse = { configured: boolean; model: string | null };
