# Composition structure

HyperFrames, 1080×1920, 30fps, ~68s. One root composition; sequential `<video>`/img clips on track 0; overlays (countdown, meter HUD, captions, monster-group, endcard) as always-present divs gated by one paused GSAP timeline. `composition-skeleton.html` is the working body — these are the beats + timings to retime against your VO.

## Beat map (reference timings, retime to your VO)
| Time | Beat | Notes |
|---|---|---|
| 0–11.9 | **Intro / two-door hub** | VO "pick a door" FIRST → 5s film-leader countdown (SVG ring sweep + per-second tick) → doors revealed. No text labels on doors. |
| 11.9–14.9 | **Enter SAFE door** | seedance i2v: dolly to door → door opens → plunge to pure black (3s, last-frame = black). |
| 14.9–38.8 | **SAFE world montage** | 6 photoreal cozy stills, **concatenated into ONE video**, slow (~4s holds). VO "If you chose X — you're safe...". |
| 38.8–41.8 | **Enter BAD door** | seedance i2v → black. VO "But behind Y — you're not." starts. |
| 41.8–49.3 | **BAD descent** | hallway → forced-work room → cell (seedance push-ins). `{{meter}}` HUD appears on the "meter burns into your arm" line, drains slowly. |
| ~50.8–51.8 | **Meter CRASH** | on the last narration word, meter drops to 0 in ~1s, turns red. |
| 51.6–51.9 | **SCREAMER** | hard black blink + **music cuts to silence (hiss stays)** + monster snaps in (instant `tl.set`, no anim). |
| 51.9–53.0 | **Silent hold** | monster stares, dead air ~1.2s, no box/beeps/motion. |
| 53.0–63.9 | **Monster speaks** | VT323 textboxes (typewriter) + beep track per box + mouth-swap talk + blink + discrete snap/scale-lurch position cycle. Music resumes. |
| 64.6 | **Snap-zoom** | instant `tl.set` scale ~2.6 into the monster face (origin 50% 30%), face centered. |
| 65.0–end | **Endcard** | `{{endcard}}` slam (e.g. OBEY THE LIMITS) between the eyes and mouth. |

## Track / element conventions
- track 0: scene videos + finale still (sequential, no overlap). Each `<video>` carries its own `id` + `data-start` + `data-duration` (NOT on a wrapper — HyperFrames freezes wrapped video).
- track 9: VO. track 10: ticks. track 11: beeps. track 12-14: 3 music beds (neutral/chill/creepy, crossfaded; the creepy bed is SPLIT to create the screamer silence). track 15: continuous VHS hiss.
- `#monster-group` wraps all face cutouts; position/scale snaps move the group, child opacity toggles mouth/blink.
- LIMITS HUD: div gauge, `scaleX` fill + proxy `{v}` onUpdate % counter; green→red on crash.
- Countdown: SVG ring `strokeDashoffset` sweep per second + number `tl.set`.

## Transitions
Door-entry clips end on pure black → hard cut to next scene (black handles the seam, on-genre). Between non-black scenes use 0.5s opacity crossfades. No smooth monster motion — everything in the finale is discrete `tl.set` snaps.
