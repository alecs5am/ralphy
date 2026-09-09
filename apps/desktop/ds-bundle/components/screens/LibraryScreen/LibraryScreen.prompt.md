LibraryScreen from ralphy-desktop. Use via `window.RalphyDesktop.LibraryScreen` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Populated

```jsx
() => (
  <Screen>
    <LibraryScreen
      catalog={catalog}
      pinnedWorkspaceIds={["launch-studio"]}
      onChooseLibrary={noop}
      onOpenWorkspace={noop}
      onOpenProject={noop}
    />
  </Screen>
);

// No library open yet — wordmark, explanation and the primary action.
```

### EmptyLibrary

```jsx
() => (
  <Screen>
    <LibraryScreen
      catalog={null}
      pinnedWorkspaceIds={[]}
      onChooseLibrary={noop}
      onOpenWorkspace={noop}
      onOpenProject={noop}
    />
  </Screen>
)
```
