import * as publicScopes from "../../cli/lib/store/scopes.js";
import type {
  OverviewAccountDto,
  WorkspaceSummaryDto,
} from "../../cli/lib/store/types.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Assert<Condition extends true> = Condition;

type UpdateWorkspaceReturnsSafeDto = Assert<
  Equal<
    ReturnType<typeof publicScopes.updateWorkspace>,
    WorkspaceSummaryDto
  >
>;
type UpsertSocialAccountReturnsSafeDto = Assert<
  Equal<
    ReturnType<typeof publicScopes.upsertSocialAccount>,
    OverviewAccountDto
  >
>;
type PublicScopesDoNotExportRawTransfer = Assert<
  Equal<
    "transferProjectMetadata" extends keyof typeof publicScopes ? true : false,
    false
  >
>;

export type DomainScopeMutationContract = [
  UpdateWorkspaceReturnsSafeDto,
  UpsertSocialAccountReturnsSafeDto,
  PublicScopesDoNotExportRawTransfer,
];
