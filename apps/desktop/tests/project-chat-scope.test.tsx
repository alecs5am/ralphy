import { act } from "react";
import { expect, test, vi } from "vitest";
import { bridge, type ProjectSummary } from "@/shared/api/ipc";
import { createAgentChatState, parseAgentChats, reduceAgentChat, serializeAgentChats, useAgentChat, type AgentChatController } from "@/features/agent-chat";
import { createReactHost } from "./react-host";

const project = { workspaceId: "workspace", projectId: "launch" };
const initial = { chatId: "project-chat", provider: "codex" as const, model: "default", now: 1, project };

test("project scope survives reload and provider changes while legacy chats remain unscoped", () => {
  let state = createAgentChatState(initial);
  state = reduceAgentChat(state, { type: "send", chatId: "project-chat", text: "Help with the launch", now: 2 });
  state = parseAgentChats(serializeAgentChats(state));
  expect(state.chats[0].project).toEqual(project);
  state = reduceAgentChat(state, { ...initial, type: "set-provider", chatId: "fork", provider: "claude", model: "sonnet", project: undefined });
  expect(state.chats.at(-1)?.project).toEqual(project);
  const legacy = JSON.parse(serializeAgentChats(state));
  delete legacy.chats[0].project;
  expect(parseAgentChats(JSON.stringify(legacy)).chats[0].project).toBeNull();
  legacy.chats[0].project = { workspaceId: "workspace", projectId: "../elsewhere" };
  expect(() => parseAgentChats(JSON.stringify(legacy))).toThrow("invalid records");
});

test.each([true, false])("sending keeps the original chat scope after browsing another project (scoped: %s)", async (scoped) => {
  const send = vi.spyOn(bridge, "sendAgentMessage").mockResolvedValue(undefined);
  vi.spyOn(bridge, "getAgentProviders").mockResolvedValue([{ id: "codex", connected: true, models: [], defaultModel: "default" }] as never);
  vi.spyOn(bridge, "onAgentEvent").mockReturnValue(() => undefined);
  const host = createReactHost(), { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  let chat!: AgentChatController;
  function Harness({ viewedProject }: { viewedProject: string }) {
    chat = useAgentChat({ rootPath: `/scope-${scoped}`, workspaceId: "workspace", project: { ...project, projectId: viewedProject } as ProjectSummary });
    return null;
  }
  try {
    await act(async () => root.render(<Harness viewedProject="launch" />));
    if (scoped) await act(async () => chat.newChat(project));
    await act(async () => root.render(<Harness viewedProject="another-project" />));
    await act(async () => chat.send("Continue our work"));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "workspace", project: scoped ? project : null }));
  } finally { await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks(); }
});
