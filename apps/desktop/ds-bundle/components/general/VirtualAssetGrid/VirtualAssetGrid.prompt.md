VirtualAssetGrid from ralphy-desktop. Use via `window.RalphyDesktop.VirtualAssetGrid` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Ungrouped

```jsx
() => (
  <Stage>
    <VirtualAssetGrid
      groups={[{ key: "all", label: "", items }]}
      annotations={annotations}
      targetTileWidth={200}
      selectedId={heroImage.id}
      onSelect={noop}
      onOpen={noop}
      onChange={noop}
      onTrash={noop}
    />
  </Stage>
);

// Grouping by Ralphy entity adds the sticky section headings with counts.
```

### GroupedByEntity

```jsx
() => (
  <Stage>
    <VirtualAssetGrid
      groups={[
        { key: "final-render", label: "Final renders", items: items.filter((i) => i.entity === "final-render") },
        { key: "generated-artifact", label: "Generated artifacts", items: items.filter((i) => i.entity === "generated-artifact") },
        { key: "reference", label: "References", items: items.filter((i) => i.entity === "reference") },
      ]}
      annotations={annotations}
      targetTileWidth={200}
      selectedId={null}
      onSelect={noop}
      onOpen={noop}
      onChange={noop}
      onTrash={noop}
    />
  </Stage>
);

// A larger target tile width yields fewer, bigger columns.
```

### LargeTiles

```jsx
() => (
  <Stage>
    <VirtualAssetGrid
      groups={[{ key: "all", label: "", items: items.slice(0, 6) }]}
      annotations={annotations}
      targetTileWidth={320}
      selectedId={null}
      onSelect={noop}
      onOpen={noop}
      onChange={noop}
      onTrash={noop}
    />
  </Stage>
)
```
