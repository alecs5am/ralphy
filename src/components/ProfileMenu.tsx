import {
  CircleHelp,
  ExternalLink,
  Globe2,
  Keyboard,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

import { ProfileAvatar, profileIdentity } from "./ProfileAvatar";

export function ProfileMenu({
  rootPath,
}: {
  rootPath: string;
}) {
  const [open, setOpen] = useState<"profile" | "help" | null>(null);
  const [position, setPosition] = useState<CSSProperties>({});
  const profileTriggerRef = useRef<HTMLButtonElement>(null);
  const helpTriggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const identity = profileIdentity(rootPath);

  const closeAndRestoreFocus = () => {
    const trigger = open === "help" ? helpTriggerRef : profileTriggerRef;
    setOpen(null);
    requestAnimationFrame(() => trigger.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = open === "help" ? helpTriggerRef : profileTriggerRef;
      const bounds = trigger.current?.getBoundingClientRect();
      if (!bounds) return;
      const width = open === "help" ? 320 : Math.max(bounds.width, 246);
      setPosition({
        left: Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8)),
        bottom: window.innerHeight - bounds.top + 8,
        width,
      });
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target)
        && !profileTriggerRef.current?.contains(target)
        && !helpTriggerRef.current?.contains(target)
      ) {
        setOpen(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAndRestoreFocus();
    };
    place();
    requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    });
    window.addEventListener("resize", place);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <div className="profile-controls">
        <button
          className="profile-menu-trigger"
          type="button"
          aria-label="Open profile menu"
          aria-haspopup="menu"
          aria-expanded={open === "profile"}
          ref={profileTriggerRef}
          onClick={() => setOpen((value) => value === "profile" ? null : "profile")}
        >
          <ProfileAvatar rootPath={rootPath} size={20} />
          <strong className="sidebar-profile-name">{identity}</strong>
        </button>
        <button
          className="help-menu-trigger"
          type="button"
          aria-label="Open help menu"
          aria-haspopup="menu"
          aria-expanded={open === "help"}
          ref={helpTriggerRef}
          onClick={() => setOpen((value) => value === "help" ? null : "help")}
        >
          <CircleHelp size={15} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              className={open === "help" ? "help-menu" : "profile-menu"}
              role="menu"
              aria-label={open === "help" ? "Help" : "Profile"}
              ref={menuRef}
              style={position}
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.985 }}
              transition={{ duration: 0.14, ease: [0.2, 0, 0.2, 1] }}
            >
              {open === "profile" ? (
                <>
                  <div className="profile-menu-identity">
                    <ProfileAvatar rootPath={rootPath} size={20} />
                    <strong>{identity}</strong>
                  </div>
                </>
              ) : (
                <>
                  <div className="help-menu-label">What's new</div>
                  <div className="help-menu-update">
                    <span />
                    <strong>Ralphy Desktop preview</strong>
                    <time>17 Aug</time>
                  </div>
                  <div className="help-menu-update">
                    <span />
                    <strong>Project media grid</strong>
                    <time>17 Aug</time>
                  </div>
                  <div className="menu-separator" />
                  <a href="https://alecs5am.com" target="_blank" rel="noreferrer" role="menuitem" onClick={() => setOpen(null)}>
                    <Globe2 size={15} strokeWidth={1.5} />
                    <span>Ralphy website</span>
                    <ExternalLink size={13} strokeWidth={1.5} />
                  </a>
                  <button type="button" role="menuitem" disabled>
                    <Keyboard size={15} strokeWidth={1.5} />
                    <span>Keyboard shortcuts</span>
                    <small>Soon</small>
                  </button>
                  <a href="https://alecs5am.com" target="_blank" rel="noreferrer" role="menuitem" onClick={() => setOpen(null)}>
                    <CircleHelp size={15} strokeWidth={1.5} />
                    <span>Help</span>
                    <ExternalLink size={13} strokeWidth={1.5} />
                  </a>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
