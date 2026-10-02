// Look numbers: how bright the frame is, how strong the lights, where the camera sits. They live as `--look-*` tokens
// in screens/shared.css :root beside the palette, so the render is tuned in the stylesheet; this is the typed view the
// shell reads (`--look-camera-dist-u` is `LOOK.CAMERA_DIST_U`). Catalog: ## Look.
import { TOKENS } from '../tokens';

const KEYS = ['EXPOSURE', 'KEY_LIGHT', 'FILL_LIGHT', 'CAMERA_FOV_DEG', 'CAMERA_DIST_U', 'CAMERA_TILT_RAD'] as const;
export type LookKey = (typeof KEYS)[number];

/** The token a look key reads: `CAMERA_DIST_U` is `--look-camera-dist-u`. */
export const lookToken = (k: string) => `--look-${k.toLowerCase().replaceAll('_', '-')}`;

/** A look token's numbers (space-separated); throws naming the token when one is missing or isn't numbers. */
function read(k: string): number[] {
  const raw = TOKENS[lookToken(k)], v = raw === undefined ? [NaN] : raw.split(/\s+/).map(Number);
  if (v.some(Number.isNaN)) throw new Error(`look: \`${lookToken(k)}\` in shared.css :root is ${raw === undefined ? 'missing' : `"${raw}", not numbers`}`);
  return v;
}

export const LOOK = Object.fromEntries(KEYS.map((k) => [k, read(k)[0]!])) as Record<LookKey, number>;
/** Towards the key light, x y z (`--look-key-dir`). */
export const KEY_DIR_XYZ = read('KEY_DIR') as [number, number, number];
/** Every look key the shell reads (the catalog test checks no token goes unread). */
export const LOOK_KEYS: string[] = [...KEYS, 'KEY_DIR'];
