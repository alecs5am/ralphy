# Interview / Dialog — vibe / format reference

**Genre:** synthetic two-person dialog — expert+interviewer, peer discussion, split-screen reaction, or podcast-style sit-down.
**Length:** 30-90s.
**Format:** TikTok / Reels / Shorts, 9:16, 30fps, 1080×1920.

> **Reference-required gate.** If either speaker is a real named person (real journalist, real CEO, real handle), a reference (photo / handle / archive) MUST exist at `workspace/projects/<id>/assets/uploaded/`. Without it, `/ralph-art-director` refuses (AGENTS.md hard rule #3). AI-improvised likeness of a real person is never acceptable — even "just for a joke" — and the model will always read as fake. Archetype briefs ("a journalist", "a fitness coach") do not require a reference.

> **Distinct from `podcast-clip`.** `podcast-clip` cuts FROM a real long-form podcast you supply (Joe Rogan, Lex, etc.) — it's "I have 60 minutes of source, give me a 60s clip". This template is "I want to GENERATE a 60s synthetic interview from a written script". If the user has a real source, route to `podcast-clip`, not here.

## Why this works

The single-speaker talking head is exhausting after 15 seconds. A two-person dialog refreshes the eye and ear on every turn:

1. **Overheard-conversation feels less ad-y.** Viewers tune out when the camera talks AT them. Two people talking to each other = the viewer is the eavesdropper, not the target.
2. **Two voices = retention boost via novelty.** Every speaker switch is a free attention reset. Three turns in 30s is three resets.
3. **"Expert says X" = built-in authority.** The interviewer asks what the viewer is already thinking; the expert validates the claim. Social proof baked into the format.
4. **Question pose hooks better than statement.** "Wait, you actually X?" pulls a viewer in faster than "I want to tell you about X."

## Vibe anchors

- **Two distinct voices.** Different ElevenLabs voice IDs, gender or timbre contrast. If both speakers sound similar, listeners lose track of who's talking — kills the format.
- **Shot alternates between speakers.** Not a static split-screen for 60s straight (boring) — cuts on the speech turn. Even in `split-screen-static` mode, lower-third caption color flips so the eye knows who's "active."
- **2-shot anchor at the start.** First 2-3 seconds shows both speakers in the same frame (or both halves of a split). After that, you can cut between them — the viewer remembers the pairing.
- **B-roll mid-dialog when topic gets visual.** When the expert says "look at this chart" or "here's the product" — cut to a 5-10s `kling-v3.0-pro` cutaway. Visual variety, not just two faces.
- **Real-feeling exchanges.** Reactions ("hmm", "really?", brief laughs) between the major turns sell the conversation. Don't write a flat Q-then-A-then-Q.
- **AI-disclosure when synthesized.** Small "AI-generated" overlay top-right for the full duration when both speakers are AI avatars. Not optional — it's the difference between a stylish format and a deepfake.

## Variation axes

| Axis | Options |
|---|---|
| Format mode | expert-interview / peer-discussion / split-screen-reaction / podcast-style |
| Turn count | 3-12 alternations (a "turn" = one speaker's utterance) |
| With-cutaway b-roll | yes (5-10s mid-dialog visual) / no (pure dialog) |
| Camera language | single-camera-cuts / split-screen-static / podcast-2-cam-setup |
| VO language | any — English, Russian, Spanish, etc. The dialog rhythm carries regardless. |

## Narrative arc

```
0-3s    → 2-shot establish. Both speakers visible. First question / setup line.
3-70s   → Alternating turns. Question (3-6s) → answer (5-12s) → reaction (1-3s) → next question.
          Mid-section: optional 5-10s b-roll cutaway when the topic goes visual.
70-90s  → Closing. Punchline, mic-drop line, or shared takeaway. Often a 2-shot again.
```

For a 30s version: skip the b-roll, keep 3-4 turns. For a 90s version: 6-12 turns + one b-roll cutaway.

## Required user inputs

1. **Dialog script** — Person A and Person B turns, in order. Plain text, one turn per line, prefixed `A:` or `B:`.
2. **Persona archetypes** — for each speaker (e.g. "30s male journalist, casual blazer, neutral office" / "40s female CEO, structured dress, modern boardroom").
3. **Format mode** — expert-interview / peer-discussion / split-screen-reaction / podcast-style.
4. **Voice IDs** — TWO distinct ElevenLabs voice IDs, one per character. Pick by archetype + gender contrast for clarity. (Default suggestion: pick from the ElevenLabs library by listening, not from memory — voice IDs in `MODELS.md` may be stale.)
5. **(Optional) Reference** — REQUIRED only if either speaker is a real named person. Refuse without it.
6. **(Optional) VO language** — defaults to English; works in any language.

## Reference-required gate (hard refuse)

If the brief names a real person (real journalist, real CEO, real handle, real influencer) without a file at `workspace/projects/<id>/assets/uploaded/<person-ref>.<ext>`:

> "The brief mentions '<person>'. I won't synthesize a likeness of a real named person without their explicit reference and your sign-off — even for an interview format. Either: (a) drop a reference + confirm consent, (b) rephrase as an archetype ('a tech journalist', 'a venture capitalist'), or (c) explicitly say 'generate without reference, I understand the quality will be worse' and I'll log a no-ref-consent note. Otherwise this would ship as AI-slop with hallucinated likeness."

For archetype briefs ("a journalist interviewing a CEO"), no reference is needed — generate two consistent character keyframes via gemini-3-pro and proceed.

## AI-disclosure note

When both speakers are AI-synthesized (no real people), composition adds a small "AI-generated" overlay top-right, full duration. This is not optional. The format is convincing enough that without disclosure it edges into deepfake territory, and the platform-trust hit is bigger than the aesthetic cost. The overlay is small, low-opacity, and reads as a watermark — does not interfere with the content.

## When NOT to use

- **Real long-form source exists** → use `podcast-clip` instead. This template generates from a written script; if you have a 60-min Joe Rogan to cut from, that's a different pipeline.
- **Single-speaker monologue** → use `yap-talking-head` (rapid energetic monologue) or `storytime` (narrative arc, one voice). The two-voice format adds nothing if there's only one perspective.
- **Real named people without references / consent** → refuse. Even if "the user said it's fine." Hard rule.
- **More than 2 speakers** → not this template. Three-person panel videos need a different model-stack and shot grammar.
- **Length > 120s** → the synthetic format starts to read as fake past two minutes. Cap at 90s.

## Cost ballpark

| Stage | Detail | Cost |
|---|---|---|
| Character keyframes | 2 × `gemini-3-pro-image-preview` @ $0.15 | ~$0.30 |
| Dialog clips | 4-8 × `wan-25` (audio-synced) per turn | ~$2.00 - $4.00 |
| B-roll cutaway (optional) | 1 × `kling-v3.0-pro` × 5-10s @ $0.14/s | $0.70 - $1.40 |
| VO | 4-12 ElevenLabs calls (subscription) | $0 |
| Music | 1 ElevenLabs Music call (subscription) | $0 |
| Captions | 1 × Scribe v1 | ~$0.005 |
| Render | local | $0 |
| **Total** | | **~$2.30 - $5.70** |

Mid-cost format — driven by per-turn `wan-25` calls. More turns = more cost.

## Read also

- `hooks.md` — 12 interview-dialog opens with format-mode fit + audio cue + niche.
- `prompt-cookbook.md` — master template, two-character consistency recipe, turn-pacing, camera language, voice pairing, captions, b-roll cutaway, music, AI disclosure, mistakes, 4 worked examples.
