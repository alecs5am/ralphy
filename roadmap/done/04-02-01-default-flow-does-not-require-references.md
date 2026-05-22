---
id: 04.02.01
status: done
v1_0: yes
category: 04-user-flow-and-autonomy
topic: "04.02 Industry-aware default; ref only when truly required"
title: "Default flow does not require references"
---

# 04.02.01 — Default flow does not require references

**v1.0:** yes

**Acceptance criteria:**
- A user request like "make me a TikTok about my coffee shop's new pastry" succeeds end-to-end without a `--ref` flag.
- Ralphy fills the look using template-implied style + persona archetype + pool-layer auto-pick for generic shot types.
- Output renders to ship-quality on the user's "ship it" — no implicit refusal because refs are missing.

**Implementation:** `cli/lib/eval/refs.ts → needsReference()` returns `{ required: false }` for generic briefs (verified in `tests/unit/eval-refs.test.ts`). AGENTS invariant #3 rewritten to scope the gate to named real entities only. Playbook callouts in `docs/playbooks/intake.md` step 1.3 + `docs/playbooks/art-director/ref-photo-policy.md` head.
