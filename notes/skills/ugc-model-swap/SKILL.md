---
name: ugc-model-swap
description: |
  UGC Model Swap Recreate any short UGC-style video with a different person while keeping everything else (setting, action, props, audio, camera feel) identical to the original.
license: MIT
---

# UGC Model Swap

- When to use
- User shares a UGC video and wants the same video with a different person

User describes a UGC scenario (challenge, reaction, review, try-on, unboxing) and wants a specific character type
User wants multiple variants of the same clip with different character types
Model
Always use Seedance 2.0 (seedance_2_0). Do NOT use Cinematic Studio 2.5 Motion Control for this — it fails silently with reference images in this context. Do NOT use Kling 3.0 — also fails silently with reference images here.

Step 1 — Analyze the source video
Run video_analyze(video_source=<url>, category="analysis_templates") to extract:

- Setting (location, lighting, background)
- Character appearance and outfit

Action sequence — described as ONE continuous scene, not split into numbered scenes
Props (what they are, how they're used)
Audio / dialogue
Step 2 — Character reference image (optional but recommended)
If the user provides a photo of the replacement character:

## Upload via higgsfield_upload or use the attached media ref directly

Pass as medias: [{"role": "image", "data": {"id": "...", "type": "media_input"}}]
Reference with @Image1 at the start of the prompt
If no photo provided — describe the character in text only (e.g. "young attractive white woman with long blonde hair").

Step 3 — Build the prompt
Structure (single continuous scene — NO "Scene 1 / Scene 2" splitting)

[CHARACTER DESCRIPTION]
[SETTING]
[OPENING SHOT — camera angle, what's in foreground]
[CONTINUOUS ACTION — everything that happens, in order, as one flow]
[CAMERA RULES — face lock, never tilts, etc.]
[AUDIO]
Key rules
1. Single scene, no numbered splits. Describe the entire video as one continuous flow. Splitting into "Scene 1 / Scene 2" confuses the model and breaks continuity.

2. Face always in frame — state it repeatedly and explicitly. If the action involves the character looking down, reaching, placing something — the camera must NOT follow. Use:

"HER FACE IS ALWAYS IN FRAME. Camera locked on her face. Never tilts down. Never follows her hand." State this both inline in the action description AND as a separate closing rule.

3. Props — be hyper-specific. If there's one prop (e.g. one ice cube), explicitly forbid variations:

"just one cube, no bucket, no bowl, no container, no pile — only ONE standalone [prop] resting in the palm"

4. Physical actions — describe the body mechanics clearly. Vague actions get wrong results. Instead of "she puts it between her knees", say:

"she deliberately reaches her hand down and tucks the [prop] inside the waistband of her jeans, pushing it down — her hand moves below frame, the prop disappears from view" The more specific the body mechanic, the more accurate the output.

5. Audio — always include. Always add "generate_audio": true and an Audio line in the prompt:

Audio: "[line 1]" / "[line 2]" / [sound description] / "[line 3]" Natural room acoustics.

## Prompt template

[Character description: age, ethnicity, hair, complexion, outfit — be specific].
INTERIOR [setting] — [lighting description], [background details].

Opening: [shot type] — [what's in foreground and how]. [Character] stands in [setting]
looking at [prop/camera] with a neutral expression. HER FACE IS ALWAYS IN FRAME.

[She/He] [smiles/reacts] and [action 1 — e.g. reaches out to take the prop].

## Camera stays tight on [her/his] FACE in close-up throughout the entire video —

[action 2 — detailed body mechanics, e.g. "she deliberately reaches her hand down 
and tucks the ice cube inside the waistband of her jeans"]. [Prop/object] disappears 
out of the bottom of the frame. [Her/His] face fills the shot — [reaction sequence: 
expression shift → gasp → laugh / shock / etc.].

FACE IS ALWAYS CENTER FRAME. Camera locked on [her/his] face. Never tilts down. 
Never follows [her/his] hand. [Skin/lighting note]. Handheld smartphone UGC feel.

Audio: "[line]" / "[line]" / [sound] / "[line]" Natural room acoustics.
Step 4 — Generate
json

higgsfield_generate({
  "requests": [{
    "type": "generation",
    "model": "seedance_2_0",
    "media_type": "video",
    "params": {
      "prompt": "<full prompt>",
      "aspect_ratio": "9:16",
      "duration": 10,
      "generate_audio": true,
      "medias": [
        {
          "role": "image",
          "data": {"id": "<media_id>", "type": "media_input", "url": "<url>"}
        }
      ]
    }
  }]
})
Omit medias entirely if no reference image is provided.

## Batch variants

To generate multiple character variants of the same clip, submit all in one higgsfield_generate call with multiple requests (up to 8 concurrent). Change only the character description in each prompt — keep everything else identical.

Example variant types that work well:

- Different ethnicities / ages
- Different outfits (latex suit, cheerleader uniform, formal wear, etc.)
- With/without reference photo
- Pitfalls

Problem	Fix
Model generates a bucket/pile instead of one prop	Add explicit negative: "no bucket, no bowl, no container, no pile — only ONE standalone [prop]"
Camera tilts down and follows the hand	Repeat face-lock rule both inline AND at the end of the prompt
Character drops the prop instead of placing it deliberately	Describe full body mechanics: "deliberately reaches her hand down and tucks... her hand moves below frame"
Kling 3.0 / Cinematic Studio 2.5 fails silently	Use Seedance 2.0 — it's the only model that reliably handles this workflow
Reference image character not matching	Ensure role: "image" (not start_image) and reference with @Image1 at prompt start
Video opens in wrong location (outdoor instead of kitchen)	Add "INTERIOR [room]" explicitly at the top of the prompt before any action description
Video splits into disconnected scenes	Remove any "Scene N" labels — write as one continuous paragraph
