// Every number a rule reads. Units are in the name: world units (U, one unit is about a metre), seconds (S), per
// second (_S at the end of a rate: U_S is units per second), degrees (DEG). Content (which cards and enemies exist,
// what they cost and do, what each wave sends) lives in content/*.kdl; look numbers live in screens/shared.css.

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

  // ---------- the blaster: always firing at the cursor, so the cards are the decisions ----------
  BLASTER_COOLDOWN_S: 0.28,
  /** The blaster under a `rapid` card: this fraction of the normal cooldown. */
  RAPID_COOLDOWN_SCALE: 0.35,
  BLASTER_DAMAGE: 1,
  SHOT_SPEED_U_S: 18,
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

  // ---------- energy: what cards cost; it refills on its own ----------
  ENERGY_MAX: 5,
  ENERGY_START: 3,
  ENERGY_PER_S: 0.8,

  // ---------- the deck ----------
  HAND_SIZE: 4,
  /** Cards shown after a cleared wave; you take one or skip. */
  OFFER_SIZE: 3,
  /** A `dash` leaves you untouchable this long, so dashing through a crowd is safe. */
  DASH_GRACE_S: 0.25,

  // ---------- waves ----------
  /** Enemies appear on the arena's edge, this far inside it. */
  SPAWN_INSET_U: 0.6,
  /** Health back at the start of each wave, so a long run isn't lost to chip damage alone. */
  WAVE_HEAL: 1,
  /** After the last wave in content/waves.kdl the list repeats; each lap, enemies have this much more health (0.5 = +50%). */
  LAP_HP_STEP: 0.5,
} as const;
