#!/usr/bin/env python3
"""Paper White 2's Entralink roguelike: the generated header of res/paperwhite2/entralink/.

    entralink_run.py OUTPUT_HEADER        # writes paperwhite2/entralink_run_config.h
    entralink_run.py --check              # only checks the data

The data (docs/paperwhite2/design/entralink-roguelike-prototype.md, schemas beside it) is run.json, the run's layout,
and rooms/<id>.json, one room each, whose ID is the file's name. The header has the rooms in the order of their IDs,
their battles, enemies, NPCs and requirements each in one table, the rounds and the zones, as the initializers that
src/paperwhite2/ov012/paperwhite2_entralink_run.c reads (the structs and ENTRALINK_* values of
include/paperwhite2/entralink_run.h). The NPCs' dialogue goes into the script text bank entralink_dialogue, whose one
line \\from{entralink.dialogue} stands for dialogue_lines() (tools/text/text_sources.py); the header gives each NPC
its messages' numbers there. Only the hack's build runs this (configure.py --hack); the text is in every build.

The markers' art (step 5): markers/<type>.png, one per MARKER_TYPES, 32 by 32, and npc_markers/<name>.png, any
number, 16 by 16, each an indexed PNG of at most 16 colors with index 0 transparent. marker_members() packs them as
BTX0s (one GX_TEXFMT_PLTT16 texture and its palette each), the ground markers in MARKER_TYPES' order and then the NPC
markers in their names' order, which field_actor_data.py puts in the model table (a/0/4/7) from member
MARKER_FIRST_MEMBER on, after the Following Pokémon's; the header gives the C the members' numbers.
"""
import argparse
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data import datajson  # noqa: E402
from tools.data.nitro_2d import color5, encode_characters, read_indexed_png  # noqa: E402

SOURCE = ROOT / "res" / "paperwhite2" / "entralink"
GUARD = "POKEBW2_PAPERWHITE2_ENTRALINK_RUN_CONFIG_H"
# include/paperwhite2/entralink_run.h's values
FORMATS = {"single": 0, "double": 1, "triple": 2, "raid": 3}
# The enemies each format takes: a double or triple battle with fewer leaves places of its side empty, which the battle
# code doesn't expect (the foe's AI reads them as Pokémon and corrupts memory, entralink-roguelike-prototype.md)
ENEMY_COUNTS = {"single": 1, "double": 2, "triple": 3, "raid": 1}
ROLES = {"room": 0, "boss": 1, "final": 2}
NPC_TYPES = {"battle": 0, "item": 1, "rest": 2, "buff": 3, "heal": 4, "revive": 5, "gift": 6, "shop": 7,
             "item_choice": 8, "buff_choice": 9, "swap": 10, "ambient": 11}
# An ambient's reaction (ENTRALINK_AMBIENT_*) and its distances' defaults: it reacts within near tiles of the player, a
# fading one with return comes back once the player is far tiles away, a fleeing one runs distance tiles
AMBIENT_BEHAVIOURS = {"fade": 0, "flee": 1}
AMBIENT_NEAR = 3
AMBIENT_FAR = 6
AMBIENT_DISTANCE = 4
AMBIENT_KEYS = ("behaviour", "near", "return", "far", "distance")
# A room's type (ENTRALINK_TYPE_*), which its doors draw by the round's weights, and the marker it shows by default.
# enemy_choice (step 7) is an enemy room with several battles to choose from, one NPC each
ROOM_TYPES = {"enemy": 0, "challenge": 1, "rest": 2, "item": 3, "buff": 4, "shop": 5, "event": 6, "enemy_choice": 7}
TYPE_MARKERS = {"enemy": "enemy", "challenge": "challenge", "rest": "rest", "item": "gift", "buff": "gift",
                "shop": "shop", "event": "event", "enemy_choice": "enemy_choice"}
# The types a door draws from rooms/ only (event from its template too, if there is one)
PREMADE_TYPES = ["enemy", "enemy_choice", "challenge", "event"]
DEFAULT_TYPE_WEIGHTS = {"enemy": 42, "enemy_choice": 8, "challenge": 12, "item": 10, "buff": 10, "rest": 10,
                        "event": 5, "shop": 3}
# The templates (templates/<name>.json): each a room of role room, the generated room of its type, and the pre-boss
# rest before a boss or the final room; event's is optional (with none, a door draws event only from rooms/)
TEMPLATES = {"rest": "rest", "item": "item", "buff": "buff", "shop": "shop", "pre_boss_rest": "rest",
             "event": "event"}
OPTIONAL_TEMPLATES = {"event"}
TEMPLATE_NONE = 0xff
DEFAULT_CUSTOM_CHANCE = 25
DEFAULT_GROUND_ITEM_CHANCE = 30
DEFAULT_HIDDEN_ITEM_CHANCE = 20
# Dream Dust (step 7): what a battle won gives by its room (ENTRALINK_DUST_* order), times its round's percent; and a
# shop's goods
DUST_KINDS = ["enemy", "enemy_choice", "challenge", "boss", "final"]
DEFAULT_DUST = {"enemy": 40, "enemy_choice": 50, "challenge": 80, "boss": 150, "final": 0}
DEFAULT_DUST_ROUND_PERCENT = [100, 150, 200]
DEFAULT_SHOP_ITEMS = 5
# Phase 7 of the buffs: the Dream Dust a rest stop's swap costs, and the Reserve Box's slots that the hub offers (at
# most the progress block's, ENTRALINK_RESERVE_MAX)
DEFAULT_SWAP_DUST = 100
DEFAULT_RESERVE_SLOTS = 6
# Phase 5 (entralink-buffs.md, section 12) and the rebalance (2026-11-20): the enemies' stat multipliers, in
# EntralinkScaling's order (ENTRALINK_STAT_*): a room curve keyed by the room's depth across the run (start, end and a
# curve exponent in hundredths) and a boss bonus per round over the curve (rebalance 2); an enemy's own scale; and a
# raid's extra HP factor
SCALED_STATS = ["hp", "attack", "defense", "sp_attack", "sp_defense", "speed"]
SCALING_DEFAULTS = {"start": 100, "end": 100, "curve": 100}
DEFAULT_SCALE = 100
DEFAULT_RAID_HP_FACTOR = 3.0
# A boss battle's foes' HP bonus factor with two foes and with three (fixes 9; a raid is one foe)
DEFAULT_BOSS_DOUBLE_FACTOR = 0.85
DEFAULT_BOSS_TRIPLE_FACTOR = 0.7
# Rebalance 2: a boss is the room curve at its round's last room times its bonus (percent); the game's percents are u16
DEFAULT_BOSS_BONUS = 100
MAX_PERCENT = 0xffff
# The item table's pools (ENTRALINK_POOL_*, bits)
POOLS = {"item_room": 0, "gift": 1, "shop": 2, "ground": 3}
# An item without a bag icon in the model table
ICON_NONE = 0xff
ICONS_MAX = 127
# Step 7: a bag icon's picture is in the top-left 24 by 24 of its 32 by 32 (the bag draws it so), so over an item room's
# ball it sat left of the ball's middle and high above it: moved right 4 (centring the 24 in the 32) and down 8, onto
# the ball, measured in py-desmume
ICON_SHIFT = (4, 8)
# A message's window (ENTRALINK_STYLE_*): talk is the default
STYLES = {"talk": 0, "bubble": 1, "yell": 2, "event": 3}
WEATHER_FIELD = 0xff
FIELD_WEATHER_ZONE = 0xff
# The ground markers' types (ENTRALINK_MARKER_*), in their members' order. catch is never set by hand: the game shows
# it instead of enemy, enemy_choice, challenge or boss when the room has an enemy the Nightmare Ball catches now and the
# run's bag holds one. enemy_choice (step 7) comes after catch, so the others keep their members
MARKER_TYPES = ["enemy", "challenge", "boss", "rest", "gift", "event", "shop", "unknown", "final", "catch",
                "enemy_choice"]
# A room's marker by its role, when it has none
ROLE_MARKERS = {"room": "enemy", "boss": "boss", "final": "final"}
# An NPC without a marker (ENTRALINK_NPC_MARKER_NONE)
NPC_MARKER_NONE = 0xff
NPC_MARKERS_MAX = 64
# The markers' textures: a ground marker 32 by 32 (2 by 2 tiles), an NPC's 16 by 16, 16 colors with index 0 clear
MARKER_SIZE = 32
NPC_MARKER_SIZE = 16
MARKER_COLORS = 16
GX_TEXFMT_PLTT16 = 3
# The model table's first member after the Following Pokémon's members 0 to 23 (field_actor_data.py)
MARKER_FIRST_MEMBER = 24
# The doors in front of which the markers lie, in ENTRALINK_DOOR_* order, and their spots' defaults (each the top-left
# tile of the 2 by 2 marker on the clearings' 32 by 32 grid)
DOORS = ["north", "east", "west"]
DEFAULT_MARKER_SPOTS = {"north": [15, 12], "east": [21, 16], "west": [9, 16]}
DEFAULT_UNKNOWN_CHANCE = 5
# A pre-boss map left out: the room maps, with only the north door
PRE_BOSS_ZONE_NONE = 0xffff
ABILITY_SPECIES = 0
ABILITY_HIDDEN = 0xffff
GENDERS = {None: 0, "male": 1, "female": 2}
NONE16 = 0xffff
# A requirement that is a finished run rather than a battle's progress id
RUN_COMPLETED = "run/completed"
REQUIRE_RUN_COMPLETED = 0xffff
DEFAULT_LEVEL = 70
# The sprites an NPC shows without its own: an item NPC the item ball, rest and buff NPCs the Lady
DEFAULT_SPRITES = {"item": "OBJ_CODE_110", "rest": "OBJ_CODE_LADY", "buff": "OBJ_CODE_LADY", "heal": "OBJ_CODE_LADY",
                   "revive": "OBJ_CODE_LADY", "gift": "OBJ_CODE_LADY", "shop": "OBJ_CODE_LADY",
                   "item_choice": "OBJ_CODE_110", "buff_choice": "OBJ_CODE_110", "swap": "OBJ_CODE_LADY",
                   "ambient": "OBJ_CODE_LADY"}
# The save's bits (include/paperwhite2/entralink_progress.h)
BATTLES_MAX = 1024
CATCHES_MAX = 512
# The rooms of a run, the pre-boss rests and the final's included (ENTRALINK_RUN_ROOMS_MAX)
RUN_ROOMS_MAX = 32


def walking_sprite(enemy: dict, constants: dict[str, int]) -> str | None:
    """A battle NPC's sprite when it has none of its own: its enemy's walking Pokémon, by name, as the editor's
    walkingSprite picks it: OBJ_CODE_POKEMON_<SPECIES>, a form's with _FORM_<n> (a form without its own shows its
    species'), and _MALE or _FEMALE after it for a species whose sexes differ (the male's unless the enemy is female).
    The game's walking table (a/2/0/8, GetPokemonFieldOBJCODE) gives the same codes for its species, but has no rows for
    the hack's own walking sprites (OBJ_CODE_POKEMON_ from 0x4000: the new species' and forms'), so the packer writes
    the code rather than leaving it to the game. None when the species has none."""
    base = "OBJ_CODE_POKEMON_" + enemy["species"].removeprefix("SPECIES_")
    sex = "_FEMALE" if enemy.get("gender") == "female" else "_MALE"
    form = enemy.get("form", 0)
    for name in ([f"{base}_FORM_{form}"] if form else []) + [base]:
        for code in (name, name + sex):
            if code in constants:
                return code
    return None


def error(where: str, message: str):
    raise datajson.DataError(f"{where}: {message}")


def load_run(directory: Path) -> dict:
    return datajson.load(directory / "run.json", datajson.load_schema(directory / "run.schema.json"))


def load_rooms(directory: Path) -> dict[str, dict]:
    """Every room by ID, in ID order, checked against the schema and the rules the schema can't say."""
    schema = datajson.load_schema(directory / "room.schema.json")
    rooms = {path.stem: datajson.load(path, schema) for path in sorted((directory / "rooms").glob("*.json"))}
    for name, room in rooms.items():
        where = f"rooms/{name}.json"
        if name == RUN_COMPLETED.split("/")[0]:
            error(where, f"a room can't be called {name!r}, which requirements use for {RUN_COMPLETED!r}")
        check_room(directory, where, room)
    return rooms


def load_templates(directory: Path) -> dict[str, dict]:
    """The templates there are by name, in TEMPLATES' order, checked as the rooms are: each of role room, of its type
    (TEMPLATES). A missing one is template_problems()' to tell."""
    schema = datajson.load_schema(directory / "room.schema.json")
    templates = {}
    for name, kind in TEMPLATES.items():
        path = directory / "templates" / f"{name}.json"
        where = f"templates/{name}.json"
        if not path.is_file():
            continue
        template = datajson.load(path, schema)
        if template["role"] != "room":
            error(where, f"a template's role is room, not {template['role']}")
        if template.get("type", kind) != kind:
            error(where, f"its type is {kind}, not {template['type']}")
        check_room(directory, where, template)
        templates[name] = template
    return templates


def round_weights(round_: dict) -> dict[str, int]:
    """A round's room types' weights, the defaults for those it leaves out."""
    return {**DEFAULT_TYPE_WEIGHTS, **round_.get("type_weights", {})}


def template_problems(run: dict, templates: dict[str, dict]) -> list[tuple[str, str]]:
    """The missing templates, as the editor's Entree page says them: pre_boss_rest's, which every run plays, and a
    rest, item, buff or shop template a round's weights draw (above 0) are errors; one no round draws is a warning
    (the game skips the type), and event's is optional (event rooms come from rooms/)."""
    problems = []
    for name, kind in TEMPLATES.items():
        if name in templates or name in OPTIONAL_TEMPLATES:
            continue
        drawn = name == "pre_boss_rest" or any(round_weights(r)[kind] for r in run["rounds"])
        problems.append(("error" if drawn else "warning",
                         f"templates/{name}.json is missing" + (": the run draws it" if drawn else
                                                                ", but no round draws a " + kind + " room")))
    return problems


def check_room(directory: Path, where: str, room: dict):
    """The rules of a room or template that the schema can't say."""
    constants = datajson.constants()
    battles = {}
    for i, battle in enumerate(room["battles"]):
        if battle["id"] in battles:
            error(where, f"two battles are called {battle['id']!r}")
        battles[battle["id"]] = battle
        wanted = ENEMY_COUNTS[battle["format"]]
        count = len(battle["enemies"])
        # (a warning, not an error: the editor shows it as an error, and the game plays such a battle as the format
        # its enemies fill, so a room in progress doesn't stop the build)
        if count != wanted:
            print(f"warning: {where}: battles[{i}]: a {battle['format']} battle takes {wanted} "
                  f"{'enemy' if wanted == 1 else 'enemies'}, not {count}; it plays as the format its enemies fill",
                  file=sys.stderr)
        for j, enemy in enumerate(battle["enemies"]):
            ability = enemy.get("ability")
            if ability is not None and ability != "hidden" and not (
                    ability.startswith("ABILITY_") and ability in constants):
                error(where, f"battles[{i}].enemies[{j}].ability {ability!r} is not \"hidden\" or a known "
                      "ABILITY_* constant")
    for i, npc in enumerate(room["npcs"]):
        at = f"npcs[{i}]"
        if npc["type"] == "battle":
            if npc.get("battle") not in battles:
                error(where, f"{at} starts battle {npc.get('battle')!r}, which the room doesn't have")
            if npc.get("enemy", 0) >= len(battles[npc["battle"]]["enemies"]):
                error(where, f"{at} shows enemy {npc['enemy']}, which its battle doesn't have")
            enemy = battles[npc["battle"]]["enemies"][npc.get("enemy", 0)]
            if "sprite" not in npc and walking_sprite(enemy, constants) is None:
                error(where, f"{at}: {enemy['species']} has no walking sprite, so the NPC needs a sprite of its own")
        elif npc["type"] == "item" and "item" not in npc:
            error(where, f"{at} is an item NPC without an item")
        if npc["type"] == "ambient":
            if npc.get("return") and npc.get("behaviour", "fade") != "fade":
                error(where, f"{at} is a fleeing ambient with return: only a fading one comes back")
            if npc.get("return") and npc.get("far", AMBIENT_FAR) <= npc.get("near", AMBIENT_NEAR):
                error(where, f"{at} comes back at {npc.get('far', AMBIENT_FAR)} tiles, not farther than it fades at "
                      f"({npc.get('near', AMBIENT_NEAR)})")
        elif any(key in npc for key in AMBIENT_KEYS):
            error(where, f"{at} has an ambient's reaction, but is a {npc['type']} NPC")
        if "marker" in npc and npc["marker"] not in npc_marker_names(directory):
            error(where, f"{at}'s marker {npc['marker']!r} has no npc_markers/{npc['marker']}.png")


def room_problems(rooms: dict[str, dict]) -> list[tuple[str, str]]:
    """Warnings about rooms' types and their battles, as the editor's Entree page says them: an enemy_choice room has
    battles to choose from, so fewer than 2 is a warning, and an enemy room more than 1 (it is an enemy_choice
    room)."""
    problems = []
    for name, room in rooms.items():
        if room["role"] != "room":
            continue
        kind, count = room.get("type", "enemy"), len(room["battles"])
        if kind == "enemy_choice" and count < 2:
            problems.append(("warning", f"rooms/{name}.json: an enemy_choice room has battles to choose from, but it "
                             f"has {count}"))
        elif kind == "enemy" and count > 1:
            problems.append(("warning", f"rooms/{name}.json: an enemy room has one battle, but it has {count}: "
                             "several to choose from make it an enemy_choice room"))
    return problems


def load_items(directory: Path) -> list[dict]:
    """The item table's entries (items.json), checked against its schema."""
    return datajson.load(directory / "items.json", datajson.load_schema(directory / "items.schema.json"))["items"]


def load_flowers(directory: Path) -> dict[str, list[list[int]]]:
    """The clearings' flower tiles by zone (flower_tiles.json, tools/paperwhite2/entralink_flowers.py), or none."""
    path = directory / "flower_tiles.json"
    if not path.is_file():
        return {}
    data = datajson.load(path, datajson.load_schema(directory / "flower_tiles.schema.json"))
    return {zone: tiles for zone, tiles in data.items() if zone != "$schema"}


def npc_marker_names(directory: Path = SOURCE) -> list[str]:
    """The NPC markers' names, in their members' order: npc_markers/<name>.png's names, sorted."""
    return sorted(path.stem for path in (directory / "npc_markers").glob("*.png"))


def marker_texture(path: Path, size: int, flat: bool = False) -> bytes:
    """A marker's BTX0: its PNG as one GX_TEXFMT_PLTT16 texture, named after the file, and its 16-color palette.
    flat is a ground marker: the game's flat billboards (BILLBOARD_ACTOR_TYPE_FACE_CAMERA_Y_FLAT) put the texture's
    top edge on the south side of the quad, so its rows go in reversed and the PNG's top is toward the north."""
    # nitro_btx imports its neighbour as a script does
    sys.path.insert(0, str(ROOT / "tools" / "data"))
    from tools.data.nitro_btx import texture_set
    if not path.is_file():
        raise datajson.DataError(f"{datajson.label(path)}: missing")
    try:
        width, height, pixels, colors = read_indexed_png(path)
    except ValueError as error_:
        raise datajson.DataError(f"{datajson.label(path)}: {error_}") from error_
    if (width, height) != (size, size):
        raise datajson.DataError(f"{datajson.label(path)}: must be {size} by {size}, not {width} by {height}")
    if pixels and max(pixels) >= MARKER_COLORS:
        raise datajson.DataError(f"{datajson.label(path)}: uses palette index {max(pixels)}, past "
                                 f"{MARKER_COLORS - 1}")
    if flat:
        pixels = b"".join(bytes(pixels[row * size:(row + 1) * size]) for row in reversed(range(size)))
    colors = (list(colors) + [(0, 0, 0)] * MARKER_COLORS)[:MARKER_COLORS]
    palette = b"".join(struct.pack("<H", r | g << 5 | b << 10) for r, g, b in map(color5, colors))
    name = path.stem[:12]
    return texture_set([(name, size, size, GX_TEXFMT_PLTT16, True,
                         encode_characters(size, size, pixels, linear=True))], [(f"{name}_pl", palette)])


def marker_members(directory: Path = SOURCE) -> list[bytes]:
    """The model table's members from MARKER_FIRST_MEMBER: the ground markers in MARKER_TYPES' order, the NPC markers
    in npc_marker_names()' order, then the item room's items' bag icons in icon_items()' order."""
    names = npc_marker_names(directory)
    if len(names) > NPC_MARKERS_MAX:
        raise datajson.DataError(f"{datajson.label(directory / 'npc_markers')}: {len(names)} markers, more than "
                                 f"{NPC_MARKERS_MAX}")
    return ([marker_texture(directory / "markers" / f"{kind}.png", MARKER_SIZE, flat=True) for kind in MARKER_TYPES]
            + [marker_texture(directory / "npc_markers" / f"{name}.png", NPC_MARKER_SIZE) for name in names]
            + [icon_texture(item) for item in icon_items(directory)])


def icon_items(directory: Path = SOURCE) -> list[str]:
    """The items whose bag icons float over an item room's balls: the item_room pool's, each once, in the table's
    order."""
    items = []
    for entry in load_items(directory):
        if "item_room" in entry["pools"] and entry["item"] not in items:
            items.append(entry["item"])
    if len(items) > ICONS_MAX:
        raise datajson.DataError(f"items.json: {len(items)} items in the item_room pool, more than {ICONS_MAX}")
    return items


def item_icon_files(item: str) -> tuple[Path, Path]:
    """An item's bag icon and the palette the bag shows it with, as src/system/pml_item.c's
    ITEM_GRAPHICS_CHARS_AND_PALETTES gives them (the first entry of an item, the hack's where it has one), in
    res/items (tools/data/item_icon_data.py)."""
    import re
    from tools.data.item_icon_data import member_path
    source = (ROOT / "src" / "system" / "pml_item.c").read_text()
    body = re.search(r"ITEM_GRAPHICS_CHARS_AND_PALETTES\[\]\[2\] = \{(.*?)\n\};", source, re.S).group(1)
    for name, icon, palette in re.findall(r"\[(ITEM_\w+)\] = \{ *(\w+), *(\w+) *\}", body):
        if name == item:
            return member_path(ROOT / "res" / "items", icon), member_path(ROOT / "res" / "items", palette)
    raise datajson.DataError(f"items.json: {item} has no bag icon in src/system/pml_item.c")


def shift_picture(pixels: bytes, size: int, dx: int, dy: int) -> bytes:
    """A square picture's pixels moved right dx and down dy, index 0 (clear) filling where they leave; what goes past
    the edge is lost."""
    out = bytearray(size * size)
    for y in range(size - dy):
        for x in range(size - dx):
            out[(y + dy) * size + x + dx] = pixels[y * size + x]
    return bytes(out)


def icon_texture(item: str) -> bytes:
    """An item's bag icon as a BTX0 of one 32 by 32 GX_TEXFMT_PLTT16 texture with the bag's palette, index 0 clear."""
    sys.path.insert(0, str(ROOT / "tools" / "data"))
    from tools.data.nitro_2d import read_palette
    from tools.data.nitro_btx import texture_set
    icon, palette_path = item_icon_files(item)
    try:
        width, height, pixels, _ = read_indexed_png(icon)
        colors = read_palette(palette_path)
    except (OSError, ValueError) as error_:
        raise datajson.DataError(f"{datajson.label(icon)}: {error_}") from error_
    if (width, height) != (MARKER_SIZE, MARKER_SIZE) or (pixels and max(pixels) >= MARKER_COLORS):
        raise datajson.DataError(f"{datajson.label(icon)}: not a 32 by 32 icon of 16 colors")
    pixels = shift_picture(pixels, MARKER_SIZE, *ICON_SHIFT)
    colors = (list(colors) + [(0, 0, 0)] * MARKER_COLORS)[:MARKER_COLORS]
    palette = b"".join(struct.pack("<H", r | g << 5 | b << 10) for r, g, b in map(color5, colors))
    name = item.removeprefix("ITEM_").lower()[:12]
    return texture_set([(name, MARKER_SIZE, MARKER_SIZE, GX_TEXFMT_PLTT16, True,
                         encode_characters(MARKER_SIZE, MARKER_SIZE, pixels, linear=True))], [(f"{name}_pl", palette)])


def check_progress(directory: Path, rooms: dict[str, dict], templates: dict[str, dict] | None = None):
    """Every battle and every catchable enemy, of the rooms and the templates, has its own progress id, below
    progress_ids.json's next ones."""
    path = directory / "progress_ids.json"
    issued = json.loads(path.read_text()) if path.is_file() else {"next_battle": BATTLES_MAX, "next_catch": CATCHES_MAX}
    seen = {"battle": {}, "catch": {}}
    places = [(f"rooms/{name}.json", name, room) for name, room in rooms.items()]
    places += [(f"templates/{name}.json", f"templates/{name}", room) for name, room in (templates or {}).items()]
    for where, name, room in places:
        for battle in room["battles"]:
            key = f"{name}/{battle['id']}"
            claims = [("battle", battle.get("progress_id"), key, BATTLES_MAX, issued["next_battle"])]
            claims += [("catch", enemy.get("progress_id"), f"{key}'s {enemy['species']}", CATCHES_MAX,
                        issued["next_catch"]) for enemy in battle["enemies"] if "catch" in enemy]
            for kind, number, label, limit, next_number in claims:
                if number is None:
                    error(where, f"{label} has no progress_id: the editor gives one on save "
                          f"(the next of progress_ids.json); a {kind} needs one for the save")
                if number >= limit:
                    error(where, f"{label}'s progress_id {number} is past the save's {limit}")
                if number >= next_number:
                    error(where, f"{label}'s progress_id {number} isn't below progress_ids.json's "
                          f"next_{kind} ({next_number}), so it could be given again")
                if number in seen[kind]:
                    error(where, f"{label} has {kind} progress_id {number}, as {seen[kind][number]} "
                          "has: each needs its own, never changed once given")
                seen[kind][number] = label


def requirement(key: str, rooms: dict[str, dict], where: str) -> int:
    """A requirement's value: a battle's progress id, or REQUIRE_RUN_COMPLETED."""
    if key == RUN_COMPLETED:
        return REQUIRE_RUN_COMPLETED
    room, _, battle_id = key.partition("/")
    for battle in rooms.get(room, {}).get("battles", []):
        if battle["id"] == battle_id:
            return battle["progress_id"]
    error(where, f"{key!r} names no battle (\"<room id>/<battle id>\" or {RUN_COMPLETED!r})")


def text_line(text: str) -> str:
    """Dialogue as a line of a text file: a line break in the JSON is \\n, as one written \\n already is."""
    return text.replace("\r", "").replace("\n", "\\n")


def spoken(npc: dict, key: str) -> bool:
    """Whether an NPC's message ("before" or "after") goes into the text bank: one that is set, a battle NPC's after
    and anyone's before but an ambient's, which has nothing to say."""
    return bool(npc.get("dialogue", {}).get(key)) and npc["type"] != "ambient" and (key == "before" or
                                                                                  npc["type"] == "battle")


def dialogue_lines(directory: Path = SOURCE) -> list[str]:
    """The script text bank entralink_dialogue: every NPC's before and after lines, room by room, then template by
    template, in tables()'s order. Its first line is empty, so the bank is never empty and no NPC's message is 0."""
    lines = [""]
    for room in [*load_rooms(directory).values(), *load_templates(directory).values()]:
        for npc in room["npcs"]:
            dialogue = npc.get("dialogue", {})
            for key in ("before", "after"):
                if spoken(npc, key):
                    lines.append(text_line(dialogue[key]))
    return lines


def room_pool(rooms: dict[str, dict], number: int) -> list[str]:
    """The rooms of role room that can come up in round number: those kept to it and the generic ones."""
    return [n for n, r in rooms.items() if r["role"] == "room" and number in r.get("rounds", [number])]


def boss_pool(rooms: dict[str, dict], number: int) -> list[str]:
    """The boss rooms that can end round number: those kept to it, else the generic ones (kept to no round)."""
    kept = [n for n, r in rooms.items() if r["role"] == "boss" and number in r.get("rounds", [])]
    return kept or [n for n, r in rooms.items() if r["role"] == "boss" and "rounds" not in r]


def type_pool(rooms: dict[str, dict], number: int, kind: str) -> list[str]:
    """The rooms/ rooms of a type that can come up in round number."""
    return [n for n in room_pool(rooms, number) if rooms[n].get("type", "enemy") == kind]


def type_problems(round_: dict, number: int, rooms: dict[str, dict], templates: dict[str, dict]) -> \
        list[tuple[str, str]]:
    """A round's room types: its weights adding up to 0, no type with a weight that has a room (an error each), a type
    with a weight and no room, which the game skips (a warning)."""
    if not round_["rooms"]:
        return []
    weights = round_weights(round_)

    def drawable(kind):
        return bool(type_pool(rooms, number, kind)) or (kind in TEMPLATES and kind in templates)
    skipped = [kind for kind in ROOM_TYPES if weights[kind] and not drawable(kind)]
    if not any(weights.values()):
        return [("error", f"round {number}'s room type weights add up to 0, so its doors can't draw a room")]
    if not any(weights[kind] and drawable(kind) for kind in ROOM_TYPES):
        return [("error", f"round {number} draws {round_['rooms']} rooms, but no type with a weight has a room or a "
                 "template")]
    if skipped:
        return [("warning", f"round {number}: no {' or '.join(skipped)} room can come up, so "
                 f"{'those types are' if len(skipped) > 1 else 'that type is'} skipped")]
    return []


def draw_problems(run: dict, rooms: dict[str, dict], templates: dict[str, dict] | None = None) -> \
        list[tuple[str, str]]:
    """What is wrong with the run's draw, as ("error", message) or ("warning", message), as the editor's Run section
    says it (editor/src/modules/entree/model.ts, runProblems). The game draws each round's rooms from room_pool() and
    its boss from boss_pool(), each time one of the least used so far other than the room just before (so none comes
    up twice while some haven't), and the room just before again only when it is the only one. So too few rooms only
    means repeats, a warning; a round with no room at all, or a boss round with no boss, can't be drawn.
    With the templates (step 6) a round's doors draw room types by its weights, rest, item, buff and shop from their
    templates too, a type with no room skipped: so the round can't be drawn only when no type with a weight has a room,
    a type with a weight and no room is a warning, and the repeats count the types that need rooms/' rooms (enemy,
    challenge and event)."""
    problems = []
    if not any(room["role"] == "final" for room in rooms.values()):
        problems.append(("error", "no room has the role final, which every run ends with"))
    drawn, bosses, room_names, boss_names = 0, 0, set(), set()
    for number, round_ in enumerate(run["rounds"], 1):
        if round_.get("boss") and number == 3:
            problems.append(("error", "round 3 can't end with a boss: the final room ends it"))
        pool = room_pool(rooms, number)
        if templates is not None:
            # With the templates, only the types that need rooms/' rooms count, and a round with none still draws
            problems += type_problems(round_, number, rooms, templates)
            pool = [n for kind in PREMADE_TYPES for n in type_pool(rooms, number, kind)]
        if round_["rooms"] and not pool:
            if templates is None:
                problems.append(("error", f"round {number} draws {round_['rooms']} rooms, but no room can come up in "
                                 "it (role room, rounds left out or naming it)"))
        elif len(pool) == 1 and round_["rooms"] > 1:
            problems.append(("warning", f"round {number} draws {round_['rooms']} rooms, but only {pool[0]} can come "
                             "up in it, so it comes up each time, twice in a row"))
        elif round_["rooms"] > len(pool):
            problems.append(("warning", f"round {number} draws {round_['rooms']} rooms, but only {len(pool)} can come "
                             "up in it, so some come up more than once (never twice in a row)"))
        if round_["rooms"] and pool:
            drawn += round_["rooms"]
            room_names.update(pool)
        if round_.get("boss") and number < 3:
            pool = boss_pool(rooms, number)
            if not pool:
                problems.append(("error", f"round {number} ends with a boss, but no boss room can come up in it "
                                 "(role boss, kept to it or to no round)"))
            bosses += 1
            boss_names.update(pool)
    total = place_count(run)
    if total > RUN_ROOMS_MAX:
        problems.append(("error", f"the rounds have {total} rooms with the pre-boss rests and the final one, more "
                         f"than {RUN_ROOMS_MAX}"))
    if room_names and drawn > len(room_names):
        problems.append(("warning", f"the rounds draw {drawn} rooms from {len(room_names)}, so rooms come up more "
                         "than once in a run (the least used first, never twice in a row)"))
    if boss_names and bosses > len(boss_names):
        problems.append(("warning", f"the run has {bosses} bosses from {len(boss_names)} boss rooms, so a boss comes "
                         "up twice"))
    return problems


def place_count(run: dict) -> int:
    """How many rooms a run has: each round's rooms, then the pre-boss rest and the boss for a round with one, and
    after the last round the pre-boss rest and the final room."""
    return sum(r["rooms"] + 2 * bool(r.get("boss")) for r in run["rounds"]) + 2


def field_weathers() -> dict[str, int]:
    from tools.paperwhite2.conditions import weathers
    return weathers()


def zone_models() -> dict[str, str]:
    """Each Entree Forest clearing's zone and its chunk's map model (tools/paperwhite2/entralink_flowers.py)."""
    from tools.paperwhite2.entralink_flowers import clearings
    return clearings()


def blocked_rows(model: str) -> list[int]:
    """A clearing's blocked tiles, a 32-bit row per z with x's bit set where its tile can't be walked on: off the map,
    an invalid tile, or one with the collision flag, as the editor's Entree page reads them (terrain_0.csv)."""
    import csv
    rows = [0xffffffff] * 32
    path = ROOT / "res" / "field" / "maps" / "models" / model / "terrain_0.csv"
    for row in csv.DictReader(path.open()):
        x, z, tile = int(row["x"]), int(row["z"]), int(row["tile_type"])
        if 0 <= x < 32 and 0 <= z < 32 and tile != 0xffffffff and tile & 0xffff != 0xff and not (tile >> 16) & 1:
            rows[z] &= ~(1 << x)
    return rows


def room_row(name: str, room: dict, template: bool, rooms: dict[str, dict], tables_: dict, message: list[int],
             npc_markers: dict[str, int]):
    """Adds a room or template's battles, enemies, NPCs and requirements to the tables, and returns its row."""
    constants = datajson.constants()
    battles, enemies, npcs, requirements = (tables_[key] for key in ("battles", "enemies", "npcs", "requirements"))
    where = f"templates/{name}.json" if template else f"rooms/{name}.json"
    label = f"templates/{name}" if template else name
    weather = room.get("weather")
    battle_index = {}
    first_battle = len(battles)
    for battle in room["battles"]:
        battle_index[battle["id"]] = len(battles) - first_battle
        battles.append({"name": f"{label}/{battle['id']}", "format": FORMATS[battle["format"]],
                        "enemyCount": len(battle["enemies"]), "firstEnemy": len(enemies),
                        "progressId": battle["progress_id"]})
        for enemy in battle["enemies"]:
            moves = [constants[move] for move in enemy.get("moves", [])]
            ability = enemy.get("ability")
            catch = enemy.get("catch")
            first_requirement = len(requirements)
            if catch is not None:
                requirements += [requirement(key, rooms, where) for key in catch.get("after", [])]
            enemies.append({
                "name": f"{label}/{battle['id']}: {enemy['species']}",
                "species": constants[enemy["species"]],
                "item": constants[enemy["item"]] if "item" in enemy else 0,
                "moves": moves + [0] * (4 - len(moves)),
                "ability": ABILITY_SPECIES if ability is None else ABILITY_HIDDEN if ability == "hidden"
                else constants[ability],
                "form": enemy.get("form", 0),
                "level": enemy.get("level", DEFAULT_LEVEL),
                "scale": enemy.get("scale", DEFAULT_SCALE),
                "gender": GENDERS[enemy.get("gender")],
                "shiny": int(enemy.get("shiny", False)),
                "catchId": NONE16 if catch is None else enemy["progress_id"],
                "catchOnce": int(catch is not None and catch.get("once", True)),
                "firstRequirement": first_requirement,
                "requirementCount": len(requirements) - first_requirement,
            })
    first_npc = len(npcs)
    for npc in room["npcs"]:
        first_requirement = len(requirements)
        requirements += [requirement(key, rooms, where) for key in npc.get("requires", [])]
        dialogue = npc.get("dialogue", {})
        messages = []
        for key in ("before", "after"):
            if spoken(npc, key):
                messages.append(message[0])
                message[0] += 1
            else:
                messages.append(NONE16)
        sprite = npc.get("sprite", DEFAULT_SPRITES.get(npc["type"]))
        if sprite is None and npc["type"] == "battle":
            battle = room["battles"][battle_index[npc["battle"]]]
            sprite = walking_sprite(battle["enemies"][npc.get("enemy", 0)], constants)
        npcs.append({
            "name": f"{label}: {npc['type']}",
            "type": NPC_TYPES[npc["type"]],
            "battle": battle_index.get(npc.get("battle"), 0),
            "enemy": npc.get("enemy", 0),
            "count": npc.get("count", 1),
            "item": constants[npc["item"]] if "item" in npc and npc["type"] == "item" else 0,
            "sprite": 0 if sprite is None else constants[sprite],
            "chance": npc.get("chance", 100),
            "x": npc["x"], "z": npc["z"], "direction": constants[npc["facing"]],
            "firstRequirement": first_requirement,
            "requirementCount": len(requirements) - first_requirement,
            "before": messages[0], "after": messages[1],
            "beforeStyle": STYLES[dialogue.get("before_style", "talk")],
            "afterStyle": STYLES[dialogue.get("after_style", "talk")],
            "marker": npc_markers[npc["marker"]] if "marker" in npc else NPC_MARKER_NONE,
            "behaviour": AMBIENT_BEHAVIOURS[npc.get("behaviour", "fade")],
            "near": npc.get("near", AMBIENT_NEAR),
            "far": npc.get("far", AMBIENT_FAR) if npc.get("return") else 0,
            "distance": npc.get("distance", AMBIENT_DISTANCE),
        })
    rounds = 0
    for number in room.get("rounds", []):
        rounds |= 1 << (number - 1)
    kind = TEMPLATES[name] if template else room.get("type", "enemy")
    default_marker = TYPE_MARKERS[kind] if room["role"] == "room" else ROLE_MARKERS[room["role"]]
    return {
        "name": label, "role": ROLES[room["role"]], "rounds": rounds,
        "weather": WEATHER_FIELD if weather is None else constants[weather],
        "marker": MARKER_TYPES.index(room.get("marker", default_marker)),
        "type": ROOM_TYPES[kind], "template": int(template),
        "firstBattle": first_battle, "battleCount": len(battles) - first_battle,
        "firstNpc": first_npc, "npcCount": len(npcs) - first_npc,
    }


def item_rows(directory: Path) -> list[dict]:
    """The item table's entries for the header, each with its icon's number among icon_items() or ICON_NONE."""
    constants = datajson.constants()
    icons = icon_items(directory)
    rows = []
    for entry in load_items(directory):
        rounds = 0
        for number in entry.get("rounds", []):
            rounds |= 1 << (number - 1)
        pools = 0
        for pool in entry["pools"]:
            pools |= 1 << POOLS[pool]
        rows.append({"name": entry["item"], "item": constants[entry["item"]], "weight": entry["weight"],
                     "rounds": rounds, "pools": pools, "price": entry.get("price", 0),
                     "icon": icons.index(entry["item"]) if "item_room" in entry["pools"] else ICON_NONE})
    return rows


def tables(directory: Path) -> dict:
    """The header's values, or a datajson.DataError that says what is wrong."""
    run = load_run(directory)
    rooms = load_rooms(directory)
    templates = load_templates(directory)
    check_progress(directory, rooms, templates)
    constants = datajson.constants()
    weathers = field_weathers()
    default_weather = run.get("field_weather")
    if default_weather is not None and default_weather not in weathers:
        error("run.json", f"field_weather {default_weather!r} is not a WEATHER_* of include/system/zone_weather.h")
    round_rows = []
    for number, round_ in enumerate(run["rounds"], 1):
        weather = round_.get("field_weather", default_weather)
        if weather is not None and weather not in weathers:
            error("run.json", f"round {number}'s field_weather {weather!r} is not a WEATHER_* of "
                  "include/system/zone_weather.h")
        weights = {**DEFAULT_TYPE_WEIGHTS, **round_.get("type_weights", {})}
        round_rows.append((round_["rooms"], int(round_.get("boss", False)),
                           FIELD_WEATHER_ZONE if weather is None else weathers[weather],
                           [weights[kind] for kind in ROOM_TYPES]))
    spots = {**DEFAULT_MARKER_SPOTS, **run.get("marker_spots", {})}
    npc_markers = {name: i for i, name in enumerate(npc_marker_names(directory))}
    errors = [message for level, message in draw_problems(run, rooms, templates) if level == "error"]
    if errors:
        error("run.json", errors[0])
    errors = [message for level, message in template_problems(run, templates) if level == "error"]
    if errors:
        error("templates", errors[0])

    tables_ = {"battles": [], "enemies": [], "npcs": [], "requirements": []}
    message = [1]
    room_rows = [room_row(name, room, False, rooms, tables_, message, npc_markers) for name, room in rooms.items()]
    template_index = {}
    for name, template in templates.items():
        template_index[name] = len(room_rows)
        room_rows.append(room_row(name, template, True, rooms, tables_, message, npc_markers))
    if len(room_rows) >= TEMPLATE_NONE:
        error("rooms", f"{len(room_rows)} rooms and templates, more than {TEMPLATE_NONE - 1}")
    # The template a door of each type takes when no premade room comes up (enemy and challenge have none)
    type_templates = [template_index.get(kind, TEMPLATE_NONE) if kind in TEMPLATES else TEMPLATE_NONE
                      for kind in ROOM_TYPES]

    # The clearings a run's rooms are in: their blocked tiles and flower tiles
    models = zone_models()
    flowers = load_flowers(directory)
    for zone in flowers:
        if zone not in models:
            error("flower_tiles.json", f"{zone} is not an Entree Forest clearing")
    zones = list(dict.fromkeys([*run["room_maps"], *([run["pre_boss_map"]] if "pre_boss_map" in run else []),
                                run["final_map"]]))
    clearings, flower_tiles = [], []
    for zone in zones:
        tiles = flowers.get(zone, [])
        clearings.append({"name": zone, "zone": constants[zone], "firstFlower": len(flower_tiles),
                          "flowerCount": len(tiles), "blocked": blocked_rows(models[zone])})
        flower_tiles += [tuple(tile) for tile in tiles]
    return {
        "ids": list(rooms),
        "templates": template_index,
        "rooms": room_rows,
        **tables_,
        "rounds": round_rows,
        "room_zones": [(zone, constants[zone]) for zone in run["room_maps"]],
        "final_zone": (run["final_map"], constants[run["final_map"]]),
        "pre_boss_zone": (run["pre_boss_map"], constants[run["pre_boss_map"]]) if "pre_boss_map" in run
        else ("none: the room maps, north door only", PRE_BOSS_ZONE_NONE),
        "unknown_chance": run.get("unknown_chance", DEFAULT_UNKNOWN_CHANCE),
        "custom_chance": run.get("custom_chance", DEFAULT_CUSTOM_CHANCE),
        "ground_item_chance": run.get("ground_item_chance", DEFAULT_GROUND_ITEM_CHANCE),
        "hidden_item_chance": run.get("hidden_item_chance", DEFAULT_HIDDEN_ITEM_CHANCE),
        "dust": [{**DEFAULT_DUST, **run.get("dust", {})}[kind] for kind in DUST_KINDS],
        "dust_round_percent": round_percents(run.get("dust_round_percent", DEFAULT_DUST_ROUND_PERCENT)),
        "enemy_scaling": enemy_scaling(run),
        "raid_hp_percent": raid_hp_percent(run),
        "boss_multi_percent": boss_multi_percents(run),
        "shop_items": run.get("shop_items", DEFAULT_SHOP_ITEMS),
        "swap_dust": run.get("swap_dust", DEFAULT_SWAP_DUST),
        "reserve_slots": run.get("reserve_slots", DEFAULT_RESERVE_SLOTS),
        "type_templates": type_templates,
        "marker_spots": [tuple(spots[door]) for door in DOORS],
        "npc_markers": list(npc_markers),
        "items": item_rows(directory),
        "icon_count": len(icon_items(directory)),
        "clearings": clearings,
        "flower_tiles": flower_tiles,
    }


def room_percent(curve: dict, index: int, count: int) -> int:
    """A room curve's percent in the run's room `index` (from 0) of `count` rooms: start, rising to end by the last
    room along the depth (index / (count - 1)) raised to curve / 100 (100 linear; above it flatter early and steeper
    late)."""
    depth = index / (count - 1) if count > 1 else 0.0
    return round(curve["start"] + (curve["end"] - curve["start"]) * depth ** (curve["curve"] / 100))


def run_room_count(run: dict) -> int:
    return sum(round_["rooms"] for round_ in run["rounds"])


def boss_room_index(run: dict, round_index: int) -> int:
    """The room a round's boss is scaled at (rebalance 2): its round's last room, among all the run's rooms; for round
    3 (the final room's) and past the rounds given, the run's last room."""
    count = run_room_count(run)
    if round_index >= len(run["rounds"]) - 1:
        return max(0, count - 1)
    return max(0, sum(r["rooms"] for r in run["rounds"][:round_index + 1]) - 1)


def enemy_scaling(run: dict) -> dict[str, dict]:
    """run.json's enemy_scaling with its defaults: each stat's start, end and curve, its boss bonuses (one for each of
    the 3 rounds, a round left out taking the last one given), `rooms`, the room curve's percent for every room of
    the run by its depth across the run (the game's table), and `boss`, each round's boss's percent: the curve at its
    round's last room times its bonus (rebalance 2; at most MAX_PERCENT)."""
    table = run.get("enemy_scaling", {})
    count = run_room_count(run)
    out = {}
    for stat in SCALED_STATS:
        entry = table.get(stat, {})
        curve = {key: entry.get(key, default) for key, default in SCALING_DEFAULTS.items()}
        bonus = entry.get("boss_bonus") or [DEFAULT_BOSS_BONUS]
        bonus = [bonus[min(i, len(bonus) - 1)] for i in range(3)]
        rooms = [room_percent(curve, i, count) for i in range(count)]
        boss = [min(MAX_PERCENT, round(room_percent(curve, boss_room_index(run, i), count) * bonus[i] / 100))
                for i in range(3)]
        out[stat] = {**curve, "boss_bonus": bonus, "boss": boss, "rooms": rooms}
    return out


def raid_hp_percent(run: dict) -> int:
    """The raid's extra HP factor in percent (run.json's raid_hp_factor)."""
    return round(run.get("raid_hp_factor", DEFAULT_RAID_HP_FACTOR) * 100)


def boss_multi_percents(run: dict) -> tuple[int, int]:
    """A boss battle's foes' HP bonus factor in percent with two foes and with three (run.json's boss_double_factor
    and boss_triple_factor): each foe's boss_bonus for HP is multiplied by it, as its foes share the boss's HP."""
    return (round(run.get("boss_double_factor", DEFAULT_BOSS_DOUBLE_FACTOR) * 100),
            round(run.get("boss_triple_factor", DEFAULT_BOSS_TRIPLE_FACTOR) * 100))


def round_percents(percents: list[int]) -> list[int]:
    """The Dream Dust percent of each of the 3 rounds: run.json's, the last again for rounds it leaves out."""
    return [percents[min(i, len(percents) - 1)] for i in range(3)]


def initializer(rows: list[str]) -> str:
    return "{ \\\n" + " \\\n".join(f"    {row}," for row in rows) + " \\\n}" if rows else "{ 0 }"


def header(directory: Path) -> str:
    data = tables(directory)
    rooms = [f"/* {r['name']} */ {{ {r['role']}, 0x{r['rounds']:x}, 0x{r['weather']:02x}, {r['marker']}, "
             f"{r['type']}, {r['template']}, {r['firstBattle']}, {r['battleCount']}, {r['firstNpc']}, "
             f"{r['npcCount']} }}" for r in data["rooms"]]
    battles = [f"/* {b['name']} */ {{ {b['format']}, {b['enemyCount']}, {b['firstEnemy']}, {b['progressId']} }}"
               for b in data["battles"]]
    enemies = [f"/* {e['name']} */ {{ {e['species']}, {e['item']}, {{ {', '.join(map(str, e['moves']))} }}, "
               f"0x{e['ability']:x}, 0x{e['catchId']:x}, {e['firstRequirement']}, {e['scale']}, {e['form']}, "
               f"{e['level']}, "
               f"{e['gender']}, {e['shiny']}, {e['catchOnce']}, {e['requirementCount']} }}" for e in data["enemies"]]
    npcs = [f"/* {n['name']} */ {{ {n['item']}, {n['sprite']}, {n['firstRequirement']}, "
            f"0x{n['before']:x}, 0x{n['after']:x}, {n['type']}, {n['battle']}, {n['enemy']}, {n['count']}, "
            f"{n['chance']}, {n['x']}, {n['z']}, {n['direction']}, {n['requirementCount']}, {n['beforeStyle']}, "
            f"{n['afterStyle']}, 0x{n['marker']:02x}, {n['behaviour']}, {n['near']}, {n['far']}, {n['distance']} }}"
            for n in data["npcs"]]
    rounds = [f"{{ {rooms_}, {boss}, 0x{weather:02x}, {{ {', '.join(map(str, weights))} }} }}"
              for rooms_, boss, weather, weights in data["rounds"]]
    items = [f"/* {i['name']} */ {{ {i['item']}, {i['price']}, {i['weight']}, 0x{i['rounds']:x}, 0x{i['pools']:x}, "
             f"0x{i['icon']:02x} }}" for i in data["items"]]
    clearings = [f"/* {c['name']} */ {{ {c['zone']}, {c['firstFlower']}, {c['flowerCount']}, "
                 f"{{ {', '.join(f'0x{row:08x}' for row in c['blocked'])} }} }}" for c in data["clearings"]]
    flowers = [f"{{ {x}, {z} }}" for x, z in data["flower_tiles"]] or ["{ 0, 0 }"]
    spots = [f"{{ {x}, {z} }}" for x, z in data["marker_spots"]]
    zones = [f"{value} /* {name} */" for name, value in data["room_zones"]]
    requirements = [f"0x{value:x}" for value in data["requirements"]]
    pre_boss_rest = data["templates"]["pre_boss_rest"]
    return "\n".join([
        f"#ifndef {GUARD}", f"#define {GUARD}", "",
        f"// Generated by tools/paperwhite2/entralink_run.py from {datajson.label(directory)}, edit that instead",
        "",
        *(f"#define ENTRALINK_ROOM_{name.upper()} {i}" for i, name in enumerate(data["ids"])),
        "// The templates, after the rooms in the room table",
        *(f"#define ENTRALINK_TEMPLATE_{name.upper()} {index}" for name, index in data["templates"].items()),
        "",
        f"#define ENTRALINK_RUN_ROOM_COUNT {len(data['rooms'])}",
        f"#define ENTRALINK_RUN_BATTLE_COUNT {max(len(data['battles']), 1)}",
        f"#define ENTRALINK_RUN_ENEMY_COUNT {max(len(data['enemies']), 1)}",
        f"#define ENTRALINK_RUN_NPC_COUNT {max(len(data['npcs']), 1)}",
        f"#define ENTRALINK_RUN_REQUIREMENT_COUNT {max(len(data['requirements']), 1)}",
        f"#define ENTRALINK_RUN_ROUND_COUNT {len(data['rounds'])}",
        f"#define ENTRALINK_RUN_ROOM_ZONE_COUNT {len(zones)}",
        f"#define ENTRALINK_RUN_FINAL_ZONE {data['final_zone'][1]} // {data['final_zone'][0]}",
        f"#define ENTRALINK_RUN_PRE_BOSS_ZONE 0x{data['pre_boss_zone'][1]:x} // {data['pre_boss_zone'][0]}",
        f"#define ENTRALINK_RUN_PRE_BOSS_REST {pre_boss_rest}",
        f"#define ENTRALINK_RUN_UNKNOWN_CHANCE {data['unknown_chance']}",
        f"#define ENTRALINK_RUN_CUSTOM_CHANCE {data['custom_chance']}",
        f"#define ENTRALINK_RUN_GROUND_ITEM_CHANCE {data['ground_item_chance']}",
        f"#define ENTRALINK_RUN_HIDDEN_ITEM_CHANCE {data['hidden_item_chance']}",
        "// Dream Dust: a battle won's by its room (ENTRALINK_DUST_* order), times its round's percent; a shop's goods",
        f"#define ENTRALINK_RUN_DUST {{ {', '.join(map(str, data['dust']))} }}",
        f"#define ENTRALINK_RUN_DUST_ROUND_PERCENT {{ {', '.join(map(str, data['dust_round_percent']))} }}",
        f"#define ENTRALINK_RUN_SHOP_ITEMS {data['shop_items']}",
        "// A rest stop's swap's price in Dream Dust, and the Reserve Box's slots (phase 7)",
        f"#define ENTRALINK_RUN_SWAP_DUST {data['swap_dust']}",
        f"#define ENTRALINK_RUN_RESERVE_SLOTS {data['reserve_slots']}",
        "// EntralinkScaling (phase 5), a stat each (ENTRALINK_STAT_* order): the percent in each room of the run by its",
        "// depth across the run (run.json's start, end and curve worked out), then the percent of the three rounds'",
        "// bosses (the last: the final room; the curve at the round's last room times its boss_bonus). A raid has its",
        "// HP times the raid factor (percent) as well, wherever it is",
        "#define ENTRALINK_RUN_ENEMY_SCALING { " + ", ".join(
            "{ { " + ", ".join(map(str, data["enemy_scaling"][stat]["rooms"])) + " }, { "
            + ", ".join(map(str, data["enemy_scaling"][stat]["boss"])) + " } }" for stat in SCALED_STATS) + " }",
        f"#define ENTRALINK_RUN_RAID_HP_PERCENT {data['raid_hp_percent']}",
        "// A boss battle's (and the final room's) foes' HP bonus over the room curve, times this percent with two foes",
        "// and with three (a raid is one foe)",
        f"#define ENTRALINK_RUN_BOSS_DOUBLE_HP_PERCENT {data['boss_multi_percent'][0]}",
        f"#define ENTRALINK_RUN_BOSS_TRIPLE_HP_PERCENT {data['boss_multi_percent'][1]}",
        "// Each room type's template (ENTRALINK_TYPE_* order), or ENTRALINK_RUN_ROOM_NONE",
        f"#define ENTRALINK_RUN_TYPE_TEMPLATES {{ {', '.join(f'0x{t:02x}' for t in data['type_templates'])} }}",
        "// The ground markers' spots, the top-left tiles of 2 by 2, in ENTRALINK_DOOR_* order (north, east, west)",
        f"#define ENTRALINK_RUN_MARKER_SPOTS {{ {', '.join(spots)} }}",
        "// The markers' art in the model table (ARCID_MMODEL_TBL): the ground markers from the first, in",
        "// ENTRALINK_MARKER_* order, then the NPC markers, then the item room's items' bag icons",
        f"#define ENTRALINK_RUN_MARKER_FILE {MARKER_FIRST_MEMBER}",
        f"#define ENTRALINK_RUN_NPC_MARKER_FILE {MARKER_FIRST_MEMBER + len(MARKER_TYPES)}",
        f"#define ENTRALINK_RUN_NPC_MARKER_COUNT {len(data['npc_markers'])}",
        f"#define ENTRALINK_RUN_ITEM_ICON_FILE {MARKER_FIRST_MEMBER + len(MARKER_TYPES) + len(data['npc_markers'])}",
        f"#define ENTRALINK_RUN_ITEM_ICON_COUNT {data['icon_count']}",
        *(f"#define ENTRALINK_NPC_MARKER_{name.upper()} {i}" for i, name in enumerate(data["npc_markers"])),
        "// EntralinkRoom: role, rounds, weather, marker, type, template, first battle, battle count, first NPC,",
        "// NPC count",
        f"#define ENTRALINK_RUN_ROOMS {initializer(rooms)}",
        "// EntralinkBattle: format, enemy count, first enemy, progress id",
        f"#define ENTRALINK_RUN_BATTLES {initializer(battles)}",
        "// EntralinkEnemy: species, item, moves, ability, catch id, first requirement, scale, form, level, gender,",
        "// shiny, catch once, requirement count",
        f"#define ENTRALINK_RUN_ENEMIES {initializer(enemies)}",
        "// EntralinkNpc: item, sprite, first requirement, before and after messages, type, battle, enemy, count,",
        "// chance, x, z, direction, requirement count, before and after styles, marker",
        f"#define ENTRALINK_RUN_NPCS {initializer(npcs)}",
        "// The NPCs' and catches' requirements: battles' progress ids, or ENTRALINK_REQUIRE_RUN_COMPLETED",
        f"#define ENTRALINK_RUN_REQUIREMENTS {{ {', '.join(requirements) or '0'} }}",
        "// EntralinkRound: rooms, boss, field weather, type weights (ENTRALINK_TYPE_* order)",
        f"#define ENTRALINK_RUN_ROUNDS {{ {', '.join(rounds)} }}",
        f"#define ENTRALINK_RUN_ROOM_ZONES {{ {', '.join(zones)} }}",
        f"#define ENTRALINK_RUN_ITEM_COUNT {max(len(items), 1)}",
        "// EntralinkItem: item, price, weight, rounds, pools (ENTRALINK_POOL_* bits), icon",
        f"#define ENTRALINK_RUN_ITEMS {initializer(items)}",
        f"#define ENTRALINK_RUN_CLEARING_COUNT {len(clearings)}",
        "// EntralinkClearing: zone, first flower tile, flower tile count, blocked tiles (a row per z, a bit per x)",
        f"#define ENTRALINK_RUN_CLEARINGS {initializer(clearings)}",
        f"#define ENTRALINK_RUN_FLOWER_TILE_COUNT {len(flowers)}",
        f"#define ENTRALINK_RUN_FLOWER_TILES {{ {', '.join(flowers)} }}",
        "", f"#endif // {GUARD}", "",
    ])


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("output", type=Path, nargs="?")
    parser.add_argument("--check", action="store_true", help="only check the data")
    parser.add_argument("--source", type=Path, default=SOURCE, help="the data's directory")
    args = parser.parse_args()
    try:
        if args.check:
            tables(args.source)
            print(f"{datajson.label(args.source)} is fine")
        run, templates = load_run(args.source), load_templates(args.source)
        for level, message in draw_problems(run, load_rooms(args.source), templates):
            if level == "warning":
                print(f"warning: run.json: {message}", file=sys.stderr)
        for level, message in [*template_problems(run, templates), *room_problems(load_rooms(args.source))]:
            if level == "warning":
                print(f"warning: {message}", file=sys.stderr)
        if args.check:
            return
        if args.output is None:
            parser.error("give the output header")
        text = header(args.source)
        if not args.output.exists() or args.output.read_text() != text:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(text)
    except datajson.DataError as error_:
        sys.exit(f"error: {error_}")


if __name__ == "__main__":
    main()
