import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { MarketplaceScreenView } from "../src/screens/MarketplaceScreen";
import { MarketplaceBrowse } from "../src/screens/marketplace/MarketplaceBrowse";
import {
  MarketplaceUnavailableCollection,
  MarketplaceUnavailableCreator,
  MarketplaceUnavailableDetail,
  MarketplaceUnavailablePublish,
} from "../src/screens/marketplace/MarketplaceUnavailableViews";
import type { MarketplaceSnapshot } from "../src/screens/marketplace/presentation";
import type {
  MarketplaceCategory,
  MarketplaceLocation,
  MarketplaceQueryState,
} from "../src/state/marketplace-navigation";
import { createReactHost } from "./react-host";

const query: MarketplaceQueryState = {
  text: "",
  filters: { category: "all", source: "all", license: "all", compatibility: "all", modality: "all", format: "all" },
  sort: "relevance",
};

const unavailableReasons: Record<"prompts" | "components" | "skills", string> = {
  prompts: "Prompt catalog is unavailable from the current contract",
  components: "Component catalog is unavailable from the current contract",
  skills: "Skill catalog is unavailable from the current contract",
};

function snapshot(overrides: Partial<Extract<MarketplaceSnapshot, { status: "ready" }>> = {}): Extract<MarketplaceSnapshot, { status: "ready" }> {
  const categories: Extract<MarketplaceSnapshot, { status: "ready" }>["categories"] = ([
    ["models", "Models"],
    ["templates", "Templates"],
    ["recipes", "Recipes"],
    ["prompts", "Prompts"],
    ["components", "Components & Effects"],
    ["skills", "Skills"],
  ] as const).map(([category, label]) => ({
    category,
    label,
    purpose: `${label} purpose`,
    count: category === "prompts" || category === "components" || category === "skills"
      ? { status: "unavailable", reason: unavailableReasons[category] }
      : { status: "ready", value: 0 },
    catalog: category === "prompts" || category === "components" || category === "skills" ? "unavailable" : "ready",
  }));
  return {
    status: "ready",
    items: [],
    categories,
    machine: null,
    publicSource: null,
    sourceErrors: [],
    sourceHealth: { publicLibrary: "ready", models: "ready" },
    refreshing: false,
    query,
    ...overrides,
  };
}

function browse(category: MarketplaceCategory, value = snapshot()) {
  return renderToStaticMarkup(<MarketplaceBrowse
    route={{ kind: "category", category }}
    snapshot={value}
    onOpenItem={() => undefined}
    onOpenCategory={() => undefined}
    onOpenLibrary={() => undefined}
    onOpenUnavailableDetail={() => undefined}
    onRetry={() => undefined}
    onClearQuery={() => undefined}
    onClearFilters={() => undefined}
  />);
}

function detail(category: "prompts" | "components" | "skills") {
  return renderToStaticMarkup(<MarketplaceUnavailableDetail category={category} />);
}

describe("Marketplace unavailable surfaces", () => {
  test("keeps unsupported categories distinct from an empty supported result", () => {
    const unsupported = browse("prompts");
    expect(unsupported).toContain("Prompt catalog is unavailable from the current contract");
    expect(unsupported).toContain("Review unavailable Prompt details");
    expect(unsupported).toContain("No sample items are shown as production catalog records");
    expect(unsupported).not.toContain("0 items");

    const empty = browse("prompts", snapshot({
      categories: snapshot().categories.map((category) => category.category === "prompts"
        ? { ...category, count: { status: "ready", value: 0 }, catalog: "ready" }
        : category),
    }));
    expect(empty).toContain("No results");
    expect(empty).not.toContain("Prompt catalog is unavailable");
  });

  test("renders the complete Prompt inventory without inventing a prompt", () => {
    const markup = detail("prompts");
    for (const text of [
      "Prompt catalog is unavailable without a Prompt catalog contract",
      "What it gives you",
      "Preview or example",
      "Use when",
      "Do not use when",
      "Compatibility",
      "What will be added",
      "Permissions and access",
      "Prompt body",
      "Variables",
      "Filled example",
      "Expected output shape",
      "Version and provenance",
      "Works with",
      "Used by",
      "Usage backlinks are unavailable",
    ]) expect(markup).toContain(text);
    for (const contract of [
      "Prompt preview and example evidence contract",
      "Prompt applicability contract",
      "Prompt negative-scope contract",
      "Prompt permission and access manifest",
      "Prompt provenance evidence contract",
      "Marketplace usage-backlink contract",
      "Prompt output-shape contract",
    ]) expect(markup).toContain(contract);
    expect(markup).not.toContain("from the current contract");
    expect(markup).not.toMatch(/prompt name|v\d|MIT|Apache|CC-BY|downloads|rating/i);
  });

  test("renders the complete Component inventory without a synthetic specimen", () => {
    const markup = detail("components");
    for (const text of [
      "Component catalog is unavailable without a Component catalog contract",
      "Live preview unavailable",
      "Aspect ratios",
      "Duration behavior",
      "Dependencies",
      "Exposed controls",
      "Accessibility notes",
      "Integration method",
      "Works with",
      "Used by",
    ]) expect(markup).toContain(text);
    expect(markup).not.toMatch(/kinetic|lower third|1920|1080|duration:\s*\d|CC-BY/i);
  });

  test("renders the complete Skill trust inventory without claiming runs, files, or permissions", () => {
    const markup = detail("skills");
    for (const text of [
      "Skill catalog is unavailable without a Skill catalog contract",
      "Previewing a Skill never executes it",
      "Example runs",
      "Workflow and triggers",
      "SKILL.md",
      "references/",
      "scripts/",
      "Agent and model compatibility",
      "Tools and access",
      "Files and manifest",
      "Installation scope and mode",
      "Version and provenance",
    ]) expect(markup).toContain(text);
    expect(markup).not.toMatch(/example run #|\.md\s+\d+\s*(?:KB|MB)|network:\s+https|Codex\s+supported|v\d/i);
  });

  test("keeps each type review entry focusable, reason-linked, and inert until Task 8", async () => {
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const review = vi.fn();
    try {
      await act(async () => root.render(<MarketplaceUnavailableDetail category="prompts" />));
      const button = host.container.querySelectorAll("button").find((candidate) => candidate.textContent === "Review use in chat");
      expect(button).not.toBeUndefined();
      expect(button!.disabled).toBe(false);
      expect(button!.getAttribute("aria-disabled")).toBe("true");
      const reasonId = button!.getAttribute("aria-describedby");
      expect(reasonId).not.toBeNull();
      expect(document.getElementById(reasonId!)?.textContent).toContain("target enumeration and attachment contracts");
      button!.focus();
      expect(document.activeElement).toBe(button);
      await act(async () => {
        button!.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
        button!.dispatchEvent(Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key: "Enter" }));
        button!.dispatchEvent(Object.assign(new Event("keyup", { bubbles: true, cancelable: true }), { key: " " }));
      });
      expect(review).not.toHaveBeenCalled();

      await act(async () => root.render(<MarketplaceUnavailableDetail category="prompts" onReview={review} />));
      const connected = host.container.querySelectorAll("button").find((candidate) => candidate.textContent === "Review use in chat")!;
      expect(connected.getAttribute("aria-disabled")).toBeNull();
      await act(async () => connected.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
      expect(review).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("renders honest collection, creator, and publishing contribution shells", () => {
    const collection = renderToStaticMarkup(<MarketplaceUnavailableCollection />);
    const creator = renderToStaticMarkup(<MarketplaceUnavailableCreator />);
    const publish = renderToStaticMarkup(<MarketplaceUnavailablePublish />);
    expect(collection).toContain("Community collection contract is unavailable");
    expect(creator).toContain("Creator identity and published-item contracts are unavailable");
    expect(publish).toContain("Publishing requires identity, validation, licensing, moderation, and versioning contracts");
    for (const markup of [collection, creator, publish]) {
      expect(markup.match(/<button/g)).toHaveLength(1);
      expect(markup).toContain('aria-disabled="true"');
      expect(markup).not.toMatch(/Short-form|starter stack|@creator|followers|reviews|\b\d+ items\b/i);
    }
  });

  test("opens the read-only contribution shells from a real Discover control", async () => {
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const navigate = vi.fn();
    const location: MarketplaceLocation = {
      route: { kind: "discover" },
      query,
      selectedItemId: null,
      scrollTop: 74,
      focusId: "marketplace-heading",
    };
    try {
      await act(async () => root.render(<MarketplaceScreenView catalog={null} location={location} sidebarVisible snapshot={snapshot()} onBack={() => undefined} onNavigate={navigate} onRememberLocation={() => undefined} onRetry={() => undefined} />));
      const entry = host.container.querySelectorAll("button").find((button) => button.textContent?.includes("Community contributions"));
      expect(entry).not.toBeUndefined();
      await act(async () => entry!.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
      expect(navigate).toHaveBeenCalledWith({
        ...location,
        route: { kind: "collection" },
        selectedItemId: null,
        scrollTop: 0,
        focusId: "marketplace-heading",
      });
      await act(async () => root.render(<MarketplaceScreenView catalog={null} location={{ ...location, route: { kind: "collection" }, scrollTop: 0 }} sidebarVisible snapshot={snapshot()} onBack={() => undefined} onNavigate={navigate} onRememberLocation={() => undefined} onRetry={() => undefined} />));
      expect(host.container.textContent).toContain("Community collection contract is unavailable");
      expect(host.container.textContent).toContain("Creator identity and published-item contracts are unavailable");
      expect(host.container.textContent).toContain("Publishing requires identity, validation, licensing, moderation, and versioning contracts");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("gives every unavailable-detail origin a bounded stable collision-free id", () => {
    const ids = (["prompts", "components", "skills"] as const).map((category) => {
      const markup = browse(category);
      return markup.match(/<button[^>]+id="([^"]+)"[^>]*>Review unavailable/)?.[1];
    });
    expect(ids).toEqual([
      "marketplace-unavailable-detail-origin-prompts",
      "marketplace-unavailable-detail-origin-components",
      "marketplace-unavailable-detail-origin-skills",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id !== undefined && id.length <= 256)).toBe(true);
  });

  test("remembers and restores the exact unavailable-detail origin through Back", async () => {
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const navigate = vi.fn();
    const remember = vi.fn();
    const back = vi.fn();
    const categoryLocation: MarketplaceLocation = {
      route: { kind: "category", category: "skills" },
      query: { ...query, filters: { ...query.filters, category: "skills" } },
      selectedItemId: null,
      scrollTop: 0,
      focusId: "marketplace-heading",
    };
    try {
      await act(async () => root.render(<MarketplaceScreenView catalog={null} location={categoryLocation} sidebarVisible snapshot={snapshot()} onBack={back} onNavigate={navigate} onRememberLocation={remember} onRetry={() => undefined} />));
      expect(host.container.querySelector("input")?.getAttribute("aria-label")).toBe("Search Marketplace");
      const inspect = host.container.querySelectorAll("button").find((button) => button.textContent === "Review unavailable Skill details")!;
      const originId = inspect.getAttribute("id")!;
      expect(originId).toBe("marketplace-unavailable-detail-origin-skills");
      await act(async () => inspect.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
      expect(remember).toHaveBeenCalledWith({ focusId: originId });
      expect(remember.mock.invocationCallOrder[0]).toBeLessThan(navigate.mock.invocationCallOrder[0]!);
      expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ route: { kind: "unavailable-detail", category: "skills" }, selectedItemId: null, scrollTop: 0, focusId: "marketplace-heading" }));

      await act(async () => root.render(<MarketplaceScreenView catalog={null} location={{ ...categoryLocation, route: { kind: "unavailable-detail", category: "skills" } }} sidebarVisible snapshot={snapshot()} onBack={back} onNavigate={navigate} onRememberLocation={remember} onRetry={() => undefined} />));
      const backButton = host.container.querySelectorAll("button").find((button) => button.textContent === "Back to Skills")!;
      await act(async () => backButton.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
      expect(back).toHaveBeenCalledTimes(1);

      await act(async () => root.render(<MarketplaceScreenView catalog={null} location={{ ...categoryLocation, focusId: originId }} sidebarVisible snapshot={snapshot()} onBack={back} onNavigate={navigate} onRememberLocation={remember} onRetry={() => undefined} />));
      expect((document.activeElement as HTMLElement).getAttribute("id")).toBe(originId);
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });
});
