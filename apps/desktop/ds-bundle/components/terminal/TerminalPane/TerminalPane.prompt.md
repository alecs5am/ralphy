TerminalPane from ralphy-desktop. Use via `window.RalphyDesktop.TerminalPane` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### SingleSession

```jsx
() => (
  <Stage>
    <TerminalPane
      {...shared}
      leaf={{ kind: "leaf", id: "terminal-root", tabs: ["s1"], activeId: "s1" }}
      sessions={{ s1: { id: "s1", title: "coffee-grinder-001", status: "running" } }}
    />
  </Stage>
)
```

### MultipleTabs

```jsx
() => (
  <Stage>
    <TerminalPane
      {...shared}
      leaf={{ kind: "leaf", id: "terminal-root", tabs: ["s1", "s2", "s3"], activeId: "s2" }}
      sessions={{
        s1: { id: "s1", title: "coffee-grinder-001", status: "running" },
        s2: { id: "s2", title: "ralphy render", status: "running" },
        s3: { id: "s3", title: "logs", status: "exited" },
      }}
    />
  </Stage>
);

// No sessions yet — the pane offers its create affordance.
```

### Empty

```jsx
() => (
  <Stage>
    <TerminalPane
      {...shared}
      leaf={{ kind: "leaf", id: "terminal-root", tabs: [], activeId: null }}
      sessions={{}}
    />
  </Stage>
)
```
