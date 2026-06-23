# Action Items — Audit 2026-05

Extracted from [`audit.md`](audit.md) Top-10 + scattered findings. Grouped by status.

## ✅ Done in this session

- [x] Moved both research reports into `notes/audit-2026-05/`
- [x] Fixed `package.json.description` (was `"My Remotion video"`, now real one-liner)
- [x] Added `repository` URL to `package.json` (was empty `{}`)
- [x] Verified npm-package state — `@alecs5am/ralphy` is yours, bare `ralphy` belongs to `kivlor` (different project)
- [x] **Added `LICENSE` (Apache 2.0)** + flipped `package.json.license` `UNLICENSED` → `Apache-2.0`. Unblocks corporate adoption.
- [x] **Deleted `dashboard/`** entirely (43 files, ~11.6k LoC). Removed `cli/commands/dashboard.ts` + import/registration in `cli/index.ts`. Removed `_dashboard:legacy` + `_dashboard:dev:legacy` scripts. Removed `docs-mintlify/reference/cli/dashboard.mdx`. Regenerated CLI surface docs.
- [x] **Remotion out of default `dependencies`** — moved 5 `@remotion/*` packages + `remotion` + `react` + `react-dom` + `tailwindcss` + `@remotion/eslint-config-flat` to `devDependencies`. Removed Remotion-only scripts (`dev: remotion studio`, `build: remotion bundle`, `upgrade: remotion upgrade`). In-tree dev + lint still work (devDeps installed), but the published binary path doesn't expose Remotion as a runtime requirement. Files left in place (`remotion.config.ts`, `src/videos/`, `src/lib/`, `src/showcase/`, `src/index.ts`) — dormant code, harmless without an actual `remotion render` invocation.
- [x] **Remotion fully removed** (2026-05-26, follow-up to the above). Deleted: `src/`, `remotion.config.ts`, `docs/playbooks/remotion.md`, `docs/playbooks/remotion/` (29 sub-docs), `.agents/skills/ralphy-remotion/`, `.agents/skills/remotion-to-hyperframes/`, `cli/commands/render.ts` Remotion-fallback branch, `--engine remotion` flag and its `cli-dryrun-coverage` test, `composition-props.json` scaffold in `template use`, 6 `templates/*/composition.md` Remotion code samples (rewritten as HyperFrames layer-stacks), 6 `roadmap/todo/` Remotion-research tasks (moot). Extracted: `Caption` shape into `cli/lib/captions/types.ts` (was `@remotion/captions`); `Bbox/FrameBboxes` into `cli/lib/smart-crop-types.ts` (was `src/lib/utils/smart-crop`). Replaced eslint config (was `@remotion/eslint-config-flat`) with project-specific lints (`lint:errors`, `lint:help-examples`, `lint:skills`, `lint:agents-md`, `lint:templates`, `cli:surface:check`) — ESLint dropped entirely since it was Remotion-only (`eslint src` on the now-deleted Remotion tree). `tsconfig.json` modernized + scoped to `cli/**`. Added separate `lint:typecheck` script (currently surfaces 5 **pre-existing** TS errors in `cli/lib/jobs/enqueue.ts`, `cli/lib/providers/media.ts`, `cli/lib/ui.ts`, `cli/commands/generate.ts` — flagged as future cleanup, NOT caused by Remotion removal). Net diff: ~447 files changed, ~48k LoC deleted.
- [x] All 450 unit tests pass. `bun run lint` (the new combined script) clean. `bunx tsc --noEmit -p .` surfaces 5 pre-existing errors in `cli/` (not regressions).

## 🟢 Safe (no decision needed) — recommended for next PR

Each item below is a clean win and unlikely to be controversial. Do these in a small PR.

- [ ] **Add LICENSE file.** Apache 2.0 recommended by audit (compatible with HyperFrames, common in OSS CLIs). One-file PR. *(Light decision — confirm Apache 2.0 vs MIT.)*
- [ ] **Add GitHub topics** to repo: `agent`, `mcp`, `cli`, `developer-tools`, `openrouter`, `elevenlabs`, `hyperframes` — free SEO.
- [ ] **Fix `BRAND_DESIGN.md` location** — move out of repo root to `landing/` or `docs/brand/`. Currently contributor sees it next to `MODELS.md` and thinks it's load-bearing.
- [ ] **De-duplicate skills directory.** `.agents/skills/` and `.claude/skills/` are out of sync risk. Pick one source + sync script (release skill mentions skills are versioned with repo, not the binary).

## 🟡 Decision required — bring to owner before touching

These are flagged in the audit as high-impact but each carries trade-offs.

### Naming & identity

- **`package.json.name === "ugc-cli"`** — used by `cli/lib/project-root.ts:17` as repo-root marker. Cannot blindly rename. Options:
  - (a) Keep as-is, document the dual-name reality (root = `ugc-cli`, published = `@alecs5am/ralphy`).
  - (b) Refactor `project-root.ts` to detect by a sentinel file (e.g. `.ralphy-root` or check for `cli/index.ts`), then rename root to `@alecs5am/ralphy-workspace` or similar.
  - **Owner decision:** is the dual-name causing real confusion or is it noise from the audit?

- **Rename `ralphy` → something else?** Audit flags SEO conflict (Ralph Lauren, Simpsons Ralph Wiggum, kivlor's `ralphy` npm package). Options:
  - (a) Stay. You already shipped under `ralphy` brand, landing is `ralphy.dev`, skills are `ralphy-*`.
  - (b) Rebrand to `ralpha` / `claphy` / `@ralphy-video/cli` before v1.0.
  - **Owner decision:** SEO penalty vs sunk brand investment. Recommend stay unless evidence of confusion.



## 🔵 Big bets (multi-week, separate planning)

Don't start without explicit scope alignment.

- **`ralphy mcp serve`** — Higgsfield shipped `mcp.higgsfield.ai/mcp` Apr 28, 2026. Must-have for v0.3.0 to stay in the agent-native narrative. Spec needed. ~1-2 weeks.
- **Surface `MODELS.md` as `ralphy.dev/models`** with auto-update from repo. Best SEO move available. ~1 week, mostly Mintlify config.
- **Provider / ComposerAdapter TS interfaces** as `@alecs5am/ralphy-core` npm package. Foundation for community connectors. ~2-3 weeks.
- **Public «Ralphy Quality Score» leaderboard** on `ralphy.dev/leaderboard` with vision-LLM auto-scoring. The aider-on-SWE-Bench move. ~3-4 weeks (vision pipeline + submit form + moderation).
- **Friday Ship rhythm** — public demo + post every Friday. Owner-time decision: 0.5 day/week minimum.
- **Genlog / Postmortem JSON Schema v1** published — unblocks community tooling.
- **Hero MP4 in README** — 30-second screencast. ~2 hours of work, huge ROI.
- **README rewrite to aider/OpenInterpreter schema** — see `audit.md` §Recommendations for the template.
- **AGENTS.md token bloat** — current ~45KB system prompt per turn. Split into thin router + lazy playbooks. Sized as 1-week refactor + careful Claude Code testing.

## 🟣 Audit findings I disagree with / want to push back on

Flagging for record so future-me doesn't blindly act on them:

- **"Rename `package.json.name` to bare `ralphy`"** — bare `ralphy` is **not yours on npm** (taken by `kivlor`). Audit didn't check. Use `@alecs5am/ralphy`, which is already correct in `npm/package.json`.
- **"The bun dependency cuts off the Python audience"** — for an end-user installing via brew/install.sh/npm, bun is invisible. The audit overstates this risk.
- **"AGENTS.md+CLAUDE.md+MODELS.md = 45KB per turn"** — true cost, but Claude Code caches system prompts across turns (5-min TTL). Real cost is one cache-fill per session, not per turn. Less urgent than audit frames it.
