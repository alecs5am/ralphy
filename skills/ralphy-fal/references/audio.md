# Voice, music, sound effects

## Voiceover

- **One take.** Voice the whole script in one request, then cut it into shots on word timings. Lines
  voiced one by one broke intonation and multiplied stress errors; the owner rejected that take.
  Several speakers: one take per speaker.
- **Russian.** Voice `3EuKHIEZbSzrHGNmdYsx` (Nikolay) on ElevenLabs v4 worked for the owner (it ran
  through fal's ElevenLabs endpoint; find the current id with `search_models "elevenlabs tts"`).
  Library voices sounded theatrical in Russian; eleven v3 was unstable in Russian.
- **Stress check every Russian take.** Write numbers as words in the right case, avoid words with
  ambiguous stress, transcribe the take and read it word by word; an audio model through OpenRouter
  can mark stresses. A wrong stress means a new take of the whole script, not a patch.
- **Length.** About 2.5 words per second; 15 s holds about 37 words. Dramatic English on eleven v3 ran
  15-25% longer than the word count suggests. Time the composition to the real audio. Too long: stretch
  with ffmpeg `atempo` (HyperFrames ignores `data-playback-rate` in render) and transcribe again.
- **Word timings:** `ralphy tool transcribe <take> --language ru` (local, free) or ElevenLabs Scribe
  (paid, about $0.004 per minute, better on names). Both mishear proper names; keep a fixups list
  (wrong → right) and apply it before using the words as captions.
- **Concurrency.** ElevenLabs TTS allowed about 3 parallel requests (more returned 429), music 2.
  Voice calls one at a time when in doubt.
- **fal's ElevenLabs endpoints run a violence check** (HTTP 422 `content_policy_violation`): an
  explicit beheading or wound line killed a whole take. Write the beat as implied action ("one swing
  of the sword, and..."). When a take is rejected, probe suspect sentences one by one (about $0.005
  each; rejected calls were not billed).

## Music and sound effects

- Reuse the reference's own music when copying (`ralphy-reverse`); generate only for a remake that needs new
  music.
- Music prompts name genre, tempo, instruments and mood. Artist or song names returned 400
  `bad_prompt`. Make the bed about 2 s longer than the video for the fade.
- Generated sound effects ranged from -9 to -33 LUFS and one peaked at +1.2 dBFS. Normalize before
  mixing: `ralphy tool loudness media/sfx/*.wav --target -20 --normalize`.
- Mix to the reference's loudness: `ralphy tool loudness videos/<nnn>-<slug>/render.mp4 --match refs/<slug>/source.mp4`.

## ElevenLabs direct (when the fal endpoint does not fit)

Load keys in the same command (`set -a; . ~/.config/ralphy/keys.env; set +a`) and send
`xi-api-key: $ELEVENLABS_API_KEY`.

- Text to speech: `POST https://api.elevenlabs.io/v1/text-to-speech/<voice_id>` with JSON
  `{"text", "model_id"}`; save the audio under `media/`.
- Speech to text: `POST https://api.elevenlabs.io/v1/speech-to-text`, multipart `model_id=scribe_v1`,
  `file=@take.mp3`, `timestamps_granularity=word`, `language_code=ru`.
- Music: `POST https://api.elevenlabs.io/v1/music`. Sound effects:
  `POST https://api.elevenlabs.io/v1/sound-generation` with `text` and `duration_seconds`.

Check the current request fields in ElevenLabs' API reference before the first call; price it first.
