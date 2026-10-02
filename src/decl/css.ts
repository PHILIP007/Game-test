// Declarative UI, the pure half (no Pixi): a CSS subset, a property registry the game extends, the cascade,
// easing, and transition/keyframe sampling. engine.ts turns the result into Pixi.
//
// Supported: `.class`, `type`, `:pseudo` (':pressed', ':hover'), compounds (`.tile.chosen`), descendant chains,
// selector lists, `:root { --var }` + `var(--var)`, `@keyframes`, `transition`, `animation`.
// ponytail: no child/sibling combinators, :not, :nth-child or media queries. Add when a screen needs one.

export const NONE = -1; // "no colour": nothing drawn
export type Vec = [number, number];

export type PropDef<V = any> = {
  parse: (raw: string) => V;
  initial: V;
  lerp?: (a: V, b: V, t: number) => V; // absent: discrete, flips at the midpoint like CSS
  inherit?: boolean;
  /** Keyword props: the values parseCss accepts (besides `inherit`). Absent: free-form. */
  allowed?: readonly string[];
  /** Game hook, run every frame with the shown (transitioned/animated) value. */
  apply?: (node: any, v: V) => void;
};

export const PROPS: Record<string, PropDef> = {};
export const defineProp = <V>(name: string, def: PropDef<V>) => { PROPS[name] = def; };

// ---------- value parsers ----------

export const num = (raw: string) => (raw === 'auto' ? NaN : parseFloat(raw)); // px and unitless alike
/** A length: `auto` is NaN, `50%` stays the string '50%' (Yoga takes it as is), anything else is px (unitless alike). */
export const len = (raw: string): number | `${number}%` => (raw === 'auto' ? NaN : raw.endsWith('%') ? (raw as `${number}%`) : parseFloat(raw));
export const time = (raw: string) => (raw.endsWith('ms') ? parseFloat(raw) / 1000 : parseFloat(raw));
export const keyword = (raw: string) => raw;
export function color(raw: string): number {
  if (raw === 'none' || raw === 'transparent') return NONE;
  let h = raw.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h, 16);
  // ponytail: value-level errors (this and easing) are still bare and fire at cascade; route them through uiError at parse time when a screen needs it.
  if (Number.isNaN(n)) throw new Error(`bad colour: ${raw}`);
  return n;
}
/** 1–4 numbers, CSS shorthand order: top right bottom left. */
export function box(raw: string): [number, number, number, number] {
  const [t = 0, r = t, b = t, l = r] = raw.split(/\s+/).map(num);
  return [t, r, b, l];
}
/** One or two numbers: `scale: 1.1` or `scale: .9 1.1`. */
export function vec(raw: string): Vec {
  const [x = 0, y = x] = raw.split(/\s+/).map(num);
  return [x, y];
}

export const lerpNum = (a: number, b: number, t: number) => a + (b - a) * t;
export type Len = number | `${number}%`;
/** Numbers lerp, percents lerp, a mix (px to %) or an `auto` (NaN) end flips at the midpoint like an absent lerp. */
export function lerpLen(a: Len, b: Len, t: number): Len {
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) || Number.isNaN(b) ? (t < 0.5 ? a : b) : lerpNum(a, b, t);
  if (typeof a === 'string' && typeof b === 'string') return `${lerpNum(parseFloat(a), parseFloat(b), t)}%`;
  return t < 0.5 ? a : b;
}
export const lerpVec = (a: Vec, b: Vec, t: number): Vec => [lerpNum(a[0], b[0], t), lerpNum(a[1], b[1], t)];
export function lerpColor(a: number, b: number, t: number) {
  if (a === NONE || b === NONE) return t < 0.5 ? a : b;
  const ch = (s: number) => Math.round(lerpNum((a >> s) & 255, (b >> s) & 255, t)) << s;
  return ch(16) | ch(8) | ch(0);
}

// ---------- built-in properties ----------

const n = (initial: number, inherit = false): PropDef<number> => ({ parse: num, initial, lerp: lerpNum, inherit });
const ln = (initial: number): PropDef<Len> => ({ parse: len, initial, lerp: lerpLen });
const kw = (initial: string, inherit = false, allowed?: readonly string[]): PropDef<string> => ({ parse: keyword, initial, inherit, allowed });
const col = (initial: number, inherit = false): PropDef<number> => ({ parse: color, initial, lerp: lerpColor, inherit });

Object.assign(PROPS, {
  // layout (engine.ts: Yoga)
  display: kw('flex', false, ['flex', 'none']),
  position: kw('static', false, ['static', 'absolute']),
  left: ln(0), top: ln(0),
  width: ln(NaN), height: ln(NaN),
  padding: { parse: box, initial: [0, 0, 0, 0] },
  gap: n(0),
  'flex-direction': kw('column', false, ['row', 'column']),
  'justify-content': kw('flex-start', false, ['flex-start', 'center', 'flex-end', 'space-between']),
  'align-items': kw('stretch', false, ['stretch', 'flex-start', 'center', 'flex-end']),
  'flex-grow': n(0),
  'flex-wrap': kw('nowrap', false, ['nowrap', 'wrap']),
  'flex-shrink': n(0), // not CSS's 1: the dialect never shrinks unless a node asks
  'flex-basis': ln(NaN),
  // input: `auto` makes a box swallow taps (a modal scrim) without a handler; the default lets them through to what's beneath
  'pointer-events': kw('none', false, ['none', 'auto']),
  // panels
  'background-color': col(NONE),
  'border-color': col(NONE),
  'border-width': n(0),
  'panel-art': kw('none'), // "<atlas frame> <slice border>": a 9-slice from the atlas; background-color tints it
  // images
  'image-scale': n(2),
  // text (inherited, so a button's style reaches its label)
  'font-family': kw('monospace', true),
  'font-size': n(18, true),
  'font-color': col(0xffffff, true),
  'text-align': kw('left', true, ['left', 'center', 'right']),
  'text-wrap': kw('nowrap', true, ['wrap', 'nowrap']),
  'letter-spacing': n(0, true),
  'line-height': n(NaN, true),
  'text-stroke-color': col(NONE, true),
  'text-stroke-width': n(0, true),
  // transform and compositing (around the box's centre)
  opacity: n(1),
  scale: { parse: vec, initial: [1, 1], lerp: lerpVec },
  translate: { parse: vec, initial: [0, 0], lerp: lerpVec },
  rotate: { parse: (r: string) => (parseFloat(r) * Math.PI) / 180, initial: 0, lerp: lerpNum },
  // motion (parsed lazily, see transitionsOf / animationsOf)
  transition: kw('none'),
  animation: kw('none'),
} satisfies Record<string, PropDef>);

// ---------- errors ----------

/** Structural refusals (selectors, properties, vars, KDL shape) read "where: problem; fix". */
export const uiError = (where: string, problem: string, fix: string) => new Error(`${where}: ${problem}; ${fix}`);

/** The closest of `names` to `word` (Levenshtein, within max(2, a third of its length)), for "did you mean". */
export function nearest(word: string, names: Iterable<string>): string | undefined {
  let best: string | undefined, min = Math.max(2, Math.floor(word.length / 3)) + 1;
  for (const name of names) {
    let row = Array.from({ length: name.length + 1 }, (_, j) => j);
    for (let i = 1; i <= word.length; i++) {
      const prev = row;
      row = [i];
      for (let j = 1; j <= name.length; j++) row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (word[i - 1] === name[j - 1] ? 0 : 1));
    }
    if (row[name.length]! < min) { min = row[name.length]!; best = name; }
  }
  return best;
}
/** "did you mean `x`?" when something is close, else undefined so the caller's own fix shows. */
export const didYouMean = (word: string, names: Iterable<string>) => { const n = nearest(word, names); return n ? `did you mean \`${n}\`?` : undefined; };

// ---------- stylesheet ----------

type Compound = { type?: string; classes: string[] };
export type Rule = { sel: string; chain: Compound[]; spec: number; order: number; decls: Record<string, string> };
export type Keyframe = { at: number; decls: Record<string, string> };
export type Sheet = { rules: Rule[]; keyframes: Record<string, Keyframe[]> };

function decls(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of body.split(';')) {
    const i = d.indexOf(':');
    if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim();
  }
  return out;
}

const PSEUDOS = [':pressed', ':hover'];
const SUPPORTED = 'supported: descendant chains, `.class`, `type`, `:pressed` and `:hover`';

function compound(src: string, where: string): Compound {
  const m = /^([a-z][\w-]*|\*)?((?:[.:][\w-]+)*)$/.exec(src);
  if (!m) throw uiError(where, `unsupported selector \`${src}\``, SUPPORTED);
  const classes = (m[2]!.match(/[.:][\w-]+/g) ?? []).map((c) => (c[0] === '.' ? c.slice(1) : c)); // ':pressed' stays prefixed
  for (const c of classes) if (c[0] === ':' && !PSEUDOS.includes(c)) {
    throw uiError(where, `unknown pseudo-class \`${c}\``, `${didYouMean(c, PSEUDOS) ?? ''} ${SUPPORTED}`.trim());
  }
  return { type: m[1] === '*' ? undefined : m[1], classes };
}

/** Blocks as [prelude, body] pairs, one nesting level deep (enough for @keyframes). */
function blocks(src: string): [string, string][] {
  const out: [string, string][] = [];
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open < 0) break;
    let depth = 1, j = open + 1;
    for (; j < src.length && depth; j++) depth += src[j] === '{' ? 1 : src[j] === '}' ? -1 : 0;
    out.push([src.slice(i, open).trim(), src.slice(open + 1, j - 1)]);
    i = j;
  }
  return out;
}

/** Refuse selector syntax the matcher doesn't implement, naming what does work. */
function checkSelector(sel: string, where: string) {
  const no = (what: string, fix = SUPPORTED) => { throw uiError(where, `${what} isn't supported`, fix); };
  if (sel.includes(':not(')) no('`:not(...)`', `style the default and override on the class; ${SUPPORTED}`);
  if (sel.includes('(')) no('a functional pseudo-class');
  if (/[>+~]/.test(sel)) no('a child or sibling combinator (`>` `+` `~`)');
  if (sel.includes('#')) no('an `#id` selector');
  if (sel.includes('[')) no('an `[attr]` selector');
}

function checkProp(name: string, where: string) {
  if (name in PROPS) return;
  throw uiError(where, `\`${name}\` isn't a property`, name === 'color' ? 'use `font-color` (text) or `background-color` (fills)'
    : didYouMean(name, Object.keys(PROPS)) ?? 'register it with defineProp before createUi');
}

/** `runtime` variables (e.g. `--touch-size`) are applied after `:root`, so they win. */
export function parseCss(src: string, runtime: Record<string, string> = {}): Sheet {
  src = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const vars: Record<string, string> = {};
  const raw = blocks(src);
  for (const [pre, body] of raw) if (pre === ':root') Object.assign(vars, decls(body));
  Object.assign(vars, runtime);
  // `max(56px, var(--touch-size))`: folds after var() substitution; only px numbers can be compared.
  const fold = (v: string, where: string) => v.replace(/\bmax\(([^()]*)\)/g, (_, args: string) => {
    const nums = args.split(',').map((a) => a.trim());
    const bad = nums.find((a) => !/^-?[\d.]+(px)?$/.test(a));
    if (bad !== undefined) throw uiError(where, `\`max()\` argument \`${bad}\` isn't a px number`, 'use px values or var()s that resolve to px');
    return `${Math.max(...nums.map(parseFloat))}px`;
  });
  const sub = (v: string, where: string) => fold(v.replace(/var\((--[\w-]+)\)/g, (_, k: string) => {
    if (k in vars) return vars[k]!;
    throw uiError(where, `undefined \`${k}\``, didYouMean(k, Object.keys(vars)) ?? 'define it in :root');
  }), where);
  const subAll = (d: Record<string, string>, where: string) => Object.fromEntries(Object.entries(d).map(([k, v]) => {
    checkProp(k, where);
    v = sub(v, where);
    const allowed = PROPS[k]!.allowed;
    if (allowed && v !== 'inherit' && !allowed.includes(v)) throw uiError(where, `\`${v}\` isn't a \`${k}\` value`, didYouMean(v, allowed) ?? `use one of: ${allowed.join(', ')}`);
    if (k === 'transition' && v !== 'none') for (const item of list(v)) if (words(item)[0] !== 'all') checkProp(words(item)[0]!, `${where} transition`);
    return [k, v];
  }));

  const sheet: Sheet = { rules: [], keyframes: {} };
  for (const [pre, body] of raw) {
    if (pre === ':root') continue;
    if (pre.startsWith('@keyframes')) {
      const name = pre.split(/\s+/)[1]!;
      sheet.keyframes[name] = blocks(body).flatMap(([at, b]) => at.split(',').map((a) => {
        a = a.trim();
        return { at: a === 'from' ? 0 : a === 'to' ? 1 : parseFloat(a) / 100, decls: subAll(decls(b), `@keyframes ${name}`) };
      })).sort((a, b) => a.at - b.at);
      continue;
    }
    for (const sel of pre.split(',')) {
      const where = `rule "${sel.trim()}"`;
      checkSelector(sel, where);
      const chain = sel.trim().split(/\s+/).map((c) => compound(c, where));
      const spec = chain.reduce((s, c) => s + c.classes.length * 10 + (c.type ? 1 : 0), 0);
      sheet.rules.push({ sel: sel.trim(), chain, spec, order: sheet.rules.length, decls: subAll(decls(body), where) });
    }
  }
  sheet.rules.sort((a, b) => a.spec - b.spec || a.order - b.order); // cascade order: later wins
  return sheet;
}

// ---------- cascade ----------

/** What selectors see of a node. */
export type Styleable = { type: string; classes: Set<string>; parent?: Styleable };

const hit = (c: Compound, n: Styleable) => (!c.type || c.type === n.type) && c.classes.every((k) => n.classes.has(k));

export function matches(chain: Compound[], n: Styleable): boolean {
  if (!hit(chain[chain.length - 1]!, n)) return false;
  let i = chain.length - 2;
  for (let a = n.parent; a && i >= 0; a = a.parent) if (hit(chain[i]!, a)) i--;
  return i < 0;
}

/** Computed values for every registered property: matched rules, else inherited, else initial. */
export function cascade(sheet: Sheet, n: Styleable, parent?: Record<string, any>): Record<string, any> {
  const won: Record<string, string> = {};
  for (const r of sheet.rules) if (matches(r.chain, n)) Object.assign(won, r.decls);
  const out: Record<string, any> = {};
  for (const [p, def] of Object.entries(PROPS)) {
    const v = won[p];
    out[p] = v !== undefined && v !== 'inherit' ? def.parse(v) : (def.inherit || v === 'inherit') && parent ? parent[p] : def.initial;
  }
  return out;
}

// ---------- easing ----------

function bezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x: number) => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (at(x1, x2, m) < x) lo = m; else hi = m; }
    return at(y1, y2, (lo + hi) / 2);
  };
}
const NAMED: Record<string, [number, number, number, number]> = {
  ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1],
};
export function easing(raw = 'ease'): (t: number) => number {
  if (raw === 'linear') return (t) => t;
  const steps = /^steps\((\d+)(?:,\s*(start|end))?\)$/.exec(raw);
  if (steps) {
    const k = +steps[1]!, start = steps[2] === 'start';
    return (t) => Math.min(1, (start ? Math.ceil(t * k) : Math.floor(t * k)) / k);
  }
  const cb = /^cubic-bezier\(([^)]+)\)$/.exec(raw);
  const p = cb ? (cb[1]!.split(',').map(Number) as [number, number, number, number]) : NAMED[raw];
  // ponytail: bare and late, see color().
  if (!p) throw new Error(`unknown easing: ${raw}`);
  return bezier(...p);
}
const isEasing = (w: string) => w in NAMED || w === 'linear' || /^(steps|cubic-bezier)\(/.test(w);
const isTime = (w: string) => /^[\d.]+m?s$/.test(w);
/** Split on commas that aren't inside parentheses. */
const list = (raw: string) => raw.split(/,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean);
const words = (raw: string): string[] => raw.match(/[\w.-]+\([^)]*\)|\S+/g) ?? [];

// ---------- transitions ----------

export type TransitionSpec = { prop: string; dur: number; delay: number; ease: (t: number) => number };
const tCache = new Map<string, TransitionSpec[]>();
export function transitionsOf(raw: string): TransitionSpec[] {
  if (raw === 'none') return [];
  let out = tCache.get(raw);
  if (!out) {
    out = list(raw).map((item) => {
      const w = words(item), times = w.filter(isTime).map(time);
      return { prop: w[0]!, dur: times[0] ?? 0, delay: times[1] ?? 0, ease: easing(w.find(isEasing)) };
    });
    tCache.set(raw, out);
  }
  return out;
}

// ---------- keyframe animations ----------

export type AnimSpec = {
  name: string; dur: number; delay: number; ease: (t: number) => number;
  count: number; alternate: boolean; fill: 'none' | 'forwards' | 'backwards' | 'both';
};
const aCache = new Map<string, AnimSpec[]>();
export function animationsOf(raw: string): AnimSpec[] {
  if (raw === 'none') return [];
  let out = aCache.get(raw);
  if (!out) {
    out = list(raw).map((item) => {
      const w = words(item), times = w.filter(isTime).map(time);
      const count = w.includes('infinite') ? Infinity : +(w.find((x) => /^\d+(\.\d+)?$/.test(x)) ?? 1);
      const fill = (['forwards', 'backwards', 'both'] as const).find((f) => w.includes(f)) ?? 'none';
      const name = w.find((x) => !isTime(x) && !isEasing(x) && !/^\d/.test(x) && !['infinite', 'alternate', fill].includes(x))!;
      return { name, dur: times[0] ?? 0, delay: times[1] ?? 0, ease: easing(w.find(isEasing)), count, alternate: w.includes('alternate'), fill };
    });
    aCache.set(raw, out);
  }
  return out;
}

/** Progress through one iteration (0..1), or null when the animation has no effect at this moment. */
export function progress(a: AnimSpec, elapsed: number): number | null {
  const t = elapsed - a.delay;
  if (t < 0) return a.fill === 'backwards' || a.fill === 'both' ? 0 : null;
  const iter = a.dur > 0 ? t / a.dur : Infinity;
  if (iter >= a.count) {
    if (a.fill !== 'forwards' && a.fill !== 'both') return null;
    const last = a.count % 1 || 1, i = Math.ceil(a.count) - 1;
    return a.alternate && i % 2 ? 1 - last : last;
  }
  const i = Math.floor(iter), p = iter - i;
  return a.alternate && i % 2 ? 1 - p : p;
}

/** A property's value at progress p. Stops that don't name the property fall back to `base` at 0% and 100%. */
export function sample(frames: Keyframe[], prop: string, base: any, p: number, ease: (t: number) => number): any {
  const def = PROPS[prop]!;
  const stops = frames.filter((f) => prop in f.decls).map((f) => ({ at: f.at, v: def.parse(f.decls[prop]!) }));
  if (!stops.length) return base;
  if (stops[0]!.at > 0) stops.unshift({ at: 0, v: base });
  if (stops[stops.length - 1]!.at < 1) stops.push({ at: 1, v: base });
  let i = 0;
  while (i < stops.length - 2 && p > stops[i + 1]!.at) i++;
  const a = stops[i]!, b = stops[i + 1]!;
  const k = ease(b.at > a.at ? (p - a.at) / (b.at - a.at) : 1);
  return def.lerp ? def.lerp(a.v, b.v, k) : k < 0.5 ? a.v : b.v;
}

export const same = (a: unknown, b: unknown) =>
  a === b || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i])) || (Number.isNaN(a) && Number.isNaN(b));
