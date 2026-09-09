SelectMenu from ralphy-desktop. Use via `window.RalphyDesktop.SelectMenu` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### FilterChip

```jsx
() => (
  <Bar>
    <SelectMenu
      value="entity"
      className="filter-select-chip"
      prefix="Group ·"
      ariaLabel="Group files"
      onValueChange={noop}
      options={[
        { value: "none", label: "None" },
        { value: "entity", label: "Ralphy" },
        { value: "kind", label: "Type" },
        { value: "review", label: "Review" },
      ]}
    />
  </Bar>
)
```

### ControlsRow

```jsx
() => (
  <Bar>
    <SelectMenu
      value="entity"
      className="filter-select-chip"
      prefix="Group ·"
      ariaLabel="Group files"
      onValueChange={noop}
      options={[
        { value: "none", label: "None" },
        { value: "entity", label: "Ralphy" },
        { value: "kind", label: "Type" },
        { value: "review", label: "Review" },
      ]}
    />
    <SelectMenu
      value="recent"
      className="filter-select-chip"
      prefix="Sort ·"
      ariaLabel="Sort files"
      onValueChange={noop}
      options={[
        { value: "recent", label: "Recent" },
        { value: "name", label: "Name" },
        { value: "size", label: "Size" },
        { value: "cost", label: "Cost" },
        { value: "review", label: "Review" },
      ]}
    />
  </Bar>
);

// Without the chip class the trigger is a standalone control on --raised.
```

### Standalone

```jsx
() => (
  <Bar>
    <SelectMenu
      value="all"
      ariaLabel="Entity filter"
      onValueChange={noop}
      options={[
        { value: "all", label: "All assets" },
        { value: "final", label: "Final renders" },
        { value: "artifacts", label: "Generated artifacts" },
        { value: "refs", label: "References" },
      ]}
    />
    <SelectMenu
      value="9:16"
      prefix="Aspect ·"
      ariaLabel="Aspect ratio"
      onValueChange={noop}
      options={[
        { value: "9:16", label: "9:16" },
        { value: "4:5", label: "4:5" },
        { value: "1:1", label: "1:1" },
        { value: "16:9", label: "16:9" },
      ]}
    />
  </Bar>
)
```
