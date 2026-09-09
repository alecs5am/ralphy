WorkspaceScreen from ralphy-desktop. Use via `window.RalphyDesktop.WorkspaceScreen` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### GridView

```jsx
() => (
  <Screen>
    <WorkspaceScreen
      workspace={workspaces[0]}
      projects={projects}
      pinnedProjectIds={["coffee-grinder-001"]}
      view="grid"
      onViewChange={noop}
      onOpenProject={noop}
    />
  </Screen>
)
```

### ListView

```jsx
() => (
  <Screen>
    <WorkspaceScreen
      workspace={workspaces[0]}
      projects={projects}
      pinnedProjectIds={["coffee-grinder-001"]}
      view="list"
      onViewChange={noop}
      onOpenProject={noop}
    />
  </Screen>
);

// A workspace with nothing in it yet.
```

### EmptyWorkspace

```jsx
() => (
  <Screen>
    <WorkspaceScreen
      workspace={workspaces[1]}
      projects={[]}
      pinnedProjectIds={[]}
      view="grid"
      onViewChange={noop}
      onOpenProject={noop}
    />
  </Screen>
)
```
