# Ralphy farm server deployment (#506)

One-command server deployment of the content farm: the farm daemon (#503) plus
the authenticated Studio dashboard, with `.ralphy/` as the durable volume.
Design reference: `docs/architecture/farm-node-graph.md` ("Runtime &
dashboard"); the workspace bundle it consumes is #502
(`docs/workspace-bundle.md`).

## Quickstart

```bash
# 1. Pick a long random admin token (the compose REFUSES to start without one).
export STUDIO_AUTH_TOKEN="$(openssl rand -hex 32)"

# 2. Provider keys for the bundle you plan to run (import names any gaps).
export OPENROUTER_API_KEY=sk-or-...
export ELEVENLABS_API_KEY=...

# 3. Bring up the farm + dashboard.
docker compose -f docker/docker-compose.yml up -d --build

# 4. Log in: open http://<host>:4860 — the UI POSTs /api/auth {token} and gets
#    a session cookie. From a shell, use the Bearer header instead:
curl -H "Authorization: Bearer $STUDIO_AUTH_TOKEN" http://<host>:4860/api/health

# 5. Import a trained workspace bundle (the #502 zip from `ralphy workspace export`).
curl -X POST --data-binary @tech-news-v1.zip \
  -H "Authorization: Bearer $STUDIO_AUTH_TOKEN" \
  "http://<host>:4860/api/workspaces/import-bundle?as=my-channel"

# 6. Press start.
curl -X POST -H "Authorization: Bearer $STUDIO_AUTH_TOKEN" \
  -H "content-type: application/json" -d '{"workspace":"my-channel"}' \
  http://<host>:4860/api/farm/start
```

Validation refusals from step 5 come back verbatim (`{ imported: false,
refusals: [...] }`) — missing connector keys and coverage gaps are NAMED;
append `&allowMissingKeys=1` / `&allowCoverageGaps=1` to proceed with
warnings.

## Authentication (recorded decision)

**Single admin token, cookie session for the browser.** `STUDIO_AUTH_TOKEN`
gates EVERY route — GET and mutating, the WebSocket upgrade, and static files —
except the login-free `GET /api/health` and `POST /api/auth`. Two ways to
present it:

- `Authorization: Bearer <token>` — agents, curl, CI.
- The `studio_auth` cookie — set by `POST /api/auth {"token": "..."}`
  (httpOnly, `SameSite=Strict`, 30 days), so the browser UI logs in once.

Comparison is timing-safe. Without the env var the server keeps the historical
localhost-dev behavior: no auth, bound to `127.0.0.1` only. With the token set
it binds `0.0.0.0` (container-friendly; override with `STUDIO_HOST`). The
cookie carries the token itself (single-tenant, self-hosted) — put a TLS
reverse proxy in front before exposing the port beyond a trusted network.
Implementation: `studio/server/auth.ts`.

## Services

| Service | Command | What |
|---|---|---|
| `farm` | `bun cli/index.ts farm start --workspace ${FARM_WORKSPACE:-default}` | The #503 scheduler: cron ticks over the workspace's graph workflows, one Run per tick, durable journal, parks on approval nodes. Idles until a workspace with schedule nodes exists. |
| `studio` | `bun studio/server/index.ts` | The dashboard + control API on port 4860 (auth above). Observes farm state; never executes graph nodes (D-06). |
| `postiz` (+ `postiz-postgres`, `postiz-redis`) | `--profile postiz` | OPTIONAL bundled Postiz per D-05 (external-by-default). After first boot, create an API key in its UI and set `POSTIZ_BASE_URL=http://postiz:5000/api` + `POSTIZ_API_KEY` for the farm. |

Both ralphy services share one image (`docker/Dockerfile`, `oven/bun` base
with `zip`/`unzip` for bundle import) and one named volume `ralphy-data`
mounted at `/app/.ralphy` — workspaces, projects, runs, pidfiles, and farm
logs survive restarts and rebuilds.

## Environment

| Variable | Required | Used by | Notes |
|---|---|---|---|
| `STUDIO_AUTH_TOKEN` | **yes** | studio | Admin token; compose fails fast when unset (`:?`). Never baked into the image. |
| `FARM_WORKSPACE` | no (`default`) | farm | The workspace slug the daemon schedules. |
| `STUDIO_PORT` | no (`4860`) | studio | Host port mapping. |
| `OPENROUTER_API_KEY` | per bundle | farm | LLM + media via the OpenRouter connector. |
| `ELEVENLABS_API_KEY` | per bundle | farm | Voice / music / sfx connector. |
| `FAL_KEY` | per bundle | farm | The sanctioned fal connector (`cli/lib/providers/fal.ts`). |
| `FIRECRAWL_API_KEY` | per bundle | farm | `web-scrape` ingestion nodes. |
| `APIFY_TOKEN` | per bundle | farm | `actor` ingestion nodes. |
| `POSTIZ_BASE_URL` | for publish | farm | REQUIRED config for the Postiz connector (no canonical SaaS host, D-05). Point at your instance, or the bundled one. |
| `POSTIZ_API_KEY` | for publish | farm | Postiz API key. |
| `POSTIZ_JWT_SECRET` | with profile | postiz | Override the placeholder before enabling the profile. |
| `POSTIZ_MAIN_URL` / `POSTIZ_PORT` | no | postiz | Public URL / host port of the bundled Postiz. |

"Per bundle" = only needed when the imported bundle's manifest
(`requiredConnectorKeys`) names it — the import validation tells you exactly
which are missing.

## Control API (what the dashboard calls)

All routes under the auth gate; every control maps to an existing CLI/state
path — the API is not a second engine (see `studio/server/control.ts` for the
per-endpoint mapping).

| Endpoint | Maps to |
|---|---|
| `POST /api/workspaces/import-bundle?as=&allowMissingKeys=1&allowCoverageGaps=1` (raw zip body) | `ralphy workspace import` (#502) |
| `POST /api/farm/start` / `POST /api/farm/tick-now` `{workspace}` | detached `ralphy farm start [--once --tick-now]`, stdio → `.ralphy/farm/<ws>.log` |
| `POST /api/farm/stop` `{workspace}` | `ralphy farm stop` (SIGTERM via pidfile) |
| `GET /api/farm/status?workspace=` | `ralphy farm status` roll-up (read-only) |
| `GET /api/workspaces/:ws/trust` | `ralphy workspace trust` (#505) |
| `POST /api/workspaces/:ws/trust` `{level?, autoPublishScore?, promotionStreak?, demoteOnReject?}` | `ralphy workspace update --trust-*` |
| `POST /api/workspaces/:ws/trust/decision` `{project, unitSlug?, decision}` | `recordTrustDecision` (#505 approve/reject hook) |
| `GET /api/workspaces/:ws/calendar` | the #504 calendar document (slots + entries) |
| `GET /api/workspaces/:ws/workflows` / `GET /api/workspaces/:ws/workflows/:name/graph` | #498 graph spec, shaped for the #490 canvas |

Media safety holds throughout: no endpoint deletes, moves, or overwrites
media — imports create NEW workspaces, controls touch pidfiles/config/state
only (AGENTS.md invariant #14).

## Render deps

The base image ships `zip`/`unzip` only. A deployment whose graphs include
`ralphy-render` / ffmpeg-backed nodes needs `ffmpeg` (and the HyperFrames
renderer's browser) added to `docker/Dockerfile` — kept out of the base image
to keep the ingest/publish farm small.
