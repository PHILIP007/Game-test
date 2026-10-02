// The rules, pure: (state, ...args) -> next state. Randomness is the seed in the state, time arrives as `dtS`; nothing
// here touches the renderer, the store, the DOM or storage (src/core-purity.test.ts holds that line). Each transition
// leaves `events` describing what just happened, and the shell animates from those.
//
// A run: waves of enemies come in from the arena's edge (content/waves.kdl). The kid carries weapons in mounts
// (content/weapons.kdl), each on its own cooldown: the first mount fires at the cursor by itself, the others when
// you call them (fireWeapon) once they're ready. Kills pay points; clear a wave and
// the shop offers weapons to buy with them, and buys back the ones you carry.
import { z } from 'zod';
import { SHOP_IDS, STARTING_WEAPONS, WAVES, enemyDef, weaponDef } from './content';
import { pick, rand, shuffle, type Rng } from './rng';
import { T } from './tuning';
import { freeMount, mountedCount } from './weapons';
import { clampToArena, dist, fire, inArena, toward, unit, type Enemy, type GameEvent, type GameState, type Mount, type Shot, type Vec } from './world';

export type { GameState, GameEvent, Enemy, Mount, Shot, Vec } from './world';

/** What the kid asks for this step: a move direction (length up to 1) and the world point the cursor is over. */
export type Input = { move: Vec; aim: Vec };
export const IDLE: Input = { move: { x: 0, y: 0 }, aim: { x: 1, y: 0 } };

/** Which entry of content/waves.kdl wave n plays, and how many times the list has gone round before it. */
export const waveDef = (wave: number) => ({ def: WAVES[(wave - 1) % WAVES.length]!, lap: Math.floor((wave - 1) / WAVES.length) });

export function newGame(seed: number): GameState {
  const mounts: Mount[] = Array.from({ length: T.STOMACH_SLOTS }, (_, i) => ({ weapon: STARTING_WEAPONS[i] ?? '', cooldownS: 0 }));
  const s: GameState = {
    seed, phase: 'fight', wave: 0, queue: [], spawnS: 0,
    player: { x: 0, y: 0, hp: T.PLAYER_HP, aim: { x: 1, y: 0 }, graceS: 0, shieldS: 0 },
    enemies: [], shots: [], mounts, offer: [],
    points: 0, score: 0, kills: 0, nextId: 1, events: [],
  };
  return startWave(s, 1);
}

/** Wave n begins: a little health back, the arena empty, every weapon ready. */
function startWave(s: GameState, wave: number): GameState {
  const { def } = waveDef(wave);
  const hp = wave === 1 ? s.player.hp : Math.min(T.PLAYER_HP, s.player.hp + T.WAVE_HEAL);
  return {
    ...s, phase: 'fight', wave, queue: def.queue, spawnS: def.gapS,
    player: { ...s.player, hp, graceS: 0, shieldS: 0 },
    enemies: [], shots: [], offer: [], mounts: s.mounts.map((m) => ({ ...m, cooldownS: 0 })),
  };
}

// ---------- a step of the fight ----------

/** dtS seconds of the fight. Outside a fight it's a no-op (the same state back). */
export function step(s: GameState, dtS: number, input: Input): GameState {
  if (s.phase !== 'fight') return s;
  let n: GameState = { ...s, events: [] };
  n = movePilot(n, dtS, input);
  n = fireMounts(n, dtS);
  n = spawn(n, dtS);
  n = actEnemies(n, dtS);
  n = moveShots(n, dtS);
  n = collide(n);
  if (n.player.hp <= 0) return { ...n, phase: 'dead', player: { ...n.player, hp: 0 }, events: [...n.events, { type: 'died' }] };
  if (!n.queue.length && !n.enemies.length) return openShop(n);
  return n;
}

function movePilot(s: GameState, dtS: number, { move, aim }: Input): GameState {
  const p = s.player, m = Math.hypot(move.x, move.y) > 1 ? unit(move) : move;
  const at = clampToArena({ x: p.x + m.x * T.PLAYER_SPEED_U_S * dtS, y: p.y + m.y * T.PLAYER_SPEED_U_S * dtS }, T.PLAYER_R_U);
  const down = (v: number) => Math.max(0, v - dtS);
  return { ...s, player: { ...p, ...at, aim: dist(at, aim) > 0.05 ? toward(at, aim) : p.aim, graceS: down(p.graceS), shieldS: down(p.shieldS) } };
}

/** Whether the weapon in mount `i` fires by itself (the first AUTO_SLOTS) rather than when you call it. */
export const isAuto = (i: number) => i < T.AUTO_SLOTS;

/** A weapon goes off: its words run and its cooldown starts again. */
function shoot(s: GameState, i: number): GameState {
  const m = s.mounts[i]!, d = weaponDef(m.weapon);
  const n = d.effects.reduce((acc, fx) => fx(acc, m.weapon), s);
  const mounts = n.mounts.slice();
  mounts[i] = { ...m, cooldownS: d.cooldownS };
  return { ...n, mounts };
}

/**
 * Every mounted weapon counts its cooldown down. An automatic one fires as soon as it's ready, unless no enemy is on
 * the field (then it holds its fire); the others stay ready until you call them (fireWeapon).
 */
function fireMounts(s: GameState, dtS: number): GameState {
  let n: GameState = { ...s, mounts: s.mounts.map((m) => (m.weapon ? { ...m, cooldownS: Math.max(0, m.cooldownS - dtS) } : m)) };
  n.mounts.forEach((m, i) => { if (m.weapon && isAuto(i) && m.cooldownS <= 0 && s.enemies.length) n = shoot(n, i); });
  return n;
}

/** Whether the weapon in mount `i` can be called now: mid-fight, a called (not automatic) mount, and ready. */
export const canFire = (s: GameState, i: number) => {
  const m = s.mounts[i];
  return s.phase === 'fight' && !isAuto(i) && !!m?.weapon && m.cooldownS <= 0;
};

/** Fire the weapon in mount `i` now (a click on its tile, or its key). Not ready, automatic or empty: no-op. */
export function fireWeapon(s: GameState, i: number): GameState {
  if (!canFire(s, i)) return s;
  return shoot({ ...s, events: [] }, i);
}

/** The next enemy of the wave's queue, on a random spot of the arena's edge. */
function spawn(s: GameState, dtS: number): GameState {
  const spawnS = s.spawnS - dtS;
  if (spawnS > 0 || !s.queue.length) return { ...s, spawnS };
  const rng: Rng = { seed: s.seed }, kind = s.queue[0]!, d = enemyDef(kind), { def, lap } = waveDef(s.wave);
  const hw = T.FLOOR_W_U / 2 - T.SPAWN_INSET_U, hh = T.FLOOR_H_U / 2 - T.SPAWN_INSET_U, along = rand(rng) * 2 - 1;
  const side = pick(rng, [0, 1, 2, 3]);
  const at = side === 0 ? { x: -hw, y: along * hh } : side === 1 ? { x: hw, y: along * hh } : side === 2 ? { x: along * hw, y: -hh } : { x: along * hw, y: hh };
  const hp = d.hp * (1 + lap * T.LAP_HP_STEP);
  const e: Enemy = { id: s.nextId, kind, ...at, hp, maxHp: hp, mode: 'walk', modeS: 0, v: { x: 0, y: 0 }, timers: {}, spin: rand(rng) < 0.5 ? -1 : 1 };
  return {
    ...s, seed: rng.seed, queue: s.queue.slice(1), spawnS: def.gapS, nextId: s.nextId + 1,
    enemies: [...s.enemies, e], events: [...s.events, { type: 'spawned', id: e.id, kind }],
  };
}

/** Every enemy runs its behaviour words in order; shots they fire join the arena. */
function actEnemies(s: GameState, dtS: number): GameState {
  let n = s;
  const target = { x: s.player.x, y: s.player.y };
  const enemies = s.enemies.map((e0) => {
    let e = e0;
    for (const b of enemyDef(e.kind).behaviours) {
      const act = b.run(e, { target, dtS });
      e = act.e;
      if (act.events.length) n = { ...n, events: [...n.events, ...act.events] };
      n = fire(n, 'foe', act.shots);
    }
    return e;
  });
  return { ...n, enemies };
}

function moveShots(s: GameState, dtS: number): GameState {
  const shots = s.shots
    .map((b) => ({ ...b, x: b.x + b.v.x * dtS, y: b.y + b.v.y * dtS, lifeS: b.lifeS - dtS }))
    .filter((b) => b.lifeS > 0 && inArena(b));
  return { ...s, shots };
}

/** Shots against enemies and the kid, and enemies against the kid. Kills pay out their drop words. */
function collide(s: GameState): GameState {
  const events: GameEvent[] = [...s.events];
  const hp = new Map(s.enemies.map((e) => [e.id, e.hp]));
  let pilotDamage = 0;
  const shots: Shot[] = [];
  for (const b of s.shots) {
    if (b.from === 'foe') {
      if (dist(b, s.player) < b.r + T.PLAYER_R_U) { pilotDamage += b.damage; continue; }
      shots.push(b);
      continue;
    }
    let spent = false;
    const hit = b.hit.slice();
    for (const e of s.enemies) {
      const left = hp.get(e.id)!;
      if (left <= 0 || hit.includes(e.id) || dist(b, e) >= b.r + enemyDef(e.kind).r) continue;
      hp.set(e.id, left - b.damage);
      events.push({ type: 'struck', id: e.id, damage: b.damage });
      hit.push(e.id);
      if (!b.pierce) { spent = true; break; }
    }
    if (!spent) shots.push({ ...b, hit });
  }
  for (const e of s.enemies) {
    const d = enemyDef(e.kind);
    if ((hp.get(e.id) ?? 0) > 0 && d.touch && dist(e, s.player) < d.r + T.PLAYER_R_U) pilotDamage = Math.max(pilotDamage, d.touch);
  }
  let n: GameState = { ...s, shots, events, enemies: s.enemies.filter((e) => hp.get(e.id)! > 0).map((e) => ({ ...e, hp: hp.get(e.id)! })) };
  for (const e of s.enemies) {
    if (hp.get(e.id)! > 0) continue;
    n = enemyDef(e.kind).drops.reduce((acc, drop) => drop.apply(acc), n);
    n = { ...n, kills: n.kills + 1, events: [...n.events, { type: 'killed', id: e.id, kind: e.kind, x: e.x, y: e.y }] };
  }
  return pilotDamage ? hurt(n, pilotDamage) : n;
}

/** The kid takes `damage`, unless still untouchable from the last hit, a dash or a shield. */
function hurt(s: GameState, damage: number): GameState {
  if (s.player.graceS > 0) return s;
  return { ...s, player: { ...s.player, hp: s.player.hp - damage, graceS: T.HURT_GRACE_S }, events: [...s.events, { type: 'hurt', damage }] };
}

/** The wave is cleared: shots vanish and the shop opens with a few weapons on offer. */
function openShop(s: GameState): GameState {
  const rng: Rng = { seed: s.seed };
  const offer = shuffle(rng, SHOP_IDS).slice(0, T.OFFER_SIZE);
  return { ...s, seed: rng.seed, phase: 'shop', shots: [], offer, events: [...s.events, { type: 'cleared', wave: s.wave }] };
}

// ---------- the shop ----------

/** How far round a mount's cooldown is: 0 just fired, 1 ready (an empty mount: 0). */
export const readiness = (m: Mount) => (m.weapon ? 1 - m.cooldownS / weaponDef(m.weapon).cooldownS : 0);

/** What a weapon pays back when sold. */
export const sellPrice = (weapon: string) => Math.floor(weaponDef(weapon).price * T.SELL_BACK);

/** Why a weapon on offer can't be bought right now, or null when it can. */
export function cantBuy(s: GameState, weapon: string): 'points' | 'mounts' | null {
  if (s.points < weaponDef(weapon).price) return 'points';
  if (freeMount(s.mounts) < 0) return 'mounts';
  return null;
}

/** Whether the weapon in `mount` can be sold: in the shop, and never the last one you carry. */
export const canSell = (s: GameState, mount: number) => s.phase === 'shop' && !!s.mounts[mount]?.weapon && mountedCount(s.mounts) > 1;

/** Buy a weapon on offer into the first free mount, and the next wave begins. Not on offer or not affordable: no-op. */
export function buy(s: GameState, weapon: string): GameState {
  if (s.phase !== 'shop' || !s.offer.includes(weapon) || cantBuy(s, weapon)) return s;
  const at = freeMount(s.mounts), mounts = s.mounts.slice();
  mounts[at] = { weapon, cooldownS: 0 };
  const n = { ...s, mounts, points: s.points - weaponDef(weapon).price };
  return startWave({ ...n, events: [{ type: 'bought', weapon, mount: at }] }, s.wave + 1);
}

/** Sell the weapon in `mount` for SELL_BACK of its price, freeing the mount. The shop stays open. Not sellable: no-op. */
export function sell(s: GameState, mount: number): GameState {
  if (!canSell(s, mount)) return s;
  const weapon = s.mounts[mount]!.weapon, points = sellPrice(weapon), mounts = s.mounts.slice();
  mounts[mount] = { weapon: '', cooldownS: 0 };
  return { ...s, mounts, points: s.points + points, events: [{ type: 'sold', weapon, mount, points }] };
}

/** Leave the shop without buying: the next wave begins, your points kept for later. */
export function nextWave(s: GameState): GameState {
  if (s.phase !== 'shop') return s;
  return startWave({ ...s, events: [] }, s.wave + 1);
}

// ---------- meta: what outlives a run (saved by the store; zod checks a save on load, saves are untrusted) ----------

export const MetaSchema = z.object({
  best: z.number().int().nonnegative(),
  bestWave: z.number().int().nonnegative(),
  runs: z.number().int().nonnegative(),
});
export type Meta = z.infer<typeof MetaSchema>;

export const newMeta = (): Meta => ({ best: 0, bestWave: 0, runs: 0 });

/** A finished run folded into the records. */
export const recordRun = (m: Meta, s: GameState): Meta =>
  ({ best: Math.max(m.best, s.score), bestWave: Math.max(m.bestWave, s.wave), runs: m.runs + 1 });

/** A save's meta, or null when it isn't one. */
export const parseMeta = (raw: unknown): Meta | null => { const r = MetaSchema.safeParse(raw); return r.success ? r.data : null; };
