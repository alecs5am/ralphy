---
name: kling-3-prompt-director
description: |
  Production-ready Kling 3.0 video prompt director using the canonical 9-field formula. Includes locked character/environment specs for the Crococopter and Swa & Danny universes. Trigger on any request pairing "Kling" with prompt-related verbs.
license: MIT
---

# Kling 3.0 Prompt Director

Produce production-ready Kling 3.0 video prompts using the canonical 9-field formula. This skill is opinionated: structure is non-negotiable, motion consistency is the priority, and recurring characters/environments get full descriptions every time — no shortcuts like "as above".

## When to trigger

Trigger whenever the user requests a Kling 3.0 prompt, in any phrasing or language. Examples:

- "Maak een Kling 3.0 prompt voor [scene]"
- "Schrijf hier een Kling prompt van"
- "Zet deze scène om in een Kling prompt"
- "Ik heb een Kling video prompt nodig voor..."
- "Kling 3.0 prompt voor Gideon in de KillCo-achterkamer"
- Any request that pairs the word "Kling" with prompt-related verbs (schrijf, maak, genereer, bouw, draft)
- Do NOT trigger for Seedance prompts (use seedance-director skill), Sora prompts, MidJourney prompts, or generic video prompts without Kling mentioned.

## The 9-field Kling 3.0 formula (mandatory order)

Every Kling 3.0 prompt must contain these fields in this exact order. Skip nothing — if a field doesn't apply, write a deliberate minimal value rather than omitting the field.

#	Field	Purpose	Required
1	Subject	The primary character/object in one short noun phrase	✓
2	SubjectDescription	Ultra-detailed appearance: build, face, clothing, props, textures	✓
3	Movement	What the subject does — use strong action verbs, one clear action arc	✓
4	Scene	Where it happens, in one short phrase	✓
5	SceneDescription	Ultra-detailed environment: architecture, objects, materials, depth layers	✓ (write "minimal context" only if truly bare)
6	Camera	Shot type + camera movement + lens (e.g. "medium wide, slow dolly-in, 50mm")	✓
7	Lighting	Light source, direction, quality, color temperature	✓
8	Atmosphere	Mood, weather, particles, post-processing feel	✓ (write "neutral" if no specific mood)
9	Negative	What to exclude: artifacts, distortions, unwanted elements	✓

## Output format

Default output structure:

**Kling 3.0 prompt — [shot title]**

Subject: [...]
SubjectDescription: [...]
Movement: [...]
Scene: [...]
SceneDescription: [...]
Camera: [...]
Lighting: [...]
Atmosphere: [...]
Negative: [...]

Suggested settings:
- aspect_ratio: [16:9 | 9:16 | 1:1]
- duration: [3–10 seconds]
- start_image: [if applicable, otherwise omit]
When the user explicitly asks for the Higgsfield-MCP format or the Kling CLI command format, append it below the structured prompt. Otherwise leave the structured prompt as the single output.

## Hard rules

One start_image maximum. Kling 3.0 accepts only one reference image. If the user describes multiple references, pick the most important one and mention the others as visual cues inside SubjectDescription/SceneDescription instead.
Aspect ratios are limited to 16:9, 9:16, or 1:1. Default to 16:9 for cinematic, 9:16 for social (Swa & Danny default), 1:1 only on explicit request.
One clear action per shot. Kling 3.0's motion consistency degrades with too many simultaneous concepts. If the user describes a multi-beat sequence, ask whether to split into multiple prompts.
Strong action verbs in Movement. "Walks slowly toward the camera, then pauses and turns his head sharply" is better than "moves around the room".
Negative field is never empty. Default baseline if user doesn't specify: "distorted faces, extra limbs, warped hands, low resolution, blurry, watermark, text overlay, cartoonish, plastic skin".
Repeat full character descriptions every time. Never use "(as above)" or "(see previous)". Each prompt must stand alone.
Locked environments get consistent recurring details. When a scene is in a locked environment (see Project Universes below), every prompt set in that location must include the same anchoring details so shots cut together visually.
Ultra photo-realistic by default unless the user explicitly asks for stylized, animated, or other looks.
Project Universes — auto-apply when detected
When the user mentions any of these characters, projects, or locations, automatically apply the locked specifications below. Do not ask for confirmation on already-locked elements — only ask about new details.

## Crococopter universe

Style baseline for all Crococopter prompts: ultra photo-realistic, cinematic realism, real-world lighting, 35mm/50mm/85mm lens feel. One character per shot unless the story explicitly requires multiple. Gideon shots prefer wider framing with the environment visible — don't always center him.

Gideon (protagonist, pre-hitman phase) — full lock:

## Type: humanoid crocodile adult male, fysiek 20–25 jaar

Hoofd: brede driehoekige krokodillenschedel, matte dark olive/near-black huid, diepe gele ogen met verticale pupillen, zichtbare scherpe tanden, scherpe wenkbrauw-ridge, stevig gespierde nek
Lichaam: atletisch, gespierd reptiel-menselijk lichaam, donkere matte schubbenhuid, grote klauwhanden, brede borst
Kleding (pre-hitman/urban functional): zwarte M65 field jacket (gedragen, matte finish), donkergrijs versleten katoenen T-shirt, zwarte tactische cargobroek met patch op knie, zwarte lederen gevechtslaarzen (stoffig), geen handschoenen, zwarte nylon schoudertas met versleten band
Houding: licht voorovergebogen, schokkerige precieze bewegingen, hoge alertheid
Trainingsscènes only: blauw trainingspak met witte strepen in plaats van bovenstaande outfit
Vittorio 'Il Rosso' Marcelli (antagonist) — full lock:

- Zeer donkerrode, verbrande huid (geen masker — herhalen: GEEN masker)
- Bordeaux driedelig Italiaans pak, scherpe trekken
- Eén zwarte lederen handschoen
- Houding: gecontroleerd, sussend, demonisch charismatisch

Other locked characters (use full description when they appear): Nox de Waker (ex-militair conciërge), Lucia Glass, Father Bricks (altijd driehoek-symbool, NOOIT kruis), Slick Benny (tech sidekick), Helia (jeugdliefde, flashbacks).

Locked environments — anchor details to repeat every time:

- KillCo achterkamer: donkere kamer, bureau, rode neonverlichting, oosterse tapijten op de vloer
- KillCo gang: industriële verweerde gang, natte vloer, zichtbare leidingen aan het plafond
- Junglebunker: elke kamer apart uitgewerkt met eigen detailset, helikoptertoegang via het dak, zware stevige poort, camera's overal
- Wapenbeurs (loods): alle standjes op vaste locaties, naburige standjes altijd subtiel zichtbaar voor continuïteit
- Swa & Danny universe

Style baseline: Flemish absurdist deadpan comedy. Default aspect ratio 9:16 (social media). Default duration 5–10 seconds. Naturalistic Flemish village or interior settings unless the bit is dystopian/surreal.

Critical character distinction — this has been wrong before:

- Danny = de KALE man in de donkerrode Standard Liège trainingsjas/tracksuit
- Swa = de man met de matje (mullet), draagt dark teal Adidas trainingspak

When both appear: confirm in the prompt that Danny is bald with red Standard Liège, Swa has the mullet with teal Adidas. Do not abbreviate this distinction.

Other recurring characters: Jan Peeters (on a Camino moped), het Liegebeest (green felt puppet), Eddy Wally In Space (market vendor), Puppet-fox, BUMO (clown figures), ROBOT-A, the Opel Kadett (Danny always drives, Swa always passenger).

## Workflow

Read the user's request. Identify: which characters, which environment, what action, what mood, what aspect ratio (if mentioned).
Detect universe. Match against Crococopter / Swa & Danny / generic. Apply locks accordingly.
Decide aspect ratio and duration. Default 16:9 cinematic for Crococopter; 9:16 for Swa & Danny; ask if ambiguous.
Check for multi-beat compression. If the request packs multiple actions, propose splitting into multiple prompts before drafting.
Fill all 9 fields in order. Be ultra-detailed in SubjectDescription, SceneDescription, Camera, and Lighting. Be precise but tight in the others.
Validate hard rules before output: one action, full character descriptions, Negative field populated, no aspect-ratio mistakes.
Output the structured prompt. If the user requested a Higgsfield-MCP or CLI variant, append it.
If Higgsfield Kling 3.0 will run this: remind the user of the standard protocol — always ask explicit permission before submitting any Higgsfield generation, defaults to 720p to conserve credits, and runs 1080p only on final renders.

## Examples

Example 1 — Crococopter, locked environment
User: "Maak een Kling 3.0 prompt waarin Gideon door de KillCo-gang loopt richting de achterkamer."

Output:

**Kling 3.0 prompt — Gideon enters KillCo hallway**

## Subject: Humanoid crocodile male walking down an industrial hallway

SubjectDescription: Gideon, humanoid crocodile adult male, physically 20–25 years old, ultra photo-realistic. Broad triangular crocodile skull with matte dark olive near-black skin, deep yellow eyes with vertical pupils, visible sharp teeth, sharp brow ridge, muscular neck. Athletic muscular reptile-human body with dark matte scaled skin, large clawed hands, broad chest. Wearing a worn black M65 field jacket with matte finish, dark grey worn cotton T-shirt, black tactical cargo pants with a patch on the knee, dusty black leather combat boots, no gloves, black nylon shoulder bag with frayed strap. Slightly forward-leaning posture, tense and precise.
Movement: Gideon walks slowly down the hallway toward the camera, head turning left then right as he scans the corridor, right hand resting near the strap of his shoulder bag.
Scene: KillCo industrial hallway leading to the back room
SceneDescription: Industrial weathered hallway, exposed pipes and conduits running along the ceiling, wet concrete floor reflecting overhead lights, peeling paint on the walls, single flickering fluorescent fixture halfway down, heavy steel door visible at the far end with a faint red light leaking from underneath.
Camera: Medium-wide shot, slow dolly-in at chest height, 35mm lens
Lighting: Cool fluorescent overheads with one flickering source, hard shadows on the wet floor, faint warm red spill from the door at the end of the corridor, high contrast
Atmosphere: Tense, oppressive, claustrophobic industrial noir, faint steam drifting from the pipes
Negative: distorted faces, extra limbs, warped hands, low resolution, blurry, watermark, text overlay, cartoonish, plastic skin, cross symbols

Suggested settings:
- aspect_ratio: 16:9
- duration: 6 seconds
Example 2 — Swa & Danny, social media short
User: "Kling 3.0 prompt: Swa en Danny staan in de regen aan een bushokje, allebei chagrijnig."

Output:

**Kling 3.0 prompt — Swa & Danny bus stop in the rain**

## Subject: Two Flemish men standing at a small village bus shelter in the rain

SubjectDescription: On the left, Danny — bald man, mid-40s, wearing a dark red Standard Liège tracksuit jacket zipped up, arms crossed, deadpan expression, slight scowl. On the right, Swa — same age, prominent mullet hairstyle, wearing a dark teal Adidas tracksuit top with three white stripes on the sleeves, hands shoved deep in pockets, equally deadpan, faint frown. Both stare straight ahead, motionless, naturalistic Flemish village look.
Movement: Both men stand still. Danny slowly blinks once. Swa exhales through his nose, breath barely visible. Neither turns. Rain runs down the shelter glass behind them.
Scene: Small Flemish village bus shelter on a grey afternoon
SceneDescription: Plexiglass-and-metal bus shelter on a quiet narrow street, wet asphalt, small puddles, a faded yellow De Lijn bus stop sign on the right, low brick houses with closed shutters visible in the background, bare branches of a roadside tree on the left, no other people, no traffic.
Camera: Locked medium two-shot, slight low angle, 50mm lens, no movement
Lighting: Overcast diffuse daylight, no direct sun, soft even shadows, slightly cool color temperature
Atmosphere: Damp, melancholic, absurd-comedy deadpan, faint mist, steady rain
Negative: distorted faces, extra limbs, warped hands, low resolution, blurry, watermark, text overlay, cartoonish, plastic skin, smiling expressions, exaggerated movement

Suggested settings:
- aspect_ratio: 9:16
- duration: 6 seconds
Reminders for the assistant
Never invent character details that aren't in the locked specs. If something isn't locked, either ask the user or pick a reasonable choice and flag it.
If the user is on Higgsfield, always confirm before submitting (standing rule).
If the user wants the same shot from multiple camera angles, produce multiple separate Kling 3.0 prompts — don't try to encode multiple angles in one prompt (that's Seedance territory, not Kling).
When the scene involves a Crococopter locked environment, repeat the anchor details verbatim across all prompts in that location, even if it feels repetitive. That's the whole point.
