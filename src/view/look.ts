// Look numbers: how the fog lies, how hard the grain and vignette bite, where the camera sits, how the juice moves.
// They live as `--look-*` tokens in screens/shared.css :root beside the palette, so the render is tuned in the
// stylesheet; this is the typed view the shell reads (`--look-camera-lift-u` is `LOOK.CAMERA_LIFT_U`). Catalog: ## Look.
import { TOKENS } from '../tokens';

const KEYS = [
  // the floor's glow, the kid's warm halo, the fog and haze
  'FLOOR_GLOW_RADIUS', 'FLOOR_GLOW_Y_U', 'FLOOR_GRIT', 'FLOOR_PLANK_U', 'FLOOR_SEAM', 'FLOOR_GRAIN', 'FLOOR_STAIN', 'FLOOR_EDGE_SOFT_U', 'FLOOR_EDGE_DARK', 'BEYOND_SOFT_U',
  'CRIB_BAR_U', 'CRIB_HEIGHT_U', 'CRIB_SPACING_U', 'BAR_SHADOW', 'BAR_SHADOW_FAN', 'BAR_SHADOW_REACH_U', 'WARM_HALO_U', 'WARM_HALO',
  'FOG_NEAR_U', 'FOG_FAR_U', 'HAZE', 'HAZE_TOP', 'MIST', 'MIST_DRIFT_U_S', 'MIST_SIZE_U',
  // the film: grain, vignette, the blurred silhouettes round the edges, the red pulse when hurt
  'GRAIN', 'GRAIN_HZ', 'VIGNETTE', 'VIGNETTE_START', 'VIGNETTE_ROUND', 'EDGE_LAYER', 'EDGE_BLUR_PX', 'EDGE_DEPTH', 'EDGE_PARALLAX',
  'HURT_PULSE', 'HURT_PULSE_S',
  // the cutouts: their rim, their shadows, how big they're drawn
  'RIM', 'RIM_POWER', 'RIM_WIDTH_U', 'WALL_RIM', 'CHILD_RIM', 'CHILD_SCALE', 'LAMP_SIZE', 'LAMP_GLOW', 'SHADOW', 'SHADOW_SIZE', 'BODY_SCALE', 'SHOT_GLOW', 'DANGER_GLOW', 'DANGER_SIZE',
  // the camera
  'CAMERA_FOV_DEG', 'CAMERA_TILT_RAD', 'CAMERA_MARGIN', 'CAMERA_LIFT_U',
  // the juice
  'FLASH_S', 'SQUISH', 'SQUISH_HZ', 'SQUISH_S', 'BULGE', 'BULGE_S', 'SPLAT_SIZE', 'SPLAT_S',
  'BURST_BITS', 'BURST_SPEED_U_S', 'BURST_GRAVITY_U_S2', 'BURST_S', 'SHAKE_U', 'SHAKE_S', 'KILL_SHAKE_U',
  'WOBBLE', 'WOBBLE_HZ', 'FLAP_HZ', 'SPAWN_GROW_S', 'WINDUP_SHAKE_U', 'GAPE_S', 'GAPE',
] as const;
export type LookKey = (typeof KEYS)[number];

/** The token a look key reads: `CAMERA_LIFT_U` is `--look-camera-lift-u`. */
export const lookToken = (k: string) => `--look-${k.toLowerCase().replaceAll('_', '-')}`;

/** A look token's numbers (space-separated); throws naming the token when one is missing or isn't numbers. */
function read(k: string): number[] {
  const raw = TOKENS[lookToken(k)], v = raw === undefined ? [NaN] : raw.split(/\s+/).map(Number);
  if (v.some(Number.isNaN)) throw new Error(`look: \`${lookToken(k)}\` in shared.css :root is ${raw === undefined ? 'missing' : `"${raw}", not numbers`}`);
  return v;
}

export const LOOK = Object.fromEntries(KEYS.map((k) => [k, read(k)[0]!])) as Record<LookKey, number>;
/** Where the backlight that draws the cutouts' rims comes from, x y z on screen (`--look-rim-dir`): up and behind. */
export const RIM_DIR_XYZ = read('RIM_DIR') as [number, number, number];
/** Every look key the shell reads (the catalog test checks no token goes unread). */
export const LOOK_KEYS: string[] = [...KEYS, 'RIM_DIR'];
