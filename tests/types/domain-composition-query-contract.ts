import {
  bindCompositionInput,
  cancelBuild,
  completeBuild,
  createComposition,
  failBuild,
  getBuild,
  getBuildOutput,
  getComposition,
  getCompositionInput,
  getCompositionRevision,
  getCompositionSource,
  listBuildOutputs,
  listBuilds,
  listCompositionInputs,
  listCompositionRevisions,
  listCompositionSources,
  listCompositions,
  putCompositionSource,
  removeCompositionInput,
  removeCompositionSource,
  reviseComposition,
  sealCompositionRevision,
  selectCompositionRevision,
  startBuild,
} from "../../cli/lib/store/compositions.js";
import type {
  BuildDto,
  BuildOutputDto,
  CompositionDto,
  CompositionInputDto,
  CompositionRevisionDto,
  CompositionSourceDto,
  OverviewBuildDto,
  OverviewCompositionDto,
  Page,
} from "../../cli/lib/store/types.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Assert<Condition extends true> = Condition;

type CompositionHasExactKeys = Assert<
  Equal<
    keyof CompositionDto,
    | "id"
    | "projectId"
    | "slug"
    | "kind"
    | "latestRevisionId"
    | "selectedRevisionId"
    | "createdAt"
    | "updatedAt"
  >
>;
type RevisionHasExactKeys = Assert<
  Equal<
    keyof CompositionRevisionDto,
    | "id"
    | "compositionId"
    | "revisionNo"
    | "parentRevisionId"
    | "iterationId"
    | "state"
    | "engine"
    | "engineVersion"
    | "authoredBySessionId"
    | "createdAt"
    | "sealedAt"
  >
>;
type SourceHasExactKeys = Assert<
  Equal<
    keyof CompositionSourceDto,
    | "id"
    | "compositionRevisionId"
    | "objectId"
    | "position"
    | "createdAt"
  >
>;
type InputHasExactKeys = Assert<
  Equal<
    keyof CompositionInputDto,
    | "id"
    | "compositionRevisionId"
    | "artifactRevisionId"
    | "role"
    | "position"
    | "createdAt"
  >
>;
type BuildHasExactKeys = Assert<
  Equal<
    keyof BuildDto,
    | "id"
    | "compositionRevisionId"
    | "runId"
    | "state"
    | "createdAt"
    | "finishedAt"
  >
>;
type OutputHasExactKeys = Assert<
  Equal<
    keyof BuildOutputDto,
    | "id"
    | "buildId"
    | "artifactRevisionId"
    | "role"
    | "position"
    | "createdAt"
  >
>;

type MutationReturns = Assert<
  Equal<
    [
      ReturnType<typeof createComposition>,
      ReturnType<typeof reviseComposition>,
      ReturnType<typeof putCompositionSource>,
      ReturnType<typeof removeCompositionSource>,
      ReturnType<typeof bindCompositionInput>,
      ReturnType<typeof removeCompositionInput>,
      ReturnType<typeof sealCompositionRevision>,
      ReturnType<typeof selectCompositionRevision>,
      ReturnType<typeof startBuild>,
      ReturnType<typeof completeBuild>,
      ReturnType<typeof failBuild>,
      ReturnType<typeof cancelBuild>,
    ],
    [
      CompositionDto,
      CompositionRevisionDto,
      CompositionSourceDto,
      CompositionSourceDto,
      CompositionInputDto,
      CompositionInputDto,
      CompositionRevisionDto,
      CompositionDto,
      BuildDto,
      BuildDto,
      BuildDto,
      BuildDto,
    ]
  >
>;

type DetailReturns = Assert<
  Equal<
    [
      ReturnType<typeof getComposition>,
      ReturnType<typeof getCompositionRevision>,
      ReturnType<typeof getCompositionSource>,
      ReturnType<typeof getCompositionInput>,
      ReturnType<typeof getBuild>,
      ReturnType<typeof getBuildOutput>,
    ],
    [
      CompositionDto,
      CompositionRevisionDto,
      CompositionSourceDto,
      CompositionInputDto,
      BuildDto,
      BuildOutputDto,
    ]
  >
>;

type ListReturns = Assert<
  Equal<
    [
      ReturnType<typeof listCompositions>,
      ReturnType<typeof listCompositionRevisions>,
      ReturnType<typeof listCompositionSources>,
      ReturnType<typeof listCompositionInputs>,
      ReturnType<typeof listBuilds>,
      ReturnType<typeof listBuildOutputs>,
    ],
    [
      Page<CompositionDto>,
      Page<CompositionRevisionDto>,
      Page<CompositionSourceDto>,
      Page<CompositionInputDto>,
      Page<BuildDto>,
      Page<BuildOutputDto>,
    ]
  >
>;

type OverviewsReuseCanonicalDtos = Assert<
  Equal<
    [OverviewCompositionDto, OverviewBuildDto],
    [CompositionDto, BuildDto]
  >
>;

export type DomainCompositionQueryContract = [
  CompositionHasExactKeys,
  RevisionHasExactKeys,
  SourceHasExactKeys,
  InputHasExactKeys,
  BuildHasExactKeys,
  OutputHasExactKeys,
  MutationReturns,
  DetailReturns,
  ListReturns,
  OverviewsReuseCanonicalDtos,
];
