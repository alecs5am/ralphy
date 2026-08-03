import { setCredentialTestSource } from "../../cli/lib/providers/credentials.js";

// Explicit test-only injection for legacy connector fixtures. Production never
// installs a post-startup environment source.
setCredentialTestSource((_providerId, environmentVariable) =>
  environmentVariable ? process.env[environmentVariable] ?? null : null,
);
