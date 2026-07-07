// The generic `http` ingestion node executor (#520) — pull data from an
// arbitrary ALLOWLISTED API the registered ingestion connectors don't cover
// (a niche leaderboard, a product changelog JSON).
//
// Guardrails (why this is not an invariant-#1 bypass):
//   • `params.allowed_hosts` is REQUIRED for execution — no allowlist, no
//     request. An entry is an exact host ("api.example.com") or a `*.suffix`
//     wildcard ("*.example.com" — subdomains only, never the apex).
//   • Known provider hosts (cli/lib/providers/banned-hosts.ts — the same list
//     the AGENTS.md invariant test covers) are refused BOTH in the allowlist
//     and on the request host, on top of the `workflow lint` error.
//   • Secrets arrive as `$ENV_VAR` references in header values (env-refs.ts),
//     resolved here at execution — a literal secret in the graph file is a
//     lint error (it would end up in #502 bundles).
//   • Timeout (params.timeout_ms, default 30s) + response size cap
//     (params.max_response_bytes, default 5 MiB).
//
// Output typing: a JSON content-type parses into an object output
// (`<node-id>.json` artifact); anything else is text (`<node-id>.txt`).
// HTTP goes through the ctx.fetchImpl seam (zero-network tests), same as the
// #500 ingestion nodes.

import { bannedProviderHost } from "../../providers/banned-hosts.js";
import { isEnvRef, resolveEnvRef } from "../env-refs.js";
import { writeNodeArtifact } from "./llm.js";
import { NodeExecutionError } from "./types.js";
import type { NodeExecutor } from "./types.js";

export const HTTP_DEFAULT_TIMEOUT_MS = 30_000;
export const HTTP_MAX_TIMEOUT_MS = 120_000;
export const HTTP_DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MiB

type HttpParams = {
  url?: string;
  method?: string;
  headers?: Record<string, unknown>;
  /** POST body: a string ships verbatim; an object is JSON-encoded. */
  body?: unknown;
  /** REQUIRED: exact hosts or `*.suffix` wildcards the node may call. */
  allowed_hosts?: unknown;
  timeout_ms?: number;
  max_response_bytes?: number;
};

/** Does `host` match an allowlist entry? Exact host, or `*.suffix` = subdomains only. */
export function hostAllowed(host: string, entries: string[]): boolean {
  const h = host.toLowerCase();
  for (const raw of entries) {
    const entry = raw.toLowerCase();
    if (entry.startsWith("*.")) {
      if (h.endsWith(entry.slice(1))) return true; // ".suffix" — subdomains only
    } else if (h === entry) {
      return true;
    }
  }
  return false;
}

/** Validated allowlist or a thrown refusal — shared by the pre-flight checks. */
function requireAllowedHosts(nodeId: string, raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0 || !raw.every((h) => typeof h === "string" && h.length > 0)) {
    throw new NodeExecutionError(
      "allowed-hosts-missing",
      `http node "${nodeId}" refuses to execute without params.allowed_hosts (string[] of exact hosts or *.suffix wildcards) — every http node needs an explicit host allowlist`,
    );
  }
  for (const entry of raw as string[]) {
    const banned = bannedProviderHost(entry);
    if (banned) {
      throw new NodeExecutionError(
        "provider-host-banned",
        `http node "${nodeId}" allowed_hosts entry "${entry}" covers the ${banned.label} provider host — ${banned.reason}`,
      );
    }
  }
  return raw as string[];
}

export const httpExecutor: NodeExecutor = async (node, ctx) => {
  const p = node.params as HttpParams;

  // URL: the wired in-port wins (an upstream node computed it); else params.
  const rawUrl = typeof ctx.inputs.url === "string" ? ctx.inputs.url : p.url;
  if (typeof rawUrl !== "string" || rawUrl.length === 0) {
    throw new NodeExecutionError("params-invalid", `http node "${node.id}" requires params.url (or a wired "url" in-port)`);
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new NodeExecutionError("params-invalid", `http node "${node.id}" url "${rawUrl}" is not a valid URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new NodeExecutionError("params-invalid", `http node "${node.id}" url must be http(s), got "${url.protocol}"`);
  }

  // Allowlist enforcement — refuse and NAME the host.
  const allowed = requireAllowedHosts(node.id, p.allowed_hosts);
  const host = url.hostname;
  if (!hostAllowed(host, allowed)) {
    throw new NodeExecutionError(
      "host-not-allowed",
      `http node "${node.id}" refuses host "${host}" — not in allowed_hosts [${allowed.join(", ")}]`,
    );
  }
  const bannedTarget = bannedProviderHost(host);
  if (bannedTarget) {
    throw new NodeExecutionError(
      "provider-host-banned",
      `http node "${node.id}" refuses host "${host}" — ${bannedTarget.label} is a provider host; ${bannedTarget.reason}`,
    );
  }

  const method = (p.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "POST") {
    throw new NodeExecutionError("params-invalid", `http node "${node.id}" method must be GET or POST, got "${p.method}"`);
  }

  // Headers: `$ENV_VAR` references resolve at execution (secrets never live
  // in the graph file). A reference to an unset var is a hard error.
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(p.headers ?? {})) {
    if (typeof value !== "string") {
      throw new NodeExecutionError("params-invalid", `http node "${node.id}" header "${key}" must be a string`);
    }
    try {
      headers[key] = isEnvRef(value) ? resolveEnvRef(value) : value;
    } catch (e) {
      throw new NodeExecutionError("env-var-missing", `http node "${node.id}" header "${key}": ${(e as Error).message}`);
    }
  }

  // Body (POST only): a string ships verbatim; anything else JSON-encodes
  // with a default JSON content-type.
  let body: string | undefined;
  const rawBody = ctx.inputs.body !== undefined ? ctx.inputs.body : p.body;
  if (rawBody !== undefined) {
    if (method !== "POST") {
      throw new NodeExecutionError("params-invalid", `http node "${node.id}" has a body but method is ${method} — use POST`);
    }
    if (typeof rawBody === "string") {
      body = rawBody;
    } else {
      body = JSON.stringify(rawBody);
      if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
        headers["content-type"] = "application/json";
      }
    }
  }

  const timeoutMs = Math.min(
    Math.max(1, typeof p.timeout_ms === "number" ? p.timeout_ms : HTTP_DEFAULT_TIMEOUT_MS),
    HTTP_MAX_TIMEOUT_MS,
  );
  const maxBytes =
    typeof p.max_response_bytes === "number" && p.max_response_bytes > 0
      ? p.max_response_bytes
      : HTTP_DEFAULT_MAX_RESPONSE_BYTES;

  const f = ctx.fetchImpl ?? fetch;
  let resp: Response;
  try {
    resp = await f(url.toString(), { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new NodeExecutionError(
      "http-request-failed",
      `http node "${node.id}" ${method} ${url} failed: ${(e as Error).message} (timeout ${timeoutMs}ms)`,
    );
  }

  const declaredLength = Number(resp.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new NodeExecutionError(
      "response-too-large",
      `http node "${node.id}" response declares ${declaredLength} bytes — over the ${maxBytes}-byte cap (params.max_response_bytes)`,
    );
  }
  const buf = await resp.arrayBuffer();
  if (buf.byteLength > maxBytes) {
    throw new NodeExecutionError(
      "response-too-large",
      `http node "${node.id}" response is ${buf.byteLength} bytes — over the ${maxBytes}-byte cap (params.max_response_bytes)`,
    );
  }
  const text = new TextDecoder().decode(buf);
  if (!resp.ok) {
    throw new NodeExecutionError(
      "http-status",
      `http node "${node.id}" ${method} ${url} returned ${resp.status}: ${text.slice(0, 200)}`,
    );
  }

  // Typed out-port: JSON content-type → object, else text.
  const contentType = resp.headers.get("content-type") ?? "";
  if (/\bjson\b/i.test(contentType)) {
    let output: unknown;
    try {
      output = JSON.parse(text);
    } catch (e) {
      throw new NodeExecutionError(
        "response-invalid",
        `http node "${node.id}" declared JSON but the body does not parse: ${(e as Error).message}`,
      );
    }
    const artifactPath = await writeNodeArtifact(ctx, `${node.id}.json`, JSON.stringify(output, null, 2));
    return { output, artifactPath };
  }
  const artifactPath = await writeNodeArtifact(ctx, `${node.id}.txt`, text);
  return { output: text, artifactPath };
};
