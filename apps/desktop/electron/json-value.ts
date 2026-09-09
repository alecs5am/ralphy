import type { JsonValue } from "./ralphy/types";

const MAX_DEPTH = 32;
const MAX_NODES = 10_000;
const MAX_BYTES = 900_000;

export function parseBoundedJsonValue(value: unknown): JsonValue {
  const stack = new Set<object>();
  let nodes = 0;
  let bytes = 0;
  const invalid = (): never => { throw new Error("Invalid JSON value"); };
  const visit = (item: unknown, depth: number): JsonValue => {
    nodes += 1;
    if (depth > MAX_DEPTH || nodes > MAX_NODES) return invalid();
    if (item === null || typeof item === "boolean") return item;
    if (typeof item === "number") return Number.isFinite(item) ? item : invalid();
    if (typeof item === "string") {
      bytes += Buffer.byteLength(item);
      if (bytes > MAX_BYTES) return invalid();
      return item;
    }
    if (typeof item !== "object" || stack.has(item)) return invalid();
    const prototype = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) return invalid();
    stack.add(item);
    try {
      if (Array.isArray(item)) {
        if (item.length > MAX_NODES - nodes) return invalid();
        const output: JsonValue[] = [];
        for (let index = 0; index < item.length; index += 1) {
          if (!Object.hasOwn(item, index)) return invalid();
          output.push(visit(item[index], depth + 1));
        }
        return output;
      }
      const output = Object.create(null) as Record<string, JsonValue>;
      for (const key in item) {
        if (!Object.hasOwn(item, key)) continue;
        bytes += Buffer.byteLength(key);
        if (bytes > MAX_BYTES || key.length > 1_024) return invalid();
        output[key] = visit((item as Record<string, unknown>)[key], depth + 1);
      }
      return output;
    } finally {
      stack.delete(item);
    }
  };
  return visit(value, 0);
}
