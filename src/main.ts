// Entry: boot the runtime into #app, once the hand-drawn font (bundled, src/fonts) has loaded: Pixi measures text when
// it first draws it, so text drawn before the font arrives keeps the stand-in's size. If it never does, boot anyway.
import './fonts/fonts.css';
import { boot } from './runtime';

/** How long to wait for the font before booting without it. */
const FONT_WAIT_MS = 2500;

const font = document.fonts.load('16px "Gochi Hand"').catch(() => []);
void Promise.race([font, new Promise((r) => setTimeout(r, FONT_WAIT_MS))]).then(() => boot(document.getElementById('app')!));
