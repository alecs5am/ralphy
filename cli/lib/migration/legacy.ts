import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { MigrationIssue } from "./types.js";

const LEGACY_CONTROL_NAMES = new Set([
  "analytics.jsonl",
  "asset-manifest.json",
  "calendar.json",
  "campaign.json",
  "captions.json",
  "config.json",
  "delivery.json",
  "evaluations.json",
  "generations.jsonl",
  "jobs.db",
  "jobs.db-shm",
  "jobs.db-wal",
  "memory.json",
  "production.json",
  "project.json",
  "publish-ledger.jsonl",
  "registry.json",
  "scenario.json",
  "settings.json",
  "stage-state.json",
  "unit.json",
  "user-assets.jsonl",
  "user-prompts.jsonl",
  "workspace.json",
]);

const LEGACY_DESKTOP_DOCUMENT_NAMES = new Set([
  "state.json",
  "settings.json",
  "chat.json",
  "chats.json",
  "localstorage.json",
  "localstorage-export.json",
]);

export function isLegacyUnitManifestName(name: string): boolean {
  return name === "unit.json";
}

export function isLegacyAssetManifestName(name: string): boolean {
  return name === "asset-manifest.json";
}

export function isLegacyPublishLedgerName(name: string): boolean {
  return name === "publish-ledger.jsonl";
}

export function isLegacyRootConfigPath(relativePath: string): boolean {
  return normalizeRelativePath(relativePath).toLowerCase() === "config.json";
}

export function isLegacyDesktopReviewPath(relativePath: string): boolean {
  const normalized = normalizeRelativePath(relativePath).toLowerCase();
  const parts = normalized.split("/");
  return (parts.includes("review") || parts.includes("reviews")) && normalized.endsWith(".json");
}

export function isLegacyDesktopDocumentPath(relativePath: string): boolean {
  const normalized = normalizeRelativePath(relativePath).toLowerCase();
  return LEGACY_DESKTOP_DOCUMENT_NAMES.has(path.posix.basename(normalized));
}

const SECRET_PATH = /(^|\/)(?:\.env(?:\.|$)|secrets?(?:\/|$)|safestorage(?:\/|$))|cookie|credential/i;
const DESKTOP_PROVIDER_SECRET_PATHS = new Set([
  "claude-api-key.bin",
  "openrouter-api-key.bin",
]);
const CREDENTIAL_NAMES = new Set([
  "access_key", "access_key_id", "access_token", "api_key", "api_secret",
  "auth_token", "bot_token", "client_secret", "credential", "credentials",
  "password", "passwd", "private_key", "refresh_token", "secret",
  "secret_access_key", "signing_key", "token",
]);
const CREDENTIAL_SUFFIXES = [
  "_access_key", "_access_key_id", "_access_token", "_api_key", "_api_secret",
  "_auth_token", "_bot_token", "_client_secret", "_credential", "_credentials",
  "_password", "_private_key", "_refresh_token", "_secret", "_secret_access_key",
  "_signing_key", "_token",
];

export type LegacyPathKind =
  | "workspace"
  | "project"
  | "document"
  | "jsonl"
  | "job-database"
  | "media"
  | "secret-candidate"
  | "raw-evidence"
  | "cache"
  | "unknown";

export type LegacyJsonlRecord = {
  lineNo: number;
  byteOffset: number;
  byteLength: number;
  raw: Buffer;
  delimiter: "lf" | "crlf" | "none";
  value: unknown | null;
  issue: MigrationIssue | null;
};

export function normalizeRelativePath(value: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.includes("\0")
    || value.includes("\\")
    || path.posix.isAbsolute(value)
    || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)
    || value.normalize("NFC") !== value
  ) {
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

export function isLegacyRegistryPath(relativePath: string): boolean {
  return normalizeRelativePath(relativePath) === "registry.json";
}

export function parseLegacyRegistry(raw: Buffer): {
  activeWorkspace: string | null;
  projects: Map<string, string>;
} {
  const value = JSON.parse(raw.toString("utf8")) as unknown;
  if (!isRecord(value)) throw new Error("Legacy registry root is invalid");
  const activeWorkspace = typeof value.currentWorkspace === "string" && value.currentWorkspace
    ? value.currentWorkspace
    : null;
  const projects = new Map<string, string>();
  if (Array.isArray(value.projects)) {
    for (const item of value.projects) {
      if (typeof item === "string") projects.set(item, activeWorkspace ?? "default");
      else if (isRecord(item) && typeof item.id === "string") {
        projects.set(item.id, typeof item.workspace === "string" ? item.workspace : activeWorkspace ?? "default");
      }
    }
  } else if (isRecord(value.projects)) {
    for (const [id, item] of Object.entries(value.projects)) {
      projects.set(id, isRecord(item) && typeof item.workspace === "string" ? item.workspace : activeWorkspace ?? "default");
    }
  }
  return { activeWorkspace, projects };
}

export function classifyLegacyPath(relativePath: string): LegacyPathKind {
  const normalized = normalizeRelativePath(relativePath).toLowerCase();
  const basename = path.posix.basename(normalized);
  if (normalized === "farm" || normalized.startsWith("farm/")) return "raw-evidence";
  if (basename === "jobs.db" || basename === "jobs.db-wal" || basename === "jobs.db-shm") return "job-database";
  if (SECRET_PATH.test(normalized) || DESKTOP_PROVIDER_SECRET_PATHS.has(normalized)) return "secret-candidate";
  if (normalized === "workspace.json" || normalized.endsWith("/workspace.json")) return "workspace";
  if (normalized.includes("/projects/") && (basename === "project.json" || basename === "brief.md")) return "project";
  if (basename.endsWith(".jsonl")) return "jsonl";
  if ([".md", ".markdown", ".json", ".yaml", ".yml", ".txt"].some((suffix) => basename.endsWith(suffix))) return "document";
  if (normalized.split("/").some((part) => part === "cache" || part === "tmp")) return "cache";
  if (MEDIA_EXTENSIONS.has(path.posix.extname(basename))) return "media";
  return "unknown";
}

/** Runs before JSON parsing or evidence allocation. It deliberately prefers recovery to leakage. */
export function isLegacySecretCandidate(relativePath: string, raw?: Buffer): boolean {
  const normalized = normalizeRelativePath(relativePath);
  if (SECRET_PATH.test(normalized) || DESKTOP_PROVIDER_SECRET_PATHS.has(normalized.toLowerCase())) return true;
  if (!raw || raw.length === 0) return false;
  if (normalized.toLowerCase().endsWith(".jsonl")) return hasLegacyJsonlSecret(raw);
  const decoded = decodeLegacyControl(raw);
  if (decoded === null) return true;
  return hasLegacyCredentialText(decoded) || hasLegacyCredentialKey(decoded);
}

export function* iterateLegacyJsonl(raw: Buffer, sourcePath: string): Generator<LegacyJsonlRecord> {
  let offset = 0;
  let lineNo = 1;
  while (offset < raw.length) {
    const lf = raw.indexOf(0x0a, offset);
    const end = lf === -1 ? raw.length : lf + 1;
    const physical = Buffer.from(raw.subarray(offset, end));
    const delimiter = lf === -1 ? "none" : physical.at(-2) === 0x0d ? "crlf" : "lf";
    const parseEnd = delimiter === "crlf" ? physical.length - 2 : delimiter === "lf" ? physical.length - 1 : physical.length;
    const parseBytes = physical.subarray(0, parseEnd);
    let value: unknown | null = null;
    let issue: MigrationIssue | null = null;
    if (parseBytes.toString("ascii").trim().length > 0) {
      const text = parseBytes.toString("utf8");
      try {
        if (Buffer.from(text, "utf8").compare(parseBytes) !== 0) throw new Error("Invalid UTF-8");
        value = JSON.parse(text) as unknown;
      } catch {
        issue = {
          code: "MIGRATION_MALFORMED_JSONL",
          severity: "review",
          lineNo,
          detail: {
            sourcePath,
            lineNo,
            byteOffset: offset,
            byteLength: physical.length,
            delimiter,
            sha256: sha256(physical),
          },
        };
      }
    }
    yield {
      lineNo,
      byteOffset: offset,
      byteLength: physical.length,
      raw: physical,
      delimiter,
      value,
      issue,
    };
    if (lf === -1) break;
    offset = end;
    lineNo += 1;
  }
}

export function parseLegacyJsonl(raw: Buffer, sourcePath: string): LegacyJsonlRecord[] {
  return [...iterateLegacyJsonl(raw, sourcePath)];
}

export function readLegacyJsonl(sourceRoot: string, relativePath: string): LegacyJsonlRecord[] {
  const normalized = normalizeRelativePath(relativePath);
  return parseLegacyJsonl(fs.readFileSync(safeSourceFile(sourceRoot, normalized)), normalized);
}

export function normalizeLegacyDocumentBody(
  raw: Buffer,
  sourceRoot?: string,
): { format: "markdown" | "text" | "json"; body: string } | null {
  if (raw.includes(0)) return null;
  const body = raw.toString("utf8");
  if (Buffer.from(body, "utf8").compare(raw) !== 0) return null;
  const trimmed = body.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return {
        format: "json",
        body: JSON.stringify(normalizeLegacyValue(JSON.parse(body) as unknown, sourceRoot)),
      };
    } catch (error) {
      if (error instanceof LegacySanitizationCollisionError) throw error;
      return null;
    }
  }
  return {
    format: body.includes("#") || body.includes("\n") ? "markdown" : "text",
    body: sanitizeLegacyText(body, sourceRoot),
  };
}

export function sanitizeLegacyText(body: string, sourceRoot?: string): string {
  return sanitizeLegacyTextValue(body, sourceRoot, false).value;
}

export function redactLegacyOperationalText(
  value: string,
  sourceRoot?: string,
): { value: string; redacted: boolean } {
  return sanitizeLegacyTextValue(value, sourceRoot, true);
}

export class LegacySanitizationCollisionError extends Error {
  constructor() {
    super("Legacy object keys collide after sanitization");
    this.name = "LegacySanitizationCollisionError";
  }
}

export function sanitizeLegacyPayload(
  value: unknown,
  sourceRoot?: string,
  redactCredentials = false,
): { value: unknown; redacted: boolean } {
  if (typeof value === "string") return sanitizeLegacyTextValue(value, sourceRoot, redactCredentials);
  if (Array.isArray(value)) {
    const output: unknown[] = [];
    let redacted = false;
    for (let index = 0; index < value.length; index += 1) {
      const item = value[index];
      if (
        redactCredentials
        && typeof item === "string"
        && item.startsWith("--")
        && isLegacyCredentialName(item.slice(2))
        && index + 1 < value.length
      ) {
        output.push(item, "[migration-secret-redacted]");
        index += 1;
        redacted = true;
        continue;
      }
      const sanitized = sanitizeLegacyPayload(item, sourceRoot, redactCredentials);
      output.push(sanitized.value);
      redacted ||= sanitized.redacted;
    }
    return { value: output, redacted };
  }
  if (isRecord(value)) {
    const entries: Array<{ key: string; value: unknown }> = [];
    const keys = new Set<string>();
    const output: Record<string, unknown> = {};
    let redacted = false;
    for (const [key, item] of Object.entries(value)) {
      const credentialKey = isLegacyCredentialName(key);
      const keyText = sanitizeLegacyTextValue(key, sourceRoot, true);
      const sanitizedKey = credentialKey || keyText.redacted
        ? `[migration-key-omitted sha256=${sha256(key)}]`
        : keyText.value;
      if (keys.has(sanitizedKey)) throw new LegacySanitizationCollisionError();
      keys.add(sanitizedKey);
      const sanitized = credentialKey
        ? { value: "[migration-secret-redacted]", redacted: true }
        : sanitizeLegacyPayload(item, sourceRoot, redactCredentials);
      entries.push({ key: sanitizedKey, value: sanitized.value });
      redacted ||= sanitized.redacted || sanitizedKey !== key;
    }
    entries.sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
    for (const entry of entries) {
      output[entry.key] = entry.value;
    }
    return { value: output, redacted };
  }
  return { value, redacted: false };
}

export function normalizeLegacyValue(value: unknown, sourceRoot?: string): unknown {
  return sanitizeLegacyPayload(value, sourceRoot).value;
}

function sanitizeLegacyTextValue(
  value: string,
  sourceRoot: string | undefined,
  redactCredentials: boolean,
): { value: string; redacted: boolean } {
  const credential = redactCredentials ? redactLegacyCredentialText(value) : { value, redacted: false };
  let sanitized = credential.value.replace(
    /(^|[\s("'=<>])data:[^,\s]+,[^\s"'<>)]*/gimu,
    (match, prefix: string) => {
      const dataUrl = match.slice(prefix.length);
      return `${prefix}[migration-data-omitted sha256=${sha256(dataUrl)}]`;
    },
  );
  sanitized = sanitized.replace(/file:\/{3}[^\s"'<>)]*/gimu, (uri) => {
    try {
      return sanitizeAbsoluteLocator(decodeURIComponent(new URL(uri).pathname), sourceRoot);
    } catch {
      return `[migration-path-omitted sha256=${sha256(uri)}]`;
    }
  });
  if (sourceRoot) {
    const root = fs.realpathSync(sourceRoot);
    sanitized = sanitized.replace(
      new RegExp(`${escapeRegex(root)}(?:\\/[^\\s"'<>)]*)?`, "gu"),
      (value) => {
        const relative = path.relative(root, value).split(path.sep).join("/");
        return relative && !relative.startsWith("..") ? relative : `[migration-path-omitted sha256=${sha256(value)}]`;
      },
    );
  }
  sanitized = sanitized.replace(
    /(^|[\s("'=<>])(?:[A-Za-z]:[\\/]|\\\\)[^\s"'<>)]*/gmu,
    (value, prefix: string) => {
      const absolute = value.slice(prefix.length);
      return `${prefix}[migration-path-omitted sha256=${sha256(absolute)}]`;
    },
  );
  sanitized = sanitized.replace(/(^|[\s("'=<>])\/(?:[^\s"'<>)]*\/)*[^\s"'<>)]*/gmu, (match, prefix: string) => {
    const absolute = match.slice(prefix.length);
    return `${prefix}${sanitizeAbsoluteLocator(absolute, sourceRoot)}`;
  });
  return { value: sanitized, redacted: credential.redacted };
}

function sanitizeAbsoluteLocator(value: string, sourceRoot?: string): string {
  if (sourceRoot && path.isAbsolute(value)) {
    const root = fs.realpathSync(sourceRoot);
    const resolved = path.resolve(value);
    if (resolved === root || resolved.startsWith(`${root}${path.sep}`)) {
      return path.relative(root, resolved).split(path.sep).join("/") || ".";
    }
  }
  return `[migration-path-omitted sha256=${sha256(value)}]`;
}

function redactLegacyCredentialText(value: string): { value: string; redacted: boolean } {
  let redacted = false;
  const mark = (): string => {
    redacted = true;
    return "[migration-secret-redacted]";
  };
  let output = value.replace(
    /-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----[\s\S]*?-----END \1-----/giu,
    () => mark(),
  );
  output = output.replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*/giu, () => mark());
  output = output.replace(
    /((?:authorization|proxy-authorization)\s*:\s*(?:bearer|basic)\s+)[^\s"'<>]+/giu,
    (_match, prefix: string) => `${prefix}${mark()}`,
  );
  output = output.replace(
    /(^|\s)(bearer\s+)[^\s"'<>]+/gimu,
    (_match, boundary: string, prefix: string) => `${boundary}${prefix}${mark()}`,
  );
  output = output.replace(
    /([A-Za-z][A-Za-z0-9+.-]*:\/\/)([^/\s:@]+):([^/@\s]+)@/gu,
    (_match, scheme: string) => `${scheme}${mark()}@`,
  );
  output = output.replace(
    /(^|[\s,{;])((?:export\s+)?(?:(['"])([A-Za-z][A-Za-z0-9_-]*)\3|([A-Za-z][A-Za-z0-9_-]*))\s*[:=]\s*)(['"])(.*?)\6/gimu,
    (match, boundary: string, prefix: string, _keyQuote: string, quotedKey: string, bareKey: string, valueQuote: string) =>
      isLegacyCredentialName(quotedKey || bareKey)
        ? `${boundary}${prefix}${valueQuote}${mark()}${valueQuote}`
        : match,
  );
  output = output.replace(
    /(^|[\s,{;])((?:export\s+)?(?:(['"])([A-Za-z][A-Za-z0-9_-]*)\3|([A-Za-z][A-Za-z0-9_-]*))\s*[:=]\s*)([^\s,;}"']+)/gimu,
    (match, boundary: string, prefix: string, _keyQuote: string, quotedKey: string, bareKey: string) =>
      isLegacyCredentialName(quotedKey || bareKey)
        ? `${boundary}${prefix}${mark()}`
        : match,
  );
  output = output.replace(
    /--([A-Za-z][A-Za-z0-9-]*)(=|\s+)(?:(['"])(.*?)\3|([^\s"']+))/gu,
    (match, key: string, separator: string, quote: string | undefined) =>
      isLegacyCredentialName(key)
        ? `--${key}${separator}${quote ? `${quote}${mark()}${quote}` : mark()}`
        : match,
  );
  return { value: output, redacted };
}

function hasLegacyCredentialKey(value: string): boolean {
  const keyPattern = /(?:^|[\s,{;])(?:export\s+)?(?:(['"])([A-Za-z][A-Za-z0-9_-]*)\1|([A-Za-z][A-Za-z0-9_-]*))\s*[:=]/gimu;
  for (const match of value.matchAll(keyPattern)) {
    if (isLegacyCredentialName(match[2] || match[3] || "")) return true;
  }
  const flagPattern = /--([A-Za-z][A-Za-z0-9-]*)(?:=|\s+)/gu;
  for (const match of value.matchAll(flagPattern)) {
    if (isLegacyCredentialName(match[1] || "")) return true;
  }
  return false;
}

function hasLegacyCredentialText(value: string): boolean {
  return /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/iu.test(value)
    || /(?:authorization|proxy-authorization)\s*:\s*(?:bearer|basic)\s+[^\s"'<>]+/iu.test(value)
    || /(^|\s)bearer\s+[^\s"'<>]+/imu.test(value)
    || /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/\s:@]+:[^/@\s]+@/u.test(value);
}

function hasLegacyJsonlSecret(raw: Buffer): boolean {
  let offset = 0;
  while (offset < raw.length) {
    const lf = raw.indexOf(0x0a, offset);
    const end = lf === -1 ? raw.length : lf + 1;
    const decoded = decodeLegacyControl(raw.subarray(offset, end));
    if (decoded === null) return true;
    if (hasLegacyLineSecret(decoded)) return true;
    if (lf === -1) break;
    offset = end;
  }
  return false;
}

function hasLegacyLineSecret(value: string): boolean {
  return hasLegacyCredentialText(value)
    || hasLegacyCredentialKey(value)
    || /(?:authorization|proxy-authorization)\s*:\s*(?:bearer|basic)\s*$/iu.test(value)
    || /(^|\s)bearer\s*$/imu.test(value);
}

function isLegacyCredentialName(value: string): boolean {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .replace(/-/gu, "_")
    .toLowerCase();
  return CREDENTIAL_NAMES.has(normalized)
    || CREDENTIAL_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function safeSourceFile(root: string, relative: string): string {
  const absolute = path.resolve(root, ...relative.split("/"));
  const canonicalRoot = fs.realpathSync(root);
  const canonical = fs.realpathSync(absolute);
  if (canonical !== canonicalRoot && !canonical.startsWith(`${canonicalRoot}${path.sep}`)) {
    throw new Error("Legacy source path escapes its source root");
  }
  return canonical;
}

function decodeLegacyControl(raw: Buffer): string | null {
  if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) {
    return checkedLegacyText(raw.subarray(2).toString("utf16le"));
  }
  if (raw.includes(0)) {
    if (raw.length % 2 !== 0) return null;
    let zeroOdd = 0;
    for (let index = 1; index < raw.length; index += 2) if (raw[index] === 0) zeroOdd += 1;
    if (zeroOdd < raw.length / 8) return null;
    return checkedLegacyText(raw.toString("utf16le"));
  }
  const text = raw.toString("utf8");
  return Buffer.from(text, "utf8").compare(raw) === 0 ? checkedLegacyText(text) : null;
}

function checkedLegacyText(value: string): string | null {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/u.test(value) ? null : value;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const MEDIA_EXTENSIONS = new Set([
  ".aac", ".avi", ".gif", ".jpeg", ".jpg", ".m4a", ".mkv", ".mov",
  ".mp3", ".mp4", ".ogg", ".png", ".svg", ".wav", ".webm", ".webp", ".zip",
]);
