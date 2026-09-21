# Explore Remocn and Kenney Design

## Goal

Make Explore a local creative library: Remocn visual components live under Visuals as copied MIT-licensed source references, and every Kenney Audio pack lives under Sounds as a browsable CC0 pack.

## Remocn

- Copy only component metadata, source files, and preview images; do not vendor the Remocn repository or add a runtime API dependency.
- Import the current Remocn registry in category-sized packs so the work and generated files stay reviewable.
- Each Explore entry records `Remocn`, the upstream URL, MIT, dependencies, the copied source files, and its original category.
- `Use in chat` sends the copied source and an explicit instruction to recreate the motion in HyperFrames HTML/CSS/GSAP. Remotion is reference input, not a runtime dependency.
- Store previews locally so browsing works without the Remocn site.

## Explore cards

- Visual cards use full-bleed media: no inherited Window inset between the image and the card edge.
- Identity and summary remain below the media and retain their own spacing.
- The behavior is scoped to Explore creative cards; other Window surfaces keep their existing inset.

## Kenney Sounds

- Import all ten packs listed in Kenney's Audio category, keeping only browser-playable audio plus license/source metadata.
- Every track is labeled with its pack and `Kenney · CC0` publisher/license identity.
- Sounds opens on a pack shelf. Selecting a pack shows its tracks; a back/all-packs action returns to the shelf. Existing waveform playback and sound-type filters continue to work inside a pack.

## Validation

- Catalog tests assert unique IDs, local previews/sources, Remocn attribution, all Kenney packs, and playable local audio.
- UI tests cover pack navigation, playback continuity, and full-bleed Explore cards.
- Run desktop typecheck, targeted tests, build, architecture audit, and style audit before completion.
