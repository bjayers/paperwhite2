#!/usr/bin/env python3
"""Paper White 2: the icons' game tone (docs/paperwhite2/design/shiny-icons.md section 17). The party/box icons take
their battle palettes' colours (tools/paperwhite2/poke_icons.py), which have deep shading and a wide lightness range;
the vanilla icon banks (res/pokemon/shared/icon_palettes.pal) keep every body colour light (none darker than the light
outline grey) and each icon's lightness in a narrow band. This tones an icon's colours toward that, per palette
(normal and shiny each on its own), in OKLCh, keeping hue:

- lightness: the icon's colours are pulled toward its lightest used colour, so its spread (the pixel-weighted standard
  deviation of lightness over its slots) comes down to "lightness_spread", vanilla's typical one, by a factor
  k = lightness_spread / spread, never below "min_contrast" and never above 1 (an icon already as flat keeps its
  lightness): L' = top - (top - L) * k;
- chroma: above "chroma_knee" (about where the vanilla banks stop) chroma grows only by "chroma_above_knee" of
  itself, so the few very vivid battle colours come down toward the banks' most vivid;
- "strength" 0..1 blends both: k becomes 1 - strength * (1 - k), the chroma change is scaled the same way. 0 is the
  battle colours unchanged.

Then two limits, in full whenever the tone is on (strength above 0), from the user's review of every icon:

- relative saturation: chroma may be at most "saturation_max" times lightness (vanilla's colours stay under about
  0.24-0.29); the excess goes into lightness, L' = L + (C - saturation_max * L), C' = min(C, saturation_max * L'), so
  deep, vivid shades (the battle palettes' reds and magentas, which keep their chroma as they darken) become lighter,
  softer ones. 0 turns it off.
- a soft dark floor: lightness below "dark_knee" is squeezed into [dark_floor, dark_knee],
  L' = dark_floor + L * (dark_knee - dark_floor) / dark_knee, so near-blacks lift while dark shades keep their order
  and stay distinct (a hard floor merged Zekrom's shades into one). A dark_knee at or under dark_floor turns it off.

A colour outside sRGB after this keeps its lightness and hue and loses chroma until it fits. Index 0 (transparency)
and 14-15 (the vanilla outline greys) never change, and nor do the pixels or indices. res/paperwhite2/icon_tone.json
has the parameters; the build applies them only when it says "enabled": true. The editor's Sprite Editor mirrors this
(editor/src/modules/spriteeditor/tone.ts, kept equal by editor/tests/icon-tone.test.ts) for its Game tone view.

    icon_tone.py colours DATA.json     # prints the toned colours of {"colours": [16 x [r, g, b]], "counts": [16],
                                       # optional "strength"} with res/paperwhite2/icon_tone.json's parameters
                                       # (DATA may give its own "params"), one JSON line

Standard library only.
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TONE_FILE = ROOT / "res" / "paperwhite2" / "icon_tone.json"
COLOURS = 16
FIXED = (0, 14, 15)          # transparency and the two outline greys
PARAMETERS = ("strength", "lightness_spread", "min_contrast", "chroma_knee", "chroma_above_knee", "saturation_max",
              "dark_floor", "dark_knee")


def load(path: Path = TONE_FILE) -> dict:
    """The tone's parameters, checked."""
    data = json.loads(path.read_text())
    if not isinstance(data.get("enabled"), bool):
        raise ValueError(f"{path}: \"enabled\" must be true or false")
    for name in PARAMETERS:
        if not isinstance(data.get(name), (int, float)) or isinstance(data.get(name), bool) or data[name] < 0:
            raise ValueError(f"{path}: \"{name}\" must be a number, at least 0")
    if any(data[name] > 1 for name in ("strength", "min_contrast", "chroma_above_knee", "dark_floor", "dark_knee")):
        raise ValueError(f"{path}: \"strength\", \"min_contrast\", \"chroma_above_knee\", \"dark_floor\" and "
                         f"\"dark_knee\" are at most 1")
    return data


def _linear(c: float) -> float:
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _gamma(c: float) -> float:
    return c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def oklch(rgb) -> tuple:
    """An 8-bit sRGB colour's OKLCh: lightness 0-1, chroma, hue in radians."""
    r, g, b = (_linear(c) for c in rgb)
    l = math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    m = math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    s = math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    lightness = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return lightness, math.sqrt(a * a + bb * bb), math.atan2(bb, a)


def _linear_rgb(lightness: float, chroma: float, hue: float) -> tuple:
    a, b = chroma * math.cos(hue), chroma * math.sin(hue)
    l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3
    return (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)


def _inside(rgb) -> bool:
    return all(-1e-7 <= c <= 1 + 1e-7 for c in rgb)


def srgb(lightness: float, chroma: float, hue: float) -> tuple:
    """The 8-bit sRGB colour of an OKLCh one, its chroma reduced (by bisection) until it is inside sRGB."""
    rgb = _linear_rgb(lightness, chroma, hue)
    if not _inside(rgb):
        low, high = 0.0, chroma
        for _ in range(24):
            mid = (low + high) / 2
            if _inside(_linear_rgb(lightness, mid, hue)):
                low = mid
            else:
                high = mid
        rgb = _linear_rgb(lightness, low, hue)
    return tuple(math.floor(_gamma(min(1.0, max(0.0, c))) * 255 + 0.5) for c in rgb)


def tone(colours, counts, params: dict, strength=None) -> list:
    """An icon palette's 16 colours toned: counts are the icon's pixels at each index (they weigh its lightness spread
    and pick the used slots). Indices 0, 14 and 15 are returned as they are."""
    if len(colours) != COLOURS or len(counts) != COLOURS:
        raise ValueError(f"{len(colours)} colours and {len(counts)} counts, not {COLOURS}")
    strength = params["strength"] if strength is None else strength
    colours = [tuple(c) for c in colours]
    used = [i for i in range(COLOURS) if i not in FIXED and counts[i] > 0]
    if strength <= 0 or not used:
        return colours
    lch = {i: oklch(colours[i]) for i in range(COLOURS) if i not in FIXED}
    total = sum(counts[i] for i in used)
    mean = sum(lch[i][0] * counts[i] for i in used) / total
    spread = math.sqrt(sum((lch[i][0] - mean) ** 2 * counts[i] for i in used) / total)
    top = max(lch[i][0] for i in used)
    k = min(1.0, max(params["min_contrast"], params["lightness_spread"] / spread)) if spread > 0 else 1.0
    k = 1 - strength * (1 - k)
    knee = params["chroma_knee"]
    out = list(colours)
    for i, (lightness, chroma, hue) in lch.items():
        toned = top - (top - lightness) * k
        if chroma > knee:
            chroma -= strength * (chroma - knee) * (1 - params["chroma_above_knee"])
        toned, chroma = limits(toned, chroma, params)
        out[i] = srgb(toned, chroma, hue)
    return out


def limits(lightness: float, chroma: float, params: dict) -> tuple:
    """The relative-saturation cap, then the soft dark floor (see above)."""
    cap = params["saturation_max"]
    if cap > 0 and chroma > cap * lightness:
        lightness = min(lightness + (chroma - cap * lightness), 1.0)
        chroma = min(chroma, cap * lightness)
    low, knee = params["dark_floor"], params["dark_knee"]
    if knee > low and lightness < knee:
        lightness = low + lightness * (knee - low) / knee
    return lightness, chroma


def pixel_counts(pixels) -> list:
    counts = [0] * COLOURS
    for p in pixels:
        counts[p] += 1
    return counts


def main():
    args = sys.argv[1:]
    if len(args) != 2 or args[0] != "colours":
        sys.exit(__doc__)
    try:
        data = json.loads(Path(args[1]).read_text())
        params = data.get("params") or load()
        print(json.dumps({"colours": [list(c) for c in tone(data["colours"], data["counts"], params,
                                                            data.get("strength"))]}))
    except (ValueError, KeyError, TypeError) as error:
        sys.exit(f"icon_tone.py: {error}")


if __name__ == "__main__":
    main()
