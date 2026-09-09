# Mode quality playbook — `tv-ad`

> A polished, broadcast-grade commercial spot — a multi-scene cinematic ad. Backing skills: [`/ugc-rockstar`](../../../.agents/skills/ugc-rockstar/SKILL.md) (cinematic style overlay) + [`/researcher`](../../../.agents/skills/researcher/SKILL.md); register guidelines [`broadcast-realism-aspect`](../../../guidelines/broadcast-realism-aspect/), [`cinematic-90s-film`](../../../guidelines/cinematic-90s-film/), [`oldspice-absurd-spokesman`](../../../guidelines/oldspice-absurd-spokesman/). Route: `intake → scenarist → art-director → editor → ralphy render` (the registry chain adds `researcher` up front and `producer` as the end-to-end wrapper; `defaultResearchDepth: deep`).

## Creative objective

Sell the brand on a single big idea, executed to a premium finish. A TV ad wins on **one memorable brand idea + cinematic craft**: a concept that earns the spot, a controlled cinematic look held across every scene, a hero moment for the product, a proof beat, and an end card that lands the brand. It is the polished, high-gloss end of the commercial spectrum — the opposite of the casual creator review ([`ugc-review`](ugc-review.md)). Production value is a feature here, not a tell.

## Required inputs

- Brand / product reference (the registry declares `requiredInputs: ["brand / product reference", "ad concept"]`).
- Ad concept — the big idea the spot is built around.
- Optional: script direction, voiceover language, music brief, duration.

## Reference requirements

The brand / product ref is required so the hero stays on-model and brand-true. The reference-required gate (AGENTS #3) fires for the **named real brand / product** the spot advertises — pass the product / logo as `--ref` on every scene. Cinematic register is a **hard look-lock** (`guidelineOrStyleLock.required: true`): pick the matching guideline up front — [`broadcast-realism-aspect`](../../../guidelines/broadcast-realism-aspect/) (caught-on-camera realism / aspect + palette), [`cinematic-90s-film`](../../../guidelines/cinematic-90s-film/) (35mm film-print register), or [`oldspice-absurd-spokesman`](../../../guidelines/oldspice-absurd-spokesman/) (comedic high-key spokesman) — and fold its rules into every prompt. `deep` research is the default: site-ground the brand (AGENTS #15) before drafting brand-DNA.

## Prompt spine

Hand the scenarist these five beats (default ~15-30s; aspect per the chosen guideline — broadcast-realism may favor 1:1 square pillared into the feed, cinematic may go 16:9 / letterboxed). Each scene is a deliberate cinematic setup, not a casual handheld shot.

| Beat | Role | What it does |
|---|---|---|
| **Brand idea** | hook | The one concept the spot is built on, stated as an opening image that earns attention. The big idea must be legible in the first scene. |
| **Cinematic setup** | body | Establish the world to spec — locked look, controlled light, composed framing. The register guideline drives every token here. |
| **Product hero** | body | The hero moment: the product rendered correctly and shown at its best, the visual the brand wants remembered. |
| **Proof** | body | The reason-to-believe beat — demonstration, result, or claim made credible within the cinematic world. |
| **End card** | cta | Brand lock-up: wordmark / logo + tagline + the takeaway. Clean typography that reads instantly. |

- Lock a brand / spokesman / hero master shot and pass it as `--ref` on every scene — identity / brand drift between cuts is the #1 quality killer (`MEMORY.md` super-original-refs).
- The **first frame is the hook** — the brand idea must read in the opening beat; design the opener as a deliberate scroll-stop, not a warm-up.
- For the end-card wordmark, prefer a typography-capable model so the brand lock-up reads crisply.

## Model recommendations

Verify against `MODELS.md` every run.
- **Script:** the scenarist LLM (`callLLM`) — feed it the brand idea, the proof point, the chosen register.
- **Scene keyframes / hero + end card:** `openai/gpt-5.4-image-2` for crisp baked typography (end-card wordmark, on-screen brand text) and from-text masters; `google/gemini-3-pro-image-preview` for multi-ref identity / brand lock across scenes once a master exists (per the cinematic / spokesman guideline model tables).
- **i2v:** `kwaivgi/kling-v3.0-pro` for photoreal-human / spokesman motion + `--audio` (EN only); `bytedance/seedance-2.0` for stylized / non-default-physics / camera-move motion (`MEMORY.md` VG-model-picks). Pick per the motion the scene demands; seedance rejects photoreal-human anchors.
- **Music:** the cinematic bed is a feature — a separate ElevenLabs Music pass (genre + tempo + instrumentation, no artist / producer names), post-mixed in the editor; banned inside the i2v prompt.
- **Captions / end-card text:** baked typography on the end card; any aligned VO captions use scribe-first timing (AGENTS #16).

## Style / visual constraints

- Hold ONE cinematic register across the entire spot — pin it from the chosen guideline (broadcast-realism aspect + palette / 35mm film-stock cluster / high-key spokesman) and do not mix grades mid-spot.
- Controlled light + composed framing every scene — this is the polished end of the spectrum; a handheld UGC feel is wrong here.
- Pass the brand / hero `--ref` on every scene to keep the product and identity true.
- No neon / vulgar grades by default (`MEMORY.md` no-neon-vulgar) — lean on the guideline's palette.
- Keep the end-card wordmark legible; mushy brand text fails the spot.

## Common failure modes

- **No single big idea** → the spot becomes a montage of pretty shots; restate the brand idea in beat 1 and make it legible.
- **Register drifts mid-spot** → re-pin the chosen guideline's tokens on every scene; mixing grades breaks the cinematic illusion.
- **Brand / product off-model between cuts** → re-anchor every scene on the locked master via `--ref`.
- **Mushy / illegible end-card wordmark** → switch the typography-bearing frame to `openai/gpt-5.4-image-2`.
- **Weak opener** → the brand idea must hook in the first frame; redesign the opening beat as a deliberate scroll-stop.
- **i2v auto-music fighting the bed** → ban music in-prompt, post-mix the cinematic bed separately.

## Evaluation criteria

The native-video gate chain: `scoreScenario` → `scoreImage` → `scoreVideo` (each refuses, not warns — two fails in a row → stop and report concrete options; AGENTS #4). Beyond the gates:
- **Product / brand fidelity** — `ralphy eval fidelity <id>` (`cli/lib/eval/fidelity.ts`, #422): for the named real brand a materially wrong product / logo / palette is a hard `fail` that blocks ship-ready.
- **First-frame hook** — the brand idea reads in the opening beat (deep-vision / `/evaluator` retention check); a spot that does not stop the scroll in scene 1 fails the premium brief.
- Craft read: the register is held and clean across scenes, the hero moment lands, the end card is legible.

**Council emphasis** (`ralphy project council <id>`): weight the **creative-director** (is the brand idea strong, is the concept worth the spot) and **art-director** (is the cinematic craft / register / hero execution premium) roles. The other five (strategist, niche-researcher, editor, performance-marketer, qa-evaluator) still vote, but this mode lives or dies on "is the idea good and is the craft premium."

## Does NOT apply to:

- A casual, low-gloss creator review / testimonial → that is [`ugc-review.md`](ugc-review.md) — the opposite end of the commercial spectrum (premium cinematic spot vs. authentic UGC trust). A handheld, imperfect, "person like me" feel belongs there, never here.
- A step-by-step how-to demo → use [`tutorial-ugc.md`](tutorial-ugc.md).
- An unboxing / first-impressions reveal → use [`unboxing-ugc.md`](unboxing-ugc.md).
- A surreal still campaign key-visual (no motion) → [`conceptual-product.md`](conceptual-product.md).
- A clean product packshot / catalog still → [`product-shot.md`](product-shot.md).
- Reproducing one specific commercial → the remix path (`ralphy template use <slug>`).
