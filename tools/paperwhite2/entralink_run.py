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
ENEMY_COUNTS = {"single": (1, 1), "double": (1, 2), "triple": (1, 3), "raid": (1, 1)}
ROLES = {"room": 0, "boss": 1, "final": 2}
NPC_TYPES = {"battle": 0, "item": 1, "rest": 2, "buff": 3}
# A message's window (ENTRALINK_STYLE_*): talk is the default
STYLES = {"talk": 0, "bubble": 1, "yell": 2, "event": 3}
WEATHER_FIELD = 0xff
FIELD_WEATHER_ZONE = 0xff
# The ground markers' types (ENTRALINK_MARKER_*), in their members' order. catch is never set by hand: the game shows
# it instead of enemy, challenge or boss when the room has an enemy the Nightmare Ball catches now and the run's bag
# holds one
MARKER_TYPES = ["enemy", "challenge", "boss", "rest", "gift", "event", "shop", "unknown", "final", "catch"]
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
DEFAULT_SPRITES = {"item": "OBJ_CODE_110", "rest": "OBJ_CODE_LADY", "buff": "OBJ_CODE_LADY"}
# The save's bits (include/paperwhite2/entralink_progress.h)
BATTLES_MAX = 1024
CATCHES_MAX = 512
# The rooms of a run, the final's included (ENTRALINK_RUN_ROOMS_MAX)
RUN_ROOMS_MAX = 15


def error(where: str, message: str):
    raise datajson.DataError(f"{where}: {message}")


def load_run(directory: Path) -> dict:
    return datajson.load(directory / "run.json", datajson.load_schema(directory / "run.schema.json"))


def load_rooms(directory: Path) -> dict[str, dict]:
    """Every room by ID, in ID order, checked against the schema and the rules the schema can't say."""
    schema = datajson.load_schema(directory / "room.schema.json")
    rooms = {path.stem: datajson.load(path, schema) for path in sorted((directory / "rooms").glob("*.json"))}
    constants = datajson.constants()
    for name, room in rooms.items():
        where = f"rooms/{name}.json"
        if name == RUN_COMPLETED.split("/")[0]:
            error(where, f"a room can't be called {name!r}, which requirements use for {RUN_COMPLETED!r}")
        battles = {}
        for i, battle in enumerate(room["battles"]):
            if battle["id"] in battles:
                error(where, f"two battles are called {battle['id']!r}")
            battles[battle["id"]] = battle
            low, high = ENEMY_COUNTS[battle["format"]]
            count = len(battle["enemies"])
            if not low <= count <= high:
                error(where, f"battles[{i}]: a {battle['format']} battle takes {low} to {high} enemies, not {count}")
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
            elif npc["type"] == "item" and "item" not in npc:
                error(where, f"{at} is an item NPC without an item")
            if "marker" in npc and npc["marker"] not in npc_marker_names(directory):
                error(where, f"{at}'s marker {npc['marker']!r} has no npc_markers/{npc['marker']}.png")
    return rooms


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
    """The model table's members from MARKER_FIRST_MEMBER: the ground markers in MARKER_TYPES' order, then the NPC
    markers in npc_marker_names()' order."""
    names = npc_marker_names(directory)
    if len(names) > NPC_MARKERS_MAX:
        raise datajson.DataError(f"{datajson.label(directory / 'npc_markers')}: {len(names)} markers, more than "
                                 f"{NPC_MARKERS_MAX}")
    return ([marker_texture(directory / "markers" / f"{kind}.png", MARKER_SIZE, flat=True) for kind in MARKER_TYPES]
            + [marker_texture(directory / "npc_markers" / f"{name}.png", NPC_MARKER_SIZE) for name in names])


def check_progress(directory: Path, rooms: dict[str, dict]):
    """Every battle and every catchable enemy has its own progress id, below progress_ids.json's next ones."""
    path = directory / "progress_ids.json"
    issued = json.loads(path.read_text()) if path.is_file() else {"next_battle": BATTLES_MAX, "next_catch": CATCHES_MAX}
    seen = {"battle": {}, "catch": {}}
    for name, room in rooms.items():
        for battle in room["battles"]:
            key = f"{name}/{battle['id']}"
            claims = [("battle", battle.get("progress_id"), key, BATTLES_MAX, issued["next_battle"])]
            claims += [("catch", enemy.get("progress_id"), f"{key}'s {enemy['species']}", CATCHES_MAX,
                        issued["next_catch"]) for enemy in battle["enemies"] if "catch" in enemy]
            for kind, number, label, limit, next_number in claims:
                if number is None:
                    error(f"rooms/{name}.json", f"{label} has no progress_id: the editor gives one on save "
                          f"(the next of progress_ids.json); a {kind} needs one for the save")
                if number >= limit:
                    error(f"rooms/{name}.json", f"{label}'s progress_id {number} is past the save's {limit}")
                if number >= next_number:
                    error(f"rooms/{name}.json", f"{label}'s progress_id {number} isn't below progress_ids.json's "
                          f"next_{kind} ({next_number}), so it could be given again")
                if number in seen[kind]:
                    error(f"rooms/{name}.json", f"{label} has {kind} progress_id {number}, as {seen[kind][number]} "
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


def dialogue_lines(directory: Path = SOURCE) -> list[str]:
    """The script text bank entralink_dialogue: every NPC's before and after lines, room by room, in tables()'s
    order. Its first line is empty, so the bank is never empty and no NPC's message is 0."""
    lines = [""]
    for room in load_rooms(directory).values():
        for npc in room["npcs"]:
            dialogue = npc.get("dialogue", {})
            for key in ("before", "after"):
                if dialogue.get(key) and (key == "before" or npc["type"] == "battle"):
                    lines.append(text_line(dialogue[key]))
    return lines


def room_pool(rooms: dict[str, dict], number: int) -> list[str]:
    """The rooms of role room that can come up in round number: those kept to it and the generic ones."""
    return [n for n, r in rooms.items() if r["role"] == "room" and number in r.get("rounds", [number])]


def boss_pool(rooms: dict[str, dict], number: int) -> list[str]:
    """The boss rooms that can end round number: those kept to it, else the generic ones (kept to no round)."""
    kept = [n for n, r in rooms.items() if r["role"] == "boss" and number in r.get("rounds", [])]
    return kept or [n for n, r in rooms.items() if r["role"] == "boss" and "rounds" not in r]


def draw_problems(run: dict, rooms: dict[str, dict]) -> list[tuple[str, str]]:
    """What is wrong with the run's draw, as ("error", message) or ("warning", message), as the editor's Run section
    says it (editor/src/modules/entree/model.ts, runProblems). The game draws each round's rooms from room_pool() and
    its boss from boss_pool(), each time one of the least used so far other than the room just before (so none comes
    up twice while some haven't), and the room just before again only when it is the only one. So too few rooms only
    means repeats, a warning; a round with no room at all, or a boss round with no boss, can't be drawn."""
    problems = []
    if not any(room["role"] == "final" for room in rooms.values()):
        problems.append(("error", "no room has the role final, which every run ends with"))
    drawn, bosses, room_names, boss_names = 0, 0, set(), set()
    for number, round_ in enumerate(run["rounds"], 1):
        if round_.get("boss") and number == 3:
            problems.append(("error", "round 3 can't end with a boss: the final room ends it"))
        pool = room_pool(rooms, number)
        if round_["rooms"] and not pool:
            problems.append(("error", f"round {number} draws {round_['rooms']} rooms, but no room can come up in it "
                             "(role room, rounds left out or naming it)"))
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
    total = sum(r["rooms"] + bool(r.get("boss")) for r in run["rounds"]) + 1
    if total > RUN_ROOMS_MAX:
        problems.append(("error", f"the rounds have {total} rooms with the final one, more than {RUN_ROOMS_MAX}"))
    if room_names and drawn > len(room_names):
        problems.append(("warning", f"the rounds draw {drawn} rooms from {len(room_names)}, so rooms come up more "
                         "than once in a run (the least used first, never twice in a row)"))
    if boss_names and bosses > len(boss_names):
        problems.append(("warning", f"the run has {bosses} bosses from {len(boss_names)} boss rooms, so a boss comes "
                         "up twice"))
    return problems


def field_weathers() -> dict[str, int]:
    from tools.paperwhite2.conditions import weathers
    return weathers()


def tables(directory: Path) -> dict:
    """The header's values, or a datajson.DataError that says what is wrong."""
    run = load_run(directory)
    rooms = load_rooms(directory)
    check_progress(directory, rooms)
    constants = datajson.constants()
    weathers = field_weathers()
    default_weather = run.get("field_weather")
    if default_weather is not None and default_weather not in weathers:
        error("run.json", f"field_weather {default_weather!r} is not a WEATHER_* of include/system/zone_weather.h")
    round_weathers = []
    for number, round_ in enumerate(run["rounds"], 1):
        weather = round_.get("field_weather", default_weather)
        if weather is not None and weather not in weathers:
            error("run.json", f"round {number}'s field_weather {weather!r} is not a WEATHER_* of "
                  "include/system/zone_weather.h")
        round_weathers.append(FIELD_WEATHER_ZONE if weather is None else weathers[weather])
    spots = {**DEFAULT_MARKER_SPOTS, **run.get("marker_spots", {})}
    npc_markers = {name: i for i, name in enumerate(npc_marker_names(directory))}
    errors = [message for level, message in draw_problems(run, rooms) if level == "error"]
    if errors:
        error("run.json", errors[0])

    room_rows, battles, enemies, npcs, requirements = [], [], [], [], []
    message = 1
    for name, room in rooms.items():
        weather = room.get("weather")
        battle_index = {}
        first_battle = len(battles)
        for battle in room["battles"]:
            battle_index[battle["id"]] = len(battles) - first_battle
            battles.append({"name": f"{name}/{battle['id']}", "format": FORMATS[battle["format"]],
                            "enemyCount": len(battle["enemies"]), "firstEnemy": len(enemies),
                            "progressId": battle["progress_id"]})
            for enemy in battle["enemies"]:
                moves = [constants[move] for move in enemy.get("moves", [])]
                ability = enemy.get("ability")
                catch = enemy.get("catch")
                first_requirement = len(requirements)
                if catch is not None:
                    requirements += [requirement(key, rooms, f"rooms/{name}.json") for key in catch.get("after", [])]
                enemies.append({
                    "name": f"{name}/{battle['id']}: {enemy['species']}",
                    "species": constants[enemy["species"]],
                    "item": constants[enemy["item"]] if "item" in enemy else 0,
                    "moves": moves + [0] * (4 - len(moves)),
                    "ability": ABILITY_SPECIES if ability is None else ABILITY_HIDDEN if ability == "hidden"
                    else constants[ability],
                    "form": enemy.get("form", 0),
                    "level": enemy.get("level", DEFAULT_LEVEL),
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
            requirements += [requirement(key, rooms, f"rooms/{name}.json") for key in npc.get("requires", [])]
            dialogue = npc.get("dialogue", {})
            messages = []
            for key in ("before", "after"):
                if dialogue.get(key) and (key == "before" or npc["type"] == "battle"):
                    messages.append(message)
                    message += 1
                else:
                    messages.append(NONE16)
            sprite = npc.get("sprite", DEFAULT_SPRITES.get(npc["type"]))
            npcs.append({
                "name": f"{name}: {npc['type']}",
                "type": NPC_TYPES[npc["type"]],
                "battle": battle_index.get(npc.get("battle"), 0),
                "enemy": npc.get("enemy", 0),
                "count": npc.get("count", 1),
                "item": constants[npc["item"]] if "item" in npc else 0,
                "sprite": 0 if sprite is None else constants[sprite],
                "chance": npc.get("chance", 100),
                "x": npc["x"], "z": npc["z"], "direction": constants[npc["facing"]],
                "firstRequirement": first_requirement,
                "requirementCount": len(requirements) - first_requirement,
                "before": messages[0], "after": messages[1],
                "beforeStyle": STYLES[dialogue.get("before_style", "talk")],
                "afterStyle": STYLES[dialogue.get("after_style", "talk")],
                "marker": npc_markers[npc["marker"]] if "marker" in npc else NPC_MARKER_NONE,
            })
        rounds = 0
        for number in room.get("rounds", []):
            rounds |= 1 << (number - 1)
        room_rows.append({
            "name": name, "role": ROLES[room["role"]], "rounds": rounds,
            "weather": WEATHER_FIELD if weather is None else constants[weather],
            "marker": MARKER_TYPES.index(room.get("marker", ROLE_MARKERS[room["role"]])),
            "firstBattle": first_battle, "battleCount": len(battles) - first_battle,
            "firstNpc": first_npc, "npcCount": len(npcs) - first_npc,
        })
    return {
        "ids": list(rooms),
        "rooms": room_rows,
        "battles": battles,
        "enemies": enemies,
        "npcs": npcs,
        "requirements": requirements,
        "rounds": [(r["rooms"], int(r.get("boss", False)), weather)
                   for r, weather in zip(run["rounds"], round_weathers)],
        "room_zones": [(zone, constants[zone]) for zone in run["room_maps"]],
        "final_zone": (run["final_map"], constants[run["final_map"]]),
        "pre_boss_zone": (run["pre_boss_map"], constants[run["pre_boss_map"]]) if "pre_boss_map" in run
        else ("none: the room maps, north door only", PRE_BOSS_ZONE_NONE),
        "unknown_chance": run.get("unknown_chance", DEFAULT_UNKNOWN_CHANCE),
        "marker_spots": [tuple(spots[door]) for door in DOORS],
        "npc_markers": list(npc_markers),
    }


def initializer(rows: list[str]) -> str:
    return "{ \\\n" + " \\\n".join(f"    {row}," for row in rows) + " \\\n}" if rows else "{ 0 }"


def header(directory: Path) -> str:
    data = tables(directory)
    rooms = [f"/* {r['name']} */ {{ {r['role']}, 0x{r['rounds']:x}, 0x{r['weather']:02x}, {r['marker']}, "
             f"{r['firstBattle']}, {r['battleCount']}, {r['firstNpc']}, {r['npcCount']} }}" for r in data["rooms"]]
    battles = [f"/* {b['name']} */ {{ {b['format']}, {b['enemyCount']}, {b['firstEnemy']}, {b['progressId']} }}"
               for b in data["battles"]]
    enemies = [f"/* {e['name']} */ {{ {e['species']}, {e['item']}, {{ {', '.join(map(str, e['moves']))} }}, "
               f"0x{e['ability']:x}, 0x{e['catchId']:x}, {e['firstRequirement']}, {e['form']}, {e['level']}, "
               f"{e['gender']}, {e['shiny']}, {e['catchOnce']}, {e['requirementCount']} }}" for e in data["enemies"]]
    npcs = [f"/* {n['name']} */ {{ {n['item']}, {n['sprite']}, {n['firstRequirement']}, "
            f"0x{n['before']:x}, 0x{n['after']:x}, {n['type']}, {n['battle']}, {n['enemy']}, {n['count']}, "
            f"{n['chance']}, {n['x']}, {n['z']}, {n['direction']}, {n['requirementCount']}, {n['beforeStyle']}, "
            f"{n['afterStyle']}, 0x{n['marker']:02x} }}" for n in data["npcs"]]
    rounds = [f"{{ {rooms_}, {boss}, 0x{weather:02x} }}" for rooms_, boss, weather in data["rounds"]]
    spots = [f"{{ {x}, {z} }}" for x, z in data["marker_spots"]]
    zones = [f"{value} /* {name} */" for name, value in data["room_zones"]]
    requirements = [f"0x{value:x}" for value in data["requirements"]]
    return "\n".join([
        f"#ifndef {GUARD}", f"#define {GUARD}", "",
        f"// Generated by tools/paperwhite2/entralink_run.py from {datajson.label(directory)}, edit that instead",
        "",
        *(f"#define ENTRALINK_ROOM_{name.upper()} {i}" for i, name in enumerate(data["ids"])),
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
        f"#define ENTRALINK_RUN_UNKNOWN_CHANCE {data['unknown_chance']}",
        "// The ground markers' spots, the top-left tiles of 2 by 2, in ENTRALINK_DOOR_* order (north, east, west)",
        f"#define ENTRALINK_RUN_MARKER_SPOTS {{ {', '.join(spots)} }}",
        "// The markers' art in the model table (ARCID_MMODEL_TBL): the ground markers from the first, in",
        "// ENTRALINK_MARKER_* order, then the NPC markers",
        f"#define ENTRALINK_RUN_MARKER_FILE {MARKER_FIRST_MEMBER}",
        f"#define ENTRALINK_RUN_NPC_MARKER_FILE {MARKER_FIRST_MEMBER + len(MARKER_TYPES)}",
        f"#define ENTRALINK_RUN_NPC_MARKER_COUNT {len(data['npc_markers'])}",
        *(f"#define ENTRALINK_NPC_MARKER_{name.upper()} {i}" for i, name in enumerate(data["npc_markers"])),
        "// EntralinkRoom: role, rounds, weather, marker, first battle, battle count, first NPC, NPC count",
        f"#define ENTRALINK_RUN_ROOMS {initializer(rooms)}",
        "// EntralinkBattle: format, enemy count, first enemy, progress id",
        f"#define ENTRALINK_RUN_BATTLES {initializer(battles)}",
        "// EntralinkEnemy: species, item, moves, ability, catch id, first requirement, form, level, gender, shiny,",
        "// catch once, requirement count",
        f"#define ENTRALINK_RUN_ENEMIES {initializer(enemies)}",
        "// EntralinkNpc: item, sprite, first requirement, before and after messages, type, battle, enemy, count,",
        "// chance, x, z, direction, requirement count, before and after styles, marker",
        f"#define ENTRALINK_RUN_NPCS {initializer(npcs)}",
        "// The NPCs' and catches' requirements: battles' progress ids, or ENTRALINK_REQUIRE_RUN_COMPLETED",
        f"#define ENTRALINK_RUN_REQUIREMENTS {{ {', '.join(requirements) or '0'} }}",
        "// EntralinkRound: rooms, boss, field weather",
        f"#define ENTRALINK_RUN_ROUNDS {{ {', '.join(rounds)} }}",
        f"#define ENTRALINK_RUN_ROOM_ZONES {{ {', '.join(zones)} }}",
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
        for level, message in draw_problems(load_run(args.source), load_rooms(args.source)):
            if level == "warning":
                print(f"warning: run.json: {message}", file=sys.stderr)
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
