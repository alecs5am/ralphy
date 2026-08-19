WelcomeScreen from ralphy-desktop. Use via `window.RalphyDesktop.WelcomeScreen` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Restoring

```jsx
() => (
  <Stage>
    <WelcomeScreen exiting={false} restoring />
  </Stage>
);

// All three checks complete — the state just before the workbench takes over.
```

### Ready

```jsx
() => (
  <Stage>
    <WelcomeScreen exiting={false} restoring={false} />
  </Stage>
);

// No `exiting` cell: that state is `opacity: 0` by stylesheet — a correct
// render of it is an empty card, so it is documented rather than shown.
```
