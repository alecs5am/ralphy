# 04 — User Flow & Autonomy — PRD

## Problem

Ralphy's positioning is "autonomous agent that turns an idea into an mp4 in 8 minutes". Today it can do that, but the experience requires the user to know which verb to type and how the agent expects to be steered. Two failure modes recur:

1. **Refuse-first when ambiguous.** `AGENTS.md` invariant #3 ("Reference-required gate") makes the agent refuse generation of "named real entities" without a user-supplied ref. This was a deliberate guard against garbage output — but for v1.0 it overshoots. By v1.0, Ralphy should understand the UGC industry well enough (templates + cookbooks + structured scenes) to generate quality output from a free-text brief alone. References should be required only when the work actually depends on a specific real entity the model can't fabricate (a recognizable brand product, a specific named person, a copyrighted IP). For generic creative work — "make me a TikTok about my coffee shop" — refs should be optional and Ralphy should produce something good on the first run.
2. **No single front-stage verb.** The user wanting "make a video about X" has to know whether to start with `ralphy template suggest`, `ralphy project create`, or `ralphy ref pull`. Power users learn the chain; first-time users hit the wall. [`01.01.01 ralphy make`](../01-cli/SPEC.md) is part of the answer, but flow also matters: when the user types something ambiguous, what does the agent ask, and when does it act?

Adjacent flow problems:

3. **Cold-start UX is "find the right template".** `ralphy template suggest "<utterance>"` exists but the user has to know to use it. Routing in `AGENTS.md` is supposed to handle this from chat — and does, mostly — but the discoverability story isn't documented as a *flow*; it's documented as a routing table.
4. **No clear "draft → critique → ship" loop.** Today the agent renders once and the user reacts. Competitors all converged on a draft-iterate-ship loop with cheap placeholders. We have the pieces (versioning per `05.03.02`, eval per `08`) but no orchestration that uses them.
5. **The agent is too eager to confirm AND sometimes too eager to act.** Conversations end up with "I'll do X, ok?" when the user just wants X done. Conversely, the agent occasionally acts on ambiguous requests when one or two real questions would save 10 minutes of wrong-direction work. The discipline is: ask as many questions as you genuinely need; never ask for confirmation when the request is concrete.

6. **No cross-session memory.** Ralphy forgets what kind of work the user prefers, which template they reach for, what their brand quirks are, what failed last time. Each session starts cold. A `ralphy memory` layer — additive, user-owned, transparent — would close this.

7. **Motion graphics get routed to video gen.** When the user wants animated text, kinetic typography, a chart animating in, or any code-able motion graphic, the agent reaches for `ralphy generate video` — wrong tool. We have Remotion; that's where motion graphics belong.

This category owns the flow: what happens in the first 30 seconds of a session, between turns, and at ship time.

## Users

| User | Need |
|---|---|
| **First-time user** | One sentence in chat → working draft within minutes. No CLI knowledge. |
| **Power user** | Skip the chat, jump straight to back-stage verbs, autonomy preserved. |
| **Batch operator** | Producer mode for N variants — minimal confirmation, maximum throughput. |
| **Quality-sensitive user** | Strict mode where the agent asks before every gen, no surprises. |

## User stories

1. As a **first-time user**, I type "make a TikTok about my new dog food brand". The agent picks a template (suggest + pick), drafts a scenario, generates one representative scene with the best models, shows me the result — without asking for refs or for permission for each step.
2. As a **first-time user**, I see the draft, dislike scene 3, say "rework scene 3 — more chaos". The agent regenerates scene 3 (new version, not overwrite), re-renders, shows the diff. Loop until I say "ship it".
3. As a **first-time user**, I say "ship it". The agent generates the full storyboard, runs quality gates, refuses only if my brief depends on a *specific real entity* without a ref (a recognizable brand product, a named person). For "my coffee shop's pastry", no ref needed.
4. As a **batch operator**, I run `ralphy producer` mode and the agent runs end-to-end with minimal confirmation, only stopping for quality-gate refusals.
5. As any **user**, the agent's clarifying questions are real and few — never "I'd love to help — what do you have in mind?". When it asks, each question unblocks a specific decision and proposes a default.
6. As any **user**, the agent never asks "shall I proceed?" or "would you like me to..." when the request was concrete.
7. As any **user**, I can interrupt at any point (Ctrl-C in CLI, or "stop" in chat). The agent commits what's been done, leaves the rest, and reports state.
8. As any **user**, the agent never deletes or overwrites my prior generations. Every regen is a new version; old versions stay on disk until I explicitly clear them.
9. As any **user**, when I describe motion graphics ("animated text intro", "chart that animates in", "kinetic typography for the CTA"), the agent reaches for Remotion components — not a video model. The output looks like a polished web animation, not an AI-glitched frame.
10. As a **returning user**, Ralphy remembers patterns from prior sessions: which templates I reach for, what my brand quirks are, what I rejected and why. `ralphy memory` surfaces this; it's additive and I can inspect / edit / clear it.

## Success metrics

| Metric | Target at v1.0 | How we measure |
|---|---|---|
| "Idea → first draft preview" wall time | ≤ 4 min on a hot project | Cold-start template stopwatch |
| Confirmation-shape prompts when the request is concrete | 0 | Audit |
| Frequency of refuse-on-ref when the brief has no named real entity | 0% | Eval |
| Frequency of ref refusal when the brief names a real entity without a ref | 100% | Eval |
| Time from "ship it" to full-res mp4 | ≤ 8 min on cold-start template | Stopwatch |
| Sessions ending in "ship" with zero scene reworks (cold-start works first try) | ≥ 30% | Log audit |
| Sessions ending in "ship" with ≤ 2 scene reworks | ≥ 70% | Log audit |
| Motion-graphics requests routed to Remotion components (not video gen) | 100% | Audit prompts.json on 20 sessions |
| Append-only invariant violations | 0 | CI lint + audit |

## Non-goals

- **Chat-style memory** beyond a single session. Cross-session memory lives in the project (gen-log, prompts.json, etc.), not in agent state.
- **Multi-modal voice / image input to the agent itself.** Text in chat only.
- **A natural-language query interface for the workspace** ("show me my best video this month"). That's later; the gen-log + ralphy verbs are the interface for v1.0.
- **Re-implementing Claude / GPT itself.** We orchestrate; we don't train.
- **Auto-publishing to TikTok / Reels.** Out of scope. The mp4 is the deliverable.

## v1.0 cut

**Must ship:**

- `04.01` — Draft-iterate-ship flow, draft = minimum scope (NOT cheaper models)
- `04.02` — Reference gate fires only for named real entities; generic creative work proceeds without refs
- `04.03` — Ask as many real questions as needed; never ask for confirmation
- `04.04` — Cold-start template suggestion integrated into chat
- `04.05` — Producer mode for batch
- `04.06` — Interrupt + resume
- `04.0A` — Hard invariants: append-only enforced, motion graphics via Remotion, best models always
- `ralphy memory` — cross-session memory layer (cross-link [`05.NN`](../05-project-resources/SPEC.md))

**Post-launch:**

- `04.07` — Voice / image input to chat
- `04.09` — Natural-language workspace query
