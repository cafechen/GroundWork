import { describe, it, expect } from "vitest";
import {
  parseRiskIntent,
  riskCapabilities,
  riskMechanismSchema,
  riskRequestSchema,
  riskRequestStrictSchema,
} from "./risk-capabilities.js";
describe("shared capability intent contract", () => {
  it.each([
    ["换一组危险直行场景", "crossing"],
    ["危险对向直行冲突", "oncoming_intrusion"],
    ["同向直行，前车急刹追尾", "rear_end"],
    ["左转与直行车冲突", "unprotected_left_turn"],
    ["右转汇入", "right_turn_merge"],
    ["避障借道导致对向冲突", "obstacle_bypass"],
    ["突然变道切入", "cut_in"],
    ["不要左转，换成直行", "crossing"],
  ])("%s maps to %s", (text, mechanism) =>
    expect(parseRiskIntent(text).mechanism).toBe(mechanism),
  );
  it("has one definition for every registered mechanism", () =>
    expect(Object.keys(riskCapabilities)).toEqual(riskMechanismSchema.options));
  it("patches explicit outcomes without inventing a maneuver", () => {
    expect(parseRiskIntent("不要碰撞")).toEqual({
      mechanism: undefined,
      outcome: "near_miss",
    });
    expect(parseRiskIntent("必须碰撞").outcome).toBe("collision");
    expect(parseRiskIntent("改为允许碰撞").outcome).toBe("danger");
    expect(parseRiskIntent("再来一组").mechanism).toBeUndefined();
    expect(parseRiskIntent("闯红灯造成直行冲突").unsupported).toBeTruthy();
  });
});
describe("explicit risk sharpness parameters", () => {
  const base = { mechanism: "crossing", count: 5, outcome: "near_miss" };
  it("accepts the sharpness fields within tightening bounds", () => {
    const parsed = riskRequestStrictSchema.parse({
      ...base,
      maxTtcS: 1,
      maxGapM: 0.6,
      minGapM: 0.2,
      maxPetS: 1.5,
      minClosingSpeedMps: 4,
      minSpeedMps: 11.11,
    });
    expect(parsed.maxGapM).toBe(0.6);
    expect(parsed.minSpeedMps).toBe(11.11);
  });
  it("enforces the 17 m/s generation ceiling on the cruise-speed floor", () => {
    const accepted = riskRequestStrictSchema.parse({
      ...base,
      minSpeedMps: 17,
    });
    expect(accepted.minSpeedMps).toBe(17);
    expect(() =>
      riskRequestStrictSchema.parse({ ...base, minSpeedMps: 17.1 }),
    ).toThrow(/17/);
    expect(() =>
      riskRequestStrictSchema.parse({ ...base, minSpeedMps: 0 }),
    ).toThrow(/正数/);
    expect(() =>
      riskRequestStrictSchema.parse({ ...base, minSpeedMps: true }),
    ).toThrow(/数字/);
  });
  it("only allows minGapM together with near_miss and a non-empty corridor", () => {
    expect(() =>
      riskRequestStrictSchema.parse({
        ...base,
        outcome: "danger",
        minGapM: 0.2,
      }),
    ).toThrow(/near_miss/);
    expect(() =>
      riskRequestStrictSchema.parse({
        ...base,
        minGapM: 0.5,
        maxGapM: 0.5,
      }),
    ).toThrow(/走廊/);
    expect(() =>
      riskRequestStrictSchema.parse({ ...base, minGapM: 0.8 }),
    ).toThrow(/0\.8/);
  });
  it("rejects thresholds that would loosen the default risk gates", () => {
    expect(() =>
      riskRequestStrictSchema.parse({ ...base, maxGapM: 1 }),
    ).toThrow();
    expect(() =>
      riskRequestStrictSchema.parse({ ...base, maxTtcS: 4 }),
    ).toThrow();
    expect(() =>
      riskRequestStrictSchema.parse({ ...base, maxPetS: 0 }),
    ).toThrow();
    expect(() =>
      riskRequestStrictSchema.parse({ ...base, minClosingSpeedMps: 1 }),
    ).toThrow(/2/);
  });
  it("keeps riskRequestSchema a plain object so goal subsets can .pick() it", () => {
    expect(() =>
      riskRequestSchema.pick({
        mechanism: true,
        maxGapM: true,
        minGapM: true,
        maxPetS: true,
        minClosingSpeedMps: true,
        minSpeedMps: true,
      }),
    ).not.toThrow();
  });
});
