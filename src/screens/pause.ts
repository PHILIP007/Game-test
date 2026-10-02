// Pause bindings: store data in, action handlers out. Nothing else lives here (screen-imports.test.ts).
import * as Actions from '../actions';
import { mountedCount } from '../weapons';
import { game, ui } from '../store';
import { btn, dialog, line, screenUi } from './shared';
import pauseKdl from './pause.kdl?raw';
import pauseCss from './pause.css?raw';

export const pauseUi = screenUi(pauseKdl, pauseCss);
if (import.meta.hot) import.meta.hot.accept(['./pause.kdl?raw', './pause.css?raw'], ([k, c]) => pauseUi.reload(k?.default, c?.default));

export function drawPause() {
  const { screen, paused } = ui.getState(), { run } = game.getState();
  if (screen !== 'run' || !paused || run.phase !== 'fight') return pauseUi.show(null);
  pauseUi.show(dialog(
    'PAUSED',
    `WAVE ${run.wave}  ·  ${mountedCount(run.mounts)} OF ${run.mounts.length} THINGS SWALLOWED`,
    [line('WASD MOVE  ·  MOUSE AIM  ·  2 3 4 OR CLICK USE A READY ONE  ·  ESC RESUME')],
    [btn('RESUME', () => Actions.togglePause(), 'primary'), btn('QUIT', () => Actions.toTitle())],
  ));
}
