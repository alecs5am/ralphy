ContextSidebar from ralphy-desktop. Use via `window.RalphyDesktop.ContextSidebar` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### InsideAProject

```jsx
() => (
  <Column>
    <ContextSidebar
      {...shared}
      route={{ kind: "project", workspaceId: "launch-studio", projectId: "coffee-grinder-001" }}
      pinnedWorkspaceIds={["launch-studio"]}
      pinnedProjectIds={["coffee-grinder-001"]}
    />
  </Column>
);

// At the workspace level nothing is pinned, so every row shows the hollow pin.
```

### WorkspaceLevel

```jsx
() => (
  <Column>
    <ContextSidebar
      {...shared}
      route={{ kind: "workspace", workspaceId: "launch-studio" }}
      pinnedWorkspaceIds={[]}
      pinnedProjectIds={[]}
    />
  </Column>
);

// The library root, before a workspace is chosen.
```

### LibraryRoot

```jsx
() => (
  <Column>
    <ContextSidebar
      {...shared}
      route={{ kind: "library" }}
      pinnedWorkspaceIds={["launch-studio", "archive"]}
      pinnedProjectIds={["skin-set-004"]}
      canGoBack={false}
    />
  </Column>
)
```
