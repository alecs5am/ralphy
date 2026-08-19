AssetViewer from ralphy-desktop. Use via `window.RalphyDesktop.AssetViewer` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Document

```jsx
() => (
  <Screen>
    <AssetViewer
      item={briefDoc}
      project={projects[0]}
      annotation={shortlisted}
      canPrevious
      canNext
      onBack={noop}
      onPrevious={noop}
      onNext={noop}
      onChange={noop}
      onTrash={noop}
    />
  </Screen>
);

// First item in the set: the previous control is disabled.
```

### AudioTakeAtStart

```jsx
() => (
  <Screen>
    <AssetViewer
      item={voiceTrack}
      project={projects[0]}
      annotation={needsWork}
      canPrevious={false}
      canNext
      onBack={noop}
      onPrevious={noop}
      onNext={noop}
      onChange={noop}
      onTrash={noop}
    />
  </Screen>
)
```
