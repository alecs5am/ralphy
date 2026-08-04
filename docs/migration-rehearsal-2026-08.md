# SQLite migration rehearsal — 2026-08

This repository now contains a repeatable, isolated migration rehearsal. The
integration fixture creates a source tree with a domain document, an object,
and an unknown entry; it audits without opening SQLite, inventories the source,
imports the document, stages and hashes the object, resolves the fixture issue,
freezes the run, and performs a read-only verification.

The same fixture also exercises the cutover journal: the exact `.ralphy`
source is renamed to `.ralphy-recovery-<run-id>`, the staged generation is
installed with two durable journal transitions, and rollback restores the
original generation without copying or deleting either tree.

Run the rehearsal with:

```bash
bun test tests/integration/migration-domain.test.ts
```

The rehearsal is intentionally synthetic and does not inspect or mutate the
user library. A real-library rehearsal still requires an authorized,
recoverable clone, stopped writers, fresh inventory counts, and a separately
approved cutover window.
