#!/usr/bin/env python3
"""Paper White 2's Entralink roguelike: the random rooms' settings and species, paperwhite2/entralink_random_config.h.

    entralink_random.py OUTPUT_HEADER        # writes the header
    entralink_random.py --check              # only checks the data

A door to an enemy or enemy_choice room leads at run.json's random_enemy_chance to a random room, whose battles the
game makes as the player enters it (src/paperwhite2/ov012/paperwhite2_entralink_random_rooms.c,
docs/paperwhite2/design/entralink-roguelike-prototype.md, "Random enemy rooms"). Its settings are run.json's
random_rooms (run.schema.json says each); its species are those of the Pokédex (tools/data/species_list.py's
pokedex_species: never a "pokedex": false one) that legendaries.json doesn't list, that have a walking sprite (the
NPC shows it) and that know a damaging level-up move at the rooms' level, each with its base stat total, types and
evolution family (its line's first species), which the draw's bands and themes read. The game reads the moves,
abilities and gender ratio from the species' own data as it makes an enemy.
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from tools.data import datajson, species_list  # noqa: E402
from tools.paperwhite2 import entralink_run  # noqa: E402

SOURCE = ROOT / "res" / "paperwhite2" / "entralink"
MOVES = ROOT / "res" / "moves"
GUARD = "POKEBW2_PAPERWHITE2_ENTRALINK_RANDOM_CONFIG_H"

FORMATS = ["single", "double", "triple"]
DEFAULT_FORMAT_WEIGHTS = {"single": 40, "double": 35, "triple": 25}
DEFAULT_BST = [{"min": 300, "max": 480}, {"min": 380, "max": 540}, {"min": 450, "max": 600}]
DEFAULTS = {"theme_chance": 70, "level": 70, "move_pool": 7, "tm_chance": 25, "hidden_ability_chance": 5}
DEFAULT_ANCHORS = [[[15, 15]], [[12, 15], [19, 15]], [[10, 15], [15, 15], [20, 15]]]
# A battle's enemies' tiles from its anchor, by format: a single's on it, a double's side by side, a triple's first in
# front and the other two one tile back on either side (as the user's Time and Space room stands them)
FORMAT_TILES = {"single": [(0, 0)], "double": [(0, 0), (1, 0)], "triple": [(0, 0), (-1, -1), (1, -1)]}
# The tiles a room keeps clear (tools/paperwhite2/entralink_run.py's game: EntralinkRun_IsKeptClear): the exits, the
# doors' markers and where the player arrives
EXITS = [(15, 9), (16, 9), (15, 24), (16, 24), *((x, z) for x in (5, 26) for z in (15, 16, 17))]
ARRIVAL = (15, 23)
# A sprite whose female walking sprite is the next object code (sprite's top bit)
FEMALE_NEXT = 0x8000


def error(where: str, message: str):
    raise datajson.DataError(f"{where}: {message}")


def settings(run: dict) -> dict:
    """run.json's random room settings with their defaults: the format weights, a band for each of the 3
    rounds (the last given for those left out), the numbers and the anchors."""
    given = run.get("random_rooms", {})
    bands = given.get("bst") or DEFAULT_BST
    out = {
        "format_weights": {**DEFAULT_FORMAT_WEIGHTS, **given.get("format_weights", {})},
        "bst": [bands[min(i, len(bands) - 1)] for i in range(3)],
        **{key: given.get(key, value) for key, value in DEFAULTS.items()},
        "anchors": given.get("anchors", DEFAULT_ANCHORS),
    }
    if not any(out["format_weights"].values()):
        error("run.json", "random_rooms.format_weights add up to 0")
    for number, band in enumerate(out["bst"], 1):
        if band["min"] > band["max"]:
            error("run.json", f"random_rooms.bst: round {number}'s min {band['min']} is above its max {band['max']}")
    return out


def anchor_problems(anchors: list, blocked: dict[str, list[int]], spots: list[tuple[int, int]]) -> list[str]:
    """What is wrong with the anchors: 1, 2 and 3 of them for 1, 2 and 3 choices; every tile of every format on the
    grid, walkable in every clearing (blocked, a row of bits per z each) and off the exits, the markers and the
    arrival; and the tiles of different choices at least 2 apart (a free tile between them), whatever their formats."""
    problems = []
    marker_tiles = {(x + dx, z + dz) for x, z in spots for dx in (0, 1) for dz in (0, 1)}
    for count, group in enumerate(anchors, 1):
        if len(group) != count:
            problems.append(f"random_rooms.anchors[{count - 1}] has {len(group)} anchors, not {count}")
            continue
        tiles = []
        for x, z in group:
            tiles.append({(x + dx, z + dz) for offsets in FORMAT_TILES.values() for dx, dz in offsets})
        for i, own in enumerate(tiles):
            where = f"random_rooms.anchors[{count - 1}][{i}]"
            for x, z in sorted(own):
                if not (0 <= x < 32 and 0 <= z < 32):
                    problems.append(f"{where}: tile {x}, {z} is off the grid")
                    continue
                walls = [zone for zone, rows in blocked.items() if rows[z] >> x & 1]
                if walls:
                    problems.append(f"{where}: tile {x}, {z} can't be walked on in {walls[0]}")
                if (x, z) in EXITS or (x, z) in marker_tiles or (x, z) == ARRIVAL:
                    problems.append(f"{where}: tile {x}, {z} is an exit, a door's marker or the arrival")
            for j in range(i):
                if any(max(abs(a - c), abs(b - d)) < 2 for a, b in own for c, d in tiles[j]):
                    problems.append(f"{where} stands within a tile of choice {j}")
    return problems


def move_data(move: str) -> dict:
    return json.loads((MOVES / move.removeprefix("MOVE_").lower() / "data.json").read_text())


def is_damaging(move: str, cache: dict[str, bool]) -> bool:
    if move not in cache:
        cache[move] = move_data(move).get("power", 0) != 0
    return cache[move]


def families(numbers: list[int]) -> dict[int, int]:
    """Each species' evolution family, as its line's first species: the one no species evolves into."""
    names = species_list.constants()
    parent = {}
    for number in numbers:
        for evolution in species_list.species_data(number).get("evolutions", []):
            child = evolution.get("species")
            if child in names and names.index(child) != number:
                parent.setdefault(names.index(child), number)
    out = {}
    for number in numbers:
        base, seen = number, set()
        while base in parent and base not in seen:
            seen.add(base)
            base = parent[base]
        out[number] = base
    return out


def species_rows(level: int, excluded: set[str]) -> list[dict]:
    """The species random rooms draw, in ID order: species, sprite (FEMALE_NEXT set when the female's is the next
    code), family, base stat total and types."""
    constants = datajson.constants()
    names = species_list.constants()
    numbers = species_list.pokedex_species()
    family = families(numbers)
    damaging = {}
    rows = []
    for number in numbers:
        name = names[number]
        if name in excluded:
            continue
        data = species_list.species_data(number)
        male = entralink_run.walking_sprite({"species": name}, constants)
        if male is None:
            continue
        if not any(lv <= level and is_damaging(move, damaging) for lv, move in data["learnset"]["by_level"]):
            continue
        female = entralink_run.walking_sprite({"species": name, "gender": "female"}, constants)
        sprite = constants[male]
        if female != male:
            if constants[female] != sprite + 1:
                error(f"res/pokemon/{species_list.directory(name)}", f"{female} isn't the code after {male}")
            sprite |= FEMALE_NEXT
        types = data["types"]
        rows.append({"name": name, "species": number, "sprite": sprite, "family": family[number],
                     "bst": sum(data["base_stats"].values()), "type1": constants[types[0]],
                     "type2": constants[types[-1]]})
    return rows


def tables(directory: Path) -> dict:
    run = entralink_run.load_run(directory)
    given = settings(run)
    legendaries = datajson.load(directory / "legendaries.json",
                                datajson.load_schema(directory / "legendaries.schema.json"))
    rows = species_rows(given["level"], set(legendaries["species"]))
    for number, band in enumerate(given["bst"], 1):
        if not any(band["min"] <= row["bst"] <= band["max"] for row in rows):
            error("run.json", f"random_rooms.bst: no species has a base stat total of {band['min']}-{band['max']} "
                  f"(round {number})")
    models = entralink_run.zone_models()
    blocked = {zone: entralink_run.blocked_rows(model) for zone, model in models.items()}
    spots = {**entralink_run.DEFAULT_MARKER_SPOTS, **run.get("marker_spots", {})}
    problems = anchor_problems(given["anchors"], blocked, [tuple(spots[door]) for door in entralink_run.DOORS])
    if problems:
        error("run.json", problems[0])
    return {**given, "species": rows}


def header(directory: Path) -> str:
    data = tables(directory)
    anchors = [f"{{ {x}, {z} }}" for group in data["anchors"] for x, z in group]
    species = [f"/* {r['name']} */ {{ {r['species']}, 0x{r['sprite']:04x}, {r['family']}, {r['bst']}, {r['type1']}, "
               f"{r['type2']} }}" for r in data["species"]]
    weights = data["format_weights"]
    bands = [f"{{ {band['min']}, {band['max']} }}" for band in data["bst"]]
    return "\n".join([
        f"#ifndef {GUARD}", f"#define {GUARD}", "",
        f"// Generated by tools/paperwhite2/entralink_random.py from {datajson.label(directory)}, edit that instead",
        "",
        "// The formats' weights (single, double, triple), and each round's base stat total band, { min, max }",
        f"#define ENTRALINK_RANDOM_FORMAT_WEIGHTS {{ {', '.join(str(weights[f]) for f in FORMATS)} }}",
        f"#define ENTRALINK_RANDOM_BST {{ {', '.join(bands)} }}",
        f"#define ENTRALINK_RANDOM_THEME_CHANCE {data['theme_chance']}",
        f"#define ENTRALINK_RANDOM_LEVEL {data['level']}",
        f"#define ENTRALINK_RANDOM_MOVE_POOL {data['move_pool']}",
        f"#define ENTRALINK_RANDOM_TM_CHANCE {data['tm_chance']}",
        f"#define ENTRALINK_RANDOM_HIDDEN_ABILITY_CHANCE {data['hidden_ability_chance']}",
        "// The battles' anchors for 1, 2 and 3 choices in turn (n choices' from n * (n - 1) / 2), { x, z }",
        f"#define ENTRALINK_RANDOM_ANCHORS {{ {', '.join(anchors)} }}",
        f"#define ENTRALINK_RANDOM_SPECIES_COUNT {len(species)}",
        "// EntralinkRandomSpecies: species, sprite (0x8000: the female's is the next code), family, base stat total,",
        "// types",
        f"#define ENTRALINK_RANDOM_SPECIES {entralink_run.initializer(species)}",
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
            data = tables(args.source)
            print(f"{datajson.label(args.source)}: {len(data['species'])} species for random rooms")
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
