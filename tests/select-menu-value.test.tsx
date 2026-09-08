import { act, type ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { createReactHost } from "./react-host";

let change: (value: string) => void;
let currentValue: string;
vi.mock("@radix-ui/react-select", async () => ({
  ...await vi.importActual<typeof import("@radix-ui/react-select")>("@radix-ui/react-select"),
  Root: ({ value, onValueChange, children }: { value: string; onValueChange(value: string): void; children: ReactNode }) => { currentValue = value; change = onValueChange; return <>{children}</>; },
  Trigger: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  Value: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Icon: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Portal: () => null,
}));

test("a form's empty select reset cannot erase a valid controlled choice", async () => {
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const { SelectMenu } = await import("../src/shared/ui/SelectMenu");
  const root = createRoot(host.container as unknown as Element);
  const onChange = vi.fn();
  try {
    await act(async () => root.render(<SelectMenu overlayOwner="generation.parameters" value="1" ariaLabel="Variations" options={[{ value: "1", label: "One" }, { value: "2", label: "Two" }]} onValueChange={onChange} />));
    await act(async () => { change(""); change("stale-option"); });
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => change("2"));
    expect(onChange).toHaveBeenCalledWith("2");
  } finally { await act(async () => root.unmount()); host.restore(); }
});

test("Auto can round-trip an empty domain value without passing an empty option to Radix", async () => {
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const { SelectMenu } = await import("../src/shared/ui/SelectMenu");
  const root = createRoot(host.container as unknown as Element);
  const onChange = vi.fn();
  try {
    await act(async () => root.render(<SelectMenu overlayOwner="canvas.parameters" value="" ariaLabel="Resolution" options={[{ value: "", label: "Auto" }, { value: "720p", label: "720p" }]} onValueChange={onChange} />));
    expect(currentValue).not.toBe("");
    const auto = currentValue;
    await act(async () => { change(""); });
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => { change("720p"); change(auto); });
    expect(onChange.mock.calls).toEqual([["720p"], [""]]);
  } finally { await act(async () => root.unmount()); host.restore(); }
});
