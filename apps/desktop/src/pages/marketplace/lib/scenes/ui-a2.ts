/**
 * Remocn scenes for the ui-a2 shard: `dropdown-menu`.
 *
 * The trigger is the Button component under `variant: "outline"`, so its resting background is
 * `theme.background` rather than a fill of its own; the panel is a `popover` surface. The light
 * token set comes from `useRemocnTheme`, which lives in the un-embedded `@/lib/remocn-ui` -- it is
 * the stock shadcn neutral ramp, transcribed as hex in `palette`. `easings.out` is likewise not
 * embedded and is ease-out cubic, `cubic-bezier(0.33, 1, 0.68, 1)`.
 */
import { stage } from "./shared";
import { scene, type SceneSpec } from "./types";

/**
 * Four channels on one 12-frame (0.4 s) tween: the panel drops in from 4px above at `scale(0.96)`
 * with `transform-origin: top` while the chevron flips a full 180 degrees on exactly the same
 * curve. Row state is `press > hover > idle`, keyed off `pressedIndex` / `highlightedIndex`, both
 * of which default to -1, so the default render has no highlighted row.
 *
 * Two things here are not readable from the catalog. `dropdown-menu-item` is declared as a registry
 * dependency but has no entry, so the row's own height, radius and type size are chosen (32 / 6 /
 * 14 stage px) against the parent's known 232px row width. And upstream anchors the 240px group
 * with a hard `padding-top: 220px` inside its own composition, which is taller than any reference
 * stage here; on this 420x236 stage the same group is centred instead, at `padding-top: 23em`.
 */
export const dropdownMenu = scene({
  id: "dropdown-menu",
  group: "ui",
  shard: "ui-a2",
  stage: { w: 420, h: 236 },
  params: {
    state: "closed",
    label: "Options",
    items: ["Profile", "Billing", "Settings", "Log out"],
    highlightedIndex: -1,
    pressedIndex: -1,
  },
  palette: {
    text: "#0a0a0a", bg: "#f5f5f5", accent: "#f5f5f5",
    muted: "#737373", border: "#e5e5e5", panel: "#ffffff", shadow: "#0000002e",
  },
  motion: { kind: "cycle", seconds: 2.4, hold: 0.6 },
  still: 0.45,
  fidelity: {
    level: "approximate",
    note: "Row metrics (32px height, 6px radius, 14px label) are chosen: the upstream dropdown-menu-item is a declared registry dependency with no entry in the catalog. The group is centred on this 420x236 reference stage instead of carrying upstream's literal padding-top of 220px, which exceeds the stage height. Every other length, the panel and chevron channels and the 0.4s ease-out tween are read from the embedded source.",
  },
  markup: (ctx, p) => {
    const items = (Array.isArray(p.items) ? p.items : []).map(String);
    const highlighted = Number(p.highlightedIndex);
    const pressed = Number(p.pressedIndex);
    const rows = items.map((item, index) => {
      const state = index === pressed ? " rv-press" : index === highlighted ? " rv-hover" : "";
      return `<span class="rv-item${state}"><span>${ctx.esc(item)}</span></span>`;
    }).join("");
    return stage(
      `<div class="rv-wrap"><div class="rv-trigger"><span class="rv-tl">${ctx.esc(String(p.label))}</span>`
      + `<svg class="rv-chev" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor"`
      + ` stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`
      + `<div class="rv-panel">${rows}</div></div>`);
  },
});

export const uiA2: readonly SceneSpec[] = [dropdownMenu];
