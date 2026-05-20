// Public-facing error API for the CLI. Every err()/raiseError() callsite
// goes through here so the lint script (scripts/lint-error-codes.ts) can
// statically verify the code against the catalog.
//
// Usage:
//   import { raiseError } from "../lib/errors/index.js";
//   if (!project) raiseError("E_NOT_FOUND", { kind: "Project", id: projectId });
//
// Behavior:
//   • Writes a single JSON object (or pretty block on TTY) to stderr.
//   • Exits with the catalog-mapped exit code (01.06.02).
//   • Returns `never`, so TypeScript narrows correctly.

import { isPrettyMode } from "../ui.js";
import { classifyExitCode, type ErrorCode } from "./catalog.js";
import { formatError, type ErrorContext } from "./format.js";

export {
  ERROR_CODES,
  ERROR_CLASSES,
  classifyExitCode,
  isKnownErrorCode,
  listErrorCodes,
} from "./catalog.js";
export type { ErrorCode, ErrorEntry, ErrorClass } from "./catalog.js";
export {
  buildErrorPayload,
  interpolate,
  formatError,
} from "./format.js";
export type { ErrorContext, ErrorPayload, FormatOptions } from "./format.js";

export function raiseError(code: ErrorCode, ctx: ErrorContext = {}): never {
  const pretty = isPrettyMode();
  process.stderr.write(formatError(code, ctx, { pretty }));
  process.exit(classifyExitCode(code));
}
