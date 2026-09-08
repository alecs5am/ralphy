# Ralphy cowboy ghost — refined batch

Generated on 2026-08-27 as six independent, one-pass draws after selecting the original C2 as the closest direction.

## Generation route

- Provider: OpenAI built-in `image_gen`
- Runtime model identifier: not exposed by the tool
- Constraint delivery: main-prompt constraints
- Canvas requested: full-bleed 1:1, approximately 1536 × 1536
- Native canvas returned: 1254 × 1254 PNG
- Image 1: `ip-as-logo-wall.webp`, visual-style reference only
- Image 2: original `C2-artifact-catcher-lower-right.png`, composition and personality reference only
- No candidate was retried, edited, ranked, filtered, or post-processed

Exact shared constraint text:

> Use no text or watermark. Do not reproduce a grid, contact sheet, rounded tile, border, frame, card, or presentation mask from Image 1. Include one character only, with no extra subjects, props, scenery, or interface. Avoid an oversized hat, an oversized face, or a character that fills nearly the entire square. Use no fragile lines, sharp tips, unnecessary outlines, tiny decorative marks, photorealistic material, dramatic bevel, glossy hotspot, deep occlusion, extrusion, strong three-dimensional rendering, or external cast shadow. Keep the background solid and uniform, with no texture, vignette, or lighting variation.

The Pocket Sheriff prompts additionally excluded oversized arms and fingers.

## Candidates

| Label | Direction and rationale | Prompt silhouette treatment | Corner | Character colors | Background | File |
|---|---|---|---|---|---|---|
| A1 | Peeking Ghost — a warm, clever and quietly helpful assistant | Rounded ghost head-and-body peeking from the edge; tiny expressive face; small hat around one quarter of character height | Lower-left | Warm ivory `#F5F0DE`; near-black plum `#241C24` for hat and face | Muted terracotta `#C86E52` | `A1-peeking-ghost-lower-left.png` |
| A2 | Peeking Ghost — a warm, clever and quietly helpful assistant | Rounded ghost head-and-body peeking from the edge; tiny expressive face; small hat around one quarter of character height | Lower-right | Warm cream `#FFF0D5`; Ralphy orange `#FFA630` for hat and face | Muted slate blue `#4C5D8F` | `A2-peeking-ghost-lower-right.png` |
| B1 | Pocket Sheriff — capable and upbeat media organizer | Compact rounded body; two short paired arms; tiny face; modest hat around one fifth of character height | Lower-left | Medium blue `#1677D2`; near-black ink `#1D1B20` for hat and face | Warm cream `#F1E7D8` | `B1-pocket-sheriff-lower-left.png` |
| B2 | Pocket Sheriff — capable and upbeat media organizer | Compact rounded body; two short paired arms; tiny face; modest hat around one fifth of character height | Lower-right | Ralphy orange `#FFA630`; deep plum `#38253D` for hat and face | Muted yellow-green `#C8D88A` | `B2-pocket-sheriff-lower-right.png` |
| C1 | C2 Soft — quietly confident, slightly mischievous and competent | Broad asymmetric bust; rounded cheek-and-shoulder lobe; hat reduced by roughly 35–40%; compact face | Lower-left | Warm coral `#FF7664`; near-black ink `#16161A` for hat and face | Muted periwinkle `#7A7FA8` | `C1-c2-soft-lower-left.png` |
| C2 | C2 Soft — quietly confident, slightly mischievous and competent | Broad asymmetric bust; rounded cheek-and-shoulder lobe; hat reduced by roughly 35–40%; compact face | Lower-right | Warm off-white `#F5F5F4`; deep purple `#3D2A78` for hat and face | Muted deep blue `#34425E` | `C2-c2-soft-lower-right.png` |

## Shared prompt behavior

Every prompt requested one upright cowboy ghost using 4–7 large shapes, exactly two character color families plus one solid background color, tiny close-set eyes and a tiny mouth, a 70–82% lower-corner composition with visible breathing room, and flat-first styling with only barely perceptible neo-skeuomorphic depth.
