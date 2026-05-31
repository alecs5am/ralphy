# Worked example: reference -> JSON prompt -> tweaks

A walkthrough of one full pass so the shape of the output is unambiguous.

## The reference (described)

A close-up product shot: a matte-black cold-brew can standing on a wet slate
slab, hard key light from camera-right throwing a long soft shadow camera-left,
shallow depth of field with a blurred warm-amber kitchen behind. The can wears
a single tracked uppercase wordmark `MIDNIGHT BREW` in white. No people.

## Analysis

A studio-leaning commercial product shot: one hard key source from the right,
shallow depth of field isolating the can against a warm out-of-focus interior,
and water droplets on both the can and the slate selling freshness. The whole
read is "premium DTC beverage", so the encoding leans on crisp label typography
(model pick: `gpt-5.4-image-2`) and accurate refraction on the droplets. No
people, so `materials.skin` and the full `environment` particle block are
dropped — only condensation matters.

## JSON Prompt

```json
{
  "prompt": {
    "scene": {
      "description": "A matte-black aluminium cold-brew can stands centred on a wet dark-slate slab, beaded with fresh condensation. A single hard key light rakes in from camera-right, throwing a long soft shadow to camera-left. Behind it, a warm amber kitchen melts into shallow bokeh. Dominant palette: charcoal #1B1B1F, warm amber #C8852F highlights, cool slate-grey #4A4E54. A crisp white tracked uppercase wordmark reads 'MIDNIGHT BREW' across the can's midline.",
      "subject": "Matte-black 355ml aluminium can, slight top-rim sheen, cold condensation droplets clustered on the lower third",
      "setting": "Dark slate kitchen counter, warm out-of-focus domestic interior behind",
      "action": "static — a single droplet mid-run down the can's side"
    },
    "style": {
      "primary": "commercial",
      "rendering_quality": "hyperrealistic",
      "surface_textures": "matte anodized aluminium, wet polished slate, soft glass bokeh",
      "lighting": "single hard key from camera-right ~45 degrees, ~5200K daylight, no fill — deep directional shadow camera-left"
    },
    "technical": {
      "camera": {
        "focal_length": "100mm macro",
        "aperture": "f/2.8",
        "depth_of_field": "shallow — can razor-sharp, background fully dissolved",
        "angle": "eye level, slight three-quarter"
      },
      "resolution": "ultra high definition",
      "rendering": "clean low-noise digital capture, smooth circular bokeh, subtle specular highlight roll-off"
    },
    "materials": {
      "surfaces": "anodized matte aluminium with micro-scuffs near the rim; wet slate with mirror-pool reflections in the low spots",
      "transparency": "physically accurate refraction inside each condensation droplet, true Fresnel falloff on the wet slate"
    },
    "composition": {
      "perspective": "single vanishing point, strong foreground-to-background depth separation",
      "framing": "centered with negative space top and right",
      "subject_placement": "can on the lower-centre third, shadow leading the eye to the left",
      "ui_elements": "'MIDNIGHT BREW' — white, condensed grotesque uppercase, heavy weight, wide tracking, centred on the can midline"
    },
    "quality": {
      "include": ["crisp legible label typography", "accurate droplet refraction", "true matte-metal microtexture", "natural single-source shadow", "clean creamy bokeh", "premium DTC beverage look", "no banding in the dark tones", "physically plausible wet-slate reflections"],
      "avoid": ["smudged or warped wordmark", "plastic-looking can", "double shadows from phantom fill lights", "over-saturated HDR halos", "AI-smooth waxy surfaces", "garbled label text", "floating shadow disconnected from the base"],
      "reference_standard": "premium beverage product photography in the vein of a Kinfolk / Monocle product feature"
    }
  }
}
```

## Tweaks

1. Swap to **f/8** and a 50mm to bring the kitchen back into legible context for a lifestyle variant.
2. Move the key to a **back-left rim light** for a moodier, higher-contrast hero.
3. Shift the palette amber -> **cool teal #1F6F78** for an iced / mint sub-flavour SKU.
