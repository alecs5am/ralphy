AssetContent from ralphy-desktop. Use via `window.RalphyDesktop.AssetContent` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### MarkdownDocument

```jsx
() => (
  <Stage>
    <AssetContent item={briefDoc} />
  </Stage>
);

// The inspector variant caps the read size and tightens the type.
```

### InspectorVariant

```jsx
() => (
  <Stage width={320} height={220}>
    <AssetContent item={briefDoc} variant="inspector" />
  </Stage>
);

// Non-markdown text falls through to the plain monospace view.
```

### PlainText

```jsx
() => (
  <Stage>
    <AssetContent item={item("production-plan.json", "lifecycle-document", "text", 12_480)} />
  </Stage>
)
```
