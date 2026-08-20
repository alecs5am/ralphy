import { useState } from "react";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { ArtifactMediaCardDto } from "../electron/ralphy/types";
import { bridge } from "../src/lib/ipc";
import { SharedLibraryScreen } from "../src/screens/SharedLibraryScreen";
import {
  SharedLibraryWorkflows,
  SHARED_ARTIFACT_ROLES,
  type SharedLibrarySuggestion,
  type SharedLibraryWorkflowKind,
} from "../src/screens/shared-library/SharedLibraryWorkflows";
import { presentSharedArtifact, type Availability } from "../src/screens/shared-library/presentation";
import { createReactHost, type HostNode } from "./react-host";

function artifact(): ArtifactMediaCardDto {
  return {
    ref: { type: "artifact", id: "artifact-1" },
    workspaceId: "workspace-1",
    projectId: null,
    slug: "brand-hook",
    kind: "audio-hook",
    selectedRevisionId: "revision-1",
    selectedState: "approved",
    mime: "audio/mpeg",
    bytes: 2_048,
    selectedAt: Date.parse("2026-08-18T10:00:00.000Z"),
    revisionCount: 3,
    selectedObjectId: "object-1",
    storageClass: "durable",
    usageRoles: ["opening hook"],
    target: { type: "object", id: "object-1" },
    mediaKind: "audio",
    provenance: "generation",
  };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function button(root: HostNode, text: string): HostNode {
  const found = root.querySelectorAll("button").find((node) => node.textContent === text);
  if (!found) throw new Error(`Button not found: ${text}`);
  return found;
}

function buttonContaining(root: HostNode, text: string): HostNode {
  const found = root.querySelectorAll("button").find((node) => node.textContent.includes(text));
  if (!found) throw new Error(`Button not found containing: ${text}`);
  return found;
}

function buttonByAria(root: HostNode, label: string): HostNode {
  const found = root.querySelectorAll("button").find((node) => node.getAttribute("aria-label") === label);
  if (!found) throw new Error(`Button not found by label: ${label}`);
  return found;
}

async function click(node: HostNode) {
  await act(async () => { node.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
}

const unavailableSuggestions: Availability<SharedLibrarySuggestion[]> = {
  status: "unavailable",
  reason: "Metadata suggestions are unavailable from this Core version because Core exposes no suggestion evidence.",
};

async function mountWorkflow(kind: SharedLibraryWorkflowKind, suggestions: Availability<SharedLibrarySuggestion[]> = unavailableSuggestions) {
  const host = createReactHost();
  const origin = document.createElement("button") as unknown as HostNode;
  origin.textContent = "origin";
  (document.body as unknown as HostNode).appendChild(origin);
  origin.focus();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  function Harness() {
    const [open, setOpen] = useState(true);
    const props = {
      kind,
      artifact: presentSharedArtifact(artifact()),
      suggestions,
      returnFocus: origin as unknown as HTMLElement,
      onClose: () => setOpen(false),
    };
    return open ? <SharedLibraryWorkflows {...props} /> : null;
  }
  await act(async () => { root.render(<Harness />); await settle(); });
  await act(async () => { await settle(); });
  return { host, root, origin, body: document.body as unknown as HostNode };
}

afterEach(() => vi.restoreAllMocks());

describe("Shared Library non-mutating workflows", () => {
  test("walks the complete Add inventory locally and keeps the final mutation unavailable", async () => {
    const mounted = await mountWorkflow("add");
    try {
      const dialog = mounted.body.querySelector("[role=dialog]")!;
      expect(dialog.textContent).toContain("Add artifact");
      for (const step of ["Source", "Duplicates", "Describe for reuse", "Confirm"]) expect(dialog.textContent).toContain(step);
      expect(dialog.textContent).toContain("Upload cannot persist with this Core version");
      for (const source of ["Upload new file", "Promote from project", "Import from asset pool", "Add external reference"]) expect(dialog.textContent).toContain(source);
      expect(dialog.textContent).toContain("Accepted types · unavailable from the current Core upload contract");
      expect(dialog.textContent).toContain("Maximum size · unavailable from the current Core upload contract");
      expect(dialog.querySelectorAll("input")).toHaveLength(1);
      expect(dialog.textContent).toContain("Drop a file here or choose with the accessible picker");
      const unavailableSources = dialog.querySelectorAll("button").filter((node) => node.getAttribute("data-unavailable-source") !== null);
      expect(unavailableSources).toHaveLength(3);
      expect(unavailableSources.every((control) => control.getAttribute("aria-disabled") === "true" && !!control.getAttribute("aria-describedby"))).toBe(true);
      const drop = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(drop, "dataTransfer", { value: { files: [{ name: "dropped.wav", type: "audio/wav", size: 1_024 }] } });
      await act(async () => { dialog.querySelector(".shared-workflow-source")!.dispatchEvent(drop); await settle(); });
      expect(dialog.textContent).toContain("dropped.wav");
      expect(drop.defaultPrevented).toBe(true);
      const picker = dialog.querySelectorAll("input")[0] as HostNode & { files: Array<{ name: string; type: string; size: number }> };
      picker.files = [{ name: "brand-mark.svg", type: "image/svg+xml", size: 2_048 }];
      await act(async () => { picker.dispatchEvent(new Event("change", { bubbles: true })); await settle(); });
      expect(dialog.textContent).toContain("brand-mark.svg");
      expect(dialog.textContent).toContain("image/svg+xml · 2.0 KB");
      expect(dialog.querySelector(".shared-workflow-local-preview")?.getAttribute("aria-label")).toBe("Local confirmation preview");
      expect(dialog.querySelectorAll(".shared-workflow-primary")).toHaveLength(1);

      await click(button(dialog, "Continue to duplicates"));
      expect(dialog.textContent).toContain("Content hash comparison is unavailable from this Core version");
      await click(button(dialog, "Continue to describe"));
      for (const field of ["Title", "Role", "Purpose", "Use when", "Rights status"]) expect(dialog.textContent).toContain(field);
      expect([...SHARED_ARTIFACT_ROLES]).toEqual([
        "Canonical character", "Character reference", "Location", "Product", "Logo or brand mark", "Color or style reference",
        "Universal sound hook", "Music bed", "Sound effect", "Voice reference", "Font", "Prop", "Recurring footage",
        "Intro or outro", "Overlay or texture", "Document reference", "Other",
      ]);
      expect(button(dialog, "Not documented").getAttribute("aria-pressed")).toBe("true");
      await click(button(dialog, "Continue to confirm"));
      expect(dialog.textContent).toContain("Needs context");
      expect(dialog.textContent).toContain("Proposed rights · Not documented");
      expect(dialog.textContent).toContain("Nothing has been saved");
      const final = button(dialog, "Add to Shared Library unavailable");
      expect(final.disabled).toBe(true);
      expect(dialog.querySelector(`#${final.getAttribute("aria-describedby")}`)?.textContent).toMatch(/current Core version/i);
      expect(dialog.querySelectorAll(".shared-workflow-primary")).toHaveLength(1);
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("reveals a free-text role only for Other in Add and Promote", async () => {
    for (const kind of ["add", "promote"] as const) {
      const mounted = await mountWorkflow(kind);
      try {
        const dialog = mounted.body.querySelector("[role=dialog]")!;
        if (kind === "add") {
          await click(buttonContaining(dialog, "Describe for reuse"));
        }
        expect(dialog.querySelectorAll("input").find((node) => node.getAttribute("aria-label") === "Other role")).toBeUndefined();
        const select = dialog.querySelectorAll("select")[0] as HostNode & { value: string };
        if (!select) throw new Error(`Role select missing in ${kind}`);
        select.value = "Other";
        await act(async () => { select.dispatchEvent(new Event("change", { bubbles: true })); await settle(); });
        expect(dialog.querySelectorAll("input").find((node) => node.getAttribute("aria-label") === "Other role")).toBeDefined();
      } finally {
        await act(async () => mounted.root.unmount());
        mounted.host.restore();
      }
    }
  });

  test.each([
    ["promote", ["Source project artifact", "Workspace meaning", "Added to Shared Library · the existing project remains pinned to its current artifact.", "No promotion has occurred"]],
    ["duplicate", ["Same content identity", "Reuse the existing artifact", "Add as a new revision", "Create a separate artifact", "Content hash comparison is unavailable from this Core version"]],
    ["suggestions", ["Suggested from file content", "Metadata suggestions are unavailable from this Core version because Core exposes no suggestion evidence.", "NOT SUGGESTED", "Licence, consent and identity are never inferred", "Universal-use rules"]],
    ["archive", ["Archive impact", "Active references", "Historical references", "Projects affected", "Units affected", "Currently canonical", "File state", "Replacement for future work", "Nothing is deleted", "reversible"]],
    ["update-review", ["Revision update review", "Update compatible usages", "Keep current revision", "Open usage for review", "backlinks and compatibility evidence are unavailable"]],
  ] as const)("renders the complete %s inventory without pretending Core evidence exists", async (kind, inventory) => {
    const mounted = await mountWorkflow(kind);
    try {
      const dialog = mounted.body.querySelector("[role=dialog]")!;
      for (const item of inventory) expect(dialog.textContent).toContain(item);
      expect(dialog.textContent).toContain("This workflow cannot persist because the current Core version");
      expect(dialog.querySelectorAll("button").filter((node) => /shared-workflow-(?:primary|warning)/.test(node.getAttribute("class") ?? ""))).toHaveLength(1);
      const final = dialog.querySelectorAll("button").find((node) => /shared-workflow-(?:primary|warning)/.test(node.getAttribute("class") ?? ""))!;
      expect(final.disabled).toBe(true);
      expect(dialog.textContent).not.toContain("Update all");
      if (kind === "archive") {
        expect(final.getAttribute("class")).toContain("shared-workflow-warning");
        expect(final.getAttribute("class")).not.toContain("danger");
      }
      if (kind === "suggestions") {
        expect(dialog.querySelectorAll(".shared-workflow-suggestion")).toHaveLength(4);
        expect(dialog.querySelectorAll(".shared-workflow-suggestion").every((row) => row.textContent.includes("Unavailable from this Core version"))).toBe(true);
        expect(dialog.querySelectorAll("button").filter((node) => /^(?:Accept|Reject) /.test(node.textContent)).every((node) => node.disabled)).toBe(true);
        expect(dialog.textContent).not.toMatch(/rooftop|EXIF|matches existing artifacts/i);
      }
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("requires a local reason for a separate duplicate and reviews AI suggestions per field", async () => {
    const duplicate = await mountWorkflow("duplicate");
    try {
      await click(buttonContaining(duplicate.body, "Create a separate artifact"));
      const reason = duplicate.body.querySelectorAll("input").find((node) => node.getAttribute("required") !== null);
      expect(reason).not.toBeNull();
      expect(duplicate.body.textContent).toContain("Reason required");
    } finally {
      await act(async () => duplicate.root.unmount());
      duplicate.host.restore();
    }

    const suggestions = await mountWorkflow("suggestions", { status: "ready", value: [
      { field: "Title", value: "Three-note sonic logo", source: "from supplied audio-analysis evidence" },
      { field: "Media kind and role", value: "Audio · Brand signature", source: "from supplied MIME evidence" },
      { field: "Named entity", value: "Acme", source: "from supplied entity-analysis evidence" },
      { field: "Purpose", value: "Approved brand mnemonic", source: "from supplied audio-analysis evidence" },
    ] });
    try {
      const dialog = suggestions.body.querySelector("[role=dialog]")!;
      expect(dialog.querySelectorAll(".shared-workflow-suggestion")).toHaveLength(4);
      expect(dialog.textContent).toContain("Three-note sonic logo");
      expect(dialog.textContent).toContain("from supplied audio-analysis evidence");
      expect(dialog.textContent).not.toMatch(/rooftop|EXIF|matches existing artifacts/i);
      await click(button(dialog, "Accept Title suggestion"));
      await click(button(dialog, "Reject Purpose suggestion"));
      const reviewed = dialog.querySelectorAll(".shared-workflow-suggestion");
      expect(reviewed.find((row) => row.textContent.includes("Title"))?.textContent).toContain("Accepted locally for review");
      expect(reviewed.find((row) => row.textContent.includes("Purpose"))?.textContent).toContain("Rejected locally");
      expect(dialog.textContent).toContain("Suggestions are not canonical and nothing has been persisted");
    } finally {
      await act(async () => suggestions.root.unmount());
      suggestions.host.restore();
    }
  });

  test("uses a labelled modal, closes on Escape, and returns focus without calling a bridge", async () => {
    const calls = [
      vi.spyOn(bridge, "loadSharedLibraryPage"),
      vi.spyOn(bridge, "loadSharedLibraryArtifact"),
      vi.spyOn(bridge, "loadSharedLibraryRevisions"),
      vi.spyOn(bridge, "selectSharedLibraryRevision"),
      vi.spyOn(bridge, "performSharedLibraryAction"),
    ];
    const mounted = await mountWorkflow("archive");
    try {
      const dialog = mounted.body.querySelector("[role=dialog]")!;
      expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
      expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
      expect(dialog.contains(document.activeElement as unknown as HostNode)).toBe(true);
      const escape = new Event("keydown", { bubbles: true, cancelable: true });
      Object.defineProperty(escape, "key", { value: "Escape" });
      await act(async () => { document.dispatchEvent(escape); await settle(); });
      expect(mounted.body.querySelector("[role=dialog]")).toBeNull();
      expect(document.activeElement).toBe(mounted.origin);
      expect(calls.every((call) => call.mock.calls.length === 0)).toBe(true);
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("opens Add and Promote from the page and all artifact-specific previews without inventing audio suggestion evidence", async () => {
    vi.spyOn(bridge, "loadSharedLibraryPage").mockResolvedValue({ items: [artifact()], nextCursor: null });
    vi.spyOn(bridge, "loadSharedLibraryArtifact").mockResolvedValue(artifact());
    vi.spyOn(bridge, "loadSharedLibraryRevisions").mockResolvedValue({ items: [], nextCursor: null });
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockResolvedValue(null);
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    await act(async () => { root.render(<SharedLibraryScreen workspaceId="workspace-1" workspaceName="Studio" rootEpoch={1} />); await settle(); });
    await act(async () => { await settle(); });
    try {
      await click(button(host.container, "Add artifact"));
      expect((document.body as unknown as HostNode).textContent).toContain("Upload cannot persist with this Core version");
      await click(buttonByAria(document.body as unknown as HostNode, "Close Add artifact"));
      await click(button(host.container, "Promote from project"));
      expect((document.body as unknown as HostNode).textContent).toContain("Source project artifact");
      await click(buttonByAria(document.body as unknown as HostNode, "Close Promote from project"));

      await click(buttonByAria(host.container, "Select brand-hook identity and open inspector"));
      await click(button(host.container, "More workflow previews"));
      for (const [buttonText, dialogText] of [
        ["Preview duplicate workflow", "Same content identity"],
        ["Preview metadata suggestions", "Suggested from file content"],
        ["Preview archive impact", "Archive impact"],
        ["Preview revision update review", "Update compatible usages"],
      ]) {
        await click(button(host.container, buttonText));
        expect((document.body as unknown as HostNode).textContent).toContain(dialogText);
        if (buttonText === "Preview metadata suggestions") {
          const suggestionText = (document.body as unknown as HostNode).textContent;
          expect(suggestionText).toContain("Core exposes no suggestion evidence");
          expect(suggestionText).not.toMatch(/rooftop|EXIF|matches existing artifacts/i);
        }
        await click(buttonByAria(document.body as unknown as HostNode, `Close ${dialogText === "Same content identity" ? "Duplicate review" : dialogText === "Suggested from file content" ? "Suggested from file content" : dialogText === "Archive impact" ? "Archive impact" : "Revision update review"}`));
      }
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("disables and describes Add and Promote during the pre-effect bootstrap render", () => {
    const markup = renderToStaticMarkup(<SharedLibraryScreen workspaceId="workspace-1" workspaceName="Studio" rootEpoch={1} />);
    expect(markup.match(/disabled=""/g)).toHaveLength(2);
    expect(markup.match(/aria-describedby="shared-library-initializing-actions"/g)).toHaveLength(2);
    expect(markup).toContain("Workflow previews are unavailable while the Shared Library is initializing.");
  });
});
