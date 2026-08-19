RalphyMascot from ralphy-desktop. Use via `window.RalphyDesktop.RalphyMascot` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Sizes

```jsx
() => (
  <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "flex-end" }}>
    {[24, 32, 46, 64].map((size) => (
      <span key={size} style={{ display: "grid", gap: "var(--space-2)", justifyItems: "center" }}>
        <RalphyMascot size={size} />
        <Caption>{size}px</Caption>
      </span>
    ))}
  </div>
);

// The About row in Settings — the mascot's canonical placement.
```

### AboutRow

```jsx
() => (
  <div className="settings-about" style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
    <span className="settings-about-mark">
      <RalphyMascot size={46} />
    </span>
    <span style={{ display: "grid", gap: 2 }}>
      <strong style={{ font: `var(--text-base)/var(--leading-tight) var(--font-sans)` }}>
        Ralphy Media 0.1.0
      </strong>
      <Caption>Native-speed review workbench for generated media.</Caption>
    </span>
  </div>
);

// The empty-terminal placement, where the mark carries a drop shadow.
```

### EmptyState

```jsx
() => (
  <div
    style={{
      display: "grid",
      gap: "var(--space-3)",
      justifyItems: "center",
      width: 320,
      padding: "var(--space-7) var(--space-4)",
      borderRadius: "var(--radius-lg)",
      background: "var(--sunken)",
    }}
  >
    <span className="terminal-empty-mark">
      <RalphyMascot size={56} />
    </span>
    <Caption>No terminal sessions yet</Caption>
  </div>
)
```
