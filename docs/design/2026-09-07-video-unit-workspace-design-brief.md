# Video Unit Workspace — design brief

Date: 2026-09-07
Audience: Design agent and product designer
Deliverable: An initial interface concept and annotated interaction states
Status: Product direction confirmed; layout details below are proposed design defaults

Related research: [Creator platform research and product opportunities](2026-09-07-creator-platform-research.md).

## 1. Assignment and confirmed direction

Design a dedicated video-editing workspace inside Ralphy video Units. It must feel like a natural, intensive working mode of Ralphy Desktop.

**Build our own UI. HyperFrames is the composition and rendering engine behind the experience. Do not embed, reskin, or copy the ready-made HyperFrames Studio interface as the proposed product.** The previous research suggestion to start by embedding Studio is superseded by this decision.

The user should be able to assemble media, adjust timing, edit titles, choose takes, work with sound, direct the agent, save versions, and render without leaving the Unit. HyperFrames terminology, source files, and engine controls belong in advanced diagnostics when needed, not in the normal creative flow.

The immediate assignment is a design prototype. Show credible interactions and states; do not imply that a static mockup is a working editor or that every engine capability has been integrated.

## 2. Product promise

Open a video Unit, make a precise change yourself or with the agent, and retain a version you can reopen and render.

Primary jobs:

- Make a small correction to an agent-created video without describing every detail in chat.
- Assemble generated clips and existing assets into a finished short video.
- Replace one scene while preserving the rest of the edit.
- Adjust titles, captions, voice, music, framing, and pacing.
- Compare alternatives and return to an earlier creative version.

The opening state should present actual media and a usable sequence. Avoid a dashboard, a large introductory card, or a settings-first experience inside the editor.

## 3. Vocabulary and relationship to existing features

| Concept | Meaning for the designer |
| --- | --- |
| Unit | The persistent deliverable the user opened; it remains the same Unit throughout editing |
| Version | A recoverable state of that Unit's creative work; rendered and published outputs identify their source version |
| Composition | The editable source behind the video; primarily an implementation concept |
| Scene | A meaningful part of the story, such as Hook or Demonstration |
| Take | An alternative piece of footage for a scene |
| Clip / layer | A timed element in the composition: footage, image, voice, music, title, caption, or graphic |
| Render | A video file produced from a particular version |
| Platform presentation | The format, cover, caption, and other delivery choices for a destination |

Create generates individual assets. Canvas describes generation relationships. Scenes organize the story. The timeline controls the final timing and composition. The Unit holds the resulting work and its versions. These are connected views of the workflow, not independent copies of the material.

## 4. Entry, exit, and ownership

- Add **Edit video** to a video Unit's viewer and relevant contextual actions.
- Enter the existing application's work area under that Unit's identity. Preserve workspace/project context and provide a clear back action.
- From a canvas result, **Use in video** can choose an existing Unit or create one. Never silently make a duplicate when a Unit is already associated.
- When opened from chat, use the same workspace in the additional panel, with a maximize action. Maximizing must preserve selection, playhead, undo history, and unsaved changes.
- Returning to the Unit viewer preserves its inspected version and scroll context.
- Closing the workspace does not silently cancel a render. Ongoing work remains visible through the existing Notch and queue.

Two source cases must be visible in the design:

1. **Editable source:** open the composition's existing layers and timing.
2. **Rendered file only:** offer **Create editable version** and explain briefly that the video becomes one clip. Its original internal titles and edits cannot be individually selected.

Missing source or media is a recoverable state with a clear relink/locate action. Preserve the original files and existing output.

## 5. Information architecture and page layout

Use one application header, a central stage, an optional left library, an optional right panel, and a resizable timeline below the stage.

```text
┌─ Existing application header ────────────────────────────────────────────┐
│ Back · Unit name · Version / save state       Compare · Render · Notch   │
├───────────────┬─────────────────────────────────────┬───────────────────┤
│ Library       │                                     │ Inspector         │
│ Scenes        │              Video stage            │ or Agent          │
│ Assets        │                                     │ or Versions       │
│               │          Compact transport          │                   │
├───────────────┴─────────────────────────────────────┴───────────────────┤
│ Timeline tools · ruler · playhead                                       │
│ Scene strip                                                            │
│ Video / graphics / captions / voice / music tracks                      │
└─────────────────────────────────────────────────────────────────────────┘
```

This is a region map, not a prescribed visual skin. The global application sidebar may be collapsed for focused editing and can be restored. Keep the current app mode controls in their existing position.

### Header

Put page-specific actions into the existing main header, as with our current full-page canvas. Do not add a second page title row or a third action row.

- Leading group: back, video icon, Unit name, version selector, compact save status.
- Trailing group: Compare, contextual agent access, Render, and the existing application activity treatment.
- Use overflow for infrequent actions such as diagnostics or revealing source files.
- Keep the Unit name readable. Truncate lower-priority metadata before the name or primary action.
- Version/model/voice pickers open anchored popovers. Opening a picker does not replace the sidebar's current view.
- The Notch reports relevant background work without changing the header height or producing a layout jump.

### Reference sizes and responsive behavior

Design the primary layout at 1440 × 900, then check 1280 × 720 and 1920 × 1080. These are design review sizes, not new hardcoded CSS tokens.

- Start around 224 px for the left library, 280–304 px for the right panel, and 220–260 px for the timeline at the primary size; adjust after placing real content.
- Both side panels and the timeline are collapsible/resizable. The stage receives the remaining area.
- At 1280 × 720, collapse the library by default and show only one right-side task at a time. Do not squeeze two narrow inspectors around an unusable portrait preview.
- Switching Inspector / Agent / Versions / Compare replaces the right panel content; it does not stack multiple permanent columns.
- Provide a stage-focused mode and a timeline-focused mode without discarding state.
- Scroll within the library, inspector, and timeline as appropriate. Avoid an outer page scrollbar around the entire editor.
- No permanent bottom status strip beneath the timeline. Place contextual information in the header or timeline tools.

## 6. Visual direction: use Ralphy's existing design system

- Reuse Window surfaces and headers, shared buttons, tabs, popovers, sliders, and menus. Prefer compact rows over large cards.
- Match the current Create and Canvas visual language: restrained grayscale depth, clear typography, rounded working surfaces, and the existing accent blue for primary action/selection.
- Light theme has light editor panels. The media stage uses the existing media surface treatment appropriate to previewing the actual content; do not force the whole workspace into dark mode.
- Dark theme uses semantic surface/ink pairs, not an inversion filter.
- AWS Diatype is the main interface face; the existing mono face serves timecode and technical metadata. Use Doto sparingly for a meaningful counter or progress readout, not body labels.
- Give Window headers a relevant icon and a readable, appropriately weighted title.
- Dither can appear subtly on an empty-stage illustration or a nonessential loading treatment. Do not apply dither/glitch to user media, waveforms, selected text, or the timing ruler.
- Preserve the existing media type identities: text purple, image green, video blue, audio orange. Use subdued track surfaces with clearer markers; distinguish selection, type, and error states independently.
- Avoid deep card nesting, excessive outer margins, thick repeated borders, and empty decorative blocks.
- Reuse shared focus behavior. Do not draw an additional browser outline inside prompt fields; retain a visible keyboard focus state on the appropriate control/container.
- Dropdown rows match their selected control's density. Model names remain one line with concise metadata; search and the scrollable list live together.

Repository references: [Window](../../src/shared/ui/Window.tsx), [tokens](../../src/app/styles/tokens.css), [page header](../../src/shared/ui/PageHeader.tsx), [shared generation controls](../../src/entities/generation/index.ts), [canvas styling](../../src/app/styles/theme/canvas-hybrid.css).

Use the latest supplied Ralphy design-system references for component appearance. This brief defines video-editing behavior and should not undo the established Create/Canvas refinements.

## 7. Stage and transport

- Show the correct output aspect ratio within the available stage. Letterboxing is intentional; preserve the content's proportions.
- Select an element directly in the stage and show concise transform handles where that property is editable.
- Clicking or beginning a drag must not recenter or zoom the stage. Fit is an explicit action. Opening an inspector also leaves the viewport stable.
- Single click selects; dragging a nonediting handle moves the element. Rename uses an explicit action or an intentional text-edit gesture, not the normal drag target.
- Selection is synchronized with the corresponding timeline element and inspector. Do not change the playhead merely because an element was selected.
- Provide play/pause, frame stepping, timecode/duration, fit/zoom, audio monitoring, and optional safe-area guides in a compact transport.
- Safe-area guides are preview aids and never part of the rendered video.
- Portrait preview should be large enough to judge caption legibility. Use the side space for editing context only when that context is useful.
- Stage context menu: duplicate, arrange layer order, lock, remove from composition, and relevant source actions. Removing from the edit does not delete the source asset.

## 8. Timeline and scenes

### Core timeline

Show a time ruler, playhead, track headers, thumbnails for video, waveforms for audio, and short readable labels. Initial track categories: video, graphics/titles, captions, voice, and music.

Support selection, multi-selection, moving, snapping, trimming, supported splitting, duplication, mute/hide, lock, and timeline zoom. Distinguish trimming a clip from changing playback speed.

Default to non-ripple editing. Show a clear gap when a clip is shortened; do not silently shift the rest of the sequence. More advanced ripple/linked-editing modes can be explored later.

Show legal trim boundaries and constrained handles. If an operation is unsupported for the selected element, give a concise explanation rather than a broken control. The engineering phase must confirm the supported mutation subset of the chosen HyperFrames version.

Scrolling or selecting should preserve the user's timeline position. Follow-playhead behavior should be explicit and should yield while the user inspects another region. Locking a track prevents accidental edits but still permits inspection.

### Scene strip and take chooser

Above the tracks, show a compact scene strip with name, range, selected take, and generation state. Selecting a scene selects its relevant range; an explicit jump/preview action moves playback there.

The scene strip and timeline must describe the same edit. Show how moving/trimming scene content updates its boundaries; do not mock them as separate, contradictory sequences.

Take chooser: thumbnail/video, short label, duration, source model if applicable, selected state, and an action to compare or use the take. Compare two takes with synchronized playback and a clear A/B choice.

If a replacement is shorter than the occupied range, offer **Fit to current range** when supported or **Adjust scene duration** with a visible consequence. Do not silently retime all downstream content. Preserve compatible overlays and voice, and flag timing that needs attention.

## 9. Library and reusable assets

The left panel has compact navigation for Scenes and Assets. Asset search, type filters, readable thumbnails, and drag-and-drop should fit within that panel.

Allow local files, existing workspace media, and canvas results to be inserted. Show a placement indicator before dropping onto a track or stage. Distinguish a library-only import from insertion into the composition.

Preserve the source relationship so a generated clip can offer **Open source canvas** or **View generation**. Do not imply that every imported file has a generation history.

Reserve a natural extension for Characters, Products, and Brand presets. These records should provide reusable references and styles rather than dominate the first editor layout. An unavailable reference can be relinked without losing the sequence.

## 10. Inspector and editing controls

Use compact labeled rows, shared components, and contextual groups. Show controls relevant to the current selection.

| Selection | Useful controls |
| --- | --- |
| Video / image | Position, size, crop/fit, opacity, timing, replace source; video also source audio and supported playback controls |
| Title / graphic | Content, typeface, weight, size, color, alignment, placement, duration, supported animation |
| Captions | Text corrections, timing, style, placement, safe-area preview |
| Voice / music | Gain, mute, fades, trim, replace audio; distinguish clip gain from preview monitor volume |
| Scene | Name, range, take choice, references, regenerate/replace |
| No selection | Output format, duration summary, background, guides, project-level settings |
| Multiple elements | Shared editable properties and a clear mixed-value state |

Editing caption text changes the caption layer. Do not imply transcript-based cutting or speech regeneration unless the user explicitly chooses such an operation. Those are separate future capabilities.

For image/video generation or voice replacement, reuse the interaction patterns from Create: searchable model/voice dropdowns, accurate required fields, connected-reference states, variants, and provider-aware options. For the established aspect picker, keep Auto above a compact option grid where supported; do not fabricate unsupported ratios.

Output aspect changes offer a clear framing/recomposition choice. Changing the frame size should not automatically regenerate footage or destroy the original presentation.

Simple motion can use presets and supported keyframes. For computed properties that cannot safely be edited visually, explain the limitation and offer **Ask agent to edit this animation**. Avoid exposing nonfunctional sliders.

## 11. Agent editing inside the workspace

The agent works on the same composition the user sees. It receives the selected element/scene/range and the source version of that context.

Suggested interaction:

1. Select a title or scene and choose **Ask agent**.
2. A compact context chip identifies the scope: `Scene 02 · 00:03–00:09 · Draft R5`.
3. Enter a request such as “Use take B and keep the title timing” or “Make this title arrive just before the voice says Summer.”
4. Show working state and the affected scope. If paid generation is required, show the relevant provider/cost information and action under the product's authorization rules.
5. Present a concise change summary and preview with **Apply** / **Discard** for a proposed edit.
6. Applying the edit adds one understandable undoable operation or new version boundary.

The scope is captured when the request is sent; changing selection afterward does not silently retarget the running request. New manual edits must not be overwritten by an answer based on an older version. Design a clear conflict state with a retry/reapply path.

Keep unrelated editing available where feasible. Block only the affected operation when necessary, with a reason. An agent failure preserves the current draft and can be retried.

## 12. Save, versions, and rendering

Keep these concepts visibly distinct:

- **Draft saved:** the editable state is persisted, but a new rendered video may not exist yet.
- **Version:** a named/recoverable source state the user can inspect or branch from.
- **Rendered:** a file exists for a particular source version.
- **Selected for the Unit:** the version/result currently chosen as the deliverable.
- **Published:** a platform publication refers to a specific result; editing does not replace it silently.

Render captures a source snapshot. The user may continue editing, but the running job and completed output must retain their source version. If the draft changes, use a quiet message such as `Rendered R4 · Draft has newer changes`.

The Render action opens a compact configuration surface: destination preset, dimensions, frame rate, quality, and output location as supported. Separate rendering from publishing. No automatic social posting as a side effect of export.

Show queued, rendering, completed, failed, and cancelled states. Display real progress when available; otherwise use a truthful indeterminate state. A completed render offers Preview, Show file, and Use for Unit. Failure keeps source edits and the last successful output.

Version comparison should identify the two versions and summarize changed scenes, titles, or audio. An older sealed version opens read-only with **Create editable version**; do not silently overwrite it. Autosave failure must remain visible with retry/recovery.

## 13. Keyboard, menus, and accessibility

Proposed shortcuts, scoped to the active editor surface and shown in tooltips/help:

| Shortcut | Action |
| --- | --- |
| Space | Play/pause when not typing |
| Left / Right | Step frames when the player/stage owns focus |
| Cmd/Ctrl + Z; Shift + Cmd/Ctrl + Z | Undo; redo |
| Cmd/Ctrl + S | Save/checkpoint the current draft |
| Cmd/Ctrl + A | Select editable items in the active stage/timeline; native text selection inside text inputs |
| Cmd/Ctrl + D | Duplicate selection |
| Delete / Backspace | Remove selection from the edit, preserving source files |
| F | Fit the focused stage or timeline; no implicit fitting on selection |
| Escape | Close the topmost transient UI, then leave an edit/selection state |
| Shift + F10 | Context menu for the focused editable item |

Timeline navigation and frame stepping need separate focus contexts so arrows do not perform two actions. Numeric and text fields retain native editing shortcuts. Do not hijack system shortcuts globally.

Every icon-only action needs a label and tooltip. Selected, locked, muted, required, missing, and failed states must not rely on color alone. Provide keyboard alternatives to essential dragging and respect reduced motion. Keep focus visible without duplicate outlines.

## 14. States the prototype must demonstrate

| State | Required visible behavior |
| --- | --- |
| Populated idle | Real sequence, stage preview, usable primary actions |
| Title selected | Stage handles, matching track selection, relevant inspector |
| Clip dragging/trimming | Stable viewport, placement/trim feedback, snapping |
| Take comparison | Synchronized A/B previews and a clear replacement choice |
| Agent working / proposal | Frozen scope, progress, change summary, Apply/Discard |
| Manual edits changed during agent work | Conflict/reapply path; no silent overwrite |
| Rendering while draft advances | Render source version distinct from newer draft |
| Render complete / failed | Useful next action or retry; previous output preserved |
| File-only source | One video clip and a brief editable-source explanation |
| Missing media / save failed | Localized error, recoverable action, retained work |
| Older version | Read-only inspection and branch/edit action |
| Unsupported animation control | Explanation and scoped agent action |
| Compact viewport | Collapsed library, one right panel, functional timeline |

## 15. Fixture for the design

Use fictional content in **UX Testing Lab**. Label generated data and costs as simulated in the prototype's review context. No paid generation or real publication is required to create the design.

Unit: `031 · Terra — Summer drop`
Format: 1080 × 1920, 30 fps, 18 seconds
Versions: R4 rendered and selected; R5 editable draft
Creative direction: warm terracotta product footage, restrained typography, clear voiceover, light rhythmic music

| Scene | Range | Footage and alternatives | Editorial intent |
| --- | --- | --- | --- |
| 01 · Hook | 00:00–00:03 | Product close-up; take A selected, take B available | Product visible immediately; title “Made for the long way home” |
| 02 · Demonstration | 00:03–00:09 | Hand picks up product; take B selected; alternate take C is only 4 seconds | Show the product in use; exercise duration-mismatch replacement |
| 03 · Proof | 00:09–00:14 | Detail/macro shot; one selected take | Highlight a concrete feature without overloading captions |
| 04 · CTA | 00:14–00:18 | Product on clean surface with editable end card | “Meet your everyday essential” |

Include separate title, caption, voice, and music tracks. Example assets: `terra-closeup.mp4`, `terra-hand-demo.mp4`, `terra-detail.mp4`, `terra-end-card.png`, `voice-en.wav`, `summer-bed.wav`, and a vector logo. These are fixture names, not claims that such files already exist.

The main screenshot should be paused around 00:05 with a title selected. Make the title, current scene, active take, timeline range, and inspector agree. Use a separate state with take C selected for comparison and another with an agent proposing a change to Scene 02.

## 16. Requested design deliverables

Provide one coherent direction in Ralphy's design language, with enough states to explain actual work:

1. Main light-theme workspace at 1440 × 900 with populated tracks and a selected title.
2. Scene/take selection and comparison state.
3. Agent request and proposed-change review state.
4. Version comparison and rendering state, including a newer draft.
5. Compact 1280 × 720 layout and one dark-theme adaptation.
6. A small sheet of critical states: file-only source, missing media, unsupported control, and save/conflict failure.

Annotate what clicks, drags, resizes, collapses, and opens. Include component variants for a timeline clip, track header, scene strip item, take card, inspector row, version item, render status, and scoped agent request. Prioritize the populated working screen over an empty-state illustration.

Keep the first prototype focused on short-video editing, source/version preservation, and manual/agent cooperation. Advanced color grading, multicam, complete transcript editing, complex effect graphs, simultaneous multiplayer, and campaign analytics are later explorations. They should not fill the initial toolbar with inactive controls.

## 17. Acceptance criteria for the concept

- It is immediately recognizable as Ralphy and uses one application header.
- The stage and timeline dominate the available space; panels earn their area.
- A user can understand where a clip came from and which version they are changing.
- Selection and dragging never cause an unexpected camera jump.
- Small manual edits are practical without opening chat.
- An agent request has a visible scope and a reversible outcome.
- Flat video and editable source behave honestly and differently.
- Dropdowns, prompt fields, focus states, and spacing follow the latest Create/Canvas patterns.
- Saving, rendering, selecting a deliverable, and publishing are distinguishable.
- Every central interaction still works in the compact layout and with keyboard navigation.

## 18. Engine references and implementation boundaries

Read these for capability context, not as a visual design template:

- [HyperFrames framework](https://github.com/heygen-com/hyperframes)
- [Timeline operations](https://hyperframes.heygen.com/guides/timeline-editing)
- [Animation and computed-property limits](https://hyperframes.heygen.com/studio/animation)
- [CLI and rendering](https://hyperframes.heygen.com/packages/cli)

Our custom controls need a verified path to read/write a supported composition representation, seek/play the preview, and render the same source. A capability existing in Studio does not prove a public headless mutation API exists. Do not invent API names or promise every Studio operation will be available in the first release.

Engineering must prove source round trips, preview/render agreement, asset loading, recovery, and version conflict handling. Ralphy retains Unit/project ownership and uses its runtime/CLI contract for engine work. The design should make those outcomes clear while keeping engine implementation details out of the primary user experience.
