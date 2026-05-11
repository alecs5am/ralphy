# CGI Architecture — Prompt Cookbook

How to write keyframe and i2v prompts that produce magazine-grade archviz. Read `TEMPLATE.md` for narrative structure first; this file is the per-clip prompt grammar.

All keyframes go through `gemini-3-pro-image-preview` (multi-ref where the user supplied a floor plan, sketch, or moodboard). All i2v through `kwaivgi/kling-v3.0-pro`, 5s clips, `generate_audio: false`.

---

## Master prompt template

The cut is built from four section-types in order: exterior establishing → threshold → interior key-room → exterior recap or signature. Each clip uses the keyframe + i2v skeleton below. Fill the slots from the per-section playbooks.

**Keyframe prompt (image)**:
```
[Building type], [exterior or interior subject], shot from [camera position],
at [time of day]. [Lighting direction and quality]. [Material focal point].
[Sight line / depth element / signature view if any]. Composition: [framing rule].
Photoreal architectural visualization, [Twinmotion / Lumion / Unreal / D5 lookalike],
ambient occlusion rich, physically-based materials, [aspect ratio].
[Style anchor: "in the spirit of <architect>" if user supplied; otherwise omit].
No people unless specified. No improvised signage, addresses, or studio logos.
No floor-plan overlays, no virtual-tour reticles, no MLS-style graphics.
```

**i2v prompt (camera move on top of keyframe)**:
```
Camera: [single named move from camera library] at [exact pace from library].
Duration: 5s, single continuous take. The [hero element / money-shot element]
stays anchored in frame. [Light evolution if any: e.g., "sun shifts 4° across
the concrete wall"]. No cuts, no zoom punches, no shaky-cam. Photoreal,
contemporary archviz quality, ambient-occlusion-rich, slow and unhurried.
```

The two prompts together produce one 5s clip. Chain 4–8 of them per cut.

---

## Architectural prompt vocabulary

A lexicon to draw from. These terms make the output read as designed-by-an-architect rather than rendered-by-a-ChatGPT-prompt. Pull 2–4 per keyframe; do not stack everything.

**Structure / form**:
- cantilevered floor, cantilevered second story, cantilever over water
- board-form concrete, fair-faced concrete, board-formed retaining wall
- exposed steel beam, exposed timber truss, glulam beam, CLT panels
- monolithic stair, floating stair, switchback stair, helical stair
- double-height ceiling, two-storey atrium, mezzanine overlook
- courtyard plan, U-shape plan, L-shape plan, linear bar building
- folded roof plane, butterfly roof, mono-pitch roof, green roof
- thin shell, mass timber, hempcrete, rammed earth wall

**Glazing / aperture**:
- full-height glazing, floor-to-ceiling glass, frameless glazing
- window mullion grid, slim steel framing, Crittall windows
- clerestory window, sky-light, oculus, light scoop
- framed view, picture window, sliding glass wall, pivot door

**Materiality**:
- oak millwork, walnut paneling, charred cedar siding (shou sugi ban)
- terrazzo flooring, polished concrete floor, large-format porcelain tile
- travertine slab, marble veining, calacatta gold, statuario, carrara
- bronze panel, blackened steel, weathering steel (cor-ten), brass detailing
- linen drapery, bouclé upholstery, leather banquette, wool rug
- plaster wall (lime-washed, Venetian, tadelakt), microcement, smooth render

**Material physics references** (paste verbatim into the keyframe prompt for PBR realism):
- "PBR concrete with slight roughness 0.6, micro-pore texture, slight aggregate visible"
- "Anisotropic brass with brushed grain along vertical, fingerprints subtle"
- "Oak with visible end-grain, semi-matte finish, light cathedraling pattern"
- "Polished travertine with banding, filled holes visible at close range, specular falloff"
- "Leather upholstery with slight pull-creasing on seat surface, hand-burnished edges"
- "Plaster with hand-troweled directional swirl, matte finish, dust catching the light at grazing angle"

---

## Camera move library

Pick exactly one per clip. Mixing two moves in 5s reads as panicked and breaks the archviz contract.

| Move | When to use | Exact pace |
|---|---|---|
| **Drone fly-through** | Section 1 establishing; when the building reads in landscape; over rooftop terraces. | 0.5 m/s forward, no zoom, gradual descent if approaching a facade. |
| **Drone pull-back** | Section 4 final-statement; reveal of grounds and site context. | 0.4 m/s reverse, steady altitude, no rotation. |
| **Threshold walk-through** | Section 2 transitions; doorways, courtyards, glass-slider thresholds. | 0.7 m/s forward at eye height (~5'6"), no head bob. |
| **Dolly push-in** | Section 3 interior anchors; window approaches; sunlight-cut beats. | 0.3 m/s forward, level, no tilt. |
| **Dolly pull-back** | "Detail → context" beats; pulling away from a material close-up to a room wide. | 0.4 m/s reverse, level. |
| **Slow orbit** | Furniture-cluster anchors, sculptural-stair anchors, signature focal features. | 5°/sec, 90–180° max in 5s — never a full 360. |
| **Lateral gimbal glide** | Facade passes, kitchen counter passes, materiality sweeps, night-glow exterior. | 0.4 m/s pure left↔right, no rotation, no pan. |
| **Vertical tilt up** | Soaring atriums, double-height windows, monolithic stairs reading floor to ceiling. | 4°/sec, start low end on ceiling. |
| **Rack-focus on materiality** | Detail-led clips; "this material is the argument" moments. | Camera stationary; focus moves from foreground material to background context over 4s. |
| **Crane / jib combo** | Multi-level transitions, dramatic exteriors with vertical interest. Use sparingly. | Lateral 0.3 m/s + vertical 0.2 m/s simultaneous. |

Avoid: punch zoom, whip pan, handheld shake, dutch tilt, FPV-style swoops. None of these read as architecture — they read as real-estate-Reels-1.0.

---

## Lighting recipes

The single highest-leverage variable. Wrong light kills any clip.

### Golden hour 18:30 with warm fill (exterior — most exteriors)

```
Sun at 25-35° azimuth, low angle, warm 3200-3800K, long shadows raking
across [facade material], sky transitioning from apricot at the horizon
into pale teal overhead. Soft sky-bounce fill on the shadow side. Slight
atmospheric haze, golden-tinted, optional dust particles in shafts of light.
Cast shadows long and sharp at the edge, soft within.
```

Use for: exterior establishing, facade reveals, drone push-ins, signature exteriors.

### Midday with sharp shadows (clean modernist exteriors only)

```
Sun overhead at 70-80°, sharp graphic shadows from cantilevers and
overhangs, sky deep saturated cyan. Materials read at full chroma —
concrete white-grey, steel pure-grey, oak amber-warm. No haze. Shadow
edges hard, contrast high. Reads as Le Corbusier-published / Tadao
Ando dawn-cast / Lina Bo Bardi documentation.
```

Use for: brutalist or modernist subjects where the architect designed for cast shadow as ornament. Only.

### Dusk with interior glow (the most ambitious recipe; carries the cut)

```
30 minutes after sunset. Sky deep teal-blue, sun gone but light still in
the sky — exterior is silhouetted, edges crisp against horizon. Interior
practicals fully on: warm tungsten 2700K from ceiling pendants, table
lamps, recessed downlights. Every glazed opening reads as a warm
rectangle against cool dusk. Exterior accent lighting (uplights on
columns, path lights, pool glow) alive at -2 stops below the interior.
The contrast between cool-blue exterior and warm-tungsten interior is
the entire point of the shot.
```

Use for: signature exteriors, exterior recaps, hotel / restaurant final shots, anything aspirational.

### Night with practicals (rarest, highest-effort, highest-payoff)

```
Full dark, sky deep navy or near-black with star field if rural. Building
is a lantern: every interior practical at 2700K throwing warm light onto
the surrounding terrace, garden, or street. Exterior accents minimal —
one path light, one column uplight. The viewer is reading the building
as composed light planes, not as architecture in landscape.
```

Use for: high-end urban projects, restaurants, late-stage hotel reels.

### Day-to-dusk transition (compositional choice across the cut, not a single recipe)

The first 1–2 clips are golden hour; the last 1–2 clips are dusk-with-interior-glow. The middle clips are the threshold pass and interior flythroughs in bright indirect daylight. The cut tells the story of the day ending and the building turning on. The viewer reads the building as inhabited around the clock.

### Avoid (never pick these)

- Bright midday overhead sun for any subject other than clean modernist with cast-shadow design intent.
- Flat overcast without directional light — kills dimension and reads as a Sketchup default render.
- Mixed color temperatures uncorrected — interior with both 2700K tungsten and 5500K daylight unmanaged reads as snapshot, not film.
- "Magic-hour" / dawn-pink-everywhere clichés — golden hour is not the same as a pink-tinted Instagram filter.

---

## Style references

When the user supplies a style anchor, paste it directly into the keyframe prompt as: *"in the spirit of <reference>"*. Do not claim the reference designed the building — the reference is a vibe anchor only.

| Style anchor | Visual signature | Best matched to |
|---|---|---|
| **Tadao Ando minimalism** | Board-form concrete, geometric apertures, water features, almost-monastic interiors. Light as sole ornament. | Modernist single-family, museums, conceptual pavilions, chapels. |
| **Bjarke Ingels Group (BIG) dynamic** | Twisted volumes, stepped massings, public terraces, playful urbanism. | Hotels, public buildings, conceptual mixed-use. |
| **Studio McGee scandi-warmth** | Warm oak, plaster, bouclé, brass, lots of natural light, family-livable. | Single-family houses, residential apartments, boutique inns. |
| **Kelly Wearstler maximalist-luxe** | Rich palette, statement marble, brass, sculptural furniture, layered fabrics. | Hotels, restaurants, boutique retail, primary suites. |
| **Peter Zumthor materiality** | Single-material gestures (timber, stone, concrete), reverent slow rooms, heavy doors. | Galleries, chapels, mountain houses, spas. |
| **Vincent Van Duysen calm-modernist** | Limewashed walls, custom millwork, monolithic stones, quiet palette. | High-end residential, boutique hotels, private clubs. |
| **John Pawson minimalism** | Reductive forms, single-color palette, hidden joints, light as protagonist. | Conceptual pavilions, private chapels, private residences. |
| **Frank Lloyd Wright organic** | Cantilevers, horizontal lines, warm timber, integration with site. | Hillside houses, forest houses, prairie houses. |

---

## Music guidance

Single ambient cinematic track per cut. ElevenLabs Music with explicit prompt for *sense-of-arrival*, *slow-build*, *minimalist piano + strings + sparse pad*. Avoid percussion-forward beats, avoid drops, avoid lyrics.

| Project mood | Style | Reference artists |
|---|---|---|
| Aspirational residential | Minimalist piano with sparse strings | Ólafur Arnalds, Nils Frahm, Max Richter |
| Conceptual pavilion / cultural | Contemporary classical, ambient pad | Hans Zimmer minimalist (Interstellar B-side), Jóhann Jóhannsson |
| Hotel / hospitality / luxury | Warm ambient with subtle acoustic guitar | Hammock, Goldmund, Library Tapes |
| Brutalist / industrial / academic | Cool ambient electronic, sparse synth pad | Jon Hopkins ambient B-sides, Tim Hecker, early A Winged Victory |
| Tropical-luxe resort | Warm regional flavor, gentle nylon guitar | Custom ElevenLabs prompt referencing destination |

**Timing rule**: music enters subtly at 0.5s of the cut — never silence-then-add. Builds slightly toward the final exterior recap or signature money-shot. Resolves cleanly at the final frame, no hard cut, ~1s tail.

---

## 8 mistakes (refuse these patterns at prompt time)

1. **Camera too fast = not luxurious.** A pan in 3s reads as a Realtor.com tour, not as architecture. Slow every move by 30%; if the model insists on speed, lower the prompt-implied velocity ("micro-dolly", "barely moves", "0.3 m/s").
2. **Materials look fake-CGI not photoreal.** Symptoms: plastic-shiny concrete, perfectly clean glass, suspiciously uniform wood grain. Fix: paste material-physics references verbatim, raise roughness, add micro-imperfections ("slight aggregate visible", "fingerprints subtle on brass").
3. **No threshold-pass moment.** A cut with five exterior clips and no interior crossing reads as a static rendering portfolio, not as a reel. Insist on one threshold pass minimum, two for 25–30s cuts.
4. **No signature money-shot.** If at end of brief no clip is the "this is the hero shot," the cut has no climax. Decide the money-shot before generating; build the other clips around it.
5. **Lighting flat = no emotion.** Overcast / flat-lit interiors are the failure mode of low-effort archviz. Always pick a directional light recipe — golden hour, dusk-with-glow, midday-graphic-shadow, or warm-evening practicals.
6. **Over-staging.** A kitchen with five decorative bowls, a coffee table with three stacked design books and a candle and a vase, a bedroom with eight throw pillows. Cut staging by 50%. Empty-rendered or near-empty reads as designer; over-rendered reads as a real-estate stager.
7. **AI-improvised real architects' work.** Never claim Ando / Zumthor / Wright designed the rendered building. "In the spirit of" is a vibe anchor, not attribution.
8. **Realtor-listing tropes leaking into archviz.** No virtual-tour reticles, no floor-plan overlay graphics, no spec-sheet popups, no MLS-style price banners. Architecture social does not look like Zillow.

---

## Four worked examples

### Example A — 25s, modernist single-family-house, golden-hour exterior + open-plan interior (9:16)

7 clips. Drone push-in to facade → threshold pass at oak slab door → wide of double-height living with sun rectangle on concrete floor → lateral glide along open-plan kitchen island ending on garden view → slow orbit around monolithic stair → window approach in primary bedroom → dusk pull-back of facade with interior glow.

| t | Section | Keyframe | i2v |
|---|---|---|---|
| 0–4s | Exterior establish | Single-family house, full elevation 3/4 angle, golden-hour 25° azimuth, board-form concrete, oak millwork accents, mature olive trees foreground | Drone push-in 0.5 m/s |
| 4–8s | Threshold | Oak slab door, golden-hour rake, foyer visible through opening with concrete floor and view to courtyard | Threshold walk-through 0.7 m/s |
| 8–12s | Interior anchor 1 | Double-height living, full-height glazing, sun rectangle on polished concrete, low linen sofa, plaster wall | Dolly push-in 0.3 m/s |
| 12–16s | Interior anchor 2 | Open-plan kitchen, oak island, terrazzo backsplash, sliding glass to garden | Lateral gimbal glide 0.4 m/s |
| 16–20s | Money-shot | Monolithic concrete stair with brass handrail, floating treads, plaster wall behind | Slow orbit 5°/sec |
| 20–23s | Interior anchor 3 | Primary bedroom, oak bed, full-height window with garden view, warm morning bounce | Window approach 0.3 m/s |
| 23–25s | Exterior recap | Full elevation at dusk, interior tungsten through every glazing, exterior uplights at columns | Drone pull-back 0.4 m/s |

Music: Ólafur Arnalds-style minimalist piano + sparse strings, slow-build to the dusk pull-back. Outro caption: *"House 04. Studio Lumen. 2026."*

### Example B — 20s, urban loft renovation reveal, dusk (9:16)

5 clips. Threshold pass at industrial steel door → slow orbit of restored timber-truss living room → lateral glide through restored kitchen with brass and oak → dolly push-in toward east-facing skyline window → night exterior with interior glow.

Loft has exposed CLT timber trusses, polished concrete floor, blackened-steel kitchen, brass detailing throughout. Style anchor: *"in the spirit of Vincent Van Duysen calm-modernist."* Music: Hammock-style warm ambient. No VO. Outro caption: *"Loft Re-09. Studio West."*

### Example C — 30s, conceptual hotel pavilion, tropical-luxe, golden hour with infinity pool (9:16)

8 clips, full arc. Drone aerial of hotel in jungle clearing → through-foliage architectural reveal of pavilion → threshold pass at woven-rattan slider into great room → dolly push-in to courtyard with reflecting pool → lateral glide through restaurant with thatched ceiling and brass detailing → window approach in primary suite over pool → infinity pool reflection (the money-shot, hook 7) → drone pull-back at dusk over the entire site with every pavilion lit warm.

Materials: charred cedar, woven rattan, brass, terrazzo, linen drapery, bronze fixtures. Style anchor: *"in the spirit of Kerry Hill / Ed Tuttle tropical-luxe."* Music: warm regional ambient with nylon guitar undertone. VO: one outro line at 27s — *"Pavilion 07. Studio Hana."* Captions: project name only at outro.

### Example D — 18s, mid-century renovation interior walkthrough showing material details (9:16)

4 clips. Threshold pass into refurbished entry foyer with terrazzo floor and walnut paneling → rack-focus on a brass handrail meeting a walnut post → slow orbit of mid-century living with low sofas, vintage credenza, and statement Noguchi pendant → lateral glide along the wall where walnut meets plaster meets terrazzo (the money-shot, hook 12).

Style anchor: *"in the spirit of Eero Saarinen / Florence Knoll mid-century."* Music: jazz-inflected minimalist piano, slow tempo. No VO. Outro caption: *"Renovation 02. Studio Mid."*

---

## Output check before render

Before composing, verify each clip against this checklist. If any answer is "no", regenerate.

- [ ] Light is golden hour, dusk-with-interior-glow, warm evening, or graphic midday — never flat overcast.
- [ ] Camera move is one named move from the library, executed at the exact pace from the table.
- [ ] Materials read photoreal (ambient occlusion present, micro-imperfections visible, no plastic-shine).
- [ ] No invented architects' attributions, no improvised studio logos, no MLS-style overlays.
- [ ] No people unless explicitly briefed.
- [ ] At least 3.5s of usable hold per 5s clip — first 0.5s and last 1s settle, no busy book-end frames.
- [ ] Color grade consistent across neighboring clips (warm-up golden hour ~5–8%, cool-down dusk ~5%).
- [ ] One and only one money-shot per cut. The other clips are set-up and follow-through.

When all clips pass, compose with cross-fade transitions (300–500ms), single ambient cinematic track ducked under any VO, subtle ambient layer (wind in foliage, distant water, urban hum) at –28 to –32 dB.
