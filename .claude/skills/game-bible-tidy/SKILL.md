---
name: game-bible-tidy
description: Audit and fix a game repo against the game-bible without changing how the game plays. Use when a game has drifted: after a retheme, a burst of agent work, or when values, names or layout have leaked into source code. Trigger phrases: "tidy the game", "fix my repo", "game-bible tidy", "/game-bible-tidy".
---

# Game-bible tidy

A tidy brings a game repo back to what the game-bible promises, the way `go mod tidy` brings a module back to what its imports claim. The game plays exactly the same afterwards. What changes is who can read it: every value the designer might tweak sits in its tweak-map home, and every name tells the truth about the game as it is today.

Load the `game-bible` skill first; this skill applies its tweak map, its designer test and its readable-files rules. Then read the repo's catalog (`docs/declarative-ui.md`).

## 1. Sweep

Go through **every** file under `src/`, `content/`, `models/`, `screens/` and `docs/`, and log each finding in a ledger (file:line, what it is, its tweak-map home). Three kinds:

- **Hidden tweakables**: a value the designer might change, living in `.ts` or a shader: a hue (a hex code or colour `vec3`), a look number (fog, light, rim, exposure, camera), a layout (where things stand, how many), a content value (names, blurbs, stats). Math constants, neutral black and white, and unit conversions stay where they are.
- **Names that lie**: an id, token, class, model, file, story or test name from an earlier theme or an earlier design (`enemy "drone" name="Skeleton"`, `--warp` in a forest). The name the designer reads must match the thing on screen.
- **Unreadable files**: a KDL or CSS file with no header saying what lives there and its words' units, a catalog row that disagrees with the code, a word in the catalog nothing uses.

The sweep is done when every file has been opened and the ledger names a home for every finding.

## 2. Fix, in this order

1. **Homes first.** A finding with no tweak-map row gets its row and its home (a palette or `--look-*` token, a content kind, a `tuning.ts` entry) in its own commit, catalog row included, before anything moves into it.
2. **Moves.** Each hidden tweakable moves to its home and the source reads it from there. One commit per kind of move.
3. **Renames.** Every lying name changes everywhere at once: content, palette, stories, tests, catalog, model files. A rename is mechanical; the diff shows only names.
4. **Headers and catalog.** Every KDL and CSS file gets its header; the catalog matches the code; unused words leave.

Rules and numbers stay exactly as they are: a tidy never retunes, rebalances or redesigns. A value that looks wrong goes in the report for the designer to decide.

## 3. Prove nothing changed

- Typecheck, unit tests and story tests pass, with the same test count or more.
- Screenshots of the same stories before and after match. Where a move or rename changed pixels, find out why and fix it; the only allowed differences are names in on-screen text the rename intended.
- The sim (if the game has one) reports the same results for the same seed.

## 4. Report

The ledger, grouped by kind: what moved where, what was renamed, which homes and tweak-map rows are new. Then the values that looked wrong but were left alone for the designer. Then test output tails and the screenshot comparison result.
