import fs from "node:fs";
import { constants } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { PortableRecord } from "./internal-portable-data.js";

/**
 * Streamed portable package I/O (#584). A package is an uncompressed ustar
 * archive. Version 3 stores every table as chunked NDJSON entries
 * (`rows/<n>`): the first line is `{"table","columns"}` and each further line
 * is one row as a JSON array aligned to those columns. The manifest lists each
 * chunk with its row count, byte size, and SHA-256, so the manifest grows with
 * the chunk count, never with the row count, and neither side holds more than
 * one chunk of rows at a time.
 */
export const MAX_ARCHIVE_BYTES = 1024 ** 3;
export const MAX_MANIFEST_BYTES = 64 * 1024 ** 2;
/** A chunk closes at this many rows or bytes; one oversized row still gets its own chunk. */
export const CHUNK_ROWS = 10_000;
export const CHUNK_BYTES = 8 * 1024 ** 2;
export const MAX_CHUNK_BYTES = 64 * 1024 ** 2;

const BLOCK = 512;
const COPY_BUFFER = 1024 ** 2;

export type PortableRowChunk = { entry: string; table: string; rows: number; bytes: number; sha256: string };
type TarEntry = { offset: number; size: number };

const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

function header(name: string, size: number): Buffer {
  if (Buffer.byteLength(name) > 100 || !/^[!-~]+$/.test(name)) throw new Error("Invalid portable archive entry name");
  const block = Buffer.alloc(BLOCK);
  block.write(name, 0, "ascii");
  block.write("0000600\0", 100, "ascii");
  block.write("0000000\0", 108, "ascii");
  block.write("0000000\0", 116, "ascii");
  block.write(`${size.toString(8).padStart(11, "0")}\0`, 124, "ascii");
  block.write(`${Math.floor(Date.now() / 1000).toString(8).padStart(11, "0")}\0`, 136, "ascii");
  block.write("        ", 148, "ascii");
  block.write("0", 156, "ascii");
  block.write("ustar\0", 257, "ascii");
  block.write("00", 263, "ascii");
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, "ascii");
  return block;
}

/** Sequential ustar writer on a private, exclusively created file. */
export class PortableArchiveWriter {
  readonly rows: PortableRowChunk[] = [];
  private offset = 0;
  private chunkCount = 0;
  private readonly names = new Set<string>();
  private closed = false;
  private constructor(private readonly fd: number) {}

  static create(file: string): PortableArchiveWriter {
    return new PortableArchiveWriter(fs.openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600));
  }

  private write(data: Uint8Array): void {
    if (this.offset + data.length > MAX_ARCHIVE_BYTES) throw new Error("Portable packages currently support archives up to 1 GiB");
    let written = 0;
    while (written < data.length) written += fs.writeSync(this.fd, data, written, data.length - written, this.offset + written);
    this.offset += data.length;
  }
  private begin(name: string, size: number): void {
    if (this.names.has(name)) throw new Error("Duplicate portable archive entry");
    this.names.add(name);
    this.write(header(name, size));
  }
  private pad(size: number): void {
    const rest = size % BLOCK;
    if (rest) this.write(Buffer.alloc(BLOCK - rest));
  }

  entry(name: string, data: Uint8Array): void {
    this.begin(name, data.length);
    this.write(data);
    this.pad(data.length);
  }

  /** Copies exactly `bytes` bytes from an open source and returns their SHA-256. */
  async file(name: string, source: FileHandle, bytes: number): Promise<string> {
    this.begin(name, bytes);
    const digest = createHash("sha256");
    const buffer = Buffer.allocUnsafe(Math.min(COPY_BUFFER, Math.max(bytes, 1)));
    let copied = 0;
    while (copied < bytes) {
      const { bytesRead } = await source.read(buffer, 0, Math.min(buffer.length, bytes - copied), copied);
      if (bytesRead === 0) throw new Error("Workspace file changed during export; retry when writes finish");
      const slice = buffer.subarray(0, bytesRead);
      digest.update(slice);
      this.write(slice);
      copied += bytesRead;
    }
    if ((await source.read(buffer, 0, 1, copied)).bytesRead !== 0) throw new Error("Workspace file changed during export; retry when writes finish");
    this.pad(bytes);
    return digest.digest("hex");
  }

  /** Writes rows as chunked NDJSON entries and returns the row count. */
  writeRows(table: string, rows: Iterable<PortableRecord>): number {
    let columns: string[] | null = null;
    let lines: string[] = [];
    let bytes = 0;
    let total = 0;
    const flush = () => {
      if (!columns || lines.length === 0) return;
      const data = Buffer.from(`${JSON.stringify({ table, columns })}\n${lines.join("\n")}\n`);
      if (data.length > MAX_CHUNK_BYTES) throw new Error(`A portable ${table} row exceeds the 64 MiB chunk limit`);
      const entry = `rows/${this.chunkCount++}`;
      this.entry(entry, data);
      this.rows.push({ entry, table, rows: lines.length, bytes: data.length, sha256: sha256(data) });
      lines = []; bytes = 0;
    };
    for (const row of rows) {
      const keys = Object.keys(row);
      if (!columns || keys.length !== columns.length || keys.some((key, index) => key !== columns![index])) { flush(); columns = keys; }
      const line = JSON.stringify(keys.map((key) => {
        const value = row[key];
        if (value !== null && typeof value !== "string" && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(`Portable ${table}.${key} holds an unsupported value`);
        return value;
      }));
      if (lines.length && (lines.length >= CHUNK_ROWS || bytes + line.length > CHUNK_BYTES)) flush();
      lines.push(line); bytes += line.length + 1; total++;
    }
    flush();
    return total;
  }

  finish(manifest: string): void {
    if (Buffer.byteLength(manifest) > MAX_MANIFEST_BYTES) throw new Error("This workspace exceeds the portable package size limit");
    this.entry("manifest.json", Buffer.from(manifest));
    this.write(Buffer.alloc(BLOCK * 2));
    fs.fsyncSync(this.fd);
  }
  get size(): number { return this.offset; }
  /** Idempotent: closing a reused descriptor number would close an unrelated file. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    fs.closeSync(this.fd);
  }
}

function octal(block: Buffer, start: number, length: number): number {
  const text = block.toString("ascii", start, start + length).replace(/[\0 ]+$/u, "").replace(/^[\0 ]+/u, "");
  if (!/^[0-7]*$/.test(text)) throw new Error("Portable archive header is damaged");
  return text ? parseInt(text, 8) : 0;
}

/** Random-access view over an uncompressed ustar package; only headers are read up front. */
export class PortableArchiveReader {
  private closed = false;
  private constructor(private readonly fd: number, readonly entries: Map<string, TarEntry>) {}

  static open(file: string): PortableArchiveReader {
    const fd = fs.openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile()) throw new Error("Choose a regular portable package");
      if (stat.size > MAX_ARCHIVE_BYTES) throw new Error("Portable package exceeds the size limit");
      const block = Buffer.alloc(BLOCK);
      const first = fs.readSync(fd, block, 0, BLOCK, 0);
      if (block[0] === 123 || block[0] === 91) throw new Error("Version 1 exports contain only incomplete metadata. Export the original workspace again with this version of Ralphy.");
      if (block[0] === 31 && block[1] === 139) throw new Error("Compressed portable packages are not supported");
      if (first < BLOCK || block.toString("ascii", 257, 262) !== "ustar") throw new Error("Choose an uncompressed Ralphy workspace archive");
      const entries = new Map<string, TarEntry>();
      let offset = 0;
      while (offset + BLOCK <= stat.size) {
        if (fs.readSync(fd, block, 0, BLOCK, offset) !== BLOCK) throw new Error("Portable archive is truncated");
        if (block.every((byte) => byte === 0)) break;
        let sum = 0;
        for (let index = 0; index < BLOCK; index++) sum += index >= 148 && index < 156 ? 32 : block[index];
        if (octal(block, 148, 8) !== sum) throw new Error("Portable archive header is damaged");
        const type = block[156];
        if (type !== 48 && type !== 0) throw new Error("Portable package contains unexpected entries");
        const name = block.toString("utf8", 0, 100).replace(/\0.*$/su, "");
        const prefix = block.toString("utf8", 345, 500).replace(/\0.*$/su, "");
        const full = prefix ? `${prefix}/${name}` : name;
        const size = octal(block, 124, 12);
        const data = offset + BLOCK;
        if (!full || entries.has(full) || data + size > stat.size) throw new Error("Portable package contains unexpected files");
        entries.set(full, { offset: data, size });
        offset = data + Math.ceil(size / BLOCK) * BLOCK;
      }
      return new PortableArchiveReader(fd, entries);
    } catch (error) {
      fs.closeSync(fd);
      throw error;
    }
  }

  size(name: string): number | null { return this.entries.get(name)?.size ?? null; }

  read(name: string): Buffer {
    const entry = this.entries.get(name);
    if (!entry) throw new Error(`Portable package entry is missing: ${name}`);
    const buffer = Buffer.allocUnsafe(entry.size);
    let read = 0;
    while (read < entry.size) {
      const count = fs.readSync(this.fd, buffer, read, entry.size - read, entry.offset + read);
      if (count === 0) throw new Error("Portable archive is truncated");
      read += count;
    }
    return buffer;
  }

  /** Reads one row chunk, verifies its manifest digest, and parses it into records. */
  readRows(chunk: PortableRowChunk): PortableRecord[] {
    const data = this.read(chunk.entry);
    if (data.length !== chunk.bytes || sha256(data) !== chunk.sha256) throw new Error(`Portable row chunk checksum does not match its manifest (${chunk.entry})`);
    const text = data.toString("utf8");
    if (!Buffer.from(text).equals(data) || !text.endsWith("\n")) throw new Error(`Portable row chunk is not valid UTF-8 NDJSON (${chunk.entry})`);
    const lines = text.slice(0, -1).split("\n");
    const head = JSON.parse(lines[0]) as { table?: unknown; columns?: unknown };
    const columns = head.columns;
    if (head.table !== chunk.table || !Array.isArray(columns) || columns.length === 0 || columns.some((column) => typeof column !== "string" || !/^[a-z][a-z0-9_]*$/.test(column))
      || new Set(columns).size !== columns.length) throw new Error(`Invalid portable ${chunk.table} chunk header`);
    if (lines.length - 1 !== chunk.rows) throw new Error(`Portable ${chunk.table} chunk row count does not match its manifest`);
    const rows: PortableRecord[] = new Array(chunk.rows);
    for (let index = 1; index < lines.length; index++) {
      const values = JSON.parse(lines[index]) as unknown;
      if (!Array.isArray(values) || values.length !== columns.length) throw new Error(`Invalid portable ${chunk.table} records`);
      const row: PortableRecord = {};
      for (let column = 0; column < columns.length; column++) {
        const value = values[column];
        if (value !== null && typeof value !== "string" && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(`Invalid portable ${chunk.table} records`);
        row[columns[column] as string] = value as string | number | null;
      }
      rows[index - 1] = row;
    }
    return rows;
  }

  /** Idempotent, for the same reason as the writer. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    fs.closeSync(this.fd);
  }
}

/** Streams a user-chosen file into a private store copy and hashes it, so later reads cannot observe a changing source. */
export async function copyPortableUpload(sourcePath: string, target: string): Promise<{ bytes: number; sha256: string }> {
  const source = await fs.promises.open(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await source.stat();
    if (!stat.isFile() || stat.size > MAX_ARCHIVE_BYTES) throw new Error("Choose a regular portable package of up to 1 GiB");
    const output = await fs.promises.open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const digest = createHash("sha256");
    let bytes = 0;
    try {
      const buffer = Buffer.allocUnsafe(COPY_BUFFER);
      for (;;) {
        const { bytesRead } = await source.read(buffer, 0, buffer.length, bytes);
        if (bytesRead === 0) break;
        const slice = buffer.subarray(0, bytesRead);
        digest.update(slice);
        await output.write(slice, 0, bytesRead, bytes);
        bytes += bytesRead;
        if (bytes > MAX_ARCHIVE_BYTES) throw new Error("Choose a regular portable package of up to 1 GiB");
      }
    } finally { await output.close(); }
    if (bytes !== stat.size) throw new Error("Portable package changed while it was being read");
    return { bytes, sha256: digest.digest("hex") };
  } finally { await source.close(); }
}
