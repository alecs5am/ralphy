# Hooks — pixel-art-product-reveal

The first 2 seconds of any 9:16 short are the scroll-stop window. This template's hooks all share a structural shape: **a physical impact + a typographic slam, set against a quiet duotone halftone world**. The quiet background makes the impact land harder.

Below: 5 reusable scene-01 hook patterns. Pick one per project; pattern A is the source-project default.

## Pattern A — Off-frame WHIP entrance (the playdate-pixel-001 default)

The hero device WHIPS in violently from the far right with a halftone-dithered ink-trail, SLAMS to dead-center, frozen mid-air with a rotation wobble. An illustrated speech bubble PUNCHES in beside it with a greeting word.

```
EXPLOSIVE entrance: the {{product_brand_color_name}} {{product_name}} device WHIPS in violently from the far right with a massive halftone-dithered {{duotone_dark_hex}} ink-trail streaking across the entire frame, then SLAMS to a violent dead-stop dead center with subtle screen-shake and rotation wobble. The halftone-dithered illustrated world background STAYS STATIC. Smooth-illustrated burst rays radiate outward; an illustrated speech bubble with the word HELLO. PUNCHES into the frame on the right side. Camera: snap-zoom from wide to medium-close on impact, then holds. Vertical 9:16.
```

Why it works: ALL-CAPS action verbs (WHIPS, SLAMS, PUNCHES) telegraph energy to seedance (per flipper postmortem rule #8). The "background stays static" clause is load-bearing — without it, seedance starts animating the dither pattern, which reads as a glitch.

Variants:
- swap "from the far right" → "from above / from below / through the floor / through the screen"
- swap "HELLO." speech bubble → "{{product_name}}." (brand reveal) or "{{tagline_text_first_word}}." (tagline tease)

## Pattern B — Macro screen draw-in cold open

Open with EXTREME MACRO on the device's screen. The screen is blank duotone halftone wallpaper for the first 8 frames. Then a smooth hand-illustrated character DRAWS HIMSELF onto the screen — line by line, halftone shading fills in — and winks at camera. Illustrated text types itself in beside him.

```
Cold open: EXTREME MACRO on the {{product_name}}'s screen. For the first 8 frames the screen is blank duotone halftone wallpaper texture. Then a smooth hand-illustrated halftone cartoon character (a {{style_ref_corpus_names}}-style character) APPEARS on the screen as if drawing himself in — line by line, halftone shading fills in. He then winks at camera. Pixel-illustrated text "{{product_name_or_greeting}}" types itself in beside him pixel-by-pixel. The {{product_brand_color_name}} body of the device around the screen stays in soft DOF blur throughout. Camera holds, very slight 5% punch-in last 10 frames. Vertical 9:16.
```

Why it works: the macro framing makes the screen content feel like a window into a separate world. The "drawing himself in" beat is a meta-acknowledgment of the illustrated style.

Use when: the brand has a strong character/mascot the audience already recognizes. Don't use when there's no public character corpus — the cold-open character pull doesn't land.

## Pattern C — Gimmick-first reveal

Open on the gimmick alone (crank / dial / slider) before revealing the device. Builds intrigue. The first frame is an extreme macro on the gimmick, then a smooth pull-back reveals the device, then the speech bubble PUNCHES in.

```
Reveal opening: EXTREME MACRO on the {{product_gimmick}} alone. The texture (knurled grip / dial markings / slider channel) is in razor-sharp focus. For the first 12 frames, only the gimmick is visible against soft duotone halftone background. Then the camera smoothly PULLS BACK over 18 frames to reveal the full {{product_brand_color_name}} {{product_name}} device, with the gimmick still deployed. As the device fully reveals, an illustrated speech bubble PUNCHES in with the word HELLO. Vertical 9:16.
```

Why it works: the gimmick IS the differentiator for this product class — opening on it tells the viewer "this device does THIS specific thing" before any branding. Good when the brand is unknown and the gimmick is the headline.

## Pattern D — Chroma slab full-bleed → device drop-in

Frame opens as a full-bleed `{{product_brand_color_hex}}` chroma slab — the brand's signature color filling the entire 9:16 canvas. A 4-frame {{duotone_dark_hex}} halftone "tear" effect rips across the slab, revealing the duotone halftone world beneath. The {{product_name}} drops in from above as the tear completes.

```
Curtain-reveal opening: the frame starts as a FULL-BLEED {{product_brand_color_hex}} chroma slab — the brand's signature color filling the entire 9:16 canvas. For the first 6 frames, only the chroma slab is visible. Then a 4-frame {{duotone_dark_hex}} halftone "tear" effect rips diagonally across the slab from upper-right to lower-left, revealing the duotone halftone illustrated world beneath the slab. As the tear completes, the {{product_name}} device DROPS IN from above, lands centered, and rotation-wobbles. Vertical 9:16.
```

Why it works: starting on the chroma slab itself is a strong brand-equity move when the brand color is recognizable (Playdate yellow, Nothing red, Polaroid white). The tear effect uses the duotone-halftone language as a visual transition device.

Use when: the brand color is already strongly associated with the brand. Don't use when the color is generic.

## Pattern E — Pixel-tile slide-in mosaic

Multiple tiles from the brand's content catalog SLIDE in one at a time, forming a 3-column row across the top of frame. The device drops in below the row as the last tile lands.

```
Mosaic opening: from the LEFT EDGE of the frame, {{product_brand_color_name}}-framed content tiles SLIDE in one at a time across the upper third of frame, forming a 3-column row of tiles within 24 frames. Each tile is a flat duotone halftone illustration (in the {{style_ref_corpus_names}} register) inside a solid {{product_brand_color_hex}} frame. As the third tile locks, the {{product_brand_color_name}} {{product_name}} device DROPS IN from above into the lower 2/3 of the frame, lands centered on a small illustrated halftone platform. An illustrated speech bubble PUNCHES in with the word HELLO. Vertical 9:16.
```

Why it works: previews the "content catalog" reveal that scene-05 will fully unleash. Sets up the structural payoff. Good when the brand has a recognizable content library worth previewing.

## Anti-patterns for hooks

- **DO NOT open with a static wide shot of the device on a plain background.** That's the 99% of product-ad hooks already on TikTok — viewer scrolls past in 0.4s.
- **DO NOT animate the duotone halftone background during the hook.** Background motion competes with the hero device for attention. Keep the background STATIC for the entire 2s hook, animate only the hero device + speech bubble.
- **DO NOT use a Hormozi-style yellow caption ("STOP SCROLLING") over a duotone halftone world.** The Helvetica register clashes with the print-zine register. If you need a caption hook, use a hand-illustrated halftone speech bubble (Pattern A) — same function, doesn't break the aesthetic.
- **DO NOT use a brand jingle or musical sting in the first 2s.** Music starts at frame 0 but should be a quiet ambient swell for the hook window — the impact sound of the device SLAM and the typographic punch should carry. Reserve the chiptune drop for frame ~30 (the macro-tease beat).
