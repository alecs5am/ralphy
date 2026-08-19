SnappySlider from ralphy-desktop. Use via `window.RalphyDesktop.SnappySlider` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Volume

```jsx
() => (
  <Row label="volume — 0.72">
    <SnappySlider
      value={0.72}
      min={0}
      max={1}
      step={0.01}
      ariaLabel="Volume"
      onValueChange={noop}
    />
  </Row>
)
```

### Scrubber

```jsx
() => (
  <Row label="playhead — 00:07 / 00:15">
    <SnappySlider
      value={7.4}
      min={0}
      max={15}
      step={0.1}
      ariaLabel="Playhead"
      onValueChange={noop}
    />
  </Row>
)
```

### WithSnapMarks

```jsx
() => (
  <Row label="zoom — snap marks at 25 / 50 / 100 / 200 / 400 %">
    <SnappySlider
      value={100}
      min={25}
      max={400}
      step={5}
      defaultValue={100}
      values={[25, 50, 100, 200, 400]}
      ariaLabel="Zoom"
      onValueChange={noop}
    />
  </Row>
)
```

### Disabled

```jsx
() => (
  <Row label="playback rate — disabled">
    <SnappySlider
      value={1}
      min={0.25}
      max={2}
      step={0.25}
      ariaLabel="Playback rate"
      disabled
      onValueChange={noop}
    />
  </Row>
)
```
