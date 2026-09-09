ProfileAvatar from ralphy-desktop. Use via `window.RalphyDesktop.ProfileAvatar` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Default

```jsx
() => (
  <Row>
    <ProfileAvatar rootPath={ROOT} />
  </Row>
)
```

### Sizes

```jsx
() => (
  <Row>
    <ProfileAvatar rootPath={ROOT} size={20} />
    <ProfileAvatar rootPath={ROOT} size={26} />
    <ProfileAvatar rootPath={ROOT} size={36} />
    <ProfileAvatar rootPath={ROOT} size={56} />
  </Row>
);

// The pattern is derived from the library root path, so every account gets a
// stable, distinct mark without an uploaded picture.
```

### DerivedFromLibraryPath

```jsx
() => (
  <Row>
    {["/Users/creator", "/Users/studio-ops", "/Users/dana", "/Volumes/Shared/ralphy"].map(
      (path) => (
        <span key={path} style={{ display: "grid", gap: "var(--space-2)", justifyItems: "center" }}>
          <ProfileAvatar rootPath={`${path}/Movies/ralphy`} size={36} />
          <small
            style={{
              font: `var(--text-xs)/var(--leading-tight) var(--font-mono)`,
              color: "var(--fg-3)",
            }}
          >
            {path}
          </small>
        </span>
      ),
    )}
  </Row>
)
```
