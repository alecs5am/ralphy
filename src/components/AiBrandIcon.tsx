import type { CSSProperties } from "react";
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

/* The brands whose lobe-icons export is a white monochrome path. Everything else ships in its own
   brand colour and is painted as an image. */
const MONO: ReadonlySet<AiBrand> = new Set(["anthropic", "codex", "grok", "openai", "openrouter"]);

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
  if (MONO.has(brand)) {
    return (
      <span
        /* A mask over `currentColor`, so the mark reads on the chat's card and on a black widget
           alike. instrument.css owns the rule; the element owns which artwork it cuts. */
        className={`ai-brand-icon is-mono is-${brand} select-none ${className}`.trim()}
        style={{ "--brand-mask": `url("./assets/ai/${brand}.svg")`, width: size, height: size } as CSSProperties}
        aria-hidden="true"
      />
    );
  }
  return (
    <img
      /* The mark keeps its own aspect inside whatever box a caller gives it, and never
         becomes a drag or selection target -- geometry the component owns, not its callers. */
      className={`ai-brand-icon object-contain select-none ${className}`.trim()}
      src={`./assets/ai/${brand}.svg`}
      width={size}
      height={size}
      alt=""
      draggable={false}
    />
  );
}
