# Video models: quirks and prompts (observed 2026-05 to 2026-11)

Model names and limits change; `get_model_schema` is the truth. These are behaviours the schema does
not tell you.

- **Duration overshoot.** Seedance returned clips about 1 s longer than requested (5 → 6.04 s);
  Kling was seen both close to exact and about 1 s over. Probe every clip with ffprobe and time the
  composition to the real length; request 1 s less when the slot is tight. Never hardcode the
  requested duration into cut points.
- **Image to video prompts** describe only motion, in one or two phrases, with one camera move
  ("static", "slow push-in", "subtle handheld"). The first frame already shows the scene.
- **Default readings.** Models fall into the obvious reading of a pose (a jar near a cheek became
  "applying makeup"); a negative ("NOT applying makeup") did not escape it. Restage: a different
  action or grip worked first time.
- **Kling** turned wide phrasing ("wide cityscape", "crowd") into a 16:9 layout inside 9:16. Use a
  portrait first frame and words like "tall vertical portrait shot, narrow alley". Prompts over about
  2500 characters got cut; keep multi-shot shot prompts under ~512. It voiced dialogue in 1 of 3
  clips despite "no speech": transcribe generated clips before use.
- **Seedance** runs two filters. Input: a photo-like first frame triggers
  `InputImageSensitiveContentDetected` (stylized faces, grain, silhouettes pass; pure text to video
  is not scanned). Output: destruction words trigger "output may contain sensitive information".
  Reword: "explosion" → "soft dissolve, bloom of light"; "shatter, shards" → "flows apart, ripples";
  "breach, ram through the wall" → "opens into a passage". Light comedic impacts pass.
  Reference-to-video copied the burned-in subtitles of its reference clip.
- **Native audio** (Kling, Seedance, Veo) is unreliable outside English: accent, age, clipped lines.
  Generate silent clips and voice separately; ambient sound is fine in any language.
- **IP filters.** Several models reject named characters or styles after minutes of rendering;
  rewording ("tribute", "parody") did not help. Change the shot.
- Re-encode generated clips with a short keyframe interval (`ffmpeg -i in.mp4 -c:v libx264 -g 24
  -crf 16 out.mp4`) before putting them in a composition.
