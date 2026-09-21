import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("uses one 9:16 content frame across primary cards, grids, chat, and review surfaces", () => {
  expect(source("src/app/styles/tokens.css")).toContain("--content-aspect: 9 / 16");
  expect(source("src/app/styles/tailwind.css")).toContain("--aspect-content: var(--content-aspect)");
  for (const path of [
    "src/pages/workspace-units/ui/WorkspaceUnitsScreen.tsx",
    "src/pages/project/ui/UnitsPanel.tsx",
    "src/pages/marketplace/ui/MarketplaceCreativeResults.tsx",
    "src/pages/shared-library/ui/SharedLibraryScreen.tsx",
    "src/shared/ui/MediaPreview.tsx",
  ]) expect(source(path)).toContain("aspect-content");
  expect(source("src/pages/marketplace/ui/MarketplaceItemPreview.tsx")).toContain('className="size-full object-cover"');
  expect(source("src/app/styles/theme/chat-cards.css")).toContain("--aspect-chat-unit-preview: var(--content-aspect)");
  expect(source("src/app/styles/theme/project.css")).toContain("--aspect-creative-preview: var(--content-aspect)");
  expect(source("src/app/styles/theme/explore-effects.css")).toContain("--explore-effect-aspect: var(--content-aspect)");
  expect(source("src/app/styles/theme/generation.css")).toMatch(/generation-output-card[^}]*aspect-ratio:\s*var\(--content-aspect\)/s);
});
