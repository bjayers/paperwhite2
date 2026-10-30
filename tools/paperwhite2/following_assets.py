"""Paper White 2: the Following Pokémon's interactions, emotes, effects, balls, contextual dialogues and gifts, packed
from res/paperwhite2/following/.

field_actor_data.py calls members() when it packs the model table (a/0/4/7, ARCID_MMODEL_TBL) with followers, after
the table, the registry and the positioning table (members 0 to 2, following_data.py): the archive then has these
as members 3 to 23, which the follower runtime (src/paperwhite2/) reads. Members 3 and 6 to 22 are each one of the files
of Pokeweb's Following Pokémon runtime in the hack's ROM (following/), in the format its runtime read them, so the
sources pack them byte for byte (docs/paperwhite2/following-pokemon.md, Data); member 23 is the balls' art, which
Pokeweb's runtime had in its code. Every number is little-endian, and every text is
UCS-2 words ending in 0xFFFF, with 0xFFFE a new line, 0xFFF0 the Pokémon's nickname and 0xFFF1 the player's name,
which the JSON writes as text with "\\n", {nickname} and {player}:

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
- members 4 and 5, the dialogue library and the item pools, from dialogue/ and pools.json: their packer is
  tools/paperwhite2/following_dialogue.py, whose docstring has their formats. They replace Pokeweb's contextual
  dialogues and one-time gifts (following/contextual-dialogues.narc, contextual-items.narc), which they no longer
  pack byte for byte.
- members 6 to 19, the emotes (following/emotes.narc's members): for each bubble of interactions.json, in its order,
  its two frames, emotes/<bubble>_1.png and _2.png, each 32 by 32 and 16 colors with its JASC palette (.pal, color 0
  transparent), as a BTX0 of one texture (GX_TEXFMT_PLTT16) named <texture>.1 or .2 and its palette named <texture>,
  written as Pokeweb's importer wrote them (nitro_btx.texture_set's split_from).
- members 20 to 22, the effects (following/effects.narc's members): effects/ball.nsbmd, the Poké Ball's model (BMD0,
  monstarball), effects/send_out_flash.nsbmd, the send-out flash's model (BMD0, mb_out), and
  effects/send_out_flash.nsbta, its texture animation (BTA0), HeartGold's a/1/0/3 members 129, 104 and 164. They are
  Nitro G3D resources as HeartGold's build compiled them, packed as they are: no editor is needed, and tools such as
  NitroPaint open them.
- member 23, the balls' art (Pokeweb's ball_assets.h, which its import_balls.py wrote from ball-art/), from
  balls/<ball>.png, each 16 by 16 with 16 colors at most, index 0 transparent and the art in rows 5 to 14: for each
  ball ID from 1 to 25 (BALLS, the order of pml_item.c's MONS_BALL_ITEMS), 160 bytes, its texture as linear 4bpp rows
  (128 bytes) then its palette, 16 BGR555 colors with color 0 black and each of the PNG's colors' channels' top five
  bits (what Pokeweb's importer wrote, not nitro_2d.color5's rounding), black past the PNG's palette. The runtime puts
  them over the ball's texture and palette, which it gives room for 16 colors.

The rules' conditions are written by name: hp, the HP left (HP_CONDITIONS), friendship (FRIENDSHIP_CONDITIONS),
status (STATUS_CONDITIONS), and facing, the way the Pokémon faces to look at the player (FACING_CONDITIONS); a rule
without one matches any.
"""
import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.datajson import DataError, constants, label, load, load_schema  # noqa: E402
from tools.data.narc import write_narc  # noqa: E402
from tools.data.nitro_2d import color5, encode_characters, palette_indices, read_indexed_png, read_palette  # noqa: E402
from tools.data.nitro_btx import texture_set  # noqa: E402
from tools.paperwhite2 import following_dialogue  # noqa: E402

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
# The runtime's limits: an 8 KB buffer for the interactions
INTERACTIONS_MAX = 8192
EMOTES_MAX = 32768
LIMITS = {"rules": 70, "motions": 64, "messages": 128, "bubbles": 14}
MESSAGE_WORDS = 128
EMOTE_SIZE = 32
EMOTE_COLORS = 16
EMOTE_FRAMES = 2
# GX_TEXFMT_PLTT16
TEXTURE_FORMAT = 3
EFFECTS = ("ball.nsbmd", "send_out_flash.nsbmd", "send_out_flash.nsbta")
EFFECT_MAGICS = (b"BMD0", b"BMD0", b"BTA0")
# pml_item.c MONS_BALL_ITEMS: ball ID n is BALLS[n - 1]
BALLS = ("master", "ultra", "great", "poke", "safari", "net", "dive", "nest", "repeat", "timer", "luxury", "premier",
         "dusk", "heal", "quick", "cherish", "fast", "level", "lure", "heavy", "love", "friend", "moon", "sport",
         "dream")
BALL_SIZE = 16
BALL_COLORS = 16
BALL_ROWS = range(5, 15)

HP_CONDITIONS = {"full": 1, "75_to_99_percent": 2, "50_to_74_percent": 3, "25_to_49_percent": 4,
                 "1_to_24_percent": 5}
FRIENDSHIP_CONDITIONS = {"255": 1, "200_to_254": 2, "150_to_199": 3, "90_to_149": 4, "60_to_89": 5, "30_to_59": 6,
                         "1_to_29": 7, "0": 8, "90_or_more": 9, "below_60": 10}
STATUS_CONDITIONS = {"healthy": 1, "burn": 2, "freeze": 3, "paralysis": 4, "poison": 5, "any_status": 7, "sleep": 8}
FACING_CONDITIONS = {"right": 1, "left": 2, "up": 3, "down": 4}
CRIES = {"none": 0, "cry": 1, "slow_cry": 2}
TOKENS = {"{nickname}": 0xFFF0, "{player}": 0xFFF1}


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


def balls(source: Path) -> bytes:
    """Returns the balls' member of balls/<ball>.png."""
    data = bytearray()
    for name in BALLS:
        path = source / "balls" / f"{name}.png"
        if not path.is_file():
            raise DataError(f"{label(path)}: a ball's art is a PNG")
        width, height, pixels, colors = read_indexed_png(path)
        if (width, height) != (BALL_SIZE, BALL_SIZE):
            raise DataError(f"{label(path)}: must be {BALL_SIZE} by {BALL_SIZE}, not {width} by {height}")
        if max(pixels) >= BALL_COLORS:
            raise DataError(f"{label(path)}: uses palette index {max(pixels)}, past {BALL_COLORS - 1}")
        if any(pixels[:BALL_ROWS.start * BALL_SIZE]) or any(pixels[BALL_ROWS.stop * BALL_SIZE:]):
            raise DataError(f"{label(path)}: the art must stay in rows {BALL_ROWS.start} to {BALL_ROWS.stop - 1}")
        colors = (list(colors) + [(0, 0, 0)] * BALL_COLORS)[:BALL_COLORS]
        data += encode_characters(BALL_SIZE, BALL_SIZE, pixels, linear=True)
        data += struct.pack(f"<{BALL_COLORS}H", 0, *(r >> 3 | (g >> 3) << 5 | (b >> 3) << 10 for r, g, b in colors[1:]))
    return bytes(data)


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


def members(source: Path = SOURCE) -> list[bytes]:
    """Returns members 3 to 23 of the model table's archive: the interactions, the dialogue library and the pools,
    the emotes, the effects and the balls."""
    data = load(source / "interactions.json", load_schema(source / "interactions.schema.json"))
    emotes = [emote_set(source / "emotes" / f"{bubble['name']}_{frame}", bubble["texture"], frame)
              for bubble in data["bubbles"] for frame in range(1, EMOTE_FRAMES + 1)]
    effects = []
    for name, magic in zip(EFFECTS, EFFECT_MAGICS):
        path = source / "effects" / name
        if not path.is_file() or path.read_bytes()[:4] != magic:
            raise DataError(f"{label(path)}: must be a Nitro {magic.decode()} resource")
        effects.append(path.read_bytes())
    return [interactions(data, emotes), *following_dialogue.members(source), *emotes, *effects, balls(source)]
