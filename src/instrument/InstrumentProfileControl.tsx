import { Settings } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

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

export function InstrumentProfileControl({ identity, onOpenSettings }: {
  identity: InstrumentProfileIdentity;
  onOpenSettings(): void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
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
      if (trigger.current && menu.current) setPosition(profileMenuPosition(trigger.current, menu.current));
    };
    let frame: number | null = null;
    const schedulePlace = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = null;
        place();
      });
    };
    place();
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
      aria-label="Open profile menu"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => {
        if (open) return setOpen(false);
        setPosition({ visibility: "hidden" });
        setOpen(true);
      }}
    >
      {avatarUrl
        ? <img className="instrument-profile-avatar" src={avatarUrl} alt="" onError={() => setFailedAvatarUrl(avatarUrl)} />
        : <span className="instrument-profile-initials" aria-hidden="true">{identity.initials}</span>}
      <span title={identity.displayName}>{identity.displayName}</span>
    </button>
    <InstrumentOverlay
      id="profile-menu"
      open={open}
      label="Profile"
      description="Profile actions"
      opener={trigger.current}
      onOpenChange={setOpen}
    >
      <div ref={menu} className="instrument-profile-menu" data-instrument-root="instrument-profile-menu" style={{ position: "fixed", ...position }}>
        <div className="instrument-profile-menu-identity">
          {avatarUrl
            ? <img className="instrument-profile-avatar" src={avatarUrl} alt="" onError={() => setFailedAvatarUrl(avatarUrl)} />
            : <span className="instrument-profile-initials" aria-hidden="true">{identity.initials}</span>}
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
