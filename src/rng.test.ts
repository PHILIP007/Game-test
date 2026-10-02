import { expect, test } from 'vitest';
import { rand, shuffle } from './rng';

test('rng is deterministic per seed', () => {
  const a = { seed: 42 }, b = { seed: 42 };
  expect([rand(a), rand(a)]).toEqual([rand(b), rand(b)]);
  expect(shuffle({ seed: 1 }, [1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
});
