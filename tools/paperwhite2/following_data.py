"""Paper White 2: the Following Pokémon's registry and positioning, packed from the followers' data.json files.

field_actor_data.py calls members() when it packs the model table (a/0/4/7) and some object codes have a "follower"
object (res/field/actors/followers/, OBJ_CODE_FOLLOWER_): the table's archive then has two more members, which the
follower runtime (src/paperwhite2/ov036/) reads, in the formats that Pokeweb's runtime read from its own files
(docs/paperwhite2/following-pokemon.md, Data):

- member 1, the registry (following/runtime-registry.bin in the hack's ROM): "FWDB" version 3, ABI 1, a 32-byte
  header (the file's size, the row count, no zone rows, the table's row count and the graphics' member count, the
  first follower code and the original's row count, and the CRC-32 of the file with that CRC zeroed), then a 24-byte
  row per follower, sorted by species * 2048 + form * 8 + sex * 2 + shiny: species, form, sex (0 male, 1 female,
  2 none), shiny, placeholder, the table row, the graphics member, the sprite's size (32 or 64), the animation
  profile, the art's x, y and z offsets, the side gap and 8 zero bytes.
- member 2, the positioning table (member 0 of following/positioning.narc): "FWPO" version 1, the follower and Surf
  row counts (no Surf rows), the strides 12 and 8, the registry's CRC-32, 0 for the Surf registry's, the CRC-32 of
  what follows the header, then per table row from the first follower's the up, down, left and right gaps and 8 zero
  bytes of rider anchors.
"""
import struct
import zlib

REGISTRY_VERSION = 3
REGISTRY_ABI = 1
POSITIONING_VERSION = 1
SEXES = {"GENDER_MALE": 0, "GENDER_FEMALE": 1, None: 2}
PROFILES = {"mirrored": 0, "asymmetric": 1}
GAPS = ("up", "down", "left", "right")
SIDE_GAP_MAX = 6
GAP_MAX = 12


def members(followers: list[tuple[int, int, int, int, dict]], rows: int, resources: int, code_base: int,
            stock_rows: int, constants: dict[str, int]) -> list[bytes]:
    """Returns the registry and the positioning table of the followers: (code, table row, graphics member, sprite
    size, follower object) in code order, which must be the rows from stock_rows on."""
    if [row for _, row, *_ in followers] != list(range(stock_rows, stock_rows + len(followers))):
        raise ValueError("the followers must be the table's rows after the original's")
    entries = []
    for code, row, resource, size, follower in followers:
        species = constants[follower["species"]]
        sex = SEXES[follower["sex"]]
        key = species * 2048 + follower["form"] * 8 + sex * 2 + int(follower["shiny"])
        offset = follower["art_offset"]
        if not 0 <= follower["side_gap"] <= SIDE_GAP_MAX or any(not 0 <= follower["gaps"][g] <= GAP_MAX for g in GAPS):
            raise ValueError(f"object code {code:#x}: a gap out of range")
        entries.append((key, struct.pack(
            "<HBBBBHHBBbbbB8x", species, follower["form"], sex, int(follower["shiny"]), int(follower["placeholder"]),
            row, resource, size, PROFILES[follower["animation_profile"]], offset["x"], offset["y"], offset["z"],
            follower["side_gap"]), bytes(follower["gaps"][g] for g in GAPS) + bytes(8)))
    keys = [key for key, *_ in entries]
    if len(set(keys)) != len(keys):
        raise ValueError("two followers have one species, form, sex and shininess")
    body = b"".join(registry_row for _, registry_row, _ in sorted(entries))
    size = 32 + len(body)
    header = bytearray(struct.pack("<4sHHIHHHHHHII", b"FWDB", REGISTRY_VERSION, REGISTRY_ABI, size, len(entries), 0,
                                   rows, resources, code_base, stock_rows, 0, 0))
    struct.pack_into("<I", header, 24, zlib.crc32(bytes(header) + body))
    registry = bytes(header) + body
    payload = b"".join(positioning_row for *_, positioning_row in entries)
    positioning = struct.pack("<4sHHHBBIII", b"FWPO", POSITIONING_VERSION, len(entries), 0, 12, 8,
                              zlib.crc32(registry), 0, zlib.crc32(payload)) + payload
    return [registry, positioning]
