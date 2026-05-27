# 06 — Utilities — Open Questions & Decisions

## Open questions

### Q-01: Face tracker for smart-crop — bundled or external?
**Context:** smart-crop needs face detection. Options range from "pure ffmpeg + saliency" to "tiny face model bundled".
**Options:**
- A. ffmpeg-only — `cropdetect` + saliency. Worst quality, zero dependencies.
- B. Bundle `dlib` or `mediapipe` via a small subprocess. Better quality, native binary dependency.
- C. WASM face-api.js called from Bun. Portable, slow.
- D. Optional: detect at install time and pick the best available; fall back gracefully.
**Blocking:** `06.02.01`.
**Owner:** user. Default lean: D.

### Q-02: whisper.cpp model size for default local install
**Context:** `large-v3-turbo` is fast and accurate (~1GB). `medium.en` is smaller (~1.5GB English only). `tiny` is tiny but bad.
**Options:**
- A. `large-v3-turbo` default — best quality, biggest download.
- B. `medium.en` default — English-only, hurts non-English creators.
- C. Multi-language `large-v3-turbo`; expose `--model` for users on a budget.
**Blocking:** `06.03.02`.
**Owner:** user.

### Q-03: ffmpeg version floor
**Context:** which ffmpeg version do we require? Newer (7.x) has better filters; older (6.x, 5.x) is more widely available.
**Options:**
- A. 7.0+ — pin to current. Cleanest filter syntax.
- B. 6.0+ — wider coverage, some recipes use older filter names.
- C. Auto-detect; warn but don't fail.
**Blocking:** `06.01.05`.
**Owner:** user. Default lean: A.

### Q-04: Local model storage location — XDG or `~/.ralphy/`?
**Context:** local models can be 1-5 GB. Where do they live?
**Options:**
- A. `~/.ralphy/local-models/` — consistent with secrets dir, predictable.
- B. `$XDG_CACHE_HOME/ralphy/models/` — follows XDG, harder on macOS.
- C. Workspace-scoped (`workspace/.ralph/models/`) — encapsulated but downloaded per workspace.
**Blocking:** `06.05.01`.
**Owner:** user. Default lean: A.

### Q-05: Should `ralphy video frame` write to disk or stdout?
**Context:** for agent workflows, returning bytes to stdout is convenient. For humans, a path is easier.
**Options:**
- A. Disk by default; `--stdout` flag for base64-encoded bytes.
- B. Stdout by default; agent friendly. Humans pipe to file.
- C. Smart: if `--output` set → disk; else stdout.
**Blocking:** `06.04.03`.
**Owner:** user.

---

## Decision log

*(empty — fill as questions resolve)*
