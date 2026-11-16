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
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data import datajson  # noqa: E402

SOURCE = ROOT / "res" / "paperwhite2" / "entralink"
GUARD = "POKEBW2_PAPERWHITE2_ENTRALINK_RUN_CONFIG_H"
# include/paperwhite2/entralink_run.h's values
FORMATS = {"single": 0, "double": 1, "triple": 2, "raid": 3}
ENEMY_COUNTS = {"single": (1, 1), "double": (1, 2), "triple": (1, 3), "raid": (1, 1)}
ROLES = {"room": 0, "boss": 1, "final": 2}
NPC_TYPES = {"battle": 0, "item": 1, "rest": 2, "buff": 3}
WEATHER_FIELD = 0xff
FIELD_WEATHER_ZONE = 0xff
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
# The field weather of a room's battle weather: the field has no harsh sun, so sun and none are clear, and hail is the
# snow that gives hail in battle (paperwhite2_battle_weather_event.c's BattleWeather_ToFieldWeather)
FIELD_WEATHERS = {"BTL_WEATHER_NONE": "WEATHER_SUNNY", "BTL_WEATHER_SUN": "WEATHER_SUNNY",
                  "BTL_WEATHER_RAIN": "WEATHER_RAIN", "BTL_WEATHER_HAIL": "WEATHER_FLUTTER",
                  "BTL_WEATHER_SANDSTORM": "WEATHER_SANDSTORM"}


def error(where: str, message: str):
    raise datajson.DataError(f"{where}: {message}")


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
    return rooms


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


def field_weathers() -> dict[str, int]:
    from tools.paperwhite2.conditions import weathers
    return weathers()


def tables(directory: Path) -> dict:
    """The header's values, or a datajson.DataError that says what is wrong."""
    run = datajson.load(directory / "run.json", datajson.load_schema(directory / "run.schema.json"))
    rooms = load_rooms(directory)
    check_progress(directory, rooms)
    constants = datajson.constants()
    weathers = field_weathers()
    default_weather = run.get("field_weather")
    if default_weather is not None and default_weather not in weathers:
        error("run.json", f"field_weather {default_weather!r} is not a WEATHER_* of include/system/zone_weather.h")
    for i, round_ in enumerate(run["rounds"]):
        if round_.get("boss") and i == 2:
            error("run.json", "rounds[2] can't end with a boss: the final room ends round 3")
    total = sum(r["rooms"] + bool(r.get("boss")) for r in run["rounds"]) + 1
    if total > RUN_ROOMS_MAX:
        error("run.json", f"the rounds have {total} rooms with the final one, more than {RUN_ROOMS_MAX}")
    roles = [room["role"] for room in rooms.values()]
    if "final" not in roles:
        error("rooms/", "no room has the role final, which every run ends with")
    for number, round_ in enumerate(run["rounds"], 1):
        eligible = [n for n, r in rooms.items() if r["role"] == "room" and number in r.get("rounds", [number])]
        if len(eligible) < round_["rooms"]:
            error("run.json", f"round {number} draws {round_['rooms']} rooms, but only {len(eligible)} can come up in "
                  "it (role room, rounds left out or naming it)")
        bosses = [n for n, r in rooms.items() if r["role"] == "boss" and number in r.get("rounds", [number])]
        if round_.get("boss") and not bosses:
            error("run.json", f"round {number} ends with a boss, but no boss room can come up in it")

    room_rows, battles, enemies, npcs, requirements = [], [], [], [], []
    message = 1
    for name, room in rooms.items():
        weather = room.get("weather")
        field_weather = FIELD_WEATHERS.get(weather) if weather is not None else default_weather
        if weather is not None and field_weather is None:
            error(f"rooms/{name}.json", f"weather {weather} has no field weather to show")
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
            })
        rounds = 0
        for number in room.get("rounds", []):
            rounds |= 1 << (number - 1)
        room_rows.append({
            "name": name, "role": ROLES[room["role"]], "rounds": rounds,
            "weather": WEATHER_FIELD if weather is None else constants[weather],
            "fieldWeather": FIELD_WEATHER_ZONE if field_weather is None else weathers[field_weather],
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
        "rounds": [(r["rooms"], int(r.get("boss", False))) for r in run["rounds"]],
        "room_zones": [(zone, constants[zone]) for zone in run["room_maps"]],
        "final_zone": (run["final_map"], constants[run["final_map"]]),
    }


def initializer(rows: list[str]) -> str:
    return "{ \\\n" + " \\\n".join(f"    {row}," for row in rows) + " \\\n}" if rows else "{ 0 }"


def header(directory: Path) -> str:
    data = tables(directory)
    rooms = [f"/* {r['name']} */ {{ {r['role']}, 0x{r['rounds']:x}, 0x{r['weather']:02x}, 0x{r['fieldWeather']:02x}, "
             f"{r['firstBattle']}, {r['battleCount']}, {r['firstNpc']}, {r['npcCount']} }}" for r in data["rooms"]]
    battles = [f"/* {b['name']} */ {{ {b['format']}, {b['enemyCount']}, {b['firstEnemy']}, {b['progressId']} }}"
               for b in data["battles"]]
    enemies = [f"/* {e['name']} */ {{ {e['species']}, {e['item']}, {{ {', '.join(map(str, e['moves']))} }}, "
               f"0x{e['ability']:x}, 0x{e['catchId']:x}, {e['firstRequirement']}, {e['form']}, {e['level']}, "
               f"{e['gender']}, {e['shiny']}, {e['catchOnce']}, {e['requirementCount']} }}" for e in data["enemies"]]
    npcs = [f"/* {n['name']} */ {{ {n['item']}, {n['sprite']}, {n['firstRequirement']}, "
            f"0x{n['before']:x}, 0x{n['after']:x}, {n['type']}, {n['battle']}, {n['enemy']}, {n['count']}, "
            f"{n['chance']}, {n['x']}, {n['z']}, {n['direction']}, {n['requirementCount']} }}" for n in data["npcs"]]
    rounds = [f"{{ {rooms_}, {boss} }}" for rooms_, boss in data["rounds"]]
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
        "// EntralinkRoom: role, rounds, weather, field weather, first battle, battle count, first NPC, NPC count",
        f"#define ENTRALINK_RUN_ROOMS {initializer(rooms)}",
        "// EntralinkBattle: format, enemy count, first enemy, progress id",
        f"#define ENTRALINK_RUN_BATTLES {initializer(battles)}",
        "// EntralinkEnemy: species, item, moves, ability, catch id, first requirement, form, level, gender, shiny,",
        "// catch once, requirement count",
        f"#define ENTRALINK_RUN_ENEMIES {initializer(enemies)}",
        "// EntralinkNpc: item, sprite, first requirement, before and after messages, type, battle, enemy, count,",
        "// chance, x, z, direction, requirement count",
        f"#define ENTRALINK_RUN_NPCS {initializer(npcs)}",
        "// The NPCs' and catches' requirements: battles' progress ids, or ENTRALINK_REQUIRE_RUN_COMPLETED",
        f"#define ENTRALINK_RUN_REQUIREMENTS {{ {', '.join(requirements) or '0'} }}",
        "// EntralinkRound: rooms, boss",
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
