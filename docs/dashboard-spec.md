# ralph dashboard — Specification

## Concept

A single-page React dashboard for browsing every project entity in real time. A media viewer with a collage mode and auto-update when new files appear.

Launch:
```bash
ralph dashboard                  # Opens http://localhost:4321
ralph dashboard --port 8080      # Custom port
ralph dashboard --open            # Auto-open in browser
```

Or via npm:
```bash
npm run dashboard
```

---

## Architecture

```
Browser (React SPA)
  ↕ WebSocket (real-time file events)
  ↕ REST API (read entities, serve media)
Server (Node.js, single process)
  ← chokidar (watch workspace/)
  ← fs (read registry, JSON files, media)
```

Everything in one process: Vite dev server + API routes + WebSocket + file watcher.

---

## File layout

```
dashboard/
├── server/
│   ├── index.ts              # Entry point — start the server
│   ├── api.ts                # REST API routes
│   ├── watcher.ts            # chokidar + WebSocket broadcaster
│   └── media.ts              # Streams media files (images, video, audio)
├── src/
│   ├── main.tsx              # React entry
│   ├── App.tsx               # Layout: sidebar + workspace area
│   ├── stores/
│   │   └── workspace.ts      # Zustand store — every entity + WebSocket sync
│   ├── components/
│   │   ├── Sidebar.tsx        # Resource navigation
│   │   ├── TabBar.tsx         # Open tabs
│   │   ├── Panel.tsx          # One panel inside the collage
│   │   ├── SplitView.tsx      # Collage manager (grid/split)
│   │   ├── MediaPlayer.tsx    # Universal player (img/video/audio)
│   │   ├── JsonViewer.tsx     # Pretty JSON view (scenario, prompts, etc.)
│   │   └── StatusBadge.tsx    # Status badge (draft, rendering, done...)
│   ├── views/
│   │   ├── ProjectsView.tsx   # Project list
│   │   ├── ProjectDetail.tsx  # One project: scenario + assets + render
│   │   ├── BrandsView.tsx     # Brands: design tokens, screenshots, palettes
│   │   ├── PersonasView.tsx   # Personas: voice preview, style
│   │   ├── RefsView.tsx       # References: screenshots, blueprints
│   │   ├── BatchesView.tsx    # Batches: progress bar, per-project status
│   │   ├── AssetsGallery.tsx  # Asset gallery (grid, type filters)
│   │   └── TemplatesView.tsx  # Templates
│   └── hooks/
│       ├── useWebSocket.ts    # WS connection, auto-reconnect
│       └── useMediaUrl.ts     # Build media URLs through the API
├── index.html
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## UI Layout

```
┌──────────────────────────────────────────────────────────┐
│  ralph dashboard                               [port 4321] │
├────────┬─────────────────────────────────────────────────┤
│        │ [Tab 1: Project spring-001] [Tab 2: Assets] [+] │
│ SIDEBAR│─────────────────────────────────────────────────│
│        │                                                 │
│ Search │   ┌─────────────────┬─────────────────┐        │
│ ─────  │   │                 │                 │        │
│        │   │   Panel 1       │   Panel 2       │        │
│ Projects│   │   (Video)       │   (Scenario)    │        │
│ Brands │   │                 │                 │        │
│ Personas│   │                 │                 │        │
│ Refs   │   ├─────────────────┼─────────────────┤        │
│ Templates│  │                 │                 │        │
│ Batches│   │   Panel 3       │   Panel 4       │        │
│ Assets │   │   (Images grid) │   (Audio)       │        │
│        │   │                 │                 │        │
│ ─────  │   └─────────────────┴─────────────────┘        │
│ Workspace│                                               │
│  Stats │                                                 │
│        │                                   [1x1][2x2][3x3]│
└────────┴─────────────────────────────────────────────────┘
```

### Sidebar (left panel)

- Fuzzy search across every entity
- Sections: Projects, Brands, Personas, Refs, Templates, Batches
- Each section expands and shows a list with status icons
- Bottom: Workspace stats (disk usage, counts)
- Click an entity → opens in a new tab or replaces the active one

### Tab Bar (top of the work area)

- Tabs as in an IDE — every open resource = a tab
- Closeable, draggable
- Duplicate a tab (for comparison)
- Up to ~10 tabs, then it scrolls

### Split / Collage View

- Buttons in the bottom-right corner: `[1x1]` `[1x2]` `[2x2]` `[1+2]` `[2+1]`
- `1x1` — one panel taking the whole screen
- `1x2` — two panels horizontally
- `2x2` — four panels (square)
- `1+2` — one large on the left + two small on the right
- `2+1` — two on the left + one on the right
- Each panel can show its own resource (drag from sidebar or from a tab)
- Resizable borders between panels

---

## Views — detailed specs

### ProjectDetail

The most packed view. Shows one project end-to-end.

```
┌─────────────────────────────────────────────┐
│ spring-001 · Spring Ad          [done] ⚙️   │
├─────────────────────────────────────────────┤
│ Brand: Acme Corp    Persona: Alex           │
│ Platform: TikTok    Duration: 30s   9:16    │
├─────────────┬───────────────────────────────┤
│ Pipeline    │                               │
│ ✅ scenario │  [Scenario] [Assets] [Render] │
│ ✅ prompts  │                               │
│ ✅ assets   │  Currently showing: Assets    │
│ ✅ render   │  ┌──────┐ ┌──────┐ ┌──────┐  │
│             │  │ img1 │ │ img2 │ │ img3 │  │
│ Scenes      │  └──────┘ └──────┘ └──────┘  │
│ · scene-01  │  ┌──────┐ ┌──────────────┐   │
│ · scene-02  │  │voice │ │ final.mp4    │   │
│ · scene-03  │  │ ▶ ── │ │  ▶ ────────  │   │
│             │  └──────┘ └──────────────┘   │
└─────────────┴───────────────────────────────┘
```

Sub-tabs: Scenario (JSON viewer), Assets (gallery grid), Render (video player)

### AssetsGallery

A grid of every asset with filters.

```
┌────────────────────────────────────────────┐
│ Filter: [All ▼] [Images] [Video] [Audio]   │
│ Sort:   [Newest ▼]  Project: [All ▼]       │
├────────────────────────────────────────────┤
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐       │
│ │    │ │    │ │    │ │    │ │    │       │
│ │img │ │img │ │vid │ │img │ │vid │       │
│ │    │ │    │ │ ▶  │ │    │ │ ▶  │       │
│ └────┘ └────┘ └────┘ └────┘ └────┘       │
│ s01-bg  s01-fg s02-vid s03-bg s03-vid     │
│                                            │
│ ┌────┐ ┌────┐ ┌──────────────────┐        │
│ │ 🔊 │ │ 🔊 │ │ 🎵 music.mp3    │        │
│ │voice│ │voice│ │ ▶ ──────────── │        │
│ └────┘ └────┘ └──────────────────┘        │
└────────────────────────────────────────────┘
```

- Click an asset → fullscreen preview (lightbox)
- Hover → show metadata (prompt, model, dimensions)
- Multi-select for comparison (shift+click)
- **📋 Copy to Chat** — button on every media resource (see below)

### BrandsView

```
┌────────────────────────────────────────────┐
│ Acme Corp                        [Edit]     │
├────────────────────────────────────────────┤
│ Palette                                     │
│ ██ #FF5733  ██ #333333  ██ #00BFFF         │
│ primary     secondary   accent              │
│                                             │
│ Typography          Screenshots             │
│ Inter 700 heading   ┌──────┐ ┌──────┐      │
│ Inter 400 body      │mobile│ │desktop│      │
│                     └──────┘ └──────┘      │
│ Assets (12 files)                           │
│ logo.svg  icon-1.svg  hero.jpg  ...         │
└────────────────────────────────────────────┘
```

### PersonasView

```
┌────────────────────────────────────────────┐
│ Alex                              [Edit]    │
├────────────────────────────────────────────┤
│ Voice: eleven_monolingual_v1:rachel         │
│ Tone: friendly, casual                      │
│ Language: en  Age: 25-35  Gender: female    │
│                                             │
│ Voice Settings                              │
│ Stability: ████████░░ 0.8                   │
│ Similarity: ██████░░░░ 0.6                  │
│                                             │
│ ▶ Preview sample     [Generate preview]     │
│                                             │
│ Used in: spring-001, summer-003, batch-05   │
└────────────────────────────────────────────┘
```

### BatchesView

```
┌────────────────────────────────────────────┐
│ Spring Campaign 2026               [Run]    │
├────────────────────────────────────────────┤
│ Progress: ████████████░░░░ 75% (75/100)    │
│ Running: 3  Failed: 2  Pending: 20         │
│                                             │
│ ID          Status    Step      Duration    │
│ spring-001  ✅ done    render    45s         │
│ spring-002  ✅ done    render    38s         │
│ spring-003  🔄 running assets   ...         │
│ spring-004  ❌ failed  assets   Error: ...  │
│ spring-005  ⏳ pending  —        —           │
│ ...                                         │
│                                             │
│ [Retry failed] [Pause] [Export all renders] │
└────────────────────────────────────────────┘
```

---

## Copy to Chat

Every media resource (image, video, audio, JSON, screenshot, render) has a **📋 Copy to Chat** button.

Clicking it copies the **absolute path** of the file to the clipboard — to paste into Claude Code as a reference.

```
/Users/username/github/ugc-cli/workspace/projects/spring-001/assets/images/scene-01-bg.png
```

### Implementation

- The server passes `projectRoot` (absolute path to the project root) on init through the API
- Each file stores its relative path (from the project root)
- The client concatenates: `${projectRoot}/${relativePath}`
- Use `navigator.clipboard.writeText()`
- Toast notification: "Path copied! Paste in Claude Code chat"

### Copy variants (right-click context menu)

| Variant | Format | Example |
|---------|--------|---------|
| Copy path | Absolute path | `/Users/.../scene-01-bg.png` |
| Copy relative | Relative path | `workspace/projects/spring-001/assets/images/scene-01-bg.png` |
| Copy with context | Path + description | `scene-01-bg.png (scene-01 background, 1080x1920, fal flux-pro)` |

### Where the button appears

- Asset gallery — on every card (corner icon)
- Media player (video/audio) — next to the controls
- JSON viewer — "Copy path" button in the header
- Brand screenshots — on every screenshot
- Project renders — on every video
- Blueprints — on every JSON file
- Lightbox (fullscreen preview) — in the toolbar

---

## Real-time updates

### Server side (watcher.ts)

```typescript
// chokidar watch:
// - workspace/**/*.{json,mp4,mp3,wav,png,jpg,webp,srt}
// - workspace/.ralph/registry.json
//
// On change → broadcast over WebSocket:
// { type: "file:created", path: "workspace/projects/spring-001/assets/images/scene-01-bg.png" }
// { type: "file:changed", path: "workspace/projects/spring-001/scenario.json" }
// { type: "file:deleted", path: "..." }
// { type: "registry:updated", data: { ... } }
```

### Client side (useWebSocket.ts)

```typescript
// WebSocket connection with auto-reconnect
// On event → update the Zustand store
// Components re-render reactively
// Debounce for burst events (batch generation)
```

### What updates in real time

- New project created → appears in the sidebar
- Asset generated → appears in the project's gallery
- Render finished → video player updates
- Batch progress → progress bar updates
- Project status changed → badge updates

---

## REST API

```
GET  /api/registry                    # Whole registry
GET  /api/projects                    # Project list
GET  /api/projects/:id                # Project + scenario + manifest
GET  /api/projects/:id/scenario       # scenario.json
GET  /api/projects/:id/prompts        # prompts.json
GET  /api/projects/:id/assets         # asset-manifest.json
GET  /api/brands                      # Brand list
GET  /api/brands/:id                  # Brand + tokens
GET  /api/personas                    # Persona list
GET  /api/personas/:id                # Persona
GET  /api/refs                        # Reference list
GET  /api/refs/:id                    # Reference + blueprints
GET  /api/batches                     # Batch list
GET  /api/batches/:id                 # Batch + state
GET  /api/templates                   # Template list
GET  /api/workspace/stats             # Workspace stats

# Media streaming (direct file serve from workspace/)
GET  /media/*path                     # Any file from workspace/
# Example: /media/projects/spring-001/assets/images/scene-01-bg.png
# Example: /media/projects/spring-001/render/final.mp4
# Content-Type derived from extension
# Range requests for video (seeking)
```

---

## Tech stack

- **Server**: Hono (light, fast) + ws + chokidar
- **Frontend**: React 19 + Vite
- **State**: Zustand (simple, minimal boilerplate)
- **Styling**: Tailwind CSS v4 (already in the project)
- **Media**: native HTML5 `<video>`, `<audio>`, `<img>`
- **JSON viewer**: `react-json-view` or a custom one on Tailwind
- **Split panes**: `react-resizable-panels`
- **Grid**: CSS grid for the collage

---

## Launch

```bash
# Dev (with hot reload)
ralph dashboard

# Under the hood:
# 1. Starts the API server on :4321
# 2. chokidar starts watching workspace/
# 3. WebSocket server at ws://localhost:4321/ws
# 4. Vite dev server proxies /api/* and /media/* to the API
# 5. Opens the browser

# Production build (optional)
ralph dashboard --build     # Compiles static into dashboard/dist/
ralph dashboard --static    # Serves the compiled static without Vite
```

package.json:
```json
{
  "scripts": {
    "dashboard": "tsx dashboard/server/index.ts"
  }
}
```
