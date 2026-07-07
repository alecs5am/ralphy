// Provider-host ban list (#520) — ONE source of truth for "known provider
// hosts" under AGENTS.md invariant #1: provider traffic goes through
// registered connectors, never through the generic `http` workflow node.
//
// Consumers:
//   • cli/lib/workflow-graph.ts — `ralphy workflow lint` rejects any
//     `allowed_hosts` entry that names (or covers) one of these hosts.
//   • cli/lib/workflow/executors/http.ts — execution-time defense in depth:
//     the request host is re-checked even when the allowlist slipped past lint.
//   • tests/unit/agents-md-invariants.test.ts — asserts this list COVERS every
//     host the invariant test guards with its own (unweakened, inline) source
//     scans, so the two cannot drift apart.
//
// Entries are bare domain SUFFIXES on purpose (no scheme): the invariant
// test's source scans match `https?://...` URLs, and this file must never
// trip them. Matching is suffix-based: "fal.run" bans "fal.run" and every
// subdomain ("queue.fal.run"), never "notfal.run".

export interface BannedHostEntry {
  /** Connector / ban label, used in lint + refusal messages. */
  label: string;
  /** Domain suffixes covered (apex + all subdomains). */
  suffixes: string[];
  /** Why the host is off-limits for the generic http node. */
  reason: string;
}

const CONNECTOR = "provider traffic goes through the registered connector (AGENTS.md invariant #1)";
const FORBIDDEN = "banned everywhere — no connector, no allowlist (AGENTS.md invariant #1)";

export const BANNED_PROVIDER_HOSTS: BannedHostEntry[] = [
  { label: "openrouter", suffixes: ["openrouter.ai"], reason: CONNECTOR },
  { label: "elevenlabs", suffixes: ["elevenlabs.io"], reason: CONNECTOR },
  { label: "fal", suffixes: ["fal.ai", "fal.run"], reason: CONNECTOR },
  { label: "firecrawl", suffixes: ["firecrawl.dev"], reason: CONNECTOR },
  { label: "apify", suffixes: ["apify.com"], reason: CONNECTOR },
  { label: "google-apis", suffixes: ["googleapis.com"], reason: CONNECTOR },
  { label: "telegram", suffixes: ["telegram.org"], reason: CONNECTOR },
  { label: "openai-direct", suffixes: ["openai.com"], reason: FORBIDDEN },
  {
    label: "hosted-vercel",
    suffixes: ["vercel.com", "vercel.app", "vercel.sh", "vercel.ai"],
    reason: FORBIDDEN,
  },
];

/**
 * Is `host` a banned provider host? Accepts a bare hostname or an
 * `allowed_hosts` entry (a leading `*.` wildcard is stripped first — a
 * wildcard that COVERS a provider host is just as banned). Returns the
 * matching entry, or null when the host is fine.
 */
export function bannedProviderHost(host: string): BannedHostEntry | null {
  const h = host.toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
  for (const entry of BANNED_PROVIDER_HOSTS) {
    for (const suffix of entry.suffixes) {
      if (h === suffix || h.endsWith(`.${suffix}`)) return entry;
    }
  }
  return null;
}
