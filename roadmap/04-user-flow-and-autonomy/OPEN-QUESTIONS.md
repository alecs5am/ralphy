# 04 — User Flow & Autonomy — Open Questions & Decisions

## Open questions

### Q-01: Draft mode model picks — fixed cheap set or per-template overrideable?
**Context:** draft mode should be cheap. But some templates only work with specific models (e.g., a Veo-3 audio template can't substitute kling).
**Options:**
- A. Fixed cheap set; templates that require premium fail in draft mode with a clear message.
- B. Per-template `draft_models:` field overriding the cheap-set default.
- C. Auto-detect: if the template's preferred model is in the cheap tier, use it; else use the cheapest model with compatible aspect-ratio / duration.
**Blocking:** `04.01.01`.
**Owner:** user. Default lean: B.

### Q-02: Draft watermark — yes/no?
**Context:** prevents users from shipping a draft by mistake but adds friction.
**Options:**
- A. Watermark drafts; auto-removed on ship.
- B. No watermark; rely on filename (`<id>-draft.mp4`).
- C. Watermark + filename + manifest entry — belt and suspenders.
**Blocking:** `04.01.05`.
**Owner:** user. Default lean: B.

### Q-03: Ship gate failure mode — refuse or warn?
**Context:** invariant #4 in AGENTS.md says "quality gates refuse, not warn". For ship, that's clear. For draft, do gates refuse or warn?
**Options:**
- A. Draft warns, ship refuses. Standard.
- B. Both refuse. Maximum quality discipline.
- C. Both warn. Maximum autonomy.
**Blocking:** `04.02.01`.
**Owner:** user. Default lean: A.

### Q-04: When is the agent allowed to ask a clarifying question?
**Context:** "one question, then act" is the discipline, but when is one question appropriate?
**Options:**
- A. Only when the missing information would determine the template choice (the highest-leverage decision).
- B. Whenever the agent is < 70% confident on top-1.
- C. Never — always pick a default + announce. User can correct in the next turn.
**Blocking:** `04.03.02`.
**Owner:** user. Default lean: A.

### Q-05: Producer mode interaction with quality gates
**Context:** in batch, do gate failures halt the batch or just that project?
**Options:**
- A. Per-project: failed projects logged, batch continues.
- B. Halt batch on first failure.
- C. Configurable via `--on-fail continue|halt`.
**Blocking:** `04.05.01`.
**Owner:** user. Default lean: A.

### Q-06: Resume — fully idempotent or "resume from last completed stage"?
**Context:** strictly idempotent is harder; "resume from cancellation point" is simpler but can produce v2 of an asset that was already generated.
**Options:**
- A. "Resume from last completed stage" — accept the duplication risk.
- B. Strictly idempotent — verify each prior stage's output is intact before resuming.
- C. Resume with a `--dry-run` first that shows what will happen.
**Blocking:** `04.06.02`.
**Owner:** user. Default lean: B.

### Q-07: Concurrent project work in one session
**Context:** can the user have two `ralphy make` runs in parallel in the same workspace?
**Options:**
- A. Yes; file-locked registry handles concurrent writes.
- B. No; second invocation errors with `E_WORKSPACE_BUSY`.
- C. Yes with a `--no-parallel` opt-out per user preference.
**Blocking:** `04.05.03`.
**Owner:** user. Default lean: A.

---

## Decision log

*(empty — fill as questions resolve)*
