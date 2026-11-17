---
name: ralphy-reverse
description: >-
  Copy a short video from a reference as exactly as possible: pull it, break it down with
  timecodes (shots, cuts, beats, words, on-screen text), rebuild it as a HyperFrames composition
  with the same structure, timing, cuts on the beat, text and sound (the original audio may be
  reused), render it and prove the match side by side. The result is saved as version v1 and
  rendered to render.mp4. Triggers: "copy this video", "recreate this reel", "make it exactly like the reference", "1:1
  copy", "break this down by timecodes", "скопируй ролик", "сделай как в референсе", "повтори этот
  рилс", "сделай один в один", "разбери по таймкодам".
---

# ralphy-reverse

v1 is the reference rebuilt so closely that a viewer would call it the same video. Not "inspired
by": the remake changes things later; the copy changes nothing it does not have to. The owner's
rejections came from copies that drifted: static frames with a camera push-in where the reference
had cut-heavy motion, cuts a frame or two off the music, a washed-out regrade.

## 1. Set up

```bash
ralphy content new <account> "<title>" --ref <url>
cd "$(ralphy content path <id>)/../.."             # the account folder
ralphy tool breakdown <url> --language <lang>       # add --ocr when the video carries text
```

This writes `refs/<slug>/`: `source.mp4`, `source.json`, `cuts.json`, `beats.json`,
`transcript.json`, `frames/`, `breakdown.md`. Add `refs/<slug>` to `refs:` in the Content's
`notes.md`.

## 2. Read the reference

1. `frames/sheet.jpg` (the whole video), then `frames/shots*.jpg` (first frame of every shot).
2. Dense windows around every fast event, every frame:
   `ralphy tool frames refs/<slug>/source.mp4 --window 3.2:4.9`. A 0.5 s sheet misses
   2- and 3-frame cards, jump zooms and flashes.
3. A "cut" in `cuts.json` is any hard picture change. Label each one from the frames: shot change,
   jump zoom, graphic slam. Flashes are listed apart.
4. Measure instead of guessing: positions and sizes in source pixels, text height (`ocr.json`
   `height_px`), colours sampled from frames, easing by stepping frame by frame, which sound each
   cut or accent sits on (`beats.json` `cut_alignment`).
5. Fill every row and section of `breakdown.md`, including KEEP and DO NOT ADD.

## 3. Decide how each shot is made

Tag each shot in the breakdown:

- `code`: HTML, CSS, SVG, canvas, GSAP. Graphics, UI, type and motion design copy exactly this way
  and cost nothing. Check the library first (`ralphy-library`).
- `footage`: material the reference itself borrowed (a film clip, stock), obtained on its own, or
  footage the user supplies. Note its source in `notes.md`.
- `generated`: only what code and footage cannot do. Load `ralphy-fal`; cost first.

Never paste the reference's own frames into the output: that is a re-upload, not a copy.

Sound: reuse the reference's audio track when the copy keeps its timing. Extract it without
re-encoding: `ffmpeg -i refs/<slug>/source.mp4 -vn -c:a copy <content>/media/ref-audio.m4a`. Do not
swap in library or generated music in the copy.

## 4. Build

`index.html` in the Content folder, following the upstream HyperFrames skills and
`ralphy/references/hyperframes-pitfalls.md`. Media go in `media/`.

- **Clock.** Composition time = reference time. Each cut lands on the reference's frame from
  `cuts.json` (frame k shows at k/fps).
- **Beat.** An event meant to hit a sound lands on the frame nearest the sound's arrival
  (`arrival` in `beats.json`, where a swell reaches 90% of its rise), not on its onset.
- **Text.** Same words, size, weight, case, colour, position, and entry timing per word or line.
  Missing font: the nearest free face with the same width and weight; note it.
- **Motion.** Same easing, speed, camera path and density. Real motion stays real motion; never stand
  in a still with a slow zoom for a moving shot.
- **Look.** Same palette, contrast and grade. No neutral or washed-out regrade, no global tint.
- **Frame.** A non-vertical reference fills the 9:16 canvas the way `references/proof.md` describes;
  no letterbox strip with black around it.

## 5. Save, render, prove

```bash
ralphy content save <id> -m "v1: copy of refs/<slug>"
ralphy render <id>                                   # writes render.mp4
ralphy tool compare refs/<slug>/source.mp4 videos/<nnn>-<slug>/render.mp4 --labels ref,copy
```

Read every pair sheet. The pass bar and how to read the numbers: `references/proof.md`. The fix
loop: edit the working tree, `ralphy render <id>` (overwrites `render.mp4`), compare again, and
save when it is right (`ralphy content save <id> -m "..."`). A passing lint and a clean decode
prove nothing about similarity.

Report to the user: what matches, what does not and why, with timecodes and the sheet paths; what
you measured and what you did not (say you did not listen or watch in real time unless you did).

Then load `ralphy-remake`.
