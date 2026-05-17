# 04 — User Flow & Autonomy — SPEC

> **Vision.** Draft fast, refine in conversation, refuse only at ship. The agent asks one question when needed and zero when it isn't. Producer mode for batch runs without hand-holding.

## Scope

**In:**

- Draft-iterate-ship flow as default
- Reference-required gate timing (ship, not draft)
- "One question, then act" discipline in playbooks
- Cold-start template suggestion integrated in chat
- Producer mode (minimal confirmation)
- Interrupt + resume + state recovery

**Not in (cross-references):**

- Quality gates (what refuses) → [`08`](../08-quality-and-evaluation/)
- Append-only enforcement → [`05.03`](../05-project-resources/SPEC.md)
- NDJSON event stream protocol → [`01.07`](../01-cli/SPEC.md)

---

## 04.01 Draft-iterate-ship flow

Cold-start and ambiguous requests run through a three-phase loop: cheap draft, refine, ship.

### 04.01.01 Draft mode = minimum scope, same best models  [ ]
**v1.0:** yes

**Acceptance criteria:**
- "Draft" never means "cheaper model". Ralphy always uses the best model per kind (see `MODELS.md` top picks).
- Draft means **reduced scope**: a single representative scene (typically the hook) rendered end-to-end so the user can validate look + feel before committing to N scenes.
- Draft mode uses placeholder refs (auto-pick from the pool layer if none supplied) — no upload required.
- Project-level `mode: "draft"|"final"` in `project.json`. Default for `ralphy make`: `draft`.
- Per-call `--draft` flag is a no-op for model selection; it only narrows scope.

### 04.01.02 `ralphy make` enters draft mode by default  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy make "<brief>"` defaults to `--mode draft`.
- Final mode requires either `--final` flag or the explicit `ralphy ship <project-id>` verb.
- Documented in `--help` examples.

### 04.01.03 Iterate mode regenerates only the requested scenes  [ ]
**v1.0:** yes

**Acceptance criteria:**
- "Rework scene 3" → only scene 3 is regenerated, as a new version (`05.03.02`).
- Re-render reuses existing scene assets via the asset manifest.
- Wall time for "rework one scene + re-render": ≤ 90s for a 15s video.

### 04.01.04 Ship mode upgrades to final-quality models  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy ship <project-id>` (or `ralphy make ... --final`) re-runs every gen at the upgraded tier per `MODELS.md`.
- Quality gates run before each gen (refuse-not-warn, [`08`](../08-quality-and-evaluation/)).
- Reference-required gate fires here (`04.02`).
- Final render = the project's `render/final.mp4`.

### 04.01.05 Draft preview is low-res and watermarked  [ ]
**v1.0:** stretch

**Acceptance criteria:**
- Draft renders are tagged with a faint "draft" watermark.
- Removed automatically on ship.

---

## 04.02 Industry-aware default; ref only when truly required

By v1.0, Ralphy generates good work by default. The user describes intent; Ralphy fills in industry knowledge (camera vocab, hook patterns, pacing, music style, caption rhythm) from the prompt library and templates. References are only required when the work targets a specific real entity the model can't infer.

### 04.02.01 Default flow does not require references  [ ]
**v1.0:** yes

**Acceptance criteria:**
- A user request like "make me a TikTok about my coffee shop's new pastry" succeeds end-to-end without a `--ref` flag.
- Ralphy fills the look using template-implied style + persona archetype + pool-layer auto-pick for generic shot types.
- Output renders to ship-quality on the user's "ship it" — no implicit refusal because refs are missing.

### 04.02.02 Ref required only for brand-/product-/named-entity gens  [ ]
**v1.0:** yes

**Acceptance criteria:**
- The reference gate fires only when the brief names a specific real entity Ralphy cannot fabricate plausibly: a named person, a recognizable brand product (Coca-Cola can, iPhone 16, etc.), a recognizable IP (Mickey Mouse, etc.).
- Test classifier in `cli/lib/eval/refs.ts → needsReference(scenario)` returns `{ required: bool, reason?: string, kind?: "person"|"brand-product"|"ip" }`.
- When required and missing, ship refuses with the verb to fix; draft does not refuse and uses a marker placeholder + warning.
- "Generic" product ads (a no-name pastry, a no-name workout app) do NOT trigger the gate.

### 04.02.03 Override path documented and minimal  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `--no-ref-consent` proceeds and logs `user_consent: { kind: "no-ref-consent", reason: <string> }` in gen-log.
- Reason is required when overriding a `person` or `brand-product` gate; optional for `ip`.

### 04.02.04 Playbooks updated  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `docs/playbooks/art-director.md` and `docs/playbooks/producer.md` reflect the new gate semantics.
- AGENTS.md invariant #3 reworded: "Reference gate fires only for named real entities the model cannot fabricate (specific persons, recognizable brand products, IP). Generic product/lifestyle work proceeds without refs."

---

## 04.03 Ask as many real questions as needed; never ask for confirmation

The agent asks every question the work genuinely needs — there is no "max one question" rule. What's forbidden is the *confirmation-shaped* question that doesn't unblock new information.

### 04.03.01 Playbooks include a "clarification triage" section  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Each playbook lists: information the agent should infer (most cases), information the agent should ask about (rare but real cases), and information the agent should fail loudly on if missing.
- "Should I proceed?", "Shall I go ahead?", "Would you like me to..." — these patterns are explicitly forbidden when the request is concrete and the agent has a defensible default.

### 04.03.02 Default-pick rules for ambiguous requests  [ ]
**v1.0:** yes

**Acceptance criteria:**
- "Make me a video about X" with no template specified → run `template suggest`, pick top-1, announce the pick (no confirmation needed).
- No persona specified → pick the brand's default persona; ask for archetype only if the brand has no default.
- No duration specified → default 15s.
- Documented in `docs/use-cases.md`.

### 04.03.03 Real questions are allowed and encouraged when needed  [ ]
**v1.0:** yes

**Acceptance criteria:**
- The agent may ask multiple questions in one turn when each unblocks a distinct decision (e.g., "Which product is the hero — pastry or coffee? And do you want the founder on camera or a stand-in archetype?").
- No artificial cap on question count.
- Each question must name a specific decision and offer one or two defaults the user can accept.

### 04.03.04 Confirmation-shape audit  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Playbooks reviewed for confirmation-shaped phrases ("I'll go ahead and...", "Shall I...", "Just to confirm..."). Removed when the request is unambiguous.
- Synthetic eval: 20 unambiguous utterances; agent must take at least one tool action and emit zero confirmation-shape questions. Agent may emit clarifying questions only when the eval marks the utterance as genuinely ambiguous.

---

## 04.0A Hard invariants (always-on)

Behaviors that apply across every flow in this category. These are agent-discipline rules; they live here so the user-flow SPEC is the single source of truth.

### 04.0A.01 Append-only — never delete or overwrite without explicit consent  [~]
**v1.0:** yes

**Acceptance criteria:**
- Reiterates `AGENTS.md` invariant #13 and the in-code enforcement at [`05.03`](../05-project-resources/SPEC.md).
- The agent never deletes a prior generation, scenario version, asset, or log line unless the user used the words "delete / remove / wipe / clean / удали / снеси" referring to that artifact.
- Regenerating a slot always writes a new version (`.v2`, `.v3`, …) — see [`05.03.02`](../05-project-resources/SPEC.md).
- Playbooks include this rule verbatim in their "Hard invariants" section.

### 04.0A.02 Motion graphics → Remotion components, never video models  [ ]
**v1.0:** yes

**Acceptance criteria:**
- When the desired output is motion graphics (animated text, animated logo, animated UI mock, animated chart, lower-third overlay, kinetic typography, particle effect, transition wipes), Ralphy implements it as a Remotion React component in `src/lib/` (or `~/.ralphy/render-cache/<id>/components/` for standalone install) — NOT via `ralphy generate video`.
- The editor playbook documents this with a decision tree: "is this best generated as pixels (live action / illustration / photoreal scene) or composited as code (text, charts, UI, transitions, kinetic graphics)?".
- A `lint:motion-graphics` check scans `prompts.json` for tell-tale motion-graphics descriptions ("animated text", "kinetic typography", "lower third", "chart animates in") and warns if they're routed to `generate video`.
- Documented in `docs/playbooks/editor.md` and AGENTS.md.

### 04.0A.03 Always use the best models, no cheap fallbacks  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Model selection across image / video / VO / music / captioning always picks the top-pick row in `MODELS.md` for that kind.
- "Cheaper" tiers are not surfaced as a default anywhere. They remain documented for power users who explicitly override via `--model <id>`.
- Budget caps (cross-link [`10.03`](../10-cost-and-telemetry/SPEC.md)) are the right lever to control cost — not model downgrade.

---

---

## 04.04 Cold-start integration

Template suggestion is woven into the conversation, not handed off as a verb.

### 04.04.01 Chat-side cold-start playbook  [ ]
**v1.0:** yes

**Acceptance criteria:**
- When the agent receives a "make me a video about X" type utterance, it runs `ralphy template suggest "<utterance>"` and presents top-1 inline: "I'll use the **<template>** template (15s, ~$8). Confirm or pick another."
- One sentence, one default action, opt-out path.

### 04.04.02 Direct template invocation works too  [x]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy template use <slug>` still bypasses chat. Power users skip the conversation.
- Already implemented.

### 04.04.03 "Free-form" mode for unmatched briefs  [ ]
**v1.0:** yes

**Acceptance criteria:**
- If `template suggest` scores < 0.5 confidence on the top result, the agent enters scenarist-from-scratch mode (per `docs/playbooks/scenarist.md`).
- Announces the mode shift: "No close template match — drafting from scratch."

---

## 04.05 Producer mode

Batch flow with minimal confirmation.

### 04.05.01 `ralphy producer "<brief>" --batch N`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- One-verb batch: spawn N projects from the brief, run end-to-end draft → ship pipeline on each, respect concurrency cap 3.
- Stops only on quality-gate refusal or explicit interrupt.
- Final summary: `{ projects: [...], renders: [...], total_cost_usd, wall_time_s, failures: [...] }`.

### 04.05.02 Producer playbook updated  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `docs/playbooks/producer.md` reflects the verb + the autonomy contract (no per-scene confirmation, fail loudly on quality).

### 04.05.03 Concurrency budget respected  [~]
**v1.0:** yes

**Acceptance criteria:**
- ElevenLabs concurrency cap 3; OpenRouter concurrent jobs auto-tuned.
- Cross-link with [`docs/perf-targets.md`](../../docs/perf-targets.md).

---

## 04.06 Interrupt + resume

The agent and CLI survive Ctrl-C; state is recoverable.

### 04.06.01 SIGINT propagates and commits partial state  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Ctrl-C during any long-running verb emits a `cancelled` NDJSON event, kills in-flight provider calls if cancellable, and exits 130.
- Project state on disk is consistent: any partial gen is logged as `stage: "cancelled"` in `generations.jsonl`; no half-written files in `assets/`.
- Cross-link [`01.07.02`](../01-cli/SPEC.md).

### 04.06.02 `ralphy resume <project-id>` continues a cancelled run  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Detects the last cancelled stage from the gen-log and resumes from the next step.
- Idempotent — re-running doesn't duplicate completed work.

### 04.06.03 Chat-side "stop" interrupt  [ ]
**v1.0:** stretch

**Acceptance criteria:**
- If the agent is running a long-running command and the user types "stop", the agent kills the subprocess and reports state.
- Implementation depends on the agent platform; documented as best-effort.

---

## 04.07 Post-launch

### 04.07.01 Voice / image input to chat  [ ]
**v1.0:** no

**Acceptance criteria:**
- Agent platforms that support multimodal input (Claude Code, voice agents) get a documented flow for "drop an image, get a video like this".

### 04.07.02 Cross-session memory  [ ]
**v1.0:** no

**Acceptance criteria:**
- A project-aware memory system that surfaces "you usually pick template X for brand Y" type suggestions.

### 04.07.03 Natural-language workspace query  [ ]
**v1.0:** no

**Acceptance criteria:**
- "Show me my best video this month" answered from gen-log + eval data + (eventually) external analytics.
