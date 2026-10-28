// scripts/lib/session-report/shell.ts — #562
//
// Small, deterministic shell-command helpers used by both adapters and the
// classifiers: quote-aware segment splitting, heredoc stripping, file read /
// write extraction, and `ralphy <verb>` invocation extraction. These are
// heuristics over agent-issued commands, not a shell parser; they aim to be
// right for the common shapes agents actually emit.

import path from "node:path";

/** Remove heredoc bodies so their content is never mistaken for commands. */
export function stripHeredocs(cmd: string): string {
  const lines = cmd.split("\n");
  const out: string[] = [];
  let delimiter: string | null = null;
  for (const line of lines) {
    if (delimiter !== null) {
      if (line.trim() === delimiter) delimiter = null;
      continue;
    }
    out.push(line);
    const m = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(line);
    if (m) delimiter = m[2]!;
  }
  return out.join("\n");
}

/** Split on unquoted `&&`, `||`, `;`, `|`, `&` and newlines. */
export function splitSegments(cmd: string): string[] {
  const src = stripHeredocs(cmd);
  const segments: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quote) {
      cur += ch;
      if (ch === "\\" && quote === '"' && i + 1 < src.length) {
        cur += src[++i];
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "\\" && i + 1 < src.length) {
      cur += ch + src[++i];
      continue;
    }
    // `2>&1` and `>&2` are redirections, not separators.
    if (ch === "&" && (src[i - 1] === ">" || src[i + 1] === ">")) {
      cur += ch;
      continue;
    }
    if (ch === ";" || ch === "\n" || ch === "|" || ch === "&") {
      if (cur.trim()) segments.push(cur.trim());
      cur = "";
      if ((ch === "|" || ch === "&") && src[i + 1] === ch) i++;
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) segments.push(cur.trim());
  return segments;
}

/** Quote-aware whitespace tokenizer; surrounding quotes are removed. */
export function tokenize(segment: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let has = false;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i]!;
    if (quote) {
      if (ch === quote) {
        quote = null;
        continue;
      }
      if (ch === "\\" && quote === '"' && i + 1 < segment.length) {
        cur += segment[++i];
        continue;
      }
      cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      has = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (has || cur) tokens.push(cur);
      cur = "";
      has = false;
      continue;
    }
    cur += ch;
    has = true;
  }
  if (has || cur) tokens.push(cur);
  return tokens;
}

const PREFIX_WORDS = new Set(["do", "then", "else", "time", "command", "exec", "nohup", "env", "builtin", "!", "{"]);

/** Drop leading env assignments, control words, `timeout N`, `mise exec <tool> --`, and `(`. */
export function stripPrefix(tokens: string[]): string[] {
  let t = tokens.slice();
  for (;;) {
    if (t.length === 0) return t;
    const head = t[0]!;
    if (head.startsWith("(")) {
      const rest = head.slice(1);
      t = rest ? [rest, ...t.slice(1)] : t.slice(1);
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(head) || PREFIX_WORDS.has(head)) {
      t = t.slice(1);
      continue;
    }
    if (head === "timeout" || head === "gtimeout") {
      t = t.slice(1);
      while (t.length && (t[0]!.startsWith("-") || /^\d+[smh]?$/.test(t[0]!))) t = t.slice(1);
      continue;
    }
    if (head === "mise" && t[1] === "exec") {
      const dd = t.indexOf("--");
      t = dd === -1 ? t.slice(3) : t.slice(dd + 1);
      continue;
    }
    return t;
  }
}

export function resolvePath(p: string, cwd?: string): string {
  let clean = p.replace(/^file:\/\//, "");
  if (clean.startsWith("~/") || clean === "~") return path.posix.normalize(clean);
  if (!path.posix.isAbsolute(clean) && cwd) clean = path.posix.join(cwd.replace(/^file:\/\//, ""), clean);
  return path.posix.normalize(clean);
}

const READ_COMMANDS = new Set(["cat", "head", "tail", "bat", "nl", "less", "more", "sed"]);

function looksLikePath(tok: string): boolean {
  if (!tok || tok.startsWith("-") || tok.startsWith("$") || tok.includes("*")) return false;
  if (/^\d+(,\d+)?[pd]?$/.test(tok)) return false;
  if (/^[<>]/.test(tok)) return false;
  return tok.includes("/") || /\.[A-Za-z0-9]{1,8}$/.test(tok);
}

/** Track `cd <dir>` across segments so relative paths resolve against the right directory. */
function walkSegments(cmd: string, cwd: string | undefined, fn: (tokens: string[], segment: string, cwd: string | undefined) => void): void {
  let dir = cwd;
  for (const segment of splitSegments(cmd)) {
    const tokens = stripPrefix(tokenize(segment));
    if (tokens.length === 0) continue;
    if (tokens[0] === "cd" && tokens[1]) {
      dir = resolvePath(tokens[1], dir);
      continue;
    }
    fn(tokens, segment, dir);
  }
}

/** Files a shell command prints into the transcript (cat / sed -n / head / tail / bat / nl). */
export function extractReads(cmd: string, cwd?: string): string[] {
  const reads: string[] = [];
  walkSegments(cmd, cwd, (tokens, _segment, dir) => {
    const name = path.posix.basename(tokens[0]!);
    if (!READ_COMMANDS.has(name)) return;
    if (name === "sed" && (tokens.includes("-i") || !tokens.includes("-n"))) return;
    let args = tokens.slice(1);
    if (name === "head" || name === "tail") {
      const kept: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "-n" || args[i] === "-c") {
          i++;
          continue;
        }
        kept.push(args[i]!);
      }
      args = kept;
    }
    if (name === "sed") {
      const nonFlag = args.filter((a) => !a.startsWith("-"));
      args = tokens.includes("-e") ? nonFlag : nonFlag.slice(1);
    }
    for (const a of args) if (looksLikePath(a)) reads.push(resolvePath(a, dir));
  });
  return reads;
}

/**
 * Read window of a shell read as `offset:limit` (the Read tool's convention):
 * `sed -n 'a,bp'` → `a:(b-a+1)`, `head -n N` → `0:N`, `tail -n N` → `tail:N`,
 * a whole-file read → `0:all`.
 */
export function shellReadRange(cmd: string): string {
  const sed = /\bsed\s+-n\s+['"]?(\d+)(?:,(\d+|\$))?p/.exec(cmd);
  if (sed) {
    const a = Number(sed[1]);
    if (sed[2] === "$") return `${a}:all`;
    const b = sed[2] === undefined ? a : Number(sed[2]);
    return `${a}:${b - a + 1}`;
  }
  const head = /\bhead\s+(?:-n\s*|-)(\d+)/.exec(cmd);
  if (head) return `0:${head[1]}`;
  const tail = /\btail\s+(?:-n\s*|-)(\+?\d+)/.exec(cmd);
  if (tail) return `tail:${tail[1]}`;
  return "0:all";
}

/** Files a shell command writes via `>` / `>>`, `tee`, or `sed -i`. */
export function extractWrites(cmd: string, cwd?: string): string[] {
  const writes: string[] = [];
  walkSegments(cmd, cwd, (tokens, segment, dir) => {
    const re = /(?:^|[^0-9&<>])>{1,2}\s*([^\s;&|<>()'"]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(segment)) !== null) {
      const target = m[1]!;
      if (target.startsWith("&") || target.startsWith("/dev/")) continue;
      writes.push(resolvePath(target, dir));
    }
    const name = path.posix.basename(tokens[0]!);
    if (name === "tee") for (const a of tokens.slice(1)) if (!a.startsWith("-")) writes.push(resolvePath(a, dir));
    if (name === "sed" && tokens.includes("-i")) {
      const last = tokens[tokens.length - 1]!;
      if (looksLikePath(last)) writes.push(resolvePath(last, dir));
    }
  });
  return writes;
}

export interface RalphyInvocation {
  verb: string;
  /** Second token when it is a bare word (a subcommand, or a positional like a project id). */
  sub?: string;
  /** Positional (non-flag) arguments after the verb. */
  positional: string[];
  /** Flags as written (`--foo`, `-x`). */
  flags: string[];
}

function isRalphyEntry(tokens: string[]): number {
  // Returns the index of the verb token, or -1.
  const t0 = tokens[0] ?? "";
  if (/(^|\/)ralphy$/.test(t0)) return 1;
  if (t0 === "bunx" && /(^|\/)ralphy$/.test(tokens[1] ?? "")) return 2;
  if (t0 === "bun" || /(^|\/)bun$/.test(t0)) {
    let i = 1;
    if (tokens[i] === "run") i++;
    while (tokens[i]?.startsWith("-")) i++;
    const target = tokens[i] ?? "";
    if (target === "ralphy" || target === "ralph" || /(^|\/)cli\/index\.ts$/.test(target)) return i + 1;
  }
  return -1;
}

/** Global `ralphy` options that take a value (cli/index.ts). */
const GLOBAL_VALUE_FLAGS = new Set(["--cwd", "--root", "--workspace", "--project", "--session"]);

/** Every `ralphy <verb> ...` invocation in a command (direct, `bun run ralphy --`, or `bun cli/index.ts`). */
export function extractRalphyInvocations(cmd: string): RalphyInvocation[] {
  const found: RalphyInvocation[] = [];
  for (const segment of splitSegments(cmd)) {
    const tokens = stripPrefix(tokenize(segment));
    let i = isRalphyEntry(tokens);
    if (i < 0) continue;
    if (tokens[i] === "--") i++;
    const flags: string[] = [];
    let project: string | undefined;
    const takeFlag = (tok: string, next: string | undefined): number => {
      const [name, inline] = tok.split("=", 2) as [string, string | undefined];
      flags.push(name);
      if (!GLOBAL_VALUE_FLAGS.has(name) || inline !== undefined) {
        if (name === "--project" && inline) project = inline;
        return 1;
      }
      if (name === "--project" && next) project = next;
      return next === undefined ? 1 : 2;
    };
    while (tokens[i]?.startsWith("-")) i += takeFlag(tokens[i]!, tokens[i + 1]);
    const verb = tokens[i];
    if (!verb || !/^[a-z][a-z0-9:-]*$/.test(verb)) {
      found.push({ verb: "", positional: [], flags });
      continue;
    }
    const rest = tokens.slice(i + 1);
    const positional: string[] = [];
    for (let j = 0; j < rest.length; ) {
      const tok = rest[j]!;
      if (tok.startsWith("-")) {
        j += takeFlag(tok, rest[j + 1]);
        continue;
      }
      positional.push(tok);
      j++;
    }
    const firstRest = rest[0];
    const sub = firstRest && /^[a-z][a-z0-9-]*$/.test(firstRest) ? firstRest : undefined;
    if (project && verb === "render" && positional.length === 0) positional.push(project);
    found.push({ verb, sub, positional, flags });
  }
  return found;
}

/** True when a command is a loop or a fan-out, so its duration is not a single-call latency. */
export function isCompoundCommand(cmd: string): boolean {
  const src = stripHeredocs(cmd);
  return /\b(for|while|until|xargs|parallel)\b/.test(src) || /[^&>]&\s*($|\n|[a-z(])/.test(src);
}

export interface SkillPathInfo {
  slug: string;
  isSkillMd: boolean;
}

/** `<anything>/skills/<slug>/SKILL.md` and files under that directory. */
export function skillFromPath(p: string): SkillPathInfo | null {
  const m = /(?:^|\/)skills\/([A-Za-z0-9][A-Za-z0-9._-]*)\/(.+)$/.exec(p);
  if (!m) return null;
  return { slug: m[1]!.toLowerCase(), isSkillMd: m[2] === "SKILL.md" };
}

/** True when the command limits its own output (pipes into head / tail / wc, -n, --limit, ...). */
export function hasOutputLimiter(cmd: string): boolean {
  return /\|\s*(head|tail|wc|jq|rg|grep|cut|sort|uniq|awk|sed)\b|\s(-n\s*\d+|--limit|--max-count|-m\s*\d+|--max-columns)\b|>\s*\/dev\/null|\s(-c|--count|-l|--files-with-matches|-q|--quiet)\b/.test(
    cmd,
  );
}

/** Token-set similarity in [0, 1] (Dice coefficient) for near-identical retry detection. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const ta = new Set(a.split(/\s+/).filter(Boolean));
  const tb = new Set(b.split(/\s+/).filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}
