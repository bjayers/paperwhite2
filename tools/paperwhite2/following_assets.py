"""Paper White 2: the Following Pokémon's interactions, emotes, effects, contextual dialogues and gifts, packed from
res/paperwhite2/following/.

field_actor_data.py calls members() when it packs the model table (a/0/4/7, ARCID_MMODEL_TBL) with followers, after
the table, the registry and the positioning table (members 0 to 2, following_data.py): the archive then has these
as members 3 to 22, which the follower runtime (src/paperwhite2/) reads. Each is one of the files of Pokeweb's
Following Pokémon runtime in the hack's ROM (following/), in the format its runtime read them, so the sources pack
them byte for byte (docs/paperwhite2/following-pokemon.md, Data). Every number is little-endian, and every text is
UCS-2 words ending in 0xFFFF, with 0xFFFE a new line, 0xFFF0 the Pokémon's nickname and 0xFFF1 the player's name
(and in the dialogues and gifts 0xFFF2 the zone, "Zone N", and in a gift's text 0xFFF3 its item's name), which the
JSON writes as text with "\\n", {nickname}, {player}, {location} and {item}:

- member 3, the interactions (following/interactions.bin), from interactions.json: "FWTK" ABI 1, a 48-byte header
  (the magic, the ABI, the member's size, the CRC-32 of the member from byte 16 on, the counts of the rules,
  motions, messages and bubbles, their tables' offsets, and the size and CRC-32 of following/emotes.narc, the NARC
  of members 6 to 19 that Pokeweb's importer wrote, which this computes from them), then the tables in that order:
  a rule, 12 bytes, has its HeartGold reaction, its HP, friendship, status and facing conditions, its chance in
  percent, its step count and its steps' offset; a motion, 84 bytes, its HeartGold motion, its step count, a zero
  byte and ten 8-byte steps, zeros past its own: the way the Pokémon turns (0 none, else 1 + DIR_*), the frames it
  takes, the x, y and z offsets in pixels, whether it cries and 2 zero bytes; a message, 8 bytes, its text's
  offset, its length in words with the end and its HeartGold message; a bubble, 16 bytes, its HeartGold emote, 4
  (its steps), its first emote member counted from member 6 (two a bubble), and its four steps' durations in frames
  and frames (0 or 1). Then each rule's steps, 8 bytes each: the motion, the message and the bubble that it shows,
  each 1 on and 0 for none, its cry (0 none, 1 the cry, 2 the cry slowed down) and its wait, then the messages'
  texts. The last rule matches always.
- member 4, the contextual dialogues (member 0 of following/contextual-dialogues.narc), from dialogues.json: "FWCD",
  a 16-byte header (the magic, the ABI, the rule count, the member's size, the CRC-32 of what follows the header),
  then the rules, 20 bytes each in ABI 1, or in ABI 2 when a rule has a motion, and 28 bytes in ABI 3 when a rule has
  tile bounds: the zone (0 any), the species (0 any), the form (255 any), the type (255 any), the HP, friendship,
  status and facing conditions, the chance, the motion before the text, the text's offset, its length in words with
  the end, the motion after it, and in ABI 3 the mask of the tile bounds it has (1 min x, 2 max x, 4 min y, 8 max y)
  and the four bounds, s16 each, 0 where it has none; then the texts.
- member 5, the contextual gifts (member 0 of following/contextual-items.narc), from items.json: "FWTI", the same
  header, then the rules, 28 bytes each in ABI 1, or 36 in ABI 2 when a rule has tile bounds: the zone, the species,
  the item, the gift's slot (0 to 9, each given once a Pokémon), the form, the type, the HP, friendship, status and
  facing conditions, the quantity, the item name's offset and length, the text's offset and length, the mask of the
  tile bounds (0 in ABI 1), and in ABI 2 the four bounds; then each rule's item name and text.
- members 6 to 19, the emotes (following/emotes.narc's members): for each bubble of interactions.json, in its order,
  its two frames, emotes/<bubble>_1.png and _2.png, each 32 by 32 and 16 colors with its JASC palette (.pal, color 0
  transparent), as a BTX0 of one texture (GX_TEXFMT_PLTT16) named <texture>.1 or .2 and its palette named <texture>,
  written as Pokeweb's importer wrote them (nitro_btx.texture_set's split_from).
- members 20 to 22, the effects (following/effects.narc's members): effects/ball.nsbmd, the Poké Ball's model (BMD0,
  monstarball), effects/send_out_flash.nsbmd, the send-out flash's model (BMD0, mb_out), and
  effects/send_out_flash.nsbta, its texture animation (BTA0), HeartGold's a/1/0/3 members 129, 104 and 164. They are
  Nitro G3D resources as HeartGold's build compiled them, packed as they are: no editor is needed, and tools such as
  NitroPaint open them.

The rules' conditions are written by name: hp, the HP left (HP_CONDITIONS), friendship (FRIENDSHIP_CONDITIONS),
status (STATUS_CONDITIONS), and facing, the way the Pokémon faces to look at the player (FACING_CONDITIONS); a rule
without one matches any.
"""
import struct
import sys
import zlib
from functools import cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.datajson import DataError, constants, label, load, load_schema  # noqa: E402
from tools.data.gen_constants import load as load_list  # noqa: E402
from tools.data.narc import write_narc  # noqa: E402
from tools.data.nitro_2d import color5, encode_characters, palette_indices, read_indexed_png, read_palette  # noqa: E402
from tools.data.nitro_btx import texture_set  # noqa: E402

SOURCE = Path(__file__).resolve().parents[2] / "res" / "paperwhite2" / "following"
FIRST_MEMBER = 3
INTERACTIONS_ABI = 1
HEADER = struct.Struct("<4I4H6I")
RULE = struct.Struct("<H6BI")
STEP = struct.Struct("<HHHBB")
MOTION = struct.Struct("<HBB")
MOTION_STEP = struct.Struct("<BBbbbBxx")
MOTION_STEPS = 10
MESSAGE = struct.Struct("<IHH")
BUBBLE = struct.Struct("<BBH4H4B")
BUBBLE_STEPS = 4
# The runtime's limits: an 8 KB buffer for the interactions, a 4 KB page for a contextual NARC
INTERACTIONS_MAX = 8192
EMOTES_MAX = 32768
CONTEXT_MAX = 4096
# A one-member NARC's bytes besides its member, as Pokeweb's files have them
NARC_OVERHEAD = 60
LIMITS = {"rules": 70, "motions": 64, "messages": 128, "bubbles": 14}
MESSAGE_WORDS = 128
CONTEXT_WORDS = 192
EMOTE_SIZE = 32
EMOTE_COLORS = 16
EMOTE_FRAMES = 2
# GX_TEXFMT_PLTT16
TEXTURE_FORMAT = 3
EFFECTS = ("ball.nsbmd", "send_out_flash.nsbmd", "send_out_flash.nsbta")
EFFECT_MAGICS = (b"BMD0", b"BMD0", b"BTA0")

HP_CONDITIONS = {"full": 1, "75_to_99_percent": 2, "50_to_74_percent": 3, "25_to_49_percent": 4,
                 "1_to_24_percent": 5}
FRIENDSHIP_CONDITIONS = {"255": 1, "200_to_254": 2, "150_to_199": 3, "90_to_149": 4, "60_to_89": 5, "30_to_59": 6,
                         "1_to_29": 7, "0": 8, "90_or_more": 9, "below_60": 10}
STATUS_CONDITIONS = {"healthy": 1, "burn": 2, "freeze": 3, "paralysis": 4, "poison": 5, "any_status": 7, "sleep": 8}
FACING_CONDITIONS = {"right": 1, "left": 2, "up": 3, "down": 4}
CRIES = {"none": 0, "cry": 1, "slow_cry": 2}
BOUNDS = ("min_x", "max_x", "min_y", "max_y")
TOKENS = {"{nickname}": 0xFFF0, "{player}": 0xFFF1, "{location}": 0xFFF2, "{item}": 0xFFF3}


def encode_text(text: str, tokens: tuple[str, ...], limit: int, where: str, newline: bool = True) -> list[int]:
    """Returns a text as the runtime's words, with its end."""
    words = []
    at = 0
    while at < len(text):
        token = next((token for token in tokens if text.startswith(token, at)), None)
        if token:
            words.append(TOKENS[token])
            at += len(token)
            continue
        character = text[at]
        code = ord(character)
        if character == "\n" and newline:
            words.append(0xFFFE)
        elif not 0 < code < 0xF000 or character == "\n":
            raise DataError(f"{where}: {character!r} can't be written in a follower's text")
        else:
            words.append(code)
        at += 1
    if not words or len(words) + 1 > limit:
        raise DataError(f"{where}: a text of 1 to {limit - 1} characters, not {len(words)}")
    return words + [0xFFFF]


def words_bytes(words: list[int]) -> bytes:
    return struct.pack(f"<{len(words)}H", *words)


def conditions(rule: dict) -> tuple[int, int, int, int]:
    """Returns a rule's HP, friendship, status and facing conditions, 0 for any."""
    return (HP_CONDITIONS.get(rule.get("hp"), 0), FRIENDSHIP_CONDITIONS.get(rule.get("friendship"), 0),
            STATUS_CONDITIONS.get(rule.get("status"), 0), FACING_CONDITIONS.get(rule.get("facing"), 0))


def emote_set(path: Path, texture: str, frame: int) -> bytes:
    """Returns the BTX0 of a bubble's frame (1 or 2) from its PNG and palette."""
    image = path.with_suffix(".png")
    palette = path.with_suffix(".pal")
    if not image.is_file() or not palette.is_file():
        raise DataError(f"{label(path)}: an emote frame needs its .png and .pal")
    colors = read_palette(palette)
    if len(colors) != EMOTE_COLORS:
        raise DataError(f"{label(palette)}: must have {EMOTE_COLORS} colors, not {len(colors)}")
    width, height, pixels, png_colors = read_indexed_png(image)
    if (width, height) != (EMOTE_SIZE, EMOTE_SIZE):
        raise DataError(f"{label(image)}: must be {EMOTE_SIZE} by {EMOTE_SIZE}, not {width} by {height}")
    pixels = palette_indices(image, pixels, png_colors, colors)
    names = [f"{texture}.{index + 1}" for index in range(EMOTE_FRAMES)]
    data = b"".join(struct.pack("<H", r | g << 5 | b << 10) for r, g, b in map(color5, colors))
    return texture_set([(names[frame - 1], EMOTE_SIZE, EMOTE_SIZE, TEXTURE_FORMAT, True,
                         encode_characters(EMOTE_SIZE, EMOTE_SIZE, pixels, linear=True))],
                       [(texture, data)], split_from=names)


def pokeweb_narc(files: list[bytes]) -> bytes:
    """Returns the NARC of files as Pokeweb's importer wrote it (with ndspy), whose header has its byte order mark
    and version as the bytes FF FE 01 00 where the game's have FE FF 00 01."""
    data = bytearray(write_narc(files))
    data[4:8] = b"\xff\xfe\x01\x00"
    return bytes(data)


def interactions(data: dict, emotes: list[bytes]) -> bytes:
    """Returns the interactions member (FWTK) of interactions.json and the emote members."""
    for key, limit in LIMITS.items():
        if not 1 <= len(data[key]) <= limit:
            raise DataError(f"interactions.json: 1 to {limit} {key}, not {len(data[key])}")
    counts = {key: len(data[key]) for key in LIMITS}
    rules_at = HEADER.size
    motions_at = rules_at + RULE.size * counts["rules"]
    messages_at = motions_at + (MOTION.size + MOTION_STEP.size * MOTION_STEPS) * counts["motions"]
    bubbles_at = messages_at + MESSAGE.size * counts["messages"]
    steps_at = bubbles_at + BUBBLE.size * counts["bubbles"]
    rules, steps = bytearray(), bytearray()
    for index, rule in enumerate(data["rules"]):
        where = f"interactions.json: rules[{index}]"
        for step in rule["steps"]:
            for key in ("motion", "message", "bubble"):
                if step[key] > counts[f"{key}s"]:
                    raise DataError(f"{where}: no {key} {step[key]}")
        rules += RULE.pack(rule["hgss_reaction"], *conditions(rule), rule["chance"], len(rule["steps"]),
                           steps_at + len(steps))
        steps += b"".join(STEP.pack(step["motion"], step["message"], CRIES[step["cry"]], step["bubble"], step["wait"])
                          for step in rule["steps"])
    if set(data["rules"][-1]) - {"hgss_reaction", "chance", "steps"} or data["rules"][-1]["chance"] != 100:
        raise DataError("interactions.json: the last rule must match always: no conditions and a chance of 100")
    motions = b"".join(
        MOTION.pack(motion["hgss_motion"], len(motion["steps"]), 0)
        + b"".join(MOTION_STEP.pack(0 if step["turn"] is None else 1 + constants()[step["turn"]], step["frames"],
                                    step["x"], step["y"], step["z"], int(step["cry"])) for step in motion["steps"])
        + bytes(MOTION_STEP.size * (MOTION_STEPS - len(motion["steps"]))) for motion in data["motions"])
    texts_at = steps_at + len(steps)
    messages, texts = bytearray(), bytearray()
    for index, message in enumerate(data["messages"]):
        words = encode_text(message["text"], ("{nickname}", "{player}"), MESSAGE_WORDS,
                            f"interactions.json: messages[{index}]")
        messages += MESSAGE.pack(texts_at + len(texts), len(words), message["hgss_message"])
        texts += words_bytes(words)
    bubbles = b"".join(BUBBLE.pack(bubble["hgss_emote"], BUBBLE_STEPS, EMOTE_FRAMES * index, *bubble["durations"],
                                   *bubble["frames"]) for index, bubble in enumerate(data["bubbles"]))
    emote_narc = pokeweb_narc(emotes)
    if len(emote_narc) > EMOTES_MAX:
        raise DataError(f"the emotes' NARC is {len(emote_narc)} bytes, more than the runtime's {EMOTES_MAX}")
    body = bytes(rules + motions + messages + bubbles + steps + texts)
    size = HEADER.size + len(body)
    if size > INTERACTIONS_MAX:
        raise DataError(f"interactions.json packs to {size} bytes, more than the runtime's {INTERACTIONS_MAX}")
    tail = HEADER.pack(0, 0, 0, 0, *counts.values(), rules_at, motions_at, messages_at, bubbles_at, len(emote_narc),
                       zlib.crc32(emote_narc))[16:] + body
    return struct.pack("<4sIII", b"FWTK", INTERACTIONS_ABI, size, zlib.crc32(tail)) + tail


@cache
def constant_list(name: str) -> dict[str, int]:
    return load_list(name)


def list_value(name: str, constant: str, where: str) -> int:
    """Returns the value of a constant of generated/<name>.txt."""
    if constant not in constant_list(name):
        raise DataError(f"{where}: {constant} is not a constant of generated/{name}.txt")
    return constant_list(name)[constant]


def selectors(rule: dict, where: str) -> tuple[int, int, int, int]:
    """Returns a contextual rule's zone, species, form and type, 0, 0, 255 and 255 for any."""
    zone = list_value("zones", rule["zone"], where) if "zone" in rule else 0
    species = list_value("species", rule["species"], where) if "species" in rule else 0
    if "zone" in rule and not zone:
        raise DataError(f"{where}: zone 0 ({rule['zone']}) stands for any zone, which a rule writes without a zone")
    if "species" in rule and not species:
        raise DataError(f"{where}: a species, not {rule['species']}")
    if "form" in rule and "species" not in rule:
        raise DataError(f"{where}: a form needs a species")
    return zone, species, rule.get("form", 255), list_value("types", rule["type"], where) if "type" in rule else 255


def tile_bounds(rule: dict, where: str) -> tuple[int, bytes]:
    """Returns a rule's tile bounds' mask and the four bounds."""
    bounds = rule.get("tile_bounds", {})
    for low, high in (("min_x", "max_x"), ("min_y", "max_y")):
        if low in bounds and high in bounds and bounds[low] > bounds[high]:
            raise DataError(f"{where}: {low} is more than {high}")
    mask = sum(1 << index for index, key in enumerate(BOUNDS) if key in bounds)
    return mask, struct.pack("<4h", *(bounds.get(key, 0) for key in BOUNDS))


def context_member(magic: bytes, abi: int, rows: list[bytes], texts: bytes, name: str) -> bytes:
    size = 16 + sum(map(len, rows)) + len(texts)
    if size + NARC_OVERHEAD > CONTEXT_MAX:
        raise DataError(f"{name} packs to {size} bytes, more than the {CONTEXT_MAX - NARC_OVERHEAD} that fit the "
                        f"runtime's {CONTEXT_MAX}-byte page as a NARC")
    tail = b"".join(rows) + texts
    return struct.pack("<4sHHII", magic, abi, len(rows), size, zlib.crc32(tail)) + tail


def dialogues(rules: list[dict]) -> bytes:
    """Returns the contextual dialogues member (FWCD) of dialogues.json's rules."""
    bounded = any(rule.get("tile_bounds") for rule in rules)
    abi = 3 if bounded else 2 if any("before_motion" in rule or "after_motion" in rule for rule in rules) else 1
    stride = 28 if bounded else 20
    rows, texts = [], bytearray()
    texts_at = 16 + stride * len(rules)
    for index, rule in enumerate(rules):
        where = f"dialogues.json: rules[{index}]"
        words = encode_text(rule["text"], ("{nickname}", "{player}", "{location}"), CONTEXT_WORDS, where)
        mask, bounds = tile_bounds(rule, where)
        row = struct.pack("<HHBB6BIHBB", *selectors(rule, where), *conditions(rule), rule.get("chance", 100),
                          rule.get("before_motion", 0), texts_at + len(texts), len(words), rule.get("after_motion", 0),
                          mask)
        rows.append(row + bounds if bounded else row)
        texts += words_bytes(words)
    return context_member(b"FWCD", abi, rows, bytes(texts), "dialogues.json")


def items(rules: list[dict]) -> bytes:
    """Returns the contextual gifts member (FWTI) of items.json's rules."""
    bounded = any(rule.get("tile_bounds") for rule in rules)
    stride = 36 if bounded else 28
    rows, texts = [], bytearray()
    texts_at = 16 + stride * len(rules)
    for index, rule in enumerate(rules):
        where = f"items.json: rules[{index}]"
        zone, species, form, kind = selectors(rule, where)
        item = list_value("items", rule["item"], where)
        if not item:
            raise DataError(f"{where}: an item, not {rule['item']}")
        name = encode_text(rule["item_name"], (), CONTEXT_WORDS, f"{where}.item_name", newline=False)
        text = encode_text(rule["text"], ("{nickname}", "{player}", "{location}", "{item}"), CONTEXT_WORDS, where)
        mask, bounds = tile_bounds(rule, where)
        name_at = texts_at + len(texts)
        row = struct.pack("<HHHBBB5BIHIHH", zone, species, item, rule["slot"], form, kind, *conditions(rule),
                          rule["quantity"], name_at, len(name), name_at + 2 * len(name), len(text), mask)
        rows.append(row + bounds if bounded else row)
        texts += words_bytes(name) + words_bytes(text)
    return context_member(b"FWTI", 2 if bounded else 1, rows, bytes(texts), "items.json")


def members(source: Path = SOURCE) -> list[bytes]:
    """Returns members 3 to 22 of the model table's archive: the interactions, the contextual dialogues and gifts,
    the emotes and the effects."""
    data = load(source / "interactions.json", load_schema(source / "interactions.schema.json"))
    emotes = [emote_set(source / "emotes" / f"{bubble['name']}_{frame}", bubble["texture"], frame)
              for bubble in data["bubbles"] for frame in range(1, EMOTE_FRAMES + 1)]
    effects = []
    for name, magic in zip(EFFECTS, EFFECT_MAGICS):
        path = source / "effects" / name
        if not path.is_file() or path.read_bytes()[:4] != magic:
            raise DataError(f"{label(path)}: must be a Nitro {magic.decode()} resource")
        effects.append(path.read_bytes())
    return [interactions(data, emotes),
            dialogues(load(source / "dialogues.json", load_schema(source / "dialogues.schema.json"))["rules"]),
            items(load(source / "items.json", load_schema(source / "items.schema.json"))["rules"]),
            *emotes, *effects]
