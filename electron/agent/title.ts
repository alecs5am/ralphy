/**
 * Naming a chat.
 *
 * A chat used to be named after its first prompt, truncated -- a title that repeats what is already
 * the first line on screen. Codex and Claude Code both name their own sessions, but neither hands
 * that name to a one-shot caller: `codex exec` writes no thread name, and Claude's
 * `generate_session_title` is a control request on the bidirectional stream, which the `-p` path
 * cannot reach. So the name is asked for the same way they ask for it: one short turn, read-only,
 * once per chat.
 */

const MAX_TITLE = 48;
const MAX_SOURCE = 1200;

export function titlePrompt(firstMessage: string): string {
  return [
    "Name this task in three to six words, as a short noun phrase.",
    "Answer with the title alone: no quotes, no trailing punctuation, no explanation, no preamble.",
    "",
    "The task:",
    firstMessage.slice(0, MAX_SOURCE),
  ].join("\n");
}

/**
 * The title out of whatever came back. A model that explains itself, quotes itself or answers in a
 * paragraph gets its first line taken and trimmed; anything that still does not read as a title --
 * empty, or a sentence -- is refused, and the chat keeps the name it has.
 */
export function readTitle(text: string): string | null {
  const line = text.split("\n").map((row) => row.trim()).find(Boolean);
  if (!line) return null;
  const bare = line
    .replace(/^["'`*#\s]+|["'`*\s]+$/g, "")
    .replace(/^(?:title|chat|name)\s*[:\-—]\s*/i, "")
    .replace(/[.!?,;:]+$/, "")
    .trim();
  if (!bare || bare.length > MAX_TITLE * 2) return null;
  const words = bare.split(/\s+/);
  if (words.length > 9) return null;
  return bare.slice(0, MAX_TITLE);
}
