import fs from "node:fs";
import path from "node:path";

export function migrationPrivatePaths(sourcePath: string, runId: string): {
  root: string;
  sourceManifestPath: string;
  authorizationPath: string;
  authorizationClaimPath: string;
  authorizationDonePath: string;
} {
  if (!path.isAbsolute(sourcePath) || fs.realpathSync(sourcePath) !== sourcePath) {
    throw new Error("Migration private state requires an exact real source path");
  }
  if (!/^mig_[A-Za-z0-9-]+$/u.test(runId)) throw new Error("Migration private state Run ID is unsafe");
  const root = path.join(path.dirname(sourcePath), ".ralphy-migration-private", runId);
  return {
    root,
    sourceManifestPath: path.join(root, "sources.json"),
    authorizationPath: path.join(root, "desktop-authorization.json"),
    authorizationClaimPath: path.join(root, "desktop-authorization.claim.json"),
    authorizationDonePath: path.join(root, "desktop-authorization.done.json"),
  };
}

export function ensureMigrationPrivateDirectory(sourcePath: string, runId: string): string {
  const paths = migrationPrivatePaths(sourcePath, runId);
  const base = path.dirname(paths.root);
  const parent = path.dirname(base);
  assertRealDirectory(parent, false);
  for (const candidate of [base, paths.root]) {
    let created = false;
    try {
      fs.mkdirSync(candidate, { mode: 0o700 });
      created = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    assertRealDirectory(candidate, true);
    if (created) fsyncDirectory(path.dirname(candidate));
  }
  return paths.root;
}

function assertRealDirectory(directory: string, privateMode: boolean): void {
  if (fs.realpathSync(directory) !== directory) throw new Error("Migration private state has a symlink ancestor");
  const stat = fs.lstatSync(directory);
  const uid = typeof process.geteuid === "function" ? process.geteuid() : process.getuid?.() ?? stat.uid;
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== uid
    || (privateMode && (stat.mode & 0o777) !== 0o700)) {
    throw new Error("Migration private state directory identity, owner, or mode is invalid");
  }
}

function fsyncDirectory(directory: string): void {
  const fd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
