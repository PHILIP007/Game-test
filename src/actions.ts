// The one impure boundary for state: every tap and key lands here and reaches the core through a namespace
// (`Game.playCard`), so the layer shows at the call site. Screens and input call these; they never write a store.
import * as Game from './game';
import { game, ui } from './store';

/** A fresh run with a fresh seed, straight into the fight. */
export function start(seed = Date.now() % 2 ** 31) {
  game.setState({ run: Game.newGame(seed) });
  ui.setState({ screen: 'run', paused: false });
}

/** dtS seconds of the fight. The step that ends the run also records it. */
export function step(dtS: number, input: Game.Input) {
  const { run, meta } = game.getState();
  const next = Game.step(run, dtS, input);
  if (next === run) return;
  game.setState(next.phase === 'dead' && run.phase !== 'dead' ? { run: next, meta: Game.recordRun(meta, next) } : { run: next });
}

export function playCard(slot: number) {
  const { run } = game.getState();
  if (ui.getState().paused) return;
  const next = Game.playCard(run, slot);
  if (next !== run) game.setState({ run: next });
}

/** Take a card from the offer (null: skip it); the next wave starts. */
export function pickReward(card: string | null) {
  game.setState({ run: Game.pickReward(game.getState().run, card) });
}

/** Pause or resume, but only mid-fight: the reward and game-over dialogs already hold the run still. */
export function togglePause() {
  const { screen, paused } = ui.getState();
  if (screen === 'run' && (paused || game.getState().run.phase === 'fight')) ui.setState({ paused: !paused });
}

export function toTitle() {
  ui.setState({ screen: 'title', paused: false });
}
