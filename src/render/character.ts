// Simplified character visual system.
// Loads a GLB, clones the skeleton, drives an AnimationMixer with
// idle/walk/run states, and attaches a weapon to a named bone.
//
// Key lessons from BartCraft's characters/ system distilled here:
//   1. SkeletonUtils.clone() gives each instance its own skeleton
//      (so 10 mages each animate independently).
//   2. The weapon is just a child of the bone Object3D -- it moves with it.
//   3. GLTFLoader sanitizes bone names: 'handslot.r' becomes 'handslotr'.
//      Try both when searching.
//   4. clampWhenFinished=true on one-shots prevents a T-pose flash at the end.
//   5. frustumCulled=false on SkinnedMesh avoids pop-out when the bind-pose
//      sphere drifts outside the camera frustum during animation.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

// Cache loaded GLTFs by URL so we only fetch each file once.
interface CachedGltf { scene: THREE.Group; animations: THREE.AnimationClip[] }
const cache = new Map<string, Promise<CachedGltf>>();

function loadGlb(url: string): Promise<CachedGltf> {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((gltf) => ({
      scene: gltf.scene,
      animations: gltf.animations,
    }));
    cache.set(url, p);
  }
  return p;
}

export interface AnimState {
  moving: boolean;
  movingBack: boolean;
}

export interface CharacterDef {
  /** Path to the character GLB, e.g. 'models/chars/players/mage.glb' */
  url: string;
  /** Height in world units from feet to crown (used for camera offset). */
  height: number;
  /** Node names (non-skinned accessories) to KEEP visible -- everything else hidden.
   *  KayKit characters ship every accessory in one file; we pick what to show.
   *  Leave undefined to keep everything (good for creatures). */
  show?: string[];
  /** Optional weapon GLB to attach to a bone. */
  attach?: { url: string; bone: string };
  /** Animation clip names -- defaults work for KayKit rigs. */
  clips?: { idle?: string; walk?: string; run?: string };
}

const KAYKIT_CLIPS = { idle: 'Idle', walk: 'Walking_A', run: 'Running_A' };

export class CharacterVisual {
  /** Add this group to the scene. Position = feet, faces +Z at facing=0. */
  readonly root = new THREE.Group();
  readonly height: number;
  private ready = false;
  private mixer: THREE.AnimationMixer | null = null;
  private idleAction: THREE.AnimationAction | null = null;
  private walkAction: THREE.AnimationAction | null = null;
  private currentAction: THREE.AnimationAction | null = null;

  constructor(def: CharacterDef) {
    this.height = def.height;
    this.load(def);
  }

  private async load(def: CharacterDef): Promise<void> {
    const clipNames = { ...KAYKIT_CLIPS, ...def.clips };

    try {
      // Load and clone -- clone gives this instance its own independent skeleton
      const { scene: source, animations } = await loadGlb(def.url);
      const model = skeletonClone(source) as THREE.Group;

      // Normalize scale so the model is exactly def.height tall, feet at y=0.
      // Calculate bounding box directly from mesh vertices (with bone transforms) to avoid armature/helper skewing.
      model.updateMatrixWorld(true);
      const box = new THREE.Box3();
      const tempV = new THREE.Vector3();
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          const pos = mesh.geometry.getAttribute('position');
          if (pos) {
            for (let i = 0; i < pos.count; i++) {
              tempV.fromBufferAttribute(pos as THREE.BufferAttribute, i);
              if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
                (mesh as THREE.SkinnedMesh).applyBoneTransform(i, tempV);
              }
              tempV.applyMatrix4(mesh.matrixWorld);
              box.expandByPoint(tempV);
            }
          }
        }
      });

      const modelH = box.max.y - box.min.y;
      const normScale = modelH > 0 ? def.height / modelH : 1;
      model.scale.setScalar(normScale);
      model.position.y = -box.min.y * normScale;

    // Show/hide accessories (KayKit ships all accessories in one GLB)
    if (def.show !== undefined) {
      const showSet = new Set(def.show);
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh) {
          mesh.visible = showSet.has(o.name);
        }
      });
    }

    // Shadows + frustum fix for skinned meshes
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      // SkinnedMesh bound sphere drifts during animation -- disable culling
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh.frustumCulled = false;
    });

    this.root.add(model);

    // Weapon attachment
    if (def.attach) {
      const { scene: weaponSource } = await loadGlb(def.attach.url);
      const weaponClone = skeletonClone(weaponSource) as THREE.Group;
      weaponClone.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = false; }
      });

      // GLTFLoader sanitizes bone names: 'handslot.r' -> 'handslotr'
      const boneName = def.attach.bone;
      const sanitized = boneName.replace(/\./g, '');
      const bone = model.getObjectByName(boneName) ?? model.getObjectByName(sanitized);
      if (bone) {
        bone.add(weaponClone);
      } else {
        console.warn(`CharacterVisual: bone '${boneName}' not found -- weapon not attached`);
      }
    }

    // Animation mixer -- animations come from the cached GLTF, actions from the cloned model
    this.mixer = new THREE.AnimationMixer(model);

    const findClip = (name: string): THREE.AnimationAction | null => {
      const clip = THREE.AnimationClip.findByName(animations, name);
      return clip ? this.mixer!.clipAction(clip) : null;
    };

    this.idleAction = findClip(clipNames.idle);
    this.walkAction = findClip(clipNames.walk) ?? findClip(clipNames.run);

    if (this.idleAction) {
      this.idleAction.play();
      this.currentAction = this.idleAction;
    }

      this.ready = true;
    } catch (err) {
      console.error(`CharacterVisual: failed to load model '${def.url}':`, err);
    }
  }

  update(dt: number, state: AnimState): void {
    if (!this.ready || !this.mixer) return;

    const desired = state.moving ? this.walkAction : this.idleAction;

    if (desired && desired !== this.currentAction) {
      const prev = this.currentAction;
      desired.reset().fadeIn(0.2).play();
      prev?.fadeOut(0.2);
      this.currentAction = desired;
    }

    this.mixer.update(dt);
  }

  dispose(): void {
    // Release skeleton GPU bone textures to avoid leaking on despawn
    this.root.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh && sm.skeleton) sm.skeleton.dispose();
    });
    this.mixer?.stopAllAction();
    this.root.removeFromParent();
  }
}
