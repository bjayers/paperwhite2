#!/usr/bin/env python3
"""The Join Avenue's tables in res/field/join_avenue/, one JSON file per member of their archive (a/2/4/4,
ARCID_RESORT_BINARY): dump writes them from the ROM once, and pack builds the archive from them, which the build does.

    join_avenue_data.py dump extract/w2_us/files res/field/join_avenue
    join_avenue_data.py pack res/field/join_avenue ARCHIVE

Each member is a table of rows of u16 columns with no header, which ResortBinary_Load (src/system/resort_binary.c) reads
with the column count its caller gives; the counts are the callers'. A file is <member>_<name>.json with the table's
rows, each an object of its columns in order: a column is named where the code that reads it shows what it is, and
col_<n> where it doesn't. Object codes are OBJ_CODE_ constants, and the people's names, greetings, messages and own
lines are message IDs of the avenue's text bank (res/text/script/global_10685.txt, SCRIPT_TEXT_GLOBAL_10685), as which
ResortEntry_Fill and ResortSys_GetTrainerTypeText read them; 0xffff is none. docs/paperwhite2/design/join-avenue.md
says what is known of each.
"""
import argparse
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.datajson import DataError, label, load, load_schema, name, value, write  # noqa: E402
from tools.data.narc import read_narc, write_narc  # noqa: E402
from tools.text.text_data import split_message  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = "a/2/4/4"
TEXT = ROOT / "res" / "text" / "script" / "global_10685.txt"
NONE = 0xFFFF
SCHEMA = "join_avenue_table.schema.json"


def columns(*named: str, count: int) -> list[str]:
    """Named columns first, the rest col_<n>."""
    return list(named) + [f"col_{n}" for n in range(len(named), count)]


# The members: their name, their columns (the count ResortBinary_Load is given), and which columns are object codes and
# which messages
TABLES = [
    ("people_scripts", columns(count=4), (), ()),
    ("shops", columns("kind", "variant", "level", "experience", "name_message", "tier", "col_6", "col_7",
                      *(f"goods_{n}" for n in range(16)), "col_24", count=25), (), ()),
    ("goods", columns("needs_unlock", "has_name", "name_message", "description_message", "price", "kind", "id",
                      "count", "col_8", "col_9", count=10), (), ()),
    ("lots", columns("x", "z", count=4), (), ()),
    ("person_types", columns(count=42), (), ()),
    ("npcs", columns("model", "zone", "x", "z", "min_rank", "move_code", "area_width", "area_height", "script",
                     "text_row",
                     count=11), ("model",), ()),
    ("npc_texts", columns(count=20), (), ()),
    ("ranks", columns("rank_first", "rank_last", "col_2", "col_3", "col_4", "col_5", "col_6", "col_7", "col_8",
                      "unlock", "special_visitor_chance", count=13), (), ()),
    ("table_8", columns(count=22), (), ()),
    ("people", columns("type", "name", "model", "gender", "trainer_id", "wanted_shop", "person_type", "greeting",
                       "message_1", "message_2", "col_10", *(f"line_{n}" for n in range(1, 13)), count=23),
     ("model",), ("name", "greeting", "message_1", "message_2", *(f"line_{n}" for n in range(1, 13)))),
    ("table_10", columns(count=7), (), ()),
    ("table_11", columns(count=7), (), ()),
    ("raffle_weights", columns(count=8), (), ()),
]


def file_name(member: int) -> str:
    return f"{member:02d}_{TABLES[member][0]}.json"


def message_labels() -> list[str]:
    """The text bank's message IDs, by message number."""
    labels = []
    for line in TEXT.read_text().split("\n")[:-1]:
        message_id, _ = split_message(line)
        if message_id is not None:
            labels.append(message_id)
    return labels


def table_json(member: int, data: bytes, labels: list[str]) -> dict:
    table, cols, models, messages = TABLES[member]
    width = len(cols)
    if len(data) % (width * 2):
        raise ValueError(f"member {member} is {len(data)} bytes, not rows of {width} columns")
    values = struct.unpack(f"<{len(data) // 2}H", data)
    rows = []
    for start in range(0, len(values), width):
        row = {}
        for column, number in zip(cols, values[start:start + width]):
            if column in models:
                row[column] = name("OBJ_CODE_", number)
            elif column in messages:
                row[column] = None if number == NONE else labels[number] if number < len(labels) else number
            else:
                row[column] = number
        rows.append(row)
    return {"$schema": SCHEMA, "table": table, "rows": rows}


def table_bytes(member: int, data: dict, labels: dict[str, int], where: str) -> bytes:
    table, cols, models, messages = TABLES[member]
    if data["table"] != table:
        raise DataError(f"{where}: is table {data['table']!r}, not {table!r}")
    values = []
    for index, row in enumerate(data["rows"]):
        if list(row) != cols:
            raise DataError(f"{where}: row {index} doesn't have the table's columns in order")
        for column in cols:
            item = row[column]
            if column in messages:
                if item is None:
                    item = NONE
                elif isinstance(item, str):
                    if item not in labels:
                        raise DataError(f"{where}: row {index}: {item!r} is no message of {label(TEXT)}")
                    item = labels[item]
            elif column in models:
                item = value(item, where)
            if not isinstance(item, int) or not 0 <= item <= 0xFFFF:
                raise DataError(f"{where}: row {index}: {column} {item!r} isn't a u16")
            values.append(item)
    return struct.pack(f"<{len(values)}H", *values)


def dump(files: Path, output: Path):
    members = read_narc((files / ARCHIVE).read_bytes())
    if len(members) != len(TABLES):
        sys.exit(f"{len(members)} members in {ARCHIVE}, not {len(TABLES)}")
    labels = message_labels()
    for member, data in enumerate(members):
        write(output / file_name(member), table_json(member, data, labels))
    print(f"wrote {len(members)} tables to {output}")


def pack(root: Path, output: Path):
    schema = load_schema(root / SCHEMA)
    labels = {message_id: number for number, message_id in enumerate(message_labels())}
    members = []
    for member in range(len(TABLES)):
        path = root / file_name(member)
        members.append(table_bytes(member, load(path, schema), labels, label(path)))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(write_narc(members))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    dump_parser = commands.add_parser("dump", help="write res/field/join_avenue/ from the extracted files")
    dump_parser.add_argument("files", type=Path, help="the extracted files/ directory")
    dump_parser.add_argument("output", type=Path)
    pack_parser = commands.add_parser("pack", help="build the Join Avenue's archive from res/field/join_avenue/")
    pack_parser.add_argument("root", type=Path)
    pack_parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.command == "dump":
        dump(args.files, args.output)
        return
    try:
        pack(args.root, args.output)
    except DataError as error:
        sys.exit(f"error: {error}")


if __name__ == "__main__":
    main()
