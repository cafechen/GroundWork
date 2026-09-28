/**
 * 场景模板注册表。
 *
 * 所有场景模板都在这里注册，搜索引擎和 LLM 都从这里选。
 */

import type { SceneTemplate } from "./types.js";
import { rearEndTemplate } from "./templates/rear-end.template.js";
import { cutInTemplate } from "./templates/cut-in.template.js";
import { unprotectedLeftTurnTemplate } from "./templates/unprotected-left-turn.template.js";
import { rightTurnMergeTemplate } from "./templates/right-turn-merge.template.js";
import { oncomingIntrusionTemplate } from "./templates/oncoming-intrusion.template.js";
import { vruConflictTemplate } from "./templates/vru-conflict.template.js";
import { uTurnConflictTemplate } from "./templates/u-turn-conflict.template.js";
import { obstacleBypassTemplate } from "./templates/obstacle-bypass.template.js";
import { intersectionStraightRightTemplate } from "./templates/intersection-straight-right.template.js";

/** 所有已注册的场景模板 */
export const sceneTemplates: SceneTemplate[] = [
  rearEndTemplate,
  cutInTemplate,
  unprotectedLeftTurnTemplate,
  rightTurnMergeTemplate,
  oncomingIntrusionTemplate,
  vruConflictTemplate,
  uTurnConflictTemplate,
  obstacleBypassTemplate,
  intersectionStraightRightTemplate,
];

/** 按 ID 查找模板 */
export function getTemplate(id: string): SceneTemplate | undefined {
  return sceneTemplates.find((t) => t.id === id);
}

/** 按分类筛选模板 */
export function getTemplatesByCategory(
  category: SceneTemplate["category"],
): SceneTemplate[] {
  return sceneTemplates.filter((t) => t.category === category);
}

/** 按标签模糊搜索模板 */
export function searchTemplates(keyword: string): SceneTemplate[] {
  const kw = keyword.toLowerCase();
  return sceneTemplates.filter(
    (t) =>
      t.id.toLowerCase().includes(kw) ||
      t.name.includes(keyword) ||
      t.description.includes(keyword) ||
      t.tags.some((tag) => tag.includes(keyword)),
  );
}

/**
 * 模板分类统计。
 */
export function getTemplateStats(): {
  total: number;
  byCategory: Record<string, number>;
} {
  const byCategory: Record<string, number> = {};
  for (const t of sceneTemplates) {
    byCategory[t.category] = (byCategory[t.category] || 0) + 1;
  }
  return { total: sceneTemplates.length, byCategory };
}
