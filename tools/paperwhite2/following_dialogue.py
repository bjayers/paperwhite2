#!/usr/bin/env python3
"""Paper White 2: the Following Pokémon's dialogue library and item pools, packed from res/paperwhite2/following/
as members 4 and 5 of the model table's archive (a/0/4/7), which src/paperwhite2/ov036/paperwhite2_following_dialogue.c
reads (docs/paperwhite2/following-pokemon.md, "Dialogue rules, gifts and steps").

    following_dialogue.py dump [SOURCE]     # the blocks, their rules and the pools, decoded from the sources

following_assets.py calls members(). The sources, each checked against its schema:

- dialogue/shared.json (dialogue.schema.json): the rules of every species, the library's messages (bag_full, said in
  place of a gift's text when the Bag has no room) and its settings (talk_friendship, the friendship a talk gives once a
  day);
- dialogue/species/<name>.json (the same schema, with "species"): one species' own rules;
- pools.json (pools.schema.json): the named, weighted item lists that gifts and pickups roll from.

Each of the three rule lists (rules, the talk's; ambient; pickup) is a list of the conditions module's rules (when,
priority, weight; res/paperwhite2/conditions/condition.schema.json), compiled by tools/paperwhite2/conditions.py, plus
the consumer's own fields:

- a talk rule has 1 to 16 steps, each with any of a message, its box (default, bubble, yell, event), an emote (a
  bubble's name of interactions.json), a motion (one of interactions.json's, from 1), a cry (none, cry, slow_cry), a
  wait in frames after it and an action: {"give_item": ITEM, "quantity": n}, {"give_pool": name}, {"give_waiting":
  true}, {"friendship": n}, {"script": id} (started after the step, the talk handing the field over to it) or
  {"reset_steps": true};
- an ambient rule has an emote, a cry and a cooldown, the steps before the next ambient emote may show;
- a pickup rule names its pool. Its chance is its when's chance.

A message is text with the codes of Frost's text editor: [N] a new line, [L] the next line after the player presses A
(the game's {be01} and a new line), [C] a new page after it (the game's {be00} and a new line), and {nickname},
{player}, {location} (the zone's place name) and {item} (the gift's), which the talk puts in with the game's word set.
A message may run over many pages.

The library ("FWDL", version 1), every number little-endian:

- a 32-byte header: the magic, the version (u16), the species count of the index (u16), the member's size, the block
  table's offset, the block count (u16), the talk's friendship (u8), a zero byte, the texts' offset, and the full Bag's
  message: its offset in the texts and its words (u16), then two zero bytes;
- the index, a u16 block number for each species from 0 (block 0, the shared rules alone, for a species without rules
  of its own), padded to 4 bytes;
- the block table, a u32 offset and size of each block;
- the blocks, each from a multiple of 4 and at most 4096 bytes, the runtime's buffer: 8 bytes, the offsets of its
  talk, ambient and pickup tables from its start (u16 each, 0 for none) and its size (u16), then the tables, each a
  ConditionTable (include/paperwhite2/conditions.h) whose rules' payloads are their consumer's: a talk rule's step
  count (u8) and three zero bytes, its 16-byte steps (the text's offset in the texts and its words with the end, u32
  and u16, then the box, the emote, the motion, the cry, the action and its amount as u8s, the amount signed, then
  the action's argument and the wait, u16 each), then its name; an ambient rule's emote and cry (u8 each) and cooldown
  (u16), then its name; a pickup rule's pool (u16) and two zero bytes, then its name. A name is ASCII and a 0;
- the texts: UCS-2 words ending in 0xFFFF, with 0xFFFE a new line, the game's control codes as 0xF000, the code, its
  argument count and its arguments, and a word set's word as 0xF000 0x0100 1 and its number (0 nickname, 1 player, 2
  place, 3 item). Identical texts are written once.

A species' block is the shared rules, those of the shared file that name the species in their when's species and those
without one, then the species' own. The pools ("FWPL", version 1): a 12-byte header (the magic, the version and the
pool count, u16 each, and the member's size), a u16 offset of each pool padded to 4 bytes, and each pool, from a
multiple of 4: its entry count and a zero u16, then 8 bytes an entry, the item and its weight (u16 each), how many
(u8) and three zero bytes.
"""
import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.datajson import DataError, label, load_schema, validate, value  # noqa: E402
from tools.paperwhite2 import conditions  # noqa: E402

SOURCE = Path(__file__).resolve().parents[2] / "res" / "paperwhite2" / "following"
DIALOGUE_MAGIC = b"FWDL"
POOLS_MAGIC = b"FWPL"
VERSION = 1
HEADER = struct.Struct("<4sHHIIHBxIIHxx")
BLOCK = struct.Struct("<4H")
BLOCK_ENTRY = struct.Struct("<II")
STEP = struct.Struct("<IHBBBBBbHH")
POOL_HEADER = struct.Struct("<4sHHI")
POOL_ENTRY = struct.Struct("<HHB3x")
# The runtime's buffer of a block
BLOCK_CAPACITY = 4096
TABLES = ("rules", "ambient", "pickup")
BOXES = ["default", "bubble", "yell", "event"]
CRIES = {"none": 0, "cry": 1, "slow_cry": 2}
ACTIONS = {"give_item": 1, "give_pool": 2, "give_waiting": 3, "friendship": 4, "script": 5, "reset_steps": 6}
NEWLINE = 0xFFFE
END = 0xFFFF
CONTROL = 0xF000
WORD = 0x0100
SCROLL = 0xBE01
CLEAR = 0xBE00
CODES = {"[N]": [NEWLINE], "[L]": [CONTROL, SCROLL, 0, NEWLINE], "[C]": [CONTROL, CLEAR, 0, NEWLINE]}
WORDS = {"{nickname}": 0, "{player}": 1, "{location}": 2, "{item}": 3}
TEXT_WORDS_MAX = 1024
NAME_LENGTH = 20


def load_source(path: Path, schema_path: Path) -> dict:
    """Reads a source and checks it against its schema, whose references to the conditions' schema are resolved
    there."""
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise DataError(f"{label(path)}: {error}") from None
    schema = load_schema(schema_path)
    root = {**schema, "$defs": {**conditions.schema()["$defs"], **schema.get("$defs", {})}}

    def local(node):
        if isinstance(node, dict):
            return {key: (item.split("#", 1)[1] and "#" + item.split("#", 1)[1]) if key == "$ref" else local(item)
                    for key, item in node.items()}
        if isinstance(node, list):
            return [local(item) for item in node]
        return node

    root = local(root)
    try:
        validate(data, root, "", root)
    except DataError as error:
        raise DataError(f"{label(path)}: {error}") from None
    return data


def encode_text(text: str, where: str) -> list[int]:
    """A message's words, with its end."""
    words = []
    at = 0
    while at < len(text):
        token = next((key for key in (*CODES, *WORDS) if text.startswith(key, at)), None)
        if token in CODES:
            words += CODES[token]
            at += len(token)
            continue
        if token in WORDS:
            words += [CONTROL, WORD, 1, WORDS[token]]
            at += len(token)
            continue
        character = text[at]
        if character == "\n":
            words.append(NEWLINE)
        elif not 0x20 <= ord(character) < CONTROL:
            raise DataError(f"{where}: {character!r} can't be written in a follower's message")
        else:
            words.append(ord(character))
        at += 1
    if not words or len(words) + 1 > TEXT_WORDS_MAX:
        raise DataError(f"{where}: a message of 1 to {TEXT_WORDS_MAX - 1} words, not {len(words)}")
    return words + [END]


class Texts:
    """The texts section, each text once."""

    def __init__(self):
        self.data = bytearray()
        self.offsets: dict[tuple[int, ...], int] = {}

    def add(self, words: list[int]) -> tuple[int, int]:
        key = tuple(words)
        if key not in self.offsets:
            self.offsets[key] = len(self.data)
            self.data += struct.pack(f"<{len(words)}H", *words)
        return self.offsets[key], len(words)


def name_bytes(rule: dict, fallback: str, where: str) -> bytes:
    name = rule.get("name", fallback)[:NAME_LENGTH]
    if not all(" " <= c <= "~" for c in name):
        raise DataError(f"{where}: a rule's name is ASCII, not {name!r}")
    return name.encode("ascii") + b"\0"


class Library:
    """What the rules name: interactions.json's bubbles and motions, and pools.json's pools."""

    def __init__(self, source: Path):
        interactions = json.loads((source / "interactions.json").read_text())
        self.emotes = {bubble["name"]: index + 1 for index, bubble in enumerate(interactions["bubbles"])}
        self.motions = len(interactions["motions"])
        self.pools = [pool["name"] for pool in load_source(source / "pools.json", source / "pools.schema.json")["pools"]]
        self.texts = Texts()

    def emote(self, name: str | None, where: str) -> int:
        if name is None:
            return 0
        if name not in self.emotes:
            raise DataError(f"{where}: no emote {name!r}; interactions.json has {list(self.emotes)}")
        return self.emotes[name]

    def pool(self, name: str, where: str) -> int:
        if name not in self.pools:
            raise DataError(f"{where}: no pool {name!r}; pools.json has {self.pools}")
        return self.pools.index(name)

    def step(self, step: dict, where: str) -> bytes:
        text, words = self.texts.add(encode_text(step["message"], where)) if "message" in step else (0, 0)
        motion = step.get("motion", 0)
        if motion > self.motions:
            raise DataError(f"{where}: no motion {motion}; interactions.json has {self.motions}")
        action, amount, arg = 0, 0, 0
        if "action" in step:
            kind, = (key for key in step["action"] if key != "quantity")
            action = ACTIONS[kind]
            given = step["action"][kind]
            if kind == "give_item":
                arg, amount = value(given, f"{where}.action"), step["action"].get("quantity", 1)
                if not arg:
                    raise DataError(f"{where}.action: an item, not {given}")
            elif kind == "give_pool":
                arg = self.pool(given, f"{where}.action")
            elif kind == "friendship":
                amount = given
            elif kind == "script":
                arg = given
        return STEP.pack(text, words, BOXES.index(step.get("box", "default")), self.emote(step.get("emote"), where),
                         motion, CRIES[step.get("cry", "none")], action, amount, arg, step.get("wait", 0))

    def payload(self, table: str, rule: dict, fallback: str, where: str) -> bytes:
        name = name_bytes(rule, fallback, where)
        if table == "rules":
            return (struct.pack("<B3x", len(rule["steps"]))
                    + b"".join(self.step(step, f"{where}.steps[{index}]") for index, step in enumerate(rule["steps"]))
                    + name)
        if table == "ambient":
            return struct.pack("<BBH", self.emote(rule["emote"], where), CRIES[rule.get("cry", "none")],
                               rule.get("cooldown", 0)) + name
        return struct.pack("<H2x", self.pool(rule["pool"], where)) + name


def species_of(rule: dict, where: str) -> set[int]:
    """The species a rule's when names, or none."""
    return {value(item if isinstance(item, str) else item["species"], where)
            for item in rule.get("when", {}).get("species", [])}


def block(library: Library, rules: dict[str, list[tuple[dict, str]]], name: str) -> bytes:
    """A block of the talk, ambient and pickup rules, each (rule, where)."""
    tables = []
    for table in TABLES:
        if not rules[table]:
            tables.append(b"")
            continue
        compiler = conditions.Compiler()
        compiled = []
        for index, (rule, where) in enumerate(rules[table]):
            compiled.append((compiler.compile(rule.get("when", {}), where), rule.get("priority", 0),
                             rule.get("weight", 1), library.payload(table, rule, f"{name}{index}", where)))
        try:
            tables.append(conditions.pack_table(compiled, compiler.lists))
        except DataError as error:
            raise DataError(f"{name}: {table}: {error}") from None
    data = bytearray(BLOCK.size)
    offsets = []
    for table in tables:
        offsets.append(len(data) if table else 0)
        data += conditions.align(table)
    BLOCK.pack_into(data, 0, *offsets, len(data))
    if len(data) > BLOCK_CAPACITY:
        raise DataError(f"{name}: its block is {len(data)} bytes, more than the runtime's {BLOCK_CAPACITY}")
    return bytes(data)


def sources(source: Path) -> tuple[dict, list[tuple[int, dict, Path]]]:
    schema = source / "dialogue.schema.json"
    shared = load_source(source / "dialogue" / "shared.json", schema)
    if "species" in shared or "messages" not in shared:
        raise DataError(f"{label(source / 'dialogue' / 'shared.json')}: the shared rules have messages and no species")
    species = []
    for path in sorted((source / "dialogue" / "species").glob("*.json")):
        data = load_source(path, schema)
        if "species" not in data or "messages" in data or "settings" in data:
            raise DataError(f"{label(path)}: a species' file has its species, and no messages or settings")
        species.append((value(data["species"], label(path)), data, path))
    numbers = [number for number, _, _ in species]
    if len(set(numbers)) != len(numbers):
        raise DataError("dialogue/species/: two files of one species")
    return shared, species


def dialogue_member(source: Path, library: Library) -> bytes:
    shared, species = sources(source)
    shared_path = label(source / "dialogue" / "shared.json")
    general = {table: [] for table in TABLES}
    named: dict[int, dict[str, list]] = {}
    for table in TABLES:
        for index, rule in enumerate(shared.get(table, [])):
            where = f"{shared_path}: {table}[{index}]"
            listed = species_of(rule, where)
            if not listed:
                general[table].append((rule, where))
            for number in listed:
                named.setdefault(number, {key: [] for key in TABLES})[table].append((rule, where))
    own = {number: data for number, data, _ in species}
    paths = {number: path for number, _, path in species}
    blocks = [block(library, general, "shared")]
    index: dict[int, int] = {}
    for number in sorted(set(own) | set(named)):
        rules = {}
        for table in TABLES:
            rules[table] = [*general[table], *named.get(number, {}).get(table, [])]
            if number in own:
                where = label(paths[number])
                rules[table] += [(rule, f"{where}: {table}[{i}]") for i, rule in enumerate(own[number].get(table, []))]
        index[number] = len(blocks)
        blocks.append(block(library, rules, f"species {number}"))
    bag_full, bag_full_words = library.texts.add(encode_text(shared["messages"]["bag_full"],
                                                             f"{shared_path}: messages.bag_full"))
    species_count = max(index, default=-1) + 1
    index_bytes = conditions.align(struct.pack(f"<{species_count}H", *(index.get(n, 0) for n in range(species_count))))
    table_at = HEADER.size + len(index_bytes)
    at = table_at + BLOCK_ENTRY.size * len(blocks)
    entries, body = bytearray(), bytearray()
    for data in blocks:
        entries += BLOCK_ENTRY.pack(at + len(body), len(data))
        body += conditions.align(data)
    texts_at = at + len(body)
    size = texts_at + len(library.texts.data)
    header = HEADER.pack(DIALOGUE_MAGIC, VERSION, species_count, size, table_at, len(blocks),
                         shared.get("settings", {}).get("talk_friendship", 1), texts_at, bag_full, bag_full_words)
    return header + index_bytes + bytes(entries) + bytes(body) + bytes(library.texts.data)


def pools_member(source: Path) -> bytes:
    path = source / "pools.json"
    pools = load_source(path, source / "pools.schema.json")["pools"]
    names = [pool["name"] for pool in pools]
    if len(set(names)) != len(names):
        raise DataError(f"{label(path)}: two pools of one name")
    head = conditions.align(b"\0" * (POOL_HEADER.size + 2 * len(pools)))
    offsets, body = [], bytearray()
    for index, pool in enumerate(pools):
        offsets.append(len(head) + len(body))
        body += struct.pack("<H2x", len(pool["items"]))
        for entry in pool["items"]:
            item = value(entry["item"], f"{label(path)}: pools[{index}]")
            if not item:
                raise DataError(f"{label(path)}: pools[{index}]: an item, not {entry['item']}")
            body += POOL_ENTRY.pack(item, entry.get("weight", 1), entry.get("quantity", 1))
    size = len(head) + len(body)
    header = POOL_HEADER.pack(POOLS_MAGIC, VERSION, len(pools), size) + struct.pack(f"<{len(pools)}H", *offsets)
    return conditions.align(header) + bytes(body)


def members(source: Path = SOURCE) -> list[bytes]:
    """Members 4 and 5 of the model table's archive: the dialogue library and the pools."""
    library = Library(source)
    return [dialogue_member(source, library), pools_member(source)]


def dump(source: Path):
    dialogue, pools = members(source)
    magic, version, species_count, size, table_at, block_count, friendship, texts_at, _, _ = \
        HEADER.unpack_from(dialogue)
    index = struct.unpack_from(f"<{species_count}H", dialogue, HEADER.size)
    print(f"library: {size} bytes, {block_count} blocks, texts {size - texts_at} bytes, talk friendship {friendship}")
    print(f"  species with blocks: {[n for n in range(species_count) if index[n]]}")
    for number in range(block_count):
        offset, length = BLOCK_ENTRY.unpack_from(dialogue, table_at + BLOCK_ENTRY.size * number)
        tables = BLOCK.unpack_from(dialogue, offset)[:3]
        counts = []
        for table, at in zip(TABLES, tables):
            if at:
                table_size = conditions.TABLE.unpack_from(dialogue, offset + at)[5]
                rules = conditions.unpack_table(dialogue[offset + at:offset + at + table_size])["rules"]
                counts.append(f"{table} {len(rules)}")
        print(f"  block {number}: {length} bytes, {', '.join(counts)}")
    print(f"pools: {len(pools)} bytes")


if __name__ == "__main__":
    try:
        dump(Path(sys.argv[2]) if len(sys.argv) > 2 else SOURCE)
    except DataError as error:
        sys.exit(f"error: {error}")
