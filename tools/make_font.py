"""Pravi font za ćirilicu fonts/RakiJASans.woff2 od Adobe Source Sans 3.

Source Sans 3 (OFL, srpski oblici slova preko "locl"), varijabilni font:
https://github.com/adobe-fonts/source-sans/releases -> VF-source-sans-3.*.zip

Pokretanje (iz foldera RakiJA):
    python tools/make_font.py putanja/do/SourceSans3VF-Upright.ttf
Treba fontTools i brotli (pip install fonttools brotli).

Zadržavaju se samo latinica, ćirilica i znakovi koje aplikacija koristi.
Izmijenjena verzija po OFL licenci ne smije nositi ime "Source", pa se zove
"RakiJA Sans" (licenca je u fonts/OFL.txt).
"""
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "fonts" / "RakiJASans.woff2"
FAMILY = "RakiJA Sans"

UNICODES = [
    *range(0x20, 0x7F),      # osnovna latinica
    *range(0xA0, 0x100),     # °, ±, ·, ×, tvrdi razmak
    *range(0x100, 0x180),    # č ć đ š ž
    *range(0x400, 0x460),    # ćirilica (ђ ћ ј љ њ џ)
    *range(0x2010, 0x2028),  # crtice, navodnici, …
    0x2060,                  # word joiner
    *range(0x2080, 0x208A),  # indeksi (CO₂)
    *range(0x2190, 0x2196),  # strelice → ↔
    0x2212, 0x2248,          # − ≈
]


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    font = TTFont(sys.argv[1])

    options = subset.Options()
    options.layout_features = ["*"]  # svi OpenType dodaci, i "locl" za srpski
    options.name_IDs = ["*"]
    options.hinting = False          # telefoni ga ne koriste, a font je manji
    options.flavor = "woff2"
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=UNICODES)
    subsetter.subset(font)

    name = font["name"]
    for rec in name.names:
        if rec.nameID in (1, 16):
            rec.string = FAMILY
        elif rec.nameID in (3, 4, 6):
            rec.string = str(rec.toUnicode()).replace("Source Sans 3", FAMILY) \
                .replace("SourceSans3", FAMILY.replace(" ", ""))
    OUT.parent.mkdir(exist_ok=True)
    font.save(OUT)

    # Provjera: srpski oblici (ćirilica, jezik SRB) i raspon debljina.
    gsub = font["GSUB"].table
    srb = any(s.ScriptTag == "cyrl" and any(l.LangSysTag == "SRB " for l in s.Script.LangSysRecord)
              for s in gsub.ScriptList.ScriptRecord)
    wght = next(a for a in font["fvar"].axes if a.axisTag == "wght")
    print(f"{OUT} ({OUT.stat().st_size // 1024} KB), srpski locl: {'da' if srb else 'NE'}, "
          f"debljine {wght.minValue:g}–{wght.maxValue:g}")


if __name__ == "__main__":
    main()
