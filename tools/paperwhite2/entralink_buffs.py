#!/usr/bin/env python3
"""Paper White 2's Entralink roguelike: the buff catalogue, res/paperwhite2/entralink/buffs.json.

    entralink_buffs.py OUTPUT_HEADER      # checks the catalogue, writes paperwhite2/entralink_buffs_config.h
    entralink_buffs.py --check            # only checks it, and prints the balance meter

The catalogue (docs/paperwhite2/design/entralink-buffs.md, buffs.schema.json beside it) holds every buff card: its
tier (blue, purple, gold), its offer (weight, rounds, price, pools), its numbers (a blue's or purple's step, soft limit
and cap; a gold's ranks), the damage bucket it adds to and its effect, one of the effect kinds that the schema's
effect_* definitions list, so the game implements kinds, not entries. Beside them: the gold themes, the buckets with
their caps, the offers' settings and the balance meter's inputs.

The game reads nothing of it yet (phase 1). The header gives the next phase its numbers: the buffs', themes', effect
kinds' and tiers' IDs and the settings, as ENTRALINK_BUFF_* values; the tables follow with the C that reads them.

The checks beyond the schema's: unique IDs; each gold's theme and each purple's related themes exist, one core gold a
theme; a bucket where the effect kind needs one (and none where it doesn't), on the right side; a gold's ranks and
rank lines agree and fit max_rank; a step within its cap; the icons are 16 by 16 PNGs of 16 colors, index 0 clear; the
tier odds add up to 100. The balance meter (ceiling(), example_hit(); the editor's buffs.ts is the same arithmetic,
the doc's section 5) warns when the strongest possible hit on the reference passes the damage cap.
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
SOURCES = ["enemy", "challenge", "boss"]
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


# ---- The checks -----------------------------------------------------------------------------------------------------

def check_icon(directory: Path, name: str, where: str):
    path = directory / "buff_icons" / name
    if not path.is_file():
        error(where, f"its icon buff_icons/{name} doesn't exist")
    width, height, pixels, _ = read_indexed_png(path)
    if (width, height) != (ICON_SIZE, ICON_SIZE) or (pixels and max(pixels) >= ICON_COLORS):
        error(where, f"buff_icons/{name} isn't a {ICON_SIZE} by {ICON_SIZE} icon of {ICON_COLORS} colors")


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
        if "icon" in theme:
            check_icon(directory, theme["icon"], f"themes.{theme['id']}")
    ids = set()
    cores = {}
    for entry in data["buffs"]:
        where = f"buffs.{entry['id']}"
        if entry["id"] in ids:
            error(where, "a buff ID is used twice")
        ids.add(entry["id"])
        effect = entry["effect"]
        kind = effect["kind"]
        if "icon" in entry:
            check_icon(directory, entry["icon"], where)
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


def header(data: dict, kinds: list[str]) -> str:
    settings = data["settings"]
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
        *[f"#define ENTRALINK_BUFF_BUCKET_{macro(b['id'])}_CAP {b['cap']}" for b in data["buckets"]], "",
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
        f"#define ENTRALINK_BUFF_GOLD_SLOTS {settings['gold_slots']}",
        f"#define ENTRALINK_BUFF_MAX_RANK {settings['max_rank']}",
        f"#define ENTRALINK_BUFF_DAMAGE_CAP {settings['damage_cap']}",
        f"#define ENTRALINK_BUFF_TYPE_CARD_TEAM_WEIGHT {settings.get('type_card_team_weight', 100)}",
        *[f"#define ENTRALINK_BUFF_PRICE_{macro(t)} {settings['prices'][t]}" for t in TIERS],
        "", f"#endif // {GUARD}", "",
    ]
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
        text = header(data, effect_kinds(args.source))
        if not args.output.exists() or args.output.read_text() != text:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(text)
    except datajson.DataError as error_:
        sys.exit(f"error: {error_}")


if __name__ == "__main__":
    main()
