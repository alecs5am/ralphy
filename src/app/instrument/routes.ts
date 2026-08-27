import type { MarketplaceCategory, MarketplaceLibrarySection, ProjectView } from "@/shared/model/routes";
import type { WorkspacePage } from "@/shared/model/workbench";
import type { SettingsPageId } from "@/pages/settings";

/**
 * Every route the app has, as one key per screen.
 *
 * It lives in `app` because it is the only layer allowed to know all of them: the union reaches
 * into the settings page's own registry for its page ids, and no layer below `pages` may do
 * that. The screen-state registry a page calls therefore takes a plain string, and this union is
 * what the scenario catalogue and its exhaustiveness tests are written against.
 */
export type InstrumentRouteKey =
  | `startup.${"welcome" | "library" | "migration"}`
  | `workspace.${WorkspacePage}`
  | `project.${ProjectView}`
  | `settings.${SettingsPageId}`
  | `marketplace.${"discover" | "results" | "collection" | "detail"}`
  | `marketplace.category.${MarketplaceCategory}`
  | `marketplace.library.${MarketplaceLibrarySection}`
  | `marketplace.unavailable-detail.${"prompts" | "components" | "skills"}`;
