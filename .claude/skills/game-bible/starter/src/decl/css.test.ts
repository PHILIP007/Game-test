import { describe, expect, it } from 'vitest';
import { animationsOf, len, lerpLen, cascade, defineProp, easing, lerpNum, NONE, nearest, parseCss, progress, sample, transitionsOf, uiError, type Styleable } from './css';

const node = (type: string, classes: string[], parent?: Styleable): Styleable => ({ type, classes: new Set(classes), parent });

describe('declarative css', () => {
  const sheet = parseCss(`
    :root { --gold: #ffd24a }
    /* comment */
    .tile { border-color: #3e2e44; border-width: 2px; transition: border-color .15s ease-out, scale 80ms }
    .tile.chosen { border-color: var(--gold) }
    .row .tile { border-width: 3 }
    .tile:pressed { scale: .9 1.1 }
    .screen { font-size: 20px }
    @keyframes pop { from { scale: .5 } 50% { scale: 1.2 } }
  `);

  it('cascades by specificity, then order, with vars, pseudo-classes and inheritance', () => {
    const screen = node('panel', ['screen']), row = node('panel', ['row'], screen);
    const tile = node('panel', ['tile', 'chosen', ':pressed'], row);
    const s = cascade(sheet, tile, cascade(sheet, row, cascade(sheet, screen)));
    expect(s['border-color']).toBe(0xffd24a);
    expect(s['border-width']).toBe(3);
    expect(s.scale).toEqual([0.9, 1.1]);
    expect(s['font-size']).toBe(20); // inherited
    expect(s['background-color']).toBe(NONE); // initial
    expect(cascade(sheet, node('panel', ['tile']))['border-width']).toBe(2); // no .row ancestor
  });

  it('parses transitions and animations', () => {
    expect(transitionsOf('border-color .15s ease-out, scale 80ms').map((t) => [t.prop, t.dur])).toEqual([['border-color', 0.15], ['scale', 0.08]]);
    const [a, b] = animationsOf('idle .66s steps(2) infinite, flicker .45s cubic-bezier(.3, 1.8, .5, 1) .3s infinite alternate');
    expect(a).toMatchObject({ name: 'idle', dur: 0.66, count: Infinity, alternate: false });
    expect(b).toMatchObject({ name: 'flicker', dur: 0.45, delay: 0.3, alternate: true });
  });

  it('samples keyframes with implicit end stops, steps, alternate and fill', () => {
    const frames = sheet.keyframes.pop!, lin = easing('linear');
    expect(sample(frames, 'scale', [1, 1], 0.25, lin)).toEqual([0.85, 0.85]);
    expect(sample(frames, 'scale', [1, 1], 1, lin)).toEqual([1, 1]); // 100% falls back to the base value
    const step = easing('steps(2)');
    expect([0, 0.49, 0.5, 0.99].map(step)).toEqual([0, 0, 0.5, 0.5]);
    const [alt] = animationsOf('x 1s linear infinite alternate'), [once] = animationsOf('x 1s linear .5s');
    expect(progress(alt!, 1.25)).toBeCloseTo(0.75);
    expect(progress(once!, 0.2)).toBeNull(); // waiting out its delay
    expect(progress(once!, 2)).toBeNull(); // finished, no fill
  });

  it('lets the game define its own properties', () => {
    defineProp('glow-strength', { parse: Number, initial: 0, lerp: lerpNum });
    const s = parseCss('.hot { glow-strength: 3 } @keyframes pulse { to { glow-strength: 5 } }');
    expect(cascade(s, node('panel', ['hot']))['glow-strength']).toBe(3);
    expect(sample(s.keyframes.pulse!, 'glow-strength', 3, 0.5, easing('linear'))).toBe(4);
  });

  describe('errors name the fix', () => {
    it('formats where, problem and fix; finds near misses', () => {
      expect(uiError('rule ".x"', 'bad', 'do y').message).toBe('rule ".x": bad; do y');
      expect(nearest('font-colour', ['font-color', 'width'])).toBe('font-color');
      expect(nearest('zzzzzz', ['font-color', 'width'])).toBeUndefined();
    });
    it('unknown properties in rules and keyframe stops', () => {
      expect(() => parseCss('.x { color: red }')).toThrow(/rule "\.x": `color` isn't a property; use `font-color`.*`background-color`/);
      expect(() => parseCss('.x { font-colour: red }')).toThrow(/rule "\.x": `font-colour`.*did you mean `font-color`\?/);
      expect(() => parseCss('.x { qqqqqqqqqq: 1 }')).toThrow(/rule "\.x": `qqqqqqqqqq`.*defineProp/);
      expect(() => parseCss('@keyframes pop { to { opacty: 0 } }')).toThrow(/@keyframes pop: `opacty`.*did you mean `opacity`\?/);
      expect(() => parseCss(':root { --x: 1 }')).not.toThrow();
    });
    it('unknown properties in a transition', () => {
      expect(() => parseCss('.x { transition: opacty .1s }')).toThrow(/rule "\.x" transition: `opacty`.*did you mean `opacity`/);
      expect(() => parseCss('.x { transition: all .1s, opacity 1s }')).not.toThrow();
    });
    it('undefined vars', () => {
      expect(() => parseCss(':root { --gold: #fc0 } .x { border-color: var(--gild) }')).toThrow(/rule "\.x": undefined `--gild`; did you mean `--gold`\?/);
      expect(() => parseCss('.x { border-color: var(--a) }')).toThrow(/undefined `--a`; define it in :root/);
    });
    it('max() folds px numbers after var() substitution and refuses the rest', () => {
      const w = (touch: number) => cascade(parseCss('.x { width: max(56px, var(--touch-size)) }', { '--touch-size': `${touch}px` }), node('panel', ['x'])).width;
      expect(w(52)).toBe(56);
      expect(w(61)).toBe(61);
      expect(cascade(parseCss('.x { width: max(10, 20px, 5) }'), node('panel', ['x'])).width).toBe(20);
      expect(() => parseCss('.x { width: max(56px, 50%) }')).toThrow(/rule "\.x": `max\(\)` argument `50%` isn't a px number/);
    });
    it('unsupported selectors say what is supported', () => {
      for (const [sel, what] of [['.a > .b', /rule "\.a > \.b": .*combinator.*descendant chains/], ['.a + .b', /combinator/], ['.a ~ .b', /combinator/], ['#a', /`#id`.*`\.class`/],
        ['.a[x]', /`\[attr\]`.*`type`/], ['.a:not(.b)', /rule "\.a:not\(\.b\)": .*`:not\(\.\.\.\)`.*style the default and override on the class/],
        ['.a:nth-child(2)', /functional pseudo-class.*`:pressed` and `:hover`/], ['.a:hovr', /unknown pseudo-class `:hovr`; did you mean `:hover`\?.*descendant chains/], ['.a:zzzzzzzz', /unknown pseudo-class `:zzzzzzzz`; supported:/]] as const)
        expect(() => parseCss(`${sel} { opacity: 1 }`), sel).toThrow(what);
    });
  });
});

describe('lengths and runtime vars', () => {
  it('len: percent stays a string, auto is NaN, the rest is px', () => {
    expect(len('50%')).toBe('50%');
    expect(len('auto')).toBeNaN();
    expect(len('12px')).toBe(12);
    expect(len('7')).toBe(7);
  });
  it('lerpLen: numbers, percents, and a mix that flips at the midpoint', () => {
    expect(lerpLen(0, 10, 0.5)).toBe(5);
    expect(lerpLen('0%', '100%', 0.25)).toBe('25%');
    expect(lerpLen(10, '50%', 0.4)).toBe(10);
    expect(lerpLen(10, '50%', 0.6)).toBe('50%');
  });
  it('lerpLen: auto flips at the midpoint instead of lerping NaN', () => {
    expect(lerpLen(NaN, 10, 0.4)).toBeNaN();
    expect(lerpLen(NaN, 10, 0.6)).toBe(10);
    expect(lerpLen(10, NaN, 0.4)).toBe(10);
  });
  it('keyword values are checked at parse time', () => {
    expect(() => parseCss('.x { justify-content: space-around }')).toThrow(/rule "\.x": `space-around` isn't a `justify-content` value; use one of: flex-start, center, flex-end, space-between/);
    expect(() => parseCss('.x { flex-wrap: wrp }')).toThrow(/`wrp` isn't a `flex-wrap` value; did you mean `wrap`\?/);
    expect(() => parseCss('@keyframes k { to { display: block } }')).toThrow(/@keyframes k: `block` isn't a `display` value/);
    expect(() => parseCss('.x { text-align: inherit; flex-wrap: wrap }')).not.toThrow();
  });
  it('runtime vars substitute, and win over :root', () => {
    const src = ':root { --touch-size: 1px; --a: 2px } .x { width: var(--touch-size); height: var(--a) }';
    const decl = (runtime?: Record<string, string>) => parseCss(src, runtime).rules[0]!.decls;
    expect(decl()).toEqual({ width: '1px', height: '2px' });
    expect(decl({ '--touch-size': '60px' })).toEqual({ width: '60px', height: '2px' });
    expect(parseCss('.x { width: var(--touch-size) }', { '--touch-size': '52px' }).rules[0]!.decls.width).toBe('52px');
  });
});
