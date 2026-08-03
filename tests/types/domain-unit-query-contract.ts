import {
  appendMetricSnapshot,
  cancelDraftPublication,
  createUnit,
  expirePublicationOperationClaim,
  finishPublicationCancellation,
  finishPublicationClaim,
  finishPublicationStatusLookup,
  getMetricSnapshot,
  getPublication,
  getPresentationCaptionRevision,
  getPresentationItem,
  getUnit,
  getUnitItem,
  getUnitPresentation,
  getUnitRevision,
  listMetricSnapshots,
  listPublications,
  listPresentationCaptionRevisions,
  listPresentationItems,
  listUnitItems,
  listUnitPresentations,
  listUnitRevisions,
  listUnits,
  recordPublication,
  requestPublicationReconciliation,
  reviseUnit,
  selectUnitRevision,
} from "../../cli/lib/store/units.js";
import type {
  MetricSnapshotDto,
  Page,
  PresentationCaptionRevisionDto,
  PresentationItemDto,
  PublicationDto,
  UnitDto,
  UnitItemDto,
  UnitPresentationDto,
  UnitRevisionDto,
  OverviewUnitDto,
} from "../../cli/lib/store/types.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Assert<Condition extends true> = Condition;

type UnitKeys = Assert<
  Equal<
    keyof UnitDto,
    | "id"
    | "workspaceId"
    | "projectId"
    | "slug"
    | "format"
    | "latestRevisionId"
    | "selectedRevisionId"
    | "createdAt"
    | "updatedAt"
  >
>;
type RevisionKeys = Assert<
  Equal<
    keyof UnitRevisionDto,
    | "id"
    | "unitId"
    | "revisionNo"
    | "parentRevisionId"
    | "iterationId"
    | "note"
    | "authoredBySessionId"
    | "createdAt"
    | "sealedAt"
  >
>;
type ItemKeys = Assert<
  Equal<
    keyof UnitItemDto,
    | "id"
    | "unitRevisionId"
    | "artifactRevisionId"
    | "documentRevisionId"
    | "role"
    | "position"
    | "config"
    | "createdAt"
  >
>;
type PresentationKeys = Assert<
  Equal<
    keyof UnitPresentationDto,
    | "id"
    | "unitRevisionId"
    | "platform"
    | "position"
    | "effectiveCaptionRevisionId"
    | "coverArtifactRevisionId"
    | "crop"
    | "safeArea"
    | "options"
    | "createdAt"
  >
>;
type CaptionKeys = Assert<
  Equal<
    keyof PresentationCaptionRevisionDto,
    | "id"
    | "presentationId"
    | "revisionNo"
    | "parentRevisionId"
    | "state"
    | "text"
    | "createdAt"
  >
>;
type PresentationItemKeys = Assert<
  Equal<
    keyof PresentationItemDto,
    | "id"
    | "presentationId"
    | "unitItemId"
    | "position"
    | "config"
    | "createdAt"
  >
>;
type PublicationKeys = Assert<
  Equal<
    keyof PublicationDto,
    | "id"
    | "presentationId"
    | "effectiveCaptionRevisionId"
    | "effectiveOptions"
    | "socialAccountId"
    | "submissionRunId"
    | "revisedFromPublicationId"
    | "rail"
    | "providerPublicationId"
    | "state"
    | "url"
    | "scheduledAt"
    | "submittedAt"
    | "publishedAt"
    | "createdAt"
    | "updatedAt"
  >
>;
type MetricKeys = Assert<
  Equal<
    keyof MetricSnapshotDto,
    | "id"
    | "publicationId"
    | "source"
    | "asOf"
    | "windowStart"
    | "windowEnd"
    | "views"
    | "likes"
    | "comments"
    | "shares"
    | "watchTimeMs"
    | "ctr"
    | "retentionCurve"
    | "avgViewDurationSec"
    | "note"
    | "createdAt"
  >
>;

type MutationReturns = Assert<
  Equal<
    [
      ReturnType<typeof createUnit>,
      ReturnType<typeof reviseUnit>,
      ReturnType<typeof selectUnitRevision>,
      ReturnType<typeof recordPublication>,
      ReturnType<typeof finishPublicationClaim>,
      ReturnType<typeof finishPublicationStatusLookup>,
      ReturnType<typeof finishPublicationCancellation>,
      ReturnType<typeof requestPublicationReconciliation>,
      ReturnType<typeof expirePublicationOperationClaim>,
      ReturnType<typeof cancelDraftPublication>,
      ReturnType<typeof appendMetricSnapshot>,
    ],
    [
      UnitDto,
      UnitRevisionDto,
      UnitDto,
      PublicationDto,
      PublicationDto,
      PublicationDto,
      PublicationDto,
      PublicationDto,
      PublicationDto,
      PublicationDto,
      MetricSnapshotDto,
    ]
  >
>;

type DetailReturns = Assert<
  Equal<
    [
      ReturnType<typeof getUnit>,
      ReturnType<typeof getUnitRevision>,
      ReturnType<typeof getUnitItem>,
      ReturnType<typeof getUnitPresentation>,
      ReturnType<typeof getPresentationCaptionRevision>,
      ReturnType<typeof getPresentationItem>,
      ReturnType<typeof getPublication>,
      ReturnType<typeof getMetricSnapshot>,
    ],
    [
      UnitDto,
      UnitRevisionDto,
      UnitItemDto,
      UnitPresentationDto,
      PresentationCaptionRevisionDto,
      PresentationItemDto,
      PublicationDto,
      MetricSnapshotDto,
    ]
  >
>;

type ListReturns = Assert<
  Equal<
    [
      ReturnType<typeof listUnits>,
      ReturnType<typeof listUnitRevisions>,
      ReturnType<typeof listUnitItems>,
      ReturnType<typeof listUnitPresentations>,
      ReturnType<typeof listPresentationCaptionRevisions>,
      ReturnType<typeof listPresentationItems>,
      ReturnType<typeof listPublications>,
      ReturnType<typeof listMetricSnapshots>,
    ],
    [
      Page<UnitDto>,
      Page<UnitRevisionDto>,
      Page<UnitItemDto>,
      Page<UnitPresentationDto>,
      Page<PresentationCaptionRevisionDto>,
      Page<PresentationItemDto>,
      Page<PublicationDto>,
      Page<MetricSnapshotDto>,
    ]
  >
>;

type OverviewReusesUnit = Assert<Equal<OverviewUnitDto, UnitDto>>;

export type DomainUnitQueryContract = [
  UnitKeys,
  RevisionKeys,
  ItemKeys,
  PresentationKeys,
  CaptionKeys,
  PresentationItemKeys,
  PublicationKeys,
  MetricKeys,
  MutationReturns,
  DetailReturns,
  ListReturns,
  OverviewReusesUnit,
];
