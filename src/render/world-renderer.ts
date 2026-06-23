// WorldRenderer: builds static 3D world geometry and adds it to the scene.
// Owns ground, town square, buildings, props, foliage, roads, portal pillars,
// and campfire flicker animation.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { Sim } from '../sim/sim';
import { grassTex, cobbleTex, roadTex, sandTex, desertTileTex } from './textures';

export class WorldRenderer {
  private campfireLights: THREE.PointLight[] = [];

  constructor(scene: THREE.Scene, sim: Sim) {
    const isDesert = sim.zone.name.toLowerCase().includes('desert');

    // ── Ground plane ─────────────────────────────────────────────────────
    const groundTex = isDesert ? sandTex() : grassTex();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(250, 250),
      new THREE.MeshLambertMaterial({ map: groundTex }),
    );
    ground.rotation.x = -Math.PI / 2;
    if (isDesert) {
      ground.position.set(200, 0, 200);
    }
    ground.receiveShadow = true;
    scene.add(ground);

    // ── Town square ───────────────────────────────────────────────────────
    const tsTex = isDesert ? desertTileTex() : cobbleTex();
    const ts = new THREE.Mesh(
      new THREE.PlaneGeometry(sim.zone.townSquare.width, sim.zone.townSquare.depth),
      new THREE.MeshLambertMaterial({ map: tsTex }),
    );
    ts.rotation.x = -Math.PI / 2;
    ts.position.set(isDesert ? 200 : 0, 0.01, isDesert ? 200 : -4);
    ts.receiveShadow = true;
    scene.add(ts);

    this.addBuildings(scene, sim, isDesert);
    this.addPortalVisuals(scene, sim);
  }

  private addBuildings(scene: THREE.Scene, sim: Sim, isDesert: boolean): void {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);

    const loadProp = (url: string, x: number, z: number, rotY: number, scale = 1) => {
      loader.load(url, (gltf) => {
        const model = gltf.scene;
        model.position.set(x, 0, z);
        model.rotation.y = rotY;
        model.scale.setScalar(scale);
        model.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
        });
        if (url.includes('bonfire')) {
          const fl = new THREE.PointLight(0xff6600, 3.5, 14);
          fl.position.set(0, 0.6, 0);
          fl.castShadow = true;
          fl.shadow.bias = -0.002;
          model.add(fl);
          // Track for per-frame flicker without traversing the whole scene
          this.campfireLights.push(fl);
        }
        scene.add(model);
      }, undefined, (err) => console.error(`Failed ${url}:`, err));
    };

    for (const b of sim.zone.buildings) loadProp(b.url, b.x, b.z, b.rotY, b.scale);
    for (const p of sim.zone.props) loadProp(p.url, p.x, p.z, p.rotY, p.scale);
    for (const f of sim.zone.foliage) loadProp(f.url, f.x, f.z, 0, f.scale);

    if (!isDesert) {
      const rt = roadTex();
      for (const road of sim.zone.roads) {
        const dx = road.endX - road.startX;
        const dz = road.endZ - road.startZ;
        const len = Math.sqrt(dx * dx + dz * dz);
        const ang = Math.atan2(dx, dz);
        const st = rt.clone();
        st.repeat.set(1, len / road.width);
        st.needsUpdate = true;
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(road.width, len),
          new THREE.MeshLambertMaterial({ map: st }),
        );
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = ang;
        m.position.set((road.startX + road.endX) / 2, 0.005, (road.startZ + road.endZ) / 2);
        m.receiveShadow = true;
        scene.add(m);
      }
    }
  }

  private addPortalVisuals(scene: THREE.Scene, sim: Sim): void {
    for (const portal of sim.zone.portals) {
      const p = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.4, 1.5, 8),
        new THREE.MeshStandardMaterial({
          color: 0x8b5cf6, emissive: 0x6d28d9,
          emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.4,
        }),
      );
      p.position.set(portal.x, 0.75, portal.z);
      p.castShadow = true;
      scene.add(p);

      const g = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.6 }),
      );
      g.position.set(portal.x, 1.8, portal.z);
      scene.add(g);

      const l = new THREE.PointLight(0x8b5cf6, 1.0, 4);
      l.position.set(portal.x, 1.8, portal.z);
      scene.add(l);
    }
  }

  /** Animate campfire flicker. Call once per frame from Renderer.render(). */
  update(): void {
    const t = performance.now();
    for (const fl of this.campfireLights) {
      fl.intensity = 2.4 + Math.sin(t * 0.015) * 0.6 + Math.random() * 0.2;
    }
  }
}
