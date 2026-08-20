import type {
  MetricTotals,
  OverviewAccountDto,
  OverviewPublicationDto,
  Page,
  ProjectDto,
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
  accountCount: number;
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
  publicationCount: number;
  updatedAt: number;
  metrics: Availability<never[]>;
}

export interface PublishingEventPresentation {
  unitId: string;
  scheduledAt: number;
  publications: OverviewPublicationDto[];
}

export interface WorkspacePlanPresentation {
  coverage: Availability<never[]>;
  upcoming: Availability<PublishingEventPresentation[]>;
  readyUnscheduled: Availability<never[]>;
}

export interface UnitOutcomeGroups {
  top: never[];
  emerging: never[];
  learningOpportunities: never[];
}

export interface WorkspaceInsightPresentation {
  id: string;
}

export interface ProductionEfficiencyPresentation {
  metrics: never[];
}

export type AttentionKind = "publication-failure" | "publication-reconciliation" | "account-relink" | "account-configuration";

export interface AttentionPresentation {
  kind: AttentionKind;
  severity: "critical" | "warning";
  accountId: string | null;
  affectedCount: number;
  title: string;
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
  accounts: AccountPresentation[];
  plan: WorkspacePlanPresentation;
  outcomes: Availability<UnitOutcomeGroups>;
  insights: Availability<WorkspaceInsightPresentation[]>;
  efficiency: Availability<ProductionEfficiencyPresentation>;
  attention: { items: AttentionPresentation[]; criticalCount: number };
  pulse: Availability<ProductionPulsePresentation>;
  projects: ActiveProjectPresentation[];
  recentChanges: Availability<RecentChangePresentation[]>;
  onboarding: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function presentWorkspaceOverview({
  overview, catalogProjects, description, now = Date.now(),
}: WorkspaceOverviewInput): WorkspaceOverviewPresentation {
  const publications = overview.publications?.items ?? [];
  const accounts = overview.accounts?.items ?? [];
  return {
    header: presentHeader(overview, description, accounts.length),
    momentum: presentMomentum(overview.metrics),
    accounts: accounts.map((account) => presentAccount(account, publications)),
    plan: presentPlan(overview.publications, now),
    outcomes: unavailable("Performance benchmarks and observation windows are not available from Core yet."),
    insights: unavailable("Evidence samples and counterexamples are not available from Core yet."),
    efficiency: unavailable("Production timing and reuse evidence are not available from Core yet."),
    attention: presentAttention(accounts, publications),
    pulse: unavailable("Workspace run and build progress is not available from Core yet."),
    projects: presentProjects(overview.projects?.items ?? [], catalogProjects),
    recentChanges: unavailable("Core currently returns technical activity without display names."),
    onboarding: (overview.projects?.items.length ?? 0) === 0 && publications.length === 0,
  };
}

function presentHeader(overview: WorkspaceOverviewDto, description: string, accountCount: number): WorkspaceHeaderPresentation {
  return {
    id: overview.workspace.id,
    name: overview.workspace.name,
    description,
    updatedAt: overview.workspace.updatedAt,
    accountCount,
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

function presentAccount(account: OverviewAccountDto, publications: OverviewPublicationDto[]): AccountPresentation {
  return {
    id: account.id,
    platform: account.platform,
    handle: account.username ?? account.displayName ?? account.externalId,
    displayName: account.displayName,
    credentialConfigured: account.credentialConfigured,
    relinkRequired: account.relinkRequired,
    publicationCount: publications.filter((publication) => publication.socialAccountId === account.id).length,
    updatedAt: account.updatedAt,
    metrics: unavailable("Account metrics are not available from the current Core contract."),
  };
}

function presentPlan(publications: Page<OverviewPublicationDto> | undefined, now: number): WorkspacePlanPresentation {
  const coverage = unavailable<never[]>("cadence targets are not configured in the current Core contract.");
  const readyUnscheduled = unavailable<never[]>("Ready Unit lifecycle state is not available from the current Core contract.");
  if (!publications) {
    return {
      coverage,
      upcoming: unavailable("Upcoming publications were not returned by Core."),
      readyUnscheduled,
    };
  }

  const events = new Map<string, PublishingEventPresentation>();
  for (const publication of publications.items) {
    if (publication.scheduledAt === null) continue;
    const scheduledAt = timestampMs(publication.scheduledAt);
    if (scheduledAt < now || scheduledAt >= now + 14 * DAY_MS) continue;
    const key = `${publication.unitId}:${publication.scheduledAt}`;
    const existing = events.get(key);
    if (existing) existing.publications.push(publication);
    else events.set(key, { unitId: publication.unitId, scheduledAt, publications: [publication] });
  }

  const upcoming = [...events.values()].sort((left, right) => left.scheduledAt - right.scheduledAt);
  return {
    coverage,
    upcoming: upcoming.length > 0
      ? { status: "ready", value: upcoming }
      : { status: "empty", reason: "Nothing scheduled in the next 14 days." },
    readyUnscheduled,
  };
}

function presentAttention(accounts: OverviewAccountDto[], publications: OverviewPublicationDto[]) {
  const items: AttentionPresentation[] = [
    ...publicationAttention(publications, "failed", "publication-failure", "Publication failed"),
    ...publicationAttention(publications, "reconciliation_required", "publication-reconciliation", "Publication needs reconciliation"),
    ...accounts.filter((account) => account.relinkRequired).map((account) => ({
      kind: "account-relink" as const,
      severity: "warning" as const,
      accountId: account.id,
      affectedCount: publications.filter((publication) => publication.socialAccountId === account.id).length,
      title: `${account.displayName ?? account.username ?? account.externalId} needs relinking`,
    })),
    ...accounts.filter((account) => !account.credentialConfigured).map((account) => ({
      kind: "account-configuration" as const,
      severity: "warning" as const,
      accountId: account.id,
      affectedCount: publications.filter((publication) => publication.socialAccountId === account.id).length,
      title: `${account.displayName ?? account.username ?? account.externalId} is not configured`,
    })),
  ];
  items.sort((left, right) => attentionPriority(left) - attentionPriority(right));
  return { items, criticalCount: items.filter((item) => item.severity === "critical").length };
}

function publicationAttention(
  publications: OverviewPublicationDto[],
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
    affectedCount: group.length,
    title,
  }));
}

function attentionPriority(item: AttentionPresentation): number {
  if (item.kind === "publication-failure" || item.kind === "publication-reconciliation") return 0;
  if (item.kind === "account-relink" || item.kind === "account-configuration") return 3;
  return 4;
}

function presentProjects(projects: ProjectDto[], catalogProjects: ProjectSummary[]): ActiveProjectPresentation[] {
  return projects
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
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

function unavailable<T>(reason: string): Availability<T> {
  return { status: "unavailable", reason };
}

function timestampMs(value: number): number {
  return value < 1_000_000_000_000 ? value * 1000 : value;
}
