// Title bindings: store data in, action handlers out. Nothing else lives here (screen-imports.test.ts).
import * as Actions from '../actions';
import { use } from '../decl/engine';
import { game, ui } from '../store';
import { btn, screenUi } from './shared';
import titleKdl from './title.kdl?raw';
import titleCss from './title.css?raw';

export const titleUi = screenUi(titleKdl, titleCss);
if (import.meta.hot) import.meta.hot.accept(['./title.kdl?raw', './title.css?raw'], ([k, c]) => titleUi.reload(k?.default, c?.default));

export function drawTitle() {
  const { screen } = ui.getState(), { meta } = game.getState();
  if (screen !== 'title') return titleUi.show(null);
  titleUi.show(use('title', {
    best: meta.runs ? `BEST ${meta.best}  ·  FURTHEST WAVE ${meta.bestWave}  ·  ${meta.runs} RUNS` : 'NO RUNS YET',
  }, { buttons: [btn('PLAY', () => Actions.start(), 'primary')] }));
}
