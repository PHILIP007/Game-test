// Shop bindings: store data in, action handlers out. Nothing else lives here (screen-imports.test.ts).
import * as Actions from '../actions';
import { use } from '../decl/engine';
import { weaponDef } from '../content';
import { canSell, cantBuy, sellPrice } from '../game';
import { game, ui } from '../store';
import { btn, emptyMount, screenUi, weapon } from './shared';
import shopKdl from './shop.kdl?raw';
import shopCss from './shop.css?raw';

export const shopUi = screenUi(shopKdl, shopCss);
if (import.meta.hot) import.meta.hot.accept(['./shop.kdl?raw', './shop.css?raw'], ([k, c]) => shopUi.reload(k?.default, c?.default));

/** What an offer's foot line says, by why it can't be bought. */
const BUY_FOOT = { points: 'NOT ENOUGH POINTS', mounts: 'NO FREE MOUNT' } as const;

export function drawShop() {
  const { screen } = ui.getState(), { run } = game.getState();
  if (screen !== 'run' || run.phase !== 'shop') return shopUi.show(null);
  shopUi.show(use('shop', {
    title: `WAVE ${run.wave} CLEARED`,
    points: `${run.points} POINTS TO SPEND`,
  }, {
    offer: run.offer.map((id, i) => {
      const why = cantBuy(run, id);
      return weapon(id, () => Actions.buy(id), { key: `offer${i}`, tag: `${weaponDef(id).price} PTS`, charge: 1, foot: why ? BUY_FOOT[why] : 'BUY', off: !!why });
    }),
    mounts: run.mounts.map((m, i) => m.weapon
      ? weapon(m.weapon, () => Actions.sell(i), { key: `mount${i}`, tag: `${weaponDef(m.weapon).cooldownS}s`, charge: 1, foot: canSell(run, i) ? `SELL +${sellPrice(m.weapon)}` : 'LAST WEAPON', off: !canSell(run, i) })
      : emptyMount(`mount${i}`)),
    buttons: [btn('NEXT WAVE', () => Actions.nextWave())],
  }));
}
