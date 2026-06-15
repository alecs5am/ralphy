// Derive per-job diagnostic fields from a job's command.argv (#428 part A).
//
// `queue list --json` summaries used to show only the first 3 argv tokens,
// which hid the slot / model / prompt an agent needs to diagnose a batch.
// This pure parser pulls the common ralphy-generate flags out of argv so the
// list can surface them as first-class fields. No DB, no side effects.

const PROMPT_PREVIEW_MAX = 80;

export type JobArgvFields = {
  /** --slot value, or null. */
  slot: string | null;
  /** --model value, or null. */
  model: string | null;
  /** Count of `--ref` occurrences. */
  refCount: number;
  /** Truncated --prompt text (or `--prompt-file <path>` marker), or null. */
  promptPreview: string | null;
};

/**
 * Parse argv for the flags ralphy-generate jobs carry. Recognizes both
 * `--flag value` and `--flag=value` forms. Repeated `--ref` are counted.
 */
export function deriveJobArgvFields(argv: string[]): JobArgvFields {
  let slot: string | null = null;
  let model: string | null = null;
  let refCount = 0;
  let promptPreview: string | null = null;

  const valueOf = (i: number, token: string, name: string): string | null => {
    const eq = `${name}=`;
    if (token.startsWith(eq)) return token.slice(eq.length);
    if (token === name) return argv[i + 1] ?? null;
    return null;
  };

  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    const s = valueOf(i, t, "--slot");
    if (s !== null) { slot = s; continue; }
    const m = valueOf(i, t, "--model");
    if (m !== null) { model = m; continue; }
    if (t === "--ref" || t.startsWith("--ref=")) { refCount++; continue; }
    const pf = valueOf(i, t, "--prompt-file");
    if (pf !== null) { promptPreview = `[file] ${pf}`; continue; }
    const p = valueOf(i, t, "--prompt");
    if (p !== null) {
      promptPreview = p.length > PROMPT_PREVIEW_MAX ? p.slice(0, PROMPT_PREVIEW_MAX) + "…" : p;
      continue;
    }
  }

  return { slot, model, refCount, promptPreview };
}
