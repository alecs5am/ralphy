import { describe, expect, test } from "vitest";

import { parseAgentChatRequest } from "../electron/agent/request";

describe("agent chat IPC request", () => {
  test("rejects renderer-supplied root ownership", () => {
    expect(() => parseAgentChatRequest({
      chatId: "chat-1",
      provider: "codex",
      model: "default",
      prompt: "Hi",
      permissionMode: "full",
      rootPath: "/tmp/attacker/.ralphy",
    })).toThrow("root binding");
  });

  test("accepts bounded provider, model, chat, session, and project fields", () => {
    expect(parseAgentChatRequest({
      chatId: "chat-123",
      provider: "openrouter",
      model: "~openai/gpt-latest",
      prompt: "  Review this  ",
      project: { workspaceId: "studio", projectId: "alpha-001" },
      claudeAuthMethod: "subscription",
      permissionMode: "full",
      resumeSessionId: "0199a213-81c0-7800-8aa1-bbab2a035a53",
    })).toEqual({
      chatId: "chat-123",
      provider: "openrouter",
      model: "~openai/gpt-latest",
      prompt: "Review this",
      project: { workspaceId: "studio", projectId: "alpha-001" },
      claudeAuthMethod: "subscription",
      permissionMode: "full",
      resumeSessionId: "0199a213-81c0-7800-8aa1-bbab2a035a53",
    });

    expect(() => parseAgentChatRequest(null)).toThrow("request");
    expect(() => parseAgentChatRequest({
      chatId: "chat-1",
      provider: "other",
      model: "model",
      prompt: "Hi",
      permissionMode: "full",
    })).toThrow("provider");
    expect(() => parseAgentChatRequest({
      chatId: "chat-1",
      provider: "codex",
      model: "bad model",
      prompt: "Hi",
      permissionMode: "full",
    })).toThrow("model");
    expect(() => parseAgentChatRequest({
      chatId: "../chat",
      provider: "codex",
      model: "gpt-5.5",
      prompt: "Hi",
      permissionMode: "full",
    })).toThrow("chat");
    expect(() => parseAgentChatRequest({
      chatId: "chat-1",
      provider: "codex",
      model: "gpt-5.5",
      prompt: "Hi",
      permissionMode: "dangerous",
    })).toThrow("permission");
    expect(() => parseAgentChatRequest({
      chatId: "chat-1",
      provider: "codex",
      model: "gpt-5.5",
      prompt: "Hi",
      permissionMode: "full",
      resumeSessionId: "../../session",
    })).toThrow("session");
  });
});
