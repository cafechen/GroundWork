import * as THREE from "/vendor/three.js";
import { MapViewer } from "./map-viewer.js";
import { escapeText as esc } from "./map-data.js";
export class ParkViewer extends MapViewer {
  constructor(el, onPick) {
    super(el);
    let down;
    el.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
    el.addEventListener("pointerup", (e) => {
      if (
        !onPick ||
        this.mode !== "2d" ||
        !down ||
        Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5
      )
        return;
      const svg = this.svg.querySelector("svg");
      if (!svg) return;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
        svg.getScreenCTM().inverse(),
      );
      onPick(p.x, -p.y);
    });
  }
  overlay(objects = [], devices = [], frame = null) {
    this.objects = objects;
    this.devices = devices;
    this.liveFrame = frame;
    this.clear(this.dynamic);
    if (this.renderer) {
      for (const o of objects) {
        if (o.type === "route") {
          const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(
              o.points.map((p) => new THREE.Vector3(p[0], p[1], 0.3)),
            ),
            new THREE.LineBasicMaterial({ color: 0x4786a0 }),
          );
          this.dynamic.add(line);
        } else {
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(o.w, o.h, 0.15),
            new THREE.MeshStandardMaterial({
              color: o.type === "restricted" ? 0xcc7564 : 0xc5a15b,
              transparent: true,
              opacity: 0.6,
            }),
          );
          mesh.position.set(o.x, o.y, 0.2);
          mesh.rotation.z = o.yaw;
          this.dynamic.add(mesh);
        }
      }
      for (const b of frame?.bodies || []) {
        const p = b.polygon,
          mesh = new THREE.Mesh(
            new THREE.BoxGeometry(
              Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y),
              Math.hypot(p[2].x - p[1].x, p[2].y - p[1].y),
              b.height || 0.7,
            ),
            new THREE.MeshStandardMaterial({
              color: b.kind === "trailer" ? 0x85af99 : 0x225d49,
            }),
          );
        mesh.position.set(
          p.reduce((s, v) => s + v.x, 0) / 4,
          p.reduce((s, v) => s + v.y, 0) / 4,
          (b.height || 0.7) / 2,
        );
        mesh.rotation.z = Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x);
        this.dynamic.add(mesh);
      }
      if (!frame)
        for (const d of devices) {
          const arrow = new THREE.Mesh(
            new THREE.ConeGeometry(0.35, 1.5, 3),
            new THREE.MeshStandardMaterial({
              color: d.kind === "virtual" ? 0x225d49 : 0x527ea7,
            }),
          );
          arrow.position.set(d.pose[0], d.pose[1], 0.4);
          arrow.rotation.z = d.pose[2] - Math.PI / 2;
          this.dynamic.add(arrow);
        }
    }
    this.draw();
  }
  draw() {
    super.draw();
    if (!this.level || this.mode !== "2d") return;
    const svg = this.svg.querySelector("svg");
    if (!svg) return;
    const size = Math.max(this.level.bounds.w, this.level.bounds.h) * 0.005;
    const points = (p) => p.map((v) => `${v.x},${-v.y}`).join(" ");
    svg.insertAdjacentHTML(
      "beforeend",
      `<g data-business-overlay>${(this.objects || []).map((o) => (o.type === "route" ? `<polyline points="${o.points.map((p) => `${p[0]},${-p[1]}`).join(" ")}" fill="none" stroke="#4387a0" stroke-width="${size * 0.6}"/>` : `<g transform="translate(${o.x},${-o.y}) rotate(${(-o.yaw * 180) / Math.PI})"><rect x="${-o.w / 2}" y="${-o.h / 2}" width="${o.w}" height="${o.h}" fill="${o.type === "restricted" ? "#c9706066" : "#c9a35e66"}" stroke="${o.type === "restricted" ? "#b86759" : "#a38143"}" stroke-width="${size * 0.25}"/></g>`)).join("")}${(this.objects || []).map((o) => `<text x="${o.x + size}" y="${-o.y - size}" font-size="${size * 2}" fill="#624f34" paint-order="stroke" stroke="#fff" stroke-width="${size * 0.4}">${esc(o.name)}</text>`).join("")}${this.liveFrame ? (this.liveFrame.bodies || []).map((b) => `<polygon points="${points(b.polygon)}" fill="${b.kind === "trailer" ? "#85af99" : "#225d49"}" stroke="#163e30" stroke-width="${size * 0.2}"/>`).join("") : (this.devices || []).map((d) => `<g transform="translate(${d.pose[0]},${-d.pose[1]}) rotate(${(-d.pose[2] * 180) / Math.PI})"><path d="M ${size * 2} 0 L ${-size} ${-size} L ${-size} ${size} Z" fill="${d.kind === "virtual" ? "#225d49" : "#527ea7"}"/></g><text x="${d.pose[0]}" y="${-d.pose[1] - size * 2}" font-size="${size * 2}" fill="#225d49">${esc(d.name)}</text>`).join("")}</g>`,
    );
  }
  dispose() {
    this.observer?.disconnect();
    this.clear(this.fixed);
    this.clear(this.dynamic);
    this.renderer?.dispose();
  }
}
