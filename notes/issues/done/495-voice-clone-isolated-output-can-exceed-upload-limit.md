# Voice Clone Should Compress Isolated Audio Below ElevenLabs Upload Limit

> **Status:** done — 2026-07-09 (added `compressVoiceSample` ffmpeg recipe; `cloneVoice` derives a ≤90s mono 64k MP3 sample when the upload would exceed the 11 MB `voices/add` limit, logged in the gen-log)

## Problem

`ralphy voice clone --isolate` can fail after a successful audio-isolation pass because the isolated file is larger than the ElevenLabs `voices/add` upload limit.

Observed while cloning a user-provided MP3 sample for `cocacola-001`:

- Source MP3: about 3.4 MB, 422 seconds.
- `/audio-isolation` succeeded.
- `voices/add` failed with `upload_file_size_exceeded`, maximum 11 MB.

The user-facing command did the expensive isolation step and then failed at the add step. The agent had to manually create a shorter mono sample before retrying.

## Expected Behavior

`ralphy voice clone --isolate` should ensure the file submitted to `voices/add` is under the provider upload limit.

## Suggested Fix

After audio isolation, inspect the isolated output size. If it is over the upload limit, re-encode or trim to a safe voice-clone sample before calling `voices/add`.

Minimal behavior is enough:

- keep 30-120 seconds of speech;
- mono MP3;
- bitrate low enough to stay under 11 MB;
- log the derived sample path in the generation log.

## Check

Add a unit test around the clone path that mocks an oversized isolated output and asserts the add step receives the compressed/trimmed file, not the oversized isolated file.
