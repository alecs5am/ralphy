import { ChevronRight, Settings } from "lucide-react";
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
  onOpenSettings,
}: {
  rootPath: string;
  onOpenSettings(): void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const identity = profileIdentity(rootPath);

  const closeAndRestoreFocus = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const bounds = triggerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      setPosition({
        left: Math.min(bounds.left, window.innerWidth - 266),
        bottom: window.innerHeight - bounds.top + 8,
        width: Math.max(bounds.width, 246),
      });
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target)
        && !triggerRef.current?.contains(target)
      ) {
        setOpen(false);
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
      <button
        className="profile-menu-trigger"
        type="button"
        aria-label="Open profile menu"
        aria-haspopup="menu"
        aria-expanded={open}
        ref={triggerRef}
        onClick={() => setOpen((value) => !value)}
      >
        <ProfileAvatar rootPath={rootPath} />
        <span className="sidebar-profile-copy">
          <strong>{identity}</strong>
          <small title={rootPath}>.ralphy library</small>
        </span>
        <ChevronRight
          className="profile-menu-chevron"
          size={14}
          strokeWidth={1.5}
        />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              className="profile-menu"
              role="menu"
              aria-label="Profile"
              ref={menuRef}
              style={position}
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.985 }}
              transition={{ duration: 0.14, ease: [0.2, 0, 0.2, 1] }}
            >
              <div className="profile-menu-identity">
                <ProfileAvatar rootPath={rootPath} size={30} />
                <span>
                  <strong>{identity}</strong>
                  <small>Local workspace profile</small>
                </span>
              </div>
              <div className="profile-menu-separator" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onOpenSettings();
                }}
              >
                <Settings size={15} strokeWidth={1.5} />
                <span>Settings</span>
                <kbd>⌘,</kbd>
              </button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
