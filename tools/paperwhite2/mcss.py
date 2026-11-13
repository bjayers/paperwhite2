#!/usr/bin/env python3
"""Paper White 2: read a battle sprite's rig (MCSS: src/system/mcss.c) from res/pokemon and draw it as the game
does, for the battle sprite importer (battle_sprite.py) and, later, the rig editor
(docs/paperwhite2/design/battle-sprites.md sections 3, 10 and 16).

    mcss.py dump FOLDER front|back      # the rig as this reads it, as JSON

A side's rig is its <side>_rig.json beside its 256 by 128 sheet (front.png or back.png), the source of the five files
the game reads, which mcss_rig.py makes from it as the build does and this reads as the game does:
- <side>_info.bin, MCSS's own: each cell's one or two quads (a rectangle of the sheet, s t width height, placed at x
  y from the cell's origin, y up), the sprite's box, the idle nodes and the stop flags;
- <side>_cells.ncer: the cells as OBJs (not drawn; MCSS uses only the cell numbers) and the parts' names (LABL);
- <side>_animations.nanr.lz11: the cell animations, one sequence per part and pose, of frames giving a cell and an
  SRT (rotation, scale, move) for a number of game frames;
- <side>_multi_cells.nmcr: the multi-cells (poses), each a list of nodes, front to back: a cell animation sequence,
  the part's pivot and its play mode (0 restarts with the multi-cell, 1 goes on from the animation's time);
- <side>_multi_animations.nmar: the animations (sequence 0 the loop the game plays, "stay"), of frames giving a
  multi-cell and an SRT of the whole sprite.

render() draws one frame as palette indices on a canvas whose origin is the sprite's feet, as MCSSSys_Draw and
MCSS_DrawQuad do (section 3.8): each quad's corner (u, v) at (quad.x + u, quad.y - v), through the cell animation's
SRT, then moved to the node's pivot, then through the multi-cell animation's SRT; nodes drawn back to front, a cell's
second quad in front of its first. Pixels are sampled at their centres, nearest, as the DS's texturing does.
"""
import json
import math
import struct
import sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.nitro_2d import decompress, read_indexed_png  # noqa: E402
from tools.paperwhite2 import mcss_rig  # noqa: E402

SIDES = ("front", "back")
# The sheet MCSS draws from (MCSS_TEX_SIZE, 4bpp)
SHEET_SIZE = (256, 128)
# A quad's x and y are fx32 sixteenths of a pixel at the sprite's scale of 16
QUAD_UNIT = 16


class RigError(Exception):
    pass


def blocks(blob: bytes) -> dict[str, bytes]:
    """A Nitro file's blocks by their names as read (CEBK, LABL...), each without its 8-byte header."""
    _, _, _, _, header, count = struct.unpack_from("<4sHHIHH", blob, 0)
    out, cursor = {}, header
    for _ in range(count):
        magic, size = struct.unpack_from("<4sI", blob, cursor)
        out[magic.decode("ascii")[::-1]] = blob[cursor + 8:cursor + size]
        cursor += size
    return out


def labels(block: bytes | None) -> list[str]:
    """A LABL block's names: offsets into the strings after them, the table ending at the first that can't be one."""
    if not block:
        return []
    offsets, cursor = [], 0
    while cursor + 4 <= len(block):
        offset = struct.unpack_from("<I", block, cursor)[0]
        if offset >= len(block):
            break
        offsets.append(offset)
        cursor += 4
    base = len(offsets) * 4
    names = []
    for offset in offsets:
        if base + offset >= len(block):
            break
        end = block.find(b"\0", base + offset)
        names.append(block[base + offset:end if end >= 0 else len(block)].decode("ascii", "replace"))
    return names


def info_file(blob: bytes) -> dict:
    """The bin file (MCSSBin, MCSSCell, MCSSQuad, MCSSBinTail): the cells' quads in pixels, the box, the idle nodes."""
    count, width, height, offset_x, offset_y = struct.unpack_from("<IHHhh", blob, 0)
    cells = []
    for i in range(count):
        values = struct.unpack_from("<12i", blob, 12 + i * 48)

        def quad(raw):
            x, y, w, h, s, t = (value / 4096 for value in raw)
            return {"x": x * QUAD_UNIT, "y": y * QUAD_UNIT, "w": w, "h": h, "s": s, "t": t}
        cells.append([quad(values[:6])] + ([quad(values[6:])] if values[8] else []))
    tail = blob[(12 + count * 48) & ~3:]
    idle = tail[0] if tail else 0
    return {"cells": cells, "box": [width, height, offset_x, offset_y],
            "idle_nodes": None if idle == 0xFF else list(tail[2:2 + idle]),
            "stop_flags": tail[1] if len(tail) > 1 else 0}


def animation_bank(blob: bytes) -> dict:
    """An animation bank (NANR, NMAR): its sequences, each with its play mode, length and frames (a cell or
    multi-cell index, rotation in 65536ths of a turn, scale, move in pixels, and the frames it lasts), and labels."""
    parts = blocks(blob)
    data = parts["ABNK"]
    count, _, sequences, frames, results = struct.unpack_from("<HHIII", data, 0)
    out = []
    for i in range(count):
        frame_count, loop_start, kind, mode, first = struct.unpack_from("<HHIII", data, sequences + i * 16)
        element = kind & 0xFFFF
        steps = []
        for frame in range(frame_count):
            offset, duration = struct.unpack_from("<IH", data, frames + first + frame * 8)
            at = results + offset
            if element == 0:
                step = {"index": struct.unpack_from("<H", data, at)[0], "rot": 0, "sx": 1.0, "sy": 1.0, "px": 0,
                        "py": 0}
            elif element == 1:
                index, rot, sx, sy, px, py = struct.unpack_from("<HHiihh", data, at)
                step = {"index": index, "rot": rot, "sx": sx / 4096, "sy": sy / 4096, "px": px, "py": py}
            else:
                index, _, px, py = struct.unpack_from("<HHhh", data, at)
                step = {"index": index, "rot": 0, "sx": 1.0, "sy": 1.0, "px": px, "py": py}
            step["frames"] = duration
            steps.append(step)
        out.append({"play_mode": mode, "loop_start": loop_start, "length": sum(s["frames"] for s in steps),
                    "frames": steps})
    return {"sequences": out, "labels": labels(parts.get("LABL"))}


def multi_cell_bank(blob: bytes) -> list[list[dict]]:
    """A multi-cell bank (NMCR): each multi-cell's nodes, front to back."""
    data = blocks(blob)["MCBK"]
    count, _, cells, nodes = struct.unpack_from("<HHII", data, 0)
    out = []
    for i in range(count):
        node_count, _, first = struct.unpack_from("<HHI", data, cells + i * 8)
        row = []
        for k in range(node_count):
            sequence, x, y, attr = struct.unpack_from("<HhhH", data, nodes + first + k * 8)
            row.append({"sequence": sequence, "x": x, "y": y, "play_mode": attr & 0xF})
        out.append(row)
    return out


def part_names(cell_count: int, animations: dict) -> list[list[str]]:
    """Each cell's parts: the names of the cell animations that show it (head_a and head_b as head), from the NANR's
    labels, else the sequences' numbers."""
    names = [[] for _ in range(cell_count)]
    for number, sequence in enumerate(animations["sequences"]):
        label = animations["labels"][number] if number < len(animations["labels"]) else f"part {number}"
        for suffix in ("_a", "_b", "_c", "_d", "_e", "_f"):
            if label.endswith(suffix) and len(label) > len(suffix):
                label = label[:-len(suffix)]
                break
        for frame in sequence["frames"]:
            if frame["index"] < cell_count and label not in names[frame["index"]]:
                names[frame["index"]].append(label)
    return names


def read_rig(folder: Path, side: str) -> dict:
    """A side's rig from its folder's <side>_rig.json, through the five files the build makes from it."""
    try:
        return rig_of_files(mcss_rig.files_from_rig(mcss_rig.read_side(folder, side), compress=False), side)
    except (mcss_rig.RigError, KeyError, struct.error) as error:
        raise RigError(f"{folder}: can't read the {side} rig ({error})") from error


def rig_of_files(files: dict[str, bytes], side: str) -> dict:
    """A side's rig from its five files (mcss_rig.FILES's kinds), the NANR compressed or not."""
    nanr = files["animations"]
    info = info_file(files["info"])
    animations = animation_bank(nanr if nanr[:4] == b"RNAN" else decompress(nanr))
    multi_cells = multi_cell_bank(files["multi_cells"])
    multi_animations = animation_bank(files["multi_animations"])
    return {"side": side, "cells": info["cells"], "box": info["box"], "idle_nodes": info["idle_nodes"],
            "stop_flags": info["stop_flags"], "parts": part_names(len(info["cells"]), animations),
            "cell_animations": animations["sequences"], "multi_cells": multi_cells,
            "animations": multi_animations["sequences"], "animation_names": multi_animations["labels"]}


def step_at(sequence: dict, time: int) -> dict:
    """The frame a sequence shows at a time, by its play mode (2 and 4 loop, 1 and 3 hold their last frame)."""
    length = sequence["length"]
    if not sequence["frames"]:
        raise RigError("an animation sequence has no frames")
    if length == 0:
        return sequence["frames"][0]
    time = time % length if sequence["play_mode"] in (2, 4) else min(time, length - 1)
    for frame in sequence["frames"]:
        if time < frame["frames"]:
            return frame
        time -= frame["frames"]
    return sequence["frames"][-1]


def multi_frame_at(rig: dict, animation: int, time: int) -> tuple[dict, int]:
    """The multi-cell animation's frame at a time, and the time since that frame started."""
    sequence = rig["animations"][animation]
    length = sequence["length"]
    local = time % length if length and sequence["play_mode"] in (2, 4) else min(time, max(length - 1, 0))
    for frame in sequence["frames"]:
        if local < frame["frames"]:
            return frame, local
        local -= frame["frames"]
    return sequence["frames"][-1], 0


def srt(step: dict) -> tuple:
    return step["rot"], step["sx"], step["sy"], step["px"], step["py"]


def forward(x: float, y: float, transform: tuple) -> tuple[float, float]:
    """A point, y up, through an SRT as MCSS applies it: scaled, turned (G3_RotZ(-sin, cos)), then moved (y down)."""
    rot, sx, sy, mx, my = transform
    x, y = x * sx, y * sy
    angle = rot / 65536 * 2 * math.pi
    sin, cos = -math.sin(angle), math.cos(angle)
    return x * cos - y * sin + mx, x * sin + y * cos - my


def affine(transform: tuple) -> tuple:
    """forward() as an affine map (a, b, c, d, e, f): x' = a x + b y + e, y' = c x + d y + f."""
    rot, sx, sy, mx, my = transform
    angle = rot / 65536 * 2 * math.pi
    sin, cos = -math.sin(angle), math.cos(angle)
    return cos * sx, -sin * sy, sin * sx, cos * sy, mx, -my


def frame_quads(rig: dict, animation: int, time: int) -> list[tuple[dict, list[tuple]]]:
    """The quads drawn at a time, back to front, each with its transforms from the quad's own space to the sprite's."""
    multi, since = multi_frame_at(rig, animation, time)
    out = []
    nodes = rig["multi_cells"][multi["index"]]
    for node in reversed(nodes):
        cell_time = since if node["play_mode"] == 0 else time
        step = step_at(rig["cell_animations"][node["sequence"]], cell_time)
        if step["index"] >= len(rig["cells"]):
            raise RigError(f"a cell animation shows cell {step['index']}, past the {len(rig['cells'])} cells")
        transforms = [srt(step), (0, 1.0, 1.0, node["x"], node["y"]), srt(multi)]
        for quad in rig["cells"][step["index"]]:
            out.append((quad, transforms))
    return out


def render(rig: dict, sheet: bytes, animation: int = 0, time: int = 0, canvas=None):
    """Draws a frame as palette indices. canvas is (width, height, origin x, origin y) in pixels, the origin (the
    sprite's feet) measured down from the top; by default the frame's own bounds. Returns (width, height, origin x,
    origin y, pixels)."""
    width_sheet, height_sheet = SHEET_SIZE
    quads = frame_quads(rig, animation, time)
    boxes = []
    for quad, transforms in quads:
        corners = []
        for u, v in ((0, 0), (quad["w"], 0), (0, quad["h"]), (quad["w"], quad["h"])):
            point = (quad["x"] + u, quad["y"] - v)
            for transform in transforms:
                point = forward(*point, transform)
            corners.append(point)
        boxes.append((min(p[0] for p in corners), max(p[0] for p in corners),
                      min(p[1] for p in corners), max(p[1] for p in corners)))
    if canvas is None:
        if not boxes:
            return 1, 1, 0, 0, bytes(1)
        left = math.floor(min(b[0] for b in boxes)) - 1
        right = math.ceil(max(b[1] for b in boxes)) + 1
        bottom = math.floor(min(b[2] for b in boxes)) - 1
        top = math.ceil(max(b[3] for b in boxes)) + 1
        canvas = (right - left, top - bottom, -left, top)
    width, height, origin_x, origin_y = canvas
    pixels = bytearray(width * height)
    for (quad, transforms), (x0, x1, y0, y1) in zip(quads, boxes):
        # The transforms as one affine map from the quad's space to the sprite's, inverted once
        a, b, c, d, e, f = 1.0, 0.0, 0.0, 1.0, 0.0, 0.0
        for transform in transforms:
            ta, tb, tc, td, te, tf = affine(transform)
            a, b, c, d, e, f = (ta * a + tb * c, ta * b + tb * d, tc * a + td * c, tc * b + td * d,
                                ta * e + tb * f + te, tc * e + td * f + tf)
        det = a * d - b * c
        if not det:
            continue
        ia, ib, ic, id_ = d / det, -b / det, -c / det, a / det
        for y in range(math.floor(y0), math.ceil(y1) + 1):
            row = origin_y - y - 1
            if not 0 <= row < height:
                continue
            py = y + 0.5 - f
            for x in range(math.floor(x0), math.ceil(x1) + 1):
                column = origin_x + x
                if not 0 <= column < width:
                    continue
                px = x + 0.5 - e
                u, v = ia * px + ib * py - quad["x"], quad["y"] - (ic * px + id_ * py)
                if 0 <= u < quad["w"] and 0 <= v < quad["h"]:
                    s, t = int(quad["s"] + u), int(quad["t"] + v)
                    if 0 <= s < width_sheet and 0 <= t < height_sheet:
                        index = sheet[t * width_sheet + s]
                        if index:
                            pixels[row * width + column] = index
    return width, height, origin_x, origin_y, bytes(pixels)


def frame_times(rig: dict, animation: int = 0, step: int = 4, most: int = 120) -> list[int]:
    """The times to show an animation at, every step frames over one loop, at most most of them."""
    length = rig["animations"][animation]["length"] if rig["animations"] else 0
    if length <= 0:
        return [0]
    step = max(step, math.ceil(length / most))
    return list(range(0, length, step))


def quad_rectangles(rig: dict) -> list[tuple[int, int, int, int, int, int]]:
    """Each cell's quads as (cell, quad number, s, t, width, height) rectangles of the sheet."""
    out = []
    for number, cell in enumerate(rig["cells"]):
        for k, quad in enumerate(cell):
            out.append((number, k, int(quad["s"]), int(quad["t"]), int(quad["w"]), int(quad["h"])))
    return out


@lru_cache(maxsize=64)
def sheet_pixels(path: Path) -> bytes:
    width, height, pixels, _ = read_indexed_png(path)
    if (width, height) != SHEET_SIZE:
        raise RigError(f"{path}: {width} by {height}, not {SHEET_SIZE[0]} by {SHEET_SIZE[1]}")
    return pixels


def main():
    if len(sys.argv) == 4 and sys.argv[1] == "dump" and sys.argv[3] in SIDES:
        print(json.dumps(read_rig(Path(sys.argv[2]), sys.argv[3]), indent=1))
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
