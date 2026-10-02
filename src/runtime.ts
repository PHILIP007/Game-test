// Everything whose lifetime is the game's starts here and is torn down by the disposer boot() returns: the two
// canvases, the clock and the fight's step on it, the controls, the store subscriptions that draw the screens and
// the arena, and resize handling.
import { UPDATE_PRIORITY } from 'pixi.js';
import * as Actions from './actions';
import { onTick, startClock } from './clock';
import { listenInput, readInput } from './input';
import { fit, initPixi, pixi } from './stage';
import { game, ui } from './store';
import { createScene, type Scene } from './view/scene';
import { tickScreens } from './screens/shared';
// Screens stack in import order (each screenUi attaches to layers.ui as its module loads): later draws on top.
import { drawTitle } from './screens/title';
import { drawHud } from './screens/hud';
import { drawReward } from './screens/reward';
import { drawOver } from './screens/over';
import { drawPause } from './screens/pause';

export let scene: Scene | null = null;

/** Draw every screen from the stores (each skips the render when its tree is unchanged). */
export function drawScreens() {
  drawTitle();
  drawHud();
  drawReward();
  drawOver();
  drawPause();
}

/** One synchronous frame of both canvases: what a settled story shows and hit-tests against. */
export function renderNow() {
  scene?.render();
  pixi.renderer.render(pixi.stage);
}

export async function boot(el: HTMLElement): Promise<() => void> {
  const w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight;
  const s = (scene = createScene(el, w, h));
  await initPixi(el, w, h);

  const offInput = listenInput(s.toWorld);
  // The fight runs on the game clock, so a story can step it; it never counts as busy (it never stops by itself).
  const offFight = onTick((dt) => {
    const { screen, paused } = ui.getState();
    if (screen !== 'run' || paused) return false;
    const input = readInput();
    s.aim(input.aim);
    Actions.step(dt, input);
    return false;
  });
  const offTick = onTick((dt) => tickScreens(dt));
  const stopClock = startClock(pixi.ticker, renderNow);
  const render3d = () => s.render();
  pixi.ticker.add(render3d, undefined, UPDATE_PRIORITY.LOW);
  const sync = () => s.sync(game.getState().run, ui.getState().screen === 'run');
  const unsubs = [game.subscribe(drawScreens), ui.subscribe(drawScreens), game.subscribe(sync), ui.subscribe(sync)];

  const resize = () => {
    const cw = el.clientWidth || innerWidth, ch = el.clientHeight || innerHeight;
    fit(cw, ch);
    s.resize(cw, ch);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();
  sync();
  drawScreens();

  return () => {
    ro.disconnect();
    unsubs.forEach((u) => u());
    pixi.ticker.remove(render3d);
    stopClock(); offTick(); offFight(); offInput();
  };
}
