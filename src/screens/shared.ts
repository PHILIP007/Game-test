// Game-wide declarative-UI registrations (the only module that calls defineProp/defineElement), the screenUi factory
// every screen is made with, and binding builders for the shared prefabs so a screen's .ts stays bindings-only.
import { Container, Graphics } from 'pixi.js';
import { color, defineProp, lerpColor } from '../decl/css';
import { createUi, defineElement, use, type Use, type UiNode } from '../decl/engine';
import { weaponDef } from '../content';
import { layers, view } from '../stage';
import sharedKdl from './shared.kdl?raw';
import sharedCss from './shared.css?raw';

// ---------- properties ----------

/** Multiplies a node's colours: a `meter`'s fill is drawn white and coloured by this. */
defineProp('tint', {
  parse: color, initial: 0xffffff, lerp: lerpColor,
  apply: (n: UiNode, v: number) => { n.el.tint = v; },
});

// ---------- elements ----------

/** A bar's fill: a rect of the box's width * `value` (0..1), coloured by `tint`: `meter value=(bind)"fill"`. */
defineElement('meter', ({ value }, { w, h }) => {
  const c = new Container();
  c.addChild(new Graphics().rect(0, 0, w * Math.min(1, Math.max(0, value as number)), h).fill(0xffffff));
  return c;
});

/**
 * A row of hearts, `max` of them, the first `value` full and the rest hollow, as tall as the box and spaced across
 * it; coloured by `tint`: `hearts value=(bind)"hp" max=(bind)"max"`.
 */
defineElement('hearts', ({ value, max }, { w, h }) => {
  const c = new Container(), n = Math.max(1, max as number), full = value as number;
  const size = Math.min(h, w / n / 1.15), step = n > 1 ? (w - size) / (n - 1) : 0;
  for (let i = 0; i < n; i++) {
    const g = new Graphics(), r = size / 4, x = i * step, y = (h - size) / 2;
    // Two lobes and a point: a heart drawn in its box's top-left corner.
    g.circle(x + r, y + r * 1.25, r).circle(x + r * 3, y + r * 1.25, r)
      .poly([x, y + r * 1.5, x + size, y + r * 1.5, x + size / 2, y + size]).fill({ color: 0xffffff, alpha: i < full ? 1 : 0.22 });
    c.addChild(g);
  }
  return c;
});

// ---------- the screen factory ----------

const screens: ReturnType<typeof createUi>[] = [];

/**
 * Every screen's Ui: the shared prefabs and styles come first (a screen's own CSS wins ties). Screens draw in creation
 * order: each gets its own layer now, because the engine adds a root to its parent when it first renders, which would
 * otherwise stack a screen by when it last appeared rather than by the order the runtime imports them.
 */
export function screenUi(kdl: string, css: string) {
  const layer = new Container();
  layers.ui.addChild(layer);
  const ui = createUi(layer, sharedKdl + kdl, sharedCss + css, {
    texture: (name) => { throw new Error(`no texture atlas in this game (asked for "${name}"); draw it with a defineElement in screens/shared.ts`); },
    viewport: () => ({ width: view.width, height: view.height, touch: view.touch }),
  });
  screens.push(ui);
  let last = 'null';
  return {
    ...ui,
    reload: (k?: string, c?: string) => ui.reload(k && sharedKdl + k, c && sharedCss + c),
    /** Render when the tree differs from the last one shown (bindings compared as JSON; handlers are assumed stable per data). */
    show(u: Use | null) {
      const k = JSON.stringify(u);
      if (k === last) return;
      last = k;
      ui.render(u);
    },
  };
}

/** Steps every screen's styles and layout; true while any of them is mid-animation. */
export const tickScreens = (dt: number) => screens.reduce((busy, s) => { s.tick(dt); return s.busy() || busy; }, false);

// ---------- binding builders ----------

/** A button: `state` is space-joined classes its CSS matches on (`primary`, `off`). */
export const btn = (label: string, tap: () => void, state = '') => use('btn', { key: label, label, tap, state });

/**
 * A weapon from content/weapons.kdl. `tag` sits beside its name (its cooldown, its price), `charge` fills its bar
 * (0..1), `foot` is the line under it (buy, sell, its key). `ready` lights it up: it can be fired now. `compact` drops
 * the description (the HUD, where the play area needs the room). No `tap`: it can't be pressed.
 */
export function weapon(id: string, tap: (() => void) | undefined, opts: { key: string; tag: string; charge: number; foot: string; off?: boolean; ready?: boolean; compact?: boolean }) {
  const d = weaponDef(id);
  const state = [d.kind, opts.off && 'off', opts.ready && 'ready', opts.compact && 'compact'].filter(Boolean).join(' ');
  return use('weapon', { key: opts.key, name: d.name.toUpperCase(), tag: opts.tag, text: d.text, charge: opts.charge, foot: opts.foot, tap, state });
}

/** A stomach slot with nothing in it. */
export const emptySlot = (key: string) => use('slot-empty', { key });

/** A line of text in a dialog's body. */
export const line = (text: string) => use('line', { key: text, text });

/** A dialog over the dimmed nightmare: a title, a line under it, a body (a column of lines, or a `row` of tiles) and buttons. */
export const dialog = (title: string, sub: string, body: Use[], buttons: Use[], layout: 'column' | 'row' = 'column') =>
  use('dialog', { title, sub, layout }, { body, buttons });
