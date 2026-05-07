# Hook formulas

Hook = the first 1-3 seconds. If the viewer doesn't stop, nothing else matters. Source of truth: `workspace/hooks/HOOK_LIBRARY.md` (created in Sprint 2.2).

## 5 formats (angle)

Top-level scenario `angle` — one of:

1. **testimonial** — UGC form "I tried it and here's what happened". First-person POV.
2. **unboxing** — unboxing / first-look. Build-up to the reveal.
3. **problem-solution** — 5s of pain + 10s of solution. Classic ad shape.
4. **comparison** — A vs B (old/new, competitor/us, dumb/smart).
5. **demo** — product demo in action, no distractions.

## 4 hook angles (how exactly to hook)

1. **Gatekeep** — "no one will tell you this, but...". Insider knowledge.
2. **Skeptic** — "I didn't believe it until I tried it myself". Conversion arc.
3. **Fail** — "here's how NOT to do it". Anti-pattern attention.
4. **Visual shock** — open with impact (explosion, unexpected angle, surprise frame).

## Hook formulas (≤10 words)

### Gatekeep
- "Nobody talks about <X>, but..."
- "I stumbled on this trick by accident..."
- "Want to know how <X> really works?"

### Skeptic
- "I didn't believe it until I tried it"
- "Thought it was a scam, turned out..."
- "First I laughed, then I lost it"

### Fail
- "Don't do it like this — I already did"
- "Here's how NOT to do it"
- "I made the mistake so you don't have to"

### Visual shock
- open on an extreme angle / smash-cut
- "Watch what happened when I..."
- "What even is this?!"

### POV
- "POV: you're <situation>"
- "POV: I'm <age>, I'm <state>"
- "POV: <brand> launches in Russia"

## Word budget

**2.5 words per second** — TTS pacing for deadpan delivery. That means:

- Hook (3s) ≤ 7-8 words
- Scene (5s) ≤ 12-13 VO words
- Whole 15s video ≤ 35-37 VO words total

If the scenario doesn't fit the word budget — cut. Long VO gets compressed by TTS and sounds rushed.

## Banlist (ad-speak)

These words automatically tank conversion in UGC form (they sound like ads):

- "unique", "revolutionary", "innovative"
- "don't miss your chance", "limited offer"
- "market leader", "number one"
- "contact us today", "call now"
- "high-quality", "professional" without specifics

Replace with specifics: "unique" → "the only one who..."; "high-quality" → "survived X tests" / "lasted Y years".

## A/B variants

In scenario.json:

```json
{
  "hook": {
    "primary": "Nobody talks about X, but...",
    "variant_b": "Thought it was a scam, turned out..."
  }
}
```

Variant B renders as a separate scene-01 — the final mp4 has two cuts if the user wants to A/B test.

## Quality

Checked before handoff (`scoreScenario`):
- `hook.primary` exists, ≤10 words
- `angle` ∈ {testimonial, unboxing, problem-solution, comparison, demo}
- First scene ≤ 3s

If fail — iterate. See [`quality-gate.md`](quality-gate.md).
