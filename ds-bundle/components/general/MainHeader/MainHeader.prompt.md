MainHeader from ralphy-desktop. Use via `window.RalphyDesktop.MainHeader` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### WithSidebar

```jsx
() => (
  <Bar>
    <MainHeader
      breadcrumbs={trail}
      sidebarVisible
      canGoBack
      canGoForward={false}
      rightPanelVisible
      bottomPanelVisible={false}
      showChooseLibrary={false}
      onBack={noop}
      onForward={noop}
      onToggleSidebar={noop}
      onChooseLibrary={noop}
      onToggleRightPanel={noop}
      onToggleBottomPanel={noop}
    />
  </Bar>
);

// Sidebar hidden: the header takes over the traffic-light space and the
// back/forward controls.
```

### SidebarCollapsed

```jsx
() => (
  <Bar>
    <MainHeader
      breadcrumbs={trail}
      sidebarVisible={false}
      canGoBack
      canGoForward
      rightPanelVisible={false}
      bottomPanelVisible
      showChooseLibrary={false}
      onBack={noop}
      onForward={noop}
      onToggleSidebar={noop}
      onChooseLibrary={noop}
      onToggleRightPanel={noop}
      onToggleBottomPanel={noop}
    />
  </Bar>
);

// Library root, before a project is opened — the Choose library action shows
// and the trail is a single crumb.
```

### LibraryRoot

```jsx
() => (
  <Bar>
    <MainHeader
      breadcrumbs={[{ label: "Ralphy library" }]}
      sidebarVisible
      canGoBack={false}
      canGoForward={false}
      rightPanelVisible={false}
      bottomPanelVisible={false}
      showChooseLibrary
      onBack={noop}
      onForward={noop}
      onToggleSidebar={noop}
      onChooseLibrary={noop}
      onToggleRightPanel={noop}
      onToggleBottomPanel={noop}
    />
  </Bar>
)
```
