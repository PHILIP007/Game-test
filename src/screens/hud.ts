// HUD bindings: store data in, action handlers out. Nothing else lives here (screen-imports.test.ts).
import * as Actions from '../actions';
import { use } from '../decl/engine';
import { playable } from '../game';
import { game, ui } from '../store';
import { T } from '../tuning';
import { card, screenUi } from './shared';
import hudKdl from './hud.kdl?raw';
import hudCss from './hud.css?raw';

export const hudUi = screenUi(hudKdl, hudCss);
if (import.meta.hot) import.meta.hot.accept(['./hud.kdl?raw', './hud.css?raw'], ([k, c]) => hudUi.reload(k?.default, c?.default));

/** The energy bar moves in steps this fine, so the HUD redraws a few times a second rather than every frame. */
const BAR_STEPS = 40;

export function drawHud() {
  const { screen } = ui.getState(), { run } = game.getState();
  if (screen !== 'run') return hudUi.show(null);
  const p = run.player;
  hudUi.show(use('hud', {
    hull: p.hp / T.PLAYER_HP,
    hullText: `${p.hp}/${T.PLAYER_HP}`,
    wave: `WAVE ${run.wave}`,
    score: `SCORE ${run.score}`,
    energy: String(Math.floor(p.energy)),
    charge: Math.round((p.energy / T.ENERGY_MAX) * BAR_STEPS) / BAR_STEPS,
    deck: `DECK ${run.deck.length}`,
    discard: `DISCARD ${run.discard.length}`,
  }, {
    hand: run.hand.flatMap((id, slot) => id
      ? [card(id, () => Actions.playCard(slot), { key: `slot${slot}`, hotkey: String(slot + 1), off: !playable(run, slot) })]
      : []),
  }));
}
