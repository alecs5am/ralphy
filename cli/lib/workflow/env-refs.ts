// Env-var references + secret-literal detection for graph files (#520).
//
// A workflow graph file is committed / bundled / shared, so a secret must
// NEVER appear in it as a literal. The contract:
//
//   • A param/header value that IS a secret is written as `$MY_API_TOKEN`
//     (the whole value, exactly one env-var name) and resolved at EXECUTION
//     time by the consuming executor (cli/lib/workflow/executors/http.ts).
//   • `ralphy workflow lint` rejects a secret-LOOKING literal: a key whose
//     name smells like a credential (SECRET_PARAM_KEY_RE) carrying a long
//     opaque literal value (looksLikeSecretLiteral). Deliberately
//     conservative: short values ("v2", "gzip") and values with spaces /
//     regular prose never fire; `$ENV` references never fire.

/** The whole value is one env-var reference: `$MY_API_TOKEN`. */
export const ENV_REF_RE = /^\$[A-Z][A-Z0-9_]*$/;

export function isEnvRef(value: string): boolean {
  return ENV_REF_RE.test(value);
}

/**
 * Resolve a `$ENV_VAR` reference against process.env. Non-reference values
 * pass through untouched. A reference to an UNSET var throws — a silent empty
 * header is the worse failure mode.
 */
export function resolveEnvRef(value: string): string {
  if (!isEnvRef(value)) return value;
  const name = value.slice(1);
  const resolved = process.env[name];
  if (resolved === undefined || resolved === "") {
    throw new Error(`env var ${name} is not set — the graph references it as ${value}`);
  }
  return resolved;
}

/** Param / header KEY names that smell like a credential. */
export const SECRET_PARAM_KEY_RE = /(key|token|secret|bearer|auth(?:orization)?|password|credential)/i;

/**
 * Does a string VALUE look like a literal secret? Conservative heuristic
 * (documented in the module header): after stripping an optional `Bearer `
 * prefix, the value is >= 16 chars of a single opaque token (base64ish /
 * hexish / API-key charset, no spaces). `$ENV` references are never literals.
 */
export function looksLikeSecretLiteral(value: string): boolean {
  if (isEnvRef(value)) return false;
  const v = value.replace(/^Bearer\s+/i, "");
  return v.length >= 16 && /^[A-Za-z0-9+/=_.:-]+$/.test(v);
}

/**
 * Scan a params object (including a nested `headers` record) for
 * secret-looking literals. Returns `<key path> → value` offenders; empty
 * array = clean. Used by the #520 workflow lint on `http` and
 * `webhook-trigger` nodes.
 */
export function findSecretLiterals(params: Record<string, unknown>): Array<{ key: string; value: string }> {
  const offenders: Array<{ key: string; value: string }> = [];
  const check = (key: string, label: string, value: unknown) => {
    if (typeof value !== "string") return;
    if (!SECRET_PARAM_KEY_RE.test(key)) return;
    if (looksLikeSecretLiteral(value)) offenders.push({ key: label, value });
  };
  for (const [key, value] of Object.entries(params)) {
    if (key === "headers" && value && typeof value === "object" && !Array.isArray(value)) {
      for (const [h, hv] of Object.entries(value as Record<string, unknown>)) {
        check(h, `headers.${h}`, hv);
      }
      continue;
    }
    check(key, key, value);
  }
  return offenders;
}
