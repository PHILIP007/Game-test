// Every screen compiles against the registries and renders from real store states (static KDL/CSS mistakes throw at
// import, binding mistakes at draw). Text is measured by a fixed-size stub: there is no canvas under node.
import 'pixi.js/events';
import { CanvasTextMetrics } from 'pixi.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { newGame } from '../game';
import { initialUi, game, ui } from '../store';
import { drawTitle } from './title';
import { layers } from '../stage';

const drawAll = () => { drawTitle(); };
const texts = () => { const out: string[] = []; const walk = (n: { children?: unknown[]; text?: unknown; visible?: boolean }) => { if (n.visible === false) return; if (typeof n.text === 'string') out.push(n.text); (n.children ?? []).forEach((c) => walk(c as never)); }; walk(layers.ui as never); return out; };

beforeAll(() => {
  vi.spyOn(CanvasTextMetrics, 'measureText').mockReturnValue({ width: 10, height: 10, lines: [''], lineWidths: [10], lineHeight: 10, maxLineWidth: 10, fontProperties: { ascent: 8, descent: 2, fontSize: 10 } } as never);
});

describe('screens render from the stores', () => {
  it('title', () => {
    game.setState({ run: { ...newGame(1), score: 42 } }); ui.setState(initialUi); drawAll();
    expect(texts()).toContain('MY GAME');
    expect(texts()).toContain('SCORE 42');
  });
});
