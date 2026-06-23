// Renderer: scene/camera/lights orchestrator.
// Creates the Three.js scene, delegates world geometry to WorldRenderer,
// delegates DOM UI to Hud, and drives CharacterVisuals for player and mobs.

import * as THREE from 'three';
import type { Sim } from '../sim/sim';
import type { InputState } from '../game/input';
import { CharacterVisual, loadGlb } from './character';
import type { CharacterDef } from './character';
import { WorldRenderer } from './world-renderer';
import { Hud } from './hud';
import { MOB_REGISTRY } from '../sim/world';
import playerDefinitions from '../data/player_definitions.json';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

// ── Camera constants ──────────────────────────────────────────────────────
const INITIAL_DIST  = 18;
const INITIAL_THETA = 0;
const INITIAL_PHI   = 0.5;
const MIN_DIST   = 3;
const MAX_DIST   = 50;
const PHI_MIN    = 0;
const PHI_MAX    = 1.4;
const ORBIT_SENS = 0.005;
const ZOOM_SENS  = 0.1;
const CAM_LAG    = 6;

// ── Character definitions ─────────────────────────────────────────────────
const MAGE_DEF: CharacterDef = {
  url: playerDefinitions.mage.modelUrl,
  height: playerDefinitions.mage.modelHeight,
  show: playerDefinitions.mage.showMeshes,
  attach: playerDefinitions.mage.weapon ? {
    url: playerDefinitions.mage.weapon.url,
    bone: playerDefinitions.mage.weapon.bone
  } : undefined,
};

/** Build a CharacterDef for a mob type from the data registry.
 *  Falls back to orc if the type is unknown. */
function defForMobType(type: string): CharacterDef {
  const def = MOB_REGISTRY[type] ?? MOB_REGISTRY['orc'];
  return {
    url: def.modelUrl,
    height: def.modelHeight,
    clips: def.clips,
  };
}

export class Renderer {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private threeRenderer!: THREE.WebGLRenderer;
  private playerVisual!: CharacterVisual;
  private mobVisuals: CharacterVisual[] = [];
  private npcVisuals: CharacterVisual[] = [];
  private sim: Sim;
  private orbitTheta = INITIAL_THETA;
  private orbitPhi   = INITIAL_PHI;
  private orbitDist  = INITIAL_DIST;
  private camPos = new THREE.Vector3(0, 0, INITIAL_DIST);
  private targetRing: THREE.Mesh | null = null;
  private projectileVisuals = new Map<string, THREE.Mesh>();
  private lootVisuals = new Map<string, THREE.Group>();
  private worldRenderer!: WorldRenderer;
  private hud!: Hud;
  private onResizeBound!: () => void;
  private mouseUpBound!: (e: MouseEvent) => void;

  constructor(canvas: HTMLCanvasElement, sim: Sim) {
    this.sim = sim;
    const isDesert = sim.zone.name.toLowerCase().includes('desert');

    // ── Scene ──────────────────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(isDesert ? 0xf0c27a : 0xbbe1fa);
    this.scene.fog = new THREE.Fog(isDesert ? 0xf0c27a : 0xbbe1fa, 80, 200);

    // ── Camera ─────────────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(
      55, canvas.clientWidth / canvas.clientHeight, 0.1, 500,
    );
    this.camera.position.set(0, 0, INITIAL_DIST);
    this.camera.lookAt(0, 1.2, 0);

    // ── WebGL renderer ─────────────────────────────────────────────────
    this.threeRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.threeRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.threeRenderer.shadowMap.enabled = true;
    this.threeRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.threeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.threeRenderer.toneMappingExposure = 1.1;

    // ── Lighting ───────────────────────────────────────────────────────
    const sun = new THREE.DirectionalLight(0xfffef0, 2.5);
    sun.position.set(40, 70, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far  = 200;
    sun.shadow.camera.left   = -45; sun.shadow.camera.right = 45;
    sun.shadow.camera.top    =  45; sun.shadow.camera.bottom = -45;
    sun.shadow.bias = -0.0008;
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0xf1f5f9, 1.5));

    // ── World geometry ─────────────────────────────────────────────────
    this.worldRenderer = new WorldRenderer(this.scene, sim);

    // ── Player visual ──────────────────────────────────────────────────
    this.playerVisual = new CharacterVisual(MAGE_DEF);
    this.scene.add(this.playerVisual.root);

    // ── HUD ────────────────────────────────────────────────────────────
    this.hud = new Hud();

    // ── Event listeners ────────────────────────────────────────────────
    this.mouseUpBound = (e: MouseEvent) => {
      if (e.button === 0) this.handleCanvasClick(e, canvas);
    };
    canvas.addEventListener('mouseup', this.mouseUpBound);

    this.onResizeBound = () => this.onResize(canvas);
    window.addEventListener('resize', this.onResizeBound);
    this.onResize(canvas);
  }

  dispose(): void {
    const canvas = this.threeRenderer.domElement;
    canvas.removeEventListener('mouseup', this.mouseUpBound);
    window.removeEventListener('resize', this.onResizeBound);

    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m: any) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
    for (const group of this.lootVisuals.values()) {
      this.scene.remove(group);
    }
    this.lootVisuals.clear();

    for (const v of this.npcVisuals) {
      this.scene.remove(v.root);
    }
    this.npcVisuals = [];

    this.threeRenderer.dispose();
    this.hud.dispose();
    this.mobVisuals = [];
    this.projectileVisuals.clear();
  }

  /** Show a brief bottom-right toast notification. */
  showMessage(text: string, duration?: number, color?: string): void {
    this.hud.showMessage(text, duration, color);
  }

  // ── Click-to-target raycasting (writes targetId — intentional exception) ──
  private handleCanvasClick(e: MouseEvent, canvas: HTMLCanvasElement): void {
    const r  = canvas.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width)  *  2 - 1;
    const my = -((e.clientY - r.top)  / r.height) *  2 + 1;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(mx, my), this.camera);
    const targets = this.mobVisuals
      .map((v, i) => ({ visual: v, mob: this.sim.mobs[i] }))
      .filter(t => t.mob.health > 0);
    const hits = rc.intersectObjects(targets.map(t => t.visual.root), true);
    if (hits.length > 0) {
      let parent: THREE.Object3D | null = hits[0].object;
      while (parent && parent !== this.scene) {
        const m = targets.find(t => t.visual.root === parent);
        if (m) { this.sim.player.targetId = m.mob.id; return; }
        parent = parent.parent;
      }
    }
  }

  render(dt: number, sim: Sim, input: InputState): void {
    const p = sim.player;

    // ── Camera orbit ────────────────────────────────────────────────────
    if (input.isPointerLocked) {
      this.orbitTheta -= input.mouseDeltaX * ORBIT_SENS;
      this.orbitPhi   -= input.mouseDeltaY * ORBIT_SENS;
    }
    this.orbitDist += input.scrollDelta * ZOOM_SENS;
    this.orbitPhi  = Math.max(PHI_MIN, Math.min(PHI_MAX, this.orbitPhi));
    this.orbitDist = Math.max(MIN_DIST, Math.min(MAX_DIST, this.orbitDist));

    const cp = Math.cos(this.orbitPhi), sp = Math.sin(this.orbitPhi);
    const ct = Math.cos(this.orbitTheta), st = Math.sin(this.orbitTheta);
    const tx = p.x - this.orbitDist * cp * st;
    const tz = p.z - this.orbitDist * cp * ct;
    const ty = this.orbitDist * sp;

    const camLerp = Math.min(1, CAM_LAG * dt);
    this.camPos.x += (tx - this.camPos.x) * camLerp;
    this.camPos.y += (ty - this.camPos.y) * camLerp;
    this.camPos.z += (tz - this.camPos.z) * camLerp;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(p.x, 1.2, p.z);

    // ── Player visual ───────────────────────────────────────────────────
    this.playerVisual.root.position.set(p.x, 0, p.z);
    this.playerVisual.root.rotation.y = p.facing;
    this.playerVisual.update(dt, { moving: p.moving, movingBack: false });

    // ── Mob visuals ─────────────────────────────────────────────────────
    while (this.mobVisuals.length < sim.mobs.length) {
      const m  = sim.mobs[this.mobVisuals.length];
      const mv = new CharacterVisual(defForMobType(m.type));
      this.scene.add(mv.root);
      this.mobVisuals.push(mv);
    }
    for (let i = 0; i < sim.mobs.length; i++) {
      const m = sim.mobs[i];
      const v = this.mobVisuals[i];
      v.root.position.set(m.x, 0, m.z);
      v.root.rotation.y = m.facing;
      v.root.visible = m.health > 0;
      v.update(dt, { moving: m.moving, movingBack: false });
    }

    // ── NPC visuals ─────────────────────────────────────────────────────
    const npcs = sim.zone.npcs || [];
    while (this.npcVisuals.length < npcs.length) {
      const npcDef = npcs[this.npcVisuals.length];
      const mv = new CharacterVisual({
        url: npcDef.modelUrl,
        height: 2.2,
        clips: { idle: 'Idle' }
      });
      this.scene.add(mv.root);
      this.npcVisuals.push(mv);
    }
    for (let i = 0; i < npcs.length; i++) {
      const npcDef = npcs[i];
      const v = this.npcVisuals[i];
      v.root.position.set(npcDef.x, 0, npcDef.z);
      v.root.rotation.y = npcDef.rotY;
      v.update(dt, { moving: false, movingBack: false });
    }

    // ── Target ring ─────────────────────────────────────────────────────
    let activeTarget = p.targetId
      ? sim.mobs.find(m => m.id === p.targetId) ?? null
      : null;
    if (activeTarget && activeTarget.health <= 0) activeTarget = null;

    if (activeTarget) {
      if (!this.targetRing) {
        this.targetRing = new THREE.Mesh(
          new THREE.RingGeometry(0.8, 1.0, 32),
          new THREE.MeshBasicMaterial({ color: 0xffcc00, side: THREE.DoubleSide }),
        );
        this.targetRing.rotation.x = -Math.PI / 2;
        this.scene.add(this.targetRing);
      }
      this.targetRing.position.set(activeTarget.x, 0.02, activeTarget.z);
      this.targetRing.visible = true;
    } else if (this.targetRing) {
      this.targetRing.visible = false;
    }

    // ── Projectile visuals ──────────────────────────────────────────────
    const activeProj = new Set(sim.projectiles.map(pr => pr.id));
    for (const [id, mesh] of this.projectileVisuals) {
      if (!activeProj.has(id)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach((m: any) => m.dispose());
        else mesh.material.dispose();
        this.projectileVisuals.delete(id);
      }
    }
    for (const pr of sim.projectiles) {
      let mesh = this.projectileVisuals.get(pr.id);
      if (!mesh) {
        const color = pr.spellType === 'fireball' ? 0xff4500 : 0x00bfff;
        const geom  = new THREE.SphereGeometry(pr.spellType === 'fireball' ? 0.35 : 0.28, 8, 8);
        const mat   = new THREE.MeshBasicMaterial({ color, toneMapped: false });
        mesh = new THREE.Mesh(geom, mat);
        mesh.add(new THREE.PointLight(color, 1.5, 3));
        this.scene.add(mesh);
        this.projectileVisuals.set(pr.id, mesh);
      }
      mesh.position.set(pr.x, 1.2, pr.z);
    }

    // ── Loot visuals ───────────────────────────────────────────────────
    const activeLoot = new Set(sim.lootContainers.map(lc => lc.id));
    for (const [id, group] of this.lootVisuals) {
      if (!activeLoot.has(id)) {
        this.scene.remove(group);
        this.lootVisuals.delete(id);
      }
    }
    for (const lc of sim.lootContainers) {
      let group = this.lootVisuals.get(lc.id);
      if (!group) {
        group = new THREE.Group();
        group.position.set(lc.x, 0, lc.z);
        this.scene.add(group);
        this.lootVisuals.set(lc.id, group);

        loadGlb('models/resources/gems_chest.glb').then(gltf => {
          if (this.lootVisuals.has(lc.id)) {
            const chestInstance = skeletonClone(gltf.scene);
            chestInstance.scale.set(1.5, 1.5, 1.5);
            chestInstance.position.set(0, 0, 0);
            group!.add(chestInstance);
          }
        }).catch(err => {
          console.warn('Failed to load chest model:', err);
        });
      }
      const elapsed = performance.now() * 0.003;
      group.position.y = Math.sin(elapsed + lc.x) * 0.08 + 0.08;
      group.rotation.y += dt * 0.5;
    }

    // ── World (campfire flicker) ─────────────────────────────────────────
    this.worldRenderer.update();

    // ── HUD ─────────────────────────────────────────────────────────────
    const rendEl = this.threeRenderer.domElement;

    this.hud.updatePortalPrompt(sim.nearPortalIndex);
    if (input.interact && sim.nearPortalIndex >= 0 && !this.hud.portalListVisible) {
      this.hud.showPortalList(sim.zone.portals);
    }

    this.hud.updateLootPrompt(sim.nearLootContainerIndex);
    if (input.interact && sim.nearLootContainerIndex >= 0 && !this.hud.isLootOpen()) {
      this.hud.showLootContainer(sim.lootContainers[sim.nearLootContainerIndex], sim);
    }

    this.hud.updateNpcPrompt(sim.nearNpcIndex, sim.zone.npcs);
    if (input.interact && sim.nearNpcIndex >= 0 && !this.hud.isDialogueOpen()) {
      this.hud.showDialogue(sim.zone.npcs[sim.nearNpcIndex], sim);
    }

    this.hud.updatePlayer(p, this.playerVisual.height, this.camera, rendEl);
    this.hud.updateMobs(sim.mobs, this.mobVisuals, this.camera, rendEl);
    this.hud.updateNpcs(sim.zone.npcs, this.npcVisuals, this.camera, rendEl);
    this.hud.updateBuildings(sim.zone.buildings, this.camera, rendEl);
    this.hud.updateCastBar(p.activeCast);
    this.hud.updateActionSlots(p, activeTarget !== null);
    this.hud.updateDamageNumbers(sim.combatEvents, dt, this.camera, rendEl);

    // ── Draw ────────────────────────────────────────────────────────────
    this.threeRenderer.render(this.scene, this.camera);
  }

  private onResize(canvas: HTMLCanvasElement): void {
    this.camera.aspect = canvas.clientWidth / canvas.clientHeight;
    this.camera.updateProjectionMatrix();
    this.threeRenderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  }
}