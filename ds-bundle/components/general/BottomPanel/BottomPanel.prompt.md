BottomPanel from ralphy-desktop. Use via `window.RalphyDesktop.BottomPanel` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Open

```jsx
() => (
  <Stage>
    <BottomPanel height={260} visible rootPath={ROOT} />
  </Stage>
);

// A shorter drawer — the height prop is what the resize handle drives.
```

### Compact

```jsx
() => (
  <Stage>
    <BottomPanel height={150} visible rootPath={ROOT} />
  </Stage>
);

// No `collapsed` cell: hidden means height 0, which is an empty card by
// definition.
```
