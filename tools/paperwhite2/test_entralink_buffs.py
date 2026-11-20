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
    tiers = [e["tier"] for e in data["buffs"]]
    assert (tiers.count("blue"), tiers.count("purple"), tiers.count("gold")) == (10, 35, 68)


def test_picked_value_halves_past_the_soft_limit():
    assert entralink_buffs.picked_value(10, 6, 80, 3) == 30
    assert entralink_buffs.picked_value(10, 6, 80, 7) == 65
    assert entralink_buffs.picked_value(10, 6, 80, 20) == 80
    assert entralink_buffs.picked_value(15, None, 60, 2) == 30
    assert entralink_buffs.picked_value(-1, None, -2, 5) == -2


def test_meter_gives_the_docs_numbers():
    data = entralink_buffs.load()
    data["balance"]["reference_hit"] = 600
    top = entralink_buffs.ceiling(data)
    # 5.2: every attack bucket at its cap, 2.0 x 2.0 x 1.5 x 1.4 x 2.25 x 1.25 = 23.6, and x2 x1.25 on a critical hit
    assert round(top["factor"], 3) == 23.625
    assert round(top["critical_factor"], 2) == 59.06
    assert round(top["hit"]) == 14175 and round(top["critical_hit"]) == 35438
    assert round(entralink_buffs.ceiling(data, 800)["critical_hit"]) == 47250
    # 5.3: the paralysis set, ATK 1.3 x POW 2.0 x STAB 1.33 x MATCH 1.08 x COND 2.02 = 7.6, 4,500 on 600
    typical = entralink_buffs.example_hit(data)
    assert round(typical["factor"], 2) == 7.56
    assert round(typical["hit"]) == 4538


def test_resisted_and_non_stab_bonuses_are_left_out_of_the_strongest_hit():
    data = entralink_buffs.load()
    sums = entralink_buffs.ceiling(data)["sums"]
    match = sum(entralink_buffs.strongest(e) for e in data["buffs"] if e.get("bucket") == "match"
                and entralink_buffs.in_strongest_hit(e))
    assert sums["match"] == match
    assert not entralink_buffs.in_strongest_hit(entry(data, "tinted"))
    assert not entralink_buffs.in_strongest_hit(entry(data, "coverage"))


def test_passing_the_cap_warns(tmp_path):
    directory = copy_data(tmp_path)
    edit(directory, lambda d: d["balance"].update(reference_hit=2000))
    warnings = entralink_buffs.problems(entralink_buffs.load(directory), directory)
    assert any("passes the damage cap" in w for w in warnings)


def test_broken_catalogues_are_refused(tmp_path):
    cases = [
        (lambda d: d["buffs"].append(dict(entry(d, "attack"))), "used twice"),
        (lambda d: entry(d, "galvanic").update(theme="thunder"), "isn't one of themes'"),
        (lambda d: entry(d, "overcharge").update(core=True), "already has a core gold"),
        (lambda d: entry(d, "attack").pop("bucket"), "adds to a bucket"),
        (lambda d: entry(d, "speed").update(bucket="atk"), "isn't damage"),
        (lambda d: entry(d, "defense").update(bucket="atk"), "defense side"),
        (lambda d: entry(d, "galvanic").update(description=["one line"]), "a line per rank"),
        (lambda d: entry(d, "attack").update(step=90), "within the cap"),
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
    keep[0].update(description="Attack +10%", step=10, soft_limit=6, cap=80, pools=["after_battle", "shop"])
    keep[1].update(description="Moves of the card's type +15% power", step=15, cap=60, related=["paralysis"])
    keep[1].pop("soft_limit", None)
    keep[2].update(description=["+60% damage to paralyzed foes", "+80% damage to paralyzed foes",
                                "+100% damage to paralyzed foes"], ranks=[60, 80, 100], price=500)
    data["buffs"] = keep
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
