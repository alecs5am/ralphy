ImageViewport from ralphy-desktop. Use via `window.RalphyDesktop.ImageViewport` (bundle loaded from the root `_ds_bundle.js`). Wrap the tree in `<PreviewCanvas>` (full provider chain in README.md — components read theme/i18n from that context).

## Examples

### Viewer

```jsx
() => (
  <Stage>
    <ImageViewport src={still("scene-01-hook.png", "#6d5ce7", "#2a2350")} name="scene-01-hook.png" />
  </Stage>
);

// The inspector variant drops the zoom chrome down to the compact scale.
```

### Compact

```jsx
() => (
  <div style={{ width: 320, height: 200, display: "grid", overflow: "hidden", borderRadius: "var(--radius-lg)", background: "var(--sunken)" }}>
    <ImageViewport
      src={still("grinder-front.jpg", "#8a5a3b", "#2b1c14")}
      name="grinder-front.jpg"
      compact
    />
  </div>
);

// A portrait 9:16 frame — the aspect most Ralphy deliverables ship in.
```

### PortraitFrame

```jsx
() => (
  <Stage>
    <ImageViewport
      src={`data:image/svg+xml;utf8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1600" viewBox="0 0 90 160">
           <rect width="90" height="160" fill="#1d2b24"/>
           <rect x="0" y="112" width="90" height="48" fill="#0f1a15"/>
           <circle cx="45" cy="62" r="26" fill="#7cb994" opacity="0.35"/>
           <text x="8" y="18" font-family="monospace" font-size="5" fill="#ffffff" opacity="0.7">final.mp4 · 9:16</text>
         </svg>`,
      )}`}
      name="final-frame.png"
    />
  </Stage>
)
```
