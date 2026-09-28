import { z } from "zod";

/** Accident/closest-encounter position, in map-local metres. Omitted junctionId
 * is resolved only when the selected map has exactly one usable junction. */
export const riskLocationSchema = z.discriminatedUnion("region", [
  z
    .object({
      region: z.literal("junction_interior"),
      junctionId: z.string().min(1).max(128).optional(),
      maxDistanceM: z.literal(0).default(0),
    })
    .strict(),
  z
    .object({
      region: z.literal("junction_nearby"),
      junctionId: z.string().min(1).max(128).optional(),
      maxDistanceM: z.number().finite().positive().max(500),
    })
    .strict(),
]);
export type RiskLocation = z.infer<typeof riskLocationSchema>;
