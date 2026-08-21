import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { InstrumentOverlay, type InstrumentSharedSelectOwnerId } from "../../instrument/overlay-registry";

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
        className={`select-menu-trigger ${className}`.trim()}
        aria-label={ariaLabel}
      >
        {selected?.icon}
        <span className="select-menu-value">
          {prefix && <span className="select-menu-prefix">{prefix}</span>}
          <Select.Value>{selected?.label}</Select.Value>
        </span>
        {selected?.meta && <small>{selected.meta}</small>}
        <Select.Icon className="select-menu-chevron">
          <ChevronDown size={14} strokeWidth={1.6} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <InstrumentOverlay id="shared-select-menu" host="primitive-host" overlayOwner={overlayOwner} open={open} label={ariaLabel} description={`Choose ${ariaLabel}`} opener={triggerRef.current} onOpenChange={setOpen}>
          <Select.Content
            className="select-menu-content"
            position="popper"
            side={side}
            align={align}
            sideOffset={6}
            collisionPadding={10}
          >
            <Select.Viewport className="select-menu-viewport">
              {options.map((option) => (
                <Select.Item
                  className="select-menu-item"
                  value={option.value}
                  key={option.value}
                >
                  <Select.ItemText>
                    <span className="select-menu-item-content">
                      {option.icon}
                      <span>
                        <strong>{option.label}</strong>
                        {option.description && <small>{option.description}</small>}
                      </span>
                      {option.meta && <em>{option.meta}</em>}
                    </span>
                  </Select.ItemText>
                  <Select.ItemIndicator className="select-menu-indicator">
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
