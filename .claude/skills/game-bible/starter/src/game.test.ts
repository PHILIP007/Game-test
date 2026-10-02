import { describe, expect, it } from 'vitest';
import { THINGS } from './content';
import { collect, newGame, parseMeta, recordGame } from './game';
import { T } from './tuning';

describe('game', () => {
  it('a new game is the same batch for the same seed', () => {
    expect(newGame(7)).toEqual(newGame(7));
    expect(newGame(7).things).toHaveLength(T.BATCH_SIZE);
  });
  it('collecting scores the thing\'s reward words and says so in events', () => {
    const s = newGame(3), t = s.things[0]!;
    const next = collect(s, t.id);
    expect(next.things.map((x) => x.id)).not.toContain(t.id);
    expect(next.events).toEqual([{ type: 'collected', id: t.id, kind: t.kind, points: next.score }]);
    expect(next.score).toBeGreaterThan(0);
  });
  it('an unknown id is a no-op (same reference)', () => {
    const s = newGame(3);
    expect(collect(s, -1)).toBe(s);
  });
  it('the last thing of a batch brings a fresh batch', () => {
    let s = newGame(5);
    for (const t of s.things) s = collect(s, t.id);
    expect(s.events.at(-1)).toEqual({ type: 'cleared' });
    expect(s.things).toHaveLength(T.BATCH_SIZE);
    expect(s.things[0]!.id).toBe(T.BATCH_SIZE + 1);
  });
  it('meta keeps the best score; a bad save is rejected', () => {
    expect(recordGame({ best: 10, games: 1 }, 4)).toEqual({ best: 10, games: 2 });
    expect(parseMeta({ best: -1, games: 0 })).toBeNull();
  });
  it('content parses with its reward words', () => {
    expect(THINGS.gem!.rewards[0]!(0)).toBe(5);
  });
});
