// Method on trial (#578): novelty by KL divergence. Behind the backtest
// `--methods kl-novelty` flag only; no default path uses it.
//
// A video's content tokens (hashtags, sound, format and hook labels) are
// compared with the niche's trailing token distribution Q (additive
// smoothing). Per video, novelty is the mean surprisal -ln Q(token) of its
// tokens minus the niche's mean surprisal, so 0 is a typical video and
// positive values mark unusual content. `klDivergence` compares two whole
// distributions (for example this week's niche tokens vs the trailing
// month) to measure how fast the niche's content mix moves.

export type Counts = ReadonlyMap<string, number>;

export function countTokens(lists: ReadonlyArray<readonly string[]>): Map<string, number> {
  const out = new Map<string, number>();
  for (const list of lists) for (const token of list) out.set(token, (out.get(token) ?? 0) + 1);
  return out;
}

/** KL(P || Q) in nats with additive smoothing `alpha` over the union vocabulary. */
export function klDivergence(p: Counts, q: Counts, alpha = 0.5): number {
  const vocabulary = new Set([...p.keys(), ...q.keys()]);
  const size = vocabulary.size;
  if (size === 0) return 0;
  const totalP = [...p.values()].reduce((sum, value) => sum + value, 0) + alpha * size;
  const totalQ = [...q.values()].reduce((sum, value) => sum + value, 0) + alpha * size;
  let kl = 0;
  for (const token of vocabulary) {
    const pp = ((p.get(token) ?? 0) + alpha) / totalP;
    const qq = ((q.get(token) ?? 0) + alpha) / totalQ;
    kl += pp * Math.log(pp / qq);
  }
  return kl;
}

/** Exact KL for probability vectors (test helper / closed form). */
export function klVectors(p: readonly number[], q: readonly number[]): number {
  let kl = 0;
  for (let i = 0; i < p.length; i += 1) if (p[i]! > 0) kl += p[i]! * Math.log(p[i]! / q[i]!);
  return kl;
}

export interface NoveltyModel {
  surprisal(token: string): number;
  /** Mean surprisal of a token list (null for an empty list). */
  meanSurprisal(tokens: readonly string[]): number | null;
  /** Mean over the background documents, the novelty zero point. */
  baseline: number;
}

/**
 * Background model from the trailing window's token lists. Unseen tokens get
 * the smoothed floor probability alpha / (total + alpha * (V + 1)).
 */
export function noveltyModel(background: ReadonlyArray<readonly string[]>, alpha = 0.5): NoveltyModel {
  const counts = countTokens(background);
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  const denominator = total + alpha * (counts.size + 1);
  const surprisal = (token: string) => -Math.log(((counts.get(token) ?? 0) + alpha) / denominator);
  const meanSurprisal = (tokens: readonly string[]) => (tokens.length === 0 ? null : tokens.reduce((sum, token) => sum + surprisal(token), 0) / tokens.length);
  const docs = background.map(meanSurprisal).filter((value): value is number => value !== null);
  const baseline = docs.length === 0 ? 0 : docs.reduce((sum, value) => sum + value, 0) / docs.length;
  return { surprisal, meanSurprisal, baseline };
}

export function novelty(model: NoveltyModel, tokens: readonly string[]): number | null {
  const value = model.meanSurprisal(tokens);
  return value === null ? null : value - model.baseline;
}
