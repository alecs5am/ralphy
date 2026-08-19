AssetTile from ralphy-desktop. Use via `window.RalphyDesktop.AssetTile` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Unreviewed

```jsx
() => (
  <div style={row}>
    <AssetTile
      item={heroImage}
      selected={false}
      onSelect={noop}
      onOpen={noop}
      onChange={noop}
      onTrash={noop}
    />
  </div>
)
```

### Selected

```jsx
() => (
  <div style={row}>
    <AssetTile
      item={finalRender}
      annotation={approved}
      selected
      onSelect={noop}
      onOpen={noop}
      onChange={noop}
      onTrash={noop}
    />
  </div>
)
```

### ReviewStates

```jsx
() => (
  <div style={{ ...row, "--cols": 3, "--w": "656px" } as CSSProperties}>
    <AssetTile
      item={heroImage}
      annotation={shortlisted}
      selected={false}
      onSelect={noop}
      onOpen={noop}
      onChange={noop}
      onTrash={noop}
    />
    <AssetTile
      item={referenceImage}
      annotation={needsWork}
      selected={false}
      onSelect={noop}
      onOpen={noop}
      onChange={noop}
      onTrash={noop}
    />
    <AssetTile
      item={finalRender}
      annotation={approved}
      selected={false}
      onSelect={noop}
      onOpen={noop}
      onChange={noop}
      onTrash={noop}
    />
  </div>
)
```

### Kinds

```jsx
() => (
  <div style={{ ...row, "--cols": 3, "--w": "656px" } as CSSProperties}>
    <AssetTile
      item={finalRender}
      selected={false}
      onSelect={noop}
      onOpen={noop}
      onChange={noop}
      onTrash={noop}
    />
    <AssetTile
      item={voiceTrack}
      selected={false}
      onSelect={noop}
      onOpen={noop}
      onChange={noop}
      onTrash={noop}
    />
    <AssetTile
      item={briefDoc}
      selected={false}
      onSelect={noop}
      onOpen={noop}
      onChange={noop}
      onTrash={noop}
    />
  </div>
)
```
