ReviewControls from ralphy-desktop. Use via `window.RalphyDesktop.ReviewControls` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Empty

```jsx
() => (
  <Column>
    <ReviewControls onChange={noop} />
  </Column>
)
```

### Shortlisted

```jsx
() => (
  <Column>
    <ReviewControls annotation={shortlisted} onChange={noop} />
  </Column>
)
```

### NeedsWork

```jsx
() => (
  <Column>
    <ReviewControls annotation={needsWork} onChange={noop} />
  </Column>
)
```

### Approved

```jsx
() => (
  <Column>
    <ReviewControls annotation={approved} onChange={noop} />
  </Column>
)
```
