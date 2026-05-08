# Prompt Cookbook — 3D / CGI

The vocabulary pack. Use it to write prompts that an i2v model can actually act on, not the vague "make it look 3D" mush that produces vague 3D mush.

---

## Master prompt template

Paste, fill in, ship.

```
[HOOK — 1-2 sentences. The first frame and what changes by the second frame.
Lift one of the 12 techniques from hooks.md.]

Camera: [movement type] — [speed e.g. "45°/sec"], [arc shape], [lens / focal length],
[depth of field], [easing], [frame rate, default 24fps cinematic].

Render Style: [Pixar-stylized / painterly / cel-shaded / low-poly / isometric /
photorealistic / hyperreal-with-impossible-physics] 3D rendering.

Lighting: [Key light: direction + Kelvin temperature], [Fill light: direction + ratio],
[Backlight / rim], [Environment / HDRI], [Special: caustics, volumetrics, GI].

Subject / Environment: [Detailed description — geometry, scale, arrangement,
exact position in frame].

Materials: [Subject material with PBR / SSS / Fresnel / refraction terms],
[Environment materials], [Surface imperfections].

Motion / Animation: [What moves and how — speed, easing, duration of each beat].

Particles / VFX: [Particle systems, volumetrics, refractions, post-processing].

Color Palette: [Primary colors, saturation, mood — warm / cool / contrasting].

Composition: [Rule of thirds / symmetry / centered. Foreground / mid-ground /
background separation. What's sharp, what's bokeh].

Duration: [Total seconds. Pacing of each beat.]
```

**Length sweet spot:** 12-18 lines. Longer prompts hit diminishing returns and start contradicting themselves.

---

## Camera movement vocabulary

Specify movement type, speed, easing, and frame rate. Always.

| Move | When to use | Prompt phrase |
|---|---|---|
| Slow orbital rotation | Product turntable, character reveal | "Slow orbital rotation around subject at 45°/sec, constant distance, ease-in/ease-out, 24fps." |
| Ascending crane | Establishing scale, dramatic unveil | "Camera cranes upward and back, parabolic arc revealing full environment, gradual ease, 24fps." |
| Push-in / dolly forward | Intimate reveal, emotional pull | "Dolly forward 2m over 4s, depth of field tightening from wide to shallow, easing in." |
| Lateral tracking | Side-by-side, environmental sweep | "Tracking shot sliding left to right at constant velocity, smooth ease, 24fps." |
| Reveal pan | Narrative reveal of a second element | "Camera pans 60° left over 2s, revealing second subject, moderate speed (no whip-pan)." |
| Spiral ascent | Sci-fi, architectural drama | "Spiral ascent: orbit at 30°/sec while rising 1m/sec, corkscrew motion, 24fps." |
| Glide-through | Tunnels, corridors, exploration | "Camera glides through corridor at 5m/sec, walls flowing past, slight downward tilt, 24fps." |
| Dolly zoom (vertigo) | Surreal moment, emotional climax | "Dolly forward while zoom narrows — matched mathematical inversion, perspective distortion peaks at 2s." |
| Reverse crane | End of sequence, context reveal | "Camera pulls back and up, gradual majestic ease, revealing larger environment, 24fps." |
| Free floating | Dreamlike, impossible spaces | "Free 3D camera motion — slow, meditative, multiple axes simultaneously, no constraint." |
| Static with internal motion | Product spotlight, meditative | "Camera locked. Internal motion: particles drift, lights pulse, focus shifts foreground to background." |

**Pro tip.** Linear motion looks robotic. Easing curves look filmic. Always specify ease-in/ease-out unless robotic motion is the artistic intent.

---

## Lighting setups

Pick **one setup** per shot. Mixing setups muddies the result.

### 1. Golden-hour HDRI (warm cinematic)
"Lit by outdoor HDRI at golden hour. Warm key (3200K) from upper-left at 45°. Cool blue fill (7000K) bouncing from right. Natural rim from sun. Soft shadows, rich color bleed."
**Use for:** outdoor product, character portraits, nature, beauty shots.

### 2. Studio neutral 3-point (professional)
"Soft diffuse key (5600K) from 45° upper-left. Lower-intensity fill from opposite side at 70% shadow ratio. Crisp rim light at upper-rear creating separation."
**Use for:** product reveals, corporate, controlled cleanliness.

### 3. Single dramatic side-light (moody / film noir)
"Single strong directional key from extreme side angle (80°), creating deep side shadows. No fill — shadows stay rich and dark. Subtle rim from opposite side."
**Use for:** drama, suspense, character intensity.

### 4. Rim-light dominant
"Minimal key (shadow-only fill from environment). Extremely bright rim from back creating luminous outline. Subject glows against background."
**Use for:** dramatic introductions, magical reveals, silhouette beats.

### 5. Cool moonlight
"Cool blue key (8000K+) from upper-left. Minimal fill, deep shadows. Slight rim. Dark or void HDRI environment."
**Use for:** night scenes, sci-fi, psychological moods.

### 6. Warm + cool color contrast
"Warm orange key (3000K) from left. Cool blue fill (8000K) from right. Neutral or warm rim. High color separation."
**Use for:** advertising, fashion, color-graded cinematics.

### 7. Volumetric god rays
"Strong directional sun creating beams through heavy volumetric fog or dust. Soft sky-bounce fill. Light scatters into visible shafts."
**Use for:** sci-fi reveals, magical moments, architectural drama.

### 8. Caustics underwater
"Warm top-light penetrating water. Dynamic caustic patterns dancing on surfaces below. Cool blue reflected fill. Water HDRI environment."
**Use for:** underwater scenes, mystical beats, luxury beauty.

### 9. Neon practical (cyberpunk)
"Bright neon practicals — magenta and cyan from opposite sides. Complementary color back-rim. Dark cityscape HDRI. Color-graded throughout."
**Use for:** sci-fi, tech, cyberpunk.

### 10. Candlelight (intimate warm)
"Warm practical candlelight (2000K, orange) from low angle. Warm bounce fill from nearby surface. Subtle source glow. Dark interior HDRI."
**Use for:** intimate moments, luxury close-ups, emotional beats.

**Always specify Kelvin temperatures.** "Warm light" is ambiguous. "3200K key with 7000K fill" is not.

---

## Material vocabulary (cheat sheet)

The right term unlocks the right look. Wrong terms produce mush.

| Surface | Key terms to include |
|---|---|
| Polished metal | "mirror-polished," "sharp specular highlights," "perfect Fresnel reflections," "[Kelvin] color tint" |
| Brushed metal | "directional micro-scratches," "diffuse specular," "anisotropic reflection" |
| Aged / oxidized metal | "verdigris patina," "deep color in recesses," "rough unpolished surface," "no specularity" |
| Glass / crystal | "sharp Fresnel," "chromatic aberration on edges," "strong refraction," "interior reflections," "perfect optical clarity" |
| Frosted glass | "diffuse light transmission," "no clear refraction," "soft specular glow," "sandblasted appearance" |
| Skin | "visible pores," "subsurface scattering in thin areas (ears, nostrils)," "natural color variation," "subtle oil sheen," "micro-texture" |
| Fur / hair | "individual strand detail," "SSS in backlighting," "natural color variation," "directional flow," "micro-shadows between strands" |
| Fabric (velvet) | "soft nap," "near-zero specularity," "diffuse light scatter," "subtle SSS in thin edges" |
| Fabric (silk) | "lustrous specular sheen," "soft falloff," "specular tinted by fabric color" |
| Water | "Fresnel reflections from sky," "caustics on bottom," "refraction distorting underneath," "surface tension at edges" |
| Wood | "visible grain patterns," "growth rings," "color variation," "natural weathering" |
| Marble | "polished surface," "veining following natural fracture," "subtle SSS," "semi-translucent in thin areas" |
| Bioluminescent | "self-luminous emissive glow," "[color] hue," "glow illuminates nearby surfaces (GI)," "zero reflection of environment light" |

**SSS = subsurface scattering.** "Light penetrates the surface and exits diffusely." Use it on skin, wax, marble, leaves, milk, jade.

**PBR = physically based rendering.** "Surfaces follow real physics — metallic / roughness workflow, accurate Fresnel." Use as a general quality marker.

**Fresnel.** "Reflectivity increases at glancing angles." Mention it explicitly for glass, water, wet surfaces, polished metal.

---

## Sound design (i2v generates silent — audio added in post)

CGI clips usually run **music-only**. VO is optional.

**Music selection:**
- Cinematic orchestral swell — for hyperreal product, architectural, character reveals.
- Ambient drone / pad — for abstract, surreal, dream sequences.
- Synth pulse — for sci-fi, neon, cyberpunk, tech.
- Whimsical orchestral — for Pixar-stylized character work.
- Piano / strings — for intimate, candlelit, emotional beats.

**Music timing:** swell peaks at the payoff frame (typically 70-80% through the clip). Build during motion, climax at the sharpest framing of the subject.

**VO if used:** calm narrator timbre. Never UGC peer voice — kills the aesthetic. Russian / English / Spanish all fine; the visual carries regardless of language.

**SFX (optional):** match the hook. Particle materialization → soft chime + crystalline tinkle. Kinetic decomposition → mechanical click and whirr. Refraction → high-frequency shimmer.

---

## Common mistakes

### 1. Vague camera motion
Wrong: "Add dynamic camera movement."
Right: "Slow orbital rotation at 45°/sec, ease-in/ease-out, 24fps."

### 2. Contradictory materials
Wrong: "Black velvet with mirror reflections."
Right: "Deep black velvet nap with diffuse scatter and zero specularity."
Velvet is diffuse. Mirror finishes contradict it. The model picks one and the other reads broken.

### 3. Lighting without Kelvin
Wrong: "Warm dramatic lighting."
Right: "Warm key (3200K) from upper-left, cool fill (7500K) from right, 2:1 contrast ratio."

### 4. Vague particles
Wrong: "Lots of cool particles flowing everywhere."
Right: "Thousands of cyan glowing particles following spline path, 5cm spacing, opacity fading over 1s."

### 5. No duration
Wrong: "Camera slowly orbits the product."
Right: "Camera orbits at 45°/sec for 3 seconds, completing 135° rotation."
"Slowly" is relative. Quantify.

### 6. Mixed render styles without calling it out
Wrong: "Photorealistic product in a fantasy world."
Right: "Photorealistic product (subject) in a stylized dreamlike environment (background). Subject: photoreal. Environment: stylized."
Be explicit about which elements are realistic vs stylized.

### 7. Weak hook
Wrong: "Character stands in a room and looks at camera."
Right: "Character's eyes glow with bioluminescent light, gradually brightening, illuminating their previously dark face, revealing impossible geometry within."
First 2 seconds must be visually arresting.

### 8. Over-specified impossible detail
Wrong: "Render every atom of the material visible at atomic resolution."
Right: "Hyperdetailed material showing grain, wear, natural variation down to microscopic texture."
"Hyperdetailed" communicates the intent without overreaching.

---

## Five ready-to-paste examples

### A. Pixar-stylized character reveal (5s)

```
HOOK: A crystalline cube slowly materializes from swirling golden particles, rotating to reveal a character trapped inside.

Camera: Slow orbital rotation at 45°/sec around floating cube, constant distance, ease-in/ease-out, 24fps.
Render Style: Pixar-stylized 3D with warm saturated palette and soft shading.
Lighting: Golden-hour HDRI. Warm key (3200K) upper-left, cool blue fill (7000K) right, rim from back creating luminous separation. Volumetric god rays through particles.
Subject: Anthropomorphic fox character, large expressive eyes, warm orange fur with white chest markings, blue vest, slight confident posture.
Materials: Soft fur with SSS in backlit ears. Vest fabric with natural wrinkles and weave detail. Eyes glossy with sharp specular highlights, warm amber iris.
Motion: Character materializes over 2s as particles coalesce. Then blinks and looks at camera with subtle confident smile.
Particles: Golden particles swirl and coalesce onto form, then settle as dust motes.
Color: Warm golds and oranges (subject), cool gradient (background, pale blue to lavender).
Composition: Character centered, cube floating slightly above centerline. Background HDRI / mid-ground cube / foreground sparkles for depth.
Duration: 5 seconds.
```

### B. Photorealistic luxury product reveal (4s)

```
HOOK: A single water droplet on a polished surface catches light and refracts a product hidden in the background.

Camera: Push-in dolly 2m over 4s, depth of field tightening from wide to shallow, focus locks on product at 2s mark, subtle chromatic aberration on edges, 24fps.
Render Style: Photorealistic 3D, indistinguishable from professional product photography, 8K detail.
Lighting: Warm key (3100K) upper-left, cool blue fill (7500K) right, crisp warm rim, professional studio HDRI, soft penumbra throughout.
Subject: Luxury wristwatch, rose-gold case, black dial, water droplet on polished bezel, white frosted-glass platform.
Materials: Rose gold mirror-polished with perfect Fresnel reflections, zero distortion. Sapphire crystal with sharp Fresnel and chromatic dispersion. Cognac leather strap with grain detail and subtle SSS.
Motion: Watch motionless. Water droplet rolls slightly across bezel as camera pushes in (gravity simulation). Highlights on watch bloom subtly as focus locks.
Particles: Minimal — clean studio. Subtle caustics from droplet on metal beneath.
Color: Warm rose-gold, cool silver, black dial, cognac leather. Pure white background.
Composition: Droplet off-center initially, watch reveals as camera pushes in. Final frame: watch centered, fully focused.
Duration: 4 seconds.
```

### C. Isometric sci-fi cityscape (6s)

```
HOOK: An isometric futuristic city materializes from blueprint wireframe, gaining color and detail layer by layer.

Camera: Fixed 45° isometric angle, slow tracking forward and downward through city, maintaining isometric perspective, 30fps.
Render Style: Isometric 3D with crisp geometric forms and hyperdetailed photorealistic textures, zero perspective distortion.
Lighting: Dual-sun system — cyan sun (8000K) upper-left, warm sun (3000K) upper-right. 45° shadows matching isometric grid. GI with color bleed. Volumetric depth haze.
Subject: Sprawling cityscape — curved-glass skyscrapers, hovercars, drone traffic, terraced gardens, water features, neon billboards.
Materials: Glass with Fresnel and refraction. Brushed steel structural. Lush vegetation. Water with caustics and ripples. Neon emissive (magenta, cyan, yellow).
Motion: City starts as cyan wireframe on black. Color floods in, glass / metal / vegetation populate. Vehicles trace flight paths. Holograms flicker. Water ripples.
Particles: Atmospheric haze for depth. Light particles suggesting data flow between buildings.
Color: Cyberpunk — magenta, cyan, yellow accents on cool teal/blue base. Night-time grading.
Composition: City fills frame from all angles. Sharp foreground, hazed background, multiple focal points.
Duration: 6 seconds.
```

### D. Surreal creature transformation (6s)

```
HOOK: A humanoid silhouette crystallizes, becomes transparent, shatters into geometric fragments, and reassembles into an alien insectoid form.

Camera: Slow orbit at 30°/sec, slight pull-back as creature expands, depth of field shifts at sequence end to reveal environment, 24fps.
Render Style: Photorealistic with surreal geometry. Hybrid stylized + realistic lighting.
Lighting: Cool key (8000K) upper-left, warm fill (3000K) lower-right. Bright cyan rim from back. Secondary warm amber rim. Faint violet bioluminescence from creature. Dark blue-hour twilight HDRI.
Subject: Initial — translucent humanoid, internal crystalline structure visible. Mid — fragments separating. Final — chitinous insectoid with compound eyes, segmented body, translucent wings.
Materials: Initial: transparent crystal with internal fractures and refraction. Final: chitinous exoskeleton (hard, reflective, segmented), compound eyes (faceted, iridescent), wings (translucent with chitin veins).
Motion: 0-1.5s humanoid becomes transparent. 1.5-3.5s fragments separate in zero-gravity, hover. 3.5-5.5s fragments reassemble bottom-up into insectoid. 5.5-6s creature settles, breathes, antenna twitch.
Particles: Cyan particles emit from crystalline fragments during separation. Bioluminescent motes hover during reassembly.
Color: Cool cyan / violet / deep black. Creature dark iridescent purple-black with violet bioluminescence.
Composition: Creature center-frame throughout. Background reveals as camera pulls back.
Duration: 6 seconds.
```

### E. Architectural flythrough with material showcase (8s)

```
HOOK: Camera glides through an immense atrium where light refracts through the glass ceiling in fractal patterns, slowly revealing breathtaking interior architecture.

Camera: Continuous smooth tracking through interior — enters atrium, glides past surfaces, descends spiral staircase, emerges into open plaza. 5m/sec, slight upward tilt at end, ease-in/ease-out, 24fps.
Render Style: Photorealistic architectural visualization, every material physically accurate, 8K quality.
Lighting: Massive skylight pouring warm golden light (3100K, late afternoon sun). Cool reflected fill (6500K) from blue sky. Caustics from glass ceiling on all interior surfaces. GI with warm bounce off wood / stone, cool from shadows. Volumetric god rays through atrium dust.
Subject: Modern luxury architecture — glass-roofed atrium, cream limestone walls, blonde oak floor, brushed steel structural elements, reflecting pool with clear water, organic curved columns, terraced seating, living plant walls.
Materials: Glass ceiling — crystal clear, sharp Fresnel, chromatic aberration on edges. Limestone — warm cream, fossil texture, polished. Oak — visible grain, knots, plank variation. Steel — brushed, micro-scratches, cold silver. Water — Fresnel reflections, caustics on pool floor, ripple dynamics.
Motion: Camera continuous. Water ripples gently in breeze. Vegetation sways imperceptibly. Light caustics animate slowly. Shadows shift suggesting passing clouds.
Particles: Dust motes in atrium light shafts. Subtle, adds depth.
Color: Warm gold/cream (lit), cool silver/blue (shadow), green vegetation accents. High saturation in lit areas.
Composition: Strong leading lines (walls / stairs / columns) draw eye through space. Multiple depth layers always visible.
Duration: 8 seconds. Final frame: expansive plaza opening, full architectural complexity revealed.
```

---

## Iteration workflow

If the first generation misses, fix in this order:

1. **Hook lands?** If not, strengthen sentence one. More specific first-frame visual.
2. **Camera feels right?** If not, specify exact degrees-per-second, easing curves, exact distance traveled.
3. **Materials look correct?** If not, add SSS / Fresnel / PBR vocabulary. Reference real-world material explicitly.
4. **Lighting flat?** If not, add Kelvin temperatures, fill ratio, rim light direction, HDRI environment.
5. **Particles vague?** If not, quantify — count, color, opacity curve, motion path, duration.

Two failed gens in a row → stop and report concrete options. Do not render mp4 over a failed quality gate.
