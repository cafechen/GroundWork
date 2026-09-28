import type { SceneSpecV2, ScenarioGoal } from "@groundwork/contracts";
import type { simulateMultiVehicle } from "./simulation.js";
import { bodyGap } from "./risk-metrics.js";
import { dimensions, overlaps } from "./geometry.js";
import type { MapModel } from "../index.js";
import { evaluateRiskLocation } from "./risk-location.js";

/** Validate generated samples, never a model's success statement. Risk uses the
 * same 0.8 m / 2 m/s closest-encounter criterion as the existing risk engine. */
export function evaluateBehaviorObjective(
  spec: SceneSpecV2,
  trajectory: ReturnType<typeof simulateMultiVehicle>,
  goal: ScenarioGoal,
  map?: MapModel,
) {
  const report = trajectory.properties.validationReport;
  const ego = spec.actors.find((a) => a.role === "ego")!;
  const eventActors = spec.actors.filter((a) => a.role === "event");
  const frames = new Map<number, Map<string, Record<string, any>>>();
  for (const feature of trajectory.features) {
    const p = feature.properties as Record<string, any>;
    if (p.featureType !== "trajectoryPoint") continue;
    const frame = frames.get(p.t) ?? new Map();
    frame.set(p.actor, p);
    frames.set(p.t, frame);
  }
  const actorPairs = eventActors.map((actor) => [ego, actor] as const);
  if (goal.riskLocation) {
    for (let i = 0; i < spec.actors.length; i++)
      for (let j = i + 1; j < spec.actors.length; j++) {
        const a = spec.actors[i]!,
          b = spec.actors[j]!;
        if (!actorPairs.some((pair) => pair.includes(a) && pair.includes(b)))
          actorPairs.push([a, b]);
      }
  }
  const pairs = actorPairs.map(([first, actor]) => {
    let minimumGapM = Infinity,
      closingSpeedMps = 0,
      collision = false,
      peakTimeS = 0;
    let firstCollision: { x: number; y: number; timeS: number } | undefined;
    let closestEncounter: typeof firstCollision;
    for (const [t, frame] of [...frames].sort(([a], [b]) => a - b)) {
      const a = frame.get(first.id),
        b = frame.get(actor.id);
      if (!a || !b) continue;
      const body = (p: Record<string, any>, type: string) => ({
        x: p.localX,
        y: p.localY,
        heading: p.headingRad,
        ...dimensions(type),
      });
      const gap = bodyGap(
        body(a, first.vehicleType),
        body(b, actor.vehicleType),
      );
      const overlapping = overlaps(
        body(a, first.vehicleType),
        body(b, actor.vehicleType),
      );
      const encounter = {
        x: (a.localX + b.localX) / 2,
        y: (a.localY + b.localY) / 2,
        timeS: t,
      };
      if (overlapping && !firstCollision) firstCollision = encounter;
      collision ||= overlapping;
      if (gap < minimumGapM) {
        closestEncounter = encounter;
        minimumGapM = gap;
        peakTimeS = t;
        closingSpeedMps = Math.hypot(
          a.speedMps * Math.cos(a.headingRad) -
            b.speedMps * Math.cos(b.headingRad),
          a.speedMps * Math.sin(a.headingRad) -
            b.speedMps * Math.sin(b.headingRad),
        );
      }
    }
    return {
      actors: [first.id, actor.id],
      objectivePair:
        (first.role === "ego" && actor.role === "event") ||
        (first.role === "event" && actor.role === "ego"),
      minimumGapM: Number.isFinite(minimumGapM) ? minimumGapM : null,
      closingSpeedMps,
      collision,
      collisionTimeS: firstCollision?.timeS ?? null,
      peakTimeS,
      dangerous: (collision || minimumGapM < 0.8) && closingSpeedMps > 2,
      location: goal.riskLocation
        ? evaluateRiskLocation(
            map,
            goal.riskLocation,
            firstCollision ?? closestEncounter,
          )
        : undefined,
    };
  });
  const terminalPair =
    goal.outcome === "collision"
      ? pairs
          .filter(
            (pair) =>
              pair.objectivePair &&
              pair.collision &&
              pair.collisionTimeS !== null,
          )
          .sort((a, b) => a.collisionTimeS! - b.collisionTimeS!)[0]
      : undefined;
  const terminalTimeS = terminalPair?.collisionTimeS ?? Infinity;
  const outcomePassed =
    goal.outcome === "behavior" ||
    pairs.some(
      (p) =>
        p.objectivePair &&
        p.dangerous &&
        (goal.outcome !== "collision" || p.collision) &&
        (goal.outcome !== "near_miss" || report.risk.collisionFree),
    );
  const eventsPassed = spec.events.every((e) =>
    report.events.some((r) => r.id === e.id && r.status === "completed"),
  );
  const locationPassed =
    !goal.riskLocation ||
    (pairs.every(
      (p) =>
        !p.collision ||
        p.collisionTimeS! > terminalTimeS + 1e-9 ||
        p.location?.passed,
    ) &&
      pairs.some(
        (p) =>
          p.objectivePair &&
          p.dangerous &&
          p.location?.passed &&
          (goal.outcome !== "collision" || p.collision) &&
          (goal.outcome !== "near_miss" || report.risk.collisionFree),
      ));
  const validation = structuredClone(report) as typeof report & {
    terminalCollision?: {
      timeS: number;
      actors: string[];
      ignoredPhysicalViolations: typeof report.physical.violations;
      ignoredMissingTraversals: string[];
      ignoredUnexpectedCollisions: typeof report.risk.collisions;
    };
  };
  if (terminalPair) {
    const cutoff = terminalPair.collisionTimeS!;
    const collisionActors = new Set(terminalPair.actors);
    const physical = validation.physical.violations.filter(
      (violation) => violation.time <= cutoff + 1e-9,
    );
    const ignoredPhysical = validation.physical.violations.filter(
      (violation) => violation.time > cutoff + 1e-9,
    );
    const unexpectedCollisions = validation.risk.collisions.filter(
      (collision) => !collision.expected && collision.time <= cutoff + 1e-9,
    );
    const ignoredUnexpectedCollisions = validation.risk.collisions.filter(
      (collision) => !collision.expected && collision.time > cutoff + 1e-9,
    );
    const ignoredMissingTraversals =
      validation.junction?.missingTraversals.filter((id) =>
        collisionActors.has(id),
      ) ?? [];
    const missingTraversals =
      validation.junction?.missingTraversals.filter(
        (id) => !collisionActors.has(id),
      ) ?? [];

    validation.physical = {
      ...validation.physical,
      passed: physical.length === 0,
      violations: physical,
    };
    validation.risk = {
      ...validation.risk,
      passed: unexpectedCollisions.length === 0,
    };
    validation.roadGeometry = {
      ...validation.roadGeometry,
      passed: !physical.some((violation) => violation.kind === "lane_boundary"),
    };
    if (validation.junction)
      validation.junction = {
        ...validation.junction,
        passed: missingTraversals.length === 0,
        missingTraversals,
      };
    validation.passed =
      validation.semantic.passed &&
      validation.physical.passed &&
      validation.risk.passed &&
      (validation.junction?.passed ?? true);
    validation.terminalCollision = {
      timeS: cutoff,
      actors: terminalPair.actors,
      ignoredPhysicalViolations: ignoredPhysical,
      ignoredMissingTraversals,
      ignoredUnexpectedCollisions,
    };
  }
  return {
    passed:
      validation.passed && eventsPassed && outcomePassed && locationPassed,
    // Draft-ready means the trajectory is worth showing to the user even if
    // physics / road / junction checks aren't fully clean. We require outcome
    // (did the dangerous event happen?) and location (did it happen in the
    // right place?) to match the goal — those are the core design intent.
    // Physical violations, unexpected collisions, junction yield issues and
    // missing traversals are reported separately and left to human judgment
    // or later refinement.
    draftReady: outcomePassed && locationPassed,
    locationPassed,
    outcomePassed,
    eventsPassed,
    goal,
    pairs,
    validation,
  };
}
