import * as THREE from 'three';
import type { Sim } from '../sim/sim';
import { CharacterVisual } from './character';
import type { InputState } from '../game/input';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
// Orbit camera state initial values (world-relative orbit)
const INITIAL_DIST   = 18;
const INITIAL_THETA  = 0;     // 0 = behind player along -Z (in world space)
const INITIAL_PHI    = 0.5;   // radians above horizontal (~28°)
const MIN_DIST       = 3;
const MAX_DIST       = 50;
const PHI_MIN        = 0;     // stay above ground
const PHI_MAX        = 1.4;   // nearly top-down

// Mouse sensitivity
const ORBIT_SENSITIVITY = 0.005;
const ZOOM_SENSITIVITY  = 0.1;

// Smoothing
const CAM_LAG = 6;

const MAGE_DEF = {
  url: 'models/chars/players/mage.glb',
  height: 2.6,
  show: ['Mage_Cape'],
  attach: { url: 'models/weapons/staff.glb', bone: 'handslot.r' },
};

const ORC_DEF = {
  url: 'models/creatures/orc.glb',
  height: 2.4,
  clips: { idle: 'Idle', walk: 'Walk', run: 'Run' },
};

const WOLF_DEF = {
  url: 'models/creatures/wolf.glb',
  height: 1.4,
  clips: { idle: 'Idle', walk: 'Walk', run: 'Run' },
};

const GOBLIN_DEF = {
  url: 'models/creatures/goblin.glb',
  height: 1.8,
  clips: { idle: 'Idle', walk: 'Walk', run: 'Run' },
};

interface DamageNumber {
  el: HTMLDivElement;
  x: number;
  y: number;
  z: number;
  age: number;
  maxAge: number;
}

function createGrassTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1e381b'; // rich dark forest grass green
  ctx.fillRect(0, 0, 256, 256);
  // Add noise
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#244520' : '#142712';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(40, 40);
  return tex;
}

function createCobblestoneTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#26262b'; // slate dark base
  ctx.fillRect(0, 0, 256, 256);
  
  ctx.strokeStyle = '#18181a';
  ctx.lineWidth = 1.5;
  const size = 16;
  for (let y = 0; y < 256; y += size) {
    const shift = ((y / size) % 2) * (size / 2);
    for (let x = -size; x < 256 + size; x += size) {
      ctx.fillStyle = Math.random() > 0.4 ? '#38383e' : '#222226';
      ctx.fillRect(x + shift, y, size - 2, size - 2);
      ctx.strokeRect(x + shift, y, size - 2, size - 2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 5);
  return tex;
}

function createRoadTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#4c3e31'; // dirt/gravel base
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1500; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#5d4c3c' : '#392e24';
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export class Renderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private playerVisual: CharacterVisual;
  private mobVisuals: CharacterVisual[] = [];
  private sim: Sim;

  // Orbit parameters
  private orbitTheta = INITIAL_THETA;
  private orbitPhi   = INITIAL_PHI;
  private orbitDist  = INITIAL_DIST;

  // Smoothed camera world position
  private camPos = new THREE.Vector3(0, 0, INITIAL_DIST);

  // Visual additions for combat
  private targetRing: THREE.Mesh | null = null;
  private projectileVisuals = new Map<string, THREE.Mesh>();
  private uiContainer: HTMLDivElement;
  private castBarContainer: HTMLDivElement;
  private castBarFill: HTMLDivElement;
  private castBarText: HTMLDivElement;
  private entityUIs = new Map<string, HTMLElement>();
  private damageNumbers: DamageNumber[] = [];

  // Action Bar elements
  private actionSlots: HTMLElement[] = [];

  constructor(canvas: HTMLCanvasElement, sim: Sim) {
    this.sim = sim;

    // Scene - Beautiful bright daytime sky
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbbe1fa); // clear sky blue
    this.scene.fog = new THREE.Fog(0xbbe1fa, 50, 150);

    // Camera -- will be updated in render()
    this.camera = new THREE.PerspectiveCamera(55, canvas.clientWidth / canvas.clientHeight, 0.1, 500);
    this.camera.position.set(0, 0, INITIAL_DIST);
    this.camera.lookAt(0, 1.2, 0);

    // WebGL renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // Lighting - Bright daytime sunlight
    const sun = new THREE.DirectionalLight(0xfffef0, 2.2); // Warm white sun
    sun.position.set(40, 70, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -45;
    sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 45;
    sun.shadow.camera.bottom = -45;
    sun.shadow.bias = -0.0008;
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0xf1f5f9, 1.4)); // Bright daylight ambient sky light

    // Ground with Grass Texture
    const grassTex = createGrassTexture();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(250, 250),
      new THREE.MeshLambertMaterial({ map: grassTex }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Town Buildings and layout
    this.addTownBuildings();

    // Player character
    this.playerVisual = new CharacterVisual(MAGE_DEF);
    this.scene.add(this.playerVisual.root);

    // Setup 2D overlay styles and containers
    this.setupUIOverlay(canvas);

    // Setup raycasting for target selection on mouseup (since pointer lock cancels click events)
    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.handleCanvasClick(e, canvas);
      }
    });

    window.addEventListener('resize', () => this.onResize(canvas));
    this.onResize(canvas);
  }

  private setupUIOverlay(canvas: HTMLCanvasElement): void {
    // Inject CSS styles
    const style = document.createElement('style');
    style.textContent = `
      .floating-ui-bar {
        position: absolute;
        width: 80px;
        background: rgba(10, 10, 20, 0.85);
        border: 1px solid rgba(184, 134, 11, 0.6);
        border-radius: 4px;
        padding: 2px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.6);
        pointer-events: none;
        transform: translate(-50%, -100%);
        font-family: 'Outfit', 'Inter', sans-serif;
        display: flex;
        flex-direction: column;
        gap: 2px;
        z-index: 10;
        transition: opacity 0.15s ease;
      }
      .floating-ui-bar .name-label {
        font-size: 9px;
        font-weight: bold;
        color: #fff;
        text-align: center;
        text-shadow: 1px 1px 1px #000;
        line-height: 1.1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .floating-ui-bar .bar-fill-wrapper {
        height: 6px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
        overflow: hidden;
        position: relative;
        border: 0.5px solid rgba(0, 0, 0, 0.5);
      }
      .floating-ui-bar .bar-fill {
        height: 100%;
        width: 100%;
        transition: width 0.1s ease-out;
      }
      .floating-ui-bar .health-fill {
        background: linear-gradient(to right, #22c55e, #15803d);
      }
      .floating-ui-bar .mana-fill {
        background: linear-gradient(to right, #3b82f6, #1d4ed8);
      }
      .floating-damage-number {
        position: absolute;
        font-family: 'Impact', 'Outfit', sans-serif;
        font-size: 24px;
        font-weight: 900;
        color: #ff3b30;
        text-shadow: 2px 2px 0px #000, -1px -1px 0px #000, 1px -1px 0px #000, -1px 1px 0px #000;
        pointer-events: none;
        transform: translate(-50%, -50%);
        z-index: 20;
      }

      /* MMO Action Bar */
      .action-bar {
        position: absolute;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 8px;
        background: rgba(10, 10, 20, 0.85);
        border: 2px solid #b8860b;
        border-radius: 8px;
        padding: 6px;
        box-shadow: 0 6px 15px rgba(0, 0, 0, 0.8);
        z-index: 10;
        pointer-events: auto;
      }
      .action-slot {
        position: relative;
        width: 46px;
        height: 46px;
        background: rgba(0, 0, 0, 0.6);
        border: 1px solid rgba(184, 134, 11, 0.4);
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .action-slot:hover {
        border-color: #b8860b;
        box-shadow: 0 0 8px rgba(184, 134, 11, 0.6);
      }
      .action-slot.disabled {
        opacity: 0.35;
        filter: grayscale(0.8);
      }
      .action-slot .keybind {
        position: absolute;
        top: 2px;
        left: 3px;
        font-size: 9px;
        font-weight: bold;
        color: rgba(255, 255, 255, 0.6);
        font-family: monospace;
      }
      .action-slot .icon-fireball {
        width: 26px;
        height: 26px;
        background: radial-gradient(circle, #ff8c00, #d00000);
        border-radius: 50%;
        box-shadow: 0 0 10px #ff4500;
      }
      .action-slot .icon-frostbolt {
        width: 26px;
        height: 26px;
        background: radial-gradient(circle, #e0ffff, #00bfff);
        border-radius: 50%;
        box-shadow: 0 0 10px #1e90ff;
      }
      .action-slot .icon-empty {
        width: 20px;
        height: 20px;
        border: 1px dashed rgba(255, 255, 255, 0.15);
        border-radius: 4px;
      }
      .action-slot .mana-cost {
        position: absolute;
        bottom: 2px;
        right: 3px;
        font-size: 8px;
        color: #60a5fa;
        font-weight: bold;
        font-family: monospace;
      }
      .action-slot .slot-tooltip {
        position: absolute;
        bottom: 56px;
        background: rgba(10, 10, 20, 0.95);
        border: 1px solid #b8860b;
        color: #fff;
        padding: 6px 10px;
        font-size: 10px;
        border-radius: 4px;
        white-space: nowrap;
        pointer-events: none;
        display: none;
        box-shadow: 0 4px 10px rgba(0,0,0,0.8);
        font-family: sans-serif;
      }
      .action-slot:hover .slot-tooltip {
        display: block;
      }
    `;
    document.head.appendChild(style);

    // Create container
    let overlay = document.getElementById('ui-overlay') as HTMLDivElement;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ui-overlay';
      overlay.style.position = 'absolute';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.pointerEvents = 'none';
      overlay.style.overflow = 'hidden';
      document.body.appendChild(overlay);
    }
    this.uiContainer = overlay;

    // Create cast bar
    this.castBarContainer = document.createElement('div');
    this.castBarContainer.id = 'cast-bar-container';
    this.castBarContainer.style.position = 'absolute';
    this.castBarContainer.style.bottom = '90px'; // Shifted up to clear the action bar
    this.castBarContainer.style.left = '50%';
    this.castBarContainer.style.transform = 'translateX(-50%)';
    this.castBarContainer.style.width = '240px';
    this.castBarContainer.style.height = '24px';
    this.castBarContainer.style.background = 'rgba(10, 10, 20, 0.85)';
    this.castBarContainer.style.border = '2px solid #b8860b';
    this.castBarContainer.style.borderRadius = '6px';
    this.castBarContainer.style.display = 'none';
    this.castBarContainer.style.flexDirection = 'column';
    this.castBarContainer.style.justifyContent = 'center';
    this.castBarContainer.style.overflow = 'hidden';
    this.castBarContainer.style.pointerEvents = 'none';
    this.castBarContainer.style.fontFamily = 'monospace';
    this.castBarContainer.style.fontSize = '12px';
    this.castBarContainer.style.color = '#fff';
    this.castBarContainer.style.textAlign = 'center';
    this.castBarContainer.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.8)';
    
    this.castBarFill = document.createElement('div');
    this.castBarFill.style.height = '100%';
    this.castBarFill.style.width = '0%';
    this.castBarFill.style.background = 'linear-gradient(to right, #ff4500, #ff8c00)';
    this.castBarFill.style.position = 'absolute';
    this.castBarFill.style.top = '0';
    this.castBarFill.style.left = '0';
    this.castBarFill.style.zIndex = '0';
    this.castBarContainer.appendChild(this.castBarFill);

    this.castBarText = document.createElement('div');
    this.castBarText.style.position = 'relative';
    this.castBarText.style.zIndex = '1';
    this.castBarText.style.fontWeight = 'bold';
    this.castBarText.textContent = '';
    this.castBarContainer.appendChild(this.castBarText);

    this.uiContainer.appendChild(this.castBarContainer);

    // Create Action Bar
    const actionBar = document.createElement('div');
    actionBar.className = 'action-bar';

    const spellsDef = [
      { key: '1', class: 'icon-fireball', name: 'Fireball', cost: '15m', desc: '1.5s cast, 25 dmg' },
      { key: '2', class: 'icon-frostbolt', name: 'Frostbolt', cost: '10m', desc: '1.0s cast, 15 dmg' },
      { key: '3', class: 'icon-empty', name: 'Empty Slot', cost: '', desc: 'Locked' },
      { key: '4', class: 'icon-empty', name: 'Empty Slot', cost: '', desc: 'Locked' },
      { key: '5', class: 'icon-empty', name: 'Empty Slot', cost: '', desc: 'Locked' }
    ];

    for (const spell of spellsDef) {
      const slot = document.createElement('div');
      slot.className = 'action-slot';
      if (spell.class === 'icon-empty') {
        slot.classList.add('disabled');
      }

      const keybind = document.createElement('span');
      keybind.className = 'keybind';
      keybind.textContent = spell.key;
      slot.appendChild(keybind);

      const icon = document.createElement('div');
      icon.className = spell.class;
      slot.appendChild(icon);

      if (spell.cost) {
        const cost = document.createElement('span');
        cost.className = 'mana-cost';
        cost.textContent = spell.cost;
        slot.appendChild(cost);
      }

      const tooltip = document.createElement('div');
      tooltip.className = 'slot-tooltip';
      tooltip.innerHTML = `<strong>${spell.name}</strong><br>${spell.desc}`;
      slot.appendChild(tooltip);

      actionBar.appendChild(slot);
      this.actionSlots.push(slot);
    }

    // Add click listeners to trigger casts on slot click
    if (this.actionSlots[0]) {
      this.actionSlots[0].addEventListener('click', (e) => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', key: '1' }));
        e.stopPropagation();
      });
    }
    if (this.actionSlots[1]) {
      this.actionSlots[1].addEventListener('click', (e) => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2', key: '2' }));
        e.stopPropagation();
      });
    }

    this.uiContainer.appendChild(actionBar);
  }

  private handleCanvasClick(e: MouseEvent, canvas: HTMLCanvasElement): void {
    const rect = canvas.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    console.log(`[Target Raycast] Mouse client coordinates: (${e.clientX}, ${e.clientY}) -> Screen coordinates: (${mouseX.toFixed(2)}, ${mouseY.toFixed(2)})`);

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), this.camera);

    const targets = this.mobVisuals.map((v, index) => ({
      visual: v,
      index: index,
      mob: this.sim.mobs[index]
    })).filter(t => t.mob.health > 0);

    console.log(`[Target Raycast] Evaluating against ${targets.length} alive targets`);

    const intersects = raycaster.intersectObjects(targets.map(t => t.visual.root), true);
    if (intersects.length > 0) {
      const hitObject = intersects[0].object;
      console.log(`[Target Raycast] Intersected object: ${hitObject.name || 'unnamed'} at distance ${intersects[0].distance.toFixed(2)}`);
      let parent: THREE.Object3D | null = hitObject;
      while (parent && parent !== this.scene) {
        const matched = targets.find(t => t.visual.root === parent);
        if (matched) {
          console.log(`[Target Raycast] Matched mob: ${matched.mob.id}`);
          this.sim.player.targetId = matched.mob.id;
          return;
        }
        parent = parent.parent;
      }
    } else {
      console.log(`[Target Raycast] No intersections found`);
    }
  }

  render(dt: number, sim: Sim, input: InputState): void {
    const p = sim.player;

    // ── Orbit & zoom from mouse ────────────────────────────────────
    if (input.isPointerLocked) {
      this.orbitTheta -= input.mouseDeltaX * ORBIT_SENSITIVITY;
      this.orbitPhi   -= input.mouseDeltaY * ORBIT_SENSITIVITY;
    }
    this.orbitDist += input.scrollDelta * ZOOM_SENSITIVITY;

    // Clamp
    this.orbitPhi = Math.max(PHI_MIN, Math.min(PHI_MAX, this.orbitPhi));
    this.orbitDist = Math.max(MIN_DIST, Math.min(MAX_DIST, this.orbitDist));

    // ── Compute target camera position (world space) ───────────────
    const cosPhi = Math.cos(this.orbitPhi);
    const sinPhi = Math.sin(this.orbitPhi);
    const cosTheta = Math.cos(this.orbitTheta);
    const sinTheta = Math.sin(this.orbitTheta);

    const targetX = p.x - this.orbitDist * cosPhi * sinTheta;
    const targetZ = p.z - this.orbitDist * cosPhi * cosTheta;
    const targetY = this.orbitDist * sinPhi;

    // Smoothly lerp camera position toward target
    this.camPos.x += (targetX - this.camPos.x) * Math.min(1, CAM_LAG * dt);
    this.camPos.y += (targetY - this.camPos.y) * Math.min(1, CAM_LAG * dt);
    this.camPos.z += (targetZ - this.camPos.z) * Math.min(1, CAM_LAG * dt);

    this.camera.position.copy(this.camPos);
    this.camera.lookAt(p.x, 1.2, p.z);

    // ── Player ─────────────────────────────────────────────────────
    this.playerVisual.root.position.set(p.x, 0, p.z);
    this.playerVisual.root.rotation.y = p.facing;
    this.playerVisual.update(dt, { moving: p.moving, movingBack: false });

    // ── Mobs ───────────────────────────────────────────────────────
    // Spawn visuals for any new mobs that appeared this frame
    while (this.mobVisuals.length < sim.mobs.length) {
      const m = sim.mobs[this.mobVisuals.length];
      let def = ORC_DEF;
      if (m.type === 'wolf') def = WOLF_DEF;
      else if (m.type === 'goblin') def = GOBLIN_DEF;
      const mobVis = new CharacterVisual(def);
      this.scene.add(mobVis.root);
      this.mobVisuals.push(mobVis);
    }

    // Sync every mob visual
    for (let i = 0; i < sim.mobs.length; i++) {
      const m = sim.mobs[i];
      const v = this.mobVisuals[i];
      v.root.position.set(m.x, 0, m.z);
      v.root.rotation.y = m.facing;
      v.root.visible = m.health > 0;
      v.update(dt, { moving: m.moving, movingBack: false });
    }

    // ── Target Indicator Ring ──────────────────────────────────────
    let activeTarget: any = null;
    if (p.targetId) {
      activeTarget = sim.mobs.find(m => m.id === p.targetId);
    }

    if (activeTarget && activeTarget.health > 0) {
      if (!this.targetRing) {
        const ringGeo = new THREE.RingGeometry(0.8, 1.0, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffcc00, side: THREE.DoubleSide });
        this.targetRing = new THREE.Mesh(ringGeo, ringMat);
        this.targetRing.rotation.x = -Math.PI / 2;
        this.scene.add(this.targetRing);
      }
      this.targetRing.position.set(activeTarget.x, 0.02, activeTarget.z);
      this.targetRing.visible = true;
    } else {
      if (this.targetRing) {
        this.targetRing.visible = false;
      }
    }

    // ── Projectile Visuals ─────────────────────────────────────────
    const activeProjIds = new Set(sim.projectiles.map(pr => pr.id));
    for (const [id, mesh] of this.projectileVisuals.entries()) {
      if (!activeProjIds.has(id)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose());
        } else {
          mesh.material.dispose();
        }
        this.projectileVisuals.delete(id);
      }
    }

    for (const pr of sim.projectiles) {
      let mesh = this.projectileVisuals.get(pr.id);
      if (!mesh) {
        const color = pr.spellType === 'fireball' ? 0xff4500 : 0x00bfff;
        const geom = new THREE.SphereGeometry(pr.spellType === 'fireball' ? 0.35 : 0.28, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
        mesh = new THREE.Mesh(geom, mat);
        const light = new THREE.PointLight(color, 1.5, 3);
        mesh.add(light);
        this.scene.add(mesh);
        this.projectileVisuals.set(pr.id, mesh);
      }
      mesh.position.set(pr.x, 1.2, pr.z);
    }

    // ── HTML Overlay Updates (Health Bars, Cast Bar, Damage Numbers) ──
    const canvas = this.renderer.domElement;
    const tempProj = new THREE.Vector3();

    // 1. Update Player floating bar
    let pBar = this.entityUIs.get('player');
    if (!pBar) {
      pBar = document.createElement('div');
      pBar.className = 'floating-ui-bar';
      
      const label = document.createElement('div');
      label.className = 'name-label';
      label.textContent = 'Mage (You)';
      pBar.appendChild(label);

      const hWrapper = document.createElement('div');
      hWrapper.className = 'bar-fill-wrapper';
      const hFill = document.createElement('div');
      hFill.className = 'bar-fill health-fill';
      hWrapper.appendChild(hFill);
      pBar.appendChild(hWrapper);

      const mWrapper = document.createElement('div');
      mWrapper.className = 'bar-fill-wrapper';
      const mFill = document.createElement('div');
      mFill.className = 'bar-fill mana-fill';
      mWrapper.appendChild(mFill);
      pBar.appendChild(mWrapper);

      this.uiContainer.appendChild(pBar);
      this.entityUIs.set('player', pBar);
    }

    // Position player bar
    tempProj.set(p.x, this.playerVisual.height + 0.3, p.z);
    tempProj.project(this.camera);
    if (tempProj.z > 1) {
      pBar.style.display = 'none';
    } else {
      const screenX = (tempProj.x * 0.5 + 0.5) * canvas.clientWidth;
      const screenY = (-(tempProj.y * 0.5) + 0.5) * canvas.clientHeight;
      pBar.style.left = `${screenX}px`;
      pBar.style.top = `${screenY}px`;
      pBar.style.display = 'flex';

      const hFill = pBar.querySelector('.health-fill') as HTMLElement;
      if (hFill) hFill.style.width = `${Math.max(0, (p.health / p.maxHealth) * 100)}%`;

      const mFill = pBar.querySelector('.mana-fill') as HTMLElement;
      if (mFill) mFill.style.width = `${Math.max(0, (p.mana / p.maxMana) * 100)}%`;
    }

    // 2. Update Mobs floating bars
    const currentMobIds = new Set(sim.mobs.map(m => m.id));
    for (const [id, el] of this.entityUIs.entries()) {
      if (id !== 'player' && !currentMobIds.has(id)) {
        el.remove();
        this.entityUIs.delete(id);
      }
    }

    for (let i = 0; i < sim.mobs.length; i++) {
      const m = sim.mobs[i];
      const v = this.mobVisuals[i];
      let el = this.entityUIs.get(m.id);

      if (m.health <= 0) {
        if (el) {
          el.style.display = 'none';
        }
        continue;
      }

      if (!el) {
        el = document.createElement('div');
        el.className = 'floating-ui-bar';
        
        const label = document.createElement('div');
        label.className = 'name-label';
        const typeName = m.type.charAt(0).toUpperCase() + m.type.slice(1);
        label.textContent = `${typeName} (${m.id})`;
        el.appendChild(label);

        const hWrapper = document.createElement('div');
        hWrapper.className = 'bar-fill-wrapper';
        const hFill = document.createElement('div');
        hFill.className = 'bar-fill health-fill';
        hWrapper.appendChild(hFill);
        el.appendChild(hWrapper);

        this.uiContainer.appendChild(el);
        this.entityUIs.set(m.id, el);
      }

      tempProj.set(m.x, v.height + 0.3, m.z);
      tempProj.project(this.camera);

      if (tempProj.z > 1) {
        el.style.display = 'none';
      } else {
        const screenX = (tempProj.x * 0.5 + 0.5) * canvas.clientWidth;
        const screenY = (-(tempProj.y * 0.5) + 0.5) * canvas.clientHeight;
        el.style.left = `${screenX}px`;
        el.style.top = `${screenY}px`;
        el.style.display = 'flex';

        const hFill = el.querySelector('.health-fill') as HTMLElement;
        if (hFill) hFill.style.width = `${Math.max(0, (m.health / m.maxHealth) * 100)}%`;
      }
    }

    // 3. Update Cast Bar
    if (p.activeCast) {
      this.castBarContainer.style.display = 'flex';
      const pct = (p.activeCast.timer / p.activeCast.duration) * 100;
      this.castBarFill.style.width = `${pct}%`;
      this.castBarText.textContent = `${p.activeCast.name} (${p.activeCast.timer.toFixed(1)}s / ${p.activeCast.duration.toFixed(1)}s)`;
    } else {
      this.castBarContainer.style.display = 'none';
    }

    // 4. Update Action Bar disabled state dynamically based on Target and Mana
    const hasTarget = activeTarget !== null && activeTarget.health > 0;
    const hasFireballMana = p.mana >= 15;
    const hasFrostboltMana = p.mana >= 10;

    // Fireball slot (index 0)
    if (this.actionSlots[0]) {
      if (!hasTarget || !hasFireballMana) {
        this.actionSlots[0].classList.add('disabled');
      } else {
        this.actionSlots[0].classList.remove('disabled');
      }
    }

    // Frostbolt slot (index 1)
    if (this.actionSlots[1]) {
      if (!hasTarget || !hasFrostboltMana) {
        this.actionSlots[1].classList.add('disabled');
      } else {
        this.actionSlots[1].classList.remove('disabled');
      }
    }

    // 5. Combat Events: spawn damage numbers
    for (const evt of sim.combatEvents) {
      const dmgEl = document.createElement('div');
      dmgEl.className = 'floating-damage-number';
      dmgEl.textContent = `-${evt.value}`;
      this.uiContainer.appendChild(dmgEl);

      this.damageNumbers.push({
        el: dmgEl,
        x: evt.x,
        y: 2.2, // Spawn slightly above model centers
        z: evt.z,
        age: 0,
        maxAge: 0.8 // 0.8 seconds duration
      });
    }

    // Update active damage numbers
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dn = this.damageNumbers[i];
      dn.age += dt;

      if (dn.age >= dn.maxAge) {
        dn.el.remove();
        this.damageNumbers.splice(i, 1);
        continue;
      }

      // Move up slightly
      dn.y += dt * 1.5;

      tempProj.set(dn.x, dn.y, dn.z);
      tempProj.project(this.camera);

      if (tempProj.z > 1) {
        dn.el.style.display = 'none';
      } else {
        const screenX = (tempProj.x * 0.5 + 0.5) * canvas.clientWidth;
        const screenY = (-(tempProj.y * 0.5) + 0.5) * canvas.clientHeight;
        dn.el.style.left = `${screenX}px`;
        dn.el.style.top = `${screenY}px`;
        dn.el.style.display = 'block';
        dn.el.style.opacity = (1 - dn.age / dn.maxAge).toString();
      }
    }

    // Animate bonfire light flicker dynamically
    this.scene.traverse((o) => {
      if (o instanceof THREE.PointLight && o.color.getHex() === 0xff6600) {
        o.intensity = 2.4 + Math.sin(performance.now() * 0.015) * 0.6 + Math.random() * 0.2;
      }
    });

    this.renderer.render(this.scene, this.camera);
  }

  private addTownBuildings(): void {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);

    const loadProp = (url: string, x: number, z: number, rotY: number, scale: number = 1.0) => {
      loader.load(url, (gltf) => {
        const model = gltf.scene;
        model.position.set(x, 0, z);
        model.rotation.y = rotY;
        model.scale.setScalar(scale);
        model.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        
        // Add a warm flickering point light directly inside the bonfire prop
        if (url.includes('bonfire')) {
          const fireLight = new THREE.PointLight(0xff6600, 3.5, 14);
          fireLight.position.set(0, 0.6, 0);
          fireLight.castShadow = true;
          fireLight.shadow.bias = -0.002;
          model.add(fireLight);
        }

        this.scene.add(model);
      }, undefined, (err) => {
        console.error(`Failed to load town building ${url}:`, err);
      });
    };

    // 1. Paved Town Square
    const pavedTex = createCobblestoneTexture();
    const pavedGeo = new THREE.PlaneGeometry(this.sim.zone.townSquare.width, this.sim.zone.townSquare.depth);
    const pavedMat = new THREE.MeshLambertMaterial({ map: pavedTex });
    const pavedSquare = new THREE.Mesh(pavedGeo, pavedMat);
    pavedSquare.rotation.x = -Math.PI / 2;
    pavedSquare.position.set(0, 0.01, -4); // offset center to match well/inn placement
    pavedSquare.receiveShadow = true;
    this.scene.add(pavedSquare);

    // 2. Road Segments
    const roadTex = createRoadTexture();
    for (const road of this.sim.zone.roads) {
      const dx = road.endX - road.startX;
      const dz = road.endZ - road.startZ;
      const length = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dx, dz);
      
      const segmentTex = roadTex.clone();
      segmentTex.repeat.set(1, length / road.width);
      segmentTex.needsUpdate = true;

      const roadGeo = new THREE.PlaneGeometry(road.width, length);
      const roadMat = new THREE.MeshLambertMaterial({ map: segmentTex });
      const roadMesh = new THREE.Mesh(roadGeo, roadMat);
      roadMesh.rotation.x = -Math.PI / 2;
      roadMesh.rotation.z = angle;
      roadMesh.position.set(
        (road.startX + road.endX) / 2,
        0.005, // slightly below paved square
        (road.startZ + road.endZ) / 2
      );
      roadMesh.receiveShadow = true;
      this.scene.add(roadMesh);
    }

    // 3. Buildings
    for (const b of this.sim.zone.buildings) {
      loadProp(b.url, b.x, b.z, b.rotY, b.scale);
    }

    // 4. Props
    for (const p of this.sim.zone.props) {
      loadProp(p.url, p.x, p.z, p.rotY, p.scale);
    }

    // 5. Foliage / Scenery
    for (const f of this.sim.zone.foliage) {
      loadProp(f.url, f.x, f.z, 0, f.scale);
    }
  }

  private onResize(canvas: HTMLCanvasElement): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }
}