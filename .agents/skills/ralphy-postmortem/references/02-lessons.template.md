# `02-lessons.template.md` — rules learned the hard way

The synthesis doc. Reads like a senior engineer's notes after shipping. Every rule traces to a turn in `01-chat-history.md`.

## Template

```markdown
# Lessons — <project-id>

What this session taught us about making `<project-type>` videos with ralphy. Every rule below has a citation to `01-chat-history.md` — if a rule has no citation, delete it.

## Section 1 — TL;DR: N rules I learned the hard way

Numbered list of 6-12 rules. Each rule = one short paragraph, **bold headline + 2-3 sentences with evidence**. Format:

\`\`\`
1. **<One-line rule headline.>** <Evidence sentence: turn ref + $ wasted + iteration count.> <Prevention sentence: what to do next time.> [01-chat-history.md#turn-N]
\`\`\`

Bad rule: "Always use references when generating images."
Good rule: "**Pull canonical product imagery BEFORE generating.**  Turn 3-7 burned 8 shots with wrong brand colors because the agent trusted Claude's stale memory of the product — user dropped reference screenshots at turn 8 and the v2 batch (turn 9) landed clean. Cost: $1.60 avoidable. Next time: `ralphy ref pull <brand-site>` in turn 1 before any image gen. [01-chat-history.md#turn-3]"

## Section 2 — Pipeline I would run from scratch

A code-block showing the corrected phase order with CLI commands and time budget. Concrete enough to copy-paste into the next session's plan.

\`\`\`
1. Research      (5-10 min)
   ├─ ralphy ref pull <urls>
   └─ ralphy ref analyze <slug>

2. Storyboard    (10 min)
   ├─ Write workspace/projects/<id>/STORYBOARD.md
   └─ Get explicit user "go" before phase 3.

3. Stills        (10 min, parallel)
   ├─ ralphy generate image --slot scene-NN-still ...
   └─ ...

[etc — 6-8 phases total]
\`\`\`

**At 1.5× minimum iterations,** total spend ≈ $X-Y. (Cross-reference: see `04-models-and-cost.md` for the exact minimum-viable derivation.)

## Section 3 — Prompt patterns that worked

3-5 verbatim prompts that produced winners, each labeled with the scene/slot and the model that received it. Wrap in code blocks. Copy-paste from the actual session, don't paraphrase.

### Image: <category> (used for scene-XX, model `<endpoint>`)

\`\`\`
<verbatim prompt text>
\`\`\`

Key tokens that made the difference: <2-3 phrases that unlocked the result>.

### Video: <category> (used for clip-XX, model `<endpoint>`)

\`\`\`
<verbatim prompt text>
\`\`\`

...

## Section 4 — Pitfalls hit

A table. Every row from a real failure in this session, with a citation to `01-chat-history.md`.

| Pitfall | Cost | Prevention | Evidence |
|---|---|---|---|
| Generated 8 product shots before locking storyboard | $1.20 wasted | Lock storyboard BEFORE any image gen. | turn 2-5 |
| Re-used same seed across "variants" | 3 indistinguishable outputs, $0.45 | Vary one axis at a time — prompt OR seed OR model. | turn 11 |
| ... | ... | ... | ... |

## Section 5 — Composition tricks that paid off

Bullet list of Remotion / ffmpeg / editing patterns that worked. Skip this section if the session never reached compose/render.

- **<pattern name>** — <when to use it, what problem it solves, citation>.
- ...

## Section 6 — Final delivery files

A tree showing what shipped. Brief annotations on each.

\`\`\`
workspace/projects/<id>/
├── render/
│   ├── final.mp4                 (1080×1920, 15s, music-X — WINNER)
│   ├── final-music-a.mp4         (variant, rejected at turn N)
│   └── ...
├── STORYBOARD.md                 (locked v1, turn 2)
├── postmortem/                   (this doc set)
├── assets/
│   ├── images/                   (N stills, M versions across regens)
│   ├── videos/                   (M clips)
│   └── music/                    (K variants)
└── refs/                         (canonical + user-supplied)
\`\`\`

Composition at `src/videos/<id>/{scenes.ts, index.tsx}`, registered as `<CompId>` in `src/Root.tsx`.

---

*Written <YYYY-MM-DD>. Re-read this before the next `<project-type>` project — every rule above came from a real iteration cost cited in `01-chat-history.md`.*
```

---

## Filling guidance

- **Every rule cites a turn.** No citation = delete the rule, it's a generic best-practice that belongs in `docs/playbooks/`, not here.
- **Rules count between 6-12.** Fewer than 6 = under-mined; more than 12 = padding.
- **No $ figures without `jq` evidence.** All $ in this doc should match 04-models-and-cost.md.
- **Section 5 (Composition tricks)** is media-specific. For non-media projects (CLI work, refactors), drop this section.

## Iteration N addendum

```markdown
---

## Iteration N — <YYYY-MM-DD> — <one-line insight> ($<spend>)

<1-paragraph context: what the user asked for, what was wrong with previous version, what new approach was.>

### M. <New rule headline>

<1-paragraph rule with specifics. Numbering continues from the previous iteration's last rule.> [01-chat-history.md#turn-N.K]

### M+1. <Next new rule>

...
```

Update the closing line to reflect the new addendum date.
