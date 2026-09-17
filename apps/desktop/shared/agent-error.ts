/** Provider envelopes can also be present in transcripts saved by older app versions. */
export function agentErrorMessage(value: unknown, fallback = "The agent could not finish this request"): string {
  let message = typeof value === "string" ? value.slice(0, 32768).trim() : "";
  for (let depth = 0; depth < 2; depth++) {
    const first = message.indexOf("{"), last = message.lastIndexOf("}");
    if (first < 0 || last < first) break;
    try {
      const payload = JSON.parse(message.slice(first, last + 1));
      const detail = payload?.error?.message ?? payload?.message ?? payload?.detail;
      if (typeof detail !== "string") break;
      message = detail;
    } catch { break; }
  }
  message = message.slice(0, 2000) || fallback;
  return /requires a newer version of Codex/i.test(message) && !message.includes("Settings → Agents")
    ? `${message} Update Codex in Settings → Agents, or choose another model in the chat.`
    : message;
}
