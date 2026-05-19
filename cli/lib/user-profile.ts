// Per-user profile persisting skill level, signals, preferences, and the
// developer badge. Lives at ~/.ralphy/user-profile.json. Cross-project,
// per-user (survives git clean, cd between projects, etc).
//
// The skill score is computed on a 0-10 continuous scale from signals
// (projects shipped, postmortems written, distinct verbs used, etc). The
// agent reads the profile on session start via `ralphy whoami` and adapts
// intake.md verbosity per the band the score falls into.

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export type SkillBand =
  | "novice"
  | "learning"
  | "intermediate"
  | "comfortable"
  | "experienced"
  | "expert";

export type Signals = {
  projects_done: number;
  projects_with_postmortem: number;
  renders_shipped: number;
  avg_postmortem_rating: number | null;
  templates_used_count: number;
  first_template_used_at: string | null;
  cli_verb_breadth: number;
  sessions_count: number;
  days_since_first_seen: number;
};

export type Skill = {
  score: number;
  band: SkillBand;
  auto_assessed: boolean;
  user_override: number | null;
  assessed_at: string;
};

export type Preferences = {
  default_language: string | null;
  default_aspect: string | null;
  preferred_models: Record<string, string>;
  skip_intake_for: string[];
};

export type TutorialState = {
  intro_seen: boolean;
  completed_lessons: string[];
};

export type UserProfile = {
  version: 1;
  firstSeen: string;
  lastSeen: string;
  is_developer: boolean;
  skill: Skill;
  signals: Signals;
  preferences: Preferences;
  tutorial_state: TutorialState;
};

export function defaultProfile(): UserProfile {
  const now = new Date().toISOString();
  return {
    version: 1,
    firstSeen: now,
    lastSeen: now,
    is_developer: false,
    skill: {
      score: 0,
      band: "novice",
      auto_assessed: true,
      user_override: null,
      assessed_at: now,
    },
    signals: {
      projects_done: 0,
      projects_with_postmortem: 0,
      renders_shipped: 0,
      avg_postmortem_rating: null,
      templates_used_count: 0,
      first_template_used_at: null,
      cli_verb_breadth: 0,
      sessions_count: 0,
      days_since_first_seen: 0,
    },
    preferences: {
      default_language: null,
      default_aspect: null,
      preferred_models: {},
      skip_intake_for: [],
    },
    tutorial_state: {
      intro_seen: false,
      completed_lessons: [],
    },
  };
}

// ─── I/O ─────────────────────────────────────────────────────────────────────

export type ProfileIoOptions = {
  /** Override $HOME for tests. Defaults to os.homedir(). */
  home?: string;
};

function profilePath(opts?: ProfileIoOptions): string {
  const home = opts?.home ?? os.homedir();
  return path.join(home, ".ralphy", "user-profile.json");
}

export async function loadUserProfile(opts?: ProfileIoOptions): Promise<UserProfile> {
  const p = profilePath(opts);
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    const base = defaultProfile();
    return {
      ...base,
      ...parsed,
      skill: { ...base.skill, ...(parsed.skill ?? {}) },
      signals: { ...base.signals, ...(parsed.signals ?? {}) },
      preferences: { ...base.preferences, ...(parsed.preferences ?? {}) },
      tutorial_state: { ...base.tutorial_state, ...(parsed.tutorial_state ?? {}) },
    };
  } catch {
    return defaultProfile();
  }
}

export async function saveUserProfile(profile: UserProfile, opts?: ProfileIoOptions): Promise<void> {
  const p = profilePath(opts);
  await fs.mkdir(path.dirname(p), { recursive: true });
  const updated = { ...profile, lastSeen: new Date().toISOString() };
  await fs.writeFile(p, JSON.stringify(updated, null, 2) + "\n", "utf8");
}

// ─── Skill scoring ────────────────────────────────────────────────────────────

export function computeSkillScore(s: Signals): number {
  let score = 0;
  score += Math.min(5, s.projects_done) * 0.8;
  score += Math.min(5, s.projects_with_postmortem) * 0.6;
  if (s.avg_postmortem_rating !== null) {
    score += (s.avg_postmortem_rating / 10) * 1.5;
  }
  score += Math.min(5, s.templates_used_count) * 0.2;
  score += Math.min(15, s.cli_verb_breadth) * 0.1;
  score += Math.min(20, s.sessions_count) * 0.05;
  return Math.round(Math.max(0, Math.min(10, score)) * 10) / 10;
}

export function bandForScore(score: number): SkillBand {
  if (score < 2) return "novice";
  if (score < 4) return "learning";
  if (score < 6) return "intermediate";
  if (score < 8) return "comfortable";
  if (score < 10) return "experienced";
  return "expert";
}

// ─── Backfill from workspace ─────────────────────────────────────────────────

export type BackfillOptions = {
  workspaceRoot: string;
};

export type BackfillSignals = Pick<
  Signals,
  "projects_done" | "projects_with_postmortem" | "renders_shipped"
>;

export async function backfillFromWorkspace(opts: BackfillOptions): Promise<BackfillSignals> {
  const projectsDir = path.join(opts.workspaceRoot, "projects");
  let entries: import("fs").Dirent[] = [];
  try {
    entries = await fs.readdir(projectsDir, { withFileTypes: true });
  } catch {
    return { projects_done: 0, projects_with_postmortem: 0, renders_shipped: 0 };
  }

  let projects_done = 0;
  let projects_with_postmortem = 0;
  let renders_shipped = 0;

  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(projectsDir, e.name);

    let renderDirEntries: import("fs").Dirent[] = [];
    try {
      renderDirEntries = await fs.readdir(path.join(dir, "render"), { withFileTypes: true });
    } catch {
      /* no render dir, project not done */
    }
    const finalRenders = renderDirEntries.filter(
      (r) => r.isFile() && /^final.*\.mp4$/i.test(r.name),
    );
    if (finalRenders.length > 0) {
      projects_done += 1;
      renders_shipped += finalRenders.length;
    }

    let hasPostmortem = false;
    try {
      await fs.access(path.join(dir, "postmortem", "00-INDEX.md"));
      hasPostmortem = true;
    } catch {
      /* check legacy */
    }
    if (!hasPostmortem) {
      try {
        await fs.access(path.join(dir, "POSTMORTEM.md"));
        hasPostmortem = true;
      } catch {
        /* still no */
      }
    }
    if (hasPostmortem) projects_with_postmortem += 1;
  }

  return { projects_done, projects_with_postmortem, renders_shipped };
}
