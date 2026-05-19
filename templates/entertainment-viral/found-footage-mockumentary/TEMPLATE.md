# Found-Footage Mockumentary — Template

> **Postmortem absent — TEMPLATE.md is structural only. Run `/postmortem` on the next project that uses this template to start building the lived-experience rules section.**

The source project (`occult-mockumentary-001`) shipped a final render but never had a postmortem run against it. Every rule below is reconstructed from the gen-log + scenario notes, not from "rules I learned the hard way" lived-experience prose. The TEMPLATE.md is therefore lighter than a postmortem-backed sibling like `analog-horror-psa` — no "Key rules" section, no "Workflow" ordered list, no anti-pattern annotations from regen scars. Future projects using this template should `/postmortem` immediately on completion and feed their lessons back in.

## Vibe

First-person handheld occult / cryptid mockumentary in the voidstomper / analog-horror lineage. POV operator stumbles on something they shouldn't have filmed — cult-circle discovery, photo-flash beat, the impossible "they're now facing me" turn, retreat, and a final monster reveal. Pure diegetic English captions (3 max, lower-third), no VO, persistent REC dot + timecode + low-battery HUD overlay (Act 1), with a diegetic style-break to clean cinema register for the Act-2 reveal.

Tonal anchors:

- **First-person handheld only.** No operator face, no operator body. Only camera UI and an occasional gloved hand at the bottom of the frame.
- **REC dot + timecode + low-battery HUD overlay** persistent top-corners in Act 1. Diegetic, not stylized.
- **Diegetic captions in `{{target_language}}` only**, 3 max in a 40s cut (one establish-beat, one peak-beat, one end-card). No VO.
- **`seedance-2.0` for non-default physics motion** (per cross-project memory `feedback_vg_model_picks.md`) — instant teleport-state turn, frozen-statue cultists during retreat, jump-scare lunge. Kling for default-physics POV walking only.
- **The horror is stillness, not motion.** Cultists are frozen statues. Animating the turn breaks the spell.

## Beat structure

Compressed Hollywood horror micro-arc, 5-7 clips over 30-45s.

| % of runtime | Beat | Emotional intent | Camera grammar |
|---|---|---|---|
| 0-12% | **Approach** | curiosity > unease | forward POV walk, phone-torch cone, distant flicker through trees |
| 12-30% | **Discovery (cult circle)** | awe-fear, illicit watching | tree-cover peek, slight forward creep, foreground bokeh, no motion in distance |
| 30-50% | **Photo + The Turn** | spike — they know you're here | gloved hand raises camera → shutter → white flash → cultists are now facing camera (instant teleport-state, ZERO body rotation) |
| 50-65% | **Backing away** | active dread, escape impulse | panic-shake backward retreat, foreground branches whip past, cultists shrink in frame but DO NOT MOVE |
| 65-80% | **Sound behind** | dread peak, body-cold | camera stops, wet crunch + multi-foot step audio, agonizingly slow whip-pan to look behind |
| 80-100% | **Monster reveal** | catatonic horror, smash to black | clean cinema register (diegetic break — camera fell), static-then-lunge or static-then-stalk reveal, VHS signal-loss glitch, `SIGNAL LOST` end card |

## Required inputs

| Slot | What it is | Example value from `occult-mockumentary-001` |
|---|---|---|
| `{{target_language}}` | Language for the 3 diegetic captions and end card. No VO. | English |
| `{{subject_creature}}` | The Act-2 monster. Reference-required (user supplies 2-3 anatomy PNGs). | Body-horror humanoid hybrid — splayed-ribcage torso, brassy-tentacle-ring eyeball head, cyst-cluster shoulders |
| `{{cult_location_descriptor}}` | Where the discovery + reveal happen. Drives every master shot's environment block. | Dense black pine forest at night, ritual clearing with small bonfire |
| `{{handheld_persona}}` | The unseen operator's apparent identity. Drives the gloved-hand frame, the on-screen camera device, and the implied "why are they here". | Anonymous amateur hiker with a Canon Sure Shot point-and-shoot and a phone-torch — face never shown |

## Anti-patterns

DO NOT animate the cultist body-rotation turn, because kling-v3.0-pro produces a slow physical head/torso rotation that breaks the uncanny "instant teleport-state" beat. Use seedance-2.0 and explicit prompt language: "INSTANT TELEPORT-STATE, NOT animate. Before flash: 100% backs to camera. During flash: pure white frame. After flash: 100% facing camera, perfectly still."

DO NOT have cultists step / walk / chase, because the horror lives in their utter stillness — the operator retreats and the cultists shrink in frame *because the camera moves*, not because they advance. "They simply stand and stare frozen" must appear in every cultist clip's prompt.

DO NOT prompt ElevenLabs for "horror score" or "cinematic music" for the ambient bed, because that triggers the music classifier and returns a melody you didn't want. Prompt for "sustained sub-bass drone, distant choral hum, NO music NO melody NO rhythm NO percussion NO singing" — ElevenLabs returns clean sound-design audio when banned this hard.

DO NOT add a stylized kinetic-typography title slam or chyron, because the diegetic rule requires every overlay to justify itself in-world — REC dot is justified (camera is recording), timecode is justified (camera burned it in), captions are justified (platform added them), SIGNAL LOST is justified (the camera died). A title-card slam breaks the documentary fiction.

DO NOT use kling-v3.0-pro `--audio` for non-English (per cross-project memory `feedback_kling_no_ru_audio.md`), because it produces accent slip + voice-age drift. This template ships no-VO by default; if your `{{target_language}}` is non-English, keep VO off and rely on diegetic captions only.

DO NOT generate the `{{subject_creature}}` from text alone, because the AGENTS.md reference-required gate fires for any specific real-world or named entity — and generating a "body-horror creature" from text reliably produces AI-slop blob anatomy. User MUST supply 2-3 reference PNGs that together describe the anatomy. Sample creature references ship at `assets/monster-*.png`; replace with your own creature refs before using.

DO NOT show the operator's face or body, because the entire premise is first-person handheld POV. The only operator presence allowed is a gloved hand at frame bottom (raising the camera, holding the phone-torch) or the operator's own breathing/voice in the audio bed (heavy panting, broken breath).

DO NOT skip the diegetic register break for the monster reveal, because the Act-2 cinema-register reveal is what sells the shock — the VHS layer was 90 seconds of "this looks amateur and contained", and the sudden clean cinema cut to the creature reads as "the camera fell and the truth is now visible". Holding Hi8 register through the reveal flattens the climax.

## Workflow

*(Postmortem absent. The workflow ordered list is normally extracted from `postmortem/05-workflow-fixes.md`. The general pipeline is documented in `prompt-cookbook.md` and `model-stack.md` — start there, then run `/postmortem` on the first finished project using this template to crystallize the per-step rules.)*

## See also

- [`prompt-cookbook.md`](./prompt-cookbook.md) — per-stage prompts with slots, verbatim from the source pipeline
- [`hooks.md`](./hooks.md) — 0-2s cold open patterns (camera-on flash, "is this thing recording", REC dot blink)
- [`model-stack.md`](./model-stack.md) — image / video / SFX picks with cost ballpark and per-stage notes
- [`examples.md`](./examples.md) — 2 variant prompts showing different `{{subject_creature}}` + `{{cult_location_descriptor}}` combos
