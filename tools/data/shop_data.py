#!/usr/bin/env python3
"""The shops' goods in res/field/shops/: dump writes them once, from the ROM's archives and scrcmd_shop.c's tables; pack
builds the Poké Marts' archives (a/2/8/2, a/2/8/3) from them, which the build does; and header writes the hack's
generated header of the BP and move tutor shops' tables.

    shop_data.py dump extract/w2_us/files res/field/shops
    shop_data.py pack res/field/shops ITEMS_ARCHIVE COUNTS_ARCHIVE
    shop_data.py header res/field/shops OUTPUT_HEADER        # paperwhite2/shops_config.h, the hack's build only

Scrcmd_Shop_CallFriendlyShopBuy (src/ov036/scrcmd_shop.c) opens a shop by its ID, which the field scripts set in
0x8000 before calling global script 10110 (or 2280 for the tutors):

- poke_mart.json: shop 255, every Pokémon Center's first clerk, whose list grows with the badges: BADGE_SHOP_DAT_IDS
  picks one of its tiers, files 0 to 5 of a/2/8/2, by the badge count. A tier's "badges" say which counts it is for,
  and must agree with that table.
- marts.json: the shops 0 to 25, each a fixed list in file ID + 6: the Pokémon Centers' second clerks, Shopping Mall
  Nine's counters, Driftveil City's market and Nacrene City's café.
- special_marts.json: the shops 239 to 242 and 247 to 250, which grow with a level of KeyDataSave_GetProgress
  (SPECIAL_POKE_MART_HEADERS names their six files); no script opens them and their lists are empty in White 2.
- bp_shops.json: the Battle Subway's and the PWT's BP exchange counters, shops 254 (items) and 253 (TMs), in the order
  of BP_SHOP_ITEMS, each item with its price in BP.
- move_tutors.json: the shards' move tutors, shops 243 to 246, in the order of MOVE_TUTOR_SHOP_ITEMS (the tutorIndex),
  each move with its price in shards and its place in the tutor's menu. A move's place in its tutor's list is its bit
  in a species' tutor word, so species_data.py reads the moves from here (tutor_moves).

A mart's items cost their price in the item's data (GetItemParam's ITEM_PARAM_PRICE, less with the Bargain Pass
Power), so the marts' files hold only items; the BP and tutor shops give each its price. The marts' archive is packed
for both builds, so the matching build checks it against the ROM; the BP and tutor tables are C, which the matching
build keeps as written in scrcmd_shop.c and the hack's build takes from the header (under PAPERWHITE2).
"""
import argparse
import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.datajson import DataError, dumps_compact, label, load, load_schema, value  # noqa: E402
from tools.data.gen_constants import load as load_list  # noqa: E402
from tools.data.narc import read_narc, write_narc  # noqa: E402

SHOPS = ROOT / "res" / "field" / "shops"
SOURCE = ROOT / "src" / "ov036" / "scrcmd_shop.c"
GUARD = "POKEBW2_PAPERWHITE2_SHOPS_CONFIG_H"
# The archives of the marts' item lists, and of their counts (a single file of a byte per list)
ITEMS, COUNTS = "a/2/8/2", "a/2/8/3"
# A list's file is its shop's ID + 6 for the fixed and special marts (ShopUI_LoadPokeMartItems)
MART_FILE_BASE = 6
# ShopUIWork holds 45 entries; Paper White 2's build adds the Shiny Candy to the list of Virbank City's second clerk
# (SHOP_ID_VIRBANK_CITY in scrcmd_shop.c), which then holds one item fewer
LIST_MAX = 45
VIRBANK_CITY = 22
# A tutor's moves are the bits of a u32 in a species' personal data
TUTOR_MOVES_MAX = 32


def item_names() -> dict[int, str]:
    # From items.txt alone: the ITEM_ICON_ constants of item_icons.txt share the prefix
    return {v: k for k, v in reversed(load_list("items").items())}


def move_names() -> dict[int, str]:
    return {v: k for k, v in reversed(load_list("moves").items())}


# scrcmd_shop.c's tables


def c_source() -> str:
    return SOURCE.read_text()


def c_enum_values(source: str) -> dict[str, int]:
    """The values of the shop IDs' enum (SHOP_ID_*), which starts at an explicit value and counts up."""
    body = re.search(r"enum \{\s*(SHOP_ID_SPECIAL_MART_1_FIRST.*?)\};", source, re.S)[1]
    values, current = {}, -1
    for entry in re.findall(r"^\s*(SHOP_ID_\w+)(?: = (0x[0-9a-f]+|\d+))?,", body, re.M):
        current = int(entry[1], 0) if entry[1] else current + 1
        values[entry[0]] = current
    return values


def badge_tiers(source: str) -> list[int]:
    """BADGE_SHOP_DAT_IDS: the tier (file) of the Poké Mart for each badge count."""
    return [int(n) for n in re.search(r"BADGE_SHOP_DAT_IDS\[\] = \{ ([\d, ]+) \};", source)[1].split(",")]


def special_marts(source: str) -> list[tuple[int, list[int]]]:
    """SPECIAL_POKE_MART_HEADERS: each special mart's shop ID and the files of its levels, less MART_FILE_BASE."""
    enum = c_enum_values(source)
    body = re.search(r"SPECIAL_POKE_MART_HEADERS\[\] = \{(.*?)\n\};", source, re.S)[1]
    return [(enum[shop] + int(offset or 0), [int(n) for n in files.split(",")])
            for shop, offset, files in re.findall(r"\{ (SHOP_ID_\w+)(?: \+ (\d+))?, \{ ([\d, ]+) \} \}", body)]


def special_levels(source: str) -> list[int]:
    """sSpecialMartLevels: the least progress of each level."""
    return [int(n) for n in re.search(r"sSpecialMartLevels\[\] = \{ ([\d, ]+) \};", source)[1].split(",")]


def tutor_shards(source: str) -> list[str]:
    """MOVE_TUTOR_CURRENCY_ITEMS: each tutor's shard."""
    return [s.strip() for s in re.search(r"MOVE_TUTOR_CURRENCY_ITEMS\[\] = \{ ([\w, ]+) \};", source)[1].split(",")]


def c_bp_shops(source: str) -> list[tuple[str, list[tuple[str, int]]]]:
    """BP_SHOP_ITEMS' tables as written in the C, in its order."""
    pattern = r"static const ShopItem (BP_SHOP_ITEMS_\w+)\[\] = \{(.*?)\n\};"
    tables = {name: [(item, int(price)) for item, price in re.findall(r"\{ (ITEM_\w+), (\d+) \}", body)]
              for name, body in re.findall(pattern, source, re.S)}
    order = re.search(r"BP_SHOP_ITEMS\[\] = \{ ([\w, ]+) \};", source)[1]
    return [(name.strip(), tables[name.strip()]) for name in order.split(",")]


def c_move_tutors(source: str) -> list[tuple[str, list[tuple[str, int, int]]]]:
    """MOVE_TUTOR_SHOP_ITEMS' tables as written in the C (the matching build's), in its order."""
    tables = {name: [(move, int(price), int(index)) for move, price, index in
                     re.findall(r"\{ \{ (MOVE_\w+), (\d+) \}, (\d+) \}", body)]
              for name, body in re.findall(r"static const MoveTutorShopItem (MOVE_TUTOR_ITEMS_\w+)\[\] = \{(.*?)\n\};",
                                           source, re.S)}
    order = re.search(r"MOVE_TUTOR_SHOP_ITEMS\[\] = \{(.*?)\};", source, re.S)[1]
    return [(name.strip(), tables[name.strip()]) for name in order.split(",") if name.strip()]


def write(path: Path, data):
    """Writes a file in the compact layout, a record a line (the editor's shared/json.ts keeps it)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dumps_compact(data, step=4) + "\n")


# Dumping. The names say where each shop is, from the scripts that open it; they are the data's from then on.

TIER_NAMES = "Poké Mart: every Pokémon Center's first clerk"
MART_NAMES = {
    0: ("Accumula Town: Pokémon Center, second clerk", "pokemon_center"),
    1: ("Striaton City: Pokémon Center, second clerk (TMs)", "pokemon_center"),
    2: ("Nacrene City: Pokémon Center, second clerk", "pokemon_center"),
    3: ("Castelia City: Pokémon Center, second clerk", "pokemon_center"),
    4: ("Nimbasa City: Pokémon Center, second clerk (TMs)", "pokemon_center"),
    5: ("Driftveil City: Pokémon Center, second clerk", "pokemon_center"),
    6: ("Mistralton City: Pokémon Center, second clerk (TMs)", "pokemon_center"),
    7: ("Icirrus City: Pokémon Center, second clerk", "pokemon_center"),
    8: ("Opelucid City: Pokémon Center, second clerk", "pokemon_center"),
    9: ("Victory Road: Pokémon Center, second clerk", "pokemon_center"),
    10: ("Pokémon League: Pokémon Center, second clerk", "pokemon_center"),
    11: ("Lacunosa Town: Pokémon Center, second clerk (TMs)", "pokemon_center"),
    12: ("Undella Town: Pokémon Center, second clerk", "pokemon_center"),
    13: ("Black City and White Forest: Pokémon Center, second clerk", "pokemon_center"),
    14: ("Shopping Mall Nine and Nacrene City's Café Warehouse: battle items", "shopping_mall_nine"),
    15: ("Driftveil City: the market's herb shop", "market"),
    16: ("Driftveil City: the market's incense shop", "market"),
    17: ("Shopping Mall Nine: medicine counter", "shopping_mall_nine"),
    18: ("Shopping Mall Nine: TM counter", "shopping_mall_nine"),
    19: ("Shopping Mall Nine: Poké Ball counter", "shopping_mall_nine"),
    20: ("Shopping Mall Nine: vitamin counter", "shopping_mall_nine"),
    21: ("Aspertia City: Pokémon Center, second clerk", "pokemon_center"),
    22: ("Virbank City: Pokémon Center, second clerk", "pokemon_center"),
    23: ("Humilau City: Pokémon Center, second clerk", "pokemon_center"),
    24: ("Floccesy Town: Pokémon Center, second clerk", "pokemon_center"),
    25: ("Lentimas Town: Pokémon Center, second clerk", "pokemon_center"),
}
BP_NAMES = {"BP_SHOP_ITEMS_NORMAL": (0xfe, "Battle Subway and PWT: BP exchange, items"),
            "BP_SHOP_ITEMS_TMS": (0xfd, "Battle Subway and PWT: BP exchange, TMs")}
TUTOR_NAMES = {"MOVE_TUTOR_ITEMS_DRIFTVEIL_CITY": (0xf6, "Driftveil City"),
               "MOVE_TUTOR_ITEMS_LENTIMAS_TOWN": (0xf5, "Lentimas Town"),
               "MOVE_TUTOR_ITEMS_HUMILAU_CITY": (0xf4, "Humilau City"),
               "MOVE_TUTOR_ITEMS_NACRENE_CITY": (0xf3, "Nacrene City: Café Warehouse")}


def dump(files: Path, output: Path):
    source = c_source()
    lists = read_narc((files / ITEMS).read_bytes())
    counts = read_narc((files / COUNTS).read_bytes())[0]
    names = item_names()

    def items(file: int) -> list[str]:
        data = lists[file]
        if len(data) != 2 * counts[file]:
            raise ValueError(f"list {file} has {len(data) // 2} items and its count says {counts[file]}")
        return [names[item] for item in struct.unpack(f"<{counts[file]}H", data)]

    tiers = badge_tiers(source)
    write(output / "poke_mart.json", {
        "$schema": "poke_mart.schema.json",
        "name": TIER_NAMES,
        "tiers": [{"badges": [b for b, t in enumerate(tiers) if t == tier], "items": items(tier)}
                  for tier in range(max(tiers) + 1)],
    })
    write(output / "marts.json", {
        "$schema": "marts.schema.json",
        "marts": [{"shop": shop, "name": name, "group": group, "items": items(shop + MART_FILE_BASE)}
                  for shop, (name, group) in MART_NAMES.items()],
    })
    write(output / "special_marts.json", {
        "$schema": "special_marts.schema.json",
        "special_marts": [{"shop": shop, "levels": [items(file + MART_FILE_BASE) for file in levels]}
                          for shop, levels in special_marts(source)],
    })
    write(output / "bp_shops.json", {
        "$schema": "bp_shops.schema.json",
        "shops": [{"shop": BP_NAMES[table][0], "name": BP_NAMES[table][1],
                   "items": [{"item": item, "price": price} for item, price in entries]}
                  for table, entries in c_bp_shops(source)],
    })
    write(output / "move_tutors.json", {
        "$schema": "move_tutors.schema.json",
        "tutors": [{"shop": TUTOR_NAMES[table][0], "name": TUTOR_NAMES[table][1], "shard": shard,
                    "moves": [{"move": move, "price": price, "menu_position": index} for move, price, index in entries]}
                   for (table, entries), shard in zip(c_move_tutors(source), tutor_shards(source))],
    })
    print(f"wrote the shops to {output}")


# Packing


def load_kind(root: Path, kind: str) -> dict:
    return load(root / f"{kind}.json", load_schema(root / f"{kind}.schema.json"))


def check_items(items: list, where: str, limit: int = LIST_MAX) -> list[int]:
    values = [value(item, f"{where}[{i}]") for i, item in enumerate(items)]
    for i, (item, number) in enumerate(zip(items, values)):
        if item_names().get(number) is None or number == 0:
            raise DataError(f"{where}[{i}]: {item!r} is not an item of items.txt")
    if len(values) > limit:
        raise DataError(f"{where}: {len(values)} items, and the shop's menu holds {limit}")
    return values


def mart_lists(root: Path) -> list[list[int] | None]:
    """Every list of a/2/8/2, by file; None for a file no shop names."""
    source = c_source()
    files: dict[int, tuple[str, list[int]]] = {}

    def put(file: int, where: str, items: list[int]):
        if file in files:
            raise DataError(f"{where}: its list is file {file}, which is also {files[file][0]}'s")
        files[file] = (where, items)

    mart = load_kind(root, "poke_mart")
    tiers = badge_tiers(source)
    where = label(root / "poke_mart.json")
    if len(mart["tiers"]) != max(tiers) + 1:
        raise DataError(f"{where}: {len(mart['tiers'])} tiers, and BADGE_SHOP_DAT_IDS (scrcmd_shop.c) has "
                        f"{max(tiers) + 1}")
    for tier, entry in enumerate(mart["tiers"]):
        badges = [b for b, t in enumerate(tiers) if t == tier]
        if entry["badges"] != badges:
            raise DataError(f"{where}: tiers[{tier}]: the badges are {badges} (BADGE_SHOP_DAT_IDS in scrcmd_shop.c)")
        put(tier, f"{where}: tiers[{tier}]", check_items(entry["items"], f"{where}: tiers[{tier}].items"))

    where = label(root / "marts.json")
    for i, entry in enumerate(load_kind(root, "marts")["marts"]):
        limit = LIST_MAX - 1 if entry["shop"] == VIRBANK_CITY else LIST_MAX
        put(entry["shop"] + MART_FILE_BASE, f"{where}: marts[{i}]",
            check_items(entry["items"], f"{where}: marts[{i}].items", limit))

    where = label(root / "special_marts.json")
    headers = dict(special_marts(source))
    levels = len(special_levels(source))
    for i, entry in enumerate(load_kind(root, "special_marts")["special_marts"]):
        if entry["shop"] not in headers:
            raise DataError(f"{where}: special_marts[{i}]: shop {entry['shop']} isn't in SPECIAL_POKE_MART_HEADERS")
        if len(entry["levels"]) != levels:
            raise DataError(f"{where}: special_marts[{i}]: {len(entry['levels'])} levels, not {levels}")
        for level, (file, items) in enumerate(zip(headers.pop(entry["shop"]), entry["levels"])):
            put(file + MART_FILE_BASE, f"{where}: special_marts[{i}].levels[{level}]",
                check_items(items, f"{where}: special_marts[{i}].levels[{level}]"))
    if headers:
        raise DataError(f"{where}: no lists for the special marts {sorted(headers)}")
    return [files[f][1] if f in files else None for f in range(max(files) + 1)]


def pack(root: Path, items_out: Path, counts_out: Path):
    lists = mart_lists(root)
    missing = [file for file, items in enumerate(lists) if items is None]
    if missing:
        raise DataError(f"{label(root)}: no shop has the lists {missing} of the archive")
    for path in (items_out, counts_out):
        path.parent.mkdir(parents=True, exist_ok=True)
    items_out.write_bytes(write_narc([struct.pack(f"<{len(items)}H", *items) for items in lists]))
    counts_out.write_bytes(write_narc([bytes(len(items) for items in lists)]))


# The tutors and the BP shops


def move_tutors(root: Path = SHOPS) -> list[dict]:
    """The tutors of move_tutors.json, checked: each tutor's moves, at most 32, with their menu places a permutation."""
    where = label(root / "move_tutors.json")
    tutors = load_kind(root, "move_tutors")["tutors"]
    shards = tutor_shards(c_source())
    if len(tutors) != len(shards):
        raise DataError(f"{where}: {len(tutors)} tutors, and scrcmd_shop.c has {len(shards)}")
    for i, (tutor, shard) in enumerate(zip(tutors, shards)):
        at = f"{where}: tutors[{i}]"
        if tutor["shard"] != shard:
            raise DataError(f"{at}: the tutor takes {shard} (MOVE_TUTOR_CURRENCY_ITEMS in scrcmd_shop.c)")
        moves = [m["move"] for m in tutor["moves"]]
        if len(moves) > TUTOR_MOVES_MAX:
            raise DataError(f"{at}: {len(moves)} moves, and a species' tutor word holds {TUTOR_MOVES_MAX}")
        if len(set(moves)) != len(moves):
            raise DataError(f"{at}: a move is in the list twice")
        places = sorted(m["menu_position"] for m in tutor["moves"])
        if places != list(range(len(moves))):
            raise DataError(f"{at}: the menu places must be 0 to {len(moves) - 1}, each once")
        for j, move in enumerate(moves):
            value(move, f"{at}.moves[{j}].move")
    return tutors


def tutor_moves(root: Path = SHOPS) -> list[list[str]]:
    """Each shards' tutor's moves by bit, in the order of the tutors' words in a species' personal data."""
    return [[m["move"] for m in tutor["moves"]] for tutor in move_tutors(root)]


def bp_shops(root: Path) -> list[dict]:
    where = label(root / "bp_shops.json")
    shops = load_kind(root, "bp_shops")["shops"]
    for i, shop in enumerate(shops):
        check_items([entry["item"] for entry in shop["items"]], f"{where}: shops[{i}].items")
    return shops


def header(root: Path, output: Path):
    """The hack's header: macros of the BP and tutor shops' initializers, which scrcmd_shop.c and
    paperwhite2_move_tutors.c write their tables with."""
    lines = [f"#ifndef {GUARD}", f"#define {GUARD}", "",
             f"// Generated by tools/data/shop_data.py from {label(root)}/: edit the JSON, not this file", ""]

    def define(name: str, entries: list[str]):
        lines.append(f"#define {name} \\")
        lines.extend(f"    {entry}, \\" for entry in entries[:-1])
        lines.append(f"    {entries[-1]}")

    shops = bp_shops(root)
    lines.append("// The BP exchange's lists, in the order of BP_SHOP_ITEMS, and their lengths")
    lines.append(f"#define PAPERWHITE2_BP_SHOP_COUNT {len(shops)}")
    lines.append("#define PAPERWHITE2_BP_SHOP_ITEM_COUNTS " + ", ".join(str(len(s["items"])) for s in shops))
    for i, shop in enumerate(shops):
        define(f"PAPERWHITE2_BP_SHOP_ITEMS_{i}", [f"{{ {e['item']}, {e['price']} }}" for e in shop["items"]])
    tutors = move_tutors(root)
    lines.append("")
    lines.append("// The shards' tutors' lists, in the order of their words in a species' personal data, and their")
    lines.append("// lengths")
    lines.append("#define PAPERWHITE2_MOVE_TUTOR_MOVE_COUNTS " + ", ".join(str(len(t["moves"])) for t in tutors))
    for i, tutor in enumerate(tutors):
        define(f"PAPERWHITE2_MOVE_TUTOR_MOVES_{i}",
               [f"{{ {m['move']}, {m['price']}, {m['menu_position']} }}" for m in tutor["moves"]])
    lines += ["", f"#endif // {GUARD}", ""]
    text = "\n".join(lines)
    if not output.is_file() or output.read_text() != text:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(text)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    dump_parser = commands.add_parser("dump", help="write res/field/shops/ from the extracted files and the C")
    dump_parser.add_argument("files", type=Path, help="the extracted files/ directory")
    dump_parser.add_argument("output", type=Path)
    pack_parser = commands.add_parser("pack", help="build the marts' archives from res/field/shops/")
    pack_parser.add_argument("root", type=Path)
    pack_parser.add_argument("items", type=Path)
    pack_parser.add_argument("counts", type=Path)
    header_parser = commands.add_parser("header", help="write the hack's header of the BP and tutor shops")
    header_parser.add_argument("root", type=Path)
    header_parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.command == "dump":
        dump(args.files, args.output)
        return
    try:
        if args.command == "pack":
            pack(args.root, args.items, args.counts)
        else:
            header(args.root, args.output)
    except DataError as error:
        sys.exit(f"error: {error}")


if __name__ == "__main__":
    main()
