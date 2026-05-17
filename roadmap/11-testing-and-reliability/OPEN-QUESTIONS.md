# 11 — Testing & Reliability — Open Questions & Decisions

## Open questions

### Q-01: Test runner — `bun test` or Vitest?
**Context:** Bun has its own test runner now; Vitest is mature and TypeScript-native.
**Options:**
- A. `bun test` — zero extra dependencies, integrates with our Bun-only stance.
- B. Vitest — bigger ecosystem, plugin support (snapshot, coverage UIs).
- C. Start with `bun test`; migrate if it bites.
**Blocking:** `11.01.01`.
**Owner:** user. Default lean: C.

### Q-02: Perceptual-hash threshold for golden first-frame  [ ]
**Context:** image diff sensitivity. Too strict → noise from encoder drift. Too loose → real regressions slip.
**Options:**
- A. pHash with a low Hamming distance threshold (≤ 4 bits out of 64). Tight.
- B. SSIM threshold (≥ 0.97).
- C. Both — pHash for structure, SSIM for finish; either failing is a fail.
**Blocking:** `11.02.01`.
**Owner:** user.

### Q-03: Where do golden fixtures live — repo or LFS or external bucket?
**Context:** 5 templates × cached gen assets ≈ several hundred MB. Inflates clone time.
**Options:**
- A. In-repo with Git LFS. Slowest clone, simplest auth.
- B. Out-of-repo (S3 or GH Releases asset), downloaded on `bun test:golden:setup`. Faster clone, separate failure mode.
- C. Compute-on-demand: cache gens but re-run cheap ops (Remotion render) each PR. Lighter.
**Blocking:** `11.02.01`.
**Owner:** user.

### Q-04: How aggressive should "playbook lint" be on examples?
**Context:** playbooks have prose + canonical examples. Some examples are real commands the agent should run; others are illustrative.
**Options:**
- A. Lint every `ralphy ` mention; demand opt-out via comment.
- B. Lint only commands inside a `bash` block with a marker (`# lint`).
- C. Lint everything; provide a sed-friendly opt-out string (`<!-- lint-skip -->`).
**Blocking:** `11.04.03`.
**Owner:** user. Default lean: C.

### Q-05: Nightly paid-suite budget
**Context:** a weekly full run could be $10-50 depending on what it covers.
**Options:**
- A. Strict cap ($5/week), refuse to run if estimate exceeds it.
- B. No cap — paid-test value is high.
- C. Cap with explicit override flag for ad-hoc deep runs.
**Blocking:** `11.08.01`.
**Owner:** user (budget decision).

---

## Decision log

*(empty — fill as questions resolve)*
