import type { MigrationRecovery } from "../../electron/migration-recovery";

export function MigrationRecoveryScreen({
  recovery,
  onCopyCommand,
}: {
  recovery: MigrationRecovery;
  onCopyCommand(): void;
}) {
  return (
    <main className="migration-recovery" aria-labelledby="migration-recovery-title">
      <section>
        <p>Library unavailable</p>
        <h1 id="migration-recovery-title">Migration recovery required</h1>
        <p>
          Ralphy found an interrupted library migration. Recovery must be run
          explicitly before this library can be opened.
        </p>
        <dl>
          <div><dt>Run ID</dt><dd>{recovery.runId}</dd></div>
          <div><dt>Phase</dt><dd>{recovery.phase}</dd></div>
        </dl>
        <div>
          <button type="button" onClick={onCopyCommand}>Copy recovery command</button>
        </div>
      </section>
    </main>
  );
}
