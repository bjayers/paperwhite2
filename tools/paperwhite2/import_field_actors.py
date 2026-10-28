#!/usr/bin/env python3
"""Write the graphics that a hack ROM changed for the base game's field actors into res/field/actors/.

    import_field_actors.py BASE_FILES HACK_FILES [ROOT]

    import_field_actors.py extract/w2_us/files extract/pw2_v021/files res/field/actors

Only the base game's actors are read: the hack's table (a/0/4/7) and graphics archive (a/0/4/8) can be longer, as
Paper White 2's are with the Following Pokémon's actors, and what comes after the base's entries and members is left
for later. Each of the base's table entries must be the same in the hack, so only the graphics change: for each object
code whose graphics member differs, its sprite.png and sprite.pal, or its model.nsbmd, are written as
field_actor_data.py dump writes them, so its pack gives the hack's bytes. data.json isn't touched.
"""
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "tools" / "data")]
from tools.data import field_actor_data as actors  # noqa: E402
from tools.data.narc import read_narc  # noqa: E402
from tools.data.nitro_2d import write_indexed_png, write_palette  # noqa: E402


def read(files: Path) -> tuple[list[tuple], list[bytes]]:
    """Returns a ROM's table records and graphics members."""
    table = read_narc((files / actors.TABLE).read_bytes())[0]
    count = struct.unpack_from("<I", table, 0)[0]
    records = [actors.RECORD.unpack_from(table, 4 + actors.RECORD.size * index) for index in range(count)]
    return records, read_narc((files / actors.GRAPHICS).read_bytes())


def main(base_files: Path, hack_files: Path, root: Path):
    base_records, base_graphics = read(base_files)
    hack_records, hack_graphics = read(hack_files)
    code_list = actors.codes()
    if [number for _, number in code_list] != [record[0] for record in base_records]:
        raise SystemExit("obj_codes.txt doesn't list the base table's object codes in its order")
    if len(hack_records) < len(base_records) or len(hack_graphics) < len(base_graphics):
        raise SystemExit("the hack's table or graphics archive is shorter than the base's")
    changed_records = [code for (code, _), base, hack in zip(code_list, base_records, hack_records) if base != hack]
    if changed_records:
        raise SystemExit(f"the hack changed these codes' table entries, which this doesn't import: {changed_records}")
    changed = {index for index, member in enumerate(base_graphics) if member != hack_graphics[index]}
    written = set()
    for (code, _), record in zip(code_list, base_records):
        entity, resource = record[1], record[15]
        if entity == 0 or resource not in changed or resource in written:
            continue
        written.add(resource)
        path = actors.directory(root, code)
        member = hack_graphics[resource]
        if entity == 2:
            (path / "model.nsbmd").write_bytes(member)
            files = "model.nsbmd"
        else:
            width, height, pixels, colors = actors.sprite_frames(member)
            (path / "sprite.png").write_bytes(write_indexed_png(width, height, pixels, colors))
            (path / "sprite.pal").write_text(write_palette(colors))
            files = "sprite.png, sprite.pal"
        print(f"{code}: member {resource}, wrote {files} in {path}")
    if changed - written:
        raise SystemExit(f"no object code shows the changed members {sorted(changed - written)}")
    print(f"{len(written)} of the base's {len(base_graphics)} graphics members changed")


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3] if len(sys.argv) == 4 else "res/field/actors"))
