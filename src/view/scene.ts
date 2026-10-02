// The basement in 3D: a Three scene under the Pixi canvas, drawn in flat cartoon (toon) shading under one warm bulb,
// with the dark closing in from the screen's edges. It reconciles one body per kid, enemy and gob against the game
// state by id, the way the UI engine reconciles by key, and plays the juice from the state's events (hit flashes,
// gore when something pops, the shake when you're hurt, the kid's mouth gaping as it spits). Hues come from the
// palette (tokens.ts), light, camera and juice from the look tokens (look.ts); nothing here decides anything about
// the game.
import * as THREE from 'three';
import { now, onTick } from '../clock';
import { SHAPES, enemyDef, type EnemyDef } from '../content';
import type { GameState, Vec } from '../game';
import { rand, type Rng } from '../rng';
import { token } from '../tokens';
import { T } from '../tuning';
import type { ShotSource } from '../world';
import { KEY_DIR_XYZ, LOOK } from './look';

export type Scene = ReturnType<typeof createScene>;

/** The shell's own dice for the juice (gore directions, shake): seeded, so a story looks the same every run. */
const fx: Rng = { seed: 7 };

// ---------- shared parts ----------

const ball = new THREE.SphereGeometry(1, 24, 16);
const toon = (paint: string, extra: THREE.MeshToonMaterialParameters = {}) => new THREE.MeshToonMaterial({ color: token(paint), ...extra });
/** A sphere placed and squashed: `part(mat, [x, y, z], [sx, sy, sz])`, in a body whose radius is 1 and whose +x faces the kid. */
function part(mat: THREE.Material, at: [number, number, number], size: [number, number, number]) {
  const m = new THREE.Mesh(ball, mat);
  m.position.set(...at);
  m.scale.set(...size);
  return m;
}

/** An enemy's body: the group to place, its skin (which flashes when struck), the wings that flap (flies), whether it wobbles. */
type Body = { root: THREE.Group; skin: THREE.MeshToonMaterial; wings: THREE.Object3D[]; wobble: boolean; hover: number };

/** One builder per enemy shape (content.ts SHAPES), at radius 1; the caller scales it to the enemy's `r`. */
const BODIES: Record<(typeof SHAPES)[number], (paint: string, eye: THREE.Material, mouth: THREE.Material) => Body> = {
  /** A fat fly: a dark body, two red-black eyes, two wings that blur. It hovers. */
  fly: (paint, eye) => {
    const skin = toon(paint), root = new THREE.Group();
    root.add(part(skin, [0, 0, 0], [0.75, 0.6, 0.6]), part(eye, [0.55, 0.2, 0.28], [0.25, 0.25, 0.25]), part(eye, [0.55, 0.2, -0.28], [0.25, 0.25, 0.25]));
    const wingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false });
    const wings = [1, -1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(-0.1, 0.45, 0.2 * side);
      pivot.add(part(wingMat, [-0.15, 0, 0.45 * side], [0.5, 0.05, 0.35]));
      root.add(pivot);
      return pivot;
    });
    return { root, skin, wings, wobble: false, hover: 1.4 };
  },
  /** A floating head: two black eyes streaming blood, a small sad mouth. */
  head: (paint, eye, mouth) => {
    const skin = toon(paint), root = new THREE.Group(), tear = toon('--enemy-spit');
    root.add(
      part(skin, [0, 0, 0], [1, 1, 1]),
      part(eye, [0.7, 0.3, 0.36], [0.22, 0.28, 0.22]), part(eye, [0.7, 0.3, -0.36], [0.22, 0.28, 0.22]),
      part(tear, [0.82, -0.15, 0.4], [0.08, 0.4, 0.08]), part(tear, [0.82, -0.15, -0.4], [0.08, 0.4, 0.08]),
      part(mouth, [0.9, -0.4, 0], [0.1, 0.12, 0.28]),
    );
    return { root, skin, wings: [], wobble: true, hover: 1.2 };
  },
  /** A pink lump with a snout and beady eyes: squat and wide. */
  lump: (paint, eye) => {
    const skin = toon(paint), root = new THREE.Group();
    root.add(
      part(skin, [0, 0, 0], [1.25, 0.8, 1]),
      part(skin, [1.15, 0, 0], [0.25, 0.32, 0.38]),
      part(eye, [1.36, 0.02, 0.12], [0.05, 0.08, 0.06]), part(eye, [1.36, 0.02, -0.12], [0.05, 0.08, 0.06]),
      part(eye, [0.85, 0.45, 0.35], [0.12, 0.14, 0.12]), part(eye, [0.85, 0.45, -0.35], [0.12, 0.14, 0.12]),
    );
    return { root, skin, wings: [], wobble: true, hover: 0.8 };
  },
  /** A huge blob that's mostly mouth, with two little eyes on top. */
  blob: (paint, eye, mouth) => {
    const skin = toon(paint), root = new THREE.Group();
    root.add(
      part(skin, [0, 0, 0], [1, 0.85, 1]),
      part(mouth, [0.82, -0.1, 0], [0.22, 0.45, 0.62]),
      part(eye, [0.55, 0.6, 0.3], [0.13, 0.16, 0.13]), part(eye, [0.55, 0.6, -0.3], [0.13, 0.16, 0.13]),
    );
    return { root, skin, wings: [], wobble: true, hover: 0.85 };
  },
};

/** The game's (x, y) is Three's (x, z): the floor lies on the XZ plane, +y towards the bottom of the screen. */
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
  /** Back the camera off until the whole floor (and the margin round it) fits this aspect. */
  function placeCamera(aspect: number) {
    const half = Math.tan(((LOOK.CAMERA_FOV_DEG * Math.PI) / 180) / 2);
    const d = (Math.max(T.FLOOR_H_U / 2, T.FLOOR_W_U / 2 / aspect) * LOOK.CAMERA_MARGIN) / half;
    eye.set(0, Math.cos(LOOK.CAMERA_TILT_RAD) * d, LOOK.CAMERA_LIFT_U + Math.sin(LOOK.CAMERA_TILT_RAD) * d);
    camera.aspect = aspect;
    camera.position.copy(eye);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }
  placeCamera(w / h);

  scene.add(new THREE.HemisphereLight(token('--light'), token('--ink'), LOOK.FILL_LIGHT));
  const bulb = new THREE.DirectionalLight(token('--light'), LOOK.KEY_LIGHT);
  bulb.position.set(...KEY_DIR_XYZ);
  scene.add(bulb);

  // ---------- the basement: floor tiles, their seams, walls ----------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(T.FLOOR_W_U, T.FLOOR_H_U), toon('--floor'));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const hw = T.FLOOR_W_U / 2, hh = T.FLOOR_H_U / 2, seams: number[] = [];
  for (let x = -hw; x <= hw; x += 2) seams.push(x, 0.01, -hh, x, 0.01, hh);
  for (let z = -hh; z <= hh; z += 2) seams.push(-hw, 0.01, z, hw, 0.01, z);
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(seams, 3)), new THREE.LineBasicMaterial({ color: token('--grid') })));
  const wallMat = toon('--wall', { emissive: token('--wall'), emissiveIntensity: LOOK.WALL_GLOW });
  for (const [x, z, sx, sz] of [[0, -hh - 0.4, T.FLOOR_W_U + 1.6, 0.8], [0, hh + 0.4, T.FLOOR_W_U + 1.6, 0.8], [-hw - 0.4, 0, 0.8, T.FLOOR_H_U], [hw + 0.4, 0, 0.8, T.FLOOR_H_U]] as const) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, 1.2, sz), wallMat);
    wall.position.set(x, 0.6, z);
    scene.add(wall);
  }

  // ---------- the kid: a big head, black eyes, a mouth facing where you aim; the spit bubble; the aim ring ----------
  const R = T.PLAYER_R_U * LOOK.BODY_SCALE;
  const kid = new THREE.Group(), kidSkin = toon('--kid-skin'), kidEye = toon('--kid-eye');
  const body = new THREE.Group();
  body.add(
    part(kidSkin, [-0.1 * R, 0.45 * R, 0], [0.55 * R, 0.5 * R, 0.6 * R]), // the little body under the head
    part(kidSkin, [0, 1.35 * R, 0], [1.05 * R, 1 * R, 1.05 * R]), // the head
    part(kidEye, [0.62 * R, 1.75 * R, 0.4 * R], [0.34 * R, 0.44 * R, 0.32 * R]), // big black eyes, high up so the
    part(kidEye, [0.62 * R, 1.75 * R, -0.4 * R], [0.34 * R, 0.44 * R, 0.32 * R]), // camera above can see them
  );
  const mouth = part(toon('--kid-mouth'), [0.95 * R, 1.05 * R, 0], [0.12 * R, 0.14 * R, 0.24 * R]);
  body.add(mouth);
  kid.add(body);
  const bubble = new THREE.Mesh(ball, new THREE.MeshBasicMaterial({ color: token('--bubble'), transparent: true, opacity: 0.3, depthWrite: false }));
  bubble.scale.setScalar(R * 2.4);
  bubble.position.y = R * 1.2;
  kid.add(bubble);
  scene.add(kid);
  const reticle = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: token('--reticle'), transparent: true, opacity: 0.85 }));
  reticle.position.y = 0.02;
  scene.add(reticle);
  let gapeS = 0;

  // ---------- enemies and gobs, reconciled by id ----------
  const eyeMat = toon('--eye'), mouthMat = toon('--mouth');
  type Foe = Body & { d: EnemyDef; glow: number; flashS: number; ageS: number; phase: number };
  const foes = new Map<number, Foe>();
  const gobMats = new Map<string, THREE.MeshBasicMaterial>();
  const gobPaint = (from: ShotSource) => (from === 'foe' ? '--enemy-spit' : `--weapon-${from.weapon}`);
  const gobMat = (paint: string) => { let m = gobMats.get(paint); if (!m) gobMats.set(paint, (m = new THREE.MeshBasicMaterial({ color: token(paint) }))); return m; };
  const gobs = new Map<number, THREE.Mesh>();

  // ---------- juice: gore and the shake ----------
  type Bit = { mesh: THREE.Mesh; v: THREE.Vector3; lifeS: number; size: number };
  const bits: Bit[] = [];
  const goreMats = new Map<string, THREE.MeshToonMaterial>();
  const goreMat = (paint: string) => { let m = goreMats.get(paint); if (!m) goreMats.set(paint, (m = toon(paint))); return m; };
  let shakeS = 0;
  let lastEvents: GameState['events'] | null = null;

  function burst(at: Vec, paint: string) {
    for (let i = 0; i < LOOK.BURST_BITS; i++) {
      const a = rand(fx) * Math.PI * 2, up = 0.3 + rand(fx), speed = LOOK.BURST_SPEED_U_S * (0.4 + rand(fx) * 0.6), size = 0.07 + rand(fx) * 0.1;
      const mesh = new THREE.Mesh(ball, goreMat(i % 3 === 0 ? '--enemy-spit' : paint)); // a third of it is blood
      mesh.position.set(at.x, 0.5, at.y);
      mesh.scale.setScalar(size);
      scene.add(mesh);
      bits.push({ mesh, v: new THREE.Vector3(Math.cos(a) * speed, up * speed, Math.sin(a) * speed), lifeS: LOOK.BURST_S, size });
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
      else if (ev.type === 'fired' && ev.from !== 'foe') gapeS = LOOK.GAPE_S;
      else if (ev.type === 'died') burst(s.player, '--kid-skin');
    }
  }

  // ---------- the dark round the screen's edges: a quad over everything ----------
  const overlay = new THREE.Scene(), flat = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  overlay.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: { color: { value: new THREE.Color(token('--vignette')) }, strength: { value: LOOK.VIGNETTE }, start: { value: LOOK.VIGNETTE_START } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform vec3 color; uniform float strength; uniform float start; varying vec2 vUv;\n' +
      'void main() { float d = length(vUv * 2.0 - 1.0) / 1.41421; gl_FragColor = vec4(color, smoothstep(start, 1.0, d) * strength); }',
  })));

  // Decoration only: none of this moves a tap target, so it never reports busy (settle() would never return).
  onTick((dtS) => {
    const t = now();
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i]!;
      b.lifeS -= dtS;
      b.v.y -= LOOK.BURST_GRAVITY_U_S2 * dtS;
      b.mesh.position.addScaledVector(b.v, dtS);
      if (b.mesh.position.y < 0.03) { b.mesh.position.y = 0.03; b.v.set(0, 0, 0); } // splat on the floor
      b.mesh.scale.setScalar(b.size * Math.min(1, (b.lifeS / LOOK.BURST_S) * 2));
      if (b.lifeS <= 0) { scene.remove(b.mesh); bits.splice(i, 1); }
    }
    for (const f of foes.values()) {
      f.ageS += dtS;
      f.flashS = Math.max(0, f.flashS - dtS);
      f.skin.emissive.set(f.flashS > 0 ? 0xffffff : f.glow);
      f.skin.emissiveIntensity = f.flashS > 0 ? LOOK.FLASH_GLOW : LOOK.GLOW;
      const grow = f.d.r * LOOK.BODY_SCALE * Math.min(1, f.ageS / LOOK.SPAWN_GROW_S);
      const squash = f.wobble ? Math.sin((t * LOOK.WOBBLE_HZ + f.phase) * Math.PI * 2) * LOOK.WOBBLE : 0;
      f.root.scale.set(grow * (1 - squash), grow * (1 + squash), grow * (1 - squash));
      for (const [i, wing] of f.wings.entries()) wing.rotation.x = (i ? -1 : 1) * Math.sin(t * LOOK.FLAP_HZ * Math.PI * 2) * 0.6;
    }
    gapeS = Math.max(0, gapeS - dtS);
    const open = 1 + (LOOK.GAPE - 1) * (gapeS / LOOK.GAPE_S);
    mouth.scale.set(0.12 * R, 0.14 * R * open, 0.24 * R * (1 + (open - 1) * 0.4));
    shakeS = Math.max(0, shakeS - dtS);
    const k = (shakeS / LOOK.SHAKE_S) * LOOK.SHAKE_U;
    camera.position.set(eye.x + (rand(fx) - 0.5) * k, eye.y, eye.z + (rand(fx) - 0.5) * k);
    return false;
  });

  return {
    /** Match the bodies to the state by id, and play its events. `live` false hides the kid and the aim (the title). */
    sync(s: GameState, live: boolean) {
      play(s);
      const p = s.player;
      kid.visible = live && s.phase !== 'dead';
      reticle.visible = live && s.phase === 'fight';
      kid.position.set(p.x, 0, p.y);
      kid.rotation.y = Math.atan2(-p.aim.y, p.aim.x);
      bubble.visible = p.shieldS > 0;
      body.visible = p.graceS <= 0 || p.shieldS > 0 || Math.floor(p.graceS * 20) % 2 === 0; // blink while untouchable

      const liveFoes = new Set(s.enemies.map((e) => e.id));
      for (const [id, f] of foes) if (!liveFoes.has(id)) { scene.remove(f.root); f.skin.dispose(); foes.delete(id); }
      for (const e of s.enemies) {
        let f = foes.get(e.id);
        if (!f) {
          const d = enemyDef(e.kind), b = BODIES[d.shape](d.paint, eyeMat, mouthMat);
          b.skin.emissive.set(token(d.paint));
          f = { ...b, d, glow: token(d.paint), flashS: 0, ageS: 0, phase: (e.id * 0.37) % 1 };
          scene.add(f.root);
          foes.set(e.id, f);
        }
        const shake = e.mode === 'windup' ? (rand(fx) - 0.5) * LOOK.WINDUP_SHAKE_U : 0;
        f.root.position.set(e.x + shake, f.d.r * LOOK.BODY_SCALE * f.hover, e.y + shake);
        f.root.rotation.y = Math.atan2(-(p.y - e.y), p.x - e.x); // every face turns to the kid
      }

      const liveGobs = new Set(s.shots.map((b) => b.id));
      for (const [id, m] of gobs) if (!liveGobs.has(id)) { scene.remove(m); gobs.delete(id); }
      for (const b of s.shots) {
        let m = gobs.get(b.id);
        if (!m) { m = new THREE.Mesh(ball, gobMat(gobPaint(b.from))); m.scale.setScalar(b.r); scene.add(m); gobs.set(b.id, m); }
        m.position.set(b.x, 0.5, b.y);
      }
    },
    /** Put the aim ring on this floor point. */
    aim(at: Vec) { reticle.position.set(at.x, 0.02, at.y); },
    /** The floor point under a cursor position (client px), or null when the cursor is off the floor's plane. */
    toWorld(clientX: number, clientY: number): Vec | null {
      const r = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
      return hit && { x: hit.x, y: hit.z };
    },
    render() {
      renderer.autoClear = true;
      renderer.render(scene, camera);
      renderer.autoClear = false;
      renderer.render(overlay, flat);
    },
    resize(cw: number, ch: number) {
      renderer.setSize(cw, ch);
      placeCamera(cw / ch);
    },
  };
}
