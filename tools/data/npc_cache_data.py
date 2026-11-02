#!/usr/bin/env python3
"""The zones' sprite preloads, a/0/5/7, dumped into res/field/actors/preloads.json for the editors.

    npc_cache_data.py dump extract/w2_us/files res/field/actors/preloads.json
    npc_cache_data.py check extract/w2_us/files res/field/actors/preloads.json   # packs the lists, compares with the ROM's

A zone's header names one of the lists (its "npc_cache", GetZoneNPCInfoCacheIdx); a number past the last clears the
cache instead. At a zone change the field reads the list into the actor system's config cache
(LoadMModelSystemInfoCache), and at field init loads each of its object codes' sprites into the sprite material cache
(FldActSys_LoadCachedBillboardActor), whose 32 entries the hero's sprite and the zone's NPCs' share: a code the list
preloads costs an NPC nothing more, and one past the 32 isn't shown (docs/paperwhite2/design/npc-research.md, the
limits). The Overworld Editor's sprite bar counts them.

A list's file: u16 its count, the codes (u16 each), 0xff bytes up to (count + 1) / 2 * 2 codes and 2 bytes more, then
each code's 28-byte record of the actor table (a/0/4/7), in the list's order. The build still uses the ROM's a/0/5/7:
check packs the JSON's lists with the ROM's records and compares, so the dump is known to say what the game reads.
"""
import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.datajson import dumps  # noqa: E402
from tools.data.field_actor_data import RECORD  # noqa: E402
from tools.data.gen_constants import load as load_list  # noqa: E402
from tools.data.narc import read_narc  # noqa: E402

ARCHIVE = "a/0/5/7"
TABLE = "a/0/4/7"


def code_names() -> dict[int, str]:
    return {number: name for name, number in load_list("obj_codes").items()}


def lists(files: Path) -> list[list[int]]:
    out = []
    for blob in read_narc((files / ARCHIVE).read_bytes()):
        count = struct.unpack_from("<H", blob, 0)[0]
        out.append(list(struct.unpack_from(f"<{count}H", blob, 2)))
    return out


def pack_list(codes: list[int], records: dict[int, bytes]) -> bytes:
    size = (len(codes) + 1) // 2 * 2
    return (struct.pack(f"<H{len(codes)}H", len(codes), *codes) + b"\xff" * ((size - len(codes)) * 2 + 2)
            + b"".join(records[code] for code in codes))


def dump(files: Path, output: Path):
    names = code_names()
    data = {"$schema": "preloads.schema.json",
            "lists": [[names.get(code, code) for code in codes] for codes in lists(files)]}
    output.write_text(dumps(data) + "\n")


def check(files: Path, source: Path):
    table = read_narc((files / TABLE).read_bytes())[0]
    count = struct.unpack_from("<I", table, 0)[0]
    records = {struct.unpack_from("<H", table, 4 + i * RECORD.size)[0]: table[4 + i * RECORD.size:4 + (i + 1) * RECORD.size]
               for i in range(count)}
    numbers = {name: number for number, name in code_names().items()}
    data = json.loads(source.read_text())
    original = read_narc((files / ARCHIVE).read_bytes())
    built = [pack_list([numbers[c] if isinstance(c, str) else c for c in codes], records) for codes in data["lists"]]
    same = sum(a == b for a, b in zip(original, built))
    print(f"{same} of {len(original)} lists as the ROM's" + ("" if len(built) == len(original) else f" ({len(built)} in the JSON)"))
    if same != len(original) or len(built) != len(original):
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] in ("dump", "check"):
        (dump if sys.argv[1] == "dump" else check)(Path(sys.argv[2]), Path(sys.argv[3]))
    else:
        raise SystemExit(__doc__)
