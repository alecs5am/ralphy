# 014 — Per-workspace social credentials + direct publish connectors (drop Postiz as the default backend)

**Status:** idea / design draft (2026-07-13). Open decisions D-A / D-B below need the user.

## Problem

`ralphy publish` (#501) pushes units exclusively through a self-hosted Postiz
instance (D-05). The user wants to post directly from ralphy — no third-party
scheduler app — across **x (twitter), instagram reels, youtube, dev.to**, with
credentials owned **per workspace** (a workspace = a client / channel identity,
so each one carries its own accounts).

What already exists and is reused as-is:

- The whole publish spine is backend-agnostic: readiness floor + trust ladder
  (#505), exactly-once ledger (#531), quota governor (#534), kill switch
  (#536), append-only `unit.json` publish provenance. Only the transport
  (`postiz*` calls inside `cli/lib/publish/publish.ts`) is Postiz-specific.
- `cli/lib/providers/devto.ts` (#527) already posts articles directly — it just
  reads a **global** env key.
- `cli/lib/providers/youtube-analytics.ts` (#507) already owns the
  `googleapis.com` host allowlist (API-key tier only; its header names the
  OAuth tier as the follow-up).
- Per-workspace secret file precedent: `.ralphy/workspaces/<ws>/farm/webhook-tokens.json`
  (excluded from `workspace export` bundles and backups).

## Design

### 1. Credential store (per workspace, env fallback)

`.ralphy/workspaces/<ws>/credentials.json`, mode `0600`, schema in
`cli/lib/schemas/credentials.ts`:

```json
{
  "version": 1,
  "accounts": {
    "x":        [{ "id": "main", "auth": { "kind": "oauth1",
                   "consumerKey": "…", "consumerSecret": "…",
                   "accessToken": "…", "accessSecret": "…" } }],
    "youtube":  [{ "id": "main", "auth": { "kind": "oauth2-refresh",
                   "clientId": "…", "clientSecret": "…", "refreshToken": "…" } }],
    "instagram":[{ "id": "main", "auth": { "kind": "meta-long-lived",
                   "igUserId": "…", "accessToken": "…", "expiresAt": "…" } }],
    "devto":    [{ "id": "main", "auth": { "kind": "api-key", "apiKey": "…" } }]
  }
}
```

- **Resolution order:** workspace `credentials.json` → global
  `.ralphy/credentials.json` → the connector's legacy env var (keeps
  `DEVTO_API_KEY` etc. working unchanged). One resolver module,
  `cli/lib/publish/credentials.ts`; connectors receive resolved creds as
  arguments instead of reading `process.env` themselves (the env fallback
  stays inside each connector's own file so invariant #1's file-scoped
  env-var allowlist holds).
- Multiple accounts per platform per workspace (`id` label) — `--account
  x=main2` binds explicitly, single account auto-binds (mirrors today's
  Postiz integration binding).
- **Hygiene:** excluded from `workspace export` bundles and backups (same
  treatment as `webhook-tokens.json`); every `out()` surface redacts secret
  fields (`accessToken: "…a1b2"` last-4 only); `ralphy doctor` lists
  connected accounts per workspace + token-expiry warnings (instagram <7d).

### 2. `ralphy account` verb family

- `ralphy account connect <platform> [--workspace <ws>] [--id <label>]` —
  interactive per platform:
  - **devto:** paste API key → validate `GET /api/users/me` → store.
  - **x:** paste the 4 OAuth 1.0a strings from a developer.x.com app
    (consumer key/secret + access token/secret). No refresh dance, works
    forever for the app owner's own account — the lazy correct choice.
    Validate via `GET /2/users/me`.
  - **youtube:** paste OAuth client id/secret (user creates a Desktop-type
    client in console.cloud.google.com), then a **loopback OAuth flow**: the
    verb opens the consent URL in the browser, listens once on
    `localhost:<random>`, exchanges the code, stores the `refresh_token`.
    Scope `youtube.upload`. The transient loopback listener is part of an
    explicit user-invoked flow — not an invariant-#5 auto-launched process.
  - **instagram:** guided flow — user creates a Meta app + Business/Creator
    IG account linked to a FB Page, pastes a long-lived token; the verb
    resolves `igUserId` via the Graph API, stores token + `expiresAt`.
    `ralphy account refresh instagram` re-extends via `refresh_access_token`
    (doctor nags before expiry).
- `ralphy account list | show | remove` (redacted).

### 3. Direct platform connectors (one file each, invariant-#1 file-scoped)

No new dependencies; raw `fetch` like every existing connector, injectable
`fetchImpl`, tolerant types, throws (never exits).

- `cli/lib/providers/x.ts` — OAuth 1.0a HMAC-SHA1 signing with `node:crypto`
  (~50 lines, no lib); v1.1 chunked media upload for video
  (INIT/APPEND/FINALIZE + STATUS poll), then `POST /2/tweets` with
  `media_ids`. Caption from the unit's `caption` field. Free API tier caps
  ~500 posts/mo — already handled by the #534 quota governor per target.
- `cli/lib/providers/instagram.ts` — `graph.facebook.com`: `POST
  /{igUserId}/media` (`media_type=REELS`, `video_url=<public URL>`) → poll
  `status_code=FINISHED` → `POST /media_publish`. **Hard constraint: Meta
  pulls the video from a public URL** — stage the mp4 on Bunny CDN (creds
  already in hand from the library pipeline), publish, then delete the
  staged copy. Staging host configured at workspace level
  (`publish.mediaStaging`), Bunny is the default.
- `cli/lib/providers/youtube-upload.ts` — the OAuth tier the
  youtube-analytics header already names as the follow-up: refresh-token →
  access-token exchange (`oauth2.googleapis.com`), resumable
  `videos.insert` upload. Widen the invariant test's `googleapis.com`
  allowlist to exactly these two files. Known gotchas to surface in the verb
  output: unverified OAuth apps get uploads **locked private** until Google
  app audit (default privacy `unlisted`/`private`, user opts into `public`);
  one upload costs 1600 of the 10k default daily quota units (~6/day).
- `devto.ts` — unchanged API, key now comes through the resolver.

### 4. Backend seam in the publish orchestrator

`cli/lib/publish/backends/` with a minimal interface
(`uploadMedia`, `createPost(target, entry, scheduleAt)`):

- `direct.ts` — routes per target to the connectors above. `scheduleAt` in
  direct mode = the farm scheduler already owns timing (#525 cadence); the
  backend posts "now" when fired — no third-party queue needed.
- `postiz.ts` — today's behavior, kept as an **optional** backend for
  targets direct doesn't cover (tiktok, linkedin, threads).

Selection per target in workspace config: `publish.targets.<t> = "direct" |
"postiz"`; default = `direct` when the workspace has creds for the target,
else `postiz` when configured, else refuse with the connect hint. The
provenance `backend` field already exists and records which one fired. All
gates/ledger/quota logic untouched.

### 5. Per-target format preflight

Before upload, `ffprobe` the unit's media against target constraints
(x: ≤140s/512MB; reels: 9:16, 3s–15min, ≤1GB; youtube shorts: ≤3min 9:16
auto-classified) — refuse with a concrete fix instead of a provider 400.

## Phasing

1. Credential store + `ralphy account` + devto rewire (small, unblocks all).
2. `x.ts` connector + direct backend seam (first end-to-end direct post).
3. `youtube-upload.ts` (loopback OAuth).
4. `instagram.ts` (needs the Bunny staging piece).
5. Flip the default backend to direct; Postiz stays opt-in.

## Open decisions (user)

- **D-A:** keep Postiz as an opt-in fallback backend for uncovered platforms
  (tiktok/linkedin/threads), or remove it entirely? Recommendation: keep —
  TikTok's direct content-posting API requires an app audit and is the one
  platform where a self-hosted scheduler still earns its keep.
- **D-B:** instagram staging host — Bunny CDN (recommended; already
  integrated) vs. a temporary public tunnel per publish.
