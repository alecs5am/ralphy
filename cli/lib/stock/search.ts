// `ralphy stock search` (#596, #597): fan one query out to the stock sources,
// apply the license and orientation filters, and interleave the results.
//
// A source that cannot run (Pexels without a key) is skipped with a note; a
// source that fails or misses its deadline is reported in `sources` and the
// others still answer. The search throws only when every source it asked
// failed, so a 429 from anonymous Openverse surfaces as a rate limit instead
// of an empty result.

import { DomainError } from "../errors/domain.js";
import { passesLicenseFilter } from "./license.js";
import { StockSourceError } from "./http.js";
import { DEFAULT_STOCK_SOURCES, STOCK_CONNECTORS } from "./sources.js";
import type {
  FetchLike,
  StockCandidate,
  StockKind,
  StockLicenseFilter,
  StockOrientation,
  StockSourceId,
} from "./types.js";

export const STOCK_LIMIT_MAX = 50;
/** How long one source may take to answer a search before it is reported as timed out. */
export const STOCK_SOURCE_TIMEOUT_MS = 10_000;

function formatSeconds(ms: number): string {
  return ms >= 1000 ? `${Math.round(ms / 100) / 10}s` : `${ms}ms`;
}

export type StockSourceReport = {
  source: StockSourceId;
  status: "ok" | "skipped" | "error";
  /** Candidates the source returned before the filters. */
  returned: number;
  /** Candidates that passed the license and orientation filters. */
  kept: number;
  note?: string;
};

export type StockSearchResult = {
  query: string;
  kind: StockKind;
  license: StockLicenseFilter;
  orientation: StockOrientation;
  limit: number;
  count: number;
  sources: StockSourceReport[];
  notes: string[];
  candidates: StockCandidate[];
};

/** Whether a candidate's known frame matches the orientation; unknown frames pass. */
export function matchesOrientation(candidate: Pick<StockCandidate, "width" | "height" | "kind">, orientation: StockOrientation): boolean {
  if (orientation === "any" || ["audio", "logo", "sticker", "icon"].includes(candidate.kind)) return true;
  if (!candidate.width || !candidate.height) return true;
  return orientation === "vertical" ? candidate.height > candidate.width : candidate.width > candidate.height;
}

/** Round-robin across sources in order, dropping repeated ids. */
export function interleave(lists: StockCandidate[][], limit: number): StockCandidate[] {
  const out: StockCandidate[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < limit && lists.some((l) => i < l.length); i += 1) {
    for (const list of lists) {
      const item = list[i];
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export async function searchStock(input: {
  query: string;
  kind: StockKind;
  sources?: readonly StockSourceId[];
  limit: number;
  orientation: StockOrientation;
  license: StockLicenseFilter;
  fetchImpl: FetchLike;
  /** Per-source deadline; default STOCK_SOURCE_TIMEOUT_MS. */
  timeoutMs?: number;
}): Promise<StockSearchResult> {
  const query = input.query.replace(/\s+/g, " ").trim();
  if (!query) throw new DomainError("E_INPUT_INVALID", undefined, { field: "query", detail: "the search query is empty", verb: "stock search" });
  const limit = Math.max(1, Math.min(STOCK_LIMIT_MAX, Math.floor(input.limit)));
  const requested = input.sources && input.sources.length > 0 ? [...new Set(input.sources)] : [...DEFAULT_STOCK_SOURCES[input.kind]];
  const importOnly = requested.filter((id) => STOCK_CONNECTORS[id].searchable === false);
  if (importOnly.length > 0) {
    throw new DomainError("E_INPUT_INVALID", undefined, {
      field: "source",
      detail: importOnly.map((id) => `${id} has no search: pull a URL with \`ralphy stock pull ${id}:<url> --project <id>\``).join("; "),
      verb: "stock search",
    });
  }
  const unsupported = requested.filter((id) => !STOCK_CONNECTORS[id].kinds.includes(input.kind));
  if (unsupported.length > 0) {
    throw new DomainError("E_INPUT_INVALID", undefined, {
      field: "source",
      detail: unsupported.map((id) => `${id} serves ${STOCK_CONNECTORS[id].kinds.join(", ")}, not ${input.kind}`).join("; "),
      verb: "stock search",
    });
  }

  const timeoutMs = Math.max(1, input.timeoutMs ?? STOCK_SOURCE_TIMEOUT_MS);
  const notes: string[] = [];
  const failures: unknown[] = [];
  const settled = await Promise.all(requested.map(async (id): Promise<{ report: StockSourceReport; kept: StockCandidate[] }> => {
    const connector = STOCK_CONNECTORS[id];
    const unavailable = connector.unavailableNote();
    if (unavailable) {
      notes.push(unavailable);
      return { report: { source: id, status: "skipped", returned: 0, kept: 0, note: unavailable }, kept: [] };
    }
    // Each source gets its own deadline: at it, every request of that source
    // is aborted (so no socket or timer outlives the search) and the source
    // reports a timeout while the others answer. A source that still has to
    // build its cached index gets its longer cold-start deadline once.
    const coldStart = connector.coldStartTimeoutMs?.() ?? null;
    const budgetMs = Math.max(timeoutMs, coldStart ?? 0);
    if (coldStart !== null) notes.push(`${id}: building its search index once (cached under .ralphy/cache/stock/; up to ${formatSeconds(coldStart)})`);
    const deadline = new AbortController();
    const reason = new StockSourceError(connector.label, 0, `${connector.label}: no answer within ${formatSeconds(budgetMs)} (pass --timeout to wait longer)`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        deadline.abort(reason);
        reject(reason);
      }, budgetMs);
    });
    expired.catch(() => undefined);
    try {
      const found = await Promise.race([
        connector.search({ query, kind: input.kind, limit, orientation: input.orientation, license: input.license, signal: deadline.signal }, input.fetchImpl),
        expired,
      ]);
      const kept = found.filter((c) => passesLicenseFilter(c, input.license) && matchesOrientation(c, input.orientation));
      return { report: { source: id, status: "ok", returned: found.length, kept: kept.length }, kept };
    } catch (error) {
      const failure = deadline.signal.aborted ? reason : error;
      failures.push(failure);
      const note = `${id} failed: ${(failure as Error)?.message ?? String(failure)}`;
      notes.push(note);
      return { report: { source: id, status: "error", returned: 0, kept: 0, note }, kept: [] };
    } finally {
      clearTimeout(timer);
    }
  }));

  const asked = settled.filter((s) => s.report.status !== "skipped");
  if (asked.length > 0 && asked.every((s) => s.report.status === "error")) {
    const first = failures[0];
    if (first instanceof StockSourceError || first instanceof DomainError) throw first;
    throw new StockSourceError(requested[0]!, 0, String((first as Error)?.message ?? first));
  }
  const candidates = interleave(settled.map((s) => s.kept), limit);
  return {
    query,
    kind: input.kind,
    license: input.license,
    orientation: input.orientation,
    limit,
    count: candidates.length,
    sources: settled.map((s) => s.report),
    notes,
    candidates,
  };
}
