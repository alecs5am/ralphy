/**
 * The fixtures the mock bridge answers with: one workspace, its projects, and the catalog they
 * live in.
 *
 * These are what the design harnesses and the tests see. Every path is under a root that does not
 * exist, so nothing here can be mistaken for -- or write to -- a real library.
 */
import type {
  CatalogResult,
  ProjectSummary,
  WorkspaceSummary,
} from "../../../electron/media/types";

export const MOCK_ROOT = "/Users/demo/ralphy-project/.ralphy";
export const MOCK_WORKSPACE = `${MOCK_ROOT}/workspaces/ux-testing-lab`;

export const mockWorkspaces: WorkspaceSummary[] = [
  // Named "UX Testing Lab" on purpose: that is the workspace the design spec allows to
  // receive deterministic renderer-only test data, so the island feed and review console
  // exercise their real states in a browser dev session.
  {
    id: "ux-testing-lab",
    name: "UX Testing Lab",
    description: "Design-system review surface for the instrument redesign.",
    absolutePath: MOCK_WORKSPACE,
    projectCount: 3,
    sharedCount: 12,
    unitCount: 8,
    finalCount: 4,
    recentActivity: "2026-07-30T09:42:00.000Z",
  },
  {
    id: "fogtown",
    name: "Fog Town",
    description: "Narrative world, cast references, and episodic reels.",
    absolutePath: `${MOCK_ROOT}/workspaces/fogtown`,
    projectCount: 7,
    sharedCount: 24,
    unitCount: 15,
    finalCount: 9,
    recentActivity: "2026-07-29T18:10:00.000Z",
  },
  {
    id: "archive",
    name: "Archive",
    description: "Completed campaigns retained for reference.",
    absolutePath: `${MOCK_ROOT}/workspaces/archive`,
    projectCount: 18,
    sharedCount: 6,
    unitCount: 31,
    finalCount: 26,
    recentActivity: "2026-07-22T12:00:00.000Z",
  },
];

export const mockProjects: ProjectSummary[] = [
  {
    id: "ux-testing-lab/coffee-grinder-001",
    workspaceId: "ux-testing-lab",
    projectId: "coffee-grinder-001",
    name: "Arc Grinder Launch",
    brief: "A tactile 15-second creator review focused on grind consistency.",
    status: "assets",
    phase: "production",
    finalState: "review",
    platform: "tiktok",
    aspectRatio: "9:16",
    spendUsd: 3.84,
    finalCount: 1,
    sharedCount: 12,
    unitCount: 3,
    recentActivity: "2026-07-30T09:42:00.000Z",
  },
  {
    id: "ux-testing-lab/skin-set-004",
    workspaceId: "ux-testing-lab",
    projectId: "skin-set-004",
    name: "Night Set Unboxing",
    brief: "Warm bathroom-counter unboxing with three product details.",
    status: "done",
    phase: "delivery",
    finalState: "ready",
    platform: "instagram",
    aspectRatio: "4:5",
    spendUsd: 6.2,
    finalCount: 2,
    sharedCount: 12,
    unitCount: 3,
    recentActivity: "2026-07-29T16:21:00.000Z",
  },
  {
    id: "ux-testing-lab/trail-shoe-002",
    workspaceId: "ux-testing-lab",
    projectId: "trail-shoe-002",
    name: "Trail Shoe Macro",
    brief: "Mud, tread, and lace detail cuts for a concise paid social spot.",
    status: "prompts",
    phase: "preflight",
    finalState: "missing",
    platform: "youtube-shorts",
    aspectRatio: "9:16",
    spendUsd: 0.65,
    finalCount: 0,
    sharedCount: 12,
    unitCount: 2,
    recentActivity: "2026-07-28T11:05:00.000Z",
  },
];

export function mockCatalog(generation = 1): CatalogResult {
  return {
    rootPath: MOCK_ROOT,
    generation,
    workspaces: mockWorkspaces,
    projects: mockProjects,
    mediaItemCount: 0,
    completedAt: "2026-07-30T09:43:00.000Z",
  };
}
