import {
  CircleHelp,
  ExternalLink,
  Globe2,
  Keyboard,
  Settings,
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

/* Profile and help are one flat black widget in both themes, so every control inside them
   keeps the on-instrument ink and the theme-invariant ghost surface for hover: the theme's own
   hover surface turns white in light and makes on-instrument ink disappear. */
const MENU = "fixed z-popover rounded-menu bg-instrument p-1.5 [corner-shape:squircle]";
const MENU_ITEM = "grid h-7.5 w-full items-center gap-2 rounded-field px-1.75 type-sm text-left no-underline text-on-instrument-muted [grid-template-columns:var(--spacing-settings-keycap)_minmax(0,1fr)_auto] hover:bg-ghost hover:text-on-instrument focus-visible:bg-ghost focus-visible:text-on-instrument focus-visible:outline-focus-on-instrument";
const MENU_TRIGGER = "rounded-control text-on-instrument-muted hover:bg-ghost hover:text-on-instrument aria-expanded:bg-ghost aria-expanded:text-on-instrument focus-visible:outline-focus-on-instrument";
const MENU_QUIET = "type-xs text-on-instrument-muted";
const MENU_SEPARATOR = "mx-1 my-0.75 h-px bg-menu-divider";
const UPDATE_ROW = "grid h-6.5 items-center gap-1.5 px-1.5 [grid-template-columns:calc(var(--spacing)*2)_minmax(0,1fr)_auto]";
const UPDATE_TITLE = "overflow-hidden type-sm font-normal text-ellipsis whitespace-nowrap text-on-instrument-muted";

export function ProfileMenu({
  rootPath,
  onOpenSettings,
}: {
  rootPath: string;
  onOpenSettings(): void;
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
      <div className="flex w-full items-center gap-1.5">
        <button
          className={`flex h-8 min-w-0 flex-1 items-center gap-2 px-2 text-left ${MENU_TRIGGER}`}
          type="button"
          aria-label="Open profile menu"
          aria-haspopup="menu"
          aria-expanded={open === "profile"}
          ref={profileTriggerRef}
          onClick={() => setOpen((value) => value === "profile" ? null : "profile")}
        >
          <ProfileAvatar rootPath={rootPath} size={20} />
          {/* The name takes what the avatar leaves and truncates. No ink of its own: the
              trigger states the on-dark pair, and reset.css already gives `strong` weight 400. */}
          <strong className="sidebar-profile-name min-w-0 flex-1 truncate type-sm">{identity}</strong>
        </button>
        <button
          className={`inline-grid size-8 flex-none place-items-center ${MENU_TRIGGER}`}
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
              className={MENU}
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
                  <div className="flex h-7.5 min-w-0 items-center gap-2 px-1.75">
                    <ProfileAvatar rootPath={rootPath} size={20} />
                    <strong className="min-w-0 overflow-hidden type-sm font-normal text-ellipsis whitespace-nowrap text-on-instrument">{identity}</strong>
                  </div>
                  <div className={MENU_SEPARATOR} />
                  <button
                    className={MENU_ITEM}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(null);
                      onOpenSettings();
                    }}
                  >
                    <Settings size={15} strokeWidth={1.5} />
                    <span>Settings</span>
                    <kbd className={`font-app ${MENU_QUIET}`}>⌘,</kbd>
                  </button>
                </>
              ) : (
                <>
                  <div className={`px-1.5 pt-1 pb-0.5 ${MENU_QUIET}`}>What's new</div>
                  <div className={UPDATE_ROW}>
                    <span className="size-1.5 rounded-control border border-on-instrument-muted" />
                    <strong className={UPDATE_TITLE}>Ralphy Desktop preview</strong>
                    <time className={MENU_QUIET}>17 Aug</time>
                  </div>
                  <div className={UPDATE_ROW}>
                    <span className="size-1.5 rounded-control border border-on-instrument-muted" />
                    <strong className={UPDATE_TITLE}>Project media grid</strong>
                    <time className={MENU_QUIET}>17 Aug</time>
                  </div>
                  <div className={MENU_SEPARATOR} />
                  <a className={MENU_ITEM} href="https://alecs5am.com" target="_blank" rel="noreferrer" role="menuitem" onClick={() => setOpen(null)}>
                    <Globe2 size={15} strokeWidth={1.5} />
                    <span>Ralphy website</span>
                    <ExternalLink size={13} strokeWidth={1.5} />
                  </a>
                  <button className={`${MENU_ITEM} disabled:type-xs disabled:text-on-instrument-muted`} type="button" role="menuitem" disabled>
                    <Keyboard size={15} strokeWidth={1.5} />
                    <span>Keyboard shortcuts</span>
                    <small className={MENU_QUIET}>Soon</small>
                  </button>
                  <a className={MENU_ITEM} href="https://alecs5am.com" target="_blank" rel="noreferrer" role="menuitem" onClick={() => setOpen(null)}>
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
