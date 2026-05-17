# 02 — Prompts & Templates — Open Questions & Decisions

## Open questions

### Q-01: Free-prose vs structured-only scenes — what's the input shape from the scenarist?
**Context:** the scenarist could output (a) a free-text scene description that the art-director parses, or (b) the structured `Scene` object directly. (b) is more deterministic; (a) is more LLM-natural.
**Options:**
- A. Structured-only: scenarist's LLM call uses a Zod schema response_format. Determinism, harder for the model.
- B. Free-text first → adapter parses into struct. Looser, more brittle.
- C. Hybrid: model emits struct, but a `notes:` free-text field exists for things the schema doesn't cover.
**Blocking:** `02.04.02`.
**Owner:** user. Default lean: C.

### Q-02: Should `--cref / --sref / --pref` be additive on top of `--ref` or strictly replace it?
**Context:** legacy `--ref` is in scripts, blog posts, prompts.json. Deprecating loses the old; keeping is clutter.
**Options:**
- A. Keep `--ref` as a synonym for `--cref` (the most common single-ref use). Document as legacy.
- B. Hard-deprecate `--ref` with a warning on use; remove in v2.
- C. Auto-categorize a single `--ref` by inspection (face → cref, no face → sref, "product" in filename → pref). Magic, brittle.
**Blocking:** `02.02.01`.
**Owner:** user. Default lean: A.

### Q-03: Template yaml schema versioning
**Context:** the schema will evolve. How do templates declare which version they target?
**Options:**
- A. `version: 1` field, strict — older versions parse with the old reader.
- B. Schema is forever-additive (only optional fields); no versioning.
- C. Loader is permissive (best-effort), CLI warns on unknown fields.
**Blocking:** `02.05.01`.
**Owner:** user. Default lean: A.

### Q-04: Naming audit — full creator-archetype rename or selective?
**Context:** "hormozi-talking-head" reads better than "talking-head-rant", but using a real person's name is brand-adjacent. Risk: takedown / dilution.
**Options:**
- A. Archetypal only (no real names). E.g., "deadpan-monologue-pov" instead of "hormozi-talking-head".
- B. Real names, with the convention that the template emulates a *publicly recognizable style*, not the person.
- C. Both — primary slug archetypal, alias includes the real name.
**Blocking:** `02.06.02`.
**Owner:** user.

### Q-05: Gesture vocabulary — finite enum or open list?
**Context:** 10-gesture enum is tight; some templates may want a niche gesture.
**Options:**
- A. Finite enum, additions via PR.
- B. Open string + best-effort adapter translation.
- C. Enum + free-text `gesture_notes` for nuance.
**Blocking:** `02.04.03`.
**Owner:** user. Default lean: C.

### Q-06: Where does the cookbook live — repo or extracted package?
**Context:** as the cookbook grows it could become its own npm-installed asset library, like `@ralphy/cookbook`. Or stay in `docs/prompts/`.
**Options:**
- A. Stay in `docs/prompts/`. Simple. Drifts hard.
- B. Extract to a separate package, version-bumped, importable.
- C. Stay in `docs/prompts/`, regenerate machine-readable JSON for the agent at build time.
**Blocking:** `02.03.04`.
**Owner:** user. Default lean: C.

### Q-07: Landing gallery — static at build time or dynamic at runtime?
**Context:** static is fast and SEO-friendly; dynamic would let the gallery reflect a user's local templates.
**Options:**
- A. Static at build time (Next.js `generateStaticParams` over `templates/*/template.yaml`).
- B. Static for the public catalog, plus an authenticated "my templates" page if/when login exists. Out of scope today.
- C. Dynamic at runtime fetching from a remote registry. Heavy.
**Blocking:** `02.07.01`.
**Owner:** user. Default lean: A.

---

## Decision log

*(empty — fill as questions resolve)*
