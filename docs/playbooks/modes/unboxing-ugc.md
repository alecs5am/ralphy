# Mode quality playbook — `unboxing-ugc`

> An unboxing / first-impressions UGC video revealing a product from packaging. Backing skill: [`/ugc-unboxing`](../../../.agents/skills/ugc-unboxing/SKILL.md). Route: `intake → scenarist → art-director → editor → ralphy render`.

## Creative objective

Sell the reveal and the tactile credibility. Unboxing wins on **the reveal moment + believable touch**: the viewer must believe a real hand is touching a real object. Hands-only or over-shoulder framing, macro detail on textures and seams, and crisp ASMR-register SFX do more for retention than any VO line. Hook in the first ~1.5s with the still-sealed box and a tension line.

## Required inputs

- Product reference.
- Packaging reference.

## Reference requirements

A no-name / generic product proceeds without a brand ref, but the product + packaging are needed as craft inputs so the reveal stays on-model. The reference-required gate fires for a **named real brand item** ("Dyson Airwrap") — refuse without a ref photo or a logged `--no-ref-consent`.

## Prompt spine

Hand the beat structure to the scenarist (default ~15-25s, 9:16):

| Beat | Role | ~Duration | What it does |
|---|---|---|---|
| Sealed-box hook | hook | 1.5-3s | Box closed, hands entering, tension line. Scroll-stopper. |
| The open | body | 2-4s | Peel / cut / lid-lift. SFX carries it — VO optional. |
| Reveal | body | 2-4s | First full look, lifted toward camera. The payoff. |
| Detail macro | body | 3-6s | Close textures / materials / the one feature worth buying for. |
| Reaction / verdict | body | 2-4s | Genuine reaction; one honest opinion line. |
| CTA | cta | 1.5-3s | Where to get it / engagement bait. |

- Keep the hook ≤3s regardless of total length.
- Each i2v beat is a distinct physical action (peel, lift, rotate) with a real start→end motion delta, or clips read static.
- Generate a surface / location master plate first so every beat matches.

## Model recommendations

Verify against `MODELS.md` every run.
- **Keyframes:** `google/gemini-3-pro-image-preview` for product + hands anchors.
- **i2v:** `kwaivgi/kling-v3.0-pro` — hand-on-object motion + tactile micro-gestures are its strength.
- **VO:** Kling `--audio` for EN; ElevenLabs for non-EN (confirm target language).
- **SFX:** the star — tape peel, cardboard, plastic crinkle, the product's own click/snap (ASMR-leaning). VO is sparse (1-2 honest lines max).
- **Music:** low instrumental bed or none, separate ElevenLabs post-mix; banned inside the Kling prompt.

## Style / visual constraints

- Hands-only, top-down or over-shoulder onto a clean surface; face optional.
- Lens: 35-50mm wide; push to macro (85-100mm, shallow DOF) for the detail beat.
- Soft key + fill with a slight specular highlight to read material; avoid flat phone-flash.
- Anti-AI-slop on hands: skin texture, slight asymmetry, natural knuckle / nail detail.

## Common failure modes

- **Narrating the open** → let SFX carry it; VO only on hook + verdict.
- **Static reveal clips** → each beat a distinct hand action with a motion delta.
- **Surface changes between beats** → master plate first.
- **Flat phone-flash light** → soft key + fill + specular highlight.

## Evaluation criteria

`scoreScenario` → `scoreImage` → `scoreVideo` gates (each refuses, not warns). Beyond the gates: the reveal lands, hands read real, SFX is crisp and close, materials read at macro, hook ≤3s. Optional `/evaluator` post-render pass.

## Does NOT apply to:

- A talking-head review / testimonial → that is `ugc-review` (`/ugc-ad`).
- A step-by-step how-to → use [`tutorial-ugc.md`](tutorial-ugc.md).
- A polished broadcast commercial → that is `tv-ad`.
- A static product still / packshot → match an image mode.
- Reproducing one specific unboxing video → the remix path (`ralphy template use <slug>`).
