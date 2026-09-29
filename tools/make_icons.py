"""Pravi ikonice aplikacije iz tools/ikonica-original.png.

Pokretanje (iz foldera RakiJA):  python tools/make_icons.py
Treba Pillow (pip install pillow).
"""
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "ikonica-original.png"
OUT = ROOT / "icons"
WHITE = (255, 255, 255)


def content_square(img: Image.Image) -> Image.Image:
    """Isijeca crtež (bez bijelih ivica) i centrira ga u kvadrat."""
    diff = ImageChops.difference(img, Image.new("RGB", img.size, WHITE)).convert("L")
    bbox = diff.point(lambda v: 255 if v > 18 else 0).getbbox()
    art = img.crop(bbox)
    side = max(art.size)
    square = Image.new("RGB", (side, side), WHITE)
    square.paste(art, ((side - art.width) // 2, (side - art.height) // 2))
    return square


def render(art: Image.Image, size: int, fill: float) -> Image.Image:
    """Crtež zauzima `fill` dio širine ikonice, ostalo je bijela margina."""
    canvas = Image.new("RGB", (size, size), WHITE)
    inner = round(size * fill)
    scaled = art.resize((inner, inner), Image.LANCZOS)
    offset = (size - inner) // 2
    canvas.paste(scaled, (offset, offset))
    return canvas


def main() -> None:
    art = content_square(Image.open(SRC).convert("RGB"))
    OUT.mkdir(exist_ok=True)
    # "any" ikonice: mala margina. iOS sam zaobljava ivice.
    for name, size in [("icon-192.png", 192), ("icon-512.png", 512),
                       ("apple-touch-icon.png", 180), ("favicon-32.png", 32)]:
        render(art, size, 0.90).save(OUT / name, optimize=True)
    # Android "maskable": crtež mora stati u sigurnu zonu (krug 80 %).
    render(art, 512, 0.72).save(OUT / "icon-maskable-512.png", optimize=True)
    print("Ikonice napravljene u", OUT)

    # Android aplikacija (APK): obične ikonice po gustini ekrana + prednji sloj
    # adaptivne ikonice (vidljiv je samo središnji krug od 66/108 = 61 %).
    res = ROOT / "android" / "res"
    for folder, size in [("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)]:
        (res / f"mipmap-{folder}").mkdir(parents=True, exist_ok=True)
        render(art, size, 0.90).save(res / f"mipmap-{folder}" / "ic_launcher.png", optimize=True)
    (res / "drawable-nodpi").mkdir(parents=True, exist_ok=True)
    render(art, 432, 0.60).save(res / "drawable-nodpi" / "ic_launcher_foreground.png", optimize=True)
    print("Android ikonice napravljene u", res)


if __name__ == "__main__":
    main()
