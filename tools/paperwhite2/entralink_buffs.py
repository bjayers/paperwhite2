#!/usr/bin/env python3
"""Paper White 2's Entralink roguelike: the buff catalogue, res/paperwhite2/entralink/buffs.json.

    entralink_buffs.py OUTPUT_HEADER      # checks the catalogue, writes paperwhite2/entralink_buffs_config.h
    entralink_buffs.py --check            # only checks it, and prints the balance meter

The catalogue (docs/paperwhite2/design/entralink-buffs.md, buffs.schema.json beside it) holds every buff card: its
tier (blue, purple, gold), its offer (weight, rounds, price, pools), its numbers (a blue's or purple's step, soft limit
and cap; a gold's ranks), the damage bucket it adds to and its effect, one of the effect kinds that the schema's
effect_* definitions list, so the game implements kinds, not entries. Beside them: the icon categories, the gold
themes, the buckets with their caps, the offers' settings and the balance meter's inputs.

Icons: a card names a category, not a picture. Each category is one icon, buff_icons/<category>.png, 16 by 16, its
pixels palette indices (0 clear); each tier is one palette, buff_icons/tier_<tier>.png, a 16 by 16 swatch whose PNG
palette is the tier's 16 colors (color i in the 4 by 4 cell i). The game will load each icon as one 16-color texture
and draw it with the card's tier's palette, so one picture serves the three tiers. The icons' own PNG palettes are
only a preview.

The header gives the game its numbers: the buffs', categories', themes', effect kinds' and tiers' IDs and the settings,
as ENTRALINK_BUFF_* values, and since phase 2 (the offers) the cards' table, ENTRALINK_BUFF_TABLE (each card's tier,
theme, related themes, pools, rounds, weight, price, highest level, type card and its text's messages), which overlay
12's offers read (src/paperwhite2/ov012/paperwhite2_entralink_buff_offers.c). The cards' text is the script text bank
entralink_buffs (text_lines(), res/text/script/entralink_buffs.txt's \\from{entralink.buffs}): each card's title
colored by its tier (a gold's one per rank, with its numeral; a type card's with its type's word) and its descriptions,
wrapped for the description window's two lines.

The checks beyond the schema's: unique IDs; each card's category, each gold's theme and each purple's related themes
exist, one core gold a theme; a bucket where the effect kind needs one (and none where it doesn't), on the right side;
a gold's ranks and rank lines agree and fit max_rank; a step within its cap; each description fits the description
window's two lines; each category's icon and each tier's palette is a 16 by 16 PNG of 16 colors; every source's tier
odds add up to 100. The balance meter (ceiling(), example_hit(); the editor's buffs.ts is the same arithmetic, the
doc's section 5) warns when the strongest possible hit on the reference passes the damage cap.
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data import datajson  # noqa: E402
from tools.data.nitro_2d import read_indexed_png  # noqa: E402

SOURCE = ROOT / "res" / "paperwhite2" / "entralink"
GUARD = "POKEBW2_PAPERWHITE2_ENTRALINK_BUFFS_CONFIG_H"
TIERS = ["blue", "purple", "gold"]
# The tier odds' sources: after a battle (an enemy or enemy-choice room, a challenge, a boss), a gift NPC, a buff room
# and a shop
SOURCES = ["enemy", "challenge", "boss", "gift", "buff_room", "shop"]
# The pools a card can be offered in, bits of EntralinkBuff's pools in this order
POOLS = ["after_battle", "gift", "buff_room", "shop"]
# The cards' text colors by tier, in the field's system and list windows (the font palette: 1 and 2 the black and its
# gray shadow, 5 and 6 blue, 11 and 12 gold, 13 and 14 magenta): {ff00:2} is the palette's blue pair, and a color of
# 256 or more is 256 + letter * 16 + shadow (GFL_TextRndExecColorCmd, src/system/printsys.c); {ff00:0} goes back to
# the window's text color, as the game's messages do after an item's name ({ff00:255}, the renderer's "default", is the
# last color set)
TIER_COLORS = {"blue": "{ff00:2}", "purple": "{ff00:478}", "gold": "{ff00:444}"}
COLOR_RESET = "{ff00:0}"
RANK_NUMERALS = ["I", "II", "III"]
# The script word set's words the cards' text uses (ScriptWork's, 28 of 64 characters): a type card's type, then the
# two words of the list lines' templates (a title and a number)
WORD_TYPE = 20
WORD_TITLE = 21
WORD_NUMBER = 22
# A type card's text names its type where the catalogue says "the card's type"
CARD_TYPE = "the card's type"
TYPE_WORD = "{0100:%d}" % WORD_TYPE
# The description window (the system window under the list) shows two lines; a line of this many characters fits
DESCRIPTION_WIDTH = 32
# The fixed messages at the start of the text bank entralink_buffs, before the cards' titles and descriptions: an empty
# one, so that no card's is 0; a title alone; a title and a price; a title and a count; an item card's description
FIXED_MESSAGES = ["", "{0100:%d}" % WORD_TITLE, "{0100:%d} ({0100:%d})" % (WORD_TITLE, WORD_NUMBER),
                  "{0100:%d} x{0100:%d}" % (WORD_TITLE, WORD_NUMBER), "An item for the run's bag."]
FIXED_NAMES = ["NONE", "TITLE", "PRICE", "COUNT", "ITEM"]
# The types a type card rolls, TYPE_NORMAL to TYPE_DARK (decision 9: any of the 17)
CARD_TYPES = 17
# A stack's count is a byte
MAX_STACKS = 255
ICON_SIZE = 16
ICON_COLORS = 16
# The effect kinds that add to a bucket, and must name one; every other kind is "not damage" and names none.
# stat_ratio adds to one only for the attacking and defending stats (Speed is outside the buckets)
BUCKET_KINDS = {"damage_ratio", "stab_bonus", "crit_damage"}
ATTACK_STATS = {"attack", "sp_attack", "attacking"}
DEFENSE_STATS = {"defense", "sp_defense", "defending"}


def error(where: str, message: str):
    raise datajson.DataError(f"{where}: {message}")


def load(directory: Path = SOURCE) -> dict:
    return datajson.load(directory / "buffs.json", datajson.load_schema(directory / "buffs.schema.json"))


def effect_kinds(directory: Path = SOURCE) -> list[str]:
    """The effect kinds in the schema's order (its effect's anyOf), which the header numbers."""
    schema = datajson.load_schema(directory / "buffs.schema.json")
    return [option["$ref"].removeprefix("#/$defs/effect_") for option in schema["$defs"]["effect"]["anyOf"]]


# ---- The balance meter (the doc's section 5; editor/src/modules/entree/buffs.ts mirrors it) -------------------------

def picked_value(step: int, soft_limit: int | None, cap: int, picks: int) -> int | float:
    """What a blue's or purple's picks add up to: the full step up to the soft limit, half a step after, at most the
    cap (toward zero for a negative step)."""
    full = picks if soft_limit is None else min(picks, soft_limit)
    total = step * full + step / 2 * (picks - full)
    return min(total, cap) if step >= 0 else max(total, cap)


def strongest(entry: dict) -> int:
    """An entry's most: a blue's or purple's cap, a gold's highest rank."""
    return max(entry["ranks"]) if entry["tier"] == "gold" else entry["cap"]


def in_strongest_hit(entry: dict) -> bool:
    """Whether an entry counts toward the strongest hit, which is super effective, with STAB, on a boss: not the
    resisted-only bonuses, the ones exempt from the cap or the STAB for non-STAB moves."""
    effect = entry["effect"]
    return not (effect.get("condition", {}).get("resisted") or effect.get("exempt_from_bucket_cap")
                or effect.get("non_stab"))


def factor(bucket: dict, total: float) -> float:
    """A bucket's factor on the reference hit for the sum of its entries, at most its cap: (vanilla + sum) / vanilla,
    or / 100 for a critical-only bucket (the reference has no critical hit); a reducing one's (100 - sum) / 100."""
    total = min(total, bucket["cap"])
    vanilla = bucket.get("vanilla", 100)
    if bucket.get("reduces"):
        return (100 - total) / 100
    return (vanilla + total) / (100 if bucket.get("critical_only") else vanilla)


def bucket_sums(data: dict, values: dict[str, float]) -> dict[str, float]:
    sums = {bucket["id"]: 0.0 for bucket in data["buckets"]}
    for entry in data["buffs"]:
        if entry["id"] in values and entry.get("bucket") in sums:
            sums[entry["bucket"]] += values[entry["id"]]
    return sums


def hit(data: dict, sums: dict[str, float], reference: int) -> dict:
    """The attack-side buckets' product on a reference hit, without and with a critical hit."""
    buckets = [b for b in data["buckets"] if b["side"] == "attack"]
    plain = 1.0
    critical = 1.0
    for bucket in buckets:
        f = factor(bucket, sums[bucket["id"]])
        critical *= f
        if not bucket.get("critical_only"):
            plain *= f
    if not any(b.get("critical_only") for b in buckets):
        critical *= 2  # vanilla's critical hit, when no bucket carries it
    return {"factor": plain, "critical_factor": critical, "hit": reference * plain,
            "critical_hit": reference * critical}


def ceiling(data: dict, reference: int | None = None) -> dict:
    """The strongest possible single hit from the data: every entry at its most, each bucket's sum at its cap."""
    reference = reference or data.get("balance", {}).get("reference_hit", 600)
    values = {e["id"]: strongest(e) for e in data["buffs"] if in_strongest_hit(e)}
    sums = bucket_sums(data, values)
    return {"sums": sums, **hit(data, sums, reference)}


def example_hit(data: dict, reference: int | None = None) -> dict:
    """The balance section's typical build: each pick's value (a gold at its rank), each bucket's sum at its cap."""
    reference = reference or data.get("balance", {}).get("reference_hit", 600)
    entries = {e["id"]: e for e in data["buffs"]}
    values = {}
    for pick in data.get("balance", {}).get("example", []):
        entry = entries[pick["buff"]]
        if entry["tier"] == "gold":
            values[entry["id"]] = entry["ranks"][min(pick["count"], len(entry["ranks"])) - 1]
        else:
            values[entry["id"]] = picked_value(entry["step"], entry.get("soft_limit"), entry["cap"], pick["count"])
    values = {k: v for k, v in values.items() if in_strongest_hit(entries[k])}
    sums = bucket_sums(data, values)
    return {"sums": sums, **hit(data, sums, reference)}


# ---- The game's table and text (phase 2) ----------------------------------------------------------------------------

def max_level(entry: dict) -> int:
    """A card's highest level in a run: a gold's ranks; for a blue or purple, the picks that reach its cap (more add
    nothing, so it isn't offered after them), at most MAX_STACKS."""
    if entry["tier"] == "gold":
        return len(entry["ranks"])
    picks = 1
    while picks < MAX_STACKS and picked_value(entry["step"], entry.get("soft_limit"), entry["cap"], picks) != \
            entry["cap"]:
        picks += 1
    return picks


def shown_length(text: str) -> int:
    """A line's length as the game shows it, a type card's type counted as its longest name's, Electric."""
    return len(text.replace(TYPE_WORD, "Electric"))


def wrap(text: str, width: int = DESCRIPTION_WIDTH) -> str:
    """A description in lines of at most width characters, broken at spaces (the editor's descriptionLines() is the
    same)."""
    lines = []
    for word in text.split(" "):
        if lines and shown_length(lines[-1] + " " + word) <= width:
            lines[-1] += " " + word
        else:
            lines.append(word)
    return "\\n".join(lines)


def card_text(entry: dict, text: str) -> str:
    return text.replace(CARD_TYPE, f"the {TYPE_WORD} type") if entry.get("type_card") else text


def messages(data: dict) -> tuple[list[str], list[int], list[int]]:
    """The text bank entralink_buffs: FIXED_MESSAGES, then each card's titles (a gold's one per rank, with its
    numeral; a type card's with its type), then each card's descriptions (a gold's one per rank), wrapped for the
    description window. Returns the lines and each card's first title and first description."""
    lines = list(FIXED_MESSAGES)
    titles = []
    for entry in data["buffs"]:
        titles.append(len(lines))
        color = TIER_COLORS[entry["tier"]]
        if entry["tier"] == "gold":
            lines += [f"{color}{entry['name']} {RANK_NUMERALS[r]}{COLOR_RESET}" for r in range(len(entry["ranks"]))]
        elif entry.get("type_card"):
            lines.append(f"{color}{entry['name']} ({TYPE_WORD}){COLOR_RESET}")
        else:
            lines.append(f"{color}{entry['name']}{COLOR_RESET}")
    descriptions = []
    for entry in data["buffs"]:
        descriptions.append(len(lines))
        texts = entry["description"] if isinstance(entry["description"], list) else [entry["description"]]
        lines += [wrap(card_text(entry, text)) for text in texts]
    return lines, titles, descriptions


def text_lines(directory: Path = SOURCE) -> list[str]:
    """The text bank entralink_buffs (res/text/script/entralink_buffs.txt's \\from{entralink.buffs})."""
    return messages(load(directory))[0]


def table(data: dict) -> list[str]:
    """ENTRALINK_BUFF_TABLE, EntralinkBuff's initializer (include/paperwhite2/entralink_buffs.h)."""
    _, titles, descriptions = messages(data)
    themes = {t["id"]: i for i, t in enumerate(data["themes"])}
    type_cards = [e["id"] for e in data["buffs"] if e.get("type_card")]
    rows = []
    for i, entry in enumerate(data["buffs"]):
        tier = entry["tier"]
        price = entry.get("price", data["settings"]["prices"][tier])
        related = sum(1 << themes[t] for t in entry.get("related", []))
        pools = sum(1 << POOLS.index(p) for p in entry["pools"])
        rounds = sum(1 << (r - 1) for r in entry.get("rounds", []))
        theme = f"ENTRALINK_BUFF_THEME_{macro(entry['theme'])}" if tier == "gold" else "ENTRALINK_BUFF_THEME_NONE"
        type_card = type_cards.index(entry["id"]) if entry["id"] in type_cards else "ENTRALINK_BUFF_TYPE_CARD_NONE"
        rows.append(f"    {{ {titles[i]}, {descriptions[i]}, {price}, {related:#x}, ENTRALINK_BUFF_TIER_{macro(tier)}, "
                    f"{theme}, {max_level(entry)}, {pools:#x}, {rounds:#x}, {entry['weight']}, {type_card} }}, "
                    f"/* {entry['id']} */")
    return rows


# ---- The battle's tables (phase 3) ----------------------------------------------------------------------------------

# The enumerations of the effects' parameters, numbered in the schema's order: (the header's prefix, the definition and
# its property, whether the enum is of an array's items)
EFFECT_ENUMS = [
    ("STAT", "effect_stat_ratio", "stat", False),
    ("STATUS", "condition", "defender_status", True),
    ("SCALE", "effect_damage_ratio", "scale", False),
    ("WEATHER", "condition", "weather", True),
    ("MOVE_CATEGORY", "condition", "category", False),
    ("RESIDUAL", "effect_residual_ratio", "source", False),
    ("FRACTION", "effect_residual_fraction", "source", False),
    ("HEAL", "effect_heal_ratio", "source", False),
    ("ROLL", "effect_status_roll", "roll", False),
    ("WEATHER_MODE", "effect_weather_turns", "mode", False),
    ("DURATION", "effect_status_duration", "target", False),
]
# The condition's fields that hold a value beside their test bit
CONDITION_VALUES = {"defender_status", "attacker_status", "move_type", "category", "attacker_hp_below",
                    "power_at_most", "weather"}
# The effects' flags, bits of EntralinkBuffEffect's flags
EFFECT_FLAGS = ["exempt_from_bucket_cap", "ignore_burn_drop", "team_immune", "non_stab", "overrides_immunity",
                "replaces_freeze"]
# The effects' "from this rank on" parameter, EntralinkBuffEffect's rankParam
RANK_PARAMS = ["halves_recoil_at_rank", "ignores_immunity_at_rank", "spreads_at_rank"]


def effect_enums(directory: Path = SOURCE) -> dict[str, list[str]]:
    """Each parameter enumeration's names, from the schema."""
    defs = datajson.load_schema(directory / "buffs.schema.json")["$defs"]
    enums = {}
    for prefix, definition, field, items in EFFECT_ENUMS:
        prop = defs[definition]["properties"][field]
        enums[prefix] = (prop["items"] if items else prop)["enum"]
    return enums


def condition_tests(directory: Path = SOURCE) -> list[str]:
    """The condition's tests in the schema's order (any is the list of alternatives, not a test)."""
    defs = datajson.load_schema(directory / "buffs.schema.json")["$defs"]
    return [name for name in defs["condition"]["properties"] if name != "any"]


def custom_handlers(data: dict) -> list[str]:
    """The custom effects' handlers, in the order the catalogue first names them."""
    names = []
    for entry in data["buffs"]:
        handler = entry["effect"].get("handler")
        if handler is not None and handler not in names:
            names.append(handler)
    return names


def bits(names, enum: list[str]) -> int:
    return sum(1 << enum.index(n) for n in names)


def effects_table(data: dict, directory: Path = SOURCE) -> list[str]:
    """ENTRALINK_BUFF_EFFECTS, EntralinkBuffEffect's initializer (paperwhite2/entralink_buffs.h): each card's kind,
    bucket, condition (the tests that must all hold, the tests of which one must hold, and their values), scale,
    parameter, flags, rank parameter, statuses, stats a rank and ability."""
    enums = effect_enums(directory)
    tests = condition_tests(directory)
    handlers = custom_handlers(data)
    kinds = effect_kinds(directory)
    buckets = [b["id"] for b in data["buckets"]]
    rows = []
    for entry in data["buffs"]:
        where = f"buffs.{entry['id']}"
        effect = entry["effect"]
        kind = effect["kind"]
        values = {"move_type": "TYPE_NULL", "defender_status": 0, "attacker_status": 0, "category": 0,
                  "attacker_hp_below": 0, "power_at_most": 0, "weather": 0}

        def take(condition: dict, alternatives: bool) -> int:
            mask = 0
            for name, value in condition.items():
                if name == "any":
                    continue
                mask |= 1 << tests.index(name)
                if name not in CONDITION_VALUES:
                    continue
                if name in ("defender_status", "attacker_status"):
                    value = bits(value, enums["STATUS"])
                elif name == "weather":
                    value = bits(value, enums["WEATHER"])
                elif name == "category":
                    value = enums["MOVE_CATEGORY"].index(value)
                elif name == "move_type":
                    value = value
                old = values[name]
                if old not in (0, "TYPE_NULL") and old != value:
                    error(where, f"its condition gives {name} two values; the game keeps one")
                values[name] = value
            if alternatives and bin(mask).count("1") != len([n for n in condition if n != "any"]):
                error(where, "a condition of any is one test")
            return mask

        condition = effect.get("condition", {})
        all_mask = take(condition, False)
        any_mask = 0
        for alternative in condition.get("any", []):
            if len(alternative) != 1 or "any" in alternative:
                error(where, "each condition of any is one test (the game ORs single tests)")
            any_mask |= take(alternative, True)
        param = 0
        if kind == "stat_ratio":
            param = enums["STAT"].index(effect["stat"])
        elif kind == "residual_ratio":
            param = enums["RESIDUAL"].index(effect["source"])
        elif kind == "residual_fraction":
            param = enums["FRACTION"].index(effect["source"])
        elif kind == "heal_ratio":
            param = enums["HEAL"].index(effect["source"])
        elif kind == "status_chance_on_hit":
            param = enums["STATUS"].index(effect["status"])
        elif kind == "status_roll":
            param = enums["ROLL"].index(effect["roll"])
        elif kind == "weather_turns":
            param = enums["WEATHER_MODE"].index(effect["mode"])
        elif kind == "status_duration":
            param = enums["DURATION"].index(effect["target"])
        elif kind == "custom":
            param = f"ENTRALINK_BUFF_HANDLER_{macro(effect['handler'])}"
        statuses = bits(effect.get("statuses", []) + effect.get("immune_to", []), enums["STATUS"])
        flags = sum(1 << i for i, f in enumerate(EFFECT_FLAGS) if effect.get(f))
        rank_param = max([effect.get(p, 0) for p in RANK_PARAMS])
        stats = [bits(s, enums["STAT"]) for s in effect.get("stats_by_rank", [])]
        stats = (stats + [stats[-1] if stats else 0] * 3)[:3]
        scale = enums["SCALE"].index(effect["scale"]) + 1 if "scale" in effect else 0
        bucket = f"ENTRALINK_BUFF_BUCKET_{macro(entry['bucket'])}" if entry.get("bucket") in buckets \
            else "ENTRALINK_BUFF_NONE"
        ability = effect.get("ability", "ABILITY_NONE")
        rows.append(f"    {{ {all_mask:#x}, {any_mask:#x}, {ability}, ENTRALINK_BUFF_KIND_{macro(kind)}, {bucket}, "
                    f"{values['defender_status']:#x}, {values['attacker_status']:#x}, {values['move_type']}, "
                    f"{values['category']}, {values['attacker_hp_below']}, {values['power_at_most']}, "
                    f"{values['weather']:#x}, {scale}, {param}, {flags:#x}, {rank_param}, {statuses:#x}, "
                    f"{{ {stats[0]:#x}, {stats[1]:#x}, {stats[2]:#x} }}, {effect.get('hp_cost', 0)} }}, "
                    f"/* {entry['id']} */")
        assert kinds.index(kind) >= 0
    return rows


def values_table(data: dict) -> list[str]:
    """ENTRALINK_BUFF_VALUES, EntralinkBuffValue's initializer: a blue's or purple's step, soft limit (0 for none) and
    cap, or a gold's value at each rank (its last repeated); whether it is a gold, and its effect's kind (for the run's
    own effects outside the battle, Vigor's)."""
    rows = []
    for entry in data["buffs"]:
        if entry["tier"] == "gold":
            ranks = entry["ranks"]
            numbers = (ranks + [ranks[-1]] * 3)[:3]
        else:
            numbers = [entry["step"], entry.get("soft_limit", 0), entry["cap"]]
        kind = f"ENTRALINK_BUFF_KIND_{macro(entry['effect']['kind'])}"
        rows.append(f"    {{ {{ {numbers[0]}, {numbers[1]}, {numbers[2]} }}, {int(entry['tier'] == 'gold')}, {kind} }}, "
                    f"/* {entry['id']} */")
    return rows


def effect_lines(data: dict, directory: Path = SOURCE) -> list[str]:
    enums = effect_enums(directory)
    lines = ["// The effects' parameters (phase 3, buffs.schema.json's enums in their order): stats, statuses (bits),",
             "// scales (from 1; 0 for none), weathers (bits), move categories, residual sources, fractions' sources,",
             "// heals' sources, rolls, weather modes, durations' targets"]
    for prefix, _, _, _ in EFFECT_ENUMS:
        lines += [f"#define ENTRALINK_BUFF_{prefix}_{macro(name)} {i + (prefix == 'SCALE')}"
                  for i, name in enumerate(enums[prefix])]
    lines += ["// The condition's tests, bits of EntralinkBuffEffect's condition and anyCondition"]
    lines += [f"#define ENTRALINK_BUFF_COND_{macro(name)} (1 << {i})" for i, name in enumerate(condition_tests(directory))]
    lines += ["// The effects' flags", *[f"#define ENTRALINK_BUFF_FLAG_{macro(f)} (1 << {i})"
                                       for i, f in enumerate(EFFECT_FLAGS)]]
    lines += ["// The custom effects' handlers", *[f"#define ENTRALINK_BUFF_HANDLER_{macro(h)} {i}"
                                                for i, h in enumerate(custom_handlers(data))]]
    lines += ["// Each card's effect (EntralinkBuffEffect, paperwhite2/entralink_buffs.h): condition, any condition,",
              "// ability, kind, bucket, defender's and attacker's statuses, move type, category, HP below, power at",
              "// most, weathers, scale, parameter, flags, rank parameter, statuses, stats a rank, HP cost",
              "#define ENTRALINK_BUFF_EFFECTS { \\", *[row + " \\" for row in effects_table(data, directory)], "}",
              "// Each card's numbers (EntralinkBuffValue): step, soft limit and cap, or the ranks; whether a gold; its",
              "// effect's kind",
              "#define ENTRALINK_BUFF_VALUES { \\", *[row + " \\" for row in values_table(data)], "}"]
    return lines


# ---- The checks -----------------------------------------------------------------------------------------------------

def check_icon(directory: Path, name: str, where: str):
    """A category's icon or a tier's palette: a 16 by 16 indexed PNG of at most 16 colors."""
    path = directory / "buff_icons" / name
    if not path.is_file():
        error(where, f"buff_icons/{name} doesn't exist")
    width, height, pixels, _ = read_indexed_png(path)
    if (width, height) != (ICON_SIZE, ICON_SIZE) or (pixels and max(pixels) >= ICON_COLORS):
        error(where, f"buff_icons/{name} isn't a {ICON_SIZE} by {ICON_SIZE} picture of {ICON_COLORS} colors")


def tier_palette(directory: Path, tier: str) -> list[tuple[int, int, int]]:
    """A tier's 16 colors, the palette of buff_icons/tier_<tier>.png, which the game draws every icon of the tier in."""
    _, _, _, colors = read_indexed_png(directory / "buff_icons" / f"tier_{tier}.png")
    return (list(colors) + [(0, 0, 0)] * ICON_COLORS)[:ICON_COLORS]


def problems(data: dict, directory: Path = SOURCE) -> list[str]:
    """Raises on the first error; returns the warnings."""
    warnings = []
    settings = data["settings"]
    for source in SOURCES:
        odds = settings["tier_odds"][source]
        if sum(odds[t] for t in TIERS) != 100:
            error(f"settings.tier_odds.{source}", "the tiers' percents don't add up to 100")
    buckets = {}
    for bucket in data["buckets"]:
        if bucket["id"] in buckets:
            error(f"buckets.{bucket['id']}", "a bucket ID is used twice")
        if bucket.get("reduces") and bucket["cap"] > 99:
            error(f"buckets.{bucket['id']}", "a reducing bucket's cap must stay under 100 (never immunity)")
        buckets[bucket["id"]] = bucket
    themes = {}
    for theme in data["themes"]:
        if theme["id"] in themes:
            error(f"themes.{theme['id']}", "a theme ID is used twice")
        themes[theme["id"]] = theme
    categories = set()
    for category in data["categories"]:
        if category["id"] in categories:
            error(f"categories.{category['id']}", "a category ID is used twice")
        categories.add(category["id"])
        check_icon(directory, f"{category['id']}.png", f"categories.{category['id']}")
    for tier in TIERS:
        check_icon(directory, f"tier_{tier}.png", f"the {tier} tier's palette")
    ids = set()
    cores = {}
    for entry in data["buffs"]:
        where = f"buffs.{entry['id']}"
        if entry["id"] in ids:
            error(where, "a buff ID is used twice")
        ids.add(entry["id"])
        effect = entry["effect"]
        kind = effect["kind"]
        if entry["category"] not in categories:
            error(where, f"its category {entry['category']!r} isn't one of categories'")
        if entry["tier"] == "gold":
            if entry["theme"] not in themes:
                error(where, f"its theme {entry['theme']!r} isn't one of themes'")
            if len(entry["ranks"]) > settings["max_rank"]:
                error(where, f"{len(entry['ranks'])} ranks, past max_rank {settings['max_rank']}")
            if len(entry["description"]) != len(entry["ranks"]):
                error(where, "its description has a line per rank: as many lines as ranks")
            if entry.get("core"):
                if entry["theme"] in cores:
                    error(where, f"the theme {entry['theme']} already has a core gold, {cores[entry['theme']]}")
                cores[entry["theme"]] = entry["id"]
        else:
            if (entry["step"] < 0) != (entry["cap"] < 0) or abs(entry["step"]) > abs(entry["cap"]):
                error(where, "the step must be within the cap, of the same sign")
            for theme in entry.get("related", []):
                if theme not in themes:
                    error(where, f"related theme {theme!r} isn't one of themes'")
            if entry["tier"] == "blue" and ("related" in entry or "type_card" in entry):
                error(where, "related and type_card are for purples")
        bucket = entry.get("bucket")
        needs = kind in BUCKET_KINDS or (kind == "stat_ratio" and effect["stat"] != "speed")
        if bucket is not None and bucket not in buckets:
            error(where, f"its bucket {bucket!r} isn't one of buckets'")
        if needs and bucket is None:
            error(where, f"a {kind} effect adds to a bucket: name it")
        if not needs and bucket is not None:
            error(where, f"a {kind} effect isn't damage: it names no bucket")
        if kind == "stat_ratio" and bucket is not None:
            side = "attack" if effect["stat"] in ATTACK_STATS else "defense"
            if buckets[bucket]["side"] != side:
                error(where, f"the {effect['stat']} stat goes in a bucket of the {side} side")
        if kind == "stab_bonus" and bucket is not None and buckets[bucket].get("vanilla", 100) == 100:
            warnings.append(f"{where}: a stab_bonus in {bucket}, a bucket with no vanilla factor")
        for text in entry["description"] if isinstance(entry["description"], list) else [entry["description"]]:
            if wrap(card_text(entry, text)).count("\\n") > 1:
                error(where, f"{text!r} takes more than the description window's two lines of about "
                             f"{DESCRIPTION_WIDTH} characters")
        if kind == "stat_stage_on_entry" and entry["tier"] == "gold" and \
                len(effect["stats_by_rank"]) != len(entry["ranks"]):
            error(where, "stats_by_rank has a list per rank")
    for theme in themes:
        if theme not in cores:
            warnings.append(f"themes.{theme}: no core gold")
    entries = {e["id"]: e for e in data["buffs"]}
    for pick in data.get("balance", {}).get("example", []):
        if pick["buff"] not in entries:
            error("balance.example", f"{pick['buff']!r} isn't a buff's ID")
        if entries[pick["buff"]]["tier"] == "gold" and pick["count"] > len(entries[pick["buff"]]["ranks"]):
            error("balance.example", f"{pick['buff']} has {len(entries[pick['buff']]['ranks'])} ranks")
    top = ceiling(data)
    if top["critical_hit"] > settings["damage_cap"]:
        warnings.append(f"balance: the strongest critical hit on the reference ({top['critical_hit']:,.0f}) passes "
                        f"the damage cap ({settings['damage_cap']:,})")
    return warnings


# ---- The header -----------------------------------------------------------------------------------------------------

def macro(name: str) -> str:
    return name.upper()


def header(data: dict, kinds: list[str], directory: Path = SOURCE) -> str:
    settings = data["settings"]
    type_cards = [e["id"] for e in data["buffs"] if e.get("type_card")]
    lines = [
        "// Generated by tools/paperwhite2/entralink_buffs.py from res/paperwhite2/entralink/buffs.json; don't edit.",
        f"#ifndef {GUARD}", f"#define {GUARD}", "",
        f"#define ENTRALINK_BUFF_COUNT {len(data['buffs'])}",
        f"#define ENTRALINK_BUFF_THEME_COUNT {len(data['themes'])}",
        f"#define ENTRALINK_BUFF_KIND_COUNT {len(kinds)}",
        f"#define ENTRALINK_BUFF_BUCKET_COUNT {len(data['buckets'])}", "",
        "// Tiers",
        *[f"#define ENTRALINK_BUFF_TIER_{macro(t)} {i}" for i, t in enumerate(TIERS)], "",
        "// Effect kinds (buffs.schema.json's effect_* definitions)",
        *[f"#define ENTRALINK_BUFF_KIND_{macro(k)} {i}" for i, k in enumerate(kinds)], "",
        "// Damage buckets, with their caps in hundredths",
        *[f"#define ENTRALINK_BUFF_BUCKET_{macro(b['id'])} {i}" for i, b in enumerate(data["buckets"])],
        *[f"#define ENTRALINK_BUFF_BUCKET_{macro(b['id'])}_CAP {b['cap']}" for b in data["buckets"]],
        "// Each bucket's cap and the vanilla factor its sum adds to (hundredths), in the buckets' order (phase 3)",
        "#define ENTRALINK_BUFF_BUCKET_CAPS { " + ", ".join(str(b["cap"]) for b in data["buckets"]) + " }",
        "#define ENTRALINK_BUFF_BUCKET_VANILLAS { " + ", ".join(str(b.get("vanilla", 100)) for b in data["buckets"])
        + " }", "",
        "// Icon categories (buff_icons/<category>.png, drawn in buff_icons/tier_<tier>.png's palette)",
        f"#define ENTRALINK_BUFF_CATEGORY_COUNT {len(data['categories'])}",
        *[f"#define ENTRALINK_BUFF_CATEGORY_{macro(c['id'])} {i}" for i, c in enumerate(data["categories"])], "",
        "// Gold themes",
        *[f"#define ENTRALINK_BUFF_THEME_{macro(t['id'])} {i}" for i, t in enumerate(data["themes"])], "",
        "// Buffs",
        *[f"#define ENTRALINK_BUFF_{macro(e['id'])} {i}" for i, e in enumerate(data["buffs"])], "",
        "// Settings",
        f"#define ENTRALINK_BUFF_OFFERS {settings['offers']}",
        *[f"#define ENTRALINK_BUFF_ODDS_{macro(s)}_{macro(t)} {settings['tier_odds'][s][t]}"
          for s in SOURCES for t in TIERS],
        f"#define ENTRALINK_BUFF_BOSS_GUARANTEED_GOLD {int(settings['boss_guaranteed_gold'])}",
        f"#define ENTRALINK_BUFF_SHOP_GOLD_WEIGHT {settings.get('shop_gold_weight', 100)}",
        f"#define ENTRALINK_BUFF_HELD_THEME_WEIGHT {settings.get('held_theme_weight', 100)}",
        f"#define ENTRALINK_BUFF_RANK_UP_WEIGHT {settings.get('rank_up_weight', 100)}",
        f"#define ENTRALINK_BUFF_GIFT_BUFF_CHANCE {settings.get('gift_buff_chance', 0)}",
        f"#define ENTRALINK_BUFF_SHOP_BUFFS {settings.get('shop_buffs', 0)}",
        f"#define ENTRALINK_BUFF_GOLD_SLOTS {settings['gold_slots']}",
        f"#define ENTRALINK_BUFF_MAX_RANK {settings['max_rank']}",
        f"#define ENTRALINK_BUFF_DAMAGE_CAP {settings['damage_cap']}",
        f"#define ENTRALINK_BUFF_BOSS_BAR_HP {settings.get('boss_bar_hp', 6000)}",
        f"#define ENTRALINK_BUFF_BOSS_SLEEP_TURNS {settings.get('boss_sleep_turns', 2)}",
        f"#define ENTRALINK_BUFF_BOSS_TOXIC_CAP {settings.get('boss_toxic_cap', 4)}",
        f"#define ENTRALINK_BUFF_BOSS_FULL_PARALYSIS {settings.get('boss_full_paralysis', 50)}",
        f"#define ENTRALINK_BUFF_BOSS_FIXED_DAMAGE {settings.get('boss_fixed_damage', 50)}",
        f"#define ENTRALINK_BUFF_SKIP_DUST {settings.get('skip_dust', 0)}",
        f"#define ENTRALINK_BUFF_TYPE_CARD_TEAM_WEIGHT {settings.get('type_card_team_weight', 100)}",
        *[f"#define ENTRALINK_BUFF_PRICE_{macro(t)} {settings['prices'][t]}" for t in TIERS], "",
        "// The offers' sources, rows of ENTRALINK_BUFF_ODDS (blue, purple, gold percents)",
        *[f"#define ENTRALINK_BUFF_SOURCE_{macro(s)} {i}" for i, s in enumerate(SOURCES)],
        f"#define ENTRALINK_BUFF_SOURCE_COUNT {len(SOURCES)}",
        "#define ENTRALINK_BUFF_ODDS { " + ", ".join(
            "{ " + ", ".join(str(settings["tier_odds"][s][t]) for t in TIERS) + " }" for s in SOURCES) + " }",
        "// The pools, bits of EntralinkBuff's pools",
        *[f"#define ENTRALINK_BUFF_POOL_{macro(p)} {i}" for i, p in enumerate(POOLS)], "",
        "// The type cards (a stack a type) and the types they roll, TYPE_NORMAL up to this",
        f"#define ENTRALINK_BUFF_TYPE_CARD_COUNT {len(type_cards)}",
        f"#define ENTRALINK_BUFF_TYPE_CARD_SLOTS {max(1, len(type_cards))}",
        "#define ENTRALINK_BUFF_TYPE_CARDS { " + (", ".join(f"ENTRALINK_BUFF_{macro(i)}" for i in type_cards)
                                                  or "ENTRALINK_BUFF_NONE") + " }",
        f"#define ENTRALINK_BUFF_CARD_TYPES {CARD_TYPES}", "",
        "// The text bank SCRIPT_TEXT_ENTRALINK_BUFFS: its fixed messages, and the words they and the cards' titles use",
        *[f"#define ENTRALINK_BUFF_MSG_{n} {i}" for i, n in enumerate(FIXED_NAMES)],
        f"#define ENTRALINK_BUFF_WORD_TYPE {WORD_TYPE}",
        f"#define ENTRALINK_BUFF_WORD_TITLE {WORD_TITLE}",
        f"#define ENTRALINK_BUFF_WORD_NUMBER {WORD_NUMBER}", "",
        "// The cards (EntralinkBuff, paperwhite2/entralink_buffs.h): title, description, price, related themes, tier,",
        "// theme, highest level, pools, rounds, weight, type card",
        "#define ENTRALINK_BUFF_TABLE { \\",
        *[row + " \\" for row in table(data)],
        "}", "",
        *effect_lines(data, directory),
        "", f"#endif // {GUARD}", "",
    ]
    # A buff's, category's or theme's ID can spell another value's name (a buff "stat_speed")
    names = [line.split()[1] for line in lines if line.startswith("#define ")]
    for name in names:
        if names.count(name) > 1:
            error("buffs", f"{name} is defined twice: rename the ID that spells it")
    return "\n".join(lines)


def meter_lines(data: dict) -> list[str]:
    top, typical = ceiling(data), example_hit(data)
    reference = data.get("balance", {}).get("reference_hit", 600)
    cap = data["settings"]["damage_cap"]
    sums = ", ".join(f"{b['name']} {top['sums'][b['id']]:g}/{b['cap']}" for b in data["buckets"] if b["side"] == "attack")
    return [f"buckets at most: {sums}",
            f"strongest hit on {reference}: x{top['factor']:.2f} = {top['hit']:,.0f}; critical x{top['critical_factor']:.2f}"
            f" = {top['critical_hit']:,.0f} (cap {cap:,})",
            f"example build: x{typical['factor']:.2f} = {typical['hit']:,.0f}"]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("output", type=Path, nargs="?")
    parser.add_argument("--check", action="store_true", help="only check the catalogue, and print the meter")
    parser.add_argument("--source", type=Path, default=SOURCE, help="the data's directory")
    args = parser.parse_args()
    try:
        data = load(args.source)
        for warning in problems(data, args.source):
            print(f"warning: buffs.json: {warning}", file=sys.stderr)
        if args.check:
            print("\n".join(meter_lines(data)))
            return
        if args.output is None:
            parser.error("give the output header")
        text = header(data, effect_kinds(args.source), args.source)
        if not args.output.exists() or args.output.read_text() != text:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(text)
    except datajson.DataError as error_:
        sys.exit(f"error: {error_}")


if __name__ == "__main__":
    main()
