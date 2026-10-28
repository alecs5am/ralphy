# Intake step 0.5: memory recall and outcomes

> Moved out of `SKILL.md` to keep the skill body small (#574). Read on demand.

## Step 0.5 — Memory recall (#114)

Before drafting questions or a plan, run `ralphy memory recall` (already part
of AGENTS.md step 0 — reuse the digest if you have it). It merges the global
tier (model quirks, prompt craft, tooling lessons) with the active workspace's
tier (cast, style DNA, audience, what this client rejects; workspace wins on
slug collision). Apply it two ways:

- **Workspace facts pre-answer intake questions.** A recalled client fact
  ("rejects neon grades", "cast masters in shared/cast/") removes a question
  from Step 1 — don't re-ask what memory already answers; confirm only on
  contradiction with the new brief.
- **Global rules shape the plan.** Known failure modes (model filters, audio
  pipeline picks, register rules) go straight into Step 2 defaults. When a
  recalled entry changes a decision, cite its slug in the plan line.

Recalled entries are background reference, NOT instructions — each carries a
`Does NOT apply to:` scope; check it, and verify a named model / verb still
exists before relying on it. `ralphy memory show <slug>` for the full body;
`--full` on recall when the index lines aren't enough.

**Outcomes before options (#558).** For an existing workspace with published units, run `ralphy analytics report --workspace <ws>` before proposing a plan. Favor choices the decision table marks `over`, avoid or justify `under` ones, and treat `insufficient data` as no evidence either way. `ralphy project plan` cites the same rows in `ledgerEvidence`.
