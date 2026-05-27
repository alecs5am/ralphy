---
id: 07.09.01
status: done
v1_0: yes
category: 07-socials-and-docs
topic: "07.09 Docs-link lint"
title: "lint:docs-links CI check"
---

# 07.09.01 — `lint:docs-links` CI check

**v1.0:** yes

**Acceptance criteria:**
- Walks all `.md` / `.mdx` in repo + docs-mintlify, finds every link, verifies internal links resolve and external links return 2xx (with a 30s timeout).
- Runs in CI; failure blocks merge.
- Allowlist for known-flaky external URLs.
