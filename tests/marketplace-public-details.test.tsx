import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { bridge } from "../src/lib/ipc";
import { MarketplaceScreenView } from "../src/screens/MarketplaceScreen";
import { MarketplacePublicItemDetail } from "../src/screens/marketplace/MarketplacePublicItemDetail";
import type { MarketplacePublicItemDto } from "../electron/media/types";
import type { MarketplaceItemPresentation, MarketplaceSnapshot } from "../src/screens/marketplace/presentation";
import type { MarketplaceLocation, MarketplaceQueryState } from "../src/state/marketplace-navigation";
import { createReactHost, type HostNode } from "./react-host";

const query: MarketplaceQueryState = {
  text: "",
  filters: { category: "all", source: "all", license: "all", compatibility: "all", modality: "all", format: "all" },
  sort: "relevance",
};

const unavailable = (field: string) => ({ status: "unavailable" as const, reason: `${field} is unavailable from public-library schema 1.` });

const common = {
  summary: "Source-backed reusable outcome.",
  sourceLabel: "Ralphy public library · Live",
  version: unavailable("Version"),
  updatedAt: unavailable("Item update date"),
  license: unavailable("License"),
  publisherIdentity: unavailable("Publisher identity"),
  contentAudit: unavailable("Content audit status"),
  compatibility: unavailable("Compatibility"),
};

const template: Extract<MarketplaceItemPresentation, { category: "templates" }> = {
  ...common,
  key: "template:story-arc",
  category: "templates",
  name: "Story arc",
  template: {
    id: "story-arc",
    category: "template",
    name: "Story arc",
    summary: common.summary,
    referenceUrls: ["https://ralphy.b-cdn.net/blocks/template/story-arc.png"],
    recipe: null,
  },
};

const exactArtifact = '<script>alert("not html")</script>\nffmpeg -i in.mp4 -vf "crop=<width>:<height>" out.mp4';
const recipe: Extract<MarketplaceItemPresentation, { category: "recipes" }> = {
  ...common,
  key: "recipe:prompt-shaped",
  category: "recipes",
  name: "Prompt-shaped recipe",
  recipe: {
    id: "prompt-shaped",
    category: "recipe",
    name: "Prompt-shaped recipe",
    summary: common.summary,
    referenceUrls: [],
    recipe: {
      kind: "prompt",
      body: "## Source instructions\n\nRecipe body from source.",
      artifact: exactArtifact,
      parameters: { width: 1080, flags: ["safe", true] },
      demo: {
        kind: "media",
        storageUrl: "https://ralphy.b-cdn.net/blocks/recipe/demo.mp4",
        beforeUrl: "https://ralphy.b-cdn.net/blocks/recipe/before.png",
        afterUrl: "https://ralphy.b-cdn.net/blocks/recipe/after.png",
        posterUrl: "https://ralphy.b-cdn.net/blocks/recipe/poster.png",
      },
    },
  },
};

function location(item: MarketplaceItemPresentation): MarketplaceLocation {
  return { route: { kind: "detail", itemId: item.key }, query, selectedItemId: item.key, scrollTop: 0, focusId: "marketplace-heading" };
}

function snapshot(
  items: MarketplaceItemPresentation[],
  publicItems: MarketplacePublicItemDto[] = items.flatMap((item) => item.category === "templates" ? [item.template] : item.category === "recipes" ? [item.recipe] : []),
): Extract<MarketplaceSnapshot, { status: "ready" }> {
  return {
    status: "ready",
    items,
    categories: [],
    machine: null,
    publicSource: {
      schemaVersion: 1,
      source: "live",
      refreshedAt: "2026-08-20T10:00:00.000Z",
      sourceUpdatedAt: null,
      warning: null,
      items: publicItems,
    },
    sourceErrors: [],
    sourceHealth: { publicLibrary: "ready", models: "unavailable" },
    refreshing: false,
    query,
  };
}

function button(container: HostNode, label: string): HostNode {
  const match = container.querySelectorAll("button").find((node) => node.textContent === label);
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((next, fail) => { resolve = next; reject = fail; });
  return { promise, resolve, reject };
}

afterEach(() => vi.restoreAllMocks());

describe("Marketplace public item details", () => {
  test("renders every shared section and only source-backed Template evidence", () => {
    const markup = renderToStaticMarkup(<MarketplacePublicItemDetail item={template} onBack={() => undefined} />);
    for (const heading of [
      "What it gives you", "Preview or example", "Use when", "Do not use when", "Compatibility",
      "What will be added", "Permissions and access", "Version and provenance", "Works with", "Used by",
    ]) expect(markup).toContain(heading);
    for (const heading of [
      "Expected deliverable shape", "Scene structure", "Slots and variables", "Common model stack and assets",
      "Composition skeleton", "Examples and common failure modes",
    ]) expect(markup).toContain(heading);
    expect(markup).toContain("Scene structure is unavailable from public-library schema 1");
    expect(markup).toContain("License is unavailable from public-library schema 1");
    expect(markup).toContain('src="https://ralphy.b-cdn.net/blocks/template/story-arc.png"');

    const fallback = renderToStaticMarkup(<MarketplacePublicItemDetail item={{ ...template, template: { ...template.template, referenceUrls: [] } }} onBack={() => undefined} />);
    expect(fallback).toContain("Template reference preview is unavailable from public-library schema 1");
  });

  test("keeps prompt-kind records as Recipes and renders body, inert artifact, parameters, and source previews", () => {
    const markup = renderToStaticMarkup(<MarketplacePublicItemDetail item={recipe} onBack={() => undefined} />);
    expect(markup).toContain("Recipes");
    expect(markup).not.toContain("Prompts");
    expect(markup).toContain("Source instructions");
    expect(markup).toContain("Recipe body from source");
    expect(markup).toContain("Artifact");
    expect(markup).toContain("Named parameters");
    expect(markup).toContain("Required tools");
    expect(markup).toContain("Source-provided preview");
    expect(markup).toContain("Before");
    expect(markup).toContain("After");
    expect(markup).not.toContain("seed fixes composition, not pixels");
    expect(markup).toContain("&lt;script&gt;alert(&quot;not html&quot;)&lt;/script&gt;");
    expect(markup).toContain("&lt;width&gt;:&lt;height&gt;");
    expect(markup).not.toContain("<script>");
  });

  test("renders only evidenced public media types and keeps untrusted preview URLs inert", () => {
    const item = { ...recipe, recipe: { ...recipe.recipe, recipe: { ...recipe.recipe.recipe!, demo: {
      kind: "media" as const,
      storageUrl: "https://evil.example/demo.mp4",
      beforeUrl: "https://ralphy.b-cdn.net/blocks/recipe/before.mp4",
      afterUrl: "https://ralphy.b-cdn.net/units/recipe/after.mp4",
      posterUrl: "https://ralphy.b-cdn.net/private/poster.png",
    } } } };
    const markup = renderToStaticMarkup(<MarketplacePublicItemDetail item={item} onBack={() => undefined} />);
    expect(markup).not.toContain("https://evil.example");
    expect(markup).not.toContain("/private/poster.png");
    expect(markup).toContain('<video src="https://ralphy.b-cdn.net/blocks/recipe/before.mp4"');
    expect(markup).toContain('<video src="https://ralphy.b-cdn.net/units/recipe/after.mp4"');
    expect(markup).toContain('controlsList="nodownload"');
    expect(markup).not.toContain('<img src="https://ralphy.b-cdn.net/blocks/recipe/before.mp4"');

    const arbitraryScheme = renderToStaticMarkup(<MarketplacePublicItemDetail item={{ ...template, template: { ...template.template, referenceUrls: ["data:image/png;base64,AAAA"] } }} onBack={() => undefined} />);
    expect(arbitraryScheme).not.toContain("data:image/png");
    const unsupportedType = renderToStaticMarkup(<MarketplacePublicItemDetail item={{ ...template, template: { ...template.template, referenceUrls: ["https://ralphy.b-cdn.net/blocks/template/vector.svg"] } }} onBack={() => undefined} />);
    expect(unsupportedType).not.toContain("vector.svg");
  });

  test("shows a typed media failure and resets it when the URL changes", async () => {
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    await act(async () => root.render(<MarketplacePublicItemDetail item={template} onBack={() => undefined} />));
    const image = host.container.querySelector("img");
    expect(image).not.toBeNull();
    await act(async () => image!.dispatchEvent(new Event("error")));
    expect(host.container.textContent).toContain("Template reference preview image is unavailable");

    const replacement = { ...template, template: { ...template.template, referenceUrls: ["https://ralphy.b-cdn.net/units/template/story-arc.mp4"] } };
    await act(async () => root.render(<MarketplacePublicItemDetail item={replacement} onBack={() => undefined} />));
    const video = host.container.querySelector("video");
    expect(video?.getAttribute("src")).toBe("https://ralphy.b-cdn.net/units/template/story-arc.mp4");
    expect(video?.getAttribute("controlsList")).toBe("nodownload");
    expect(host.container.textContent).not.toContain("Template reference preview image is unavailable");

    await act(async () => root.unmount());
    host.restore();
  });

  test("keeps uncontracted Recipe Markdown links and media inert", () => {
    const body = [
      "[evil link](https://evil.example/collect)",
      "![private pixel](https://ralphy.b-cdn.net/private/pixel.png)",
      "![accepted preview](https://ralphy.b-cdn.net/blocks/recipe/accepted.png)",
    ].join("\n\n");
    const item = { ...recipe, recipe: { ...recipe.recipe, recipe: { ...recipe.recipe.recipe!, body } } };
    const markup = renderToStaticMarkup(<MarketplacePublicItemDetail item={item} onBack={() => undefined} />);
    expect(markup).not.toContain("<a ");
    expect(markup).not.toContain("https://evil.example");
    expect(markup).not.toContain('src="https://ralphy.b-cdn.net/private/pixel.png"');
    expect(markup).toContain('src="https://ralphy.b-cdn.net/blocks/recipe/accepted.png"');
  });

  test("keeps an unavailable Recipe artifact action focusable, described, and inert", () => {
    const item = { ...recipe, recipe: { ...recipe.recipe, recipe: { ...recipe.recipe.recipe!, artifact: null } } };
    const markup = renderToStaticMarkup(<MarketplacePublicItemDetail item={item} onBack={() => undefined} />);
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain('aria-describedby="marketplace-recipe-copy-unavailable"');
    expect(markup).toContain("Artifact copy is unavailable because public-library schema 1 did not provide an artifact");
  });

  test("copies the exact artifact and announces success or failure without moving focus", async () => {
    const copyText = vi.spyOn(bridge, "copyText").mockResolvedValueOnce().mockRejectedValueOnce(new Error("Clipboard denied"));
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    await act(async () => root.render(<MarketplacePublicItemDetail item={recipe} onBack={() => undefined} />));
    const copy = button(host.container, "Copy artifact");
    copy.focus();
    await act(async () => { copy.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })); await Promise.resolve(); });
    expect(copyText).toHaveBeenCalledWith(exactArtifact);
    expect(host.container.textContent).toContain("Artifact copied");
    expect((copy.ownerDocument as Document & { activeElement: HostNode | null }).activeElement).toBe(copy);
    expect(host.container.querySelector("script")).toBeNull();

    await act(async () => { copy.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })); await Promise.resolve(); });
    expect(host.container.textContent).toContain("Clipboard denied");
    expect((copy.ownerDocument as Document & { activeElement: HostNode | null }).activeElement).toBe(copy);
    await act(async () => root.unmount());
    host.restore();
  });

  test("delegates project review entry without claiming an add or install mutation", async () => {
    const copyText = vi.spyOn(bridge, "copyText");
    const reviewTemplate = vi.fn();
    const reviewRecipe = vi.fn();
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    await act(async () => root.render(<MarketplacePublicItemDetail item={template} onBack={() => undefined} onReviewTemplateTarget={reviewTemplate} />));
    await act(async () => button(host.container, "Review project target").dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
    expect(reviewTemplate).toHaveBeenCalledWith(template);
    await act(async () => root.render(<MarketplacePublicItemDetail item={recipe} onBack={() => undefined} onReviewRecipeTarget={reviewRecipe} />));
    await act(async () => button(host.container, "Review apply target").dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
    expect(reviewRecipe).toHaveBeenCalledWith(recipe);
    expect(copyText).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    host.restore();
  });

  test("suppresses a late copy result after the detail item changes", async () => {
    const pending = deferred<void>();
    vi.spyOn(bridge, "copyText").mockReturnValueOnce(pending.promise);
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    await act(async () => root.render(<MarketplacePublicItemDetail item={recipe} onBack={() => undefined} />));
    await act(async () => button(host.container, "Copy artifact").dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
    await act(async () => root.render(<MarketplacePublicItemDetail item={template} onBack={() => undefined} />));
    await act(async () => { pending.resolve(); await pending.promise; });
    expect(host.container.textContent).not.toContain("Artifact copied");
    await act(async () => root.unmount());
    host.restore();
  });

  test("keys copy work and status to the exact artifact when a Recipe changes in place", async () => {
    const pending = deferred<void>();
    const copyText = vi.spyOn(bridge, "copyText").mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new Error("New artifact denied"));
    const replacement = { ...recipe, recipe: { ...recipe.recipe, recipe: { ...recipe.recipe.recipe!, artifact: "replacement artifact" } } };
    const removed = { ...recipe, recipe: { ...recipe.recipe, recipe: { ...recipe.recipe.recipe!, artifact: null } } };
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);

    await act(async () => root.render(<MarketplacePublicItemDetail item={recipe} onBack={() => undefined} />));
    await act(async () => button(host.container, "Copy artifact").dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
    await act(async () => root.render(<MarketplacePublicItemDetail item={replacement} onBack={() => undefined} />));
    await act(async () => { pending.resolve(); await pending.promise; });
    expect(host.container.textContent).not.toContain("Artifact copied");

    await act(async () => { button(host.container, "Copy artifact").dispatchEvent(new Event("click", { bubbles: true, cancelable: true })); await Promise.resolve(); });
    expect(copyText).toHaveBeenLastCalledWith("replacement artifact");
    expect(host.container.textContent).toContain("New artifact denied");
    await act(async () => root.render(<MarketplacePublicItemDetail item={removed} onBack={() => undefined} />));
    expect(host.container.textContent).not.toContain("New artifact denied");

    await act(async () => root.unmount());
    host.restore();
  });

  test("composes real public details into the full Marketplace route and preserves Back delegation", () => {
    const onBack = vi.fn();
    const markup = renderToStaticMarkup(<MarketplaceScreenView
      catalog={null}
      location={location(template)}
      sidebarVisible
      snapshot={snapshot([template])}
      onBack={onBack}
      onNavigate={() => undefined}
      onRememberLocation={() => undefined}
      onRetry={() => undefined}
    />);
    expect(markup).toContain("Story arc");
    expect(markup).toContain("What it gives you");
    expect(markup).not.toContain("This route does not expose a mutation yet");
  });

  test("resolves detail identity from the unfiltered public source and names loading, unavailable, and missing states", () => {
    const props = {
      catalog: null,
      location: location(template),
      sidebarVisible: true,
      onBack: () => undefined,
      onNavigate: () => undefined,
      onRememberLocation: () => undefined,
      onRetry: () => undefined,
    };
    const filteredQuery = { ...query, text: "does not match", filters: { ...query.filters, category: "recipes" as const } };
    const filtered = renderToStaticMarkup(<MarketplaceScreenView {...props} location={{ ...props.location, query: filteredQuery }} snapshot={{ ...snapshot([], [template.template]), query: filteredQuery }} />);
    expect(filtered).toContain("Story arc");
    expect(filtered).toContain("What it gives you");

    const loading = renderToStaticMarkup(<MarketplaceScreenView {...props} snapshot={{ status: "loading", query }} />);
    expect(loading).toContain("Loading public item details");

    const unavailable = renderToStaticMarkup(<MarketplaceScreenView {...props} snapshot={{ ...snapshot([], []), publicSource: null, sourceHealth: { publicLibrary: "unavailable", models: "unavailable" } }} />);
    expect(unavailable).toContain("Public item details are unavailable because the Ralphy public library is unavailable");

    const missing = renderToStaticMarkup(<MarketplaceScreenView {...props} snapshot={snapshot([], [])} />);
    expect(missing).toContain("Public item was not found in the current Ralphy public library");
  });
});
