# Motion for still images

Narrated still-image shorts (paintings, illustrations, photos) were rated "the animation is weak" with
linear 1.0-1.15 zooms, haze and 0.35 s dissolves. The fix cost almost nothing:

- **2.5D parallax.** Cut the figure out (`ralphy tool matte <image> --model u2net_human_seg`),
  rebuild the plate under it (inpaint under a dilated mask, e.g. OpenCV TELEA with a ~31 px dilation:
  `uv run --with numpy --with opencv-python-headless`), scale the cutout 4-7% more than the plate.
  Skip parallax on crowds (more than two people) and on frames where the cutout fails; the inpaint
  smears faces. Use a push or a pan there.
- **Transitions chosen by story beat:** push zoom-through (outgoing frame rushes to ~1.38x with blur,
  incoming fades in), whip (both frames travel a full width), dip to black for time jumps, hard cut on
  shocks.
- **Word-synced accents:** punch-in, shake, a grade change, a slash or burst, placed on word timings
  from the voiceover transcript.
- **Spend generated motion where the story peaks:** one or two short image-to-video clips on the key
  action, at the end of their shot.
- A virtual camera on a 1080x1920 frame turns visibly soft past about 1.2x; start from a larger
  source for deeper pushes. One camera move per shot.

When the reference itself moves (footage, motion graphics), copy its motion; none of this replaces
real in-shot movement.
