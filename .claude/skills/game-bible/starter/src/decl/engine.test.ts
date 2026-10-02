import 'pixi.js/events'; // hit testing needs the event mixin the renderer normally loads
import { CanvasTextMetrics, Container, EventBoundary, Graphics, Text, TextStyle, Texture } from 'pixi.js';
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { defineElement, createUi, use, type UiOptions } from './engine';

const ui = (kdl: string, css = '') => createUi(new Container(), kdl, css, { texture: () => { throw new Error('no textures in unit tests'); } });
const tile = 'prefab "hero-tile" { panel class="tile" { text class="tile-name" bind="name" } }';
// No canvas under node: give text a fixed 10x10 size so layout can run.
const mockTextMetrics = () => { vi.spyOn(CanvasTextMetrics, 'measureText').mockReturnValue({ width: 10, height: 10, lines: [''], lineWidths: [10], lineHeight: 10, maxLineWidth: 10, fontProperties: { ascent: 8, descent: 2, fontSize: 10 } } as any); };
const refuses = (run: () => unknown, ...parts: string[]) => {
  let msg = '';
  try { run(); } catch (e) { msg = (e as Error).message; }
  for (const p of parts) expect(msg).toContain(p);
};

describe('createUi refuses bad input before rendering', () => {
  it('top-level nodes that are not prefabs', () => refuses(() => ui('panel "x"'), 'top-level `panel`', 'prefab "name"'));
  it('unknown element, with a near miss', () => refuses(() => ui('prefab "a" { pannel class="x" }'), 'prefab "a" > pannel.x', 'unknown element `pannel`', 'did you mean `panel`?'));
  it('unknown element, no near miss', () => refuses(() => ui('prefab "a" { zzzzzzzz }'), 'zzzzzzzz', 'register it with defineElement before createUi'));
  it('unknown attribute on a built-in, with a near miss', () => refuses(() => ui('prefab "a" { text bind-clas="x" }'), 'prefab "a" > text', 'unknown attribute `bind-clas`', 'did you mean `bind-class`?'));
  it('unknown attribute on a built-in, no near miss', () => refuses(() => ui('prefab "a" { panel wobble=1 }'), '`wobble`', 'custom attributes need a defineElement type'));
  it('accepts any attribute on a custom element', () => {
    defineElement('test-widget', () => new Container());
    ui('prefab "a" { test-widget wobble=1 deck=(bind)"d" }');
  });
  it('children under a leaf element', () => {
    defineElement('test-leaf', () => new Container());
    refuses(() => ui('prefab "a" { panel { text class="t" "x" { panel } } }'), 'prefab "a" > text.t', "`text` can't have children", 'wrap them in a panel');
    refuses(() => ui('prefab "a" { sprite texture="t" { panel } }'), "`sprite` can't have children");
    refuses(() => ui('prefab "a" { test-leaf { panel } }'), "`test-leaf` can't have children");
  });
  it('CSS type selectors naming no element', () => refuses(() => ui(tile, 'pannel { width: 1 }'), 'rule "pannel"', 'unknown element type `pannel`', 'did you mean `panel`?'));
});

describe('render refuses missing pieces', () => {
  it('a missing prefab, with a near miss', () => refuses(() => ui(tile).render(use('hero-tyle')), "use('hero-tyle')", 'did you mean `hero-tile`?'));
  it('a missing prefab, listing the defined ones', () => refuses(() => ui(tile).render(use('nothing-like-it')), 'defined: hero-tile'));
  it('a missing bind binding', () => refuses(() => ui(tile).render(use('hero-tile')), 'prefab "hero-tile" > text.tile-name', 'no binding `name`', "pass `name` in use('hero-tile', …), or `name: undefined` if it's optional"));
  it('a near-miss binding name', () => refuses(() => ui(tile).render(use('hero-tile', { nam: 'x' })), 'got `nam` — rename it to `name`, or pass `name` in use('));
  it('a nameless prefab', () => refuses(() => ui('prefab { panel }'), 'a prefab has no name', 'prefab "name" { ... }'));
  it('a missing bind-class binding', () => refuses(() => ui('prefab "a" { panel bind-class="state" }').render(use('a')), 'no binding `state`', 'pass `state` in use(\'a\''));
  it('a missing tap binding', () => refuses(() => ui('prefab "a" { button tap="pick" }').render(use('a')), 'no binding `pick`', 'pass `pick`'));
  it('a missing (bind) property, including key', () => {
    refuses(() => ui('prefab "a" { panel key=(bind)"id" }').render(use('a')), 'no binding `id`');
    defineElement('test-fan', () => new Container());
    refuses(() => ui('prefab "a" { test-fan deck=(bind)"deck" }').render(use('a')), 'no binding `deck`');
  });
  it('a missing slot', () => refuses(() => ui('prefab "a" { panel slot="rows" }').render(use('a')), 'prefab "a" > panel', 'no slot `rows`', "pass slots.rows in use('a', …, { rows: [...] }), [] for none"));
  it('a slot inside a nested prefab use is checked too', () => refuses(() => ui('prefab "a" { panel slot="rows" }\nprefab "b" { panel slot="kids" }').render(use('b', {}, { kids: [use('a')] })), 'no slot `rows`'));
  it('leaves an absent `if` binding falsy', () => {
    // nothing to build: the only element is skipped, so render reaches the empty-prefab error, not a binding error
    refuses(() => ui('prefab "a" { text if="daily" "x" }').render(use('a')), 'is empty');
  });
  it('accepts explicit undefined for a binding', () => {
    expect(() => ui('prefab "a" { panel bind-class="x" }').render(use('a', { x: undefined }))).not.toThrow();
  });
});

describe('reload', () => {
  beforeAll(mockTextMetrics);
  afterAll(() => { vi.restoreAllMocks(); });
  const mount = (kdl: string, css = '') => {
    const parent = new Container();
    const u = createUi(parent, kdl, css, { texture: () => { throw new Error('no textures in unit tests'); } });
    return { u, parent, root: () => parent.children[0] as Container };
  };
  const texts = (c: Container): string[] => [...('text' in c ? [String((c as any).text)] : []), ...c.children.flatMap((x) => texts(x as Container))];

  it('new KDL changes rendered text on the same Pixi root', () => {
    const { u, root } = mount(tile);
    u.render(use('hero-tile', { name: 'Ann' }));
    const before = root();
    u.reload('prefab "hero-tile" { panel class="tile" { text "Changed" } }');
    expect(root()).toBe(before);
    expect(texts(root())).toContain('Changed');
  });

  it('new CSS changes a drawn value', () => {
    const { u, root } = mount(tile);
    u.render(use('hero-tile', { name: 'Ann' }));
    u.reload(undefined, '.tile { opacity: 0.5 }');
    u.tick(0);
    expect(root().alpha).toBe(0.5);
  });

  it('bad edits keep the old output, log, and do not throw', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => err.mockRestore());
    const { u, root } = mount(tile, '.tile { opacity: 0.5 }');
    u.render(use('hero-tile', { name: 'Ann' }));
    for (const [k, c] of [[undefined, '.tile { color: red }'], ['prefab {{{', undefined], ['prefab "hero-tile" { panel class="tile" { text bind="other" } }', undefined]] as const) {
      err.mockClear();
      expect(() => u.reload(k, c)).not.toThrow();
      expect(err).toHaveBeenCalledOnce();
      u.tick(0);
      expect(texts(root())).toContain('Ann');
      expect(root().alpha).toBe(0.5);
    }
    // the restored sources still work for a later good reload
    u.reload(undefined, '.tile { opacity: 0.25 }');
    u.tick(0);
    expect(root().alpha).toBe(0.25);
  });

  it('a failed game render does not poison a later good reload', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => err.mockRestore());
    const { u, root } = mount(tile);
    u.render(use('hero-tile', { name: 'Ann' }));
    expect(() => u.render(use('hero-tile', {}))).toThrow(); // the last good tree is still the one with a name
    u.reload('prefab "hero-tile" { panel class="tile" { text "Changed"; text bind="name" } }');
    expect(err).not.toHaveBeenCalled();
    expect(texts(root())).toEqual(expect.arrayContaining(['Changed', 'Ann']));
  });
});

describe('layout', () => {
  // Text is 10x10 (mocked). Panels get a white background so their box is visible as Pixi output.
  beforeAll(mockTextMetrics);
  afterAll(() => { vi.restoreAllMocks(); });

  /** Render `prefab "p" { kdl }`; every panel's background rect as [x, y, w, h] in tree order, plus the Text elements. */
  const collect = (parent: Container) => {
    const rects: number[][] = [], texts: Text[] = [];
    const walk = (c: Container) => {
      if (c instanceof Text) texts.push(c);
      if (c.children[0] instanceof Graphics) { const b = c.children[0].getBounds(); rects.push([b.x, b.y, b.width, b.height]); }
      c.children.forEach((k) => walk(k as Container));
    };
    walk(parent);
    return { rects, texts };
  };
  const lay = (kdl: string, css: string, extra: Partial<UiOptions> = {}) => {
    const parent = new Container();
    const u = createUi(parent, `prefab "p" { ${kdl} }`, `panel { background-color: #fff } ${css}`, { texture: () => Texture.WHITE, ...extra });
    u.render(use('p'));
    u.tick(0);
    return { ...collect(parent), parent, u, again: () => collect(parent) };
  };
  const sizes = '.a { width: 10; height: 10 } .b { width: 20; height: 10 } .c { width: 10; height: 10 }';
  const three = `.root { width: 100; height: 100 } ${sizes}`;
  const kids = 'panel class="root" { panel class="a"; panel class="b"; panel class="c" }';

  it('column is the default: children stack top-down with gap; padding offsets them', () => {
    const { rects } = lay(kids, `${three} .root { gap: 5; padding: 4 0 0 6; align-items: flex-start }`);
    expect(rects).toEqual([[0, 0, 100, 100], [6, 4, 10, 10], [6, 19, 20, 10], [6, 34, 10, 10]]);
  });

  it('row lays children left to right with gap', () => {
    const { rects } = lay(kids, `${three} .root { flex-direction: row; gap: 5; align-items: flex-start }`);
    expect(rects.slice(1)).toEqual([[0, 0, 10, 10], [15, 0, 20, 10], [40, 0, 10, 10]]);
  });

  it('justify-content: center, flex-end, space-between', () => {
    const ys = (j: string) => lay(kids, `${three} .root { justify-content: ${j} }`).rects.slice(1).map((r) => r[1]);
    expect(ys('center')).toEqual([35, 45, 55]);
    expect(ys('flex-end')).toEqual([70, 80, 90]);
    expect(ys('space-between')).toEqual([0, 45, 90]);
  });

  it('space-between with one child is flex-start', () => {
    const { rects } = lay('panel class="root" { panel class="a" }', `${three} .root { justify-content: space-between; align-items: flex-start }`);
    expect(rects[1]).toEqual([0, 0, 10, 10]);
  });

  it('align-items stretches by default, but not a child with an explicit cross size', () => {
    const { rects } = lay('panel class="root" { panel class="h" { text "x" }; panel class="a" }', `${three} .h { height: 10 }`);
    expect(rects[1]).toEqual([0, 0, 100, 10]); // no width: stretched
    expect(rects[2]).toEqual([0, 10, 10, 10]); // width 10: kept
  });

  it('align-items center, flex-end, flex-start', () => {
    const xs = (a: string) => lay(kids, `${three} .root { align-items: ${a} }`).rects.slice(1).map((r) => r[0]);
    expect(xs('center')).toEqual([45, 40, 45]);
    expect(xs('flex-end')).toEqual([90, 80, 90]);
    expect(xs('flex-start')).toEqual([0, 0, 0]);
  });

  it('align-items stretch in a row fills the height', () => {
    const { rects } = lay('panel class="root" { panel class="x" { text "x" } }', `${three} .root { flex-direction: row }`);
    expect(rects[1]).toEqual([0, 0, 10, 100]);
  });

  it('flex-grow splits free space by ratio; justify-content is then ignored', () => {
    const { rects } = lay(kids, `${three} .root { justify-content: center } .a { flex-grow: 1 } .c { flex-grow: 2 }`);
    const [, a, b, c] = rects; // free = 100 - 30 = 70 → a gets 70/3, c gets 140/3
    expect(a![1]).toBeCloseTo(0, 0);
    expect(a![3]).toBeCloseTo(10 + 70 / 3, 0);
    expect(b![3]).toBe(10);
    expect(c![3]).toBeCloseTo(10 + 140 / 3, 0);
    expect(c![1]! + c![3]!).toBeCloseTo(100, 0);
  });

  it('a container with no size fits its content plus padding', () => {
    const two = 'panel class="fit" { panel class="a"; panel class="b" }';
    const col = lay(two, `${sizes} .fit { gap: 4; padding: 2 2 2 4; align-items: flex-start }`);
    expect(col.rects[0]).toEqual([0, 0, 20 + 6, 10 + 10 + 4 + 4]);
    const row = lay(two, `${sizes} .fit { flex-direction: row; gap: 4; padding: 2 2 2 4 }`);
    expect(row.rects[0]).toEqual([0, 0, 10 + 20 + 4 + 6, 10 + 4]);
  });

  it('position: absolute sits at left/top from the parent origin, ignores padding, sizes to content, leaves the flow', () => {
    const { rects } = lay('panel class="root" { panel class="a"; panel class="abs" { text "x" }; panel class="c" }', `${three} .root { padding: 8; gap: 2; align-items: flex-start } .abs { position: absolute; left: 30; top: 40 }`);
    expect(rects[1]).toEqual([8, 8, 10, 10]);
    expect(rects[2]).toEqual([30, 40, 10, 10]);
    expect(rects[3]).toEqual([8, 20, 10, 10]);
  });

  it('display: none takes a node out of the flow', () => {
    const { rects } = lay(kids, `${three} .b { display: none } .root { align-items: flex-start }`);
    expect(rects[3]).toEqual([0, 10, 10, 10]);
  });

  it('a sprite is frame x image-scale unless width/height are set', () => {
    const { rects } = lay('panel class="fit" { sprite class="s" texture="t" }', '.s { image-scale: 2 } .fit { align-items: flex-start }');
    expect(rects[0]).toEqual([0, 0, 2, 2]);
    const sized = lay('panel class="fit" { sprite class="s" texture="t" }', '.s { image-scale: 2; width: 6; height: 8 } .fit { align-items: flex-start }');
    expect(sized.rects[0]).toEqual([0, 0, 6, 8]);
  });

  it('a wrapping text is measured at its parent inner width, or its own width', () => {
    const wrap = '.w { text-wrap: wrap } .p { width: 100; padding: 5 }';
    expect(lay('panel class="p" { text class="w" "hello" }', wrap).texts[0]!.style.wordWrapWidth).toBe(90);
    expect(lay('panel class="p" { text class="w" "hello" }', `${wrap} .w { width: 40 }`).texts[0]!.style.wordWrapWidth).toBe(40);
  });

  it('the root is placed at its own left/top', () => {
    const { rects } = lay('panel class="root" { panel class="a" }', `${three} .root { left: 12; top: 6; align-items: flex-start }`);
    expect(rects).toEqual([[12, 6, 100, 100], [12, 6, 10, 10]]);
  });

  // Yoga follows CSS flexbox; where the old hand-rolled pass differed, CSS is the dialect.
  it('overflow with justify-content: center goes negative, like CSS', () => {
    const { rects } = lay('panel class="r" { panel class="big" }', '.r { width: 100; height: 20; flex-direction: row; justify-content: center } .big { width: 150; height: 10 }');
    expect(rects[1]![0]).toBe(-25);
  });

  it('an absolute auto-width wrapping text wraps against its parent padding box (the CSS containing block, so padding is not subtracted)', () => {
    const { texts } = lay('panel class="p" { text class="w" "hello" }', '.p { width: 100; padding: 5 } .w { text-wrap: wrap; position: absolute; left: 0; top: 0 }');
    expect(texts[0]!.style.wordWrapWidth).toBe(100);
  });

  // The dialect's flex-shrink defaults to 0 (CSS's is 1), so items keep their measured size and overflow instead of sharing the row.
  // Each text measures 80 wide, so the pair (160) overflows the 100 row.
  const wide = () => { (CanvasTextMetrics.measureText as any).mockReturnValue({ width: 80, height: 10, lines: [''], lineWidths: [80], lineHeight: 10, maxLineWidth: 80, fontProperties: { ascent: 8, descent: 2, fontSize: 10 } }); onTestFinished(mockTextMetrics); };
  it('two wrapping texts in a row each wrap against the full row width, because flex-shrink defaults to 0', () => {
    wide();
    const { texts } = lay('panel class="p" { text class="w" "a"; text class="w" "b" }', '.p { width: 100; flex-direction: row } .w { text-wrap: wrap }');
    expect(texts.map((t) => t.style.wordWrapWidth)).toEqual([100, 100]);
  });

  it('with flex-shrink: 1 the same two wrapping texts share the row', () => {
    wide();
    const { texts } = lay('panel class="p" { text class="w" "a"; text class="w" "b" }', '.p { width: 100; flex-direction: row } .w { text-wrap: wrap; flex-shrink: 1 }');
    expect(texts.map((t) => t.style.wordWrapWidth)).toEqual([50, 50]);
  });

  it('percent width resolves against the parent', () => {
    const { rects } = lay('panel class="p" { panel class="a" }', '.p { width: 200; align-items: flex-start } .a { width: 50%; height: 10 }');
    expect(rects[1]).toEqual([0, 0, 100, 10]);
  });

  it('percent height resolves against a sized parent', () => {
    const { rects } = lay('panel class="p" { panel class="a" }', '.p { width: 200; height: 80; align-items: flex-start } .a { width: 10; height: 25% }');
    expect(rects[1]).toEqual([0, 0, 10, 20]);
  });

  it('absolute left/top accept percents of the parent', () => {
    const { rects } = lay('panel class="p" { panel class="a" }', '.p { width: 200; height: 100 } .a { position: absolute; left: 10%; top: 50%; width: 10; height: 10 }');
    expect(rects[1]).toEqual([20, 50, 10, 10]);
  });

  it('flex-basis sets the main size, in px or percent', () => {
    const px = lay('panel class="p" { panel class="a" }', '.p { width: 200; height: 100; flex-direction: row } .a { flex-basis: 60; height: 10 }');
    expect(px.rects[1]![2]).toBe(60);
    const pc = lay('panel class="p" { panel class="a" }', '.p { width: 200; height: 100; flex-direction: row } .a { flex-basis: 25%; height: 10 }');
    expect(pc.rects[1]![2]).toBe(50);
  });

  it('flex-shrink: 1 shares an overflowing row; the default overflows', () => {
    const row = '.p { width: 150; height: 20; flex-direction: row } .a { width: 100; height: 10 }';
    const kidsTwo = 'panel class="p" { panel class="a"; panel class="a" }';
    expect(lay(kidsTwo, `${row} .a { flex-shrink: 1 }`).rects.slice(1).map((r) => r[2])).toEqual([75, 75]);
    expect(lay(kidsTwo, row).rects.slice(1).map((r) => r[2])).toEqual([100, 100]);
  });

  it('flex-wrap: wrap breaks a row into lines; justify-content centres each line', () => {
    const five = 'panel class="p" { panel class="a"; panel class="a"; panel class="a"; panel class="a"; panel class="a" }';
    const css = '.p { width: 120; flex-direction: row; flex-wrap: wrap; gap: 10; align-items: flex-start } .a { width: 50; height: 10 }';
    expect(lay(five, css).rects.slice(1).map((r) => [r[0], r[1]])).toEqual([[0, 0], [60, 0], [0, 20], [60, 20], [0, 40]]);
    expect(lay(five, `${css} .p { justify-content: center }`).rects.slice(1).map((r) => r[0])).toEqual([5, 65, 5, 65, 35]);
  });

  describe('viewport', () => {
    const view = { width: 390, height: 608, touch: 52 };
    const root = 'panel class="root" { panel class="g"; panel class="a" }';
    const css = '.root { width: 100%; height: 100% } .g { flex-grow: 1 } .a { height: 8 }';

    it('the root fills the viewport, a grow child fills the rest, and a resize re-lays out on the next tick', () => {
      const v = { ...view };
      const { rects, u, again } = lay(root, css, { viewport: () => v });
      expect(rects[0]).toEqual([0, 0, 390, 608]);
      expect(rects[1]).toEqual([0, 0, 390, 600]);
      v.height = 500; v.width = 320;
      u.tick(0);
      expect(again().rects[0]).toEqual([0, 0, 320, 500]);
      expect(again().rects[1]).toEqual([0, 0, 320, 492]);
    });

    it('the root keeps its own left/top offset', () => {
      const { rects } = lay(root, `${css} .root { left: 12; top: 6 }`, { viewport: () => view });
      expect(rects[0]).toEqual([12, 6, 390, 608]);
    });

    it('an auto-width root stays fit-content inside the viewport', () => {
      const { rects } = lay('panel class="root" { panel class="a" }', `${sizes} .root { align-items: flex-start }`, { viewport: () => view });
      expect(rects[0]).toEqual([0, 0, 10, 10]);
    });

    it('--touch-size resolves and follows viewport().touch', () => {
      const v = { ...view };
      const { rects, u, again } = lay('panel class="t"', '.t { width: var(--touch-size); height: 10 }', { viewport: () => v });
      expect(rects[0]![2]).toBe(52);
      v.touch = 60;
      u.tick(0);
      expect(again().rects[0]![2]).toBe(60);
    });

    it('--touch-size survives reload()', () => {
      const { u, again } = lay('panel class="t"', '.t { width: var(--touch-size); height: 10 }', { viewport: () => view });
      u.reload(undefined, 'panel { background-color: #fff } .t { width: var(--touch-size); height: 12 }');
      u.tick(0);
      expect(again().rects[0]).toEqual([0, 0, 52, 12]);
    });

    it('without a viewport --touch-size is undefined', () => {
      refuses(() => lay('panel class="t"', '.t { width: var(--touch-size) }'), 'undefined `--touch-size`');
    });
  });

  it('a transition on a percent width lerps', () => {
    const css = '.p { width: 200; align-items: flex-start } .a { width: 50%; height: 10; transition: width 1s linear } .a.big { width: 100% }';
    const parent = new Container();
    const u = createUi(parent, 'prefab "p" { panel class="p" { panel class="a" bind-class="s" } }', `panel { background-color: #fff } ${css}`, { texture: () => Texture.WHITE });
    u.render(use('p', { s: '' }));
    u.render(use('p', { s: 'big' }));
    u.tick(0.5);
    expect(collect(parent).rects[1]![2]).toBeCloseTo(150, 0);
  });

  it('busy while a transition or a finite animation runs, not for an infinite one', () => {
    const css = 'panel { background-color: #fff } .a { width: 10; height: 10; transition: width 1s linear } .a.big { width: 20 } @keyframes pop { from { opacity: 0 } to { opacity: 1 } } .pop { animation: pop .5s } .loop { animation: pop 1s infinite }';
    const u = createUi(new Container(), 'prefab "p" { panel class="a" bind-class="s" }', css, { texture: () => Texture.WHITE });
    u.render(use('p', { s: '' })); expect(u.busy()).toBe(false);
    u.render(use('p', { s: 'pop' })); expect(u.busy()).toBe(true);
    u.tick(0.5); expect(u.busy()).toBe(false);
    u.render(use('p', { s: 'loop' })); expect(u.busy()).toBe(false);
    u.render(use('p', { s: 'big' })); expect(u.busy()).toBe(true);
    u.tick(1); expect(u.busy()).toBe(false);
  });

  it('a custom element is size 0 unless CSS sizes it', () => {
    defineElement('test-box', () => new Container());
    const zero = lay('panel class="p" { test-box; panel class="a" }', `${sizes} .p { align-items: flex-start }`);
    expect(zero.rects[0]!.slice(2)).toEqual([10, 10]); // the custom element adds nothing
    const sized = lay('panel class="p" { test-box class="k"; panel class="a" }', `${sizes} .p { align-items: flex-start } .k { width: 30; height: 7 }`);
    expect(sized.rects[0]!.slice(2)).toEqual([30, 7 + 10]); // the parent grew to fit the custom element's CSS size
  });

  it('a custom element factory gets its CSS box, and rebuilds only when props or size change', () => {
    const seen: { w: number; h: number }[] = [];
    defineElement('test-sized', (_props, size) => { seen.push(size); return new Container(); });
    const { u } = lay('test-sized class="k"', '.k { width: 30; height: 7 }');
    expect(seen).toEqual([{ w: 30, h: 7 }]);
    u.render(use('p'));
    expect(seen).toHaveLength(1); // same props, same size
    u.reload(undefined, '.k { width: 50; height: 9 }');
    u.tick(0);
    expect(seen).toEqual([{ w: 30, h: 7 }, { w: 50, h: 9 }]);
  });

  it('a root with no width lays out, and its wrapping text is not squeezed', () => {
    const { rects, texts } = lay('panel class="root" { text class="w" "hello" }', '.w { text-wrap: wrap }');
    expect(rects[0]).toEqual([0, 0, 10, 10]); // fits its (mocked 10x10) text
    expect(texts[0]!.style.wordWrapWidth).toBeGreaterThan(1);
  });

  it('a percent width on a wrapping text wraps against the resolved width', () => {
    const { texts } = lay('panel class="p" { text class="w" "hello" }', '.p { width: 200 } .w { text-wrap: wrap; width: 50% }');
    expect(texts[0]!.style.wordWrapWidth).toBe(100);
  });

  it('a percent left/top on the root is refused', () => {
    refuses(() => lay('panel class="root"', '.root { left: 10% }'), 'root panel.root', "the root's left/top are px offsets; position a panel inside it instead");
  });

  it('viewport() is read once per tick', () => {
    let calls = 0;
    const { u } = lay('panel class="t"', '.t { width: 10; height: 10 }', { viewport: () => { calls++; return { width: 100, height: 100, touch: 52 }; } });
    const before = calls;
    u.tick(0);
    expect(calls - before).toBe(1);
  });

  it('a non-wrapping text is not restyled on later ticks', () => {
    const update = vi.spyOn(TextStyle.prototype, 'update');
    onTestFinished(() => { update.mockRestore(); });
    const parent = new Container(), u = createUi(parent, 'prefab "p" { panel class="p" { text "x" } }', '.p { width: 100; flex-direction: row; align-items: flex-start }', { texture: () => Texture.WHITE });
    u.render(use('p'));
    u.tick(0);
    const after = update.mock.calls.length;
    u.tick(0); u.tick(0);
    expect(update.mock.calls.length).toBe(after);
  });

  it('a wrapping text is not restyled on later ticks', () => {
    const update = vi.spyOn(TextStyle.prototype, 'update');
    onTestFinished(() => { update.mockRestore(); });
    const parent = new Container(), u = createUi(parent, 'prefab "p" { panel class="p" { text class="w" "x" } }', '.p { width: 100 } .w { text-wrap: wrap }', { texture: () => Texture.WHITE });
    u.render(use('p'));
    u.tick(0);
    const after = update.mock.calls.length;
    u.tick(0); u.tick(0);
    expect(update.mock.calls.length).toBe(after);
  });
});

describe('pointer-events', () => {
  const mount = (css: string) => {
    const parent = new Container();
    const u = createUi(parent, 'prefab "p" { panel class="root" { button class="under" tap="hit"; panel class="scrim" } }', `.root { width: 100; height: 100 } .under { width: 50; height: 50 } .scrim { position: absolute; width: 100; height: 100 } ${css}`, { texture: () => Texture.WHITE });
    const hit = vi.fn();
    u.render(use('p', { hit }));
    u.tick(0);
    const panels: Container[] = [];
    const walk = (c: Container) => { if (c.children[0] instanceof Graphics) panels.push(c); c.children.forEach((k) => walk(k as Container)); };
    walk(parent);
    return { scrim: panels.at(-1)!, at: (x: number, y: number) => new EventBoundary(parent).hitTest(x, y) };
  };
  it('auto: the box catches taps over its whole box, so a tappable beneath it is not reached', () => {
    const { scrim, at } = mount('.scrim { pointer-events: auto }');
    expect(scrim.eventMode).toBe('static');
    expect(scrim.hitArea).toMatchObject({ x: 0, y: 0, width: 100, height: 100 });
    expect(at(10, 10)).toBe(scrim);
  });
  it('the default is passive: taps fall through to what is beneath', () => {
    const { scrim, at } = mount('');
    expect(scrim.eventMode).toBe('passive');
    expect(at(10, 10)?.cursor).toBe('pointer');
  });
  it('rejects unknown values with a hint', () => refuses(() => mount('.scrim { pointer-events: sideways }'), "`sideways` isn't a `pointer-events` value", 'use one of: none, auto'));
});

describe('unkeyed siblings', () => {
  it('re-render in place: a list of the same prefab, shrinking and growing, never leaves stale nodes', () => {
    const parent = new Container(), u = createUi(parent, 'prefab "list" { panel slot="rows" }\nprefab "row" { panel class="row" }', '', { texture: () => { throw new Error('no textures'); } });
    const rows = (n: number) => u.render(use('list', {}, { rows: Array.from({ length: n }, () => use('row')) }));
    const count = () => (parent.children[0] as Container).children.filter((c) => !(c instanceof Graphics)).length;
    rows(3); const first = (parent.children[0] as Container).children[1];
    rows(3); expect(count()).toBe(3); expect((parent.children[0] as Container).children[1]).toBe(first);
    rows(2); expect(count()).toBe(2);
    rows(4); expect(count()).toBe(4);
  });
});
