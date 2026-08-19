// Probe which top-tier text slugs actually resolve on OpenRouter.
// Goes through callLLM() per MODELS.md ("Avoid direct fetch to openrouter.ai").
import { callLLM } from "./cli/lib/providers/llm.js";

const CANDIDATES = [
  "google/gemini-3.1-pro-preview",
  "google/gemini-3-pro",
  "x-ai/grok-4",
  "x-ai/grok-4.1",
  "x-ai/grok-code-fast-1",
  "deepseek/deepseek-chat",
  "deepseek/deepseek-v3.2-exp",
  "deepseek/deepseek-r1",
  "openai/gpt-5.4",
  "openai/gpt-5.2",
  "openai/gpt-5",
  "anthropic/claude-opus-4.6",
  "moonshotai/kimi-k2-thinking",
  "qwen/qwen3-max",
  "meta-llama/llama-4-maverick",
  "mistralai/mistral-large-2512",
];

const results = await Promise.all(
  CANDIDATES.map(async (model) => {
    try {
      const r = await callLLM({
        model,
        messages: [{ role: "user", content: "Reply with the single word: ok" }],
        maxTokens: 8,
        temperature: 0,
        noRetry: true,
      });
      return { model, ok: true, said: r.text.trim().slice(0, 20), ms: r.latencyMs };
    } catch (e) {
      return { model, ok: false, err: String((e as Error).message).slice(0, 110) };
    }
  }),
);

for (const r of results) {
  console.log(r.ok ? `OK    ${r.model}  (${r.ms}ms) "${r.said}"` : `FAIL  ${r.model}  ${r.err}`);
}
console.log(`\nresolved: ${results.filter((r) => r.ok).length}/${results.length}`);
