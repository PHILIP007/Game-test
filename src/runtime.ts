// Everything whose lifetime is the game's starts here and is torn down by the disposer boot() returns: the two
// canvases, the clock, the store subscriptions that draw the screens and the scene, and resize handling.
import { UPDATE_PRIORITY } from 'pixi.js';
import { onTick, startClock } from './clock';
import { fit, initPixi, pixi } from './stage';
import { game, ui } from './store';
import { createScene, type Scene } from './view/scene';
import { tickScreens } from './screens/shared';
// Screens stack in import order (each screenUi attaches to layers.ui as its module loads): later draws on top.
import { drawTitle } from './screens/title';

export let scene: Scene | null = null;

/** Draw every screen from the stores (each skips the render when its tree is unchanged). */
export function drawScreens() {
  drawTitle();
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

  const offTick = onTick((dt) => tickScreens(dt));
  const stopClock = startClock(pixi.ticker, renderNow);
  const render3d = () => s.render();
  pixi.ticker.add(render3d, undefined, UPDATE_PRIORITY.LOW);
  const sync = () => s.sync(game.getState().run);
  const unsubs = [game.subscribe(drawScreens), ui.subscribe(drawScreens), game.subscribe(sync)];

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
    stopClock(); offTick();
  };
}
