# Remotion playbook

**Read this when:** writing or modifying Remotion code (compositions, components, ffmpeg post-processing) — this is the domain-specific reference manual.

## Sub-docs (read on demand)

Read individual rule files for detailed explanations and code examples:

### Captions / subtitles
- [remotion/subtitles.md](remotion/subtitles.md) — captions/subtitles fundamentals
- [remotion/display-captions.md](remotion/display-captions.md) — rendering caption components
- [remotion/import-srt-captions.md](remotion/import-srt-captions.md) — importing SRT files

### Audio
- [remotion/audio.md](remotion/audio.md) — using audio and sound — importing, trimming, volume, speed, pitch
- [remotion/audio-visualization.md](remotion/audio-visualization.md) — spectrum bars, waveforms, bass-reactive effects
- [remotion/sfx.md](remotion/sfx.md) — sound effects
- [remotion/voiceover.md](remotion/voiceover.md) — adding AI-generated voiceover via ElevenLabs TTS
- [remotion/get-audio-duration.md](remotion/get-audio-duration.md) — getting audio duration with Mediabunny

### Video
- [remotion/videos.md](remotion/videos.md) — embedding videos — trimming, volume, speed, looping, pitch
- [remotion/get-video-duration.md](remotion/get-video-duration.md) — duration via Mediabunny
- [remotion/get-video-dimensions.md](remotion/get-video-dimensions.md) — width/height via Mediabunny
- [remotion/extract-frames.md](remotion/extract-frames.md) — frame extraction at timestamps via Mediabunny
- [remotion/can-decode.md](remotion/can-decode.md) — check decodability via Mediabunny
- [remotion/transparent-videos.md](remotion/transparent-videos.md) — rendering with transparency
- [remotion/trimming.md](remotion/trimming.md) — cut beginning/end of animations

### FFmpeg
- [remotion/ffmpeg.md](remotion/ffmpeg.md) — trimming, silence detection, ad-hoc ffmpeg

### Images / assets
- [remotion/images.md](remotion/images.md) — embedding images via `<Img>`
- [remotion/assets.md](remotion/assets.md) — importing images/videos/audio/fonts
- [remotion/gifs.md](remotion/gifs.md) — GIFs synced with the timeline
- [remotion/lottie.md](remotion/lottie.md) — embedding Lottie animations
- [remotion/light-leaks.md](remotion/light-leaks.md) — overlay effects via `@remotion/light-leaks`
- [remotion/maps.md](remotion/maps.md) — Mapbox + animation

### Composition / structure
- [remotion/compositions.md](remotion/compositions.md) — defining compositions, stills, folders, default props, dynamic metadata
- [remotion/calculate-metadata.md](remotion/calculate-metadata.md) — dynamic duration/dimensions/props
- [remotion/parameters.md](remotion/parameters.md) — Zod schemas for parameterizable videos
- [remotion/sequencing.md](remotion/sequencing.md) — delay, trim, limit duration of items
- [remotion/transitions.md](remotion/transitions.md) — scene transition patterns

### Animation
- [remotion/animations.md](remotion/animations.md) — fundamentals
- [remotion/timing.md](remotion/timing.md) — interpolation, easing, springs
- [remotion/text-animations.md](remotion/text-animations.md) — typography + text animation
- [remotion/measuring-text.md](remotion/measuring-text.md) — text dimensions, fitting, overflow
- [remotion/measuring-dom-nodes.md](remotion/measuring-dom-nodes.md) — DOM element dimensions

### Specialized
- [remotion/3d.md](remotion/3d.md) — 3D content via Three.js + React Three Fiber
- [remotion/charts.md](remotion/charts.md) — bar, pie, line, stock charts
- [remotion/tailwind.md](remotion/tailwind.md) — TailwindCSS in Remotion
- [remotion/fonts.md](remotion/fonts.md) — Google Fonts and local fonts
