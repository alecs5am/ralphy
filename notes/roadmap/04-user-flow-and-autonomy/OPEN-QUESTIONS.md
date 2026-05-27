# 04 — User Flow & Autonomy — Open Questions & Decisions

## Open questions

### Q-01: Draft mode model picks — fixed cheap set or per-template overrideable? → D-02

### Q-02: Draft watermark — yes/no? → D-02

### Q-03: Ship gate failure mode — refuse or warn? → D-03

### Q-04: When is the agent allowed to ask a clarifying question? → D-01

### Q-05: Producer mode interaction with quality gates → D-02

### Q-06: Resume — fully idempotent or "resume from last completed stage"? → D-02

### Q-07: Concurrent project work in one session → D-02

---

## Decision log

### D-03: Quality gates always refuse, per AGENTS invariant #4 (2026-05-20)
**Was:** Q-03
**Decision:** No per-mode gate policy. The single rule is AGENTS.md invariant #4 — "Quality gates refuse, not warn. If `scoreScenario` / `scoreImage` / `scoreVideo` fail twice in a row, stop and report concrete options. Do not render mp4 over a failed gate." This applies uniformly during the chat-driven iteration loop (per D-02 there is no formal draft/ship split). When a gate refuses, the agent surfaces the concrete failure + 2-3 actionable options (rework hook, swap model, drop scene), and the user picks the next move — same loop as any other beat in intake.
**Why:** A separate "draft warns / ship refuses" policy assumed two distinct flow modes; per D-02 there is just one flow. Uniform refuse keeps the discipline the same across the whole conversation and matches the global invariant in AGENTS.md, so there's no per-feature exception to remember.
**Consequences:**
- `04.02.01` (default flow does not require refs) acceptance stays; the gate that fires is the ref-required gate, not a quality gate — different mechanism.
- Quality gates per category 08 (`scoreScenario` etc.) inherit this rule by default — no per-task override unless category 08 explicitly relaxes one.
- The "concrete options" sentence is a content requirement for each gate's refusal message; tracked in category 08 acceptance criteria for `scoreScenario` / `scoreImage` / `scoreVideo`.

### D-02: v1.0 = single user, single project, chat-driven; no batch / parallelism / formal draft-vs-ship modes (2026-05-20)
**Was:** Q-01, Q-02, Q-05, Q-06, Q-07
**Decision:** v1.0 ships exactly one flow shape: **one user opens chat → agent runs intake (`docs/playbooks/intake.md`) → agent generates one beat at a time with checkpoints → user iterates by saying "rework scene 3", "shorter hook", etc. → user says "ship it" → agent renders the mp4 → quality gates run → user gets the file.** No formal `--draft` vs `--ship` CLI modes, no batch (producer) verb in v1.0, no concurrent-project-in-one-workspace parallelism, no complex resume semantics. SIGINT cancels the running operation cleanly (handled by `01.07.02`); the user re-engages the agent in chat to continue — the agent reads the append-only gen log + manifest to figure out where to pick up, which is sufficient because (a) gen-log records what was generated, (b) the manifest points at the latest version per slot, and (c) the agent can ask the user "I see scene-03 was the last completed beat — continue from scene-04?" if needed.
**Why:** Five questions in this category (Q-01 draft model swap, Q-02 watermark, Q-05 batch gate, Q-06 idempotent resume, Q-07 concurrent projects) all presupposed CLI-mode complexity that the tester audience (per `07-D-06`) doesn't need. The flow they actually need — "enter project, make video, get mp4" — works inside the chat-driven intake protocol already implemented in commit `79cd9c5` (adaptive intake by skill band). Adding draft mode flags, batch flags, and resume idempotency now would build infrastructure for use cases nobody on the soft-launch list has asked for, while distracting from polishing the core single-project loop.
**Consequences:**
- `04.01.01` Draft mode = minimum scope: reframed as **agent discipline inside intake** (start with one anchor + one i2v before batching the rest), not a CLI flag. Acceptance criteria updated.
- `04.01.02` "`ralphy make` enters draft mode by default" — moot (`ralphy make` cancelled per `01-D-01`); replaced with intake-driven "one beat at a time" discipline already in `intake.md`.
- `04.01.03` Iterate mode regenerates only requested scenes: still relevant — implemented as `ralphy generate <type> --slot scene-NN-...` with append-only versioning (already in code, `05.03.02`). No special "iterate mode".
- `04.01.04` Ship mode upgrades to final-quality models: moot per AGENTS invariant "always use best models" (`04.0A.03`); there is no quality split between draft and ship.
- `04.01.05` Draft watermark: cancelled.
- `04.05.x` Producer batch mode: deferred to `04.07.x` (post-launch).
- `04.06.x` Interrupt + resume: SIGINT-clean exit stays `v1.0: yes` (covered by `01.07.02`); resume idempotency / `--dry-run resume` deferred to post-launch.
- Category 04 PRD's "v1.0 cut" list is reduced accordingly — `04.05` and `04.06` drop out of the v1.0 must-ship list.

### D-01: Adaptive intake by user-skill band — already implemented; the canonical "when to ask" answer (2026-05-20)
**Was:** Q-04
**Decision:** "When does the agent ask a clarifying question" is decided by the **adaptive intake protocol** in [`docs/playbooks/intake.md`](../../docs/playbooks/intake.md), keyed off the user's skill band from `ralphy whoami` (commit `79cd9c5`). The protocol scales depth with the user: novice gets full 5-question intake with mini-explanations, learning/intermediate get full intake without explanations, comfortable gets 3-5 questions skipping obvious ones, experienced gets only critical params, expert / developer-badge gets one-line confirm. Across all bands the agent: (a) never emits confirmation-shape questions on concrete requests, (b) asks real questions when each unblocks a distinct decision, (c) caps follow-ups at 5 in a single turn for legibility.
**Why:** The three options framed in the original Q-04 ("only on template-choice ambiguity" vs "<70% confidence" vs "never ask") were too coarse — they assumed one rule fits every user. The band-based approach addresses what testers actually experience: a novice needs hand-holding to avoid burning budget on wrong-direction work; a senior dev wants the agent to just act. Already implemented; this entry records the decision for the audit trail.
**Consequences:**
- `04.03.01` (clarification triage section in playbooks) → reframed as "follow intake.md band table"; per-playbook clarification rules layer on top.
- `04.03.02` (default-pick rules) — preserved; defaults still kick in for unmatched template / unspecified persona / unspecified duration as listed.
- `04.03.03` (real questions allowed) — preserved; intake explicitly caps at 5 questions per turn and demands each names a specific decision + offers a default.
- `04.03.04` (confirmation-shape audit) — preserved; the band table doesn't change the no-confirmations rule, it only changes how many real questions are asked.
- Validates the existing intake.md text against the band table — no new code needed; documentation already aligned.
