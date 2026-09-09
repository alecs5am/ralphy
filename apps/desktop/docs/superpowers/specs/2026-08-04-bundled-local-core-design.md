# Bundled Local Core Design

## Goal

Package the exact locally verified Ralphy core binary inside Ralphy Desktop so
this single-user migration does not depend on a public GitHub, Homebrew, or npm
release.

## Runtime contract

- A packaged app launches only `Contents/Resources/bin/ralphy`.
- `RALPHY_BIN` remains an explicit development and test override.
- Development may use the existing PATH discovery when no override is set.
- Production does not fall back to a globally installed binary. A missing,
  non-executable, or incompatible bundled binary is a blocking startup error.
- Electron main owns the executable path. The renderer never receives it.

This keeps one core/Desktop contract pair and prevents a stale global CLI from
silently opening the migrated store.

## Packaging

The macOS package script accepts an explicit local core binary, copies it to
`Contents/Resources/bin/ralphy`, sets mode `0755`, and records its SHA-256 in a
private package manifest. The source binary is built from the exact reviewed
core commit with the existing current-platform compile and smoke command.

The repository does not commit the 100+ MiB binary. It remains a reproducible
package artifact.

## Startup and failures

Electron main selects the binary before opening `RalphySession`. Packaged mode
requires the bundled path; development retains `RALPHY_BIN` and current PATH
discovery. `system.hello` remains the authoritative protocol, contract, schema,
and store compatibility gate.

Failures are explicit and non-recovering: Desktop shows a safe upgrade/build
error and does not start the scanner, mocks, or a global CLI fallback.

## Verification

- Unit tests cover packaged/dev resolution and production fail-closed behavior.
- Package smoke verifies the embedded file is regular, executable, and has the
  expected SHA-256.
- The packaged app completes a real `system.hello` against the migrated
  rehearsal library before the live cutover.
- Codesign verification runs after the binary is embedded and the app is
  signed.

## Scope

No public release, updater, multi-platform bundle, download path, or fallback
version manager is added. Those belong to the later delivery/release phase.
