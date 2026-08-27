/**
 * What the workspace overview presents, as shapes.
 *
 * Every count and list is an `Availability`, never a bare number: a zero the source reported and
 * a zero that means "no source answered" are different facts, and the screen has to say which one
 * it is showing.
 */
import type {
  OverviewAccountDto,
  OverviewPublicationDto,
  ProjectDto,
  UnitDto,
  WorkspaceOverviewDto,
} from "../../../../electron/ralphy/types";
import type { ProjectSummary } from "@/shared/api/ipc";

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
  username: string | null;
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
