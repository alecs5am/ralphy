// `ralphy avatar <create|link|list|show|consent|delete>` — persistent performers (#555).
//
// A trained avatar is account-level, reusable, and expensive to recreate
// ($1.00 per HeyGen creation call), so it lives in the workspace store
// (`.ralphy/workspaces/<ws>/avatars.json`) under a LOCAL slug. Every downstream
// verb takes that slug, so no provider id ever has to appear on a command line:
//
//   ralphy avatar create --from artifacts/refs/presenter.mp4 --name "Marco" --type digital_twin --wait
//   ralphy avatar consent marco --video artifacts/refs/marco-consent.mp4
//   ralphy generate lipsync --project my-ad-001 --slot hook-01 --avatar marco \
//     --script-file scripts/hook.txt --voice marco-voice --engine avatar_v
//
// The engine/consent constraint is the load-bearing fact this surface exists to
// make visible: Avatar V requires a `digital_twin`, a digital twin requires a
// consent video, and the consent clip has to show the same real person as the
// training footage. `list` prints the engine column for exactly that reason.
// Nothing here manufactures a consent clip — a blocked avatar reports the
// remediation instead.

import { Command } from "commander";
import { existsSync } from "node:fs";
import path from "node:path";
import { out, ok, err } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { slugify } from "../lib/ids.js";
import { currentWorkspace, workspaceDir } from "../lib/paths.js";
import { probeDurationSec } from "../lib/ffmpeg-recipes.js";
import { logGeneration } from "../lib/gen-log.js";
import { generationDestination } from "../lib/generation-destination.js";
import {
  getAvatar,
  loadPerformers,
  patchAvatar,
  putAvatar,
  removeAvatar,
  type StoredAvatar,
} from "../lib/avatars.js";
import {
  avatarErrorText,
  checkTwinFootage,
  createAvatar,
  getAvatarGroup,
  getAvatarLook,
  HEYGEN_AVATAR_CREATE_USD,
  listAvatarLooks,
  registerAvatarConsent,
  waitForAvatar,
  type HeygenAvatarLook,
} from "../lib/providers/heygen.js";

const AVATAR_TYPES = ["digital_twin", "photo", "prompt"] as const;

function resolveWorkspace(slug?: string): string {
  const ws = slug?.trim() || currentWorkspace();
  if (!existsSync(workspaceDir(ws))) raiseError("E_NOT_FOUND", { kind: "Workspace", id: ws });
  return ws;
}

async function requireAvatar(workspace: string, slug: string): Promise<StoredAvatar> {
  const record = await getAvatar(workspace, slug);
  if (!record) raiseError("E_NOT_FOUND", { kind: "Avatar", id: `${workspace}/${slug}` });
  return record;
}

/** Provider-side look → the fields the local store mirrors. */
function lookPatch(look: HeygenAvatarLook): Partial<StoredAvatar> {
  return {
    status: look.status,
    engines: look.supported_api_engines ?? [],
    error: avatarErrorText(look.error),
    ...(look.avatar_type ? { type: look.avatar_type } : {}),
    ...(look.group_id ? { groupId: look.group_id } : {}),
  };
}

function row(record: StoredAvatar) {
  return {
    slug: record.slug,
    name: record.name,
    type: record.type,
    status: record.status ?? null,
    engines: record.engines?.length ? record.engines : null,
    consent: record.consentStatus ?? null,
    lookId: record.lookId,
  };
}

export function avatarCmd(): Command {
  const cmd = new Command("avatar").description(
    "Persistent avatars — create, train, consent and list reusable performers (HeyGen).",
  );

  cmd
    .command("create")
    .description(
      "Create + train a persistent avatar and store it in the workspace under a local slug. digital_twin unlocks Avatar V but requires a consent video; photo needs no consent and exposes Avatar IV / III only; prompt generates a synthetic look from text.",
    )
    .requiredOption("--name <name>", "Display name (also the default slug)")
    .option("--from <ref>", "Training footage (digital_twin: 15-600s clip) or still (photo). Local path or URL.")
    .option("--prompt <text>", "Look description for --type prompt (<=1000 chars)")
    .option("--ref-image <ref...>", "Reference images for --type prompt (up to 3)")
    .option("--type <type>", `Avatar family: ${AVATAR_TYPES.join(" | ")}`, "digital_twin")
    .option("--slug <slug>", "Local slug for the store. Default: slugified --name.")
    .option("--workspace <slug>", "Workspace that owns the avatar. Default: active workspace.")
    .option("--group <groupId>", "Attach the new look to an existing avatar group instead of creating one")
    .option("--wait", "Poll until training leaves `processing` before returning", false)
    .option("--poll-interval-ms <ms>", "Polling cadence while --wait (default 10000)", parseInt)
    .option("--poll-max-attempts <n>", "Max polls while --wait (default 60 ≈ 10min)", parseInt)
    .option("--dry-run", "Validate inputs + print the resolved plan and cost; do not submit", false)
    .action(async (opts) => {
      if (!AVATAR_TYPES.includes(opts.type)) {
        raiseError("E_INPUT_INVALID", {
          field: "type",
          detail: `must be one of: ${AVATAR_TYPES.join(", ")}`,
          verb: "avatar create",
        });
      }
      const workspace = resolveWorkspace(opts.workspace);
      const slug = slugify(opts.slug || opts.name);

      if (opts.type === "prompt") {
        if (!opts.prompt) {
          raiseError("E_FLAG_MISSING", { flag: "prompt", verb: "avatar create" });
        }
      } else if (!opts.from) {
        raiseError("E_FLAG_MISSING", { flag: "from", verb: "avatar create" });
      }

      // Pre-flight the twin training band locally — HeyGen bills the creation
      // call whether or not the footage is in band.
      let footageSec: number | null = null;
      if (opts.type === "digital_twin" && opts.from && !/^https?:\/\//.test(opts.from)) {
        const source = path.resolve(opts.from);
        if (!existsSync(source)) {
          raiseError("E_FILE_UNREADABLE", { path: source, verb: "avatar create" });
        }
        footageSec = probeDurationSec(source);
        const problem = checkTwinFootage(footageSec);
        if (problem) {
          raiseError("E_INPUT_INVALID", { field: "from", detail: problem, verb: "avatar create" });
        }
      }

      if (opts.dryRun) {
        out({
          dryRun: true,
          workspace,
          slug,
          name: opts.name,
          type: opts.type,
          source: opts.from ?? null,
          prompt: opts.prompt ?? null,
          footageDurationSec: footageSec,
          estimatedCostUsd: HEYGEN_AVATAR_CREATE_USD,
          consentRequired: opts.type === "digital_twin",
        });
        return;
      }

      const t0 = Date.now();
      try {
        const { look, group } = await createAvatar({
          type: opts.type,
          name: opts.name,
          source: opts.from,
          prompt: opts.prompt,
          referenceImages: opts.refImage,
          groupId: opts.group,
        });
        if (!look?.id) {
          err("HeyGen returned no avatar look id — nothing was persisted. Retry, or check `ralphy provider balance`.");
        }
        const settled = opts.wait
          ? await waitForAvatar(look!.id, {
              pollIntervalMs: opts.pollIntervalMs,
              pollMaxAttempts: opts.pollMaxAttempts,
            })
          : look!;

        const record = await putAvatar(workspace, {
          slug,
          provider: "heygen",
          name: opts.name,
          type: settled.avatar_type ?? opts.type,
          lookId: settled.id,
          groupId: settled.group_id ?? group?.id,
          status: settled.status,
          engines: settled.supported_api_engines ?? [],
          consentStatus: group?.consent_status ?? null,
          sourceRef: opts.from ?? opts.prompt,
          error: avatarErrorText(settled.error),
        });

        await logGeneration(generationDestination({ workspaceId: workspace }), {
          slot: record.slug,
          provider: "heygen",
          model: `avatar-create-${record.type}`,
          endpoint: "/v3/avatars",
          kind: "other",
          input: { slot: record.slug, workspace, type: record.type, name: opts.name },
          output: { job_id: record.lookId },
          status: "ok",
          latency_ms: Date.now() - t0,
          cost_usd: HEYGEN_AVATAR_CREATE_USD,
          note: `avatar create ${record.slug}`,
        });

        ok(`Avatar stored: ${record.slug} (${record.status ?? "submitted"})`);
        out({
          ...row(record),
          workspace,
          groupId: record.groupId ?? null,
          error: record.error ?? null,
          next:
            record.type === "digital_twin" && record.consentStatus !== "approved"
              ? `ralphy avatar consent ${record.slug} --video <clip of the same person reading HeyGen's consent sentence>`
              : `ralphy generate lipsync --project <id> --slot <slot> --avatar ${record.slug} --script "<line>" --voice <voice>`,
        });
      } catch (e) {
        err((e as Error).message);
      }
    })
    .addHelpText(
      "after",
      `
Engine / consent constraint (probed 2026-07-28):
  digital_twin  consent REQUIRED   engines: avatar_v, avatar_iv, avatar_iii
  photo         no consent         engines: avatar_iv, avatar_iii
  prompt        no consent         engines: as advertised by the trained look

  Avatar V on your own avatar therefore implies digital_twin, which implies a
  consent video recorded by the same real person. Training footage must be
  15-600s; an 8s clip fails with "Footage is too short or too long".

Examples:
  ralphy avatar create --from artifacts/refs/presenter.mp4 --name "Marco" --type digital_twin --wait
  ralphy avatar create --from artifacts/images/hook-frame.png --name "Hook Face" --type photo
  ralphy avatar create --type prompt --name "Studio Host" --prompt "35yo female presenter, neutral studio, soft key light"
`,
    );

  cmd
    .command("link <lookId>")
    .description(
      "Adopt an avatar that already exists on the provider account into the workspace store under a local slug (no training, no charge). Use `avatar list` to find unlinked looks.",
    )
    .requiredOption("--slug <slug>", "Local slug to store it under")
    .option("--name <name>", "Display name. Default: the provider-side look name.")
    .option("--workspace <slug>", "Workspace that owns the avatar. Default: active workspace.")
    .action(async (lookId: string, opts) => {
      const workspace = resolveWorkspace(opts.workspace);
      try {
        const look = await getAvatarLook(lookId);
        const group = look.group_id ? await getAvatarGroup(look.group_id).catch(() => null) : null;
        const record = await putAvatar(workspace, {
          slug: slugify(opts.slug),
          provider: "heygen",
          name: opts.name || look.name || lookId,
          type: look.avatar_type ?? "unknown",
          lookId: look.id,
          groupId: look.group_id,
          status: look.status,
          engines: look.supported_api_engines ?? [],
          consentStatus: group?.consent_status ?? null,
          error: avatarErrorText(look.error),
        });
        ok(`Avatar linked: ${record.slug}`);
        out({ ...row(record), workspace, groupId: record.groupId ?? null });
      } catch (e) {
        err((e as Error).message);
      }
    });

  cmd
    .command("list")
    .description(
      "List the workspace's avatars, refreshed from the provider. The engines column is the point: it is how you learn why avatar_v is unavailable on a given look.",
    )
    .option("--workspace <slug>", "Workspace to list. Default: active workspace.")
    .option("--local", "Skip the provider call and print the stored records as-is", false)
    .action(async (opts) => {
      const workspace = resolveWorkspace(opts.workspace);
      const store = await loadPerformers(workspace);
      const stored = Object.values(store.avatars);

      if (opts.local) {
        out({ workspace, count: stored.length, avatars: stored.map(row), unlinked: [] });
        return;
      }

      let remote: HeygenAvatarLook[] = [];
      let warning: string | null = null;
      try {
        remote = await listAvatarLooks({ ownership: "private" });
      } catch (e) {
        warning = `provider refresh failed, showing stored records only: ${(e as Error).message}`;
      }

      const byLookId = new Map(remote.map((look) => [look.id, look]));
      const refreshed: StoredAvatar[] = [];
      for (const record of stored) {
        const look = byLookId.get(record.lookId);
        if (!look) {
          refreshed.push(record);
          continue;
        }
        // Consent lives on the GROUP, so it needs its own read.
        const group = look.group_id ? await getAvatarGroup(look.group_id).catch(() => null) : null;
        refreshed.push(
          (await patchAvatar(workspace, record.slug, {
            ...lookPatch(look),
            ...(group ? { consentStatus: group.consent_status ?? null } : {}),
          })) ?? record,
        );
      }

      const linked = new Set(stored.map((r) => r.lookId));
      out({
        workspace,
        count: refreshed.length,
        avatars: refreshed.map(row),
        // Provider-side looks with no local slug yet — adopt with `avatar link`.
        unlinked: remote
          .filter((look) => !linked.has(look.id))
          .map((look) => ({
            lookId: look.id,
            name: look.name ?? null,
            type: look.avatar_type ?? null,
            status: look.status ?? null,
            engines: look.supported_api_engines?.length ? look.supported_api_engines : null,
          })),
        ...(warning ? { warning } : {}),
      });
    });

  cmd
    .command("show <slug>")
    .description("One avatar in full, refreshed from the provider — including the last training error.")
    .option("--workspace <slug>", "Workspace that owns the avatar. Default: active workspace.")
    .option("--local", "Skip the provider call and print the stored record as-is", false)
    .action(async (slug: string, opts) => {
      const workspace = resolveWorkspace(opts.workspace);
      const record = await requireAvatar(workspace, slug);
      if (opts.local) {
        out({ workspace, ...record });
        return;
      }
      try {
        const look = await getAvatarLook(record.lookId);
        const group = look.group_id ? await getAvatarGroup(look.group_id).catch(() => null) : null;
        const merged =
          (await patchAvatar(workspace, slug, {
            ...lookPatch(look),
            ...(group ? { consentStatus: group.consent_status ?? null } : {}),
          })) ?? record;
        out({
          workspace,
          ...merged,
          consentRequired: merged.type === "digital_twin",
          previewImageUrl: look.preview_image_url ?? null,
          defaultVoiceId: look.default_voice_id ?? null,
        });
      } catch (e) {
        out({ workspace, ...record, warning: `provider refresh failed: ${(e as Error).message}` });
      }
    });

  cmd
    .command("consent <slug>")
    .description(
      "Register the consent video for an avatar's group, then re-read the group status. HeyGen rejects every generation against a non-consented digital twin.",
    )
    .requiredOption(
      "--video <ref>",
      'Consent clip (local path or URL). Must show the SAME person as the training footage saying: "I, [Full Name], hereby allow HeyGen to use the footage of me to build a HeyGen avatar."',
    )
    .option("--workspace <slug>", "Workspace that owns the avatar. Default: active workspace.")
    .action(async (slug: string, opts) => {
      const workspace = resolveWorkspace(opts.workspace);
      const record = await requireAvatar(workspace, slug);
      if (!record.groupId) {
        raiseError("E_INPUT_INVALID", {
          field: "consent",
          detail: `avatar "${slug}" has no group id stored — re-link it with \`ralphy avatar link ${record.lookId} --slug ${slug}\``,
          verb: "avatar consent",
        });
      }
      const source = /^https?:\/\//.test(opts.video) ? opts.video : path.resolve(opts.video);
      if (!/^https?:\/\//.test(source) && !existsSync(source)) {
        raiseError("E_FILE_UNREADABLE", { path: source, verb: "avatar consent" });
      }
      try {
        await registerAvatarConsent(record.groupId, source);
        const group = await getAvatarGroup(record.groupId);
        const merged = await patchAvatar(workspace, slug, {
          consentStatus: group.consent_status ?? null,
        });
        ok(`Consent submitted for ${slug}: ${group.consent_status ?? "unknown"}`);
        out({
          workspace,
          slug,
          groupId: record.groupId,
          consent: group.consent_status ?? null,
          engines: merged?.engines?.length ? merged.engines : null,
          consentVideo: source,
        });
      } catch (e) {
        err((e as Error).message);
      }
    });

  cmd
    .command("delete <slug>")
    .description(
      "Drop the LOCAL avatar record. The provider-side avatar is left untouched — delete it in the HeyGen dashboard if you also want it gone there.",
    )
    .option("--workspace <slug>", "Workspace that owns the avatar. Default: active workspace.")
    .action(async (slug: string, opts) => {
      const workspace = resolveWorkspace(opts.workspace);
      const record = await requireAvatar(workspace, slug);
      await removeAvatar(workspace, slug);
      ok(`Avatar record removed: ${slug}`);
      out({ deleted: slug, workspace, lookId: record.lookId, providerSideKept: true });
    });

  return cmd;
}
