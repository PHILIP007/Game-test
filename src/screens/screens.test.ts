// Every screen compiles against the registries and renders from real store states (static KDL/CSS mistakes throw at
// import, binding mistakes at draw). Text is measured by a fixed-size stub: there is no canvas under node.
import 'pixi.js/events';
import { CanvasTextMetrics } from 'pixi.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { newGame, type GameState } from '../game';
import { initialUi, game, ui, type UiState } from '../store';
import { drawTitle } from './title';
import { drawHud } from './hud';
import { drawShop } from './shop';
import { drawOver } from './over';
import { drawPause } from './pause';
import { layers } from '../stage';

const drawAll = () => { drawTitle(); drawHud(); drawShop(); drawOver(); drawPause(); };
const texts = () => { const out: string[] = []; const walk = (n: { children?: unknown[]; text?: unknown; visible?: boolean }) => { if (n.visible === false) return; if (typeof n.text === 'string') out.push(n.text); (n.children ?? []).forEach((c) => walk(c as never)); }; walk(layers.ui as never); return out; };
const show = (run: GameState, u: Partial<UiState> = {}) => { game.setState({ run }); ui.setState({ ...initialUi, ...u }); drawAll(); return texts(); };

beforeAll(() => {
  vi.spyOn(CanvasTextMetrics, 'measureText').mockReturnValue({ width: 10, height: 10, lines: [''], lineWidths: [10], lineHeight: 10, maxLineWidth: 10, fontProperties: { ascent: 8, descent: 2, fontSize: 10 } } as never);
});

describe('screens render from the stores', () => {
  it('title', () => {
    game.setState({ meta: { best: 99, bestWave: 4, runs: 2 } });
    const t = show(newGame(1));
    expect(t).toContain('GOB');
    expect(t).toContain('BEST 99  ·  FURTHEST WAVE 4  ·  2 RUNS');
    expect(t).not.toContain('WAVE 1');
  });
  it('hud: wave, pennies, score, the slots', () => {
    const s = { ...newGame(1), points: 70, score: 120 };
    const t = show(s, { screen: 'run' });
    expect(t).toEqual(expect.arrayContaining(['WAVE 1', '70¢', 'SCORE 120', 'SPIT', 'A gob of spit at the cursor', 'NOTHING SWALLOWED']));
    expect(t).not.toContain('GOB');
  });
  it('shop: offers with prices, slots to sell, move on', () => {
    expect(show({ ...newGame(1), phase: 'shop', points: 60, offer: ['chunks', 'tooth', 'lick'] }, { screen: 'run' }))
      .toEqual(expect.arrayContaining(['WAVE 1 SURVIVED', '60¢ TO SPEND', 'CHUNKS', '60¢', 'SWALLOW', 'NOT ENOUGH PENNIES', 'LICK WOUNDS', "ALL YOU'VE GOT", 'NEXT WAVE']));
    expect(texts()).not.toContain('HULL'); // the HUD steps aside for the shop
  });
  it('game over', () => {
    expect(show({ ...newGame(1), phase: 'dead', wave: 5 }, { screen: 'run' })).toContain('THE BASEMENT GOT YOU ON WAVE 5');
  });
  it('pause', () => {
    expect(show(newGame(1), { screen: 'run', paused: true })).toEqual(expect.arrayContaining(['PAUSED', 'RESUME', 'QUIT']));
  });
});
