import type {
  ArtifactMediaCardDto,
  MediaKind,
  MediaProvenance,
  Page,
} from "../../../../electron/ralphy/types";

export type Availability<T> =
  | { status: "ready"; value: T }
  | { status: "partial"; value: T; reason: string }
  | { status: "empty"; reason: string }
  | { status: "unavailable"; reason: string };

export interface SharedArtifactPresentation {
  id: string;
  slug: string;
  title: Availability<string>;
  kind: string;
  mediaKind: MediaKind;
  mime: string | null;
  bytes: number | null;
  selectedRevisionId: string | null;
  selectedState: string | null;
  selectedAt: number | null;
  revisionCount: number;
  storageClass: string | null;
  provenance: MediaProvenance;
  referencedAs: string[];
  preview: "available" | "no-target";
  semanticRoles: Availability<string[]>;
  tags: Availability<string[]>;
  entities: Availability<string[]>;
  canonicalStatus: Availability<never>;
  agentUse: Availability<{ purpose: string; useWhen: string; avoidWhen: string; constraints: string }>;
  rights: Availability<never>;
  usageBacklinks: Availability<never>;
  attention: Availability<never>;
  relationships: Availability<never>;
}

export type SharedLibraryQueryState = {
  text: string;
  mediaKind: MediaKind | "all";
  provenance: MediaProvenance | "all";
  view: "grid" | "list";
  sort: "recently-selected" | "name" | "size";
};

export interface SharedLibraryPresentation {
  artifacts: SharedArtifactPresentation[];
  selectedArtifactId: string | null;
  nextCursor: string | null;
  totalCount: Availability<number>;
  totalSelectedBytes: Availability<number>;
}

export const DEFAULT_SHARED_LIBRARY_QUERY: SharedLibraryQueryState = {
  text: "",
  mediaKind: "all",
  provenance: "all",
  view: "grid",
  sort: "recently-selected",
};

const unavailable = <T>(reason: string): Availability<T> => ({ status: "unavailable", reason });

export function presentSharedArtifact(card: ArtifactMediaCardDto): SharedArtifactPresentation {
  return {
    id: card.ref.id,
    slug: card.slug,
    title: unavailable("Titles are unavailable from the current Core media contract."),
    kind: card.kind,
    mediaKind: card.mediaKind,
    mime: card.mime,
    bytes: card.bytes,
    selectedRevisionId: card.selectedRevisionId,
    selectedState: card.selectedState,
    selectedAt: card.selectedAt,
    revisionCount: card.revisionCount,
    storageClass: card.storageClass,
    provenance: card.provenance,
    referencedAs: [...card.usageRoles],
    preview: card.target === null ? "no-target" : "available",
    semanticRoles: unavailable("Semantic roles are unavailable from the current Core media contract."),
    tags: unavailable("Tags are unavailable from the current Core media contract."),
    entities: unavailable("Entities are unavailable from the current Core media contract."),
    canonicalStatus: unavailable("Canonical status is unavailable from the current Core media contract."),
    agentUse: unavailable("Agent use guidance is unavailable from the current Core media contract."),
    rights: unavailable("Rights data is unavailable from the current Core media contract."),
    usageBacklinks: unavailable("Usage backlinks are unavailable from the current Core media contract."),
    attention: unavailable("Attention signals are unavailable from the current Core media contract."),
    relationships: unavailable("Artifact relationships are unavailable from the current Core media contract."),
  };
}

export function presentSharedLibrary(
  page: Page<ArtifactMediaCardDto>,
  selectedArtifactId: string | null,
  query: SharedLibraryQueryState,
): SharedLibraryPresentation {
  const text = query.text.trim().toLocaleLowerCase();
  const cards = page.items.filter((card) => (
    (query.mediaKind === "all" || card.mediaKind === query.mediaKind)
    && (query.provenance === "all" || card.provenance === query.provenance)
    && (!text || [card.slug, card.kind, card.mime, card.provenance, ...card.usageRoles]
      .some((value) => value?.toLocaleLowerCase().includes(text)))
  ));
  if (query.sort === "name") cards.sort((left, right) => left.slug.localeCompare(right.slug));
  if (query.sort === "size") cards.sort((left, right) => (right.bytes ?? -1) - (left.bytes ?? -1));
  if (query.sort === "recently-selected") cards.sort((left, right) => (right.selectedAt ?? -1) - (left.selectedAt ?? -1));

  const artifacts = cards.map(presentSharedArtifact);
  const selectedBytes = cards.reduce((total, card) => total + (card.bytes ?? 0), 0);
  const boundedReason = `Showing ${artifacts.length} loaded artifacts; more are available from Core.`;
  const unknownSelectedBytes = cards.some((card) => card.selectedRevisionId !== null && card.bytes === null);

  return {
    artifacts,
    selectedArtifactId: artifacts.some(({ id }) => id === selectedArtifactId) ? selectedArtifactId : null,
    nextCursor: page.nextCursor,
    totalCount: page.nextCursor === null
      ? { status: "ready", value: artifacts.length }
      : { status: "partial", value: artifacts.length, reason: boundedReason },
    totalSelectedBytes: page.nextCursor !== null
      ? { status: "partial", value: selectedBytes, reason: boundedReason }
      : unknownSelectedBytes
        ? { status: "partial", value: selectedBytes, reason: "Selected bytes are unavailable for one or more loaded artifacts from Core." }
        : { status: "ready", value: selectedBytes },
  };
}
