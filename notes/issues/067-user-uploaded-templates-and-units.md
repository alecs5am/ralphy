# User-uploaded templates & units (community contributions)

> **Status:** exploring (design-first — depends on #064)
> **Filed:** 2026-05-31
> **Folder:** issues
> **Severity:** high (new capability)
> **Category:** infra / product / frontend

## Context

Design discussion 2026-05-31. The user wants the library to become a community feed
"like Pinterest / higgsfield / artlist" where **users upload their own templates**
(and the Units those produce). They explicitly noted they can't yet see how to extend
the *current* static template system (build-time `templates/**` committed to git) to
allow outside contributions — which is exactly why the DB + blob infra (#064) is the
prerequisite.

## What

Let external users contribute templates and units to the library:

- **Accounts / auth** — who can upload, ownership of contributed templates/units.
- **Upload pipeline** — a template (its `template.yaml` recipe + locked asset refs)
  and/or unit media → validated → stored (blob for media, DB for metadata, #064).
- **Validation + moderation** — schema validation, safety/content moderation, before
  public listing.
- **Attribution + visibility** — author credit; public / private / pending-review
  states.
- **Farm wiring** — an uploaded template should batch-produce Units like a first-party
  one (ties to the ingredients → template → units → farm model in #063).

## Why it matters

- Turns the library from curated-only into a community marketplace — the core of the
  Pinterest/higgsfield/artlist vision and a growth lever (the library grows itself).
- This is the capability the user said they "can't figure out how to extend the
  current template system" for — it fundamentally needs #064.

## Scope / acceptance

Design round only:

- Auth/account model + ownership.
- Upload flow spec (template recipe + assets; or standalone unit media) with the
  validation + moderation gates.
- Visibility/state machine (draft → review → public/private) + attribution.
- Storage/quotas + abuse considerations.
- How uploaded templates integrate with the farm (batch generation) and with the
  Unit↔Template M:N (#063) — uploaded units get a `produced` link to the uploaded
  template.
- Contrast with #056 (`dev-publish-template`, the maintainer-internal publish flow) —
  reuse what's shareable, but this is untrusted external input.

## Notes

- **Sequence: after #064 (needs DB + blob + auth). Largest of the set.**
- Related: #056 (internal publish), #063, #064, #059 (where the upload service lives).
- Open: moderation — manual review queue vs automated classifier vs both.
