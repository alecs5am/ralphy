import type {
  MetricTotals,
  OverviewAccountDto,
  OverviewPublicationDto,
  Page,
  ProjectDto,
  UnitDto,
  WorkspaceOverviewDto,
} from "../../../electron/ralphy/types";
import type { ProjectSummary } from "../../lib/ipc";

export type Availability<T> =
  | { status: "ready"; value: T }
  | { status: "partial"; reason: string; value: T }
  | { status: "empty" | "unavailable"; reason: string };

export interface WorkspaceOverviewInput {
  overview: WorkspaceOverviewDto;
  catalogProjects: ProjectSummary[];
  description: string;
  now?: number;
}

export interface WorkspaceHeaderPresentation {
  id: string;
  name: string;
  description: string;
  updatedAt: number;
  accountCount: Availability<number>;
}

export interface WorkspaceMomentumPresentation {
  periodLabel: string;
  totals: {
    publications: number | null;
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    watchTimeMs: number | null;
  };
  trend: Availability<never[]>;
}

export interface AccountPresentation {
  id: string;
  platform: string;
  handle: string;
  displayName: string | null;
  credentialConfigured: boolean;
  relinkRequired: boolean;
  publicationCount: Availability<number>;
  updatedAt: number;
  metrics: Availability<never[]>;
}

export interface PublishingEventPresentation {
  unitId: string;
  scheduledAt: number;
  publications: OverviewPublicationDto[];
  accounts: OverviewAccountDto[];
  unit: UnitDto | null;
  project: ProjectDto | null;
}

export interface PlanCoveragePresentation {
  id: string;
  label: string;
  planned: number;
  target: number;
}

export interface ReadyUnscheduledPresentation {
  unitId: string;
  projectId: string | null;
  title: string;
  projectTitle: string | null;
}

export interface WorkspacePlanPresentation {
  days: number[];
  coverage: Availability<PlanCoveragePresentation[]>;
  upcoming: Availability<PublishingEventPresentation[]>;
  readyUnscheduled: Availability<ReadyUnscheduledPresentation[]>;
}

export interface UnitOutcomePresentation {
  id: string;
  unitId: string;
  projectId: string;
  title: string;
  projectTitle: string;
  revisionLabel: string;
}

export interface UnitOutcomeGroups {
  top: UnitOutcomePresentation[];
  emerging: UnitOutcomePresentation[];
  learningOpportunities: UnitOutcomePresentation[];
}

export interface WorkspaceInsightPresentation {
  id: string;
  observation: string;
  dimension: string;
  platform: string;
  account: string;
  reportingWindow: string;
  sampleSize: number;
  method: string;
  baseline: string;
  medianComparison: string;
  evidenceStrength: "strong" | "weak" | "insufficient";
  supportingUnits: WorkspaceInsightUnitReference[];
  counterexamples: WorkspaceInsightUnitReference[];
  caveats: string[];
  memoryAction: Availability<{ label: string }>;
}

export interface WorkspaceInsightUnitReference {
  id: string;
  label: string;
}

export type ProductionEfficiencyMetricId = "production-time" | "revisions" | "cost" | "adaptation" | "asset-reuse" | "conversion";

export interface ProductionEfficiencyMetricPresentation {
  id: ProductionEfficiencyMetricId;
  value: Availability<string>;
}

export interface ProductionEfficiencyPresentation {
  metrics: ProductionEfficiencyMetricPresentation[];
  sharedAction: Availability<{ label: string }>;
}

export type AttentionKind = "publication-failure" | "publication-reconciliation" | "account-relink" | "account-configuration";

export interface AttentionPresentation {
  kind: AttentionKind;
  severity: "critical" | "warning";
  accountId: string | null;
  affectedCount: Availability<number>;
  title: string;
}

export interface AttentionSummaryPresentation {
  items: AttentionPresentation[];
  criticalCount: Availability<number>;
}

export interface ProductionPulsePresentation {
  stages: never[];
}

export interface ActiveProjectPresentation {
  id: string;
  name: string;
  slug: string;
  updatedAt: number;
  catalog: ProjectSummary | null;
}

export interface RecentChangePresentation {
  id: string;
}

export interface WorkspaceOverviewPresentation {
  header: WorkspaceHeaderPresentation;
  momentum: WorkspaceMomentumPresentation;
  accounts: Availability<AccountPresentation[]>;
  plan: WorkspacePlanPresentation;
  outcomes: Availability<UnitOutcomeGroups>;
  insights: Availability<WorkspaceInsightPresentation[]>;
  efficiency: Availability<ProductionEfficiencyPresentation>;
  attention: Availability<AttentionSummaryPresentation>;
  pulse: Availability<ProductionPulsePresentation>;
  projects: Availability<ActiveProjectPresentation[]>;
  recentChanges: Availability<RecentChangePresentation[]>;
  onboarding: Availability<boolean>;
}

export function presentWorkspaceOverview({
  overview, catalogProjects, description, now = Date.now(),
}: WorkspaceOverviewInput): WorkspaceOverviewPresentation {
  return {
    header: presentHeader(overview, description),
    momentum: presentMomentum(overview.metrics),
    accounts: presentAccounts(overview.accounts, overview.publications),
    plan: presentPlan(overview.publications, overview.accounts, overview.units, overview.projects, now),
    outcomes: unavailable("Performance benchmarks and observation windows are not available from Core yet."),
    insights: unavailable("Evidence samples and counterexamples are not available from Core yet."),
    efficiency: unavailable("Production timing and reuse evidence are not available from Core yet."),
    attention: presentAttention(overview.accounts, overview.publications),
    pulse: unavailable("Workspace run and build progress is not available from Core yet."),
    projects: presentProjects(overview.projects, catalogProjects),
    recentChanges: unavailable("Core currently returns technical activity without display names."),
    onboarding: presentOnboarding(overview.projects, overview.publications),
  };
}

function presentHeader(overview: WorkspaceOverviewDto, description: string): WorkspaceHeaderPresentation {
  return {
    id: overview.workspace.id,
    name: overview.workspace.name,
    description,
    updatedAt: overview.workspace.updatedAt,
    accountCount: countAvailability(overview.accounts, overview.accounts?.items.length ?? 0, "Connected accounts"),
  };
}

function presentMomentum(metrics: MetricTotals | undefined): WorkspaceMomentumPresentation {
  return {
    periodLabel: "Current Core totals",
    totals: {
      publications: metrics?.publicationCount ?? null,
      views: metrics?.views ?? null,
      likes: metrics?.likes ?? null,
      comments: metrics?.comments ?? null,
      shares: metrics?.shares ?? null,
      watchTimeMs: metrics?.watchTimeMs ?? null,
    },
    trend: unavailable("Comparable reporting windows and trend points are not available from Core yet."),
  };
}

function presentAccounts(
  accounts: Page<OverviewAccountDto> | undefined,
  publications: Page<OverviewPublicationDto> | undefined,
): Availability<AccountPresentation[]> {
  if (!accounts) return unavailable("Connected accounts were not returned by Core.");
  return pageAvailability(
    accounts,
    accounts.items.map((account) => presentAccount(account, publications)),
    "Connected accounts",
  );
}

function presentAccount(account: OverviewAccountDto, publications: Page<OverviewPublicationDto> | undefined): AccountPresentation {
  return {
    id: account.id,
    platform: account.platform,
    handle: account.username ?? account.displayName ?? account.externalId,
    displayName: account.displayName,
    credentialConfigured: account.credentialConfigured,
    relinkRequired: account.relinkRequired,
    publicationCount: countAvailability(
      publications,
      publications?.items.filter((publication) => publication.socialAccountId === account.id).length ?? 0,
      "Account publications",
    ),
    updatedAt: account.updatedAt,
    metrics: unavailable("Account metrics are not available from the current Core contract."),
  };
}

function presentPlan(
  publications: Page<OverviewPublicationDto> | undefined,
  accounts: Page<OverviewAccountDto> | undefined,
  units: Page<UnitDto> | undefined,
  projects: Page<ProjectDto> | undefined,
  now: number,
): WorkspacePlanPresentation {
  const days = planDays(now);
  const coverage = unavailable<PlanCoveragePresentation[]>("cadence targets are not configured in the current Core contract.");
  const readyUnscheduled = unavailable<ReadyUnscheduledPresentation[]>("Ready Unit lifecycle state is not available from the current Core contract.");
  if (!publications) {
    return {
      days,
      coverage,
      upcoming: unavailable("Upcoming publications were not returned by Core."),
      readyUnscheduled,
    };
  }

  const events = new Map<string, PublishingEventPresentation>();
  const windowEnd = planWindowEnd(days);
  for (const publication of publications.items) {
    if (publication.scheduledAt === null) continue;
    const scheduledAt = timestampMs(publication.scheduledAt);
    if (scheduledAt < days[0]! || scheduledAt >= windowEnd) continue;
    const key = `${publication.unitId}:${scheduledAt}`;
    const existing = events.get(key);
    if (existing) existing.publications.push(publication);
    else {
      const unit = units?.items.find((candidate) => candidate.id === publication.unitId) ?? null;
      events.set(key, {
        unitId: publication.unitId,
        scheduledAt,
        publications: [publication],
        accounts: [],
        unit,
        project: projects?.items.find((candidate) => candidate.id === unit?.projectId) ?? null,
      });
    }
  }

  for (const event of events.values()) {
    event.accounts = accounts?.items.filter((account) => (
      event.publications.some((publication) => publication.socialAccountId === account.id)
    )) ?? [];
  }

  const upcoming = [...events.values()].sort((left, right) => left.scheduledAt - right.scheduledAt);
  const limitations = planLimitations(publications, accounts, units, projects);
  return {
    days,
    coverage,
    upcoming: limitations.length > 0
      ? { status: "partial", reason: limitations.join(" "), value: upcoming }
      : upcoming.length > 0
        ? { status: "ready", value: upcoming }
        : { status: "empty", reason: "Nothing scheduled in the next 14 days." },
    readyUnscheduled,
  };
}

function planDays(now: number): number[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date.getTime();
  });
}

function planWindowEnd(days: number[]): number {
  const end = new Date(days.at(-1)!);
  end.setDate(end.getDate() + 1);
  return end.getTime();
}

function planLimitations(
  publications: Page<OverviewPublicationDto>,
  accounts: Page<OverviewAccountDto> | undefined,
  units: Page<UnitDto> | undefined,
  projects: Page<ProjectDto> | undefined,
): string[] {
  return [
    publications.nextCursor === null ? null : "Upcoming publications are limited to the returned Core page.",
    !accounts
      ? "Publishing account labels are unavailable because connected accounts were not returned by Core."
      : accounts.nextCursor === null ? null : "Publishing account labels are limited to the returned Core account page.",
    !units
      ? "Unit labels and exact navigation are unavailable because Units were not returned by Core."
      : units.nextCursor === null ? null : "Unit labels and exact navigation are limited to the returned Core Unit page.",
    !projects
      ? "Project labels are unavailable because projects were not returned by Core."
      : projects.nextCursor === null ? null : "Project labels are limited to the returned Core project page.",
  ].filter((reason): reason is string => reason !== null);
}

function presentAttention(
  accounts: Page<OverviewAccountDto> | undefined,
  publications: Page<OverviewPublicationDto> | undefined,
): Availability<AttentionSummaryPresentation> {
  if (!accounts && !publications) return unavailable("Account and publication attention data were not returned by Core.");
  const accountItems = accounts?.items ?? [];
  const publicationItems = publications?.items ?? [];
  const items: AttentionPresentation[] = [
    ...publicationAttention(publicationItems, publications, accounts, "failed", "publication-failure", "Publication failed"),
    ...publicationAttention(publicationItems, publications, accounts, "reconciliation_required", "publication-reconciliation", "Publication needs reconciliation"),
    ...accountItems.filter((account) => account.relinkRequired).map((account) => ({
      kind: "account-relink" as const,
      severity: "warning" as const,
      accountId: account.id,
      affectedCount: countAvailability(publications, publicationItems.filter((publication) => publication.socialAccountId === account.id).length, "Affected publications"),
      title: `${accountDisplayLabel(account)} needs relinking`,
    })),
    ...accountItems.filter((account) => !account.credentialConfigured).map((account) => ({
      kind: "account-configuration" as const,
      severity: "warning" as const,
      accountId: account.id,
      affectedCount: countAvailability(publications, publicationItems.filter((publication) => publication.socialAccountId === account.id).length, "Affected publications"),
      title: `${accountDisplayLabel(account)} is not configured`,
    })),
  ];
  items.sort((left, right) => attentionPriority(left) - attentionPriority(right));
  const value = {
    items,
    criticalCount: countAvailability(publications, items.filter((item) => item.severity === "critical").length, "Critical attention"),
  };
  if (!accounts || !publications || accounts.nextCursor !== null || publications.nextCursor !== null) {
    return { status: "partial", reason: "Attention is limited to the returned account and publication pages.", value };
  }
  return { status: "ready", value };
}

function publicationAttention(
  publications: OverviewPublicationDto[],
  page: Page<OverviewPublicationDto> | undefined,
  accounts: Page<OverviewAccountDto> | undefined,
  state: OverviewPublicationDto["state"],
  kind: Extract<AttentionKind, "publication-failure" | "publication-reconciliation">,
  title: string,
): AttentionPresentation[] {
  const grouped = new Map<string, OverviewPublicationDto[]>();
  for (const publication of publications) {
    if (publication.state !== state) continue;
    const accountId = publication.socialAccountId ?? "unknown";
    const group = grouped.get(accountId);
    if (group) group.push(publication);
    else grouped.set(accountId, [publication]);
  }
  return [...grouped.entries()].map(([accountId, group]) => ({
    kind,
    severity: "critical",
    accountId: accountId === "unknown" ? null : accountId,
    affectedCount: countAvailability(page, group.length, "Affected publications"),
    title: `${title} · ${attentionAccountLabel(accounts, accountId === "unknown" ? null : accountId)}`,
  }));
}

function accountDisplayLabel(account: OverviewAccountDto): string {
  return account.displayName?.trim() || account.username?.trim() || `${account.platform} account`;
}

function attentionAccountLabel(accounts: Page<OverviewAccountDto> | undefined, accountId: string | null): string {
  if (!accountId) return "Publishing account unavailable";
  const account = accounts?.items.find((candidate) => candidate.id === accountId);
  return account ? accountDisplayLabel(account) : "Publishing account unavailable";
}

function attentionPriority(item: AttentionPresentation): number {
  if (item.kind === "publication-failure" || item.kind === "publication-reconciliation") return 0;
  if (item.kind === "account-relink" || item.kind === "account-configuration") return 3;
  return 4;
}

function presentProjects(projects: Page<ProjectDto> | undefined, catalogProjects: ProjectSummary[]): Availability<ActiveProjectPresentation[]> {
  if (!projects) return unavailable("Projects were not returned by Core.");
  return pageAvailability(projects, projects.items
    .filter((project) => project.state === "active")
    .map((project) => ({
      id: project.id,
      name: project.name,
      slug: project.slug,
      updatedAt: project.updatedAt,
      catalog: catalogProjects.find((candidate) => (
        candidate.workspaceId === project.workspaceId && candidate.projectId === project.id
      )) ?? null,
    }))
    .sort((left, right) => right.updatedAt - left.updatedAt), "Active projects");
}

function presentOnboarding(
  projects: Page<ProjectDto> | undefined,
  publications: Page<OverviewPublicationDto> | undefined,
): Availability<boolean> {
  if (projects?.items.length || publications?.items.length) return { status: "ready", value: false };
  if (!projects || !publications || projects.nextCursor !== null || publications.nextCursor !== null) {
    return unavailable("Whether this is a new workspace cannot be determined from the returned Core pages.");
  }
  return { status: "ready", value: true };
}

function unavailable<T>(reason: string): Availability<T> {
  return { status: "unavailable", reason };
}

function pageAvailability<Item, Value>(page: Page<Item>, value: Value, label: string): Availability<Value> {
  return page.nextCursor === null
    ? { status: "ready", value }
    : { status: "partial", reason: `${label} are limited to the returned Core page.`, value };
}

function countAvailability<Item>(page: Page<Item> | undefined, value: number, label: string): Availability<number> {
  if (!page) return unavailable(`${label} were not returned by Core.`);
  return pageAvailability(page, value, label);
}

function timestampMs(value: number): number {
  return value < 1_000_000_000_000 ? value * 1000 : value;
}
