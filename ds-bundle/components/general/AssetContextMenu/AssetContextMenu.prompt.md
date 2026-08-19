AssetContextMenu from ralphy-desktop. Use via `window.RalphyDesktop.AssetContextMenu` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Menu

```jsx
() => (
  <AssetContextMenu
    item={heroImage}
    annotation={shortlisted}
    x={20}
    y={20}
    onClose={noop}
    onOpen={noop}
    onChange={noop}
    onTrash={noop}
  />
)
```
