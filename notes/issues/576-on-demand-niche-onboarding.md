# On-demand niche onboarding: topic -> creators -> niche report

> **Status:** in progress — 2026-10-28 (checkpoint committed in 9121e3df; fitness run interrupted; see "Resume point (2026-10-28)")
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** high
> **Category:** feature / trend-watch

## Context

The owner's core use case: "I decided to grow in the psychology niche" -> collect the accounts for that topic and analyze them. #556 builds a creator-first corpus with watchlists, seeds and a fixed two-level niche taxonomy (`docs/research/trend-corpus.md`, "Cohort taxonomy"), but it has no flow that starts from an arbitrary topic, and "psychology" is not even a top-level niche there (it would fall under `self-improvement` or `health`).

## What

`ralphy trends niche init "<topic>" [--lang en,ru] [--platform tiktok,youtube,instagram] [--target-creators 200]`, then `ralphy trends niche report <niche>`.

1. **Seed expansion.** From the topic, propose keyword, hashtag and sound seeds per language (one `callLLM()` call or the agent itself), plus sub-niches. For psychology: relationships and attachment, ADHD and neurodivergence, trauma and healing, anxiety, dark psychology and persuasion, therapist-led education, pop-psychology facts, self-help and habits. The agent shows the seed list; it is saved on the watchlist.
2. **Creator discovery, snowballed.** Seeds -> candidate creators (free sources first: TikTok Explore and sound pages, YouTube hashtag Shorts pages and channel search, Instagram Business Discovery by username), then expand through related creators: featured channels, suggested accounts, co-hashtags, stitch and duet mentions. Stop at the target count or when a round adds under 5% new creators.
3. **Relevance gate per creator.** Classify the creator's last 30 videos (titles, captions, free auto-subtitles): keep creators with at least 60% on-topic videos, store niche, sub-niche and confidence. Off-topic creators found through a broad hashtag are dropped, not scored.
4. **Coverage by size band.** Fill quotas across `nano`, `micro`, `mid`, `macro`, `mega` so the report can answer "what works for a small account", not only for stars.
5. **Open taxonomy.** A niche created by `niche init` is a first-class niche with its own sub-niches, not forced into the fixed list; the fixed list stays as the cross-niche default.
6. **Niche report.** Top outliers overall and per sub-niche and size band; winning formats and hook types with n and lift; posting cadence and video length of the creators who grow; sub-niche saturation (creator count) versus demand (median multiplier), as a gap table; entry formats for a new account; links to #557 digests for the top 20 references. Written as a Document and printable.

7. **Copyability ranking (owner rule).** A breakout on a small account is a better reference than a hit from a large one: the small creator has no audience to carry the video, so the format did the work. The report's default "what to copy" list ranks by a copyability score, not by raw views:
   - **creator-relative multiplier** from #556 (the base signal; it already lifts small-account breakouts);
   - **reach beyond the audience**: views / followers at snapshot time; a video far above its creator's follower count was distributed by the algorithm;
   - **size discount**: weight falls as the creator's size band rises (`nano` and `micro` highest, `mega` lowest), because a large account's views are partly audience-driven;
   - **replication**: a format or hook type that broke out for 2 or more unrelated small creators ranks above a single outlier (format, not luck); a creator whose breakout repeats on the same format counts as stronger evidence;
   - **noise floor**: a minimum absolute views threshold (default 50k, tunable per niche) so a 3x jump from 300 views is not a reference.
   Every ranked item shows the components, so the agent can explain why it picked a reference.

## Why it matters

A content plan "based on top performers" starts from a niche the owner names, often outside our taxonomy. Without a relevance gate the corpus fills with whoever used the hashtag; without size quotas it only describes megastars.

## Scope / acceptance

- `niche init` on "psychology" (EN) reaches at least 150 relevant creators and 4,000 videos on free sources, with wall time and blocks recorded in `docs/research/trend-corpus.md`.
- Relevance gate precision checked by hand on 50 random kept and 20 dropped creators (target 90% / 80%).
- `niche report psychology` produces every section above; sections with too little data say so (minimum-n rule as in #558).
- The default "what to copy" list is ranked by the copyability score; a test shows a `micro` creator's 20x breakout with 500k views outranks a `mega` creator's 1.5x video with 5M views, and a 3x jump below the noise floor is excluded.
- Tests for seed persistence, snowball stop rule, relevance threshold, size-band quotas, report shape; `bun run lint`, `bun test`, `cli:surface:check` pass.

## Notes

- Dataset design (niches, creator quotas, negative control group, enrichment tiers, gold set, filters): `docs/research/trend-dataset-spec.md`. Onboarding follows it; the four approved niches are psychology (EN + RU), AI tools / tech tips, personal finance, and one visual niche.

- Sequence after #556 (uses its tables, sources, circuit breaker and outlier score) and #557 (digests).
- Instagram Business Discovery (free, needs a Meta app and a professional account) returns views, likes and comments for other professional accounts per the #555 research; evaluate it here as the free Instagram path.

## Build decisions (2026-10-28)

- **Storage: migration 12.** `trend_niches` (prefix `tniche`; slug, topic, languages, platforms, taxonomy = sub-niches + relevance lexicon per language, settings, seed source) and `trend_niche_members` (WITHOUT ROWID on niche x creator: status `candidate | kept | dropped | undetermined`, group `main | negative | anomaly`, language, relevance, sampled / on-topic counts, sub-niche, gate method and reason, flags, evidence). Members are re-evaluated on every `niche init`, so they are mutable rows with `row_version`, not append-only history. Both tables travel with `workspace.export` (tested); the store verifier lists them.
- **Seeds.** Default: an agent-authored `--seeds-file` (free). `--llm-seeds` is one `callLLM()` call; without either, a deterministic topic fallback that says it is weak. Every seed is a watchlist row with the niche slug; expansion seeds (handles) are `related` rows on sources that `trends refresh` skips (`niche-tiktok-profile`, `niche-youtube-handle`). A second `niche init` for another language merges into the niche (languages, lexicons, sub-niche terms by slug); a re-run continues the snowball from the expansion seeds already tried.
- **Open taxonomy.** A kept creator without a niche takes the open niche slug as its creator-level niche, so cohort keys and percentile labels run per open niche; discovery never stamps an open niche (a broad hashtag also surfaces off-topic creators). `trends top --niche` accepts open niche slugs.
- **Free discovery reality.** YouTube keyword search, hashtag pages, and channel Shorts tabs carry the EN / RU niches. TikTok Explore follows the client IP (KR), so TikTok creators come from cross-platform handles: a new `tiktok-profile` source reads the logged-out profile page (rehydration JSON: secUid, followers, bio) because yt-dlp cannot list a plain `@handle`. The profile page's own video XHR returns an empty body logged out and is not used. A plain HTTP fetch of a profile hit a WAF interstitial on the second probe, so only the browser path exists and a page that never hydrates counts as a block. YouTube's featured-channels tab is gone ("This channel does not have a channels tab" on every channel probed) and TikTok suggested accounts need a login; the snowball uses channel-description handles, same-name handles, caption and bio `@mentions`, and on-topic co-hashtags instead. TikTok sound pages need sound ids, which listings and logged-out profile pages do not expose, so sounds are a seed kind only.
- **Relevance gate.** Rule-based on the newest 30 listed videos with a per-language lexicon (`core` 1, `support` 0.5, `negative` veto, `stem*` prefixes for inflected languages) and a script + function-word language guess. Hand check on the rule-only gate (psychology EN): kept 47 / 50 (94%), dropped 12 / 20 (60%): evocative therapist titles carry no lexicon term. Added a **profile-anchored keep**: a bio or name matching a `profile` term (professions, the topic) keeps a creator from 40% on-topic (`on-topic-profile`, `--profile-floor 0` disables). Re-check numbers are in the research doc. `--llm-relevance` (batched `callLLM()` for undetermined and near-threshold creators) is implemented and off by default; not run.
- **Quotas** use the spec's four bands (`<10k`, `10k-100k`, `100k-1M`, `1M+`, target / 4 each); small bands may exceed theirs; under-filled bands are listed first when the follower count is known before listing (TikTok profiles, Explore, sound pages; YouTube search entries carry none).
- **Negative control group** follows the spec rule with metrics only; the cohort comparison is projected views versus the platform x niche x size cohort median from the score pass. With one day of follower history it is selected from backfill and flagged `provisional`. YouTube creators cannot qualify (no dated videos), so the group stays far below 15-20% where the niche is YouTube-heavy.
- **Anomalies**: engagement-rate robust outliers or interactions above views; compilation / clip / repost names; 30%+ duplicated captions across creators (normalized caption keys). Perceptual frame hashing (the spec's repost filter) is not done.
- **Copyability** exactly as the issue lists it, with every component in the row; per-creator cap of 2 rows in the printed list (repeats still raise the score). Replication needs content-format / hook labels; with the LLM label pass off only rule pre-labels exist, so replication rarely fires.
- **Percentile label thresholds** per platform x niche (breakout p98, outlier p95 with z >= 2, strong p85; fixed 10x / 5x / 3x as floors; 200-video minimum, then platform-wide, then fixed). Overridable per score pass and per niche. Before / after shares on the #556 corpus are in the research doc.
- **Report** (`niche report`): JSON plus `--markdown <file>` and `--document` (a `research` Document `niche-report-<slug>[-<lang>]`, append-only revisions). Analysis window 90 days (the spec's backfill); minimum n 20 videos / 5 creators per claim. Captions and bios are not reproduced; public handles, URLs, and metrics only.
- **YouTube dating budget.** `--youtube-date-budget` (<= 150 per niche) dates Tier-1 candidates (one top undated video per kept channel by raw listing ratio, above the noise floor) through the watch page and stops on the first bot check. Dated candidates stay unscored by the #556 formula (their baselines are undated); the report lists them separately with a raw listing ratio, labeled as such.

## Not done here

- `docs/cli-surface.generated.md` regeneration (owner regenerates; `cli:surface:check` will flag the new verbs until then).
- LLM paths (`--llm-seeds`, `--llm-relevance`, the #556 `--llm` label pass) are covered by code paths only; none was run (no paid calls). Without the label pass, format replication and the format / hook tables are thin.
- Instagram Business Discovery: needs a Meta app and a professional account; not evaluated.
- YouTube stays unscored without `YOUTUBE_API_KEY`; the copyability ranking covers TikTok only.
- Follower-growth based rules (negative group, "creators who grow") need 14-60 days of daily snapshots; until then the report uses a breakout proxy and marks the negative group provisional.
- Perceptual-hash repost detection, the prospective cohort, Tier-1 enrichment beyond YouTube dating, and the gold set (dataset spec) belong to #577 / #578.

## Resume point (2026-10-28)

Stopped at the owner's request. Nothing committed. `bunx tsc --noEmit -p .` passes on the working tree.

**Finished and verified**

- Migration 12 (`trend_niches`, `trend_niche_members`), id prefix `tniche`, verifier and portable-export registration: `cli/lib/store/schema.ts`, `cli/lib/store/ids.ts`, `cli/lib/store/verify.ts`, `cli/lib/store/internal-portable-data.ts`, `cli/lib/store/trend-niches.ts`; schema-version tests bumped to 12.
- `ralphy trends niche init | report | list` (`cli/commands/trends.ts`), pure rules in `cli/lib/trends/niche.ts` (seeds file, gate with profile anchoring, quotas, analysis cap, snowball stop rule, negative group, anomalies, copyability), `cli/lib/trends/text.ts`, orchestration `cli/lib/trends/niche-onboard.ts` (sample-first gate, kept-only backfill, `--no-discover`, `--no-list`), report `cli/lib/trends/niche-report.ts`, TikTok profile source and YouTube watch-page dating in `cli/lib/trends/sources/{tiktok,youtube,types}.ts`.
- Percentile label thresholds (`cli/lib/trends/thresholds.ts`, wired into `scorePass` in `cli/lib/trends/ingest.ts`); `trends score --label-mode/--label-percentiles/--label-min-sample`. Before / after on the #556 corpus: breakout 9.5% -> 2.0%, outlier 2.0% -> 2.4%, strong 10.7% -> 10.6%.
- Breaker classification: age-restricted videos and private accounts are per-creator failures, not source blocks (`cli/lib/trends/breaker.ts`).
- Tests pass: `tests/unit/trends-niche.test.ts`, `tests/integration/trends-niche.test.ts`, existing trends unit / integration tests, output-pretty fuzz + snapshot, domain-db, closed-wal-startup, domain-verify, portable-workspace. Gates pass: `lint:out-coverage`, `lint:store-boundary`, `lint:no-legacy-state`; Cyrillic gate empty on all changed files.
- Relevance precision (psychology EN, by hand): rule-only 47/50 kept, 12/20 dropped; with profile anchoring 49/50, 18/20.
- `docs/research/niche-report-psychology-en.md` (generated report + preface), `docs/research/trend-corpus.md` (method, percentile labels, runs table), `docs/domain-store.md` (migration 12).

**Per-niche KEPT creators (in-sample) and their videos** (scratch corpus `.ralphy/cache/trend-corpus-run/`, Workspace `ws_0e31c56b-bcb3-47bd-8b1c-377be28cec40`)

| Niche | Lang | Kept | Videos (dated) | Out of sample |
|---|---|---|---|---|
| psychology | en | 417 | 20,892 (2,737) | 145 |
| psychology | ru | 383 | 18,832 (1,595) | 0 |
| ai-tools-tech-tips | en | 400 | 17,836 (420) | 144 |
| personal-finance | en | 367 | 17,627 (216) | 0 |
| fitness | en | 285 (gated, not yet capped / scored / grouped) | 7,654 | n/a |
| **Total** | | **1,852** | **82,841** | |

Total stored rows in the scratch store (including dropped, out-of-sample, and the #556 corpus): 231,346 videos, 7,585 creators, 231,786 metric snapshots, 425,727 cohort labels. Most of the excess comes from candidates listed in full before the sample-first gate existed.

**Partially done**

- Fitness: round 0 discovery, sample listing, and gating ran; the process was stopped before label / score / analysis cap / groups and before any snowball round. 3 candidates unlisted.
- `docs/research/trend-corpus.md`, "Niche onboarding runs (#576)": the fitness row still holds `FITNESS_*` placeholders; the finance note about the TikTok trip is not written yet.
- Watch-page dating: psychology EN 112 of 150 calls used, RU 54 dated; AI tools and finance not dated (watch source was in cooldown).

**Pending runs (exact commands, from the repository root)**

```sh
R=.ralphy/cache/trend-corpus-run; WS=ws_0e31c56b-bcb3-47bd-8b1c-377be28cec40
# Finish fitness without new discovery: list the 3 pending, backfill kept, cap, score, group.
bun run cli/index.ts --root $R --workspace $WS --json trends niche init fitness --lang en --seeds-file $R/seeds/fitness-en.json --target-creators 300 --no-discover --sample-listing 12 --youtube-date-budget 100
# Optional YouTube dating for AI tools and finance (stored members only, <= 150 calls per niche).
bun run cli/index.ts --root $R --workspace $WS --json trends niche init "AI tools / tech tips" --lang en --seeds-file $R/seeds/ai-tools-en.json --no-discover --no-list --youtube-date-budget 150
bun run cli/index.ts --root $R --workspace $WS --json trends niche init "personal finance" --lang en --seeds-file $R/seeds/personal-finance-en.json --no-discover --no-list --youtube-date-budget 150
# Regenerate the psychology EN report after any rescore.
bun run cli/index.ts --root $R --workspace $WS --json trends niche report psychology --lang en --markdown docs/research/niche-report-psychology-en.md
```

(Regenerating the report overwrites the hand-written preface in `docs/research/niche-report-psychology-en.md`; keep the preface block.)

**Not run**

- Full `bun run test` after the last edits (an earlier full run had 15 failures, all in areas other agents were editing: image / ffmpeg CLI tests, `models show`, legacy-layout / workspace-context tests).
- `bun run lint` as a whole, `cli:surface:check` (fails until the owner regenerates `docs/cli-surface.generated.md`), `lint:errors` (no new codes).
- Any LLM path (`--llm-seeds`, `--llm-relevance`, the label pass); Instagram Business Discovery.

**Side effect to know.** SCHEMA_VERSION 12 lives in the shared working tree, so any `ralphy` command run in this checkout migrates its store: the real `.ralphy/ralphy.db` is already at version 12 (additive tables; automatic backup `.ralphy/backups/ralphy-schema-11-*.db`).
