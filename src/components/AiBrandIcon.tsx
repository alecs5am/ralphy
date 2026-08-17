import type { AgentProvider } from "../lib/ipc";

export type AiBrand =
  | "anthropic"
  | "claude"
  | "codex"
  | "cohere"
  | "deepseek"
  | "gemini"
  | "grok"
  | "kimi"
  | "meta"
  | "minimax"
  | "mistral"
  | "openai"
  | "openrouter"
  | "qwen";

const providerBrands: Record<AgentProvider, AiBrand> = {
  claude: "claude",
  codex: "codex",
  openrouter: "openrouter",
};

export function aiBrandForModel(model: string, fallback: AgentProvider): AiBrand {
  const id = model.toLocaleLowerCase();
  if (/claude|anthropic/.test(id)) return id.includes("claude") ? "claude" : "anthropic";
  if (/openai|(^|[/_-])gpt|(^|[/_-])o[134]([/_-]|$)/.test(id)) return "openai";
  if (/google|gemini|gemma/.test(id)) return "gemini";
  if (id.includes("deepseek")) return "deepseek";
  if (/qwen|alibaba/.test(id)) return "qwen";
  if (id.includes("mistral")) return "mistral";
  if (/x-ai|xai|grok/.test(id)) return "grok";
  if (/meta|llama/.test(id)) return "meta";
  if (/moonshot|kimi/.test(id)) return "kimi";
  if (id.includes("minimax")) return "minimax";
  if (/cohere|command-r/.test(id)) return "cohere";
  return providerBrands[fallback];
}

export function AiBrandIcon({
  provider,
  model,
  size = 18,
  className = "",
}: {
  provider: AgentProvider;
  model?: string;
  size?: number;
  className?: string;
}) {
  const brand = model ? aiBrandForModel(model, provider) : providerBrands[provider];
  return (
    <img
      className={`ai-brand-icon ${className}`.trim()}
      src={`./assets/ai/${brand}.svg`}
      width={size}
      height={size}
      alt=""
      draggable={false}
    />
  );
}
