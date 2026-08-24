import { describe, expect, test } from "vitest";

import { bridge, type AgentChatEnvelope } from "../src/lib/ipc";

describe("browser agent bridge", () => {
  test("exposes providers and routes a streamed turn to its chat", async () => {
    const events: AgentChatEnvelope[] = [];
    const unsubscribe = bridge.onAgentEvent((event) => events.push(event));

    const providers = await bridge.getAgentProviders();
    expect(providers.find(({ id }) => id === "codex")).toMatchObject({
      binaryReady: true,
      accountConnected: true,
      connected: true,
      defaultModel: "gpt-5.5",
    });
    expect(providers.find(({ id }) => id === "openrouter")).toMatchObject({
      binaryReady: true,
      apiKeyConfigured: false,
      connected: false,
    });

    await bridge.sendAgentMessage({
      chatId: "chat-codex",
      provider: "codex",
      model: "gpt-5.5",
      prompt: "Review the selected project",
      project: { workspaceId: "launch-studio", projectId: "coffee-grinder-001" },
      claudeAuthMethod: "subscription",
      permissionMode: "full",
      resumeSessionId: null,
    });
    unsubscribe();

    expect(events.map(({ event }) => event.type)).toEqual([
      "session",
      "text-delta",
      "tool-start",
      "tool-result",
      "text-delta",
      "result",
    ]);
    expect(events.every((event) => (
      event.storeId === "mock-store"
      && event.chatId === "chat-codex"
      && event.provider === "codex"
    ))).toBe(true);
  });

  test("configures an OpenRouter key without exposing it", async () => {
    const providers = await bridge.setAgentApiKey(
      "openrouter",
      "sk-or-v1-secret-1234567890",
    );
    expect(providers.find(({ id }) => id === "openrouter")).toMatchObject({
      apiKeyConfigured: true,
      connected: true,
    });
    expect(JSON.stringify(providers)).not.toContain("sk-or-v1-secret");
  });
});
