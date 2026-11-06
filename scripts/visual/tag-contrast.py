"""Word-tag contrast at each key 8 and 9 skill's peak (lab-perf-memory.mjs PART=contrast, 06/11).

The lab draws no word tags yet, so each live beast gets a stand-in: a 100 x 28 px box whose bottom centre is the point
0.3 m over its head (__lab.tagSpots). Behind each box, the 90th-percentile pixel by luminance stands for the brightest
light behind the letters. Against it:
  - bare: ivory text (#FFF4D6, Dragonhold's tag colour) with no plate, WCAG contrast;
  - plate: the least opacity of Dragonhold's tag plate (#231C17, 0.9 there) that keeps 7:1 over that pixel
    (sRGB blending, as CSS does);
  - dh: the contrast with Dragonhold's own plate at 0.9.
A skill makes tags hard to read when, on its peak frame, at least 10 % of the tags need a plate of 0.6 or more (bare or
lightly backed letters fail 7:1 there).

  ~/AudioLab/.venv/bin/python -I scripts/visual/tag-contrast.py <contrast.json> [<out.json>]
"""
import json
import sys

from PIL import Image

TEXT = (0xFF, 0xF4, 0xD6)
PLATE = (0x23, 0x1C, 0x17)
BOX_W, BOX_H = 100, 28
NEED = 7.0
HARD_ALPHA = 0.6
HARD_SHARE = 0.10


def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lum(rgb):
    r, g, b = rgb
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def contrast(a, b):
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


L_TEXT = lum(TEXT)


def plate_need(bg):
    """Least plate opacity (0-1, step 0.01) for 7:1 between the text and the plate over `bg`."""
    for k in range(101):
        a = k / 100
        comp = tuple(a * p + (1 - a) * c for p, c in zip(PLATE, bg))
        if contrast(L_TEXT, lum(comp)) >= NEED:
            return a
    return 1.01


def score_tag(img, x, y):
    w, h = img.size
    x0, y0 = max(0, x - BOX_W // 2), max(0, y - BOX_H)
    x1, y1 = min(w, x + BOX_W // 2), min(h, y)
    if x1 - x0 < BOX_W // 2 or y1 - y0 < BOX_H // 2:
        return None
    px = list(img.crop((x0, y0, x1, y1)).getdata())
    px.sort(key=lum)
    bg = px[min(len(px) - 1, int(0.9 * len(px)))]
    lb = lum(bg)
    dh = tuple(0.9 * p + 0.1 * c for p, c in zip(PLATE, bg))
    return {"l90": lb, "bare": contrast(L_TEXT, lb), "plate": plate_need(bg), "dh": contrast(L_TEXT, lum(dh))}


def pct(values, p):
    s = sorted(values)
    return s[min(len(s) - 1, int(p * (len(s) - 1) + 0.5))] if s else None


def main():
    data = json.load(open(sys.argv[1]))
    rows = []
    for shot in data["shots"]:
        img = Image.open(shot["file"]).convert("RGB")
        tags = [t for t in (score_tag(img, s["x"], s["y"]) for s in shot["tags"]) if t is not None]
        if not tags:
            rows.append({"key": shot["key"], "id": shot["id"], "tags": 0})
            continue
        need = [t["plate"] for t in tags]
        hard = sum(1 for a in need if a >= HARD_ALPHA) / len(tags)
        rows.append({
            "key": shot["key"], "id": shot["id"], "video": shot.get("video"), "tags": len(tags),
            "l90Median": round(pct([t["l90"] for t in tags], 0.5), 3),
            "bareMin": round(min(t["bare"] for t in tags), 2),
            "bareFail": round(sum(1 for t in tags if t["bare"] < NEED) / len(tags), 2),
            "plateP90": round(pct(need, 0.9), 2), "plateMax": round(max(need), 2),
            "hardShare": round(hard, 2), "dhMin": round(min(t["dh"] for t in tags), 1),
            "hard": hard >= HARD_SHARE,
        })
    out = {"rule": f"hard when >= {int(HARD_SHARE * 100)} % of tags need a plate >= {HARD_ALPHA} for {NEED}:1 (text #FFF4D6 on #231C17)", "rows": rows}
    text = json.dumps(out, indent=1)
    if len(sys.argv) > 2:
        open(sys.argv[2], "w").write(text)
    for r in rows:
        if r["tags"] == 0:
            print(f'k{r["key"]} {r["id"]:<40} no tags')
            continue
        print(f'k{r["key"]} {r["id"]:<40} n={r["tags"]:<3} L90={r["l90Median"]:<6} bareMin={r["bareMin"]:<6} bareFail={r["bareFail"]:<5} plateP90={r["plateP90"]:<5} plateMax={r["plateMax"]:<5} hard={r["hardShare"]:<5} dhMin={r["dhMin"]} {"HARD" if r["hard"] else ""}')


if __name__ == "__main__":
    main()
