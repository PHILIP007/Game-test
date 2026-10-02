// Every number a rule reads. Units are in the name: world units (U, one unit is about a metre), seconds (S).
// Content (what things exist and what they're worth) lives in content/*.kdl; look numbers live in screens/shared.css.
// PLACEHOLDER: replace these with your game's numbers.

export const T = {
  // The field: a rectangle centred on the origin that things are scattered over.
  FIELD_W_U: 12,
  FIELD_H_U: 7,
  /** Things per batch: when the last one is collected, a fresh batch this size appears. */
  BATCH_SIZE: 5,
} as const;
