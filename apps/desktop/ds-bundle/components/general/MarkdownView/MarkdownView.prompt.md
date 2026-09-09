MarkdownView from ralphy-desktop. Use via `window.RalphyDesktop.MarkdownView` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Brief

```jsx
() => (
  <Sheet>
    <MarkdownView markdown={brief} />
  </Sheet>
)
```

### ChecklistAndTable

```jsx
() => (
  <Sheet>
    <MarkdownView markdown={changelog} />
  </Sheet>
)
```

### CodeAndInline

```jsx
() => (
  <Sheet>
    <MarkdownView markdown={code} />
  </Sheet>
)
```
