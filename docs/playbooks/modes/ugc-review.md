# Mode quality playbook — `ugc-review`

> A talking-head creator review / testimonial of a product — the authentic UGC ad. Backing skill: [`/ugc-ad`](../../../.agents/skills/ugc-ad/SKILL.md) + register guideline [`photoreal-studio-portraits`](../../../guidelines/photoreal-studio-portraits/). Route: `intake → scenarist → art-director → editor → ralphy render`.

## Creative objective

Make a real-seeming person vouch for the product and have it land as trust, not as an ad. A UGC review wins on **felt authenticity**: a believable creator, a problem the viewer recognizes, a credible product moment, and an honest-sounding verdict that nudges a buy. If it reads as a polished brand spot, it has failed the mode — the whole point is "a person like me tried this." It is the casual, low-gloss end of the commercial spectrum (the premium end is [`tv-ad`](tv-ad.md)).

## Required inputs

- Product reference image (the registry declares `requiredRefTypes: ["product"]`).
- Optional: persona / archetype for the creator, hook angle, target language, duration.

## Reference requirements

The product ref is required as craft input so the product stays on-model in the creator's hands. The reference-required gate (AGENTS #3) additionally fires for a **named real brand product** ("CeraVe serum", "Dyson Airwrap") — refuse without a ref photo or a logged `--no-ref-consent`. A no-name / generic product proceeds with just the product ref. The creator is a synthetic persona: build a consistent non-existent person and lock a master portrait — do NOT face-mix toward a recognizable real human.

## Prompt spine

Hand the scenarist these five beats (default ~15-30s, 9:16). One idea per beat; the hook owns the first ≤3s.

| Beat | Role | What it does |
|---|---|---|
| **Problem mirror** | hook | Creator names the exact pain the viewer feels ("if your X keeps doing Y…"). Scroll-stopper; must land in ≤3s. |
| **Product proof** | body | The product shown in genuine use — the moment that makes the claim credible (the real result, not a logo beauty-shot). |
| **Mannerisms** | body | Human tells woven through: a glance away, a half-laugh, an "honestly", a hand gesture. This is where trust is built or lost. |
| **Objection handling** | body | The one doubt the viewer has ("I thought it'd be greasy / too expensive / a gimmick") answered honestly, including a soft caveat. |
| **CTA** | cta | Low-friction, casual ask — "link in bio", "you'll see", not a hard sell. |

- Photoreal creator: fold the [`photoreal-studio-portraits`](../../../guidelines/photoreal-studio-portraits/) six-token spine into the keyframe prompt — named camera + lens, film stock, 2-3 named imperfections, visible skin pores, single soft light, the `NOT glossy / not staged` register clause — plus its mandatory negative cluster (`beauty filter`, `enlarged eyes`, …).
- Each i2v beat needs a distinct physical action / expression change (a real start→end motion delta) or the clip reads static.

## Model recommendations

Verify against `MODELS.md` every run.
- **Script:** the scenarist LLM (`callLLM`) — feed it the product, the pain, the persona, the one honest objection.
- **Creator master + beat keyframes:** `openai/gpt-5.4-image-2` for the from-text master portrait of a new creator; `google/gemini-3-pro-image-preview` for beat anchors that must match the locked master via `--ref` (lower identity drift across angles). Generate 3-5 creator variants, pick the most real.
- **i2v:** `kwaivgi/kling-v3.0-pro` — the talking-head default; the only viable route for photoreal-human i2v (seedance's privacy filter blocks photoreal-human anchors, per `MEMORY.md`). Kling `--audio` carries EN VO + lipsync; non-EN VO via ElevenLabs (confirm target language — `MEMORY.md` Kling-no-RU-audio).
- **Music:** separate ElevenLabs Music pass, low instrumental bed or none, post-mixed in the editor — banned inside the Kling prompt; no artist names.
- **Captions:** per-beat on the locked VO; scribe-first timing (AGENTS #16).

## Style / visual constraints

- Handheld smartphone-UGC feel, eye-level, 9:16, natural indoor light — NOT a clean studio key, NOT a polished-ad grade. Polish is the tell that kills the mode.
- Mannerisms = trust; a too-perfect creator + studio-clean voice reads as an ad. Leave a touch of room reverb on the VO and a beat of natural imperfection in the delivery.
- Pass the locked creator master AND the product ref as `--ref` on every beat to prevent identity / product drift between cuts (`MEMORY.md` super-original-refs).
- One consistent setting across beats — generate a location master plate first.

## Common failure modes

- **Reads as a polished brand spot** → drop the studio grade, restore handheld framing + natural light + the imperfection cues; if the brief truly wants premium, it is [`tv-ad`](tv-ad.md), not this mode.
- **Beauty-filter creator face** → fold in the photoreal-studio-portraits six-token spine + its negative cluster.
- **No felt objection** → add the one real doubt + an honest caveat; a review with zero downside reads as a paid ad.
- **Static talking-head clips** → each beat carries a distinct expression / gesture motion delta.
- **Kling auto-music muddying the VO** → ban music in-prompt, post-mix a separate bed.
- **Creator drifts off-model between cuts** → re-anchor every beat on the locked master via `--ref`.

## Evaluation criteria

The native-video gate chain: `scoreScenario` → `scoreImage` → `scoreVideo` (each refuses, not warns — two fails in a row → stop and report concrete options; AGENTS #4). Benchmark set: **`product-ugc-review`**. Beyond the gates:
- **Product fidelity** — `ralphy eval fidelity <id>` (`cli/lib/eval/fidelity.ts`, #422): the commercial-mode product / brand identity gate. For a named real product a materially wrong product / logo / palette is a hard `fail` that blocks ship-ready.
- Authenticity read: does it feel like a real person, does the hook land in ≤3s, does the verdict sound honest (not scripted), do captions match the locked VO. Optional `/evaluator` post-render pass.

**Council emphasis** (`ralphy project council <id>`): weight the **performance-marketer** (does the hook stop the scroll and does the CTA convert) and **qa-evaluator** (does it actually feel authentic, or does it tip into ad-vibe) roles. The other five (strategist, niche-researcher, creative-director, art-director, editor) still vote, but this mode lives or dies on "does it convert / does it feel real."

## Does NOT apply to:

- A polished, premium broadcast commercial → that is [`tv-ad.md`](tv-ad.md) — the opposite end of the commercial spectrum (casual UGC trust vs. premium cinematic spot).
- A step-by-step how-to demo of the product → use [`tutorial-ugc.md`](tutorial-ugc.md) (also backed by [`/ugc-ad`](../../../.agents/skills/ugc-ad/SKILL.md)).
- An unboxing / first-impressions reveal → use [`unboxing-ugc.md`](unboxing-ugc.md) (backed by [`/ugc-unboxing`](../../../.agents/skills/ugc-unboxing/SKILL.md)).
- A long-form audio-driven faceless explainer → use [`podcast-video.md`](podcast-video.md).
- A static review graphic / testimonial card → match an image mode.
- Reproducing one specific review video → the remix path (`ralphy template use <slug>`).
