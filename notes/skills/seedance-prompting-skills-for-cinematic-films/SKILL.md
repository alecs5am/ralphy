---
name: seedance-prompting-skills-for-cinematic-films
description: |
  When to use Trigger this skill when the user requests photorealistic cinematic motion — not stylized animation, not motion design, not UGC. Specifically:
license: MIT
---

# Seedance Prompting Skills For Cinematic Films

"cinematic film prompt", "film-style scene", "shot like a movie"
"realistic body movement", "grounded motion", "natural human behavior"
"emotional close-up", "restrained performance", "subtle expression"
"driving scene", "intimacy scene", "action sequence", "fight choreography"
"environmental interaction" — wind, rain, water resistance, dust, gravity
"continuity reference", "match cut", "scene-to-scene continuity"
"Seedance cinematic prompt", "photorealistic motion", "live-action prompt"
If the request is for animation, cartoon, motion design, UGC, or podcast, defer to the matching skill in video-generation instead.

## Core principle

Cinematic realism is built from restraint, not spectacle. Every prompt enforces five grounding pillars that prevent Seedance from drifting into the over-animated, floaty, AI-looking failure modes that plague text-to-video output.

The five pillars:

- Body weight & physics — actors have mass; movement has friction, momentum, and contact force.
- Environmental force — wind, water, gravity, fabric, and surface texture push back on the actor.
- Emotional restraint — micro-expressions, held beats, breath. No exaggerated facial telegraphing.
- Camera as observer — the lens has its own physical presence (weight, breathing, drift). Not a drone, not a god.
- Continuity anchors — lighting direction, wardrobe, time-of-day, and prop position carry across shots.
- A prompt that drops any pillar produces "AI cinema" — technically a video, structurally a tell.

## The grounded cinematic prompt structure

Seedance 2.0 prompts for cinematic film follow this six-block order. The order is load-bearing — Seedance weights the earliest blocks most heavily for compositional decisions, and the later blocks for motion and audio.

[STYLE & MOOD]
[SHOT DIRECTION]
[ACTOR BEHAVIOR]
[ENVIRONMENTAL FORCE]
[CAMERA BEHAVIOR]
[AUDIO]
Block 1 — Style & Mood (1 line)
One sentence. Cinematographer lexicon. Pick a film stock or DP reference if the user has given you one; otherwise default to "35mm anamorphic, naturalistic color, soft contrast."

✓ "35mm anamorphic, naturalistic skin tones, soft window light, muted teal-and-amber palette."
✗ "Cinematic, beautiful, dramatic, epic."
Adjective stacks ("cinematic, beautiful, dramatic") flatten output. Specificity sharpens it.

Block 2 — Shot Direction (1 sentence)
The action distilled. Subject, verb, object, location. No adjectives that aren't doing structural work.

✓ "A woman in her forties leans against a kitchen counter, reading a folded letter."
✗ "A beautiful sad woman sadly reads a heartbreaking letter in a sad kitchen."
Block 3 — Actor Behavior (2-3 sentences)
This is where grounding lives. Write the actor's body the way a director gives notes — physical, specific, restrained.

Always include:

- A weight cue — where the body's mass is settled ("weight on her right hip", "shoulders dropped", "hand braced on the counter").
- A micro-action — a small involuntary motion ("she swallows", "his jaw tightens once", "her thumb traces the paper's edge").
- A held beat — a moment of stillness with intent ("she pauses for two seconds before reading the next line").

Forbidden:

- "Tears stream down her face" → Seedance over-renders this. Use: "her eyes glass over; she does not blink."
- "He runs furiously" → Use: "he breaks into a run, shoulder leading, arms compact."
- "Smiles widely" → Use: "the corner of her mouth lifts, then settles."
- Block 4 — Environmental Force (1-2 sentences)
- What pushes back on the actor. Without this, Seedance generates actors in a vacuum and the shot reads as a soundstage.

Categories:

Air: wind direction and strength on hair, fabric, dust.

Water: rain weight on shoulders, water sheeting off surfaces, droplet trails.

Gravity: how the actor's weight transfers — hip-shift, knee-bend, contact with chair/wall/ground.

Surface: floor compliance (carpet absorbs step, hardwood transmits sound), wall texture catching light.

Light source: where is it, is it moving (passing car headlights, candle flicker, blinds shifting).

✓ "Wind from the open window lifts the left edge of her hair; the curtain breathes inward once."

✓ "Rain hits his shoulders in irregular bursts; water beads at his collar and falls."

Block 5 — Camera Behavior (1 sentence)
The camera is a body too. Give it weight, intent, and limits.

Default cinematic camera lexicon Seedance understands well:

- "Locked-off static frame, no movement."
- "Slow handheld breathing, micro-drift."
- "Dolly-in at walking pace, ending in medium close-up."
- "Slow push from medium to close-up over 6 seconds."
- "Slow truck right, following the actor's shoulder."
- "Rack focus from foreground hand to background eyes."
- "Anamorphic dolly, slight lens flare from off-screen window."

Forbidden:

- "Epic sweeping drone shot" — produces flying, weightless, video-game camera.
- "Cinematic camera movement" — too vague; Seedance defaults to floaty.
- "360-degree rotation" — almost always breaks continuity and produces morph artifacts.
- Block 6 — Audio (1 line)
- Seedance generates native audio. Specify ambient first, then any vocal line.

✓ "Ambient: distant traffic, refrigerator hum, paper rustling. No dialogue."
✓ "Ambient: rain on glass, single car passing. She whispers, 'I'm still here.'"
If silence is intended, write: "Ambient: room tone only. No dialogue, no music."

## Scene-specific patterns

Below are battle-tested patterns for the scene types this skill is most often invoked for. Use them as starting templates, not rigid forms.

## Driving scene (interior, day or night)

35mm anamorphic, naturalistic skin tones, low-key interior with passing exterior light.

A man in his late thirties drives alone on a two-lane highway at dusk.

His hands rest on the wheel at 9 and 3, grip relaxed. He glances at the rearview mirror once, then back to the road. His jaw is set; he has not spoken in some time.

Light from passing streetlamps and oncoming headlights sweeps across his face in slow rhythmic bands. The cabin is enclosed; dust motes catch in the side window light.

Locked-off frame on the driver, slight handheld breathing. Background out-of-focus highway moving at speed.

Ambient: tire hum on asphalt, faint heater fan, occasional passing vehicle. No music, no dialogue.
Critical: lock the camera or use very gentle handheld. Aggressive camera in a driving cabin reads as music video, not film.

## Emotional close-up (held, restrained)

35mm anamorphic, naturalistic skin tones, soft north-facing window light, shallow depth of field.

A woman in her forties stands at a kitchen window, holding a folded letter.

She does not open it. Her thumb traces the fold once. Her shoulders settle, the weight of her body shifting to her left foot. Her eyes glass over but she does not blink; she swallows once.

Daylight from the window catches the side of her face; the curtain behind her stirs faintly. Dust visible in the light beam.

Slow push from medium to tight close-up over the full shot duration, ending at her eyes.

Ambient: distant kitchen radio playing softly under the noise floor, refrigerator hum, paper rustling between her fingers. No dialogue.
Critical: no tears, no telegraphed grief. The performance lives in the held beat and the micro-action.

## Action sequence (foot chase / pursuit, grounded)

35mm anamorphic, naturalistic color, overcast daylight, handheld vérité.

A man in his thirties runs down a narrow alley between brick buildings, pursued from off-screen.

His stride is compact, arms tucked, shoulder leading into each turn. He clips a steel trash can with his hip without slowing. His breathing is audible, irregular. He glances back once, then forward.

Wet pavement catches the gray sky; puddles splash where his feet land. A loose plastic bag tumbles past him in the wind. Brick walls close on both sides.

Handheld camera following at his shoulder height, two paces behind, breathing with his stride. Lens flares briefly when he passes an open doorway.

Ambient: footsteps on wet concrete, his breathing, distant city traffic, the bag scraping against the wall. No music.
Critical: keep stride compact. Seedance over-renders "sprinting" as bouncy, weightless action-hero pose. Write "compact, shoulder-leading" to ground it.

## Intimacy scene (restrained, close)

35mm, naturalistic skin tones, warm low-key practical light from a bedside lamp, shallow depth of field.

Two people in their thirties sit close on the edge of a bed, neither speaking. One rests their forehead against the other's temple.

They breathe in near-sync. One hand finds the other's, fingers settling without grip. Neither moves to kiss; the stillness holds. A small smile passes between them, then fades.

The bedside lamp throws warm light across one side of both faces; the room behind is in shadow. Bedding compresses where they sit.

Static frame, no camera movement. Shallow focus held on the contact point between their foreheads.

Ambient: room tone, faint clock ticking, soft fabric movement. No dialogue, no music.
Critical: intimacy is built from non-action. Resist the urge to add a kiss, a tear, a whispered line — Seedance over-renders all three.

## Environmental interaction (weather as character)

35mm anamorphic, naturalistic color, late-afternoon overcast, slight teal cast.

A woman in her fifties walks slowly along a coastal cliff path, hands in her coat pockets.

Her stride is measured, weight settling into each step against the slope. The wind catches her hair from the left; she does not push it back. Her coat collar flutters; she pulls it tighter once.

Strong onshore wind shapes everything in frame — grass laid flat, her coat pressed against her body, salt spray visible in the air. The sea below is gray and churning; gulls hold position against the wind.

Slow truck right, matching her pace, framing her in medium-wide profile with the sea beyond. The horizon line stays level.

Ambient: wind through grass, distant surf, gull calls. Her footsteps soft on the path. No dialogue, no music.
Critical: the wind must shape multiple elements (hair, coat, grass, gulls) — single-element wind reads as a fan on set.

Continuity references — multi-shot scenes
When the user asks for a multi-shot cinematic sequence (a beat, a scene, an exchange), continuity is enforced through anchors that appear in every shot's prompt, not through hoping Seedance will remember.

For every shot in the sequence, copy these anchors verbatim into the prompt:

- Lighting anchor: same source, same direction. "Late-afternoon window light from screen-left" — in every prompt.
- Wardrobe anchor: full description, same wording. "Navy wool coat, gray scarf, no jewelry" — in every prompt.
- Time-of-day anchor: explicit. "Overcast late afternoon, ~4pm light" — in every prompt.
- Geography anchor: where the actor was at the end of the previous shot. "She has just stepped back from the kitchen counter; in this shot she stands at the window."
- Audio bed anchor: same ambient signature. "Ambient: distant kitchen radio, refrigerator hum" — across all interior shots.

For visual identity continuity (same face across shots), use the persistent element pattern from skills/media/video-generation/SKILL.md — generate one anchor portrait, register it as a character element, embed <<<element_id>>> in every shot's prompt. Do not re-upload portraits per shot.

For visual continuity of a location, register the establishing shot as an environment element similarly.

## Submission

After authoring the prompt, submit via Seedance 2.0:

json

higgsfield_generate({
  "requests": [{
    "type": "generation",
    "model": "seedance_2_0",
    "media_type": "video",
    "params": {
      "prompt": "<the six-block prompt>",
      "duration": 8,
      "aspect_ratio": "21:9",
      "generate_audio": true
    }
  }]
})
Defaults for cinematic film:

- aspect_ratio: 21:9 (anamorphic feel) or 16:9 (standard). Use 9:16 only when the user explicitly requests vertical.
- duration: 6-10s for single shots. 4-5s for hard cuts. 12-15s only for slow held scenes (intimacy, environmental).
- generate_audio: always true unless the user requests silence (and even then write "Ambient: room tone only").

Failure modes and how to fix them
Symptom	Cause	Fix
Actor moves like they're floating / no weight	No body-weight cue in Block 3	Add "weight settled on her right hip" / "shoulders dropped" / "hand braced on the counter"
Hair, fabric, environment look static	No environmental force in Block 4	Add a wind/gravity/surface line
Face is over-acted, telegraphed grief/joy	Verbs like "cries", "smiles widely", "rages"	Replace with micro-actions: "swallows once", "corner of mouth lifts then settles"
Camera flies, drones, swoops	"Sweeping" / "epic" / "drone" / "cinematic camera movement"	Replace with specific lexicon: "locked-off", "slow handheld", "dolly-in at walking pace"
Scene reads as soundstage	No environmental force AND no audio bed	Add both Block 4 and Block 6 in full
Continuity drift across shots	No anchors repeated in each prompt	Copy the five anchors verbatim into every shot's prompt
Driving scene feels like a music video	Camera moves too much	Lock the frame; use slight handheld breathing only

## Output discipline

Return only what the user needs:

- The submitted job_ids (handled by the frontend — do not paste them into the reply).
- A brief plain-language description of what was made ("Here's the held close-up at the kitchen window, 21:9, 8 seconds, ambient room tone").

Never paste:

- The full six-block prompt (unless the user explicitly asks to see it).
- Tool internals, media IDs, element IDs.
- The framework itself ("I applied the five grounding pillars…") — the user wants the shot, not the methodology.
- Pitfalls
- Do not stack adjectives in Block 1. "Cinematic, beautiful, dramatic, epic, stunning" produces flatter output than a single specific film-stock reference.
- Do not write the actor's emotion as a verb. Write the body, write the micro-action — emotion emerges from restraint, not declaration.
- Do not skip Block 4. Without environmental force, every cinematic prompt reads as a soundstage no matter how good the rest is.
- Do not give the camera unlimited freedom. A locked-off frame is more cinematic than a swooping drone shot 90% of the time.
- Do not generate one shot per beat in a multi-shot scene without anchors. Continuity is not automatic; it is enforced via repeated wardrobe/light/audio descriptions in every prompt.
- Do not use this skill for animation, cartoons, motion design, or UGC. Defer to the matching skill in video-generation/references/.
- Verification

After submission, the user sees the rendered video from the frontend automatically. The agent does not need to poll unless the result is feeding into a downstream generation in the same turn (see video-generation/SKILL.md fire-and-forget policy).

If the user reports a failure mode, consult the table above and rewrite the offending block — do not switch models. Quality lives in the prompt structure, not the engine.
