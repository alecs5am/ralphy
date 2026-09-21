import type { StudioEntry } from "./studio-catalog";
import { effectStudio } from "./effect-settings";

const asset = (name: string) => `${import.meta.env.BASE_URL}explore/studio/${name}`;
const sample = (name: string) => `${import.meta.env.BASE_URL}explore/${name}`;

export function studioEffects(): StudioEntry[] {
  const visual = [
    ["vhs-overlay", "The midnight tape", "Tracking noise and faded color turn a corridor into found footage.", ["horror", "vhs", "video", "analog"], "eq=saturation=0.7:contrast=1.08,noise=alls=16:allf=t+u", "Apply a restrained analog texture to a clean clip. Preserve enough detail to read the location; keep any tracking disruption away from essential captions."],
    ["chroma-split", "Neon fracture", "Color separation makes night reflections feel electrically unstable.", ["night", "chroma", "glitch", "video"], "rgbashift=rh=5:bh=-5", "Separate red and blue channels in opposite directions. Begin at five pixels at preview resolution and scale with output resolution; keep faces and text readable."],
    ["film-grain", "Grain after dark", "A fine moving texture gives fashion footage a tactile finish.", ["fashion", "grain", "editorial", "video"], "noise=alls=12:allf=t+u", "Add a subtle temporally varying grain pass to the clean master. Start with amount 12, inspect shadows and faces at 100%, then lower it if compression turns grain into blocks."],
    ["noir-grade", "Silver-screen portrait", "Deep blacks and shaped midtones create a classic monochrome portrait.", ["portrait", "noir", "monochrome", "image"], "hue=s=0,eq=contrast=1.18:brightness=-0.02", "Desaturate and gently raise contrast while retaining eye and skin detail. Adjust exposure before contrast; inspect the darkest region so it does not crush to black."],
    ["voxel-dither", "Low-res wasteland", "A rally scene becomes a chunky, limited-color game world.", ["gaming", "pixel", "dither", "retro"], "[0:v]scale=160:-2:flags=area,split[a][b];[a]palettegen=max_colors=16[p];[b][p]paletteuse=dither=bayer:bayer_scale=3,scale=iw*6:ih*6:flags=neighbor", "Downsample to a deliberately small frame, generate a 16-color palette and apply ordered Bayer dithering, then upscale with nearest-neighbor filtering. Pixel size in this preview controls downsampling. For the final output, preserve the requested aspect ratio and exact dimensions instead of blindly multiplying by six."],
    ["crt-scanlines", "Signal from the lab", "Fine scanlines and display glow give a product image a monitor texture.", ["crt", "scanlines", "retro", "product"], "drawgrid=w=iw:h=3:t=1:c=black@0.24,eq=saturation=1.15", "Bake horizontal scanlines at final output resolution, with subtle color gain. Use a three-pixel line period for the initial test and preview at actual display size; reduce opacity if the product silhouette loses clarity."],
  ] as const;
  return [
    ...visual.map(([id, name, summary, tags, artifact, body]): StudioEntry => {
      const effect = effectStudio(id)!;
      return { id, name, summary, tags: [...tags], body: `${body} The interactive preview is a browser interpretation; render a short test on the target media before applying the final filter. Save the result as a new revision and keep the original.`, artifact, effectId: id, settings: effect.defaultSettings,
        preview: { kind: "image", url: effect.sourceUrl, before: { kind: "image", url: effect.sourceUrl } } };
    }),
    {
      id: "old-radio-ps1-vo", name: "Old radio / PS1 voice", summary: "Narrow bandwidth and low-resolution texture for a distant broadcast.", tags: ["audio", "voice", "radio", "horror", "retro"],
      body: "Compare the original harmonic voice study with the processed version. The treatment removes bass and high treble, then applies low-resolution sample texture. On real speech, first retain a clean recording, apply the filter below, level-match the two versions and check consonant intelligibility. Export a new audio revision. This sample is an original synthetic vowel study, not a person's voice.",
      artifact: "highpass=300,lowpass=3100,acrusher=bits=10:mode=log,acompressor=threshold=-20dB:ratio=4,volume=5dB", settings: { lowCutHz: 300, highCutHz: 3100, bitDepth: 10, compressionRatio: 4 },
      preview: { kind: "audio", url: sample("old-radio-ps1-vo.mp3"), before: { kind: "audio", url: sample("voice-source.mp3") } },
    },
    {
      id: "ghost-intercom", name: "Ghost in the intercom", summary: "A thin metallic echo makes a voice feel trapped inside an empty room.", tags: ["audio", "voice", "horror", "intercom", "echo"],
      body: "Compare the original harmonic voice study with a band-limited, short metallic echo. Apply the filter to a duplicate recording; do not change the source timing. Keep the delayed copy quieter than the direct signal and check that speech remains intelligible. Level-match before comparing, trim the final echo tail deliberately, and save a new audio revision. The preview contains synthetic vowels rather than human speech.",
      artifact: "highpass=f=550,lowpass=f=2400,aecho=0.8:0.65:41|83:0.28|0.16,alimiter=limit=0.8", settings: { lowCutHz: 550, highCutHz: 2400, delayMs: 41, echoMix: 0.28 },
      preview: { kind: "audio", url: asset("ghost-intercom.wav"), before: { kind: "audio", url: sample("voice-source.mp3") } },
    },
  ];
}

export function studioSounds(): StudioEntry[] {
  return [
    ["pulse", "Midnight pulse", "A restrained electronic beat for a short product or city edit.", ["electronic", "pulse", "night", "loop", "120-bpm"], "8 sec"],
    ["air", "Air between mountains", "A slowly opening pad with a soft, airy texture.", ["ambient", "landscape", "calm", "bed"], "8 sec"],
    ["signal", "Transmission received", "Three clean electronic notes for a reveal or UI moment.", ["signal", "interface", "reveal", "sfx"], "3 sec"],
    ["impact", "Distant impact", "A low cinematic strike with a restrained metallic tail.", ["impact", "horror", "cinematic", "sfx"], "3 sec"],
    ["clock", "Time is running", "An intimate ticking pattern for countdowns and suspense.", ["clock", "ticking", "suspense", "loop"], "6 sec"],
    ["drift", "Soft focus", "A warm, sparse arpeggio for an editorial or studio scene.", ["warm", "editorial", "arpeggio", "bed"], "8 sec"],
    ["riser", "Into the light", "A short rising noise sweep that lands on a soft chime.", ["riser", "transition", "launch", "sfx"], "4 sec"],
    ["room", "The empty room", "A low electrical hum and filtered air for a quiet horror scene.", ["horror", "room-tone", "dark", "ambience"], "8 sec"],
  ].map(([id, name, summary, tags, duration]) => ({
    id: `sound-${id}`, name: name as string, summary: summary as string, tags: tags as string[], duration: duration as string,
    format: "Original sound", preview: { kind: "audio", url: asset(`sound-${id}.wav`), posterUrl: asset(`sound-${id}.svg`) },
    body: `Original procedural test sound authored for Ralphy. ${summary} Use the attached bundled WAV file, not a commercial song search. Place it under the selected content, adjust duration with intentional edits, fade exposed boundaries, and keep any narration clearly above the bed. Preserve the source and save the mixed result as a new revision. These examples are not live trends or claims about current popularity.`,
    artifact: `Bundled audio: explore/studio/sound-${id}.wav\nGenerator: scripts/generate-studio-assets.py\nOrigin: original procedural synthesis; no third-party recording.`,
  }));
}
