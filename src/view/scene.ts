// The nightmare in 3D: a Three scene under the Pixi canvas. A grey floor lit from somewhere up-screen, fading to black
// at the walls; every body a flat black paper cutout standing up to face the camera, with a thin light rim on its
// edge; fog with distance, haze over the frame, and a film pass on top (blurred silhouettes in front of the lens,
// grain, a heavy vignette). The only colour is the kid's warm glow and the red of danger. It reconciles one body per
// kid, enemy and shot against the game state by id, the way the UI engine reconciles by key, and plays the juice
// from the state's events. Hues come from the palette (tokens.ts), every number from the look tokens (look.ts);
// nothing here decides anything about the game.
import * as THREE from 'three';
import { now, onTick } from '../clock';
import { SHAPES, enemyDef, type EnemyDef } from '../content';
import type { GameState, Vec } from '../game';
import { rand, type Rng } from '../rng';
import { token } from '../tokens';
import { T } from '../tuning';
import type { ShotSource } from '../world';
import { LOOK, RIM_DIR_XYZ } from './look';

export type Scene = ReturnType<typeof createScene>;

/** The shell's own dice for the juice and the edge silhouettes: seeded, so a story looks the same every run. */
const fx: Rng = { seed: 7 };

/** A palette colour, linear (for materials that convert to the screen themselves). */
const lin = (name: string) => new THREE.Color(token(name));
/** A palette colour as the screen shows it (for the film passes, which blend straight onto the screen). */
const srgb = (name: string) => { const c = lin(name).convertLinearToSRGB(); return new THREE.Vector3(c.r, c.g, c.b); };

// ---------- shaders ----------

const CUTOUT_VERT = `
#include <common>
#include <fog_pars_vertex>
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

/** Flat black paper with light catching its bevelled edge: brightest on the edges that face the backlight. */
const CUTOUT_FRAG = `
#include <common>
#include <fog_pars_fragment>
uniform vec3 base;
uniform vec3 rim;
uniform float rimStrength;
uniform float rimPower;
uniform vec3 rimDir;
uniform float flash;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec3 n = normalize(vN);
  float edge = pow(1.0 - abs(dot(n, normalize(vV))), rimPower);
  float facing = 0.35 + 0.65 * max(dot(n, rimDir), 0.0);
  vec3 c = base + rim * edge * facing * rimStrength * (1.0 + 2.5 * flash);
  gl_FragColor = vec4(c, 1.0);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

const FLOOR_VERT = `
varying vec2 vXZ;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vXZ = w.xz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

/** The floor: a glow up-screen fading to dark, broken by grit, warmed round the kid. */
const FLOOR_FRAG = `
uniform vec3 glow;
uniform vec3 dark;
uniform vec3 warm;
uniform vec2 halfSize;
uniform float glowRadius;
uniform float glowY;
uniform float grit;
uniform vec2 kid;
uniform float haloR;
uniform float halo;
uniform float plank;
uniform float seam;
uniform float grain;
uniform float stain;
uniform float edgeSoft;
uniform vec3 beyondCol;
uniform float beyondSoft;
uniform float edgeDark;
uniform float bars;
uniform float barSpacing;
uniform float barFan;
uniform float barReach;
varying vec2 vXZ;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
}
void main() {
  vec2 q = (vXZ - vec2(0.0, glowY)) / halfSize;
  float g = exp(-pow(length(q) / glowRadius, 2.0) * 1.6);
  vec3 c = mix(dark, glow, g);
  float n = noise(vXZ * 0.9) * 0.55 + noise(vXZ * 4.0) * 0.3 + noise(vXZ * 13.0) * 0.15;
  c *= 1.0 + grit * (n - 0.5) * 2.0;
  // Old floorboards: planks along x, each row's joints staggered, a grain along them, dark gaps between.
  float row = floor(vXZ.y / plank);
  float along = fract((vXZ.x + hash(vec2(row, 3.1)) * 9.0) / (plank * 4.5));
  float side = fract(vXZ.y / plank);
  float gap = max(1.0 - smoothstep(0.0, 0.035, min(side, 1.0 - side)), 1.0 - smoothstep(0.0, 0.006, min(along, 1.0 - along)));
  c *= 1.0 - seam * gap;
  c *= 1.0 + grain * (noise(vec2(vXZ.x * 0.7, vXZ.y * 11.0 + row * 13.0)) - 0.5);
  // The light from beyond the far wall comes through the crib's bars: long shadows fanning across the boards.
  float fromWall = vXZ.y + halfSize.y;
  float bx = vXZ.x / (1.0 + fromWall * barFan) / barSpacing;
  float stripe = 1.0 - smoothstep(0.08, 0.2, abs(fract(bx) - 0.5));
  c *= 1.0 - bars * stripe * exp(-fromWall / barReach);
  // No hard edge to the floor: it sinks into the dark over edgeSoft u round the walls.
  vec2 outside = max(abs(vXZ) - halfSize + edgeSoft, 0.0);
  c *= 1.0 - edgeDark * smoothstep(0.0, edgeSoft * 2.0, length(outside));
  // Beyond the far wall, the light everything is lit from: bright fog, so whatever hangs in front of it is a silhouette.
  c = mix(c, beyondCol, smoothstep(0.4, beyondSoft, -(vXZ.y + halfSize.y)));
  // Stains: dark patches soaked into the boards.
  c *= 1.0 - stain * smoothstep(0.6, 0.85, noise(vXZ * 0.33 + 17.0));
  float d = length(vXZ - kid) / haloR;
  c += warm * halo * exp(-d * d);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

/** Ground fog: drifting banks of mist lying on the floor, thickest away from the light. */
const MIST_FRAG = `
uniform vec3 mist;
uniform float amount;
uniform float time;
uniform float drift;
uniform float scale;
varying vec2 vXZ;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
}
void main() {
  vec2 p = vXZ * scale;
  float n = noise(p + vec2(time * drift, time * drift * 0.4)) * 0.55 + noise(p * 2.3 - vec2(time * drift * 1.6, 0.0)) * 0.3 + noise(p * 5.1 + time * drift) * 0.15;
  gl_FragColor = vec4(mist, amount * smoothstep(0.25, 0.85, n));
  #include <colorspace_fragment>
}`;

const SCREEN_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

/** Haze, added over the frame: brighter at the top (further away) and towards the middle. */
const HAZE_FRAG = `
uniform vec3 haze;
uniform float amount;
uniform float top;
varying vec2 vUv;
void main() {
  float d = length((vUv - vec2(0.5, 0.6)) * vec2(1.4, 1.0));
  float k = (amount + top * vUv.y) * (1.0 - 0.6 * smoothstep(0.15, 0.85, d));
  gl_FragColor = vec4(haze * k, 1.0);
}`;

/** The film over everything, composited front to back: silhouettes in front of the lens, vignette, hurt pulse, grain. */
const FILM_FRAG = `
uniform sampler2D near;
uniform sampler2D far;
uniform vec2 nearOff;
uniform vec2 farOff;
uniform float edgeAmount;
uniform vec3 edgeCol;
uniform vec3 vigCol;
uniform float vig;
uniform float vigStart;
uniform float aspect;
uniform float vigRound;
uniform vec3 danger;
uniform float hurt;
uniform vec3 grainCol;
uniform float grain;
uniform float seed;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + seed) * 43758.5453); }
vec4 over(vec4 top, vec4 bot) { return top + bot * (1.0 - top.a); }
void main() {
  float sil = max(texture2D(far, vUv + farOff).a * 0.75, texture2D(near, vUv + nearOff).a) * edgeAmount;
  vec2 k = vec2(mix(1.0, aspect, vigRound), 1.0);
  float d = length((vUv - 0.5) * k) / length(k * 0.5);
  float v = smoothstep(vigStart, 1.0, d) * vig;
  float h = hurt * smoothstep(0.35, 1.0, d);
  float g = grain;
  vec4 acc = vec4(edgeCol * sil, sil);
  acc = over(vec4(vigCol * v, v), acc);
  acc = over(vec4(danger * h, h), acc);
  acc = over(vec4(grainCol * hash(floor(gl_FragCoord.xy / 1.5)) * 2.0 * g, g), acc);
  gl_FragColor = acc;
}`;

// ---------- canvas textures ----------

/** A soft round blob: white in the middle, clear at the edge (shadows and glows are this, tinted). */
function softDot(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!, r = size / 2, grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

/**
 * Silhouettes in front of the lens: weeds along the bottom, roots hanging from the top, brambles reaching in from
 * the sides, drawn black and blurred, on a canvas the shape of the screen. `scale` makes them bigger and fewer
 * (the near layer), `depth` is how far into the frame they reach (0..1).
 */
function edgeLayer(w: number, h: number, depth: number, scale: number, count: number, blurPx: number) {
  const sharp = document.createElement('canvas');
  sharp.width = w; sharp.height = h;
  const g = sharp.getContext('2d')!;
  g.fillStyle = g.strokeStyle = '#000';
  g.lineCap = 'round';
  const R = () => rand(fx);
  // Weeds: curved blades in clumps along the bottom edge, tallest at the corners.
  for (let i = 0; i < count * 6; i++) {
    const x = R() * w, corner = Math.pow(Math.abs(x / w - 0.5) * 2, 2), bh = h * depth * (0.25 + 0.75 * corner) * (0.4 + R() * 0.6);
    const bw = 6 * scale + R() * 8 * scale, bend = (R() - 0.5) * bh * 0.6;
    g.beginPath();
    g.moveTo(x - bw / 2, h + 2);
    g.quadraticCurveTo(x + bend * 0.3, h - bh * 0.55, x + bend, h - bh);
    g.quadraticCurveTo(x + bend * 0.3 + bw * 0.2, h - bh * 0.5, x + bw / 2, h + 2);
    g.fill();
  }
  // Roots: tapering strands hanging from the top, longest at the corners, a little wavy.
  for (let i = 0; i < count * 3; i++) {
    const x0 = R() * w, corner = Math.pow(Math.abs(x0 / w - 0.5) * 2, 1.5), len = h * depth * (0.4 + 0.6 * corner) * (0.4 + R() * 0.6);
    let x = x0, y = -2, width = 5 * scale + R() * 7 * scale;
    const steps = 14, sway = (R() - 0.5) * 0.8;
    for (let s = 0; s < steps; s++) {
      const nx = x + Math.sin(s * 0.7 + i) * 3 * scale + sway * 4, ny = y + len / steps;
      g.lineWidth = Math.max(1, width * (1 - s / steps));
      g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      x = nx; y = ny;
    }
  }
  // Brambles: a branch reaching in from each side, with thorns, low and high.
  for (let i = 0; i < count; i++) {
    const left = i % 2 === 0, y0 = h * (0.15 + R() * 0.7), reach = w * depth * 0.6 * (0.5 + R() * 0.5);
    let x = left ? -4 : w + 4, y = y0, width = 9 * scale;
    const steps = 16, dir = left ? 1 : -1, droop = (R() - 0.3) * 1.2;
    for (let s = 0; s < steps; s++) {
      const nx = x + dir * reach / steps, ny = y + droop * (s / steps) * 6 * scale + Math.sin(s * 0.9 + i) * 2 * scale;
      g.lineWidth = Math.max(1.2, width * (1 - s / steps * 0.85));
      g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      if (s % 2 === 1) { // a thorn
        const tx = nx, ty = ny, up = s % 4 === 1 ? -1 : 1, tl = 7 * scale;
        g.beginPath(); g.moveTo(tx - dir * 3 * scale, ty); g.lineTo(tx + dir * tl * 0.4, ty + up * tl); g.lineTo(tx + dir * 3 * scale, ty); g.fill();
      }
      x = nx; y = ny;
    }
  }
  if (scale > 2) {
    // Close to the lens, so big, chunky and out of focus, placed where there's light behind them: a clump of weeds at
    // the lower left, reeds at the right, a heavy branch with hanging leaves across the top left, and a toy mobile (a
    // crescent moon and a star on strings) at the top right.
    g.lineCap = 'round';
    const blade = (x: number, base: number, top: number, bw: number, bend: number) => {
      g.beginPath(); g.moveTo(x - bw, base); g.quadraticCurveTo(x + bend * 0.4, (top + base) / 2, x + bend, top);
      g.quadraticCurveTo(x + bend * 0.4 + bw * 0.4, (top + base) / 2, x + bw, base); g.fill();
    };
    for (let i = 0; i < 16; i++) blade(w * (0.0 + 0.2 * R()), h + 4, h * (0.5 + 0.35 * R()), 26 + R() * 30, (R() - 0.3) * w * 0.07);
    g.beginPath(); g.ellipse(w * 0.06, h * 1.0, w * 0.13, h * 0.2, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 12; i++) blade(w * (0.84 + 0.16 * R()), h + 4, h * (0.45 + 0.35 * R()), 18 + R() * 22, (R() - 0.6) * w * 0.06);
    g.lineWidth = 46; g.beginPath(); g.moveTo(-20, h * 0.1); g.quadraticCurveTo(w * 0.14, h * 0.07, w * 0.3, h * 0.15); g.stroke();
    g.lineWidth = 22; g.beginPath(); g.moveTo(w * 0.3, h * 0.15); g.quadraticCurveTo(w * 0.34, h * 0.18, w * 0.37, h * 0.17); g.stroke();
    for (const [lx, ly, ll] of [[0.08, 0.09, 0.2], [0.17, 0.1, 0.27], [0.25, 0.13, 0.18], [0.33, 0.17, 0.14]] as const) {
      g.lineWidth = 9; g.beginPath(); g.moveTo(w * lx, h * ly); g.lineTo(w * lx + 8, h * (ly + ll * 0.7)); g.stroke();
      g.beginPath(); g.ellipse(w * lx + 10, h * (ly + ll * 0.8), 26, h * ll * 0.3, 0.15, 0, Math.PI * 2); g.fill();
    }
    const mx = w * 0.77;
    g.lineWidth = 6; g.beginPath(); g.moveTo(mx, 0); g.lineTo(mx, h * 0.24); g.stroke();
    g.beginPath(); g.arc(mx, h * 0.33, h * 0.1, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(mx + h * 0.05, h * 0.3, h * 0.09, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
    const sx = w * 0.68, sy = h * 0.2, r1 = h * 0.065, r2 = h * 0.028;
    g.beginPath(); g.moveTo(sx, 0); g.lineTo(sx, sy - r1); g.stroke();
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? r2 : r1; g.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); }
    g.fill();
  }
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const o = out.getContext('2d')!;
  o.filter = `blur(${blurPx}px)`;
  o.drawImage(sharp, 0, 0);
  const tex = new THREE.CanvasTexture(out);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// ---------- cutouts ----------

type Cutout = THREE.ShaderMaterial & { uniforms: { flash: { value: number } } };

/** Paper-cutout material: a near-black body (`base`), its rim light in `rim` at `strength`. Fogged with distance. */
function cutoutMat(base: string, rim: string, strength = LOOK.RIM): Cutout {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      base: { value: lin(base) }, rim: { value: lin(rim) }, rimStrength: { value: strength }, rimPower: { value: LOOK.RIM_POWER },
      rimDir: { value: new THREE.Vector3(...RIM_DIR_XYZ).normalize() }, flash: { value: 0 },
    }]),
    vertexShader: CUTOUT_VERT, fragmentShader: CUTOUT_FRAG,
  }) as Cutout;
}

/** A flat shape with a bevelled edge to catch the rim light: the card every body is made of. Units: radius about 1. */
function slab(shape: THREE.Shape) {
  return new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelThickness: LOOK.RIM_WIDTH_U, bevelSize: LOOK.RIM_WIDTH_U, bevelSegments: 3, curveSegments: 28 });
}
/**
 * The light edge round a cutout: behind every part made of `skin`, a copy a little bigger in `rim`, nudged up so the
 * edge is brightest on top (lit from behind and above). `width` is the edge's width in card units.
 */
function addRims(card: THREE.Object3D, skin: THREE.Material, rim: THREE.Material, width: number) {
  const parts: THREE.Mesh[] = [];
  card.traverse((o) => { if (o instanceof THREE.Mesh && o.material === skin) parts.push(o); });
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    const box = p.geometry.boundingBox!, c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const k = new THREE.Vector3(1 + (2 * width) / Math.max(size.x, 0.05), 1 + (2 * width) / Math.max(size.y, 0.05), 1);
    const edge = new THREE.Mesh(p.geometry, rim);
    edge.scale.copy(k);
    edge.position.set(c.x * (1 - k.x), c.y * (1 - k.y) + width * 0.6, -0.03);
    p.add(edge);
  }
}

const disc = new THREE.CircleGeometry(1, 28);
/** Just in front of a card's face (its depth plus the bevel), where eyes, teeth and mouths sit. */
const FRONT_Z = 0.02 + LOOK.RIM_WIDTH_U + 0.01;

// ---------- shapes, in a card's units: feet at y 0, about 2 tall ----------

/** A closed outline round (cx, cy), radii rx and ry, its edge pushed in and out by `bump` over `lobes` (lumpy flesh). */
function blob(cx: number, cy: number, rx: number, ry: number, bump = 0, lobes = 0, phase = 0) {
  const s = new THREE.Shape(), n = 72;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2, k = 1 + bump * (Math.sin(a * lobes + phase) * 0.7 + Math.sin(a * lobes * 2.3 + phase * 1.7) * 0.3);
    const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
    if (i) s.lineTo(x, y); else s.moveTo(x, y);
  }
  return s;
}
/** A line through `pts` drawn as a shape `width` wide, tapering to `tip` of that at the end: legs, antennae, stitches, lashes. */
function stroke(pts: [number, number][], width: number, tip = 1) {
  const left: [number, number][] = [], right: [number, number][] = [];
  pts.forEach(([x, y], i) => {
    const [ax, ay] = pts[Math.max(0, i - 1)]!, [bx, by] = pts[Math.min(pts.length - 1, i + 1)]!;
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, w = (width / 2) * (1 - (1 - tip) * (i / (pts.length - 1)));
    left.push([x - (dy / l) * w, y + (dx / l) * w]);
    right.push([x + (dy / l) * w, y - (dx / l) * w]);
  });
  const s = new THREE.Shape(left.map(([x, y]) => new THREE.Vector2(x, y)).concat(right.reverse().map(([x, y]) => new THREE.Vector2(x, y))));
  return s;
}
const poly = (pts: [number, number][]) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
/** A flat part on the face of a card (eyes, teeth, glows): `mat`, at depth `dz` in front of the face. */
function face(shape: THREE.Shape | THREE.BufferGeometry, mat: THREE.Material, dz = 0) {
  const m = new THREE.Mesh(shape instanceof THREE.Shape ? new THREE.ShapeGeometry(shape, 24) : shape, mat);
  m.position.z = FRONT_Z + dz;
  return m;
}

/** What every body is made of: its rim-lit skin, pale eyes, black pupils, and its own red for danger (fades in). */
type Mats = { skin: Cutout; rim: THREE.MeshBasicMaterial; eye: THREE.Material; iris: THREE.MeshBasicMaterial; pupil: THREE.Material; danger: THREE.MeshBasicMaterial };
/** A pupil that turns to look at the child: where it rests, how far it can move. */
type Pupil = { mesh: THREE.Object3D; x: number; y: number; reach: number };

/**
 * An eye on the face: a pale oval (rx, ry), and in it an iris `p` of its size round a black pupil: a dim sickly red at
 * rest that blazes danger red just before the creature attacks. The iris and pupil are returned to be aimed.
 */
function eye(card: THREE.Group, m: Mats, x: number, y: number, rx: number, ry = rx, p = 0.5): Pupil {
  const white = face(disc, m.eye); white.position.set(x, y, FRONT_Z); white.scale.set(rx, ry, 1);
  const look = new THREE.Group();
  const iris = face(disc, m.iris, 0); iris.scale.set(rx * p, ry * p, 1);
  const pupil = face(disc, m.pupil, 0.002); pupil.scale.set(rx * p * 0.5, ry * p * 0.5, 1);
  iris.position.z = pupil.position.z = 0;
  pupil.position.z = 0.002;
  look.add(iris, pupil);
  look.position.set(x, y, FRONT_Z + 0.004);
  card.add(white, look);
  return { mesh: look, x, y, reach: Math.min(rx, ry) * (1 - p) * 0.85 };
}

/**
 * A body: the card that faces the camera (flipped to face the child), its skin (flashes when struck), the wings that
 * flap, the pupils that follow the child, the red parts that glow before it attacks, how high it floats (in its own
 * units) and how wide its shadow is.
 */
type Body = { card: THREE.Group; skin: Cutout; rim: THREE.MeshBasicMaterial; iris: THREE.MeshBasicMaterial; wings: THREE.Object3D[]; pupils: Pupil[]; danger: THREE.MeshBasicMaterial; hover: number; width: number };

/** One builder per enemy shape (content.ts SHAPES). Each is original: big heads, chunky shapes, too many eyes. */
const BODIES: Record<(typeof SHAPES)[number], (m: Mats) => Body> = {
  /** A fat, fuzzy moth-thing that's mostly eyes, two ragged wings, feelers; it hovers. */
  moth: (m) => {
    const card = new THREE.Group(), wings: THREE.Object3D[] = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.3, 1.25, -0.03);
      const wing = new THREE.Mesh(slab(blob(side * 0.62, 0.22, 0.62, 0.36, 0.08, 7, side)), m.skin);
      wing.rotation.z = side * 0.35;
      pivot.add(wing);
      card.add(pivot);
      wings.push(pivot);
    }
    card.add(new THREE.Mesh(slab(blob(0, 1.0, 0.8, 0.74, 0.06, 15)), m.skin));
    for (const side of [-1, 1]) {
      card.add(new THREE.Mesh(slab(stroke([[side * 0.2, 1.6], [side * 0.32, 1.95], [side * 0.55, 2.15], [side * 0.7, 2.08]], 0.07, 0.6)), m.skin));
      card.add(new THREE.Mesh(slab(stroke([[side * 0.3, 0.4], [side * 0.38, 0.12], [side * 0.48, 0.02]], 0.09, 0.5)), m.skin));
    }
    const pupils = [eye(card, m, -0.3, 1.08, 0.31, 0.34, 0.55), eye(card, m, 0.3, 1.08, 0.31, 0.34, 0.55)];
    return { card, skin: m.skin, rim: m.rim, iris: m.iris, wings, pupils, danger: m.danger, hover: 0.7, width: 1.6 };
  },
  /** One enormous eye under a heavy lid, on three stubby feet. Its iris goes red before it spits. */
  eyeball: (m) => {
    const card = new THREE.Group();
    card.add(new THREE.Mesh(slab(blob(0, 1.2, 0.92, 0.9, 0.035, 5, 1)), m.skin));
    for (const x of [-0.5, 0, 0.5]) card.add(new THREE.Mesh(slab(blob(x, 0.2, 0.2, 0.22, 0.05, 3)), m.skin));
    const white = face(disc, m.eye); white.position.set(0, 1.18, FRONT_Z); white.scale.set(0.64, 0.56, 1);
    // Its iris is the danger red; before it spits, a red glow swells round it.
    const glow = face(disc, m.danger, 0.002); glow.position.set(0, 1.12, FRONT_Z + 0.002); glow.scale.set(0.46, 0.44, 1);
    const look = new THREE.Group();
    const iris = face(disc, m.iris, 0); iris.position.set(0, 0, 0); iris.scale.set(0.34, 0.34, 1);
    const pupil = face(disc, m.pupil, 0); pupil.position.set(0, 0, 0.003); pupil.scale.set(0.17, 0.19, 1);
    look.add(iris, pupil);
    look.position.set(0, 1.12, FRONT_Z + 0.006);
    card.add(white, glow, look);
    // The heavy lid over the top of the eye, and three lashes on it.
    card.add(face(blob(0, 1.72, 0.78, 0.36, 0.02, 3), m.pupil, 0.01));
    for (const x of [-0.42, 0, 0.42]) card.add(face(stroke([[x, 1.42], [x * 1.25, 1.22], [x * 1.4, 1.1]], 0.05, 0.4), m.pupil, 0.011));
    return { card, skin: m.skin, rim: m.rim, iris: m.iris, wings: [], pupils: [{ mesh: look, x: 0, y: 1.12, reach: 0.2 }], danger: m.danger, hover: 0, width: 1.9 };
  },
  /** A squat lump that's mostly grin: two rows of crooked teeth, mismatched beady eyes, stub horns. Its mouth glows red before it charges. */
  grin: (m) => {
    const card = new THREE.Group();
    card.add(new THREE.Mesh(slab(blob(0, 0.85, 1.18, 0.8, 0.045, 5, 2)), m.skin));
    card.add(new THREE.Mesh(slab(poly([[-0.62, 1.45], [-0.48, 1.95], [-0.3, 1.5]])), m.skin), new THREE.Mesh(slab(poly([[0.3, 1.52], [0.5, 1.9], [0.62, 1.45]])), m.skin));
    for (const x of [-0.55, 0.55]) card.add(new THREE.Mesh(slab(blob(x, 0.08, 0.22, 0.14, 0.04, 3)), m.skin));
    // The mouth: a red glow behind the teeth (danger), then the teeth.
    card.add(face(blob(0, 0.7, 0.82, 0.24, 0.02, 4), m.danger, 0));
    const top: [number, number][] = [], bottom: [number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const x = -0.8 + (i / 8) * 1.6, curve = -0.12 * Math.cos((x / 0.8) * Math.PI * 0.5);
      top.push([x, 0.86 + curve + 0.06]);
      bottom.push([x, 0.54 - curve * 0.6]);
    }
    for (let i = 0; i < 8; i++) {
      const [x0, y0] = top[i]!, [x1, y1] = top[i + 1]!, crook = (i % 3) * 0.03;
      card.add(face(poly([[x0, y0], [x1, y1], [(x0 + x1) / 2 + crook, y0 - 0.2 - crook]]), m.eye, 0.004));
      const [u0, v0] = bottom[i]!, [u1, v1] = bottom[i + 1]!;
      if (i % 2 === 0) card.add(face(poly([[u0, v0], [(u0 + u1) / 2 - crook, v0 + 0.17], [u1, v1]]), m.eye, 0.004));
    }
    const pupils = [eye(card, m, -0.36, 1.25, 0.17, 0.19, 0.5), eye(card, m, 0.34, 1.28, 0.12, 0.13, 0.5)];
    return { card, skin: m.skin, rim: m.rim, iris: m.iris, wings: [], pupils, danger: m.danger, hover: 0, width: 2.3 };
  },
  /** A huge sewn-up sack tied at the top, crowded with eyes of every size, a stitched mouth that glows red before it heaves. */
  sack: (m) => {
    const card = new THREE.Group();
    card.add(new THREE.Mesh(slab(blob(0, 1.0, 1.05, 0.98, 0.06, 6, 0.5)), m.skin));
    card.add(new THREE.Mesh(slab(blob(0, 1.98, 0.24, 0.2, 0.08, 4)), m.skin));
    card.add(new THREE.Mesh(slab(poly([[-0.1, 2.1], [-0.42, 2.42], [-0.06, 2.2]])), m.skin), new THREE.Mesh(slab(poly([[0.08, 2.2], [0.38, 2.46], [0.12, 2.1]])), m.skin));
    card.add(face(blob(0, 0.58, 0.58, 0.15, 0.03, 3), m.danger, 0));
    card.add(face(stroke([[-0.6, 0.6], [-0.2, 0.52], [0.2, 0.52], [0.6, 0.6]], 0.035), m.eye, 0.004));
    for (const x of [-0.45, -0.15, 0.15, 0.45]) card.add(face(stroke([[x - 0.03, 0.7], [x + 0.03, 0.44]], 0.045), m.eye, 0.005));
    const pupils = [
      eye(card, m, -0.42, 1.3, 0.27, 0.29, 0.5), eye(card, m, 0.36, 1.42, 0.21, 0.23, 0.5), eye(card, m, -0.02, 1.72, 0.13, 0.14, 0.5),
      eye(card, m, 0.66, 1.06, 0.12, 0.12, 0.55), eye(card, m, -0.74, 0.92, 0.1, 0.11, 0.55),
    ];
    return { card, skin: m.skin, rim: m.rim, iris: m.iris, wings: [], pupils, danger: m.danger, hover: 0, width: 2.2 };
  },
};

/** The child: a big round head under a floppy nightcap, a little nightshirt, warm glowing eyes and mouth. */
function childBody(skin: Cutout, glow: THREE.Material) {
  const card = new THREE.Group();
  card.add(new THREE.Mesh(slab(poly([[-0.3, 0.72], [0.3, 0.72], [0.42, 0.12], [0.3, 0.04], [0, 0.08], [-0.3, 0.04], [-0.42, 0.12]])), skin));
  for (const x of [-0.17, 0.17]) card.add(new THREE.Mesh(slab(blob(x, 0.04, 0.13, 0.08)), skin));
  card.add(new THREE.Mesh(slab(blob(0, 1.28, 0.64, 0.6, 0.01, 3)), skin));
  // The nightcap: up from the brow, flopping over to one side, a pompom at the tip.
  const cap = new THREE.Shape();
  cap.moveTo(-0.6, 1.5); cap.quadraticCurveTo(-0.3, 2.25, 0.35, 2.3); cap.quadraticCurveTo(0.75, 2.28, 0.92, 1.92);
  cap.quadraticCurveTo(0.62, 2.08, 0.55, 1.68); cap.quadraticCurveTo(0, 1.82, -0.6, 1.5);
  card.add(new THREE.Mesh(slab(cap), skin), new THREE.Mesh(slab(blob(0.95, 1.86, 0.13, 0.13, 0.12, 7)), skin));
  const eyes = [-0.23, 0.23].map((x) => { const e = face(disc, glow); e.position.set(x, 1.32, FRONT_Z); e.scale.set(0.11, 0.16, 1); return e; });
  const mouth = face(disc, glow); mouth.position.set(0.02, 1.02, FRONT_Z); mouth.scale.set(0.07, 0.05, 1);
  card.add(...eyes, mouth);
  return { card, mouth };
}

/** The game's (x, y) is Three's (x, z): the floor lies on the XZ plane, +y towards the bottom of the screen. */
export function createScene(el: HTMLElement, w: number, h: number) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.setSize(w, h);
  renderer.toneMapping = THREE.NoToneMapping;
  Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0' });
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = lin('--vignette');
  scene.fog = new THREE.Fog(lin('--fog'), LOOK.FOG_NEAR_U, LOOK.FOG_FAR_U);
  const camera = new THREE.PerspectiveCamera(LOOK.CAMERA_FOV_DEG, w / h, 0.1, 300);
  const eyePos = new THREE.Vector3(), target = new THREE.Vector3(0, 0, LOOK.CAMERA_LIFT_U);
  /** Back the camera off until the whole floor (and the margin round it) fits this aspect. */
  function placeCamera(aspect: number) {
    const half = Math.tan(((LOOK.CAMERA_FOV_DEG * Math.PI) / 180) / 2);
    const d = (Math.max(T.FLOOR_H_U / 2, T.FLOOR_W_U / 2 / aspect) * LOOK.CAMERA_MARGIN) / half;
    eyePos.set(0, Math.cos(LOOK.CAMERA_TILT_RAD) * d, LOOK.CAMERA_LIFT_U + Math.sin(LOOK.CAMERA_TILT_RAD) * d);
    camera.aspect = aspect;
    camera.position.copy(eyePos);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }
  placeCamera(w / h);

  // ---------- the floor and walls ----------
  const hw = T.FLOOR_W_U / 2, hh = T.FLOOR_H_U / 2;
  const kidOnFloor = new THREE.Vector2(999, 999);
  const floorMat = new THREE.ShaderMaterial({
    uniforms: {
      glow: { value: lin('--floor-glow') }, dark: { value: lin('--floor-dark') }, warm: { value: lin('--warm') },
      halfSize: { value: new THREE.Vector2(hw, hh) }, glowRadius: { value: LOOK.FLOOR_GLOW_RADIUS }, glowY: { value: LOOK.FLOOR_GLOW_Y_U },
      grit: { value: LOOK.FLOOR_GRIT }, kid: { value: kidOnFloor }, haloR: { value: LOOK.WARM_HALO_U }, halo: { value: LOOK.WARM_HALO },
      plank: { value: LOOK.FLOOR_PLANK_U }, seam: { value: LOOK.FLOOR_SEAM }, grain: { value: LOOK.FLOOR_GRAIN }, stain: { value: LOOK.FLOOR_STAIN }, edgeSoft: { value: LOOK.FLOOR_EDGE_SOFT_U }, edgeDark: { value: LOOK.FLOOR_EDGE_DARK },
      beyondCol: { value: lin('--beyond') }, beyondSoft: { value: LOOK.BEYOND_SOFT_U },
      bars: { value: LOOK.BAR_SHADOW }, barSpacing: { value: LOOK.CRIB_SPACING_U }, barFan: { value: LOOK.BAR_SHADOW_FAN }, barReach: { value: LOOK.BAR_SHADOW_REACH_U },
    },
    vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(T.FLOOR_W_U + 30, T.FLOOR_H_U + 30), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const wallMat = cutoutMat('--wall', '--rim', LOOK.WALL_RIM);
  // Ground fog drifting over the boards.
  const mistU = { mist: { value: lin('--fog') }, amount: { value: LOOK.MIST }, time: { value: 0 }, drift: { value: LOOK.MIST_DRIFT_U_S }, scale: { value: 1 / LOOK.MIST_SIZE_U } };
  const mistPlane = new THREE.Mesh(new THREE.PlaneGeometry(T.FLOOR_W_U + 30, T.FLOOR_H_U + 30), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: mistU, vertexShader: FLOOR_VERT, fragmentShader: MIST_FRAG }));
  mistPlane.rotation.x = -Math.PI / 2;
  mistPlane.position.y = 0.1;
  mistPlane.renderOrder = -1;
  scene.add(mistPlane);
  // The far wall is the bars of a giant crib, fading into the fog: the room the nightmare happens in.
  const barGeo = new THREE.BoxGeometry(LOOK.CRIB_BAR_U, LOOK.CRIB_HEIGHT_U, LOOK.CRIB_BAR_U);
  for (let x = -hw; x <= hw + 0.01; x += LOOK.CRIB_SPACING_U) {
    const bar = new THREE.Mesh(barGeo, wallMat);
    bar.position.set(x, LOOK.CRIB_HEIGHT_U / 2, -hh - 0.6);
    scene.add(bar);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(T.FLOOR_W_U + 2.4, LOOK.CRIB_BAR_U * 2, LOOK.CRIB_BAR_U * 2), wallMat);
  rail.position.set(0, LOOK.CRIB_HEIGHT_U, -hh - 0.6);
  scene.add(rail);

  // ---------- shared parts ----------
  const eyeMat = new THREE.MeshBasicMaterial({ color: lin('--eye'), fog: true });
  const pupilMat = new THREE.MeshBasicMaterial({ color: lin('--pupil'), fog: true });
  const restIris = lin('--danger-eye-rest'), hotIris = lin('--danger-eye');
  const warmGlowMat = new THREE.MeshBasicMaterial({ color: lin('--warm-core') });
  const restRim = lin('--rim'), flashRim = lin('--eye').multiplyScalar(1.6), dangerRim = lin('--danger');
  const dot = softDot();
  /** A hard drop: a solid disc with a black edge (enemy shots). */
  const hard = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#000'; g.beginPath(); g.arc(32, 32, 31, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.fill();
    return new THREE.CanvasTexture(c);
  })();
  const shadowMat = new THREE.MeshBasicMaterial({ map: dot, color: lin('--shadow'), transparent: true, opacity: LOOK.SHADOW, depthWrite: false });
  const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const shadow = (size: number) => { const m = new THREE.Mesh(shadowGeo, shadowMat); m.scale.set(size * 1.4, 1, size * 0.8); m.position.y = 0.02; return m; };

  // ---------- the kid ----------
  const R = T.PLAYER_R_U * LOOK.BODY_SCALE * LOOK.CHILD_SCALE;
  const kid = new THREE.Group(), kidSkin = cutoutMat('--silhouette', '--warm');
  const { card: kidCard, mouth: kidMouth } = childBody(kidSkin, warmGlowMat);
  addRims(kidCard, kidSkin, new THREE.MeshBasicMaterial({ color: lin('--warm') }), LOOK.RIM_WIDTH_U * LOOK.CHILD_RIM);
  kidCard.scale.setScalar(R);
  // The night-light the child carries at their side: the brightest thing on screen, so you always find them.
  const lamp = face(disc, warmGlowMat, 0.02); lamp.position.set(0.62, 0.55, FRONT_Z + 0.02); lamp.scale.setScalar(0.13);
  const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: lin('--warm'), transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: LOOK.LAMP_GLOW }));
  lampGlow.position.set(0.62, 0.55, FRONT_Z + 0.03); lampGlow.scale.setScalar(LOOK.LAMP_SIZE);
  kidCard.add(new THREE.Mesh(slab(stroke([[0.36, 0.62], [0.55, 0.66]], 0.07)), kidSkin), lamp, lampGlow);
  kid.add(kidCard, shadow(R * LOOK.SHADOW_SIZE));
  const mouthRest = kidMouth.scale.clone();
  const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: lin('--bubble'), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  bubble.scale.setScalar(R * 4);
  bubble.position.y = R;
  kid.add(bubble);
  scene.add(kid);
  const reticle = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.36, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: lin('--reticle'), transparent: true, opacity: 0.8 }));
  reticle.position.y = 0.03;
  scene.add(reticle);

  // ---------- enemies and shots, reconciled by id ----------
  /** An enemy on screen: its body, how long since it was struck (squish), and how close it is to attacking (0..1: the bulge). */
  type Foe = Body & { root: THREE.Group; d: EnemyDef; flashS: number; squishS: number; ageS: number; phase: number; flip: number; threat: number; swell: number };
  const foes = new Map<number, Foe>();
  const shotPaint = (from: ShotSource) => (from === 'foe' ? '--danger' : `--weapon-${from.weapon}`);
  const shotMats = new Map<string, { core: THREE.SpriteMaterial; glow: THREE.SpriteMaterial }>();
  const shotMat = (paint: string) => {
    let m = shotMats.get(paint);
    if (!m) {
      const danger = paint === '--danger';
      shotMats.set(paint, (m = {
        // Danger is crisp: a hard red drop with a black edge, so it never reads as a smear. The child's shots are soft light.
        core: new THREE.SpriteMaterial({ map: danger ? hard : dot, color: lin(danger ? '--danger-core' : '--warm-core'), transparent: true, depthWrite: false }),
        // The child's shots glow (added light); danger is a stain, not a light, so it's laid over normally and stays red.
        glow: new THREE.SpriteMaterial({ map: dot, color: lin(paint), transparent: true, depthWrite: false, blending: danger ? THREE.NormalBlending : THREE.AdditiveBlending, opacity: danger ? 0.45 : 0.8 }),
      }));
    }
    return m;
  };
  const shots = new Map<number, THREE.Group>();

  // ---------- juice ----------
  type Bit = { mesh: THREE.Mesh; v: THREE.Vector3; lifeS: number; size: number };
  const bits: Bit[] = [];
  const inkMat = new THREE.MeshBasicMaterial({ color: lin('--splat'), fog: true });
  let shakeS = 0, killShakeS = 0, hurtS = 0, gapeS = 0;
  type Splat = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; lifeS: number };
  const splats: Splat[] = [];
  let lastEvents: GameState['events'] | null = null;

  /** An ink splat on the floor where something died: a ragged star, `size` across, fading slowly. */
  function splat(at: Vec, size: number) {
    const shape = new THREE.Shape(), n = 40, spikes = 7 + Math.floor(rand(fx) * 5), phase = rand(fx) * 6;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, k = 0.62 + 0.28 * Math.pow(Math.abs(Math.sin(a * spikes * 0.5 + phase)), 6) + 0.1 * Math.sin(a * 3 + phase);
      const x = Math.cos(a) * k, y = Math.sin(a) * k;
      if (i) shape.lineTo(x, y); else shape.moveTo(x, y);
    }
    const mat = new THREE.MeshBasicMaterial({ color: lin('--splat'), transparent: true, opacity: 0.9, depthWrite: false, fog: true });
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), mat);
    mesh.position.set(at.x, 0.015, at.y);
    mesh.scale.set(size, 1, size * 0.8);
    scene.add(mesh);
    splats.push({ mesh, mat, lifeS: LOOK.SPLAT_S });
  }

  function burst(at: Vec) {
    for (let i = 0; i < LOOK.BURST_BITS; i++) {
      const a = rand(fx) * Math.PI * 2, up = 0.3 + rand(fx), speed = LOOK.BURST_SPEED_U_S * (0.4 + rand(fx) * 0.6), size = 0.06 + rand(fx) * 0.08;
      const mesh = new THREE.Mesh(disc, inkMat);
      mesh.position.set(at.x, 0.5, at.y);
      mesh.scale.setScalar(size);
      mesh.quaternion.copy(camera.quaternion);
      scene.add(mesh);
      bits.push({ mesh, v: new THREE.Vector3(Math.cos(a) * speed, up * speed, Math.sin(a) * speed), lifeS: LOOK.BURST_S, size });
    }
  }

  function play(s: GameState) {
    if (s.events === lastEvents) return;
    lastEvents = s.events;
    for (const ev of s.events) {
      if (ev.type === 'struck') { const f = foes.get(ev.id); if (f) { f.flashS = LOOK.FLASH_S; f.squishS = LOOK.SQUISH_S; } }
      else if (ev.type === 'killed') { burst(ev); const d = enemyDef(ev.kind); splat(ev, d.r * LOOK.BODY_SCALE * LOOK.SPLAT_SIZE); killShakeS = LOOK.SHAKE_S; }
      else if (ev.type === 'hurt') { shakeS = LOOK.SHAKE_S; hurtS = LOOK.HURT_PULSE_S; }
      else if (ev.type === 'fired' && ev.from !== 'foe') gapeS = LOOK.GAPE_S;
      else if (ev.type === 'died') burst(s.player);
    }
  }

  // ---------- the film passes over everything ----------
  const overlay = new THREE.Scene(), flat = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.PlaneGeometry(2, 2);
  overlay.add(new THREE.Mesh(quad, new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { haze: { value: srgb('--haze') }, amount: { value: LOOK.HAZE }, top: { value: LOOK.HAZE_TOP } },
    vertexShader: SCREEN_VERT, fragmentShader: HAZE_FRAG,
  })));
  const EDGE_W = 2048, EDGE_H = 948;
  const filmU = {
    far: { value: edgeLayer(EDGE_W, EDGE_H, LOOK.EDGE_DEPTH, 1, 9, LOOK.EDGE_BLUR_PX * 0.4) },
    near: { value: edgeLayer(EDGE_W, EDGE_H, LOOK.EDGE_DEPTH, 3.2, 0, LOOK.EDGE_BLUR_PX) },
    nearOff: { value: new THREE.Vector2() }, farOff: { value: new THREE.Vector2() },
    edgeAmount: { value: LOOK.EDGE_LAYER }, edgeCol: { value: srgb('--edge-silhouette') },
    vigCol: { value: srgb('--vignette') }, vig: { value: LOOK.VIGNETTE }, vigStart: { value: LOOK.VIGNETTE_START }, vigRound: { value: LOOK.VIGNETTE_ROUND }, aspect: { value: w / h },
    danger: { value: srgb('--danger') }, hurt: { value: 0 },
    grainCol: { value: srgb('--grain') }, grain: { value: LOOK.GRAIN }, seed: { value: 0 },
  };
  const film = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: filmU,
    vertexShader: SCREEN_VERT, fragmentShader: FILM_FRAG,
  });
  overlay.add(new THREE.Mesh(quad, film));

  // Decoration only: none of this moves a tap target, so it never reports busy (settle() would never return).
  onTick((dtS) => {
    const t = now();
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i]!;
      b.lifeS -= dtS;
      b.v.y -= LOOK.BURST_GRAVITY_U_S2 * dtS;
      b.mesh.position.addScaledVector(b.v, dtS);
      if (b.mesh.position.y < 0.03) { b.mesh.position.y = 0.03; b.v.set(0, 0, 0); }
      b.mesh.scale.setScalar(b.size * Math.min(1, (b.lifeS / LOOK.BURST_S) * 2));
      if (b.lifeS <= 0) { scene.remove(b.mesh); bits.splice(i, 1); }
    }
    for (const f of foes.values()) {
      f.ageS += dtS;
      f.flashS = Math.max(0, f.flashS - dtS);
      f.skin.uniforms.flash.value = f.flashS > 0 ? 1 : 0;
      // Before an attack it swells, its edge and its red parts glowing danger; struck, it squishes and springs back.
      f.swell += (f.threat - f.swell) * Math.min(1, dtS * 14);
      f.rim.color.copy(f.flashS > 0 ? flashRim : restRim).lerp(dangerRim, f.swell);
      f.danger.opacity = f.swell;
      f.iris.color.copy(restIris).lerp(hotIris, f.swell); // a dim red at rest, blazing just before it attacks
      f.squishS = Math.max(0, f.squishS - dtS);
      const hit = LOOK.SQUISH * (f.squishS / LOOK.SQUISH_S) * Math.cos((1 - f.squishS / LOOK.SQUISH_S) * LOOK.SQUISH_S * LOOK.SQUISH_HZ * Math.PI * 2);
      const bulge = 1 + LOOK.BULGE * f.swell * (0.85 + 0.15 * Math.sin(t * 40));
      const grow = f.d.r * LOOK.BODY_SCALE * Math.min(1, f.ageS / LOOK.SPAWN_GROW_S) * bulge;
      const squash = Math.sin((t * LOOK.WOBBLE_HZ + f.phase) * Math.PI * 2) * LOOK.WOBBLE + hit;
      f.card.scale.set(grow * (1 + squash) * f.flip, grow * (1 - squash), grow);
      f.card.position.y = f.hover * grow * (1 + Math.sin((t * LOOK.WOBBLE_HZ * 1.7 + f.phase) * Math.PI * 2) * 0.12);
      f.wings.forEach((wing, i) => { wing.rotation.z = (i ? 1 : -1) * Math.sin((t * LOOK.FLAP_HZ + f.phase) * Math.PI * 2) * 0.45; });
    }
    gapeS = Math.max(0, gapeS - dtS);
    const open = 1 + (LOOK.GAPE - 1) * (gapeS / LOOK.GAPE_S);
    kidMouth.scale.set(mouthRest.x * (1 + (open - 1) * 0.5), mouthRest.y * open, 1);
    shakeS = Math.max(0, shakeS - dtS);
    hurtS = Math.max(0, hurtS - dtS);
    filmU.hurt.value = (hurtS / LOOK.HURT_PULSE_S) * LOOK.HURT_PULSE;
    filmU.seed.value = Math.floor(t * LOOK.GRAIN_HZ) % 997;
    mistU.time.value = t;
    for (let i = splats.length - 1; i >= 0; i--) {
      const sp = splats[i]!;
      sp.lifeS -= dtS;
      sp.mat.opacity = 0.9 * Math.min(1, sp.lifeS / (LOOK.SPLAT_S * 0.4));
      if (sp.lifeS <= 0) { scene.remove(sp.mesh); sp.mesh.geometry.dispose(); sp.mat.dispose(); splats.splice(i, 1); }
    }
    killShakeS = Math.max(0, killShakeS - dtS);
    const k = Math.max((shakeS / LOOK.SHAKE_S) * LOOK.SHAKE_U, (killShakeS / LOOK.SHAKE_S) * LOOK.KILL_SHAKE_U);
    camera.position.set(eyePos.x + (rand(fx) - 0.5) * k, eyePos.y, eyePos.z + (rand(fx) - 0.5) * k);
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
      kidCard.quaternion.copy(camera.quaternion);
      kidCard.scale.x = Math.abs(kidCard.scale.x) * (p.aim.x < 0 ? -1 : 1); // faces where they're spitting
      bubble.visible = p.shieldS > 0;
      kidCard.visible = p.graceS <= 0 || p.shieldS > 0 || Math.floor(p.graceS * 20) % 2 === 0; // blink while untouchable
      kidOnFloor.set(p.x, live ? p.y : 999);
      filmU.nearOff.value.set(-p.x / hw * LOOK.EDGE_PARALLAX * 2, p.y / hh * LOOK.EDGE_PARALLAX * 2);
      filmU.farOff.value.set(-p.x / hw * LOOK.EDGE_PARALLAX, p.y / hh * LOOK.EDGE_PARALLAX);

      const liveFoes = new Set(s.enemies.map((e) => e.id));
      for (const [id, f] of foes) if (!liveFoes.has(id)) { scene.remove(f.root); f.skin.dispose(); f.rim.dispose(); f.iris.dispose(); f.danger.dispose(); foes.delete(id); }
      for (const e of s.enemies) {
        let f = foes.get(e.id);
        if (!f) {
          const d = enemyDef(e.kind), root = new THREE.Group();
          const b = BODIES[d.shape]({ skin: cutoutMat(d.paint, '--rim'), rim: new THREE.MeshBasicMaterial({ color: lin('--rim'), fog: true }), eye: eyeMat, iris: new THREE.MeshBasicMaterial({ color: restIris.clone(), fog: true }), pupil: pupilMat, danger: new THREE.MeshBasicMaterial({ color: lin('--danger'), transparent: true, opacity: 0, depthWrite: false }) });
          addRims(b.card, b.skin, b.rim, LOOK.RIM_WIDTH_U);
          root.add(b.card, shadow(d.r * LOOK.BODY_SCALE * b.width * 0.5 * LOOK.SHADOW_SIZE));
          f = { ...b, root, d, flashS: 0, squishS: 0, ageS: 0, phase: (e.id * 0.37) % 1, flip: 1, threat: 0, swell: 0 };
          scene.add(root);
          foes.set(e.id, f);
        }
        // How close it is to attacking: a charger winding up, or a shot or spray this close to coming round.
        const soon = (word: string) => (e.timers[word] !== undefined && e.mode === 'walk' ? Math.max(0, 1 - e.timers[word]! / LOOK.BULGE_S) : 0);
        f.threat = e.mode === 'windup' ? 1 : Math.max(soon('shoot'), soon('spray'));
        const shake = e.mode === 'windup' ? (rand(fx) - 0.5) * LOOK.WINDUP_SHAKE_U : 0;
        f.root.position.set(e.x + shake, 0, e.y + shake);
        f.card.quaternion.copy(camera.quaternion);
        // Turn to the child, and look at them: on the card, right is towards them and up is up-screen.
        const dx = p.x - e.x, dy = e.y - p.y, l = Math.hypot(dx, dy) || 1;
        f.flip = dx < 0 ? -1 : 1;
        for (const q of f.pupils) q.mesh.position.set(q.x + (Math.abs(dx) / l) * q.reach, q.y + (dy / l) * q.reach, q.mesh.position.z);
      }

      const liveShots = new Set(s.shots.map((b) => b.id));
      for (const [id, m] of shots) if (!liveShots.has(id)) { scene.remove(m); shots.delete(id); }
      for (const b of s.shots) {
        let m = shots.get(b.id);
        if (!m) {
          const mats = shotMat(shotPaint(b.from));
          m = new THREE.Group();
          const foeShot = b.from === 'foe';
          const size = foeShot ? LOOK.DANGER_SIZE : 1;
          const glow = new THREE.Sprite(mats.glow); glow.scale.setScalar(b.r * 2 * size * (foeShot ? LOOK.DANGER_GLOW : LOOK.SHOT_GLOW));
          const core = new THREE.Sprite(mats.core); core.scale.setScalar(b.r * 2.3 * size);
          m.add(glow, core);
          scene.add(m);
          shots.set(b.id, m);
        }
        m.position.set(b.x, 0.5, b.y);
      }
    },
    /** Put the aim ring on this floor point. */
    aim(at: Vec) { reticle.position.set(at.x, 0.03, at.y); },
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
      filmU.aspect.value = cw / ch;
    },
  };
}
