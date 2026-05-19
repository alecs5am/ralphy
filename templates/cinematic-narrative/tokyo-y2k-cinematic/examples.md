# Examples — worked variants

Two worked cookbooks, plus the source instance. Each variant changes `{{city_name}}` + `{{aesthetic_era}}` + the costume / signage / transit signature, while keeping the locked-off + zero-diegetic + frame-within-a-frame + adagio-piano-bed invariants.

## Variant 0 — SOURCE INSTANCE: Tokyo + Y2K + Yamanote (2026-05)

**Slug:** `tokyo-y2k-001` (`workspace/projects/tokyo-y2k-001/`)
**Title:** *Tokyo, slow shutter*
**Style anchor:** KYO KIMURA — `honeybee` (x.com/noukin_camera/status/2041722047022428265)
**Duration:** 75.05s · **Shots:** 17 (15 city + 2 pastoral inserts) · **Aspects:** 9:16 letterboxed 1.85:1 + 16:9 native · **fps:** 24
**Final render:** `render/final.mp4` (33.5 MB) + `render/final-16x9.mp4` (78 MB)
**User rating:** 8.5/10 — *"очень эстетично приятно видео получилось"*
**Cost:** ~$22.35 cumulative

**Slot fills (verbatim from source):**

```json
{
  "city_name": "Tokyo",
  "aesthetic_era": "Y2K (late 1990s / early 2000s Japanese art-cinema register — Shunji Iwai / Wong Kar-wai)",
  "rail_system_signature": "Yamanote line — green stripe livery, JR signage, Tokyo loop-line",
  "neighborhood_anchor_a": "Shimokitazawa record shop (wooden counter, tube-fluorescent ceiling, vinyl bins, 7-inch records in abstract magenta and yellow sleeves)",
  "neighborhood_anchor_b": "Shibuya scramble crossing at dusk (pink-purple sky, tungsten signage, hundreds of moving silhouettes)",
  "japanese_signage_type": "unreadable kanji storefront signage, vending-machine fluorescent ads, kissaten warm-tungsten neon — NO Latin readable text, NO logos",
  "character_a": "~22yo Japanese woman, art-student register: oversized cream cardigan over white tee + dark pleated knee skirt + crinkled white socks + black loafers, shoulder-length straight black hair with full curtain bangs covering eyebrows, holding an Olympus mju-II film camera on a thin wrist strap, small canvas tote. Bare makeup, slight gloss, faint blush, skin pores visible. Energy: still, observing, slow head tilts.",
  "character_b": "~24yo Japanese man, music-shop assistant register: faded navy Champion crewneck over plain white tee collar + light-wash baggy denim + scuffed white low-top sneakers, black canvas messenger bag with 12-inch record sleeve visibly poking out, slightly long messy natural black hair falling into eyes, no makeup. Energy: looks down then up, presses forehead against glass surfaces, hands always doing something.",
  "target_language": "non-verbal (zero dialogue, zero VO, zero captions)",
  "music_brief": "Modern-classical cinematic instrumental in the register of late-1990s Japanese art-cinema scores. Adagio ~60 BPM. 75 seconds. Intimate close-mic'd felt-hammer piano lead entering at 0:00. Soft swelling strings enter at 0:30. Single solo cello phrase peaks at 0:55-1:05. Strings recede by 1:10, solo piano alone for final phrase. Final phrase fades unresolved mid-phrase."
}
```

**Beat structure (17 shots, 75s total):**

| # | t (s) | Dur | Beat | Frame device |
|---|---|---|---|---|
| 0 | 0–6 | 6 | Pastoral memory-opener — she alone in a summer field, cumulonimbus | Wide, locked-off |
| 1 | 6–12 | 6 | Empty Yamanote platform dawn, sparrow takeoff | Static wide, frame-within power-line silhouette |
| 2 | 12–17 | 5 | She at kissaten window, raising Olympus mju-II | THROUGH condensation-fogged glass |
| 3 | 17–21 | 4 | He pushes door open as she exits — door-swing half-beat near-miss | Static wide of the door |
| 4 | 21–27 | 6 | His hands flipping 7" vinyl, tube-fluorescent shrinkwrap highlight | Macro close, 85mm |
| 5 | 27–33 | 6 | Platform face-to-face across tracks, train pulling away | Static wide, deep DoF |
| 6 | 33–39 | 6 | She photographs the empty seat across her in the Yamanote car | Through Yamanote-green interior |
| 7 | 39–45 | 6 | He presses forehead against train window, passing neon reflection | Static medium close |
| 8 | 45–51 | 6 | Vending-machine alley walk, reloads Portra 400 — JP SIGNAGE TYPOGRAPHY SLAM | Static, top-down hard fluorescent |
| 8p | 51–55 | 4 | Pastoral breath — empty sakura courtyard, drifting petals, NO people | Wide, locked-off |
| 9 | 55–61 | 6 | Shibuya crossing, ~30m apart, hundreds of silhouettes between them | Static wide, slightly elevated |
| 10a | 61–65 | 4 | Clear-plastic umbrellas pop open in a cascade — RAIN BEGINS | Static, sequence |
| 10b | 65–67 | 2 | He ducks under awning, hand to forehead, self-amused smile | Static, intercut |
| 11 | 67–73 | 6 | **EMOTIONAL PEAK — RAIN-ON-GLASS MACRO** — her reflection layered over his silhouette through wet record-shop window | Static medium, held ~6s (storyboard ~9s, trimmed to fit) |
| 12 | 73–75 | 2 | Two trains pass, reflections align for ~12 frames — THE ONLY YES | Static medium, side-on |
| 13 | 75–76 | 1 | Half-smile close on her face — did she feel it? | Static close, 85mm |
| 14 | 76–78 | 2 | Empty Tokyo platform at night, fade to black mid-music-phrase | Static wide, neon fill |

Beat 11 is the rain-on-glass macro emotional peak; beat 8 is the JP signage typography slam; beats 0 + 8p are the honeybee-DNA pastoral inserts.

---

## Variant 1 — Seoul + 1990s + Line 2 (worked variant)

**Slug suggestion:** `seoul-1990s-line2-near-miss`
**Style anchor:** Wong Kar-wai's *Happy Together* + Hong Sang-soo's static long-takes
**Duration:** 75s · **Shots:** 15-17 · **Aspects:** 9:16 + 16:9 · **fps:** 24

**Slot fills:**

```json
{
  "city_name": "Seoul",
  "aesthetic_era": "1990s (early-Wong-Kar-wai register — saturated tungsten, cyan window light, smoky interiors, slight chromatic but NEVER digital sharpness)",
  "rail_system_signature": "Seoul Metro Line 2 — green livery, circular loop-line, Hangul station signs in white sans-serif on green",
  "neighborhood_anchor_a": "Hongdae basement record shop (concrete pillar, fluorescent tubes, K-pop bootleg cassettes in handmade sleeves)",
  "neighborhood_anchor_b": "Myeongdong night-market intersection at dusk (orange-tungsten food-stall signs, steam from pojangmacha tents, dense pedestrian flow)",
  "japanese_signage_type": "OVERRIDE — Hangul signage: hand-painted Hangul shop names in faded primary colors, pojangmacha fluorescent menu boards, subway station Hangul + Hanja mix — NO Latin readable text, NO English logos",
  "character_a": "~21yo Korean woman, late-1990s student register: oversized navy school-uniform-style cardigan + pleated dark-green skirt + white knee socks + black loafers. Straight black hair to mid-back, no bangs. Holds a small black point-and-shoot film camera. Energy: shy, observant, smiles only with the corner of her mouth.",
  "character_b": "~23yo Korean man, university-student-musician register: oversized brown leather jacket over white tee + dark jeans + black Converse, slightly long center-parted hair, soft features. Holds a folded music-score notebook. Energy: introspective, looks at his shoes between blocks, pauses at every signage.",
  "target_language": "non-verbal",
  "music_brief": "Modern-classical instrumental in the register of late-1990s Korean art-film scores. Adagio 58 BPM. 75 seconds. Solo gayageum plucks layered with intimate close-mic'd felt-hammer piano entering at 0:08. Soft warm strings enter at 0:35. Final phrase resolves UNRESOLVED on a single gayageum string at 1:13 — fades mid-phrase, no resolution."
}
```

**Beat substitutions (replace Tokyo-specific beats with Seoul-specific):**

- Shot 2: kissaten → **dabang (전통다방, traditional Korean tearoom)** with red velvet bench seats + condensation-fogged window
- Shot 3: sliding glass door → **wooden sliding door of a hanok-renovated cafe**
- Shot 4: 7" vinyl → **K-pop bootleg cassette tapes in handmade hand-drawn sleeves**
- Shot 5: Yamanote platform → **Seoul Metro Line 2 platform**
- Shot 6: Yamanote car interior (green) → **Line 2 car interior (green, white plastic, JR-style hanging straps)**
- Shot 8: vending-machine alley → **Myeongdong food-stall alley between orange-tungsten pojangmacha tents**
- Shot 8p: sakura courtyard → **empty university hanok courtyard with magnolia in bloom, drifting petals**
- Shot 9: Shibuya crossing → **Myeongdong intersection at dusk**
- Shot 11: record-shop window → **dabang window with rain streaks** (emotional peak unchanged)
- Shot 14: empty Tokyo platform → **empty Seoul Line 2 platform with one fluorescent ad-light cycling**

---

## Variant 2 — Hong Kong + Vaporwave-2010s + MTR (worked variant)

**Slug suggestion:** `hongkong-vaporwave-mtr-near-miss`
**Style anchor:** Wong Kar-wai's *Chungking Express* (the iconic stop-motion blur shots) but locked-off-tripod-only — adapt the palette + density, NOT the camera grammar
**Duration:** 75s · **Shots:** 15-17 · **Aspects:** 9:16 + 16:9 · **fps:** 24

**Slot fills:**

```json
{
  "city_name": "Hong Kong",
  "aesthetic_era": "vaporwave-2010s (Chungking-Express-palette: oversaturated tungsten + cyan + magenta, neon as primary light, dense vertical signage, slight chromatic aberration acceptable here — but NEVER VHS lines, NEVER scanlines)",
  "rail_system_signature": "MTR — red livery on Island Line / yellow on Tsuen Wan Line, dot-matrix station signs in traditional Chinese + English, distinctive metallic-finish car interiors",
  "neighborhood_anchor_a": "Sham Shui Po electronics market alley (vertical signage stack, fluorescent-tube stalls, secondhand cassette stalls)",
  "neighborhood_anchor_b": "Causeway Bay at dusk (vertical Chinese neon signs in red + cyan + magenta + green, dense crowd flow, MTR exit illumination)",
  "japanese_signage_type": "OVERRIDE — dense vertical traditional Chinese neon signage stacked top-to-bottom in red + cyan + magenta + green, slight neon flicker on a few signs, NO Latin readable text, NO English logos",
  "character_a": "~23yo Hong Kong woman, vaporwave-2010s register: oversized graphic tee tucked into high-waist faded denim + white Adidas Stan Smiths + crossbody nylon bag. Bleached-blonde messy bob with dark roots, full bangs. Holds an iPhone 4 (era-accurate). Energy: slightly bored, urban, observing.",
  "character_b": "~25yo Hong Kong man, indie-musician register: oversized white tee + light-wash baggy jeans + chunky white sneakers + tote with a CD-R poking out. Black hair, longer on top, side-parted. Energy: looks at his phone, doesn't see the world.",
  "target_language": "non-verbal",
  "music_brief": "Vaporwave-cinematic instrumental, adagio 55 BPM, 75 seconds. Lo-fi piano lead (slightly detuned, intentional warmth) + sustained warm synth-pad drone in low register + sparse Rhodes electric-piano accents entering at 0:30. NO percussion. NO arpeggios. NO digital sheen. Final phrase fades unresolved mid-phrase. Slight tape-saturation warmth throughout. NO vocals, NO sound effects, NO diegetic audio, NO dialogue."
}
```

**Beat substitutions:**

- Shot 1: empty Yamanote platform at dawn → **empty MTR Island Line platform at dawn** (red livery, dot-matrix sign)
- Shot 2: kissaten window → **cha chaan teng (茶餐廳) window** with steam + condensation
- Shot 3: kissaten sliding door → **cha chaan teng glass door with hand-painted Chinese menu visible**
- Shot 4: 7" vinyl flipping → **secondhand CD-R cassette flipping** in an electronics-market stall
- Shot 5: Yamanote platform face-to-face → **MTR Island Line platform face-to-face**
- Shot 6: Yamanote car interior → **MTR car interior** (red livery, metallic finish)
- Shot 7: train window forehead → **MTR window with passing Hong Kong vertical neon reflections** sweeping across his face
- Shot 8: vending-machine alley → **Sham Shui Po electronics market alley** (vertical signage stack, fluorescent stalls)
- Shot 9: Shibuya scramble → **Causeway Bay intersection at dusk** (dense vertical Chinese neon)
- Shot 11: record-shop wet glass → **electronics-stall wet plastic-curtain — emotional peak, her reflection on the plastic + his silhouette through it**
- Shot 12: trains passing → **two MTR trains pass on parallel tracks** (red livery + yellow livery — Island Line + Tsuen Wan Line)
- Shot 14: empty Tokyo platform → **empty Causeway Bay corner at 3am, single vertical neon sign cycling**

---

## How to use these as a starting point

1. Read `TEMPLATE.md` "Key rules" and "Workflow" first.
2. Pick the variant closest to your brief; copy the slot fills into your project's prompt-cookbook.
3. Use the beat structure as the storyboard skeleton — keep the *function* of each beat (establishing / introduce-A / first-near-miss / introduce-B / second-near-miss / her-gesture / his-gesture / walking / weather / peak / yes / half-smile / fade) but rewrite each beat's specific framing in your city + era language.
4. The emotional peak (shot 11) and the only-yes moment (shot 12) are the locked structural beats — they are what make this a "near-miss" arc rather than a slice-of-life. Don't drop them or move them.
