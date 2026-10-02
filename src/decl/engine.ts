// Declarative UI, the Pixi half: KDL prefabs expand into an element tree, a keyed reconcile keeps Pixi objects alive
// across renders (so transitions have something to move from), Yoga lays them out, and tick() runs the
// cascade, transitions and keyframes every frame. css.ts is the pure half.
//
// KDL, Atlas-style:
//   prefab "hero-tile" {
//       panel class="tile" bind-class="state" tap="pick" key=(bind)"cls" {
//           sprite texture="icon" class="lock"       // literal property
//           text bind="name" class="tile-name"       // bound property
//           text "Hello"                             // literal text
//           panel slot="rows"                        // children come from use(..., slots)
//           text if="daily" "..."                    // only when the binding is truthy ("!daily" negates)
//       }
//   }
import { Container, Graphics, NineSliceSprite, Rectangle, Sprite, Text, type Texture } from 'pixi.js';
import Yoga, { Align, Direction, Display, Edge, FlexDirection, Gutter, Justify, MeasureMode, PositionType, Wrap, type Node as YogaNode } from 'yoga-layout';
import { parse as parseKdl, type Node as KdlNode } from 'kdljs';
import { animationsOf, cascade, NONE, didYouMean, nearest, parseCss, progress, PROPS, same, sample, transitionsOf, uiError, type AnimSpec, type Len, type Sheet } from './css';

// No pixel rounding: draw() rounds positions itself.
const yogaConfig = Yoga.Config.create();
yogaConfig.setPointScaleFactor(0);

export type Bindings = Record<string, unknown>;
/** A prefab instance to render: `use('hero-tile', { cls, name, pick }, { slotName: [...] })`. */
export type Use = { prefab: string; bindings: Bindings; slots: Record<string, Use[]> };
export const use = (prefab: string, bindings: Bindings = {}, slots: Record<string, Use[]> = {}): Use => ({ prefab, bindings, slots });

type El = { type: string; key: string; classes: string[]; text?: string; texture?: string; tap?: () => void; props: Bindings; children: El[] };

/** Element types beyond panel/button/text/sprite: a factory from bound props and the laid-out CSS box to a Pixi object. */
type Make = (props: Bindings, size: { w: number; h: number }) => Container;
const ELEMENTS: Record<string, Make> = {};
export const defineElement = (type: string, make: Make) => { ELEMENTS[type] = make; };

const BUILTIN = ['panel', 'button', 'text', 'sprite'];
const ATTRS = ['class', 'bind', 'bind-class', 'tap', 'key', 'slot', 'if', 'texture'];

export class UiNode {
  classes = new Set<string>();
  children: UiNode[] = [];
  computed: Record<string, any> = {}; // cascade targets
  shown: Record<string, any> = {}; // after transitions and keyframes: what's drawn
  tweens: Record<string, { from: any; t: number; dur: number; delay: number; ease: (t: number) => number }> = {};
  anims: { spec: AnimSpec; t: number }[] = [];
  box = { x: 0, y: 0, w: 0, h: 0 }; // relative to the parent's box
  text?: string;
  texture?: string;
  tap?: () => void;
  props: Bindings = {};
  bg?: Graphics;
  art?: NineSliceSprite;
  private propsKey = '';

  constructor(public type: string, public key: string, public el: Container, public parent?: UiNode) {}

  /** Custom elements rebuild when their bound props or their laid-out size change, so the factory can size its art to the box. */
  syncCustom() {
    const { w, h } = this.box, k = JSON.stringify([this.props, w, h]);
    if (k === this.propsKey) return;
    this.propsKey = k;
    this.el.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.el.addChild(ELEMENTS[this.type]!(this.props, { w, h }));
  }
}

export type UiOptions = {
  texture: (name: string) => Texture;
  onTap?: () => void; // e.g. the click sound
  /** The live viewport in design px, read every tick: the root lays out inside a box of exactly this size (so `100%` fills it), and `touch` is `var(--touch-size)`. */
  viewport?: () => { width: number; height: number; touch: number };
};

export function createUi(parent: Container, kdl: string, css: string, opts: UiOptions) {
  const at = (prefab: string, k: KdlNode) => `prefab "${prefab}" > ${k.name}${String(k.properties.class ?? '').split(/\s+/).filter(Boolean).map((c) => `.${c}`).join('')}`;
  let touch = opts.viewport?.().touch;
  // Parse and check both sources; throws a uiError, touching nothing.
  const compile = (kdlSrc: string, cssSrc: string) => {
    const { output, errors } = parseKdl(kdlSrc);
    if (errors.length || !output) throw uiError('KDL', errors.map((e) => e.message).join('; '), 'fix the syntax');
    for (const n of output) {
      if (n.name !== 'prefab') throw uiError('KDL', `top-level \`${n.name}\` isn't a prefab`, 'wrap it in prefab "name" { ... }');
      if (typeof n.values[0] !== 'string') throw uiError('KDL', 'a prefab has no name', 'write prefab "name" { ... }');
    }
    const prefabs: Record<string, KdlNode[]> = Object.fromEntries(output.map((n) => [String(n.values[0]), n.children]));
    const sheet: Sheet = parseCss(cssSrc, touch === undefined ? {} : { '--touch-size': `${touch}px` });
    const types = [...BUILTIN, ...Object.keys(ELEMENTS)]; // custom elements must be registered before createUi
    const register = 'register it with defineElement before createUi';

    // Everything checkable without data is checked here, before any render.
    const validate = (prefab: string, k: KdlNode) => {
      if (!types.includes(k.name)) throw uiError(at(prefab, k), `unknown element \`${k.name}\``, didYouMean(k.name, types) ?? register);
      if (BUILTIN.includes(k.name)) {
        for (const a of Object.keys(k.properties)) {
          if (!ATTRS.includes(a)) throw uiError(at(prefab, k), `unknown attribute \`${a}\``, didYouMean(a, ATTRS) ?? 'custom attributes need a defineElement type');
        }
      }
      // text, sprite and custom elements are leaves: layout has nowhere to put their children
      if (k.name !== 'panel' && k.name !== 'button' && (k.children.length || k.properties.slot !== undefined)) throw uiError(at(prefab, k), `\`${k.name}\` can't have children`, 'wrap them in a panel');
      k.children.forEach((c) => validate(prefab, c));
    };
    for (const [name, body] of Object.entries(prefabs)) body.forEach((k) => validate(name, k));
    for (const r of sheet.rules) {
      for (const c of r.chain) {
        if (c.type && !types.includes(c.type)) throw uiError(`rule "${r.sel}"`, `unknown element type \`${c.type}\``, didYouMean(c.type, types) ?? register);
      }
    }
    return { prefabs, sheet };
  };
  let src = { kdl, css }; // the sources currently in effect
  let { prefabs, sheet } = compile(src.kdl, src.css);
  let last: Use | null = null;
  let root: UiNode | undefined;
  let dirty = false;

  // ---------- expand: prefab instances → element tree ----------

  function expand(u: Use): El[] {
    const body = prefabs[u.prefab];
    if (!body) throw uiError(`use('${u.prefab}')`, `no prefab "${u.prefab}"`, didYouMean(u.prefab, Object.keys(prefabs)) ?? `defined: ${Object.keys(prefabs).join(', ')}`);
    const els = body.flatMap((k, i) => element(k, u, i));
    if (u.bindings.key !== undefined) els.forEach((e) => { e.key = `${u.prefab}:${String(u.bindings.key)}`; });
    return els;
  }

  function element(k: KdlNode, u: Use, index: number): El[] {
    const b = u.bindings, p = k.properties;
    const where = at(u.prefab, k);
    const get = (name: string) => {
      if (!(name in b)) {
        const near = nearest(name, Object.keys(b));
        throw uiError(where, `no binding \`${name}\``, `${near ? `got \`${near}\` — rename it to \`${name}\`, or pass` : 'pass'} \`${name}\` in use('${u.prefab}', …), or \`${name}: undefined\` if it's optional`);
      }
      return b[name];
    };
    const val = (name: string) => (k.tags.properties[name] === 'bind' ? get(String(p[name])) : p[name]);
    if (p.if !== undefined) {
      const want = String(p.if), neg = want.startsWith('!');
      if (!b[neg ? want.slice(1) : want] === !neg) return [];
    }
    const props: Bindings = {};
    for (const name of Object.keys(p)) if (!ATTRS.includes(name)) props[name] = val(name);
    const bound = p.bind !== undefined ? get(String(p.bind)) : k.values[0];
    const slot = p.slot !== undefined ? String(p.slot) : undefined;
    if (slot !== undefined && !(slot in u.slots)) throw uiError(where, `no slot \`${slot}\``, `pass slots.${slot} in use('${u.prefab}', …, { ${slot}: [...] }), [] for none`);
    const children = slot !== undefined ? u.slots[slot]!.flatMap(expand) : k.children.flatMap((c, i) => element(c, u, i));
    return [{
      type: k.name,
      key: p.key !== undefined ? String(val('key')) : `${k.name}${index}`,
      classes: [...String(p.class ?? '').split(/\s+/), ...(p['bind-class'] ? String(get(String(p['bind-class'])) ?? '').split(/\s+/) : [])].filter(Boolean),
      text: bound === undefined ? undefined : String(bound),
      texture: p.texture !== undefined ? String(p.texture) : k.name === 'sprite' && bound !== undefined ? String(bound) : undefined,
      tap: p.tap !== undefined ? (get(String(p.tap)) as () => void) : undefined,
      props,
      children,
    }];
  }

  // ---------- reconcile: element tree → retained Pixi nodes ----------

  function create(e: El, parentNode?: UiNode): UiNode {
    let el: Container;
    if (e.type === 'text') el = new Text({ text: '', resolution: 2 });
    else if (e.type === 'sprite') { el = new Sprite(opts.texture(e.texture!)); (el as Sprite).roundPixels = true; }
    else el = new Container();
    const n = new UiNode(e.type, e.key, el, parentNode);
    if (e.type === 'panel' || e.type === 'button') el.addChild((n.bg = new Graphics()));
    el.eventMode = 'passive';
    return n;
  }

  function reconcile(n: UiNode, e: El) {
    const classes = new Set(e.classes);
    for (const c of n.classes) if (c.startsWith(':')) classes.add(c); // pseudo-classes survive a re-render
    if (!same([...classes].sort(), [...n.classes].sort())) { n.classes = classes; dirty = true; }
    n.text = e.text;
    n.props = e.props;
    if (e.texture !== n.texture) { n.texture = e.texture; if (n.el instanceof Sprite && e.texture) n.el.texture = opts.texture(e.texture); }
    if (!!n.tap !== !!e.tap) wireTap(n, !!e.tap);
    n.tap = e.tap;

    const old = new Map<string, UiNode[]>(); // repeated type+key (unkeyed siblings of one prefab) match in order
    for (const c of n.children) { const id = `${c.type}|${c.key}`; const l = old.get(id); if (l) l.push(c); else old.set(id, [c]); }
    const next = e.children.map((ce) => {
      let c = old.get(`${ce.type}|${ce.key}`)?.shift();
      if (!c) { c = create(ce, n); dirty = true; }
      reconcile(c, ce);
      return c;
    });
    for (const gone of [...old.values()].flat()) gone.el.destroy({ children: true });
    n.children = next;
    const first = (n.bg ? 1 : 0) + (n.art ? 1 : 0); // the panel's own background and art stay underneath
    next.forEach((c, i) => n.el.addChildAt(c.el, Math.min(first + i, n.el.children.length)));
  }

  function wireTap(n: UiNode, on: boolean) {
    const el = n.el;
    el.removeAllListeners();
    el.eventMode = on ? 'static' : 'passive';
    el.cursor = on ? 'pointer' : 'auto';
    if (!on) return;
    const pseudo = (c: string, add: boolean) => { if (n.classes.has(c) !== add) { add ? n.classes.add(c) : n.classes.delete(c); dirty = true; } };
    el.on('pointerdown', () => pseudo(':pressed', true));
    el.on('pointerup', () => pseudo(':pressed', false));
    el.on('pointerupoutside', () => pseudo(':pressed', false));
    el.on('pointerover', () => pseudo(':hover', true));
    el.on('pointerout', () => { pseudo(':hover', false); pseudo(':pressed', false); });
    el.on('pointertap', (ev) => { ev.stopPropagation(); pseudo(':pressed', false); opts.onTap?.(); n.tap?.(); });
  }

  // ---------- style: cascade, transitions, keyframes ----------

  function restyle(n: UiNode, parentComputed?: Record<string, any>) {
    const fresh = !Object.keys(n.computed).length;
    const next = cascade(sheet, n, parentComputed);
    if (!fresh) {
      for (const tr of transitionsOf(next.transition)) {
        for (const p of tr.prop === 'all' ? Object.keys(PROPS) : [tr.prop]) {
          if (same(n.computed[p], next[p]) || tr.dur <= 0) continue;
          n.tweens[p] = { from: n.shown[p] ?? n.computed[p], t: 0, dur: tr.dur, delay: tr.delay, ease: tr.ease };
        }
      }
    }
    // Animations start when their name appears and keep running while it stays (CSS semantics).
    const specs = animationsOf(next.animation);
    n.anims = specs.map((spec) => ({ spec, t: n.anims.find((a) => a.spec.name === spec.name)?.t ?? 0 }));
    n.computed = next;
    for (const c of n.children) restyle(c, next);
  }

  function animate(n: UiNode, dt: number) {
    const shown: Record<string, any> = { ...n.computed };
    for (const [p, tw] of Object.entries(n.tweens)) {
      tw.t += dt;
      const k = Math.min(1, Math.max(0, (tw.t - tw.delay) / tw.dur)), e = tw.ease(k), def = PROPS[p]!;
      shown[p] = def.lerp ? def.lerp(tw.from, n.computed[p], e) : e < 0.5 ? tw.from : n.computed[p];
      if (k >= 1) delete n.tweens[p];
    }
    for (const a of n.anims) {
      a.t += dt;
      const frames = sheet.keyframes[a.spec.name];
      const p = frames ? progress(a.spec, a.t) : null;
      if (!frames || p === null) continue;
      const names = new Set(frames.flatMap((f) => Object.keys(f.decls)));
      for (const prop of names) if (PROPS[prop]) shown[prop] = sample(frames, prop, shown[prop], p, a.spec.ease);
    }
    n.shown = shown;
    for (const c of n.children) animate(c, dt);
  }

  // ---------- layout: Yoga as a pure box solver ----------

  function styleText(n: UiNode, availW: number) {
    const s = n.shown, t = n.el as Text;
    if (t.text !== (n.text ?? '')) t.text = n.text ?? '';
    const wrap = s['text-wrap'] === 'wrap';
    const want = {
      fontFamily: s['font-family'], fontSize: s['font-size'], fill: s['font-color'], align: s['text-align'],
      letterSpacing: s['letter-spacing'], lineHeight: Number.isNaN(s['line-height']) ? undefined : s['line-height'],
      wordWrap: wrap, // the width is only part of the style (and its cache key) when it can change the result
      ...(wrap && { wordWrapWidth: Math.max(1, availW) }),
      stroke: s['text-stroke-color'] === NONE ? undefined : { color: s['text-stroke-color'], width: s['text-stroke-width'], join: 'miter' as const },
    };
    const k = JSON.stringify(want);
    if ((t as Text & { _k?: string })._k !== k) { Object.assign(t.style, want); (t as Text & { _k?: string })._k = k; }
  }

  const yogaLen = (v: Len) => (v === v ? v : undefined); // NaN (auto) is Yoga's undefined
  // Yoga's "no width limit" for a text measure; wide enough that nothing wraps, small enough to stay finite.
  const UNBOUNDED_PX = 1e6;
  const JUSTIFY: Record<string, Justify> = { 'flex-start': Justify.FlexStart, center: Justify.Center, 'flex-end': Justify.FlexEnd, 'space-between': Justify.SpaceBetween };
  const WRAP: Record<string, Wrap> = { nowrap: Wrap.NoWrap, wrap: Wrap.Wrap };
  const ALIGN: Record<string, Align> = { stretch: Align.Stretch, 'flex-start': Align.FlexStart, center: Align.Center, 'flex-end': Align.FlexEnd };

  /** One Yoga node per UiNode. A hidden node keeps its Yoga node (Display.None, size 0) but not its subtree. */
  function toYoga(n: UiNode, nodes: Map<UiNode, YogaNode>, measured: Set<UiNode>, isRoot = false): YogaNode {
    const s = n.shown, y = Yoga.Node.create(yogaConfig);
    nodes.set(n, y);
    if (s.display === 'none') { y.setDisplay(Display.None); return y; }
    y.setWidth(yogaLen(s.width));
    y.setHeight(yogaLen(s.height));
    // Yoga 3's Static changes the containing block of absolute descendants; ours are always relative to their parent.
    if (!isRoot && s.position === 'absolute') { y.setPositionType(PositionType.Absolute); y.setPosition(Edge.Left, yogaLen(s.left)); y.setPosition(Edge.Top, yogaLen(s.top)); }
    if (n.type === 'text') {
      y.setMeasureFunc((w, wm) => { styleText(n, wm === MeasureMode.Undefined ? UNBOUNDED_PX : w); measured.add(n); const b = n.el.getLocalBounds(); return { width: b.width, height: b.height }; });
    } else if (n.type === 'sprite') {
      const f = (n.el as Sprite).texture.frame;
      y.setMeasureFunc(() => ({ width: f.width * s['image-scale'], height: f.height * s['image-scale'] }));
    } else if (!ELEMENTS[n.type]) {
      const [pt, pr, pb, pl] = s.padding as number[];
      y.setPadding(Edge.Top, pt!); y.setPadding(Edge.Right, pr!); y.setPadding(Edge.Bottom, pb!); y.setPadding(Edge.Left, pl!);
      y.setGap(Gutter.All, s.gap);
      y.setFlexWrap(WRAP[s['flex-wrap']]!);
      y.setFlexDirection(s['flex-direction'] === 'row' ? FlexDirection.Row : FlexDirection.Column);
      y.setJustifyContent(JUSTIFY[s['justify-content']]!);
      y.setAlignItems(ALIGN[s['align-items']]!);
      n.children.forEach((c, i) => y.insertChild(toYoga(c, nodes, measured), i));
    }
    y.setFlexGrow(s['flex-grow']);
    y.setFlexShrink(s['flex-shrink']);
    y.setFlexBasis(yogaLen(s['flex-basis']));
    return y;
  }

  function fromYoga(n: UiNode, nodes: Map<UiNode, YogaNode>, measured: Set<UiNode>) {
    const { left, top, width, height } = nodes.get(n)!.getComputedLayout();
    n.box = { x: left, y: top, w: width, h: height };
    if (n.shown.display === 'none') return;
    // Yoga skips the measure func when both sizes are explicit; the text still needs its content and style.
    if (n.type === 'text' && !measured.has(n)) styleText(n, width);
    for (const c of n.children) fromYoga(c, nodes, measured);
  }

  function layout(n: UiNode, v?: { width: number; height: number }) {
    const { left, top: t } = n.shown; // the root's own offset: px only, a percent has no parent box to resolve against
    if (typeof left !== 'number' || typeof t !== 'number') throw uiError(`root ${n.type}${[...n.classes].filter((c) => c[0] !== ':').map((c) => `.${c}`).join('')}`, "its left/top can't be a percent", "the root's left/top are px offsets; position a panel inside it instead");
    // ponytail: the Yoga tree is rebuilt every tick; keep nodes on UiNode if profiling says so (roughly past a few thousand nodes per frame)
    const nodes = new Map<UiNode, YogaNode>(), measured = new Set<UiNode>(), y = toYoga(n, nodes, measured, true);
    // With a viewport the root sits in a box of exactly that size, so its percentages and flex-grow resolve against it.
    const top = v ? Yoga.Node.create(yogaConfig) : y;
    try {
      if (v) { top.setWidth(v.width); top.setHeight(v.height); top.setAlignItems(Align.FlexStart); top.insertChild(y, 0); }
      top.calculateLayout(undefined, undefined, Direction.LTR); // without a viewport the root's own width/height are already on its node
      fromYoga(n, nodes, measured);
    } finally {
      top.freeRecursive();
    }
    n.box.x = left; n.box.y = t;
  }

  // ---------- draw ----------

  function draw(n: UiNode) {
    const s = n.shown, { x, y, w, h } = n.box, el = n.el;
    el.visible = s.display !== 'none';
    if (!el.visible) return;
    if (ELEMENTS[n.type]) n.syncCustom(); // after layout: the factory needs the box
    if (n.bg) {
      const art = s['panel-art']; // "<atlas frame> <slice border>", e.g. "ui-btn 5"
      if (art !== 'none') {
        const [frame, border = '5'] = art.split(/\s+/), b = +border;
        if (!n.art) { n.art = new NineSliceSprite({ texture: opts.texture(frame), leftWidth: b, rightWidth: b, topHeight: b, bottomHeight: b }); n.art.scale.set(2); el.addChildAt(n.art, 1); }
        n.art.width = w / 2; n.art.height = h / 2; // art is 1x, drawn at 2x like the rest of the game
        n.art.tint = s['background-color'] === NONE ? 0xffffff : s['background-color'];
      }
      n.bg.clear(); // ponytail: redrawn every frame; cache by style if a screen gets big
      if (art === 'none' && s['background-color'] !== NONE) n.bg.rect(0, 0, w, h).fill(s['background-color']);
      if (s['border-color'] !== NONE && s['border-width'] > 0) n.bg.rect(0, 0, w, h).stroke({ width: s['border-width'], color: s['border-color'], alignment: 1 });
    }
    let cw = w, ch = h, ox = 0;
    if (n.type === 'text' || n.type === 'sprite') {
      if (n.type === 'sprite') el.scale.set(s['image-scale'] * s.scale[0], s['image-scale'] * s.scale[1]);
      const lb = n.type === 'text' ? el.getLocalBounds() : { width: w / s['image-scale'], height: h / s['image-scale'] };
      cw = lb.width; ch = lb.height;
      if (n.type === 'text') ox = s['text-align'] === 'center' ? (w - cw) / 2 : s['text-align'] === 'right' ? w - cw : 0;
    }
    if (n.type !== 'sprite') el.scale.set(s.scale[0], s.scale[1]);
    el.pivot.set(cw / 2, ch / 2);
    el.position.set(Math.round(x + ox + (n.type === 'text' ? cw : w) / 2 + s.translate[0]), Math.round(y + h / 2 + s.translate[1]));
    if (n.type === 'text') el.position.y = Math.round(y + ch / 2 + s.translate[1]);
    el.rotation = s.rotate;
    el.alpha = s.opacity;
    const catches = s['pointer-events'] === 'auto';
    if (!n.tap) el.eventMode = catches ? 'static' : 'passive'; // wireTap owns tappable nodes
    el.hitArea = n.tap || catches ? new Rectangle(0, 0, w, h) : null;
    for (const [p, def] of Object.entries(PROPS)) if (def.apply) def.apply(n, s[p]);
    for (const c of n.children) draw(c);
  }

  // ---------- public ----------

  function tick(dt: number) {
    if (!root) return;
    const v = opts.viewport?.();
    if (v && v.touch !== touch) { touch = v.touch; ({ prefabs, sheet } = compile(src.kdl, src.css)); dirty = true; }
    if (dirty) { restyle(root); dirty = false; }
    animate(root, dt);
    layout(root, v);
    draw(root);
  }

  /** Render a prefab instance (or nothing). Call as often as you like: nodes are kept by type and key. */
  function render(u: Use | null) {
    if (!u) { root?.el.destroy({ children: true }); root = undefined; last = null; return; }
    const [e] = expand(u);
    if (!e) throw uiError(`use('${u.prefab}')`, `prefab "${u.prefab}" is empty`, 'give it an element');
    if (!root || root.type !== e.type || root.key !== e.key) {
      root?.el.destroy({ children: true });
      root = create(e);
      parent.addChild(root.el);
    }
    reconcile(root, e);
    dirty = true;
    tick(0); // laid out now, so a tap right after a render lands on the new layout
    last = u;
  }

  const running = (a: UiNode['anims'][number]) => Number.isFinite(a.spec.count) && a.t < a.spec.delay + a.spec.dur * a.spec.count;
  const tweening = (n: UiNode): boolean => Object.keys(n.tweens).length > 0 || n.anims.some(running) || n.children.some(tweening);

  return {
    render,
    tick,
    /** True while any node is mid-transition or mid-way through a finite keyframe animation; infinite ones are idle loops that never finish. */
    busy: () => !!root && tweening(root),
    /** Swap in new sources (undefined keeps the current one) and re-render the last Use. A bad edit is logged and the last good version stays. */
    reload(newKdl?: string, newCss?: string) {
      const old = { prefabs, sheet, src };
      try {
        src = { kdl: newKdl ?? src.kdl, css: newCss ?? src.css };
        ({ prefabs, sheet } = compile(src.kdl, src.css));
        render(last);
      } catch (e) {
        ({ prefabs, sheet, src } = old);
        console.error(e);
        try { render(last); } catch { /* the old sources failed too; leave it */ }
      }
    },
  };
}
