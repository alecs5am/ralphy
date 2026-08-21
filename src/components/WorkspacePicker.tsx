import { Check, ChevronDown, Search } from "lucide-react";
import { AnimatePresence } from "motion/react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import type { WorkspaceSummary } from "../lib/ipc";
import { workspaceDitherVars } from "../lib/project-glyph";
import { InstrumentOverlay } from "../instrument/overlay-registry";

interface WorkspacePickerProps {
  value: string;
  workspaces: WorkspaceSummary[];
  onValueChange(workspaceId: string): void;
}

interface PopoverPosition {
  top: number;
  left: number;
  width: number;
}

function initials(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase();
}

export function WorkspacePicker({
  value,
  workspaces,
  onValueChange,
}: WorkspacePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(
    null,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected = workspaces.find((workspace) => workspace.id === value);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle
      ? workspaces.filter((workspace) =>
          `${workspace.name} ${workspace.description}`.toLocaleLowerCase().includes(needle))
      : workspaces;
  }, [query, workspaces]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target)
        && !popoverRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const bounds = trigger.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 20);
      setPopoverPosition({
        top: bounds.bottom + 6,
        left: Math.min(
          Math.max(10, bounds.left - 2),
          window.innerWidth - width - 10,
        ),
        width,
      });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    setActiveIndex((index) =>
      Math.min(Math.max(0, filtered.length - 1), Math.max(0, index)),
    );
  }, [filtered.length]);

  const closeAndRestoreFocus = () => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const select = (workspace: WorkspaceSummary) => {
    onValueChange(workspace.id);
    closeAndRestoreFocus();
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndRestoreFocus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) =>
        Math.min(Math.max(0, filtered.length - 1), index + 1),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(0, filtered.length - 1));
    } else if (event.key === "Enter" && filtered[activeIndex]) {
      event.preventDefault();
      select(filtered[activeIndex]);
    }
  };

  return (
    <div className="workspace-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        className="workspace-hero"
        style={workspaceDitherVars(selected?.name ?? value)}
        type="button"
        aria-label="Select workspace"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        data-workspace-name={selected?.name}
        onClick={() => setOpen((visible) => !visible)}
      >
        <span className="workspace-hero-field" aria-hidden="true" />
        <span className="workspace-hero-field-hi" aria-hidden="true" />
        <span className="workspace-hero-scrim" aria-hidden="true" />
        <span className="workspace-hero-top">
          <span className="workspace-hero-orb" aria-hidden="true" />
          <span className="workspace-hero-chevron">
            <ChevronDown size={14} strokeWidth={1.6} />
          </span>
        </span>
        <span className="workspace-hero-copy">
          <strong>{selected?.name ?? "Workspaces"}</strong>
          <small>
            {selected?.projectCount ?? 0} PROJ · {selected?.unitCount ?? 0} UNITS · {selected?.sharedCount ?? 0} SHARED
          </small>
        </span>
      </button>
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && popoverPosition && (
            <InstrumentOverlay id="workspace-picker" host="primitive-host" open label="Workspaces" description="Select the active workspace" opener={triggerRef.current} onOpenChange={(next) => { if (!next) closeAndRestoreFocus(); }}>
            <div
              ref={popoverRef}
              className="workspace-picker-popover"
              style={popoverPosition}
            >
              <label className="workspace-picker-search">
                <Search size={14} strokeWidth={1.5} />
                <input
                  ref={inputRef}
                  type="search"
                  role="combobox"
                  aria-label="Search workspaces"
                  aria-autocomplete="list"
                  aria-expanded={open}
                  aria-controls={listId}
                  aria-activedescendant={
                    filtered[activeIndex]
                      ? `${listId}-option-${activeIndex}`
                      : undefined
                  }
                  placeholder="Search workspaces"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={onSearchKeyDown}
                />
              </label>
              <div
                className="workspace-picker-list"
                id={listId}
                role="listbox"
                aria-label="Workspaces"
              >
                {filtered.map((workspace, index) => (
                  <button
                    id={`${listId}-option-${index}`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={workspace.id === value}
                    className={index === activeIndex ? "is-highlighted" : ""}
                    style={workspaceDitherVars(workspace.name)}
                    key={workspace.id}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => select(workspace)}
                  >
                    <span className="workspace-option-field" aria-hidden="true" />
                    <span className="workspace-option-avatar">
                      {initials(workspace.name)}
                    </span>
                    <span className="workspace-option-copy">
                      <strong>{workspace.name}</strong>
                      <small>{workspace.description || "Ralphy production workspace"}</small>
                    </span>
                    <em>{workspace.projectCount}</em>
                    {workspace.id === value && <Check size={13} strokeWidth={2} />}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <span className="workspace-picker-empty">No workspaces found</span>
                )}
              </div>
            </div>
            </InstrumentOverlay>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
