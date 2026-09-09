ProjectScreen from ralphy-desktop. Use via `window.RalphyDesktop.ProjectScreen` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Indexed

```jsx
() => (
  <Screen>
    <ProjectScreen
      project={projects[0]}
      scan={scan}
      annotations={annotations}
      loading={false}
      includeIntermediate={false}
      onIncludeIntermediateChange={noop}
      onOpenAsset={noop}
      onChangeAsset={noop}
      onTrashAsset={noop}
    />
  </Screen>
);

// The first pass over a project, while the scan is still running.
```

### Indexing

```jsx
() => (
  <Screen>
    <ProjectScreen
      project={projects[2]}
      scan={null}
      annotations={{}}
      loading
      includeIntermediate={false}
      onIncludeIntermediateChange={noop}
      onOpenAsset={noop}
      onChangeAsset={noop}
      onTrashAsset={noop}
    />
  </Screen>
)
```
