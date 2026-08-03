import { ERROR_CODES, isKnownErrorCode, type ErrorCode } from "./catalog.js";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | JsonObject;

interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type DomainErrorDetails = Readonly<JsonObject>;

const MAX_MESSAGE_BYTES = 1_024;
const MAX_DETAIL_DEPTH = 4;
const MAX_DETAIL_ENTRIES = 64;
const MAX_DETAIL_STRING_BYTES = 2_048;
const NON_PRINTABLE = /[\p{Cc}\p{Cs}\u2028\u2029]/u;
const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Internal throwable boundary. Bridge adapters must project each code through
 * its Task 8 detail schema; they never serialize this object or a raw message.
 */
export class DomainError extends Error {
  declare readonly code: ErrorCode;
  declare readonly details?: DomainErrorDetails;

  constructor(code: ErrorCode, safeMessage?: string, details?: unknown) {
    if (!isKnownErrorCode(code)) {
      throw new TypeError("DomainError code must be a known error code");
    }
    const message = safeMessage ?? ERROR_CODES[code].message;
    if (
      typeof message !== "string" ||
      message.trim().length === 0 ||
      NON_PRINTABLE.test(message)
    ) {
      throw new TypeError("DomainError message must be a printable single-line string");
    }
    if (Buffer.byteLength(message, "utf8") > MAX_MESSAGE_BYTES) {
      throw new TypeError("DomainError message must be bounded");
    }
    super(message);
    Object.defineProperty(this, "message", {
      configurable: false,
      enumerable: false,
      value: message,
      writable: false,
    });
    Object.defineProperty(this, "name", { value: new.target.name });
    Object.defineProperty(this, "code", { value: code });
    if (details !== undefined) {
      Object.defineProperty(this, "details", { value: sanitizeDetails(details) });
    }
  }
}

function sanitizeDetails(value: unknown): DomainErrorDetails {
  if (!isPlainObject(value)) {
    throw new TypeError("DomainError details must be a plain JSON object");
  }
  return sanitizeObject(value, 0, { entries: 0 }, new Set<object>());
}

function sanitizeValue(
  value: unknown,
  depth: number,
  budget: { entries: number },
  seen: Set<object>,
): JsonValue {
  if (depth > MAX_DETAIL_DEPTH) {
    throw new TypeError("DomainError details are nested too deeply");
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("DomainError detail numbers must be finite");
    }
    return value;
  }
  if (typeof value === "string") {
    assertSafeString(value);
    return value;
  }
  if (Array.isArray(value)) {
    return sanitizeArray(value, depth, budget, seen);
  }
  if (isPlainObject(value)) {
    return sanitizeObject(value, depth, budget, seen);
  }
  throw new TypeError("DomainError details must contain plain JSON values");
}

function sanitizeObject(
  value: Record<string, unknown>,
  depth: number,
  budget: { entries: number },
  seen: Set<object>,
): DomainErrorDetails {
  assertDepth(depth);
  enter(value, seen);
  try {
    const keys = ownDataKeys(value);
    const result = Object.create(null) as Record<string, JsonValue>;
    for (const key of keys.sort()) {
      assertSafeKey(key);
      countEntry(budget);
      const field = Object.getOwnPropertyDescriptor(value, key)!.value;
      if (field === undefined) {
        throw new TypeError("DomainError details must contain JSON values");
      }
      result[key] = sanitizeValue(field, depth + 1, budget, seen);
    }
    return Object.freeze(result);
  } finally {
    seen.delete(value);
  }
}

function sanitizeArray(
  value: unknown[],
  depth: number,
  budget: { entries: number },
  seen: Set<object>,
): readonly JsonValue[] {
  assertDepth(depth);
  enter(value, seen);
  try {
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.some((key) => typeof key !== "string") ||
      ownKeys.length !== value.length + 1
    ) {
      throw new TypeError("DomainError detail arrays must be dense JSON lists");
    }
    const result: JsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new TypeError("DomainError detail arrays must be dense JSON lists");
      }
      countEntry(budget);
      if (descriptor.value === undefined) {
        throw new TypeError("DomainError detail arrays must contain JSON values");
      }
      result.push(sanitizeValue(descriptor.value, depth + 1, budget, seen));
    }
    return Object.freeze(result);
  } finally {
    seen.delete(value);
  }
}

function ownDataKeys(value: Record<string, unknown>): string[] {
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) {
    throw new TypeError("DomainError details must not contain symbol fields");
  }
  const keys = ownKeys as string[];
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new TypeError("DomainError details must contain enumerable data fields");
    }
  }
  return keys;
}

function assertSafeKey(key: string): void {
  if (
    key.length === 0 ||
    Buffer.byteLength(key, "utf8") > MAX_DETAIL_STRING_BYTES ||
    NON_PRINTABLE.test(key)
  ) {
    throw new TypeError("DomainError detail keys must be printable and bounded");
  }
  if (UNSAFE_OBJECT_KEYS.has(key)) {
    throw new TypeError("DomainError detail key is not allowed");
  }
}

function assertSafeString(value: string): void {
  if (
    Buffer.byteLength(value, "utf8") > MAX_DETAIL_STRING_BYTES ||
    NON_PRINTABLE.test(value)
  ) {
    throw new TypeError("DomainError detail strings must be printable and bounded");
  }
}

function assertDepth(depth: number): void {
  if (depth > MAX_DETAIL_DEPTH) {
    throw new TypeError("DomainError details are nested too deeply");
  }
}

function enter(value: object, seen: Set<object>): void {
  if (seen.has(value)) {
    throw new TypeError("DomainError details must not contain cycles");
  }
  seen.add(value);
}

function countEntry(budget: { entries: number }): void {
  budget.entries += 1;
  if (budget.entries > MAX_DETAIL_ENTRIES) {
    throw new TypeError("DomainError details contain too many entries");
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
