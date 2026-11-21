"""Tests of tools/paperwhite2/entralink_buffs.py: the real catalogue checks and packs, the balance meter gives the doc's
numbers (docs/paperwhite2/design/entralink-buffs.md, section 5), and broken copies are refused."""
import json
import shutil
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data import datajson  # noqa: E402
from tools.paperwhite2 import entralink_buffs  # noqa: E402


def copy_data(tmp_path: Path) -> Path:
    directory = tmp_path / "entralink"
    directory.mkdir(parents=True)
    for name in ["buffs.json", "buffs.schema.json"]:
        shutil.copy(entralink_buffs.SOURCE / name, directory / name)
    shutil.copytree(entralink_buffs.SOURCE / "buff_icons", directory / "buff_icons")
    return directory


def edit(directory: Path, change):
    path = directory / "buffs.json"
    data = json.loads(path.read_text())
    change(data)
    path.write_text(json.dumps(data))


def entry(data: dict, buff: str) -> dict:
    return next(e for e in data["buffs"] if e["id"] == buff)


def refused(directory: Path, match: str):
    with pytest.raises(datajson.DataError, match=match):
        entralink_buffs.problems(entralink_buffs.load(directory), directory)


def test_real_data_packs():
    data = entralink_buffs.load()
    assert entralink_buffs.problems(data) == []
    kinds = entralink_buffs.effect_kinds()
    assert "damage_ratio" in kinds and kinds[-1] == "custom"
    assert {e["effect"]["kind"] for e in data["buffs"]} <= set(kinds)
    text = entralink_buffs.header(data, kinds)
    assert f"#define ENTRALINK_BUFF_COUNT {len(data['buffs'])}" in text
    assert "#define ENTRALINK_BUFF_DAMAGE_CAP 60000" in text
    assert "#define ENTRALINK_BUFF_GOLD_SLOTS 5" in text
    assert {e["tier"] for e in data["buffs"]} <= set(entralink_buffs.TIERS)


def test_picked_value_halves_past_the_soft_limit():
    assert entralink_buffs.picked_value(10, 6, 80, 3) == 30
    assert entralink_buffs.picked_value(10, 6, 80, 7) == 65
    assert entralink_buffs.picked_value(10, 6, 80, 20) == 80
    assert entralink_buffs.picked_value(15, None, 60, 2) == 30
    assert entralink_buffs.picked_value(-1, None, -2, 5) == -2


def test_meter_multiplies_the_buckets_held_to_their_caps():
    """The meter on a fixture: each card at its most (Attack's cap 80, Type Affinity's 60, Galvanic's top rank 100)
    held to the fixture's buckets' caps, multiplied; a critical hit doubles (no CRIT entry); the example build's picks
    at their values."""
    data = fixture_catalogue()
    data["balance"].update(reference_hit=600, example=[{"buff": "attack", "count": 3}, {"buff": "galvanic", "count": 2}])
    top = entralink_buffs.ceiling(data)
    # ATK 1.8 x POW 1.6 x COND 2.0
    assert round(top["factor"], 3) == 5.76 and round(top["critical_factor"], 2) == 11.52
    assert round(top["hit"]) == 3456 and round(entralink_buffs.ceiling(data, 800)["critical_hit"]) == 9216
    # Attack's 60 is held to an ATK cap of 50
    next(b for b in data["buckets"] if b["id"] == "atk")["cap"] = 50
    assert round(entralink_buffs.ceiling(data)["factor"], 3) == 4.8
    # ATK 1.3 x COND 1.8
    typical = entralink_buffs.example_hit(data)
    assert round(typical["factor"], 2) == 2.34 and round(typical["hit"]) == 1404


def test_resisted_and_non_stab_bonuses_are_left_out_of_the_strongest_hit():
    data = entralink_buffs.load()
    sums = entralink_buffs.ceiling(data)["sums"]
    match = sum(entralink_buffs.strongest(e) for e in data["buffs"] if e.get("bucket") == "match"
                and entralink_buffs.in_strongest_hit(e))
    assert sums["match"] == match
    assert not entralink_buffs.in_strongest_hit(entry(data, "tinted"))
    assert not entralink_buffs.in_strongest_hit(entry(data, "coverage"))


def test_the_meter_warns_for_a_typical_build_not_an_extreme_one(tmp_path):
    """Rebalance 2: the strongest hit past the clamp is fine (an extreme build); the example build past it, or
    outside the typical band, warns."""
    directory = copy_data(tmp_path)

    def warnings():
        return entralink_buffs.problems(entralink_buffs.load(directory), directory)

    edit(directory, lambda d: (d["balance"].update(reference_hit=9999, example=[], typical_factor=[1, 500]),
                               d["settings"].update(damage_cap=1000)))
    assert entralink_buffs.ceiling(entralink_buffs.load(directory))["critical_hit"] > 1000
    assert not any("damage cap" in w or "typical band" in w for w in warnings())
    edit(directory, lambda d: d["balance"].update(example=[{"buff": "attack", "count": 1}]))
    assert any("passes the damage cap" in w for w in warnings())
    edit(directory, lambda d: (d["balance"].update(reference_hit=10, typical_factor=[50, 60]),
                               d["settings"].update(damage_cap=60000)))
    assert any("outside the typical band x50-60" in w for w in warnings())
    assert any("typical band" in line for line in entralink_buffs.meter_lines(entralink_buffs.load(directory)))


def test_broken_catalogues_are_refused(tmp_path):
    cases = [
        (lambda d: d["buffs"].append(dict(entry(d, "attack"))), "used twice"),
        (lambda d: entry(d, "galvanic").update(theme="thunder"), "isn't one of themes'"),
        (lambda d: entry(d, "overcharge").update(core=True), "already has a core gold"),
        (lambda d: entry(d, "attack").pop("bucket"), "adds to a bucket"),
        (lambda d: entry(d, "speed").update(bucket="atk"), "isn't damage"),
        (lambda d: entry(d, "defense").update(bucket="atk"), "defense side"),
        (lambda d: entry(d, "galvanic").update(description=["one line"]), "a line per rank"),
        (lambda d: entry(d, "attack").update(step=entry(d, "attack")["cap"] + 10), "within the cap"),
        (lambda d: entry(d, "attack").update(category="sword"), "isn't one of categories'"),
        (lambda d: d["categories"].append({"id": "sword", "name": "Sword", "description": "A sword"}), "doesn't exist"),
        (lambda d: d["settings"]["tier_odds"]["boss"].update(gold=60), "add up to 100"),
        (lambda d: d["settings"]["tier_odds"]["shop"].update(blue=0), "add up to 100"),
        (lambda d: entry(d, "attack").update(description="Attack +10% if "
                                                         "Supercalifragilisticexpialidocious hits"), "two lines"),
        (lambda d: entry(d, "type_affinity").update(related=["harvest"]), "related theme"),
        (lambda d: d["balance"]["example"].append({"buff": "galvanic", "count": 3}) or
         entry(d, "galvanic").update(ranks=[60, 80], description=["a", "b"]), "has 2 ranks"),
    ]
    for number, (change, match) in enumerate(cases):
        directory = copy_data(tmp_path / f"{number}_{match.replace(' ', '_').replace(chr(39), '')}")
        edit(directory, change)
        refused(directory, match)


def test_schema_refuses_a_gold_without_ranks_and_an_unknown_kind(tmp_path):
    directory = copy_data(tmp_path / "ranks")
    edit(directory, lambda d: entry(d, "sniper").pop("ranks"))
    with pytest.raises(datajson.DataError):
        entralink_buffs.load(directory)
    directory = copy_data(tmp_path / "kind")
    edit(directory, lambda d: entry(d, "attack").update(effect={"kind": "teleport"}))
    with pytest.raises(datajson.DataError):
        entralink_buffs.load(directory)


def test_header_is_written_once(tmp_path):
    output = tmp_path / "out.h"
    data = entralink_buffs.load()
    output.write_text(entralink_buffs.header(data, entralink_buffs.effect_kinds()))
    assert "ENTRALINK_BUFF_THEME_STALL" in output.read_text()
    assert "ENTRALINK_BUFF_CATEGORY_HEAL" in output.read_text()
    assert "ENTRALINK_BUFF_KIND_STATUS_ROLL" in output.read_text()


def fixture_catalogue() -> dict:
    """A small catalogue of the real one's shape: a blue with a soft limit, a type card, a gold of 3 ranks."""
    data = entralink_buffs.load()
    keep = [dict(entry(data, "attack")), dict(entry(data, "type_affinity")), dict(entry(data, "galvanic"))]
    keep[0].update(name="Attack", description="Attack +10%", step=10, soft_limit=6, cap=80, pools=["after_battle", "shop"],
                   bucket="atk", effect={"kind": "stat_ratio", "stat": "attack"})
    keep[1].update(description="Moves of the card's type +15% power", step=15, cap=60, related=["paralysis"])
    keep[1].pop("soft_limit", None)
    keep[2].update(description=["+60% damage to paralyzed foes", "+80% damage to paralyzed foes",
                                "+100% damage to paralyzed foes"], ranks=[60, 80, 100], price=500)
    keep[1]["effect"] = {"kind": "damage_ratio", "condition": {"card_type": True}}
    keep[1]["bucket"] = "pow"
    keep[2]["effect"] = {"kind": "damage_ratio", "condition": {"defender_status": ["paralysis"]}}
    keep[2]["bucket"] = "cond"
    data["buffs"] = keep
    caps = {"atk": 100, "pow": 100, "stab": 75, "match": 40, "cond": 125, "crit": 50, "final": 25, "def": 100,
            "guard": 50}
    data["buckets"] = [{**b, "cap": caps[b["id"]]} for b in data["buckets"] if b["id"] in caps]
    data["balance"] = {"reference_hit": 600, "example": []}
    for theme in data["themes"]:
        theme.pop("team_tags", None)
    return data


def test_cards_text_titles_colored_by_tier_with_numerals_and_types():
    data = fixture_catalogue()
    lines, titles, descriptions = entralink_buffs.messages(data)
    assert lines[:len(entralink_buffs.FIXED_MESSAGES)] == entralink_buffs.FIXED_MESSAGES
    assert titles == [5, 6, 7] and descriptions == [10, 11, 12]
    assert lines[5] == "{ff00:2}Attack{ff00:0}"
    assert lines[6] == "{ff00:478}Type Affinity ({0100:20}){ff00:0}"
    assert lines[7:10] == ["{ff00:444}Galvanic I{ff00:0}", "{ff00:444}Galvanic II{ff00:0}",
                           "{ff00:444}Galvanic III{ff00:0}"]
    # A type card's description names its type; descriptions wrap for the window's two lines
    assert lines[11] == "Moves of the {0100:20} type +15%\\npower"
    assert lines[12] == "+60% damage to paralyzed foes"
    assert entralink_buffs.wrap("+100% damage to paralyzed foes and burned foes") == \
        "+100% damage to paralyzed foes\\nand burned foes"


def test_cards_table_levels_pools_and_prices():
    data = fixture_catalogue()
    rows = entralink_buffs.table(data)
    # attack: 6 picks of 10 and then 5 a pick reach 80 at the 10th; its tier's price; pools after_battle and shop
    assert rows[0].startswith("    { 5, 10, 60, 0x0, ENTRALINK_BUFF_TIER_BLUE, ENTRALINK_BUFF_THEME_NONE, 10, 0x9, 0x0,")
    assert rows[0].rstrip().endswith("ENTRALINK_BUFF_TYPE_CARD_NONE }, /* attack */")
    # type_affinity: 4 picks to 60, related to paralysis (theme 0), type card 0
    assert ", 4, " in rows[1] and "0x1, ENTRALINK_BUFF_TIER_PURPLE" in rows[1] and rows[1].rstrip().endswith(
        "0 }, /* type_affinity */")
    # galvanic: its own price, 3 ranks
    assert rows[2].startswith("    { 7, 12, 500, 0x0, ENTRALINK_BUFF_TIER_GOLD, ENTRALINK_BUFF_THEME_PARALYSIS, 3,")
    assert entralink_buffs.max_level(entry(data, "attack")) == 10
    text = entralink_buffs.header(data, entralink_buffs.effect_kinds())
    assert "#define ENTRALINK_BUFF_TYPE_CARDS { ENTRALINK_BUFF_TYPE_AFFINITY }" in text
    assert "#define ENTRALINK_BUFF_SOURCE_SHOP 5" in text
    assert "#define ENTRALINK_BUFF_ODDS { { " in text


def test_real_catalogue_text_fits():
    data = entralink_buffs.load()
    lines, titles, descriptions = entralink_buffs.messages(data)
    assert len(titles) == len(descriptions) == len(data["buffs"])
    assert all(line.count("\\n") <= 1 for line in lines[descriptions[0]:])


def test_one_icon_a_category_in_each_tiers_palette():
    data = entralink_buffs.load()
    for category in data["categories"]:
        assert (entralink_buffs.SOURCE / "buff_icons" / f"{category['id']}.png").is_file()
    palettes = [entralink_buffs.tier_palette(entralink_buffs.SOURCE, t) for t in entralink_buffs.TIERS]
    assert all(len(p) == 16 for p in palettes)
    assert len({tuple(p) for p in palettes}) == 3
    assert {e["category"] for e in data["buffs"]} <= {c["id"] for c in data["categories"]}


def test_battle_tables_carry_kinds_conditions_and_numbers():
    """Phase 3: the battle's effects table (each card's kind, bucket, condition bits and values) and the values table
    (a stack's step, soft limit and cap; a gold's ranks)."""
    data = fixture_catalogue()
    entry(data, "galvanic")["effect"] = {"kind": "status_chance_on_hit", "status": "burn",
                                         "condition": {"any": [{"contact": True}, {"move_type": "TYPE_FIRE"}]}}
    entry(data, "galvanic").pop("bucket")
    tests = entralink_buffs.condition_tests()
    enums = entralink_buffs.effect_enums()
    rows = entralink_buffs.effects_table(data)
    assert len(rows) == 3
    assert "ENTRALINK_BUFF_KIND_STAT_RATIO, ENTRALINK_BUFF_BUCKET_ATK" in rows[0]
    # type_affinity: the card's type test, POW
    assert rows[1].startswith(f"    {{ {1 << tests.index('card_type'):#x}, 0x0, ABILITY_NONE, "
                              "ENTRALINK_BUFF_KIND_DAMAGE_RATIO, ENTRALINK_BUFF_BUCKET_POW,")
    # the any condition: contact or a Fire move, burn as its parameter
    any_mask = (1 << tests.index("contact")) | (1 << tests.index("move_type"))
    assert rows[2].startswith(f"    {{ 0x0, {any_mask:#x}, ABILITY_NONE, ENTRALINK_BUFF_KIND_STATUS_CHANCE_ON_HIT, "
                              "ENTRALINK_BUFF_NONE, 0x0, 0x0, TYPE_FIRE,")
    assert f", {enums['STATUS'].index('burn')}, 0x0, 0, 0x0," in rows[2]
    values = entralink_buffs.values_table(data)
    assert values[0].startswith("    { { 10, 6, 80 }, 0, ENTRALINK_BUFF_KIND_STAT_RATIO }")
    assert values[1].startswith("    { { 15, 0, 60 }, 0, ENTRALINK_BUFF_KIND_DAMAGE_RATIO }")
    assert values[2].startswith("    { { 60, 80, 100 }, 1, ENTRALINK_BUFF_KIND_STATUS_CHANCE_ON_HIT }")
    text = entralink_buffs.header(data, entralink_buffs.effect_kinds())
    assert "#define ENTRALINK_BUFF_BUCKET_CAPS { 100, 100, 75, 40, 125, 50, 25, 100, 50 }" in text
    assert f"#define ENTRALINK_BUFF_BOSS_BAR_HP {data['settings']['boss_bar_hp']}" in text


def test_game_handlers_keep_their_numbers_and_the_phase_4_settings():
    # The fixture has no custom card: the game's handlers are still numbered, in GAME_HANDLERS' order, and a
    # handler the game doesn't have comes after them
    data = fixture_catalogue()
    lines = entralink_buffs.header(data, entralink_buffs.effect_kinds()).splitlines()
    for i, handler in enumerate(entralink_buffs.GAME_HANDLERS):
        assert f"#define ENTRALINK_BUFF_HANDLER_{handler.upper()} {i}" in lines
    entry(data, "galvanic")["effect"] = {"kind": "custom", "handler": "not_in_the_game"}
    assert entralink_buffs.custom_handlers(data)[-1] == "not_in_the_game"
    # No max_hp card: 999; no forecast card: a placeholder the game reads as no card
    assert "#define ENTRALINK_BUFF_MAX_HP_LIMIT 999" in lines
    assert "#define ENTRALINK_BUFF_WEATHER_CHOICE { 255 }" in lines
    entry(data, "attack")["effect"] = {"kind": "max_hp", "limit": 800}
    entry(data, "galvanic")["effect"] = {"kind": "custom", "handler": "forecast"}
    lines = entralink_buffs.header(data, entralink_buffs.effect_kinds()).splitlines()
    assert "#define ENTRALINK_BUFF_MAX_HP_LIMIT 800" in lines
    assert "#define ENTRALINK_BUFF_WEATHER_CHOICE_COUNT 1" in lines
    assert "#define ENTRALINK_BUFF_WEATHER_CHOICE { 2 }" in lines


def test_an_id_that_spells_another_name_is_refused():
    data = fixture_catalogue()
    entry(data, "attack")["id"] = "stat_speed"
    with pytest.raises(datajson.DataError, match="ENTRALINK_BUFF_STAT_SPEED is defined twice"):
        entralink_buffs.header(data, entralink_buffs.effect_kinds())


def test_bar_colors(tmp_path):
    """Phase 5: the health bars' colours as RGB555, a light one and its dark rows at 55%; the most bars one more."""
    data = fixture_catalogue()
    data["settings"]["bar_colors"] = ["#f80000", "#0000f8"]
    assert entralink_buffs.bar_colors(data["settings"]) == [(0x001f, 0x0011), (0x7c00, 0x4400)]
    assert "#define ENTRALINK_BUFF_BAR_MAX 3" in entralink_buffs.header(data, entralink_buffs.effect_kinds())
    directory = copy_data(tmp_path)
    edit(directory, lambda data: data["settings"].update(bar_colors=["red"]))
    with pytest.raises(datajson.DataError, match="bar_colors"):
        entralink_buffs.load(directory)


def test_team_tags_and_stat_cards():
    """Rebalance 2: the themes' team tags packed as one list of moves and one of abilities with each theme's start, and
    the own-type flag as a theme's bit; the cards that raise a stat on every hit (no condition, no scale)."""
    data = fixture_catalogue()
    constants = datajson.constants()
    data["themes"][0]["team_tags"] = {"moves": ["MOVE_THUNDER_WAVE", "MOVE_SPORE"], "abilities": ["ABILITY_STATIC"]}
    data["themes"][2]["team_tags"] = {"moves": ["MOVE_TOXIC"], "stab_moves": True}
    data["settings"].update(team_theme_weight=50, team_theme_max=300)
    tags = entralink_buffs.team_tags(data)
    count = len(data["themes"])
    assert tags["moves"] == [constants["MOVE_THUNDER_WAVE"], constants["MOVE_SPORE"], constants["MOVE_TOXIC"]]
    assert tags["move_starts"] == [0, 2, 2] + [3] * (count - 2)
    assert tags["abilities"] == [constants["ABILITY_STATIC"]] and tags["ability_starts"] == [0] + [1] * count
    assert tags["stab"] == 1 << 2
    lines = entralink_buffs.header(data, entralink_buffs.effect_kinds()).splitlines()
    assert "#define ENTRALINK_BUFF_TEAM_THEME_WEIGHT 50" in lines and "#define ENTRALINK_BUFF_TEAM_THEME_MAX 300" in lines
    assert "#define ENTRALINK_BUFF_TEAM_STAB_THEMES 0x4" in lines
    # Attack (no condition) is a stat card; with a condition it isn't
    assert [e["id"] for e in entralink_buffs.stat_cards(data)] == ["attack"]
    assert "#define ENTRALINK_BUFF_STAT_CARDS { { ENTRALINK_BUFF_ATTACK, ENTRALINK_BUFF_STAT_ATTACK, " \
           "ENTRALINK_BUFF_BUCKET_ATK } }" in lines
    entry(data, "attack")["effect"]["condition"] = {"attacker_status": ["burn"]}
    assert entralink_buffs.stat_cards(data) == []


def test_real_team_tags_are_known_constants():
    """Every move and ability of the real themes' team tags resolves (whatever the user lists)."""
    data = entralink_buffs.load()
    tags = entralink_buffs.team_tags(data)
    assert len(tags["move_starts"]) == len(tags["ability_starts"]) == len(data["themes"]) + 1
    assert tags["move_starts"] == sorted(tags["move_starts"])
