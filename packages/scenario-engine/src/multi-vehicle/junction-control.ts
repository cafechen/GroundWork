import type { MapModel, Road } from "../index.js";
import type { SceneSpecV2 } from "@groundwork/contracts";
import type { VehicleState } from "./simulation.js";
import { dimensions, lanePoint } from "./geometry.js";
import { movementsConflict } from "./junction-paths.js";

export function junctionController(map: MapModel, spec: SceneSpecV2) {
  const roads = new Map(map.roads.map((r) => [r.id, r]));
  const conflicts = new Map<string, boolean>();
  const traversals: Array<{
    actorId: string;
    movementId: string;
    enteredAt?: number;
    exitedAt?: number;
    waitingS: number;
    stopPosition: { laneId: string; s: number; x: number; y: number };
  }> = [];
  const yields: Array<{
    actorId: string;
    toActorId: string;
    time: number;
    movementId: string;
  }> = [];
  const movements = [...spec.actors]
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((a) =>
      a.route
        .filter((id) => roads.get(id)?.junction)
        .map((id) => {
          const index = a.route.indexOf(id),
            r = roads.get(id)!;
          const stop = roads.get(r.junction!.from)!;
          const position = Math.max(
            0,
            r.junction!.stopPositionM - dimensions(a.vehicleType).lengthM / 2,
          );
          const point = lanePoint(stop, position);
          const record = {
            actorId: a.id,
            movementId: id,
            waitingS: 0,
            stopPosition: {
              laneId: stop.id,
              s: position,
              x: point.x,
              y: point.y,
            },
          };
          traversals.push(record);
          return {
            actor: a,
            road: r,
            index,
            record: record as (typeof traversals)[number],
          };
        }),
    );
  const conflict = (a: Road, b: Road) => {
    const key = [a.id, b.id].sort().join("/");
    if (!conflicts.has(key)) conflicts.set(key, movementsConflict(a, b));
    return conflicts.get(key)!;
  };
  const yielded = new Set<string>();
  const intentionalCollisionPair = (a: string, b: string) => {
    const first = spec.actors.find((actor) => actor.id === a),
      second = spec.actors.find((actor) => actor.id === b);
    return (
      first?.profile.collisionAvoidance === false &&
      second?.profile.collisionAvoidance === false &&
      spec.constraints.allowedCollisionPairs.some(
        ([left, right]) =>
          (left === a && right === b) || (left === b && right === a),
      )
    );
  };
  return {
    step(states: VehicleState[], time: number, dt: number) {
      const requests = movements
        .flatMap((m) => {
          const s = states.find((s) => s.id === m.actor.id)!;
          if (s.routeIndex > m.index) {
            // Keep the movement occupied until the rear clears the exit.
            if (
              s.routeIndex > m.index + 1 ||
              s.s > dimensions(m.actor.vehicleType).lengthM / 2 + 2
            ) {
              if (
                m.record.enteredAt !== undefined &&
                m.record.exitedAt === undefined
              )
                m.record.exitedAt = time;
              return [];
            }
            return [{ ...m, state: s, distance: -1, inside: true, eta: 0 }];
          }
          if (s.routeIndex === m.index) {
            m.record.enteredAt ??= time;
            return [{ ...m, state: s, distance: -1, inside: true, eta: 0 }];
          }
          const before = m.actor.route.slice(s.routeIndex, m.index);
          const distance =
            before.reduce((sum, id) => sum + roads.get(id)!.lengthM, 0) - s.s;
          if (distance > Math.max(45, s.speed * 8)) return [];
          return [
            {
              ...m,
              state: s,
              distance,
              inside: false,
              eta: distance / Math.max(1, s.speed),
            },
          ];
        })
        .sort(
          (a, b) =>
            Number(b.inside) - Number(a.inside) ||
            (spec.junction?.priorities[b.actor.id] ?? 0) -
              (spec.junction?.priorities[a.actor.id] ?? 0) ||
            a.eta - b.eta ||
            a.actor.id.localeCompare(b.actor.id),
        );
      const granted: typeof requests = [];
      const stops = new Map<string, number>();
      for (const r of requests) {
        // Queue followers wait without claiming a crossing ahead of their leader.
        const queueLeader = !r.inside
          ? requests.find(
              (other) =>
                other.actor.id !== r.actor.id &&
                other.road.junction!.from === r.road.junction!.from &&
                (other.inside || other.distance < r.distance),
            )
          : undefined;
        const blocker =
          queueLeader ??
          granted.find(
            (g) => g.actor.id !== r.actor.id && conflict(g.road, r.road),
          );
        if (
          r.inside ||
          !blocker ||
          intentionalCollisionPair(r.actor.id, blocker.actor.id) ||
          spec.junction?.nonYieldingActorIds.includes(r.actor.id)
        ) {
          granted.push(r);
          continue;
        }
        const from = roads.get(r.road.junction!.from)!;
        const stopDistance =
          r.distance - (from.lengthM - r.record.stopPosition.s);
        stops.set(
          r.actor.id,
          Math.min(stops.get(r.actor.id) ?? Infinity, stopDistance),
        );
        r.record.waitingS += dt;
        const key = `${r.actor.id}/${blocker.actor.id}/${r.road.id}`;
        if (!yielded.has(key)) {
          yielded.add(key);
          yields.push({
            actorId: r.actor.id,
            toActorId: blocker.actor.id,
            time,
            movementId: r.road.id,
          });
        }
      }
      return stops;
    },
    report() {
      const missingTraversals = (
        spec.junction?.requiredTraversalActorIds ?? []
      ).filter(
        (id) =>
          !traversals.some((t) => t.actorId === id && t.exitedAt !== undefined),
      );
      return {
        passed: missingTraversals.length === 0,
        missingTraversals,
        traversals,
        yields,
        policy:
          "场景优先级；已进入路口的车辆先通过，其次优先级、预计到达时间、车辆 ID。未推断法定通行权。",
      };
    },
  };
}
