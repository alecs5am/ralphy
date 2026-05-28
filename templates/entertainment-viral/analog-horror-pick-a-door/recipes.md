# Recipes (raw ffmpeg — codify as ralphy verbs later)

All validated on the reference project. Paths relative to the project.

## VHS post-process grade (the "old TV" look) — run on the rendered comp
Chroma aberration + smooth horizontal mirage drift (sine, no jitter) + soft blur + grain + desaturate + vignette:
```bash
ffmpeg -y -i render/comp.mp4 \
  -vf "scale=iw*1.03:ih*1.03,crop=1080:1920:x='(iw-1080)/2+5*sin(2*PI*t/2.6)':y='(ih-1920)/2',rgbashift=rh=-4:bv=4,gblur=sigma=0.7,noise=alls=9:allf=t,eq=saturation=0.80:contrast=1.07:brightness=-0.012,vignette=PI/4.5,format=yuv420p" \
  -c:v libx264 -crf 20 -preset medium -c:a copy render/final.mp4
```

## Greenscreen chromakey → transparent PNG (monster cutouts)
```bash
ffmpeg -y -i in.png -vf "colorkey=0x00b140:0.20:0.06,format=rgba" out.png
```

## Old-radio VO filter (per VO file)
```bash
ffmpeg -y -i vo.mp3 -af "highpass=f=300,lowpass=f=3100,acrusher=bits=10:samples=1:mode=log,acompressor=threshold=-18dB:ratio=4:attack=5:release=80,volume=5dB" -ar 44100 -ac 1 vo-radio.mp3
```

## Undertale textbox beep track from text (one blip per char, ~60ms)
Builds a beep run sized to the line; cycle `voice_gaster_1.wav`:
```bash
python3 - <<'PY'
import subprocess, os
wav="assets/sfx/voice_gaster_1.wav"; text="your limits are up."; out="assets/sfx/beeps/box1.mp3"
chars=[c for c in text if c!=' ']; n=len(chars); STEP=60
inputs=[]; parts=[]; 
for i in range(n): inputs+=["-i",wav]
for i in range(n): parts.append(f"[{i}:a]adelay={i*STEP}|{i*STEP}[a{i}]")
fc=";".join(parts)+";"+"".join(f"[a{i}]" for i in range(n))+f"amix=inputs={n}:normalize=0,volume=2.5[o]"
subprocess.run(["ffmpeg","-y",*inputs,"-filter_complex",fc,"-map","[o]","-ar","44100","-ac","1",out])
PY
```

## Clip time-fit (stretch/compress a generated clip to an exact scene length)
```bash
# fit an 8s clip to 12s: factor = target/source = 1.5
ffmpeg -y -i in.mp4 -filter:v "setpts=1.5*PTS" -an -c:v libx264 -crf 19 out.mp4
```

## Concat a montage into one video (HyperFrames can't switch many short same-track clips)
```bash
# trim each to 2s + normalize, then concat
for s in 1 2 3 4 5 6; do ffmpeg -y -i clip$s.mp4 -t 2 -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1" -an -c:v libx264 -crf 18 c$s.mp4; done
printf "file '%s'\n" c1.mp4 c2.mp4 c3.mp4 c4.mp4 c5.mp4 c6.mp4 > list.txt
ffmpeg -y -f concat -safe 0 -i list.txt -c:v libx264 -crf 18 montage.mp4
```

## Music slow ("slowed" bed) + loop to length
```bash
ffmpeg -y -i track.mp3 -af "atempo=0.80,aecho=0.8:0.6:55:0.28,afade=in:0:2,afade=out:st=54:d=3" -t 57 bed-slowed.mp3
# loop a short bed to cover a longer section:
ffmpeg -y -stream_loop 3 -i bed.mp3 -t 24 -af "afade=in:0:1,afade=out:st=22.5:d=1.5" bed-long.mp3
```

## Final compress (social, visually lossless on grainy content)
```bash
ffmpeg -y -i render/final.mp4 -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart render/final-compressed.mp4
```

## VHS hiss bed prep (from a long real tape-noise source)
```bash
ffmpeg -y -ss 0 -t 69 -i real-vhs.mp3 -af "volume=9dB,afade=t=in:st=0:d=0.6" -ar 44100 assets/sfx/tv-hiss-real.mp3
```
