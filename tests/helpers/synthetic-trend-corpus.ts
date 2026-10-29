// Test helper (#584): seed a synthetic trend corpus straight into the domain
// store with prepared statements. The shape follows the real scratch corpus
// (about one metric snapshot and two cohort labels per video, ~30 videos per
// creator) and exercises the value kinds a portable package must carry:
// nulls, REAL fractions, large integers, JSON columns, multi-line text with
// quotes, non-ASCII text, and strings that embed other entity ids.

import type { Database } from "bun:sqlite";
import { newDomainId } from "../../cli/lib/store/ids.js";

export type SyntheticTrendCounts = {
  watchlists: number; creators: number; creatorSnapshots: number; videos: number;
  snapshots: number; labels: number; digests: number; niches: number; members: number;
};

export function seedSyntheticTrendCorpus(db: Database, input: { workspaceId: string; runId: string; videos: number; videosPerCreator?: number; now?: number }): SyntheticTrendCounts {
  const now = input.now ?? Date.UTC(2026, 9, 1);
  const perCreator = input.videosPerCreator ?? 30;
  const creatorCount = Math.max(1, Math.ceil(input.videos / perCreator));
  const counts: SyntheticTrendCounts = { watchlists: 0, creators: 0, creatorSnapshots: 0, videos: 0, snapshots: 0, labels: 0, digests: 0, niches: 0, members: 0 };
  const platforms = ["tiktok", "youtube", "instagram"] as const;
  const checkpoints = ["h0-6", "h6-24", "d1-2", "d2-3", "d3-7", "d7-14", "d14-28", "d28", "monthly", "undated"] as const;
  const axes = ["niche", "sub_niche", "format", "hook", "length_band", "size_band", "language", "region", "audio"] as const;
  db.transaction(() => {
    const watchlist = db.prepare(`INSERT INTO trend_watchlists (id, workspace_id, platform, kind, value, source, niche, cadence_hours, active, cursor_json, last_run_id, last_run_at, row_version, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const watchlists: Array<{ id: string; platform: string }> = [];
    for (let index = 0; index < 12; index++) {
      const id = newDomainId("twatch"), platform = platforms[index % 3];
      watchlist.run(id, input.workspaceId, platform, index % 2 ? "hashtag" : "keyword", `seed value ${index} café`, "synthetic", index % 4 ? "fitness" : null,
        24 + index, index % 5 ? 1 : 0, index % 3 ? JSON.stringify({ page: index, after: `cursor-${index}` }) : null, index % 2 ? input.runId : null, index % 2 ? now - index : null, 1, now - 10_000, now);
      watchlists.push({ id, platform });
    }
    counts.watchlists = watchlists.length;
    const niches = [newDomainId("tniche"), newDomainId("tniche")];
    const niche = db.prepare(`INSERT INTO trend_niches (id, workspace_id, slug, topic, languages_json, platforms_json, parent_niche, taxonomy_json, settings_json, seed_source, last_run_id, row_version, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    niches.forEach((id, index) => niche.run(id, input.workspaceId, `niche-${index}`, `Synthetic topic ${index}`, '["en"]', '["tiktok","youtube"]', index ? "fitness" : null,
      JSON.stringify({ subNiches: [{ slug: "home", label: "Home \"gym\"" }, { slug: "mobility", label: "Mobility" }] }), JSON.stringify({ targetCreators: 300, ratio: 0.25 }), "file", input.runId, 2, now - 5_000, now));
    counts.niches = niches.length;
    const creator = db.prepare(`INSERT INTO trend_creators (id, workspace_id, platform, platform_creator_id, handle, display_name, follower_count, size_band, niche, sub_niche, niche_method, region, tier, discovered_via, watchlist_id, last_listed_at, next_list_at, last_posted_at, listing_failures, last_list_error, metadata_json, row_version, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const creatorSnapshot = db.prepare(`INSERT INTO trend_creator_snapshots (creator_id, as_of, source, follower_count, video_count, total_likes, run_id) VALUES (?,?,?,?,?,?,?)`);
    const member = db.prepare(`INSERT INTO trend_niche_members (niche_id, creator_id, status, cohort_group, language, relevance, sampled, on_topic, sub_niche, sub_niche_confidence, gate_method, gate_reason, flags_json, evidence_json, round, discovered_via, evaluated_at, run_id, row_version, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const creators: Array<{ id: string; platform: string }> = [];
    for (let index = 0; index < creatorCount; index++) {
      const id = newDomainId("tcreator"), source = watchlists[index % watchlists.length];
      const previous = creators.at(-1);
      creator.run(id, input.workspaceId, source.platform, `creator-${index}`, index % 7 ? `@handle_${index}` : null, `Creator Émilie ${index}`, index % 9 ? 1_000 + index * 37 : null,
        ["seed", "nano", "micro", "mid", "macro", "mega"][index % 6], index % 3 ? "fitness" : null, index % 4 ? "home" : null, index % 3 ? "seed" : null, index % 2 ? "US" : null,
        index % 11 ? "active" : "dormant", previous ? `related:${previous.id}` : "seed", index % 2 ? source.id : null, now - index * 1_000, now + index * 1_000, now - index * 3_600,
        index % 13, index % 13 ? "timeout after 30s" : null, JSON.stringify({ bio: `Line one\nline "two" ${index}`, links: [`https://example.com/${index}`] }), 1 + (index % 3), now - 20_000, now);
      creators.push({ id, platform: source.platform });
      creatorSnapshot.run(id, now - 86_400_000, "listing", 1_000 + index, 30 + (index % 50), 9_007_199_254_000 + index, input.runId);
      counts.creatorSnapshots++;
      member.run(niches[index % 2], id, ["candidate", "kept", "dropped", "undetermined"][index % 4], index % 4 === 1 ? "main" : null, "en", (index % 100) / 100, 12, index % 12,
        index % 2 ? "home" : null, index % 2 ? 0.875 : null, index % 3 ? "rule" : "llm", index % 3 ? "lexicon match" : null, JSON.stringify(index % 5 ? [] : ["anomaly-followers"]),
        index % 2 ? JSON.stringify({ matched: ["squat", "mobility"], score: 0.3333333333333333 }) : null, index % 3, `seed:${source.id}`, now, input.runId, 1, now - 1_000, now);
      counts.members++;
    }
    counts.creators = creators.length;
    const video = db.prepare(`INSERT INTO trend_videos (id, workspace_id, platform, platform_video_id, creator_id, format_key, url, posted_at, posted_at_source, duration_ms, width, height, title, description, hashtags_json, sound_id, sound_title, sound_original, language, region, is_ad, aigc_label, discovered_via, discovered_at, in_listing, latest_as_of, latest_views, latest_likes, latest_comments, latest_shares, latest_saves, latest_views_precision, latest_source, cohort_key, outlier_multiplier, outlier_z, outlier_score, outlier_label, outlier_mode, outlier_flags_json, outlier_detail_json, outlier_computed_at, momentum, next_snapshot_at, row_version, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const snapshot = db.prepare(`INSERT INTO trend_metric_snapshots (video_id, checkpoint, bucket_seq, source, as_of, age_ms, views, likes, comments, shares, saves, views_precision, run_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const label = db.prepare(`INSERT INTO trend_cohort_labels (video_id, axis, taxonomy_version, method, label, model, confidence, run_id, created_at) VALUES (?,?,?,?,?,?,?,?,?)`);
    const digest = db.prepare(`INSERT INTO trend_video_digests (video_id, digest_version, ref_kind, digest_ref, params_json, created_at) VALUES (?,?,?,?,?,?)`);
    const labels = ["breakout", "outlier", "strong", "normal", "under"] as const;
    for (let index = 0; index < input.videos; index++) {
      const owner = creators[Math.floor(index / perCreator) % creators.length];
      const id = newDomainId("tvideo"), views = index % 17 ? 100 + index * 977 : null;
      video.run(id, input.workspaceId, owner.platform, `v77${String(index).padStart(12, "0")}`, owner.id, index % 2 ? "vertical-short" : "vertical-long",
        `https://example.com/${owner.platform}/v/${index}?ref=synthetic&n=${index}`, index % 9 ? now - index * 60_000 : null, index % 9 ? "listing" : null, index % 5 ? 15_000 + index : null,
        1080, 1920, index % 3 ? `Title ${index}: "quoted" — café \u{1F3CB}` : null, index % 4 ? `Description line 1 for ${index}\nline 2 with tabs\tand back\\slash` : null,
        index % 2 ? JSON.stringify([`#tag${index % 50}`, "#fyp"]) : null, index % 6 ? `sound-${index % 400}` : null, index % 6 ? `Sound ${index % 400}` : null, index % 2,
        index % 5 ? "en" : null, index % 2 ? "US" : null, index % 23 === 0 ? 1 : 0, index % 31 === 0 ? 1 : null, `listing:${owner.id}`, now - index, index % 2,
        now, views, views === null ? null : Math.floor(views / 10), views === null ? null : index % 100, views === null ? null : index % 10, index % 3 ? index % 7 : null,
        index % 8 ? "exact" : "rounded", "listing", `${owner.platform}|fitness|vertical-short`, index % 4 ? 1 + (index % 1000) / 997 : null, index % 4 ? -1.5 + (index % 300) / 101 : null,
        index % 4 ? (index % 1000) / 7 : null, index % 4 ? labels[index % 5] : null, index % 4 ? (index % 2 ? "projected" : "same-age") : null,
        index % 4 ? JSON.stringify(index % 20 ? [] : ["low-n"]) : null, index % 4 ? JSON.stringify({ n: 30 + (index % 9), median: 1234.5678, mad: 0.1 + (index % 10) / 3 }) : null,
        index % 4 ? now : null, index % 6 ? (index % 500) / 13 : null, index % 3 ? now + 3_600_000 : null, 1 + (index % 4), now - 30_000, now);
      snapshot.run(id, checkpoints[index % checkpoints.length], index % 10 === 8 ? 3 : index % 10 === 9 ? 20_400 + (index % 7) : 0, "listing", now - 1_000, index % 9 ? 3_600_000 + index : null,
        views, views === null ? null : Math.floor(views / 10), index % 100, index % 10, index % 3 ? index % 7 : null, index % 8 ? "exact" : "rounded", input.runId);
      counts.snapshots++;
      label.run(id, axes[index % axes.length], 1, "rule", `label-${index % 40}`, null, null, input.runId, now);
      counts.labels++;
      if (index % 5 !== 0) {
        label.run(id, axes[(index + 3) % axes.length], 2, "llm", `llm-label-${index % 12}`, "synthetic-model", (index % 100) / 100, input.runId, now);
        counts.labels++;
      }
      if (index % 1000 === 0) {
        digest.run(id, 1, "bundle", `cache/digests/${index}/digest`, JSON.stringify({ frames: 8 }), now);
        counts.digests++;
      }
    }
    counts.videos = input.videos;
  }).immediate();
  return counts;
}
