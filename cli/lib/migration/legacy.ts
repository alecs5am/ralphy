import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { MigrationIssue } from "./types.js";

const LEGACY_CONTROL_NAMES = new Set([
  "asset-manifest.json", "config.json", "generations.jsonl", "jobs.db",
  "jobs.db-wal", "jobs.db-shm", "project.json", "publish-ledger.jsonl",
  "registry.json", "scenario.json", "unit.json", "user-assets.jsonl",
  "user-prompts.jsonl", "workspace.json",
]);

export type LegacyPathKind =
  | "workspace"
  | "project"
  | "document"
  | "jsonl"
  | "job-database"
  | "media"
  | "secret-candidate"
  | "cache"
  | "unknown";

export type LegacyJsonlRecord = {
  lineNo: number;
  byteOffset: number;
  byteLength: number;
  raw: Buffer;
  value: unknown | null;
  issue: MigrationIssue | null;
};

export function normalizeRelativePath(value: string): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\") || path.posix.isAbsolute(value)) {
    throw new Error("Migration source path is not a relative POSIX path");
  }
  const parts = value.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new Error("Migration source path contains an unsafe segment");
  }
  return parts.join("/");
}

export function isLegacyControlName(value: string): boolean {
  return LEGACY_CONTROL_NAMES.has(value.toLowerCase());
}

export function legacyRegistryPaths(root: string): string[] {
  return [path.join(root, "registry.json"), path.join(root, "config.json")];
}

export function classifyLegacyPath(relativePath: string): LegacyPathKind {
  const normalized = normalizeRelativePath(relativePath).toLowerCase();
  const basename = path.posix.basename(normalized);
  if (basename === "jobs.db" || basename === "jobs.db-wal" || basename === "jobs.db-shm") return "job-database";
  if (normalized.includes("/secrets/") || basename.includes("cookie") || basename.endsWith(".env")) return "secret-candidate";
  if (normalized === "workspace.json" || normalized.endsWith("/workspace.json")) return "workspace";
  if (normalized.includes("/projects/") && (basename === "project.json" || basename === "brief.md")) return "project";
  if (basename.endsWith(".jsonl")) return "jsonl";
  if ([".md", ".markdown", ".json", ".yaml", ".yml", ".txt"].some((suffix) => basename.endsWith(suffix))) return "document";
  if (normalized.split("/").some((part) => part === "cache" || part === "tmp")) return "cache";
  if (MEDIA_EXTENSIONS.has(path.posix.extname(basename))) return "media";
  return "unknown";
}

export function parseLegacyJsonl(raw: Buffer, sourcePath: string): LegacyJsonlRecord[] {
  const records: LegacyJsonlRecord[] = [];
  let offset = 0;
  const lines = raw.toString("utf8").split(/\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index]!;
    const bytes = Buffer.from(text, "utf8");
    const hasLine = index < lines.length - 1 || text.length > 0;
    if (!hasLine) continue;
    const trimmed = text.endsWith("\r") ? text.slice(0, -1) : text;
    let value: unknown | null = null;
    let issue: MigrationIssue | null = null;
    if (trimmed.trim().length > 0) {
      try {
        value = JSON.parse(trimmed) as unknown;
      } catch {
        issue = {
          code: "MIGRATION_MALFORMED_JSONL",
          severity: "review",
          detail: {
            sourcePath,
            lineNo: index + 1,
            byteOffset: offset,
            byteLength: bytes.length,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          },
        };
      }
    }
    records.push({ lineNo: index + 1, byteOffset: offset, byteLength: bytes.length, raw: bytes, value, issue });
    offset += bytes.length + 1;
  }
  return records;
}

export function readLegacyJsonl(sourceRoot: string, relativePath: string): LegacyJsonlRecord[] {
  const normalized = normalizeRelativePath(relativePath);
  const absolute = path.join(sourceRoot, ...normalized.split("/"));
  const resolved = fs.realpathSync(absolute);
  const root = fs.realpathSync(sourceRoot);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("Legacy source path escapes its source root");
  return parseLegacyJsonl(fs.readFileSync(resolved), normalized);
}

export function normalizeLegacyDocumentBody(raw: Buffer): { format: "markdown" | "text" | "json"; body: string } | null {
  if (raw.includes(0)) return null;
  const body = raw.toString("utf8");
  if (body.includes("\ufffd")) return null;
  const trimmed = body.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return { format: "json", body: JSON.stringify(JSON.parse(body)) };
    } catch {
      return null;
    }
  }
  return { format: body.includes("#") || body.includes("\n") ? "markdown" : "text", body };
}

const MEDIA_EXTENSIONS = new Set([
  ".aac", ".avi", ".gif", ".jpeg", ".jpg", ".m4a", ".mkv", ".mov",
  ".mp3", ".mp4", ".ogg", ".png", ".svg", ".wav", ".webm", ".webp", ".zip",
]);
