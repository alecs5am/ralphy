# Text and call to action

## On-screen text

- Look for a text device native to the format before choosing type. For old-master myth shorts that
  was a torn strip of a printed page in Old Standard TT with a red-pencil underline on the key word;
  captions without periods, commas or dashes.
- Avoid by default (the owner reads it as "what Opus makes"): Cormorant or Playfair italic, gold
  accents and hairline rules, letter-spaced small caps, em-dash attributions, word-by-word fade-ups,
  Inter captions with a glow. Copying a reference that used this kit did not make it acceptable.
- Exceptions: a brand's own type system, text baked into generated images, formats whose native look
  is plain sans captions (UGC, talking head, screen recordings).
- Cyrillic coverage: Anton, Bebas Neue, Space Grotesk and Special Elite have no Cyrillic. For Russian
  use a face that has it (Oswald, Inter, Montserrat, Rubik, PT Sans, Old Standard TT, ...). Russian
  words are longer: re-check line breaks and the time each line stays readable.
- Numbers in text can be exact digits; in voiceover they are written as words.
- Captions belong to a subject or object and move with it; a fixed band lying across faces was sent
  back.
- Get a fresh look at the frames: a subagent that did not see your reasoning caught a too-bright card
  over a face and uniform light rays. Filter its suggestions against the list above.

## Safe zones (1080x1920)

Platform UI covers the edges. Keep text and the offer inside x 100-940, y 200-1550 (the bar used in
production); the strictest single platform is Reels at the bottom (about 470 px of UI). Captions
read best at y 1100-1450 or 260-420.

## Call to action

Rules from the reels the owner reviewed (CTA_REVIEW, 2026-11):

- The offer describes the actual thing in the video, for example `Comment PROMPT — get this ad scene`.
  The keyword is unmistakable. No unrelated product UI, no fake buttons.
- No universal chip or banner pasted across videos. Build the CTA from a component already in the
  film (its slab, button, progress bar, type), so it belongs to the scene. A brand ad keeps the
  brand's identity.
- It keeps moving lightly until the last frame, and the scene keeps moving under it.
- Readable for at least 2.2 s, measured on the rendered mp4 from the first frame where the whole
  offer is settled, not just the keyword. Twice a worker measured the keyword and was corrected.
- Inside the safe zone; it does not cover the hero or the key action in held frames.
- Check the rendered text in every language: a translated tail starting with a dash broke inside a
  pill. Check contrast; white on neon measured 1.4-1.6:1 and needed size, weight and a shadow.
- Evidence for the user: the entry frames, the hold every 0.5 s, and one frame at phone width
  (`ralphy tool frames render.mp4 --at <times> --frame-width 390`).
