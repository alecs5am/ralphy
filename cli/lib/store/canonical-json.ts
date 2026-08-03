import { createHash } from "node:crypto";
import type { JsonValue } from "./types.js";

/**
 * The canonical form used for an external operation's `request_digest`.
 *
 * This is deliberately its own contract rather than a reuse of the per-module
 * JSON guards: those normalize domain input (rejecting data URLs and embedded
 * binary), while this one must produce identical bytes on two different
 * machines for the same semantic request. It sorts object keys by UTF-8 byte
 * order, preserves array order, serializes with no whitespace, normalizes `-0`
 * to `0`, and rejects anything whose serialization is not well defined.
 */
export function canonicalRequestJson(value: JsonValue, label = "Request"): string {
  return JSON.stringify(canonicalize(value, label, new Set()));
}

export function requestDigest(value: JsonValue, label = "Request"): string {
  return createHash("sha256")
    .update(Buffer.from(canonicalRequestJson(value, label), "utf8"))
    .digest("hex");
}

export function canonicalPublicJson(
  value: unknown,
  label = "Projected",
): JsonValue {
  const canonical = canonicalize(
    value,
    `${label} public JSON`,
    new Set(),
    true,
  );
  assertPublicValues(canonical, label);
  return canonical;
}

export function canonicalSocialAccountConfig(value: unknown): JsonValue {
  const canonical = canonicalize(
    value,
    "Social account config",
    new Set(),
    true,
  );
  assertCredentialKeys(canonical, "Social account config");
  return canonical;
}

const LOWER_HEX_64 = /^[0-9a-f]{64}$/;
const CREDENTIAL_KEYS = new Set([
  "apikey",
  "accesstoken",
  "refreshtoken",
  "token",
  "secret",
  "password",
  "credential",
]);
const RAW_BOUNDARY_KEYS = new Set([
  "path",
  "locator",
  "filepath",
  "logpath",
  "bucket",
  "key",
  "hash",
  "sha256",
  "originalname",
  "metadata",
  "error",
  "request",
  "response",
  "report",
  "providerpayload",
  "embedded",
  "embeddedfile",
  "embeddedfiles",
  "embeddeddata",
  "binary",
  "binarydata",
  "base64",
  "base64data",
  "b64",
  "blob",
  "bytes",
  "dataurl",
  "filedata",
  "imagedata",
]);
const HIERARCHICAL_URI = /^[a-z][a-z0-9+.-]*:\//i;
const WINDOWS_PATH = /^[a-z]:[\\/]/i;
const EXPLICIT_DIGEST = /^(?:digest|md5|sha-?1|sha-?256|sha-?384|sha-?512):[0-9a-f]+$/i;

export function assertRequestDigest(digest: string): string {
  if (typeof digest !== "string" || !LOWER_HEX_64.test(digest)) {
    throw new Error("Request digest must be lowercase 64-hex SHA-256");
  }
  return digest;
}

function canonicalize(
  value: unknown,
  label: string,
  seen: Set<object>,
  guardObjectKeys = false,
): JsonValue {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${label} contains a non-finite number`);
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === "string") {
    assertValidUnicode(value, label);
    return value;
  }
  if (typeof value === "bigint") {
    throw new Error(`${label} contains a bigint`);
  }
  if (typeof value !== "object") {
    throw new Error(`${label} contains an unsupported value`);
  }
  if (seen.has(value)) throw new Error(`${label} contains a cycle`);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      // A plain loop, not `.map`: `.map` skips holes and would copy a sparse
      // array through untouched.
      const canonical: JsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw new Error(`${label} contains a sparse array`);
        }
        const item = value[index];
        if (item === undefined) {
          throw new Error(`${label} contains undefined`);
        }
        canonical.push(canonicalize(item, label, seen, guardObjectKeys));
      }
      return canonical;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${label} contains a non-plain object`);
    }
    const canonical: Record<string, JsonValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort(
      (left, right) =>
        Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
    )) {
      if (guardObjectKeys) {
        assertValidUnicode(key, label);
        if (key === "__proto__") {
          throw new Error(`${label} contains an unsupported key: ${key}`);
        }
      }
      const entry = (value as Record<string, unknown>)[key];
      if (entry === undefined) throw new Error(`${label} contains undefined`);
      canonical[key] = canonicalize(entry, label, seen, guardObjectKeys);
    }
    return canonical;
  } finally {
    seen.delete(value);
  }
}

function assertPublicValues(value: JsonValue, label: string): void {
  if (typeof value === "string") {
    const text = value.trim();
    if (
      /^data:/i.test(text) ||
      /^file:/i.test(text) ||
      HIERARCHICAL_URI.test(text) ||
      text.startsWith("/") ||
      WINDOWS_PATH.test(text) ||
      text.startsWith("\\\\") ||
      EXPLICIT_DIGEST.test(text)
    ) {
      throw new Error(`${label} public JSON contains a raw locator value`);
    }
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) assertPublicValues(item, label);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    const normalized = normalizeKey(key);
    if (CREDENTIAL_KEYS.has(normalized)) {
      throw new Error(`${label} public JSON contains credential key: ${key}`);
    }
    if (RAW_BOUNDARY_KEYS.has(normalized)) {
      throw new Error(`${label} public JSON contains raw boundary key: ${key}`);
    }
    assertPublicValues(item, label);
  }
}

function assertCredentialKeys(value: JsonValue, label: string): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) assertCredentialKeys(item, label);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (CREDENTIAL_KEYS.has(normalizeKey(key))) {
      throw new Error(`${label} must not contain credential key: ${key}`);
    }
    assertCredentialKeys(item, label);
  }
}

function normalizeKey(key: string): string {
  return key.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function assertValidUnicode(value: string, label: string): void {
  // A lone surrogate survives JSON.stringify as an escape but is not valid
  // Unicode, so two encoders can disagree on its bytes.
  if (/[\uD800-\uDFFF]/.test(value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ""))) {
    throw new Error(`${label} contains invalid Unicode`);
  }
}
