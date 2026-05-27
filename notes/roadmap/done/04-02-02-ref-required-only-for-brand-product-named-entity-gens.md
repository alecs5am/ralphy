---
id: 04.02.02
status: done
v1_0: yes
category: 04-user-flow-and-autonomy
topic: "04.02 Industry-aware default; ref only when truly required"
title: "Ref required only for brand-/product-/named-entity gens"
---

# 04.02.02 — Ref required only for brand-/product-/named-entity gens

**v1.0:** yes

**Acceptance criteria:**
- The reference gate fires only when the brief names a specific real entity Ralphy cannot fabricate plausibly: a named person, a recognizable brand product (Coca-Cola can, iPhone 16, etc.), a recognizable IP (Mickey Mouse, etc.).
- Test classifier in `cli/lib/eval/refs.ts → needsReference(scenario)` returns `{ required: bool, reason?: string, kind?: "person"|"brand-product"|"ip" }`.
- When required and missing, ship refuses with the verb to fix; draft does not refuse and uses a marker placeholder + warning.
- "Generic" product ads (a no-name pastry, a no-name workout app) do NOT trigger the gate.

**Implementation:** Classifier in `cli/lib/eval/refs.ts` exposes `needsReference()` and `checkReferenceGate()`; covers three buckets (person / brand-product / ip) with curated regex lexicons. 26 unit tests in `tests/unit/eval-refs.test.ts`. CLI surface: `ralphy ref check <project-id>` (project mode) or `ralphy ref check _ --text "<brief>"` (text mode). Per D-02 there's no formal draft/ship split — the gate is uniform; the agent reports and waits for `--no-ref-consent`.
