#!/usr/bin/env python3
"""Write the Following Pokémon's interactions, emotes, effects, contextual dialogues and gifts of a Paper White 2 ROM
into res/paperwhite2/following/, which following_assets.py packs as members 3 to 22 of a/0/4/7.

    import_following_assets.py HACK_FILES [SOURCE]

    import_following_assets.py extract/pw2_v021/files res/paperwhite2/following

It reads following/interactions.bin, emotes.narc, effects.narc, contextual-dialogues.narc and contextual-items.narc
(following_assets.py has their formats) and writes interactions.json, dialogues.json, items.json, each bubble's
frames as emotes/<name>_1.png and _2.png with their palettes, and effects/. The bubbles are named after what they
show (BUBBLE_NAMES, by HeartGold's emote). It then packs the sources again and checks that each member is the hack's
file, or its NARC's member, byte for byte.
"""
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "tools" / "data")]
from tools.data.datajson import write  # noqa: E402
from tools.data.narc import read_narc  # noqa: E402
from tools.data.nitro_2d import write_indexed_png, write_palette  # noqa: E402
from tools.paperwhite2 import following_assets as assets  # noqa: E402

# HeartGold's emotes by number: fuki_heart, fuki_kao1, fuki_kao3, fuki_kao5, fuki_onpu, fuki_doku, fuki_chinmoku
BUBBLE_NAMES = {1: "heart", 2: "happy", 4: "sad", 6: "angry", 7: "note", 12: "poison", 13: "ellipsis"}
DIRECTIONS = {0: "DIR_UP", 1: "DIR_DOWN", 2: "DIR_LEFT", 3: "DIR_RIGHT"}
TOKENS = {word: token for token, word in assets.TOKENS.items()}


def text(data: bytes, offset: int, count: int) -> str:
    words = struct.unpack_from(f"<{count}H", data, offset)
    if words[-1] != 0xFFFF:
        raise SystemExit("a text without its end")
    return "".join("\n" if word == 0xFFFE else TOKENS.get(word, chr(word)) for word in words[:-1])


def condition_fields(hp: int, friendship: int, status: int, facing: int) -> dict:
    fields = {}
    for key, table, value in (("hp", assets.HP_CONDITIONS, hp),
                              ("friendship", assets.FRIENDSHIP_CONDITIONS, friendship),
                              ("status", assets.STATUS_CONDITIONS, status),
                              ("facing", assets.FACING_CONDITIONS, facing)):
        if value:
            fields[key] = next(name for name, number in table.items() if number == value)
    return fields


def interactions(data: bytes) -> dict:
    magic, abi, size, _, *counts_and_offsets = assets.HEADER.unpack_from(data)
    rule_count, motion_count, message_count, bubble_count, rules_at, motions_at, messages_at, bubbles_at = \
        counts_and_offsets[:8]
    if (magic, abi, size) != (0x4B545746, assets.INTERACTIONS_ABI, len(data)):
        raise SystemExit("interactions.bin is no FWTK of ABI 1")
    rules = []
    for index in range(rule_count):
        reaction, hp, friendship, status, facing, chance, count, steps_at = assets.RULE.unpack_from(
            data, rules_at + assets.RULE.size * index)
        steps = [dict(zip(("motion", "message", "cry", "bubble", "wait"), assets.STEP.unpack_from(
            data, steps_at + assets.STEP.size * step))) for step in range(count)]
        for step in steps:
            step["cry"] = next(name for name, number in assets.CRIES.items() if number == step["cry"])
        rules.append({"hgss_reaction": reaction, **condition_fields(hp, friendship, status, facing), "chance": chance,
                      "steps": steps})
    motions = []
    stride = assets.MOTION.size + assets.MOTION_STEP.size * assets.MOTION_STEPS
    for index in range(motion_count):
        at = motions_at + stride * index
        motion, count, _ = assets.MOTION.unpack_from(data, at)
        steps = []
        for step in range(count):
            turn, frames, x, y, z, cry = assets.MOTION_STEP.unpack_from(data, at + assets.MOTION.size + 8 * step)
            steps.append({"turn": DIRECTIONS[turn - 1] if turn else None, "frames": frames, "x": x, "y": y, "z": z,
                          "cry": bool(cry)})
        motions.append({"hgss_motion": motion, "steps": steps})
    messages = []
    for index in range(message_count):
        offset, count, message = assets.MESSAGE.unpack_from(data, messages_at + assets.MESSAGE.size * index)
        messages.append({"hgss_message": message, "text": text(data, offset, count)})
    bubbles = []
    for index in range(bubble_count):
        emote, steps, first, *timing = assets.BUBBLE.unpack_from(data, bubbles_at + assets.BUBBLE.size * index)
        if steps != assets.BUBBLE_STEPS or first != assets.EMOTE_FRAMES * index:
            raise SystemExit(f"bubble {index} isn't laid out as the packer writes it")
        bubbles.append({"name": BUBBLE_NAMES[emote], "texture": "", "hgss_emote": emote, "durations": timing[:4],
                        "frames": timing[4:]})
    return {"$schema": "interactions.schema.json", "rules": rules, "motions": motions, "messages": messages,
            "bubbles": bubbles}


def constant_name(name: str, value: int) -> str:
    """Returns the first constant of generated/<name>.txt with a value."""
    return next(constant for constant, number in assets.constant_list(name).items() if number == value)


def selector_fields(zone: int, species: int, form: int, kind: int) -> dict:
    fields = {}
    if zone:
        fields["zone"] = constant_name("zones", zone)
    if species:
        fields["species"] = constant_name("species", species)
    if form != 255:
        fields["form"] = form
    if kind != 255:
        fields["type"] = constant_name("types", kind)
    return fields


def bounds_fields(data: bytes, at: int, mask: int) -> dict:
    values = struct.unpack_from("<4h", data, at)
    bounds = {key: values[index] for index, key in enumerate(assets.BOUNDS) if mask & 1 << index}
    return {"tile_bounds": bounds} if bounds else {}


def context_header(data: bytes, magic: bytes) -> tuple[int, int]:
    found, abi, count, size, _ = struct.unpack_from("<4sHHII", data)
    if found != magic or size != len(data):
        raise SystemExit(f"no {magic.decode()} member")
    return abi, count


def dialogues(data: bytes) -> dict:
    abi, count = context_header(data, b"FWCD")
    stride = 28 if abi == 3 else 20
    rules = []
    for index in range(count):
        at = 16 + stride * index
        zone, species, form, kind, hp, friendship, status, facing, chance, before, offset, words, after, mask = \
            struct.unpack_from("<HHBB6BIHBB", data, at)
        rule = {**selector_fields(zone, species, form, kind), **condition_fields(hp, friendship, status, facing)}
        if chance != 100:
            rule["chance"] = chance
        if abi == 3:
            rule.update(bounds_fields(data, at + 20, mask))
        if before:
            rule["before_motion"] = before
        if after:
            rule["after_motion"] = after
        rule["text"] = text(data, offset, words)
        rules.append(rule)
    return {"$schema": "dialogues.schema.json", "rules": rules}


def items(data: bytes) -> dict:
    abi, count = context_header(data, b"FWTI")
    stride = 36 if abi == 2 else 28
    rules = []
    for index in range(count):
        at = 16 + stride * index
        (zone, species, item, slot, form, kind, hp, friendship, status, facing, quantity, name_at, name_words,
         text_at, text_words, mask) = struct.unpack_from("<HHHBBB5BIHIHH", data, at)
        rule = {"slot": slot, "item": constant_name("items", item), "quantity": quantity,
                "item_name": text(data, name_at, name_words), "text": text(data, text_at, text_words),
                **selector_fields(zone, species, form, kind), **condition_fields(hp, friendship, status, facing)}
        if abi == 2:
            rule.update(bounds_fields(data, at + 28, mask))
        rules.append(rule)
    return {"$schema": "items.schema.json", "rules": rules}


def emote_frame(blob: bytes) -> tuple[str, bytes, list]:
    """Returns an emote's texture's name, its pixels and its palette's colors."""
    tex0 = 0x14
    texel_start = tex0 + struct.unpack_from("<I", blob, tex0 + 20)[0]
    palette_start = tex0 + struct.unpack_from("<I", blob, tex0 + 56)[0]
    dictionary = tex0 + 0x3C
    if blob[dictionary + 1] != 1:
        raise SystemExit("an emote with more than one texture")
    size = struct.unpack_from("<H", blob, dictionary + 2)[0]
    name = blob[dictionary + size - 16:dictionary + size].rstrip(b"\0").decode()
    data = blob[texel_start:texel_start + assets.EMOTE_SIZE * assets.EMOTE_SIZE // 2]
    pixels = bytes(value for byte in data for value in (byte & 15, byte >> 4))
    colors = [tuple(((value >> shift) & 31) * 255 // 31 for shift in (0, 5, 10))
              for (value,) in struct.iter_unpack("<H", blob[palette_start:palette_start + 2 * assets.EMOTE_COLORS])]
    return name, pixels, colors


def main(files: Path, source: Path):
    following = files / "following"
    hack_interactions = (following / "interactions.bin").read_bytes()
    hack_emotes = read_narc((following / "emotes.narc").read_bytes())
    hack_effects = read_narc((following / "effects.narc").read_bytes())
    hack_dialogues = read_narc((following / "contextual-dialogues.narc").read_bytes())
    hack_items = read_narc((following / "contextual-items.narc").read_bytes())
    if len(hack_effects) != len(assets.EFFECTS) or len(hack_dialogues) != 1 or len(hack_items) != 1:
        raise SystemExit("the hack's NARCs don't have the members the packer writes")
    data = interactions(hack_interactions)
    if len(hack_emotes) != assets.EMOTE_FRAMES * len(data["bubbles"]):
        raise SystemExit("emotes.narc doesn't have two frames for each bubble")
    (source / "emotes").mkdir(parents=True, exist_ok=True)
    for index, bubble in enumerate(data["bubbles"]):
        for frame in range(1, assets.EMOTE_FRAMES + 1):
            name, pixels, colors = emote_frame(hack_emotes[assets.EMOTE_FRAMES * index + frame - 1])
            texture, _, number = name.rpartition(".")
            if number != str(frame) or bubble["texture"] not in ("", texture):
                raise SystemExit(f"emote {name} isn't frame {frame} of bubble {index}'s texture set")
            bubble["texture"] = texture
            path = source / "emotes" / f"{bubble['name']}_{frame}"
            path.with_suffix(".png").write_bytes(write_indexed_png(assets.EMOTE_SIZE, assets.EMOTE_SIZE, pixels,
                                                                   colors))
            path.with_suffix(".pal").write_text(write_palette(colors))
    write(source / "interactions.json", data)
    write(source / "dialogues.json", dialogues(hack_dialogues[0]))
    write(source / "items.json", items(hack_items[0]))
    (source / "effects").mkdir(parents=True, exist_ok=True)
    for name, blob in zip(assets.EFFECTS, hack_effects):
        (source / "effects" / name).write_bytes(blob)
    expected = [hack_interactions, hack_dialogues[0], hack_items[0], *hack_emotes, *hack_effects]
    packed = assets.members(source)
    differing = [assets.FIRST_MEMBER + index for index, (ours, theirs) in enumerate(zip(packed, expected))
                 if ours != theirs]
    if len(packed) != len(expected) or differing:
        raise SystemExit(f"the sources don't pack the hack's files again: members {differing} differ")
    print(f"wrote {source}: members {assets.FIRST_MEMBER} to {assets.FIRST_MEMBER + len(packed) - 1} pack byte for "
          "byte")


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]), Path(sys.argv[2] if len(sys.argv) == 3 else "res/paperwhite2/following"))
