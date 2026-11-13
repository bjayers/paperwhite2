#!/usr/bin/env python3
"""Paper White 2: a battle sprite's rig (MCSS, src/system/mcss.c) as one flat JSON object, the source of each side's
five files: res/pokemon's <side>_rig.json beside the side's 256 by 128 sheet, which the build turns into the files
byte for byte (tools/data/pokemon_graphics.py), with the checks the rig editor runs before it writes
(docs/paperwhite2/design/battle-sprites.md sections 3, 11, 15 and 16).

    mcss_rig.py check FOLDER [front|back]              the rig's checks
    mcss_rig.py files FOLDER front|back OUTPUT         writes the side's five files into OUTPUT, as the build makes them
    mcss_rig.py dump FILES front|back                  the rig of a side's five files (an extracted group's) as JSON
    mcss_rig.py convert [res/pokemon]                  each side's five files to its rig JSON, proven; removes the files
    mcss_rig.py roundtrip [res/pokemon]                every side: JSON -> rig -> files -> rig -> JSON, compared

The five files of a side (front or back), as the archive a/0/0/4 holds them:
- <side>_info.bin, MCSS's own (MCSSBin): the box, each cell's one or two quads, the idle parts and the stop flags;
- <side>_cells.ncer: the cells as OBJs (MCSS draws the bin's quads, not these) and the cell animations' names again;
- <side>_animations.nanr.lz11: the cell animations, LZ11-compressed;
- <side>_multi_cells.nmcr: the multi-cells (poses), each a list of nodes (parts), front to back;
- <side>_multi_animations.nmar: the multi-cell animations (sequence 0 "stay", the loop; 1 "stop", the idle pose).

The rig's names (section 15.2): a **picture** is a cell (the bin's quads, called rectangles, and the NCER's OBJs);
a **track** is a cell animation sequence, of **keys** (frames) that each hold a picture for some game frames with an
optional rotation, scale and move; a **pose** is a multi-cell, its **parts** the nodes, front to back, each playing a
track about its pivot; a **sequence** is a multi-cell animation sequence, of keys that each hold a pose. Nothing in the
files is lost: values that are almost always the same (the OBJ mapping mode, a node's instance and flags, the bin's
padding) are written only where a file differs, and the writer puts them back.

The JSON is written in the compact layout (tools/data/datajson.py's dumps_compact, which the editor writes back byte for
byte), with "$schema" first, pointing to res/pokemon/battle_sprite_rig.schema.json. The musical's sprites (a group's
musical/ folder) keep the five files where they differ from the battle sprite's; the rest are built from its rig.
"""
import bisect
import json
import os
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.datajson import dumps_compact  # noqa: E402
from tools.data.nitro_2d import decompress  # noqa: E402

SCHEMA = ROOT / "res/pokemon/battle_sprite_rig.schema.json"
# A side's rig beside its sheet: front_rig.json, back_rig.json
RIG_FILE = "_rig.json"

FORMAT = 1
SIDES = ("front", "back")
SHEET_SIZE = (256, 128)
# A quad's x and y are fx32 sixteenths of a pixel at MCSS's scale of 16; the other fields fx32 pixels
FX = 4096
QUAD_XY = FX // 16
# NNSG2dAnimationPlayMode
PLAY_MODES = {1: "once", 2: "loop", 3: "pingpong", 4: "pingpong_loop"}
# NNSG2dAnimationElement: what each key of a sequence holds
KEY_TYPES = {0: "plain", 1: "srt", 2: "move"}
RESULT_SIZES = {0: 2, 1: 16, 2: 8}
# The high half of a sequence's type: NNS_G2D_ANIMATIONTYPE_CELL, _MULTICELLLOCATION
BANK_TYPES = {"tracks": 1, "sequences": 2}
# A node's attribute: bits 0-3 the play mode of its cell animation, bit 5 set in every node, bits 8-15 the instance
PART_PLAY = {0: "restart", 1: "continue"}
PART_FLAGS = 0x20
# The OBJ shapes and sizes (attribute 0 bits 14-15, attribute 1 bits 14-15)
OBJ_SIZES = {(0, 0): (8, 8), (0, 1): (16, 16), (0, 2): (32, 32), (0, 3): (64, 64),
             (1, 0): (16, 8), (1, 1): (32, 8), (1, 2): (32, 16), (1, 3): (64, 32),
             (2, 0): (8, 16), (2, 1): (8, 32), (2, 2): (16, 32), (2, 3): (32, 64)}
# The polygon IDs a translucent sprite gives its nodes (MCSS_DrawQuad clamps at 63)
MOST_PARTS = 64
FILES = {"info": "_info.bin", "cells": "_cells.ncer", "animations": "_animations.nanr.lz11",
         "multi_cells": "_multi_cells.nmcr", "multi_animations": "_multi_animations.nmar"}


class RigError(Exception):
    pass


# LZ11, as the originals were compressed: greedy, the longest match at the farthest distance of the 4,096 behind,
# never at distance 1 (inferred: a compressor safe for VRAM, which takes 16-bit writes). Every original NANR comes out
# byte for byte; MI_UncompressLZ8 reads any valid stream.

def compress_lz11(data: bytes) -> bytes:
    if len(data) >= 1 << 24:
        raise RigError("too large to compress (16 MB)")
    out = bytearray([0x11]) + len(data).to_bytes(3, "little")
    chains: dict[bytes, list[int]] = {}
    added = 0
    i, size = 0, len(data)

    def index_to(limit):
        nonlocal added
        while added < limit:
            if added + 3 <= size:
                chains.setdefault(data[added:added + 3], []).append(added)
            added += 1

    while i < size:
        flag_at = len(out)
        out.append(0)
        flags = 0
        for bit in range(7, -1, -1):
            if i >= size:
                break
            index_to(i - 1)  # candidates up to distance 2
            best_length, best_distance = 0, 0
            if i + 3 <= size:
                candidates = chains.get(data[i:i + 3], ())
                start = bisect.bisect_left(candidates, i - 0x1000)
                end = bisect.bisect_right(candidates, i - 2)
                limit = min(0x10110, size - i)
                for position in candidates[start:end]:
                    # farthest first; a nearer one wins only by being longer
                    if data[position:position + best_length + 1] != data[i:i + best_length + 1]:
                        continue
                    length = best_length + 1
                    while length < limit and data[position + length] == data[i + length]:
                        length += 1
                    if length > best_length:
                        best_length, best_distance = length, i - position
                        if length == limit:
                            break
            if best_length >= 3:
                flags |= 1 << bit
                distance = best_distance - 1
                if best_length <= 0x10:
                    out += bytes([(best_length - 1) << 4 | distance >> 8, distance & 0xFF])
                elif best_length <= 0x110:
                    length = best_length - 0x11
                    out += bytes([length >> 4, (length & 0xF) << 4 | distance >> 8, distance & 0xFF])
                else:
                    length = best_length - 0x111
                    out += bytes([0x10 | length >> 12, (length >> 4) & 0xFF, (length & 0xF) << 4 | distance >> 8,
                                  distance & 0xFF])
                i += best_length
            else:
                out.append(data[i])
                i += 1
        out[flag_at] = flags
    return bytes(out)


# The Nitro container: a 16-byte header (magic, byte order 0xFEFF, version 1.0, size, header size, block count),
# then blocks of a magic (stored reversed) and a size that counts their 8-byte header.

def read_container(blob: bytes, magic: str) -> dict[str, bytes]:
    found, bom, version, size, header, count = struct.unpack_from("<4sHHIHH", blob, 0)
    if found[::-1].decode("ascii", "replace") != magic:
        raise RigError(f"not an {magic} file")
    if (bom, version, size, header) != (0xFEFF, 0x0100, len(blob), 16):
        raise RigError(f"an {magic} file with an unusual header")
    out, cursor = {}, header
    for _ in range(count):
        name, block_size = struct.unpack_from("<4sI", blob, cursor)
        out[name[::-1].decode("ascii")] = blob[cursor + 8:cursor + block_size]
        cursor += block_size
    if cursor != len(blob):
        raise RigError(f"an {magic} file with bytes after its blocks")
    return out


def write_container(magic: str, blocks: list[tuple[str, bytes]]) -> bytes:
    body = b"".join(struct.pack("<4sI", name[::-1].encode("ascii"), 8 + len(data)) + data for name, data in blocks)
    return struct.pack("<4sHHIHH", magic[::-1].encode("ascii"), 0xFEFF, 0x0100, 16 + len(body), 16,
                       len(blocks)) + body


def read_labels(block: bytes) -> list[str]:
    """A LABL block: offsets into the strings after them; the table ends at the first offset that can't be one."""
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
        end = block.index(b"\0", base + offset)
        names.append(block[base + offset:end].decode("ascii"))
    return names


def write_labels(names: list[str]) -> bytes:
    offsets, strings = [], bytearray()
    for name in names:
        offsets.append(len(strings))
        strings += name.encode("ascii") + b"\0"
    return b"".join(struct.pack("<I", offset) for offset in offsets) + bytes(strings)


def number(value: float):
    """A fixed-point value as JSON: an integer when it is one."""
    return int(value) if value == int(value) else value


def fixed(value, unit: int, what: str) -> int:
    raw = value * unit
    if raw != int(raw):
        raise RigError(f"{what} {value} isn't a multiple of 1/{unit}")
    return int(raw)


# The animation banks (NANR, NMAR): ABNK holds the sequences (frame count, loop start, type, play mode, first frame),
# then the frames (result offset, duration, 0xBEEF), then the results. Results are shared: a key whose result equals
# an earlier one's in the file points at it; 7 originals hold second copies of a result, which a key's "result_copy"
# (1 for the second) points at. Plain results are 2 bytes;
# an SRT or move result, and each sequence's results, start 4-aligned, and the bank ends 4-aligned, padded with 0xCC.

def read_bank(data: bytes, bank: str) -> list[dict]:
    count, total, sequences, frames, results, _, _ = struct.unpack_from("<HHIIIII", data, 0)
    if (sequences, frames, results) != (24, 24 + count * 16, 24 + count * 16 + total * 8):
        raise RigError("an animation bank with an unusual layout")
    pointer = "picture" if bank == "tracks" else "pose"
    out, seen, expected_first = [], {}, 0
    for i in range(count):
        frame_count, loop_start, kind, mode, first = struct.unpack_from("<HHIII", data, sequences + i * 16)
        element, bank_type = kind & 0xFFFF, kind >> 16
        if element not in KEY_TYPES or first != expected_first:
            raise RigError(f"sequence {i} has an unusual type or layout")
        expected_first = first + frame_count * 8
        keys = []
        for k in range(frame_count):
            offset, duration, marker = struct.unpack_from("<IHH", data, frames + first + k * 8)
            at = results + offset
            raw = data[at:at + RESULT_SIZES[element]]
            key = {pointer: struct.unpack_from("<H", raw)[0], "frames": duration}
            if element == 1:
                _, rotation, sx, sy, px, py = struct.unpack("<HHiihh", raw)
                key.update(rotation=rotation, scale=[number(sx / FX), number(sy / FX)], move=[px, py])
            elif element == 2:
                _, unused, px, py = struct.unpack("<HHhh", raw)
                key["move"] = [px, py]
                if unused != 0xBEEF:
                    key["unused"] = unused
            if marker != 0xBEEF:
                key["marker"] = marker
            copies = seen.setdefault((element, raw), [])
            if offset not in copies:
                copies.append(offset)
            if copies.index(offset):
                key["result_copy"] = copies.index(offset)
            keys.append(key)
        sequence = {"key_type": KEY_TYPES[element], "play": PLAY_MODES.get(mode, mode), "keys": keys}
        if loop_start:
            sequence["loop_start"] = loop_start
        if bank_type != BANK_TYPES[bank]:
            sequence["bank_type"] = bank_type
        out.append(sequence)
    return out


def write_bank(sequences: list[dict], bank: str) -> bytes:
    pointer = "picture" if bank == "tracks" else "pose"
    modes = {name: value for value, name in PLAY_MODES.items()}
    elements = {name: value for value, name in KEY_TYPES.items()}
    headers, frames, results, pool = bytearray(), bytearray(), bytearray(), {}
    total = 0
    for sequence in sequences:
        element = elements[sequence["key_type"]]
        mode = modes.get(sequence["play"], sequence["play"])
        kind = sequence.get("bank_type", BANK_TYPES[bank]) << 16 | element
        headers += struct.pack("<HHIII", len(sequence["keys"]), sequence.get("loop_start", 0), kind, mode,
                               total * 8)
        if len(results) % 4:
            results += b"\xcc\xcc"
        for key in sequence["keys"]:
            if element == 0:
                raw = struct.pack("<H", key[pointer])
            elif element == 1:
                raw = struct.pack("<HHiihh", key[pointer], key["rotation"], fixed(key["scale"][0], FX, "a scale"),
                                  fixed(key["scale"][1], FX, "a scale"), *key["move"])
            else:
                raw = struct.pack("<HHhh", key[pointer], key.get("unused", 0xBEEF), *key["move"])
            copies = pool.setdefault((element, raw), [])
            copy = key.get("result_copy", 0)
            if copy > len(copies):
                raise RigError(f"a key asks for copy {copy} of a result that has {len(copies)}")
            if copy == len(copies):
                if element and len(results) % 4:
                    results += b"\xcc\xcc"
                copies.append(len(results))
                results += raw
            offset = copies[copy]
            frames += struct.pack("<IHH", offset, key["frames"], key.get("marker", 0xBEEF))
            total += 1
    if len(results) % 4:
        results += b"\xcc\xcc"
    count = len(sequences)
    return struct.pack("<HHIIIII", count, total, 24, 24 + count * 16, 24 + count * 16 + total * 8, 0, 0) + \
        bytes(headers) + bytes(frames) + bytes(results)


def named(sequences: list[dict], names: list[str], what: str) -> list[dict]:
    """The sequences with their labels' names first; labels that aren't one per sequence stay as a list."""
    if len(names) != len(sequences):
        raise RigError(f"{len(names)} {what} labels for {len(sequences)} {what}")
    return [{"name": name, **sequence} for name, sequence in zip(names, sequences)]


# The info bin (MCSSBin): u32 cell count, u16 width and height, s16 x and y offsets (the box), 48 bytes a cell (two
# quads of six fx32: x, y, width, height, s, t), then the tail: the idle part count (0xff: no idle pause), the stop
# flags, the idle parts, and zeros to the next multiple of 4 past them (at least one).

def read_info(blob: bytes) -> dict:
    count, width, height, offset_x, offset_y = struct.unpack_from("<IHHhh", blob, 0)
    pictures = []
    for i in range(count):
        values = struct.unpack_from("<12i", blob, 12 + i * 48)
        rectangles = []
        for quad in (values[:6], values[6:]):
            x, y, w, h, s, t = quad
            rectangles.append({"sheet": [number(s / FX), number(t / FX)], "size": [number(w / FX), number(h / FX)],
                               "at": [number(x / QUAD_XY), number(y / QUAD_XY)]})
        if not values[8] and not any(values[6:]):
            rectangles.pop()
        pictures.append({"rectangles": rectangles})
    tail = blob[12 + count * 48:]
    idle = tail[0]
    listed = 0 if idle == 0xFF else idle
    out = {"box": {"width": width, "height": height, "x": offset_x, "y": offset_y},
           "idle_parts": None if idle == 0xFF else list(tail[2:2 + listed]), "stop_flags": tail[1],
           "pictures": pictures}
    padding = tail[2 + listed:]
    if padding != bytes(4 - (2 + listed) % 4):
        out["info_padding"] = padding.hex()
    return out


def write_info(rig: dict) -> bytes:
    box = rig["box"]
    out = bytearray(struct.pack("<IHHhh", len(rig["pictures"]), box["width"], box["height"], box["x"], box["y"]))
    for picture in rig["pictures"]:
        values = []
        for rectangle in picture["rectangles"]:
            values += [fixed(rectangle["at"][0], QUAD_XY, "a rectangle's x"),
                       fixed(rectangle["at"][1], QUAD_XY, "a rectangle's y"),
                       fixed(rectangle["size"][0], FX, "a rectangle's width"),
                       fixed(rectangle["size"][1], FX, "a rectangle's height"),
                       fixed(rectangle["sheet"][0], FX, "a rectangle's sheet x"),
                       fixed(rectangle["sheet"][1], FX, "a rectangle's sheet y")]
        out += struct.pack("<12i", *(values + [0] * (12 - len(values))))
    idle = rig["idle_parts"]
    listed = [] if idle is None else idle
    out += bytes([0xFF if idle is None else len(listed), rig["stop_flags"], *listed])
    padding = rig.get("info_padding")
    out += bytes.fromhex(padding) if padding is not None else bytes(4 - (2 + len(listed)) % 4)
    return bytes(out)


# The cells (NCER): CEBK (cell count, bank attribute 0: 8-byte cells, mapping mode, three zero words), each cell an
# OBJ count, an attribute and its first OBJ's offset, then the OBJs (three attributes), 4-aligned with zeros; LABL the
# cell animations' names; UEXT one word (1).

def obj_from(attributes: tuple[int, int, int]) -> dict:
    a0, a1, a2 = attributes
    width, height = OBJ_SIZES.get((a0 >> 14, a1 >> 14), (0, 0))
    obj = {"x": (a1 & 0x1FF) - (a1 & 0x100) * 2, "y": (a0 & 0xFF) - (a0 & 0x80) * 2, "size": [width, height],
           "tile": a2 & 0x3FF}
    # what's left of the attributes besides position, shape, size and tile: affine, double size, palette...
    rest = [a0 & 0x3F00, a1 & 0x3E00, a2 & 0xFC00]
    if (a0 >> 14, a1 >> 14) not in OBJ_SIZES:
        rest[0] |= a0 & 0xC000
        rest[1] |= a1 & 0xC000
    obj["attributes"] = rest
    return obj


def obj_to(obj: dict) -> tuple[int, int, int]:
    rest = obj["attributes"]
    shape_size = next((key for key, size in OBJ_SIZES.items() if list(size) == list(obj["size"])), None)
    shape, size = shape_size if shape_size else (0, 0)
    a0 = (obj["y"] & 0xFF) | rest[0] | shape << 14
    a1 = (obj["x"] & 0x1FF) | rest[1] | size << 14
    return a0, a1, (obj["tile"] & 0x3FF) | rest[2]


def generate_objs(picture: dict, double_size: bool = True) -> list[dict]:
    """OBJs for a picture whose rectangles changed, as NITRO-CHARACTER laid them out for 16,308 of the originals'
    16,903 cells: the second rectangle's first (semi-transparent), each rectangle cut into rows and columns of 64, 32,
    16 and 8 pixels, affine and (by default) double size, so placed half their size up and left. MCSS never draws
    them; the NCER needs them only to be a valid cell bank."""
    def cut(length):
        out = []
        for piece in (64, 32, 16, 8):
            while length >= piece:
                out.append(piece)
                length -= piece
        return out

    objs = []
    for k, rectangle in reversed(list(enumerate(picture["rectangles"]))):
        (s, t), (w, h), (x, y) = rectangle["sheet"], rectangle["size"], rectangle["at"]
        down = 0
        for piece_h in cut(int(h)):
            across = 0
            for piece_w in cut(int(w)):
                if (piece_w, piece_h) not in OBJ_SIZES.values():
                    raise RigError(f"a {piece_w} by {piece_h} piece of a rectangle isn't an OBJ size")
                half_w, half_h = (piece_w // 2, piece_h // 2) if double_size else (0, 0)
                objs.append({"x": int(x) + across - half_w, "y": -int(y) + down - half_h, "size": [piece_w, piece_h],
                             "tile": (int(t) + down) // 8 * 32 + (int(s) + across) // 8,
                             "attributes": [(0x400 if k else 0) | (0x300 if double_size else 0x100), 0, 0]})
                across += piece_w
            down += piece_h
    return objs


def read_cells(blob: bytes) -> tuple[list[dict], dict]:
    blocks = read_container(blob, "NCER")
    if list(blocks) != ["CEBK", "LABL", "UEXT"]:
        raise RigError(f"an NCER with blocks {list(blocks)}")
    data = blocks["CEBK"]
    count, attribute, cells, mapping, vram, extended, user = struct.unpack_from("<HHIIIII", data, 0)
    if (attribute, cells, vram, extended, user) != (0, 24, 0, 0, 0):
        raise RigError("an NCER with bounding rectangles or VRAM transfer data")
    objs_at = cells + count * 8
    out, expected = [], 0
    for i in range(count):
        obj_count, cell_attribute, first = struct.unpack_from("<HHI", data, cells + i * 8)
        if first != expected:
            raise RigError("an NCER whose OBJs aren't in cell order")
        expected += obj_count * 6
        objs = [obj_from(struct.unpack_from("<HHH", data, objs_at + first + k * 6)) for k in range(obj_count)]
        out.append({"objs": objs, "obj_attribute": cell_attribute})
    end = objs_at + expected
    extra = {"mapping": mapping, "labels": read_labels(blocks["LABL"]),
             "extension": struct.unpack("<I", blocks["UEXT"])[0]}
    if data[end:] != bytes(-end % 4):
        raise RigError("an NCER with data after its OBJs")
    return out, extra


def write_cells(rig: dict, labels: list[str]) -> bytes:
    pictures = rig["pictures"]
    data = bytearray(struct.pack("<HHIIIII", len(pictures), 0, 24, rig.get("obj_mapping", 4), 0, 0, 0))
    objs, first = bytearray(), 0
    for picture in pictures:
        data += struct.pack("<HHI", len(picture["objs"]), picture["obj_attribute"], first)
        for obj in picture["objs"]:
            objs += struct.pack("<HHH", *obj_to(obj))
        first = len(objs)
    data += objs + bytes(-(len(data) + len(objs)) % 4)
    return write_container("NCER", [("CEBK", bytes(data)), ("LABL", write_labels(labels)),
                                    ("UEXT", struct.pack("<I", rig.get("extension", 1)))])


# The multi-cells (NMCR): MCBK (count, 0xBEEF, the multi-cells' and nodes' offsets, two zero words), each multi-cell a
# node count, a cell animation count and its first node's offset, then the nodes (cell animation, x, y, attribute).

def read_multi_cells(blob: bytes) -> list[dict]:
    blocks = read_container(blob, "NMCR")
    if list(blocks) != ["MCBK"]:
        raise RigError(f"an NMCR with blocks {list(blocks)}")
    data = blocks["MCBK"]
    count, marker, cells, nodes, _, _ = struct.unpack_from("<HHIIII", data, 0)
    if (marker, cells, nodes) != (0xBEEF, 20, 20 + count * 8):
        raise RigError("an NMCR with an unusual layout")
    poses, expected = [], 0
    for i in range(count):
        node_count, instances, first = struct.unpack_from("<HHI", data, cells + i * 8)
        if first != expected:
            raise RigError("an NMCR whose nodes aren't in order")
        expected += node_count * 8
        parts = []
        for k in range(node_count):
            track, x, y, attribute = struct.unpack_from("<HhhH", data, nodes + first + k * 8)
            part = {"track": track, "pivot": [x, y], "play": PART_PLAY.get(attribute & 0xF, attribute & 0xF)}
            if attribute >> 8 != k:
                part["instance"] = attribute >> 8
            if attribute & 0xF0 != PART_FLAGS:
                part["flags"] = attribute & 0xF0
            parts.append(part)
        pose = {"parts": parts}
        if instances != node_count:
            pose["instances"] = instances
        poses.append(pose)
    if nodes + expected != len(data):
        raise RigError("an NMCR with data after its nodes")
    return poses


def write_multi_cells(poses: list[dict]) -> bytes:
    plays = {name: value for value, name in PART_PLAY.items()}
    heads, nodes = bytearray(), bytearray()
    for pose in poses:
        heads += struct.pack("<HHI", len(pose["parts"]), pose.get("instances", len(pose["parts"])), len(nodes))
        for k, part in enumerate(pose["parts"]):
            attribute = part.get("instance", k) << 8 | part.get("flags", PART_FLAGS) | plays.get(part["play"],
                                                                                              part["play"])
            nodes += struct.pack("<HhhH", part["track"], *part["pivot"], attribute)
    data = struct.pack("<HHIIII", len(poses), 0xBEEF, 20, 20 + len(poses) * 8, 0, 0) + heads + nodes
    return write_container("NMCR", [("MCBK", data)])


# The side: five files to a rig and back

def rig_from_files(files: dict[str, bytes], side: str) -> dict:
    """A side's rig from its files' bytes (the NANR as stored, LZ11)."""
    info = read_info(files["info"])
    cells, cell_extra = read_cells(files["cells"])
    animations = read_container(decompress(files["animations"]), "NANR")
    multi_animations = read_container(files["multi_animations"], "NMAR")
    if list(animations) != ["ABNK", "LABL", "UEXT"] or list(multi_animations) != ["ABNK", "LABL"]:
        raise RigError("an NANR or NMAR with unusual blocks")
    if len(cells) != len(info["pictures"]):
        raise RigError(f"{len(cells)} cells in the NCER, {len(info['pictures'])} in the bin")
    track_names = read_labels(animations["LABL"])
    rig = {"format": FORMAT, "side": side, "box": info["box"], "stop_flags": info["stop_flags"],
           "idle_parts": info["idle_parts"],
           "pictures": [{**picture, **cell} for picture, cell in zip(info["pictures"], cells)],
           "tracks": named(read_bank(animations["ABNK"], "tracks"), track_names, "track"),
           "poses": read_multi_cells(files["multi_cells"]),
           "sequences": named(read_bank(multi_animations["ABNK"], "sequences"),
                              read_labels(multi_animations["LABL"]), "sequence")}
    if "info_padding" in info:
        rig["info_padding"] = info["info_padding"]
    if cell_extra["mapping"] != 4:
        rig["obj_mapping"] = cell_extra["mapping"]
    extension = struct.unpack("<I", animations["UEXT"])[0]
    if extension != 1 or cell_extra["extension"] != 1:
        if extension != cell_extra["extension"]:
            raise RigError("the NCER's and NANR's UEXT differ")
        rig["extension"] = extension
    if cell_extra["labels"] != track_names:
        rig["picture_labels"] = cell_extra["labels"]
    return rig


def files_from_rig(rig: dict, compress: bool = True) -> dict[str, bytes]:
    """The side's five files from a rig, the NANR LZ11-compressed (or not, for a reader that decompresses it)."""
    if rig.get("format") != FORMAT:
        raise RigError(f"a rig of format {rig.get('format')}, not {FORMAT}")
    names = [track["name"] for track in rig["tracks"]]
    animations = write_container("NANR", [("ABNK", write_bank(rig["tracks"], "tracks")),
                                          ("LABL", write_labels(names)),
                                          ("UEXT", struct.pack("<I", rig.get("extension", 1)))])
    multi_animations = write_container("NMAR", [("ABNK", write_bank(rig["sequences"], "sequences")),
                                                ("LABL", write_labels([s["name"] for s in rig["sequences"]]))])
    return {"info": write_info(rig), "cells": write_cells(rig, rig.get("picture_labels", names)),
            "animations": compress_lz11(animations) if compress else animations,
            "multi_cells": write_multi_cells(rig["poses"]), "multi_animations": multi_animations}


def read_files(folder: Path, side: str) -> dict[str, bytes]:
    """A side's five files from a folder of them (an extracted group, or a musical sprite's)."""
    try:
        return {kind: (folder / f"{side}{suffix}").read_bytes() for kind, suffix in FILES.items()}
    except OSError as error:
        raise RigError(f"{folder}: can't read the {side} rig ({error})") from error


def files_side(folder: Path, side: str) -> dict:
    """The rig of a folder's five files."""
    try:
        return rig_from_files(read_files(folder, side), side)
    except (struct.error, ValueError, IndexError, KeyError) as error:
        raise RigError(f"{folder}: can't read the {side} rig ({error})") from error


def rig_path(folder: Path, side: str) -> Path:
    return folder / f"{side}{RIG_FILE}"


def loads(text: str, where: str = "the rig") -> dict:
    """A rig from its JSON, without the "$schema"."""
    try:
        rig = json.loads(text)
    except json.JSONDecodeError as error:
        raise RigError(f"{where}: {error}") from None
    if not isinstance(rig, dict):
        raise RigError(f"{where}: not a JSON object")
    rig.pop("$schema", None)
    return rig


def dumps(rig: dict, folder: Path) -> str:
    """The text of a rig's file in a folder: its "$schema" (the schema relative to the folder) first, in the compact
    layout, a key, a rectangle or a part a line."""
    schema = Path(os.path.relpath(SCHEMA, folder.resolve())).as_posix()
    return dumps_compact({"$schema": schema, **{k: v for k, v in rig.items() if k != "$schema"}}) + "\n"


def read_side(folder: Path, side: str) -> dict:
    """A side's rig from its folder's <side>_rig.json."""
    path = rig_path(folder, side)
    try:
        text = path.read_text()
    except OSError as error:
        raise RigError(f"{folder}: can't read the {side} rig ({error})") from error
    rig = loads(text, str(path))
    if rig.get("side") != side:
        raise RigError(f"{path}: the rig of side {rig.get('side')!r}, not {side}")
    return rig


def write_side(rig: dict, folder: Path, side: str) -> list[Path]:
    """Writes the side's rig JSON after the checks, if it changes; returns it if written."""
    errors = [message for level, message in check(rig) if level == "error"]
    if errors:
        raise RigError("; ".join(errors))
    if rig.get("side") != side:
        raise RigError(f"the rig of side {rig.get('side')!r}, not {side}")
    path = rig_path(folder, side)
    text = dumps(rig, folder)
    if path.is_file() and path.read_text() == text:
        return []
    path.write_text(text)
    return [path]


# The checks (section 11): errors stop a write; warnings are things the originals never do

def check(rig: dict, sheet_size: tuple[int, int] = SHEET_SIZE) -> list[tuple[str, str]]:
    out = []

    def error(message):
        out.append(("error", message))

    def warning(message):
        out.append(("warning", message))

    pictures, tracks, poses, sequences = rig["pictures"], rig["tracks"], rig["poses"], rig["sequences"]
    width, height = sheet_size
    if not pictures:
        error("the rig has no pictures")
    for number_, picture in enumerate(pictures):
        if not 1 <= len(picture["rectangles"]) <= 2:
            error(f"picture {number_} has {len(picture['rectangles'])} rectangles (MCSS draws one or two)")
        for k, rectangle in enumerate(picture["rectangles"]):
            (s, t), (w, h) = rectangle["sheet"], rectangle["size"]
            where = f"picture {number_}'s rectangle {k + 1}"
            if w < 0 or h < 0:
                error(f"{where} has a negative size")
            elif not w or not h:
                if k == 1:
                    error(f"{where} has no width or height (a second rectangle needs both)")
                # 473 originals have an empty first rectangle (nothing drawn)
            elif s < 0 or t < 0 or s + w > 2 * width or t + h > 2 * height:
                error(f"{where} ({s}, {t}, {w} by {h}) reaches past the sheet's mirrored copy")
            elif s + w > width or t + h > height:
                # 6 originals' sides do this: the texture repeats mirrored (GX_TEXREPEAT_ST | GX_TEXFLIP_ST)
                warning(f"{where} ({s}, {t}, {w} by {h}) reaches past the {width} by {height} sheet, where it "
                        f"shows the sheet mirrored")
        for k, obj in enumerate(picture["objs"]):
            if tuple(obj["size"]) not in OBJ_SIZES.values():
                error(f"picture {number_}'s OBJ {k + 1} is {obj['size'][0]} by {obj['size'][1]}, not an OBJ size")
    played = {part["track"] for pose in poses for part in pose["parts"]}
    names = set()
    for number_, track in enumerate(tracks):
        where = f"track {number_} ({track['name']})"
        if track["name"] in names:
            warning(f"{where}: another track has the same name")
        names.add(track["name"])
        # 5 unplayed tracks of Marshtomp's and Shelgon's backs show pictures the side doesn't have, which nothing draws
        check_sequence(track, where, "picture", len(pictures), "pictures",
                       error if number_ in played else warning)
    for number_, pose in enumerate(poses):
        parts = pose["parts"]
        if len(parts) > MOST_PARTS:
            error(f"pose {number_} has {len(parts)} parts; a translucent sprite gives each its own polygon ID, "
                  f"at most {MOST_PARTS}")
        instances = pose.get("instances", len(parts))
        for k, part in enumerate(parts):
            if not 0 <= part["track"] < len(tracks):
                error(f"pose {number_}'s part {k} plays track {part['track']}, past the {len(tracks)} tracks")
            if part["play"] not in PART_PLAY.values():
                error(f"pose {number_}'s part {k} has play mode {part['play']}, not restart or continue")
            if not all(-0x8000 <= value < 0x8000 for value in part["pivot"]):
                error(f"pose {number_}'s part {k}'s pivot is out of range")
            if not 0 <= part.get("instance", k) < min(instances, 0x100):
                error(f"pose {number_}'s part {k} uses track instance {part.get('instance', k)}, past the pose's "
                      f"{instances}")
    if not poses:
        error("the rig has no poses")
    if not sequences:
        error("the rig has no sequences (the game loops sequence 0)")
    for number_, sequence in enumerate(sequences):
        check_sequence(sequence, f"sequence {number_} ({sequence['name']})", "pose", len(poses), "poses", error)
    if sequences and sequences[0]["play"] != "loop":
        warning("sequence 0, which the battle loops, doesn't loop")
    idle = rig["idle_parts"]
    if idle is not None:
        most = max((len(pose["parts"]) for pose in poses), default=0)
        if len(idle) >= 0xFF:
            error("too many idle parts")
        for part in idle:
            if part >= most:
                error(f"idle part {part} is past the poses' parts ({most})")
    box = rig["box"]
    if not (0 <= box["width"] < 0x10000 and 0 <= box["height"] < 0x10000):
        error("the box's size is out of range")
    if not 0 <= rig["stop_flags"] < 0x100:
        error("the stop flags are out of range")
    return out


def check_sequence(sequence: dict, where: str, pointer: str, count: int, things: str, error) -> None:
    if not sequence["keys"]:
        error(f"{where} has no keys")
    if sequence["key_type"] not in KEY_TYPES.values():
        error(f"{where}'s keys are {sequence['key_type']!r}, not plain, srt or move")
    if sequence["play"] not in PLAY_MODES.values():
        error(f"{where} has play mode {sequence['play']!r}")
    holds = {"plain": set(), "srt": {"rotation", "scale", "move"}, "move": {"move", "unused"}}.get(
        sequence["key_type"], set())
    past = [k for k, key in enumerate(sequence["keys"]) if not 0 <= key.get(pointer, 0) < count]
    if past:
        shown = sorted({sequence["keys"][k][pointer] for k in past})
        error(f"{where}: {len(past)} of its keys show {pointer} {', '.join(map(str, shown))}, past the {count} "
              f"{things} (key {past[0]} first)")
    for k, key in enumerate(sequence["keys"]):
        lost = set(key) - holds - {pointer, "frames", "marker", "result_copy"}
        if lost:
            error(f"{where}'s key {k} has {', '.join(sorted(lost))}, which a {sequence['key_type']} track can't hold")
        missing = holds - {"unused"} - set(key)
        if missing:
            error(f"{where}'s key {k} has no {', '.join(sorted(missing))}")
            continue
        if not 0 <= key["frames"] < 0x10000:
            error(f"{where}'s key {k} lasts {key['frames']} frames")
        if sequence["key_type"] == "srt":
            if not 0 <= key.get("rotation", 0) < 0x10000:
                error(f"{where}'s key {k} has rotation {key['rotation']} (0 to 65535, a full turn)")
            if not all(-0x80000 <= value < 0x80000 for value in key.get("scale", [1, 1])):
                error(f"{where}'s key {k} has a scale out of range")
        if "move" in key and not all(-0x8000 <= value < 0x8000 for value in key["move"]):
            error(f"{where}'s key {k} moves out of range")
    if sequence["keys"] and not sum(key["frames"] for key in sequence["keys"]):
        error(f"{where} lasts no frames")


def groups(root: Path) -> list[Path]:
    """Every folder of res/pokemon with a battle sprite's rig (not the musical's)."""
    return sorted({path.parent for path in root.rglob(f"front{RIG_FILE}") if "musical" not in path.parts})


def convert(root: Path) -> int:
    """Turns every side's five files below root (but the musical's) into its rig JSON, after proving that the JSON
    gives the files back byte for byte, and removes the files. Returns how many sides it converted."""
    folders = sorted({path.parent for path in root.rglob(f"front{FILES['info']}") if "musical" not in path.parts})
    count = 0
    for folder in folders:
        for side in SIDES:
            files = read_files(folder, side)
            text = dumps(rig_from_files(files, side), folder)
            rig = loads(text)
            errors = [message for level, message in check(rig) if level == "error"]
            if errors:
                raise RigError(f"{folder} {side}: {'; '.join(errors)}")
            differ = [kind for kind, blob in files_from_rig(rig).items() if blob != files[kind]]
            if differ:
                raise RigError(f"{folder} {side}: the JSON gives other {', '.join(differ)}")
            rig_path(folder, side).write_text(text)
            for suffix in FILES.values():
                (folder / f"{side}{suffix}").unlink()
            count += 1
    return count


def main():
    args = sys.argv[1:]
    if len(args) == 3 and args[0] == "dump" and args[2] in SIDES:
        print(dumps(files_side(Path(args[1]), args[2]), Path(args[1])), end="")
    elif len(args) == 4 and args[0] == "files" and args[2] in SIDES:
        rig = read_side(Path(args[1]), args[2])
        errors = [message for level, message in check(rig) if level == "error"]
        if errors:
            raise SystemExit("; ".join(errors))
        output = Path(args[3])
        output.mkdir(parents=True, exist_ok=True)
        for kind, blob in files_from_rig(rig).items():
            (output / f"{args[2]}{FILES[kind]}").write_bytes(blob)
    elif len(args) in (2, 3) and args[0] == "check":
        failed = False
        for side in args[2:] or SIDES:
            for level, message in check(read_side(Path(args[1]), side)):
                print(f"{side}: {level}: {message}")
                failed |= level == "error"
        sys.exit(1 if failed else 0)
    elif len(args) in (1, 2) and args[0] == "convert":
        print(f"converted {convert(Path(args[1]) if len(args) == 2 else ROOT / 'res/pokemon')} sides")
    elif len(args) in (1, 2) and args[0] == "roundtrip":
        root = Path(args[1]) if len(args) == 2 else ROOT / "res/pokemon"
        sides = failures = 0
        for folder in groups(root):
            for side in SIDES:
                sides += 1
                try:
                    text = rig_path(folder, side).read_text()
                    rig = loads(text)
                    errors = [message for level, message in check(rig) if level == "error"]
                    if errors:
                        raise RigError("; ".join(errors))
                    again = dumps(rig_from_files(files_from_rig(rig), side), folder)
                    if again != text:
                        raise RigError("the files give another JSON")
                except (RigError, OSError, struct.error, ValueError, KeyError, IndexError) as error:
                    failures += 1
                    print(f"{folder.relative_to(root)} {side}: {error}")
        print(f"{sides - failures} of {sides} sides round-trip")
        sys.exit(1 if failures else 0)
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
