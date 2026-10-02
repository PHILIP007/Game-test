// HUD bindings: store data in, action handlers out. Nothing else lives here (screen-imports.test.ts).
import { use } from '../decl/engine';
import { weaponDef } from '../content';
import { readiness } from '../game';
import { game, ui } from '../store';
import { T } from '../tuning';
import { emptyMount, screenUi, weapon } from './shared';
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
    hull: p.hp / T.PLAYER_HP,
    hullText: `${p.hp}/${T.PLAYER_HP}`,
    wave: `WAVE ${run.wave}`,
    points: `${run.points} PTS`,
    score: `SCORE ${run.score}`,
  }, {
    mounts: run.mounts.map((m, i) => m.weapon
      ? weapon(m.weapon, undefined, { key: `mount${i}`, tag: `${weaponDef(m.weapon).cooldownS}s`, charge: Math.floor(readiness(m) * BAR_STEPS) / BAR_STEPS, foot: m.cooldownS > 0 ? '' : 'READY' })
      : emptyMount(`mount${i}`)),
  }));
}
