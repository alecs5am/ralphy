# Community uploads — design

> **Status:** design only. Nothing in this doc has been built. No auth, no database, no blob-storage write path, no upload service, no schema change exists yet. This doc is the plan a future implementation session executes.
> **Tracks:** [`../../notes/issues/done/067-user-uploaded-templates-and-units.md`](../../notes/issues/done/067-user-uploaded-templates-and-units.md)
> **Grounded as of:** 2026-06-15 against the live repo. Every code/path citation below was verified to exist (or noted as absent) at that time.
> **Depends on:** the infra `#067` calls "#064" (database + blob + auth). **`#064` is deprecated and the Supabase backend that briefly superseded it was itself retired** — see §2. This doc re-states what that prerequisite must now provide, because the architecture moved out from under the original issue.

Read [`../../CLAUDE.md`](../../CLAUDE.md) (project layout), [`../../AGENTS.md`](../../AGENTS.md) (invariants, especially #14 append-only), and [`../skills-vs-templates.md`](../skills-vs-templates.md) (the five-entity content model) for the surrounding context. The entity shapes a contribution validates against live in [`../../cli/lib/schemas/unit.ts`](../../cli/lib/schemas/unit.ts), [`../../cli/lib/schemas/template.ts`](../../cli/lib/schemas/template.ts), [`../../cli/lib/schemas/blueprint.ts`](../../cli/lib/schemas/blueprint.ts), and [`../../landing/lib/library-v2/types.ts`](../../landing/lib/library-v2/types.ts).

---

## 1. Goal & non-goals

### Goal

Let **external users** contribute any of the five content entities — a **Unit**, a **Template**, a **Style** (now a Tag, see §3), a **Recipe**, or an **Asset** ([`../skills-vs-templates.md`](../skills-vs-templates.md)) — to the public library, so the library becomes a community feed (the "Pinterest / higgsfield / artlist" vision in the issue) rather than a curated-only collection. Each contributed block becomes reusable inside other users' compositions, and an uploaded Template must batch-produce Units through the same farm path a first-party Template does (§8).

### Non-goals

- **Not the maintainer publish flow.** [`../../landing/scripts/publish-entity.ts`](../../landing/scripts/publish-entity.ts) (the `#056` path) already publishes entities from a trusted maintainer machine. This design **reuses its decomposition + validation logic** but is a different trust class (§9). It does not replace or modify the maintainer path.
- **Not a new generation engine.** Uploaded Templates run through the existing `ralphy` farm primitives (§8); we wire, we don't rebuild.
- **Not a billing / monetization design.** Marketplace economics (paid templates, revenue share) are out of scope for this round. Quotas and abuse limits are in scope (§7); pricing is not.
- **Not an implementation.** No code, no migrations, no provisioning this round (per the issue's "design round only" acceptance).

---

## 2. The dependency the issue calls "#064", and why this doc has to restate it

The issue says #067 "depends on #064 (DB + blob + auth)". The current reality is more complicated, and the design has to account for it head-on:

- **`#064` is in `notes/issues/deprecated/`.** It was marked **SUPERSEDED** on 2026-06-05 when a Supabase Postgres + S3 backend went live ([`../../notes/issues/deprecated/064-backend-infra-db-blob-for-units-templates.md`](../../notes/issues/deprecated/064-backend-infra-db-blob-for-units-templates.md)).
- **That Supabase backend was then retired (June 2026).** The library today is **one static JSON document** — `landing/lib/library-v2/library.json` — committed to the repo and mirrored to Bunny CDN. The CLI reads it over the CDN ([`../../cli/lib/library/client.ts`](../../cli/lib/library/client.ts), `DEFAULT_LIBRARY_URL = https://ralphy.b-cdn.net/library/library.json`); the landing imports it directly ([`../../landing/lib/library-v2/index.ts`](../../landing/lib/library-v2/index.ts)); the publisher edits it in place and re-uploads it ([`../../landing/scripts/publish-entity.ts`](../../landing/scripts/publish-entity.ts)). There is **no database, no auth, and no write API anywhere in the live system.**

So "depends on #064" cannot mean "wait for #064 to ship" — #064 is dead and its replacement is also gone. **The prerequisite for community uploads is a new backend issue that re-establishes the three things #064 named, against the post-Supabase reality.** This doc names that prerequisite **the upload backend** and specifies, in §10, exactly what it must provide before any of §3–§8 is buildable. Concretely the gap is: the static-file model is a *single-writer, trusted-committer* model — it physically cannot accept writes from untrusted users (it would mean handing strangers commit access to `library.json`). Community uploads is the capability that **forces** a real backend back into existence; that backend is the unblock, and this doc is the design it unblocks.

> **The honest framing for the reader:** the static `library.json` works precisely *because* there is exactly one trusted writer (the maintainer running `publish-entity.ts`). Community uploads breaks that assumption by definition. The whole point of this design is the untrusted-writer path — which needs a queryable store, a blob target separate from git, and an identity to attribute writes to. That is the upload backend prerequisite.

---

## 3. The content model a contribution must fit

A contribution is **not** free-form media. It must land as one of the five library entities so it is reusable and farm-wireable. The canonical model is in [`../skills-vs-templates.md`](../skills-vs-templates.md); the shapes are in [`../../landing/lib/library-v2/types.ts`](../../landing/lib/library-v2/types.ts).

| Entity | Shape (validated against) | What an external user uploads | Reusable as |
|---|---|---|---|
| **Unit** | `Unit` in `types.ts`; project-side mirror `UnitManifestSchema` in [`../../cli/lib/schemas/unit.ts`](../../cli/lib/schemas/unit.ts) | A finished deliverable: 1..N media items + a `format` + provenance links + tags | A feed item; the `produced` end of a Template→Unit link (§8) |
| **Template** (block, `kind:"template"`) | `Block` in `types.ts`; `TemplateYamlSchema` in [`../../cli/lib/schemas/template.ts`](../../cli/lib/schemas/template.ts) for the cookbook form | The structure / beat skeleton, look-agnostic | The structure axis of others' Units; a farmable batch driver (§8) |
| **Recipe** (block, `kind:"recipe"`) | `Block` with the enriched payload `recipeKind` / `body` / `artifact` / `params` / `demo` | An extractable effect: an ffmpeg filtergraph, a HyperFrames snippet, an encode/bake recipe, a prompt technique | A composable effect (`recipeIds[]`) on others' Units |
| **Asset** (block, `kind:"asset"`, has a `sub`) | `Block` with `sub: character\|location\|prop\|music` | A reusable master: a character master, a location plate, a prop, a music bed | A swappable ingredient (`assetIds[]`, same-`sub` swap menu) on others' Units |
| **Style** | **Demoted to a unit Tag** (`#082`) — `Unit.tags[]`, no block, no detail page | The look / register label | A discovery / filter facet (the feed's `TAGS` facet) |

Two model facts shape the whole design:

1. **A Unit's provenance is a graph of block ids** (`templateId`, `recipeIds[]`, `assetIds[]`). An uploaded Unit therefore *references other entities by id*. Those referenced blocks may be first-party, may be another user's contribution, or may be missing. The publisher already handles a missing-block reference by recording it verbatim and warning rather than fabricating (see `publishUnit` in [`../../landing/scripts/publish-entity.ts`](../../landing/scripts/publish-entity.ts)); the community path needs the same tolerance plus a moderation consequence (§5).
2. **"Style" is a tag, not a block.** A contributor who wants to publish "a look" is publishing the *anchor images as Assets* + a *tag*, not a Style block — the `style` block kind was removed (`#082`, see the note in [`../../landing/lib/library-v2/types.ts`](../../landing/lib/library-v2/types.ts)). The upload UI must reflect this so a contributor isn't offered a non-existent entity type.

---

## 4. Accounts, auth & ownership

The static library has no notion of an author beyond "the maintainer who committed it". Community uploads needs identity.

### Who can upload

- **Authenticated users only.** Upload requires a logged-in account (anonymous reads stay open — the feed is public). This is the minimum bar for attribution, quotas, and abuse traceability.
- **A verified email (or OAuth identity) per account.** Email/OAuth gives a stable owner key and a contact channel for moderation outcomes. The upload backend (§10) owns the identity provider; this design does not pick one, but it assumes one exists and yields a stable `userId`.

### How ownership is tracked

- **Every contributed entity carries an `ownerId`** (the uploading account) and `createdAt` / `updatedAt`. This is a *new* field on the entity records in the backing store — it does **not** belong in the public `library.json` shape, because that file is a denormalized read model served to anonymous clients. Ownership lives in the backend store; the public-facing entity carries only the display **attribution** (author handle + link), not the raw `ownerId`.
- **Ownership is immutable on transfer-by-default.** An entity's `ownerId` does not change when another user *uses* the block in their own Unit. Using a block creates a *reference* (a provenance id), not a copy of ownership. This is what makes "each uploaded block becomes reusable in others' compositions" safe — reuse never reassigns authorship.
- **A Unit can credit upstream block authors.** When user B publishes a Unit that composes user A's Template + user C's Asset, the Unit page surfaces all three credits (the Unit's own author B, plus the upstream block authors A and C, resolved through the provenance ids). This is the attribution graph the issue asks for, and it falls out of the existing provenance model for free.

### Permissions matrix (the minimum)

| Action | Anonymous | Owner | Other authenticated user | Moderator |
|---|---|---|---|---|
| Read a `public` entity | yes | yes | yes | yes |
| Upload a new entity | no | (becomes owner) | (becomes owner) | yes |
| Edit / version own entity | no | yes (append-only, §6) | no | yes |
| Use a `public` block in own Unit | no | yes | yes | yes |
| Set own entity `private` / unpublish | no | yes | no | yes |
| Approve / reject / takedown | no | no | no | yes |

---

## 5. Upload pipeline

The pipeline turns an untrusted upload into a validated, stored, moderated, listable entity. It deliberately mirrors the *stages* of the maintainer path ([`../../landing/scripts/publish-entity.ts`](../../landing/scripts/publish-entity.ts) + the `templater` skill [`../../.agents/skills/templater/SKILL.md`](../../.agents/skills/templater/SKILL.md)) so the validation/decomposition logic is shared, but adds the gates a trusted machine doesn't need.

```
upload  →  schema-validate  →  safety/path scrub  →  store (blob + metadata, draft)
        →  moderation gate (§5.3)  →  publish to public read model  →  listable in feed
```

### 5.1 Submit

- A contributor submits one entity at a time: the **media files** (blob) + the **metadata JSON** (the entity record). For a Unit this is the `unit.json`-shaped manifest + its ordered media; for a block it is the block spec (`{ kind, id, name, blurb, sub?, refs?[], recipeKind?, body?, artifact?, params?, demo? }`) + any ref media. These are the exact payloads `publish-entity.ts` consumes today, so a contribution is structurally a "publish-entity request from an untrusted caller".
- The submit endpoint assigns `ownerId` from the session, stamps `createdAt`, and forces initial state `draft` (§6). The contributor **cannot** set their own visibility to `public` directly — that transition is gated by moderation.

### 5.2 Validate (schema + safety, automated, blocking)

Validation is **fail-closed**: a contribution that fails any check never reaches storage in a public state.

- **Schema validation against the real Zod schemas.** Reuse [`../../cli/lib/schemas/unit.ts`](../../cli/lib/schemas/unit.ts) (`UnitManifestSchema`), [`../../cli/lib/schemas/template.ts`](../../cli/lib/schemas/template.ts) (`TemplateYamlSchema`, including `validateSlug()` and `DENIED_SLUG_TOKENS`), and [`../../cli/lib/schemas/blueprint.ts`](../../cli/lib/schemas/blueprint.ts) (`BlueprintSchema`). The block-spec structural validation already in `validateBlockSpec` / `validateManifest` ([`../../landing/scripts/publish-entity.ts`](../../landing/scripts/publish-entity.ts)) is the second layer. **This is the same code path the maintainer flow uses** — the trust boundary is added *around* it, not by forking it.
- **Slug discipline.** `validateSlug()` already rejects `DENIED_SLUG_TOKENS` (real-creator / brand names like `hormozi`, `mrbeast`, `old-spice`). For untrusted input this list is necessary but not sufficient — see the open question on slug squatting (§11).
- **Local-path scrub.** The maintainer publisher refuses to emit absolute local paths via `assertNoLocalPaths` / `LOCAL_PATH_RE` ([`../../landing/scripts/publish-entity.ts`](../../landing/scripts/publish-entity.ts)). For uploads this graduates from a leak-guard to a **hostile-input guard**: an external metadata blob is assumed adversarial, so the same regex backstop runs, plus a normalization pass that strips any path component, rejects path traversal (`..`), and rejects non-allowlisted ref schemes (only `https://` refs to our own blob store, never arbitrary external URLs).
- **Media validation.** Decode every uploaded media file to confirm it is the declared type (an `image`/`video` per `mediaKindFor`), enforce per-file and per-upload size caps (§7), strip metadata (EXIF/GPS), and re-encode to a normalized profile. An undecodable or mismatched file fails the upload.
- **English-on-disk policy.** The repo rule is English-only for committed artifacts ([`../developing-ralphy.md`](../developing-ralphy.md)). Contributed *prose* (names, blurbs, recipe bodies) is user content, not a repo artifact, so the hard Cyrillic gate does not apply to it the way it applies to maintainer commits — but the moderation layer should language-detect and the feed should not silently misrepresent language. **Open question (§11):** how strict to be on contributor-language vs the repo's English-on-disk rule.

### 5.3 Store (the blob + metadata split — the upload backend, §10)

- **Media bytes → blob storage**, never the git repo. The maintainer path commits media into `landing/public/showcase/<id>/` *and* uploads to Bunny; the community path must **not** commit anything to git (untrusted bytes never enter the repo). Uploaded media goes to a blob bucket under a key scheme mirroring the maintainer one (`units/<id>/...`, `blocks/<kind>/<id>/...`, `blueprints/<unitId>/...`) but namespaced by owner to prevent key collisions across users.
- **Metadata → a queryable store.** The community feed needs to filter by format/tag/block, paginate over a large and growing set, resolve provenance both directions, and filter by visibility + moderation state + owner. A static `library.json` cannot do this for tens of thousands of user uploads (the exact reason #064 existed). The metadata store is the database the upload backend provides (§10).
- **The public read model stays compatible with `library.json`.** The feed and Unit/block pages already consume the `library-v2` graph shape ([`../../landing/lib/library-v2/index.ts`](../../landing/lib/library-v2/index.ts)). The community store should be able to *project* a `public`-state subset into that same entity shape, so the existing read surfaces and the CLI client keep working with minimal change. First-party curated content can continue to live in the committed `library.json`; community content is served from the store — the two compose into one feed at read time.

---

## 6. Visibility & state machine

Every contributed entity moves through an explicit state machine. The transitions are owner- or moderator-driven; nothing auto-promotes to `public`.

```
        submit                 moderation               owner
draft ──────────► in_review ───────────────► public ◄────────► private
  ▲                  │  rejected                                  │
  │                  ▼                            takedown        │
  └──────────── changes_requested              (moderator) ───► removed
       (owner re-submits)                                          ▲
                                                                   │
                                              public ──────────────┘
```

| State | Visible to | Meaning |
|---|---|---|
| `draft` | owner only | Uploaded, not yet submitted for review (or failed validation and being fixed). |
| `in_review` | owner + moderators | Passed automated validation; awaiting the moderation gate (§5.3 / decision in §11). |
| `changes_requested` | owner + moderators | Moderator bounced it with a reason; owner edits and re-submits. |
| `public` | everyone | Listed in the feed, usable as a block by other users. |
| `private` | owner only | Stored + usable by the owner in their own Units, not listed publicly. |
| `removed` | nobody (audit-retained) | Taken down (moderator) or deleted by owner. Append-only audit record kept. |

Rules:

- **`public` is reachable only through `in_review` and an approve transition.** A contributor cannot self-publish.
- **Append-only versioning, matching AGENTS.md invariant #14.** An edit to a `public` entity does not mutate it in place; it creates a new version (mirroring the `.v2` discipline in [`../../cli/lib/schemas/unit.ts`](../../cli/lib/schemas/unit.ts) and the idempotent upsert-by-id in [`../../landing/scripts/publish-entity.ts`](../../landing/scripts/publish-entity.ts)). The prior version stays addressable so any Unit that referenced it does not break. The store tracks `latestVersion`; the feed shows the latest `public` version.
- **A block in use cannot be hard-deleted.** If user A's Asset is referenced by user B's `public` Unit, A can set it `private` (delisting it from the swap menu for new compositions) but the existing reference resolves to the pinned version. Hard `removed` for an in-use block is a moderator action with explicit downstream handling (the referencing Units fall back to the by-ref behavior the publisher already tolerates).
- **Attribution travels with state.** The author credit (§4) is attached at `public` and persists through versioning.

---

## 7. Storage, quotas & abuse

Untrusted uploads at feed scale need hard limits the single-maintainer path never needed.

- **Per-account quotas.** A cap on total stored bytes, a cap on entities per account, and a rate limit on uploads per hour. Default tiers (exact numbers are a §11 decision): a free tier generous enough for a real contributor, a hard ceiling to bound abuse. Quota is checked at submit, before any blob write.
- **Per-file and per-upload size caps.** Reuse the spirit of the maintainer `BLUEPRINT_MAX_BYTES` (50 MiB) and the showcase-mp4 size pain that motivated it (see the comments in [`../../landing/scripts/publish-entity.ts`](../../landing/scripts/publish-entity.ts)). A single media file and a single Unit upload each get an explicit cap; oversize is rejected at submit (not silently dropped).
- **Blob isolation by owner.** Keys are namespaced by `ownerId` so one user cannot overwrite another's media by guessing a key, and a takedown can purge one owner's bytes cleanly.
- **Abuse vectors to bound explicitly:**
  - **Storage exhaustion** → quotas + size caps (above).
  - **Slug / id squatting** → reserved-namespace + first-come rules (open, §11).
  - **Malicious media** (decompression bombs, malformed containers) → mandatory decode + re-encode + size cap in validation (§5.2).
  - **Malicious metadata** (path traversal, injected URLs, oversized fields) → the local-path scrub + ref-scheme allowlist + field-length caps (§5.2).
  - **Provenance reference abuse** (an uploaded Unit claiming a famous first-party Template to ride its traffic) → references are recorded factually but the moderation gate (§5.3) and the credit graph (§4) make false provenance visible and removable.
  - **Sybil / spam uploads** → rate limits + the moderation gate; severe cases → account suspension (moderator).

---

## 8. Farm wiring (an uploaded Template must batch-produce Units)

The issue's load-bearing requirement: an uploaded Template behaves like a first-party one in the **content farm** (the `#410` farm-mode workflow — [`../../notes/issues/done/410-chat-native-content-farm-mode.md`](../../notes/issues/done/410-chat-native-content-farm-mode.md), built into [`../playbooks/producer.md`](../playbooks/producer.md)).

- **The farm consumes Templates by id, not by origin.** The agent matches a brief to a format/template via `ralphy template suggest`, scaffolds with `ralphy template use <slug>`, then runs the batch primitives. As long as an uploaded Template is *retrievable through the same library read path* (§5.3, projected into the `library-v2` shape the CLI client reads — [`../../cli/lib/library/client.ts`](../../cli/lib/library/client.ts)), the farm needs no special case for "community" vs "first-party". This is the single most important reuse: **don't fork the farm; make uploaded Templates indistinguishable to it at read time.**
- **Uploaded Units get a `produced` link to the uploaded Template.** The existing model already encodes this: a `Unit.templateId` points at its Template, and `unitsUsing("template", id)` ([`../../landing/lib/library-v2/index.ts`](../../landing/lib/library-v2/index.ts)) resolves the reverse (Template → its Units). When the farm produces a Unit from an uploaded Template, the Unit's provenance carries that Template's id, and the `produced` link is exactly that `templateId` edge — Template `1 → N` Units, the cardinality already documented in [`../skills-vs-templates.md`](../skills-vs-templates.md). No new relation type is needed; the community path just populates the existing one.
- **The farm's quality gates still apply.** Farm-produced Units from an uploaded Template go through the same eval/repair/unit-formation lifecycle ([`../playbooks/unit-lifecycle.md`](../playbooks/unit-lifecycle.md)) as any other — an uploaded Template does not bypass the quality bar, it just supplies the structure.
- **Trust note:** an uploaded Template's *recipe artifacts* (a contributed ffmpeg filtergraph, a HyperFrames snippet, a prompt) execute on the producing user's machine through `ralphy`. That makes a contributed Recipe an **executable payload**, which is a sharper trust concern than contributed *media*. This is the highest-severity item for the moderation design and is called out as an open question (§11).

---

## 9. Trust-boundary contrast with #056 (the maintainer publish flow)

`#056` ([`../../landing/scripts/publish-entity.ts`](../../landing/scripts/publish-entity.ts), driven by the `dev-publish-template` skill [`../../.agents/skills/dev-publish-template/SKILL.md`](../../.agents/skills/dev-publish-template/SKILL.md)) and this design solve the same shape of problem — get a content entity into the library — from opposite sides of a trust boundary.

| Dimension | `#056` maintainer publish | `#067` community upload |
|---|---|---|
| Who runs it | A trusted maintainer on their own machine | Any authenticated external user |
| Input trust | Trusted (the maintainer's own finished project) | **Untrusted, assumed adversarial** |
| Entry point | A CLI script invoked locally; `--push` is a deliberate human step | A network endpoint behind auth + quotas |
| Auth | None needed (machine has the Bunny creds) | Required; yields `ownerId` for attribution |
| Storage write | Edits the committed `library.json` + uploads to Bunny (single writer) | Writes to a backend store; **never commits to git** |
| Validation | Schema + local-path leak-guard (`assertNoLocalPaths`) | **Same schema validation** + hostile-input scrub + media decode/re-encode + moderation gate |
| Publish gate | The maintainer's own judgment (no review queue) | An explicit moderation transition; no self-publish |
| Ownership | Implicitly the project / maintainer | First-class `ownerId` + an attribution credit graph |
| Idempotency / append-only | Upsert-by-id, never deletes (AGENTS.md #14) | Same append-only versioning, plus owner/moderator state machine (§6) |

**What is shared (reuse, don't fork):**

- The **entity decomposition + classification** logic — the `templater` skill's extract→classify→de-dup pipeline ([`../../.agents/skills/templater/SKILL.md`](../../.agents/skills/templater/SKILL.md)) and the structural validators in `publish-entity.ts`.
- The **Zod schemas** (`unit.ts`, `template.ts`, `blueprint.ts`) — the single definition of a valid entity shape, used by both paths.
- The **blob key scheme** (`units/<id>/...`, `blocks/<kind>/<id>/...`, `blueprints/<unitId>/...`) and the **local-path scrub** (`LOCAL_PATH_RE`).
- The **public read model** — both paths ultimately produce entities in the `library-v2` shape ([`../../landing/lib/library-v2/types.ts`](../../landing/lib/library-v2/types.ts)) so one feed and one CLI client serve both.

**What is added for the trust boundary:** auth + `ownerId`, the moderation gate, the state machine, quotas, hostile-input handling, the credit graph, and a write target that is a real backend store rather than a git commit. The trust boundary *is* the difference — everything else is reuse.

---

## 10. What the upload backend must provide (the prerequisite, restated)

Because #064 is dead (§2), the new backend issue this design unblocks must provide, at minimum:

1. **Identity / auth** — accounts, login, a stable `userId`, and a moderator role. (§4)
2. **A queryable metadata store** — for the five entities + their provenance graph + `ownerId` + visibility/moderation state + versioning, supporting feed-scale filter/paginate/traverse queries the static `library.json` cannot. (§3, §5.3, §6)
3. **Blob storage with per-owner key isolation and a write API** — for contributed media, separate from git, with size caps and takedown-purge support. (§5.3, §7)
4. **A write/ingestion API** behind auth + quotas + the validation pipeline (§5), since the static-file model has no write path for untrusted callers.
5. **A projection to the existing `library-v2` read shape** so the feed, the Unit/block pages, the CLI library client ([`../../cli/lib/library/client.ts`](../../cli/lib/library/client.ts)), and the farm (§8) keep working with `public`-state community content composed alongside first-party content.

**Where the service lives** is an open coordination point with the repo-split plan ([`./repo-split-plan.md`](./repo-split-plan.md)): the static library is owned by `landing/` today, but a write backend with auth + a DB is a different deployment shape (its own service, or landing's API routes). That decision belongs to the backend issue, informed by the split plan; this design assumes the backend exists and exposes the five capabilities above.

---

## 11. Open questions

- **Moderation approach — queue vs classifier vs both?** *(the issue's headline open question)* The recommendation is **both, layered, classifier-first**: run an automated content/safety classifier on every submission as a blocking pre-filter (it cheaply rejects clear violations and auto-flags borderline cases), then route the survivors to a **manual review queue** for the approve→`public` transition. Rationale: a pure manual queue does not scale to a community feed and becomes the bottleneck the whole "library grows itself" thesis dies on; a pure classifier cannot be trusted as the *sole* gate for promoting untrusted content to a public, reusable, **executable** (§8 recipe artifacts) surface. Layering gives the classifier's throughput with a human's final say. The exact split — what the classifier may auto-approve vs what always needs human eyes, and whether trusted contributors earn reduced review — is the live decision.
- **Executable contributed Recipes (§8).** A contributed ffmpeg/HyperFrames/prompt artifact runs on the *producing* user's machine. How is it sandboxed / reviewed / capability-limited before it can be used in someone else's farm batch? This is the highest-severity trust item and may justify a separate review tier from media-only contributions.
- **Slug / id namespace governance.** `DENIED_SLUG_TOKENS` blocks known creator/brand names, but community scale invites squatting and impersonation. Per-owner namespacing? Reserved prefixes? First-come with dispute resolution? Undecided.
- **Quota numbers + tiers (§7).** The mechanism is specified; the actual byte/entity/rate limits and whether they vary by contributor reputation are unset.
- **Contributor language vs the English-on-disk rule (§5.2).** Repo artifacts are English-only ([`../developing-ralphy.md`](../developing-ralphy.md)); user content is not a repo artifact. How strict should the feed / moderation be on non-English contributed prose?
- **Composition into the existing feed.** Does first-party curated content keep living in the committed `library.json` (composed at read time with community content from the store), or does everything migrate into the store with the static file becoming a seed? The minimal-disruption answer (compose at read time) is the working assumption, but the full migration question is open.

## See also

- [`../../notes/issues/done/067-user-uploaded-templates-and-units.md`](../../notes/issues/done/067-user-uploaded-templates-and-units.md) — the tracking issue (this doc's spec).
- [`../skills-vs-templates.md`](../skills-vs-templates.md) — the five-entity content model.
- [`../../landing/scripts/publish-entity.ts`](../../landing/scripts/publish-entity.ts) — the `#056` maintainer publish flow (the trusted contrast point).
- [`../../.agents/skills/templater/SKILL.md`](../../.agents/skills/templater/SKILL.md) + [`../../.agents/skills/dev-publish-template/SKILL.md`](../../.agents/skills/dev-publish-template/SKILL.md) — the extract→classify→publish path to reuse.
- [`../../landing/lib/library-v2/types.ts`](../../landing/lib/library-v2/types.ts) + [`../../landing/lib/library-v2/index.ts`](../../landing/lib/library-v2/index.ts) — the entity shapes + the read model.
- [`../../cli/lib/library/client.ts`](../../cli/lib/library/client.ts) — the CLI read-only library client (no write path today).
- [`../../cli/lib/schemas/unit.ts`](../../cli/lib/schemas/unit.ts) · [`../../cli/lib/schemas/template.ts`](../../cli/lib/schemas/template.ts) · [`../../cli/lib/schemas/blueprint.ts`](../../cli/lib/schemas/blueprint.ts) — the validation schemas.
- [`./repo-split-plan.md`](./repo-split-plan.md) — where a write backend service would live (`#059`).
- [`../playbooks/producer.md`](../playbooks/producer.md) + [`../playbooks/unit-lifecycle.md`](../playbooks/unit-lifecycle.md) — the farm + Unit lifecycle an uploaded Template plugs into (`#410`).
