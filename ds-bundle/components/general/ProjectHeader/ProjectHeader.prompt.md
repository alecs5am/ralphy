ProjectHeader from ralphy-desktop. Use via `window.RalphyDesktop.ProjectHeader` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### InProduction

```jsx
() => (
  <Frame>
    <ProjectHeader
      project={inProduction}
      scan={null}
      loading={false}
      copyState="idle"
      onCopyForAgent={noop}
    />
  </Frame>
);

// The status strip reads differently once a final render is ready.
```

### ReadyForDelivery

```jsx
() => (
  <Frame>
    <ProjectHeader
      project={delivered}
      scan={null}
      loading={false}
      copyState="copied"
      onCopyForAgent={noop}
    />
  </Frame>
)
```

### Indexing

```jsx
() => (
  <Frame>
    <ProjectHeader
      project={preflight}
      scan={null}
      loading
      copyState="idle"
      onCopyForAgent={noop}
    />
  </Frame>
)
```

### CopyFailed

```jsx
() => (
  <Frame>
    <ProjectHeader
      project={inProduction}
      scan={null}
      loading={false}
      copyState="failed"
      onCopyForAgent={noop}
    />
  </Frame>
)
```
