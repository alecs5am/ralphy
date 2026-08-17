import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => (
    rm(path, { recursive: true, force: true })
  )));
});

describe("migration recovery", () => {
  test.each(["prepared", "source-moved", "rollback-new-moved"])(
    "blocks startup for the %s journal phase",
    async (phase) => {
      const migration = await import("../electron/migration-recovery").catch(() => ({}));
      expect(migration).toHaveProperty("findMigrationRecovery");
      const parent = await mkdtemp(join(tmpdir(), "ralphy-desktop-recovery-"));
      temporaryDirectories.push(parent);
      const root = join(parent, ".ralphy");
      await mkdir(root);
      const journalPath = join(parent, ".ralphy-migration-run-safe.journal.json");
      await writeFile(journalPath, JSON.stringify({
        version: 1,
        runId: "run-safe",
        state: phase,
        sourcePath: root,
        journalPath,
      }), { mode: 0o600 });
      const { findMigrationRecovery } = migration as {
        findMigrationRecovery(root: string): Promise<unknown>;
      };

      await expect(findMigrationRecovery(root)).resolves.toEqual({
        runId: "run-safe",
        phase,
        journalPath,
      });
    },
  );

  test.each(["installed", "rolled-back"])(
    "allows startup for terminal phase %s",
    async (phase) => {
      const { findMigrationRecovery } = await import("../electron/migration-recovery") as {
        findMigrationRecovery(root: string): Promise<unknown>;
      };
      const parent = await mkdtemp(join(tmpdir(), "ralphy-desktop-recovery-"));
      temporaryDirectories.push(parent);
      const root = join(parent, ".ralphy");
      await mkdir(root);
      const journalPath = join(parent, ".ralphy-migration-run-safe.journal.json");
      await writeFile(journalPath, JSON.stringify({
        version: 1,
        runId: "run-safe",
        state: phase,
        sourcePath: root,
        journalPath,
      }), { mode: 0o600 });

      await expect(findMigrationRecovery(root)).resolves.toBeNull();
    },
  );

  test("ignores a journal that is not private", async () => {
    const { findMigrationRecovery } = await import("../electron/migration-recovery");
    const parent = await mkdtemp(join(tmpdir(), "ralphy-desktop-recovery-"));
    temporaryDirectories.push(parent);
    const root = join(parent, ".ralphy");
    await mkdir(root);
    const journalPath = join(parent, ".ralphy-migration-run-safe.journal.json");
    await writeFile(journalPath, JSON.stringify({
      version: 1,
      runId: "run-safe",
      state: "prepared",
      sourcePath: root,
      journalPath,
    }));
    await chmod(journalPath, 0o644);

    await expect(findMigrationRecovery(root)).resolves.toBeNull();
  });

  test("detects source-moved recovery while the installed root is absent", async () => {
    const { findMigrationRecovery } = await import("../electron/migration-recovery");
    const parent = await mkdtemp(join(tmpdir(), "ralphy-desktop-recovery-"));
    temporaryDirectories.push(parent);
    const root = join(parent, ".ralphy");
    const journalPath = join(parent, ".ralphy-migration-run-safe.journal.json");
    await writeFile(journalPath, JSON.stringify({
      version: 1,
      runId: "run-safe",
      state: "source-moved",
      sourcePath: root,
      journalPath,
    }), { mode: 0o600 });

    await expect(findMigrationRecovery(root)).resolves.toMatchObject({
      runId: "run-safe",
      phase: "source-moved",
    });
  });

  test("maps migration bridge details to safe UI data and a quoted command", async () => {
    const {
      migrationRecoveryFromError,
      recoveryCommand,
    } = await import("../electron/migration-recovery");
    const recovery = migrationRecoveryFromError(Object.assign(
      new Error("raw stderr must not be shown"),
      {
        code: "E_MIGRATION_INCOMPLETE",
        details: {
          runId: "run-safe",
          phase: "source-moved",
          journalPath: "/tmp/Library With Spaces/journal.json",
        },
      },
    ));

    expect(recovery).toEqual({
      runId: "run-safe",
      phase: "source-moved",
      journalPath: "/tmp/Library With Spaces/journal.json",
    });
    expect(recoveryCommand(recovery!)).toBe(
      "ralphy migrate domain recover --run-id run-safe --confirm run-safe --journal '/tmp/Library With Spaces/journal.json'",
    );
    expect(JSON.stringify(recovery)).not.toContain("raw stderr");
  });

  test("renders only safe recovery identity and blocking actions", async () => {
    const screen = await import("../src/screens/MigrationRecoveryScreen").catch(() => ({}));
    expect(screen).toHaveProperty("MigrationRecoveryScreen");
    const { MigrationRecoveryScreen } = screen as {
      MigrationRecoveryScreen(props: Record<string, unknown>): React.ReactNode;
    };
    const markup = renderToStaticMarkup(MigrationRecoveryScreen({
      recovery: { runId: "run-safe", phase: "source-moved" },
      onCopyCommand: vi.fn(),
      onChooseLibrary: vi.fn(),
    }));

    expect(markup).toContain("Migration recovery required");
    expect(markup).toContain("run-safe");
    expect(markup).toContain("source-moved");
    expect(markup).toContain("Copy recovery command");
    expect(markup).toContain("Choose another library");
    expect(markup).not.toContain("journalPath");
    expect(markup).not.toContain("/Users/");
  });
});
