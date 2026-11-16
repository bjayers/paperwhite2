#!/usr/bin/env python3
"""Paper White 2's Entralink roguelike: the generated header of res/paperwhite2/entralink/.

    entralink_run.py OUTPUT_HEADER        # writes paperwhite2/entralink_run_config.h
    entralink_run.py --check              # only checks the data

The data (docs/paperwhite2/design/entralink-roguelike-prototype.md, schemas beside it) is run.json, the run's layout,
and challenges/<id>.json, one challenge each, whose ID is the file's name. The header has the challenges in the order
of their IDs, their enemies in one table, the pool as challenge indices, and the zones, as the initializers that
src/paperwhite2/ov012/paperwhite2_entralink_run.c reads (the structs and ENTRALINK_* values of
include/paperwhite2/entralink_run.h). Only the hack's build runs this (configure.py --hack).
"""
import argparse
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
WEATHER_FIELD = 0xff
ABILITY_SPECIES = 0
ABILITY_HIDDEN = 0xffff
GENDERS = {None: 0, "male": 1, "female": 2}
DEFAULT_LEVEL = 70
# One place in the pool a nibble of a variable (ENTRALINK_RUN_POOL_ROOMS_MAX)
POOL_ROOMS_MAX = 4
POOL_MAX = 16


def load_challenges(directory: Path) -> dict[str, dict]:
    """Every challenge by ID, in ID order."""
    schema = datajson.load_schema(directory / "challenge.schema.json")
    challenges = {path.stem: datajson.load(path, schema) for path in sorted((directory / "challenges").glob("*.json"))}
    for name, challenge in challenges.items():
        low, high = ENEMY_COUNTS[challenge["format"]]
        count = len(challenge["enemies"])
        if not low <= count <= high:
            raise datajson.DataError(f"challenges/{name}.json: a {challenge['format']} battle takes {low} to {high} "
                                     f"enemies, not {count}")
        for i, enemy in enumerate(challenge["enemies"]):
            ability = enemy.get("ability")
            if ability is not None and ability != "hidden" and not (
                    ability.startswith("ABILITY_") and ability in datajson.constants()):
                raise datajson.DataError(f"challenges/{name}.json: enemies[{i}].ability {ability!r} is not \"hidden\" "
                                         "or a known ABILITY_* constant")
    return challenges


def tables(directory: Path) -> dict:
    """The header's values, or a datajson.DataError that says what is wrong."""
    run = datajson.load(directory / "run.json", datajson.load_schema(directory / "run.schema.json"))
    challenges = load_challenges(directory)
    ids = list(challenges)
    for name in [*run["pool"], run["final"]]:
        if name not in challenges:
            raise datajson.DataError(f"run.json: no challenge {name!r} in challenges/")
    if len(set(run["pool"])) != len(run["pool"]):
        raise datajson.DataError("run.json: the pool names a challenge twice")
    if len(run["pool"]) > POOL_MAX - 1:
        raise datajson.DataError(f"run.json: the pool has more than {POOL_MAX - 1} challenges")
    if run["pool_rooms"] > min(len(run["pool"]), POOL_ROOMS_MAX):
        raise datajson.DataError(f"run.json: pool_rooms is more than the pool's {len(run['pool'])} or "
                                 f"{POOL_ROOMS_MAX}")
    constants = datajson.constants()
    rows, enemies = [], []
    for name, challenge in challenges.items():
        weather = challenge.get("weather")
        rows.append((name, FORMATS[challenge["format"]],
                     WEATHER_FIELD if weather is None else constants[weather], challenge["tier"], len(enemies),
                     len(challenge["enemies"])))
        for enemy in challenge["enemies"]:
            moves = [constants[move] for move in enemy.get("moves", [])]
            ability = enemy.get("ability")
            enemies.append({
                "name": f"{name}: {enemy['species']}",
                "species": constants[enemy["species"]],
                "item": constants[enemy["item"]] if "item" in enemy else 0,
                "moves": moves + [0] * (4 - len(moves)),
                "ability": ABILITY_SPECIES if ability is None else ABILITY_HIDDEN if ability == "hidden"
                else constants[ability],
                "form": enemy.get("form", 0),
                "level": enemy.get("level", DEFAULT_LEVEL),
                "gender": GENDERS[enemy.get("gender")],
                "shiny": int(enemy.get("shiny", False)),
                "x": enemy["actor"]["x"],
                "z": enemy["actor"]["z"],
                "direction": constants[enemy["actor"]["facing"]],
            })
    return {
        "ids": ids,
        "challenges": rows,
        "enemies": enemies,
        "pool": [ids.index(name) for name in run["pool"]],
        "pool_rooms": run["pool_rooms"],
        "final": ids.index(run["final"]),
        "room_zones": [(zone, constants[zone]) for zone in run["room_maps"]],
        "final_zone": (run["final_map"], constants[run["final_map"]]),
    }


def initializer(rows: list[str]) -> str:
    return "{ \\\n" + " \\\n".join(f"    {row}," for row in rows) + " \\\n}"


def header(directory: Path) -> str:
    data = tables(directory)
    challenges = [f"/* {name} */ {{ {fmt}, 0x{weather:02x}, {tier}, {first}, {count} }}"
                  for name, fmt, weather, tier, first, count in data["challenges"]]
    enemies = [f"/* {e['name']} */ {{ {e['species']}, {e['item']}, {{ {', '.join(map(str, e['moves']))} }}, "
               f"0x{e['ability']:x}, {e['form']}, {e['level']}, {e['gender']}, {e['shiny']}, {e['x']}, {e['z']}, "
               f"{e['direction']} }}" for e in data["enemies"]]
    zones = [f"{value} /* {name} */" for name, value in data["room_zones"]]
    return "\n".join([
        f"#ifndef {GUARD}", f"#define {GUARD}", "",
        f"// Generated by tools/paperwhite2/entralink_run.py from {datajson.label(directory)}, edit that instead",
        "",
        *(f"#define ENTRALINK_CHALLENGE_{name.upper()} {i}" for i, name in enumerate(data["ids"])),
        "",
        f"#define ENTRALINK_RUN_CHALLENGE_COUNT {len(data['challenges'])}",
        f"#define ENTRALINK_RUN_ENEMY_COUNT {len(data['enemies'])}",
        f"#define ENTRALINK_RUN_POOL_COUNT {len(data['pool'])}",
        f"#define ENTRALINK_RUN_POOL_ROOMS {data['pool_rooms']}",
        f"#define ENTRALINK_RUN_FINAL_CHALLENGE {data['final']}",
        f"#define ENTRALINK_RUN_ROOM_ZONE_COUNT {len(zones)}",
        f"#define ENTRALINK_RUN_FINAL_ZONE {data['final_zone'][1]} // {data['final_zone'][0]}",
        "// EntralinkChallenge: format, weather, tier, first enemy, enemy count",
        f"#define ENTRALINK_RUN_CHALLENGES {initializer(challenges)}",
        "// EntralinkEnemy: species, item, moves, ability, form, level, gender, shiny, x, z, direction",
        f"#define ENTRALINK_RUN_ENEMIES {initializer(enemies)}",
        "// The pool's challenges",
        f"#define ENTRALINK_RUN_POOL {{ {', '.join(map(str, data['pool']))} }}",
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
    except datajson.DataError as error:
        sys.exit(f"error: {error}")


if __name__ == "__main__":
    main()
