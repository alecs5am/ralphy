ResizeHandle from ralphy-desktop. Use via `window.RalphyDesktop.ResizeHandle` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### ColumnSplit

```jsx
() => (
  <>
    <Scaffold />
    <div className="ds-split" style={{ width: 420 }}>
      <div className="ds-pane ds-pane-a">Sidebar</div>
      <div className="ds-pane ds-pane-b">Workbench</div>
      <ResizeHandle
        ariaLabel="Resize sidebar"
        orientation="vertical"
        className="ds-col-handle"
        value={288}
        min={220}
        max={420}
        defaultValue={288}
        direction={1}
        onChange={noop}
        onActiveChange={noop}
      />
    </div>
  </>
)
```

### RowSplit

```jsx
() => (
  <>
    <Scaffold />
    <div className="ds-stack" style={{ width: 420 }}>
      <div className="ds-pane ds-pane-b" style={{ flex: 1 }}>Asset grid</div>
      <ResizeHandle
        ariaLabel="Resize bottom panel"
        orientation="horizontal"
        className="ds-row-handle"
        value={220}
        min={120}
        max={420}
        defaultValue={220}
        direction={-1}
        onChange={noop}
        onActiveChange={noop}
      />
      <div className="ds-pane ds-pane-a" style={{ width: "100%", height: 64 }}>
        Bottom panel
      </div>
    </div>
  </>
)
```

### HoverAffordance

```jsx
() => (
  <>
    <Scaffold />
    <div className="ds-split ds-hovered" style={{ width: 420 }}>
      <div className="ds-pane ds-pane-a">Sidebar</div>
      <div className="ds-pane ds-pane-b">Workbench — pointer over the divider</div>
      <ResizeHandle
        ariaLabel="Resize sidebar"
        orientation="vertical"
        className="ds-col-handle"
        value={288}
        min={220}
        max={420}
        defaultValue={288}
        direction={1}
        onChange={noop}
        onActiveChange={noop}
      />
    </div>
  </>
)
```
