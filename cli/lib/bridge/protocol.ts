import { ERROR_CODES, isKnownErrorCode, type ErrorCode } from "../errors/catalog.js";
import { DomainError } from "../errors/domain.js";

export const BRIDGE_PROTOCOL_VERSION = 1;
export const MAX_FRAME_BYTES = 1_048_576;
export const MAX_REQUEST_ID_BYTES = 128;
export const MAX_IN_FLIGHT = 64;
export const MAX_SEEN_IDS = 65_536;
export const MAX_OUTBOUND_BYTES = 8_388_608;
export const MAX_AGENT_DELTA_BYTES = 65_536;

export type BridgeRequest = {
  v: 1;
  id: string;
  method: string;
  params?: unknown;
};

export type BridgeSuccess = {
  v: 1;
  id: string;
  ok: true;
  result: unknown;
};

export type BridgeFailure = {
  v: 1;
  id: string | null;
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ActivityDto = {
  sequence: number;
  workspaceId: string | null;
  projectId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  createdAt: number;
};

export type BridgeEvent =
  | {
      v: 1;
      event: "activity";
      subscriptionId: string;
      sequence: number;
      data: ActivityDto;
    }
  | {
      v: 1;
      event: "agent";
      agentSessionId: string;
      turnId: string;
      sequence: number;
      data: unknown;
    };

export class BridgeProtocolError extends Error {
  readonly code: "E_PROTOCOL_INVALID" | "E_PROTOCOL_UNSUPPORTED";

  constructor(
    code: "E_PROTOCOL_INVALID" | "E_PROTOCOL_UNSUPPORTED",
    message: string,
  ) {
    super(message);
    this.name = "BridgeProtocolError";
    this.code = code;
  }
}

/** Splits newline-delimited frames without ever retaining bytes past the cap. */
export class BridgeFrameDecoder {
  private pending = Buffer.alloc(0);
  private failed = false;

  get bufferedBytes(): number {
    return this.pending.byteLength;
  }

  push(chunk: Uint8Array): Buffer[] {
    if (this.failed) {
      throw new BridgeProtocolError("E_PROTOCOL_INVALID", "Bridge framer is closed");
    }
    const bytes = Buffer.from(chunk);
    const frames: Buffer[] = [];
    let offset = 0;
    while (offset < bytes.byteLength) {
      const newline = bytes.indexOf(0x0a, offset);
      const end = newline === -1 ? bytes.byteLength : newline;
      this.append(bytes.subarray(offset, end));
      if (newline === -1) return frames;
      frames.push(this.pending);
      this.pending = Buffer.alloc(0);
      offset = newline + 1;
    }
    return frames;
  }

  end(): void {
    if (this.failed) return;
    if (this.pending.byteLength !== 0) {
      this.fail("Bridge stream ended in an incomplete frame");
    }
  }

  private append(segment: Buffer): void {
    if (this.pending.byteLength + segment.byteLength > MAX_FRAME_BYTES) {
      this.fail("Bridge frame exceeds byte limit");
    }
    if (segment.byteLength !== 0) {
      this.pending = Buffer.concat([this.pending, segment]);
    }
  }

  private fail(message: string): never {
    this.failed = true;
    this.pending = Buffer.alloc(0);
    throw new BridgeProtocolError("E_PROTOCOL_INVALID", message);
  }
}

export function parseBridgeRequest(input: string | Uint8Array): BridgeRequest {
  const bytes = Buffer.from(input);
  if (bytes.byteLength > MAX_FRAME_BYTES) {
    throw new BridgeProtocolError("E_PROTOCOL_INVALID", "Bridge frame exceeds byte limit");
  }
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new BridgeProtocolError("E_PROTOCOL_INVALID", "Bridge request is not valid JSON");
  }
  if (!isPlainObject(value)) invalid("Bridge request must be an object");
  const keys = Object.keys(value);
  if (
    keys.some((key) => !["v", "id", "method", "params"].includes(key)) ||
    !Object.hasOwn(value, "v") ||
    !Object.hasOwn(value, "id") ||
    !Object.hasOwn(value, "method")
  ) {
    invalid("Bridge request contains an unsupported or missing field");
  }
  if (value.v !== BRIDGE_PROTOCOL_VERSION) {
    throw new BridgeProtocolError(
      "E_PROTOCOL_UNSUPPORTED",
      "Bridge protocol version is unsupported",
    );
  }
  assertRequestId(value.id);
  if (typeof value.method !== "string" || !/^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/.test(value.method)) {
    invalid("Bridge request method is invalid");
  }
  return value as BridgeRequest;
}

export function assertRequestId(id: unknown): asserts id is string {
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    Buffer.byteLength(id, "utf8") > MAX_REQUEST_ID_BYTES ||
    !/^[\x21-\x7e]+$/.test(id)
  ) {
    invalid("Bridge request id must be non-empty bounded ASCII");
  }
}

export function createBridgeSuccess(id: string, result: unknown): BridgeSuccess {
  assertRequestId(id);
  assertJsonValue(result);
  return { v: 1, id, ok: true, result };
}

export function createBridgeFailure(
  id: string | null,
  code: string,
  message: string,
  details?: unknown,
): BridgeFailure {
  if (id !== null) assertRequestId(id);
  if (!isPrintableBounded(message)) {
    throw new TypeError("Bridge failure message must be printable and bounded");
  }
  const failure: BridgeFailure = {
    v: 1,
    id,
    ok: false,
    error: { code, message },
  };
  if (details !== undefined) {
    assertJsonValue(details);
    failure.error.details = details;
  }
  return failure;
}

export function stringifyBridgeMessage(message: unknown): string {
  assertJsonValue(message);
  let encoded: string;
  try {
    encoded = JSON.stringify(message);
  } catch {
    throw new TypeError("Bridge message is not JSON serializable");
  }
  if (typeof encoded !== "string") {
    throw new TypeError("Bridge message is not JSON serializable");
  }
  const frame = `${encoded}\n`;
  if (Buffer.byteLength(frame, "utf8") > MAX_OUTBOUND_BYTES) {
    throw new BridgeProtocolError("E_PROTOCOL_INVALID", "Bridge output exceeds byte limit");
  }
  return frame;
}

export function splitUtf8Text(text: string, limitBytes = MAX_AGENT_DELTA_BYTES): string[] {
  if (!Number.isSafeInteger(limitBytes) || limitBytes < 1) {
    throw new RangeError("UTF-8 text limit must be a positive safe integer");
  }
  const normalized = text.normalize("NFC");
  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const codePoint of normalized) {
    const bytes = Buffer.byteLength(codePoint, "utf8");
    if (bytes > limitBytes) throw new RangeError("UTF-8 code point exceeds byte limit");
    if (current !== "" && currentBytes + bytes > limitBytes) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
    }
    current += codePoint;
    currentBytes += bytes;
  }
  if (current !== "") chunks.push(current);
  return chunks;
}

export function projectBridgeError(error: unknown, id: string | null = null): BridgeFailure {
  if (error instanceof BridgeProtocolError) {
    return createBridgeFailure(id, error.code, error.message);
  }
  if (error instanceof DomainError) {
    const details = safeDetails(error.details);
    return createBridgeFailure(
      id,
      error.code,
      safeDomainMessage(error.code),
      details,
    );
  }
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && isKnownErrorCode(code)) {
    return createBridgeFailure(id, code, safeDomainMessage(code));
  }
  return createBridgeFailure(id, "E_INTERNAL", "Internal error");
}

function safeDomainMessage(code: ErrorCode): string {
  if (code === "E_PROTOCOL_INVALID") return "Protocol request is invalid";
  if (code === "E_PROTOCOL_UNSUPPORTED") return "Protocol version is unsupported";
  const entry = ERROR_CODES[code];
  return entry.class === "user" ? "Request rejected" : "Operation failed";
}

function safeDetails(value: unknown): unknown {
  if (!isPlainObject(value)) return undefined;
  try {
    return sanitizeDetails(value, 0, { entries: 0 }, new Set());
  } catch {
    return undefined;
  }
}

function sanitizeDetails(
  value: Record<string, unknown>,
  depth: number,
  budget: { entries: number },
  seen: Set<object>,
): Record<string, unknown> {
  if (depth > 2 || seen.has(value)) throw new TypeError("Unsafe bridge details");
  seen.add(value);
  try {
    const result: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(value)) {
      if (
        !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) ||
        /path|locator|secret|token|password|credential|payload|request|response|error|stack|sql|argv|env/i.test(key) ||
        ++budget.entries > 32
      ) throw new TypeError("Unsafe bridge details");
      if (typeof field === "string") {
        if (!isPrintableBounded(field, 512) || /(?:^|[\\/])(?:Users|tmp|var|home|private|secrets?)(?:[\\/]|$)/i.test(field)) {
          throw new TypeError("Unsafe bridge details");
        }
        result[key] = field;
      } else if (field === null || typeof field === "boolean") {
        result[key] = field;
      } else if (typeof field === "number" && Number.isFinite(field)) {
        result[key] = field;
      } else if (Array.isArray(field)) {
        result[key] = field.map((item) => {
          if (item === null || typeof item === "boolean") return item;
          if (typeof item === "number" && Number.isFinite(item)) return item;
          if (typeof item === "string" && isPrintableBounded(item, 512)) return item;
          throw new TypeError("Unsafe bridge details");
        });
      } else if (isPlainObject(field)) {
        result[key] = sanitizeDetails(field, depth + 1, budget, seen);
      } else {
        throw new TypeError("Unsafe bridge details");
      }
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

function assertJsonValue(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Bridge values must be JSON values");
    return;
  }
  if (typeof value !== "object" || seen.has(value)) {
    throw new TypeError("Bridge values must be JSON values");
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      for (const item of value) assertJsonValue(item, seen);
      return;
    }
    if (!isPlainObject(value)) throw new TypeError("Bridge values must be JSON values");
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) throw new TypeError("Bridge values must be JSON values");
      assertJsonValue(key, seen);
      assertJsonValue(item, seen);
    }
  } finally {
    seen.delete(value);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

function isPrintableBounded(value: string, maxBytes = 1_024): boolean {
  return (
    value.trim().length > 0 &&
    Buffer.byteLength(value, "utf8") <= maxBytes &&
    !/[\p{Cc}\p{Cs}\u2028\u2029]/u.test(value)
  );
}

function invalid(message: string): never {
  throw new BridgeProtocolError("E_PROTOCOL_INVALID", message);
}
