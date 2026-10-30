"""Draws a 2D screen of res/graphics: a screen resource (.nscr) laid out with a character resource (an indexed PNG)
and a palette (.pal), as the DS draws a background, written to stdout as an RGB PNG. For modules that show the game's
art, such as the town map behind the Encounter Editor's map.

    screen.py CHARS.png SCREEN.nscr PALETTE.pal

A 4bpp character's pixels index the 16 colors of the entry's palette; an 8bpp one's index 256 colors, of the entry's
extended palette when the palette has more than 256 colors. The PNG's own colors are only a preview, so the palette
file gives the colors, as the build's packer does (tools/data/graphics_archive.py).
"""
import struct
import sys
from pathlib import Path

ROOT = Path.cwd()
sys.path.insert(0, str(ROOT))
from tools.data.nitro_2d import read_indexed_png, read_palette, write_rgba_png  # noqa: E402


def read_screen(path):
    raw = path.read_bytes()
    if raw[:4] != b"RCSN" or raw[16:20] != b"NRCS":
        raise ValueError(f"{path}: not a screen resource")
    width, height = struct.unpack_from("<HH", raw, 24)
    size = struct.unpack_from("<I", raw, 32)[0]
    return width, height, struct.unpack_from(f"<{size // 2}H", raw, 36)


def draw(chars_path, screen_path, palette_path):
    chars_width, chars_height, pixels, _ = read_indexed_png(chars_path)
    width, height, entries = read_screen(screen_path)
    colors = read_palette(palette_path)
    deep = max(pixels) > 15
    per_row = chars_width // 8
    image = bytearray(width * height * 4)
    for i, entry in enumerate(entries[:(width // 8) * (height // 8)]):
        tile, hflip, vflip, palette = entry & 0x3FF, entry >> 10 & 1, entry >> 11 & 1, entry >> 12
        tx, ty = tile % per_row * 8, tile // per_row * 8
        if ty >= chars_height:
            continue
        sx, sy = i % (width // 8) * 8, i // (width // 8) * 8
        base = palette * 256 if deep and len(colors) > 256 else 0 if deep else palette * 16
        for y in range(8):
            row = (ty + (7 - y if vflip else y)) * chars_width + tx
            for x in range(8):
                index = base + pixels[row + (7 - x if hflip else x)]
                r, g, b = colors[index] if index < len(colors) else (0, 0, 0)
                o = ((sy + y) * width + sx + x) * 4
                image[o:o + 4] = bytes((r, g, b, 255))
    return write_rgba_png(width, height, bytes(image))


if __name__ == "__main__":
    sys.stdout.buffer.write(draw(*(ROOT / arg for arg in sys.argv[1:4])))
