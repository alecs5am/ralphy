import { Settings } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { InstrumentOverlay } from "./overlay-registry";
import type { InstrumentProfileIdentity } from "./types";

const PROFILE_MENU_WIDTH = 192;
const PROFILE_MENU_HEIGHT = 96;
const PROFILE_MENU_MARGIN = 8;

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

function profileMenuPosition(trigger: HTMLElement): CSSProperties {
  const bounds = trigger.getBoundingClientRect();
  const width = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
  const height = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
  const left = Math.max(PROFILE_MENU_MARGIN, Math.min(bounds.left, width - PROFILE_MENU_WIDTH - PROFILE_MENU_MARGIN));
  const below = bounds.bottom + PROFILE_MENU_MARGIN;
  const top = below + PROFILE_MENU_HEIGHT <= height - PROFILE_MENU_MARGIN
    ? below
    : Math.max(PROFILE_MENU_MARGIN, bounds.top - PROFILE_MENU_HEIGHT - PROFILE_MENU_MARGIN);
  return { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` };
}

export function InstrumentProfileControl({ identity, onOpenSettings }: {
  identity: InstrumentProfileIdentity;
  onOpenSettings(): void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>();
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
      if (trigger.current) setPosition(profileMenuPosition(trigger.current));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

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
        if (trigger.current) setPosition(profileMenuPosition(trigger.current));
        setOpen(true);
      }}
    >
      {avatarUrl
        ? <img className="instrument-profile-avatar" src={avatarUrl} alt="" onError={() => setFailedAvatarUrl(avatarUrl)} />
        : <span className="instrument-profile-initials" aria-hidden="true">{identity.initials}</span>}
      <span>{identity.displayName}</span>
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
          <span>{identity.displayName}</span>
        </div>
        <button type="button" role="menuitem" onClick={() => { setOpen(false); onOpenSettings(); }}>
          <Settings size={16} aria-hidden="true" />
          <span>Settings</span>
        </button>
      </div>
    </InstrumentOverlay>
  </div>;
}
