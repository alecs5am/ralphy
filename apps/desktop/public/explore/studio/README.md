# Ralphy studio examples

This directory contains first-party test material for the desktop Explore library.
It is not a trends feed, and the sounds are not commercial recordings.

- Eight thematic PNG illustrations were generated for this library with image generation.
- `visual-*.svg` are complete reusable native SVG components. Their exact source is
  included in the library's agent attachment, not merely a thumbnail.
- `sound-*.wav` are original procedural mono PCM sounds, synthesized at 22,050 Hz.
  They contain no sampled recordings, third-party music or impersonated voice.
- `sound-*.svg` are corresponding original cover designs.
- `ghost-intercom.wav` transforms the original synthetic harmonic vowel study in
  `../voice-source.mp3`; it does not contain human speech.

Rebuild the SVG components, covers and eight sound examples from the desktop package:

```sh
python3 scripts/generate-studio-assets.py
```

Rebuild the intercom comparison:

```sh
ffmpeg -i public/explore/voice-source.mp3 \
  -af 'highpass=f=550,lowpass=f=2400,aecho=0.8:0.65:41|83:0.28|0.16,alimiter=limit=0.8' \
  public/explore/studio/ghost-intercom.wav
```

The eight sounds deliberately cover distinct preview tasks: a beat, ambient pad,
notification, cinematic impact, ticking rhythm, arpeggio, transition and room tone.
These short examples are reusable test assets; they do not claim chart rank or
platform popularity. Templates, prompts and effects are authored instructions
embedded with the application, independent of the remote public library.

## Design references

The redesign applied the installed `design-taste-frontend` skill while keeping the
existing desktop tokens and compact spacing. Inspo's hosted MCP `recommend` tool
was queried with a catalogue brief: square media previews, inline audio waveform
rows and side-by-side effect comparisons. Its editorial catalogue / split-studio
composition informed the card and detail layouts; landing-page spacing was not
adopted in this desktop workspace.

- https://inspomcp.dev/mcp — hosted MCP research, 2026-09-18.
- https://21st.dev/community/components/ruixen.ui/waveform-player — waveform seeking
  and progress-overlay reference. The registry endpoint returned HTTP 403, so no
  source was imported; playback uses the app's existing slider and native audio.
- https://www.tasteskill.dev/ — design method; installed skill read locally.

## Generated photographic sources

Generated with the built-in image tool on 2026-09-18. Each prompt requested a single
square, edge-to-edge photograph without UI, borders, watermarks or typography.
All are clean source scenes; the application applies the displayed effects live.

| File | Art direction |
| --- | --- |
| horror-corridor.png | Abandoned motel corridor, door 13 ajar, worn green walls, tungsten lights, daylight and restrained haze. Clean source before VHS. |
| night-city.png | Tokyo side street, transparent umbrella, cyan and magenta reflections in rain, layered urban depth. Clean source before channel separation. |
| editorial-portrait.png | Full-color 1940s railway-cafe detective portrait, camel trench coat, brass, teal and window light. Color retained for noir comparison. |
| chrome-product.png | Sculptural chrome headphones on graphite, lemon backdrop and orange accent, sharp studio reflections. Clean source before CRT. |
| desert-racer.png | Red rally car in a desert canyon, angular rock, ochre sand, blue sky and dust. Photographic source before retro dither. |
| botanical-study.png | Emerald monstera, tiny glass vase, orange poppy, pale gallery background and daylight. |
| mountain-story.png | Hiker in orange by an alpine lake, snow-covered mountains, blue hour and warm dawn on the peaks. |
| fashion-editorial.png | Yellow tailoring and blue trousers in a terracotta courtyard with cobalt door; clean fashion photography before grain. |
