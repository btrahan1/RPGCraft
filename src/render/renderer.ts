import * as THREE from 'three';
import type { Sim } from '../sim/sim';
import { CharacterVisual } from './character';
import type { InputState } from '../game/input';

// Chase camera constants
const CAM_HEIGHT = 10;     // world units above the player
const CAM_DIST  = 18;      // world units behind the player
const CAM_LAG   = 6;       // lerp speed (higher = snappier)

const MAGE_DEF = {
  url: 'models/chars/players/mage.glb',
  height: 2.6,
  show: ['Mage_Cape'],  // hide hat (blocks view from chase cam), keep cape
  attach: { url: 'models/weapons/staff.glb', bone: 'handslot.r' },
};

export class Renderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private playerVisual: CharacterVisual;
  private camPos = new THREE.Vector3(0, CAM_HEIGHT, CAM_DIST);

  constructor(canvas: HTMLCanvasElement, _sim: Sim) {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    this.scene.fog = new THREE.Fog(0x1a1a2e, 40, 120);

    // Camera -- start behind player at (0, 0, 0)
    this.camera = new THREE.PerspectiveCamera(55, canvas.clientWidth / canvas.clientHeight, 0.1, 500);
    this.camera.position.set(0, CAM_HEIGHT, CAM_DIST);
    this.camera.lookAt(0, 1.2, 0);

    // WebGL renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // Lighting
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.0);
    sun.position.set(30, 60, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    sun.shadow.bias = -0.001;
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x404080, 1.2));

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshLambertMaterial({ color: 0x2d5a27 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Some rocks/trees for visual reference so movement reads clearly
    this.addScenery();

    // Player character
    this.playerVisual = new CharacterVisual(MAGE_DEF);
    this.scene.add(this.playerVisual.root);

    window.addEventListener('resize', () => this.onResize(canvas));
    this.onResize(canvas);
  }

  render(dt: number, sim: Sim, input: InputState): void {
    const p = sim.player;

    // Position + orient the character group
    this.playerVisual.root.position.set(p.x, 0, p.z);
    this.playerVisual.root.rotation.y = p.facing;

    // Update animation state
    this.playerVisual.update(dt, { moving: p.moving, movingBack: false });

    // Chase camera: target position is behind + above the player
    const sinF = Math.sin(p.facing);
    const cosF = Math.cos(p.facing);
    const targetCamX = p.x - sinF * CAM_DIST;
    const targetCamY = CAM_HEIGHT;
    const targetCamZ = p.z - cosF * CAM_DIST;

    // Smooth lerp toward target
    this.camPos.x += (targetCamX - this.camPos.x) * Math.min(1, CAM_LAG * dt);
    this.camPos.y += (targetCamY - this.camPos.y) * Math.min(1, CAM_LAG * dt);
    this.camPos.z += (targetCamZ - this.camPos.z) * Math.min(1, CAM_LAG * dt);

    this.camera.position.copy(this.camPos);
    this.camera.lookAt(p.x, 1.2, p.z); // look at chest height

    void input; // reserved for mouse-look in future
    this.renderer.render(this.scene, this.camera);
  }

  private addScenery(): void {
    // Simple procedural trees and rocks so moving around feels meaningful
    const treeMat = new THREE.MeshLambertMaterial({ color: 0x1a5c1a });
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3728 });
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x6b6560 });

    const positions: [number, number][] = [
      [12, 8], [-15, 5], [20, -10], [-8, 20], [5, -18],
      [30, 3], [-25, -12], [18, 25], [-30, 18], [10, -30],
      [-18, -22], [35, -20], [-12, 35], [25, -35], [-35, 5],
    ];

    for (const [x, z] of positions) {
      // Trunk
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2, 6), trunkMat);
      trunk.position.set(x, 1, z);
      trunk.castShadow = true;
      this.scene.add(trunk);
      // Canopy
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3.5, 7), treeMat);
      canopy.position.set(x, 3.5, z);
      canopy.castShadow = true;
      this.scene.add(canopy);
    }

    const rockPositions: [number, number][] = [
      [7, 12], [-20, 7], [16, -18], [-5, 28], [28, 10],
    ];
    for (const [x, z] of rockPositions) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.0 + Math.sin(x) * 0.4), rockMat);
      rock.position.set(x, 0.5, z);
      rock.rotation.y = x;
      rock.castShadow = true;
      this.scene.add(rock);
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
