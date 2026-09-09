VideoPlayer from ralphy-desktop. Use via `window.RalphyDesktop.VideoPlayer` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Viewer

```jsx
() => (
  <Stage>
    <VideoPlayer src={CLIP_MP4} name="final.mp4" />
  </Stage>
);

// The inspector variant: same transport, reduced chrome.
```

### Compact

```jsx
() => (
  <Stage width={340} height={190}>
    <VideoPlayer src={CLIP_MP4} name="scene-01-hook.mp4" compact />
  </Stage>
);

// Unresolvable source — the state the app shows when a file moved or the
// helper cannot decode it.
```

### Unplayable

```jsx
() => (
  <Stage width={340} height={190}>
    <VideoPlayer src="/render/missing.mp4" name="missing.mp4" />
  </Stage>
)
```
