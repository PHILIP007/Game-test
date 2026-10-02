// Game-over bindings: store data in, action handlers out. Nothing else lives here (screen-imports.test.ts).
import * as Actions from '../actions';
import { game, ui } from '../store';
import { btn, dialog, line, screenUi } from './shared';
import overKdl from './over.kdl?raw';
import overCss from './over.css?raw';

export const overUi = screenUi(overKdl, overCss);
if (import.meta.hot) import.meta.hot.accept(['./over.kdl?raw', './over.css?raw'], ([k, c]) => overUi.reload(k?.default, c?.default));

export function drawOver() {
  const { screen } = ui.getState(), { run, meta } = game.getState();
  if (screen !== 'run' || run.phase !== 'dead') return overUi.show(null);
  overUi.show(dialog(
    'YOU CHOKED',
    `THE NIGHTMARE GOT YOU ON WAVE ${run.wave}`,
    [line(`SCORE ${run.score}  ·  ${run.kills} THINGS POPPED`), line(`BEST ${meta.best}  ·  FURTHEST WAVE ${meta.bestWave}`)],
    [btn('AGAIN', () => Actions.start(), 'primary'), btn('TITLE', () => Actions.toTitle())],
  ));
}
