TerminalWorkspace from ralphy-desktop. Use via `window.RalphyDesktop.TerminalWorkspace` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Visible

```jsx
() => (
  <Stage>
    <TerminalWorkspace visible rootPath={ROOT} />
  </Stage>
);

// Without a library root the workspace cannot open a shell and says so.
```

### NoLibrary

```jsx
() => (
  <Stage height={200}>
    <TerminalWorkspace visible rootPath={null} />
  </Stage>
)
```
