# Postiz Workspace Publishing Design

## Goal

Make the existing `ralphy-automaton` workspace immediately usable for agent-led
publishing through Postiz Cloud. A user should be able to ask an agent to form a
workspace Unit, prepare platform copy, and publish now or schedule it without
providing the Postiz key again.

## Scope

This change is intentionally limited to the core `ralphy` repository and the
gitignored local workspace. `ralphy-farm`, Studio, hosted surfaces, and a
general-purpose connector setup framework are out of scope.

## Workspace state

The Postiz Cloud API key and API root live in
`.ralphy/workspaces/ralphy-automaton/credentials.json`. The file remains mode
`0600`, gitignored, and excluded from exported or committed workspace metadata.
The existing direct X and Telegram credentials remain untouched.

Public Postiz account metadata and the account-specific editorial roles live in
`workspace.json`. A sibling `SOCIAL_STRATEGY.md` gives agents the human-readable
content pillars, channel roles, voice, and publishing rules.

The four enabled channels are:

- Instagram Standalone: `agety.dev` / Ralphy The Ghost
- YouTube: `@ralphy_ugc`
- X: `@alecs5am`
- Telegram: Ralphy UGC

All four are distribution channels for the Ralphy brand. X uses a founder-led
voice; the other channels use the product/mascot voice appropriate to their
format.

## Connector behavior

The existing Postiz connector remains the only source module that reads the
Postiz secret. It gains workspace credential fallback while preserving env
overrides for CI and compatibility.

Postiz Cloud uses `https://api.postiz.com/public/v1`. Legacy self-hosted
`POSTIZ_BASE_URL` behavior remains supported. Connector calls accept an
optional workspace so direct commands can resolve the correct local secret.

## Unit publishing

The existing `publish` command gains workspace Unit support:

```bash
ralphy publish <unit-slug> --workspace ralphy-automaton \
  --targets x,telegram --now

ralphy publish <unit-slug> --workspace ralphy-automaton \
  --targets instagram --at 2026-07-15T09:00:00Z
```

The existing project form remains backward compatible:

```bash
ralphy publish <project> <unit-slug> --targets youtube
```

Telegram becomes a first-class publish target. Text-first `post` and `thread`
Units use their stored body as the post content. An X thread stored as a JSON
string array maps to Postiz's ordered `value[]` thread payload. Media Units keep
using the existing caption and hashtag block.

Every Postiz payload includes the provider-specific settings required by the
current public API:

- Instagram uses the connected integration identifier and `post_type: post`.
- YouTube uses a title, public visibility, a non-kids declaration, and tags.
- X uses `who_can_reply_post: everyone` and the workspace AI-content default.
- Telegram uses its provider type.

Publish attempts remain append-only in `unit.json`. The workspace ledger keeps
the existing idempotency and quota behavior.

## Agent skill

Add a `social-publish` skill and route explicit publish/schedule requests to it.
The skill:

1. Loads `workspace.json` and `SOCIAL_STRATEGY.md`.
2. Resolves or creates a workspace Unit.
3. Ensures target-shaped body, description, title, hashtags, and media exist.
4. Uses Postiz account bindings from the workspace.
5. Treats explicit "publish now" as authorization for an immediate post and an
   explicit date as authorization to schedule. Ambiguous preparation requests
   stop before an external post.
6. Reports the target, account, schedule, Postiz post ID, and Unit path.

The skill never asks for the API key after workspace setup and never prints it.

## Verification

- Unit tests cover Cloud API roots, workspace credential fallback, Telegram,
  provider settings, workspace Unit publishing, and X thread payloads.
- Existing project publish tests remain green.
- A read-only integration listing verifies the saved workspace connection.
- No live post is created during implementation; the user will test a concrete
  Unit in a new chat.
