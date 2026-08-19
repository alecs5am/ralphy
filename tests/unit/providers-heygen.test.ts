// HeyGen connector (#512 lipsync, #555 persistent avatars + voices) — the
// pieces that are checkable without a network call: the published rate card,
// the training-footage band, the engine/consent constraint table, the local
// performer store, the connector's place in the registry, and the verb surface.
//
// No test here touches the network. Anything that would is stubbed at the
// connector boundary or asserted through `--help` / `--dry-run`.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  avatarRoute,
  checkTwinFootage,
  heygenConnector,
  heygenPricePerSec,
  heygenRemainingBalance,
  isHeygenEngine,
  isHeygenRoute,
  resolveAvatarEngine,
  TWIN_FOOTAGE_BAND,
} from "../../cli/lib/providers/heygen.js";
import { estimatedCallCostUsd } from "../../cli/lib/spend.js";
import { estimateVideoCostUsd } from "../../cli/lib/or-catalog.js";
import { connectorsFor, resolveConnector } from "../../cli/lib/providers/registry.js";
import { setRoot, root as currentRoot } from "../../cli/lib/paths.js";
import { nextFreeSlug, putAvatar, getAvatar, putVoice, resolveVoiceRef } from "../../cli/lib/avatars.js";

const REPO = path.resolve(__dirname, "..", "..");

describe("heygenPricePerSec", () => {
  // Rates from developers.heygen.com/docs/pricing (API tier, per second of
  // OUTPUT video). A drift here silently mis-bills every cost rollup.
  test("prices each published route", () => {
    expect(heygenPricePerSec("avatar-iv-image")).toBe(0.05);
    expect(heygenPricePerSec("avatar-iv-photo")).toBe(0.05);
    expect(heygenPricePerSec("avatar-iv-twin")).toBe(0.0667);
    expect(heygenPricePerSec("avatar-v-twin")).toBe(0.0667);
    expect(heygenPricePerSec("avatar-iii-photo")).toBe(0.0433);
    expect(heygenPricePerSec("avatar-iii-twin")).toBe(0.0167);
    expect(heygenPricePerSec("lipsync-speed")).toBe(0.0333);
    expect(heygenPricePerSec("lipsync-precision")).toBe(0.0667);
    expect(heygenPricePerSec("translate-speed")).toBe(0.0333);
    expect(heygenPricePerSec("translate-precision")).toBe(0.0667);
    expect(heygenPricePerSec("tts-starfish")).toBe(0.000667);
  });

  test("an unknown route bills at the most expensive rate, never zero", () => {
    // Under-reporting is the dangerous direction — a 0 would make a paid run
    // look free in the cost rollup.
    expect(heygenPricePerSec("some-future-route")).toBe(0.0667);
    expect(heygenPricePerSec("")).toBeGreaterThan(0);
  });

  test("precision costs exactly double speed on the re-dub and translate routes", () => {
    expect(heygenPricePerSec("lipsync-precision")).toBeCloseTo(
      heygenPricePerSec("lipsync-speed") * 2,
      3,
    );
  });

  test("isHeygenRoute recognizes every priced route and nothing else", () => {
    for (const route of [
      "avatar-iv-image", "avatar-iv-photo", "avatar-iv-twin", "avatar-iv-studio",
      "avatar-v-twin", "avatar-iii-photo", "avatar-iii-twin", "avatar-iii-studio",
      "lipsync-speed", "lipsync-precision", "translate-speed", "translate-precision",
      "tts-starfish",
    ]) {
      expect(isHeygenRoute(route)).toBe(true);
    }
    // An OpenRouter / fal video model must NOT be captured, or it would get
    // priced off the HeyGen card.
    expect(isHeygenRoute("kwaivgi/kling-v3.0-pro")).toBe(false);
    expect(isHeygenRoute("bytedance/seedance-2.0")).toBe(false);
    expect(isHeygenRoute(undefined)).toBe(false);
    expect(isHeygenRoute("")).toBe(false);
  });

  test("the spend governor prices a HeyGen route off the SAME card as --dry-run", () => {
    // Regression: `estimateVideoCostUsd` falls back to $0.14/s for an id that
    // is not in the OpenRouter video catalog, so the governor billed
    // avatar-v-twin at $4.20/30s against the $2.00 the dry-run printed for the
    // same call — a 2-4x disagreement inside one command.
    for (const route of ["avatar-v-twin", "avatar-iv-image", "lipsync-speed", "avatar-iii-twin"]) {
      for (const seconds of [12, 30]) {
        expect(estimatedCallCostUsd({ kind: "video", model: route, durationSec: seconds })).toBeCloseTo(
          heygenPricePerSec(route) * seconds,
          6,
        );
      }
    }
    // A catalog-backed model keeps its catalog price.
    expect(
      estimatedCallCostUsd({ kind: "video", model: "kwaivgi/kling-v3.0-pro", durationSec: 5 }),
    ).toBe(estimateVideoCostUsd("kwaivgi/kling-v3.0-pro", 5));
  });
});

describe("checkTwinFootage — the training band pre-flight", () => {
  // Probed 2026-07-28: an 8.0s clip failed upstream with
  // `training_failed: "Footage is too short or too long"`; 15.0s trained clean.
  // The band is documented as 15-600s, and the whole point of checking locally
  // is that HeyGen bills the $1.00 creation call either way.
  test("rejects footage below the band and names the numbers", () => {
    const problem = checkTwinFootage(8);
    expect(problem).toBeTruthy();
    expect(problem).toContain("8.0s");
    expect(problem).toContain(`${TWIN_FOOTAGE_BAND.minSec}-${TWIN_FOOTAGE_BAND.maxSec}s`);
  });

  test("accepts footage inside the band", () => {
    expect(checkTwinFootage(15)).toBeNull();
    expect(checkTwinFootage(120)).toBeNull();
    expect(checkTwinFootage(600)).toBeNull();
  });

  test("rejects footage above the band", () => {
    expect(checkTwinFootage(601)).toBeTruthy();
  });

  test("an unreadable duration is a rejection, not a pass", () => {
    // A failed ffprobe must not sail through into a paid upload.
    expect(checkTwinFootage(0)).toBeTruthy();
    expect(checkTwinFootage(Number.NaN)).toBeTruthy();
  });
});

describe("resolveAvatarEngine — the engine/consent constraint table", () => {
  test("avatar_v is refused on a photo avatar, which cannot serve it", () => {
    const resolved = resolveAvatarEngine({
      requested: "avatar_v",
      avatarType: "photo",
      engines: ["avatar_iv", "avatar_iii"],
      consentStatus: null,
      status: "completed",
    });
    expect(resolved).toHaveProperty("error");
    expect("error" in resolved && resolved.error).toContain("avatar_iv");
    expect("error" in resolved && resolved.error).toContain("digital_twin");
  });

  test("a pending-consent digital twin blocks EVERY engine, not just avatar_v", () => {
    // HeyGen answers HTTP 400 avatar_consent_required for any generation
    // against a non-consented twin group; refusing locally saves the call.
    for (const engine of ["avatar_v", "avatar_iv", "avatar_iii", undefined]) {
      const resolved = resolveAvatarEngine({
        requested: engine,
        avatarType: "digital_twin",
        engines: ["avatar_v", "avatar_iv", "avatar_iii"],
        consentStatus: "pending",
        status: "completed",
      });
      expect(resolved).toHaveProperty("error");
      expect("error" in resolved && resolved.error).toContain("consent");
    }
  });

  test("a consented digital twin serves avatar_v", () => {
    expect(
      resolveAvatarEngine({
        requested: "avatar_v",
        avatarType: "digital_twin",
        engines: ["avatar_v", "avatar_iv", "avatar_iii"],
        consentStatus: "approved",
        status: "completed",
      }),
    ).toEqual({ engine: "avatar_v" });
  });

  test("no --engine picks the best the look advertises", () => {
    expect(
      resolveAvatarEngine({ engines: ["avatar_iv", "avatar_v", "avatar_iii"], status: "completed" }),
    ).toEqual({ engine: "avatar_v" });
    expect(
      resolveAvatarEngine({ engines: ["avatar_iii", "avatar_iv"], status: "completed" }),
    ).toEqual({ engine: "avatar_iv" });
    // A look with no advertised list yet falls back to the documented default.
    expect(resolveAvatarEngine({ status: "completed" })).toEqual({ engine: "avatar_iv" });
  });

  test("an untrained avatar is refused before the call", () => {
    const resolved = resolveAvatarEngine({ avatarType: "digital_twin", status: "processing" });
    expect("error" in resolved && resolved.error).toContain("processing");
  });

  test("an unknown engine name is refused with the allowed set", () => {
    const resolved = resolveAvatarEngine({ requested: "avatar_vi", status: "completed" });
    expect("error" in resolved && resolved.error).toContain("avatar_v");
    expect(isHeygenEngine("avatar_vi")).toBe(false);
    expect(isHeygenEngine("avatar_v")).toBe(true);
  });
});

describe("avatarRoute", () => {
  test("maps engine + avatar type onto the billed route", () => {
    expect(avatarRoute("avatar_v", "digital_twin")).toBe("avatar-v-twin");
    expect(avatarRoute("avatar_iv", "digital_twin")).toBe("avatar-iv-twin");
    expect(avatarRoute("avatar_iv", "photo")).toBe("avatar-iv-photo");
    expect(avatarRoute("avatar_iii", "photo")).toBe("avatar-iii-photo");
  });

  test("an unknown avatar type bills at the twin rate, the more expensive of the two", () => {
    expect(heygenPricePerSec(avatarRoute("avatar_iv", "prompt"))).toBe(
      heygenPricePerSec("avatar-iv-twin"),
    );
  });
});

describe("heygenRemainingBalance", () => {
  test("reads a prepaid wallet", () => {
    expect(
      heygenRemainingBalance({ wallet: { currency: "usd", remaining_balance: 12.5 } }),
    ).toEqual({ amount: 12.5, unit: "usd" });
  });

  test("sums subscription credit buckets", () => {
    expect(
      heygenRemainingBalance({
        subscription: {
          plan: "creator",
          credits: {
            premium_credits: { remaining: 30 },
            add_on_credits: { remaining: 12 },
          },
        },
      }),
    ).toEqual({ amount: 42, unit: "credits" });
  });

  test("an account with no balance fields reports null rather than a fake zero", () => {
    expect(heygenRemainingBalance({ username: "x" })).toEqual({ amount: null, unit: null });
  });
});

describe("performer store — slug addressing + append-only", () => {
  // The setRoot pattern: point the paths singleton at a temp tree, restore the
  // prior root afterwards so no other suite sees the fixture.
  const savedRoot = currentRoot();
  let tmpRoot = "";

  beforeAll(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ralphy-performers-"));
    await fs.mkdir(path.join(tmpRoot, ".ralphy", "workspaces", "acme"), { recursive: true });
    setRoot(tmpRoot);
  });
  afterAll(async () => {
    setRoot(savedRoot);
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  test("nextFreeSlug versions instead of overwriting", () => {
    expect(nextFreeSlug("marco", [])).toBe("marco");
    expect(nextFreeSlug("marco", ["marco"])).toBe("marco.v2");
    expect(nextFreeSlug("marco", ["marco", "marco.v2"])).toBe("marco.v3");
  });

  test("a re-create on an occupied slug versions and leaves the original intact", async () => {
    const first = await putAvatar("acme", {
      slug: "marco",
      provider: "heygen",
      name: "Marco",
      type: "digital_twin",
      lookId: "look-1",
      groupId: "group-1",
      engines: ["avatar_v"],
      consentStatus: "approved",
      status: "completed",
    });
    const second = await putAvatar("acme", {
      slug: "marco",
      provider: "heygen",
      name: "Marco retake",
      type: "digital_twin",
      lookId: "look-2",
    });
    expect(first.slug).toBe("marco");
    expect(second.slug).toBe("marco.v2");
    expect((await getAvatar("acme", "marco"))?.lookId).toBe("look-1");
    expect((await getAvatar("acme", "marco.v2"))?.lookId).toBe("look-2");
  });

  test("slug -> provider id lookup, with pass-through for a raw id", async () => {
    await putVoice("acme", {
      slug: "marco-voice",
      provider: "heygen",
      name: "Marco",
      voiceId: "171a67903ed94cfea1974aefb7bb183c",
    });
    expect(await resolveVoiceRef("acme", "marco-voice")).toEqual({
      voiceId: "171a67903ed94cfea1974aefb7bb183c",
      slug: "marco-voice",
    });
    // An unknown ref is assumed to already be a provider id.
    expect(await resolveVoiceRef("acme", "raw-provider-id")).toEqual({ voiceId: "raw-provider-id" });
  });
});

describe("registry wiring", () => {
  const HAD_KEY = process.env.HEYGEN_API_KEY;

  beforeAll(() => {
    process.env.HEYGEN_API_KEY = "test-key";
  });
  afterAll(() => {
    // Restore-or-delete — never blind-delete (a real runner env may carry it).
    if (HAD_KEY === undefined) delete process.env.HEYGEN_API_KEY;
    else process.env.HEYGEN_API_KEY = HAD_KEY;
  });

  test("advertises lipsync plus voice, and nothing else", () => {
    expect(heygenConnector.capabilities).toEqual(["lipsync", "voice"]);
    expect(heygenConnector.generateLipsync).toBeDefined();
    expect(heygenConnector.generateVoiceover).toBeDefined();
  });

  test("is the connector resolved for the lipsync capability", () => {
    expect(connectorsFor("lipsync").map((c) => c.id)).toContain("heygen");
    expect(resolveConnector("lipsync").id).toBe("heygen");
  });

  test("does not pre-empt the video capability", () => {
    // heygen sits last in BUNDLED and claims no video cell, so the default
    // video provider must stay unchanged.
    expect(connectorsFor("video").map((c) => c.id)).not.toContain("heygen");
  });

  test("does not pre-empt elevenlabs as the default voice provider", () => {
    const originalEleven = process.env.ELEVENLABS_API_KEY;
    process.env.ELEVENLABS_API_KEY = "eleven-key";
    try {
      expect(resolveConnector("voice").id).toBe("elevenlabs");
      expect(resolveConnector("voice", "heygen").id).toBe("heygen");
    } finally {
      if (originalEleven === undefined) delete process.env.ELEVENLABS_API_KEY;
      else process.env.ELEVENLABS_API_KEY = originalEleven;
    }
  });
});

/** Run a CLI verb in-repo and return {status, stdout}. */
function cli(args: string[]) {
  return spawnSync("bun", ["run", "cli/index.ts", ...args], {
    cwd: REPO,
    encoding: "utf8",
    env: process.env,
  });
}

describe("verb surface", () => {
  test("generate lipsync --help documents all three input modes", () => {
    const r = cli(["generate", "lipsync", "--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("--image");
    expect(r.stdout).toContain("--avatar");
    expect(r.stdout).toContain("--video");
    expect(r.stdout).toContain("--engine");
    expect(r.stdout).toContain("--audio");
    expect(r.stdout).toContain("--dry-run");
  });

  test("avatar group exposes create / link / list / show / consent / delete", () => {
    const r = cli(["avatar", "--help"]);
    expect(r.status).toBe(0);
    for (const verb of ["create", "link", "list", "show", "consent", "delete"]) {
      expect(r.stdout).toContain(verb);
    }
  });

  test("avatar create --help names the training band and the consent rule", () => {
    const r = cli(["avatar", "create", "--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("digital_twin");
    expect(r.stdout).toContain("15-600s");
    expect(r.stdout).toContain("consent");
  });

  test("voice clone --help offers the heygen provider", () => {
    const r = cli(["voice", "clone", "--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("--provider");
    expect(r.stdout).toContain("heygen");
  });

  test("video translate --help documents the language list and the mode rates", () => {
    const r = cli(["video", "translate", "--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("--languages");
    expect(r.stdout).toContain("precision");
  });

  test("provider balance --help is scoped to heygen", () => {
    const r = cli(["provider", "balance", "--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("heygen");
  });

  test("generate lipsync refuses two input modes at once, before any paid call", () => {
    // Run against a throwaway data root so the check under test is the input-mode
    // guard, not project resolution.
    const tmp = require("node:fs").mkdtempSync(path.join(os.tmpdir(), "ralphy-lipsync-guard-"));
    require("node:fs").mkdirSync(path.join(tmp, ".ralphy", "workspaces", "default"), {
      recursive: true,
    });
    try {
      const r = spawnSync(
        "bun",
        [
          "run", path.join(REPO, "cli/index.ts"), "generate", "lipsync",
          "--workspace", "default",
          "--slot", "probe",
          "--image", "a.png",
          "--avatar", "marco",
          "--audio", "b.mp3",
        ],
        { cwd: tmp, encoding: "utf8", env: process.env },
      );
      expect(r.status).not.toBe(0);
      expect(`${r.stdout}${r.stderr}`).toContain("exactly one of");
    } finally {
      require("node:fs").rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("--dry-run prices a local audio track without submitting", () => {
    // Any real media file with a readable container duration works; the repo's
    // own perio screencast audio is the closest one that always exists.
    const audio = path.join(
      REPO,
      ".ralphy/workspaces/denti-ai/shared/refs/perio-screencast/source.mp3",
    );
    if (!require("node:fs").existsSync(audio)) return; // local-only fixture

    const r = cli([
      "generate", "lipsync",
      "--project", "denti-perio-pitch-001",
      "--slot", "dry-run-probe",
      "--image", "artifacts/images/avatar-master-01.png",
      "--audio", audio,
      "--dry-run",
    ]);
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.dryRun).toBe(true);
    expect(json.inputMode).toBe("image");
    expect(json.audioDurationSec).toBeGreaterThan(0);
    // 67.4s of audio at the Avatar IV image rate.
    expect(json.estimatedCostUsd).toBeCloseTo(json.audioDurationSec * 0.05, 2);
  });
});
