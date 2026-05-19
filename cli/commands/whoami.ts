// `ralphy whoami` — show, update, backfill the per-user profile.
//
// This is the verb the agent calls on session start to figure out who they're
// talking to (novice / learning / intermediate / comfortable / experienced /
// expert) and how to adapt their intake verbosity per intake.md.
//
// Three modes:
//   ralphy whoami                       → load profile, print status
//   ralphy whoami --backfill            → scan workspace, recompute score, save
//   ralphy whoami --set-level <n>       → pin skill to <n> (override auto)
//   ralphy whoami --set-developer       → mark this user as a developer
//   ralphy whoami --bump-session        → increment sessions_count (called by index.ts on first invocation per day)

import { Command } from "commander";
import path from "node:path";
import { out, ok, err } from "../lib/output.js";
import { root } from "../lib/paths.js";
import {
  loadUserProfile,
  saveUserProfile,
  computeSkillScore,
  bandForScore,
  backfillFromWorkspace,
  type UserProfile,
} from "../lib/user-profile.js";

function recommendationFor(profile: UserProfile): string {
  if (profile.is_developer) {
    return "developer mode — minimal intake, raw CLI suggestions OK, ship-fast by default";
  }
  const { band } = profile.skill;
  switch (band) {
    case "novice":
      return "tutorial mode — full intake with explanations; show mini-lessons after each successful step (template-suggest, anchor-order, regen-versioning, evaluator-handback)";
    case "learning":
      return "guided mode — full intake, light tutorials at decision points, surface 'why' inline for new concepts";
    case "intermediate":
      return "standard mode — full intake (5 questions), step-by-step generation with checkpoints, no mini-lectures";
    case "comfortable":
      return "compact mode — full intake but tighter; batch 4-6 gens after 2 solo approvals; surface explanations only on errors";
    case "experienced":
      return "ship mode — short intake (only critical params: brand / aspect / language); batch by default; minimal hand-holding";
    case "expert":
      return "expert mode — assume user knows the surface; one-line confirmation before paid gens; otherwise just do it";
  }
}

function nextMilestone(profile: UserProfile): string | null {
  const { score } = profile.skill;
  if (score < 2) return "Ship 1 project (status=done) → learning band";
  if (score < 4) return "Write 1 postmortem (rate it 7+/10) → intermediate band";
  if (score < 6) return "Ship 2 more projects + use 3 distinct templates → comfortable band";
  if (score < 8) return "Hit 5 projects done + 3 postmortems with avg rating ≥7 → experienced band";
  if (score < 10) return "Hit 5+ projects + 5 postmortems + 15 distinct CLI verbs → expert band";
  return null;
}

export function whoamiCmd(): Command {
  const cmd = new Command("whoami").description(
    "Show the per-user profile (skill score 0-10, developer badge, signals, recommendation for adaptive intake). On first call, auto-backfills from workspace/projects.",
  );

  cmd
    .option("--backfill", "Scan workspace/projects/* and recompute signals from on-disk state (renders, postmortems)", false)
    .option("--set-level <n>", "Pin skill score to <n> (0-10). Overrides auto-assessment.", (v) => parseFloat(v))
    .option("--set-developer", "Mark this user as a developer — unlocks raw CLI suggestions + ship-fast default", false)
    .option("--unset-developer", "Remove the developer badge", false)
    .option("--reset", "Reset profile to defaults (preserves firstSeen)", false)
    .option("--bump-session", "Increment sessions_count (called by ralphy index on first invocation per day)", false)
    .action(async (opts: {
      backfill?: boolean;
      setLevel?: number;
      setDeveloper?: boolean;
      unsetDeveloper?: boolean;
      reset?: boolean;
      bumpSession?: boolean;
    }) => {
      let profile = await loadUserProfile();
      let changed = false;

      if (opts.reset) {
        const { defaultProfile } = await import("../lib/user-profile.js");
        const fresh = defaultProfile();
        // Preserve firstSeen so the user's tenure isn't reset
        fresh.firstSeen = profile.firstSeen;
        profile = fresh;
        changed = true;
      }

      if (opts.backfill || (profile.signals.projects_done === 0 && profile.signals.renders_shipped === 0)) {
        // First-run OR explicit --backfill → scan workspace.
        const workspaceRoot = path.join(root(), "workspace");
        const fromDisk = await backfillFromWorkspace({ workspaceRoot });
        profile.signals = { ...profile.signals, ...fromDisk };
        if (profile.signals.first_template_used_at === null && fromDisk.projects_done > 0) {
          profile.signals.first_template_used_at = new Date().toISOString();
        }
        changed = true;
      }

      if (opts.setDeveloper) {
        profile.is_developer = true;
        changed = true;
      }
      if (opts.unsetDeveloper) {
        profile.is_developer = false;
        changed = true;
      }

      if (opts.setLevel !== undefined) {
        if (opts.setLevel < 0 || opts.setLevel > 10) {
          err(`--set-level must be 0-10 (got ${opts.setLevel})`);
        }
        profile.skill.user_override = opts.setLevel;
        profile.skill.score = opts.setLevel;
        profile.skill.band = bandForScore(opts.setLevel);
        profile.skill.auto_assessed = false;
        profile.skill.assessed_at = new Date().toISOString();
        changed = true;
      } else if (profile.skill.user_override === null) {
        // Auto-recompute from current signals
        const newScore = computeSkillScore(profile.signals);
        if (newScore !== profile.skill.score) {
          profile.skill.score = newScore;
          profile.skill.band = bandForScore(newScore);
          profile.skill.auto_assessed = true;
          profile.skill.assessed_at = new Date().toISOString();
          changed = true;
        }
      }

      if (opts.bumpSession) {
        profile.signals.sessions_count += 1;
        // Recompute score if auto-assessed
        if (profile.skill.user_override === null) {
          profile.skill.score = computeSkillScore(profile.signals);
          profile.skill.band = bandForScore(profile.skill.score);
        }
        changed = true;
      }

      if (changed) await saveUserProfile(profile);

      const payload = {
        firstSeen: profile.firstSeen,
        lastSeen: profile.lastSeen,
        is_developer: profile.is_developer,
        skill: profile.skill,
        signals: profile.signals,
        preferences: profile.preferences,
        recommendation: recommendationFor(profile),
        next_milestone: nextMilestone(profile),
      };

      const ui = await import("../lib/ui.js");
      if (!ui.isPrettyMode()) {
        out(payload);
        return;
      }

      // Pretty whoami — section-by-section
      const { c, icons, section, kv, bar, skillPath } = ui;
      const badge = profile.is_developer ? `  ${icons.star} ${c.brand("developer")}` : "";
      console.log();
      console.log(`${icons.spark} ${c.bold("ralphy whoami")}${badge}`);
      console.log();
      console.log(`  ${c.label("First seen")}   ${c.value(profile.firstSeen.slice(0, 10))}`);
      console.log(`  ${c.label("Last seen ")}   ${c.value(profile.lastSeen.slice(0, 10))}`);

      section("Skill");
      console.log(`  ${bar(profile.skill.score, 10)}  ${c.bold(profile.skill.score.toFixed(1) + " / 10")}  ${c.brand(profile.skill.band)}`);
      console.log(`  ${skillPath(profile.skill.band)}`);
      if (profile.skill.user_override !== null) {
        console.log(`  ${icons.warn} ${c.warn(`pinned by user at ${profile.skill.user_override}`)} (auto-assessment disabled)`);
      }

      section("Signals");
      kv(
        {
          "Projects done": profile.signals.projects_done,
          "With postmortem": profile.signals.projects_with_postmortem,
          "Renders shipped": profile.signals.renders_shipped,
          "Templates used": profile.signals.templates_used_count,
          "CLI verb breadth": profile.signals.cli_verb_breadth,
          "Sessions": profile.signals.sessions_count,
          "Avg postmortem rating": profile.signals.avg_postmortem_rating ?? c.muted("—"),
        },
        { maxKeyWidth: 22 },
      );

      section("Preferences");
      kv(
        {
          "Default language": profile.preferences.default_language ?? c.muted("—  (not yet captured)"),
          "Default aspect": profile.preferences.default_aspect ?? c.muted("—  (not yet captured)"),
          "Preferred models": Object.keys(profile.preferences.preferred_models).length === 0 ? c.muted("—  (auto-learned over sessions)") : JSON.stringify(profile.preferences.preferred_models),
          "Skip intake for": profile.preferences.skip_intake_for.length === 0 ? c.muted("none") : profile.preferences.skip_intake_for.join(", "),
        },
        { maxKeyWidth: 22 },
      );

      section("Adaptive intake behavior");
      console.log(`  ${recommendationFor(profile)}`);

      const milestone = nextMilestone(profile);
      if (milestone) {
        section("Next milestone");
        console.log(`  ${icons.pending} ${c.value(milestone)}`);
      } else {
        section("Next milestone");
        console.log(`  ${icons.star} ${c.brand("expert band — congrats")}`);
      }

      console.log();
    });

  return cmd;
}
