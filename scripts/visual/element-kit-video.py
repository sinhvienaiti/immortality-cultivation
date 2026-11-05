"""Element kit video (lab-element-kits, 05/11/2026): the frames of scenarios/lab-element-kits.mjs with a caption per
segment (element, key, skill, the clips its folder has and still lacks), encoded to an H.264 MP4 under 30 MB.

  ~/AudioLab/.venv/bin/python -I scripts/visual/element-kit-video.py <capture dir> <out.mp4> [--keep]

The capture dir holds frames/<n>.jpg and segments.json. The captions are drawn into the frames in place (Pillow; this
ffmpeg has no drawtext), then the frames are deleted unless --keep.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

NAMES = {
    "water": "Thủy (Water)", "thunder": "Lôi (Thunder)", "wind": "Phong (Wind)", "ice": "Băng (Ice)",
    "earth": "Thổ (Earth)", "wood": "Mộc (Wood)", "dark": "Ám (Dark)", "light": "Quang (Light)",
    "poison": "Độc (Poison)", "blood": "Huyết (Blood)", "void": "Không gian (Void)", "star": "Tinh tú (Star)",
}
ROLES = ["charge", "release", "ribbon", "sheath", "impact", "burst", "groundImpact", "sparkle", "slash", "groundMark"]
FONT = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"


def main() -> None:
    src = Path(sys.argv[1])
    out = Path(sys.argv[2])
    keep = "--keep" in sys.argv
    report = json.loads((src / "segments.json").read_text())
    element = report["element"]
    pools = (report["info"].get("kit") or {}).get("pools") or {}
    have = [r for r in ROLES if pools.get(r, 0) > 0]
    lack = [r for r in ROLES if pools.get(r, 0) == 0]
    big = ImageFont.truetype(FONT, 28)
    small = ImageFont.truetype(FONT, 18)
    for seg in report["segments"]:
        title = f"{NAMES.get(element, element)} · phím {seg['key']} · {seg['name']}"
        if seg["close"]:
            title = f"{NAMES.get(element, element)} · phím {seg['key']} · cận cảnh đòn xuống đất · {seg['name'].split(' · ')[0]}"
        line2 = "clip đã có: " + (", ".join(have) or "chưa có") + ("   ·   chưa có (lớp gốc vẽ): " + ", ".join(lack) if lack else "")
        if seg["slot"] == "showcase":
            kind = "cột trụ" if seg["name"].startswith("pillar") else "tuyệt kỹ"
            title = f"Phím 8 · trình diễn {kind} · {seg['name']}"
            line2 = f"clip art-src/lab/vfx/ult/{seg['name']} · lớp video đặt trên sân đúng góc camera chơi, chưa nối vào sim"
        for i in range(seg["start"], seg["start"] + seg["count"]):
            path = src / "frames" / f"{i:05d}.jpg"
            im = Image.open(path).convert("RGB")
            d = ImageDraw.Draw(im, "RGBA")
            d.rectangle([0, 0, im.width, 84], fill=(8, 10, 16, 170))
            d.text((20, 10), title, font=big, fill=(240, 244, 250, 255))
            d.text((20, 52), line2, font=small, fill=(190, 205, 225, 255))
            im.save(path, quality=90)
    fps = report["fps"]
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-framerate", str(fps), "-i", str(src / "frames" / "%05d.jpg"),
                    "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)], check=True)
    size = out.stat().st_size / 1e6
    print(json.dumps({"video": str(out), "mb": round(size, 2), "frames": report["frames"], "have": have, "lack": lack}))
    if size > 30:
        print("warning: over 30 MB", file=sys.stderr)
    if not keep:
        shutil.rmtree(src / "frames")


if __name__ == "__main__":
    main()
