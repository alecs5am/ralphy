// Error formatter — turns an (ErrorCode, context) pair into stderr-ready
// output. Used by raiseError() in ./index.ts and by every legacy err() call
// after it switches to the catalog (tracked by scripts/lint-error-codes.ts).
//
// Output contract (01.02.04):
//   • Off-TTY / --json mode: single JSON object on stderr followed by '\n'.
//     Shape: { error: { code, message, hint?, httpAnalog? } }.
//   • On-TTY mode: pretty multi-line block with icons + colors.

import { c, icons } from "../ui.js";
import { ERROR_CODES, type ErrorCode } from "./catalog.js";

export type ErrorContext = Record<string, string | number | boolean | undefined>;

export interface ErrorPayload {
  error: {
    code: ErrorCode;
    message: string;
    hint?: string;
    httpAnalog?: number;
  };
}

const PLACEHOLDER = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

export function interpolate(template: string, ctx: ErrorContext): string {
  return template.replace(PLACEHOLDER, (match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(ctx, key) && ctx[key] !== undefined) {
      return String(ctx[key]);
    }
    return match;
  });
}

export function buildErrorPayload(code: ErrorCode, ctx: ErrorContext = {}): ErrorPayload {
  // Widen via `as ErrorEntry` so TS doesn't narrow per-member-of-union and
  // complain that `httpAnalog` is missing from some variants.
  const entry = ERROR_CODES[code] as import("./catalog.js").ErrorEntry;
  const message = interpolate(entry.message, ctx);
  const hint = interpolate(entry.hint, ctx);
  const payload: ErrorPayload = {
    error: {
      code,
      message,
      hint: hint || undefined,
    },
  };
  if (entry.httpAnalog !== undefined) {
    payload.error.httpAnalog = entry.httpAnalog;
  }
  return payload;
}

export interface FormatOptions {
  pretty: boolean;
}

export function formatError(
  code: ErrorCode,
  ctx: ErrorContext,
  opts: FormatOptions,
): string {
  const payload = buildErrorPayload(code, ctx);
  if (!opts.pretty) {
    return JSON.stringify(payload) + "\n";
  }
  // Pretty rendering: icon + red code + dim message + dim hint.
  const { code: codeStr, message, hint } = payload.error;
  const lines = [
    `${icons.fail} ${c.err(codeStr)} ${c.muted("—")} ${message}`,
  ];
  if (hint) {
    lines.push(`  ${c.muted("hint:")} ${c.value(hint)}`);
  }
  return lines.join("\n") + "\n";
}
