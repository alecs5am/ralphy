import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { bridge } from "@/shared/api/ipc";
import { ChatTextCard } from "../src/features/agent-chat/ui/ChatTextCard";
import { createReactHost } from "./react-host";

test.each(["prompt", "caption"] as const)("%s card copies exact text, reports failure and expands long copy", async (kind) => {
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  const text = 'Keep <script>literal text</script> & "quotes".\n' + "A complete creative direction. ".repeat(12);
  const copy = vi.spyOn(bridge, "copyText").mockRejectedValueOnce(new Error("Clipboard unavailable")).mockResolvedValue(undefined);
  try {
    await act(async () => root.render(<ChatTextCard kind={kind} text={text} />));
    expect(host.container.querySelector("script")).toBeNull();
    expect(host.container.querySelector("p")?.textContent).toBe(text);
    expect(host.container.querySelector("p")?.getAttribute("class")).toContain("line-clamp-3");
    const copyButton = host.container.querySelectorAll("button").find((node) => node.getAttribute("aria-label") === `Copy ${kind}`)!;
    await act(async () => copyButton.dispatchEvent(new Event("click", { bubbles: true })));
    expect(host.container.textContent).toContain("Retry copy");
    await act(async () => copyButton.dispatchEvent(new Event("click", { bubbles: true })));
    expect(copy).toHaveBeenLastCalledWith(text);
    expect(host.container.textContent).toContain("Copied");
    const expand = host.container.querySelectorAll("button").find((node) => node.getAttribute("aria-controls"))!;
    await act(async () => expand.dispatchEvent(new Event("click", { bubbles: true })));
    expect(expand.getAttribute("aria-expanded")).toBe("true");
    expect(host.container.querySelector("p")?.getAttribute("class")).not.toContain("line-clamp-3");
    await act(async () => root.render(<ChatTextCard kind={kind} text="Short new copy" />));
    expect(host.container.textContent).not.toContain("Copied");
    expect(host.container.querySelectorAll("button")).toHaveLength(1);
  } finally { await act(async () => root.unmount()); copy.mockRestore(); host.restore(); }
});
