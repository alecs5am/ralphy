import type { AgentChatUsage } from "@/features/agent-chat";
import type { AgentProvider } from "@/shared/api/ipc";

const tokens = (value: number) => value.toLocaleString("en-US");

/** Only provider-reported usage belongs here; source bytes cannot estimate it. */
export function ContextUsage({ usage, provider }: { usage: AgentChatUsage | null; provider: AgentProvider }) {
  const share = usage?.contextWindow ? Math.max(0, Math.min(1, usage.inputTokens / usage.contextWindow)) : null;
  return <section className="context-budget flex flex-col gap-2 px-3 py-3" aria-label="Chat context usage">
    <div className="flex flex-wrap items-baseline gap-2">
      <h2 className="m-0 type-sm font-medium text-secondary">Last turn</h2>
      <strong className="type-ui font-medium text-ink">{usage ? `${tokens(usage.inputTokens)} input tokens` : "No usage reported yet"}</strong>
      <span className="type-sm text-muted">{usage?.contextWindow ? `of ${tokens(usage.contextWindow)} available` : usage ? "Context limit not reported" : "Send a message to begin measuring this chat."}</span>
    </div>
    {share !== null && <div className="h-context-scale-bar overflow-hidden rounded-control bg-unreviewed" role="meter" aria-label="Reported context window used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={share * 100}>
      <div className="h-full rounded-control bg-ink" style={{ width: `${share * 100}%` }} />
    </div>}
    <details className="type-sm text-muted"><summary className="cursor-pointer">About this measurement</summary><p className="mb-0 mt-2 leading-prose">{provider === "claude" ? "Claude" : "Codex"} reports the total input for the last turn, including conversation context. It does not report usage per source. File sizes below are bytes, not tokens. This is not a forecast for your next message.</p></details>
  </section>;
}
