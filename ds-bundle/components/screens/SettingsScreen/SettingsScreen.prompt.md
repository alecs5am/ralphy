SettingsScreen from ralphy-desktop. Use via `window.RalphyDesktop.SettingsScreen` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### General

```jsx
() => (
  <Screen>
    <SettingsScreen rootPath={ROOT} onBack={noop} onChooseLibrary={noop} />
  </Screen>
);

// Without a library the General panel reports that nothing is connected yet.
```

### NoLibrary

```jsx
() => (
  <Screen>
    <SettingsScreen rootPath={null} onBack={noop} onChooseLibrary={noop} />
  </Screen>
)
```
