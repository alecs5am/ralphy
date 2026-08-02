import { createHash } from "node:crypto";

/**
 * The bounded identity a consumer namespace publishes for the startup
 * handshake. Its canonical file is UTF-8 JSON with keys in exactly this order,
 * no insignificant whitespace, and no trailing newline.
 */
export type FarmIdentityV1 = {
  version: 1;
  namespace: "farm";
  storeId: string;
  consumerId: string;
  migrationId: string;
  stageDigest: string;
  credentialDigest: string;
};

const FIELD_ORDER = [
  "version",
  "namespace",
  "storeId",
  "consumerId",
  "migrationId",
  "stageDigest",
  "credentialDigest",
] as const;
const BOUNDED_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const LOWER_HEX_64 = /^[0-9a-f]{64}$/;
const BASE64URL_32 = /^[A-Za-z0-9_-]{43}$/;

export function serializeFarmIdentity(identity: FarmIdentityV1): string {
  assertFarmIdentity(identity);
  return JSON.stringify(
    Object.fromEntries(FIELD_ORDER.map((key) => [key, identity[key]])),
  );
}

export function parseFarmIdentity(canonical: string): FarmIdentityV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(canonical);
  } catch {
    throw new Error("Farm identity is not valid JSON");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.keys(parsed).length !== FIELD_ORDER.length
  ) {
    throw new Error("Farm identity has unexpected fields");
  }
  const identity = parsed as FarmIdentityV1;
  assertFarmIdentity(identity);
  // Canonical bytes only: reordered keys, added whitespace, or a trailing
  // newline all change the identity digest, so they are not the same identity.
  if (serializeFarmIdentity(identity) !== canonical) {
    throw new Error("Farm identity is not canonical");
  }
  return identity;
}

/** SHA-256 over the canonical identity-file bytes. */
export function farmIdentityDigest(canonical: string): string {
  return createHash("sha256").update(Buffer.from(canonical, "utf8")).digest("hex");
}

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
  if (decoded.byteLength !== 32) {
    throw new Error("Consumer token must decode to exactly 32 bytes");
  }
  // Reject any non-canonical alphabet or padding that Buffer would tolerate.
  if (decoded.toString("base64url") !== tokenBase64url) {
    throw new Error("Consumer token is not canonical base64url");
  }
  return decoded;
}

export function consumerCredentialDigest(tokenBase64url: string): string {
  const decoded = decodeConsumerToken(tokenBase64url);
  try {
    return createHash("sha256").update(decoded).digest("hex");
  } finally {
    decoded.fill(0);
  }
}

function assertFarmIdentity(identity: FarmIdentityV1): void {
  if (identity.version !== 1) throw new Error("Farm identity version must be 1");
  if (identity.namespace !== "farm") {
    throw new Error("Farm identity namespace must be farm");
  }
  for (const key of ["storeId", "consumerId", "migrationId"] as const) {
    const value = identity[key];
    if (typeof value !== "string" || !BOUNDED_ID.test(value)) {
      throw new Error(`Farm identity ${key} is not a bounded identifier`);
    }
  }
  for (const key of ["stageDigest", "credentialDigest"] as const) {
    const value = identity[key];
    if (typeof value !== "string" || !LOWER_HEX_64.test(value)) {
      throw new Error(`Farm identity ${key} must be lowercase 64-hex`);
    }
  }
}
