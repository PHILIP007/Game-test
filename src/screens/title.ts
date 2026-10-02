// Title bindings: store data in, action handlers out. Nothing else lives here (screen-imports.test.ts).
import * as Actions from '../actions';
import { use } from '../decl/engine';
import { game, ui } from '../store';
import { T } from '../tuning';
import { btn, screenUi } from './shared';
import titleKdl from './title.kdl?raw';
import titleCss from './title.css?raw';

export const titleUi = screenUi(titleKdl, titleCss);
if (import.meta.hot) import.meta.hot.accept(['./title.kdl?raw', './title.css?raw'], ([k, c]) => titleUi.reload(k?.default, c?.default));

export function drawTitle() {
  const { screen } = ui.getState(), { run, meta } = game.getState();
  if (screen !== 'title') return titleUi.show(null);
  const next = run.things[0]!;
  titleUi.show(use('title', {
    score: `SCORE ${run.score}`,
    left: run.things.length / T.BATCH_SIZE,
    best: meta.games ? `BEST ${meta.best} OVER ${meta.games} GAMES` : 'NO GAMES YET',
  }, { buttons: [btn('COLLECT', () => Actions.collect(next.id), 'primary'), btn('NEW GAME', () => Actions.newGame())] }));
}
