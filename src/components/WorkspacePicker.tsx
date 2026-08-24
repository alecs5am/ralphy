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

/* The workspace card. `sidebar-context` states the 118px height once; the picker and its hero
   fill it, and the dither plates are cut to the same card. */
const HERO = "workspace-hero group relative block h-full w-full flex-none overflow-hidden rounded-hero bg-instrument text-left text-on-instrument focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-on-instrument";
const HERO_PLATE = "pointer-events-none absolute top-0 left-0 h-workspace-card w-full [mask-repeat:no-repeat] [mask-size:var(--workspace-hero-mask-size)]";
/* One option in the list. Geometry and behaviour only: the ink pair is stated per row below,
   because the active workspace is the one inverted pill and that pair is declared elsewhere. */
const OPTION = "relative grid min-h-11 w-full grid-cols-(--workspace-option-columns) items-center gap-2.5 overflow-hidden rounded-control pr-3 pl-2 text-left [corner-shape:round] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-on-instrument";
/* The active workspace is the one inverted pill in the list, and the inversion holds under the
   cursor. Its children state no ink, so they take this one. */
const OPTION_ACTIVE = "bg-selected text-selected-ink hover:bg-selected";
/* Everything except the dither plate stands above it. */
const OPTION_LAYER = "relative z-1";
/* The active workspace keeps the inverted pair declared for `[aria-selected="true"]`, so a row
   states an ink only while it is not the active one: one surface and one ink per row, never two. */
const OPTION_HIGHLIGHTED = "bg-instrument-hover text-on-instrument";
const OPTION_REST = "text-on-instrument-muted hover:bg-instrument-hover hover:text-on-instrument";

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
    <div className="workspace-picker relative h-full min-w-0 flex-1" ref={rootRef}>
      <button
        ref={triggerRef}
        className={HERO}
        style={workspaceDitherVars(selected?.name ?? value)}
        type="button"
        aria-label="Select workspace"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        data-workspace-name={selected?.name}
        onClick={() => setOpen((visible) => !visible)}
      >
        <span className={`workspace-hero-field ${HERO_PLATE} [background:var(--workspace-color,var(--instrument-dither-base))] [mask-image:var(--workspace-hero-mask)] [opacity:var(--dither-op)]`} aria-hidden="true" />
        <span className={`workspace-hero-field-hi ${HERO_PLATE} opacity-80 [background:var(--workspace-highlight,var(--instrument-dither-highlight))] [mask-image:var(--workspace-hero-mask-hi)]`} aria-hidden="true" />
        {/* A flat plate over the foot of the card, never a gradient: v2 forbids depth ramps. */}
        <span className="workspace-hero-scrim pointer-events-none absolute inset-x-0 bottom-0 h-14.5 bg-media-plate" aria-hidden="true" />
        <span className="workspace-hero-chevron absolute top-3 right-3 grid size-6 place-items-center rounded-control bg-on-instrument text-instrument">
          <ChevronDown className="transition-transform duration-normal ease-instrument group-aria-expanded:rotate-180 motion-reduce:transition-none motion-reduce:duration-0" size={12} strokeWidth={2} />
        </span>
        <span className="workspace-hero-copy absolute inset-x-4 bottom-3.25 flex min-w-0 flex-col gap-1.25">
          <strong className="truncate type-title">{selected?.name ?? "Workspaces"}</strong>
          <small className="truncate font-display type-sm font-extrabold tracking-figure text-on-instrument-muted" title={`${selected?.projectCount ?? 0} projects · ${selected?.unitCount ?? 0} units · ${selected?.sharedCount ?? 0} shared`}>
            {selected?.projectCount ?? 0} PROJ · {selected?.unitCount ?? 0} UNITS
          </small>
        </span>
      </button>
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && popoverPosition && (
            <InstrumentOverlay id="workspace-picker" host="primitive-host" open label="Workspaces" description="Select the active workspace" opener={triggerRef.current} onOpenChange={(next) => { if (!next) closeAndRestoreFocus(); }}>
            <div
              ref={popoverRef}
              /* A widget, not a system menu: flat #141414 plate, R24, no border and no shadow.
                 tokens.css already keys the squircle on this class. */
              className="workspace-picker-popover fixed z-popover origin-top-left overflow-hidden rounded-panel bg-instrument p-2 text-on-instrument"
              style={popoverPosition}
            >
              <label className="workspace-picker-search mb-1.5 flex h-control-lg items-center gap-2.25 rounded-control bg-instrument-raised px-3 text-on-instrument-muted [corner-shape:round] focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-focus-on-instrument">
                <Search size={14} strokeWidth={1.5} />
                <input
                  className="min-w-0 flex-1 bg-transparent type-sm text-on-instrument caret-on-instrument outline-none placeholder:text-on-instrument-muted"
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
                className="workspace-picker-list max-h-picker-list overflow-auto"
                id={listId}
                role="listbox"
                aria-label="Workspaces"
              >
                {filtered.map((workspace, index) => {
                  const active = workspace.id === value;
                  const highlighted = index === activeIndex;
                  return (
                  <button
                    id={`${listId}-option-${index}`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={active}
                    className={`${OPTION} ${active ? OPTION_ACTIVE : highlighted ? OPTION_HIGHLIGHTED : OPTION_REST}`}
                    style={workspaceDitherVars(workspace.name)}
                    key={workspace.id}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => select(workspace)}
                  >
                    <span className={`workspace-option-field pointer-events-none absolute top-0 left-0 z-0 h-11 w-workspace-option-field [background:var(--workspace-color)] [mask-image:var(--workspace-option-mask)] [mask-repeat:no-repeat] [mask-size:var(--workspace-option-mask-size)] ${active ? "opacity-0" : highlighted ? "opacity-46" : "opacity-30"}`} aria-hidden="true" />
                    <span className={`workspace-option-avatar ${OPTION_LAYER} inline-grid size-7 flex-none place-items-center rounded-control [corner-shape:round] [background:var(--workspace-color)] font-code type-mono-sm tracking-label text-on-instrument`} aria-hidden="true">
                      {initials(workspace.name)}
                    </span>
                    <span className={`workspace-option-copy ${OPTION_LAYER} flex min-w-0 flex-col`}>
                      <strong className={`truncate type-sm font-normal${active ? "" : " text-on-instrument"}`}>{workspace.name}</strong>
                      <small className={`truncate font-code type-mono-sm tracking-label uppercase${active ? "" : " text-on-instrument-muted"}`}>{workspace.description || "Ralphy production workspace"}</small>
                    </span>
                    <em className={`${OPTION_LAYER} font-display type-base font-extrabold not-italic tracking-figure${active ? "" : " text-on-instrument-muted"}`}>{workspace.projectCount}</em>
                    {active && <Check className={OPTION_LAYER} size={13} strokeWidth={2} />}
                  </button>
                  );
                })}
                {filtered.length === 0 && (
                  <span className="workspace-picker-empty block px-3 py-5 text-center type-sm text-on-instrument-muted">No workspaces found</span>
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
