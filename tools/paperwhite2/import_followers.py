#!/usr/bin/env python3
"""Write the Following Pokémon's field actors of a Paper White 2 ROM into res/field/actors/followers/ and their object
codes into generated/obj_codes.txt.

    import_followers.py HACK_FILES [ROOT]

    import_followers.py extract/pw2_v021/files res/field/actors

Pokeweb's follower installer appended 2,574 entries to the model table (a/0/4/7), the rows from 1,008, with object
codes from 0x3000, and 348 sprites to its graphics archive (a/0/4/8), the members from 975. Its registry
(following/runtime-registry.bin) gives each row's species, form, sex and shininess, which name its code:
OBJ_CODE_FOLLOWER_<SPECIES>[_FORM_<n>][_FEMALE][_SHINY], as the walking Pokémon's OBJ_CODE_POKEMON_ are named. Each
row's directory has its data.json; the first row to show one of the new sprites has its sprite.png and sprite.pal
("texture_set_format": "pokeweb"), and the rows that show a sprite they don't own name its code in "sprite": a walking
Pokémon's (the original game's, OBJ_CODE_POKEMON_) or another follower's. Where the installer added sprites later,
out of the rows' order, "sprite_batch" keeps their place, so field_actor_data.py packs the hack's archives byte for
byte. The base's 1,008 rows must already be in res/ (import_field_actors.py).
"""
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "tools" / "data")]
from tools.data import field_actor_data as actors  # noqa: E402
from tools.data.datajson import write  # noqa: E402
from tools.data.gen_constants import load as load_list  # noqa: E402
from tools.data.narc import read_narc  # noqa: E402
from tools.data.nitro_2d import write_indexed_png, write_palette  # noqa: E402
from tools.paperwhite2.import_field_actors import read  # noqa: E402

REGISTRY = "following/runtime-registry.bin"
POSITIONING = "following/positioning.narc"
CODE_BASE = 0x3000
BASE_ROWS = 1008
BASE_MEMBERS = 975
# A registry row (version 3): species, form, sex (0 male, 1 female, 2 none), shiny, placeholder, the table row, its
# member, the sprite's size, the animation profile, the art's offsets, the side gap (following_data.py)
REGISTRY_ROW = struct.Struct("<HBBBBHHBBbbbB8x")
REGISTRY_STRIDE = 24
LIST = ROOT / "generated" / "obj_codes.txt"
LIST_COMMENT = ("# Paper White 2: the Following Pokémon's (res/field/actors/followers/, import_followers.py), the rows\n"
                "# that Pokeweb's follower installer added, by species, form, sex and shininess\n")


def registry_rows(files: Path) -> dict[int, tuple]:
    """Returns each table row's registry row."""
    data = (files / REGISTRY).read_bytes()
    if data[:4] != b"FWDB" or struct.unpack_from("<H", data, 4)[0] != 3:
        raise SystemExit(f"{REGISTRY} isn't a version 3 follower registry")
    count = struct.unpack_from("<H", data, 12)[0]
    rows = {}
    for index in range(count):
        row = REGISTRY_ROW.unpack_from(data, 32 + REGISTRY_STRIDE * index)
        rows[row[5]] = row
    return rows


def positioning_rows(files: Path) -> list[bytes]:
    """Returns the positioning table's rows, by table row from the first follower's."""
    member = read_narc((files / POSITIONING).read_bytes())[0]
    count = struct.unpack_from("<H", member, 6)[0]
    rows = [member[24 + 12 * index:36 + 12 * index] for index in range(count)]
    if any(row[4:] != bytes(8) for row in rows):
        raise SystemExit("a follower has rider anchors, which the base package doesn't have")
    return rows


def follower_json(species_names: dict[int, str], row: tuple, positioning: bytes) -> dict:
    species, form, sex, shiny, placeholder, _, _, _, profile, x, y, z, side_gap = row
    return {
        "species": species_names[species],
        "form": form,
        "sex": {0: "GENDER_MALE", 1: "GENDER_FEMALE", 2: None}[sex],
        "shiny": bool(shiny),
        "placeholder": bool(placeholder),
        "animation_profile": ("mirrored", "asymmetric")[profile],
        "art_offset": {"x": x, "y": y, "z": z},
        "side_gap": side_gap,
        "gaps": dict(zip(("up", "down", "left", "right"), positioning[:4])),
    }


def code_name(species_names: dict[int, str], species: int, form: int, sex: int, shiny: int) -> str:
    name = "OBJ_CODE_FOLLOWER_" + species_names[species].removeprefix("SPECIES_")
    if form:
        name += f"_FORM_{form}"
    if sex == 1:
        name += "_FEMALE"
    if shiny:
        name += "_SHINY"
    return name


def main(files: Path, root: Path):
    records, graphics = read(files)
    rows = registry_rows(files)
    positioning = positioning_rows(files)
    species_names = {value: name for name, value in reversed(load_list("species").items())}
    base_codes = [code for code, number in actors.codes() if number < CODE_BASE]
    if len(base_codes) != BASE_ROWS or len(records) <= BASE_ROWS or len(graphics) <= BASE_MEMBERS:
        raise SystemExit("expected the base's 1,008 codes in obj_codes.txt and a longer table and archive in the hack")
    # The base's sprites by member, which the followers show too
    owner_of = {record[15]: code for code, record in zip(base_codes, records) if record[1] == 1}
    names = []
    for row in range(BASE_ROWS, len(records)):
        record = records[row]
        if record[0] != CODE_BASE + row - BASE_ROWS or record[1] != 1 or row not in rows:
            raise SystemExit(f"row {row}: expected a sprite with code {CODE_BASE + row - BASE_ROWS:#x} in the registry")
        names.append(code_name(species_names, *rows[row][:4]))
    if len(set(names)) != len(names):
        raise SystemExit("two follower rows would have one name")
    # Each new member's owner is the first row that shows it; a member whose owner comes before the previous member's
    # starts a new batch
    first_row = {}
    for row in range(BASE_ROWS, len(records)):
        first_row.setdefault(records[row][15], row)
    batch_of, batch, previous = {}, 0, -1
    for member in range(BASE_MEMBERS, len(graphics)):
        if member not in first_row:
            raise SystemExit(f"no follower row shows member {member}")
        if first_row[member] < previous:
            batch += 1
        batch_of[member], previous = batch, first_row[member]
        owner_of[member] = names[first_row[member] - BASE_ROWS]
    for row, name in enumerate(names, BASE_ROWS):
        record = records[row]
        member = record[15]
        path = actors.directory(root, name)
        path.mkdir(parents=True, exist_ok=True)
        data = actors.record_json(record, None)
        data["follower"] = follower_json(species_names, rows[row], positioning[row - BASE_ROWS])
        if owner_of[member] == name:
            width, height, pixels, colors = actors.sprite_frames(graphics[member])
            if actors.sprite_texture_set(width, height, pixels, colors, "pokeweb") != graphics[member]:
                raise SystemExit(f"member {member} isn't a texture set as the follower installer wrote them")
            (path / "sprite.png").write_bytes(write_indexed_png(width, height, pixels, colors))
            (path / "sprite.pal").write_text(write_palette(colors))
            data["texture_set_format"] = "pokeweb"
            if batch_of[member]:
                data["sprite_batch"] = batch_of[member]
        else:
            data["sprite"] = owner_of[member]
        write(path / "data.json", data)
    text = LIST.read_text()
    if "OBJ_CODE_FOLLOWER_" not in text:
        lines = [f"{names[0]} = {CODE_BASE:#x}", *names[1:]]
        LIST.write_text(text.rstrip("\n") + "\n" + LIST_COMMENT + "\n".join(lines) + "\n")
    print(f"wrote {len(names)} followers, {len(graphics) - BASE_MEMBERS} sprites of their own, in {batch + 1} batches")


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]), Path(sys.argv[2] if len(sys.argv) == 3 else "res/field/actors"))
