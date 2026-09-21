# Explore sample previews

These first-party synthetic samples demonstrate selected public-library recipes.
They are labeled **Sample preview** in the app, not attributed to a publisher.

Rebuild from the desktop package:

```sh
python3 scripts/generate-explore-previews.py
```

The generator uses FFmpeg and the bundled Manrope font. It has no network access,
paid generation, downloaded photography, user media, or third-party speech model.
The source is an original procedural sphere and typography study; the audio is an
original harmonic vowel study, not a recording or impersonation of a person.

Visual samples are three-second muted loops at 640 x 480, with WebP posters.
VHS, chroma, film grain, noir and radio use the catalog's default filter values.
The dither sample supplies a 16-color palette for the recipe's required palette
pass. CRT reproduces the documented scanline and RGB-stripe settings as a baked
filter. They illustrate these settings, not every possible input or variation.

`source.mp4` / `voice-source.mp3` are the corresponding before states. No catalog
item without an exact identifier mapping receives one of these previews.
