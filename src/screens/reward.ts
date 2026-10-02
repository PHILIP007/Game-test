// Reward bindings: store data in, action handlers out. Nothing else lives here (screen-imports.test.ts).
import * as Actions from '../actions';
import { game, ui } from '../store';
import { btn, card, dialog, screenUi } from './shared';
import rewardKdl from './reward.kdl?raw';
import rewardCss from './reward.css?raw';

export const rewardUi = screenUi(rewardKdl, rewardCss);
if (import.meta.hot) import.meta.hot.accept(['./reward.kdl?raw', './reward.css?raw'], ([k, c]) => rewardUi.reload(k?.default, c?.default));

export function drawReward() {
  const { screen } = ui.getState(), { run } = game.getState();
  if (screen !== 'run' || run.phase !== 'reward') return rewardUi.show(null);
  rewardUi.show(dialog(
    `WAVE ${run.wave} CLEARED`,
    'TAKE A CARD INTO YOUR DECK',
    run.offer.map((id, i) => card(id, () => Actions.pickReward(id), { key: `offer${i}` })),
    [btn('SKIP', () => Actions.pickReward(null))],
    'row',
  ));
}
