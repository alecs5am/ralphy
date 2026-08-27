import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { CatalogResult } from "../electron/media/types";
import { bridge } from "@/shared/api/ipc";
import { MarketplaceScreenView } from "@/pages/marketplace/ui/MarketplaceScreen";
import {
  MarketplaceActionReview,
  MarketplaceDownloads,
  MarketplaceTargetChooser,
  marketplaceTargets,
  type MarketplaceDownloadPresentation,
  type MarketplaceWorkflowKind,
} from "@/pages/marketplace/ui/MarketplaceWorkflows";
import type { WorkbenchRoute } from "@/shared/model/workbench";
import type { MarketplaceLocation, MarketplaceQueryState } from "@/pages/marketplace/model/navigation";
import type { MarketplaceSnapshot } from "@/pages/marketplace/lib/presentation";
import { createReactHost, type HostNode } from "./react-host";

const marketplaceStyles = readFileSync(new URL("../src/app/styles/marketplace.css", import.meta.url), "utf8");
const resetStyles = readFileSync(new URL("../src/app/styles/reset.css", import.meta.url), "utf8");
// The workflow window styles itself in markup now, so the contract this file used to read out of
// the stylesheet is read out of the component that declares it.
const workflowSource = readFileSync(new URL("../src/pages/marketplace/ui/MarketplaceWorkflows.tsx", import.meta.url), "utf8");
const detailChromeSource = readFileSync(new URL("../src/pages/marketplace/lib/detail-chrome.ts", import.meta.url), "utf8");

const catalog: CatalogResult = {
  rootPath: "/Users/demo/.ralphy",
  generation: 8,
  completedAt: "2026-08-20T10:00:00.000Z",
  mediaItemCount: 0,
  workspaces: [{
    id: "ws_6afaf432-6794-400c-b50a-e8b640c20cd2",
    name: "UX Testing Lab",
    description: "",
    absolutePath: "/Users/demo/.ralphy/workspaces/ux-testing-lab",
    projectCount: 2,
    sharedCount: 0,
    unitCount: 0,
    finalCount: 0,
    recentActivity: "",
  }, {
    id: "ws_other",
    name: "Studio",
    description: "",
    absolutePath: "/Users/demo/.ralphy/workspaces/studio",
    projectCount: 1,
    sharedCount: 0,
    unitCount: 0,
    finalCount: 0,
    recentActivity: "",
  }],
  projects: [{
    id: "project-row-1",
    workspaceId: "ws_6afaf432-6794-400c-b50a-e8b640c20cd2",
    projectId: "prj_89992c84-d007-4a72-9261-a6df04e715b1",
    name: "UX Tester",
    brief: "",
    status: "active",
    phase: null,
    finalState: "",
    platform: null,
    aspectRatio: null,
    spendUsd: null,
    finalCount: 0,
    sharedCount: 0,
    unitCount: 0,
    recentActivity: "",
  }, {
    id: "project-row-2",
    workspaceId: "ws_other",
    projectId: "prj_other",
    name: "Campaign",
    brief: "",
    status: "active",
    phase: null,
    finalState: "",
    platform: null,
    aspectRatio: null,
    spendUsd: null,
    finalCount: 0,
    sharedCount: 0,
    unitCount: 0,
    recentActivity: "",
  }],
};

const currentProject: WorkbenchRoute = {
  kind: "project",
  workspaceId: "ws_6afaf432-6794-400c-b50a-e8b640c20cd2",
  projectId: "prj_89992c84-d007-4a72-9261-a6df04e715b1",
};

const otherProject: WorkbenchRoute = {
  kind: "project",
  workspaceId: "ws_other",
  projectId: "prj_other",
};

const query: MarketplaceQueryState = {
  text: "",
  filters: { category: "skills", source: "all", license: "all", compatibility: "all", modality: "all", format: "all" },
  sort: "relevance",
};

const snapshot: Extract<MarketplaceSnapshot, { status: "ready" }> = {
  status: "ready",
  items: [],
  categories: (["models", "templates", "recipes", "prompts", "components", "skills"] as const).map((category) => ({
    category,
    label: category,
    purpose: `${category} purpose`,
    count: category === "prompts" || category === "components" || category === "skills"
      ? { status: "unavailable", reason: `${category} catalog unavailable` }
      : { status: "ready", value: 0 },
    catalog: category === "prompts" || category === "components" || category === "skills" ? "unavailable" : "ready",
  })),
  machine: null,
  publicSource: null,
  sourceErrors: [],
  sourceHealth: { publicLibrary: "ready", models: "ready" },
  refreshing: false,
  query,
};

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => vi.restoreAllMocks());

describe("Marketplace workflow targets", () => {
  test("projects only the exact target kinds from named catalog records", () => {
    const model = marketplaceTargets(catalog, currentProject, "model-download");
    const prompt = marketplaceTargets(catalog, currentProject, "prompt-use");
    const skill = marketplaceTargets(catalog, currentProject, "skill-install");
    expect(model).toMatchObject({ projectOptions: [], contextProjectLabel: null });
    expect(model.unavailableScopes.map(({ kind }) => kind)).toEqual(["computer"]);
    expect(prompt).toMatchObject({ projectOptions: [], contextProjectLabel: null });
    expect(prompt.unavailableScopes.map(({ kind }) => kind)).toEqual(["chat"]);
    expect(skill).toMatchObject({ projectOptions: [], contextProjectLabel: "UX Testing Lab / UX Tester" });
    expect(skill.unavailableScopes.map(({ kind }) => kind)).toEqual(["agent"]);

    for (const workflow of ["template-target", "recipe-target", "component-target"] as const) {
      const targets = marketplaceTargets(catalog, currentProject, workflow);
      expect(targets.projectOptions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "project:ws_6afaf432-6794-400c-b50a-e8b640c20cd2:prj_89992c84-d007-4a72-9261-a6df04e715b1",
          contextLabel: "UX Testing Lab / UX Tester",
          current: true,
          compatible: true,
          compatibilityBasis: "project-target",
        }),
      ]));
      expect(targets.unavailableScopes).toEqual([]);
    }

    const fromCurrent = marketplaceTargets(catalog, currentProject, "template-target").projectOptions;
    const fromOther = marketplaceTargets(catalog, otherProject, "template-target").projectOptions;
    expect(fromOther.map(({ current: _current, ...option }) => option)).toEqual(fromCurrent.map(({ current: _current, ...option }) => option));
    expect(fromOther.map(({ current }) => current)).not.toEqual(fromCurrent.map(({ current }) => current));
    expect(marketplaceTargets(catalog, currentProject, "update-conflict")).toMatchObject({
      projectOptions: [],
      unavailableScopes: [],
      targetUnavailableReason: "Update target is unavailable without persistent installed-version and local-modification state",
    });
  });

  test("omits orphan projects and never exposes paths or opaque IDs as chooser labels", () => {
    const orphan = { ...catalog.projects[0]!, id: "orphan-row", workspaceId: "ws_missing", projectId: "prj_orphan", name: "Orphan" };
    const targets = marketplaceTargets({ ...catalog, projects: [...catalog.projects, orphan] }, currentProject, "recipe-target");
    expect(targets.projectOptions.map(({ id }) => id)).toContain("project:ws_6afaf432-6794-400c-b50a-e8b640c20cd2:prj_89992c84-d007-4a72-9261-a6df04e715b1");
    expect(targets.projectOptions.map(({ id }) => id)).not.toContain("project:ws_missing:prj_orphan");
    expect(JSON.stringify(targets)).not.toMatch(/\/Users\/|absolutePath|rootPath|ralphy\.db/i);

    const chooser = renderToStaticMarkup(<MarketplaceTargetChooser targets={targets} onCancel={() => undefined} />);
    expect(chooser).toContain("UX Testing Lab / UX Tester");
    expect(chooser).toContain("Studio / Campaign");
    for (const path of [catalog.rootPath, ...catalog.workspaces.map(({ absolutePath }) => absolutePath)]) expect(chooser).not.toContain(path);
    for (const { id } of targets.projectOptions) expect(chooser).not.toContain(id);
  });
});

describe("Marketplace non-mutating action reviews", () => {
  test("keeps portal workflow buttons visibly focusable outside the Marketplace screen", () => {
    // The window is portalled out of the route, so a ring scoped to the screen or to the chooser
    // could never be the thing that draws it. reset.css paints the one 2px ring on every
    // :focus-visible, unscoped, which is what reaches these buttons.
    expect(resetStyles).toMatch(/:focus-visible\s*\{\s*outline:\s*var\(--focus-ring\)/);
    expect(marketplaceStyles).not.toContain('[data-instrument-overlay="target-chooser"] button:focus-visible');
    expect(marketplaceStyles).not.toContain(".marketplace-screen button:focus-visible");
    // ...and these controls stand on a light window, so they must not take the on-instrument
    // ring, which is the near-white ring meant for a control on a black widget.
    expect(workflowSource).not.toContain("outline-focus-on-instrument");
    // A control on the black hero does take it, in both themes.
    expect(detailChromeSource).toContain("focus-visible:outline-focus-on-instrument");
  });

  test("uses an opaque semantic dialog surface and readable compact state tokens", () => {
    // The window names its own opaque surface and ink; the stylesheet keeps only the positioned
    // overlay element the registry renders, which takes no className from here.
    // The registry's managed surface is the window rim now, so this route brings the titlebar and
    // the card and no second rim. It still states the theme ink itself -- the workflow is
    // portalled outside the work-mode scope.
    expect(workflowSource).toMatch(/const SHELL = "marketplace-workflow-window[^"]*\btext-ink\b[^"]*"/);
    expect(workflowSource).not.toMatch(/const SHELL = [^\n]*\$\{WINDOW\}/);
    expect(workflowSource).toMatch(/const SHELL_CARD = `marketplace-workflow-card \$\{WINDOW_BODY\}`/);
    expect(workflowSource).toContain('from "@/shared/ui/Window"');
    expect(marketplaceStyles).toMatch(/\[data-instrument-overlay="target-chooser"\]\s*\{[^}]*position:\s*fixed/s);
    expect(marketplaceStyles).not.toContain("var(--sidebar)");
    expect(marketplaceStyles).not.toContain("box-shadow");
    expect(marketplaceStyles).not.toContain("backdrop-filter");
    expect(workflowSource).toContain("text-muted");
    expect(workflowSource).toContain("text-on-instrument-muted");
  });

  test("connects an unsupported detail review to the real target matrix without enabling a mutation", async () => {
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const location: MarketplaceLocation = {
      route: { kind: "unavailable-detail", category: "skills" },
      query,
      selectedItemId: null,
      scrollTop: 0,
      focusId: "marketplace-heading",
    };
    try {
      await act(async () => { root.render(<MarketplaceScreenView catalog={catalog} workRoute={currentProject} location={location} sidebarVisible snapshot={snapshot} onBack={() => undefined} onNavigate={() => undefined} onRememberLocation={() => undefined} onRetry={() => undefined} />); await settle(); });
      const review = host.container.querySelectorAll("button").find((node) => node.textContent === "Review install")!;
      expect(review.getAttribute("aria-disabled")).toBeNull();
      await act(async () => { review.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })); await settle(); });
      const dialog = (document.body as unknown as HostNode).querySelector("[role=dialog]")!;
      expect(dialog.textContent).toContain("Current project context · UX Testing Lab / UX Tester");
      expect(dialog.textContent).toContain("Agent targets cannot be enumerated");
      const final = dialog.querySelectorAll("button").find((node) => node.textContent === "Install unavailable")!;
      expect(final.getAttribute("aria-disabled")).toBe("true");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("renders type-specific evidence and keeps every final action focusable and unavailable", () => {
    const expected: Record<MarketplaceWorkflowKind, string[]> = {
      "model-download": ["Compatibility preflight", "License and access", "Download plan", "Runtime installation", "Load test"],
      "template-target": ["Project target", "Pinned version", "What will be added"],
      "recipe-target": ["Project target", "Artifact and parameters", "Apply plan"],
      "prompt-use": ["Chat target", "Prompt body and variables", "Use in chat is unavailable without target enumeration and attachment contracts"],
      "component-target": ["Project target", "Package files", "Controls and accessibility", "Adding is unavailable without a Core mutation contract"],
      "skill-install": ["Bundle", "Agent target", "Scope", "Installation mode", "Files", "Tools and shell", "Network", "Credentials"],
      "update-conflict": ["Current version", "Proposed version", "Local modifications", "Keep current", "Fork local", "Replace local"],
    };
    const reviews = (Object.keys(expected) as MarketplaceWorkflowKind[]).map((kind) => renderToStaticMarkup(
      <MarketplaceActionReview
        kind={kind}
        targets={marketplaceTargets(catalog, currentProject, kind)}
        itemLabel={kind === "model-download" ? "Qwen 14B" : null}
        onCancel={() => undefined}
      />,
    ));
    for (const [index, kind] of (Object.keys(expected) as MarketplaceWorkflowKind[]).entries()) {
      for (const text of expected[kind]) expect(reviews[index]).toContain(text);
      expect(reviews[index]).toContain("Saving is unavailable without a persistent saved-state contract");
      expect(reviews[index]).toContain("The final action is disabled");
      expect(reviews[index]).toContain("aria-disabled=\"true\"");
    }
  });

  test("groups active, failed, and completed jobs with accessible progress semantics", () => {
    const presentation: MarketplaceDownloadPresentation = { availability: "ready", jobs: [
      { id: "one", label: "Qwen 14B", state: "active", progress: 62, nextAction: "Wait for verification" },
      { id: "two", label: "Wan 5B", state: "failed", progress: null, nextAction: "Review provider access" },
      { id: "three", label: "Flux", state: "completed", progress: 100, nextAction: "Open installed model" },
    ] };
    const markup = renderToStaticMarkup(<MarketplaceDownloads presentation={presentation} />);
    for (const text of ["Active", "Needs attention", "Completed", "Qwen 14B", "Wan 5B", "Flux", "Wait for verification", "Review provider access", "Open installed model"]) expect(markup).toContain(text);
    expect(markup).toContain("<progress");
    expect(markup).toContain("value=\"62\"");
    expect(markup).toContain("value=\"100\"");
    expect(markup).toContain("lucide-loader-circle");
    expect(markup).toContain("aria-label=\"Qwen 14B download progress: 62%\"");
    expect(markup).toContain("aria-label=\"Flux download progress: 100%\"");
  });

  test("cancels on Escape and scrim click, restores focus, and never invokes a bridge mutation", async () => {
    const copy = vi.spyOn(bridge, "copyText");
    const host = createReactHost();
    const origin = document.createElement("button") as unknown as HostNode;
    origin.textContent = "Open review";
    (document.body as unknown as HostNode).appendChild(origin);
    origin.focus();
    function Harness() {
      const [open, setOpen] = useState(true);
      return open ? <MarketplaceActionReview kind="recipe-target" targets={marketplaceTargets(catalog, currentProject, "recipe-target")} itemLabel="Voxel dither" onCancel={() => setOpen(false)} /> : null;
    }
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<Harness key="scrim" />); await settle(); });
      const body = document.body as unknown as HostNode;
      const dialog = body.querySelector("[role=dialog]")!;
      expect(dialog).not.toBeNull();
      expect(dialog.contains(document.activeElement as unknown as HostNode)).toBe(true);
      expect(document.activeElement).toBe(dialog);
      const final = dialog.querySelectorAll("button").find((node) => node.textContent.includes("Apply"))!;
      expect(final.getAttribute("aria-disabled")).toBe("true");
      await act(async () => {
        final.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
        final.dispatchEvent(Object.assign(new Event("keydown", { bubbles: true }), { key: "Enter" }));
        await settle();
      });
      expect(copy).not.toHaveBeenCalled();

      const escape = new Event("keydown", { bubbles: true, cancelable: true });
      Object.defineProperty(escape, "key", { value: "Escape" });
      await act(async () => { dialog.dispatchEvent(escape); await settle(); });
      expect(body.querySelector("[role=dialog]")).toBeNull();
      expect(document.activeElement).toBe(origin);

      await act(async () => { root.render(<Harness key="reopen" />); await settle(); });
      const close = body.querySelector(".marketplace-workflow-header button")!;
      await act(async () => { close.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })); await settle(); });
      expect(body.querySelector("[role=dialog]")).toBeNull();
      expect(copy).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });
});
