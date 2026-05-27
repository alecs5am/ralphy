---
id: 04.02.03
status: done
v1_0: yes
category: 04-user-flow-and-autonomy
topic: "04.02 Industry-aware default; ref only when truly required"
title: "Override path documented and minimal"
---

# 04.02.03 — Override path documented and minimal

**v1.0:** yes

**Acceptance criteria:**
- `--no-ref-consent` proceeds and logs `user_consent: { kind: "no-ref-consent", reason: <string> }` in gen-log.
- Reason is required when overriding a `person` or `brand-product` gate; optional for `ip`.

**Implementation:** `--no-ref-consent <reason>` flag attached to every `ralphy generate {image|video|voiceover|music|sfx}` subcommand. Reason is required (commander parses the value; missing → no override). On a positive override the CLI appends `{ stage: "no-ref-consent", text: <reason>, note: "slot=<slot>" }` to `workspace/projects/<id>/logs/user-prompts.jsonl` (append-only). Integration coverage: `tests/integration/cli-ref-check.test.ts`. Documented in `docs/playbooks/art-director/ref-photo-policy.md` step 3 + AGENTS.md invariant #3.
