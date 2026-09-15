import { createReadStream } from "node:fs";
import { readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import { createInterface } from "node:readline";
import type { AgentHistoryEvent } from "../media/types";
import { PREAMBLE_END } from "./context";
import { normalizedEvents } from "./codex-session";

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

/** Recover only a Ralphy session in the current library/workspace; never accept a file path. */
export async function readCodexHistory(input: {
  sessionId: string; rootPath: string; workspaceId: string | null; codexHome?: string;
}): Promise<AgentHistoryEvent[]> {
  if (!SESSION_ID.test(input.sessionId)) throw new Error("Invalid agent session ID");
  const sessions = await realpath(join(input.codexHome ?? process.env.CODEX_HOME ?? join(homedir(), ".codex"), "sessions"));
  const relative = (await readdir(sessions, { recursive: true })).find((path) => path.endsWith(`-${input.sessionId}.jsonl`));
  if (!relative) throw new Error("The original Codex transcript is unavailable");
  const path = await realpath(join(sessions, relative));
  if (!path.startsWith(`${sessions}${sep}`)) throw new Error("Invalid transcript path");
  const info = await stat(path);
  // ponytail: stream local rollouts up to 128 MB; paginate provider history for larger sessions.
  if (!info.isFile() || info.size > 128 * 1024 * 1024) throw new Error("Transcript is too large to recover automatically");
  const stream = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const events: AgentHistoryEvent[] = [];
  const seen = new Set<string>();
  const sent = new Map<string, number>();
  let verifiedSession = false;
  let verifiedScope = false;
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      const row = record(JSON.parse(line));
      const payload = record(row.payload);
      if (row.type === "session_meta") verifiedSession = payload.id === input.sessionId;
      if (row.type !== "event_msg") continue;
      const at = typeof payload.started_at_ms === "number"
        ? payload.started_at_ms : Date.parse(String(row.timestamp));
      if (!Number.isFinite(at)) throw new Error("Invalid transcript timestamp");
      if (payload.type === "task_complete" && typeof payload.duration_ms === "number") {
        events.push({ at, event: { type: "result", ok: true, cancelled: false,
          durationMs: payload.duration_ms, costUsd: 0, sessionId: input.sessionId } });
      }
      if (payload.type !== "item_completed") continue;
      const item = record(payload.item);
      if (typeof item.id !== "string" || seen.has(item.id)) continue;
      seen.add(item.id);
      const text = Array.isArray(item.content) ? item.content.map((part) => record(part).text)
        .filter((part): part is string => typeof part === "string").join("") : "";
      if (item.type === "UserMessage") {
        const end = text.indexOf(PREAMBLE_END);
        const header = text.slice(0, end).split("\n");
        if (!text.startsWith("[Ralphy Media context]\n") || end < 0
          || !header.includes(`Library: ${input.rootPath}`)
          || !header.includes(`Active workspace ID: ${input.workspaceId ?? "none selected"}`)) {
          throw new Error("Transcript does not belong to this library and workspace");
        }
        verifiedScope = true;
        events.push({ at, event: { type: "prompt", text: text.slice(end + PREAMBLE_END.length).trim() } });
        continue;
      }
      const type = typeof item.type === "string" ? item.type[0].toLowerCase() + item.type.slice(1) : "";
      const normalized = { ...item, type, text,
        command: Array.isArray(item.command) ? item.command.at(-1) : item.command,
        name: item.tool ?? item.name };
      for (const method of ["item/started", "item/completed"]) {
        for (const event of normalizedEvents(method, { item: normalized }, sent)) events.push({ at, event });
      }
    }
  } finally {
    lines.close();
    stream.destroy();
  }
  if (!verifiedSession || !verifiedScope) throw new Error("Cannot verify the original transcript");
  // Completed commands can be recorded out of order; their original start times define the UI order.
  return events.sort((a, b) => a.at - b.at);
}
