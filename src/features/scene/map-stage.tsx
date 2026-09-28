"use client";
import { useEffect, useRef, useState, useMemo, useId } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { MapData, SceneObject, DeviceData } from "@/contracts/platform";
import type { ParkFrame } from "@/simulation/park";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/providers";
import { Choice } from "@/components/common";
import {
  DEFAULT_LAYERS,
  mapLayers,
  liftPolygon,
  floorPolygons,
  floorPath,
  type LayerOptions,
} from "./map-layers";
type Props = {
  map: MapData;
  levelId: string;
  objects: SceneObject[];
  devices: DeviceData[];
  frame?: Pick<ParkFrame, "t" | "bodies">;
  draft?: [number, number][];
  onPick?: (x: number, y: number) => void;
};
export function MapStage(props: Props) {
  const { map, levelId, objects, devices, frame, draft, onPick } = props,
    { t } = useLocale();
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [options, setOptions] = useState<LayerOptions>({ ...DEFAULT_LAYERS });
  const markerId = useId();
  const level = map.levels.find((l) => l.id === levelId);
  const layers = useMemo(
    () => (level ? mapLayers(map, levelId, options) : null),
    [map, level, levelId, options],
  );
  if (!level || !layers) return <p>{t("请选择楼层", "Select a floor")}</p>;
  const b = level.bounds,
    pad = Math.max(b.w, b.h) * 0.04;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          variant={mode === "2d" ? "default" : "outline"}
          onClick={() => setMode("2d")}
        >
          2D
        </Button>
        <Button
          variant={mode === "3d" ? "default" : "outline"}
          onClick={() => setMode("3d")}
        >
          3D
        </Button>
        <span className="text-xs text-muted-foreground">
          m / rad ·{" "}
          {onPick
            ? t("切至 2D 点击放置", "Switch to 2D to place points")
            : t("仅查看", "View only")}
        </span>
      </div>
      <details className="rounded-md border p-3 text-sm">
        <summary className="cursor-pointer">
          {t("地图图层与导航图", "Map layers and navigation graphs")}
        </summary>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <Choice
            label={t("导航图", "Navigation graph")}
            value={layers.graph}
            onChange={(graph) => setOptions({ ...options, graph })}
            options={[
              { value: "all", label: t("全部", "All") },
              ...layers.graphs.map((g) => ({
                value: String(g),
                label: `Graph ${g}`,
              })),
            ]}
          />
          {(
            [
              ["lanes", "导航路线", "Lanes"],
              ["walls", "墙体", "Walls"],
              ["facilities", "门与电梯", "Doors and lifts"],
              ["models", "模型位置", "Model positions"],
              ["labels", "站点名称", "Waypoint names"],
            ] as const
          ).map(([key, zh, en]) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={options[key]}
                onChange={(e) =>
                  setOptions({ ...options, [key]: e.target.checked })
                }
              />
              {t(zh, en)}
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t(
            "仅调整显示，不改变仿真碰撞或通行规则；模型标记不是实体网格。",
            "Display only: collision and traffic rules are unchanged; model markers are not meshes.",
          )}
        </p>
      </details>
      {mode === "3d" ? (
        <ThreeStage {...props} layers={layers} />
      ) : (
        <svg
          role="img"
          aria-label={t("园区地图", "Park map")}
          className={`h-[55vh] min-h-80 w-full rounded-lg bg-muted ${onPick ? "cursor-crosshair" : ""}`}
          viewBox={`${b.x - pad} ${-b.y - b.h - pad} ${b.w + 2 * pad} ${b.h + 2 * pad}`}
          onClick={(e) => {
            if (!onPick) return;
            const svg = e.currentTarget;
            const matrix = svg.getScreenCTM();
            if (!matrix) return;
            const point = svg.createSVGPoint();
            point.x = e.clientX;
            point.y = e.clientY;
            const local = point.matrixTransform(matrix.inverse());
            onPick(local.x, -local.y);
          }}
        >
          <defs>
            <marker
              id={markerId}
              markerWidth="5"
              markerHeight="5"
              refX="4"
              refY="2.5"
              orient="auto"
            >
              <path d="M0,0 L5,2.5 L0,5" fill="none" stroke="#27745d" />
            </marker>
          </defs>
          {floorPolygons(level).map((f, i) => (
            <path
              key={`f${i}`}
              data-layer="floor"
              d={floorPath(f)}
              fillRule="evenodd"
              fill="#fffff8"
            />
          ))}
          {layers.lanes.map((e) => (
            <path
              key={`l${e.id}`}
              data-layer="lane"
              data-graph={e.graph}
              d={`M ${level.vertices[e.start].x} ${-level.vertices[e.start].y} L ${(level.vertices[e.start].x + level.vertices[e.end].x) / 2} ${-(level.vertices[e.start].y + level.vertices[e.end].y) / 2} L ${level.vertices[e.end].x} ${-level.vertices[e.end].y}`}
              fill="none"
              markerMid={e.bidirectional ? undefined : `url(#${markerId})`}
              stroke="#76a89a"
              strokeWidth={0.05}
            />
          ))}
          {layers.walls.map((e) => (
            <line
              key={`w${e.id}`}
              data-layer="wall"
              x1={level.vertices[e.start].x}
              y1={-level.vertices[e.start].y}
              x2={level.vertices[e.end].x}
              y2={-level.vertices[e.end].y}
              stroke="#7b8f7d"
              strokeWidth={0.18}
            />
          ))}
          {layers.doors.map((e) => (
            <line
              key={`d${e.id}`}
              data-layer="door"
              x1={level.vertices[e.start].x}
              y1={-level.vertices[e.start].y}
              x2={level.vertices[e.end].x}
              y2={-level.vertices[e.end].y}
              stroke="#d6a343"
              strokeWidth={0.14}
            />
          ))}
          {layers.lifts.map((l) => (
            <polygon
              key={l.id}
              data-layer="lift"
              points={liftPolygon(l)
                .map((p) => `${p.x},${-p.y}`)
                .join(" ")}
              fill="#8062ad22"
              stroke="#8062ad"
              strokeWidth={0.12}
            >
              <title>{l.id}</title>
            </polygon>
          ))}
          {layers.models.map((m) => (
            <circle
              key={m.id}
              data-layer="model"
              cx={m.position[0]}
              cy={-m.position[1]}
              r={Math.max(b.w, b.h) * 0.002}
              fill="#9b7e63"
            >
              <title>
                {m.model} · {m.name}
              </title>
            </circle>
          ))}
          {layers.labels.map((v) => (
            <text
              key={v.id}
              data-layer="label"
              x={v.x + 0.15}
              y={-v.y - 0.15}
              fontSize={Math.max(b.w, b.h) * 0.011}
              fill="#245e4b"
              stroke="#fffff8"
              strokeWidth={0.035}
              paintOrder="stroke"
            >
              {v.name}
            </text>
          ))}
          {objects
            .filter((o) => o.level === levelId)
            .map((o) => (
              <g key={o.id}>
                {o.type === "route" ? (
                  <>
                    <polyline
                      points={o.points.map((p) => `${p[0]},${-p[1]}`).join(" ")}
                      fill="none"
                      stroke="#297aac"
                      strokeWidth={0.15}
                    />
                    {o.points[0] && (
                      <circle
                        cx={o.points[0][0]}
                        cy={-o.points[0][1]}
                        r={0.25}
                        fill="#297aac"
                      />
                    )}
                  </>
                ) : (
                  <rect
                    x={o.x - o.w / 2}
                    y={-o.y - o.h / 2}
                    width={o.w}
                    height={o.h}
                    transform={`rotate(${(-o.yaw * 180) / Math.PI} ${o.x} ${-o.y})`}
                    fill={o.type === "restricted" ? "#b35f4d33" : "#9675c333"}
                    stroke={o.type === "restricted" ? "#b35f4d" : "#9675c3"}
                    strokeWidth={0.1}
                  />
                )}
                <text
                  x={o.x}
                  y={-o.y - 0.4}
                  fontSize={Math.max(0.25, b.w / 110)}
                  fill="#53685b"
                >
                  {o.name}
                </text>
              </g>
            ))}
          {frame
            ? frame.bodies.map((body) => (
                <polygon
                  key={body.id}
                  points={body.polygon.map((p) => `${p.x},${-p.y}`).join(" ")}
                  fill={body.kind === "trailer" ? "#9dc5b4" : "#245e4b"}
                  stroke="#fff"
                  strokeWidth={0.05}
                />
              ))
            : devices
                .filter((d) => d.level === levelId)
                .map((d) => (
                  <g
                    key={d.id}
                    transform={`translate(${d.pose[0]} ${-d.pose[1]}) rotate(${(-d.pose[2] * 180) / Math.PI})`}
                  >
                    <path d="M .6 0 L -.4 -.35 L -.4 .35 Z" fill="#245e4b" />
                    <title>{d.name}</title>
                  </g>
                ))}
          {draft && (
            <>
              <polyline
                points={draft.map(([x, y]) => `${x},${-y}`).join(" ")}
                fill="none"
                stroke="#df8b32"
                strokeWidth={0.18}
                strokeDasharray=".3 .15"
              />
              {draft.map(([x, y], i) => (
                <circle key={i} cx={x} cy={-y} r={0.22} fill="#df8b32" />
              ))}
            </>
          )}
        </svg>
      )}
    </div>
  );
}
function ThreeStage({
  map,
  levelId,
  objects,
  devices,
  frame,
  layers,
}: Props & { layers: ReturnType<typeof mapLayers> }) {
  const host = useRef<HTMLDivElement>(null),
    bodyGroup = useRef<THREE.Group | null>(null);
  useEffect(() => {
    const element = host.current,
      level = map.levels.find((l) => l.id === levelId);
    if (!element || !level) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      element.textContent = "WebGL unavailable / 3D 不可用，请使用 2D";
      return () => {
        element.textContent = "";
      };
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#edf0e7");
    const b = level.bounds,
      cx = b.x + b.w / 2,
      cy = b.y + b.h / 2,
      size = Math.max(b.w, b.h);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, size * 20);
    camera.position.set(cx + size * 0.55, size * 0.8, -cy + size * 0.65);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(cx, 0, -cy);
    controls.enableDamping = true;
    controls.update();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    element.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(cx, 30, -cy + 10);
    scene.add(light);
    for (const f of floorPolygons(level)) {
      const shape = new THREE.Shape(
        f.outer.map((p) => new THREE.Vector2(p.x, p.y)),
      );
      for (const hole of f.holes)
        shape.holes.push(
          new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, p.y))),
        );
      const ground = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshStandardMaterial({
          color: "#fffff8",
          side: THREE.DoubleSide,
        }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.02;
      scene.add(ground);
    }
    for (const e of layers.walls) {
      const a = level.vertices[e.start],
        c = level.vertices[e.end],
        length = Math.hypot(c.x - a.x, c.y - a.y);
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(length, 2.5, 0.12),
        new THREE.MeshStandardMaterial({ color: "#839781" }),
      );
      wall.position.set((a.x + c.x) / 2, 1.25, -(a.y + c.y) / 2);
      wall.rotation.y = Math.atan2(c.y - a.y, c.x - a.x);
      scene.add(wall);
    }
    for (const e of layers.lanes) {
      const a = level.vertices[e.start],
        c = level.vertices[e.end];
      scene.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(a.x, 0.01, -a.y),
            new THREE.Vector3(c.x, 0.01, -c.y),
          ]),
          new THREE.LineBasicMaterial({ color: "#76a89a" }),
        ),
      );
      if (!e.bidirectional) {
        const d = Math.hypot(c.x - a.x, c.y - a.y);
        if (d > 0.01)
          scene.add(
            new THREE.ArrowHelper(
              new THREE.Vector3((c.x - a.x) / d, 0, -(c.y - a.y) / d),
              new THREE.Vector3((a.x + c.x) / 2, 0.04, -(a.y + c.y) / 2),
              Math.min(0.5, d * 0.2),
              0x76a89a,
              Math.min(0.3, d * 0.1),
              Math.min(0.2, d * 0.08),
            ),
          );
      }
    }
    const line = (points: { x: number; y: number }[], color: number) =>
      scene.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(
            points.map((p) => new THREE.Vector3(p.x, 0.08, -p.y)),
          ),
          new THREE.LineBasicMaterial({ color }),
        ),
      );
    for (const d of layers.doors)
      line([level.vertices[d.start], level.vertices[d.end]], 0xd6a343);
    for (const l of layers.lifts) {
      const p = liftPolygon(l);
      line([...p, p[0]], 0x8062ad);
    }
    if (layers.models.length)
      scene.add(
        new THREE.Points(
          new THREE.BufferGeometry().setFromPoints(
            layers.models.map(
              (m) =>
                new THREE.Vector3(
                  m.position[0],
                  m.position[2] - level.elevation + 0.1,
                  -m.position[1],
                ),
            ),
          ),
          new THREE.PointsMaterial({
            color: 0x9b7e63,
            size: 5,
            sizeAttenuation: false,
          }),
        ),
      );
    for (const v of layers.labels) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 64;
      const context = canvas.getContext("2d");
      if (!context) continue;
      context.font = "28px sans-serif";
      context.fillStyle = "#245e4b";
      context.fillText(v.name, 4, 42, 500);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: new THREE.CanvasTexture(canvas),
          depthTest: false,
        }),
      );
      sprite.position.set(v.x, 0.3, -v.y);
      sprite.scale.set(size * 0.13, size * 0.016, 1);
      scene.add(sprite);
    }
    for (const o of objects.filter((o) => o.level === levelId)) {
      if (o.type === "route") {
        scene.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(
              o.points.map(([x, y]) => new THREE.Vector3(x, 0.04, -y)),
            ),
            new THREE.LineBasicMaterial({ color: "#297aac" }),
          ),
        );
      } else {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(o.w, 0.04, o.h),
          new THREE.MeshStandardMaterial({
            color: o.type === "restricted" ? "#b35f4d" : "#9675c3",
            transparent: true,
            opacity: 0.4,
          }),
        );
        mesh.position.set(o.x, 0.03, -o.y);
        mesh.rotation.y = o.yaw;
        scene.add(mesh);
      }
    }
    const group = new THREE.Group();
    bodyGroup.current = group;
    scene.add(group);
    const resize = () => {
      const width = element.clientWidth,
        height = element.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    let id = 0;
    const draw = () => {
      controls.update();
      renderer.render(scene, camera);
      id = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(id);
      observer.disconnect();
      controls.dispose();
      scene.traverse(disposeObject);
      renderer.dispose();
      renderer.domElement.remove();
      bodyGroup.current = null;
    };
  }, [map, levelId, objects, layers]);
  useEffect(() => {
    const group = bodyGroup.current;
    if (!group) return;
    for (const child of [...group.children]) {
      child.traverse(disposeObject);
      group.remove(child);
    }
    for (const body of frame?.bodies ?? []) {
      const shape = new THREE.Shape(
        body.polygon.map((p) => new THREE.Vector2(p.x, p.y)),
      );
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: body.height,
        bevelEnabled: false,
      });
      geometry.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: body.kind === "trailer" ? "#9dc5b4" : "#245e4b",
        }),
      );
      group.add(mesh);
    }
    if (!frame)
      for (const device of devices.filter((d) => d.level === levelId)) {
        const [x, y, yaw] = device.pose;
        group.add(
          new THREE.ArrowHelper(
            new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)),
            new THREE.Vector3(x, 0.2, -y),
            1.5,
            0x245e4b,
          ),
        );
      }
  }, [frame, map, levelId, objects, devices, layers]);
  return (
    <div
      ref={host}
      data-testid="map-3d"
      data-lanes={layers.lanes.length}
      data-doors={layers.doors.length}
      data-lifts={layers.lifts.length}
      data-models={layers.models.length}
      data-labels={layers.labels.length}
      className="h-[55vh] min-h-80 overflow-hidden rounded-lg"
    />
  );
}
function disposeObject(object: THREE.Object3D) {
  if (
    object instanceof THREE.Mesh ||
    object instanceof THREE.Line ||
    object instanceof THREE.Points ||
    object instanceof THREE.Sprite
  ) {
    if (!(object instanceof THREE.Sprite)) object.geometry.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const m of materials) {
      if ("map" in m && m.map instanceof THREE.Texture) m.map.dispose();
      m.dispose();
    }
  }
}
