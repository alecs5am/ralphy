import type { Database } from "bun:sqlite";

export type MigrationSourceKind = "ralphy" | "legacy-workspace" | "desktop";

export type MigrationPhase =
  | "audited"
  | "inventory"
  | "import"
  | "objects"
  | "relations"
  | "verify"
  | "ready"
  | "cutover"
  | "rolled-back"
  | "failed";

export type MigrationEntryKind =
  | "directory"
  | "file"
  | "symlink"
  | "socket"
  | "fifo"
  | "other";

export type MigrationDisposition =
  | "domain"
  | "object"
  | "run-object"
  | "decoded-object"
  | "cache"
  | "system"
  | "recovery-only"
  | "secret-imported"
  | "secret-recovery-only"
  | "issue";

export type MigrationEntryState =
  | "inventoried"
  | "imported"
  | "staged"
  | "verified"
  | "excluded"
  | "issue";

export type MigrationSourceRoot = {
  id: string;
  kind: MigrationSourceKind;
  path: string;
  device: bigint;
  inode: bigint;
};

export type MigrationContext = {
  db: Database;
  storeRoot: string;
  sourceRoots: readonly MigrationSourceRoot[];
  runId: string;
};

export type MigrationConsumerGrant = {
  version: 1;
  namespace: "farm";
  coreMigrationRunId: string;
  storeId: string;
  lockNonce: string;
  coreVersion: string;
  schemaVersion: number;
  contractVersion: number;
  sourceInventoryDigest: string;
  mappingDigest: string;
  sourceIdentities: Array<{
    id: string;
    kind: MigrationSourceKind;
    canonicalPathHash: string;
    device: string;
    inode: string;
    mode: number;
    inventoryDigest: string;
  }>;
  issuedAt: number;
};

export type MigrationIssueSeverity = "info" | "review" | "block";

export type MigrationIssue = {
  id?: string;
  migrationRunId?: string;
  migrationEntryId?: string | null;
  code: string;
  severity: MigrationIssueSeverity;
  lineNo?: number | null;
  detail: Record<string, unknown>;
};

export type MigrationAuditInput = {
  sourceRoots: readonly {
    kind: MigrationSourceKind;
    path: string;
  }[];
};

export type MigrationAudit = {
  sourceEntries: number;
  sourceFiles: number;
  sourceBytes: number;
  workspaces: number;
  physicalProjects: number;
  registryProjects: number;
  physicalOnlyProjects: string[];
  registryOnlyProjects: string[];
  cloneSupport: "not-probed";
  freeBytes: number;
  blockers: MigrationIssue[];
};

export type MigrationSourceRow = {
  id: string;
  migrationRunId: string;
  sourceKind: MigrationSourceKind;
  sourceLabel: string;
  canonicalPathHash: string;
  sourceDevice: string;
  sourceInode: string;
  sourceMode: number;
  inventoryDigest: string | null;
  createdAt: number;
};

export type MigrationEntryRow = {
  id: string;
  migrationRunId: string;
  migrationSourceId: string;
  sourcePath: string;
  sourceLocatorHash: string;
  entryKind: MigrationEntryKind;
  sourceKind: MigrationSourceKind;
  disposition: MigrationDisposition;
  sourceDevice: string;
  sourceInode: string;
  sourceMode: number;
  bytes: number;
  mtimeMs: number;
  sha256: string | null;
  targetPath: string | null;
  targetRefs: string[];
  rawEvidenceObjectId: string | null;
  state: MigrationEntryState;
  errorCode: string | null;
  terminalAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type MigrationStatus = {
  runId: string;
  phase: MigrationPhase;
  sourceEntryCount: number;
  sourceFileCount: number;
  sourceBytes: number;
  blockingIssues: number;
  updatedAt: number;
};

export type MigrationLock = {
  path: string;
  runId: string;
  nonce: string;
  sourcePath: string;
  sourceDevice: string;
  sourceInode: string;
  pid: number;
  uid: number;
  createdAt: number;
};
