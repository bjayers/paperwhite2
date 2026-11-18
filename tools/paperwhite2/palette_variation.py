#!/usr/bin/env python3
"""Paper White 2's palette variation: every Pokémon's battle and summary colours turn a little by its PID.

    palette_variation.py [SOURCE] OUTPUT_HEADER     # writes paperwhite2/palette_variation_config.h
    palette_variation.py --check [SOURCE]           # only checks the file
    palette_variation.py --vectors                  # rewrites the shared test vectors (VECTORS)

SOURCE is res/paperwhite2/palette_variation.json (palette_variation.schema.json beside it): the global switch, the
hue range in degrees, the brightness and saturation ranges in percent, and the species whose strength isn't 100%.
The header gives src/paperwhite2/main/paperwhite2_palette_variation.c those settings. Only the hack's build runs
this (configure.py --hack). docs/paperwhite2/design/palette-variation.md has the design.

This file is also the reference of the transform, which the C (paperwhite2_palette_variation.c) and the editor
(editor/src/modules/pokemon/paletteVariation.ts) follow step for step in 32-bit integers: VECTORS holds its results
for both test suites (tools/paperwhite2/test_palette_variation.py and editor/tests/palette-variation.test.ts).

The transform, on a palette of 5-bit BGR555 colours, by the PID's second byte (bits 8-15: the low byte gives the
sex, and the Shiny Candy keeps the low 16 bits):
- index 0, the transparent one, is never changed;
- the low nibble turns the hue by one of 16 steps from -hue_degrees to +hue_degrees: a rotation of the colour about
  the grey axis (Rodrigues' formula, sin and cos by short series in 1.12 fixed point), which keeps greys exactly
  and moves a colour by its distance from grey, so a faint tint moves little;
- bits 6-7 move the saturation by one of 4 steps from -saturation_percent to +saturation_percent: each channel's
  distance from the colour's mean, so greys have none to move;
- bits 4-5 move the brightness by one of 4 steps from -brightness_percent to +brightness_percent, weighted by the
  colour's own HSV saturation (chroma / max), so greys, white and black stay;
- every range is scaled by the species' strength (0-100%), and a strength of 0 or the switch off changes nothing.
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data import datajson  # noqa: E402

SOURCE = ROOT / "res" / "paperwhite2" / "palette_variation.json"
VECTORS = ROOT / "tools" / "paperwhite2" / "palette_variation_vectors.json"
GUARD = "POKEBW2_PAPERWHITE2_PALETTE_VARIATION_CONFIG_H"

ONE = 4096  # 1.0 in the transform's 1.12 fixed point


def key_of(personality: int) -> int:
    """The variation's byte of a PID: bits 8-15."""
    return (personality >> 8) & 0xFF


def settings(path: Path = SOURCE) -> dict:
    """The file's settings, with "strengths" as {species ID: percent}, or a datajson.DataError."""
    data = datajson.load(path, datajson.load_schema(path.parent / "palette_variation.schema.json"))
    strengths: dict[int, int] = {}
    for entry in data.get("species", []):
        species = datajson.value(entry["species"], datajson.label(path))
        if species in strengths:
            raise datajson.DataError(f"{datajson.label(path)}: {entry['species']} is listed twice")
        strengths[species] = entry["strength"]
    return {
        "enabled": data["enabled"],
        "hue_degrees": data["hue_degrees"],
        "brightness_percent": data["brightness_percent"],
        "saturation_percent": data["saturation_percent"],
        "strengths": strengths,
    }


def clamp(value: int) -> int:
    return 0 if value < 0 else 31 if value > 31 else value


def coefficients(key: int, cfg: dict, strength: int) -> tuple[int, int, int, int, int]:
    """The hue rotation's diagonal and two off-diagonal coefficients, and the saturation's and brightness's amounts,
    all in 1.12. Python's >> floors as an ARM arithmetic shift and JavaScript's >> do."""
    hue_step = 2 * (key & 15) - 15
    brightness_step = 2 * ((key >> 4) & 3) - 3
    saturation_step = 2 * (key >> 6) - 3
    # The angle in 1.12 radians: step / 15 * degrees * strength / 100 * pi / 180, as 3123 / 65536
    theta = (hue_step * cfg["hue_degrees"] * strength * 3123) >> 16
    theta2 = (theta * theta) >> 12
    theta3 = (theta2 * theta) >> 12
    theta4 = (theta2 * theta2) >> 12
    sin = theta - ((theta3 * 683) >> 12)               # theta - theta^3 / 6
    cos = ONE - (theta2 >> 1) + ((theta4 * 171) >> 12)  # 1 - theta^2 / 2 + theta^4 / 24
    third = (ONE - cos) // 3                           # never negative
    skew = (sin * 2365) >> 12                          # sin / sqrt(3)
    diagonal = ONE - 2 * third
    # step / 3 * percent * strength / 10000 in 1.12, as 4474 / 32768
    saturation = (saturation_step * cfg["saturation_percent"] * strength * 4474) >> 15
    brightness = (brightness_step * cfg["brightness_percent"] * strength * 4474) >> 15
    return diagonal, third - skew, third + skew, saturation, brightness


def vary_color(color: tuple[int, int, int], coeffs: tuple[int, int, int, int, int]) -> tuple[int, int, int]:
    """One 5-bit (r, g, b) colour, varied by coefficients()."""
    diagonal, before, after, saturation, brightness = coeffs
    r, g, b = color
    top = max(r, g, b)
    weight = (top - min(r, g, b)) * ONE // top if top > 0 else 0
    # The hue: rows that each sum to ONE, so a grey stays exactly
    r1 = clamp((diagonal * r + before * g + after * b + 2048) >> 12)
    g1 = clamp((after * r + diagonal * g + before * b + 2048) >> 12)
    b1 = clamp((before * r + after * g + diagonal * b + 2048) >> 12)
    # The saturation: each channel's distance from the mean, (3c - sum) / 3, as 1365 / 4096
    total = r1 + g1 + b1
    r2, g2, b2 = (clamp((c * ONE + (((3 * c - total) * saturation * 1365) >> 12) + 2048) >> 12) for c in (r1, g1, b1))
    # The brightness, weighted by the original colour's saturation
    scale = ONE + ((brightness * weight) >> 12)
    return tuple(clamp((c * scale + 2048) >> 12) for c in (r2, g2, b2))


def vary_palette(colors: list[tuple[int, int, int]], key: int, cfg: dict, strength: int) -> list[tuple[int, int, int]]:
    """A palette of 5-bit colours, varied by the key; index 0 kept."""
    if not cfg["enabled"] or strength <= 0:
        return list(colors)
    coeffs = coefficients(key, cfg, strength)
    return [colors[0], *(vary_color(c, coeffs) for c in colors[1:])] if colors else []


def strength_of(cfg: dict, species: int) -> int:
    return cfg["strengths"].get(species, 100)


def bgr555(color: tuple[int, int, int]) -> int:
    r, g, b = color
    return r | g << 5 | b << 10


def from_bgr555(value: int) -> tuple[int, int, int]:
    return value & 31, (value >> 5) & 31, (value >> 10) & 31


def header(path: Path) -> str:
    cfg = settings(path)
    rows = sorted(cfg["strengths"].items())
    entries = " \\\n".join(f"    {{ {species}, {strength} }}," for species, strength in rows)
    return "\n".join([
        f"#ifndef {GUARD}", f"#define {GUARD}", "",
        f"// Generated by tools/paperwhite2/palette_variation.py from {datajson.label(path)}, edit that instead",
        "",
        f"#define PAPERWHITE2_PALETTE_VARIATION_ENABLED {int(cfg['enabled'])}",
        f"#define PAPERWHITE2_PALETTE_VARIATION_HUE_DEGREES {cfg['hue_degrees']}",
        f"#define PAPERWHITE2_PALETTE_VARIATION_BRIGHTNESS_PERCENT {cfg['brightness_percent']}",
        f"#define PAPERWHITE2_PALETTE_VARIATION_SATURATION_PERCENT {cfg['saturation_percent']}",
        f"#define PAPERWHITE2_PALETTE_VARIATION_STRENGTH_COUNT {len(rows)}",
        "// The species whose strength isn't 100%, as { species, percent }, by species ID",
        "#define PAPERWHITE2_PALETTE_VARIATION_STRENGTHS { \\\n" + (entries + " \\\n" if rows else
                                                                   "    { 0, 100 }, \\\n") + "}",
        "", f"#endif // {GUARD}", "",
    ])


# The vectors' palettes: a real one per kind (read 8-bit from res/pokemon, as the game rounds them) and a made one
# with every edge case: greys, white, black, primaries, near-whites and dark saturated colours
VECTOR_PALETTES = ("pikachu/normal.pal", "charizard/shiny.pal", "kecleon/normal.pal", "arceus/form_10/normal.pal")
MADE_PALETTE = [(0, 31, 0), (31, 31, 31), (0, 0, 0), (16, 16, 16), (31, 0, 0), (0, 31, 0), (0, 0, 31), (30, 31, 31),
                (31, 30, 29), (6, 0, 2), (2, 1, 0), (31, 31, 0), (20, 10, 5), (12, 24, 30), (25, 25, 26), (9, 9, 9)]
VECTOR_SETTINGS = (
    {"enabled": True, "hue_degrees": 12, "brightness_percent": 6, "saturation_percent": 10},
    {"enabled": True, "hue_degrees": 45, "brightness_percent": 25, "saturation_percent": 50},
    {"enabled": True, "hue_degrees": 3, "brightness_percent": 0, "saturation_percent": 0},
    {"enabled": False, "hue_degrees": 12, "brightness_percent": 6, "saturation_percent": 10},
)
VECTOR_KEYS = (0x00, 0x0F, 0x7A, 0x80, 0xB3, 0xFF)
VECTOR_STRENGTHS = (100, 50, 0)


def read_palette5(relative: str) -> list[tuple[int, int, int]]:
    from tools.data.nitro_2d import color5, read_palette
    return [color5(c) for c in read_palette(ROOT / "res" / "pokemon" / relative)]


def vectors() -> dict:
    palettes = {name: read_palette5(name) for name in VECTOR_PALETTES}
    palettes["made"] = MADE_PALETTE
    cases = []
    for name, colors in palettes.items():
        for cfg in VECTOR_SETTINGS:
            for key in VECTOR_KEYS:
                for strength in VECTOR_STRENGTHS:
                    cases.append({"palette": name, "settings": cfg, "key": key, "strength": strength,
                                  "output": [bgr555(c) for c in vary_palette(colors, key, cfg, strength)]})
    return {"about": "Palette variation test vectors, written by tools/paperwhite2/palette_variation.py --vectors: "
                     "BGR555 palettes in, a PID's second byte, settings and strength, the palette out",
            "palettes": {name: [bgr555(c) for c in colors] for name, colors in palettes.items()},
            "cases": cases}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("paths", type=Path, nargs="*")
    parser.add_argument("--check", action="store_true", help="only check the file")
    parser.add_argument("--vectors", action="store_true", help="rewrite the shared test vectors")
    args = parser.parse_args()
    try:
        if args.vectors:
            data = vectors()
            lines = ["{", f'  "about": {json.dumps(data["about"])},', '  "palettes": {']
            names = list(data["palettes"])
            lines += [f'    {json.dumps(n)}: {json.dumps(data["palettes"][n])}{"," if i < len(names) - 1 else ""}'
                      for i, n in enumerate(names)]
            lines += ["  },", '  "cases": [']
            lines += [f'    {json.dumps(c)}{"," if i < len(data["cases"]) - 1 else ""}'
                      for i, c in enumerate(data["cases"])]
            lines += ["  ]", "}", ""]
            VECTORS.write_text("\n".join(lines))
            print(f"wrote {len(data['cases'])} cases to {datajson.label(VECTORS)}")
            return
        if args.check:
            settings(args.paths[0] if args.paths else SOURCE)
            print(f"{datajson.label(args.paths[0] if args.paths else SOURCE)} is fine")
            return
        if not args.paths:
            parser.error("give the output header")
        source, output = (args.paths if len(args.paths) == 2 else [SOURCE, args.paths[0]])
        text = header(source)
        if not output.exists() or output.read_text() != text:
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(text)
    except datajson.DataError as error:
        sys.exit(f"error: {error}")


if __name__ == "__main__":
    main()
