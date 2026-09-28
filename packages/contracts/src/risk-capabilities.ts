import { z } from "zod";

export const riskMechanismSchema = z.enum([
  "rear_end",
  "cut_in",
  "crossing",
  "unprotected_left_turn",
  "right_turn_merge",
  "oncoming_intrusion",
  "obstacle_bypass",
]);
export type RiskMechanism = z.infer<typeof riskMechanismSchema>;
export const riskCapabilities: Record<
  RiskMechanism,
  {
    label: string;
    mapRequirement: string;
    event: string;
    minimumMovingActors: number;
  }
> = {
  rear_end: {
    label: "前车制动追尾",
    mapRequirement: "足够长的连续同向车道",
    event: "前车制动且后车逼近",
    minimumMovingActors: 5,
  },
  cut_in: {
    label: "同向切入冲突",
    mapRequirement: "可跨越的同向相邻车道",
    event: "事件车从相邻车道进入被测车车道",
    minimumMovingActors: 5,
  },
  crossing: {
    label: "路口直行交叉冲突",
    mapRequirement: "同一路口内相交的两条直行连接",
    event: "不同进口直行车辆在交叉区域相遇",
    minimumMovingActors: 5,
  },
  unprotected_left_turn: {
    label: "危险左转",
    mapRequirement: "同一路口内相交的直行和左转连接",
    event: "左转路径与直行路径相遇",
    minimumMovingActors: 5,
  },
  right_turn_merge: {
    label: "右转汇入冲突",
    mapRequirement: "同一路口内汇合的右转与直行连接",
    event: "右转车辆与直行车汇入同一出口",
    minimumMovingActors: 5,
  },
  oncoming_intrusion: {
    label: "对向越线冲突",
    mapRequirement: "邻接且没有不可行驶隔离带的对向车道",
    event: "对向事件车越线进入被测车行驶区域",
    minimumMovingActors: 5,
  },
  obstacle_bypass: {
    label: "占道绕行冲突",
    mapRequirement: "可借道绕障的邻接对向车道",
    event: "事件车为绕过静止占道车辆侵入对向车道",
    minimumMovingActors: 4,
  },
};
export const riskRequestSchema = z.object({
  mechanism: riskMechanismSchema,
  count: z.literal(5).default(5),
  outcome: z.enum(["danger", "collision", "near_miss"]).default("danger"),
  approach: z.enum(["same_direction", "crossing", "opposing"]).optional(),
  /**
   * 显式 TTC 目标（秒）：搜索到的冲突在实际碰撞或最近相遇前必须出现
   * minimumTtcS ≤ 该阈值的时刻；实际碰撞自动满足。TTC 为恒速恒航向预测，
   * 3 秒窗口、0.05 s 分辨率，窗口内无碰撞路径时为空。缺省不施加 TTC 约束。
   */
  maxTtcS: z
    .number({ message: "TTC 阈值必须是数字" })
    .positive("TTC 阈值必须为正数")
    .max(3, "TTC 阈值不能超过 3 秒")
    .optional(),
  /**
   * 显式最近间隙上限（米）：要求最近相遇时车身最小间隙 ≤ 该值，只能收紧
   * 默认 0.8 m 的危险门槛，取值 (0, 0.8]。实际碰撞（间隙 0）自动满足。
   */
  maxGapM: z
    .number({ message: "间隙上限必须是数字" })
    .positive("间隙上限必须为正数")
    .max(0.8, "间隙上限不能超过默认危险门槛 0.8 m")
    .optional(),
  /**
   * 显式最近间隙下限（米）：近失锐度走廊，要求最近间隙 ≥ 该值，避免为了
   * 近而近。仅可与 outcome=near_miss 同用，取值 [0, 0.8)，且必须小于
   * maxGapM（未给 maxGapM 时即小于默认 0.8 m 门槛）。
   */
  minGapM: z
    .number({ message: "间隙下限必须是数字" })
    .min(0, "间隙下限不能为负")
    .optional(),
  /**
   * 显式 PET 上限（秒）：要求最近相遇位置两车车身占用的时间差 ≤ 该值；
   * 实际碰撞（PET=0）自动满足；两车从未共同占用该位置时 PET 为空、不满足。
   */
  maxPetS: z
    .number({ message: "PET 阈值必须是数字" })
    .positive("PET 阈值必须为正数")
    .max(3, "PET 阈值不能超过 3 秒")
    .optional(),
  /**
   * 显式最近点相对速度下限（m/s）：只能收紧默认 2 m/s 门槛。相对速度由
   * 车速与交会角决定，当前速度域下过高阈值可能无解并如实报错。
   */
  minClosingSpeedMps: z
    .number({ message: "相对速度下限必须是数字" })
    .gte(2, "相对速度下限不能低于默认危险门槛 2 m/s")
    .optional(),
  /**
   * 显式接近巡航速度下限（m/s）：要求被测车与事件车在入弯/冲突反应制动
   * 之前的稳定接近段（入弯点前 25 m 或冲突点前 30 m 截止，时长不少于 1.5 s）
   * 实际速度均不低于该值；弯中按道路曲率自然减速、冲突前反应制动不受此
   * 约束。仅约束两名主角，背景车不约束。
   */
  minSpeedMps: z
    .number({ message: "巡航速度下限必须是数字" })
    .positive("巡航速度下限必须为正数")
    .max(17, "巡航速度下限不能超过 17 m/s（约 61 km/h，当前生成能力上限）")
    .optional(),
});
export type RiskRequest = z.infer<typeof riskRequestSchema>;
/**
 * 跨字段校验：minGapM 只能与 near_miss 同用，且必须落在有效间隙走廊内。
 * 保留 riskRequestSchema 为纯 object（场景目标需要 .pick 子集），在解析
 * 完整请求的边界统一走本 refined schema。
 */
export const riskRequestStrictSchema = riskRequestSchema.superRefine(
  (request, ctx) => {
    if (request.minGapM !== undefined && request.outcome !== "near_miss")
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minGapM"],
        message: "minGapM 仅能在 outcome=near_miss 时指定",
      });
    if (
      request.minGapM !== undefined &&
      request.maxGapM !== undefined &&
      request.minGapM >= request.maxGapM
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minGapM"],
        message: "minGapM 必须小于 maxGapM，间隙走廊不能为空",
      });
    if (
      request.minGapM !== undefined &&
      request.maxGapM === undefined &&
      request.minGapM >= 0.8
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minGapM"],
        message: "minGapM 必须小于默认危险间隙门槛 0.8 m",
      });
  },
);

/** Patch explicit intent only. Inheritance is handled by the caller, never by a generator. */
export function parseRiskIntent(text: string): {
  mechanism?: RiskMechanism;
  outcome?: RiskRequest["outcome"];
  unsupported?: string;
} {
  text = text.replace(
    /(?:不要|不需要|不含|不包含)(?:左转|右转|直行|掉头|行人|信号灯|红绿灯|信号控制|非机动车)/g,
    "",
  );
  if (/红绿灯|信号灯|信号控制|闯红灯|行人|自行车|非机动车|掉头/.test(text))
    return { unsupported: "信号控制、行人/非机动车和掉头机制尚未实现" };
  const outcome = /不碰撞|不要碰撞|避免碰撞|擦肩|险些/.test(text)
    ? "near_miss"
    : /必须碰撞|发生碰撞|一定碰撞|撞上/.test(text)
      ? "collision"
      : /允许碰撞|可以碰撞|不限碰撞/.test(text)
        ? "danger"
        : undefined;
  const mechanism: RiskMechanism | undefined = /占道|绕障|绕行|避障/.test(text)
    ? "obstacle_bypass"
    : /对向|迎面|逆行|越线/.test(text)
      ? "oncoming_intrusion"
      : /追尾|急刹|急制动|前车制动/.test(text)
        ? "rear_end"
        : /切入|加塞|并线|变道/.test(text)
          ? "cut_in"
          : /右转/.test(text)
            ? "right_turn_merge"
            : /左转/.test(text)
              ? "unprotected_left_turn"
              : /直行|交叉抢行/.test(text)
                ? "crossing"
                : undefined;
  return { mechanism, outcome };
}
