// The 3D view: a Three scene under the Pixi canvas. It reconciles one mesh per thing against the game state by id,
// the way the UI engine reconciles by key: new ids get a mesh, gone ids lose theirs. Hues come from the palette
// (tokens.ts), light and camera from the look tokens (look.ts); nothing here decides anything about the game.
// PLACEHOLDER meshes: swap the spheres for models/*.glb built by `npm run models` when the game has models.
import * as THREE from 'three';
import { thingDef } from '../content';
import type { GameState } from '../game';
import { token } from '../tokens';
import { T } from '../tuning';
import { KEY_DIR_XYZ, LOOK } from './look';

export type Scene = ReturnType<typeof createScene>;

/** The field lies on the XZ plane; the game's (x, y) is Three's (x, z). */
export function createScene(el: HTMLElement, w: number, h: number) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.setSize(w, h);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = LOOK.EXPOSURE;
  Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0' });
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(token('--ink'));
  const camera = new THREE.PerspectiveCamera(LOOK.CAMERA_FOV_DEG, w / h, 0.1, 200);
  camera.position.set(0, Math.cos(LOOK.CAMERA_TILT_RAD) * LOOK.CAMERA_DIST_U, Math.sin(LOOK.CAMERA_TILT_RAD) * LOOK.CAMERA_DIST_U);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(token('--light'), token('--ink'), LOOK.FILL_LIGHT));
  const key = new THREE.DirectionalLight(token('--light'), LOOK.KEY_LIGHT);
  key.position.set(...KEY_DIR_XYZ);
  scene.add(key);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(T.FIELD_W_U, T.FIELD_H_U), new THREE.MeshStandardMaterial({ color: token('--floor') }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const meshes = new Map<number, THREE.Mesh>();
  return {
    /** Match the meshes to the state's things by id. */
    sync(s: GameState) {
      const live = new Set(s.things.map((t) => t.id));
      for (const [id, m] of meshes) if (!live.has(id)) { scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); meshes.delete(id); }
      for (const t of s.things) {
        if (meshes.has(t.id)) continue;
        const d = thingDef(t.kind), m = new THREE.Mesh(new THREE.SphereGeometry(d.r, 24, 16), new THREE.MeshStandardMaterial({ color: token(d.paint) }));
        m.position.set(t.x, d.r, t.y);
        scene.add(m);
        meshes.set(t.id, m);
      }
    },
    render: () => renderer.render(scene, camera),
    resize(cw: number, ch: number) {
      renderer.setSize(cw, ch);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
    },
  };
}
