import { describe, expect, it } from "vitest";
import { agentChatRequestSchema } from "./index.js";

describe("main chat request contract", () => {
  it("accepts the selected scene and normalizes text", () => {
    expect(
      agentChatRequestSchema.parse({
        content: "  换一组  ",
        mapId: "map",
        sceneId: "scene",
      }),
    ).toEqual({ content: "换一组", mapId: "map", sceneId: "scene" });
  });
  it.each([null, 42, ""])(
    "rejects invalid selected scene identifiers: %s",
    (sceneId) => {
      expect(
        agentChatRequestSchema.safeParse({
          content: "生成",
          mapId: "map",
          sceneId,
        }).success,
      ).toBe(false);
    },
  );
});
