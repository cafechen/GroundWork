import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { PlatformRepository } from "../src/server/repositories/platform";
import { modelSchema } from "../src/contracts/platform";
const db = new PrismaClient(),
  repo = new PlatformRepository(db);
try {
  if (
    (await db.mapAsset.count()) ||
    (await db.deviceModel.count()) ||
    (await db.gateway.count()) ||
    (await db.park.count())
  )
    throw Error(
      "Seed requires an empty GroundWork database / 仅允许初始化空库",
    );
  for (const id of [
    "hotel",
    "office",
    "airport_terminal",
    "clinic",
    "campus",
  ]) {
    const data = JSON.parse(
      await readFile(`assets/maps/rmf/${id}.json`, "utf8"),
    );
    await repo.save("maps", { name: data.name.zh, data });
  }
  for (const category of ["tugger", "forklift", "amr", "quadruped"] as const) {
    const small = category === "amr" || category === "quadruped";
    await repo.save("models", {
      name: `通用模型 / ${category}`,
      data: modelSchema.parse({
        category,
        length: small ? 1.2 : 3,
        width: small ? 0.7 : 1.5,
        height: small ? 0.6 : 1.4,
        wheelbase: small ? 0.6 : 1.8,
        maxSpeed: 1.2,
        maxSteer: 0.6,
        mass: small ? 80 : 1000,
        trailers: category === "tugger" ? 1 : 0,
        sensors: [{ name: "ground-truth", kind: "pose" }],
      }),
    });
  }
  await repo.save("gateways", {
    name: "本地仿真网关 / Local simulation",
    data: {
      location: "local",
      adapter: "simulation",
      channels: [
        { name: "state", kind: "telemetry", topic: "simulation/state" },
        { name: "events", kind: "events", topic: "simulation/events" },
      ],
    },
  });
  console.log(
    "Seeded five maps, four generic models and one configuration-only gateway.",
  );
} finally {
  await db.$disconnect();
}
