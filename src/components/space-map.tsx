"use client";

import { useEffect, useRef } from "react";
import type { SpaceModel } from "@/spatial/model";

export function SpaceMap({ model }: { model: SpaceModel }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let stopped = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (stopped || !host.current) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(element.clientWidth, 520);
      element.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#f4f0e6");
      const camera = new THREE.PerspectiveCamera(42, element.clientWidth / 520, 0.1, 500);
      camera.position.set(18, 16, 22);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      scene.add(new THREE.AmbientLight(0xffffff, 0.85));
      const sun = new THREE.DirectionalLight(0xffffff, 1.1);
      sun.position.set(12, 24, 8);
      scene.add(sun);
      scene.add(new THREE.GridHelper(80, 40, 0xc8bfb0, 0xe4dccb));

      const group = new THREE.Group();
      scene.add(group);
      const box = new THREE.Box3();

      for (const room of model.rooms) {
        if (room.polygon.length < 3) continue;
        const shape = new THREE.Shape();
        room.polygon.forEach((point, index) => {
          if (index === 0) shape.moveTo(point.x, point.y);
          else shape.lineTo(point.x, point.y);
        });
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: room.heightFt, bevelEnabled: false });
        geometry.rotateX(-Math.PI / 2);
        const assumed = room.heightVisual === "assumed_schematic";
        const confirmed = room.heightVisual === "confirmed";
        const material = new THREE.MeshStandardMaterial({
          color: assumed ? "#d9d0c2" : confirmed ? "#d5e4df" : "#f0e2cc",
          transparent: true,
          opacity: assumed ? 0.28 : confirmed ? 0.88 : 0.62,
          wireframe: assumed,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        group.add(mesh);
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry),
          new THREE.LineBasicMaterial({ color: confirmed ? "#14332f" : "#5c5346" }),
        );
        if (!confirmed) edges.material.linewidth = 1;
        group.add(edges);
        box.expandByObject(mesh);
        const label = makeLabel(THREE, `${room.name}\n${room.heightVisual === "assumed_schematic" ? "height not measured" : `${room.heightFt} ft ${room.heightVisual}`}`);
        const center = room.polygon.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
        label.position.set(center.x / room.polygon.length, room.heightFt + 0.4, center.y / room.polygon.length);
        group.add(label);
      }

      for (const marker of model.markers.filter((item) => item.kind === "damage" || item.kind === "opening")) {
        const sprite = makeLabel(THREE, marker.label);
        sprite.position.set(marker.at.x, marker.at.y + 0.3, marker.at.z);
        sprite.scale.set(4.2, 1.1, 1);
        group.add(sprite);
      }

      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        controls.target.copy(center);
        camera.lookAt(center);
      }

      const onResize = () => {
        if (!host.current) return;
        renderer.setSize(host.current.clientWidth, 520);
        camera.aspect = host.current.clientWidth / 520;
        camera.updateProjectionMatrix();
      };
      window.addEventListener("resize", onResize);
      let frame = 0;
      const tick = () => {
        controls.update();
        renderer.render(scene, camera);
        frame = requestAnimationFrame(tick);
      };
      tick();
      cleanup = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("resize", onResize);
        controls.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      stopped = true;
      cleanup();
    };
  }, [model]);

  return (
    <div>
      <p className="banner">{model.disclaimer}</p>
      <p className="meta">{model.videoNote} Drag to orbit. Scroll to zoom.</p>
      <div ref={host} className="sketch-wrap" role="img" aria-label="Three-dimensional schematic of the property" />
      <ul className="list">
        {model.rooms.map((room) => (
          <li key={room.roomId} className="item">
            <strong>{room.name}</strong>
            <span className={`badge ${room.heightVisual === "confirmed" ? "confirmed" : room.heightVisual === "provisional" ? "provisional" : "inferred"}`}>
              {room.heightVisual === "assumed_schematic" ? "dashed volume · height not measured" : room.heightVisual === "confirmed" ? "solid volume · confirmed height" : "translucent volume · provisional height"}
            </span>
            <div className="meta">{room.heightNote} Outline: {room.provenance}{room.incomplete ? " · incomplete" : ""}.</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function makeLabel(THREE: typeof import("three"), text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "rgba(255,252,246,0.92)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#1c1915";
    context.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    context.fillStyle = "#1c1915";
    context.font = "32px sans-serif";
    text.split("\n").forEach((line, index) => context.fillText(line.slice(0, 42), 16, 48 + index * 40));
  }
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(6.5, 1.6, 1);
  return sprite;
}
