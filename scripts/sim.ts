// Balance sim: `npm run sim [runs] [max_minutes]`. Plays whole runs headless on the pure core with a simple bot and
// prints how far it gets. The bot backs away from the nearest enemy, aims at it, and calls each other thing as soon
// as it's ready (a human picks their moments, so they should do better); in the shop it buys the dearest
// thing it can afford (selling the spit for room when the slots are full), else moves on. A run that reaches
// max_minutes stops there.
import { buy, canFire, cantBuy, fireWeapon, nextWave, newGame, IDLE, sell, step, type GameState } from '../src/game';
import { weaponDef } from '../src/content';
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

function shopBot(s: GameState): GameState {
  const want = [...s.offer].sort((a, b) => weaponDef(b).price - weaponDef(a).price).find((w) => cantBuy(s, w) !== 'points');
  if (!want) return nextWave(s);
  if (cantBuy(s, want) === 'mounts') {
    const spit = s.mounts.findIndex((m) => m.weapon === 'spit'), sold = spit >= 0 ? sell(s, spit) : s;
    return sold !== s && !cantBuy(sold, want) ? buy(sold, want) : nextWave(s);
  }
  return buy(s, want);
}

const waves: number[] = [], scores: number[] = [];
for (let seed = 1; seed <= runs; seed++) {
  let s = newGame(seed), t = 0;
  while (s.phase !== 'dead' && t < maxMin * 60) {
    if (s.phase === 'shop') { s = shopBot(s); continue; }
    s = step(s, STEP_S, bot(s));
    t += STEP_S;
    if (s.enemies.length) s.mounts.forEach((_, i) => { if (canFire(s, i)) s = fireWeapon(s, i); });
  }
  waves.push(s.wave); scores.push(s.score);
}
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
console.log(`${runs} runs (hp ${T.PLAYER_HP}): wave reached median ${med(waves)}, min ${Math.min(...waves)}, max ${Math.max(...waves)}; score median ${med(scores)}`);
