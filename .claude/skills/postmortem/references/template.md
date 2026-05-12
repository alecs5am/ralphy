# POSTMORTEM.md template

This is the canonical structure. Fill every section from real session evidence. Section order matters — TL;DR first because that's the only thing some readers will read.

---

## Frontmatter (top of file)

```markdown
# <Project name> — Postmortem & Best Practices

End-to-end pipeline log for `<project-id>`. Written after delivery so the next <project-type> project takes ~half the iterations.

**Final spend:** ~$X (image $A · video $B · music ... · render free)
**Final winner:** `<filename.mp4>` (which variant, why)
**Total iterations vs. minimum-viable:** ~Nx over (could have been Mx with discipline below)
```

The 3 bold lines are the elevator pitch — must be true and computable from gen-log.

---

## Section 1 — TL;DR: N rules I learned the hard way

Numbered list of 8-12 rules, each one a single short paragraph. Each rule MUST be tied to a real moment in the session. Format:

```markdown
1. **<One-line rule headline.>** <2-3 sentences: the specific moment where this rule was forged + the cost of not having it. Reference the exact iteration count, $ wasted, or # of retries.>
```

Bad rule: "Always use references when generating images."
Good rule: "**Pull canonical product imagery BEFORE generating.** The first 8 shots used wrong colors because I trusted memory instead of `<brand-site>`. User had to drop reference screenshots to fix it — that's $1.60 of avoidable spend on a v2 redo."

---

## Section 2 — Pipeline I would run from scratch

A flat code-block showing the corrected phase order with concrete CLI commands and the rough time budget for each phase. Include a 1-line "minimum-viable spend" estimate at the bottom.

```markdown
\`\`\`
1. Research      (5-10 min)
   ├─ ralphy ref pull ...
   └─ ...

2. Storyboard    (10 min)
   ├─ Write STORYBOARD.md
   └─ Get explicit user "go" before phase 3.

3. Stills        (10 min in parallel)
   ├─ ...

[etc — 6-8 phases total]
\`\`\`

**At 1.5× minimum iterations,** total spend ≈ $X-Y.
```

---

## Section 3 — Model picks

Tables grouped by media type. Each row: use case, model, why it won *in this session*, cost.

```markdown
### Image generation

| Use case | Model | Why | Cost |
|---|---|---|---|
| **Product fidelity** (real device, branding, internals) | `openai/gpt-5.4-image-2` | Holds brand text + correct topology | $0.20 |
| **Photoreal humans** | `google/gemini-3-pro-image-preview` | Best photoreal — needs "documentary photography, 50mm prime, ISO 1600 grain" cues | $0.15 |
| ... | ... | ... | ... |

### Video generation

| Use case | Model | Why | Cost |
|---|---|---|---|
| **Hyper-motion / explosions** | `bytedance/seedance-2.0` | Sharp physics — handles violent motion + screen-shake | $0.14/s |
| ... | ... | ... | ... |
```

If a model FAILED in a specific predictable way, add a "Discovered breakage" callout below the table:
```markdown
**Discovered breakage to be aware of:**
- `<model>` + `<flag combo>` → reliably <error mode>. Workaround: <fix>.
```

---

## Section 4 — Prompt patterns that worked

3-5 verbatim prompts that produced winners, each one labeled with the scene/slot it was used in. Wrap in markdown code blocks. Don't paraphrase — copy-paste from the actual session.

```markdown
### Image: <category> (used for scene-XX)

\`\`\`
<verbatim prompt text>
\`\`\`

Key tokens that made the difference: <2-3 phrases that unlocked the result>.
```

---

## Section 5 — Pitfalls I hit

A table with concrete columns. Every row must come from a real failure in this session.

```markdown
| Pitfall | Cost | Prevention |
|---|---|---|
| Generated 8 product shots before locking storyboard | $1.20 wasted | Lock storyboard BEFORE any image gen. |
| ... | ... | ... |
```

---

## Section 6 — Open issues to file

Numbered list of bugs, playbook gaps, or CLI feature requests surfaced in this session. Each one written so it could become a GitHub issue body verbatim.

```markdown
1. **<short title>**: <repro + root-cause hypothesis + suggested fix>. <file path or component to investigate>.
```

---

## Section 7 — Composition tricks that paid off

Bullet list of Remotion / ffmpeg / editing patterns that worked. Specific to media projects — skip this section for non-media work.

```markdown
- **<pattern name>** — <when to use it, what problem it solves>.
```

---

## Section 8 — $ accounting (this project)

Two parts: itemized table + bottom-line summary.

```markdown
| Phase | Items | $ |
|---|---|---|
| Reference pull + vision analyze | 1 video, N frames | ~$0.01 |
| Product shots v1 (model X) | 8 shots | $A |
| ... | ... | ... |
| **TOTAL** | | **~$X** |

**Minimum-viable run** if I followed the rules above from start: ~$Y (saved on <specific phase to skip>).
```

Compute from `workspace/projects/<id>/logs/generations.jsonl`. If gen-log is incomplete, note that and estimate.

---

## Section 9 — Final delivery files

A tree showing what shipped. Brief annotations on each.

```markdown
\`\`\`
workspace/projects/<id>/
├── render/
│   ├── final.mp4                 (1080×1920, 15s, music-X — WINNER)
│   ├── final-music-a.mp4         (...)
│   └── ...
├── STORYBOARD.md                 (locked v1)
├── POSTMORTEM.md                 (this file)
├── assets/
│   ├── images/                   (N stills)
│   ├── videos/                   (M clips)
│   └── music/                    (K variants)
└── refs/                         (canonical + user-supplied)
\`\`\`

Composition at `src/videos/<id>/{scenes.ts, index.tsx}`, registered as `<CompId>` in `src/Root.tsx`.
```

---

## Closing line

```markdown
*Written <YYYY-MM-DD>. Re-read this before the next <project-type> project — every rule above came from a real iteration cost.*
```

---

# Iteration N addendum (added later)

When the same project gets another iteration round, append a section at the end (before the closing line). Structure:

```markdown
---

## Iteration N addendum — <what changed> ($X, <one-line insight>)

<1-paragraph context: what the user asked for, what was wrong with the previous version, what the new approach was.>

### M. <New rule headline>

<1-paragraph rule with specifics. Numbering continues from where the previous rules left off.>

### M+1. <Next new rule>

...

### Updated $ accounting (post-iteration N)

| Phase | $ |
|---|---|
| Image gen (cumulative) | $A + $A' = $A_total |
| Video gen (cumulative) | $B + $B' = $B_total |
| ... |
| **Project total** | **~$total** |

vs **disciplined minimum-viable run target: ~$Y**

The $Z overspend traces to:
- $... <line per source of overspend>
- $... avoidable / genuine iteration breakdown
```

After the addendum, update the closing line:
```markdown
*Written <YYYY-MM-DD>. Iteration N addendum added <YYYY-MM-DD>. Re-read this before the next <project-type> project — every rule above came from a real iteration cost.*
```
