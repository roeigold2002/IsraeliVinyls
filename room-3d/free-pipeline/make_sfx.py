"""Free procedural SFX with ffmpeg: room-tone loop + per-prop impact sounds by material.

Run: python make_sfx.py <world-dir>
"""
import subprocess
import sys
from pathlib import Path

WORLD = Path(sys.argv[1])

# impact recipes: ffmpeg aevalsrc expressions of t, with {f} as a pitch multiplier
RECIPES = {
    "wood": "exp(-t*28)*(0.55*sin(2*PI*170*{f}*t)+0.3*sin(2*PI*410*{f}*t))+0.25*exp(-t*90)*(random(0)*2-1)",
    "plastic": "exp(-t*60)*0.5*sin(2*PI*950*{f}*t)+0.35*exp(-t*140)*(random(0)*2-1)",
    "metal": "exp(-t*7)*(0.35*sin(2*PI*1240*{f}*t)+0.2*sin(2*PI*2790*{f}*t)+0.12*sin(2*PI*4130*{f}*t))+0.2*exp(-t*120)*(random(0)*2-1)",
    "soft": "0.7*exp(-t*22)*(random(0)*2-1)",
    "heavy": "exp(-t*14)*0.8*sin(2*PI*68*{f}*t)+0.35*exp(-t*40)*(random(0)*2-1)",
}
FILTERS = {"wood": "lowpass=f=2500", "plastic": "highpass=f=300", "metal": "highpass=f=500",
           "soft": "lowpass=f=320", "heavy": "lowpass=f=400"}
MATERIAL = {
    "computer-desk": "wood", "wooden-tv-stand": "wood",
    "keyboard-x-stand": "metal", "keyboard-bench": "metal", "office-chair": "metal",
    "hex-dumbbell": "heavy", "mini-fridge": "heavy",
    "pillow": "soft", "single-bed": "soft", "rolled-exercise-mat": "soft", "yoga-block": "soft",
}


def ffmpeg(args):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *args], check=True)


def main():
    sfx = WORLD / "output" / "sfx"
    sfx.mkdir(parents=True, exist_ok=True)
    # fridge compressor hum on whole-number frequencies (loops seamlessly at 10 s) + faint low room noise
    ffmpeg(["-f", "lavfi", "-i", "aevalsrc=0.05*sin(2*PI*50*t)+0.03*sin(2*PI*100*t)+0.012*sin(2*PI*150*t):s=44100:d=10",
            "-f", "lavfi", "-i", "anoisesrc=c=brown:a=0.04:d=10:r=44100",
            "-filter_complex", "[1]lowpass=f=500[n];[0][n]amix=inputs=2:normalize=0,afade=t=in:d=0.05,afade=t=out:st=9.95:d=0.05",
            "-ac", "2", str(sfx / "0-ambient-loop.mp3")])
    count = 0
    for obj in sorted(p.parent.name for p in (WORLD / "output").glob("*/object.json")):
        if not any((WORLD / "output" / obj).glob("0-*.glb")):
            continue
        kind = MATERIAL.get(obj, "plastic")
        out = WORLD / "output" / obj / "sfx"
        out.mkdir(exist_ok=True)
        for i, f in enumerate((0.9, 1.0, 1.12)):
            expr = RECIPES[kind].format(f=f)
            ffmpeg(["-f", "lavfi", "-i", f"aevalsrc={expr}:s=44100:d=0.8", "-af", f"{FILTERS[kind]},afade=t=out:st=0.6:d=0.2",
                    "-ac", "2", str(out / f"{i}-impact-{obj}.mp3")])
            count += 1
    print(f"ambient loop + {count} impact sounds")


if __name__ == "__main__":
    main()
