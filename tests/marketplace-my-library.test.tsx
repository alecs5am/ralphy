import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { LocalModelMachine } from "../electron/media/types";
import { MarketplaceMyLibrary } from "@/pages/marketplace/ui/MarketplaceMyLibrary";

const machine: LocalModelMachine = {
  platform: "macOS",
  architecture: "arm64",
  cpu: "Apple M3 Max",
  totalMemoryBytes: 36 * 1024 ** 3,
  freeDiskBytes: 214 * 1024 ** 3,
  runtimes: [{ id: "ollama", label: "Ollama 0.6.2", available: true, detail: "Detected" }],
  installed: [{
    id: "qwen2.5-coder:14b",
    name: "Qwen2.5 Coder 14B",
    runtime: "ollama",
    digest: "sha256:9c1f4ab",
    bytes: 10.5 * 1024 ** 3,
    format: "GGUF Q5_K_M",
    updatedAt: "2026-08-16T10:00:00Z",
  }],
};

describe("Marketplace My Library", () => {
  test("uses the real Ollama inventory for installed models", () => {
    const markup = renderToStaticMarkup(<MarketplaceMyLibrary section="installed" machine={machine} installedItems={[]} workspaceName="UX Testing Lab" onOpenItem={() => undefined} />);
    expect(markup).toContain("Installed on this Mac");
    expect(markup).toContain("Registered in Ollama");
    expect(markup).toContain("Qwen2.5 Coder 14B");
    expect(markup).not.toContain("Diffusers local");
  });

  test("distinguishes unavailable saved, added, forked, download, update, and attention state", () => {
    const saved = renderToStaticMarkup(<MarketplaceMyLibrary section="saved" machine={machine} installedItems={[]} workspaceName="UX Testing Lab" onOpenItem={() => undefined} />);
    const added = renderToStaticMarkup(<MarketplaceMyLibrary section="added" machine={machine} installedItems={[]} workspaceName="UX Testing Lab" onOpenItem={() => undefined} />);
    const downloads = renderToStaticMarkup(<MarketplaceMyLibrary section="downloads" machine={machine} installedItems={[]} workspaceName="UX Testing Lab" onOpenItem={() => undefined} />);
    const updates = renderToStaticMarkup(<MarketplaceMyLibrary section="updates" machine={machine} installedItems={[]} workspaceName="UX Testing Lab" onOpenItem={() => undefined} />);
    const attention = renderToStaticMarkup(<MarketplaceMyLibrary section="attention" machine={machine} installedItems={[]} workspaceName="UX Testing Lab" onOpenItem={() => undefined} />);
    expect(saved).toContain("Saved items are unavailable because there is no persistent saved-state contract");
    expect(saved).toContain("Local forks are unavailable because there is no persistent fork-state contract");
    expect(added).toContain("Added items are unavailable because there is no persistent workspace/project addition-state contract");
    expect(downloads).toContain("Downloads are unavailable because there is no persistent background-download contract");
    expect(updates).toContain("Current version");
    expect(updates).toContain("Proposed version");
    expect(updates).toContain("Local modifications");
    expect(attention).toContain("Needs attention is unavailable because there is no persistent attention-state contract");
    expect([saved, added, downloads, updates, attention].join("\n")).not.toMatch(/0 saved|0 added|0 downloads|0 updates/i);
  });
});
