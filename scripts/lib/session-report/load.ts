// scripts/lib/session-report/load.ts — #562
//
// Transcript discovery and adapter dispatch. A directory argument is walked
// recursively for `*.jsonl` (which picks up Claude Code `subagents/` files and
// the Codex `YYYY/MM/DD/` tree). Each file is streamed once; the first records
// decide which adapter parses it.

import fs from "node:fs";
import path from "node:path";
import type { NormSession, TranscriptAdapter } from "./types.js";
import { claudeAdapter } from "./adapter-claude.js";
import { codexAdapter } from "./adapter-codex.js";
import { readRecords } from "./read-lines.js";
import { extractRalphyInvocations } from "./shell.js";
import { skillRule } from "./phases.js";

export const ADAPTERS: readonly TranscriptAdapter[] = [claudeAdapter, codexAdapter];

const DETECT_RECORDS = 25;

export function discoverFiles(inputs: string[]): { files: string[]; missing: string[] } {
  const files = new Set<string>();
  const missing: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.add(full);
    }
  };
  for (const input of inputs) {
    const abs = path.resolve(input);
    if (!fs.existsSync(abs)) {
      missing.push(input);
      continue;
    }
    if (fs.statSync(abs).isDirectory()) walk(abs);
    else files.add(abs);
  }
  return { files: [...files].sort(), missing };
}

export function detectAdapter(records: unknown[]): TranscriptAdapter | undefined {
  return ADAPTERS.find((a) => a.detect(records));
}

/** Parse one transcript file; returns null when no adapter recognizes it. */
export async function loadSession(file: string): Promise<NormSession | null> {
  let bad = 0;
  const head: unknown[] = [];
  let parser: ReturnType<TranscriptAdapter["createParser"]> | undefined;
  for await (const record of readRecords(file, () => bad++)) {
    if (parser) {
      parser.push(record);
      continue;
    }
    head.push(record);
    if (head.length < DETECT_RECORDS) continue;
    const adapter = detectAdapter(head);
    if (!adapter) return null;
    parser = adapter.createParser(file);
    for (const r of head) parser.push(r);
  }
  if (!parser) {
    const adapter = detectAdapter(head);
    if (!adapter) return null;
    parser = adapter.createParser(file);
    for (const r of head) parser.push(r);
  }
  const session = parser.finish();
  session.badLines = bad;
  return session;
}

/** Parse in-memory records (tests and tooling). */
export function parseRecords(file: string, records: unknown[]): NormSession | null {
  const adapter = detectAdapter(records.slice(0, DETECT_RECORDS));
  if (!adapter) return null;
  const parser = adapter.createParser(file);
  for (const r of records) parser.push(r);
  return parser.finish();
}

/**
 * True when a session is Ralphy work: its cwd is a Ralphy checkout, or it ran a
 * `ralphy` verb, loaded a Ralphy skill, or touched a `.ralphy/` data root.
 */
export function isRalphyRelated(session: NormSession): boolean {
  if (session.cwd && /ralphy/i.test(session.cwd)) return true;
  for (const e of session.events) {
    if (e.kind !== "call") continue;
    for (const op of e.ops) {
      if (op.command && extractRalphyInvocations(op.command).length > 0) return true;
      if (op.skill && skillRule(op.skill)) return true;
      if ([...(op.reads ?? []), ...(op.writes ?? [])].some((p) => /(^|\/)\.?ralphy(\/|-)/.test(p))) return true;
    }
  }
  return false;
}
