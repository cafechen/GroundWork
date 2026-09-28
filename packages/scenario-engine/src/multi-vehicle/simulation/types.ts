import type { Point } from "../geometry.js";

export const DT = 0.05;

export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

export type Change = {
  eventId: string;
  target: string;
  startS: number;
  startT: number;
  duration: number;
};

export type VehicleState = Point & {
  id: string;
  laneId: string;
  s: number;
  speed: number;
  acceleration: number;
  routeIndex: number;
  change?: Change;
};

export type EventRecord = {
  id: string;
  actorId: string;
  status: "waiting" | "running" | "completed" | "missed";
  startedAt?: number;
  completedAt?: number;
  reason?: string;
};

export type ExternalController = (
  state: Readonly<VehicleState>,
  snapshot: readonly Readonly<VehicleState>[],
  time: number,
) => { acceleration: number };

export type SimulationOptions = {
  externalControllers?: Record<string, ExternalController>;
  signal?: AbortSignal;
};

export type CompactFrame = { t: number; states: VehicleState[] };

export type CollisionRecord = {
  actors: string[];
  time: number;
  expected: boolean;
};

export type ViolationRecord = {
  actorId: string;
  kind: string;
  time: number;
  value: number;
};
