// HeyGen connector — talking-head lipsync + persistent performers (#512, #554, #555).
//
// THIS IS THE ONLY SOURCE FILE PERMITTED TO READ `HEYGEN_API_KEY` OR HIT
// `heygen.com` HOSTS (AGENTS.md invariant #1). The agents-md invariants test
// allowlists exactly this path; every other source file is still forbidden.
// Commands reach the API through the functions exported here — the same shape
// `voice.ts` uses against `elevenlabs.ts`.
//
// Two generations of route live here:
//
//   • STATELESS (#554) — `POST /v3/videos` with `type: "image"`. Animates an
//     arbitrary still, no pre-registered avatar, so the anchor can be a frame
//     lifted straight out of a Kling hook clip. Pinned to Avatar IV.
//   • PERSISTENT (#555) — create an avatar once (`POST /v3/avatars`), HeyGen
//     trains it, then every generation references the trained LOOK id via
//     `type: "avatar"`. This is what makes a series of ads read as the same
//     person, and Avatar V is reachable ONLY this way.
//
// Plus the two edit routes that take a finished video rather than a still:
// `POST /v3/lipsyncs` (re-dub an existing cut) and `POST /v3/video-translations`
// (dub into another language). Both poll the same field names as /v3/videos,
// so one poller serves all three.
//
// Verified against developers.heygen.com 2026-07-28 (v3 is the active platform;
// the v2 /v2/video/generate shape is superseded). The engine/consent constraint
// table below was probed live — several doc pages are stale.

import path from "node:path";
import fs from "node:fs/promises";
import { logGeneration } from "../gen-log.js";
import { generationDestination } from "../generation-destination.js";
import { probeDurationSec } from "../ffmpeg-recipes.js";
import {
  assetPath,
  protectExistingAsset,
  logFailure,
  requireProviderKey,
  retryTransient,
  TerminalProviderError,
  TransientPayloadError,
} from "./shared.js";
import type {
  RalphyConnector,
  GenerateLipsyncInput,
  GenerateVoiceoverInput,
  GenerateResult,
} from "./types.js";

const ID = "heygen";
const LABEL = "HeyGen";
const ENV_VAR = "HEYGEN_API_KEY";
const SIGNUP_URL = "https://app.heygen.com/settings/api";

const API_BASE = "https://api.heygen.com";
/** Default stateless route label recorded in the gen-log. */
const ROUTE = "avatar-iv-image";

function requireKey(): void {
  requireProviderKey({ envVar: ENV_VAR, label: LABEL, signupUrl: SIGNUP_URL });
}

function authHeader(): { "x-api-key": string } {
  return { "x-api-key": process.env.HEYGEN_API_KEY! };
}

// ─── Pricing ────────────────────────────────────────────────────────────────

/**
 * Per-second USD for the video routes, from the published API-tier rate card
 * (developers.heygen.com/docs/pricing, read 2026-07-28). Billing is per second
 * of OUTPUT video against a prepaid USD wallet — not credits.
 *
 * Pure + exported so the unit test pins each branch without a network call.
 */
export function heygenPricePerSec(route: string): number {
  switch (route) {
    // Avatar IV against an arbitrary image or photo avatar.
    case "avatar-iv-image":
    case "avatar-iv-photo":
      return 0.05;
    // Avatar IV / Avatar V driving a trained digital twin or studio avatar.
    case "avatar-iv-twin":
    case "avatar-iv-studio":
    case "avatar-v-twin":
      return 0.0667;
    // Avatar III photo avatar (legacy, cheaper).
    case "avatar-iii-photo":
      return 0.0433;
    // Avatar III against a twin / studio avatar — the cheapest video route.
    case "avatar-iii-twin":
    case "avatar-iii-studio":
      return 0.0167;
    // Re-dub an existing cut, and language translation. Both bill by mode.
    case "lipsync-speed":
    case "translate-speed":
      return 0.0333;
    case "lipsync-precision":
    case "translate-precision":
      return 0.0667;
    // Text-to-speech (Starfish engine) — audio seconds, not video.
    case "tts-starfish":
      return 0.000667;
    default:
      // Unknown route — bill at the most expensive published rate so a cost
      // rollup never under-reports.
      return 0.0667;
  }
}

/**
 * Every route `heygenPricePerSec` prices explicitly. Exported so the spend
 * governor can recognize a HeyGen route and price it through the rate card
 * above instead of the OpenRouter video table's generic fallback — otherwise
 * `--dry-run` and the spend gate disagree by 2-4x on the same call.
 * Mirrors the `isFalVideoModel` / `falVideoPricePerSec` pair.
 */
const HEYGEN_ROUTES = new Set([
  "avatar-iv-image",
  "avatar-iv-photo",
  "avatar-iv-twin",
  "avatar-iv-studio",
  "avatar-v-twin",
  "avatar-iii-photo",
  "avatar-iii-twin",
  "avatar-iii-studio",
  "lipsync-speed",
  "lipsync-precision",
  "translate-speed",
  "translate-precision",
  "tts-starfish",
]);

export function isHeygenRoute(model: string | undefined): boolean {
  return Boolean(model) && HEYGEN_ROUTES.has(model!);
}

/**
 * Flat per-call charge for creating a `digital_twin` or `photo` avatar
 * ($1.00 / call on the API tier). A `prompt` avatar is not on the published
 * card; it bills as a creation call until observed otherwise.
 */
export const HEYGEN_AVATAR_CREATE_USD = 1.0;

/**
 * Training-footage duration band for a `digital_twin`, from the create-avatar
 * reference ("Footage duration must be between 15s and 600s") and confirmed by
 * probe: an 8.0s clip failed with `training_failed: "Footage is too short or
 * too long"`; a 15.0s clip trained clean.
 */
export const TWIN_FOOTAGE_BAND = { minSec: 15, maxSec: 600 } as const;

/**
 * Pre-flight the twin training band locally, BEFORE spending the upload.
 * Returns a remediation message, or null when the footage is in band.
 * Pure + exported for the unit test.
 */
export function checkTwinFootage(durationSec: number): string | null {
  const { minSec, maxSec } = TWIN_FOOTAGE_BAND;
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return `could not read the footage duration — HeyGen digital-twin training needs ${minSec}-${maxSec}s of video`;
  }
  if (durationSec < minSec || durationSec > maxSec) {
    return `training footage is ${durationSec.toFixed(1)}s; HeyGen digital-twin training accepts ${minSec}-${maxSec}s (an 8s clip fails with "Footage is too short or too long"). Re-cut the source and retry.`;
  }
  return null;
}

export type HeygenEngine = "avatar_v" | "avatar_iv" | "avatar_iii";
const ENGINES: HeygenEngine[] = ["avatar_v", "avatar_iv", "avatar_iii"];

export function isHeygenEngine(value: string): value is HeygenEngine {
  return (ENGINES as string[]).includes(value);
}

/**
 * The engine/consent constraint table, resolved locally so a doomed call is
 * never paid for. Probed 2026-07-28:
 *
 *   | avatar type   | consent required | engines exposed                       |
 *   | digital_twin  | YES              | avatar_v, avatar_iv, avatar_iii       |
 *   | photo         | no (null)        | avatar_iv, avatar_iii                 |
 *   | stock look    | n/a              | avatar_v, avatar_iv, avatar_iii       |
 *
 * So Avatar V on an own avatar implies `digital_twin`, which implies consent.
 * Generation against a non-consented twin fails upstream with HTTP 400
 * `avatar_consent_required`. The consent video must show the same person as the
 * training footage; only a real person can record it — this function surfaces
 * the requirement, it never routes around it.
 *
 * Pure + exported for the unit test.
 */
export function resolveAvatarEngine(input: {
  requested?: string;
  avatarType?: string;
  engines?: string[];
  consentStatus?: string | null;
  status?: string;
}): { engine: HeygenEngine } | { error: string } {
  const { requested, avatarType, engines, consentStatus, status } = input;

  if (status && status !== "completed") {
    return {
      error: `avatar training is "${status}", not "completed" — generation would fail. Poll it with \`ralphy avatar show <slug>\` until it completes.`,
    };
  }
  let want: HeygenEngine | undefined;
  if (requested) {
    if (!isHeygenEngine(requested)) {
      return { error: `unknown engine "${requested}" — expected one of ${ENGINES.join(" | ")}` };
    }
    want = requested;
  }
  // A trained look advertises what it can serve; honour that list verbatim.
  if (want && engines?.length && !engines.includes(want)) {
    return {
      error: `this ${avatarType ?? "avatar"} advertises ${engines.join(", ")} — "${requested}" is not available on it. Avatar V requires a digital_twin avatar (a photo avatar exposes avatar_iv / avatar_iii only); re-create it with \`ralphy avatar create --type digital_twin --from <15-600s clip>\`.`,
    };
  }
  // Consent gates ALL generation against a twin group, not just Avatar V.
  if (avatarType === "digital_twin" && (consentStatus === "pending" || consentStatus === "rejected")) {
    return {
      error: `avatar group consent is "${consentStatus}" — HeyGen rejects every generation against a non-consented digital twin (HTTP 400 avatar_consent_required). Register it with \`ralphy avatar consent <slug> --video <clip>\`: the clip must show the same person as the training footage saying "I, [Full Name], hereby allow HeyGen to use the footage of me to build a HeyGen avatar."`,
    };
  }
  if (want) return { engine: want };
  // Default to the best engine the look actually advertises.
  for (const candidate of ENGINES) {
    if (engines?.includes(candidate)) return { engine: candidate };
  }
  return { engine: "avatar_iv" };
}

/** Gen-log route id for an engine + avatar-type pair. */
export function avatarRoute(engine: HeygenEngine, avatarType?: string): string {
  const family = engine === "avatar_v" ? "avatar-v" : engine === "avatar_iii" ? "avatar-iii" : "avatar-iv";
  // A `prompt` avatar is a generated look; bill it at the twin rate (the more
  // expensive of the two) until the rate card names it separately.
  const kind = avatarType === "photo" ? "photo" : "twin";
  return `${family}-${kind}`;
}

// ─── HTTP plumbing ──────────────────────────────────────────────────────────

type ApiError = { error?: { code?: string; message?: string; param?: string | null } };

/**
 * One JSON call against the v3 API. Returns the unwrapped `data` payload.
 * 4xx becomes a `TerminalProviderError` (no point retrying a semantic reject),
 * 5xx stays retry-eligible. `avatar_consent_required` gets the remediation
 * appended, because that is the single error a user is most likely to hit.
 */
async function api<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  endpoint: string,
  opts: { body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  requireKey();
  const resp = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: opts.body
      ? { ...authHeader(), "Content-Type": "application/json" }
      : authHeader(),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  const text = await resp.text().catch(() => "");
  if (!resp.ok) {
    let detail = text.slice(0, 400);
    let code = "";
    try {
      const parsed = JSON.parse(text) as ApiError;
      code = parsed.error?.code ?? "";
      if (parsed.error?.message) detail = `${code ? `${code}: ` : ""}${parsed.error.message}`;
    } catch {
      /* non-JSON body — keep the raw slice */
    }
    if (code === "avatar_consent_required") {
      detail += ` — register a consent video with \`ralphy avatar consent <slug> --video <clip>\`. It must show the same person as the training footage saying "I, [Full Name], hereby allow HeyGen to use the footage of me to build a HeyGen avatar."`;
    }
    const message = `heygen ${method} ${endpoint} ${resp.status}: ${detail}`;
    if (resp.status >= 400 && resp.status < 500) throw new TerminalProviderError(message);
    throw new Error(message);
  }
  let json: { data?: T };
  try {
    json = JSON.parse(text) as { data?: T };
  } catch {
    throw new TransientPayloadError(
      `heygen ${method} ${endpoint} returned non-JSON. Raw: ${text.slice(0, 300)}`,
    );
  }
  if (json.data === undefined || json.data === null) {
    throw new TransientPayloadError(
      `heygen ${method} ${endpoint} returned no data payload. Raw: ${text.slice(0, 300)}`,
    );
  }
  return json.data;
}

function isRemote(ref: string): boolean {
  return /^https?:\/\//.test(ref);
}

function mimeFor(filePath: string): string {
  switch (path.extname(filePath).replace(/^\./, "").toLowerCase()) {
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "webp": return "image/webp";
    case "mp3": return "audio/mpeg";
    case "wav": return "audio/wav";
    case "m4a": return "audio/mp4";
    case "mp4": return "video/mp4";
    case "mov": return "video/quicktime";
    case "webm": return "video/webm";
    default: return "application/octet-stream";
  }
}

/**
 * Upload one local file to /v3/assets and return its `asset_id`. 32 MB cap
 * upstream; a portrait PNG, a UGC-length voiceover and a 15s training clip are
 * all well under it.
 */
export async function uploadAsset(filePath: string): Promise<string> {
  requireKey();
  const buf = await fs.readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: mimeFor(filePath) }), path.basename(filePath));

  const resp = await fetch(`${API_BASE}/v3/assets`, {
    method: "POST",
    headers: authHeader(),
    body: form,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const message = `heygen asset upload ${resp.status}: ${text.slice(0, 300)}`;
    if (resp.status >= 400 && resp.status < 500) throw new TerminalProviderError(message);
    throw new Error(message);
  }
  const json = (await resp.json()) as { data?: { asset_id?: string } };
  const assetId = json.data?.asset_id;
  if (!assetId) {
    throw new TransientPayloadError(
      `heygen asset upload returned no asset_id. Raw: ${JSON.stringify(json).slice(0, 300)}`,
    );
  }
  return assetId;
}

type AssetRef = { type: "url"; url: string } | { type: "asset_id"; asset_id: string };

/** Remote refs pass through as `url`; local paths upload first. */
async function toAssetRef(ref: string): Promise<AssetRef> {
  return isRemote(ref)
    ? { type: "url", url: ref }
    : { type: "asset_id", asset_id: await uploadAsset(ref) };
}

// ─── Avatars ────────────────────────────────────────────────────────────────

export type HeygenAvatarLook = {
  id: string;
  name?: string;
  avatar_type?: string;
  group_id?: string;
  status?: string;
  supported_api_engines?: string[];
  default_voice_id?: string | null;
  preview_image_url?: string | null;
  error?: { code?: string; message?: string } | string | null;
};

export type HeygenAvatarGroup = {
  id: string;
  name?: string;
  consent_status?: string | null;
  status?: string;
  looks_count?: number;
  error?: { code?: string; message?: string } | string | null;
};

/** Flatten the two error shapes the avatar endpoints return into one string. */
export function avatarErrorText(error: HeygenAvatarLook["error"]): string | null {
  if (!error) return null;
  if (typeof error === "string") return error;
  return [error.code, error.message].filter(Boolean).join(": ") || null;
}

/**
 * Create an avatar. `digital_twin` trains from 15-600s of footage and unlocks
 * Avatar V (consent required); `photo` derives a look from a still and exposes
 * Avatar IV / III with no consent step; `prompt` generates a synthetic look
 * from a text description (plus up to 3 reference images).
 *
 * The LOOK id (`avatar_item.id`) is what a generation call wants as
 * `avatar_id` — NOT the group id.
 */
export async function createAvatar(input: {
  type: "digital_twin" | "photo" | "prompt";
  name: string;
  /** Local path or URL of the training footage / still. Required except for `prompt`. */
  source?: string;
  /** Text description, `prompt` type only. */
  prompt?: string;
  /** Reference images for a `prompt` avatar (≤3). */
  referenceImages?: string[];
  /** Attach the new look to an existing group instead of creating one. */
  groupId?: string;
  signal?: AbortSignal;
}): Promise<{ look: HeygenAvatarLook | null; group: HeygenAvatarGroup | null }> {
  const body: Record<string, unknown> = { type: input.type, name: input.name };
  if (input.groupId) body.avatar_group_id = input.groupId;
  if (input.type === "prompt") {
    body.prompt = input.prompt;
    if (input.referenceImages?.length) {
      body.reference_images = await Promise.all(input.referenceImages.map(toAssetRef));
    }
  } else {
    body.file = await toAssetRef(input.source!);
  }
  const data = await api<{ avatar_item?: HeygenAvatarLook; avatar_group?: HeygenAvatarGroup }>(
    "POST",
    "/v3/avatars",
    { body, signal: input.signal },
  );
  return { look: data.avatar_item ?? null, group: data.avatar_group ?? null };
}

export async function getAvatarLook(lookId: string): Promise<HeygenAvatarLook> {
  return api<HeygenAvatarLook>("GET", `/v3/avatars/looks/${encodeURIComponent(lookId)}`);
}

export async function listAvatarLooks(opts: { ownership?: string; avatarType?: string } = {}) {
  const params = new URLSearchParams({ ownership: opts.ownership ?? "private" });
  if (opts.avatarType) params.set("avatar_type", opts.avatarType);
  const data = await api<{ looks?: HeygenAvatarLook[] } | HeygenAvatarLook[]>(
    "GET",
    `/v3/avatars/looks?${params}`,
  );
  return Array.isArray(data) ? data : (data.looks ?? []);
}

export async function getAvatarGroup(groupId: string): Promise<HeygenAvatarGroup> {
  return api<HeygenAvatarGroup>("GET", `/v3/avatars/${encodeURIComponent(groupId)}`);
}

/**
 * Register the consent video for an avatar group. The clip must show the same
 * person as the training footage reading HeyGen's consent sentence — a
 * synthetic performer cannot satisfy it.
 */
export async function registerAvatarConsent(
  groupId: string,
  source: string,
): Promise<HeygenAvatarGroup> {
  return api<HeygenAvatarGroup>(
    "POST",
    `/v3/avatars/${encodeURIComponent(groupId)}/consent`,
    { body: { consent_video: await toAssetRef(source) } },
  );
}

/** Poll a look until training leaves `processing`. */
export async function waitForAvatar(
  lookId: string,
  opts: { pollIntervalMs?: number; pollMaxAttempts?: number } = {},
): Promise<HeygenAvatarLook> {
  const intervalMs = opts.pollIntervalMs ?? 10_000;
  const maxAttempts = opts.pollMaxAttempts ?? 60;
  let look = await getAvatarLook(lookId);
  for (let attempt = 1; attempt <= maxAttempts && look.status === "processing"; attempt += 1) {
    await new Promise((r) => setTimeout(r, intervalMs));
    look = await getAvatarLook(lookId);
  }
  return look;
}

// ─── Voices ─────────────────────────────────────────────────────────────────

export type HeygenVoice = {
  voice_id: string;
  name?: string;
  status?: string;
  language?: string | null;
  /** Only a starfish-capable voice can serve /v3/voices/speech. */
  supported_engines?: string[];
};

/**
 * Clone a voice from an audio sample. Account cap is 10 clones; the endpoint
 * answers `resource_limit_reached` past that. Returns the clone id, which is
 * `pending` until `GET /v3/voices/<id>` reports `complete`.
 */
export async function cloneVoice(input: {
  source: string;
  name: string;
  language?: string;
  removeBackgroundNoise?: boolean;
}): Promise<string> {
  const data = await api<{ voice_clone_id?: string }>("POST", "/v3/voices/clone", {
    body: {
      audio: await toAssetRef(input.source),
      voice_name: input.name,
      ...(input.language ? { language: input.language } : {}),
      remove_background_noise: input.removeBackgroundNoise !== false,
    },
  });
  if (!data.voice_clone_id) {
    throw new TransientPayloadError("heygen voice clone returned no voice_clone_id");
  }
  return data.voice_clone_id;
}

export async function getHeygenVoice(voiceId: string): Promise<HeygenVoice> {
  return api<HeygenVoice>("GET", `/v3/voices/${encodeURIComponent(voiceId)}`);
}

export async function listHeygenVoices(ownership = "private"): Promise<HeygenVoice[]> {
  // The id field is `voice_id`, NOT `id` — a `.data[].id` path silently nulls.
  const data = await api<{ voices?: HeygenVoice[] } | HeygenVoice[]>(
    "GET",
    `/v3/voices?ownership=${encodeURIComponent(ownership)}`,
  );
  return Array.isArray(data) ? data : (data.voices ?? []);
}

/** Poll a voice clone until it leaves `pending`. */
export async function waitForVoice(
  voiceId: string,
  opts: { pollIntervalMs?: number; pollMaxAttempts?: number } = {},
): Promise<HeygenVoice> {
  const intervalMs = opts.pollIntervalMs ?? 5_000;
  const maxAttempts = opts.pollMaxAttempts ?? 60;
  let voice = await getHeygenVoice(voiceId);
  for (let attempt = 1; attempt <= maxAttempts && voice.status === "pending"; attempt += 1) {
    await new Promise((r) => setTimeout(r, intervalMs));
    voice = await getHeygenVoice(voiceId);
  }
  return voice;
}

// ─── Account ────────────────────────────────────────────────────────────────

export type HeygenAccount = {
  username?: string;
  email?: string | null;
  billing_type?: string | null;
  wallet?: { currency?: string; remaining_balance?: number | null } | null;
  subscription?: {
    plan?: string;
    credits?: {
      premium_credits?: { remaining?: number | null } | null;
      add_on_credits?: { remaining?: number | null } | null;
    } | null;
  } | null;
  usage_based?: {
    spending_current_usd?: number | null;
    spending_cap_usd?: number | null;
    remaining_credits?: number | null;
  } | null;
};

/** Account + balance pre-flight. Free — run it before a paid batch. */
export async function getHeygenAccount(): Promise<HeygenAccount> {
  return api<HeygenAccount>("GET", "/v3/users/me");
}

/**
 * The one balance number worth printing, whichever billing mode the account
 * is on. Pure + exported so the unit test pins each shape.
 */
export function heygenRemainingBalance(account: HeygenAccount): {
  amount: number | null;
  unit: string | null;
} {
  if (account.wallet?.remaining_balance != null) {
    return { amount: account.wallet.remaining_balance, unit: account.wallet.currency ?? "usd" };
  }
  if (account.usage_based?.remaining_credits != null) {
    return { amount: account.usage_based.remaining_credits, unit: "credits" };
  }
  const premium = account.subscription?.credits?.premium_credits?.remaining;
  const addOn = account.subscription?.credits?.add_on_credits?.remaining;
  if (premium != null || addOn != null) {
    return { amount: (premium ?? 0) + (addOn ?? 0), unit: "credits" };
  }
  return { amount: null, unit: null };
}

// ─── Shared job poller ──────────────────────────────────────────────────────

type JobStatus = {
  status?: string;
  video_url?: string | null;
  audio_url?: string | null;
  duration?: number | null;
  failure_message?: string | null;
  failure_code?: string | null;
  srt_caption_url?: string | null;
  caption_url?: string | null;
};

/**
 * Poll one job to a terminal state. /v3/videos, /v3/lipsyncs and
 * /v3/video-translations all report `status` + `video_url` + `duration` +
 * `failure_message`, so one poller serves all three; only the terminal words
 * differ (`waiting|pending|processing|running` en route, `completed|failed`
 * at the end).
 */
async function pollJob(
  endpoint: string,
  opts: { pollIntervalMs: number; pollMaxAttempts: number; signal?: AbortSignal },
): Promise<JobStatus> {
  let status: JobStatus = { status: "pending" };
  for (let attempt = 1; attempt <= opts.pollMaxAttempts; attempt += 1) {
    if (status.status === "completed" || status.status === "failed") break;
    await new Promise((r) => setTimeout(r, opts.pollIntervalMs));
    status = await api<JobStatus>("GET", endpoint, { signal: opts.signal });
  }
  return status;
}

async function downloadInto(url: string, dest: string, overwrite?: boolean, signal?: AbortSignal) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const dl = await fetch(url, { signal });
  if (!dl.ok) {
    const text = await dl.text().catch(() => "");
    throw new Error(`heygen download ${dl.status}: ${text.slice(0, 200)}`);
  }
  await protectExistingAsset(dest, overwrite);
  await fs.writeFile(dest, Buffer.from(await dl.arrayBuffer()));
  return dest;
}

// ─── Lipsync generation ─────────────────────────────────────────────────────

/**
 * Three mutually exclusive input modes, all landing an mp4 in the video slot:
 *
 *   • `image`  — stateless Avatar IV against an arbitrary still (#554).
 *   • `avatarId` — a trained persistent look, `engine` selectable (#555).
 *   • `video`  — re-dub a finished cut through /v3/lipsyncs.
 *
 * Speech comes from either a finished `audio` track or a `script` + `voiceId`
 * read by a HeyGen voice (a clone of the performer's own voice, so the read
 * matches the face without a second TTS provider). The dub mode needs `audio`.
 */
export async function generateLipsync(input: GenerateLipsyncInput): Promise<GenerateResult> {
  requireKey();
  const t0 = Date.now();
  const mode = input.video ? "dub" : input.avatarId ? "avatar" : "image";
  const dubMode = input.mode === "precision" ? "precision" : "speed";
  const route =
    input.model ??
    (mode === "dub"
      ? `lipsync-${dubMode}`
      : mode === "avatar"
        ? avatarRoute(input.engine ?? "avatar_iv", input.avatarType)
        : ROUTE);
  const aspectRatio = input.aspectRatio ?? "9:16";
  const resolution = input.resolution ?? "1080p";
  const pollIntervalMs = input.pollIntervalMs ?? 10_000;
  const pollMaxAttempts = input.pollMaxAttempts ?? 60;

  let endpoint: string;
  let body: Record<string, unknown>;

  if (mode === "dub") {
    // Replace the audio on an existing video and re-animate the lips.
    endpoint = "/v3/lipsyncs";
    body = {
      video: await toAssetRef(input.video!),
      audio: await toAssetRef(input.audio!),
      mode: dubMode,
      title: input.slot,
    };
  } else {
    endpoint = "/v3/videos";
    const speech: Record<string, unknown> = input.script
      ? { script: input.script, voice_id: input.voiceId }
      : isRemote(input.audio!)
        ? { audio_url: input.audio }
        : { audio_asset_id: await uploadAsset(input.audio!) };
    const subject =
      mode === "avatar"
        ? {
            type: "avatar",
            avatar_id: input.avatarId,
            engine: { type: input.engine ?? "avatar_iv" },
          }
        : { type: "image", image: await toAssetRef(input.image!) };
    body = {
      ...subject,
      ...speech,
      ...(input.prompt && mode === "avatar" ? { motion_prompt: input.prompt } : {}),
      aspect_ratio: aspectRatio,
      resolution,
      output_format: "mp4",
      title: input.slot,
    };
  }

  // ── Submit (retry transient) ────────────────────────────────────────────────
  const submitted = await retryTransient<{ jobId: string; attempt: number }>(
    async (attempt) => {
      const data = await api<{ video_id?: string; lipsync_id?: string }>("POST", endpoint, {
        body,
        signal: input.signal,
      });
      const jobId = data.video_id ?? data.lipsync_id;
      if (!jobId) {
        throw new TransientPayloadError(
          `heygen ${endpoint} returned no job id. Raw: ${JSON.stringify(data).slice(0, 400)}`,
        );
      }
      return { jobId, attempt };
    },
    {
      noRetry: input.noRetry,
      onTransientFailure: async (err, attempt) => {
        await logFailure(input, ID, route, "video", body, err, t0, attempt);
      },
    },
  );
  const { jobId, attempt: submitAttempt } = submitted;

  // ── Poll until completed / failed / budget exhausted ────────────────────────
  const statusEndpoint = `${endpoint}/${jobId}`;
  const status = await pollJob(statusEndpoint, {
    pollIntervalMs,
    pollMaxAttempts,
    signal: input.signal,
  });
  if (status.status === "failed") {
    const detail = status.failure_message ?? status.failure_code ?? "no failure detail";
    const err = new Error(`heygen ${mode} failed: ${detail}`);
    await logFailure(input, ID, route, "video", body, err, t0);
    throw err;
  }
  if (status.status !== "completed") {
    const err = new Error(
      `heygen ${mode} did not complete after ${pollMaxAttempts} polls (${pollIntervalMs}ms each); last status: ${status.status}`,
    );
    await logFailure(input, ID, route, "video", body, err, t0);
    throw err;
  }
  if (!status.video_url) {
    const err = new Error(
      `heygen ${mode} completed with no video_url. Raw: ${JSON.stringify(status).slice(0, 300)}`,
    );
    await logFailure(input, ID, route, "video", body, err, t0);
    throw err;
  }

  // ── Download the presigned mp4 into the slot (auto-versioned) ──────────────
  const dest = assetPath(input, "videos", `${input.slot}.mp4`);
  let localPath: string;
  try {
    localPath = await downloadInto(status.video_url, dest, input.overwrite, input.signal);
  } catch (err) {
    await logFailure(input, ID, route, "video", body, err, t0);
    throw err;
  }

  // Output length drives the bill. HeyGen reports it on the status payload;
  // ffprobe the file we just wrote when it doesn't.
  const durationSec = status.duration ?? probeDurationSec(localPath);
  const result: GenerateResult = {
    url: status.video_url,
    localPath,
    costUsd: Number((heygenPricePerSec(route) * durationSec).toFixed(4)),
    latencyMs: Date.now() - t0,
    model: route,
  };
  await logGeneration(generationDestination(input), {
    slot: input.slot,
    provider: ID,
    model: route,
    endpoint,
    kind: "video",
    input: {
      slot: input.slot,
      project: input.projectId,
      route,
      mode,
      avatar_id: input.avatarId ?? null,
      engine: input.engine ?? null,
      image: input.image ? "[ref-supplied]" : null,
      video: input.video ? "[ref-supplied]" : null,
      audio: input.audio ? "[ref-supplied]" : null,
      aspect_ratio: aspectRatio,
      resolution,
    },
    output: { url: status.video_url, local: localPath, job_id: jobId },
    status: "ok",
    latency_ms: result.latencyMs,
    cost_usd: result.costUsd,
    attempt: submitAttempt,
    request_id: jobId,
    note: input.note ?? input.slot,
  });
  return result;
}

// ─── Voiceover (text-to-speech) ─────────────────────────────────────────────

/**
 * Standalone TTS through /v3/voices/speech (Starfish engine). Lets a HeyGen
 * voice clone read a line for the editor without going through an avatar
 * render — the same voice identity as the talking head, at audio rates.
 * ElevenLabs stays the default `voice` connector (heygen sits last in BUNDLED).
 */
export async function generateVoiceover(input: GenerateVoiceoverInput): Promise<GenerateResult> {
  requireKey();
  const t0 = Date.now();
  const route = "tts-starfish";
  const body: Record<string, unknown> = {
    text: input.text,
    voice_id: input.voiceId,
    ...(input.voiceSettings?.speed != null ? { speed: input.voiceSettings.speed } : {}),
    ...(input.language ? { language: input.language } : {}),
  };

  const data = await retryTransient<{ audio_url?: string; duration?: number; request_id?: string }>(
    async () =>
      api<{ audio_url?: string; duration?: number; request_id?: string }>(
        "POST",
        "/v3/voices/speech",
        { body, signal: input.signal },
      ),
    {
      noRetry: input.noRetry,
      onTransientFailure: async (err, attempt) => {
        await logFailure(input, ID, route, "voiceover", body, err, t0, attempt);
      },
    },
  );
  if (!data.audio_url) {
    const err = new TransientPayloadError("heygen /v3/voices/speech returned no audio_url");
    await logFailure(input, ID, route, "voiceover", body, err, t0);
    throw err;
  }

  const dest = assetPath(input, "voiceover", `${input.slot}.mp3`);
  const localPath = await downloadInto(data.audio_url, dest, input.overwrite, input.signal);
  const durationSec = data.duration ?? probeDurationSec(localPath);
  const result: GenerateResult = {
    url: data.audio_url,
    localPath,
    costUsd: Number((heygenPricePerSec(route) * durationSec).toFixed(6)),
    latencyMs: Date.now() - t0,
    model: route,
  };
  await logGeneration(generationDestination(input), {
    slot: input.slot,
    provider: ID,
    model: route,
    endpoint: "/v3/voices/speech",
    kind: "voiceover",
    input: {
      slot: input.slot,
      project: input.projectId,
      voice_id: input.voiceId,
      chars: input.text.length,
      duration_sec: durationSec,
    },
    output: { url: data.audio_url, local: localPath },
    status: "ok",
    latency_ms: result.latencyMs,
    cost_usd: result.costUsd,
    request_id: data.request_id ?? undefined,
    note: input.note ?? input.slot,
  });
  return result;
}

// ─── Video translation ──────────────────────────────────────────────────────

export type TranslateVideoInput = {
  /** Source video: local path or URL. */
  source: string;
  /** Target language NAMES as HeyGen spells them, e.g. "Spanish (Spain)". */
  languages: string[];
  /** `speed` (default) or `precision` — precision buys better lip-sync. */
  mode?: "speed" | "precision";
  inputLanguage?: string;
  /** Number of distinct speakers; improves separation. */
  speakerNum?: number;
  enableCaption?: boolean;
  translateAudioOnly?: boolean;
  title?: string;
  signal?: AbortSignal;
};

/** Kick off one translation per target language. Returns the job ids. */
export async function submitVideoTranslation(input: TranslateVideoInput): Promise<string[]> {
  const data = await api<{ video_translation_ids?: string[] }>("POST", "/v3/video-translations", {
    body: {
      video: await toAssetRef(input.source),
      output_languages: input.languages,
      mode: input.mode ?? "speed",
      ...(input.inputLanguage ? { input_language: input.inputLanguage } : {}),
      ...(input.speakerNum ? { speaker_num: input.speakerNum } : {}),
      ...(input.enableCaption ? { enable_caption: true } : {}),
      ...(input.translateAudioOnly ? { translate_audio_only: true } : {}),
      ...(input.title ? { title: input.title } : {}),
    },
    signal: input.signal,
  });
  const ids = data.video_translation_ids ?? [];
  if (ids.length === 0) {
    throw new TransientPayloadError("heygen /v3/video-translations returned no job ids");
  }
  return ids;
}

export type TranslationResult = {
  id: string;
  language: string | null;
  status: string;
  localPath?: string;
  url?: string;
  captionUrl?: string | null;
  durationSec?: number;
  costUsd: number;
  failure?: string | null;
};

/**
 * Poll one translation job and, on success, download the dubbed mp4 to `dest`.
 * Kept separate from `submitVideoTranslation` so a caller can fan out N
 * languages first and collect them afterwards.
 */
export async function collectVideoTranslation(opts: {
  id: string;
  dest: string;
  mode?: "speed" | "precision";
  overwrite?: boolean;
  pollIntervalMs?: number;
  pollMaxAttempts?: number;
  signal?: AbortSignal;
}): Promise<TranslationResult> {
  const route = `translate-${opts.mode ?? "speed"}`;
  const status = await pollJob(`/v3/video-translations/${encodeURIComponent(opts.id)}`, {
    pollIntervalMs: opts.pollIntervalMs ?? 15_000,
    pollMaxAttempts: opts.pollMaxAttempts ?? 80,
    signal: opts.signal,
  });
  const language = (status as JobStatus & { output_language?: string }).output_language ?? null;
  if (status.status !== "completed" || !status.video_url) {
    return {
      id: opts.id,
      language,
      status: status.status ?? "unknown",
      costUsd: 0,
      failure: status.failure_message ?? status.failure_code ?? null,
    };
  }
  const localPath = await downloadInto(status.video_url, opts.dest, opts.overwrite, opts.signal);
  const durationSec = status.duration ?? probeDurationSec(localPath);
  return {
    id: opts.id,
    language,
    status: "completed",
    localPath,
    url: status.video_url,
    captionUrl: status.srt_caption_url ?? null,
    durationSec,
    costUsd: Number((heygenPricePerSec(route) * durationSec).toFixed(4)),
  };
}

/** Target language names HeyGen currently accepts for translation. */
export async function listTranslationLanguages(): Promise<string[]> {
  const data = await api<{ languages?: string[] } | string[]>(
    "GET",
    "/v3/video-translations/languages",
  );
  return Array.isArray(data) ? data : (data.languages ?? []);
}

export const heygenConnector: RalphyConnector = {
  id: ID,
  label: LABEL,
  envVar: ENV_VAR,
  signupUrl: SIGNUP_URL,
  capabilities: ["lipsync", "voice"],
  available: () => Boolean(process.env.HEYGEN_API_KEY),
  generateLipsync,
  generateVoiceover,
};
