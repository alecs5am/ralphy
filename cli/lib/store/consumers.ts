import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { getConsumerPrincipal } from "./internal-consumers.js";
import { StoreConflictError } from "./types.js";

const BOUNDED_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const LOWER_HEX_64 = /^[0-9a-f]{64}$/;
const BASE64URL_32 = /^[A-Za-z0-9_-]{43}$/;
const NAMESPACE = /^[a-z0-9-]{1,32}$/;

/**
 * The wire token is the unpadded canonical base64url encoding of 32 random
 * bytes; the credential digest is taken over those decoded bytes, never over
 * the encoded text.
 */
export function decodeConsumerToken(tokenBase64url: string): Buffer {
  if (typeof tokenBase64url !== "string" || !BASE64URL_32.test(tokenBase64url)) {
    throw new Error("Consumer token must be 43 canonical base64url characters");
  }
  const decoded = Buffer.from(tokenBase64url, "base64url");
  try {
    if (decoded.byteLength !== 32) {
      throw new Error("Consumer token must decode to exactly 32 bytes");
    }
    // Reject non-zero trailing pad bits that Buffer would otherwise tolerate.
    if (decoded.toString("base64url") !== tokenBase64url) {
      throw new Error("Consumer token is not canonical base64url");
    }
    return decoded;
  } catch (error) {
    decoded.fill(0);
    throw error;
  }
}

export function consumerCredentialDigest(tokenBase64url: string): string {
  const decoded = decodeConsumerToken(tokenBase64url);
  try {
    return createHash("sha256").update(decoded).digest("hex");
  } finally {
    decoded.fill(0);
  }
}

/**
 * The low-level insertion primitive for a bound consumer principal. It knows
 * nothing about migration inventory, phase, readiness files, or Farm paths: it
 * inserts once and permits only byte-identical replay of the same identity. No
 * bridge method or ordinary store caller exposes it; the later full-library
 * `freezeMigration` is the sole production caller.
 *
 * @internal
 */
export function bindConsumerPrincipal(
  db: Database,
  input: { id: string; namespace: string; identityDigest: string },
): void {
  const id = checkedBoundedId(input.id, "Consumer principal ID");
  const namespace = checkedNamespace(input.namespace);
  const identityDigest = checkedDigest(input.identityDigest);
  const existing = getConsumerPrincipal(db, namespace);
  if (existing) {
    if (
      existing.id !== id ||
      existing.namespace !== namespace ||
      existing.identityDigest !== identityDigest
    ) {
      throw new StoreConflictError("Consumer principal is already bound");
    }
    return;
  }
  db.prepare(
    `INSERT INTO consumer_principals (id, namespace, identity_digest, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(id, namespace, identityDigest, Date.now());
}

function checkedBoundedId(value: string, label: string): string {
  if (typeof value !== "string" || !BOUNDED_ID.test(value)) {
    throw new Error(`${label} is not a bounded identifier`);
  }
  return value;
}

function checkedNamespace(value: string): string {
  if (typeof value !== "string" || !NAMESPACE.test(value)) {
    throw new Error("Consumer namespace must be a bounded lowercase slug");
  }
  return value;
}

function checkedDigest(value: string): string {
  if (typeof value !== "string" || !LOWER_HEX_64.test(value)) {
    throw new Error("Consumer identity digest must be lowercase 64-hex");
  }
  return value;
}
