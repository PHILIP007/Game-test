// HUD bindings: store data in, action handlers out. Nothing else lives here (screen-imports.test.ts).
import { use } from '../decl/engine';
import { weaponDef } from '../content';
import * as Actions from '../actions';
import { canFire, isAuto, readiness } from '../game';
import { game, ui } from '../store';
import { T } from '../tuning';
import { emptySlot, screenUi, weapon } from './shared';
import hudKdl from './hud.kdl?raw';
import hudCss from './hud.css?raw';

export const hudUi = screenUi(hudKdl, hudCss);
if (import.meta.hot) import.meta.hot.accept(['./hud.kdl?raw', './hud.css?raw'], ([k, c]) => hudUi.reload(k?.default, c?.default));

/** The cooldown bars move in steps this fine, so the HUD redraws a handful of times a second, not every frame. */
const BAR_STEPS = 10;

export function drawHud() {
  const { screen } = ui.getState(), { run } = game.getState();
  if (screen !== 'run' || run.phase === 'shop') return hudUi.show(null); // the shop shows the points and mounts itself
  const p = run.player;
  hudUi.show(use('hud', {
    hearts: p.hp,
    maxHearts: T.PLAYER_HP,
    wave: `WAVE ${run.wave}`,
    pennies: `${run.points}¢`,
    score: `SCORE ${run.score}`,
  }, {
    slots: run.mounts.map((m, i) => {
      if (!m.weapon) return emptySlot(`slot${i}`);
      const tag = `${weaponDef(m.weapon).cooldownS}s`, charge = Math.floor(readiness(m) * BAR_STEPS) / BAR_STEPS;
      if (isAuto(i)) return weapon(m.weapon, undefined, { key: `slot${i}`, tag, charge, foot: 'AUTO' });
      const ready = canFire(run, i);
      return weapon(m.weapon, () => Actions.fireWeapon(i), { key: `slot${i}`, tag, charge, foot: ready ? `READY · PRESS ${i + 1}` : `KEY ${i + 1}`, ready });
    }),
  }));
}
