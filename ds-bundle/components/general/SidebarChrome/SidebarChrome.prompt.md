SidebarChrome from ralphy-desktop. Use via `window.RalphyDesktop.SidebarChrome` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Default

```jsx
() => (
  <div
    style={{
      width: 288,
      paddingBottom: "var(--space-3)",
      borderRadius: "var(--radius-lg)",
      background: "var(--panel-solid)",
      overflow: "hidden",
    }}
  >
    <SidebarChrome
      canGoBack
      canGoForward={false}
      onBack={noop}
      onForward={noop}
      onToggleSidebar={noop}
    />
  </div>
)
```
