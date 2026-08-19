# HeyGen connector fills the lipsync capability

> **Status:** done — 2026-07-28
> **Filed:** 2026-07-28
> **Folder:** issues
> **Severity:** medium
> **Category:** providers / media

## Context

`generateLipsync` sat on the `RalphyConnector` interface as a declared-but-empty
seam from #512 onward: the type existed, no connector implemented it, no
capability named it, and no verb reached it. The docstring claimed lipsync
"resolves the video-capability connector and fails with a structured error" —
nothing did that either, because nothing called the method at all.

The gap forced a choice on every talking-head job: either generate each shot as
a separate i2v take (and watch the voice identity drift between shots, which is
exactly what the `denti-perio-pitch-001` client rejected in feedback round 2),
or drive an avatar tool by hand outside Ralphy and lose the gen-log, the cost
rollup, and the append-only slot discipline.

## What landed

- `cli/lib/providers/heygen.ts` — the connector. HeyGen v3 Avatar IV in
  `type: "image"` mode, which animates an arbitrary photo with no pre-registered
  avatar, so the anchor can be a frame lifted straight out of an existing hook
  clip. Flow: upload portrait + audio to `POST /v3/assets` (local paths only;
  http(s) inputs pass through as `url` / `audio_url`) → `POST /v3/videos` →
  poll `GET /v3/videos/<id>` → download the presigned mp4 into the slot via
  `protectExistingAsset`. Verified against developers.heygen.com 2026-07-28
  (v3 is the active platform; the v2 `/v2/video/generate` shape is superseded).
- `"lipsync"` added to the `Capability` union; `GenerateLipsyncInput` gained
  `aspectRatio` / `resolution` / `pollIntervalMs` / `pollMaxAttempts`.
- `heygenConnector` registered in `BUNDLED`, last. It claims only the lipsync
  cell, so no other capability's default resolution changes.
- `ralphy generate lipsync --image <ref> --audio <ref>` — same destination /
  slot / dry-run / queue / budget / auto-version treatment as the sibling
  generate verbs. Output lands in `artifacts/videos/` and the gen-log row uses
  `kind: "video"`; the output IS a video, and reusing the existing kind keeps the
  log vocabulary and every downstream cost rollup unchanged.
- `heygenPricePerSec()` — the published API-tier rate card
  (`avatar-iv-image` $0.05/s, twin routes $0.0667/s, `avatar-iii-photo`
  $0.0433/s), pure and exported so `tests/unit/providers-heygen.test.ts` pins
  each branch with no network call. An unknown route bills at the most
  expensive published rate: under-reporting a paid run is the dangerous
  direction.
- Cost tracks OUTPUT length. HeyGen reports `data.duration` on the status
  payload; `probeDurationSec` (newly exported from `ffmpeg-recipes.ts`) is the
  fallback and also powers the `--dry-run` estimate from the local audio.
- `HEYGEN_API_KEY` + the HeyGen API hosts are now file-scoped to the connector
  in `tests/unit/agents-md-invariants.test.ts`, on the same terms as fal and the
  #500 ingestion connectors.

## Gotcha worth keeping

The host allowlist regex is scoped to the `api` / `upload` / `app` subdomains,
NOT all of `heygen.com`. HyperFrames is a HeyGen product and `render/hyperframes.ts`
cites `hyperframes.heygen.com` in a header comment — a blanket `heygen\.com`
pattern flags that doc link as an invariant violation. A documentation URL in a
comment is not an API call.

## Not done

- No `--prompt` passthrough. `GenerateLipsyncInput.prompt` exists on the type,
  but HeyGen documents `motion_prompt` as photo-avatar-only and explicitly
  unsupported for `type: "image"`. Wire it if a route ever honors it.
- Only the `type: "image"` route. Digital-twin and registered-photo-avatar
  routes are priced in `heygenPricePerSec` but not reachable — they need an
  avatar-management surface (`avatar_id` lookup / creation) that no verb covers.
- No fal avatar route as a second lipsync provider. The capability now exists,
  so adding one is a file plus a registry line.
