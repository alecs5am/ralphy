import { Fragment, type ReactNode } from "react";

const MAX_DEPTH = 32;
const MAX_NODES = 10_000;
const MAX_BYTES = 900_000;

function tokens(value: unknown, depth: number, count: { value: number }, key: string): ReactNode {
  count.value += 1;
  if (depth > MAX_DEPTH || count.value > MAX_NODES) throw new Error("JSON is too large");
  if (value === null) return <span className="json-token-null">null</span>;
  if (typeof value === "string") return <span className="json-token-string">{JSON.stringify(value)}</span>;
  if (typeof value === "number") return <span className="json-token-number">{String(value)}</span>;
  if (typeof value === "boolean") return <span className="json-token-boolean">{String(value)}</span>;
  if (!Array.isArray(value) && (typeof value !== "object" || value === null)) throw new Error("Invalid JSON");
  const entries = Array.isArray(value) ? value.map((item, index) => [String(index), item] as const) : Object.entries(value);
  const open = Array.isArray(value) ? "[" : "{";
  const close = Array.isArray(value) ? "]" : "}";
  if (entries.length === 0) return `${open}${close}`;
  const indent = "  ".repeat(depth + 1);
  return <>{open}{entries.map(([name, item], index) => <Fragment key={`${key}-${name}`}>
    {index === 0 ? "\n" : ",\n"}{indent}
    {!Array.isArray(value) && <><span className="json-token-key">{JSON.stringify(name)}</span>{": "}</>}
    {tokens(item, depth + 1, count, `${key}-${name}`)}
  </Fragment>)}{"\n"}{"  ".repeat(depth)}{close}</>;
}

export function JsonDocumentView({ text }: { text: string }) {
  try {
    if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error("JSON is too large");
    const value: unknown = JSON.parse(text);
    return <pre className="json-document-view">{tokens(value, 0, { value: 0 }, "json")}</pre>;
  } catch {
    return <pre className="plain-text-view json-document-fallback">{text}</pre>;
  }
}
