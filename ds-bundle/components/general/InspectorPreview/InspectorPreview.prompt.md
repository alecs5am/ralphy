InspectorPreview from ralphy-desktop. Use via `window.RalphyDesktop.InspectorPreview` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Document

```jsx
() => (
  <Column>
    <InspectorPreview item={briefDoc} onOpen={noop} />
  </Column>
);

// The stage carries a per-kind class (preview-video, preview-audio …), so the
// same component frames every media type the workbench indexes.
```

### AudioTake

```jsx
() => (
  <Column>
    <InspectorPreview
      item={item("artifacts/audio/vo-take-03.wav", "generated-artifact", "audio", 4_180_000)}
      onOpen={noop}
    />
  </Column>
)
```

### PlainTextFile

```jsx
() => (
  <Column>
    <InspectorPreview
      item={item("production-plan.json", "lifecycle-document", "text", 12_480)}
      onOpen={noop}
    />
  </Column>
)
```
