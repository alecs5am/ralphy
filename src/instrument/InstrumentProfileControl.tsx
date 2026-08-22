import { Settings, SlidersHorizontal } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { InstrumentOverlay } from "./overlay-registry";
import type { InstrumentProfileIdentity } from "./types";

const PROFILE_MENU_GUTTER = 8;

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

  return <div className="instrument-profile-control" data-instrument-root="instrument-profile-control">
    <button
      ref={trigger}
      className="instrument-profile-trigger"
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
        ? <img className="instrument-profile-avatar" src={avatarUrl} alt="" onError={() => setFailedAvatarUrl(avatarUrl)} />
        : <span className="instrument-profile-initials" aria-hidden="true">{identity.initials}</span>)}
      <span title={identity.displayName}>{identity.displayName}</span>
      {variant === "pill" && <SlidersHorizontal className="instrument-profile-settings-glyph" aria-hidden="true" size={14} strokeWidth={1.8} />}
    </button>
    <InstrumentOverlay
      id="profile-menu"
      open={open}
      label="Profile"
      description="Profile actions"
      opener={trigger.current}
      onOpenChange={setOpen}
    >
      <div ref={menu} className="instrument-profile-menu" data-instrument-root="instrument-profile-menu" style={position}>
        <div className="instrument-profile-menu-identity">
          {avatar ?? (avatarUrl
            ? <img className="instrument-profile-avatar" src={avatarUrl} alt="" onError={() => setFailedAvatarUrl(avatarUrl)} />
            : <span className="instrument-profile-initials" aria-hidden="true">{identity.initials}</span>)}
          <span title={identity.displayName}>{identity.displayName}</span>
        </div>
        <button type="button" role="menuitem" onClick={() => { setOpen(false); onOpenSettings(); }}>
          <Settings size={16} aria-hidden="true" />
          <span>Settings</span>
        </button>
      </div>
    </InstrumentOverlay>
  </div>;
}
