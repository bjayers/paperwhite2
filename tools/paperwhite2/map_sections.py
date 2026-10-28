"""Say which section of each changed map chunk (a/0/0/8) the hack's edits fall in.

Usage: map_sections.py BASE_FILES HACK_FILES
"""

import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools/data"))
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from narc import read_narc
from map_terrain_data import terrain_ranges
from map_model_data import PROP_OFFSETS
from tools.data.gen_constants import load as load_list


def sections(chunk):
    u32 = lambda o: struct.unpack_from("<I", chunk, o)[0]
    model = u32(4)
    found = [("model", model, model + u32(model + 8))]
    for layer, (start, end) in enumerate(terrain_ranges(chunk)):
        found.append((f"terrain_{layer}", start, end))
    offset_field, end_field = PROP_OFFSETS[bytes(chunk[:2])]
    found.append(("props", u32(offset_field), u32(end_field)))
    return found


def main():
    base = read_narc((Path(sys.argv[1]) / "a/0/0/8").read_bytes())
    hack = read_narc((Path(sys.argv[2]) / "a/0/0/8").read_bytes())
    names = {v: k for k, v in load_list("map_models").items()}
    for i, (b, h) in enumerate(zip(base, hack)):
        if b == h:
            continue
        diffs = [j for j in range(min(len(b), len(h))) if b[j] != h[j]]
        hits = {}
        for j in diffs:
            where = next((n for n, s, e in sections(b) if s <= j < e), f"other@0x{j:x}")
            hits[where] = hits.get(where, 0) + 1
        print(f"{i} {names.get(i, '?')}: " + ", ".join(f"{k} {v}" for k, v in hits.items()))


main()
