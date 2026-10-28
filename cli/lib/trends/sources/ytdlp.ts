// yt-dlp runner for the trend corpus (#556): flat-playlist listings with one
// JSON object per entry, logged out. Corpus ingest never passes cookies — the
// generic `listProfileVideos()` defaults to `--cookies-from-browser chrome`,
// which would use the owner's logged-in session — and `--ignore-config` keeps
// a user yt-dlp config from injecting them.

import { spawn, spawnSync } from "node:child_process";

export interface YtdlpResult {
  code: number;
  stdout: string;
  stderr: string;
  ms: number;
  timedOut: boolean;
}

export type YtdlpRunner = (args: string[], options: { timeoutMs: number }) => Promise<YtdlpResult>;

const FORBIDDEN_FLAGS = ["--cookies", "--cookies-from-browser", "--username", "--password", "--netrc", "--proxy"];

export function assertLoggedOutArgs(args: readonly string[]): void {
  for (const arg of args) {
    if (FORBIDDEN_FLAGS.some((flag) => arg === flag || arg.startsWith(`${flag}=`))) {
      throw new Error(`Trend corpus yt-dlp calls run logged out; refusing ${arg}`);
    }
  }
}

export function ytdlpAvailable(): boolean {
  return spawnSync("which", ["yt-dlp"], { stdio: "ignore" }).status === 0;
}

export const runYtdlp: YtdlpRunner = (args, options) => {
  assertLoggedOutArgs(args);
  const started = Date.now();
  return new Promise((resolve) => {
    const proc = spawn("yt-dlp", ["--ignore-config", ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, options.timeoutMs);
    proc.stdout?.on("data", (chunk) => (stdout += chunk.toString()));
    proc.stderr?.on("data", (chunk) => (stderr += chunk.toString()));
    proc.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: `${stderr}\nERROR: ${error.message}`, ms: Date.now() - started, timedOut });
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr, ms: Date.now() - started, timedOut });
    });
  });
};

/** Flat-playlist args printing the chosen entry fields (and optionally playlist fields) as JSON lines. */
export function flatListingArgs(url: string, options: { limit: number; entryFields: readonly string[]; playlistFields?: readonly string[] }): string[] {
  const args = [
    "--flat-playlist",
    "--no-warnings",
    "--socket-timeout",
    "15",
    "--playlist-end",
    String(Math.max(1, Math.floor(options.limit))),
    "--print",
    `%(.{${options.entryFields.join(",")}})j`,
  ];
  if (options.playlistFields && options.playlistFields.length > 0) {
    args.push("--print", `playlist:%(.{_type,${options.playlistFields.join(",")}})j`);
  }
  args.push(url);
  return args;
}

/** Parse JSON lines; non-JSON noise is ignored. Splits the playlist summary line from entries. */
export function parseJsonLines(stdout: string): { entries: Array<Record<string, unknown>>; playlist: Record<string, unknown> | null } {
  const entries: Array<Record<string, unknown>> = [];
  let playlist: Record<string, unknown> | null = null;
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("{")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const record = parsed as Record<string, unknown>;
    if (record._type === "playlist") playlist = record;
    else entries.push(record);
  }
  return { entries, playlist };
}

export const num = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
};

export const str = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);

/** `#tag` tokens from free text (lowercased, without the hash). */
export function hashtagsFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const match of text.matchAll(/#([\p{L}\p{N}_]{1,100})/gu)) out.add(match[1]!.toLowerCase());
  return [...out];
}
