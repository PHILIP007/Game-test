// The one impure boundary for state: every tap lands here and reaches the core through a namespace (`Game.collect`),
// so the layer shows at the call site. Screens call these; they never write a store themselves.
import * as Game from './game';
import { game } from './store';

export function collect(id: number) {
  game.setState({ run: Game.collect(game.getState().run, id) });
}

/** Record the current game's score, then start a fresh one with a fresh seed. */
export function newGame(seed = Date.now() % 2 ** 31) {
  const { run, meta } = game.getState();
  game.setState({ run: Game.newGame(seed), meta: Game.recordGame(meta, run.score) });
}
