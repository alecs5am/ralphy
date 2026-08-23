import { Settings, SlidersHorizontal } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { InstrumentOverlay } from "./overlay-registry";
import type { InstrumentProfileIdentity } from "./types";

const PROFILE_MENU_GUTTER = 8;

/* The identity mark, in either form. `flex-none` is a structural guard: without it the avatar
   is the first thing the trigger shrinks when the name is long. */
const IDENTITY = "size-control-sm flex-none rounded-control";
const INITIALS = `${IDENTITY} grid place-items-center bg-dither-base type-xs text-on-instrument`;
/* A truncating label inside a row that may be narrower than its text. `min-w-0` is what lets
   the span shrink below its content at all. */
const LABEL = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap";
/* Geometry and behaviour only: the compact trigger, the pill and every menu row share this, and
   each states its own surface and ink as a pair. A shared base that carried an ink is what made
   a caller's half-override paint invisible text. */
const ROW = "inline-flex items-center gap-2 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2";
/* On a theme surface. The menu is portalled to `document.body`, outside `.app-mode-work`, where
   the legacy inks resolve to the on-dark family -- so both halves are stated, never inherited. */
const ON_THEME = "text-ink hover:bg-surface-hover focus-visible:outline-ink";
/* On the sidebar footer's black plate, which stays black in both themes: the on-dark family
   throughout, and the on-instrument ring because the theme ink is #141414 on #141414 in the
   light theme. */
const ON_INSTRUMENT = "text-on-instrument-muted hover:bg-instrument-hover hover:text-on-instrument focus-visible:outline-focus-on-instrument";

function localAvatarUrl(avatarUrl: string | null): string | null {
  if (!avatarUrl) return null;
  if (/^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i.test(avatarUrl)) return avatarUrl;
  try {
    const url = new URL(avatarUrl);
    if (url.protocol === "blob:") return avatarUrl;
    return url.protocol === "ralphy-media:" && url.hostname === "asset" ? avatarUrl : null;
  } catch {
    return null;
  }
}

function profileMenuPosition(trigger: HTMLElement, menu: HTMLElement): CSSProperties {
  const bounds = trigger.getBoundingClientRect();
  const viewportWidth = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
  const viewportHeight = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
  const menuBounds = menu.getBoundingClientRect();
  const width = Math.min(Math.max(menu.scrollWidth, menuBounds.width), Math.max(1, viewportWidth - PROFILE_MENU_GUTTER * 2));
  const height = Math.min(Math.max(menu.scrollHeight, menuBounds.height), Math.max(1, viewportHeight - PROFILE_MENU_GUTTER * 2));
  const left = Math.max(PROFILE_MENU_GUTTER, Math.min(bounds.left, viewportWidth - width - PROFILE_MENU_GUTTER));
  const below = bounds.bottom + PROFILE_MENU_GUTTER;
  const top = below + height <= viewportHeight - PROFILE_MENU_GUTTER
    ? below
    : Math.max(PROFILE_MENU_GUTTER, Math.min(bounds.top - height - PROFILE_MENU_GUTTER, viewportHeight - height - PROFILE_MENU_GUTTER));
  return { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` };
}

function isVisible(element: HTMLElement) {
  const bounds = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return bounds.width > 0 && bounds.height > 0 && style.display !== "none" && style.visibility !== "hidden";
}

function layoutKey(trigger: HTMLElement, menu: HTMLElement) {
  const opener = trigger.getBoundingClientRect();
  const surface = menu.getBoundingClientRect();
  return [
    opener.left, opener.top, opener.width, opener.height,
    surface.left, surface.top, surface.width, surface.height,
    menu.scrollWidth, menu.scrollHeight,
  ].join(",");
}

export function InstrumentProfileControl({ identity, onOpenSettings, avatar, variant = "compact" }: {
  identity: InstrumentProfileIdentity;
  onOpenSettings(): void;
  /** Rendered instead of the avatar image / initials fallback, e.g. a generated identity avatar. */
  avatar?: ReactNode;
  /** "pill" is the sidebar-footer user pill: full-width plate with a settings glyph on the right. */
  variant?: "compact" | "pill";
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const positionKey = useRef("");
  const safeAvatarUrl = localAvatarUrl(identity.avatarUrl);
  const avatarUrl = safeAvatarUrl && safeAvatarUrl !== failedAvatarUrl ? safeAvatarUrl : null;

  const restoreFocus = () => trigger.current?.focus({ preventScroll: true });
  const closeAndRestoreFocus = () => {
    setOpen(false);
    restoreFocus();
    window.requestAnimationFrame(restoreFocus);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!trigger.current || !menu.current) return;
      const nextPosition = profileMenuPosition(trigger.current, menu.current);
      const nextKey = `${nextPosition.left},${nextPosition.top}`;
      if (positionKey.current === nextKey) return;
      positionKey.current = nextKey;
      setPosition(nextPosition);
    };
    let frame: number | null = null;
    let lastLayout = "";
    const reconcile = () => {
      frame = null;
      if (!trigger.current || !menu.current || !isVisible(trigger.current)) return;
      const nextLayout = layoutKey(trigger.current, menu.current);
      if (nextLayout !== lastLayout) {
        lastLayout = nextLayout;
        place();
      }
      frame = window.requestAnimationFrame(reconcile);
    };
    const schedulePlace = () => {
      if (!trigger.current || !isVisible(trigger.current)) {
        if (frame !== null) window.cancelAnimationFrame(frame);
        frame = null;
        return;
      }
      lastLayout = "";
      place();
      if (frame === null) frame = window.requestAnimationFrame(reconcile);
    };
    positionKey.current = "";
    schedulePlace();
    const observer = new ResizeObserver(schedulePlace);
    if (trigger.current) observer.observe(trigger.current);
    if (menu.current) observer.observe(menu.current);
    window.addEventListener("resize", schedulePlace);
    window.addEventListener("scroll", schedulePlace, true);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedulePlace);
      window.removeEventListener("scroll", schedulePlace, true);
    };
  }, [open, identity.displayName, identity.initials, avatarUrl]);

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: Event) => {
      const target = event.target as Node;
      if (trigger.current?.contains(target) || menu.current?.parentElement?.contains(target)) return;
      closeAndRestoreFocus();
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
    };
  }, [open]);

  const pill = variant === "pill";
  return <div className="instrument-profile-control relative min-w-0 max-w-full" data-instrument-root="instrument-profile-control">
    <button
      ref={trigger}
      /* The sidebar-footer pill is a black widget in both themes, so it takes the on-dark ink
         and the dark hover surface; the compact trigger stands on a theme surface and takes the
         theme pair. `group` is what lets the trailing glyph follow the pill's own hover without
         a descendant variant outranking the glyph's own utilities. */
      className={`instrument-profile-trigger group box-border min-h-control-md min-w-0 max-w-full ${ROW} ${pill
        ? `h-full w-full gap-2.25 pr-3.25 pl-2 type-sm ${ON_INSTRUMENT}`
        : `px-1 ${ON_THEME}`}`}
      type="button"
      data-variant={variant}
      aria-label={variant === "pill" ? "Open settings" : "Open profile menu"}
      aria-haspopup={variant === "pill" ? undefined : "menu"}
      aria-expanded={variant === "pill" ? undefined : open}
      onClick={() => {
        // The pill's only action is Settings, so it opens it directly instead of
        // routing through a one-item menu.
        if (variant === "pill") return onOpenSettings();
        if (open) return setOpen(false);
        setPosition({ visibility: "hidden" });
        setOpen(true);
      }}
    >
      {avatar ?? (avatarUrl
        ? <img className={`instrument-profile-avatar ${IDENTITY} object-cover`} src={avatarUrl} alt="" onError={() => setFailedAvatarUrl(avatarUrl)} />
        : <span className={`instrument-profile-initials ${INITIALS}`} aria-hidden="true">{identity.initials}</span>)}
      <span className={`${LABEL} ${pill ? "flex-1" : ""}`} title={identity.displayName}>{identity.displayName}</span>
      {pill && <SlidersHorizontal className="instrument-profile-settings-glyph flex-none text-on-instrument-muted-decorative group-hover:text-on-instrument" aria-hidden="true" size={14} strokeWidth={1.8} />}
    </button>
    <InstrumentOverlay
      id="profile-menu"
      open={open}
      label="Profile"
      description="Profile actions"
      opener={trigger.current}
      onOpenChange={setOpen}
    >
      {/* The menu is fixed and placed from a measurement, so only its position is inline. Its
          measure gives way to the window: the fit keys stop it one gutter short of every edge
          so it can never overdraw the window's own rounded clip. */}
      <div
        ref={menu}
        className="instrument-profile-menu fixed z-popover box-border grid max-h-overlay-fit-block w-profile-menu min-w-profile-menu-min max-w-overlay-fit gap-2 overflow-auto rounded-menu bg-surface p-2 text-ink"
        data-instrument-root="instrument-profile-menu"
        style={position}
      >
        <div className="instrument-profile-menu-identity flex min-w-0 items-center gap-2">
          {avatar ?? (avatarUrl
            ? <img className={`instrument-profile-avatar ${IDENTITY} object-cover`} src={avatarUrl} alt="" onError={() => setFailedAvatarUrl(avatarUrl)} />
            : <span className={`instrument-profile-initials ${INITIALS}`} aria-hidden="true">{identity.initials}</span>)}
          <span className={LABEL} title={identity.displayName}>{identity.displayName}</span>
        </div>
        <button className={`min-h-control-md px-2 ${ROW} ${ON_THEME}`} type="button" role="menuitem" onClick={() => { setOpen(false); onOpenSettings(); }}>
          <Settings size={16} aria-hidden="true" />
          <span>Settings</span>
        </button>
      </div>
    </InstrumentOverlay>
  </div>;
}
