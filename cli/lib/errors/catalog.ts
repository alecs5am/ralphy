// CLI error code catalog — the single source of truth for every `code`
// the CLI can emit on stderr (per 01.02.04, 01.06.01, 01.06.02).
//
// Stability policy (01-D-07):
//   • This catalog is APPEND-ONLY at the v1.0 cut.
//   • Renames forbidden. Removals forbidden.
//   • Deprecating a code requires `deprecated: true` + `replacedBy: "E_..."`;
//     deprecated codes continue to be emitted for at least one major version.
//   • Pre-v1.0 renames still allowed but every rename gets a CHANGELOG entry.
//
// Adding a new error path?
//   1. Add the code here.
//   2. Use it via `raiseError("E_...", { ...ctx })` from cli/lib/errors/index.ts.
//   3. The `lint:errors` script (scripts/lint-error-codes.ts) will fail the
//      build if any err()/raiseError call references a code not in this map.

export const ERROR_CLASSES = [
  "user",
  "provider",
  "env",
  "gate",
  "runtime",
  "cancelled",
] as const;

export type ErrorClass = (typeof ERROR_CLASSES)[number];

export interface ErrorEntry {
  /** Coarse class — drives exit code per 01.06.02. */
  class: ErrorClass;
  /** Closest HTTP analog if any (useful for agents that already speak HTTP). */
  httpAnalog?: number;
  /** Human-facing message template. `{placeholders}` interpolated at raise time. */
  message: string;
  /** Actionable next step. Names a verb / file / doc — never a paraphrase of `message`. */
  hint: string;
  /** Pointer to the canonical doc section for deeper context. */
  relatedDocs: string;
  /** Marked true when superseded by a successor code. */
  deprecated?: boolean;
  /** Required when `deprecated: true` — the new code agents should pattern-match on. */
  replacedBy?: ErrorCode;
}

// ─────────────────────────────────────────────────────────────────────────────
// The catalog. Order is purely organizational — group by class for review.
// ─────────────────────────────────────────────────────────────────────────────

export const ERROR_CODES = {
  // ── User errors (exit 2) ──────────────────────────────────────────────────
  E_INPUT_INVALID: {
    class: "user",
    httpAnalog: 400,
    message: "Invalid input for {field}: {detail}",
    hint: "Check the flag value against `ralphy {verb} --help` and retry.",
    relatedDocs: "docs/cli-spec.md#flags",
  },
  E_FLAG_MISSING: {
    class: "user",
    httpAnalog: 400,
    message: "Missing required flag: --{flag}",
    hint: "Run `ralphy {verb} --help` to see required flags for this command.",
    relatedDocs: "docs/cli-spec.md#flags",
  },
  E_FLAG_UNKNOWN: {
    class: "user",
    httpAnalog: 400,
    message: "Unknown flag value for --{flag}: {value}",
    hint: "Allowed values: {allowed}. See `ralphy {verb} --help`.",
    relatedDocs: "docs/cli-spec.md#flags",
  },
  E_NOT_FOUND: {
    class: "user",
    httpAnalog: 404,
    message: "{kind} not found: {id}",
    hint: "Run `ralphy {kind} list` to see available ids.",
    relatedDocs: "docs/cli-spec.md#resources",
  },
  E_ALREADY_EXISTS: {
    class: "user",
    httpAnalog: 409,
    message: "{kind} already exists: {id}",
    hint: "Pick a different id with --as <id> or delete the existing one first.",
    relatedDocs: "docs/cli-spec.md#resources",
  },
  E_FILE_UNREADABLE: {
    class: "user",
    httpAnalog: 404,
    message: "Cannot read file: {path}",
    hint: "Verify the path exists and is readable; ensure --cwd points at the project root.",
    relatedDocs: "docs/cli-spec.md#workspace",
  },
  E_FILE_MALFORMED: {
    class: "user",
    httpAnalog: 422,
    message: "Malformed {format} in {path}: {detail}",
    hint: "Fix the syntax error and re-run; use `bun run lint` for a strict check.",
    relatedDocs: "docs/cli-spec.md#workspace",
  },
  E_VALIDATION_FAILED: {
    class: "user",
    httpAnalog: 422,
    message: "Validation failed for {target}: {detail}",
    hint: "Adjust the input to match the schema; see `ralphy models show {target}` for valid values.",
    relatedDocs: "docs/cli-spec.md#validation",
  },
  E_AGENT_UNSUPPORTED: {
    class: "user",
    httpAnalog: 400,
    message: "Agent not supported in v1.0: {agent}",
    hint: "Use --agent claude|cursor|codex. Wider adapters tracked under roadmap 01.11.04.",
    relatedDocs: "roadmap/01-cli/SPEC.md#0111-post-launch-tracked-here-for-visibility",
  },
  E_TEMPLATE_VERSION_UNSUPPORTED: {
    class: "user",
    httpAnalog: 422,
    message: "Template version not supported: {version} (template {id})",
    hint: "Upgrade ralphy with `brew upgrade ralphy` or downgrade the template's `version:` field.",
    relatedDocs: "roadmap/02-prompts-and-templates/OPEN-QUESTIONS.md#d-03",
  },
  E_PROJECT_NOT_LINKED: {
    class: "user",
    httpAnalog: 404,
    message: "No project linked or auto-detected from {cwd}",
    hint: "Pass --project <id> or cd into a workspace; see `ralphy project list`.",
    relatedDocs: "docs/cli-spec.md#project-resolution",
  },

  // ── Provider errors (exit 3) ──────────────────────────────────────────────
  E_PROVIDER_HTTP: {
    class: "provider",
    httpAnalog: 502,
    message: "{provider} returned HTTP {status}: {detail}",
    hint: "Check the provider status page; retry after backoff or swap the model via --model.",
    relatedDocs: "MODELS.md",
  },
  E_PROVIDER_AUTH: {
    class: "provider",
    httpAnalog: 401,
    message: "{provider} rejected the request as unauthorized",
    hint: "Re-check the API key with `ralphy doctor`; regenerate via the provider dashboard if needed.",
    relatedDocs: "docs/playbooks/core.md#keys",
  },
  E_PROVIDER_RATE_LIMIT: {
    class: "provider",
    httpAnalog: 429,
    message: "{provider} rate-limited the request (retry after {retryAfter}s)",
    hint: "Wait and retry, or swap to a different model with --model.",
    relatedDocs: "MODELS.md",
  },
  E_PROVIDER_INVALID_REQUEST: {
    class: "provider",
    httpAnalog: 400,
    message: "{provider} rejected the request as invalid: {detail}",
    hint: "Check that the prompt and flags match the model's supported parameters; see `ralphy models show <id>`.",
    relatedDocs: "MODELS.md",
  },
  E_PROVIDER_UNAVAILABLE: {
    class: "provider",
    httpAnalog: 503,
    message: "{provider} is unavailable: {detail}",
    hint: "Wait a few minutes and retry; check the provider's status page.",
    relatedDocs: "MODELS.md",
  },
  E_BUDGET_EXCEEDED: {
    class: "provider",
    httpAnalog: 402,
    message: "Estimated cost ${estimate} exceeds budget cap ${cap}",
    hint: "Raise the cap via `ralphy config set budgets.{scope} <usd>` or trim the plan.",
    relatedDocs: "docs/playbooks/producer.md#budget",
  },

  // ── Environment errors (exit 4) ───────────────────────────────────────────
  E_ENV_KEY_MISSING: {
    class: "env",
    message: "Required API key not set: {key}",
    hint: "Run `ralphy setup` and paste the key, or `export {key}=...` before retrying.",
    relatedDocs: "docs/playbooks/core.md#keys",
  },
  E_ENV_KEY_INVALID: {
    class: "env",
    message: "API key for {provider} failed verification",
    hint: "Regenerate the key in the provider dashboard and re-run `ralphy setup`.",
    relatedDocs: "docs/playbooks/core.md#keys",
  },
  E_DEP_MISSING: {
    class: "env",
    message: "Required dependency not found on PATH: {dep}",
    hint: "Install with `brew install {dep}` (macOS) or your package manager, then re-run `ralphy doctor`.",
    relatedDocs: "docs/playbooks/ralphy-install.md",
  },
  E_FS_PERMISSION: {
    class: "env",
    message: "Cannot write to {path}: {detail}",
    hint: "Check directory permissions; ensure the user owns the workspace dir.",
    relatedDocs: "docs/cli-spec.md#workspace",
  },

  // ── Quality-gate refusals (exit 5) ────────────────────────────────────────
  E_GATE_SCENARIO: {
    class: "gate",
    message: "Scenario quality gate refused: {detail}",
    hint: "Rework the scenario (rewrite hook, tighten VO, swap model) and retry.",
    relatedDocs: "docs/playbooks/scenarist.md#gate",
  },
  E_GATE_IMAGE: {
    class: "gate",
    message: "Image quality gate refused for {slot}: {detail}",
    hint: "Regenerate with a stronger reference or swap to a different image model.",
    relatedDocs: "docs/playbooks/art-director.md#gate",
  },
  E_GATE_VIDEO: {
    class: "gate",
    message: "Video quality gate refused for {slot}: {detail}",
    hint: "Regenerate with different start/end frames or swap to a different video model.",
    relatedDocs: "docs/playbooks/art-director.md#gate",
  },
  E_REF_REQUIRED: {
    class: "gate",
    message: "Reference required for named entity: {entity}",
    hint: "Attach a reference image via `ralphy ref add` or pass --no-ref-consent to override.",
    relatedDocs: "AGENTS.md#hard-invariants-apply-across-all-playbooks",
  },

  // ── Runtime / catch-all (exit 1) ──────────────────────────────────────────
  E_INTERNAL: {
    class: "runtime",
    httpAnalog: 500,
    message: "Internal error: {detail}",
    hint: "Re-run with --verbose; file an issue at github.com/alecs5am/ugc-cli/issues if it persists.",
    relatedDocs: "https://github.com/alecs5am/ugc-cli/issues",
  },

  // ── Cancellation (exit 130) ───────────────────────────────────────────────
  E_CANCELLED: {
    class: "cancelled",
    message: "Operation cancelled by user (SIGINT)",
    hint: "Re-run the command to resume; append-only state was preserved.",
    relatedDocs: "docs/cli-spec.md#cancellation",
  },
} as const satisfies Record<string, ErrorEntry>;

export type ErrorCode = keyof typeof ERROR_CODES;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Exit-code class mapping per 01.06.02. Append-only after v1.0. */
export function classifyExitCode(code: ErrorCode): number {
  const entry = ERROR_CODES[code];
  switch (entry.class) {
    case "user":
      return 2;
    case "provider":
      return 3;
    case "env":
      return 4;
    case "gate":
      return 5;
    case "cancelled":
      return 130;
    case "runtime":
    default:
      return 1;
  }
}

export function isKnownErrorCode(code: string): code is ErrorCode {
  return Object.prototype.hasOwnProperty.call(ERROR_CODES, code);
}

/** Returns the list of every catalog code (handy for tests / lint). */
export function listErrorCodes(): ErrorCode[] {
  return Object.keys(ERROR_CODES) as ErrorCode[];
}
