WorkspacePicker from ralphy-desktop. Use via `window.RalphyDesktop.WorkspacePicker` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Selected

```jsx
() => (
  <Column>
    <WorkspacePicker value="launch-studio" workspaces={workspaces} onValueChange={noop} />
  </Column>
);

// A different workspace produces a different initials mark and dither tint.
```

### ArchiveWorkspace

```jsx
() => (
  <Column>
    <WorkspacePicker value="archive" workspaces={workspaces} onValueChange={noop} />
  </Column>
);

// Nothing selected yet — the trigger falls back to its empty label.
```

### NoSelection

```jsx
() => (
  <Column>
    <WorkspacePicker value="" workspaces={workspaces} onValueChange={noop} />
  </Column>
)
```
