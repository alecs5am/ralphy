/**
 * Remocn scenes for the ui-a1 shard: `button` and `dialog`.
 *
 * Both are shadcn-shaped primitives whose upstream source is plain inline styles plus one
 * `useStateTransition` tween, so every radius, padding and duration below is read out of the
 * embedded TSX rather than chosen. The one thing the catalog does NOT embed is
 * `@/lib/remocn-ui`, which owns `useRemocnTheme`; its light token set is the stock shadcn
 * neutral ramp, transcribed here as hex (see each `palette`). `easings.out` is likewise not
 * embedded -- every call site in this shard names it and nothing else, so it is ease-out cubic,
 * `cubic-bezier(0.33, 1, 0.68, 1)`.
 *
 * Neither scene animates a pseudo-element: `shared.css` freezes a card with
 * `.rv-scene:not([data-playing="true"]) *`, and `*` never matches a `::before`, so a scrim drawn
 * that way would keep running on a frozen card. `dialog` therefore emits a real `.rv-scrim`
 * element beside the stage.
 */
import { stage } from "./shared";
import { scene, type SceneSpec } from "./types";

/**
 * The five-state demo the upstream docs run: idle -> hover -> press -> loading -> success and back,
 * each leg 8 frames (0.267 s) of `easings.out` with the label, the spinner and the check sharing
 * one relative slot so they cross-fade in place.
 *
 * The lift is one stage pixel and the press is `scale(0.97)`; the background steps are almost
 * invisible because upstream's `default` variant mixes `primary` into `foreground` and both are
 * near-black. That is the component, not a shortcut -- the loud channel really is the cross-fade.
 */
export const button = scene({
  id: "button",
  group: "ui",
  shard: "ui-a1",
  stage: { w: 240, h: 135 },
  params: { state: "idle", label: "Continue", variant: "default", size: "default", speed: 1, align: "center" },
  palette: { text: "#0a0a0a", bg: "#ffffff", accent: "#171717", accentFg: "#fafafa", hover: "#161616", press: "#151515" },
  motion: { kind: "cycle", seconds: 4.2, hold: 0.6, extra: { spin: 2 } },
  still: 0.277,
  markup: (ctx, p) => {
    const sizes: Record<string, readonly [height: number, padding: number, fontSize: number, gap: number]> = {
      sm: [32, 12, 13, 6], default: [40, 20, 15, 8], lg: [48, 28, 17, 10],
    };
    const [height, padding, fontSize, gap] = sizes[String(p.size)] ?? sizes.default;
    const icon = Math.round(fontSize * 1.1);
    const align = p.align === "start" ? "flex-start" : p.align === "end" ? "flex-end" : "center";
    return stage(
      `<div class="rv-row" style="justify-content:${align}">`
      + `<span class="rv-btn" style="--h:${height}em;--px:0 ${padding}em;--gap:${gap}em;--fs:${fontSize};--icon:${icon}em">`
      + `<span class="rv-slot"><span class="rv-label">${ctx.esc(String(p.label))}</span>`
      + `<span class="rv-spin"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9"`
      + ` stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="44" stroke-dashoffset="33"/></svg></span>`
      + `<span class="rv-check"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7"`
      + ` stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"`
      + ` pathLength="14" stroke-dasharray="14" stroke-dashoffset="0"/></svg></span></span></span></div>`);
  },
});

/**
 * A 440px popup over a 50%-black scrim. Four channels move on one 12-frame (0.4 s) `easings.out`
 * tween -- overlay alpha 0 -> 0.5, popup opacity 0 -> 1, `translateY(8px) -> 0` and
 * `scale(0.95) -> 1` -- and the close runs the identical curve in reverse, because upstream
 * re-targets the same hook at `dialogStyle("closed")` rather than shipping a faster exit.
 *
 * The close button has no motion channel of its own upstream, so it has none here.
 */
export const dialog = scene({
  id: "dialog",
  group: "ui",
  shard: "ui-a1",
  stage: { w: 560, h: 315 },
  params: {
    state: "closed",
    title: "Edit profile",
    description: "Make changes to your profile here. Click save when you're done.",
    actionLabel: "Save changes",
    cancelLabel: "Cancel",
  },
  palette: {
    text: "#0a0a0a", bg: "#ffffff", accent: "#171717", accentFg: "#fafafa",
    muted: "#737373", border: "#e5e5e5", panel: "#ffffff", scrim: "#000000", shadow: "#00000040",
  },
  motion: { kind: "cycle", seconds: 2.7, hold: 0.5 },
  still: 0.469,
  markup: (ctx, p) => `<div class="rv-scrim"></div>` + stage(
    `<div class="rv-pop"><span class="rv-x"><svg viewBox="0 0 24 24" fill="none">`
    + `<path d="M18 6 6 18 M6 6 18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
    + `</svg></span><div class="rv-ttl">${ctx.esc(String(p.title))}</div>`
    + `<div class="rv-desc">${ctx.esc(String(p.description))}</div>`
    + `<div class="rv-acts"><span class="rv-b rv-cancel">${ctx.esc(String(p.cancelLabel))}</span>`
    + `<span class="rv-b rv-action">${ctx.esc(String(p.actionLabel))}</span></div></div>`),
});

export const uiA1: readonly SceneSpec[] = [button, dialog];
