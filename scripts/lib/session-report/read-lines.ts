// scripts/lib/session-report/read-lines.ts — #562
//
// Streaming JSONL reader. Transcripts reach hundreds of megabytes and single
// lines can carry multi-megabyte base64 screenshots, so files are never loaded
// whole: chunks are scanned for newlines and only one line is decoded at a time.

import fs from "node:fs";

const NEWLINE = 0x0a;

export async function* readLines(file: string): AsyncGenerator<string> {
  const stream = fs.createReadStream(file, { highWaterMark: 1 << 20 });
  let pending: Buffer[] = [];
  let pendingBytes = 0;
  for await (const raw of stream) {
    const chunk = raw as Buffer;
    let start = 0;
    let idx = chunk.indexOf(NEWLINE, start);
    while (idx !== -1) {
      const piece = chunk.subarray(start, idx);
      if (pendingBytes > 0) {
        pending.push(piece);
        yield Buffer.concat(pending, pendingBytes + piece.length).toString("utf8");
        pending = [];
        pendingBytes = 0;
      } else {
        yield piece.toString("utf8");
      }
      start = idx + 1;
      idx = chunk.indexOf(NEWLINE, start);
    }
    if (start < chunk.length) {
      const rest = chunk.subarray(start);
      pending.push(Buffer.from(rest));
      pendingBytes += rest.length;
    }
  }
  if (pendingBytes > 0) yield Buffer.concat(pending, pendingBytes).toString("utf8");
}

/** Parse each non-empty line as JSON; unparseable lines are reported through `onBad`. */
export async function* readRecords(file: string, onBad: () => void): AsyncGenerator<unknown> {
  for await (const line of readLines(file)) {
    if (line.length === 0 || line.trim().length === 0) continue;
    try {
      yield JSON.parse(line);
    } catch {
      onBad();
    }
  }
}
