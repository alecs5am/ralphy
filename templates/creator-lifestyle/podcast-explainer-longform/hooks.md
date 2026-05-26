# Opening patterns — Podcast Explainer (long-form, faceless)

The first 15 seconds decides whether the viewer commits to a 10-20 minute video. In this format the audio carries the watch-time — but the *visual* in the first 15 seconds is what stops the scroll on YouTube's home feed thumbnail-and-autoplay.

8 patterns for the opening, each tied to a `quote-card-kinetic` recipe (the dominant opener) plus a fallback chapter-card pattern.

---

## 1. The thesis-quote opener

**Setup.** The speaker states the central claim of the essay in the first sentence. The opener visualizes that exact sentence as kinetic typography on a dark background, with the load-bearing noun emphasized.

**When to use.** Default. Works for any essay with a strong thesis statement in the first 5 seconds.

**Card design.** Full-screen `<quote-card-kinetic>`. Background: #0a0a0a. Text: Inter Bold 96-128px, white. Emphasis word: same font, accent color (cyan #00d4ff or amber #ffb800). Reveal: word-by-word stagger, 0.08s per word, ease-out.

**Examples.**
- "Claude 4.7 is the first model that **understands** my codebase."
- "Every faceless YouTube channel in 2026 looks **identical** — and that's the problem."

---

## 2. The contrarian opener

**Setup.** The speaker opens with a take that contradicts a widely-held belief. The visual hammers the contradiction.

**When to use.** Opinion essays, "everyone is wrong about X" videos, hot takes.

**Card design.** Two-line `<quote-card-kinetic>`. Line 1: the conventional belief (white, struck through in red at t+0.6s). Line 2: the contrarian claim (accent color, revealed at t+1.2s with a bounce ease).

**Examples.**
- Line 1: "AI agents will replace developers."
  Line 2: **"They will replace product managers first."**
- Line 1: "Long-form is dead."
  Line 2: **"Short-form is the bubble."**

---

## 3. The number opener

**Setup.** A single startling number opens the essay — a percentage, a dollar amount, a count. The rest of the chapter explains the number.

**When to use.** Data-driven essays, finance, growth-rate stories.

**Card design.** `<quote-card-kinetic>` with the number at 320-400px, Inter Black, accent color. Caption below the number in 56px Inter Regular white explains the unit ("Claude requests per day", "monthly churn rate", "average video length").

**Examples.**
- **300%** / "YoY growth of the faceless niche, 2025-2026"
- **$8,400** / "median monthly revenue per AI-narrated channel"

---

## 4. The question opener

**Setup.** The essay opens with a question the rest of the video answers. The card is the question, full-screen, with a slow reveal.

**When to use.** Curiosity-hook essays, mystery / investigation framings.

**Card design.** `<quote-card-kinetic>`, single line, Inter Bold 96-128px, white on near-black. No emphasis word. Reveal: typewriter, 0.04s per character. Hold for 2 full seconds after reveal — the dead-time forces the viewer to actually read it.

**Examples.**
- "Why did Anthropic ship 3 models in one quarter?"
- "What does Codex actually run under the hood?"

---

## 5. The screenshot opener

**Setup.** Skip typography entirely; open on a fullscreen screenshot that is the subject of the essay (a tweet, an error message, a benchmark chart). The audio explains what the viewer is looking at.

**When to use.** When the visual artifact *is* the story. A leaked Slack screenshot, a controversial tweet, a benchmark table.

**Card design.** Full-screen image with a subtle 0.3s scale-in from 1.05 → 1.0. No additional typography for the first 3 seconds. Then a single caption chunk appears (centered, white, Inter Bold 64px) summarizing what the viewer is seeing.

**Example.** Open on a fullscreen tweet by a known figure that makes a controversial claim. The audio: "this tweet kicked off a 48-hour fight on Hacker News about whether…"

---

## 6. The terminal opener

**Setup.** Dev-focused essays open with a literal terminal showing a command the audio is about to walk through.

**When to use.** CLI tools, dev workflow essays, infra postmortems.

**Card design.** `<terminal-window>` fullscreen. Typing animation enabled (~12 chars/sec, slight jitter on intra-line pauses). The command being typed is the one the audio mentions in the first 10 seconds. Theme: vscode-dark.

**Example.** Audio: "you run one command and ralphy does the rest." Terminal types `$ ralphy render my-project` and shows the output stream lighting up.

---

## 7. The "imagine if" opener

**Setup.** The speaker paints a hypothetical scenario. The visual is a `<quote-card-kinetic>` or a meme that anchors the hypothetical.

**When to use.** Speculative essays, "what if AGI" framings, possibility-space pieces.

**Card design.** Two-beat reveal. Beat 1 (t=0 to t=2s): the phrase "imagine if…" in 96px Inter Italic, low-saturation grey. Beat 2 (t=2s to t=4s): the hypothetical claim appears in 128px Inter Bold, full white, with a hard ease-in.

**Example.** "Imagine if every YouTube video you watched was generated 30 seconds before you opened it."

---

## 8. The chapter-card cold-open

**Setup.** No quote-card, no screenshot — just the first chapter-card. Works when the audio is doing the heavy lifting and the essay's title alone is provocative enough.

**When to use.** Sequel videos, follow-ups, episodic series. Also: very confident takes where the title-card *is* the hook.

**Card design.** `<chapter-card>` with `title` and `subtitle`. Title in Inter Bold 144px, white. Subtitle in Inter Regular 56px, accent color, below the title. Background: dark with a slow zoom-in (1.0 → 1.04 over 6 seconds — the entire chapter-card duration).

**Example.**
Title: "Why I'm switching from Cursor to Claude Code"
Subtitle: "Part 2 — six months in"

---

## Choosing between the patterns

The opener should be picked from the audio, not from a brand-style guide. Rough decision tree:

```
Does the first sentence of the audio state a strong thesis?
  └─ Yes → pattern 1 (thesis-quote)
  └─ No, but it contradicts a common belief → pattern 2 (contrarian)
  └─ No, but it cites a startling number → pattern 3 (number)
  └─ No, but it asks a question → pattern 4 (question)
  └─ No, but it references a specific artifact → pattern 5 (screenshot)
  └─ No, but it references a CLI command → pattern 6 (terminal)
  └─ No, but it starts with "imagine" / "what if" → pattern 7 (imagine-if)
  └─ Otherwise → pattern 8 (chapter-card cold-open)
```

The skill picks one automatically by running the LLM segmenter over the first 15 seconds of `captions.json` with this tree as the prompt context. The user can override on intake with `--opener thesis-quote|contrarian|number|question|screenshot|terminal|imagine-if|chapter-card`.
