import * as THREE from "/vendor/three.js";
const color = (kind) =>
  kind === "trailer"
    ? 0x9bbfb0
    : kind === "drawbar"
      ? 0x71887c
      : kind === "forklift"
        ? 0xc39d60
        : 0x276a56;
export class Viewer {
  constructor(element) {
    this.element = element;
    this.mode = "3d";
    this.run = null;
    this.frame = null;
    this.angle = 0.65;
    this.elevation = 0.85;
    this.zoom = 1;
    this.meshes = new Map();
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      this.renderer.setClearColor(0xeef1e8);
      element.append(this.renderer.domElement);
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
      this.camera.up.set(0, 0, 1);
      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x74856a, 2.8));
      const sun = new THREE.DirectionalLight(0xffffff, 3);
      sun.position.set(10, -20, 40);
      this.scene.add(sun);
      this.fixed = new THREE.Group();
      this.dynamic = new THREE.Group();
      this.scene.add(this.fixed, this.dynamic);
      this.observer = new ResizeObserver(() => this.draw());
      this.observer.observe(element);
      let drag = null;
      element.onpointerdown = (e) => {
        if (e.button !== 0) return;
        drag = [e.clientX, e.clientY];
        element.setPointerCapture(e.pointerId);
      };
      element.onpointerup = () => (drag = null);
      element.onpointermove = (e) => {
        if (!drag || this.mode !== "3d") return;
        this.angle += (e.clientX - drag[0]) * 0.008;
        this.elevation = Math.max(
          0.15,
          Math.min(1.5, this.elevation + (e.clientY - drag[1]) * 0.006),
        );
        drag = [e.clientX, e.clientY];
        this.draw();
      };
      element.addEventListener(
        "wheel",
        (e) => {
          if (this.mode !== "3d") return;
          e.preventDefault();
          this.zoom = Math.max(
            0.35,
            Math.min(4, this.zoom * Math.exp(e.deltaY * 0.001)),
          );
          this.draw();
        },
        { passive: false },
      );
    } catch (error) {
      this.error = error.message;
      this.mode = "2d";
    }
    this.svg = document.createElement("div");
    this.svg.className = "svg-view";
    element.append(this.svg);
  }
  clear(group) {
    if (!group) return;
    for (const o of [...group.children]) {
      group.remove(o);
      o.geometry?.dispose();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material?.dispose();
    }
  }
  setRun(run) {
    this.run = run;
    this.follow = run.engine === "chrono";
    this.zoom = 1;
    this.clear(this.fixed);
    this.clear(this.dynamic);
    this.meshes.clear();
    if (this.renderer) {
      const b = run.map.bounds;
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(b.w, b.h),
        new THREE.MeshStandardMaterial({ color: 0xe6ebdf, roughness: 1 }),
      );
      floor.position.set(b.x + b.w / 2, b.y + b.h / 2, -0.06);
      this.fixed.add(floor);
      for (const route of run.map.routes) {
        const points = route.map((p) => new THREE.Vector3(p[0], p[1], 0.01));
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color: 0x869c7c }),
        );
        this.fixed.add(line);
      }
      for (const o of run.map.obstacles ?? []) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(o.w, o.h, 1.2),
          new THREE.MeshStandardMaterial({ color: 0xbcc5b0 }),
        );
        mesh.position.set(o.x + o.w / 2, o.y + o.h / 2, 0.6);
        this.fixed.add(mesh);
      }
    }
    this.show(run.frames[0]);
  }
  setMode(mode) {
    this.mode = this.renderer ? mode : "2d";
    this.draw();
  }
  show(frame) {
    this.frame = frame;
    if (this.renderer) {
      for (const m of this.meshes.values()) m.visible = false;
      for (const b of frame.bodies) {
        let mesh = this.meshes.get(b.id);
        const p = b.polygon;
        const length = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y),
          width = Math.hypot(p[2].x - p[1].x, p[2].y - p[1].y);
        if (!mesh) {
          mesh = new THREE.Mesh(
            new THREE.BoxGeometry(length, width, b.height ?? 0.8),
            new THREE.MeshStandardMaterial({
              color: color(b.kind),
              roughness: 0.75,
            }),
          );
          this.meshes.set(b.id, mesh);
          this.dynamic.add(mesh);
        }
        mesh.visible = true;
        mesh.position.set(
          p.reduce((s, v) => s + v.x, 0) / p.length,
          p.reduce((s, v) => s + v.y, 0) / p.length,
          (b.z ?? 0) + (b.height ?? 0.8) / 2,
        );
        if (b.pose)
          mesh.quaternion.set(b.pose[4], b.pose[5], b.pose[6], b.pose[3]);
        else
          mesh.rotation.set(0, 0, Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x));
      }
    }
    this.draw();
  }
  draw() {
    if (!this.run || !this.frame) return;
    let b = this.run.map.bounds;
    if (this.follow && this.frame.bodies.length) {
      const actor = this.frame.bodies[0].actor;
      const points = this.frame.bodies
        .filter((body) => body.actor === actor)
        .flatMap((body) => body.polygon);
      const xs = points.map((p) => p.x),
        ys = points.map((p) => p.y);
      const minX = Math.min(...xs),
        maxX = Math.max(...xs),
        minY = Math.min(...ys),
        maxY = Math.max(...ys);
      const w = Math.max(9, maxX - minX + 5),
        h = Math.max(9, maxY - minY + 5);
      b = { x: (minX + maxX - w) / 2, y: (minY + maxY - h) / 2, w, h };
    }
    if (this.renderer) {
      this.renderer.domElement.hidden = this.mode !== "3d";
      if (this.mode === "3d") {
        const w = this.element.clientWidth,
          h = this.element.clientHeight;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        const r =
          (Math.max(b.w, b.h) /
            (this.camera.aspect < 1 ? this.camera.aspect : 1)) *
          1.35 *
          this.zoom;
        this.camera.position.set(
          b.x + b.w / 2 + r * Math.cos(this.angle) * Math.cos(this.elevation),
          b.y + b.h / 2 - r * Math.sin(this.angle) * Math.cos(this.elevation),
          r * Math.sin(this.elevation),
        );
        this.camera.lookAt(b.x + b.w / 2, b.y + b.h / 2, 0);
        this.renderer.render(this.scene, this.camera);
      }
    }
    if (!this.svg) return;
    this.svg.hidden = this.mode !== "2d";
    if (this.mode === "2d") {
      const pts = (p) => p.map((v) => `${v.x},${-v.y}`).join(" ");
      this.svg.innerHTML = `<svg viewBox="${b.x} ${-b.y - b.h} ${b.w} ${b.h}" aria-label="Simulation replay"><rect x="${b.x}" y="${-b.y - b.h}" width="${b.w}" height="${b.h}" fill="#eef1e8"/>${this.run.map.routes.map((r) => `<polyline points="${r.map((p) => `${p[0]},${-p[1]}`).join(" ")}" fill="none" stroke="#a6b89a" stroke-width=".15"/>`).join("")}${(this.run.map.obstacles ?? []).map((o) => `<rect x="${o.x}" y="${-o.y - o.h}" width="${o.w}" height="${o.h}" fill="#c6cebb"/>`).join("")}${this.frame.bodies.map((body) => `<polygon points="${pts(body.polygon)}" fill="#${color(body.kind).toString(16).padStart(6, "0")}" stroke="#214839" stroke-width=".06"/>`).join("")}</svg>`;
    }
  }
}
