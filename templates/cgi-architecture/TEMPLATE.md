# CGI Architecture — Cinematic Archviz Reel

**Format**: 15–30s vertical (9:16) for IG Reels / TikTok / Shorts; optional 16:9 master for Vimeo, ArchDaily, studio websites.
**FPS**: 30. **Clips**: 4–8 keyframes, each driving a 5s i2v cut.
**Reference**: optional but recommended (floor plan, sketch, moodboard).

---

## Why this template exists

Architecture social is its own dialect. The audience is design-curious — they save before they like, they screenshot before they comment, and they buy nothing on impulse. They are not shopping for a property. They are letting themselves dream about a place that probably does not exist yet, or has not been finished yet, or will only be finished in someone else's life. The currency is *aspiration*, not *availability*.

That is the slot this template owns. Distinct from `15-real-estate`, which is the photoreal tour of an existing property a buyer could close on tomorrow. This template is for:

- Pre-construction concepts an architecture firm wants to publish.
- Interior-design pitch decks rendered as a sub-30s reel.
- Hospitality / hotel / restaurant concepts in development.
- Conceptual pavilions, competition entries, student portfolios.
- Aspirational rendered builds for property developers and design studios.

The format optimizes for one feeling: *this is a magazine-worthy place I would post a picture of if I were ever there.* Save and share follow that feeling. Conversion follows save and share, eventually, on a longer arc than direct-response.

---

## Vibe anchors (what every clip in the cut must do)

1. **Aspirational, not realistic.** The building is being rendered to seduce, not to document. Everything in frame is intentional — every material, every fixture, every plant. Clutter is a defect.

2. **Light tells the architecture.** Golden hour rakes across a board-form concrete wall and the wall becomes a character. Dusk fills a glass-fronted living room and the warm interior practicals turn the entire facade into a lantern. Light is doing 60% of the work; geometry is doing 30%; material is doing 10%. Get the light right or the cut dies regardless of how good the building is.

3. **Ambient occlusion is the interior look.** Deep soft shadows where the wall meets the floor, where the bookshelf meets the wall, under the overhang of a kitchen island. Soft fill from a large window. This is the "Twinmotion / Lumion / D5 / Unreal" look that reads as contemporary archviz. Flat-lit interiors look like 2008 real-estate listings.

4. **Slow camera. Always.** Drone push-in 0.5 m/s. Dolly 0.3 m/s. Orbit 5°/sec. Threshold walk 0.7 m/s. Anything faster reads as a property tour, not as architecture. Speed equals "for sale by owner" equals dead share count.

5. **Threshold moments are the point.** The shot where the camera crosses a doorway — exterior to entry, entry to living, living to courtyard, interior to terrace. Each threshold is a small reveal. Build the cut around 1–2 threshold moments per video.

6. **One money-shot per segment.** A pool reflection that mirrors the facade. A long view through a framed opening to a distant horizon. A staircase detail where the handrail catches a sunbeam. Decide the money-shot before generating; everything else is set-up and follow-through.

---

## Variation axes

Pick one value per axis before generating prompts. Mixing axes mid-cut produces tonal whiplash.

- **Building type**: single-family-house / apartment-loft / public-space / conceptual-pavilion / hotel / restaurant / office / boutique-retail / cultural-museum.
- **Time of day**: golden-hour-exterior / midday-clean-modernist / dusk-interior-glow / night-with-practicals / day-to-dusk-transition (most ambitious).
- **Interior style**: modernist / brutalist / scandi-minimal / mid-century / tropical-luxe / industrial-loft / japandi / maximalist-luxe.
- **Camera language**: drone-fly-through / threshold-walk / slow-orbit / dolly-pull-back-reveal / rack-focus-on-materiality.
- **Aspect**: 9:16 social cut / 16:9 studio master / both (render each at native aspect, do not letterbox).
- **VO presence**: silent-music-only (default) / one-outro-line-credits / spec-overlay-text-only.

---

## Narrative arc (the universal spine)

Every cut, regardless of duration, follows this spine. Compress for 15s, expand for 30s; do not reorder.

| Section | What it does | Typical share of runtime |
|---|---|---|
| 1. Exterior establishing | Drone or street-level approach. Building reads in context — golden-hour facade, sky, mature landscaping, neighborhood scale. | 10–20% |
| 2. Threshold pass | Camera crosses from outside into inside. Door opens, courtyard reveals, glass slides, hallway opens up. The promise of the inside being as good as the outside. | 10–15% |
| 3. Interior key-room flythrough | 1–3 rooms. Each room gets one slow camera move and one money-shot. Living, kitchen, primary bedroom, bath, gallery, courtyard — choose the rooms that carry the project's identity. | 50–60% |
| 4. Exterior recap or signature view | Pull back to the building from a new angle, OR linger on the project's signature shot — pool against horizon, facade against dusk sky, framed view from a key opening. The lasting image. | 10–20% |

For a 15s teaser: exterior establishing → one threshold pass → one interior room → signature view. Drop everything else.
For a 20–25s standard reel: exterior → threshold → 2 rooms → exterior recap.
For a 30s extended: full arc, 3 interior rooms, threshold + secondary threshold (e.g., interior to courtyard).

---

## Inputs (what the user should supply)

**Required:**
- Building type and approximate scale (single-family / apartment / public).
- Interior style anchor (modernist / scandi / mid-century / etc.).
- Time-of-day intent (golden-hour, dusk, night).
- Key-rooms list, in priority order — the rooms the user wants featured.

**Strongly recommended (improves output quality materially):**
- Floor plan (PDF or image). Helps the keyframe model reason about flow, sight lines, and where openings frame views.
- Moodboard image, sketch, or massing diagram. Anchors materiality and geometry across keyframes.
- Site context — is the building in a forest, on a coast, in a dense urban block, in a desert? Drives exterior background and light direction.
- Studio / project name for outro caption.

**Optional:**
- Reference architect or style icon ("in the spirit of Tadao Ando / BIG / Studio McGee").
- A specific signature feature the user wants to be the money-shot (infinity pool, courtyard, double-height stair).
- Music genre preference — defaults to ambient cinematic.

If the brief names a real existing building (a famous house, a published architect's known work, a real museum), the reference-required gate applies — ask for photos. AI-improvised replicas of identifiable real architecture read as fake and are a credibility hit. Refuse with: *"This is a real building by a real architect — I need photos before I render. Drop a few from the publication or the firm's site and I'll start."*

---

## Distinct from `15-real-estate`

These two templates look superficially close — both are slow-camera, well-lit, building-focused. They are different jobs.

| | `15-real-estate` | `cgi-architecture` (this) |
|---|---|---|
| Subject | Existing property | Conceptual / pre-construction / aspirational rendered build |
| Reference | Required (real property photos) | Optional (floor plan, moodboard, sketch) |
| Goal | Convert a specific buyer to a specific property | Build studio reputation, capture saves, drive design-curious follows |
| Voice | Warm agent narration with concrete specs | Silent or one outro line — credits style |
| Captions | Address, beds/baths, sqft, price | Project name, studio, year |
| Music | Track that matches archetype (warm acoustic for cabin, ambient for waterfront) | Ambient cinematic with sense-of-arrival, single track |
| Hooks | Drone aerial swoop, front-door reveal, window-view reveal | Drone push-in to facade, threshold pass at doorway, sunlight cut through floor-to-ceiling glass |
| Pacing | Slow but tour-paced — buyer is making a decision | Slower — viewer is dreaming |
| End frame | Twilight exterior with address overlay | Signature view or facade-against-sky with project name |

If the user has property photos of an existing building and wants to sell it, route to `15-real-estate`. If the user has a render brief, a floor plan, or wants an aspirational reel for a studio, this template is the right one.

---

## When NOT to use this template

- **Existing property with photos available**: route to `15-real-estate`. That template wins on photoreal fidelity to a specific deed.
- **Hardware / gadget product**: use `cgi-hardware`. Architecture and hardware archviz share the rendered look but the framing language differs — hardware is closer, more orbital, more material-detail-driven.
- **Food / lifestyle / restaurant content** where the building is backdrop: route to a food / restaurant template. This template is for architecture *as the subject*.
- **Rapid-share scroll-stop content under 10s**: use `11-social-hook`. Archviz needs at least 15s to breathe.
- **Renovation before/after of a specific real address**: route to `15-real-estate` renovation variant. Only use this template for conceptual proposals where the "after" is a render not yet built.

---

## Hard rules (refuse before generating)

1. **No flat midday light.** Default to golden-hour exterior, dusk-with-interior-glow, or carefully-lit-night. If the brief insists on midday, restrict to clean-modernist subjects with strong cast shadow as the look.
2. **No fast cuts.** The minimum hold per i2v clip is 3.5s on screen. Drone push-in slower than 0.5 m/s, dolly slower than 0.3 m/s. Faster than that, archviz becomes a tour video, and tour video is the wrong template.
3. **No invented brand markers, no signage, no logos** unless the user supplied them. No floating address numbers, no fake firm names on facades.
4. **No invented real architects.** If the user says "in the style of Tadao Ando," that is a vibe anchor, not a license to claim Ando designed it. Outro caption credits the user's project, never an unaffiliated architect.
5. **No people in shot unless explicitly briefed.** Empty-rendered is the default. Buyers / clients / followers project themselves into space; AI-people in archviz are uncanny and date the cut to its model generation.
6. **No realtor-listing tropes.** No virtual tour reticles, no floor-plan overlay popups, no "spec sheet" graphic frames. This is architecture, not MLS.
7. **One money-shot only.** If the cut has three "this is the hero shot" moments, pick the strongest and demote the others to set-up. Multiple money-shots cancel each other.

---

## Adjacent templates

- **`15-real-estate`** — for existing properties with photos. The photoreal tour.
- **`cgi-hardware`** — for gadgets and physical products rendered in archviz language. Shares the rendered look, different framing.
- **`02-3d-cgi`** — for conceptual / abstract / non-architectural CGI (vegetables, products, characters). Use for renders where the subject is not a building.
- **`12-brand-story`** — if the cut is more about the studio's narrative than any one project, with talking-head or text-driven storytelling.
- **`06-motion-design-ad`** — for technical archviz with floor-plan overlays, callouts, animated specs.

---

## Pipeline outputs

- 4–8 keyframe images at 1080×1920 (or 1920×1080 for 16:9 master). Render both aspects if the user wants both.
- 4–8 i2v clips, 5s each, slow-camera prompted from the keyframes.
- 1 ambient cinematic music track (15–30s).
- Optional VO line (one continuous read, never stitched).
- Optional project-name + studio credit overlay.
- Composition with cross-fade transitions (300–500ms), no hard cuts, ducked music if VO present, subtle ambient layer (distant traffic for urban, wind through trees for rural, water lapping for waterfront) at –28 to –32 dB.

The output of this template, on a project with a strong concept and the right time of day, is the kind of clip an architecture studio screenshots and shares to its own LinkedIn. Get the threshold pass right, slow the camera, and pick one money-shot — the rest is mechanical.
