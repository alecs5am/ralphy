# Content-first shell experiment

Branch: `codex/content-first-shell`.

The workspace should behave as a content browser with an optional contextual agent.
Keep one sidebar across content, conversations and Explore. Put everyday actions
above projects; place workspace memory and context entry points in Settings. Reuse existing
routes and persisted data rather than introduce another navigation system.

Implementation:
1. Compact the workspace selector and keep projects and chats reachable throughout.
2. Keep content on the left and open the agent on the right without replacing it.
   Use the existing accessible sheet when the two columns cannot fit.
3. Reframe Explore as a creative library covering the resources that actually exist.
4. Validate route reachability, retained content state, keyboard navigation, resize,
   narrow windows, and the full desktop checks. Inspect the running renderer.

## Media workflow refinement

Projects open a media browser. Documents and activity remain secondary project
details; deliverables are browsed together in workspace Content. Existing storage
ownership and revision histories stay intact. Sidebar destinations do not create
workspace tabs; explicit documents and a visited browser can remain open as tasks.

Project and shared-media searches run before server pagination and keep their
filters and sort order when loading more. Creative-library saves use the current
workspace unless another target is explicitly chosen. Revision previews resolve
the selected version, with a truthful fallback when no preview is available.

The visual pass removes duplicated headings, metadata bands and decorative empty
previews. Media tiles use the preview radius token; ordinary navigation uses the
compact row token. Full-size viewers preserve the original framing. Create reserves
the central surface for real generation outputs; no sample media or prompt-card hero.

Acceptance scenarios: browse UX Testing Lab projects and Content; search, filter,
sort and clear; preview and move between images/video/audio; return to the same
folder; open/close the contextual agent; navigate Create, Calendar, Canvases and
Explore; inspect saved-item scope; verify light/dark and narrow-window layouts;
retain unsaved document work across navigation; run desktop and runtime checks.

This work does not add nested storage folders, bulk media operations, font
catalog entries, integrations or new generation capabilities.

## Compact workspace refinement

Project folders open their media; their disclosure control reveals project chats.
The project header creates folders and each folder creates a scoped conversation.
Existing conversations without stored project scope remain workspace chats.
Browsing another folder never changes a conversation's generation context.

Cmd+R toggles the agent while retaining the current content surface. The native
shortcut suppresses Electron reload and enters the same configurable command
registry as renderer shortcuts. Open document tabs remain distinct from sidebar
navigation; the content surface itself has no nested window frame.

Media types and content formats are direct radio choices. Project captions reveal
on hover or keyboard focus; touch devices retain captions. Content can be narrowed
to an owning project and retains named filter choices when their count reaches zero.
Advanced media filters have a bounded, readable popover rather than intrinsic-width
controls. Clear filters restores the full collection.

Create displays results behind a persistent floating bottom composer. Local media
types sit in its header; model, common parameters and variation count stay visible
in the composer. References and advanced parameters open above it. The canvas editor fills its
surface, with its title, tools, inspector and run controls floating over the board.
System typography uses a 13px base while retaining readable micro-label sizes.

## Composition refinement

The sidebar uses one icon column and 30px rows. Workspace selection and Settings
share its footer. Search and the standalone New chat navigation row are removed;
project and chat-panel creation controls retain their scope. Workspace Chats can
collapse independently. A project is a text context while its active child chat
owns the selection fill, so the two never form a joined block.

This is a product surface, not a marketing page: design variance 2, motion 1,
content density 8. Preserve system typography, neutral theme tokens and restrained
control radii. Only the composer floats; generation cards consist of media with
details on hover or focus. No decorative imagery is added to empty collections.

Page identity and actions use the existing window toolbar host, including when a
conversation is open. They do not add a second title strip inside the content.
The agent toggle is a quiet icon beside the status island. Shell insets and gaps
are 4px; transcript body and composer text use the 13px text token.

The floating Create composer reserves its measured height in both gallery and
result-detail scrolling, including after controls wrap. Video captions stay above
the media so native playback controls remain reachable. Voice selection opens
with the Voice task instead of requiring a second click.
