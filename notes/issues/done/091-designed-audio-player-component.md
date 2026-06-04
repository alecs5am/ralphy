# Designed `<AudioPlayer>` component (replace the default `<audio>` element)

> **Status:** done — 2026-06-04 (AudioPlayer.tsx: hidden <audio> driven by ref, play/pause + drag-scrub seek + mm:ss + CSS-only waveform ticks + Space/arrow keyboard, role=slider a11y; AssetMedia music branch routed through it, native controls removed; no borders; next build green)
> **Filed:** 2026-06-04
> **Folder:** issues
> **Severity:** medium
> **Category:** landing / frontend / design-system

## Context

Music asset blocks render the browser-default `<audio controls>` element (the
Choose-Path Soundtrack + the music beds). It's inconsistent with the site design.

## What

A `<AudioPlayer>` component matching the library design (pure-black, single accent,
no borders): play/pause, a seek/progress bar, current/total time, optional
waveform-ish bar, the track name. Replaces the raw `<audio>` wherever a music asset
plays (the asset detail page, anywhere else audio appears).

## Why it matters

A designed player is on-brand and a better listening UX than the gray default
control; consistency with the rest of the component system (#086).

## Scope / acceptance

- `landing/app/library/_shared/AudioPlayer.tsx` (`"use client"`, drives a hidden
  `<audio>` via refs) styled to the tokens; play/pause + seek + time + name.
- `AssetMedia` (music branch) renders `<AudioPlayer>` instead of `<audio controls>`.
- Keyboard accessible (space play/pause, arrows seek); `bunx next build` green;
  no borders.

## Notes

- Depends on #087. Used by AssetMedia (music). Part of #086.
