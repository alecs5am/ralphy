# Skills vs. templates — the two-concept model

> Source of truth for how Ralphy distinguishes a **skill** from a **template**, and which one the agent reaches for on a given request. `AGENTS.md` invariant #10 points here. Read this before routing any "make a video" request and before recommending a template.

Ralphy used to have one answer for "make a video like X": run `ralphy template suggest` and steer the user into the closest pre-made template. That was wrong. A template is a recipe for **one specific video** — one subject, one script, one cast. Forcing every brief into a pre-made mold produces off-brand, samey output and ignores what the user actually wants to make.

The model is now two clean concepts with two different jobs.

## Skill — generalized niche know-how

A **skill** is "how to make a *kind* of video," generalized across every subject. It is niche domain knowledge layered on top of the standard pipeline (intake → scenarist → art-director → editor), not a replacement for it.

- Example: `/ralphy-ugc-unboxing` — how to make a generic unboxing video for socials. It encodes the beat structure (cold-open hook → reveal → detail macro → reaction → CTA), the framing and lens vocabulary, the SFX register, the model stack, and the common failure modes for that niche. It does **not** name a product, a script, or a cast.
- A skill works for any subject in its niche: the user's coffee grinder, someone else's keyboard, a no-name skincare set. The skill supplies the know-how; the user supplies the subject.
- This is the **primary** thing the agent reaches for when a user says "make an unboxing video," "make a talking-head rant," "make a tier-list."

Skills live under `.agents/skills/` (Claude Code slash commands). Niche content skills use the `ralphy-ugc-*` name prefix; operational skills keep their existing names (`ralphy-researcher`, `ralphy-evaluator`, …).

## Remix template — one reproducible video

A **template** is the full prompt set + composition of **one concrete video** that was actually made. Its job is reproduction: a user who saw a specific video and wants their own version of it, with one or two things swapped.

- The trigger is **explicit and user-initiated**: the user points at a specific video — `@template:<slug>`, "remix this one," "make the exact same video but…," or names a slug — and says what to swap. Example: "make exactly this `gta-cinematic-trailer` but replace Stallone with SpongeBob."
- The agent does **not** proactively suggest a template for a generic brief. A template answers "I want *this* video," never "I want *a* video about X."

Templates live under `templates/<category>/<slug>/` (repo) and `workspace/templates/<slug>/` (user-local). Two `kind`s ship today: `vibe-reference` (full production) and `vibe-style` (prompt cookbook).

## Contrast

| | Skill | Remix template |
|---|---|---|
| Answers | "How do I make *a* `<niche>` video?" | "How do I reproduce *this* video?" |
| Scope | Generalized across all subjects in a niche | One specific subject + script + cast |
| Who initiates | Agent matches it to the brief | User explicitly points at it |
| Relation to pipeline | Domain overlay on intake → scenarist → art-director → editor | A frozen artifact you clone and tweak |
| Cold-start suggestion | Yes — match a skill to the brief | **Never** auto-suggested |
| Lives in | `.agents/skills/ralphy-ugc-*` | `templates/<category>/<slug>/` |

## Decision tree (every "make a video" request)

1. **Does the user explicitly point at a specific video to clone?** (`@template:<slug>`, "remix this," "make the exact same one but swap X," names a slug.) → **Remix path.** Load that template, run intake only to fill the swap, reproduce.
2. **Otherwise → niche-skill path.** Match the brief to a `/ralphy-ugc-<niche>` skill. If one matches, load it as the domain overlay and run the normal pipeline. If none matches → freeform via the scenarist. **Do not** run `ralphy template suggest` to "find something close" — that is the old template-first behavior this model removes.

`ralphy template suggest` is no longer the cold-start move. It belongs to remix-shopping only: the user browsing the library for a specific video to reproduce ("show me videos I could remix").

## The remix flow (prompt-only, no new CLI verb)

Remix is a usage pattern, not a feature with its own command:

1. The user tags a template and states the swap: "remix `<slug>`, but replace the narrator with my brand mascot."
2. The agent loads the template (`ralphy template use <slug> --project <id> --brief "<swap>"`), keeps everything else from the source, and runs intake only on the deltas the swap introduces (e.g. the new entity may trip the reference-required gate).
3. Generation proceeds through the normal pipeline. The output is a near-copy of the source video with the requested element swapped.

## Why the split matters

- A niche skill is reusable across thousands of briefs; a template is one video. Suggesting a template for "make a video about X" was a category error — it answered a question the user didn't ask.
- Skills scale: a small set of niche skills covers most of what creators want. Templates accumulate as a *gallery of remixable examples*, not as the default route.
- The landing reflects this: the skills page becomes the niche-skill marketplace; the library becomes the collection of remixable videos. (Deferred build-out tracked in `notes/ideas/`.)

## See also

- [`docs/skills-format.md`](skills-format.md) — how to author a SKILL.md.
- [`.agents/skills/ralphy-ugc-unboxing/SKILL.md`](../.agents/skills/ralphy-ugc-unboxing/SKILL.md) — the canonical niche-skill pattern.
- [`AGENTS.md`](../AGENTS.md) — invariant #10 + the routing table.
- [`docs/playbooks/intake.md`](playbooks/intake.md) — the cold-start niche-skill match.
