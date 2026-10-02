// The rules, pure: (state, ...args) -> next state. Randomness is the seed in the state, time arrives as `dtS`; nothing
// here touches the renderer, the store, the DOM or storage (src/core-purity.test.ts holds that line). Each transition
// leaves `events` describing what just happened, and the shell animates from those.
//
// A run: waves of enemies come in from the arena's edge (content/waves.kdl). The blaster fires at the cursor on its
// own; cards from your hand (content/cards.kdl) cost energy, which refills over time. A played card goes to the
// discard and the next card takes its slot. Clear a wave and you pick a card to add to your deck.
import { z } from 'zod';
import { allCards, drawCards } from './cards';
import { CARD_IDS, STARTING_DECK, WAVES, cardDef, enemyDef } from './content';
import { pick, rand, shuffle, type Rng } from './rng';
import { T } from './tuning';
import { clampToArena, dist, fire, inArena, toward, unit, type Enemy, type GameEvent, type GameState, type Shot, type Vec } from './world';

export type { GameState, GameEvent, Enemy, Shot, Vec } from './world';

/** What the pilot asks for this step: a move direction (length up to 1) and the world point the cursor is over. */
export type Input = { move: Vec; aim: Vec };
export const IDLE: Input = { move: { x: 0, y: 0 }, aim: { x: 1, y: 0 } };

/** Which entry of content/waves.kdl wave n plays, and how many times the list has gone round before it. */
export const waveDef = (wave: number) => ({ def: WAVES[(wave - 1) % WAVES.length]!, lap: Math.floor((wave - 1) / WAVES.length) });

export function newGame(seed: number): GameState {
  const rng: Rng = { seed };
  const s: GameState = {
    seed: 0, phase: 'fight', wave: 0, queue: [], spawnS: 0,
    player: { x: 0, y: 0, hp: T.PLAYER_HP, energy: T.ENERGY_START, aim: { x: 1, y: 0 }, graceS: 0, shieldS: 0, rapidS: 0, cooldownS: 0 },
    enemies: [], shots: [],
    deck: shuffle(rng, STARTING_DECK), hand: Array<string>(T.HAND_SIZE).fill(''), discard: [], offer: [],
    score: 0, kills: 0, nextId: 1, events: [],
  };
  return startWave({ ...s, seed: rng.seed }, 1);
}

/** Wave n begins: every card back in the deck, shuffled, a fresh hand, a little health back, the arena empty. */
function startWave(s: GameState, wave: number): GameState {
  const rng: Rng = { seed: s.seed }, { def } = waveDef(wave);
  const deck = shuffle(rng, allCards(s));
  const hp = wave === 1 ? s.player.hp : Math.min(T.PLAYER_HP, s.player.hp + T.WAVE_HEAL);
  return drawCards({
    ...s, seed: rng.seed, phase: 'fight', wave, queue: def.queue, spawnS: def.gapS,
    player: { ...s.player, hp, energy: Math.max(s.player.energy, T.ENERGY_START) },
    enemies: [], shots: [], deck, hand: s.hand.map(() => ''), discard: [], offer: [],
  });
}

// ---------- a step of the fight ----------

/** dtS seconds of the fight. Outside a fight it's a no-op (the same state back). */
export function step(s: GameState, dtS: number, input: Input): GameState {
  if (s.phase !== 'fight') return s;
  let n: GameState = { ...s, events: [] };
  n = movePilot(n, dtS, input);
  n = spawn(n, dtS);
  n = actEnemies(n, dtS);
  n = moveShots(n, dtS);
  n = collide(n);
  if (n.player.hp <= 0) return { ...n, phase: 'dead', player: { ...n.player, hp: 0 }, events: [...n.events, { type: 'died' }] };
  if (!n.queue.length && !n.enemies.length) return offerCards(n);
  return n;
}

function movePilot(s: GameState, dtS: number, { move, aim }: Input): GameState {
  const p = s.player, m = Math.hypot(move.x, move.y) > 1 ? unit(move) : move;
  const at = clampToArena({ x: p.x + m.x * T.PLAYER_SPEED_U_S * dtS, y: p.y + m.y * T.PLAYER_SPEED_U_S * dtS }, T.PLAYER_R_U);
  const down = (v: number) => Math.max(0, v - dtS);
  const player = {
    ...p, ...at,
    aim: dist(at, aim) > 0.05 ? toward(at, aim) : p.aim,
    energy: Math.min(T.ENERGY_MAX, p.energy + T.ENERGY_PER_S * dtS),
    graceS: down(p.graceS), shieldS: down(p.shieldS), rapidS: down(p.rapidS), cooldownS: p.cooldownS - dtS,
  };
  const n = { ...s, player };
  if (player.cooldownS > 0) return n;
  const cooldownS = T.BLASTER_COOLDOWN_S * (player.rapidS > 0 ? T.RAPID_COOLDOWN_SCALE : 1);
  return fire({ ...n, player: { ...player, cooldownS } }, 'blaster', [{ dir: player.aim, speed: T.SHOT_SPEED_U_S, damage: T.BLASTER_DAMAGE }]);
}

/** The next enemy of the wave's queue, on a random spot of the arena's edge. */
function spawn(s: GameState, dtS: number): GameState {
  const spawnS = s.spawnS - dtS;
  if (spawnS > 0 || !s.queue.length) return { ...s, spawnS };
  const rng: Rng = { seed: s.seed }, kind = s.queue[0]!, d = enemyDef(kind), { def, lap } = waveDef(s.wave);
  const hw = T.ARENA_W_U / 2 - T.SPAWN_INSET_U, hh = T.ARENA_H_U / 2 - T.SPAWN_INSET_U, along = rand(rng) * 2 - 1;
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

/** Shots against enemies and the pilot, and enemies against the pilot. Kills pay out their drop words. */
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

/** The pilot takes `damage`, unless still untouchable from the last hit, a dash or a shield. */
function hurt(s: GameState, damage: number): GameState {
  if (s.player.graceS > 0) return s;
  return { ...s, player: { ...s.player, hp: s.player.hp - damage, graceS: T.HURT_GRACE_S }, events: [...s.events, { type: 'hurt', damage }] };
}

/** The wave is cleared: shots vanish and a few cards are on offer. */
function offerCards(s: GameState): GameState {
  const rng: Rng = { seed: s.seed };
  const offer = shuffle(rng, CARD_IDS).slice(0, T.OFFER_SIZE);
  return { ...s, seed: rng.seed, phase: 'reward', shots: [], offer, events: [...s.events, { type: 'cleared', wave: s.wave }] };
}

// ---------- cards ----------

/** Whether the card in `slot` can be played now. */
export const playable = (s: GameState, slot: number) => {
  const id = s.hand[slot];
  return s.phase === 'fight' && !!id && s.player.energy >= cardDef(id).cost;
};

/** Play the card in `slot`: pay its energy, draw its replacement, then run its words. Not playable: no-op. */
export function playCard(s: GameState, slot: number): GameState {
  if (!playable(s, slot)) return s;
  const id = s.hand[slot]!, d = cardDef(id);
  const hand = s.hand.slice();
  hand[slot] = '';
  let n: GameState = {
    ...s, hand, discard: [...s.discard, id],
    player: { ...s.player, energy: s.player.energy - d.cost },
    events: [...s.events, { type: 'played', card: id, slot }],
  };
  n = drawCards(n);
  return d.effects.reduce((acc, fx) => fx(acc, id), n);
}

/** Take a card from the offer into the deck (or skip with null), and the next wave begins. Not on offer: no-op. */
export function pickReward(s: GameState, card: string | null): GameState {
  if (s.phase !== 'reward' || (card !== null && !s.offer.includes(card))) return s;
  const n = card === null ? s : { ...s, discard: [...s.discard, card] };
  return startWave({ ...n, events: [] }, s.wave + 1);
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
