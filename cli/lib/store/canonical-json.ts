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

const LOWER_HEX_64 = /^[0-9a-f]{64}$/;

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
    // A lone surrogate survives JSON.stringify as an escape but is not valid
    // Unicode, so two encoders can disagree on its bytes.
    if (/[\uD800-\uDFFF]/.test(value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ""))) {
      throw new Error(`${label} contains invalid Unicode`);
    }
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
        canonical.push(canonicalize(item, label, seen));
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
      const entry = (value as Record<string, unknown>)[key];
      if (entry === undefined) throw new Error(`${label} contains undefined`);
      canonical[key] = canonicalize(entry, label, seen);
    }
    return canonical;
  } finally {
    seen.delete(value);
  }
}
