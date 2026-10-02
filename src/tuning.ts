// Every number a rule reads. Units are in the name: world units (U, one unit is about a metre), seconds (S), per
// second (_S at the end of a rate: U_S is units per second). Content (which weapons and enemies exist, what they
// cost and do, what each wave sends) lives in content/*.kdl; look numbers live in screens/shared.css.

export const T = {
  // ---------- the arena: a rectangle centred on the origin; nothing leaves it ----------
  ARENA_W_U: 24,
  ARENA_H_U: 14,

  // ---------- the pilot ----------
  PLAYER_R_U: 0.45,
  PLAYER_SPEED_U_S: 7,
  PLAYER_HP: 8,
  /** After a hit, this long untouchable, so one crowd doesn't drain the whole bar in a frame. */
  HURT_GRACE_S: 0.8,

  // ---------- weapon fire (each weapon's cooldown and price are in content/weapons.kdl) ----------
  SHOT_SPEED_U_S: 22,
  /** A `rail` slug: faster than a shot, and it goes through everything it meets. */
  RAIL_SPEED_U_S: 34,
  SHOT_R_U: 0.15,
  SHOT_LIFE_S: 1.6,

  // ---------- enemy fire ----------
  FOE_SHOT_R_U: 0.2,
  FOE_SHOT_DAMAGE: 1,
  FOE_SHOT_LIFE_S: 4,

  // ---------- the charger's lunge: it stops and shakes, then goes ----------
  LUNGE_WINDUP_S: 0.55,
  LUNGE_S: 0.45,

  // ---------- mounts and the shop ----------
  /** Weapons the pilot can carry at once, each on its own cooldown. */
  MOUNTS: 4,
  /** The first this many mounts fire by themselves whenever their cooldown comes round; the rest fire only when you
   *  call them (click the tile, or press its number), so when to use them is your skill. */
  AUTO_MOUNTS: 1,
  /** Weapons on offer in the shop after a cleared wave; you buy one or move on. */
  OFFER_SIZE: 3,
  /** A sold weapon pays back this fraction of its price (rounded down), so swapping costs something. */
  SELL_BACK: 0.5,

  // ---------- waves ----------
  /** Enemies appear on the arena's edge, this far inside it. */
  SPAWN_INSET_U: 0.6,
  /** Health back at the start of each wave, so a long run isn't lost to chip damage alone. */
  WAVE_HEAL: 1,
  /** After the last wave in content/waves.kdl the list repeats; each lap, enemies have this much more health (0.5 = +50%). */
  LAP_HP_STEP: 1.0,
} as const;
