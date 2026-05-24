// Deterministic 5-level citation verifier.
//
// Pure function. No LLM, no network, no filesystem. Resolves cited URLs
// against an append-only source registry using a fixed precedence ladder:
//
//   1. exact         — normalized citation URL equals a registry URL.
//   2. truncation    — registry URL starts with the citation and the
//                      citation ends mid-token (no trailing path boundary).
//   3. prefix        — citation ends on a path boundary and is a strict
//                      path prefix of a registry URL.
//   4. child-path    — registry URL is a strict path prefix of the citation
//                      (the citation extends a registered URL).
//   5. query-subset  — same origin + pathname; the registry URL's query
//                      params are a subset of the citation's.
//
// Stage 1 acceptance (roadmap/12-deep-research/PRD.md): ≥97% resolution on a
// hand-picked eval set and 100% of fabricated URLs flagged as unmatched.

export type MatchLevel =
  | "exact"
  | "truncation"
  | "prefix"
  | "child-path"
  | "query-subset";

const LEVEL_RANK: Record<MatchLevel, number> = {
  exact: 0,
  truncation: 1,
  prefix: 2,
  "child-path": 3,
  "query-subset": 4,
};

export type RegistryEntry = {
  url: string;
  retrievedAt: string;
  [key: string]: unknown;
};

export type MatchedCitation = {
  citation: string;
  level: MatchLevel;
  source: RegistryEntry;
};

export type VerifyResult = {
  matched: MatchedCitation[];
  unmatched: string[];
  byLevel: Record<MatchLevel, number>;
};

export function normalizeUrl(input: string): string {
  const u = new URL(input);
  u.hash = "";
  for (const key of [...u.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_")) u.searchParams.delete(key);
  }
  const sortedParams = [...u.searchParams.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  u.search = "";
  for (const [k, v] of sortedParams) u.searchParams.append(k, v);
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }
  return u.toString();
}

function originAndPath(u: URL): string {
  return `${u.protocol}//${u.host}${u.pathname}`;
}

function queryMap(u: URL): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const [k, v] of u.searchParams.entries()) {
    const arr = m.get(k) ?? [];
    arr.push(v);
    m.set(k, arr);
  }
  for (const arr of m.values()) arr.sort();
  return m;
}

function isQuerySubset(
  small: Map<string, string[]>,
  big: Map<string, string[]>,
): boolean {
  for (const [k, vs] of small.entries()) {
    const bigVs = big.get(k);
    if (!bigVs) return false;
    for (const v of vs) {
      if (!bigVs.includes(v)) return false;
    }
  }
  return true;
}

function classify(citation: string, registryUrl: string): MatchLevel | null {
  let nC: string;
  let nR: string;
  try {
    nC = normalizeUrl(citation);
    nR = normalizeUrl(registryUrl);
  } catch {
    return null;
  }

  if (nC === nR) return "exact";

  if (nR.startsWith(nC) && nR.length > nC.length) {
    const nextChar = nR[nC.length];
    if (nextChar !== "/" && nextChar !== "?" && nextChar !== "#") {
      return "truncation";
    }
  }

  if (nR.startsWith(nC + "/") && nC.length >= "https://x".length) {
    return "prefix";
  }

  if (nC.startsWith(nR + "/")) {
    return "child-path";
  }

  try {
    const uC = new URL(nC);
    const uR = new URL(nR);
    if (originAndPath(uC) === originAndPath(uR)) {
      const qC = queryMap(uC);
      const qR = queryMap(uR);
      if (isQuerySubset(qR, qC) && (qC.size > qR.size || qC.size > 0)) {
        return "query-subset";
      }
    }
  } catch {
    // fall through
  }

  return null;
}

export function matchCitation(
  citation: string,
  registry: RegistryEntry[],
): { level: MatchLevel; source: RegistryEntry } | null {
  let best: { level: MatchLevel; source: RegistryEntry } | null = null;
  for (const entry of registry) {
    const level = classify(citation, entry.url);
    if (!level) continue;
    if (best === null || LEVEL_RANK[level] < LEVEL_RANK[best.level]) {
      best = { level, source: entry };
      if (level === "exact") return best;
    }
  }
  return best;
}

export function verifyCitations(
  citations: string[],
  registry: RegistryEntry[],
): VerifyResult {
  const matched: MatchedCitation[] = [];
  const unmatched: string[] = [];
  const byLevel: Record<MatchLevel, number> = {
    exact: 0,
    truncation: 0,
    prefix: 0,
    "child-path": 0,
    "query-subset": 0,
  };
  for (const citation of citations) {
    const m = matchCitation(citation, registry);
    if (m) {
      matched.push({ citation, level: m.level, source: m.source });
      byLevel[m.level] += 1;
    } else {
      unmatched.push(citation);
    }
  }
  return { matched, unmatched, byLevel };
}
