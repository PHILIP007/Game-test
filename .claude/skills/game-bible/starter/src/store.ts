// Two stores, plain data only, changed only through ./actions with setState (never mutated in place).
// `game` holds the current game and the meta; only the meta is saved, under one raw key, and zod checks it on load.
// `ui` is the view's own state and is never saved.
import { createStore } from 'zustand/vanilla';
import { persist, type PersistStorage } from 'zustand/middleware';
import { newGame, newMeta, parseMeta, type GameState, type Meta } from './game';

/** PLACEHOLDER: rename to your game's own key, so two games on one origin don't share a save. */
export const META_KEY = 'my-game.meta';

export type GameStore = { run: GameState; meta: Meta };

/** Add a name here per screen; the screen's draw function shows itself when this matches. */
export type Screen = 'title';
export type UiState = { screen: Screen };
export const initialUi: UiState = { screen: 'title' };

function disk<T>(fn: (ls: Storage) => T): T | null {
  if (import.meta.env.STORYBOOK) return null; // stories never read or write saves
  try { return fn(localStorage); } catch { return null; } // private mode
}

// persist calls setItem on every set; only write when the meta object changed.
let written: Meta | null = null;
const storage: PersistStorage<{ meta: unknown }> = {
  getItem: () => ({ state: { meta: disk((ls) => JSON.parse(ls.getItem(META_KEY) ?? 'null')) }, version: 0 }),
  setItem: (_, { state }) => { if (state.meta === written) return; written = state.meta as Meta; disk((ls) => ls.setItem(META_KEY, JSON.stringify(state.meta))); },
  removeItem: () => { disk((ls) => ls.removeItem(META_KEY)); },
};

export const game = createStore<GameStore>()(persist((): GameStore => ({ run: newGame(1), meta: newMeta() }), {
  name: META_KEY,
  storage,
  partialize: (g) => ({ meta: g.meta }),
  merge: (saved, cur) => ({ ...cur, meta: parseMeta((saved as { meta: unknown } | undefined)?.meta) ?? cur.meta }),
}));
// persist doesn't write after hydrating; an identity set saves once, replacing a corrupt save with the default.
game.setState((s) => s);

export const ui = createStore<UiState>()(() => initialUi);
