// The arena in 3D: a Three scene under the Pixi canvas. It reconciles one mesh per pilot, enemy and shot against the
// game state by id, the way the UI engine reconciles by key, and plays the juice from the state's events (hit
// flashes, kill bursts, the shake when you're hurt). Hues come from the palette (tokens.ts), light, camera and juice
// from the look tokens (look.ts); nothing here decides anything about the game.
import * as THREE from 'three';
import { onTick } from '../clock';
import { SHAPES, enemyDef, type EnemyDef } from '../content';
import type { GameState, Vec } from '../game';
import { rand, type Rng } from '../rng';
import { token } from '../tokens';
import { T } from '../tuning';
import type { ShotSource } from '../world';
import { KEY_DIR_XYZ, LOOK } from './look';

export type Scene = ReturnType<typeof createScene>;

/** One mesh per enemy shape (content.ts SHAPES), sized to radius 1 and scaled to the enemy's `r`. */
const SHAPE_GEOMETRY: Record<(typeof SHAPES)[number], () => THREE.BufferGeometry> = {
  spike: () => new THREE.ConeGeometry(0.8, 2, 5).rotateZ(-Math.PI / 2), // points along +x: at the pilot
  block: () => new THREE.BoxGeometry(1.5, 1.5, 1.5),
  gem: () => new THREE.OctahedronGeometry(1.15),
  orb: () => new THREE.IcosahedronGeometry(1, 1),
};

/** The shell's own dice for the juice (burst directions, shake): seeded, so a story looks the same every run. */
const fx: Rng = { seed: 7 };

/** The game's (x, y) is Three's (x, z): the arena lies on the XZ plane, +y towards the bottom of the screen. */
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
  const camera = new THREE.PerspectiveCamera(LOOK.CAMERA_FOV_DEG, w / h, 0.1, 300);
  const eye = new THREE.Vector3(), target = new THREE.Vector3(0, 0, LOOK.CAMERA_LIFT_U);
  /** Back the camera off until the whole arena (and the margin round it) fits this aspect. */
  function placeCamera(aspect: number) {
    const half = Math.tan(((LOOK.CAMERA_FOV_DEG * Math.PI) / 180) / 2);
    const d = (Math.max(T.ARENA_H_U / 2, T.ARENA_W_U / 2 / aspect) * LOOK.CAMERA_MARGIN) / half;
    eye.set(0, Math.cos(LOOK.CAMERA_TILT_RAD) * d, LOOK.CAMERA_LIFT_U + Math.sin(LOOK.CAMERA_TILT_RAD) * d);
    camera.aspect = aspect;
    camera.position.copy(eye);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }
  placeCamera(w / h);

  scene.add(new THREE.HemisphereLight(token('--light'), token('--ink'), LOOK.FILL_LIGHT));
  const key = new THREE.DirectionalLight(token('--light'), LOOK.KEY_LIGHT);
  key.position.set(...KEY_DIR_XYZ);
  scene.add(key);

  // ---------- the arena: floor, a 1 u grid, walls ----------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(T.ARENA_W_U, T.ARENA_H_U), new THREE.MeshStandardMaterial({ color: token('--floor') }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const hw = T.ARENA_W_U / 2, hh = T.ARENA_H_U / 2, gridPts: number[] = [];
  for (let x = -hw; x <= hw; x++) gridPts.push(x, 0.01, -hh, x, 0.01, hh);
  for (let z = -hh; z <= hh; z++) gridPts.push(-hw, 0.01, z, hw, 0.01, z);
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3)), new THREE.LineBasicMaterial({ color: token('--grid') })));
  const wallMat = new THREE.MeshStandardMaterial({ color: token('--wall'), emissive: token('--wall'), emissiveIntensity: 0.6 });
  for (const [x, z, sx, sz] of [[0, -hh, T.ARENA_W_U + 0.3, 0.15], [0, hh, T.ARENA_W_U + 0.3, 0.15], [-hw, 0, 0.15, T.ARENA_H_U], [hw, 0, 0.15, T.ARENA_H_U]] as const) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.35, sz), wallMat);
    wall.position.set(x, 0.17, z);
    scene.add(wall);
  }

  // ---------- the pilot: a dart pointing where you aim, a bubble when shielded; the aim ring under the cursor ----------
  const pilot = new THREE.Group();
  const dart = new THREE.Mesh(new THREE.ConeGeometry(T.PLAYER_R_U, T.PLAYER_R_U * 2.6, 3).rotateZ(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: token('--pilot'), emissive: token('--pilot'), emissiveIntensity: 0.3, flatShading: true }));
  dart.position.y = T.PLAYER_R_U;
  pilot.add(dart);
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(T.PLAYER_R_U * 2.1, 24, 16), new THREE.MeshBasicMaterial({ color: token('--shield'), transparent: true, opacity: 0.28, depthWrite: false }));
  bubble.position.y = T.PLAYER_R_U;
  pilot.add(bubble);
  scene.add(pilot);
  const reticle = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: token('--reticle'), transparent: true, opacity: 0.85 }));
  reticle.position.y = 0.02;
  scene.add(reticle);

  // ---------- enemies and shots, reconciled by id ----------
  const geometry = new Map<string, THREE.BufferGeometry>();
  const shapeOf = (d: EnemyDef) => { let g = geometry.get(d.shape); if (!g) geometry.set(d.shape, (g = SHAPE_GEOMETRY[d.shape]())); return g; };
  type Foe = { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; d: EnemyDef; glow: number; flashS: number; ageS: number };
  const foes = new Map<number, Foe>();
  const shotGeo = new THREE.SphereGeometry(1, 10, 8);
  const shotMats = new Map<string, THREE.MeshBasicMaterial>();
  const shotPaint = (from: ShotSource) => (from === 'foe' ? '--shot-foe' : `--weapon-${from.weapon}`);
  const shotMat = (paint: string) => { let m = shotMats.get(paint); if (!m) shotMats.set(paint, (m = new THREE.MeshBasicMaterial({ color: token(paint) }))); return m; };
  const shots = new Map<number, THREE.Mesh>();

  // ---------- juice: kill bursts and the shake ----------
  type Bit = { mesh: THREE.Mesh; v: THREE.Vector3; lifeS: number };
  const bits: Bit[] = [];
  const bitGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  let shakeS = 0;
  let lastEvents: GameState['events'] | null = null;

  function burst(at: Vec, paint: string) {
    for (let i = 0; i < LOOK.BURST_BITS; i++) {
      const a = rand(fx) * Math.PI * 2, up = 0.3 + rand(fx), speed = LOOK.BURST_SPEED_U_S * (0.4 + rand(fx) * 0.6);
      const mesh = new THREE.Mesh(bitGeo, shotMat(paint));
      mesh.position.set(at.x, 0.4, at.y);
      scene.add(mesh);
      bits.push({ mesh, v: new THREE.Vector3(Math.cos(a) * speed, up * speed, Math.sin(a) * speed), lifeS: LOOK.BURST_S });
    }
  }

  /** The juice for what just happened (each state's events are played once). */
  function play(s: GameState) {
    if (s.events === lastEvents) return;
    lastEvents = s.events;
    for (const ev of s.events) {
      if (ev.type === 'struck') { const f = foes.get(ev.id); if (f) f.flashS = LOOK.FLASH_S; }
      else if (ev.type === 'killed') burst(ev, enemyDef(ev.kind).paint);
      else if (ev.type === 'hurt') shakeS = LOOK.SHAKE_S;
      else if (ev.type === 'died') burst(s.player, '--pilot');
    }
  }

  // Decoration only: none of this moves a tap target, so it never reports busy (settle() would never return).
  onTick((dtS) => {
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i]!;
      b.lifeS -= dtS;
      b.v.y -= LOOK.BURST_GRAVITY_U_S2 * dtS;
      b.mesh.position.addScaledVector(b.v, dtS);
      b.mesh.scale.setScalar(Math.max(0, b.lifeS / LOOK.BURST_S));
      if (b.lifeS <= 0) { scene.remove(b.mesh); bits.splice(i, 1); }
    }
    for (const f of foes.values()) {
      f.ageS += dtS;
      f.flashS = Math.max(0, f.flashS - dtS);
      f.mat.emissive.set(f.flashS > 0 ? 0xffffff : f.glow);
      f.mat.emissiveIntensity = f.flashS > 0 ? LOOK.FLASH_GLOW : LOOK.GLOW;
      if (f.d.shape === 'gem' || f.d.shape === 'orb') f.mesh.rotation.y += dtS * LOOK.SPIN_RAD_S;
      f.mesh.scale.setScalar(f.d.r * Math.min(1, f.ageS / LOOK.SPAWN_GROW_S)); // grow in as it arrives
    }
    shakeS = Math.max(0, shakeS - dtS);
    const k = (shakeS / LOOK.SHAKE_S) * LOOK.SHAKE_U;
    camera.position.set(eye.x + (rand(fx) - 0.5) * k, eye.y, eye.z + (rand(fx) - 0.5) * k);
    return false;
  });

  return {
    /** Match the meshes to the state by id, and play its events. `live` false hides the pilot and the aim (the title). */
    sync(s: GameState, live: boolean) {
      play(s);
      const p = s.player;
      pilot.visible = live && s.phase !== 'dead';
      reticle.visible = live && s.phase === 'fight';
      pilot.position.set(p.x, 0, p.y);
      pilot.rotation.y = Math.atan2(-p.aim.y, p.aim.x);
      bubble.visible = p.shieldS > 0;
      dart.visible = p.graceS <= 0 || p.shieldS > 0 || Math.floor(p.graceS * 20) % 2 === 0; // blink while untouchable

      const liveFoes = new Set(s.enemies.map((e) => e.id));
      for (const [id, f] of foes) if (!liveFoes.has(id)) { scene.remove(f.mesh); f.mat.dispose(); foes.delete(id); }
      for (const e of s.enemies) {
        let f = foes.get(e.id);
        if (!f) {
          const d = enemyDef(e.kind), mat = new THREE.MeshStandardMaterial({ color: token(d.paint), emissive: token(d.paint), emissiveIntensity: LOOK.GLOW, flatShading: true });
          f = { mesh: new THREE.Mesh(shapeOf(d), mat), mat, d, glow: token(d.paint), flashS: 0, ageS: 0 };
          scene.add(f.mesh);
          foes.set(e.id, f);
        }
        const shake = e.mode === 'windup' ? (rand(fx) - 0.5) * LOOK.WINDUP_SHAKE_U : 0;
        f.mesh.position.set(e.x + shake, f.d.r, e.y + shake);
        if (f.d.shape === 'spike' || f.d.shape === 'block') f.mesh.rotation.y = Math.atan2(-(p.y - e.y), p.x - e.x);
      }

      const liveShots = new Set(s.shots.map((b) => b.id));
      for (const [id, m] of shots) if (!liveShots.has(id)) { scene.remove(m); shots.delete(id); }
      for (const b of s.shots) {
        let m = shots.get(b.id);
        if (!m) { m = new THREE.Mesh(shotGeo, shotMat(shotPaint(b.from))); m.scale.setScalar(b.r); scene.add(m); shots.set(b.id, m); }
        m.position.set(b.x, 0.45, b.y);
      }
    },
    /** Put the aim ring on this arena point. */
    aim(at: Vec) { reticle.position.set(at.x, 0.02, at.y); },
    /** The arena point under a cursor position (client px), or null when the cursor is off the floor's plane. */
    toWorld(clientX: number, clientY: number): Vec | null {
      const r = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
      return hit && { x: hit.x, y: hit.z };
    },
    render: () => renderer.render(scene, camera),
    resize(cw: number, ch: number) {
      renderer.setSize(cw, ch);
      placeCamera(cw / ch);
    },
  };
}
