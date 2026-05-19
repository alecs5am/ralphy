# Hooks — Comic Spider-Verse Action

The first 0–2 seconds of a comic-spiderverse-action cut. Three patterns that work, ordered by retention strength.

## Pattern 1 — Comic-panel zoom-in slam + ink-stroke title word

The hardest stop-the-scroll: open on a **white frame with a single ink-stroke comic word** painted in chunky variable-weight linework, then snap-zoom INTO the word as it dissolves into the first action beat. The word telegraphs the genre (KRRRACK, FWIP, SLAM, KAPOW) so the viewer knows what they're watching within the first 12 frames.

### Prompt seed (drop as SHOT 1 in clip 1)

```text
SHOT 1: Tight close-up, 50mm, snap-zoom-in then dolly-back.
Open on a single chunky ink-stroke comic-panel word "{{caption_style_words}}" painted in deep ink-black on a creamy off-white painterly canvas, halftone dot pattern bleeding through the negative space. Camera snap-zooms INTO the word — the white canvas dissolves around it into the first painted frame of {{urban_location}} at golden hour. The ink linework of the word morphs into the dark linework outlining {{character_a}} mid-{{action_archetype}}. Visible canvas grain throughout, subtle chromatic-aberration RGB offset on the bright edge of the word.
SFX: muted whoosh into a sharp impact-bass hit on the word-snap-zoom, then immediate diegetic SFX of {{action_archetype}}.
```

### Why it works

- **Single comic word = 1 cognitive token.** Lower retention cost than a 5-shot opening; reader processes one word + one feeling.
- **The word is the genre tag** — viewer who sees KRRRACK / FWIP / SLAM instantly knows this is action + comic-coded + not-photoreal. Filter happens in 12 frames.
- **Snap-zoom-into-frame transition** is the canonical Across-the-Spider-Verse opener. Reference-coded to a known canon → trust earned cheaply.

## Pattern 2 — Synchronized in-air silhouette against the sky

Open on **two characters mid-air simultaneously** in tight side-by-side silhouette against a cobalt-and-peach sky. No build-up — first frame is the airborne beat. Painted SFX text (POP / CRACK / WHOMP) bursts beside each silhouette as a halftone-bleed impact graphic.

### Prompt seed

```text
SHOT 1: Wide low-angle hero shot, 24mm, ground-level forward dolly.
Open on {{character_a}} and {{character_b}} in mid-air silhouette against a deep cobalt sky with peach and lavender cloud streaks, both at the apex of {{action_archetype}}. Heavy directional shadow blocks define their silhouettes (cobalt blue + ink-black), warm peach rim light catches the top edge of each figure. Comic-panel ink-stroke SFX text {{caption_style_words}} bursts in chunky linework beside each silhouette, halftone dot pattern bleeding around the letters. Visible canvas grain, chromatic-aberration RGB offset on the bright cloud edges.
SFX: twin pop-tail cracks at frame 1, brief airborne whoosh holding under.
```

### Why it works

- **Two silhouettes against sky = instant scale + drama.** No need to introduce characters with dialogue or context — the silhouettes do the work.
- **Painted SFX text doubles as caption + visual** — replaces a separate kinetic-typography overlay layer.
- **Cobalt-and-peach golden-hour palette** is the template's color DNA — earns visual recognition the moment the next instance opens with the same palette.

## Pattern 3 — Comic-panel split (2-frame grid wipe to single frame)

Open on a **2-frame comic-panel grid** — left panel is character A in static pose, right panel is character B in static pose, both painted in the template's painterly style with chunky ink-stroke borders between the panels. Then the panel border WIPES away (left-to-right ink-stroke sweep) and the two static poses lerp into the first action beat with characters in the same world.

### Prompt seed

```text
SHOT 1: Static 2-frame comic-panel grid, then ink-stroke wipe-merge.
Open on a horizontal 2-frame comic-panel layout: left panel shows {{character_a}} in a static signature pose against a cobalt-blue painterly backdrop with halftone dot bleed in the corners; right panel shows {{character_b}} in a static signature pose against a deep-magenta painterly backdrop with halftone dot bleed. A chunky ink-stroke vertical border separates the panels. Hold for ~12 frames. Then the ink-stroke border wipes downward as if drawn by a brush, the two backdrops merge into a single cobalt-and-peach sky over {{urban_location}}, and {{character_a}} and {{character_b}} step into the merged frame side-by-side, beginning {{action_archetype}}. Comic-panel impact text {{caption_style_words}} flashes briefly at the merge moment. Visible canvas grain throughout.
SFX: held silence for 12 frames (or distant city ambient at -20dB), then a single brush-stroke whoosh on the ink-wipe, then immediate diegetic SFX of {{action_archetype}}.
```

### Why it works

- **Names the format upfront** — viewer sees "comic panels" in the first frame and knows the visual contract.
- **2-character introduction without dialogue** — silhouette + pose contrast does the work, no exposition.
- **The wipe-merge is a transition the viewer hasn't seen on Spider-Verse trailers** — earns a "this is custom" signal, not a clone.

## Anti-patterns for the hook (DO NOT do this)

- **DO NOT open on a slow camera move into an establishing shot of the location.** Wastes 1.5s on visual context the viewer doesn't need yet. The location is part of the action, not a separate beat.
- **DO NOT open on a character's face in close-up holding eye contact.** That's UGC-creator-lifestyle grammar; this template is action-scene grammar. The viewer should see motion first, faces second.
- **DO NOT show the music kicking in the first 2s.** Music in this template is post-render, sidechain-ducked, and arrives over the SFX bed — never inside the seedance clip. Hook is SFX-driven.
- **DO NOT use a kinetic-typography overlay layer on top of the painterly frame for the hook caption.** The caption IS the painted ink-stroke SFX text inside the frame. A separate overlay layer reads as a Premiere preset, not Spider-Verse comic.
- **DO NOT open with a slow-mo bullet-time stop**, because that's been worn out by everyone else. The Spider-Verse comic vocabulary is **frame-rate flicker** + **ink-stroke impact text**, not slow-mo.

## Hook timing budget (out of the 27s cut)

| Beat | Duration | What's happening |
|---|---|---|
| Hook (SHOT 1 of clip 1) | 0.0–3.0s | One of the three patterns above |
| Action setup (SHOT 2 of clip 1) | 3.0–6.0s | First trade between characters |
| ...continues through the 10-shot structure... | 6.0–27.0s | See `TEMPLATE.md` "Beat structure" |

The hook IS the first SHOT of clip 1 — it occupies the same 3s slot. You don't get a separate "hook lane" outside the seedance prompt; it has to be baked into SHOT 1.
