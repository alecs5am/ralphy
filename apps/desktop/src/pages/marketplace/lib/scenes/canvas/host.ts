/**
 * The one canvas 2D engine for the whole app.
 *
 * `paintOnce` serves every frozen state — the grid card, reduced motion, the baked still and an
 * exported seek. `subscribe` serves a playing scene. There is exactly ONE module-level
 * `requestAnimationFrame` loop: it starts when the subscriber set becomes non-empty and stops when
 * it empties, so a page full of frozen cards costs nothing. `paint.fps` is honoured by skipping
 * frames inside that loop, never by a second timer.
 */
import { hash01 } from "../shared";
import type { SceneParams, SceneSpec } from "../types";
import { canvasFields } from "./index";

type Palette = Record<string, string>;

/** `interval` is milliseconds between paints, from `paint.fps`; `next` is when this one is due. */
type Subscriber = {
  readonly canvas: HTMLCanvasElement;
  readonly spec: SceneSpec;
  readonly getT: () => number;
  readonly palette: Palette;
  readonly interval: number;
  next: number;
};

const subscribers = new Set<Subscriber>();
let loop = 0;

const canvasPaint = (spec: SceneSpec) =>
  spec.paint !== undefined && spec.paint.engine === "canvas" ? spec.paint : undefined;

/** The fraction of one run that carries the motion; a `cycle`'s `hold` parks the rest of it. */
const cycleFraction = (spec: SceneSpec) =>
  spec.motion.kind === "cycle" ? spec.motion.seconds / (spec.motion.seconds + spec.motion.hold) : 1;

function draw(canvas: HTMLCanvasElement, spec: SceneSpec, t: number, palette: Palette): void {
  const paint = canvasPaint(spec);
  if (paint === undefined) return;
  const ctx2d = canvas.getContext("2d");
  if (ctx2d === null) return;
  // The backing store is ALWAYS the reference stage, never the measured element. That is the whole
  // reason a field's cell count is constant and the still agrees with the first live frame.
  if (canvas.width !== spec.stage.w) canvas.width = spec.stage.w;
  if (canvas.height !== spec.stage.h) canvas.height = spec.stage.h;
  const params: SceneParams = {
    cycle: cycleFraction(spec),
    ...(paint.cells === undefined ? {} : { cols: paint.cells[0], rows: paint.cells[1] }),
    ...paint.params,
  };
  const field = canvasFields[paint.field];
  if (field === undefined) return;
  ctx2d.setTransform(1, 0, 0, 1, 0, 0);
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  ctx2d.save();
  field(ctx2d, ((t % 1) + 1) % 1, params, (key) => hash01(`${spec.id}:${key}`), palette);
  ctx2d.restore();
}

/** One frozen frame at `t`. Safe to call on a spec with no canvas paint; it does nothing. */
export const paintOnce = (canvas: HTMLCanvasElement, spec: SceneSpec, t: number, palette: Palette): void =>
  draw(canvas, spec, t, palette);

function tick(now: number): void {
  // Reschedule BEFORE painting: a `getT` or a field that throws costs its own subscriber a frame
  // instead of leaving the shared loop dead for every other canvas scene on the page.
  loop = subscribers.size > 0 ? requestAnimationFrame(tick) : 0;
  for (const entry of subscribers) {
    if (now < entry.next) continue;
    // Anchor the next paint to the ideal cadence, so an fps the frame grid cannot divide evenly
    // still averages out. Falling behind (a backgrounded tab) re-anchors instead of bursting.
    entry.next = entry.next + entry.interval < now ? now + entry.interval : entry.next + entry.interval;
    draw(entry.canvas, entry.spec, entry.getT(), entry.palette);
  }
}

/**
 * Paint `canvas` until the returned disposer runs, reading the run position from `getT` each time.
 * Always call the disposer: it is what lets the shared loop stop.
 */
export function subscribe(canvas: HTMLCanvasElement, spec: SceneSpec, getT: () => number, palette: Palette): () => void {
  const interval = 1000 / Math.max(1, canvasPaint(spec)?.fps ?? 20);
  const entry: Subscriber = { canvas, spec, getT, palette, interval, next: 0 };
  subscribers.add(entry);
  if (loop === 0 && typeof requestAnimationFrame === "function") loop = requestAnimationFrame(tick);
  return () => {
    subscribers.delete(entry);
    if (subscribers.size > 0 || loop === 0) return;
    cancelAnimationFrame(loop);
    loop = 0;
  };
}
