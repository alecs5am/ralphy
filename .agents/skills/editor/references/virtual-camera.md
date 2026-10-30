# Virtual camera (post-production moves)

> #567. Read when a shot needs camera movement added in the edit: footage or stills that sit too still, a word that needs emphasis, a hit that needs impact, landscape footage cut for vertical. These are moves applied to pixels you already have; for camera language inside a generation prompt, see the art-director prompt vocabulary instead.

## The recipes

Twelve recipes are catalog items of kind `camera` (`ralphy catalog list --kind camera`, `ralphy catalog show <id>`). Each is `function catalog_<id>(tl, o)` that adds tweens to your timeline. `o.target` is the element the camera moves: wrap the shot (video, image or layer stack) in its own container and pass that, never the scene root that also holds captions. Insert a recipe with `ralphy catalog use <id> --project <id> --at <sec> --target "#shot"` (#594; the layer recipes take `--bind bg=... --bind subject=...` instead of `--target`, see [`motion-catalog.md`](./motion-catalog.md)); `cam-follow` needs a point track and is wired by hand.

| Recipe | Helps when | Distracts when |
|---|---|---|
| `cam-punch-in` | A talking head needs a second-camera feel: punch on the key word of a line (word starts from `captions.json`). Hold mode alternates tight and wide; pulse punches and eases back | Used on every sentence, or on footage that cannot take a 1.2x upscale |
| `cam-slow-push` | A held shot (face, product, still) must stay alive for more than two seconds; builds intimacy | The edit already cuts every second, or pushes run on both sides of a cut |
| `cam-handheld` | Locked-off AI or stock footage should feel shot on a phone (UGC, vlog, documentary) | The footage already shakes, the frame carries text to read, or the brand is premium and still |
| `cam-whip-pan` | Revealing a second subject in the same wide plate, comic double-takes, travel energy | The plate is no wider than the frame, or a whip-pan transition sits next to it |
| `cam-roll` | Tension, unease, a beat drop (snap) | Horizons, architecture or text must read level; long holds |
| `cam-parallax` | A still or locked shot needs depth: subject cut out with `ralphy matte subject` (#560), background and midground behind | The matte edge is ragged (parallax exposes it) or layers lack overscan |
| `cam-ken-burns` | Photos, screenshots, archival and generated stills held on screen | Low-resolution stills, or images with text to read |
| `cam-follow` | Landscape or wide footage reframed to 9:16 around a moving person; keeping a face centred for captions | The track has long lost stretches, or the shot should feel locked off |
| `cam-crash-zoom` | Reaction beats, meme timing, the detail the viewer must not miss | Calm or premium registers; more than once or twice a video |
| `cam-dolly-zoom` | One dramatic realisation per video, on a clean cutout | No clean cutout, flat backgrounds without depth cues, comedy that has not earned it |
| `cam-pan-reframe` | Two-person or wide landscape shots: pan from one speaker or detail to the other | A moving subject (use `cam-follow`), or shots too short for the pan to settle |
| `cam-impact-shake` | Bass drops, slams, punchlines, with an impact SFX on the same frame | Continuous use, dialogue under the shake, text to read during the hit |

Rules of thumb:

- **One move per shot.** Stack a move only with its natural partner (impact shake on the frame a crash zoom lands; slow push under handheld for UGC).
- **Motivate the move.** A word, a beat, a reveal, a subject that moves. A move with no reason reads as an AI tell.
- **Overscan before you move.** Every recipe that translates or rotates the frame declares a minimum scale (`camera.overscan` in the manifest). Shake, roll and follow scale the target themselves; for the rest make sure the media covers the frame through the whole move.
- **Captions stay put.** Keep captions and UI-safe text outside the camera target so they never shake, roll or zoom with the shot ([`vertical-layouts.md`](./vertical-layouts.md)).
- **Upscale budget.** Footage at 1080x1920 softens visibly past about 1.2x; generate or export at a higher resolution when a recipe needs more (crash zoom, follow at 1.5x).

## Tracks and mattes

- `cam-follow` takes a `ralphy.track/v1` point or face track: `ralphy track point <video> --at <t> --box x,y,w,h` or `ralphy track face <video> --at <t>` (#559). Pass the document as `o.track`, the composition second of track time 0 as `o.trackStart`, the video's drawn box and fit as `o.mapping` (same convention as `RalphyTrack.follow`), and the plate extents as `o.bounds` so the camera stops before an edge shows. Low-confidence and lost keyframes are dropped; `smooth` is a centred moving average in seconds.
- `cam-parallax` and `cam-dolly-zoom` take `o.layers = { bg, mid, fg }` and `o.subject`. Cut the subject out with `ralphy matte subject <clip>` or `ralphy matte key <green.mp4>` (#560) and stack it above the background plate ([`keying-and-matting.md`](./keying-and-matting.md)).

## Determinism

Every recipe is a pure function of timeline time: plain GSAP tweens, or one tween on a proxy whose `onUpdate` computes the offset from the proxy's time with a seeded integer hash (no random source, no clock, no state carried between frames) and returns to zero outside its window. `tests/integration/catalog-camera-determinism.test.ts` seeks each recipe forward, backward, in a shuffled order and from a fresh page and requires identical frame state. HyperFrames renders with several capture workers that each seek into the middle of the timeline, so a recipe that only works when played from the start would break a real render.

When you write a new move: never call `gsap.set` from `onUpdate` without making the value at progress 0 equal to the state before the move, never read `Date.now()` or `Math.random()`, and add the item to the determinism test.
