// The two canvases and the design space. Three draws the scene underneath; a transparent Pixi canvas on top carries
// the declarative screens (layers.ui). The design space is landscape: 390 design px tall, as wide as the screen's
// aspect allows (at least MIN_W), which is the viewport every screen lays out inside. A portrait game swaps the axes.
import { Application, Container } from 'pixi.js';

export const H = 390;
/** Narrower than this (a tablet, a portrait phone) and the design scales by width instead, gaining height; the widest screen must fit. */
export const MIN_W = 800;
/** A finger-sized target in design px (about 9 mm on a phone held in landscape). */
const TOUCH_PX = 48;

/** The live design viewport: written only by resize(). */
export const view = { width: 844, height: H, scale: 1, touch: TOUCH_PX };

// Created at import so screen modules can attach to them before the app boots (screens draw in import order).
export const layers = { ui: new Container() };

export const pixi = new Application();

/** Fit the design space to a CSS-pixel box. */
export function fit(cssW: number, cssH: number) {
  const scale = cssW / cssH >= MIN_W / H ? cssH / H : cssW / MIN_W;
  view.scale = scale;
  view.width = cssW / scale;
  view.height = cssH / scale;
  pixi.renderer?.resize(cssW, cssH);
  pixi.stage.scale.set(scale);
}

export async function initPixi(el: HTMLElement, cssW: number, cssH: number) {
  await pixi.init({ backgroundAlpha: 0, antialias: true, width: cssW, height: cssH, resolution: Math.min(2, devicePixelRatio || 1), autoDensity: true, autoStart: true });
  pixi.canvas.style.position = 'absolute';
  pixi.canvas.style.inset = '0';
  pixi.canvas.style.touchAction = 'none';
  el.appendChild(pixi.canvas);
  pixi.stage.addChild(layers.ui);
  pixi.stage.eventMode = 'static';
  fit(cssW, cssH);
}
