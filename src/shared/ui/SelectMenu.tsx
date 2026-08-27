import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { InstrumentOverlay, type InstrumentSharedSelectOwnerId } from "../instrument/overlay-registry";

/* The trigger is a control in its own right, so its shape and behaviour live here rather than
   with whoever mounts it. Geometry only: height, radius, padding, surface, ink and focus ring
   travel together in one skin, either this component's or the caller's, so exactly one of each
   ever lands on the button. `select-menu-trigger` stays as the hook work-surfaces.css reads to
   flip the legacy token set for the subtree. */
const TRIGGER = "select-menu-trigger group grid min-w-0 grid-cols-(--select-menu-trigger-columns) items-center gap-1.75 text-left [corner-shape:round]";
/* The instrument skin: a black pill with on-dark ink, in both themes, and the on-dark ring —
   the theme ring is black on black here in the light theme. */
const TRIGGER_INSTRUMENT = "h-control-md rounded-control bg-instrument px-3 text-on-instrument-muted hover:bg-instrument-hover hover:text-on-instrument data-[state=open]:bg-instrument-hover data-[state=open]:text-on-instrument focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-on-instrument";

/* The plate: one flat black widget in both themes, R18, no border and no shadow. `corner-shape`
   is not restated -- tokens.css keys the squircle on this class already. The two fits are named
   rather than written: `--select-menu-fit-block` has to be declared *on this element*, because
   `--radix-select-content-available-height` is only in scope here and a `var()` inside a custom
   property is substituted where the property is declared, not where it is read. */
const CONTENT = "select-menu-content z-popover min-w-(--radix-select-trigger-width) max-w-select-menu max-h-(--select-menu-fit-block) overflow-hidden rounded-menu bg-instrument p-1.5 text-on-instrument origin-(--radix-select-content-transform-origin) animate-select-menu-in motion-reduce:animate-none";
/* A menu row. Both ink halves are mutually exclusive guards on one property, so the generated
   sheet never has to choose: the checked row is the inverted pair, everything else is the muted
   on-dark ink. `--instrument-selected-surface` / `--instrument-selected-ink` is #F2F2F0 over
   #111111 in both themes -- the legacy `--selected` / `--selected-ink` pair is white on white
   in the dark theme and is not what this row uses. */
const ITEM = "select-menu-item relative flex min-w-0 min-h-8 items-center rounded-control pr-7.5 pl-3 outline-0 select-none [corner-shape:round] data-[state=checked]:bg-selected data-[state=checked]:text-selected-ink not-data-[state=checked]:text-on-instrument-muted data-[highlighted]:not-data-[state=checked]:bg-instrument-hover data-[highlighted]:not-data-[state=checked]:text-on-instrument";
/* Copy inside a row states no ink at all: it has to inherit the row's, which inverts when the
   row is the checked one. */
const ITEM_STRONG = "truncate type-sm font-normal";
const ITEM_META = "truncate font-code type-mono-sm tracking-label uppercase not-italic";

export interface SelectMenuOption<Value extends string> {
  value: Value;
  label: string;
  description?: string;
  icon?: ReactNode;
  meta?: string;
}

export interface SelectMenuProps<Value extends string> {
  value: Value;
  options: Array<SelectMenuOption<Value>>;
  ariaLabel: string;
  className?: string;
  prefix?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  overlayOwner: InstrumentSharedSelectOwnerId;
  /** "caller" declines the instrument skin: the call site states height, radius, padding,
   *  surface, ink and focus ring itself, so the two never both name one property. */
  tone?: "instrument" | "caller";
  onValueChange(value: Value): void;
}

export function SelectMenu<Value extends string>({
  value,
  options,
  ariaLabel,
  className = "",
  prefix,
  side = "bottom",
  align = "start",
  overlayOwner,
  tone = "instrument",
  onValueChange,
}: SelectMenuProps<Value>) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((option) => option.value === value);

  return (
    <Select.Root
      open={open}
      onOpenChange={setOpen}
      value={value}
      onValueChange={(next) => onValueChange(next as Value)}
    >
      <Select.Trigger
        ref={triggerRef}
        className={`${TRIGGER} ${tone === "instrument" ? TRIGGER_INSTRUMENT : ""} ${className}`.replace(/\s+/g, " ").trim()}
        aria-label={ariaLabel}
      >
        {selected?.icon}
        <span className="select-menu-value flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap">
          {prefix && <span className="select-menu-prefix type-sm whitespace-nowrap">{prefix}</span>}
          <Select.Value className="truncate">{selected?.label}</Select.Value>
        </span>
        {selected?.meta && <small className="type-sm whitespace-nowrap">{selected.meta}</small>}
        <Select.Icon className="select-menu-chevron inline-grid flex-none place-items-center transition-transform duration-normal ease-instrument group-data-[state=open]:rotate-180 motion-reduce:transition-none motion-reduce:duration-0">
          <ChevronDown size={14} strokeWidth={1.6} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <InstrumentOverlay id="shared-select-menu" host="primitive-host" overlayOwner={overlayOwner} open={open} label={ariaLabel} description={`Choose ${ariaLabel}`} opener={triggerRef.current} onOpenChange={setOpen}>
          <Select.Content
            className={CONTENT}
            position="popper"
            side={side}
            align={align}
            sideOffset={6}
            collisionPadding={10}
          >
            <Select.Viewport className="select-menu-viewport">
              {options.map((option) => (
                <Select.Item
                  className={ITEM}
                  value={option.value}
                  key={option.value}
                >
                  <Select.ItemText>
                    <span className="select-menu-item-content grid w-full min-w-0 grid-cols-(--select-menu-item-columns) items-center gap-2.25">
                      {option.icon}
                      <span className="flex min-w-0 flex-col">
                        <strong className={ITEM_STRONG}>{option.label}</strong>
                        {option.description && <small className={ITEM_META}>{option.description}</small>}
                      </span>
                      {option.meta && <em className={ITEM_META}>{option.meta}</em>}
                    </span>
                  </Select.ItemText>
                  <Select.ItemIndicator className="select-menu-indicator absolute right-2.25 inline-grid place-items-center">
                    <Check size={13} strokeWidth={2} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </InstrumentOverlay>
      </Select.Portal>
    </Select.Root>
  );
}
