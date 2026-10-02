// Every number a rule reads. Units are in the name: world units (U, one unit is about a metre), seconds (S), per
// second (_S at the end of a rate: U_S is units per second). Content (which weapons and enemies exist, what they
// cost and do, what each wave sends) lives in content/*.kdl; look numbers live in screens/shared.css.

export const T = {
  // ---------- the nightmare floor: a rectangle centred on the origin; nothing leaves it ----------
  FLOOR_W_U: 24,
  FLOOR_H_U: 14,

  // ---------- the kid ----------
  PLAYER_R_U: 0.45,
  PLAYER_SPEED_U_S: 7,
  PLAYER_HP: 8,
  /** After a hit, this long untouchable, so one crowd doesn't drain the whole bar in a frame. */
  HURT_GRACE_S: 0.8,

  // ---------- what comes out of the kid's mouth (each weapon's cooldown and price are in content/weapons.kdl) ----------
  SHOT_SPEED_U_S: 22,
  /** A `pierce` shot (the tooth): faster than a gob, and it goes through everything it meets. */
  PIERCE_SPEED_U_S: 34,
  SHOT_R_U: 0.15,
  SHOT_LIFE_S: 1.6,

  // ---------- enemy fire ----------
  FOE_SHOT_R_U: 0.2,
  FOE_SHOT_DAMAGE: 1,
  FOE_SHOT_LIFE_S: 4,

  // ---------- the squealer's lunge: it stops and shakes, then goes ----------
  LUNGE_WINDUP_S: 0.55,
  LUNGE_S: 0.45,

  // ---------- the stomach and the shop ----------
  /** Things the kid can have swallowed at once (stomach slots), each on its own cooldown. */
  STOMACH_SLOTS: 4,
  /** The first this many slots spit by themselves whenever their cooldown comes round; the rest only when you call
   *  them (click the tile, or press its number), so when to use them is your skill. */
  AUTO_SLOTS: 1,
  /** Things on offer in the shop after a cleared wave; you swallow one or move on. */
  OFFER_SIZE: 3,
  /** Coughing something up pays back this fraction of its price (rounded down), so swapping costs something. */
  SELL_BACK: 0.5,

  // ---------- waves ----------
  /** Enemies crawl in at the floor's edge, this far inside it. */
  SPAWN_INSET_U: 0.6,
  /** Hearts back at the start of each wave, so a long run isn't lost to chip damage alone. */
  WAVE_HEAL: 1,
  /** After the last wave in content/waves.kdl the list repeats; each lap, enemies have this much more health (0.5 = +50%). */
  LAP_HP_STEP: 1.0,
} as const;
