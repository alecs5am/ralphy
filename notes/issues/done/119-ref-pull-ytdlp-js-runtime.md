# `ref pull` fails on YouTube with yt-dlp 403 "no JS runtime" — pass `--js-runtimes node` by default

> **Status:** done — 2026-06-14

**Found:** 2026-06-11, dianatolks-celebdecode wave 2 (viral source-clip pulls for projects 007–009). Recurrence — the same failure and workaround are already captured in agent memory (`ytdlp-js-runtime-node`) from an earlier session; the CLI still doesn't apply the fix.

## Symptom

```
ralphy ref pull <youtube-url>
# yt-dlp: ERROR 403 ... no JS runtime available
```

YouTube now requires a JS runtime for signature deciphering. Raw yt-dlp works when given the flag:

```bash
yt-dlp --js-runtimes node <url>   # succeeds
ralphy ref pull --local <file>    # then re-imported by hand
```

The two-step manual dance also loses provenance — the ref's recorded source becomes the local file, not the URL.

## Expected

`ralphy ref pull <youtube-url>` succeeds wherever raw `yt-dlp --js-runtimes node` does.

## Likely location

The yt-dlp wrapper in `cli/lib/` (the spawn that builds the yt-dlp arg list). Node is a hard prerequisite of the repo, so passing `--js-runtimes node` unconditionally is safe.

## Acceptance

- `ralphy ref pull <youtube-url>` downloads without the manual fallback on a URL that previously returned the 403.
- The flag is visible in the spawned command (unit test on the arg-list builder).
- Provenance records the original URL.
