import * as THREE from "/vendor/three.js";
import { Viewer } from "./viewer.js";
import { escapeText as esc, visibleLanes, liftPolygon } from "./map-data.js";

// Reuse camera/orbit/resize handling, never pass a simulation run into this view.
export class MapViewer extends Viewer {
  constructor(element) {
    super(element);
    this.pan = [0, 0];
    let drag;
    element.addEventListener("pointerdown", (e) => {
      if (this.mode === "2d" && e.button === 0) drag = [e.clientX, e.clientY];
    });
    element.addEventListener("pointerup", () => (drag = null));
    element.addEventListener("pointercancel", () => (drag = null));
    element.addEventListener("pointermove", (e) => {
      if (!drag || this.mode !== "2d" || !this.level) return;
      const b = this.level.bounds;
      const scale =
        Math.max(b.w / element.clientWidth, b.h / element.clientHeight) *
        this.zoom;
      this.pan[0] -= (e.clientX - drag[0]) * scale;
      this.pan[1] += (e.clientY - drag[1]) * scale;
      drag = [e.clientX, e.clientY];
      this.draw();
    });
    element.addEventListener(
      "wheel",
      (e) => {
        if (this.mode !== "2d") return;
        e.preventDefault();
        this.zoom = Math.max(
          0.08,
          Math.min(4, this.zoom * Math.exp(e.deltaY * 0.001)),
        );
        this.draw();
      },
      { passive: false },
    );
  }
  setMap(data, level, options) {
    this.data = data;
    this.level = level;
    this.options = options;
    this.run = { map: { bounds: level.bounds } };
    this.frame = { bodies: [] };
    this.follow = false;
    this.clear(this.fixed);
    if (this.renderer) this.build();
    this.draw();
  }
  reset() {
    this.zoom = 1;
    this.pan = [0, 0];
    this.draw();
  }
  build() {
    const l = this.level,
      opt = this.options;
    const addLine = (points, color, z = 0.06, closed = false) => {
      const ps = closed ? [...points, points[0]] : points;
      this.fixed.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(
            ps.map((p) => new THREE.Vector3(p.x, p.y, z)),
          ),
          new THREE.LineBasicMaterial({ color }),
        ),
      );
    };
    const inside = (p, vs) => {
      let yes = false;
      for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const a = vs[i],
          b = vs[j];
        if (
          a.y > p.y !== b.y > p.y &&
          p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
        )
          yes = !yes;
      }
      return yes;
    };
    for (const f of l.floors) {
      const vertices = f.vertices.map((i) => l.vertices[i]);
      const shape = new THREE.Shape(
        vertices.map((p) => new THREE.Vector2(p.x, p.y)),
      );
      for (const h of l.holes) {
        const hp = h.vertices.map((i) => l.vertices[i]);
        if (hp.every((p) => inside(p, vertices)))
          shape.holes.push(
            new THREE.Path(hp.map((p) => new THREE.Vector2(p.x, p.y))),
          );
      }
      this.fixed.add(
        new THREE.Mesh(
          new THREE.ShapeGeometry(shape),
          new THREE.MeshStandardMaterial({
            color: 0xe0e6d7,
            side: THREE.DoubleSide,
          }),
        ),
      );
    }
    if (opt.walls)
      for (const e of l.walls) {
        const a = l.vertices[e.start],
          b = l.vertices[e.end],
          length = Math.hypot(b.x - a.x, b.y - a.y);
        if (!length) continue;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(length, 0.1, 2.5),
          new THREE.MeshStandardMaterial({ color: 0xa4b3a3 }),
        );
        mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, 1.25);
        mesh.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
        this.fixed.add(mesh);
      }
    if (opt.lanes)
      for (const e of visibleLanes(l, opt.graph)) {
        const a = l.vertices[e.start],
          b = l.vertices[e.end];
        addLine([a, b], 0x27745d, 0.14);
        if (!e.bidirectional) {
          const d = Math.hypot(b.x - a.x, b.y - a.y);
          if (d > 0.01) {
            const u = { x: (b.x - a.x) / d, y: (b.y - a.y) / d },
              size = Math.min(0.5, d * 0.2),
              p = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            addLine(
              [
                {
                  x: p.x - u.x * size - u.y * size * 0.5,
                  y: p.y - u.y * size + u.x * size * 0.5,
                },
                p,
                {
                  x: p.x - u.x * size + u.y * size * 0.5,
                  y: p.y - u.y * size - u.x * size * 0.5,
                },
              ],
              0x27745d,
              0.15,
            );
          }
        }
      }
    if (opt.facilities) {
      for (const d of l.doors)
        addLine([l.vertices[d.start], l.vertices[d.end]], 0xc38b36, 0.2);
      for (const lift of this.data.lifts.filter((x) => x.levels.includes(l.id)))
        addLine(liftPolygon(lift), 0x8062ad, 0.21, true);
    }
    if (opt.models && l.models.length) {
      const geometry = new THREE.BufferGeometry().setFromPoints(
        l.models.map(
          (m) =>
            new THREE.Vector3(
              m.position[0],
              m.position[1],
              m.position[2] - l.elevation + 0.3,
            ),
        ),
      );
      this.fixed.add(
        new THREE.Points(
          geometry,
          new THREE.PointsMaterial({
            color: 0x9b7e63,
            size: 4,
            sizeAttenuation: false,
          }),
        ),
      );
    }
  }
  draw() {
    if (!this.level) return;
    if (this.mode === "3d") {
      super.draw();
      return;
    }
    if (this.renderer) this.renderer.domElement.hidden = true;
    if (!this.svg) return;
    this.svg.hidden = false;
    const l = this.level,
      o = this.options,
      b = l.bounds;
    const w = b.w * this.zoom,
      h = b.h * this.zoom,
      x = b.x + (b.w - w) / 2 + this.pan[0],
      y = b.y + (b.h - h) / 2 + this.pan[1];
    const sw = Math.max(b.w, b.h) * 0.0012;
    const points = (vs) => vs.map((p) => `${p.x},${-p.y}`).join(" ");
    const edge = (e, color, width, title, arrow = false) => {
      const a = l.vertices[e.start],
        b = l.vertices[e.end];
      return `<path d="M ${a.x} ${-a.y} L ${(a.x + b.x) / 2} ${-(a.y + b.y) / 2} L ${b.x} ${-b.y}" fill="none" stroke="${color}" stroke-width="${width}" ${arrow ? 'marker-mid="url(#direction)"' : ""}><title>${esc(title)}</title></path>`;
    };
    const nav = visibleLanes(l, o.graph),
      ids = new Set(nav.flatMap((e) => [e.start, e.end]));
    this.svg.innerHTML = `<svg viewBox="${x} ${-y - h} ${w} ${h}" role="img" aria-label="Static RMF map"><defs><marker id="direction" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5" fill="none" stroke="#27745d"/></marker></defs>
      ${l.floors.map((f) => `<polygon points="${points(f.vertices.map((i) => l.vertices[i]))}" fill="#e0e6d7" stroke="#c5d0bd" stroke-width="${sw * 0.4}"/>`).join("")}
      ${l.holes.map((f) => `<polygon points="${points(f.vertices.map((i) => l.vertices[i]))}" fill="#eef1e8"/>`).join("")}
      ${o.walls ? l.walls.map((e) => edge(e, "#748875", sw * 1.7, "Wall")).join("") : ""}
      ${o.lanes ? nav.map((e) => edge(e, "#27745d", sw, `Graph ${e.graph} · ${e.start} ${e.bidirectional ? "↔" : "→"} ${e.end}`, !e.bidirectional)).join("") : ""}
      ${
        o.lanes
          ? [...ids]
              .map((i) => {
                const v = l.vertices[i];
                return `<circle cx="${v.x}" cy="${-v.y}" r="${sw * 1.6}" fill="#27745d"><title>${esc(v.name || `#${i}`)}</title></circle>`;
              })
              .join("")
          : ""
      }
      ${o.facilities ? l.doors.map((e) => edge(e, "#c38b36", sw * 2.5, e.parameters.name ?? "Door")).join("") : ""}
      ${
        o.facilities
          ? this.data.lifts
              .filter((v) => v.levels.includes(l.id))
              .map(
                (v) =>
                  `<polygon points="${points(liftPolygon(v))}" fill="#8062ad22" stroke="#8062ad" stroke-width="${sw * 1.8}"><title>${esc(v.id)}</title></polygon>`,
              )
              .join("")
          : ""
      }
      ${o.models ? l.models.map((m) => `<circle cx="${m.position[0]}" cy="${-m.position[1]}" r="${sw * 1.7}" fill="#9b7e63"><title>${esc(m.model)} · ${esc(m.name)}</title></circle>`).join("") : ""}
      ${
        o.labels
          ? l.vertices
              .filter((v) => v.name)
              .map(
                (v) =>
                  `<text x="${v.x + sw * 2}" y="${-v.y - sw * 2}" font-size="${sw * 9}" fill="#183e30" paint-order="stroke" stroke="#f8faf4" stroke-width="${sw * 1.5}">${esc(v.name)}</text>`,
              )
              .join("")
          : ""
      }
      </svg>`;
  }
}
