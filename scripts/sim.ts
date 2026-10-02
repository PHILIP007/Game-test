// Balance sim: `npm run sim [runs] [max_minutes]`. Plays whole runs headless on the pure core with a simple bot and
// prints how far it gets. The bot backs away from the nearest enemy, aims at it, plays the leftmost card it can pay
// for once a second, and always takes the first card on offer. A run that reaches max_minutes stops there.
import { IDLE, newGame, pickReward, playCard, playable, step, type GameState } from '../src/game';
import { T } from '../src/tuning';

declare const process: { argv: string[] };
const runs = Number(process.argv[2] ?? 20), maxMin = Number(process.argv[3] ?? 10);
const STEP_S = 1 / 60;

function bot(s: GameState) {
  const p = s.player;
  const near = s.enemies.reduce<GameState['enemies'][number] | null>((a, e) => (!a || Math.hypot(e.x - p.x, e.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y) ? e : a), null);
  if (!near) return { ...IDLE, aim: { x: p.x + 1, y: p.y } };
  const dx = p.x - near.x, dy = p.y - near.y, d = Math.hypot(dx, dy) || 1;
  // Back off when close, and drift towards the centre so the walls don't pin it.
  const away = d < 5 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 };
  return { move: { x: away.x - p.x * 0.05, y: away.y - p.y * 0.05 }, aim: { x: near.x, y: near.y } };
}

const waves: number[] = [], scores: number[] = [];
for (let seed = 1; seed <= runs; seed++) {
  let s = newGame(seed), t = 0, nextCardS = 1;
  while (s.phase !== 'dead' && t < maxMin * 60) {
    if (s.phase === 'reward') { s = pickReward(s, s.offer[0]!); continue; }
    s = step(s, STEP_S, bot(s));
    t += STEP_S;
    if (t >= nextCardS) {
      nextCardS = t + 1;
      const slot = s.hand.findIndex((_, i) => playable(s, i));
      if (slot >= 0) s = playCard(s, slot);
    }
  }
  waves.push(s.wave); scores.push(s.score);
}
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
console.log(`${runs} runs (hp ${T.PLAYER_HP}): wave reached median ${med(waves)}, min ${Math.min(...waves)}, max ${Math.max(...waves)}; score median ${med(scores)}`);
