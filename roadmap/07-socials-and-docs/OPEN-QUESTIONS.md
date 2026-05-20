# 07 — Socials & Docs — Open Questions & Decisions

## Open questions

### Q-01: Mintlify or self-hosted docs? → D-01

### Q-02: Demo video — screencast or rendered Ralphy output? → D-02

### Q-03: GitHub Discussions vs Discord → D-05

### Q-04: Auto-generated reference — full or summarized? → D-03

### Q-05: README banner — hand-designed or Ralphy-generated? → D-04

### Q-06: Press / launch — silent ship or coordinated? → D-06

---

## Decision log

### D-06: Soft launch to 5 testers; coordinated HN + X launch follows (2026-05-20)
**Was:** Q-06
**Decision:** Two-stage launch. Stage 1 — soft launch to a hand-picked ~5 testers (closest to the target persona: AI-savvy dev who already plays with UGC video). They get a private brief, install the release tag, file feedback in the GitHub Discussions (per D-05) and a private Loom-style follow-up. Stage 2 — once the obvious sharp edges are filed off (~2 weeks later), a coordinated HN post + X thread with screenshots, the showcase marquee, and the install one-liner. v1.0 ship can happen during stage 1; the coordinated launch is a separate stage that doesn't gate the release tag.
**Why:** A silent ship (Option A) wastes the one-shot attention the launch gets; an unprepared HN coordinated launch (Option B) lights a fire under sharp edges we already know about (installs that "feel weird", first-render UX gaps). Soft launch buys us a feedback loop while still letting us run a real launch later.
**Consequences:**
- Stage 1 needs: a one-page private brief in `docs/tester-onboarding.md` (path: install → setup → first project → file feedback), a Discussions "Tester feedback" category seeded with 3-5 starter prompts, and the README's "5 things to try first" block (`07.05.03`) treated as the canonical tester-path.
- Stage 2 needs: a HN-friendly title line, a 280-char X thread opener, and 5 screenshots ready in `docs/branding/launch/`. Tracked under a new `07.10.05` (post-launch) task.
- The v1.0 ship-criteria in roadmap `README.md` are unchanged — they gate the release tag, not the coordinated launch.
- The coordinated launch waits for D-02's screencast (`07.10.04`) if it's ready, but doesn't block on it.

### D-05: GitHub Discussions in v1.0; Discord deferred (2026-05-20)
**Was:** Q-03
**Decision:** v1.0 ships with GitHub Discussions as the single community + feedback channel. Discord is post-launch (`07.08.03` stays as `v1.0: no`). README and Mintlify quickstart link Discussions prominently from the install / "5 things to try" block.
**Why:** Discussions is built into GitHub, searchable, low-overhead, and the natural home for the target tester audience (AI-savvy devs who already live in GitHub). Discord adds a moderator burden + a non-indexable surface that we don't have the bandwidth to maintain alongside docs work. Soft-launch feedback (D-06) lands in Discussions categories that are already structured for it.
**Consequences:**
- `07.08.01` (Discussions enabled): seed 4 categories — `Announcements`, `Q&A`, `Show & Tell` (template gallery feedback), `Tester feedback`.
- `07.08.02` (README + docs link prominently): adds the Discussions link to README under "Where to get help" + Mintlify quickstart sidebar.
- `07.08.03` Discord: kept as `v1.0: no` (stretch / post-launch); opens only when Discussions activity outgrows what GitHub renders comfortably.

### D-04: Keep the hand-designed README banner (2026-05-20)
**Was:** Q-05
**Decision:** README hero stays the hand-designed banner committed in `f62fc13`. No Ralphy-generated replacement for v1.0. Real Ralphy outputs are surfaced through the landing showcase marquee (see D-02), not the banner slot.
**Why:** README banner is a single fixed asset where consistent brand identity matters more than self-demo signal. A Ralphy-generated banner has too much variance — even one weak render under the org name on the GitHub repo page would tank first-impression credibility on a cold visitor.
**Consequences:**
- `07.05.01` README structure: hero = current banner (no edit needed beyond layout polish).
- `07.06.02` Logo + favicon variants stays on hand-designed assets in `docs/branding/`.
- A "made with Ralphy" image/video block elsewhere in the README is fine but optional — not required for v1.0.

### D-03: Auto-generated reference = summary on top + collapsible full block (2026-05-20)
**Was:** Q-04
**Decision:** Each verb's reference page on Mintlify shows a curated summary at top (verb signature + 3 most common flags + 1 worked example) and a collapsible "Full reference" block below that is auto-dumped from the verb's TypeScript flag definitions. Both surfaces share the same source (`cli/commands/<verb>.ts` flag metadata) — the summary picks 3 flags marked `commonInRef: true`, the full block lists all.
**Why:** A summary alone (Option B) drifts because curated docs always lag; a full dump (Option A) burns the page above the fold with noise. Source-derived collapsible block stays current automatically; the curated summary stays scannable; one source of truth keeps them aligned.
**Consequences:**
- `07.03.01` (`bun run docs:cli` regenerator) outputs both: top summary, bottom full block.
- `07.03.02` CI check verifies the full block matches the in-repo flag schema for every verb in `cli/commands/`.
- A small flag-annotation pass in `cli/commands/*.ts` tags 3 flags per verb as `commonInRef: true` (or the generator picks the first 3, falling back deterministically).

### D-02: Landing showcase marquee is the hero demo for v1.0; dedicated screencast post-launch (2026-05-20)
**Was:** Q-02
**Decision:** The existing 3-col scrolling showcase marquee on the landing (commit `2e61cbb`, 11 rendered Ralphy outputs) is the v1.0 hero demo. No dedicated 60s screencast is required for v1.0. The README links to the landing showcase instead of embedding a separate demo file.
**Why:** The showcase already delivers the "wow — Ralphy made all of these" beat, which is the highest-leverage thing the hero has to do. A separate 60s screencast adds a re-record loop every time the CLI surface drifts; the showcase content is reusable across landing + README + Mintlify quickstart. Defer the screencast until the front-stage verbs (notably `render`) are locked, so the recording survives release cycles.
**Consequences:**
- `07.05.02` README demo video: re-scoped to "README links to landing showcase + may embed a single rendered mp4 from `landing/public/showcase/` as a gif preview"; v1.0 doesn't require a recorded screencast. Full screencast moves to post-launch.
- Hero landing component stays on the marquee — no separate hero video slot needed for v1.0.
- A post-launch task tracks the 60s screencast once the CLI surface is frozen.

### D-01: Stay on Mintlify, permanently (2026-05-20)
**Was:** Q-01
**Decision:** `docs-mintlify/` is the canonical docs platform for v1.0 and beyond. Pay for the growth tier when traffic warrants it. No migration to Nextra / Docusaurus is planned.
**Why:** Mintlify is already re-skinned to match the landing visual language (commit `d8101dd`), the editorial workflow (MDX + frontmatter) is mature, and the surface area that would migrate (quickstart, concepts, cookbook, CLI reference) is small enough that vendor lock-in isn't a real cost. Migration burns calendar weeks for marginal payoff; staying lets us spend that budget on actual content (cookbook, reference auto-gen, template gallery).
**Consequences:**
- `07.02.x` and `07.03.x` task acceptance criteria reference Mintlify primitives (MDX components, `mint.json` nav config) without an abstraction layer.
- `07.06.01` (brand tokens) exports CSS variables + a Mintlify-compatible color block; no need for a platform-neutral exporter.
- Growth-tier subscription becomes a line item to revisit alongside the v1.0 launch budget (cross-link to category 09's distribution-cost decisions).
