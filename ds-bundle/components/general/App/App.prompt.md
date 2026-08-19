App from ralphy-desktop. Use via `window.RalphyDesktop.App` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Shell

```jsx
() => (
  <div
    style={{
      width: 880,
      height: 560,
      display: "grid",
      overflow: "hidden",
      borderRadius: "var(--radius-lg)",
      background: "var(--canvas)",
      boxShadow: "var(--shadow-window)",
    }}
  >
    <App />
  </div>
)
```
