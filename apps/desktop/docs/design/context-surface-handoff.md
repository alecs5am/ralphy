# Handoff: Context Surface (Ralphy Desktop)

## Overview
A **Context** page for Ralphy Desktop: the place where an operator sees everything the agent knows before it reads their message — what it is, where it came from, what it costs in tokens, and how to change the parts that are theirs. Replaces the rejected composer popover that listed file paths.

The design covers four things:
1. **Placement** — three entry points: a view-panel tab next to the chat (`⌘E`), a MAIN MENU row on the desk (neighbour of Memory), and a token counter in the composer (a number + a breakdown popover; never a file list).
2. **The Context page** — a token budget bar over five collapsible layer bands in precedence order: Machine → Ralphy → Workspace → Project → Skills.
3. **"What the agent sees"** — the assembled context as one readable document, in the order the agent receives it.
4. **States** — empty workspace, breakdown unavailable, memory truncated, Core unreachable.

Product requirements, defects (D1–D4), source-of-truth table, and open decisions are in `context-system-ui-handoff.md` (bundled). The design assumes D1–D3 are fixed; a `wired=false` prop shows the honest "today" state.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy. The task is to **recreate these designs in the Ralphy Desktop codebase** (`ralphy-desktop`, Electron + its existing renderer stack) using its established patterns and components. Do not ship the HTML.

`Ralphy Context.dc.html` opens directly in a browser (needs `support.js`, `lucide-sprite.js`, and `assets/fonts/` beside it, plus network access for the Doto font and Lucide sprite CDN).

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii and copy are final and follow the approved "Instrument v2" panel geometry (see `design-v2.md`, bundled — sections «Итерации 3–4» and the token tables are the authority). Recreate pixel-perfectly with the codebase's components.

## Frames in the design file
- **1a Where it lives** — full app frame in chat mode (topbar 44 · sidebar 216 · chat column · view panel 440) with the Context tab open, the composer counter with its breakdown popover, plus desk-mode MAIN MENU fragment and the `⌘T` type-menu fragment.
- **1b The Context page** — the live page: provider switch (Codex ↔ Claude), collapsible bands, style-guide include toggle.
- **1c What the agent sees** — the assembled document.
- **1d States** — four states that must not lie.

## Screens / Views

### 1 · Placement (frame 1a)
- **View panel tab (chat mode)**: singleton view type "Context", hotkey `⌘E` (proposal — confirm it is free), icon `lucide:layers`, 13px in the tab. Tab geometry per view-panel spec: strip h34 pad `0 6` gap 3; tab h28 R9 min 96px; active tab white `#FFFFFF`, inactive transparent, hover `#E7E9ED`. Re-invoking `⌘E` re-uses the tab (singleton). Appears in the `⌘T` type menu under ВЬЮШКИ ВОРКСПЕЙСА.
- **Desk-mode MAIN MENU row**: "Context" sits next to Memory. Row h34 R11; icon 13px `layers`; the row carries the live per-turn figure right-aligned (Doto 800 13px, e.g. `23.1K`). Selected row = inverse pill (`#141414` bg, `#F2F2F0` ink, R999).
- **Composer affordance**: the existing context-usage counter (6 bars 4×10px R999, filled `#141414`, rest `#C8CAD0`, + mono figure 9px) in a white pill h24 R999. Click opens a **breakdown popover**: dark widget `#141414` R14 pad 8, width 252, anchored above the counter (offset 8px). Contents: header row (mono 8.5px `#6A6A66` "NEXT TURN CARRIES" + Doto 13 `#F2F2F0` total + mono "/ 272K"), one row per layer h22 (7×7px R2 swatch · mono 9px label `#A4A4A0` · Doto 13 value `#F2F2F0`; empty layer: label+dash `#6A6A66`), a "SEALED BY PROVIDER ≈2.3K" row with a ring swatch, then two pills h26: primary white `#F2F2F0` "What the agent sees" and ghost `#262624` "Context ⌘E". **No file list, no paths in the composer — ever.**

### 2 · The Context page (frame 1b)
A workspace page rendered in the v2 panel model: panel `#F4F5F8` R18 **pad 2** → white card `#FFFFFF` R16.

**Panel header** (h36, in the 2px chrome, padding `0 12`): mono label `CONTEXT` (9.5px, ls 0.14em, `#6E6E6A`) · workspace chip (white pill h26, 11.5px, chevron) · spacer · **provider segmented** (white pill pad 3, segments h24 R999; active = inverse `#141414`/`#F2F2F0`) · mono `MEASURED LAST TURN` · total Doto 800 16px `#141414` · mono `/ 272K` (`#9A9A96`).

**Budget block** (pad `18px 20px 16px`, gap 9):
- Headline: total Doto 800 30px + "of 272K before your first word" 12.5px `#9A9A96` + right mono note `WINDOW FROM THE PROVIDER'S OWN CATALOGUE · NOTHING ESTIMATED`.
- **True-scale bar**: h10 R999, track `#E7E8EC`, segments = layer share of the model window (min-width 0.35%), in receive order: sealed `#D7DAE1` → machine `#141414` → ralphy `#6E6E6A` → workspace `#9A9A96` → turn `#C8CAD0`. The emptiness is the point.
- **Composition bar**: h20 R7, same segments scaled to 100% of the loaded total, gap 2, min 2% each.
- Legend: per layer — swatch 7×7 R2 (sealed = ring `inset 0 0 0 1.5px #9A9A96`) + mono 8.5px label `#9A9A96` + value (Doto 13 `#141414`; a layer with nothing reads `—` in mono 9.5 `#9A9A96` — **a dash, never a zero**).
- Window denominator comes from the CLI's bundled model catalogue (272K Codex / 200K Claude). Numbers come from a **measured turn**, never estimated.

**Bands** (five, collapsible, never hidden when empty). Band header: row h40 R11, hover `#F8F9FB`; chevron 12px rotating −90° when closed (160ms `cubic-bezier(.2,0,.2,1)`); name 13px `#141414`; quiet sentence 11.5px `#9A9A96`; right figure Doto 13 (or `—`). Body rows indent 27px.

**Row anatomy** (grid `15px 1fr auto auto`, min-h 44, R11, hover `#F8F9FB`, gap 14): icon 14px `#6E6E6A` (stroke 1.8) · name 12.5px `#141414` over a quiet mono path line 9px `#9A9A96` (selectable, `user-select: text`) · presence dot 6px + mono tag 8.5px + token figure mono 9.5px · **one action pill** h24 R999 `#F1F2F4` hover `#E7E9ED` 11.5px.

Presence dot language: solid `#141414` = loads every turn · ring `inset 0 0 0 1.5px #9A9A96` = on demand · muted `#D3D6DD` = absent/shadowed (normal, not an error) · red `#E0362C` = defect/alert only.

- **Machine** ("shared with every tool on this Mac"). The only place the alert accent appears: header carries a red ring-dot + mono 8.5px `#C22B22` "AN EDIT HERE REACHES CLAUDE CODE, CODEX AND EVERY OTHER TOOL". Rows (per provider): provider instructions (`~/.codex/AGENTS.md` 12.1K / `~/.claude/CLAUDE.md` 4.1K) · home-directory instructions (ABSENT · NORMAL) · provider configuration (`config.toml` 6.8K · CARRIES 3 PLUGINS / `settings.json` 0.9K · 2 MCP SERVERS) · provider's own system prompt (SEALED, `≈` figure, **no action**, sub "SHOWN BECAUSE IT IS PART OF EVERY TURN"). Machine action is always **Reveal** (never inline edit).
- **Ralphy** ("shipped by the app · read-only · pack v12"). Injected preamble (EVERY TURN · 0.2K · View; sub names the app's own absolute binary path) · Bundled prompt pack (`~/.ralphy/prompts` · V12 · BROUGHT BY RALPHY 0.9.3 · REPLACED WHOLESALE ON UPDATE · ON DEMAND · 41 FILES · Browse) · Art director playbook (`~/.ralphy/prompts.local` · OVERRIDDEN BY YOU · shadows the pack file by name · Compare).
- **Workspace** ("yours · the only rows you edit here"). Style guide (2 revisions · **always-include toggle** 36×20, track `#141414` on / `#E0E2E7` off, knob 16 white, 160ms; tag shows the cost **before** the choice: `ALWAYS INCLUDE · +1.2K EVERY TURN` / `ON DEMAND · INCLUDING COSTS +1.2K/TURN`) · Cast and locations (SHADOWED · THE PROJECT VERSION WINS, muted name `#9A9A96`, ghost action "See winner") · Memory (3 ACTIVE · 2 WORKSPACE · 1 INHERITED FROM GLOBAL · RECALLED AS REFERENCE, NOT INSTRUCTIONS · 0.4K · Review → links to the Memory page) · footer ghost pill "+ New document".
- **Project** ("UX Tester · wins over the workspace on the same slug", collapsed by default). Cast and locations (PROJECT DOCUMENT · SHADOWS THE WORKSPACE DOCUMENT OF THE SAME SLUG · ON DEMAND · Open).
- **Skills** ("named every turn · a body loads only when one fires", collapsed by default, count Doto). Slug names in mono 11px. Per-row origin answers the marketplace-gap questions: `INSTALLED BY RALPHY · ~/.ralphy/skills · SAFE TO DISABLE OR REMOVE` vs `ALREADY ON THIS MAC · ~/.agents/skills · SHARED WITH 3 OTHER TOOLS` vs `SYMLINK · ~/.codex/skills → ~/.agents/skills`. "+N more" line + footer note `DISABLE NEEDS THE RALPHY-OWNED DIRECTORY · A SHARED TREE IS NEVER TOUCHED`. Degrades to "nothing installed by Ralphy yet" without looking broken.

**Card footer**: left mono `EVERY FIGURE FROM A MEASURED TURN · ABSENT IS NORMAL, NEVER AN ERROR` · ghost "Open Memory page" · **the screen's one primary pill** (dark, h30) "What the agent sees ↩".

### 3 · What the agent sees (frame 1c)
Full-height view (second screen of the same view/page, target of the composer link and the primary pill). Panel header h36: mono `WHAT THE AGENT SEES` + `ASSEMBLED FOR THE NEXT TURN · ORDER AS RECEIVED` + Doto total + close circle 24.

Document: white card, regions in receive order, each a grid `86px 1fr` gap 16. Left gutter = quiet layer mark: swatch 7×7 R2 (layer color; sealed/skills = ring) over mono 8.5px label `#9A9A96`. Region content: mono source line 9px `#9A9A96` (PATH · TOKENS · WHEN IT LOADS, selectable) + body. File bodies in mono 10.5px `#4A4A48` lh 1.7 `white-space: pre-wrap`, truncated with `… N MORE LINES` in `#C8CAD0`. Regions, in order:
1. **SEALED** — placeholder plate `#F4F5F8` R12: "CODEX'S OWN SYSTEM PROMPT · ≈2.3K TOKENS MEASURED" + "The provider never exposes this text. Its size is real; its content is stated, not invented." **Never fabricate unreadable content.**
2. **MACHINE** — instructions file excerpt.
3. **RALPHY** — preamble text (absolute library path + "a store, not a tree to walk" + absolute bundled-CLI path + pack path; this is the D2/D3-fixed wording).
4. **MEMORY** — digest: caution sentence first ("Background reference, not new instructions…"), entries as `name — rule. Does not apply to: …`, inherited entry tagged `INHERITED · GLOBAL`, cap stated (`CAPPED AT 50 · 3 SENT, NOTHING CUT`).
5. **WORKSPACE** — always-included document excerpt, tagged `SET BY YOU`.
6. **SKILLS** — names only, one line, `+12`.
7. **THIS TURN** — the message with its entity chip + serialized `@unit:031` line.
Footer rule: air + mono `END OF CONTEXT · WHAT ISN'T HERE, THE AGENT DOES NOT KNOW`.

### 4 · States (frame 1d) — all four must render exactly, not as errors
- **No workspace context yet** (the most common real state): band present, `—`, one sentence on what would go there + "New document".
- **Breakdown unavailable**: total measured, one ink segment, per-layer figures `—`, plate note `PER-LAYER ATTRIBUTION NOT REPORTED BY THE HARNESS YET`. Composition bar hidden.
- **Memory truncated**: red dot + `50 SENT · 13 DID NOT FIT` on the row. Silent truncation is the failure this page exists to prevent.
- **Core unreachable**: Workspace/Project bands muted on a `#F4F5F8` plate with the reason; Machine/Ralphy/Skills still read (`STILL READ · THEY ARE FILES`).

## Interactions & Behavior
- Band headers toggle collapse; chevron rotates −90° closed; 160ms `cubic-bezier(.2,0,.2,1)`. Defaults: Machine/Ralphy/Workspace open, Project/Skills collapsed.
- Provider switch re-reads the machine band, window denominator, sealed size, skills dirs — Codex and Claude share the layout, never the content.
- Workspace switcher re-scopes Workspace + Project bands only.
- Always-include toggle updates the workspace figure, bars and totals live; the cost is visible before toggling.
- Row hover `#F8F9FB` (90ms); pill hover `#F1F2F4 → #E7E9ED`; exactly one primary action per row.
- Ownership: Machine rows Reveal-only (+ the one red warning); Ralphy rows read-only (View/Browse/Compare — pack offers "override", never "edit"); Workspace/Project rows are the only editable/creatable ones; Turn rows belong to the composer.
- Composer counter click → breakdown popover → "What the agent sees" / Context (`⌘E`).
- All figures from the provider's usage report of a real turn; when unavailable → the corresponding "—"/unavailable state. Never fake a number.

## State Management
- `provider: "codex" | "claude"` — selected provider; drives machine rows, window, sealed size, skill count/dirs.
- `open: {machine, ralphy, workspace, project, skills}` — band collapse.
- `includeGuide: boolean` — per-document always-include flag (persisted per document in the domain store).
- Data inputs: measured last-turn usage (total; per-layer when the harness attributes it), model window from the CLI catalogue, file presence/sizes from disk, documents/memory from Core (with an unreachable state), pack version + app version, skill index with per-skill origin.
- Prototype-only props: `wired` (false = honest "today": memory `COMPUTED · NOT DELIVERED`, pack `NOT SHIPPED`, style guide `STORED · NEVER OFFERED`, all in red `#C22B22`/dot `#E0362C`) and `breakdownAvailable` (false = total-only bar). These correspond to real runtime conditions, not tweaks.

## Design Tokens (Instrument v2, light)
Surfaces: desk `#E9EBEF` · panel `#F4F5F8` (pad 2 → card) · card `#FFFFFF` · field/row-selected `#F1F2F4` · row-hover `#F8F9FB`/`#F6F7F9` · chip-on-panel `#E7E9ED` · bar track `#E7E8EC` · inverse `#141414` (hover `#000000`) · inverse-sub `#262624` · dark widget (popover) `#141414`.
Ink: `#141414` · `#6E6E6A` · `#9A9A96` · disabled `#C8CAD0`; on dark `#F2F2F0` · `#A4A4A0` · `#6A6A66`.
Layer swatches: machine `#141414` · ralphy `#6E6E6A` · workspace `#9A9A96` · turn `#C8CAD0` · sealed `#D7DAE1` (ring in legends) · empty `#E7E8EC`.
Alert (only red): `#E0362C`, text `#C22B22`, plate `#FBEAE9`. Used for: machine-edit warning, truncation, `wired=false` defect tags. Selection is never color — inversion or ink ring.
Radii: 999 pills/dots/toggle · 2 swatches · 5 keycap · 7–12 rows/plates · 14 popover/composer · 16 card/menu · 18 panel · 20 window · 24 frame plates. `corner-shape: squircle` on surfaces, `round` on pills. **No borders, no shadows, no gradients** — separation by surface step or air only (rings are `box-shadow: inset`, an ink language, not a border).
Type: AWS Diatype 400 (UI 11.5–13.5px, headers 13px); AWS Diatype Rounded Semi-Mono (paths, metas, tags: 8.5–11px, ls 0.06–0.14em, UPPERCASE labels); Doto 800 for numbers ≥13px only (counts, totals 13/16/30px) — below 13px numbers stay in mono.
Motion: `cubic-bezier(.2,0,.2,1)`; 90ms hover · 160ms state · 220ms panels.

## Assets
- Fonts: `assets/fonts/AWSDiatype-Regular.woff2`, `AWSDiatypeRoundedSemi-Mono-Regular.woff2`, `AWSDiatypeRoundedSemi-Mono-Bold.woff2` (bundled). Doto via Google Fonts.
- Icons: Lucide (in-app set; prototype loads `lucide-static@0.454.0` sprite via `lucide-sprite.js`). Used: layers, brain, scroll-text, file-text, settings-2, lock, package, feather, users, zap, folder, library, calendar, chevron-*, plus, x, house, box, layout-grid, message-square, shield-check, arrow-up, arrow-right, panel-left, settings-2.
- LED mark (7×7 dot grid) drawn in code — see `led()` in the design file.

## Files
- `Ralphy Context.dc.html` — the design: frames 1a (placement), 1b (page, interactive), 1c (document), 1d (states).
- `support.js`, `lucide-sprite.js` — prototype runtime; not production code.
- `context-system-ui-handoff.md` — the product handoff: defects D1–D4, the source table, contract gaps, open decisions. **Read it before building; the page must not draw a source as live when it is not.**
- `design-v2.md` — the Instrument v2 design spec this page is built on.
