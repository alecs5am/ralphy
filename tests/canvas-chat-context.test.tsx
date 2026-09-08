import { act } from "react";
import { expect, test, vi } from "vitest";
import { bridge } from "@/shared/api/ipc";
import { addAttachments, attachmentInstructions, readEntityDrop, RALPHY_ENTITY_DRAG, useAgentChat, withAttachments, type AgentChatController, type Attachment } from "@/features/agent-chat";
import { createReactHost } from "./react-host";

test("canvas protocol reaches the agent without filling visible history, and stays tied to its attachment", async () => {
  const attachment: Attachment = { kind: "file", ref: "/canvas.json", label: "Image concept", instructions: "Acquire the workspace write lock before editing the canvas schema." };
  const attachments = addAttachments([{ kind: "file", ref: attachment.ref, label: "Canvas" }], [attachment]);
  expect(attachments).toEqual([attachment]);
  expect(attachmentInstructions(attachments.filter((item) => item.ref !== attachment.ref))).toBe("");
  expect(readEntityDrop({ types: [RALPHY_ENTITY_DRAG], getData: () => JSON.stringify(attachment) })).toEqual([{ kind: "file", ref: attachment.ref, label: attachment.label }]);
  const send = vi.spyOn(bridge, "sendAgentMessage").mockResolvedValue(undefined);
  vi.spyOn(bridge, "getAgentProviders").mockResolvedValue([{ id: "codex", connected: true, models: [], defaultModel: "default" }] as never);
  vi.spyOn(bridge, "onAgentEvent").mockReturnValue(() => undefined);
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  let chat!: AgentChatController;
  function Harness() { chat = useAgentChat({ rootPath: "/root", workspaceId: "workspace", project: null }); return null; }
  try {
    await act(async () => root.render(<Harness />));
    const visible = withAttachments("Help me improve this canvas.", attachments);
    await act(async () => chat.send(visible, attachmentInstructions(attachments)));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ prompt: `${visible}\n\n${attachment.instructions}` }));
    expect(chat.activeChat.entries.find((entry) => entry.kind === "user")?.text).toBe(visible);
    expect(chat.activeChat.entries.some((entry) => entry.text?.includes("write lock"))).toBe(false);
  } finally {
    await act(async () => root.unmount());
    host.restore();
    vi.restoreAllMocks();
  }
});
