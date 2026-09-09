/**
 * The agent providers as the mock bridge reports them, and the one conversation it can hold.
 *
 * The provider state is real state: configuring a key or logging out changes what the next
 * `getAgentProviders` says, so the Settings route can be driven end to end without a CLI.
 */
import type {
  AgentChatEnvelope,
  AgentChatRequest,
  ClaudeAuthState,
} from "../../../electron/media/types";
import type { RalphyBridge } from "./ipc";

export function mockAgentSurfaces(): Pick<RalphyBridge, "getAgentProviders" | "loginAgentProvider" | "setAgentApiKey" | "clearAgentApiKey" | "sendAgentMessage" | "stopAgent" | "onAgentEvent"> {
  const agentCallbacks = new Set<(event: AgentChatEnvelope) => void>();
  let openRouterConfigured = false;
  let claudeAuth: ClaudeAuthState = {
    binaryReady: true,
    subscriptionLoggedIn: true,
    subscriptionAuthMethod: "claude.ai",
    apiKeyConfigured: false,
    inheritedApiKey: false,
  };

  return {
    async getAgentProviders() {
      return [
        {
          id: "claude" as const,
          label: "Claude",
          binaryReady: true,
          accountConnected: claudeAuth.subscriptionLoggedIn,
          apiKeyConfigured: claudeAuth.apiKeyConfigured,
          inheritedApiKey: false,
          connected: claudeAuth.subscriptionLoggedIn || claudeAuth.apiKeyConfigured,
          detail: "Claude account",
          models: [
            { id: "opus", label: "Claude Opus", description: "Highest capability" },
            { id: "sonnet", label: "Claude Sonnet", description: "Balanced" },
            { id: "fable", label: "Claude Fable", description: "Fast" },
          ],
          defaultModel: "sonnet",
        },
        {
          id: "codex" as const,
          label: "Codex",
          binaryReady: true,
          accountConnected: true,
          apiKeyConfigured: false,
          inheritedApiKey: false,
          connected: true,
          detail: "Logged in using ChatGPT",
          models: [
            { id: "gpt-5.5", label: "GPT-5.5", description: "Codex" },
            { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", description: "Codex" },
          ],
          defaultModel: "gpt-5.5",
        },
        {
          id: "openrouter" as const,
          label: "OpenRouter",
          binaryReady: true,
          accountConnected: false,
          apiKeyConfigured: openRouterConfigured,
          inheritedApiKey: false,
          connected: openRouterConfigured,
          detail: openRouterConfigured ? "API key ready" : "API key required",
          models: [
            { id: "openai/gpt-5.5", label: "OpenAI: GPT-5.5", description: "400K context" },
            { id: "google/gemini-3-pro", label: "Google: Gemini 3 Pro", description: "Tools" },
          ],
          defaultModel: "openai/gpt-5.5",
        },
      ];
    },
    async loginAgentProvider(provider) {
      if (provider === "claude") claudeAuth = { ...claudeAuth, subscriptionLoggedIn: true };
      return this.getAgentProviders();
    },
    async setAgentApiKey(provider) {
      if (provider === "claude") claudeAuth = { ...claudeAuth, apiKeyConfigured: true };
      if (provider === "openrouter") openRouterConfigured = true;
      return this.getAgentProviders();
    },
    async clearAgentApiKey(provider) {
      if (provider === "claude") claudeAuth = { ...claudeAuth, apiKeyConfigured: false };
      if (provider === "openrouter") openRouterConfigured = false;
      return this.getAgentProviders();
    },
    async sendAgentMessage(request: AgentChatRequest) {
      const emitAgent = (event: AgentChatEnvelope["event"]): void => {
        const envelope: AgentChatEnvelope = {
          storeId: "mock-store",
          chatId: request.chatId,
          provider: request.provider,
          event,
        };
        for (const callback of agentCallbacks) callback(envelope);
      };
      const sessionId = "0199a213-81c0-7800-8aa1-bbab2a035a53";
      emitAgent({ type: "session", sessionId, tools: ["Read", "Bash"] });
      emitAgent({ type: "text-delta", text: "I’ll inspect the active Ralphy project." });
      emitAgent({ type: "tool-start", id: "mock-tool", name: "Read", summary: "BRIEF.md" });
      emitAgent({ type: "tool-result", id: "mock-tool", ok: true });
      emitAgent({ type: "text-delta", text: " The latest assets are ready for review." });
      emitAgent({
        type: "result",
        ok: true,
        cancelled: false,
        costUsd: 0,
        durationMs: 250,
        sessionId,
      });
    },
    async stopAgent() {},
    onAgentEvent(callback) {
      agentCallbacks.add(callback);
      return () => agentCallbacks.delete(callback);
    }
  };
}
