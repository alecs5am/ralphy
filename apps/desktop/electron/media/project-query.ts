import { PROJECT_MEDIA_FILTERS, type ProjectMediaFilter, type ProjectMediaKind, type ProjectMediaQuery, type MediaProvenance } from "./types";

export function parseProjectMediaQuery(value: unknown): ProjectMediaQuery {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Media query");
  }
  const query = value as Record<string, unknown>;
  const keys = Reflect.ownKeys(query);
  if (!keys.every((key) => key === "filter" || key === "mediaKind" || key === "provenance" || key === "search" || key === "sort")
    || !PROJECT_MEDIA_FILTERS.includes(query.filter as ProjectMediaFilter)
    || (query.mediaKind !== undefined && ![
      "image", "video", "audio", "document", "other",
    ].includes(query.mediaKind as ProjectMediaKind))
    || (query.provenance !== undefined && ![
      "generation", "not-generation", "unknown",
    ].includes(query.provenance as MediaProvenance))
    || (query.search !== undefined && (typeof query.search !== "string" || query.search.length > 256))
    || (query.sort !== undefined && !["oldest", "newest", "name", "size", "selected"].includes(query.sort as string))) {
    throw new Error("Invalid Media query");
  }
  return query as ProjectMediaQuery;
}
