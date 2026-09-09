ProfileMenu from ralphy-desktop. Use via `window.RalphyDesktop.ProfileMenu` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Default

```jsx
() => (
  <Foot>
    <ProfileMenu rootPath={ROOT} onOpenSettings={noop} />
  </Foot>
);

// The identity is derived from the library path, so a shared volume reads
// differently from a user folder.
```

### SharedVolume

```jsx
() => (
  <Foot>
    <ProfileMenu rootPath="/Volumes/Studio/ralphy" onOpenSettings={noop} />
  </Foot>
)
```
