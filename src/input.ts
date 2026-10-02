// The pilot's controls: keys held and where the cursor is. This is per-frame scratch, so it lives here, not in a
// store; each step the runtime reads it once (`readInput`) and hands it to the core. Weapon keys and the pause key
// call actions directly. Which key does what is the tables below. While the cursor is over a tappable tile (to
// click a weapon) the aim holds where it was, so calling a weapon doesn't swing it at the HUD.
import * as Actions from './actions';
import type { Input, Vec } from './game';

/** Movement keys: game +y is towards the bottom of the screen. */
const MOVE: Record<string, Vec> = {
  KeyW: { x: 0, y: -1 }, ArrowUp: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 }, ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 }, ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 }, ArrowRight: { x: 1, y: 0 },
};
/** Weapon keys: the key's number is the mount's, left to right (mount 1 fires by itself, so it has none). */
const WEAPON_KEYS: Record<string, number> = { Digit2: 1, Digit3: 2, Digit4: 3, Numpad2: 1, Numpad3: 2, Numpad4: 3 };
const PAUSE_KEYS = ['Escape', 'KeyP'];

const held = new Set<string>();
let pointer: { x: number; y: number } | null = null;
let toWorld: (clientX: number, clientY: number) => Vec | null = () => null;
let overUi: (clientX: number, clientY: number) => boolean = () => false;
let lastAim: Vec = { x: 1, y: 0 };

/** The controls this frame: the held keys as a direction, and the world point under the cursor. */
export function readInput(): Input {
  const move = { x: 0, y: 0 };
  for (const k of held) { const d = MOVE[k]; if (d) { move.x += d.x; move.y += d.y; } }
  const aim = pointer && !overUi(pointer.x, pointer.y) && toWorld(pointer.x, pointer.y);
  if (aim) lastAim = aim;
  return { move, aim: lastAim };
}

/**
 * Listen on the window; `project` turns a cursor position into a point on the arena floor, `onUi` says when the
 * cursor is over something tappable. Returns the disposer.
 */
export function listenInput(project: typeof toWorld, onUi: typeof overUi) {
  toWorld = project;
  overUi = onUi;
  const down = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.code in WEAPON_KEYS) Actions.fireWeapon(WEAPON_KEYS[e.code]!);
    else if (PAUSE_KEYS.includes(e.code)) Actions.togglePause();
    else if (!(e.code in MOVE)) return;
    held.add(e.code);
    e.preventDefault();
  };
  const up = (e: KeyboardEvent) => { held.delete(e.code); };
  const move = (e: PointerEvent) => { pointer = { x: e.clientX, y: e.clientY }; };
  const blur = () => held.clear();
  addEventListener('keydown', down);
  addEventListener('keyup', up);
  addEventListener('pointermove', move);
  addEventListener('pointerdown', move);
  addEventListener('blur', blur);
  return () => {
    removeEventListener('keydown', down); removeEventListener('keyup', up);
    removeEventListener('pointermove', move); removeEventListener('pointerdown', move); removeEventListener('blur', blur);
    held.clear();
  };
}
