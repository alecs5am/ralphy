# Worked examples

Two concrete instantiations of the template across different product types, to show how the slots map. Variant A is the shipped source project; Variant B is a hypothetical port to demonstrate generalization.

---

## Variant A — Fluttershy holographic glitter cream (shipped, 17.2s, $13.79)

The source project. Specificity-bait viral mechanic: cute charm-shape inclusions visible inside a transparent jar.

### Slot fill

| Slot | Value |
|---|---|
| `{{brand_name}}` | Fluttershy |
| `{{product_name}}` | holographic glow cream |
| `{{product_type}}` | squat transparent cosmetic jar (butter-yellow lid, pink script wordmark, butterfly icon) |
| `{{product_signature_detail}}` | tiny floating charm-shape inclusions (soft-pink butterfly, purple pastel pony MLP-style, gold star, pink heart, white daisy, lilac cloud, mint moon) suspended among holographic glitter |
| `{{influencer_persona}}` | young woman, pastel pink floral pajama top, black round-frame glasses, freckles, light brown hair |
| `{{location_master_plate}}` | her own bedroom — unmade bed in soft focus, fairy lights along a bookshelf, warm afternoon window light from the right |
| `{{target_language}}` | English |
| `{{voice_tag_block}}` | young american female ~22yo, soft-medium pitch, light vocal fry, intimate UGC close-mic, RELAXED chill curious tone at UNHURRIED slow conversational pace, GRWM-like, no theatrical surprise, no rush, soft natural breaths between phrases, no accent. |

### Beat structure

| t (s) | Beat | Action | VO line |
|---|---|---|---|
| 0-3 | Hook (clip 1 shot 1) | Face top-third, jar at chin, charms visible. Relaxed nail-drum on jar wall. | "Wait...... wait, look at this." |
| 3-6 | Discovery (clip 1 shot 2) | Top-down macro, both hands holding jar, slow lid unscrew. | "Okay so... there is a butterfly in here. Obviously." |
| 6-9 | Reveal (clip 1 shot 3) | Extreme macro, fingertip presses into gel between charms, thin stretchy gel string trails up. | "And a star... wait, is that a tiny pony?" |
| 9-13 | Application (clip 2 shot 1) | Cheek medium, glitter fingertip dabs right cheekbone, face turns showing shimmer. | "It goes on like... oh my god, look at my cheek." |
| 13-17 | Payoff (clip 2 shot 2) | Chest-up wider, jar in both hands at arms length, slow tilt in window light, glitter cascades. | "Yeah... I am keeping this." |

### Render

Two kling clips (`opt-b-clip1-v3-charms.mp4` 9s + `opt-b-clip2-v3-tiltlight.mp4` 8s) Remotion-spliced with `<Audio src={bg-music-v1-lofi.mp3} volume={0.18}>` overlay. `ralphy render --loudnorm` to -16 LUFS.

### Reference example assets in this template

- `assets/example-product-master.png` — product master v2 (with specificity-bait charm inclusions)
- `assets/example-product-master-alt.png` — earlier label-fidelity-only master
- `assets/example-persona-master.png` — persona master (direct-to-camera, freckles preserved)
- `assets/example-firstframe-hook.png` — scene-01 first-frame v3 (both locks composited together)

---

## Variant B — "Northstar Co." pH-color-shift toner (hypothetical port)

Same template, different product type (frosted glass tube) and different specificity mechanic (visible pH-reactive color shift instead of physical inclusions).

### Slot fill

| Slot | Value |
|---|---|
| `{{brand_name}}` | Northstar Co. |
| `{{product_name}}` | morning balance toner |
| `{{product_type}}` | tall frosted-glass tube with brushed-aluminum cap |
| `{{product_signature_detail}}` | clear liquid that visibly shifts from pale rose to soft sage on the cotton pad — color drift starts within ~2s of contact, fully shifted by 5s |
| `{{influencer_persona}}` | young woman, mid-20s, oversized cream knit hoodie over a slip dress, no glasses, no makeup, freckled nose, dark blonde hair pulled into a low loose bun with strands escaping |
| `{{location_master_plate}}` | her own bathroom — white subway tile, single brass sconce, eucalyptus stems in a clear vase, marble counter, morning daylight from a small frosted window left |
| `{{target_language}}` | English |
| `{{voice_tag_block}}` | (same as Variant A — the voice register is template DNA, not slot content) |

### Beat structure

| t (s) | Beat | Action | VO line |
|---|---|---|---|
| 0-3 | Hook | Bathroom-mirror selfie POV, tube at chin, label readable. Slow tip-tilt 15 deg. | "Hold on, no one told me about this part." |
| 3-7 | Demo | Top-down macro on cotton pad on marble. Tube tips, two drops fall, pale rose blooms then drifts sage. | "Look. Look at it. Why is it doing that." |
| 7-12 | Application | Cheek medium, cotton pad sweeps along jawline, faint herbal sheen catches light. | "Okay so the sage one means... balanced? I think? I am gonna pretend I knew that." |
| 12-15 | Payoff | Chest-up, tube held flat-palmed at arms length, tilts under window light. | "This is staying on my counter." |

### Why this port works

- **Specificity mechanic ports cleanly**: visible internals (Variant A) -> visible color shift on contact (Variant B). Both are "thing you can SEE happen on camera that other brands can't fake."
- **Geometry rule still applies**: tube stays at arms length on the payoff beat. The application beat puts the cotton pad on cheek — not the tube itself — which sidesteps the powder-compact drift.
- **Voice tag block unchanged**: the calm GRWM register is template DNA.
- **Location plate swap**: bathroom instead of bedroom, but the structural rule is the same — persona's own private space, soft natural light, single warm accent, slight visible mess.

### Cost ballpark

Same as Variant A: $6-8 disciplined, ~$13-15 first-time. The retry budget is the same since the action vocabulary (drop, swipe, tilt) avoids near-face geometry.
