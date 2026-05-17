# 08 — Quality & Evaluation — Open Questions & Decisions

## Open questions

### Q-01: Judge sample count — 3, 5, or adaptive?
**Context:** more samples = more stable but more cost + latency. 3 is the lower bound for variance estimation; 5 is the research sweet spot; adaptive saves cost when confident.
**Options:**
- A. Fixed 3 — cheap, gets variance.
- B. Fixed 5 — research-grade.
- C. Adaptive: start with 1, escalate to 5 if confidence low.
**Blocking:** `08.04.01`.
**Owner:** user. Default lean: A for v1.0, escalate via Q-02.

### Q-02: Variance threshold for "uncertain" flag
**Context:** at variance > 1.0 on a 0-5 scale, we flag the dimension as uncertain. Is 1.0 the right number?
**Options:**
- A. 1.0 (standard deviation > 1 = noisy on Likert).
- B. 0.5 (stricter).
- C. Per-dimension threshold tuned during calibration.
**Blocking:** `08.04.01`.
**Owner:** user. Default lean: A initially; tune via calibration.

### Q-03: Golden set labeler — single (the user) or peer-labeled?
**Context:** the user can hand-label 30 scenarios + 30 renders alone. Peer labels would smooth bias but add coordination cost.
**Options:**
- A. Solo (user). Fast, consistent within one labeler's bias.
- B. Peer review on 10% of items — sanity check.
- C. Multi-labeler from the start.
**Blocking:** `08.05.01`.
**Owner:** user. Default lean: A.

### Q-04: κ threshold — 0.6 strict or tunable per dimension?
**Context:** κ = 0.6 is "substantial agreement" by Landis-Koch. Some dimensions (subjective ones like "aesthetic") may not hit 0.6 even with great rubrics.
**Options:**
- A. 0.6 universal; refactor dimensions that don't make it.
- B. Per-dimension threshold (e.g., 0.6 for objective, 0.4 for subjective).
- C. 0.6 universal but flag dimensions < 0.6 in CALIBRATION.md without blocking CI.
**Blocking:** `08.05.02`.
**Owner:** user. Default lean: C.

### Q-05: Override flag UX
**Context:** `--allow-failed-eval` lets the user proceed despite a refusal. Should overrides require a justification string?
**Options:**
- A. `--allow-failed-eval` alone, log the override.
- B. `--allow-failed-eval --reason "<text>"` required; logged.
- C. Interactive prompt only — no flag (forces human in the loop).
**Blocking:** `08.06.01`.
**Owner:** user. Default lean: B.

### Q-06: Hook scorer applies to all templates or only to "viral-formula" ones?
**Context:** the hook gate is high-leverage for UGC; less relevant for, say, a corporate explainer template that intentionally opens slow.
**Options:**
- A. All templates; per-template overlay can lower the threshold.
- B. Only `entertainment-viral` and `creator-lifestyle` categories.
- C. Default on for all, with an explicit `hook_required: false` opt-out in `template.yaml`.
**Blocking:** `08.02.01`.
**Owner:** user. Default lean: C.

### Q-08: Default council agent count + model pool
**Context:** `ralphy council` runs N agents. Defaults influence cost and confidence.
**Options:**
- A. Default 3 agents, pool: Claude / GPT / Gemini. Rotates per dimension. Cost ~$0.30 / 15s video.
- B. Default 1 agent for pre-flight, 3 for ship — explicit per-mode defaults.
- C. Default 5 agents — research-grade confidence, ~$0.50 / 15s video.
**Blocking:** `08.08.04`, `08.08.05`.
**Owner:** user. Default lean: B.

### Q-09: Council pass/fail aggregation
**Context:** with N agents voting, how do we decide overall pass?
**Options:**
- A. Majority pass = overall pass. Simple.
- B. Unanimous required for hard-fail dimensions; majority for soft. Safer.
- C. Weighted vote — disagreement on hard-fail dimensions blocks; soft dimensions average.
**Blocking:** `08.08.03`.
**Owner:** user. Default lean: B.

### Q-10: Council reports — checked into project or scratch?
**Context:** every council run produces N markdown reports. Do they stay in `workspace/projects/<id>/eval/` (append-only growth) or get rotated?
**Options:**
- A. Keep forever (consistent with append-only invariant). Grows linearly.
- B. Keep last K runs; older runs compressed into a summary JSON.
- C. Keep all per-project; archive at workspace level after some retention.
**Blocking:** `08.08.01`.
**Owner:** user. Default lean: A.

### Q-07: Where do the rubrics live — repo or extracted package?
**Context:** as rubrics evolve they could become a versioned package importable by other tools. Or stay in the repo.
**Options:**
- A. In-repo. Simple.
- B. Extracted package `@ralphy/rubrics`. Reusable, versioned.
- C. In-repo for v1.0; extract later if reuse demands.
**Blocking:** `08.01.02`.
**Owner:** user. Default lean: C.

---

## Decision log

*(empty — fill as questions resolve)*
