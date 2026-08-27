# Ralphy Desktop Application Settings — UI Design Handoff

## Purpose

Design a global Settings surface for Ralphy Desktop: an open-source AI content-production workbench that connects agent harnesses, generative providers, local models, publishing services, automation, and local creative files.

Settings must make a powerful system understandable without becoming a catalog of every feature in the product. It should answer four questions:

1. What applies to the whole application or this computer?
2. What services and runtimes are connected and healthy?
3. What may agents access or change?
4. Where can the user inspect, recover, or reset system behavior?

This document is a UI handoff, not an instruction to expose unfinished functionality as working.

## Settled product decisions

- Application Settings is a dedicated full-window surface, not a modal over a workspace.
- Application Settings contains global and `This Mac` preferences only.
- Workspace-specific behavior belongs to a separate Workspace Settings surface.
- Use a grouped sidebar, searchable settings, compact rows, and progressive disclosure inspired by mature desktop developer tools such as Codex.
- Preserve the existing restrained Ralphy visual language instead of visually cloning another product.
- Settings autosave where an individual preference can safely apply immediately.
- Credentials, imports, destructive actions, and multi-field setup flows require an explicit action.
- Local Models discovery and installation remain in Marketplace. Settings only controls the local runtime, storage, and execution defaults.
- Keybindings is a first-class page with search, recording, conflict handling, and reset.
- Do not create settings merely to make the screen look complete. Unimplemented future controls must be labeled as design targets, not shown as fake disabled switches in production.

## Scope boundary

### Application Settings owns

- application startup and navigation behavior;
- local profile and global personalization;
- appearance and accessibility preferences;
- voice input configuration;
- keyboard shortcuts;
- agent harness connections and defaults;
- generation-provider connections and defaults;
- local model runtime and cache behavior;
- global Memory behavior;
- publishing transports and third-party integrations;
- application-wide storage, automation, notifications, permissions, terminal, imports, diagnostics, updates, and version information.

### Workspace Settings owns

- workspace name, brand identity, and creative guidelines;
- workspace members and roles;
- workspace Memory contents and review policy;
- social accounts assigned to the workspace;
- default publishing timezone and approval policy;
- project and Unit defaults;
- workspace-specific generation defaults or provider overrides;
- workspace-specific storage destinations;
- collaboration and account-level policies when those products exist.

An Application Settings row may link to Workspace Settings, but must not edit workspace state in place.

## What to preserve from the current implementation

The existing Settings surface already provides useful foundations:

- full-window route with `Back to app`;
- persistent left sidebar;
- category search field;
- centered, readable content column;
- section cards built from consistent rows;
- toggle, segmented control, text input, shortcut, and provider-row patterns;
- General, Profile, Appearance, Providers, Terminal, and About concepts;
- restrained desktop density and Lucide icon language;
- `This Mac` context label.

Evolve this surface instead of introducing a second settings shell.

## Current interface problems

- Navigation is a flat list, so new areas cannot be added without becoming noisy.
- Search filters category names only; it cannot find a setting such as `Prevent sleep` or `API key`.
- The content canvas is visually underused at large window sizes.
- `Unavailable` switches look like broken preferences instead of honest roadmap limitations.
- Provider API keys are entered directly in a dense table, with weak connection, capability, and security context.
- Several controls currently hold component-local mock state and do not communicate persistence or failure.
- Profile appears account-like but is currently local-only.
- Agent harnesses and media-generation providers are conflated under the broad term `Providers`.
- The page does not distinguish global state, `This Mac` state, credential state, and workspace overrides.
- There is no first-class route for permissions, background work, storage health, notifications, imports, diagnostics, or shortcut customization.

## Information architecture

Use semantic group labels in the left sidebar. Groups organize scanning; they are not clickable pages.

```text
PERSONAL
  General
  Profile
  Appearance
  Voice
  Keyboard shortcuts

AI & GENERATION
  Agents
  Generation providers
  Local runtime
  Memory & personalization

CONNECTIONS
  Publishing
  Integrations

SYSTEM
  Storage & media
  Automation
  Notifications
  Permissions & privacy
  Terminal & environment
  Import & export

SUPPORT
  Diagnostics
  Updates
  About
```

Keep group order stable. When an area is not available in the current release, omit its navigation item or mark it `Preview` only if a meaningful preview exists. Do not fill the sidebar with permanently disabled destinations.

## Settings shell

### Sidebar

Recommended width: approximately 236–260 px.

Order:

1. native window/titlebar area;
2. `Back to app`;
3. settings search;
4. grouped navigation;
5. application identity and optional update indicator.

The active page uses surface contrast, icon, and text weight. Color alone is insufficient. Keep icons small and from the existing icon family.

The sidebar scrolls independently only when the window cannot display the full list. `Back to app` and search remain reachable. Restore the previously selected settings page when reopening Settings, unless a deep link targets another row.

### Main content

- Keep a centered content column around 720–800 px.
- Use one sticky page header with title and an optional scope or health label.
- Organize rows inside titled sections.
- Avoid introductory hero copy on routine pages.
- Use wider full-bleed content only for provider lists, keybindings, logs, and storage breakdowns that genuinely need it.
- At large widths, preserve readable measure rather than stretching cards across the window.

### Context and scope labels

Use explicit labels when scope can be misunderstood:

- `Global`
- `This Mac`
- `Secure credential`
- `Inherited by workspaces`
- `Workspace override exists`
- `Requires restart`
- `Managed by provider`

Do not place `This Mac` only in the General header if other pages also contain device-local settings.

## Search behavior

Settings search is a command-like navigator, not a sidebar filter.

Index:

- page name;
- section name;
- row title;
- description;
- common synonyms such as `API key`, `mic`, `cache`, `GPU`, `shortcut`, and `telemetry`;
- connected provider and integration names.

Results appear below the field or in the main canvas and show:

```text
Setting title
Page › Section
Short description or current state
```

Selecting a result opens the page, scrolls to the row, moves focus appropriately, and briefly highlights the setting. Search results never mutate a setting directly.

Support:

- arrow-key navigation, Enter, and Escape;
- a clear button;
- a useful no-results state with related terms;
- deep links to `settings/<page>#<setting-id>`;
- matching provider names even when the provider is disconnected.

## Setting row system

Most pages should use a small shared vocabulary:

- **Toggle row** — immediate boolean preference;
- **Select row** — one value from a longer list;
- **Segmented row** — two or three short mutually exclusive values;
- **Action row** — opens a picker, setup flow, diagnostic, or secondary surface;
- **Status row** — read-only health or detected environment information;
- **Connection row** — service identity, health, account/source, and manage action;
- **Path row** — readable path plus reveal/change actions;
- **Credential field** — only inside a provider detail flow, never in the overview list;
- **Keybinding row** — command, scope, current binding, and edit/reset actions;
- **Danger row** — destructive action separated spatially from normal preferences.

Each row contains a short title, a useful explanation, and one primary control. Do not make the entire row clickable when it contains its own buttons or links.

## Save and feedback model

### Autosaved preferences

Apply safe single-setting changes immediately. Show subtle local feedback:

- changed control state;
- `Saving…` only when persistence is not immediate;
- inline error with `Retry` or `Restore previous value`;
- `Requires restart` when necessary.

Do not show a persistent `Saved` toast for every toggle.

### Explicit actions

Require `Connect`, `Save key`, `Import`, `Export`, `Reset`, `Clear`, or `Delete` for:

- credentials;
- multi-field provider setup;
- filesystem moves;
- import/export operations;
- destructive cleanup;
- restoring defaults;
- actions with external side effects.

Preserve entered values after recoverable errors. Confirm success near the originating control.

## Personal

### General

Sections:

#### Application behavior

- restore the last workspace/project after launch;
- default landing destination when no context can be restored;
- reveal newly generated media in the active view;
- reopen active chat panel state;
- keep Ralphy available in the macOS menu bar, when supported;
- prevent system sleep while a local Run or render is active;
- language: `System` or supported application language;
- send shortcut default for agent chat: Enter or Command+Enter.

#### Library

- detected Ralphy home/library path;
- reveal in Finder;
- explain whether it is automatic, custom, unavailable, or needs repair;
- changing the library path uses a migration flow, not an inline text field.

#### Defaults

- default application used to open files when Ralphy cannot preview them;
- default behavior for newly discovered generated files;
- whether completed background work opens automatically or only notifies.

Do not put permissions, credentials, cache cleanup, or workspace behavior in General merely because they lack another home.

### Profile

Current scope is a local creator profile:

- avatar;
- display name;
- optional preferred name used by agents;
- interface language or region link when configured elsewhere;
- explicit `Stored on this Mac` explanation.

If a future Ralphy/Marketplace account exists, separate `Local profile` from `Account`. Do not show billing, synchronization, organization, or cloud identity before those systems exist.

### Appearance

Sections:

#### Theme

- System, Dark, and Light when all three are genuinely supported;
- optional accent selection only if the application design system supports it globally;
- high-contrast preference or system inheritance.

#### Layout

- Compact and Comfortable density;
- default Media grid density;
- sidebar and panel restoration behavior;
- optional larger interface text without breaking native OS text scaling.

#### Motion

- interface motion;
- reduced-motion explanation and system inheritance;
- media autoplay or animated-preview behavior, if globally controlled.

Preview theme and density changes immediately. Do not use a decorative sample window that occupies more space than the settings themselves.

### Voice

This page configures chat dictation and future voice interactions, not generated voiceovers.

Sections:

#### Input

- microphone device;
- permission status with direct macOS recovery action;
- input-level test;
- preferred language or auto-detect;
- automatic punctuation;
- push-to-talk shortcut, if enabled.

#### Transcription

- local or configured remote transcription service;
- model when selectable;
- privacy and network disclosure;
- temporary recording retention;
- test transcription action.

Keep ElevenLabs and other content voice-generation services under Generation providers. Do not mix them with microphone settings.

### Keyboard shortcuts

Keybindings must remain usable when Ralphy grows into a multi-panel production tool.

#### Page structure

- page-level search;
- category filter;
- `Show changed only`;
- `Reset all` in a separated danger/maintenance section;
- command groups such as Application, Navigation, Chat, Projects and Units, Media, Calendar, Panels, Playback, Editing, and Terminal;
- one row per actual registered command.

Every row shows:

- command name;
- short explanation when the name is insufficient;
- scope such as `Global`, `Chat`, `Media`, or `Unit editor`;
- current shortcut;
- changed/default indicator;
- edit and reset actions.

#### Recording a shortcut

Selecting the shortcut enters a focused recording state:

```text
Press a shortcut
⌘ ⇧ K
[Cancel] [Save]
```

Behavior:

- capture the complete chord rather than accepting free-form text;
- display platform-native modifier symbols on macOS;
- support single shortcuts and intentional two-step chords only if the command system actually supports them;
- Escape cancels;
- Backspace or a visible `Clear` action removes an optional binding;
- reject modifier-only input;
- block OS-reserved combinations with a concrete explanation;
- preserve keyboard-layout-aware display while storing a stable command representation.

#### Conflict handling

When a shortcut is already used, show both commands and their scopes.

Possible resolutions:

- `Replace existing` when scopes conflict;
- `Keep both` only when contexts cannot overlap;
- `Choose another`;
- `Cancel`.

Never silently unbind another command. A warning is not enough when both commands can be active in the same context.

#### Defaults and portability

- Reset one command or all commands.
- Show the default binding alongside a modified value.
- Export/import custom keybindings through Import & export.
- Import validates unknown command IDs and conflicts before applying.
- Keep the known existing terminal shortcut such as `Toggle terminal panel` connected to the same command registry rather than duplicating a display-only value.

#### Accessibility

- Every command remains available through menus or visible controls; shortcuts are accelerators, not the only route.
- Recording state and conflicts are announced to assistive technology.
- Focus returns to the edited shortcut after save or cancel.
- Shortcut badges remain readable at high contrast and 200% zoom.

## AI & Generation

### Agents

This page manages agent harnesses that can operate Ralphy, files, tools, and projects.

Examples:

- Codex;
- Claude Code;
- OpenCode;
- Qwen Code;
- OpenRouter-backed agent adapter;
- future provider-native harnesses.

The overview lists each harness with:

- official provider identity plus adapter source/verification;
- Installed, Connected, Needs login, Needs update, Misconfigured, or Unavailable state;
- authentication source such as provider login, environment, or secure keychain;
- default model when reported;
- key capabilities: resume, tools, filesystem, network, approvals, concurrency, and scheduling;
- `Manage` action.

Provider detail includes connection/setup, available models, default model, environment or executable status, working-directory behavior, effective permission mapping, test connection, update/reconnect, and disconnect.

Do not imply that friendly permission names mean the same thing across providers. Show the effective capability receipt produced by the adapter.

Changing the default agent affects new chats only. Existing provider-native sessions keep their provider and model lineage unless explicitly forked.

### Generation providers

This page manages services used to create or transform content rather than operate the application.

Possible capability groups:

- Text
- Image
- Video
- Audio and speech
- Avatars
- Upscale and utility

Examples may include OpenAI, Fal, Replicate, ElevenLabs, HeyGen, and provider adapters installed from Marketplace. Only render providers known to the application or installed adapters.

Overview row:

- service identity;
- capability summary;
- Connected, Limited, Rate limited, Invalid key, or Disconnected;
- credential source;
- usage/quota only when the provider reports trustworthy data;
- `Manage` action.

Provider detail:

- secure credential setup with show/hide and redacted saved state;
- connection test;
- models/capabilities discovered from the adapter;
- default model per supported media type;
- estimated cost disclosure where trustworthy;
- region, endpoint, or organization only when required;
- disconnect and remove credential.

Never expose complete persisted secrets to the renderer after save.

### Local runtime

Marketplace owns model discovery, trust, license acceptance, download, and installation. Local runtime owns how installed models run.

Sections:

#### Hardware

- detected CPU, GPU/Metal, memory, and free disk summary;
- compatibility warnings;
- runtime health and version;
- `Run diagnostics`.

#### Execution

- default local inference runtime;
- device selection where more than one valid device exists;
- concurrency limit;
- memory/VRAM safety policy;
- keep local service warm or stop when idle;
- network/listen scope, defaulting to local-only.

#### Storage

- model directory;
- model cache size;
- reveal in Finder;
- move storage through a verified migration flow;
- clear safe cache separately from installed models.

Link to `Browse models in Marketplace`; do not embed the Marketplace catalog here.

### Memory & personalization

This page controls global behavior, not workspace Memory contents.

Sections:

- global response/style preferences used when no workspace rule overrides them;
- whether agents may propose Memory entries;
- review requirement before proposed Memory becomes active;
- global Memory health and location;
- link to the workspace Memory surface;
- reset global personalization with a clear impact preview.

Chat history must not become Memory automatically.

## Connections

### Publishing

Connect transports such as Postiz and future publishing services globally. Assign specific accounts and publishing policy inside Workspace Settings.

Each connection shows:

- service identity;
- authentication health;
- available channel/account count without exposing private account data unnecessarily;
- scopes granted;
- last successful sync;
- reconnect, manage, and disconnect;
- link to workspaces currently using the connection.

Removing a connection must list affected workspaces, schedules, and drafts before confirmation.

### Integrations

Use for non-generation, non-publishing services such as storage, asset sources, analytics, or installed connector adapters.

Overview filters:

- Connected
- Needs attention
- Available

Each integration exposes source, permissions, workspaces using it, last activity, and manage/disconnect actions. Marketplace remains the place to discover new community adapters.

## System

### Storage & media

Sections:

- Ralphy home/library path and health;
- generated media location;
- previews, thumbnails, proxies, downloads, logs, and temporary files;
- disk-usage breakdown;
- automatic cleanup rules;
- `Clear cache` with an exact recoverability description;
- `Reveal in Finder`;
- storage migration with free-space preflight and rollback.

Never group user-created artifacts with regenerable cache in one destructive action.

### Automation

Global defaults and runtime behavior:

- whether background Runs continue when the main window closes;
- prevent sleep while working;
- maximum global concurrent Runs;
- queued-work behavior;
- behavior after interruption or application restart;
- default notification and review behavior for unattended work;
- global pause for automation;
- link to scheduled work in Calendar or Activity.

Workspace schedules remain workspace-owned. Global settings must not silently grant publishing, deletion, paid generation, or unrestricted filesystem access to unattended Runs.

### Notifications

Notification types:

- Run completed;
- Run failed;
- approval or user input required;
- scheduled work missed;
- provider disconnected;
- storage or local-runtime warning;
- application update available.

Controls:

- native notification permission status;
- in-app badges;
- sound;
- notification preview detail;
- quiet hours, if supported;
- per-type toggles.

Failures that require action must remain visible in Activity even when notifications are disabled.

### Permissions & privacy

This is a high-trust page and must use plain language.

Sections:

#### Device permissions

- microphone;
- notifications;
- screen recording or accessibility only when a feature actually needs them;
- filesystem roots granted to Ralphy;
- open macOS System Settings recovery actions.

#### Agent defaults

- default approval posture for new chats;
- whether filesystem writes, shell, network, paid generation, external publishing, and destructive actions always require review;
- provider-specific effective receipts instead of false universal guarantees.

#### Data and diagnostics

- analytics/telemetry;
- crash reporting;
- remote transcription disclosure;
- log retention;
- redaction policy for exported diagnostics;
- links to local data locations.

High-risk toggles require impact copy. Never combine unrelated dangerous capabilities under one `Full access` switch.

### Terminal & environment

Sections:

#### Shell

- detected shell;
- login shell or plain shell;
- default starting location;
- clickable links;
- terminal scrollback or history limit when supported;
- open terminal in bottom or side panel when both locations exist.

#### Environment

- detected PATH and runtime health;
- environment inheritance policy;
- managed environment-variable names with values redacted by default;
- open configuration file or environment editor;
- restart-required state after changes.

#### Terminal shortcuts

Show a short summary and link to Keyboard shortcuts. Do not maintain a second shortcut editor here.

### Import & export

Supported actions:

- export application preferences;
- export custom keybindings;
- import preferences with a preview of changes;
- import existing supported provider configuration only with explicit consent;
- create a redacted support bundle through Diagnostics;
- restore application defaults.

Secrets, provider transcripts, private workspace Memory, and user media are excluded by default. The import preview lists conflicts, unsupported keys, workspace references, and restart requirements before applying.

## Support

### Diagnostics

Provide a system-health surface rather than asking users to inspect raw logs first.

Checks:

- Ralphy CLI availability and version;
- application-to-CLI contract health;
- library read/write health;
- agent harness availability;
- generation provider connectivity;
- Postiz/publishing connection health;
- local runtime and model-directory health;
- storage space;
- background-run service;
- microphone/notification permissions.

Actions:

- rerun all checks;
- copy a redacted summary;
- reveal logs;
- export redacted support bundle;
- open a concrete repair action per failed check.

Use `Healthy`, `Needs attention`, `Unavailable`, and `Checking` with icon plus text. Do not show raw environment variables, keys, prompts, or media paths in copied diagnostics unless the user explicitly includes them.

### Updates

- current version;
- stable/beta channel when supported;
- automatic download/install preference;
- check for updates;
- update state and progress;
- release notes;
- restart to update;
- rollback only if the application genuinely supports it.

### About

- Ralphy name, mark, version, and build;
- Electron, OS, architecture, and Ralphy CLI version;
- open-source repository and documentation links;
- license;
- third-party notices;
- copy version information.

Keep About factual. Product positioning belongs to onboarding and the website.

## Provider and integration detail pattern

Do not render editable API-key fields for every service in one long table.

Use:

1. overview list with health and capability summary;
2. provider detail page, sheet, or nested route;
3. explicit connect/setup flow;
4. returned connected state with redacted credential source;
5. test and recovery actions.

Detail routes maintain a predictable Back path to their category. Closing Settings with an unsaved credential draft requires confirmation. Disconnecting lists affected chats, models, schedules, or workspaces when known.

## Empty, unavailable, and error states

### No providers connected

Explain what the category enables and offer one `Connect provider` action. Do not show a wall of empty credential fields.

### Feature not supported in this build

Explain the missing contract or platform requirement. If there is no recovery or useful preview, omit the control from production rather than presenting an `Unavailable` switch.

### Preference could not save

Keep the visible previous value, show the error at the row, and offer retry. Do not optimistically leave a control in a state that was not persisted.

### Provider disconnected

Preserve non-sensitive configuration and show whether reconnect, login, new key, runtime update, or installation is required.

### Path missing or unwritable

Name the path, impact, and actions: locate, choose another, restore default, or repair permission.

### Settings schema newer or corrupted

Keep a recoverable backup, load safe defaults, and offer diagnostics or import. Do not silently erase preferences.

## Accessibility and desktop interaction

- Sidebar, search, rows, disclosures, selects, provider detail, keybinding recording, and dialogs are fully keyboard accessible.
- Provide `Skip to settings content` for users navigating past a long sidebar.
- Focus moves to the page heading after category navigation and to the target row after search.
- Returning from a provider detail restores focus to its source row.
- Every icon-only action has an accessible label and tooltip.
- Switch labels use the visible row title; state is not conveyed by color alone.
- Disabled controls expose why they are disabled and the available recovery path.
- Descriptions and secondary text meet contrast requirements in both themes.
- Support 200% zoom, long localized strings, long paths, long model IDs, and keyboard-only use.
- Respect reduced motion. Page changes use restrained 150–300 ms transitions without blocking input.
- Do not rely on hover to expose required actions.
- Minimum pointer targets should be approximately 32 px for dense desktop rows, with larger hit areas where space allows.
- Search results and asynchronous status changes use restrained live announcements.

## Visual direction

Use the existing Ralphy desktop design system:

- quiet dark surfaces with a supported light/system counterpart;
- compact rows and subtle separators;
- one consistent icon family;
- small status marks with text;
- monospaced treatment for paths, versions, model IDs, environment names, and shortcuts;
- limited accent usage for active selection and primary actions;
- danger color only for real risk;
- consistent card radius and row height;
- no nested card around every individual control.

The Codex reference is useful for information hierarchy, not for exact spacing, colors, labels, or product categories.

Avoid:

- oversized empty canvas with tiny isolated controls;
- a single undifferentiated provider table;
- decorative gradients or dashboard cards;
- branding every provider row with competing colors;
- settings that are really navigation to normal workspace work;
- irreversible action on the first click;
- fake controls for roadmap features;
- global Save/Cancel for unrelated autosaved preferences;
- unexplained `Automatic`, `Unavailable`, or `Default` labels.

## Required design frames

### V1 frames

1. Settings shell — grouped sidebar, General page, and `This Mac` scope
2. Search — query results across several pages and jump-to-row highlight
3. Search — useful no-results state
4. Appearance — theme, density, motion, and accessibility states
5. Keyboard shortcuts — searchable command list with changed bindings
6. Keybinding recorder — valid shortcut
7. Keybinding conflict — replace, keep when non-overlapping, or choose another
8. Agents — mixed Connected, Needs login, Unavailable, and Update required states
9. Agent detail — model default, runtime health, authentication, and effective permissions
10. Generation providers — overview without inline secret fields
11. Generation-provider setup — secure key, test, failure, and connected states
12. Storage & media — disk breakdown and safe cache cleanup
13. Permissions & privacy — high-risk settings with clear impact
14. Terminal & environment — detected shell, PATH health, and link to shortcuts
15. Diagnostics — checking, healthy, failed, repair, and support-bundle states
16. Narrow window and 200% zoom behavior
17. Autosave failure and explicit-action success feedback

### Later/vision frames

18. Voice — microphone permission, input test, and transcription privacy
19. Local runtime — hardware health, model storage, and concurrency
20. Publishing — Postiz connection and affected-workspace disconnect warning
21. Integrations — connected, available, and needs-attention filtering
22. Automation — global pause, concurrency, recovery, and Calendar/Activity link
23. Notifications — OS permission and per-event preferences
24. Import preview — conflicts, excluded secrets, and restart requirements
25. Updates — downloading, ready to restart, failed, and beta-channel states

## V1 product cut

Prioritize settings backed by existing or near-term contracts:

- shell and grouped navigation;
- real full-row search;
- General;
- local Profile;
- Appearance;
- Keyboard shortcuts backed by a command registry;
- existing agent and generation-provider connections, clearly separated;
- Terminal & environment;
- Permissions summary for capabilities that already exist;
- Diagnostics for actual detectable dependencies;
- About and Updates when update APIs exist.

Defer UI for voice, sophisticated local-runtime control, publishing connections, integrations, automation, notifications, import/export, and storage migration until their persistence and action contracts are real. Keep their information architecture reserved in this document, not necessarily visible in the first release.

## Current implementation limitations

As of this handoff:

- General, Profile, Appearance, Provider, and Terminal values are largely component-local state;
- startup preferences explicitly report no persisted preference in the current release;
- provider keys in the current Settings component are mock session values and are not persisted;
- search matches category labels only;
- no settings registry supports row-level search or deep links;
- no central keyboard-command registry or editable keybinding persistence is represented by the current screen;
- agent provider state exists elsewhere in the chat path and is not yet unified with this Settings UI;
- secure credential storage, diagnostics, imports, notifications, updates, and workspace override contracts are incomplete or not represented here.

The design must not present these target states as functional until their contracts exist.

## Product/backend contracts required

The target design benefits from a settings registry where each entry can report:

- stable setting ID;
- page and section;
- title, description, and search keywords;
- global, device, secure, provider-managed, or workspace-overridable scope;
- control type;
- current and default value;
- persistence and validation state;
- capability or platform availability;
- restart requirement;
- sensitivity/redaction policy;
- deep-link target.

Additional contracts:

- typed preference read/write with failure recovery;
- secure credential IPC that never returns complete stored secrets to the renderer;
- provider and integration capability/health discovery;
- global command registry with default and user keybindings, contexts, conflict detection, and import/export;
- path selection and verified storage migration;
- permission status and macOS recovery links;
- redacted diagnostics and support-bundle export;
- workspace override visibility without editing workspace state;
- update status and restart-to-update flow when supported.

## Non-goals

- Editing workspace identity, brand rules, Memory contents, members, social-account assignment, or publishing policy
- Browsing or installing Marketplace items or local models
- Browsing chat history, Runs, Units, Documents, Media, or Calendar content
- Showing every environment variable or complete credential
- Building a billing page before a billing product exists
- Recreating macOS System Settings inside Ralphy
- Treating all providers as capability-equivalent
- Adding preferences for behavior that has no persistence or runtime contract
- Making shortcuts the only way to invoke an action

## Product principle

Settings should feel like a reliable control room for Ralphy, not a warehouse of switches.

> Global behavior is easy to find, machine state is honest, credentials are protected, workspace policy stays with the workspace, and every advanced control explains its scope and consequence.
