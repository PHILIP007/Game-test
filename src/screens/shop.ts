// Shop bindings: store data in, action handlers out. Nothing else lives here (screen-imports.test.ts).
import * as Actions from '../actions';
import { use } from '../decl/engine';
import { weaponDef } from '../content';
import { canSell, cantBuy, sellPrice } from '../game';
import { game, ui } from '../store';
import { btn, emptySlot, screenUi, weapon } from './shared';
import shopKdl from './shop.kdl?raw';
import shopCss from './shop.css?raw';

export const shopUi = screenUi(shopKdl, shopCss);
if (import.meta.hot) import.meta.hot.accept(['./shop.kdl?raw', './shop.css?raw'], ([k, c]) => shopUi.reload(k?.default, c?.default));

/** What an offer's foot line says, by why it can't be swallowed. */
const BUY_FOOT = { points: 'NOT ENOUGH PENNIES', mounts: 'STOMACH FULL' } as const;

export function drawShop() {
  const { screen } = ui.getState(), { run } = game.getState();
  if (screen !== 'run' || run.phase !== 'shop') return shopUi.show(null);
  shopUi.show(use('shop', {
    title: `WAVE ${run.wave} SURVIVED`,
    pennies: `${run.points}¢ TO SPEND`,
  }, {
    offer: run.offer.map((id, i) => {
      const why = cantBuy(run, id);
      return weapon(id, () => Actions.buy(id), { key: `offer${i}`, tag: `${weaponDef(id).price}¢`, charge: 1, foot: why ? BUY_FOOT[why] : 'SWALLOW', off: !!why });
    }),
    stomach: run.mounts.map((m, i) => m.weapon
      ? weapon(m.weapon, () => Actions.sell(i), { key: `slot${i}`, tag: `${weaponDef(m.weapon).cooldownS}s`, charge: 1, foot: canSell(run, i) ? `COUGH UP +${sellPrice(m.weapon)}¢` : 'ALL YOU\'VE GOT', off: !canSell(run, i) })
      : emptySlot(`slot${i}`)),
    buttons: [btn('NEXT WAVE', () => Actions.nextWave())],
  }));
}
