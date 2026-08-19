ProjectControls from ralphy-desktop. Use via `window.RalphyDesktop.ProjectControls` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Overview

```jsx
() => (
  <Bar>
    <ProjectControls
      query={query}
      itemCount={13}
      kindCounts={kindCounts}
      gridSize={220}
      onChange={noop}
      onGridSizeChange={noop}
    />
  </Bar>
);

// Filters engaged: a mode, two kinds, a review status and a search term. The
// reset affordance appears once the query differs from the default.
```

### Filtered

```jsx
() => (
  <Bar>
    <ProjectControls
      query={{
        ...query,
        mode: "assets",
        search: "scene-01",
        kinds: ["image", "video"],
        reviewStatuses: ["Shortlist"],
        groupBy: "entity",
        sortBy: "cost",
      }}
      itemCount={4}
      kindCounts={kindCounts}
      gridSize={260}
      onChange={noop}
      onGridSizeChange={noop}
    />
  </Bar>
);

// Narrow column — the container query collapses the bar onto fewer rows.
```

### Narrow

```jsx
() => (
  <Bar width={460}>
    <ProjectControls
      query={{ ...query, mode: "finals" }}
      itemCount={1}
      kindCounts={kindCounts}
      gridSize={180}
      onChange={noop}
      onGridSizeChange={noop}
    />
  </Bar>
)
```
