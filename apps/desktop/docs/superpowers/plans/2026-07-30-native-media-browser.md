# Native Media Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a responsive, polished, packaged native macOS application for
reviewing the user's real Ralphy media library.

**Architecture:** Keep a SwiftPM core library for deterministic scanning,
queries, metadata, and feedback, with a SwiftUI executable for macOS-specific
presentation and actions. Use native FSEvents and Quick Look behind small app
types, and package the release executable into a conventional `.app` bundle
with shell scripts.

**Tech Stack:** Swift 6, SwiftUI, AppKit, AVKit, QuickLookThumbnailing,
CoreServices/FSEvents, Swift Testing, JSON, POSIX shell.

## Global Constraints

- Target macOS 14 or newer.
- Add no third-party dependencies.
- Index only `.ralphy/workspaces/*/projects/*`.
- Hide internal `render/work-*` trees unless `includeIntermediates` is enabled.
- Never mutate generated files except through an explicit Move to Trash action.
- Store review metadata atomically in `.ralphy/media-library/library.json`.
- Keep source, tests, documentation, and UI copy in English.
- Preserve backward compatibility with the prototype's `rejected` metadata.
- Keep all scan and thumbnail decoding work off the main actor.

---

### Task 1: Fast Scanner And Rich Media Model

**Files:**
- Modify: `native/RalphyMedia/Sources/RalphyMediaCore/MediaModels.swift`
- Modify: `native/RalphyMedia/Sources/RalphyMediaCore/MediaScanner.swift`
- Modify: `native/RalphyMedia/Tests/RalphyMediaCoreTests/MediaScannerTests.swift`

**Interfaces:**
- Produces: `ScanOptions(includeIntermediates:)`, `ScanResult(items:skipped:)`,
  `MediaBucket.document`, and `MediaScanner.scan(root:options:)`.
- Consumes: the existing `.ralphy` workspace/project path contract.

- [ ] **Step 1: Add failing scanner behavior tests**

Add literal fixtures and assertions for default exclusion, opt-in inclusion,
expanded file types, case-insensitive extensions, and invalid roots:

```swift
@Test func scannerSkipsInternalRenderWorkByDefault() throws {
    let root = try TemporaryRalphy.make()
    try root.write("workspaces/ws/projects/p/render/work-123/frame.jpg", bytes: [1])
    try root.write("workspaces/ws/projects/p/render/final.mp4", bytes: [1])

    let result = try MediaScanner().scan(root: root.url)

    #expect(result.items.map(\.filename) == ["final.mp4"])
}

@Test func scannerCanIncludeInternalRenderWork() throws {
    let root = try TemporaryRalphy.make()
    try root.write("workspaces/ws/projects/p/render/work-123/frame.jpg", bytes: [1])

    let result = try MediaScanner().scan(
        root: root.url,
        options: ScanOptions(includeIntermediates: true)
    )

    #expect(result.items.map(\.filename) == ["frame.jpg"])
}
```

- [ ] **Step 2: Run the scanner tests and verify RED**

Run:

```bash
cd native/RalphyMedia
swift test --filter MediaScanner
```

Expected: compilation fails because `ScanOptions`, `ScanResult`, and the new
return shape do not exist.

- [ ] **Step 3: Implement directory pruning and richer media recognition**

Enumerate with `.isDirectoryKey`, call `skipDescendants()` for hidden,
dependency/build, and `render/work-*` directories, classify the extensions
listed in the design, and return a `ScanResult`. Keep one resource-value fetch
per visited URL and sort once at the end.

- [ ] **Step 4: Run scanner tests and the real scan**

Run:

```bash
swift test --filter MediaScanner
swift run RalphyMedia --scan-only /Users/maximovchinnikov/github/ralphy/ralphy/.ralphy
```

Expected: tests pass and the default real-library count is materially below
the prototype's 68,606 indexed files because render work frames are excluded.

- [ ] **Step 5: Commit**

```bash
git add native/RalphyMedia/Package.swift native/RalphyMedia/Sources/RalphyMediaCore native/RalphyMedia/Tests
gitleaks protect --staged --redact
git commit -m "feat: add optimized native media scanner"
```

### Task 2: Review Verdicts, Queries, And Durable Metadata

**Files:**
- Modify: `native/RalphyMedia/Sources/RalphyMediaCore/MediaModels.swift`
- Create: `native/RalphyMedia/Sources/RalphyMediaCore/MediaQuery.swift`
- Modify: `native/RalphyMedia/Sources/RalphyMediaCore/MetadataStore.swift`
- Modify: `native/RalphyMedia/Sources/RalphyMediaCore/AgentFeedback.swift`
- Create: `native/RalphyMedia/Tests/RalphyMediaCoreTests/MediaAnnotationTests.swift`
- Create: `native/RalphyMedia/Tests/RalphyMediaCoreTests/MediaQueryTests.swift`
- Modify: `native/RalphyMedia/Tests/RalphyMediaCoreTests/MetadataStoreTests.swift`
- Modify: `native/RalphyMedia/Tests/RalphyMediaCoreTests/AgentFeedbackTests.swift`

**Interfaces:**
- Produces: `ReviewVerdict`, `MediaQuery`, `MediaSort`, `MediaGroup`,
  `MediaSection`, normalized annotations, migrated metadata, and richer agent
  feedback.
- Consumes: `MediaItem` and `MediaBucket` from Task 1.

- [ ] **Step 1: Add failing annotation migration and normalization tests**

```swift
@Test func legacyRejectedAnnotationMigratesToRejectVerdict() throws {
    let data = Data(#"{"rating":2,"favorite":false,"rejected":true,"tags":[" Slop ","slop"],"note":"","updatedAt":"1970-01-01T00:00:01Z"}"#.utf8)
    let annotation = try JSONDecoder.ralphy.decode(MediaAnnotation.self, from: data)

    #expect(annotation.verdict == .reject)
    #expect(annotation.tags == ["slop"])
}
```

- [ ] **Step 2: Add failing query tests**

Cover verdict, favorites, workspace/project/type, normalized search, newest
sorting, and project grouping with hand-built `MediaItem` values:

```swift
@Test func queryFiltersRejectedAndSortsNewestFirst() {
    let result = MediaQuery(
        verdict: .reject,
        sort: .newest
    ).apply(to: items, annotations: annotations)

    #expect(result.map(\.id) == ["new-reject", "old-reject"])
}
```

- [ ] **Step 3: Run the focused tests and verify RED**

```bash
swift test --filter MediaAnnotation
swift test --filter MediaQuery
```

Expected: compilation fails on the new types.

- [ ] **Step 4: Implement the minimum review/query model**

Use a string-backed `ReviewVerdict` enum. Decode a missing verdict from the
legacy `rejected` boolean, clamp ratings, trim/lowercase/deduplicate tags, and
keep favorite independent from verdict. Make `MediaQuery.apply` pure and
stable so UI state is easy to test.

- [ ] **Step 5: Add failing metadata corruption and feedback tests**

Verify a malformed JSON file throws a typed `MetadataStoreError.corruptFile`
without changing its bytes. Verify feedback includes the absolute path,
verdict, and selection summary.

- [ ] **Step 6: Implement metadata and feedback behavior**

Add a schema version to the payload, leave atomic writes in place, expose the
metadata file URL in typed errors, and render compact Markdown with one section
per selected file.

- [ ] **Step 7: Run all core tests and commit**

```bash
swift test
git add native/RalphyMedia/Sources/RalphyMediaCore native/RalphyMedia/Tests
gitleaks protect --staged --redact
git commit -m "feat: add media review model and queries"
```

### Task 3: Non-Blocking Library State And Live Sync

**Files:**
- Create: `native/RalphyMedia/Sources/RalphyMediaCore/ReloadCoalescer.swift`
- Create: `native/RalphyMedia/Tests/RalphyMediaCoreTests/ReloadCoalescerTests.swift`
- Modify: `native/RalphyMedia/Sources/RalphyMediaApp/FolderWatcher.swift`
- Create: `native/RalphyMedia/Sources/RalphyMediaApp/AppSettings.swift`
- Rewrite: `native/RalphyMedia/Sources/RalphyMediaApp/LibraryViewModel.swift`

**Interfaces:**
- Produces: `ReloadCoalescer` with at-most-one-active/one-follow-up behavior,
  FSEvents watching only `workspaces`, persisted settings, published loading
  state, visible sections, multi-selection, and debounced metadata writes.
- Consumes: scanner, query, and metadata interfaces from Tasks 1 and 2.

- [ ] **Step 1: Add failing coalescing tests**

```swift
@Test func reloadBurstRunsOneActiveAndOneFollowUp() async {
    let recorder = Recorder()
    let gate = ReloadCoalescer(delay: .milliseconds(10)) {
        await recorder.record()
        try? await Task.sleep(for: .milliseconds(30))
    }

    await gate.request()
    await gate.request()
    await gate.request()
    try? await Task.sleep(for: .milliseconds(100))

    #expect(await recorder.count == 2)
}
```

- [ ] **Step 2: Run the coalescer test and verify RED**

```bash
swift test --filter ReloadCoalescer
```

Expected: compilation fails because the actor does not exist.

- [ ] **Step 3: Implement the coalescer and update FSEvents**

Implement the actor with one debounce task, one active task, and a dirty flag.
Watch `<root>/workspaces` so writes to `media-library/library.json` never
trigger a rescan. Ensure `FolderWatcher.stop()` releases the stream exactly
once.

- [ ] **Step 4: Rewrite the view model around async state transitions**

Open the root synchronously only for validation and metadata load. Run scans in
`Task.detached`, publish `isScanning`, `scanDuration`, `visibleSections`, and
`statusText`, and discard stale scan generations. Preserve the last successful
items on errors. Debounce metadata saves by 350 ms. Implement command/shift
selection, batch verdict/rating/favorite/tag actions, Quick Look URL, Copy
Paths, Copy for Agent, Open, Reveal, and confirmed Trash requests.

- [ ] **Step 5: Run tests and build, then commit**

```bash
swift test
swift build
git add native/RalphyMedia/Sources/RalphyMediaCore native/RalphyMedia/Sources/RalphyMediaApp native/RalphyMedia/Tests
gitleaks protect --staged --redact
git commit -m "feat: add responsive library state and live sync"
```

### Task 4: Native Thumbnails, Preview, And Eagle-Style UI

**Files:**
- Create: `native/RalphyMedia/Sources/RalphyMediaApp/ThumbnailStore.swift`
- Create: `native/RalphyMedia/Sources/RalphyMediaApp/MediaPreview.swift`
- Create: `native/RalphyMedia/Sources/RalphyMediaApp/SidebarView.swift`
- Create: `native/RalphyMedia/Sources/RalphyMediaApp/MediaGridView.swift`
- Create: `native/RalphyMedia/Sources/RalphyMediaApp/InspectorView.swift`
- Rewrite: `native/RalphyMedia/Sources/RalphyMediaApp/LibraryWindow.swift`
- Modify: `native/RalphyMedia/Sources/RalphyMediaApp/RalphyMediaApp.swift`

**Interfaces:**
- Produces: async cached Quick Look thumbnails, lifecycle-safe AV playback,
  source-list sidebar, sectioned lazy grid, batch inspector, status strip,
  native menus, keyboard commands, drag-out, and Quick Look.
- Consumes: the view model from Task 3.

- [ ] **Step 1: Replace synchronous image decoding**

Implement a `@MainActor ThumbnailStore` backed by `NSCache<NSString, NSImage>`.
Use `QLThumbnailGenerator.generateBestRepresentation` from a Swift task and
cache by path, modification timestamp, and requested pixel size. Cancel the
request when a grid cell disappears.

- [ ] **Step 2: Implement lifecycle-safe previews**

Use `NSImage` loading in a background task for images, one `AVPlayer` owned by
the selected preview for audio/video, asynchronous bounded UTF-8 reads for
text, and a PDFKit view for PDFs. Stop playback when selection changes.

- [ ] **Step 3: Build the window hierarchy**

Use `NavigationSplitView`, semantic macOS materials/colors, SF Symbols, compact
toolbars, `LazyVGrid` sections, stable tile aspect ratios, a trailing inspector,
and a bottom status strip. Do not use nested cards. Add accessibility labels and
tooltips to icon-only controls.

- [ ] **Step 4: Add review interactions**

Wire command/shift selection, double-click Quick Look, drag providers, context
menus, smart filters, sorting/grouping menus, grid-size slider, bulk inspector
actions, confirmation dialog for Trash, and app menus for review commands.

- [ ] **Step 5: Build and commit**

```bash
swift build
git add native/RalphyMedia/Sources/RalphyMediaApp
gitleaks protect --staged --redact
git commit -m "feat: deliver native media review interface"
```

### Task 5: App Icon, Packaging, And Launch Smoke Test

**Files:**
- Create: `native/RalphyMedia/Resources/AppIcon.png`
- Create: `native/RalphyMedia/Resources/Info.plist`
- Create: `native/RalphyMedia/scripts/build-app.sh`
- Create: `native/RalphyMedia/scripts/test-app.sh`
- Modify: `native/RalphyMedia/README.md`
- Modify: `README.md`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `dist/Ralphy Media.app`, bundle identifier `app.ralphy.media`, a
  reproducible launch test, and concise run/build documentation.
- Consumes: the release executable and `--scan-only` mode.

- [ ] **Step 1: Generate and prepare the icon**

Generate one square, legible macOS icon master with a dark graphite library
drawer, a coral review check, and a small cyan media glint. Convert it to
`AppIcon.icns` during the packaging script using `sips` and `iconutil`.

- [ ] **Step 2: Add the bundle metadata and packaging script**

The script must run `swift build -c release`, create
`dist/Ralphy Media.app/Contents/{MacOS,Resources}`, copy the executable, compile
the iconset, copy `Info.plist`, and ad-hoc sign the bundle with:

```bash
codesign --force --deep --sign - "dist/Ralphy Media.app"
```

- [ ] **Step 3: Add the smoke-test script**

The script verifies `CFBundleIdentifier`, runs the packaged executable with
`--scan-only`, launches the bundle with `open -na`, polls `pgrep` for the bundle
executable, and exits nonzero if launch fails. It must not kill a pre-existing
user-owned instance.

- [ ] **Step 4: Build, test, and commit**

```bash
cd native/RalphyMedia
./scripts/build-app.sh
./scripts/test-app.sh /Users/maximovchinnikov/github/ralphy/ralphy/.ralphy
cd ../..
git add .gitignore README.md native/RalphyMedia
gitleaks protect --staged --redact
git commit -m "build: package Ralphy Media as a macOS app"
```

### Task 6: Performance, Regression, And UI Verification

**Files:**
- Modify only files required by verified failures.

**Interfaces:**
- Produces: measured performance evidence, a green repository build, reviewed
  code, and a running final app.
- Consumes: every prior task.

- [ ] **Step 1: Run full automated verification**

```bash
cd native/RalphyMedia
swift test
swift build
swift build -c release
./scripts/build-app.sh
./scripts/test-app.sh /Users/maximovchinnikov/github/ralphy/ralphy/.ralphy
cd ../..
bun run build
```

- [ ] **Step 2: Benchmark prototype and final scanner**

Use `hyperfine --warmup 1 --runs 3` against the saved prototype executable and
the final packaged executable, both with `--scan-only` and the real library.
Record item counts, wall time, and peak memory.

- [ ] **Step 3: Perform the native UI pass**

Launch `dist/Ralphy Media.app` with the real `.ralphy` path. Through macOS
accessibility, verify the window appears, the scan state resolves, thumbnails
render, smart and type filters change counts, grid size changes, an item can be
selected and previewed, a temporary annotation can be changed and restored,
and Copy for Agent writes the expected clipboard text. Do not Trash a real
media file during this pass.

- [ ] **Step 4: Request independent code review**

Give the reviewer the design, plan, complete branch diff, and test evidence.
Fix every Critical or Important finding, rerun the affected tests, then rerun
the full verification commands.

- [ ] **Step 5: Run final repository checks**

```bash
rg --pcre2 '\p{Cyrillic}' --hidden -g '!.git' -g '!node_modules' -g '!*.lock' -g '!native/RalphyMedia/.build' -g '!native/RalphyMedia/dist'
gitleaks detect --source .
git status --short
```

- [ ] **Step 6: Leave the final app running**

Open one fresh instance of `dist/Ralphy Media.app` with the user's real library,
bring its window to the foreground, and confirm through accessibility that the
main library window is present.

## Self-Review

- Spec coverage: launch, scanning, exclusions, synchronization, thumbnails,
  review state, queries, bulk actions, feedback, Trash, packaging, performance,
  automated tests, and UI verification each map to a task.
- Placeholder scan: the plan contains no incomplete implementation markers.
- Type consistency: scanner, annotation, query, coalescer, view model, and
  packaging names are consistent across producer and consumer tasks.
