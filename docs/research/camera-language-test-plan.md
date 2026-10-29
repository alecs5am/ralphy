# Camera-language test matrix: plan and cost estimate (#566)

> **Status:** plan only, not run. **Paid; needs owner approval of the estimate below before any call.**
> **Filed:** 2026-10-30.
> **Verifies:** [`guidelines/camera-language-video/`](../../guidelines/camera-language-video/guideline.md) (`ralphy guideline show camera-language-video`), where every row is `untested` today.
> **Issue:** [`notes/issues/566-camera-language-for-generation-prompts.md`](../../notes/issues/566-camera-language-for-generation-prompts.md). Post-production camera moves are a separate track: [`notes/issues/done/567-post-production-virtual-camera.md`](../../notes/issues/done/567-post-production-virtual-camera.md).

## What the matrix answers

For each current video model in [`MODELS.md`](../../MODELS.md): does the model execute a named camera move or framing, does it confuse it with a neighbouring move (zoom vs push-in, pan vs truck), and does it break the frame doing it. One scene, one camera instruction per run, everything else held constant, so the camera clause is the only variable.

It also produces the "verified example clip" per move that the issue's acceptance asks for, and per-model multi-shot coverage of one scene.

It does **not** measure adherence rates. Each cell is one run (n = 1), plus one re-run when the first fails. A `follows` verdict means "worked once on this scene", which is still far better than the current state (vendor claims only).

## Models

| Tier | Models | Why |
|---|---|---|
| Core (every move) | `kwaivgi/kling-v3.0-pro`, `bytedance/seedance-2.0`, `google/veo-3.1-fast` | The narrative default, the motion default, and the cheapest Veo tier with verified billing. |
| Spot check (8 moves) | `kwaivgi/kling-v3.0-std`, `kwaivgi/kling-video-o1`, `google/veo-3.1` (4 moves), `google/veo-3.1-lite`, `bytedance/seedance-2.0-fast`, `bytedance/seedance-1-5-pro`, `minimax/hailuo-2.3` (prose and bracket syntax), `alibaba/wan-2.6`, `alibaba/wan-2.7` | Same family as a core model, or a distinct model with a documented camera syntax. |
| Optional, fal (`FAL_KEY`) | `bytedance/seedance-2.0/reference-to-video`, `fal-ai/kling-video/o3/pro/reference-to-video` | Camera replication from a reference clip; not part of the totals. |
| Excluded | `openai/sora-2-pro` | OpenAI removed the Sora 2 API on 2026-09-24; the model is absent from the live OpenRouter catalog (checked 2026-10-30); `MODELS.md` marks it retired. |

The live catalog also lists models that are not in `MODELS.md` (for example `bytedance/seedance-2.5`, `alibaba/wan-3.0`, `minimax/hailuo-3`). They are out of scope until they get an index row.

## The scene

One non-human scene with clear depth layers, so parallax separates camera moves from lens moves, and with no people, so the Seedance privacy filter does not fire on the anchor (`.agents/skills/seedance-prompts/references/safety-filter.md`: object and landscape refs pass).

**Anchor plate prompt** (image, `google/gemini-3-pro-image-preview`):

```text
Photograph, eye level, medium-wide framing from about four metres. A narrow cobblestone street in a small Mediterranean seaside town at golden hour. Foreground left, close to the lens: a terracotta pot with a small lemon tree, lemons visible. Middle ground, centre: a red vintage motor scooter parked on the cobbles. A low stone wall runs along the right side of the street from the foreground into the distance; a ginger cat sits on top of it a few metres from the camera. Background: a stone archway opening onto a sunlit harbour with small white boats and blue sea; a striped cafe awning on the left building. Clear foreground, middle ground and background, warm low sunlight, long soft shadows. No people, no text, no signage, no logos.
```

Two plates: `cam-plate-9x16` (every model except Hailuo) and `cam-plate-16x9` (Hailuo 2.3 accepts 16:9 only), the second generated with the first as `--ref` so the scene matches.

**Constant prompt parts** (i2v runs): the camera clause comes first, then one subject sentence, then the tail.

- Subject, `still` (default): `The ginger cat stays seated on the wall, tail flicking slowly.`
- Subject, `away` (M15, M16): `The ginger cat walks slowly along the top of the wall toward the archway.`
- Subject, `toward` (M17): `The ginger cat walks slowly along the top of the wall toward the camera.`
- Tail: `A light sea breeze moves the lemon leaves and the striped awning. Warm golden-hour light, photographic, natural colour, no people, no text.`

Every run is silent (no `--audio`), 9:16, 720p, unless the table says otherwise.

## Run list

### Phase 0: anchors (2 images)

`cam-plate-9x16`, `cam-plate-16x9`. Free alternative: a host-native image registered with `ralphy generate image --import` ($0).

### Phase 1: core motion sweep (28 moves x 3 models = 84 runs, i2v)

IDs match rows 1-28 of the guideline's move table.

| ID | Camera clause | Subject |
|---|---|---|
| M01 | Locked-off tripod shot, the camera does not move. | still |
| M02 | Slow pan right from the red scooter to the ginger cat on the wall. | still |
| M03 | Slow tilt up from the cobblestones to the rooftops and the sky above the archway. | still |
| M04 | Slow push-in toward the red scooter over the whole clip, ending on a medium close-up of the scooter. | still |
| M05 | Slow pull-back away from the red scooter, revealing more of the street and the lemon tree. | still |
| M06 | Slow optical zoom in on the red scooter; the camera stays in place. | still |
| M07 | Sudden fast crash zoom onto the ginger cat's face. | still |
| M08 | Dolly zoom on the red scooter: the camera pulls back while zooming in, the scooter stays the same size and the archway behind it stretches away. | still |
| M09 | The camera trucks left, sliding sideways past the lemon tree while keeping the scooter in frame. | still |
| M10 | The camera rises straight up on a pedestal, staying level with no tilt. | still |
| M11 | Crane up over the scooter and the wall to reveal the harbour and boats beyond the archway. | still |
| M12 | The camera rises and tilts down until it looks straight down on the red scooter from overhead. | still |
| M13 | Slow 90-degree arc around the red scooter from left to right, scooter centered. | still |
| M14 | The camera circles 360 degrees around the red scooter, scooter centered. | still |
| M15 | Tracking shot moving alongside the ginger cat, keeping it in profile. | away |
| M16 | The camera follows the ginger cat from behind at a steady distance. | away |
| M17 | Leading shot: the camera moves backward ahead of the ginger cat, facing it. | toward |
| M18 | Handheld camera, subtle natural sway. | still |
| M19 | Shaky handheld found-footage camera, jittery and unstable. | still |
| M20 | Smooth steadicam glide forward past the red scooter toward the archway. | still |
| M21 | Fast FPV drone flight low over the cobblestones, past the scooter and through the archway toward the harbour, banking slightly. | still |
| M22 | Aerial drone shot rising slowly above the rooftops, revealing the whole harbour and the sea. | still |
| M23 | Fast whip pan from the red scooter to the ginger cat with motion blur. | still |
| M24 | Rack focus from the lemon tree in the foreground to the red scooter behind it. | still |
| M25 | The camera slowly rolls 15 degrees clockwise around the lens axis. | still |
| M26 | The camera does a full 360-degree barrel roll around the lens axis. | still |
| M27 | First-person POV walking forward along the street toward the archway, natural head movement, no cuts. | still |
| M28 | Slow push-in toward the red scooter, then a slow 45-degree arc to the right. | still |

Durations: Kling and Seedance 5 s, Veo Fast 4 s (Veo takes 4 / 6 / 8 only). Selfie and over-the-shoulder (guideline rows 29-30) need a person and are not in the matrix.

### Phase 2: framing (8 terms x 3 core models = 24 runs, t2v)

Text-to-video, because an i2v anchor fixes the shot size. Prompt: `<framing> of a red vintage motor scooter parked on a cobblestone street in a small Mediterranean seaside town at golden hour; a lemon tree in a terracotta pot beside it, a stone archway to a sunlit harbour behind, a ginger cat on a low stone wall. Locked-off tripod shot, the camera does not move. Warm natural light, photographic, no people, no text.`

| ID | Framing |
|---|---|
| F01 | Extreme wide establishing shot |
| F02 | Medium shot |
| F03 | Close-up |
| F04 | Extreme close-up of the chrome headlamp |
| F05 | Low-angle shot looking up |
| F06 | High-angle shot looking down |
| F07 | Top-down overhead shot looking straight down |
| F08 | Dutch-angle shot with the horizon tilted 15 degrees |

### Phase 3: spot checks (76 runs, i2v)

Moves M01, M04, M05, M06, M09, M11, M13, M18 (the clauses from Phase 1) on `kling-v3.0-std`, `kling-video-o1`, `veo-3.1-lite`, `seedance-2.0-fast`, `seedance-1-5-pro`, `wan-2.6`, `wan-2.7` (8 each); M01, M04, M06, M13 on `veo-3.1`; all 8 on `hailuo-2.3` twice, once in prose and once with these bracket clauses (16:9 plate, 1080p, 6 s):

| ID | Hailuo bracket clause |
|---|---|
| M01 | `[Static shot]` |
| M04 | `[Push in] toward the red scooter, ending on a medium close-up.` |
| M05 | `[Pull out] from the red scooter, revealing more of the street.` |
| M06 | `[Zoom in] on the red scooter.` |
| M09 | `[Truck left] past the lemon tree, the scooter stays in frame.` |
| M11 | `[Pedestal up] over the scooter and the wall, revealing the harbour beyond the archway.` |
| M13 | `[Truck left,Pan right,Tracking shot] around the red scooter, scooter centered.` |
| M18 | `[Shake]` |

### Phase 4: multi-shot coverage (9 runs, t2v)

The same three-shot coverage (wide establishing, medium push-in on the scooter, close-up on the cat) in each model's documented syntax, plus a generic variant on the core models. Kling, Seedance and Wan 10 s; Veo Fast 8 s. The native prompts are the examples in the guideline's "Multi-shot coverage" section; the full text of all nine is in the runner below.

| ID | Model | Syntax |
|---|---|---|
| S01 | kling-v3.0-pro | `[Shot N: <size>]` labels (native) |
| S02 | kling-v3.0-pro | Prose with "Cut to" (generic) |
| S03 | seedance-2.0 | `Shot 1 / Shot 2 / Shot 3`, global paragraph last (native) |
| S04 | seedance-2.0 | `0-3s: / 3-7s: / 7-10s:` timecodes (tests the official "unstable" warning) |
| S05 | veo-3.1-fast | `[00:00-00:03]` timestamp segments (native) |
| S06 | veo-3.1-fast | `Shot 1 / Shot 2 / Shot 3` labels (generic) |
| S07 | wan-2.6 | `Shot n [start-end s]` (native) |
| S08 | wan-2.7 | `Shot n [start-end s]` (native) |
| S09 | seedance-1-5-pro | `Shot 1:` plus "cut to" (native) |

### Optional Phase 5: reference-video camera replication (fal, not in totals)

3 runs on `bytedance/seedance-2.0/reference-to-video` (`--provider fal --ref-video <clip>`; prompt `Refer to the camera movement of Video 1 only` + the Phase 1 subject and tail) using the best Phase 1 clips for M08 (dolly zoom), M13 (arc) and M20 (steadicam) as reference videos, and 2 runs on `fal-ai/kling-video/o3/pro/reference-to-video` (M04, M13 in prose, plate as `--ref`).

## Cost estimate

Rates are per second of billed clip, silent. Two figures per model:

- **Expected:** the live OpenRouter catalog of 2026-10-30, as recorded in `MODELS.md` by the #568 price recheck (Kling, Veo and Hailuo got cheaper). Seedance is billed per video token, so it keeps its verified $0.14/s; Wan keeps its ballpark.
- **Ceiling:** the higher of the two older hand-maintained tables, the billing table (`VIDEO_PRICE_PER_SEC` in `cli/lib/providers/openrouter.ts`, verified 2026-05-11) and the dry-run estimator (`cli/lib/or-catalog.ts`, printed by `ralphy models show` as `priceUsdPerSec`). These tables disagree with each other for five models and are not yet synced to the new catalog, so `--dry-run` over-states Kling and Veo and under-states Seedance.

| Model | Expected $/s | Ceiling $/s | Duration | Expected $ per run | Ceiling $ per run |
|---|---|---|---|---|---|
| `kwaivgi/kling-v3.0-pro` | 0.112 | 0.14 | 5 s | 0.56 | 0.70 |
| `kwaivgi/kling-v3.0-std` | 0.084 | 0.14 | 5 s | 0.42 | 0.70 |
| `kwaivgi/kling-video-o1` | 0.112 | 0.14 | 5 s | 0.56 | 0.70 |
| `google/veo-3.1` | 0.20 | 0.50 | 4 s | 0.80 | 2.00 |
| `google/veo-3.1-fast` | 0.10 | 0.25 | 4 s | 0.40 | 1.00 |
| `google/veo-3.1-lite` | 0.05 | 0.15 | 4 s | 0.20 | 0.60 |
| `bytedance/seedance-2.0` | 0.14 | 0.14 | 5 s | 0.70 | 0.70 |
| `bytedance/seedance-2.0-fast` | 0.14 | 0.14 | 5 s | 0.70 | 0.70 |
| `bytedance/seedance-1-5-pro` | 0.10 | 0.10 | 5 s | 0.50 | 0.50 |
| `minimax/hailuo-2.3` | 0.0817 | 0.10 | 6 s | 0.49 | 0.60 |
| `alibaba/wan-2.6` | 0.10 | 0.10 | 5 s | 0.50 | 0.50 |
| `alibaba/wan-2.7` | 0.10 | 0.10 | 5 s | 0.50 | 0.50 |

Per phase:

| Phase | Runs | Expected breakdown | Expected | Ceiling |
|---|---|---|---|---|
| 0 Anchors | 2 images | 2 x gemini-3-pro-image-preview at ~$0.15 ($0 host-native) | $0.30 | $0.30 |
| 1 Core sweep | 84 | kling-pro $15.68 + seedance-2.0 $19.60 + veo-fast $11.20 | $46.48 | $67.20 |
| 2 Framing | 24 | kling-pro $4.48 + seedance-2.0 $5.60 + veo-fast $3.20 | $13.28 | $19.20 |
| 3 Spot checks | 76 | kling-std $3.36 + kling-o1 $4.48 + veo-3.1 $3.20 + veo-lite $1.60 + seedance-fast $5.60 + seedance-1.5 $4.00 + hailuo $7.84 (16 runs) + wan-2.6 $4.00 + wan-2.7 $4.00 | $38.08 | $51.20 |
| 4 Multi-shot | 9 | kling-pro $2.24 + seedance-2.0 $2.80 + veo-fast $1.60 + wan-2.6 $1.00 + wan-2.7 $1.00 + seedance-1.5 $1.00 | $9.64 | $12.60 |
| **All phases** | **193 clips + 2 images** | 974 s of video | **$107.78** | **$150.50** |
| Re-run contingency | | one re-run for up to 15% of cells | +$16.17 | +$22.58 |
| Optional 5 (fal) | 5 | seedance r2v 3 x 5 s x $0.1814 (video-ref rate) + kling o3 2 x 5 s x $0.112 | $3.84 | $3.84 |

Options for the owner:

| Option | Phases | Covers | Expected | Ceiling |
|---|---|---|---|---|
| Minimum | 0 + Phase 1 on kling-pro and seedance-2.0 only | One verified clip per move (the issue's acceptance) on the two default models | **$35.58** | $39.50 |
| Recommended | 0, 1, 2, 4 | Every move and framing term on the three core models, plus multi-shot coverage | **$69.70** | $99.30 |
| Full | 0-4 | Adds per-model notes for every `MODELS.md` video model | **$107.78** | $150.50 ($173 with contingency) |

Notes on the numbers:

- OpenRouter bills the requested duration; Kling and Seedance return about 1 s more than requested at no extra cost (`docs/models/video.md`, clip duration overshoot).
- `generations.jsonl` records the provider-billed `cost_usd` when OpenRouter returns it, else the billing-table estimate. Reconcile against `ralphy project budget` after each phase; if Phase 1 lands near the ceiling rather than the expected figure, re-quote the remaining phases before continuing.
- The spend gate (`ralphy project approve --cap`) adds the dry-run estimate to actual spend before each call. Set the cap from the ceiling column of the chosen option, not from a sum of dry-runs.

## How to run it (after approval)

`ralphy` below is the installed binary; in a checkout use `bun run ralphy -- <command>`. Slot names avoid the `scene-NN` prefix, so the storyboard gate (#570) does not apply.

**1. Setup and anchors.**

```bash
ralphy project create "Camera language matrix" --as cam-lang-matrix-001 --workspace <ws>
ralphy project log-prompt cam-lang-matrix-001 --stage approval --text "<the owner's approval, verbatim>"
ralphy project approve cam-lang-matrix-001 --cap <ceiling of the chosen option, e.g. 100> --expiry 72h --reason "#566 camera-language matrix (option: <minimum|recommended|full>)"

# Save the anchor plate prompt from "The scene" to the project's prompts/cam-plate.txt, then:
ralphy generate image --project cam-lang-matrix-001 --slot cam-plate-9x16 \
  --model google/gemini-3-pro-image-preview --aspect 9:16 \
  --prompt-file prompts/cam-plate.txt --note "#566 anchor plate 9:16"
ralphy generate image --project cam-lang-matrix-001 --slot cam-plate-16x9 \
  --model google/gemini-3-pro-image-preview --aspect 16:9 \
  --ref <path of cam-plate-9x16 from the previous output> \
  --prompt-file prompts/cam-plate.txt --note "#566 anchor plate 16:9 (Hailuo)"
```

Approve the 9:16 plate by eye before any video run (art-director rule: never i2v an unapproved anchor). Set `PLATE916` / `PLATE169` in the runner to the `localPath` values the two commands print.

**2. Dry-run every phase ($0), then submit.** Save the runner below as `cam566.sh` outside the repository (it only calls `ralphy`) and run it with bash.

```bash
bash cam566.sh p1            # dry-run: validates every request against the catalog, prints estimates
bash cam566.sh p1 --paid     # submits Phase 1 to the queue, tag cam566-p1
ralphy daemon start          # the queue worker, if it is not already running
ralphy queue list --tag cam566-p1
```

```bash
#!/usr/bin/env bash
# cam566.sh <p1|p2|p3|p4> [--paid] -- #566 camera-language matrix runner.
set -eo pipefail
PHASE=$1
P=cam-lang-matrix-001
PLATE916=artifacts/images/cam-plate-9x16.png   # replace with the printed localPath
PLATE169=artifacts/images/cam-plate-16x9.png   # replace with the printed localPath
if [ "$2" = "--paid" ]; then MODE=(--queue --queue-tag "cam566-$PHASE"); else MODE=(--dry-run); fi

STILL="The ginger cat stays seated on the wall, tail flicking slowly."
AWAY="The ginger cat walks slowly along the top of the wall toward the archway."
TOWARD="The ginger cat walks slowly along the top of the wall toward the camera."
TAIL="A light sea breeze moves the lemon leaves and the striped awning. Warm golden-hour light, photographic, natural colour, no people, no text."
T2V_SCENE="of a red vintage motor scooter parked on a cobblestone street in a small Mediterranean seaside town at golden hour; a lemon tree in a terracotta pot beside it, a stone archway to a sunlit harbour behind, a ginger cat on a low stone wall. Locked-off tripod shot, the camera does not move. Warm natural light, photographic, no people, no text."

MOVES='m01|Locked-off tripod shot, the camera does not move.|still
m02|Slow pan right from the red scooter to the ginger cat on the wall.|still
m03|Slow tilt up from the cobblestones to the rooftops and the sky above the archway.|still
m04|Slow push-in toward the red scooter over the whole clip, ending on a medium close-up of the scooter.|still
m05|Slow pull-back away from the red scooter, revealing more of the street and the lemon tree.|still
m06|Slow optical zoom in on the red scooter; the camera stays in place.|still
m07|Sudden fast crash zoom onto the ginger cat'"'"'s face.|still
m08|Dolly zoom on the red scooter: the camera pulls back while zooming in, the scooter stays the same size and the archway behind it stretches away.|still
m09|The camera trucks left, sliding sideways past the lemon tree while keeping the scooter in frame.|still
m10|The camera rises straight up on a pedestal, staying level with no tilt.|still
m11|Crane up over the scooter and the wall to reveal the harbour and boats beyond the archway.|still
m12|The camera rises and tilts down until it looks straight down on the red scooter from overhead.|still
m13|Slow 90-degree arc around the red scooter from left to right, scooter centered.|still
m14|The camera circles 360 degrees around the red scooter, scooter centered.|still
m15|Tracking shot moving alongside the ginger cat, keeping it in profile.|away
m16|The camera follows the ginger cat from behind at a steady distance.|away
m17|Leading shot: the camera moves backward ahead of the ginger cat, facing it.|toward
m18|Handheld camera, subtle natural sway.|still
m19|Shaky handheld found-footage camera, jittery and unstable.|still
m20|Smooth steadicam glide forward past the red scooter toward the archway.|still
m21|Fast FPV drone flight low over the cobblestones, past the scooter and through the archway toward the harbour, banking slightly.|still
m22|Aerial drone shot rising slowly above the rooftops, revealing the whole harbour and the sea.|still
m23|Fast whip pan from the red scooter to the ginger cat with motion blur.|still
m24|Rack focus from the lemon tree in the foreground to the red scooter behind it.|still
m25|The camera slowly rolls 15 degrees clockwise around the lens axis.|still
m26|The camera does a full 360-degree barrel roll around the lens axis.|still
m27|First-person POV walking forward along the street toward the archway, natural head movement, no cuts.|still
m28|Slow push-in toward the red scooter, then a slow 45-degree arc to the right.|still'

BRACKETS='m01|[Static shot]
m04|[Push in] toward the red scooter, ending on a medium close-up.
m05|[Pull out] from the red scooter, revealing more of the street.
m06|[Zoom in] on the red scooter.
m09|[Truck left] past the lemon tree, the scooter stays in frame.
m11|[Pedestal up] over the scooter and the wall, revealing the harbour beyond the archway.
m13|[Truck left,Pan right,Tracking shot] around the red scooter, scooter centered.
m18|[Shake]'

FRAMING='f01|Extreme wide establishing shot
f02|Medium shot
f03|Close-up
f04|Extreme close-up of the chrome headlamp
f05|Low-angle shot looking up
f06|High-angle shot looking down
f07|Top-down overhead shot looking straight down
f08|Dutch-angle shot with the horizon tilted 15 degrees'

subject() { case $1 in away) echo "$AWAY";; toward) echo "$TOWARD";; *) echo "$STILL";; esac; }

# gen <slot> <model> <duration> <aspect> <resolution> <first-frame or -> <prompt>
gen() {
  local ff=()
  if [ "$6" != "-" ]; then ff=(--first-frame "$6"); fi
  ralphy generate video --project "$P" --slot "$1" --model "$2" --duration "$3" \
    --aspect-ratio "$4" --resolution "$5" "${ff[@]}" --prompt "$7" \
    --note "#566 camera matrix $PHASE" "${MODE[@]}"
}

# sweep <model> <short> <duration> <ids or all>
sweep() {
  echo "$MOVES" | while IFS='|' read -r id cam subj; do
    case " $4 " in *" all "*|*" $id "*) ;; *) continue;; esac
    gen "cam-$id-$2" "$1" "$3" 9:16 720p "$PLATE916" "$cam $(subject "$subj") $TAIL"
  done
}

SPOT="m01 m04 m05 m06 m09 m11 m13 m18"
case $PHASE in
  p1)
    sweep kwaivgi/kling-v3.0-pro kling-pro 5 all
    sweep bytedance/seedance-2.0 sd2 5 all
    sweep google/veo-3.1-fast veo-fast 4 all ;;
  p2)
    echo "$FRAMING" | while IFS='|' read -r id frame; do
      gen "cam-$id-kling-pro" kwaivgi/kling-v3.0-pro 5 9:16 720p - "$frame $T2V_SCENE"
      gen "cam-$id-sd2" bytedance/seedance-2.0 5 9:16 720p - "$frame $T2V_SCENE"
      gen "cam-$id-veo-fast" google/veo-3.1-fast 4 9:16 720p - "$frame $T2V_SCENE"
    done ;;
  p3)
    sweep kwaivgi/kling-v3.0-std kling-std 5 "$SPOT"
    sweep kwaivgi/kling-video-o1 kling-o1 5 "$SPOT"
    sweep google/veo-3.1 veo31 4 "m01 m04 m06 m13"
    sweep google/veo-3.1-lite veo-lite 4 "$SPOT"
    sweep bytedance/seedance-2.0-fast sd2-fast 5 "$SPOT"
    sweep bytedance/seedance-1-5-pro sd15 5 "$SPOT"
    sweep alibaba/wan-2.6 wan26 5 "$SPOT"
    sweep alibaba/wan-2.7 wan27 5 "$SPOT"
    echo "$MOVES" | while IFS='|' read -r id cam subj; do
      case " $SPOT " in *" $id "*) ;; *) continue;; esac
      gen "cam-$id-hailuo" minimax/hailuo-2.3 6 16:9 1080p "$PLATE169" "$cam $(subject "$subj") $TAIL"
    done
    echo "$BRACKETS" | while IFS='|' read -r id br; do
      gen "cam-$id-hailuo-br" minimax/hailuo-2.3 6 16:9 1080p "$PLATE169" "$br $STILL $TAIL"
    done ;;
  p4)
    SCENE="A quiet cobblestone street in a small Mediterranean seaside town at golden hour, a red vintage motor scooter mid-street, a ginger cat on a low stone wall, a stone archway to a sunlit harbour behind."
    gen cam-s01-kling-pro kwaivgi/kling-v3.0-pro 10 9:16 720p - "$SCENE [Shot 1: Wide shot] Locked-off eye-level view of the whole street, the archway and harbour behind. [Shot 2: Medium shot] Slow push-in toward the red scooter. [Shot 3: Close-up] Locked-off close-up on the cat's face as it blinks slowly. Photographic, no people, no text."
    gen cam-s02-kling-pro kwaivgi/kling-v3.0-pro 10 9:16 720p - "Wide establishing shot, locked-off, eye level: $SCENE Cut to a medium shot of the red scooter with a slow push-in. Cut to a locked-off close-up of the ginger cat blinking slowly. Photographic, no people, no text."
    gen cam-s03-sd2 bytedance/seedance-2.0 10 9:16 720p - "Shot 1: wide establishing shot of a cobblestone seaside street at golden hour, fixed camera position; a red vintage scooter stands mid-street, a ginger cat sits on a low stone wall. Shot 2: cut to a medium shot of the red scooter, slow push-in. Shot 3: cut to a close-up of the ginger cat, fixed camera, it blinks slowly. Warm natural light, photographic look, consistent street and lighting across all shots, no people, no text."
    gen cam-s04-sd2 bytedance/seedance-2.0 10 9:16 720p - "0-3s: wide establishing shot of a cobblestone seaside street at golden hour, fixed camera; a red vintage scooter mid-street, a ginger cat on a low stone wall. 3-7s: medium shot of the red scooter, slow push-in. 7-10s: close-up of the ginger cat blinking slowly, fixed camera. Warm natural light, photographic, no people, no text."
    gen cam-s05-veo-fast google/veo-3.1-fast 8 9:16 720p - "[00:00-00:03] Wide establishing shot, eye level, locked-off: a cobblestone seaside street at golden hour, a red vintage scooter, a ginger cat on a low wall. [00:03-00:06] Medium shot, slow push-in toward the red scooter. [00:06-00:08] Close-up, locked-off, on the ginger cat blinking slowly. Photographic, no people, no text."
    gen cam-s06-veo-fast google/veo-3.1-fast 8 9:16 720p - "$SCENE Shot 1: wide establishing shot, locked-off. Shot 2: medium shot of the red scooter, slow push-in. Shot 3: locked-off close-up of the ginger cat blinking slowly. Photographic, no people, no text."
    WAN="$SCENE Warm natural light, photographic. Shot 1 [0-3s] wide shot: fixed camera, the whole street with the archway and harbour behind. Shot 2 [4-6s] medium shot: hard cut, the camera pushes in toward the red scooter. Shot 3 [7-10s] close-up: hard cut, fixed camera on the cat blinking slowly. No people, no text."
    gen cam-s07-wan26 alibaba/wan-2.6 10 9:16 720p - "$WAN"
    gen cam-s08-wan27 alibaba/wan-2.7 10 9:16 720p - "$WAN"
    gen cam-s09-sd15 bytedance/seedance-1-5-pro 10 9:16 720p - "Shot 1: wide establishing shot of a cobblestone seaside street at golden hour, fixed camera; a red vintage scooter mid-street, a ginger cat on a low stone wall. Shot 2: cut to a medium shot of the red scooter, slow push-in. Shot 3: cut to a close-up of the ginger cat, fixed camera, blinking slowly. Photographic, no people, no text." ;;
  *) echo "usage: bash cam566.sh <p1|p2|p3|p4> [--paid]" >&2; exit 2 ;;
esac
```

Submit one phase at a time and reconcile spend (`ralphy project budget cam-lang-matrix-001`) before the next. Expect several hours of wall time for the full plan: 193 clips at a few minutes each, limited by the per-model concurrency caps in `docs/models/video.md`.

Failure handling: a provider error is not a camera result. Re-submit the slot once (append-only, it lands as `.v2`). A Seedance `InputImageSensitiveContentDetected` on this plate would be a finding in itself; record it and do not reroute.

**3. Contact sheets ($0, local ffmpeg).** For each clip:

```bash
ralphy ref digest <project>/artifacts/videos/cam-m04-kling-pro.mp4 \
  --project cam-lang-matrix-001 --slug cam-m04-kling-pro --every 0.25 --tiles 24
```

A 5-6 s clip gives one sheet of about 20-24 frames; the 8-10 s multi-shot clips give two. The 0.25 s cadence is denser than the #557 default (0.5 s) on purpose: camera motion is read from frame-to-frame change, and short clips keep the sheet count at one or two. `digest.json` also carries `scenes.cuts`, the frame-exact hard-cut list, which scores unrequested cuts and multi-shot structure without reading the image.

## Scoring

The scorer reads each contact sheet (in-session vision, no model call) and `digest.json`, then records one row per run.

**Motion runs (Phases 1 and 3), four axes, 0-2 each:**

| Axis | 2 | 1 | 0 |
|---|---|---|---|
| A. Move executed | The named move, in the asked direction, over most of the clip | Partial, too small, or wrong direction | No camera move (for M01: the camera moved) |
| B. Move type | The right signature: parallax for push-in / pull-out / truck / pedestal / crane / arc; no parallax for zoom / pan / tilt; horizon rotation for roll; focus shift for rack focus | Ambiguous | A different move (zoom for a push-in, pan for a truck) |
| C. Artifacts | Clean | Minor warping, texture swim, soft geometry | Severe: melting geometry, duplicated or morphing scooter or cat |
| D. Discipline | Nothing unrequested | Extra drift or a second move | An unrequested cut (`scenes.cuts` not empty) or a different shot |

Verdict: `ignores` when A = 0; else `artifacts` when C = 0; else `follows` when the total is 7-8; otherwise `weak`.

**Framing runs (Phase 2):** A = framing matches the term (2 / 1 / 0), C and D as above (D: the camera stayed locked), out of 6. `follows` at 5-6.

**Multi-shot runs (Phase 4), 0-2 each:** cut structure (2 = exactly two cuts in `scenes.cuts`; 1 = off by one or soft transitions; 0 = one continuous take), shot sizes in the asked order, the camera instruction of each shot, continuity of scooter, cat and street across the cuts. `follows` at 7-8.

Calibration: before scoring a phase, score M01, M04 and M06 on the core models together and agree on what "parallax" looks like on this plate; re-score 10% of the sheets blind at the end and report the agreement.

## Results and write-back

1. Record every run in `docs/research/camera-language-test-results.json`: run ID, model, slot, clip path, digest path, the four axis scores, verdict, one-line note, `cost_usd` from `generations.jsonl`.
2. Update the guideline cells from `untested` to `tested: <verdict>` with the clip path, and promote or demote the canonical phrase where a variant scored better (Hailuo bracket vs prose, Seedance `Shot N` vs timecodes).
3. Bump `guideline.json` `version` to 1.0 and set `verification` to the run date; add `examples.json` with the best clip per move once web-optimized copies exist (format in `guidelines/README.md`).
4. Add any new model failure mode to `docs/models/video.md` (append-only failure-mode rows).
5. Confirm spend: `ralphy project log cam-lang-matrix-001 --type generations --limit 300` and `ralphy project budget cam-lang-matrix-001`. The issue's "spend logged through gen-log" is satisfied by running everything through `ralphy generate`.

## Known confounds

- **Prompt rewriters.** Hailuo's `prompt_optimizer` and Wan's `prompt_extend` default on upstream and Ralphy cannot turn them off; Google's Veo rewriter may add camera moves to short prompts. A cell can fail or pass because of the rewrite, not the wording. Note it in the result; a follow-up could expose the passthrough flags.
- **The anchor fixes the opening frame.** Moves that end far from the anchor framing (M12 boom to overhead, M22 aerial rise, M21 FPV) are harder in i2v than in t2v by construction.
- **Resolution and duration drift.** Kling may return 1080p for a 720p request, and Kling / Seedance overshoot the duration by about 1 s. Neither affects the score.
- **n = 1.** One scene, one run. A `follows` verdict is evidence on this scene, not a rate.

## Research notes (2026-10-30)

Summary of the desk research behind the guideline; per-term findings live in the guideline tables. Official sources were read first; most community sources are vendor blogs with single, unscored runs, so they only set direction.

- **No vendor publishes measured camera adherence.** "Documented" means a guide lists or exemplifies the term. The only per-move counts found are small, unreconciled samples (Crepal on Veo 3.1, aistudynow on Wan 2.2), hence the matrix.
- **Hailuo is the only model with a formal camera syntax:** 15 bracket commands, up to 3 per bracket, sequenced by position, 2,000-character prompts, on Hailuo 2.3 / 2.3-Fast / 02. MiniMax recommends turning the prompt optimizer off for exact commands; Ralphy does not expose that flag.
- **Kling** has no camera parameter on OpenRouter or fal for 3.0 (older Kling API versions had a `camera_control` object). Kling's own guides list the vocabulary and warn against stacked moves; multi-shot exists as a UI / native-API feature (`multi_prompt`, up to 6 shots) that OpenRouter does not expose. Community tests disagree on whether Kling separates zoom from dolly.
- **Veo 3.1** has the broadest documented vocabulary (the Vertex prompt guide defines pan, tilt, dolly, truck, pedestal, crane, zoom, dolly zoom, arc, whip pan, rack focus, handheld, aerial) and documented timestamp multi-shot. Google gives no adherence differences between Standard, Fast and Lite; community reports say Fast and Lite are looser on precise moves. The Gemini API preview endpoints for Veo 3.1 were shut down on 2026-10-22; OpenRouter still lists all three ids.
- **Seedance 2.0's** official guide asks for one move per shot, a numbered shot list without timecodes, and positive constraints; `camera_fixed` exists only on Seedance 1.5 pro and 1.0. Camera replication from a reference video is documented and is the recommended path for hard moves.
- **Wan's** shared 2.6 / 2.7 / 3.0 guide documents plain-verb camera phrases ("camera pushes in", "camera moves left", "fixed camera"), orbiting, and timed multi-shot; its examples were generated with Wan 2.2. Wan 2.6 multi-shot needs `shot_type=multi` with `prompt_extend` on; Wan 2.7 takes multi-shot from the prompt alone.
- **Sora 2:** OpenAI's prompting guide (one camera move and one subject action per shot, storyboard-style shot blocks) is still the clearest general advice, but the Sora 2 API was removed on 2026-09-24. The rule is kept as a cross-model principle; the model is excluded.
- **Repo finding:** the dry-run estimator (`cli/lib/or-catalog.ts`) and the billing table (`cli/lib/providers/openrouter.ts`) disagree with each other for Kling Std, Veo Fast, Veo Lite, Seedance 2.0 and Seedance 2.0 Fast, and neither carries the 2026-10-30 catalog prices recorded in `MODELS.md` (see the cost section). Not fixed here.

## Sources

Official:

- [Kling camera control guide](https://kling.ai/blog/kling-ai-camera-control-video-guide), [Kling 3.0 multi-shot guide](https://kling.ai/blog/kling-video-3-multi-shot-guide), [Kling prompt guide](https://kling.ai/blog/kling-ai-prompt-guide), [Kling O1 user guide](https://kling.ai/quickstart/klingai-video-o1-user-guide), [Kling image-to-video guide](https://kling.ai/quickstart/image-to-video-guide), [Kling V3 vs O3](https://kling.ai/blog/kling-v3-vs-o3-comparison-guide)
- [fal Kling 3.0 prompting guide](https://blog.fal.ai/kling-3-0-prompting-guide/), [fal Kling 3.0 Pro guide](https://fal.ai/learn/tools/how-to-use-kling-3-0-pro), [fal Kling O3 r2v API](https://fal.ai/models/fal-ai/kling-video/o3/pro/reference-to-video/api), [fal Kling v3 Pro t2v API](https://fal.ai/models/fal-ai/kling-video/v3/pro/text-to-video/api)
- [Veo 3.1 prompting guide (Google Cloud)](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1), [Vertex Veo prompt guide](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/video-gen-prompt-guide), [Vertex video best practices](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/best-practice), [Gemini API Veo docs](https://ai.google.dev/gemini-api/docs/veo), [Veo 3.1 Lite announcement](https://cloud.google.com/blog/products/ai-machine-learning/veo-3-1-lite-and-a-new-veo-upscaling-capability-on-vertex-ai)
- [Seedance 2.0 prompt guide (BytePlus)](https://docs.byteplus.com/en/docs/modelark/seedance-2-0-prompt-guide), [Seedance 2.0 tutorial](https://docs.byteplus.com/en/docs/modelark/seedance-2-0), [Seedance 1.5 pro guide](https://docs.byteplus.com/en/docs/modelark/seedance-1-5-pro), [ModelArk create-task API (`camera_fixed`)](https://docs.byteplus.com/en/docs/ModelArk/1520757), [fal Seedance 2.0 r2v](https://fal.ai/models/bytedance/seedance-2.0/reference-to-video), [fal Seedance 2.0 prompting guide](https://fal.ai/learn/tools/seedance-2-0-prompting-guide)
- [MiniMax t2v API reference](https://platform.minimax.io/docs/api-reference/video-generation-t2v), [MiniMax i2v API reference](https://platform.minimax.io/docs/api-reference/video-generation-i2v), [Hailuo camera cheatsheet](https://hailuoai.video/pages/blog/camera-movement-prompt-cheatsheet)
- [Wan prompt guide (Alibaba Model Studio)](https://help.aliyun.com/en/model-studio/text-to-video-prompt), [Wan API reference](https://www.alibabacloud.com/help/en/model-studio/text-to-video-api-reference), [Wan 2.2 repository](https://github.com/Wan-Video/Wan2.2)
- [Sora 2 prompting guide](https://developers.openai.com/cookbook/examples/sora/sora2_prompting_guide), [OpenAI API deprecations](https://developers.openai.com/api/docs/deprecations)
- [OpenRouter video models endpoint](https://openrouter.ai/api/v1/videos/models), [OpenRouter video generation guide](https://openrouter.ai/docs/guides/overview/multimodal/video-generation)

Community (directional):

- Kling: [Atlas Cloud camera tests](https://www.atlascloud.ai/blog/tips/kling-4-controlled-camera-movement), [videoai.me camera prompts](https://videoai.me/blog/kling-ai-camera-movement-prompts), [Magic Hour Kling 3.0 reference](https://magichour.ai/blog/kling-30-reference-guide), [Runware multi-shot templating](https://runware.ai/docs/models/klingai-video-3-0-turbo/guides/multi-shot-templating)
- Veo: [Crepal motion-control tests](https://crepal.ai/blog/aivideo/veo-motion-controls-ai/), [Imaginary prompt slotting](https://www.imaginary.app/blog/veo-31-prompt-slotting-fix-why-your-shot-ignores-the-camera-move-and-how-to-rewr), [Visla Sora 2 Pro vs Veo 3.1](https://www.visla.us/blog/?p=5933), [Veo 3.1 timestamp prompting (dev.to)](https://dev.to/akaranjkar08/veo-31-developer-guide-timestamp-prompting-multi-shot-video-and-full-api-june-2026-3l5i)
- Seedance: [seedance.tv camera prompts](https://seedance.tv/blog/seedance-2-0-camera-movement-prompts), [Higgsfield Seedance guide](https://higgsfield.ai/blog/seedance-prompting-guide), [Segmind Seedance techniques](https://blog.segmind.com/writing-seedance-prompt-techniques/)
- Hailuo: [Picasso IA camera handling](https://blog.picassoia.com/how-hailuo-23-handles-camera-movement), [Curious Refuge review](https://curiousrefuge.com/blog/minimax23-ai-video-generator-review), [Eachlabs Hailuo 2.3 prompts](https://www.eachlabs.ai/blog/how-to-write-better-hailuo-2-3-prompts)
- Wan: [aistudynow Wan 2.2 tests](https://aistudynow.com/how-to-write-better-wan-2-2-prompts-tested-in-comfyui/), [Crepal Wan 2.6 i2v notes](https://crepal.ai/blog/?p=4360), [Cliprise Wan 2.7 guide](https://www.cliprise.app/learn/guides/model-guides/wan-2-7-video-complete-guide)
