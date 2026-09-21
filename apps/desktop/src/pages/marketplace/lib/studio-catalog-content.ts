import type { StudioEntry } from "./studio-catalog";

const photo = (name: string) => ({ kind: "image" as const, url: `${import.meta.env.BASE_URL}explore/studio/${name}.png` });

export function studioFormats(): StudioEntry[] {
  return [
    {
      id: "product-reveal", name: "The 15-second reveal", summary: "A precise product story: detail, reveal, reason to care.", tags: ["product", "launch", "short-form", "9:16", "premium"], format: "9:16", duration: "15 sec", preview: photo("chrome-product"),
      steps: ["Macro hook", "Product reveal", "Benefit in use", "Closing frame"],
      body: "Inputs: one approved product image, its exact name and one verified benefit. Build a 1080×1920, 15-second film: 0–3s tight material detail; 3–7s reveal the complete product; 7–12s demonstrate the benefit; 12–15s hold a clear closing line. Use subtle camera motion rather than invented product features. Keep the bottom 20% free of essential text. Add a restrained sound bed, export H.264 with AAC, check the first frame and caption safe area, and save as a new Unit revision.",
    },
    {
      id: "found-footage", name: "Found footage", summary: "An ordinary place becomes unsettling in three cuts.", tags: ["horror", "story", "vhs", "9:16", "suspense"], format: "9:16", duration: "20 sec", preview: photo("horror-corridor"),
      steps: ["Establish normal", "Reveal anomaly", "Hold the tension", "Cut to silence"],
      body: "Inputs: a location, a fictional anomaly and a final line. Make a 20-second vertical horror scene: 0–6s quiet establishing shot, 6–13s the same location with one subtle change, 13–18s linger on the anomaly, 18–20s cut to black. Keep the anomaly readable before adding VHS texture. Build tension with room tone and one distant impact, not continuous loud music. Deliver a clean master and a VHS-treated revision; retain the original footage and verify the final black frame.",
    },
    {
      id: "editorial-profile", name: "One person, one story", summary: "A portrait, three details, a memorable final quote.", tags: ["portrait", "editorial", "interview", "4:5", "human"], format: "4:5", duration: "30 sec", preview: photo("editorial-portrait"),
      steps: ["Portrait opener", "Three details", "Quote", "Name card"],
      body: "Inputs: an approved portrait, a short factual biography and an exact quote. Make a 30-second 1080×1350 profile: 0–5s portrait and name; 5–20s three visual details with one fact each; 20–27s the quote; 27–30s final portrait. Use source facts only. Give every text card at least three seconds of readable screen time. Add captions for narration, normalize the mix, export a clean master and captioned version, then save both to the project.",
    },
    {
      id: "travel-postcard", name: "A place in six shots", summary: "A widescreen travel postcard with an intentional rhythm.", tags: ["travel", "cinematic", "youtube", "16:9", "landscape"], format: "16:9", duration: "24 sec", preview: photo("mountain-story"),
      steps: ["Wide", "Texture", "Human scale", "Movement", "Detail", "Return wide"],
      body: "Inputs: one destination and six licensed or user-owned shots. Assemble a 1920×1080, 24-second postcard with six four-second shots: wide, texture, human scale, movement, detail, final wide. Maintain geographic continuity and a consistent time of day. Use natural ambience beneath a gentle bed and simple cuts. Put the place name on the final frame only. Check horizon alignment and audio transitions, export H.264, and save the timeline and final video together.",
    },
    {
      id: "fashion-drop", name: "After-hours drop", summary: "A fashion launch built from poses, texture and one date.", tags: ["fashion", "campaign", "reels", "9:16", "night"], format: "9:16", duration: "12 sec", preview: photo("fashion-editorial"),
      steps: ["Silhouette", "Fabric detail", "Full look", "Drop date"],
      body: "Inputs: three approved outfit images, collection name and exact release date. Build a 12-second vertical launch: silhouette for two seconds, fabric detail for three, full look for four, date card for three. Preserve clothing construction and branding. Use an original percussion loop; synchronize cuts to clear beats, not every waveform transient. Keep type concise and avoid covering the garment. Export a silent preview and a mixed master as separate revisions.",
    },
    {
      id: "carousel-explainer", name: "The visual explainer", summary: "A six-slide lesson with one idea per frame.", tags: ["carousel", "education", "botanical", "4:5", "instagram"], format: "4:5", duration: "6 slides", preview: photo("botanical-study"),
      steps: ["Question", "Context", "Three lessons", "Takeaway"],
      body: "Inputs: a topic, three sourced facts and one takeaway. Create six 1080×1350 slides: a clear question, context, one slide for each of three lessons, and a takeaway. Limit each slide to one headline and two short sentences. Use one consistent visual system and actual source citations in the caption. Export six numbered PNGs and a combined review sheet; verify reading order, contrast and crop safe areas before saving the carousel Unit.",
    },
    {
      id: "game-teaser", name: "The playable world", summary: "A game-world teaser that sells atmosphere before mechanics.", tags: ["gaming", "teaser", "retro", "16:9", "action"], format: "16:9", duration: "18 sec", preview: photo("desert-racer"),
      steps: ["World", "Action", "Detail", "Title"],
      body: "Inputs: a fictional game concept, one environment and one action. Make an 18-second 1920×1080 teaser: five seconds of world, six of readable action, four of a strong detail and three of title. If using a retro treatment, apply it consistently after assembling the clean shots. Do not imply actual gameplay if footage is concept art; label the deliverable as a concept teaser. Use an original impact or engine-like synthetic sound, check rapid flashes, and save the clean and styled versions.",
    },
    {
      id: "night-city-loop", name: "City after midnight", summary: "A seamless urban loop for a music release or ambient post.", tags: ["loop", "music", "city", "1:1", "ambient"], format: "1:1", duration: "8 sec", preview: photo("night-city"),
      steps: ["Choose the frame", "Add local motion", "Match the loop", "Export"],
      body: "Inputs: one night-city image and a short original or licensed audio loop. Build an eight-second square composition with motion isolated to reflections, light or passing silhouettes. Keep buildings and text stable. Match first and last frames with a short crossfade only if the motion permits it, and remove clicks at the audio boundary. Review three consecutive loops at actual size, export 1080×1080 H.264, and save the clean source plus final loop as a new revision.",
    },
  ];
}

export function studioPrompts(): StudioEntry[] {
  return [
    ["human-editorial", "The unposed portrait", "An intimate portrait with natural skin and quiet daylight.", "editorial-portrait", ["portrait", "editorial", "natural-light", "photo"], "Create an editorial portrait of [subject] in [setting]. Soft window light from the left, realistic skin texture, relaxed posture and direct eye contact. A restrained charcoal, cream and muted earth palette. Medium-format photographic detail, shoulder-level camera and shallow depth of field. Preserve the supplied person's identity when a reference is attached. No text, no beauty retouching, no invented logos."],
    ["liminal-tension", "Something at the end", "A horror setting where the unsettling detail stays subtle.", "horror-corridor", ["horror", "liminal", "cinematic", "environment"], "A deserted [location] at night, viewed at human eye level. One distant light and a barely visible, ambiguous shape at the far end. Worn practical materials, deep but readable shadows, restrained cold green lighting, natural film grain. Build tension through empty space and perspective, not gore or a monster close-up. No lettering, no watermark. Leave room near the top for a short title added later."],
    ["chrome-still-life", "Liquid precision", "A sculptural product study with controlled reflections.", "chrome-product", ["product", "chrome", "studio", "advertising"], "A studio still life of [product] on a dark stone plinth, polished chrome surfaces catching a broad softbox reflection. One narrow edge light, crisp silhouette, deep neutral background and realistic material transitions. The object occupies the middle third with negative space around it. Preserve the reference product's geometry and markings. No extra accessories, no floating parts, no added typography."],
    ["rain-city", "Neon, after rain", "A cinematic street scene built around reflected light.", "night-city", ["city", "night", "cinematic", "rain"], "A night street in [city], moments after rain. Warm storefront light reflected in wet asphalt, a single distant pedestrian, layered depth and calm cinematic framing. Realistic architecture with no readable brand signs. Use warm amber and restrained teal rather than saturated neon everywhere. Eye-level 35 mm photographic perspective, subtle atmospheric haze, no added text."],
    ["retro-racer", "Desert checkpoint", "A vivid game-world concept with a readable central action.", "desert-racer", ["game-art", "desert", "action", "retro"], "A fictional rally car crossing a desert checkpoint at late afternoon, with dust trailing behind it and distant rock formations defining scale. Readable three-quarter vehicle silhouette, low camera angle, long shadows, orange sand against pale blue sky. Stylized but physically coherent concept art; clear large shapes suitable for a later pixel-dither treatment. No existing game branding, no UI, no lettering."],
    ["botanical-plate", "The living specimen", "A tactile botanical study for an educational series.", "botanical-study", ["botanical", "macro", "education", "organic"], "A close botanical study of [plant], arranged like an archival specimen on warm off-white paper. Show the leaf veins, stem junctions and subtle natural imperfections with precise photographic detail. Soft overhead daylight, delicate contact shadows and a balanced asymmetrical composition. Preserve botanical plausibility. No labels or scientific names rendered in the image; those will be added as editable text."],
    ["wide-escape", "A sense of scale", "A mountain landscape with one small human reference.", "mountain-story", ["landscape", "travel", "mountains", "16:9"], "A wide cinematic mountain landscape at first light: layered ridgelines, a winding trail and one tiny hiker for scale. Cool shadow detail, warm light on the peaks, natural aerial perspective and no exaggerated HDR. Compose a clear foreground, middle distance and horizon. 16:9 framing, believable terrain and weather. No lettering, no watermarks, no recognizable commercial equipment branding."],
    ["late-fashion", "After-hours editorial", "A fashion image with tactile fabric and a strong silhouette.", "fashion-editorial", ["fashion", "editorial", "night", "campaign"], "An editorial fashion photograph of [look] in a quiet concrete interior after sunset. One hard practical light creates a long graphic shadow while gentle fill preserves fabric detail. Full silhouette visible, deliberate natural pose, accurate hands and garment structure. Muted burgundy, charcoal and cream palette. If a garment reference is provided, retain cut and construction. No text, no logos added, no extra accessories."],
  ].map(([id, name, summary, image, tags, body]) => ({
    id: id as string, name: name as string, summary: summary as string, tags: tags as string[],
    body: body as string, artifact: body as string, preview: photo(image as string), format: "Image prompt",
  }));
}
