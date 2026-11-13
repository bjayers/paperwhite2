#!/usr/bin/env python3
"""Paper White 2: export a battle sprite's art to edit, and import it back, keeping its rig (the editor's Pokémon page,
Art; docs/paperwhite2/design/battle-sprites.md section 14).

    battle_sprite.py export SPECIES [--form N] OUT.zip
    battle_sprite.py check SPECIES [--form N] [FILE...] [--stills-from-sheets]
    battle_sprite.py import SPECIES [--form N] FILE... [--stills-from-sheets]

SPECIES is a species' directory in res/pokemon (pichu) or its constant (SPECIES_PICHU); --form N takes its form_<N>/
art. The art is a group's images, all in one 16-colour palette (index 0 transparent): the 256 by 128 sheets that MCSS
draws the animated sprite from (front.png, back.png, and front_female.png, back_female.png where the group has them),
the 96 by 96 stills of the 2D screens (front_single.png, back_single.png and their _female ones), normal.pal and
shiny.pal, which recolours the same indices. The rig (the cells' rectangles, the parts, poses and animations: the
.ncer, .nanr.lz11, .nmcr, .nmar and _info.bin files) is kept as it is.

export writes a zip of a folder: the images as they are in res/ (indexed PNGs whose palette is normal.pal), a
shiny-coloured copy of each (<image>_shiny.png: the same pixels, shiny.pal as its palette), normal.pal and shiny.pal,
guide/<sheet>.png (the sheet three times its size with each cell's rectangle outlined and numbered, and a legend of
the parts), preview/<side>.png (the assembled first frame, normal and shiny) and README.txt with the rules.

check reads FILEs (PNGs, .pal files or a zip of them, named as export names them; guide/ and preview/ are ignored)
and prints one line of JSON: "errors" (it can't be imported), "warnings", "notes", the files it would change, and a
preview (the animation of each side in the new art, normal and shiny, and the new stills and sheets). import does the
same and writes the files when there are no errors; with no change it writes nothing, so importing an export
unchanged leaves res/ byte for byte as it was. --stills-from-sheets draws the stills from the sheets: the first frame
of the "stay" animation, with its visible pixels where the current still has them when it is the same size, else in the
middle (the originals are this frame, for about half of them with a few pixels touched up).

Colours: a pixel's colour comes from its PNG's palette. An indexed PNG keeps its indices where its colours are the
palette's; where an index below 16 has a colour the palette doesn't, that index is recoloured (the PNGs' palette is
the sprite's palette); a colour at another index, or in an RGB(A) PNG, takes the palette's index of that colour, or a
free one (an index no image of the group uses). Transparent pixels (index 0, a tRNS-transparent index, alpha under
128, or in an RGB PNG the colour of the palette's index 0) are index 0. Front and back share the palette, so their
recolourings must agree. A shiny copy gives the shiny colour of each index under its pixels.
"""
import argparse
import base64
import io
import json
import struct
import sys
import tempfile
import zipfile
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.nitro_2d import (color5, read_indexed_png, read_palette, unfilter_png, write_indexed_png,  # noqa: E402
                                 write_palette, write_rgba_png)
from tools.paperwhite2 import mcss  # noqa: E402

POKEMON = ROOT / "res" / "pokemon"
SHEETS = ("front", "back", "front_female", "back_female")
STILLS = ("front_single", "back_single", "front_single_female", "back_single_female")
IMAGES = SHEETS + STILLS
SIZES = {**{name: mcss.SHEET_SIZE for name in SHEETS}, **{name: (96, 96) for name in STILLS}}
COLOURS = 16
# The guide's scale, and its legend's width
GUIDE_SCALE = 3
LEGEND_WIDTH = 300
# Words of Game Freak's part names (romaji) and the English the guide adds after them
GLOSSES = {"atama": "head", "ashi": "leg", "asi": "leg", "te": "hand", "karada": "body", "o": "tail", "ude": "arm",
           "mimi": "ear", "hane": "wing", "hi": "fire", "hige": "whiskers", "kubi": "neck", "kuchi": "mouth",
           "kuti": "mouth", "hire": "fin", "momo": "thigh", "kata": "shoulder", "kemuri": "smoke", "kemu": "smoke",
           "tuno": "horn", "tsuno": "horn", "toge": "spike", "ke": "fur", "kami": "hair", "tsume": "claw",
           "tume": "claw", "kao": "face", "tosaka": "crest", "ago": "jaw", "hiza": "knee", "sebire": "dorsal fin",
           "yubi": "finger", "migi": "right", "hidari": "left", "senaka": "back", "kara": "shell", "me": "eye"}

README = """Battle sprite art: {name}
==========================================

These are the pictures the game draws {name}'s battle sprite from. Edit them in a pixel-art
editor (Aseprite, LibreSprite, GIMP) and import them on the Pokemon editor's page (Art, Battle
sprite, Import). You can import any of them: one sheet, both, the stills, the shiny palette.

The files
---------
{files}
normal.pal, shiny.pal     the palettes (JASC, which Aseprite's Load Palette and GIMP read)
*_shiny.png               the same pictures in the shiny colours
guide/*.png               each sheet 3x with every piece's rectangle outlined and numbered,
                          and a list of the pieces (the parts they belong to): not imported
preview/*.png             the assembled sprite (first frame), normal and shiny: not imported

How the sprite is built
-----------------------
The animated sprite (battle, summary, Pokedex, trade, evolution) is cut from the 256x128 sheets:
each numbered rectangle on the guide is a piece (a head, an ear, a foot...) that the game cuts out,
moves, turns and layers to make every frame. The rig (where the pieces go and how they move) is kept
as it is, so:

- Keep every piece inside its rectangle. Pixels outside all rectangles are never shown (the
  importer warns about changed ones). A rectangle's edges can be drawn to, but the piece turns
  about its pivot, so stay close to the original's shape and size.
- Keep the sheets 256x128 and the stills 96x96.
- 16 colours at most, and index 0 is transparent. All the pictures of a sprite (front, back,
  female, stills) share one palette: change a colour in one and it changes in all.
- To recolour, change the palette (Aseprite: the palette's colour; GIMP: Colours > Map > Palette)
  and keep the PNG indexed; drawing with a new colour in an indexed PNG at an unused index works
  too. RGB(A) PNGs are fine as long as their colours fit the palette (16 at most).
- The shiny palette recolours the same indices: edit shiny.pal, or the colours of a *_shiny.png
  (the importer reads each index's shiny colour from under its pixels). It must keep 16 colours.
- The 96x96 stills (front_single, back_single) are what the PC boxes, Pokedex list and other 2D
  screens show. The importer can draw them from the sheets (the first frame, centred), or import
  your own. The originals are that first frame, often with a few pixels touched up.
{female}{spinda}
Sizes: sheets {sheet_w}x{sheet_h}, stills 96x96. The guide's legend gives each piece's rectangle as
x,y width x height on the sheet.
"""


class ArtError(Exception):
    pass


def folder_of(species: str, form: int) -> Path:
    """The art folder of a species (its directory or constant) or of its form."""
    name = species.removeprefix("SPECIES_").lower() if species.startswith("SPECIES_") else species
    folder = (POKEMON / name).resolve()
    if POKEMON.resolve() not in folder.parents or not (folder / "data.json").is_file():
        raise ArtError(f"{species} isn't a species of res/pokemon")
    if form:
        folder = folder / f"form_{form}"
        if not (folder / "front.png").is_file():
            raise ArtError(f"{name}'s form {form} has no art of its own (form_{form}/): it is drawn as its species")
    if not all((folder / f"{side}.png").is_file() and (folder / f"{side}_info.bin").is_file() for side in mcss.SIDES):
        raise ArtError(f"{folder.relative_to(POKEMON.parent.parent)} has no battle sprite")
    return folder


def rel(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT.resolve()).as_posix()
    except ValueError:
        return path.as_posix()


# --- reading PNGs and palettes ------------------------------------------------------------------------------------

class Picture:
    """A PNG as its pixels: for an indexed one its indices and palette, else colours. transparent marks the pixels
    shown as nothing."""

    def __init__(self, width, height, indices=None, palette=None, colours=None, transparent=None):
        self.width, self.height = width, height
        self.indices, self.palette, self.colours = indices, palette, colours
        self.transparent = transparent

    def colour(self, i):
        """A pixel's colour as the DS's 5-bit one, or None where transparent."""
        if self.transparent[i]:
            return None
        if self.indices is not None:
            index = self.indices[i]
            return color5(self.palette[index]) if index < len(self.palette) else None
        return self.colours[i]


def read_png(data: bytes, label: str) -> Picture:
    """Any non-interlaced PNG: indexed (1, 2, 4 or 8 bits, with tRNS), grey, RGB or RGBA (8 or 16 bits)."""
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ArtError(f"{label}: not a PNG")
    cursor, image, palette, alpha = 8, bytearray(), [], b""
    header = None
    while cursor + 8 <= len(data):
        size, kind = struct.unpack_from(">I4s", data, cursor)
        payload = data[cursor + 8:cursor + 8 + size]
        cursor += 12 + size
        if kind == b"IHDR":
            header = struct.unpack(">IIBBBBB", payload)
        elif kind == b"PLTE":
            palette = [tuple(payload[i:i + 3]) for i in range(0, len(payload) - 2, 3)]
        elif kind == b"tRNS":
            alpha = payload
        elif kind == b"IDAT":
            image.extend(payload)
        elif kind == b"IEND":
            break
    if header is None:
        raise ArtError(f"{label}: a PNG without its header")
    width, height, depth, kind, _, _, interlace = header
    if interlace:
        raise ArtError(f"{label}: an interlaced PNG; save it without interlacing")
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}.get(kind)
    if channels is None:
        raise ArtError(f"{label}: an unknown PNG colour type {kind}")
    try:
        raw = zlib.decompress(bytes(image))
    except zlib.error as error:
        raise ArtError(f"{label}: its image data is damaged ({error})") from error
    if depth < 8:
        stride = (width * depth + 7) // 8
        rows = unfilter_png(raw, stride, height, 1, label)
        values = []
        per = 8 // depth
        for y in range(height):
            row = rows[y * stride:(y + 1) * stride]
            for x in range(width):
                byte = row[x // per]
                values.append(byte >> (8 - depth * (x % per + 1)) & ((1 << depth) - 1))
    else:
        size = depth // 8
        rows = unfilter_png(raw, width, height, channels * size, label)
        values = list(rows[::size]) if size == 2 else list(rows)
        if size == 2 and kind == 3:
            raise ArtError(f"{label}: a 16-bit indexed PNG isn't possible")
    count = width * height
    if kind == 3:
        indices = bytes(values[:count])
        if not palette:
            raise ArtError(f"{label}: an indexed PNG without its palette")
        clear = {i for i, a in enumerate(alpha) if a < 128}
        return Picture(width, height, indices=indices, palette=palette,
                       transparent=[i == 0 or i in clear for i in indices])
    colours, transparent = [], []
    key = None
    if alpha and kind in (0, 2):
        key = tuple(struct.unpack(">" + "H" * (len(alpha) // 2), alpha))
    for i in range(count):
        pixel = values[i * channels:(i + 1) * channels]
        if kind in (0, 4):
            rgb = (pixel[0],) * 3
        else:
            rgb = tuple(pixel[:3])
        a = pixel[-1] if kind in (4, 6) else 255
        if key is not None and (tuple(pixel[:len(key)]) == key if depth == 8 else False):
            a = 0
        colours.append(color5(rgb))
        transparent.append(a < 128)
    return Picture(width, height, colours=colours, transparent=transparent)


def read_jasc(data: bytes, label: str) -> list:
    lines = data.decode("ascii", "replace").splitlines()
    if lines[:2] != ["JASC-PAL", "0100"] or len(lines) < 3:
        raise ArtError(f"{label}: not a JASC palette (JASC-PAL, 0100, a count, then a colour a line)")
    try:
        colours = [tuple(int(v) for v in line.split()[:3]) for line in lines[3:3 + int(lines[2])] if line.strip()]
    except ValueError as error:
        raise ArtError(f"{label}: a colour that isn't three numbers") from error
    if any(len(c) != 3 or not all(0 <= v <= 255 for v in c) for c in colours):
        raise ArtError(f"{label}: a colour outside 0 to 255")
    return colours


def expand(colour5) -> tuple:
    """A 5-bit colour as res/'s palettes write it (nitro_2d.palette_colors)."""
    return tuple(v * 255 // 31 for v in colour5)


# --- the group as it is -------------------------------------------------------------------------------------------

class Group:
    """A species' or form's art as it is in res/."""

    def __init__(self, folder: Path):
        self.folder = folder
        self.normal = read_palette(folder / "normal.pal")
        self.shiny = read_palette(folder / "shiny.pal")
        if len(self.normal) != COLOURS or len(self.shiny) != COLOURS:
            raise ArtError(f"{rel(folder)}: normal.pal and shiny.pal must have {COLOURS} colours")
        self.images = {}
        for name in IMAGES:
            path = folder / f"{name}.png"
            if path.is_file():
                width, height, pixels, _ = read_indexed_png(path)
                self.images[name] = pixels
        self.rigs = {side: mcss.read_rig(folder, side) for side in mcss.SIDES}

    def sides(self):
        return [name for name in SHEETS if name in self.images]


def side_of(name: str) -> str:
    return "front" if name.startswith("front") else "back"


def sheet_of_still(still: str) -> str:
    return still.replace("_single", "")


# --- the guide and previews ---------------------------------------------------------------------------------------

FONT = {
    "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111",
    "4": "101101111001001", "5": "111100111001111", "6": "111100111101111", "7": "111001010010010",
    "8": "111101111101111", "9": "111101111001111", "a": "010101111101101", "b": "110101110101110",
    "c": "011100100100011", "d": "110101101101110", "e": "111100110100111", "f": "111100110100100",
    "g": "011100101101011", "h": "101101111101101", "i": "111010010010111", "j": "001001001101010",
    "k": "101101110101101", "l": "100100100100111", "m": "101111111101101", "n": "110101101101101",
    "o": "010101101101010", "p": "110101110100100", "q": "010101101110011", "r": "110101110101101",
    "s": "011100010001110", "t": "111010010010010", "u": "101101101101111", "v": "101101101101010",
    "w": "101101111111101", "x": "101101010101101", "y": "101101010010010", "z": "111001010100111",
    "_": "000000000000111", "-": "000000111000000", "+": "000010111010000", "(": "010100100100010",
    ")": "010001001001010", ",": "000000000010100", ".": "000000000000010", ":": "000010000010000",
    "/": "001001010100100", "=": "000111000111000", " ": "000000000000000", "?": "111001010000010",
}


class Canvas:
    def __init__(self, width, height, colour=(0, 0, 0, 0)):
        self.width, self.height = width, height
        self.pixels = bytearray(bytes(colour) * width * height)

    def put(self, x, y, colour):
        if 0 <= x < self.width and 0 <= y < self.height:
            self.pixels[(y * self.width + x) * 4:(y * self.width + x) * 4 + 4] = bytes(colour)

    def rect(self, x0, y0, x1, y1, colour):
        for x in range(x0, x1 + 1):
            self.put(x, y0, colour)
            self.put(x, y1, colour)
        for y in range(y0, y1 + 1):
            self.put(x0, y, colour)
            self.put(x1, y, colour)

    def fill(self, x0, y0, x1, y1, colour):
        for y in range(max(y0, 0), min(y1, self.height - 1) + 1):
            for x in range(max(x0, 0), min(x1, self.width - 1) + 1):
                self.put(x, y, colour)

    def text(self, x, y, text, colour, scale=2, background=None):
        width = len(text) * 4 * scale
        if background:
            self.fill(x - 1, y - 1, x + width - scale, y + 5 * scale, background)
        for k, char in enumerate(text.lower()):
            glyph = FONT.get(char, FONT["?"])
            for bit, on in enumerate(glyph):
                if on == "1":
                    gx, gy = bit % 3, bit // 3
                    for dy in range(scale):
                        for dx in range(scale):
                            self.put(x + k * 4 * scale + gx * scale + dx, y + gy * scale + dy, colour)

    def png(self) -> bytes:
        return write_rgba_png(self.width, self.height, bytes(self.pixels))


def hue(k: int) -> tuple:
    """A bright colour per cell, for the guide's outlines."""
    h = (k * 0.618034) % 1.0
    i, f = int(h * 6), h * 6 % 1
    q, t = 1 - f, f
    r, g, b = [(1, t, 0), (q, 1, 0), (0, 1, t), (0, q, 1), (t, 0, 1), (1, 0, q)][i]
    return (int(r * 255), int(g * 255), int(b * 255), 255)


def gloss(name: str) -> str:
    words = [w for w in name.split("_") if w]
    english = [GLOSSES[w] for w in words if w in GLOSSES]
    return f"{name} ({' '.join(english)})" if english else name


def guide(rig: dict, pixels: bytes, palette: list, title: str) -> bytes:
    """The sheet GUIDE_SCALE times its size, each cell's rectangles outlined in its colour and numbered (a cell's
    second quad, drawn over its first, marked with a +), beside a legend of the cells and their parts."""
    width, height = mcss.SHEET_SIZE
    scale = GUIDE_SCALE
    rows = [(number, quads, names) for number, (quads, names) in enumerate(zip(rig["cells"], rig["parts"]))]
    legend_height = 34 + 13 * sum(len(quads) for _, quads, _ in rows)
    canvas = Canvas(width * scale + LEGEND_WIDTH, max(height * scale, legend_height), (40, 40, 48, 255))
    for y in range(height):
        for x in range(width):
            index = pixels[y * width + x]
            colour = (*expand(color5(palette[index])), 255) if index else (
                (205, 205, 210, 255) if (x // 4 + y // 4) % 2 else (225, 225, 230, 255))
            canvas.fill(x * scale, y * scale, x * scale + scale - 1, y * scale + scale - 1, colour)
    for number, quads, _ in rows:
        colour = hue(number)
        for k, quad in enumerate(quads):
            x0, y0 = int(quad["s"]) * scale, int(quad["t"]) * scale
            x1, y1 = x0 + int(quad["w"]) * scale - 1, y0 + int(quad["h"]) * scale - 1
            canvas.rect(x0, y0, x1, y1, colour)
            if k:
                canvas.rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, colour)
    for number, quads, _ in rows:
        for k, quad in enumerate(quads):
            label = f"{number}{'+' if k else ''}"
            x0, y0 = int(quad["s"]) * scale + 2, int(quad["t"]) * scale + 2
            canvas.text(x0, y0, label, (255, 255, 255, 255), 2 if quad["w"] * scale >= len(label) * 8 + 4 else 1,
                        (0, 0, 0, 255))
    x = width * scale + 8
    canvas.text(x, 6, title[:36], (255, 255, 255, 255), 2)
    canvas.text(x, 20, "piece  x,y  w x h   parts", (170, 170, 180, 255), 1)
    y = 30
    for number, quads, names in rows:
        for k, quad in enumerate(quads):
            parts = ", ".join(gloss(n) for n in names) or "unused"
            line = (f"{number}{'+' if k else ''} {int(quad['s'])},{int(quad['t'])} "
                    f"{int(quad['w'])}x{int(quad['h'])} {'(over ' + str(number) + ')' if k else parts}")
            canvas.fill(x, y + 1, x + 7, y + 8, hue(number))
            canvas.text(x + 12, y, line[:70], (235, 235, 240, 255), 1 if len(line) > 36 else 2)
            y += 13
    return canvas.png()


def colourise(width, height, pixels, palette, background=None) -> bytes:
    """Indices as an RGBA PNG in a palette of 5-bit colours."""
    rgba = bytearray()
    for index in pixels:
        if index:
            rgba += bytes((*expand(palette[index]), 255))
        else:
            rgba += bytes(background or (0, 0, 0, 0))
    return write_rgba_png(width, height, bytes(rgba))


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def animation_preview(rig: dict, sheets: dict[str, bytes], normal: list, shiny: list, current: dict[str, bytes],
                      current_normal: list) -> dict:
    """A side's animation (the "stay" sequence, a frame every 4 game frames) in each of its sheets, as strips of
    frames on one canvas, normal and shiny, with the current art's first frame for comparison."""
    times = mcss.frame_times(rig, 0, 4, 90)
    # Each frame drawn once on its own canvas; the strip's canvas is the union of their visible pixels (not of the
    # quads, which a part hidden far away or a sheet's empty corners would stretch)
    frames = {name: [mcss.render(rig, sheet, 0, time) for time in times] for name, sheet in sheets.items()}
    frames[None] = [mcss.render(rig, sheet, 0, 0) for sheet in current.values()]
    left = top = right = bottom = None
    for drawn in frames.values():
        for width, _, origin_x, origin_y, pixels in drawn:
            for i, index in enumerate(pixels):
                if index:
                    x, y = i % width - origin_x, i // width - origin_y
                    left = x if left is None else min(left, x)
                    right = x if right is None else max(right, x)
                    top = y if top is None else min(top, y)
                    bottom = y if bottom is None else max(bottom, y)
    if left is None:
        left = top = right = bottom = 0
    left, top, right, bottom = left - 2, top - 2, right + 3, bottom + 3
    width, height = right - left, bottom - top

    def blit(target, target_width, offset, drawn):
        frame_width, frame_height, origin_x, origin_y, pixels = drawn
        for y in range(frame_height):
            ty = y - origin_y - top
            if not 0 <= ty < height:
                continue
            for x in range(frame_width):
                index = pixels[y * frame_width + x]
                tx = x - origin_x - left
                if index and 0 <= tx < width:
                    target[ty * target_width + offset + tx] = index

    out = {"width": width, "height": height, "origin": [-left, -top], "frames": len(times), "step": 4, "sheets": {}}
    for number, (name, sheet) in enumerate(sheets.items()):
        strip = bytearray(width * len(times) * height)
        for k, drawn in enumerate(frames[name]):
            blit(strip, width * len(times), k * width, drawn)
        before = bytearray(width * height)
        blit(before, width, 0, frames[None][number])
        out["sheets"][name] = {"normal": b64(colourise(width * len(times), height, strip, normal)),
                               "shiny": b64(colourise(width * len(times), height, strip, shiny)),
                               "current": b64(colourise(width, height, before, current_normal))}
    return out


def still_from_sheet(rig: dict, sheet: bytes, current: bytes | None) -> tuple[bytes, bool]:
    """The 96 by 96 still drawn from a sheet: the first frame's visible pixels where the current still has its own
    when they are the same size, else centred. Returns the pixels and whether it had to be cut to fit."""
    width, height, _, _, pixels = mcss.render(rig, sheet, 0, 0)
    shown = [(i % width, i // width) for i, v in enumerate(pixels) if v]
    out = bytearray(96 * 96)
    if not shown:
        return bytes(out), False
    x0, y0 = min(p[0] for p in shown), min(p[1] for p in shown)
    x1, y1 = max(p[0] for p in shown), max(p[1] for p in shown)
    box_w, box_h = x1 - x0 + 1, y1 - y0 + 1
    at = None
    if current is not None:
        old = [(i % 96, i // 96) for i, v in enumerate(current) if v]
        if old:
            ox0, oy0 = min(p[0] for p in old), min(p[1] for p in old)
            ox1, oy1 = max(p[0] for p in old), max(p[1] for p in old)
            if (ox1 - ox0 + 1, oy1 - oy0 + 1) == (box_w, box_h):
                at = (ox0, oy0)
    if at is None:
        at = ((96 - box_w) // 2, (96 - box_h) // 2)
    cut = False
    for x, y in shown:
        tx, ty = at[0] + x - x0, at[1] + y - y0
        if 0 <= tx < 96 and 0 <= ty < 96:
            out[ty * 96 + tx] = pixels[y * width + x]
        else:
            cut = True
    return bytes(out), cut


# --- export -------------------------------------------------------------------------------------------------------

IMAGE_TEXT = {"front": "the front sheet, 256x128", "back": "the back sheet, 256x128",
              "front_female": "the female's front sheet, 256x128", "back_female": "the female's back sheet, 256x128",
              "front_single": "the front still, 96x96", "back_single": "the back still, 96x96",
              "front_single_female": "the female's front still, 96x96",
              "back_single_female": "the female's back still, 96x96"}


def display_name(folder: Path) -> str:
    """A group's name for people: its species' name, and its form's Pokédex name (Pichu (Spiky-eared))."""
    species = folder.parent if folder.name.startswith("form_") else folder
    try:
        data = json.loads((species / "data.json").read_text())
    except (OSError, ValueError):
        return folder.name
    name = str(data.get("name") or species.name)
    if species != folder:
        form = int(folder.name[5:])
        forms = data.get("pokedex", {}).get("forms", [])
        name += f" ({forms[form - 1].get('name', f'form {form}')})" if form <= len(forms) else f" (form {form})"
    return name


def export(folder: Path, out: Path) -> dict:
    group = Group(folder)
    name = display_name(folder)
    stem = f"{folder.parent.name}_{folder.name}" if folder.name.startswith("form_") else folder.name
    files = {}
    for image in IMAGES:
        if image not in group.images:
            continue
        files[f"{image}.png"] = (folder / f"{image}.png").read_bytes()
        width, height = SIZES[image]
        files[f"{image}_shiny.png"] = write_indexed_png(width, height, group.images[image], group.shiny)
    files["normal.pal"] = (folder / "normal.pal").read_bytes()
    files["shiny.pal"] = (folder / "shiny.pal").read_bytes()
    for sheet in group.sides():
        rig = group.rigs[side_of(sheet)]
        files[f"guide/{sheet}.png"] = guide(rig, group.images[sheet], group.normal, f"{name} {sheet.replace('_', ' ')}")
        width, height, _, _, pixels = mcss.render(rig, group.images[sheet], 0, 0)
        preview_normal = colourise(width, height, pixels, [color5(c) for c in group.normal], (255, 255, 255, 255))
        preview_shiny = colourise(width, height, pixels, [color5(c) for c in group.shiny], (255, 255, 255, 255))
        files[f"preview/{sheet}.png"] = preview_normal
        files[f"preview/{sheet}_shiny.png"] = preview_shiny
    listing = "\n".join(f"{n + '.png':26}{IMAGE_TEXT[n]}" for n in IMAGES if n in group.images)
    female = ("- The female pictures use the same rig and palette as the male ones: keep their pieces in the\n"
              "  same rectangles.\n") if "front_female" in group.images else ""
    spinda = ("- Spinda: the game paints its spots onto the front sheet's head at fixed pixels, so keep the\n"
              "  head where it is.\n") if folder.name == "spinda" else ""
    files["README.txt"] = README.format(name=name, files=listing, female=female, spinda=spinda,
                                        sheet_w=mcss.SHEET_SIZE[0], sheet_h=mcss.SHEET_SIZE[1]).encode()
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        for path, data in files.items():
            info = zipfile.ZipInfo(f"{stem}_battle_sprite/{path}", date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data)
    return {"ok": True, "message": f"Exported {len(files)} files of {rel(folder)}", "zip": str(out),
            "name": f"{stem}_battle_sprite.zip", "files": sorted(files)}


# --- check and import ---------------------------------------------------------------------------------------------

def gather(paths: list[Path]) -> tuple[list[tuple[str, bytes]], list[str]]:
    """The files to import, a zip's members among them, by their names, and what was ignored."""
    out, ignored = [], []
    for path in paths:
        data = path.read_bytes()
        if data.startswith(b"PK"):
            try:
                with zipfile.ZipFile(io.BytesIO(data)) as archive:
                    for member in archive.infolist():
                        if member.is_dir():
                            continue
                        parts = member.filename.replace("\\", "/").split("/")
                        if any(p in ("guide", "preview", "__MACOSX") for p in parts[:-1]) or parts[-1].startswith("."):
                            ignored.append(member.filename)
                            continue
                        out.append((parts[-1], archive.read(member)))
            except zipfile.BadZipFile as error:
                raise ArtError(f"{path.name}: not a zip ({error})") from error
        else:
            out.append((path.name, data))
    return out, ignored


def role(name: str) -> tuple[str, str] | None:
    """What a file is: ("image", name), ("shiny", image), ("pal", normal|shiny), or None."""
    lower = name.lower()
    if lower in ("normal.pal", "shiny.pal"):
        return "pal", lower[:-4]
    if not lower.endswith(".png"):
        return None
    stem = lower[:-4]
    if stem in IMAGES:
        return "image", stem
    if stem.endswith("_shiny") and stem[:-6] in IMAGES:
        return "shiny", stem[:-6]
    return None


def resolve(group: Group, uploads: list[tuple[str, bytes]], stills_from_sheets: bool):
    """The art after the uploads: images (indices), the normal and shiny palettes, and the errors, warnings and
    notes about it."""
    errors, warnings, notes = [], [], []
    images, shinies, palettes = {}, {}, {}
    new_indices = set()
    for name, data in uploads:
        what = role(name)
        if what is None:
            if name.lower() != "readme.txt":
                warnings.append(f"{name}: not one of the sprite's files, ignored (name them as the export does)")
            continue
        kind, target = what
        bucket = {"image": images, "shiny": shinies, "pal": palettes}[kind]
        if target in bucket:
            errors.append(f"{name}: given twice")
            continue
        try:
            bucket[target] = read_jasc(data, name) if kind == "pal" else read_png(data, name)
        except ArtError as error:
            errors.append(str(error))
    for target in list(images) + list(shinies):
        if target not in group.images:
            errors.append(f"{target}.png: {rel(group.folder)} has no {target.replace('_', ' ')} "
                          f"(its group has no file for it in the game, so the build can't add one)")
            images.pop(target, None)
            shinies.pop(target, None)
    for target, picture in list(images.items()) + [(f"{t}_shiny", p) for t, p in shinies.items()]:
        size = SIZES[target.removesuffix("_shiny")]
        if (picture.width, picture.height) != size:
            errors.append(f"{target}.png: {picture.width} by {picture.height} pixels, not {size[0]} by {size[1]}")
            images.pop(target, None)
            shinies.pop(target.removesuffix("_shiny"), None)
    if stills_from_sheets:
        for still in STILLS:
            if still in images:
                errors.append(f"{still}.png: given, and the stills are to be drawn from the sheets: choose one")

    # The normal palette: normal.pal's, then the recolourings of indexed PNGs (an index below 16 in a colour the
    # palette doesn't have)
    normal = [color5(c) for c in group.normal]
    if "normal" in palettes:
        given = palettes["normal"]
        if len(given) < COLOURS:
            errors.append(f"normal.pal: {len(given)} colours, not {COLOURS}")
        else:
            if len(given) > COLOURS:
                notes.append(f"normal.pal: {len(given)} colours; the first {COLOURS} are used")
            normal = [color5(c) for c in given[:COLOURS]]
    recolour: dict[int, tuple] = {}
    recolour_from: dict[int, str] = {}
    for target, picture in images.items():
        if picture.indices is None:
            continue
        used = sorted({picture.indices[i] for i in range(len(picture.indices)) if not picture.transparent[i]})
        for index in used:
            colour = color5(picture.palette[index]) if index < len(picture.palette) else None
            if colour is None:
                errors.append(f"{target}.png: index {index} is past its palette")
                continue
            if index < COLOURS and normal[index] != colour and colour not in normal[1:]:
                if index in recolour and recolour[index] != colour:
                    errors.append(f"{recolour_from[index]}.png and {target}.png give colour {index} different colours: "
                                  "the front, back and stills share one palette")
                    continue
                recolour[index] = colour
                recolour_from[index] = target
    for index, colour in recolour.items():
        normal[index] = colour

    # Every image's pixels as indices of the palette
    resolved = {name: pixels for name, pixels in group.images.items()}
    pending = {}
    for target, picture in images.items():
        out = bytearray(picture.width * picture.height)
        unmatched = {}
        reordered = False
        for i in range(len(out)):
            if picture.transparent[i]:
                continue
            colour = picture.colour(i)
            if colour is None:
                continue
            if picture.indices is not None and picture.indices[i] < COLOURS and normal[picture.indices[i]] == colour:
                out[i] = picture.indices[i]
                continue
            if picture.indices is None and colour == normal[0]:
                continue
            if colour in normal[1:]:
                out[i] = normal.index(colour, 1)
                reordered = reordered or picture.indices is not None
                continue
            unmatched.setdefault(colour, []).append(i)
        if reordered:
            notes.append(f"{target}.png: its palette's order isn't the sprite's; its colours were matched to the "
                         "sprite's indices")
        pending[target] = (out, unmatched)
        resolved[target] = bytes(out)
    # New colours take indices no image uses
    new_colours = {}
    for target, (_, unmatched) in pending.items():
        for colour in unmatched:
            new_colours.setdefault(colour, []).append(target)
    if new_colours:
        used = set()
        for pixels in resolved.values():
            used |= set(pixels)
        free = [i for i in range(1, COLOURS) if i not in used and i not in recolour]
        if len(new_colours) > len(free):
            errors.append(f"{len(new_colours)} colours aren't in the palette and only {len(free)} indices are free: "
                          f"the sprite would have more than {COLOURS - 1} colours besides transparent (as 5-bit RGB: "
                          f"{', '.join(str(c) for c in list(new_colours)[:6])})")
        else:
            for colour, index in zip(new_colours, free):
                normal[index] = colour
                new_indices.add(index)
                warnings.append(f"Colour {colour_text(colour)} is new: it takes the free index {index} "
                                f"({', '.join(t + '.png' for t in new_colours[colour])}); set its shiny colour")
                for target in new_colours[colour]:
                    out, unmatched = pending[target]
                    for i in unmatched[colour]:
                        out[i] = index
                    resolved[target] = bytes(out)

    # The stills drawn from the sheets
    if stills_from_sheets and not errors:
        for still in STILLS:
            if still not in group.images:
                continue
            sheet = sheet_of_still(still)
            pixels, cut = still_from_sheet(group.rigs[side_of(sheet)], resolved[sheet], group.images[still])
            resolved[still] = pixels
            if cut:
                warnings.append(f"{still}.png: the first frame is bigger than 96 by 96, so its edges were cut")

    # The shiny palette: shiny.pal's, then each shiny copy's colour under each index
    shiny = [color5(c) for c in group.shiny]
    if "shiny" in palettes:
        given = palettes["shiny"]
        if len(given) < COLOURS:
            errors.append(f"shiny.pal: {len(given)} colours, not the {COLOURS} of the normal palette")
        else:
            if len(given) > COLOURS:
                notes.append(f"shiny.pal: {len(given)} colours; the first {COLOURS} are used")
            shiny = [color5(c) for c in given[:COLOURS]]
    # Each copy gives the shiny colours it changes; two copies changing one colour must agree
    base_shiny = list(shiny)
    shiny_from: dict[int, tuple[tuple, str]] = {}
    for target, picture in shinies.items():
        found, problem = shiny_copy_colours(picture, group.images[target], resolved[target])
        if problem:
            errors.append(f"{target}_shiny.png: {problem}")
            continue
        for index, colour in found.items():
            if colour == base_shiny[index]:
                continue
            if index in shiny_from and shiny_from[index][0] != colour:
                errors.append(f"{shiny_from[index][1]} and {target}_shiny.png give shiny colour {index} different "
                              "colours")
                continue
            shiny_from[index] = (colour, f"{target}_shiny.png")
    for index, (colour, _) in shiny_from.items():
        shiny[index] = colour
    return resolved, normal, shiny, new_indices, errors, warnings, notes


def shiny_copy_colours(picture: Picture, current: bytes, new: bytes) -> tuple[dict[int, tuple], str | None]:
    """The shiny colour of each index from a shiny copy: an indexed copy with the pixels' indices (of the art as it
    was exported, or as imported) gives its palette's colours; any other, the colour under each index's pixels, which
    must be one colour per index."""
    count = picture.width * picture.height
    if picture.indices is not None and len(picture.palette) >= 2:
        for base in (current, new):
            shown = [i for i in range(count) if base[i]]
            if shown and sum(picture.indices[i] == base[i] for i in shown) >= 0.95 * len(shown):
                used = {base[i] for i in shown}
                return {index: color5(picture.palette[index]) for index in used if index < len(picture.palette)}, None
    problem = None
    for base in (current, new):
        found: dict[int, tuple] = {}
        problem = None
        for i in range(count):
            colour = picture.colour(i)
            if not base[i] or colour is None:
                continue
            if found.setdefault(base[i], colour) != colour:
                problem = (f"colour {base[i]}'s pixels aren't one colour ({colour_text(found[base[i]])} and "
                           f"{colour_text(colour)} at {i % picture.width},{i // picture.width}); recolour its palette, "
                           "not its pixels")
                break
        if problem is None:
            return found, None
    return {}, problem


def colour_text(colour) -> str:
    return "#" + "".join(f"{v:02x}" for v in expand(colour))


def changes(group: Group, resolved: dict, normal: list, shiny: list) -> dict[Path, bytes]:
    """The files to write: each image whose pixels changed, and, when the palette changed, normal.pal and every image
    (their PNGs carry the palette, which the build reads them by); shiny.pal if it changed."""
    writes = {}
    old_normal = [color5(c) for c in group.normal]
    palette_changed = normal != old_normal
    colours = [group.normal[i] if normal[i] == old_normal[i] else expand(normal[i]) for i in range(COLOURS)]
    for name, pixels in resolved.items():
        if pixels != group.images[name] or palette_changed:
            width, height = SIZES[name]
            writes[group.folder / f"{name}.png"] = write_indexed_png(width, height, pixels, colours)
    if palette_changed:
        writes[group.folder / "normal.pal"] = write_palette(colours).encode()
    old_shiny = [color5(c) for c in group.shiny]
    if shiny != old_shiny:
        shiny_colours = [group.shiny[i] if shiny[i] == old_shiny[i] else expand(shiny[i]) for i in range(COLOURS)]
        writes[group.folder / "shiny.pal"] = write_palette(shiny_colours).encode()
    return {path: data for path, data in writes.items() if not path.is_file() or path.read_bytes() != data}


def outside_pixels(rig: dict, before: bytes, after: bytes) -> tuple[int, tuple | None]:
    """The changed pixels that no cell's rectangle covers, which the game never shows: their count and box."""
    width, height = mcss.SHEET_SIZE
    inside = bytearray(width * height)
    for _, _, s, t, w, h in mcss.quad_rectangles(rig):
        for y in range(max(t, 0), min(t + h, height)):
            inside[y * width + max(s, 0):y * width + min(s + w, width)] = b"\x01" * (min(s + w, width) - max(s, 0))
    found = [i for i in range(width * height) if before[i] != after[i] and not inside[i]]
    if not found:
        return 0, None
    xs, ys = [i % width for i in found], [i // width for i in found]
    return len(found), (min(xs), min(ys), max(xs), max(ys))


def sheet_preview(rig: dict, before: bytes, after: bytes, palette: list) -> bytes:
    """A sheet in its colours, the cells' rectangles outlined, and the changed pixels outside them in red."""
    width, height = mcss.SHEET_SIZE
    canvas = Canvas(width, height, (0, 0, 0, 0))
    for i, index in enumerate(after):
        if index:
            canvas.pixels[i * 4:i * 4 + 4] = bytes((*expand(palette[index]), 255))
    for number, _, s, t, w, h in mcss.quad_rectangles(rig):
        colour = hue(number)
        canvas.rect(s, t, s + w - 1, t + h - 1, (colour[0], colour[1], colour[2], 150))
    count, _ = outside_pixels(rig, before, after)
    if count:
        inside = set()
        for _, _, s, t, w, h in mcss.quad_rectangles(rig):
            inside |= {y * width + x for y in range(t, t + h) for x in range(s, s + w)}
        for i in range(width * height):
            if before[i] != after[i] and i not in inside:
                canvas.pixels[i * 4:i * 4 + 4] = bytes((255, 0, 0, 255))
    return canvas.png()


def check(folder: Path, paths: list[Path], stills_from_sheets: bool, write: bool, preview: bool = True) -> dict:
    group = Group(folder)
    uploads, ignored = gather(paths)
    resolved, normal, shiny, new_indices, errors, warnings, notes = resolve(group, uploads, stills_from_sheets)
    if ignored:
        notes.append(f"Ignored {len(ignored)} files of guide/ and preview/ (they're for reading, not importing)")
    given = sorted({role(n)[1] + ("_shiny" if role(n)[0] == "shiny" else "") if role(n) and role(n)[0] != "pal"
                    else n.lower() for n, _ in uploads if role(n)})
    for sheet in group.sides():
        count, box = outside_pixels(group.rigs[side_of(sheet)], group.images[sheet], resolved[sheet])
        if count:
            warnings.append(f"{sheet}.png: {count} changed pixels are outside every piece's rectangle (in {box[0]},"
                            f"{box[1]} to {box[2]},{box[3]}), where the game never shows them: keep each piece "
                            "inside its rectangle (the export's guide)")
        if not any(resolved[sheet]):
            warnings.append(f"{sheet}.png: it is empty (every pixel transparent)")
    old_normal = [color5(c) for c in group.normal]
    old_shiny = [color5(c) for c in group.shiny]
    for index in range(1, COLOURS):
        if normal[index] != old_normal[index]:
            notes.append(f"Colour {index}: {colour_text(old_normal[index])} to {colour_text(normal[index])}, in every "
                         "picture of the sprite")
            if shiny[index] == old_shiny[index] and index not in new_indices:
                warnings.append(f"Colour {index} changed in the normal palette but not in the shiny one")
        if shiny[index] != old_shiny[index]:
            notes.append(f"Shiny colour {index}: {colour_text(old_shiny[index])} to {colour_text(shiny[index])}")
    used = set()
    for pixels in resolved.values():
        used |= set(pixels)
    used.discard(0)
    notes.append(f"The sprite uses {len(used)} of its {COLOURS - 1} colours besides transparent")
    if folder.name == "spinda" and resolved["front"] != group.images["front"]:
        warnings.append("Spinda: the game paints its spots onto the front sheet at fixed pixels (mcss_tool.c), so "
                        "keep its head where it is")
    writes = {} if errors else changes(group, resolved, normal, shiny)
    if write and not errors:
        for path, data in writes.items():
            with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as temporary:
                temporary.write(data)
            Path(temporary.name).replace(path)
    result = {"ok": not errors, "check": not write, "folder": rel(folder), "given": given, "errors": errors,
              "warnings": warnings, "notes": notes, "changed": sorted(rel(p) for p in writes)}
    if errors:
        result["message"] = f"Can't import: {errors[0]}" + (f" (and {len(errors) - 1} more)" if len(errors) > 1 else "")
    elif not writes:
        result["message"] = "Nothing changes: the art is the same as the sprite's"
    else:
        result["message"] = f"{'Wrote' if write else 'Writes'} {len(writes)} files"
    if preview and not errors:
        palette_normal, palette_shiny = normal, shiny
        sides = {}
        for side in mcss.SIDES:
            sheets = {name: resolved[name] for name in group.sides() if side_of(name) == side}
            sides[side] = animation_preview(group.rigs[side], sheets, palette_normal, palette_shiny,
                                            {name: group.images[name] for name in sheets},
                                            [color5(c) for c in group.normal])
        result["preview"] = {
            "sides": sides,
            "stills": {name: {"normal": b64(colourise(96, 96, resolved[name], palette_normal)),
                              "shiny": b64(colourise(96, 96, resolved[name], palette_shiny)),
                              "changed": resolved[name] != group.images[name]}
                       for name in STILLS if name in resolved},
            "sheets": {name: {"image": b64(sheet_preview(group.rigs[side_of(name)], group.images[name],
                                                         resolved[name], palette_normal)),
                              "changed": resolved[name] != group.images[name]}
                       for name in group.sides()},
            "palettes": {"normal": [colour_text(c) for c in palette_normal],
                         "shiny": [colour_text(c) for c in palette_shiny]},
        }
    return result


def info(folder: Path) -> dict:
    """What the group has, and whether its sheets are another group's (a form's copy of its species')."""
    group = Group(folder)
    out = {"ok": True, "folder": rel(folder), "images": [n for n in IMAGES if n in group.images],
           "cells": {side: len(group.rigs[side]["cells"]) for side in mcss.SIDES}}
    if folder.name.startswith("form_"):
        species = folder.parent
        out["copyOfSpecies"] = all((folder / f"{side}.png").read_bytes() == (species / f"{side}.png").read_bytes()
                                   for side in mcss.SIDES if (species / f"{side}.png").is_file())
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("export", "check", "import", "info"):
        p = commands.add_parser(name)
        p.add_argument("species")
        p.add_argument("--form", type=int, default=0)
        if name == "export":
            p.add_argument("out", type=Path)
        elif name != "info":
            p.add_argument("files", type=Path, nargs="*")
            p.add_argument("--stills-from-sheets", action="store_true")
            p.add_argument("--no-preview", action="store_true")
    args = parser.parse_args()
    try:
        folder = folder_of(args.species, args.form)
        if args.command == "export":
            result = export(folder, args.out)
        elif args.command == "info":
            result = info(folder)
        else:
            result = check(folder, args.files, args.stills_from_sheets, args.command == "import", not args.no_preview)
    except (ArtError, mcss.RigError, ValueError, OSError) as error:
        print(json.dumps({"ok": False, "message": str(error), "errors": [str(error)]}))
        sys.exit(1)
    print(json.dumps(result, ensure_ascii=False))
    if args.command == "import" and not result["ok"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
