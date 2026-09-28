import type {
  Catalog,
  ParkData,
  Kind,
  Resource,
} from "../../contracts/platform";
import { PlatformError } from "../errors";

export function selected<K extends Kind>(
  catalog: Catalog,
  kind: K,
  id: string,
  version?: number,
): Resource<K> {
  const r = (catalog[kind] as Resource<K>[]).find(
    (r) => r.id === id && (version === undefined || r.version === version),
  );
  if (!r)
    throw new PlatformError(
      "Resource/version not found / 资源或版本不存在",
      404,
      "NOT_FOUND",
    );
  return r;
}

// Includes pinned historical map/model revisions and current gateways.
// catalog 包含固定的历史地图/模型版本，以及当前网关。
export function validatePark(p: ParkData, catalog: Catalog) {
  for (const values of [
    p.maps.map((x) => x.id),
    p.models.map((x) => x.id),
    p.gateways,
    p.devices.map((x) => x.id),
    p.objects.map((x) => x.id),
    p.tasks.map((x) => x.id),
  ]) {
    if (new Set(values).size !== values.length)
      throw new PlatformError("Duplicate references / 重复标识");
  }
  const maps = new Map(
    p.maps.map((r) => [r.id, selected(catalog, "maps", r.id, r.version)]),
  );
  const models = new Map(
    p.models.map((r) => [r.id, selected(catalog, "models", r.id, r.version)]),
  );
  for (const r of [...maps.values(), ...models.values()]) {
    if (r.archived)
      throw new PlatformError(
        "Archived resource cannot be selected / 资源已归档",
      );
  }
  for (const id of p.gateways)
    if (selected(catalog, "gateways", id).archived)
      throw new PlatformError("Gateway archived / 网关已归档");
  const level = (x: { mapId: string; level: string }) => {
    if (!maps.get(x.mapId)?.data.levels.some((l) => l.id === x.level))
      throw new PlatformError(
        "Map/floor must belong to park / 地图楼层不属于园区",
      );
  };
  for (const d of p.devices) {
    level(d);
    if (models.get(d.model.id)?.version !== d.model.version)
      throw new PlatformError(
        "Device model must match park model version / 设备模型版本不属于园区",
      );
    if (d.kind === "virtual" && d.serial)
      throw new PlatformError(
        "Virtual devices must not claim a real serial / 虚拟设备不可声明实机序列号",
      );
    if (!d.gatewayId && d.channels.length)
      throw new PlatformError(
        "Bind a gateway before selecting channels / 请先绑定网关",
      );
    if (new Set(d.channels).size !== d.channels.length)
      throw new PlatformError("Duplicate device channels / 设备通道重复");
    if (d.gatewayId) {
      if (!p.gateways.includes(d.gatewayId))
        throw new PlatformError(
          "Gateway does not belong to park / 网关不属于园区",
        );
      const g = selected(catalog, "gateways", d.gatewayId).data;
      if ((d.kind === "physical") === (g.adapter === "simulation"))
        throw new PlatformError(
          "Physical/virtual gateway mismatch / 虚实设备网关不匹配",
        );
      if (d.channels.some((c) => !g.channels.some((v) => v.name === c)))
        throw new PlatformError("Unknown gateway channel / 网关通道不存在");
    }
  }
  for (const o of p.objects) {
    level(o);
    if (
      o.type === "route" &&
      (o.points.length < 2 ||
        o.points.some(
          (v, i) =>
            i > 0 &&
            Math.hypot(v[0] - o.points[i - 1][0], v[1] - o.points[i - 1][1]) <
              0.001,
        ))
    ) {
      throw new PlatformError(
        "Route needs distinct consecutive points / 路线至少两个不同坐标",
      );
    }
  }
  for (const t of p.tasks) {
    const d = p.devices.find((v) => v.id === t.deviceId),
      o = p.objects.find((v) => v.id === t.routeId);
    if (
      !d ||
      !o ||
      o.type !== "route" ||
      d.mapId !== o.mapId ||
      d.level !== o.level
    )
      throw new PlatformError(
        "Task device and route must share a map floor / 设备与路线须位于同图同层",
      );
  }
}
