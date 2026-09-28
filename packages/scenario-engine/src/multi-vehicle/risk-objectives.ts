import { riskCapabilities, type SceneSpecV2 } from "@groundwork/contracts";
import type { MapModel } from "../index.js";
import { project, lanePoint } from "./geometry.js";
import { bodyGap, type RiskFrame } from "./risk-metrics.js";

export function evaluateRiskMechanism(
  map: MapModel,
  spec: SceneSpecV2,
  frames: (id: string) => RiskFrame[],
  peakTime: number,
) {
  const design = spec.riskDesign!,
    kind = design.kind;
  const a = frames("Ego"),
    b = frames("Conflict");
  const roadA = map.roads.find((r) => r.id === design.movementIds[0])!;
  const roadB = map.roads.find((r) => r.id === design.movementIds[1])!;
  const at = (fs: RiskFrame[]) =>
    fs.reduce(
      (best, p) =>
        Math.abs(p.t - peakTime) < Math.abs(best.t - peakTime) ? p : best,
      fs[0]!,
    );
  const headingDifference = Math.abs(
    Math.atan2(
      Math.sin(a[0]!.heading - b[0]!.heading),
      Math.cos(a[0]!.heading - b[0]!.heading),
    ),
  );
  const checks: { label: string; passed: boolean; value?: number }[] = [];
  const check = (label: string, passed: boolean, value?: number) =>
    checks.push({ label, passed, value });
  const approach = design.request?.approach;
  if (approach)
    check(
      "符合用户要求的来车方向关系",
      approach === "opposing"
        ? headingDifference > (Math.PI * 5) / 6
        : approach === "same_direction"
          ? headingDifference < 0.5
          : headingDifference > 0.7 && headingDifference < 2.5,
      (headingDifference * 180) / Math.PI,
    );
  if (kind === "rear_end") {
    check(
      "同向且事件车初始在前",
      headingDifference < 0.5 &&
        project(roadA, b[0]!).s > project(roadA, a[0]!).s,
      headingDifference,
    );
    const drop = b[0]!.speed - Math.min(...b.map((p) => p.speed));
    check("前车实际减速超过 2 m/s", drop > 2, drop);
  } else if (kind === "cut_in") {
    check(
      "初始同向相邻车道",
      headingDifference < 0.5 &&
        map.adjacentSameDirection.some(
          (l) => l.from === roadB.id && l.to === roadA.id,
        ),
      headingDifference,
    );
    check(
      "从相邻车道进入目标车道",
      project(roadA, b[0]!).distance > roadA.widthM / 2 &&
        project(roadA, at(b)).distance < roadA.widthM / 2,
    );
  } else if (kind === "oncoming_intrusion" || kind === "obstacle_bypass") {
    check(
      "初始行驶方向相反（大于 150 度）",
      headingDifference > (Math.PI * 5) / 6,
      (headingDifference * 180) / Math.PI,
    );
    const intrusion = project(roadB, at(b)).distance;
    check(
      "事件车实际侵入对向行驶区域",
      intrusion > 1 && project(roadA, at(b)).distance < roadA.widthM / 2 + 0.95,
      intrusion,
    );
    if (kind === "obstacle_bypass") {
      const obstacle = frames("Background");
      check(
        "占道车辆静止且位于事件车原车道",
        Math.max(...obstacle.map((p) => p.speed)) < 0.1 &&
          project(roadB, obstacle[0]!).distance < 0.5,
      );
      const gap = Math.min(
        ...b.map((p, i) =>
          bodyGap(
            { ...p, lengthM: 4.7, widthM: 1.9 },
            { ...obstacle[i]!, lengthM: 4.7, widthM: 1.9 },
          ),
        ),
      );
      check("绕行轨迹未碰撞占道车辆", gap > 0, gap);
      check(
        "占道车辆位于初始行驶前方",
        project(roadB, obstacle[0]!).s > project(roadB, b[0]!).s,
      );
      const counterfactualGap = Math.min(
        ...b.map((p, i) =>
          bodyGap(
            {
              ...lanePoint(roadB, project(roadB, p).s),
              lengthM: 4.7,
              widthM: 1.9,
            },
            { ...obstacle[i]!, lengthM: 4.7, widthM: 1.9 },
          ),
        ),
      );
      check(
        "不横移绕行会遇到占道车",
        counterfactualGap === 0,
        counterfactualGap,
      );
    }
  } else {
    const expected =
      kind === "crossing"
        ? "straight"
        : kind === "right_turn_merge"
          ? "right"
          : "left";
    check(
      "符合所需路口转向连接",
      roadA.junction?.turn === "straight" &&
        roadB.junction?.turn === expected &&
        roadA.junction?.id === roadB.junction?.id,
    );
    check("来自不同进口", roadA.junction?.from !== roadB.junction?.from);
    if (kind === "crossing")
      check(
        "交叉方向而非同向排队",
        headingDifference > 0.7 && headingDifference < 2.5,
        headingDifference,
      );
    if (kind === "right_turn_merge")
      check("汇入同一出口", roadA.junction?.to === roadB.junction?.to);
  }
  return {
    kind,
    label: riskCapabilities[kind].label,
    checks,
    passed: checks.every((c) => c.passed),
    minimumMovingActors: riskCapabilities[kind].minimumMovingActors,
  };
}
