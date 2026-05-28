# Analog-Horror Pick-A-Door

A satirical brand-comparison short dressed as an analog-horror "choose your fate" meme. **Safe brand** behind one door = warm-liminal hangout (lone empty room, plush alone, found-footage); **bad brand** behind the other = cold-liminal descent into a credit/limit meter that drains, then a **screamer** where a silent obsidian-headed monster appears and threatens you via VT323 textboxes. 9:16, ~60-70s. **The whole video lives inside ONE aesthetic (liminal-spaces / found-footage internet-horror) — the safe side is the *warm* variant, never a different genre.**

> Derived from `ralphy-vs-higgsfield-001` (shipped, user-rated 8.5/10). Reuses a pre-built monster + VHS SFX stack so the next one is mostly assembly, not generation.

## What ships in this template
- `composition-skeleton.html` — the full HyperFrames composition (just swap brand names / palette / VO / monster).
- `assets/monster/` — the **reusable monster character system** (greenscreen master + 7 transparent emotion cutouts + full-frame closeup).
- `assets/sfx/` — real VHS tape-hiss bed, countdown ticks, Undertale-style beep tracks + gaster sample.
- `assets/VT323.woff2` — the terminal font.
- `prompt-cookbook.md` / `model-stack.md` / `recipes.md` / `composition.md` — how to regenerate anything + the exact ffmpeg recipes.

## Key rules (the expensive lessons — read before generating)
0. **Hold ONE aesthetic end-to-end. The biggest miss on v1.** Pick the aesthetic FIRST (default: **liminal-spaces / found-footage internet-horror**) and **both branches inherit it**. The safe side is the **WARM-liminal** variant of the same register (lone empty rooms, fluorescent + warm lamp, oversized empty space, plush alone, uncanny-calm). NOT pinterest-cozy clutter, fairy lights, exposed brick, hygge — those break the frame and the screamer no longer lands inside the same world. After approving the two-door hub plate, write the one-line aesthetic to `STORYBOARD.md` and prepend it to every subsequent image prompt.
1. **Reuse the monster, don't regenerate it.** The cutout set in `assets/monster/` is drop-in. Only generate new monster art if the brief demands a different creature — and if so, **lock the face design first** (it cost 3 redesigns last time). `monster-emote-flat-open.png` is the locked eyes reference: generate any new pose with it as `--ref`, change only mouth/eyelids.
2. **Monster scare DNA = small uncanny photographic eyes (white sclera ring + dark pupil, "cut from a magazine and glued on") + thin geometric mouth (single line / "=" / open "O").** Big glowing almond eyes read cute — banned.
3. **Found-footage realism on the FIRST prompt.** Every live location = "PHOTOREALISTIC amateur home-camcorder still, real lived-in room, faint VHS grain, NOT illustration/3D/render" + a cropped reference frame. The cozy side took 5 regens when this was missed.
4. **Monster motion + reveal are DISCRETE, never tweened.** Appear = instant `tl.set`. Talk = swap mouth frames ~6/s + blink every ~1.3s. Idle = snap position + scale-lurch (looms closer) in ~0.18s steps, ~0.55s burst then ~0.65s hold. A smooth GSAP tween kills the scare.
5. **The screamer needs silence.** Meter crashes to 0 on the last narration word → hard black blink → **music drops to silence (VHS hiss/ambient stays)** → monster snaps in and **stares silently ~1.2s** (no box, no beeps, no motion) → THEN speaks. Dead air is the scare.
6. **One concat video per montage.** HyperFrames does NOT reliably switch between many short same-track `<video>` clips — concat a montage into ONE clip (ffmpeg), use one `<video>`.
7. **VHS is a post-process ffmpeg pass**, not in-composition (chroma shift + mirage sine-drift + grain + vignette — see `recipes.md`). Real tape hiss > generated.

## Workflow (ordered)
1. `ralphy template use analog-horror-pick-a-door --project <id> --brief "<safe brand> vs <bad brand>"` — scaffolds + copies the monster/SFX assets.
2. **Frame-study the reference** (if remixing a source): slice at 0.1-0.2s; lock realism register, monster design, motion pacing BEFORE generating.
3. Generate locations: shared two-door hub → cozy SAFE world (montage of ~4-6 photoreal stills) → BAD descent (hallway / work-room / cell). Use `gemini-3-pro-image` multi-ref. Reuse the monster from `assets/monster/`.
4. Animate: cheap `wan-2.7` pans for cozy stills; `seedance-2.0` for door-throughs (room→black) and ominous push-ins. Concat the safe montage into one clip.
5. VO: clone narrator (or preset), old-radio ffmpeg filter. 3 liminal music beds (neutral / chill / creepy). Real VHS hiss continuous.
6. Compose in `composition-skeleton.html`: swap slots, retime to your VO. Lint (`bunx hyperframes lint`).
7. Render via `bunx hyperframes render <projdir> -o render/comp.mp4` (NOTE: `ralphy render` currently drives Remotion, not HyperFrames — see model-stack.md).
8. VHS post-process (recipes.md) → compress (x264 CRF23 +faststart).

## Reference example
`workspace/projects/ralphy-vs-higgsfield-001/` — "Ralphy (red, safe) vs Higgsfield (blue, credit-hell)". Final: `render/final-compressed.mp4`. Full postmortem in that project's `postmortem/`.

## Cost ballpark
~$8-12 for a fresh one if you reuse the monster (no monster regens): ~$3-4 images (locations) + ~$5-7 video (seedance door-throughs + wan pans). VO/music/SFX free on ElevenLabs subscription. The reference project spent ~$13.85 *including* ~$2.7 of avoidable monster-redesign regens — which this template eliminates.
