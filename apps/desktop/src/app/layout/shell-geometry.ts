/**
 * The shell's arithmetic: how wide each column may be, and when a column gives way.
 *
 * Every number here is a floor or a ceiling with a reason, and none of them is a design
 * preference the operator can override -- a width they dragged is theirs, but a width that would
 * make a column unusable is not. Keeping the arithmetic pure is what lets it be read, and checked,
 * without mounting the shell.
 */
import { VIEW_PANEL_DEFAULT, VIEW_PANEL_MIN } from "@/widgets/view-panel";

export const DOCK_WINDOW_MIN = 1_280;
export const DOCK_DESK_MIN = 680;
export const RIGHT_RAIL_MIN = 292;
/* The chat lens' view panel. The width is the user's, and it has no design maximum: the panel may
   take nearly the whole window, the way a Codex-style layout lets the conversation shrink to a
   tenth of it. What stops it is the chat's own floor -- a share of the frame, with an absolute
   floor because a conversation below it is not readable at any window size. Below
   VIEW_PANEL_DROP there is no room for both columns at all. */
export const VIEW_PANEL_DROP = 1_120;
const VIEW_CHAT_MIN_RATIO = 0.12;
const VIEW_CHAT_MIN = 240;
/* The window's own chrome between the frame edge and the two content columns: 8 of desk on each
   side, plus the zone gap after the sidebar and the one between the chat and the panel. */
const VIEW_CHROME = 32;
const RIGHT_RAIL_MAX = 1_000;
const LEFT_MIN = 216;
const LEFT_MAX = 420;
const LEFT_DEFAULT = 260;

export function clampWidth(requested: number, min: number, max: number, fallback: number): number {
  const value = Number.isFinite(requested) ? Math.round(requested) : fallback;
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export interface ShellDimensions {
  frameWidth: number;
  deskWidth: number;
  deskHeight: number;
}

/**
 * Resolve every column width from the frame the shell was measured at.
 *
 * `railDocked` is the rail's current mode, not the one being computed: whether the desk still
 * clears its minimum depends on whether the rail is already taking width out of it.
 */
export function shellColumns({ dimensions, leftVisible, leftWidth, rightWidth, viewWidth, railDocked }: {
  dimensions: ShellDimensions;
  leftVisible: boolean;
  leftWidth: number;
  rightWidth: number;
  viewWidth: number;
  railDocked: boolean;
}) {
  const left = clampWidth(leftWidth, LEFT_MIN, LEFT_MAX, LEFT_DEFAULT);
  const leftColumn = leftVisible ? left : 0;
  // The rail may not eat the desk: its ceiling is whatever is left after the sidebar and the
  // desk minimum, so dragging wide on a narrow window cannot silently flip it to overlay.
  const railMax = Math.max(
    RIGHT_RAIL_MIN,
    Math.min(RIGHT_RAIL_MAX, dimensions.frameWidth - leftColumn - DOCK_DESK_MIN),
  );
  const railWidth = clampWidth(rightWidth, RIGHT_RAIL_MIN, railMax, RIGHT_RAIL_MIN);
  const dockedDeskWidth = railDocked ? dimensions.deskWidth : dimensions.deskWidth - railWidth;
  /* The ceiling is whatever leaves the chat its floor, so dragging wide runs out of travel at the
     point the conversation would stop being usable rather than at an arbitrary width. */
  const viewPanelMax = Math.max(
    VIEW_PANEL_MIN,
    dimensions.frameWidth - leftColumn - VIEW_CHROME
      - Math.max(VIEW_CHAT_MIN, Math.round(dimensions.frameWidth * VIEW_CHAT_MIN_RATIO)),
  );
  return {
    leftWidth: left,
    leftColumn,
    railMax,
    railWidth,
    dockEligible: dimensions.frameWidth >= DOCK_WINDOW_MIN && dockedDeskWidth >= DOCK_DESK_MIN,
    viewPanelWidth: clampWidth(viewWidth, VIEW_PANEL_MIN, viewPanelMax, VIEW_PANEL_DEFAULT),
    viewPanelFits: dimensions.frameWidth >= VIEW_PANEL_DROP,
    /* The same bounds the widths were clamped against, so a resize grabber and the clamp cannot
       disagree about where a drag runs out of travel. */
    bounds: {
      left: { min: LEFT_MIN, max: LEFT_MAX, fallback: LEFT_DEFAULT },
      rail: { min: RIGHT_RAIL_MIN, max: railMax, fallback: RIGHT_RAIL_MIN },
      view: { min: VIEW_PANEL_MIN, max: viewPanelMax, fallback: VIEW_PANEL_DEFAULT },
    },
  };
}
