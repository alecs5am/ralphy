// Screenshot-number parsers (#558). Platform analytics screens print numbers
// the way humans read them — "12.3K", "1,234", "45.2%", "0:12", "12h:3m:4s" —
// and an agent transcribing a screenshot copies them verbatim. These pure
// helpers turn those strings into canonical numbers and FAIL LOUDLY on the
// readings that are genuinely ambiguous, instead of guessing.
//
// Rules (documented in .agents/skills/evaluator/references/analytics-screenshots.md):
//   • Counts are whole numbers. Without a K/M/B suffix, "," "." " " "'" and
//     "_" are thousands separators only when every group after the first has
//     exactly three digits ("1,234,567", "1.234", "12 345"). Anything else that
//     is not a whole number ("12.5") is rejected: either the suffix was dropped
//     or the field is wrong.
//   • With a suffix, one "." or "," followed by 1-2 digits is the decimal
//     separator ("12.3K" = 12300, "1,2M" = 1200000). The platform rounded, so
//     the result is flagged approximate.
//   • Percentages are 0-100 numbers or strings with "%". A bare number at or
//     below 1 is accepted as given but flagged: it is usually a ratio typed
//     into a percent field.
//   • Durations accept seconds ("12.4", "12.4s"), clock form ("0:12",
//     "1:02:03"), and unit tokens ("1m 5s", "12h:3m:4s", "3.5 min").

export class MetricParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetricParseError";
  }
}

export interface ParsedCount {
  value: number;
  /** True when the platform printed an abbreviated figure (K/M/B suffix). */
  approximate: boolean;
}

const SUFFIX: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };
// Regular, no-break, narrow no-break, and thin spaces plus apostrophe and underscore.
const GROUP_CHARS = /[\s   '_]/gu;

/** Parse a platform count ("12.3K", "1,234", 987) into a whole number. */
export function parseCountDetailed(input: unknown): ParsedCount {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) {
      throw new MetricParseError(`count must be a finite non-negative number (got ${input})`);
    }
    if (!Number.isInteger(input)) {
      throw new MetricParseError(
        `count must be a whole number (got ${input}); if the screen showed "${input}K" or "${input}M", pass the string with its suffix`,
      );
    }
    return { value: input, approximate: false };
  }
  if (typeof input !== "string") {
    throw new MetricParseError(`count must be a number or a string (got ${typeof input})`);
  }
  const raw = input.trim();
  if (!raw) throw new MetricParseError("count is empty");
  const compact = raw.replace(GROUP_CHARS, "");
  const suffixed = /^(\d+(?:[.,]\d{1,2})?)([kmb])$/iu.exec(compact);
  if (suffixed) {
    const base = Number(suffixed[1]!.replace(",", "."));
    const multiplier = SUFFIX[suffixed[2]!.toLowerCase()]!;
    return { value: Math.round(base * multiplier), approximate: true };
  }
  if (/^\d+$/u.test(compact)) return { value: Number(compact), approximate: false };
  // Thousands grouping with one consistent separator: 1,234 / 1.234.567.
  const grouped = /^\d{1,3}(?:([.,])\d{3})(?:\1\d{3})*$/u.exec(compact);
  if (grouped) return { value: Number(compact.replace(/[.,]/gu, "")), approximate: false };
  throw new MetricParseError(
    `cannot read "${raw}" as a whole count; write digits ("12345") or the platform's abbreviation ("12.3K")`,
  );
}

export function parseCount(input: unknown): number {
  return parseCountDetailed(input).value;
}

export interface ParsedPercent {
  value: number;
  /** True for a bare number at or below 1 — usually a ratio typed into a percent field. */
  looksLikeRatio: boolean;
}

/** Parse a percentage ("45.2%", "45,2 %", 45.2) into a 0-`max` number. */
export function parsePercentDetailed(input: unknown, max = 100): ParsedPercent {
  let value: number;
  let hadPercentSign = false;
  if (typeof input === "number") {
    value = input;
  } else if (typeof input === "string") {
    const raw = input.trim();
    hadPercentSign = raw.endsWith("%");
    const body = raw.replace(/%$/u, "").replace(GROUP_CHARS, "");
    if (!/^\d+(?:[.,]\d+)?$/u.test(body)) {
      throw new MetricParseError(`cannot read "${raw}" as a percentage`);
    }
    value = Number(body.replace(",", "."));
  } else {
    throw new MetricParseError(`percentage must be a number or a string (got ${typeof input})`);
  }
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new MetricParseError(`percentage must be from 0 through ${max} (got ${value})`);
  }
  return { value, looksLikeRatio: !hadPercentSign && value > 0 && value <= 1 };
}

export function parsePercent(input: unknown, max = 100): number {
  return parsePercentDetailed(input, max).value;
}

const UNIT_SECONDS: Record<string, number> = {
  h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600,
  m: 60, min: 60, mins: 60, minute: 60, minutes: 60,
  s: 1, sec: 1, secs: 1, second: 1, seconds: 1,
};

/** Parse a duration ("0:12", "12.4s", "1m 5s", "12h:3m:4s", 12.4) into seconds. */
export function parseSeconds(input: unknown): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) {
      throw new MetricParseError(`duration must be a finite non-negative number of seconds (got ${input})`);
    }
    return input;
  }
  if (typeof input !== "string") {
    throw new MetricParseError(`duration must be a number or a string (got ${typeof input})`);
  }
  const raw = input.trim().toLowerCase();
  if (!raw) throw new MetricParseError("duration is empty");
  if (/[a-z]/u.test(raw)) {
    const tokens = [...raw.matchAll(/(\d+(?:[.,]\d+)?)\s*([a-z]+)/gu)];
    const leftover = raw.replace(/(\d+(?:[.,]\d+)?)\s*([a-z]+)/gu, "").replace(/[\s:,]/gu, "");
    if (tokens.length === 0 || leftover) {
      throw new MetricParseError(`cannot read "${input}" as a duration`);
    }
    let total = 0;
    for (const [, amount, unit] of tokens) {
      const factor = UNIT_SECONDS[unit!];
      if (factor === undefined) throw new MetricParseError(`unknown duration unit "${unit}" in "${input}"`);
      total += Number(amount!.replace(",", ".")) * factor;
    }
    return round3(total);
  }
  if (raw.includes(":")) {
    const parts = raw.split(":");
    if (parts.length > 3 || parts.some((part) => !/^\d+(?:[.,]\d+)?$/u.test(part))) {
      throw new MetricParseError(`cannot read "${input}" as a clock duration`);
    }
    const numbers = parts.map((part) => Number(part.replace(",", ".")));
    for (const later of numbers.slice(1)) {
      if (later >= 60) throw new MetricParseError(`clock field out of range in "${input}"`);
    }
    return round3(numbers.reduce((total, part) => total * 60 + part, 0));
  }
  if (/^\d+(?:[.,]\d+)?$/u.test(raw)) return Number(raw.replace(",", "."));
  throw new MetricParseError(`cannot read "${input}" as a duration`);
}

/** Parse an ISO datetime, a YYYY-MM-DD date (UTC midnight), or epoch milliseconds. */
export function parseInstant(input: unknown): number {
  if (typeof input === "number") {
    if (!Number.isSafeInteger(input) || input < 0) {
      throw new MetricParseError(`timestamp must be epoch milliseconds (got ${input})`);
    }
    return input;
  }
  if (typeof input !== "string" || !input.trim()) {
    throw new MetricParseError("timestamp must be an ISO date or datetime");
  }
  const raw = input.trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/u.test(raw) ? Date.parse(`${raw}T00:00:00.000Z`) : Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new MetricParseError(`cannot read "${raw}" as a date`);
  return parsed;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
