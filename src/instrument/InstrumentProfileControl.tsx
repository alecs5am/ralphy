import { Settings } from "lucide-react";
import { useRef, useState } from "react";

import { InstrumentOverlay } from "./overlay-registry";
import type { InstrumentProfileIdentity } from "./types";

function localAvatarUrl(avatarUrl: string | null): string | null {
  if (!avatarUrl) return null;
  try {
    const url = new URL(avatarUrl, window.location?.href);
    return url.protocol === "file:" || url.protocol === "data:" || url.protocol === "blob:" || url.origin === window.location?.origin
      ? avatarUrl
      : null;
  } catch {
    return null;
  }
}

export function InstrumentProfileControl({ identity, onOpenSettings }: {
  identity: InstrumentProfileIdentity;
  onOpenSettings(): void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const avatarUrl = localAvatarUrl(identity.avatarUrl);

  return <div className="instrument-profile-control" data-instrument-root="instrument-profile-control">
    <button
      ref={trigger}
      className="instrument-profile-trigger"
      type="button"
      aria-label="Open profile menu"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
    >
      {avatarUrl
        ? <img className="instrument-profile-avatar" src={avatarUrl} alt="" />
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
      <div className="instrument-profile-menu" data-instrument-root="instrument-profile-menu">
        <div className="instrument-profile-menu-identity">
          {avatarUrl
            ? <img className="instrument-profile-avatar" src={avatarUrl} alt="" />
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
