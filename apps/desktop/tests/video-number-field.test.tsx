import { act } from "react";
import { expect, test, vi } from "vitest";
import { NumberField } from "../src/features/video-workspace/ui/VideoInspector";
import { createReactHost } from "./react-host";

test("video numbers permit partial typing and clamp only the completed edit", async () => {
  const host = createReactHost(), { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element), change = vi.fn();
  try {
    await act(async () => root.render(<NumberField label="Size" value={64} min={8} max={400} onChange={change} />));
    const input = host.container.querySelector("input")!;
    await act(async () => { input.value = "1"; input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(input.value).toBe("1");
    expect(change).not.toHaveBeenCalled();
    await act(async () => { input.value = "16"; input.dispatchEvent(new Event("focusout", { bubbles: true })); });
    expect(change).toHaveBeenLastCalledWith(16);
    await act(async () => { input.value = "1"; input.dispatchEvent(new Event("focusout", { bubbles: true })); });
    expect(change).toHaveBeenLastCalledWith(8);
    expect(input.value).toBe("8");
    await act(async () => { input.value = ""; input.dispatchEvent(new Event("focusout", { bubbles: true })); });
    expect(input.value).toBe("64");
    await act(async () => root.render(<NumberField label="Size" value={32} min={8} max={400} onChange={change} />));
    expect(host.container.querySelector("input")!.value).toBe("32");
  } finally { await act(async () => root.unmount()); host.restore(); }
});
