"""Build first-party sample previews: python3 scripts/generate-explore-previews.py.

Requires FFmpeg; no downloaded/user material, speech models or API calls.
The shared test scene is intentionally synthetic. Effect filters follow the public
catalog recipes. Dither supplies the palette-generation pass the recipe requires.
"""
import json
import math
from pathlib import Path
import subprocess
import tempfile
import wave
from array import array

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public/explore"
OUT.mkdir(parents=True, exist_ok=True)
WIDTH, HEIGHT, DURATION = 640, 480, 3
FONT = ROOT / "public/assets/fonts/Manrope-Variable.ttf"


def run(*args):
    subprocess.run([str(arg) for arg in args], check=True)


def ffmpeg(*args):
    run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args)


def encode(source, output, filters=None, complex_filter=None):
    args = ["-i", source]
    if filters:
        args += ["-vf", filters]
    if complex_filter:
        args += ["-filter_complex", complex_filter, "-map", "[out]"]
    ffmpeg(*args, "-an", "-c:v", "libx264", "-crf", "24", "-preset", "slow",
           "-pix_fmt", "yuv420p", "-movflags", "+faststart", output)


def poster(video, name):
    ffmpeg("-ss", "1", "-i", video, "-frames:v", "1", "-c:v", "libwebp",
           "-quality", "85", OUT / f"{name}.webp")


with tempfile.TemporaryDirectory(prefix="ralphy-explore-") as temporary:
    scratch = Path(temporary)
    # A lit, sculptural sphere with a cut-out ring, on an editorial color field.
    # Pixel drawing is only a reproducible test source, never the effect preview.
    pixels = bytearray()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            nx, ny = x / WIDTH, y / HEIGHT
            halo = math.exp(-((nx - .74) ** 2 / .22 + (ny - .42) ** 2 / .45))
            base = [22 + halo * 72, 20 + halo * 38, 46 + halo * 95]
            dx, dy = (x - 450) / 177, (y - 235) / 177
            distance = dx * dx + dy * dy
            if distance < 1:
                depth = math.sqrt(1 - distance)
                light = max(0, -.53 * dx - .43 * dy + .65 * depth)
                highlight = light ** 12
                base = [110 + light * 137 + highlight * 8,
                        28 + light * 92 + highlight * 78,
                        68 + light * 56 + highlight * 84]
                # Fine rings make chromatic shifts and dithering visible at thumbnail size.
                if int((math.atan2(dy, dx) + depth * 2) * 13) % 19 == 0:
                    base = [v * .67 for v in base]
            pixels.extend(int(min(255, max(0, value))) for value in base)
    scene = scratch / "scene.ppm"
    scene.write_bytes(f"P6\n{WIDTH} {HEIGHT}\n255\n".encode() + pixels)
    scene_video = scratch / "scene.mp4"
    ffmpeg("-loop", "1", "-i", scene, "-t", DURATION, "-vf",
           f"zoompan=z='1.015+0.015*sin(on/60*2*PI)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s={WIDTH}x{HEIGHT}:fps=20,"
           f"drawtext=fontfile={FONT}:text='FORM':fontsize=96:fontcolor=0xf7eedf:x=34:y=132,"
           f"drawtext=fontfile={FONT}:text='IN MOTION':fontsize=24:fontcolor=0xf7eedf:x=40:y=242,"
           f"drawtext=fontfile={FONT}:text='CREATIVE STUDIES  /  01':fontsize=11:fontcolor=0xc8c0c6:x=40:y=42,"
           f"drawtext=fontfile={FONT}:text='LIGHT. TEXTURE. FEELING.':fontsize=11:fontcolor=0xc8c0c6:x=40:y=432",
           "-an", "-c:v", "libx264", "-crf", "15", "-pix_fmt", "yuv420p", scene_video)
    encode(scene_video, OUT / "source.mp4")
    poster(scene_video, "source")
    effects = {
        "vhs-overlay": "rgbashift=rh=3:bh=-3,crop=in_w-4:in_h:2+2*sin(2*PI*0.6*t):0,noise=alls=8:allf=t,vignette=PI/5,eq=saturation=0.92:contrast=1.05,scale=640:480,setsar=1",
        "chroma-split": "rgbashift=rh=3:bh=-3",
        "film-grain": "noise=alls=8:allf=t",
        "noir-grade": "eq=contrast=0.92:brightness=-0.04:saturation=0.78,colorchannelmixer=rr=0.95:gg=1.05:bb=0.95,curves=all='0/0.05 0.5/0.45 1/0.92'",
        # CSS recipe: 30% black on the lower half of every 3px scan line.
        # RGB stripes use the recipe's 4px pitch and 4% / 2% / 4% tint.
        "crt-scanlines": "format=gbrp,geq=r='r(X,Y)*(1-0.3*gte(mod(Y,3),1.5))*(1-0.04)+255*0.04*lt(mod(X,4),1.333)':g='g(X,Y)*(1-0.3*gte(mod(Y,3),1.5))*(1-0.02)+255*0.02*between(mod(X,4),1.333,2.666)':b='b(X,Y)*(1-0.3*gte(mod(Y,3),1.5))*(1-0.04)+255*0.04*gte(mod(X,4),2.666)'",
    }
    for name, filters in effects.items():
        encode(scene_video, OUT / f"{name}.mp4", filters=filters)
        poster(OUT / f"{name}.mp4", name)
    encode(scene_video, OUT / "voxel-dither.mp4", complex_filter="[0:v]eq=contrast=1.06,split[a][b];[a]palettegen=max_colors=16[p];[b][p]paletteuse=dither=bayer:bayer_scale=3[out]")
    poster(OUT / "voxel-dither.mp4", "voxel-dither")
    # Original harmonic vocal study: five vowel-like tones, not a recorded person.
    # Formant changes let listeners hear the filter's loss of bandwidth and bit depth.
    voice = scratch / "voice.wav"
    sample_rate = 24000
    samples = array("h")
    vowels = [(730, 1090, 2440), (270, 2290, 3010), (570, 840, 2410), (300, 870, 2240), (530, 1840, 2480)]
    for index, formants in enumerate(vowels):
        for sample in range(int(sample_rate * .6)):
            t = sample / sample_rate
            envelope = min(1, t / .025, (.6 - t) / .075)
            pitch = 126 + 8 * math.sin(t * 4) + index * 5
            value = 0
            for harmonic in range(1, 45):
                frequency = pitch * harmonic
                amplitude = sum(math.exp(-((frequency - formant) / 180) ** 2) for formant in formants) / harmonic
                value += math.sin(2 * math.pi * frequency * t) * amplitude
            samples.append(int(max(-1, min(1, value * 2.5 * envelope)) * 24000))
    with wave.open(str(voice), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(sample_rate)
        audio.writeframes(samples.tobytes())
    ffmpeg("-i", voice, "-c:a", "libmp3lame", "-b:a", "96k", OUT / "voice-source.mp3")
    ffmpeg("-i", voice, "-af", "highpass=300,lowpass=3100,acrusher=bits=10:mode=log,acompressor=threshold=-20dB:ratio=4,volume=5dB",
           "-c:a", "libmp3lame", "-b:a", "96k", OUT / "old-radio-ps1-vo.mp3")
    # Fail the build if a file is unreadable, dimensionless or unexpectedly large.
    for file in OUT.iterdir():
        if file.suffix not in (".mp4", ".mp3", ".webp"):
            continue
        probe = subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(file)])
        streams = json.loads(probe)["streams"]
        assert streams and file.stat().st_size < 2_000_000, file
        if file.suffix == ".mp4":
            assert streams[0]["width"] == WIDTH and streams[0]["height"] == HEIGHT, file
    print(f"Verified Explore samples in {OUT}")
