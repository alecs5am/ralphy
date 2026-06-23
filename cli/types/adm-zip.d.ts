// Minimal ambient declaration for `adm-zip` (no `@types/adm-zip` is installed,
// and we deliberately add no new dependency — #458 reuses the archive lib that
// `hyperframes` already pulls into the tree). Only the read/write surface
// `cli/commands/unit.ts` uses is declared; extend it if a new call is needed.
declare module "adm-zip" {
  class AdmZip {
    constructor(existing?: string | Buffer);
    /** Add a file from disk into the archive under `zipPath` (or its basename). */
    addLocalFile(localPath: string, zipPath?: string, zipName?: string): void;
    /** Add an in-memory buffer as a file at `entryName`. */
    addFile(entryName: string, content: Buffer, comment?: string, attr?: number): void;
    /** Serialize the whole archive to a Buffer. */
    toBuffer(): Buffer;
    /** Write the archive to disk. */
    writeZip(targetFileName?: string): void;
    /** Read back every entry (tests inspect the produced archive). */
    getEntries(): Array<{ entryName: string }>;
  }
  export = AdmZip;
}
