import { describe, expect, it } from 'vitest';
import { agentChatRequestSchema, scenePlanSchema, updateConversationSchema } from './index.js';

const validPlan = {
  schemaVersion: '1.0', title: '测试场景', summary: '摘要', durationS: 12, behaviorType: 'following',
  actors: [
    { name: 'Ego', role: 'ego', vehicleType: 'car', startLaneId: 'lane_1', targetLaneId: 'lane_1', keyframes: [{ t: 0, s: 0, speedMps: 5 }, { t: 12, s: 60, speedMps: 5 }] },
    { name: 'Danger', role: 'danger', vehicleType: 'car', startLaneId: 'lane_1', targetLaneId: 'lane_1', keyframes: [{ t: 0, s: 10, speedMps: 5 }, { t: 12, s: 70, speedMps: 5 }] },
  ], phases: [{ name: '跟车', startTimeS: 0, endTimeS: 12 }],
  constraints: { maxAccelerationMps2: 3, maxDecelerationMps2: 5, maxSpeedMps: 25, minimumGapM: 2, collisionFree: true }, confirmationText: '确认生成',
} as const;

describe('shared contracts', () => {
  it('accepts a complete scene plan', () => expect(scenePlanSchema.parse(validPlan).actors).toHaveLength(2));
  it('rejects duplicate roles and non-increasing time', () => { const invalid = structuredClone(validPlan) as any; invalid.actors[1].role = 'ego'; invalid.actors[0].keyframes[1].t = 0; expect(scenePlanSchema.safeParse(invalid).success).toBe(false); });
  it('rejects unknown and invalid API fields', () => { expect(agentChatRequestSchema.safeParse({ content: 'hi', mapId: 'map', unexpected: true }).success).toBe(false); expect(updateConversationSchema.safeParse({ status: 'invalid' }).success).toBe(false); });
});
