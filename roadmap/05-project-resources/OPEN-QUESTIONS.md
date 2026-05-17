# 05 — Project Resources — Open Questions & Decisions

## Open questions

### Q-01: Registry format — single file or per-resource sharded?
**Context:** `workspace/.ralph/registry.json` as one file is simple but contention-prone with parallel CLI invocations. Per-resource (`projects.json`, `brands.json`, …) is more concurrent but adds complexity.
**Options:**
- A. Single file with write-temp + rename + file lock. Simple, slow only at very large scale.
- B. Per-resource files. More concurrent, more code paths.
- C. SQLite. Stronger guarantees, but adds a binary dependency and breaks the "everything is plain files" ethos.
**Blocking:** `05.01.01`.
**Owner:** user. Default lean: A — we're not hitting scale where it matters.

### Q-02: Version numbering on slot regen — `.v2.png` vs `.20260517-123456.png`?
**Context:** when `ralphy generate image` runs against a slot that has a file, do we use sequential `v2, v3, v4` or timestamps?
**Options:**
- A. Sequential. Predictable, greppable, ordered by intent.
- B. Timestamp. Predictable, ordered by time, no race condition on parallel gens.
- C. Both — sequential primary, timestamp tiebreaker.
**Blocking:** `05.03.02`.
**Owner:** user.

### Q-03: Brand inheritance — overrideable per project?
**Context:** project links a brand by slug. If the user wants this project to deviate on one field (e.g., palette) — do they edit the brand globally, fork it, or override inline?
**Options:**
- A. Inline override on the project (a `brand_overrides` block in `project.json`). Flexible, drift-prone.
- B. Fork-only: `ralphy brand fork acme acme-spring-26` creates a new brand. Clean but heavy for tiny tweaks.
- C. Disallow: editing the brand affects every linked project. Forces discipline; can frustrate.
**Blocking:** `05.04.03`.
**Owner:** user.

### Q-04: Profile import conflict policy
**Context:** importing on a machine that already has a project with the same id.
**Options:**
- A. Hard fail; require `--rename-on-conflict`. Safe.
- B. Silent rename (suffix `-imported`). Easy.
- C. Interactive prompt. Annoying for CI, friendly for humans.
**Blocking:** `05.06.02`.
**Owner:** user.

### Q-05: Asset catalog as code or as doc?
**Context:** today `docs/assets-catalog.md` is regenerated from the manifest. Could we drop the markdown entirely and just point users at `ralphy assets list`?
**Options:**
- A. Keep markdown — it's discoverable on GitHub, links from docs.
- B. Drop markdown — single source (the manifest), CLI is the read interface.
- C. Keep but make it a build artifact (not checked in), regenerated in CI.
**Blocking:** `05.05.03`.
**Owner:** user.

---

## Decision log

*(empty — fill as questions resolve)*
