# Image models: quirks and prompts (observed 2026-05 to 2026-11)

Model names and limits change; `get_model_schema` is the truth. These are behaviours the schema does
not tell you.

- **Gemini 3 Pro Image ("nano banana pro")** added a small phone mockup in a corner of full-bleed
  images. Lead the prompt with: `CRITICAL: This is a FULL-BLEED image, NO phone device frame, NO
  mockup, NO screen bezel. The image IS the entire frame edge to edge.`
- **GPT image models** ignored a size written in the prompt and returned squares: set the aspect
  parameter from the schema.
- Text inside images: markdown emphasis (`**WORD**`) and layout words ("LEFT 35%") get drawn. Set text
  in the composition instead.
- **Identity drift.** Without the master image as a reference, a character drifted within a few
  generations. Pass the master every time; for two characters pass both.
- **Edits are re-renders.** Say "change ONLY X", edit from the approved master, never from an edit of
  an edit. Small fixes are cheaper as compositing (crop, matte, overlay).
- **Order for multi-shot work:** one wide location plate first (when shots share a place), character
  or product masters with the plate as reference, then shots one at a time with approval; batch only
  after two approved singles; image to video last.
- Some models wrote JPEG bytes under a `.png` name; check with ffprobe.
