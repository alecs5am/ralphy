# Bundle ffmpeg instead of requiring host install

> **Status:** idea
> **Filed:** 2026-05-20
> **Folder:** ideas

## Context

Surfaced during the docs rewrite (2026-05-20). The quickstart's install page tells the user:

> Ralphy needs two host-side tools the binary doesn't ship: `bun` (the JS runtime ralphy uses for Remotion rendering) and `ffmpeg` (encode and trim). Install them with `brew install bun ffmpeg` on macOS or your distro's package manager on Linux. `ralphy doctor` will tell you if either is missing.

That's friction. Two extra `brew install` lines is enough to lose a creator who isn't already a CLI user. `bun` is hard to avoid — Ralphy is literally a bun-based CLI — but `ffmpeg` is just a binary we shell out to from 5 call sites (`cli/commands/render.ts`, `cli/lib/ffmpeg-recipes.ts`, `cli/lib/eval/keyframes.ts`, `cli/lib/research.ts`, `cli/commands/doctor.ts`).

## What

Ship ffmpeg as a runtime dependency via one of the static-binary npm packages, so the user never has to `brew install ffmpeg`:

- **`ffmpeg-static`** — most popular. Ships statically-linked builds for darwin-arm64, darwin-x64, linux-x64, linux-arm64, linux-ia32, win32-x64, win32-ia32, freebsd-x64. Exports a path string to the bundled binary. ~80 MB install footprint.
- **`@ffmpeg-installer/ffmpeg`** — older alternative. Same idea, slightly different platform matrix.
- **`ffmpeg.wasm`** — pure WASM build. Cross-platform with zero native deps, but ~2-5x slower for encode-heavy work (Remotion final render). Probably too slow for our perf targets (≤8 min cold-start).

The work:

1. Add `ffmpeg-static` as a dependency in `package.json`.
2. Add a single `cli/lib/ffmpeg-path.ts` helper that exports the resolved binary path — prefer host `ffmpeg` on PATH (for power users who want a newer build), fall back to the bundled one. The override env var would be `RALPHY_FFMPEG_PATH=/usr/local/bin/ffmpeg-7.1`.
3. Sweep all 5 call sites to use the helper instead of the literal `"ffmpeg"` string.
4. Update `ralphy doctor`: instead of failing when host ffmpeg is missing, report "using bundled ffmpeg (X.Y.Z) — host ffmpeg not found" as info-level.
5. Update the quickstart install page to drop the `brew install ffmpeg` line.

## Why it matters

- **Install friction.** Two host-side tools is one too many. Halving the prereqs roughly doubles the conversion from "saw the install page" to "ran first command."
- **Reproducibility.** Bundled ffmpeg means every Ralphy install on every machine produces the same encode output. Host ffmpeg drifts (Homebrew updates, distro lag, Apple Silicon vs Intel x264 differences). The bundled-version-per-Ralphy-release is a known artefact for postmortems.
- **CI / sandbox.** Headless environments (GitHub Actions, Docker images) don't need to `apt-get install ffmpeg` separately — install ralphy, get ffmpeg.

## Notes

- **Footprint.** `ffmpeg-static` adds ~80 MB to `node_modules`. For a homebrew tap or npm global install that's a real but acceptable cost. Document it in install page.
- **Codec coverage.** The static builds ship with the standard codec set (libx264, libx265, libvpx, libopus, libvorbis, libfdk-aac in some builds). Check that `loudnorm` filter (EBU R128) is compiled in — `ralphy render --loudnorm` depends on it.
- **Version pinning.** Pin a specific `ffmpeg-static` version in `package.json`. Surprise ffmpeg upgrades have broken render pipelines before.
- **Host override.** Keep the env-var override (`RALPHY_FFMPEG_PATH`) for power users who want hardware-accelerated builds (NVENC, VideoToolbox) the static binary doesn't include.
- **bun.** Parallel idea: can we ship a tiny bun runtime via the install script? Probably not worth it — bun's whole pitch is "install bun once, use everywhere," and the bun binary is 90+ MB on its own. Leave bun as a real prereq, bundle just ffmpeg.
- **Companion: yt-dlp.** Same shape applies — `cli/lib/yt-dlp-runner.ts` shells out to host `yt-dlp`. There's `youtube-dl-exec` on npm that wraps yt-dlp. Out of scope for this idea but worth a sibling note (`notes/ideas/002-yt-dlp-bundled.md`?) once this one matures.

When promoting: probably lands under a new "Distribution & UX" sub-section in `roadmap/09-distribution-and-release/PRD.md`, or under `roadmap/06-utilities/PRD.md` if we want to keep release-flow separate from runtime-shim concerns.
