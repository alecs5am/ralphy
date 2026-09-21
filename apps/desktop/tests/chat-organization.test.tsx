import { act } from "react";
import { expect, test, vi } from "vitest";
import { SidebarChats, type SidebarChat } from "@/widgets/sidebar";
import { createReactHost } from "./react-host";

test("searches full message text among 60 chats, renames and restores archived conversations", async () => {
  const host = createReactHost(), { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  const chats: SidebarChat[] = Array.from({ length: 60 }, (_, index) => ({ id: String(index), title: `Chat ${index}`, busy: index === 1, updatedAt: index, archived: index === 1, entries: [{ kind: "user", text: index === 1 ? "Distinctive creative hypothesis" : "ordinary" }] }));
  const rename = vi.fn(), archive = vi.fn();
  const render = async (query: string) => { await act(async () => root.render(<SidebarChats chats={chats} query={query} activeChatId="0" now={100} onRenameChat={rename} onArchiveChat={archive} />)); };
  const click = async (label: string) => { const button = host.container.querySelectorAll("button").find((node) => node.getAttribute("aria-label") === label || node.textContent === label)!; expect(button).toBeTruthy(); await act(async () => button.dispatchEvent(new Event("click", { bubbles: true }))); };
  try {
    await render("hypothesis");
    expect(host.container.textContent).toContain("No conversations match");
    await click("Collapse chats");
    expect(host.container.textContent).not.toContain("No conversations match");
    await click("Show archived chats");
    expect(host.container.textContent).toContain("Chat 1");
    expect(host.container.textContent).not.toContain("Chat 59");
    expect(host.container.textContent).toContain("keep their history and running work");
    await click("Restore Chat 1");
    expect(archive).toHaveBeenCalledWith("1", false);
    await click("Rename Chat 1");
    const input = host.container.querySelector("input")!;
    Object.assign(input, { attachEvent() {}, detachEvent() {}, selectionStart: 0, selectionEnd: 0 });
    await act(async () => { input.dispatchEvent(new Event("focusin", { bubbles: true })); input.value = "My hypothesis"; input.dispatchEvent(new Event("keyup", { bubbles: true })); input.dispatchEvent(new Event("focusout", { bubbles: true })); });
    await act(async () => host.container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(rename).toHaveBeenCalledWith("1", "My hypothesis");
  } finally { await act(async () => root.unmount()); host.restore(); }
});
