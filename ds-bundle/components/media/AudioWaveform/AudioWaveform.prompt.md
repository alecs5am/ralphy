AudioWaveform from ralphy-desktop. Use via `window.RalphyDesktop.AudioWaveform` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Viewer

```jsx
() => (
  <Stage>
    <AudioWaveform
      src={TAKE_MP3}
      path={voiceTrack.absolutePath}
      name={voiceTrack.name}
      sizeBytes={voiceTrack.sizeBytes}
    />
  </Stage>
)
```

### Compact

```jsx
() => (
  <Stage width={340} height={150}>
    <AudioWaveform
      src={TAKE_MP3}
      path={voiceTrack.absolutePath}
      name={voiceTrack.name}
      sizeBytes={voiceTrack.sizeBytes}
      compact
    />
  </Stage>
);

// A music bed rather than a voice take — a different name seeds a different
// bar pattern, which is what the component guarantees.
```

### MusicBed

```jsx
() => (
  <Stage>
    <AudioWaveform
      src={TAKE_MP3}
      path="/library/beds/warm-kitchen-loop.mp3"
      name="warm-kitchen-loop.mp3"
      sizeBytes={6_240_000}
    />
  </Stage>
)
```
