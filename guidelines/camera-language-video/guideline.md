# Camera language for video-generation prompts

> **For the LLM writing the next video prompt.** The camera half of a
> `ralphy generate video` prompt: which framing and move words each model in
> `MODELS.md` is known to follow, which it drops, and which break the clip. Read
> it before any video prompt that names a shot size, an angle or a camera move,
> then write the camera clause yourself. Do not paste this body into a prompt
> (Kling caps prompts at 2,500 characters).

> **Status: research pass, untested in Ralphy.** Every per-model note comes from
> vendor docs or third-party reports (2026-10-30), not from a Ralphy render.
> The verifying matrix, its cost estimate and the source list are in
> [`docs/research/camera-language-test-plan.md`](../../docs/research/camera-language-test-plan.md);
> it is paid and waits for owner approval. Until a row says `tested`, treat each
> claim as a starting bet and budget one re-roll.

## When to apply

Any t2v or i2v prompt that names framing or camera motion, including per-shot
camera lines in `prompts.json`, `STORYBOARD.md` or a storyboard scene's
`camera` field.

Not when the move belongs in the edit. Punch-ins, impact shake, Ken Burns,
pan-and-scan reframes, parallax on cut-outs, follow-cam, whip pans, crash zooms
and rolls are free and frame-deterministic as post-production recipes: the
editor's
[`virtual-camera.md`](../../.agents/skills/editor/references/virtual-camera.md)
(#567). Decide **generation camera vs edit camera** first. Default: generate a
clean, slow, single move (or a locked-off plate) and add energy in the edit.

## Confidence labels

| Label | Meaning |
|---|---|
| `doc` | The vendor's guide or API reference lists or exemplifies the term. "The vendor says use it", not "measured". |
| `comm` | Third-party report, usually a vendor blog and a single run. |
| `repo` | A default in a Ralphy cookbook or skill; outside the matrix. |
| `—` | Nothing found. Not proof that it fails. |
| `untested` | Not verified by Ralphy. **Every row today.** After the matrix: `tested: follows / weak / ignores / artifacts` plus the clip path. |

## Model mechanics

Run `ralphy models show <id>` first; this is the camera-specific layer.

| Model | Camera control via Ralphy | Prompt cap | Multi-shot in one clip |
|---|---|---|---|
| `kwaivgi/kling-v3.0-pro` / `-std` | Prose only. OpenRouter exposes no `camera_control`, `multi_prompt` or `shot_type`. | 2,500 (preflight) | `[Shot N: <size>]` labels are `doc` for Kling's own UI; cuts through OpenRouter unverified. |
| `kwaivgi/kling-video-o1` | Prose only, 5 / 10 s. Copying a reference video's camera needs a video input OpenRouter lacks. | 2,500 (preflight) | — |
| `fal-ai/kling-video/o3/pro/reference-to-video` | Prose plus `@Image` / `@Element`. Upstream `multi_prompt` is not sent by Ralphy. | — | Upstream only. |
| `google/veo-3.1` / `-fast` / `-lite` | Prose. Google's rewriter may add camera moves to short prompts. | — | `[00:00-00:02] …` timestamp segments (`doc`); the model picks transitions. |
| `bytedance/seedance-2.0` / `-fast` | Prose; no `camera_fixed` on 2.0. The fal r2v model can copy camera from `@Video1`. | — | `Shot 1 / Shot 2 / Shot 3` (`doc`); the official guide calls `0-3s:` timecodes unstable. |
| `bytedance/seedance-1-5-pro` | Prose. Upstream `camera_fixed` is not sent by Ralphy. | — | `Shot 1:` plus `cut to` (`doc`). |
| `minimax/hailuo-2.3` | **Bracket commands** (below). Upstream `prompt_optimizer` defaults on and rewrites; Ralphy cannot disable it. 16:9, 1080p, 6 / 10 s only. | 2,000 | None; order moves with brackets in one shot. |
| `alibaba/wan-2.6` | Prose. Upstream `prompt_extend` (LLM rewrite) defaults on; `shot_type=multi` needs it; Ralphy sets neither. | 1,500 | `Shot n [start-end s]` (`doc`). |
| `alibaba/wan-2.7` | Prose; multi-shot is prompt-controlled. | 5,000 | `Shot n [start-end s]`, or "Generate single shot" for one take (`doc`). |
| `openai/sora-2-pro` | **Do not route.** The Sora 2 API was removed on 2026-09-24; absent from the live OpenRouter catalog (2026-10-30). | — | — |

Wan caveat: the official camera tables are shared across Wan 2.6 / 2.7 / 3.0
but their examples were made with Wan 2.2, so Wan notes are inherited.

## Core rules (all models)

1. **One camera move per shot** (`doc` in the Sora 2 and Seedance 2.0 guides;
   every community source agrees). A second move only as a named compound
   (row 28), after both single moves pass on that model.
2. **Camera sentence first, on its own:** `<speed> <move> <direction or target>,
   <end framing>.` e.g. `Slow push-in toward the red scooter, ending on a medium
   close-up.` Subject action goes in a separate sentence.
3. **Name what the camera moves toward, around or with.** Without an anchor
   subject the model picks its own focus.
4. **Ask for stillness explicitly:** `Locked-off tripod shot, the camera does
   not move.` With no camera words Wan 2.2 adds a mild push-in and Veo / Sora
   add subtle handheld (`comm`).
5. **No contradictions:** locked-off plus handheld, static plus push-in, one move
   phrased twice (Hailuo averages them).
6. **Subject motion is not camera motion.** "The cat walks toward the camera" is
   not a push-in; write both as separate sentences.
7. **i2v: the anchor fixes the opening frame.** Describe motion and camera only,
   not the scene in the image (`doc` Veo, Wan, Kling; on Kling a prompt that
   diverges from the image can trigger a cut). State the end state ("rises until
   it looks straight down"), never a start the anchor does not show.
8. **Parallax needs depth.** Dolly, truck, crane and arc read as camera moves
   only with a foreground, middle ground and background; without them Kling's
   push-in degrades into a zoom (`comm`). Put a near object in the anchor.
9. **Slow beats fast.** Fast pans smear and fast zooms warp on Veo; fast
   push-ins tear on Kling (`comm`). Leave whip and crash moves to the edit.
10. **Arcs, not orbits:** at most about 90 degrees. Full 360 orbits warp or seam
    on Kling and Veo and were ignored in a 5 s Wan 2.2 clip (`comm`); 180 is the
    documented Veo ceiling.
11. **One move per 4-6 s.** Longer clips drift more (Kling `comm`); short Veo
    clips can end before a dolly develops, so say "over the whole clip".
12. **9:16:** Kling lays wide-scene wording out as landscape inside the portrait
    frame (`docs/models/video.md` lesson 1). Use a portrait anchor and vertical
    wording.
13. **Positive constraints only** on Veo and Seedance: describe the wanted
    camera; do not put camera words in a negative prompt.

## Framing vocabulary (shot sizes and angles)

The most reliably followed camera terms on every model. One size and one angle
per shot. All rows `untested`.

| Term | Phrase | Kling 3.0 | Veo 3.1 | Seedance 2.0 / 1.5 | Hailuo 2.3 | Wan 2.6 / 2.7 |
|---|---|---|---|---|---|---|
| Extreme wide / establishing | `extreme wide establishing shot` | `doc` | `doc` (wide / establishing) | `doc` (wide only) | — | `doc` (extreme full shot) |
| Wide / full | `wide shot, full body in frame` | `doc` | `doc` | `doc` | — | `doc` |
| Medium | `medium shot, waist up` | `doc` | `doc` | `doc` | — | `doc` |
| Medium close-up | `medium close-up, chest up` | `doc` | `doc` | `doc` | — | `doc` |
| Close-up | `close-up on <subject>` | `doc` | `doc` | `doc` | — | `doc` |
| Extreme close-up / macro | `extreme close-up of <detail>` | `doc` | `doc` | 1.5 `doc` (big close-up) | — | weak `doc` |
| Low angle | `low angle looking up at <subject>` | `doc` | `doc` | `comm`; 1.5 `doc` | `comm` | `doc` |
| High angle | `high angle looking down at <subject>` | — | `doc` | 1.5 `doc` | — | `doc` |
| Overhead / top-down | `top-down overhead shot looking straight down` | — | `doc` | `comm`; 1.5 `doc` | — | `doc` |
| Worm's-eye | `worm's-eye view from ground level` | — | `doc` (listed) | 1.5 `doc` (ant perspective) | — | — |
| Dutch / canted | `dutch angle, horizon tilted 15 degrees` | — | `doc` static; as a moving tilt weak (`comm`) | — | — | — |
| Lens / depth of field | `35mm lens, shallow depth of field` | — | `doc` (DOF; mm as look cue) | `comm` | — | `doc` |

## Camera moves (30)

`K` Kling 3.0 pro / std, `V` Veo 3.1 / fast / lite, `S` Seedance 2.0 / fast (1.5
where it differs), `H` Hailuo 2.3, `W` Wan 2.6 / 2.7. **Ralphy status for every
row: `untested`.** Rows 1-28 are runs `M01-M28` in the test plan.

| # | Move | Canonical phrase | K | V | S | H | W |
|---|---|---|---|---|---|---|---|
| 1 | Locked-off | `Locked-off tripod shot, the camera does not move.` | `doc`; may drift (`comm`) | `doc` | `doc` (fixed shot) | `doc` `[Static shot]` | `doc` (fixed camera) |
| 2 | Pan | `Slow pan right from <A> to <B>.` | `doc`; under ~45 degrees (`comm`) | `doc`; smears fast (`comm`) | `doc` | `doc` `[Pan right]` | `doc` |
| 3 | Tilt | `Slow tilt up from <A> to <B>.` | `doc`; needs vertical structure | `doc` | `comm`; 1.5 `doc` | `doc` `[Tilt up]` | `doc` (in compounds) |
| 4 | Push-in (dolly in) | `Slow push-in toward <subject>, ending on a close-up.` | `doc`; zoom-like without depth, warps fast (`comm`) | `doc`; may not finish in 4 s (`comm`) | `doc` | `doc` `[Push in]` | `doc` (camera pushes in) |
| 5 | Pull-out (reveal) | `Slow pull-back from <subject>, revealing <space>.` | `doc`; needs a space to reveal | `doc` | `doc` | `doc` `[Pull out]` | `doc` |
| 6 | Zoom (lens, no parallax) | `Slow optical zoom in on <subject>; the camera stays in place.` | `comm`, conflicting | `doc`, distinct from dolly; fast warps (`comm`) | weak, drifts to push-in (`comm`); 1.5 `doc` distinct | `doc` `[Zoom in]`, distinct from `[Push in]` | weak, read as dolly or crop (`comm`) |
| 7 | Crash zoom | `Sudden fast crash zoom onto <subject>.` | — (listed) | — | — | — | `comm` (Wan 2.2) |
| 8 | Dolly zoom (vertigo) | `Dolly zoom: the camera pulls back while zooming in, <subject> stays the same size, the background stretches.` | listed, doubtful (`comm`) | `doc` listed; weak (`comm`) | 1.5 `doc` (Hitchcock shot); 2.0 best via reference video (`comm`) | — | — |
| 9 | Truck (lateral) | `The camera trucks left alongside <subject>, keeping it centered.` | `comm` (claimed) | `doc` listed | `doc` as lateral tracking | `doc` `[Truck left]` | `doc` (camera moves left) |
| 10 | Pedestal (vertical, no tilt) | `The camera rises straight up on a pedestal, level, no tilt.` | `comm` (claimed) | `doc` listed | 1.5 `doc` (rise / fall) | `doc` `[Pedestal up]` | — |
| 11 | Crane / jib up | `Crane up over <foreground> to reveal <background>.` | `comm` (one i2v pass) | `doc` | `comm`; tall rises look like a drone | `comm` via `[Pedestal up]` | `comm`, conflicting |
| 12 | Boom to overhead | `The camera rises and tilts down until it looks straight down on <subject>.` | — | `doc` angle; move — | `comm`; 1.5 `doc` bird's-eye | — | `doc` angle |
| 13 | Arc (<= 90 degrees) | `Slow 90-degree arc around <subject> from left to right, subject centered.` | `doc`; 25-degree test passed (`comm`) | `doc` (arc, 180-degree arc); warps on busy sets (`comm`) | `doc`; faces warp (`comm`) | `[Truck left,Pan right,Tracking shot]` (`comm`) | `doc` (orbiting) |
| 14 | 360 orbit | `The camera circles 360 degrees around <subject>.` | artifacts (`comm`) | seam (`comm`) | `doc`; faces / occlusion warp (`comm`) | — | ignored in 5 s (`comm`, 2.2) |
| 15 | Tracking (parallel) | `Tracking shot moving alongside <subject> as it walks.` | `doc` | `doc`; drifts on occlusion (`comm`) | `doc` | `doc` `[Tracking shot]` | `doc` |
| 16 | Follow (behind) | `The camera follows <subject> from behind at a steady distance.` | `doc` | `doc` (tracking) | `doc` (follows steadily) | `doc` `[Tracking shot]` | `doc` (follow-cam) |
| 17 | Leading (ahead) | `Leading shot: the camera moves backward ahead of <subject>, facing it.` | — | — | `comm` (say leads / follows) | — | — |
| 18 | Handheld, subtle | `Handheld camera, subtle natural sway.` | `doc`; do not stack | `doc` | `doc` micro-shake | `doc` `[Shake]` | `doc` once (2.5) |
| 19 | Shaky / found footage | `Shaky handheld found-footage camera, jittery and unstable.` | `comm` | `doc` | `comm` | `doc` `[Shake]`; strong shake morphs faces | `doc` once (2.5) |
| 20 | Steadicam glide | `Smooth steadicam glide forward through <space>.` | `comm` (claimed) | — | — (ref video only) | — | — (3.0 only) |
| 21 | FPV fly-through | `Fast FPV drone flight low over <ground>, through <opening>, banking slightly.` | weak (`comm`) | — | `doc` (first-person dive) | — | `doc` (drone fly-through) |
| 22 | Aerial drone rise | `Aerial drone shot rising slowly over <scene>, revealing <context>.` | `comm` (little altitude change) | `doc`; slow (`comm`) | `comm` | `comm` | `doc` |
| 23 | Whip pan | `Fast whip pan from <A> to <B> with motion blur.` | — (listed) | `doc` listed; weak (`comm`) | `comm` (as transition) | — | weak (`comm`) |
| 24 | Rack focus | `Rack focus from <foreground object> to <background subject>.` | `comm` (fal claim) | `doc` listed; mixed (`comm`) | `comm` | — | — |
| 25 | Dutch roll | `The camera slowly rolls 15 degrees clockwise.` | — ("rotate" flagged as excess) | — | — | — | — |
| 26 | Barrel roll | `The camera does a full 360-degree barrel roll.` | — | — | 1.5 `doc` (whirl / rotate) | — | `comm` (2.2) |
| 27 | POV | `First-person POV walking toward <target>, no cuts.` | `doc` | `doc` | `doc`; cuts unless "no cuts" (`comm`) | — | — |
| 28 | Compound (sequenced) | `Slow push-in toward <subject>, then a slow 45-degree arc to the right.` | avoid stacking (`doc`) | 2 moves ok, 3 not (`comm`) | one per shot (`doc`) | `[Push in]` then `[Pan right]` (`doc`) | unstable (`comm`) |
| 29 | Selfie | `Selfie front-camera shot at arm's length, eye level, slight handheld sway.` | `repo` (UGC default) | — | — (photoreal i2v blocked) | — | — |
| 30 | Over-the-shoulder | `Over-the-shoulder shot from behind <A>, looking at <B>.` | `doc` | `doc` | `doc` | — | `doc` |

Rows 29-30 need a person, so the (non-human) matrix skips them; selfie UGC is a
Kling job (`docs/models/video.md`, `ugc-*` skills).

### Move notes

- **Push-in vs zoom (4, 6)** is the first pair to verify. A push-in shows
  parallax (near objects grow faster than far ones); a zoom does not. If a
  push-in comes back flat, add a foreground object and "the camera physically
  moves forward".
- **Pan / tilt rotate in place; truck / pedestal move the camera (2, 3, 9, 10).**
  Most models know only the rotations by name: write "moves left alongside" and
  "rises straight up, level", or the Hailuo bracket names.
- **Orbits (13, 14):** give angle and direction; keep the subject simple and
  unoccluded (faces and logos warp first). For products, a 45-90 degree arc plus
  a cut beats one 360.
- **Edit-first moves (7, 23, 25, 26):** crash zoom, whip pan and roll are weak or
  undocumented in generation; use `cam-crash-zoom`, `cam-whip-pan`, `cam-roll`
  (#567).
- **Rack focus (24):** name both targets and the order; reported mixed on Veo.
- **Handheld (18, 19):** a texture word over a static or very slow move, never
  over another named move. For impacts use `cam-impact-shake` in the edit.
- **Kling O1:** phrase like 3.0; it drifts at 8-10 s (`comm`), so prefer 5 s.
- **Seedance 2.0 reference video:** the documented way to copy a hard move (dolly
  zoom, steadicam, complex orbit) is `Refer to the camera movement of Video 1`
  with a short clip showing only that move, on
  `bytedance/seedance-2.0/reference-to-video` (`--provider fal --ref-video`). Say
  "camera movement only" or the clip's lighting and pacing bleed in.

## Hailuo 2.3 bracket commands (`doc`)

MiniMax documents 15 commands for Hailuo 2.3, 2.3-Fast and 02, in square
brackets inside the prompt:

`[Truck left]` `[Truck right]` `[Pan left]` `[Pan right]` `[Push in]`
`[Pull out]` `[Pedestal up]` `[Pedestal down]` `[Tilt up]` `[Tilt down]`
`[Zoom in]` `[Zoom out]` `[Shake]` `[Tracking shot]` `[Static shot]`

- Inside one bracket they run together (`[Pan left,Pedestal up]`), at most 3.
- Separate brackets run in the order written; place each where the move happens.
- Put the bracket next to its subject, not inside a list of style words, and do
  not also describe the move in prose.
- The upstream optimizer may rewrite brackets; the matrix runs each Hailuo move
  in bracket and prose form to see which survives.

## Multi-shot coverage for one scene

**Ralphy default: one clip per shot**, each from its own approved anchor
(art-director anchor order), cut in the edit. It is the only path with per-shot
control on every model, and a re-roll touches only the failed shot. Use
multi-shot in one generation only when continuity across the cut matters more
than control, and only where the test plan's result says `tested: follows`.

The same coverage (wide establishing, medium push, close detail) in each
model's documented syntax:

**Kling 3.0** (`doc` for Kling's UI; through OpenRouter untested):

```
A quiet cobblestone street in a seaside town at golden hour, a red vintage scooter, a ginger cat on a low stone wall.
[Shot 1: Wide shot] Locked-off eye-level view of the whole street, the archway and harbour behind.
[Shot 2: Medium shot] Slow push-in toward the red scooter.
[Shot 3: Close-up] Locked-off close-up on the cat's face as it blinks slowly.
```

**Veo 3.1** (`doc`; the model picks the transitions):

```
[00:00-00:03] Wide establishing shot, eye level, locked-off: a cobblestone seaside street at golden hour, a red vintage scooter, a ginger cat on a low wall.
[00:03-00:06] Medium shot, slow push-in toward the red scooter.
[00:06-00:08] Close-up, locked-off, on the ginger cat blinking slowly. SFX: gulls, distant waves.
```

**Seedance 2.0 and 1.5 pro** (`doc`; numbered shots, no second-level
timecodes, global paragraph last):

```
Shot 1: wide establishing shot of a cobblestone seaside street at golden hour, fixed camera position; a red vintage scooter stands mid-street, a ginger cat sits on a low stone wall.
Shot 2: cut to a medium shot of the red scooter, slow push-in.
Shot 3: cut to a close-up of the ginger cat, fixed camera, it blinks slowly.
Warm natural light, photographic look, consistent street and lighting across all shots, no text.
```

**Wan 2.6 / 2.7** (`doc`; overall description, then timed shots):

```
A cobblestone seaside street at golden hour with a red vintage scooter and a ginger cat on a low stone wall; warm natural light, photographic.
Shot 1 [0-3s] wide shot: fixed camera, the whole street with the archway and harbour behind.
Shot 2 [4-6s] medium shot: hard cut, the camera pushes in toward the red scooter.
Shot 3 [7-10s] close-up: hard cut, fixed camera on the cat blinking slowly.
```

**Hailuo 2.3:** no multi-shot; order moves in one shot:
`[Static shot] The red scooter on a seaside street at golden hour. [Push in] toward the scooter, ending on a medium shot.`

In any multi-shot prompt, repeat the subject's identifying details and the
setting in every shot (shots are read independently), give each shot one camera
intent and one action, and fit about 3 shots in 8-10 s.

## Anti-patterns

| Don't | Do |
|---|---|
| `dynamic cinematic camera, epic movement` (generic motion, `comm`) | One move, a direction, a speed, an end framing. |
| `handheld orbit with a zoom and a crane rise` (shakes, warps or drops moves) | One move per shot; split into shots. |
| `zoom in` when the camera should travel | `push-in`; for a lens zoom, `optical zoom, the camera stays in place`. |
| A 360 orbit on a face, logo or busy set | 45-90 degree arc on a simple subject, or two shots. |
| Re-describing the anchor in an i2v prompt | Motion and camera only. |
| Camera instruction after the style adjectives (read as decoration, `comm`) | Camera sentence first. |
| Hailuo bracket plus the same move in prose | One form per move. |
| `0-3s:` timecodes on Seedance 2.0 (officially unstable) | `Shot 1 / Shot 2`; let the model pace. |
| Generating a whip pan, crash zoom, punch-in or roll | The #567 edit recipes. |
| `no camera movement` as a negative prompt | `Locked-off tripod shot, the camera does not move.` |
