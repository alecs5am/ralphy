# Broadcast-realism aspect + palette

> **For the LLM choosing aspect ratio and grade before drafting a generate
> prompt.** Two cross-cutting defaults that change how real an output feels:
> aspect for "caught on TV" trends, and a palette bias away from neon.

## Aspect: "caught on TV" trends read more real at 1:1 square

When the *premise* of the content is "this was captured on a real broadcast
camera" — a sports cam, a news cam, a stadium audience-cam, a talk-show cam —
default to **1:1 square**, not strict 9:16 portrait, even though the platform is
9:16-native.

**Why:** real broadcast cameras shoot 16:9. A strict 9:16 portrait crop of a
stadium or broadcast scene feels artificially tall and trips the viewer's
"AI-generated" detector. A 1:1 square splits the difference and reads as a
believable broadcast capture. Letting the video stay square and pillar-padding
to 9:16 in the composition can even *amplify* the broadcast feel — the black
bars look like a clip someone reposted from TV.

**How to apply:**
- Generate the first frame square via `openai/gpt-5.4-image-2` (which rounds size
  hints to 1024² anyway) → the i2v model honours the square anchor regardless of
  an `--aspect-ratio 9:16` flag.
- Only force strict 9:16 if the cut genuinely needs it for the feed; even then,
  prefer pillar-padding a square master over a tall crop.
- Conversely, for content whose premise IS portrait (studio-shot lifestyle,
  influencer portrait-camera, mobile-phone POV), force 9:16 explicitly — use
  `google/gemini-3-pro-image-preview`, which honours the `--size` hint and gives
  a real 9:16 (768×1376).

Does **NOT** apply to:
- 9:16-native niches — TikTok selfie UGC, talking-head creator content,
  lifestyle / influencer portrait setups, mobile-phone POV. The premise is
  portrait, so portrait is realistic.
- Studio-shot content, fashion campaigns, photoshoot recreations — these read
  better in 9:16 or 3:4.
- Cinematic narrative shorts with intentional wide framing — use the aspect the
  story demands.
- Any brief where the user explicitly asks for 9:16 / 16:9 — defer to the
  explicit ask. This is a default for the broadcast-cam niche, not a global
  override.

## Palette: default to natural / muted, not neon

As a cross-cutting default for image and video grades, reach for **natural full
color, muted / film grades, or restrained accent lighting** — not magenta-cyan /
electric-neon washes. Neon reads as cheap and over-processed in most registers,
and on moody / horror / PS1 / doomer material specifically it undercuts the mood.

**How to apply:** when picking or offering a color grade, lead with the natural
or film-graded option. Do not offer "neon" as a default variant. For VHS /
chromatic-split looks, a red/cyan channel bleed reads as authentic broadcast;
magenta/green reads as a synthetic neon filter — prefer red/cyan.

Does **NOT** apply to: a brief that explicitly asks for neon, or source material
that is inherently neon (a named neon-sign trend, a club / rave reference the
user supplied). Then honour it.
