import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { combinators, loadKdl, tunedText } from './content-load';

describe('loadKdl', () => {
  const load = (src: string) => loadKdl(src, { a: z.object({ id: z.string(), n: z.number() }) }).a;
  it('throws on syntax errors with a position', () => {
    expect(() => load('a "x" {')).toThrow(/syntax error at \d+:\d+/);
  });
  it('names the node and field of a malformed node', () => {
    expect(() => load('a "x" n="lots"')).toThrow(/a "x": n:/);
  });
  const two = { a: z.object({ id: z.string(), n: z.number() }), b: z.object({ id: z.string() }) };
  it('splits kinds into records, in file order', () => {
    const r = loadKdl('b "y"\na "x" n=1\nb "w"\na "z" n=2', two);
    expect(Object.keys(r.a)).toEqual(['x', 'z']);
    expect(Object.keys(r.b)).toEqual(['y', 'w']);
  });
  it('gives the schema the node id', () => {
    expect(loadKdl('a "x" n=1', two).a.x).toEqual({ id: 'x', n: 1 });
  });
  it('rejects a duplicate id across kinds', () => {
    expect(() => loadKdl('a "x" n=1\nb "x"', two)).toThrow('b "x": duplicate id');
  });
  it('lists every kind for an unknown node', () => {
    expect(() => loadKdl('c "x"', two)).toThrow('expected node "a" or "b", found "c"');
  });
});

describe('combinators', () => {
  const s = combinators({ one: (n: number) => n, none: () => 0 }, 'thing');
  const run = (name: string, args: unknown[]) => s.safeParse([{ name, args, props: {} }]);
  it('names the known ones for an unknown combinator', () => {
    expect(run('two', []).error!.issues[0]!.message).toBe('unknown thing "two" (known: one, none)');
  });
  it('checks arity', () => {
    expect(run('one', []).error!.issues[0]!.message).toBe('thing "one": expected 1 number argument(s)');
    expect(run('one', [4]).data).toEqual([4]);
  });
  it('does not reach inherited object props', () => {
    expect(run('toString', []).error!.issues[0]!.message).toBe('unknown thing "toString" (known: one, none)');
  });
});

describe('tunedText', () => {
  const s = tunedText({ A: 3, B: { x: [1, 7] } });
  it('resolves placeholders from the table', () => {
    expect(s.parse('-{A} and +{B.x.1}')).toBe('-3 and +7');
    expect(s.parse('plain')).toBe('plain');
  });
  it('names an unknown path', () => {
    expect(s.safeParse('{B.y}').error!.issues[0]!.message).toBe('unknown tuning "{B.y}"');
  });
});
