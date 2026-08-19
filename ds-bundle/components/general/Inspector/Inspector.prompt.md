Inspector from ralphy-desktop. Use via `window.RalphyDesktop.Inspector` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### GeneratedArtifact

```jsx
() => (
  <Column>
    <Inspector
      item={heroImage}
      project={projects[0]}
      annotation={shortlisted}
      onChange={noop}
      onTrash={noop}
      onOpen={noop}
    />
  </Column>
);

// Without onOpen the preview stage is omitted and the panel starts at the file
// identity row.
```

### WithoutPreview

```jsx
() => (
  <Column>
    <Inspector
      item={heroImage}
      project={projects[0]}
      annotation={needsWork}
      previewEnabled={false}
      onChange={noop}
      onTrash={noop}
    />
  </Column>
);

// A lifecycle document has no generation attribution, so the properties list
// stops after Modified.
```

### LifecycleDocument

```jsx
() => (
  <Column>
    <Inspector
      item={briefDoc}
      project={projects[0]}
      onChange={noop}
      onTrash={noop}
      onOpen={noop}
    />
  </Column>
)
```

## Related

`InspectorPreview`
