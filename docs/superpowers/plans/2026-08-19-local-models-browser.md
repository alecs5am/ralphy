# Local Models Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the global Local Models browser from the design handoff with live Hugging Face and Civitai metadata plus an evidence-based comfort assessment for this Mac.

**Architecture:** The Electron main process owns provider HTTP calls, input validation, runtime discovery, and the machine/model comfort calculation. The renderer receives normalized, untrusted text and media URLs through the existing preload bridge and renders the supplied Browse, Installed, detail, and downloads states inside the existing application shell. Download, install, and workflow invocation are outside this release and their controls remain honest about that boundary.

**Tech Stack:** Electron 43, React 19, TypeScript, Lucide React, existing `marked`-based safe Markdown renderer, Vitest, native Node OS/filesystem APIs.

**Spec:** `docs/design/local-models-ui-handoff.md` and `/Users/maximovchinnikov/Downloads/Ralphy дизайн система (5).zip`

## Global Constraints

- Work only in `ralphy-desktop`; preserve every unrelated dirty-worktree change.
- Use Bun and existing dependencies; add no package.
- Provider descriptions and Markdown remain untrusted and are never injected as HTML.
- A comfort verdict must name memory, disk, package size, and runtime evidence; it must not claim an inference measurement.
- Provider media URLs are accepted only from Hugging Face and Civitai hosts.
- Download, install, removal, and model use do not mutate local state in this release.

---

### Task 1: Normalized provider and comfort service

**Files:**
- Create: `electron/local-models.ts`
- Modify: `electron/media/types.ts`
- Test: `tests/local-models-service.test.ts`

**Interfaces:**
- Produces: `searchLocalModels(input): Promise<LocalModelCatalog>`, `loadLocalModelDetail(ref): Promise<LocalModelDetail>`, `assessModelComfort(model, machine): LocalModelComfort`, and normalized shared bridge types.
- Consumes: Hugging Face `/api/models` plus raw `README.md`, Civitai `/api/v1/models`, Node `os`, `fs.statfs`, and optional Ollama `/api/tags` inventory.

- [ ] **Step 1: Write failing normalization and comfort tests**

  Test literal provider responses and assert that a 10 GB GGUF on a 36 GB machine with Ollama is comfortable, a 42 GB package is incompatible, missing package bytes are unknown, unsafe preview hosts are removed, and README text remains Markdown.

- [ ] **Step 2: Run the focused test and verify the missing module failure**

  Run: `bun run test tests/local-models-service.test.ts`

- [ ] **Step 3: Implement the minimum service**

  Normalize real provider fields, choose one safe recommended package, calculate required memory by workload/format, compare it with total memory and free disk, detect required runtimes, and return an evidence array with the comfort tier.

- [ ] **Step 4: Re-run the focused test**

  Run: `bun run test tests/local-models-service.test.ts`

### Task 2: Secure Electron bridge

**Files:**
- Modify: `electron/preload.ts`
- Modify: `electron/main.ts`
- Modify: `src/lib/ipc.ts`
- Modify: `electron/media/types.ts`
- Modify: `tests/ipc-security.test.ts`

**Interfaces:**
- Produces: `window.ralphy.searchLocalModels`, `loadLocalModelDetail`, `refreshLocalModelMachine`, and `openExternal` for validated provider URLs.
- Consumes: Task 1 service functions.

- [ ] **Step 1: Add failing bridge exposure and invalid-input tests**

  Assert the methods exist in the preload bridge and main handlers reject unknown providers, oversized queries, malformed model IDs, and non-HTTP provider URLs.

- [ ] **Step 2: Run the focused security test and verify failure**

  Run: `bun run test tests/ipc-security.test.ts`

- [ ] **Step 3: Register the minimal validated handlers**

  Add four IPC channels and route them through the existing trusted-sender and main-process validation pattern.

- [ ] **Step 4: Re-run service and IPC tests**

  Run: `bun run test tests/local-models-service.test.ts tests/ipc-security.test.ts`

### Task 3: High-fidelity global Local Models UI

**Files:**
- Create: `src/screens/LocalModelsScreen.tsx`
- Create: `src/styles/local-models.css`
- Create: `public/assets/providers/huggingface.svg`
- Create: `public/assets/providers/civitai.svg`
- Create: `public/assets/providers/modelscope.svg`
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/ContextSidebar.tsx`
- Modify: `index.html`
- Test: `tests/local-models-screen.test.tsx`
- Test: `tests/workspace-navigation.test.tsx`

**Interfaces:**
- Produces: the global Browse/Installed screen, filters, sorting, detail window, downloads drawer, provider previews, responsive 1440/1280 layouts, and keyboard/focus behavior.
- Consumes: Task 2 bridge methods and existing Lucide icons, design tokens, dither masks, Markdown renderer, sidebar, and profile controls.

- [ ] **Step 1: Write failing renderer behavior tests**

  Assert that opening Local Models preserves the workspace shell, search receives focus, provider results are a real list, filters clear, sorting cycles, detail opens and closes with Escape, README Markdown renders without HTML execution, and the comfort evidence is visible.

- [ ] **Step 2: Run the focused renderer tests and verify failure**

  Run: `bun run test tests/local-models-screen.test.tsx tests/workspace-navigation.test.tsx`

- [ ] **Step 3: Implement the supplied visual hierarchy and interactions**

  Recreate the fixed surfaces, typography, spacing, squircle radii, rows, machine strip, modal rail, provider previews, active-filter chips, empty/error states, and narrow layout using existing design tokens and no new dependency.

- [ ] **Step 4: Re-run renderer and design-system tests**

  Run: `bun run test tests/local-models-screen.test.tsx tests/workspace-navigation.test.tsx tests/design-system.test.ts`

### Task 4: Production verification and adversarial review

**Files:**
- Modify only files implicated by verified review findings.

**Interfaces:**
- Consumes: complete implementation and supplied handoff.
- Produces: a packaged app visually checked at 1440×900 and 1280×800 with no P1/P2 review findings.

- [ ] **Step 1: Run repository validation**

  Run: `bun run typecheck && bun run test && bun run build && git diff --check`

- [ ] **Step 2: Package and inspect both target window sizes**

  Run the existing macOS package command, open Local Models, exercise Browse, filters, detail, Installed, and the downloads drawer, and capture screenshots at 1440×900 and 1280×800.

- [ ] **Step 3: Dispatch two independent adversarial reviewers**

  Give both reviewers the handoff, prototype files, implementation diff, screenshots, and test commands. One reviews visual fidelity and interaction coverage; the other reviews API trust boundaries and comfort-score honesty.

- [ ] **Step 4: Reproduce and fix every P1/P2 finding with a failing test first**

  Re-run the focused test for each finding, then repeat the full validation command.
