# 02 — Prompts & Templates — Open Questions & Decisions

## Open questions

### Q-01: Free-prose vs structured-only scenes — what's the input shape from the scenarist? → D-01

### Q-02: Should `--cref / --sref / --pref` be additive on top of `--ref` or strictly replace it? → D-02

### Q-03: Template yaml schema versioning → D-03

### Q-04: Naming audit — full creator-archetype rename or selective? → D-05

### Q-05: Gesture vocabulary — finite enum or open list? → D-06

### Q-06: Where does the cookbook live — repo or extracted package? → D-07

### Q-07: Landing gallery — static at build time or dynamic at runtime? → D-04

---

## Decision log

### D-07: Cookbook stays in `docs/prompts/`; build-time JSON export for the agent (2026-05-20)
**Was:** Q-06
**Decision:** The prompt cookbook (image / video / voice / music modes) stays in `docs/prompts/<kind>/` as markdown — human-readable, GitHub-browsable, edit-in-PR. A build step (`bun run cookbook:build`) regenerates `cli/lib/cookbook.json` from the markdown so the agent can read the cookbook without parsing markdown at runtime. No extraction to a separate npm package (`@ralphy/cookbook`) yet — reopen if external consumers (other UGC tools, the wiki) start needing to import it.
**Why:** A separate package adds maintenance overhead (version bumps, publish flow, docs in two places) for a problem we don't have — the cookbook lives in this repo and ships with this binary. Plain markdown + build-time JSON is the cheapest path that keeps drift-resistance (the markdown is the canonical source, the JSON is rebuilt) and works for both human editors and the agent runtime.
**Consequences:**
- `02.03.04` (cookbook exported as agent-readable JSON) → stays as `v1.0: stretch`. Implementation: a small script under `scripts/build-cookbook.ts` reads `docs/prompts/**/*.md`, extracts frontmatter + sections, writes `cli/lib/cookbook.json`. Gen-time agent reads the JSON.
- CI gate: regenerate `cookbook.json` and diff against committed; fail PR if stale (mirrors `07.03.02` for CLI reference).
- Cross-link: prompt-adapter work in `02.01.x` consumes `cookbook.json` directly.

### D-06: Gesture vocabulary is a finite enum + free-text `notes` (2026-05-20)
**Was:** Q-05
**Decision:** `Scene.gesture` is a finite enum (10-12 named gestures: `nod`, `head-shake`, `point-camera`, `palm-open`, `shrug`, `arms-cross`, `lean-in`, `pause-still`, `raise-eyebrow`, `wave`, etc. — final list lives in `cli/lib/schemas/scene.ts`). Niche / one-off gesture intent goes into the per-scene `notes` field (per [D-01](#decision-log)). Adapter ignores unknown enum values rather than failing.
**Why:** A pure enum (Option A) blocks niche intent until someone files a PR; a fully open string (Option B) is brittle — the adapter has to interpret arbitrary text. The hybrid mirrors D-01's "struct + notes" shape and reuses the same `notes` field, so there's only one escape hatch in the schema, not two.
**Consequences:**
- `02.04.03` (gesture vocabulary committed): list 10-12 named gestures with one-line semantic definitions. PRs to extend are welcome but not blocking; nuance stays in `notes`.
- Adapter behavior: enum value → translates to the model's gesture/pose vocabulary; missing enum → adapter omits the gesture directive and lets the `notes` text shape the prompt.

### D-05: Archetypal slugs primary; creator names allowed only as documentation prose, never in slugs (2026-05-20)
**Was:** Q-04
**Decision:** Template slugs use archetypal language (`deadpan-monologue-pov`, `frame-break-meta-hook`, `meme-header-tiktok-format`, `caught-on-tv-broadcast-realism`) — no real-creator names in slugs. Inside a template's `README.md` / `composition.md`, the **prose** may reference real creators as descriptive context ("emulates the bright pastel high-key commercial register popularized by Old Spice's 2010s campaigns") but the slug, file paths, and CLI surface (`ralphy template use <slug>`) never carry a real person's or brand's name.
**Why:** Real names in slugs read better short-term (Option B / C) but invite takedown / dilution risk and tie the template's identity to a third party's brand. Archetypal slugs (Option A) describe what the template *does* and survive the inevitable churn in creator popularity. The "Hormozi-talking-head" pattern is captured fully by `deadpan-monologue-pov` + prose context — no creator name needed in the slug itself.
**Consequences:**
- `02.06.02` (creator-archetype rename audit) → reframed: audit existing slugs for any embedded real names; rename to archetypal equivalents; keep the creator reference as a one-line prose note inside the template's README.
- New templates may NOT introduce a real-creator slug — lint rule in `02.06.x` enforces.
- The Top-20 (`templates/TOP.md`) entries get a one-line "inspired by" footnote where relevant, never in the slug.

### D-04: Landing template gallery = existing showcase marquee; no separate gallery route in v1.0 (2026-05-20)
**Was:** Q-07
**Decision:** No standalone `/templates` route on the landing for v1.0. The existing 3-col scrolling showcase marquee on the landing hero (commit `2e61cbb`, 11 rendered Ralphy outputs) is the canonical "browse what Ralphy makes" surface. The data behind the marquee is hand-curated and edited in `landing/lib/data.tsx` — no `generateStaticParams` over `templates/*/template.yaml` is needed because the showcase is selecting *best work*, not enumerating *every template*. Testers who want to enumerate use `ralphy template list -p` (CLI surface) or `templates/CATEGORIES.md` (GitHub surface).
**Why:** A separate gallery duplicated the showcase content with worse curation (any-template-with-a-render dilutes the punch of the hero) and burned engineering time on `02.07.01` / `02.07.02` that doesn't move the tester-onboarding needle (per `07-D-02` the showcase already serves as the hero demo). When the catalog grows past what hand curation can handle, this question reopens.
**Consequences:**
- `02.07.01` (gallery page route) → cancelled, `[x] (cancelled — D-04)`, `v1.0: no`. Reopen as `02.09.04` (post-launch) when catalog growth demands it.
- `02.07.02` (per-template detail page) → cancelled — same rationale.
- `templates/CATEGORIES.md` + `templates/TOP.md` remain the GitHub-surface enumeration; the CLI surface (`ralphy template list / suggest / show`) is the agent-side enumeration. Both already work.
- README links to the landing showcase + to `templates/CATEGORIES.md` for the full list.

### D-03: `template.yaml` schemas carry an explicit `version: <n>` (2026-05-20)
**Was:** Q-03
**Decision:** Every `template.yaml` declares `version: 1` (v1.0 baseline). The loader matches the version field against its supported set; unknown versions error with `E_TEMPLATE_VERSION_UNSUPPORTED` + a hint pointing at upgrade docs. When the schema breaks (v2), the loader keeps a v1 reader for backwards compat for at least one major release cycle. Older templates parse with the old reader; newer templates parse with the new one.
**Why:** Forever-additive (Option B) sounds simple but blocks any breaking schema change forever — there will be one eventually (e.g., when `scenes[]` gains a required field). Permissive loader (Option C) hides incompatibility behind warnings users ignore. Explicit version is the only honest answer.
**Consequences:**
- `02.05.01` (`template.yaml` schema) acceptance: every example carries `version: 1` at the top; loader rejects missing/unknown version with the error code above.
- `02.05.04` (migration: every template has `template.yaml`) acceptance also adds `version: 1`.
- Aligns with `01-D-07` (error codes append-only) — `E_TEMPLATE_VERSION_UNSUPPORTED` becomes a stable code from day one.

### D-02: Keep `--ref` as the v1.0 primary; `--cref / --sref / --pref` ship later alongside prompt-adapter work (2026-05-20)
**Was:** Q-02
**Decision:** v1.0 keeps the existing `--ref` (single flat list) as the canonical user-facing reference flag. The 3-slot grammar (`--cref` character / `--sref` style / `--pref` product) does NOT land in v1.0 as exposed CLI flags. The provider layer (`cli/lib/providers/media.ts`) MAY internally split refs into role-specific channels per model (Midjourney v7 cref/sref, Runway Gen-4 subjectReference[]/styleReference[]) when that buys quality — but that's a provider-internal optimization, not a user-facing API change. The 3-slot CLI surface ships in `02.07.x` (post-launch) alongside the prompt-adapter work in `02.01.x`, by which point the provider integrations will actually need the role separation.
**Why:** Three slots solve a real problem — image/video models drift when a single ref has to serve as both "lock this person's face" and "match this lighting" simultaneously. But for the v0.2 tester-onboarding flow, the single `--ref` already works (see memory `[[feedback_super_original_refs]]` — locking product + model master shots via `--ref` is the current discipline) and adding three new flags now costs CLI surface complexity without solving a tester-visible problem. The right time to add `--cref/--sref/--pref` is when the provider adapters (`02.01.x`) need them to route into model-specific API slots.
**Consequences:**
- `02.02.01` (CLI flags `--cref/--sref/--pref`) → flipped to `v1.0: no`, moved into the post-launch milestone alongside `02.01.x` prompt-adapter work.
- `02.02.02` (provider layer routes refs to right model slot) → kept as `v1.0: stretch` — the internal routing can still land if adapters need it.
- `02.02.03` ("Super-original" master shots auto-passed) → stays `v1.0: yes`; the existing `--ref` is sufficient to pass the auto-locked masters per scene gen.
- Documentation: README + Mintlify quickstart show only `--ref` in v1.0; the 3-slot flag set is a future-doc topic.

### D-01: Scenarist outputs structured `Scene[]` + per-scene `notes` free-text field (2026-05-20)
**Was:** Q-01
**Decision:** Hybrid. Scenarist's LLM call uses a Zod schema (`response_format`) that returns `scenes: Scene[]` where `Scene = { id, role: "hook"|"body"|"cta", vo_text, camera, gesture?, broll?, target_duration_s, notes?: string }`. The `notes` field is a free-text catch-all for nuance the schema doesn't capture (one-off director intent, vibe notes the art-director should respect). The art-director reads both — struct fields drive deterministic prompt construction; `notes` feeds into the prose layer of model-specific prompts.
**Why:** Structured-only (Option A) is the cleanest contract but loses the LLM's ability to express "this scene needs a slightly hesitant pause before the punchline" — that doesn't fit any enum. Free-text-then-parse (Option B) is the most fragile mode and we've already gotten burned by it. Hybrid keeps the struct's determinism for the 95% case and provides a controlled escape hatch for the 5% the schema misses.
**Consequences:**
- `02.04.01` (scenario schema): defines `Scene` with the fields above + `notes?: string`.
- `02.04.02` (scenarist playbook emits the new shape): `docs/playbooks/scenarist.md` is updated to instruct the scenarist LLM to populate `notes` only when the schema can't express the intent — not as a dumping ground.
- `02.04.03` (gesture vocabulary): pairs naturally with this — finite enum for `gesture`, free-text `notes` for niche moves.
- Provider layer reads `notes` as a final-paragraph "director intent" string appended to the model-specific prompt body, downweighted but not ignored.
