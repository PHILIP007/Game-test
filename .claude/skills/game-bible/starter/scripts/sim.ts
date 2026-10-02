// Balance sim: `npm run sim [games] [collects]`. Plays whole games headless on the pure core and prints the scores.
// PLACEHOLDER: a bot that always collects the first thing; give your game a real bot and report what matters for balance.
import { collect, newGame } from '../src/game';

declare const process: { argv: string[] };
const games = Number(process.argv[2] ?? 20), collects = Number(process.argv[3] ?? 50);
const scores: number[] = [];
for (let seed = 1; seed <= games; seed++) {
  let s = newGame(seed);
  for (let i = 0; i < collects; i++) s = collect(s, s.things[0]!.id);
  scores.push(s.score);
}
scores.sort((a, b) => a - b);
console.log(`${games} games, ${collects} collects each: score median ${scores[games >> 1]}, min ${scores[0]}, max ${scores[games - 1]}`);
