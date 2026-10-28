// Per-source circuit breaker and request budget (#556).
//
// The corpus never fights bot defense: the first bot check, CAPTCHA, login
// wall, rate limit, or forbidden response trips the breaker for that source
// and the run stops calling it. An empty body trips it after three in a row
// (one empty listing is usually a private or empty account, a streak is a
// soft block — the TikTok hashtag endpoint answers HTTP 200 with an empty
// body logged out). No proxies, browser cookies, or CAPTCHA solving.

export type ProbeKind = "ok" | "empty" | "failed" | "blocked";

export interface ProbeOutcome {
  kind: ProbeKind;
  /** Short machine reason: captcha, bot-check, login-wall, rate-limit, forbidden, empty-body, ... */
  reason?: string;
  /** First relevant diagnostic line (trimmed). */
  detail?: string;
}

const BLOCK_PATTERNS: Array<[RegExp, string]> = [
  [/captcha|verify (that )?you are (a )?human|slide to verify|security check|puzzle/i, "captcha"],
  [/sign in to confirm (that )?you('| a)?re not a bot|not a bot|confirm you are not a robot|unusual traffic/i, "bot-check"],
  [/HTTP Error 429|Too Many Requests|rate.?limit/i, "rate-limit"],
  [/HTTP Error 403|403 Forbidden|Access Denied/i, "forbidden"],
  [/login required|log ?in to (view|continue|see)|requires? (a )?log ?in|use --cookies|cookies (are )?(needed|required)|Unauthorized logged out|account to continue/i, "login-wall"],
];

const CREATOR_FAILURE_PATTERNS: RegExp[] = [
  /Unable to extract secondary user ID/i,
  /account is (either )?private/i,
  /This account is private/i,
  /does not exist|not found|404/i,
  /no (videos|video formats) found/i,
  /This channel does not have a shorts tab|does not have a .* tab/i,
  /Unable to extract (user|channel)/i,
];

/**
 * An age gate is a property of one video, not bot defense: yt-dlp's message
 * mentions cookies, so without this check it would read as a login wall and
 * trip the whole source (#576: one age-restricted Short stopped watch-page
 * dating after 27 calls). The video is skipped; nothing is bypassed.
 */
const AGE_GATE = /confirm your age|age[- ]restricted|inappropriate for some users/i;
/** A private account (yt-dlp also suggests cookies here) is the creator's state, not a login wall. */
const PRIVATE_ACCOUNT = /account is (likely )?(either )?private|all of their videos are private|This account is private/i;

/** Classify a yt-dlp (or page capture) result by its diagnostics and entry count. */
export function classifyProbe(input: { code: number; stderr: string; entries: number; timedOut?: boolean }): ProbeOutcome {
  const lines = input.stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const errorLine = lines.find((line) => /^ERROR\b/.test(line)) ?? lines.at(-1) ?? "";
  const ageGate = lines.find((line) => AGE_GATE.test(line));
  if (ageGate && input.entries === 0) return { kind: "failed", reason: "age-restricted", detail: ageGate.slice(0, 240) };
  const privateAccount = lines.find((line) => PRIVATE_ACCOUNT.test(line));
  if (privateAccount && input.entries === 0) return { kind: "failed", reason: "creator", detail: privateAccount.slice(0, 240) };
  for (const [pattern, reason] of BLOCK_PATTERNS) {
    const hit = lines.find((line) => pattern.test(line));
    if (hit) return { kind: "blocked", reason, detail: hit.slice(0, 240) };
  }
  if (input.entries > 0) return { kind: "ok" };
  if (input.timedOut) return { kind: "failed", reason: "timeout", detail: "listing timed out" };
  if (CREATOR_FAILURE_PATTERNS.some((pattern) => pattern.test(input.stderr))) {
    return { kind: "failed", reason: "creator", detail: errorLine.slice(0, 240) };
  }
  if (input.code === 0) return { kind: "empty", reason: "empty-body" };
  return { kind: "failed", reason: "error", detail: errorLine.slice(0, 240) };
}

export interface BreakerState {
  source: string;
  state: "closed" | "tripped" | "budget-exhausted";
  reason: string | null;
  detail: string | null;
  trippedAt: number | null;
  requests: number;
  consecutiveEmpty: number;
  blocks: number;
}

export const EMPTY_STREAK_TO_TRIP = 3;

export class CircuitBreaker {
  readonly source: string;
  private readonly budget: number;
  private readonly clock: () => number;
  private stateValue: BreakerState;

  constructor(source: string, options: { budget: number; clock?: () => number }) {
    this.source = source;
    this.budget = Math.max(0, Math.floor(options.budget));
    this.clock = options.clock ?? Date.now;
    this.stateValue = {
      source,
      state: "closed",
      reason: null,
      detail: null,
      trippedAt: null,
      requests: 0,
      consecutiveEmpty: 0,
      blocks: 0,
    };
  }

  /** True when another request may be sent; counts it against the budget. */
  acquire(): boolean {
    if (this.stateValue.state !== "closed") return false;
    if (this.stateValue.requests >= this.budget) {
      this.stateValue.state = "budget-exhausted";
      this.stateValue.reason = "request-budget";
      return false;
    }
    this.stateValue.requests += 1;
    return true;
  }

  get open(): boolean {
    return this.stateValue.state === "closed";
  }

  get tripped(): boolean {
    return this.stateValue.state === "tripped";
  }

  record(outcome: ProbeOutcome): void {
    if (outcome.kind === "blocked") {
      this.stateValue.blocks += 1;
      this.trip(outcome.reason ?? "blocked", outcome.detail ?? null);
      return;
    }
    if (outcome.kind === "empty") {
      this.stateValue.consecutiveEmpty += 1;
      if (this.stateValue.consecutiveEmpty >= EMPTY_STREAK_TO_TRIP) this.trip("empty-body", `${this.stateValue.consecutiveEmpty} empty responses in a row`);
      return;
    }
    if (outcome.kind === "ok") this.stateValue.consecutiveEmpty = 0;
  }

  trip(reason: string, detail: string | null): void {
    if (this.stateValue.state === "tripped") return;
    this.stateValue.state = "tripped";
    this.stateValue.reason = reason;
    this.stateValue.detail = detail;
    this.stateValue.trippedAt = this.clock();
  }

  snapshot(): BreakerState {
    return { ...this.stateValue };
  }
}

/** A tripped breaker holds its source closed for this long before the next run may try again. */
export const BREAKER_COOLDOWN_MS = 60 * 60 * 1000;

/** The most recent trip for a source still inside the cooldown, from stored run responses. */
export function openTrip(
  runs: ReadonlyArray<{ source: string | null; response: unknown }>,
  source: string,
  now: number,
  cooldownMs = BREAKER_COOLDOWN_MS,
): { reason: string; trippedAt: number; retryAfter: number } | null {
  for (const run of runs) {
    if (run.source !== source) continue;
    const breaker = (run.response as { breaker?: Partial<BreakerState> } | null)?.breaker;
    if (!breaker || typeof breaker !== "object") continue;
    if (breaker.state === "tripped" && typeof breaker.trippedAt === "number") {
      return breaker.trippedAt + cooldownMs > now
        ? { reason: String(breaker.reason ?? "blocked"), trippedAt: breaker.trippedAt, retryAfter: breaker.trippedAt + cooldownMs }
        : null;
    }
    // The newest run for this source decides.
    return null;
  }
  return null;
}
