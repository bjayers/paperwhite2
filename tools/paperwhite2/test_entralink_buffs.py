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
        (lambda d: entry(d, "attack").update(icon="nothing.png"), "doesn't exist"),
        (lambda d: d["settings"]["tier_odds"]["boss"].update(gold=60), "add up to 100"),
        (lambda d: entry(d, "type_affinity").update(related=["harvest"]), "related theme"),
        (lambda d: d["balance"]["example"].append({"buff": "galvanic", "count": 3}) or
         entry(d, "galvanic").update(ranks=[60, 80], description=["a", "b"]), "has 2 ranks"),
    ]
    for change, match in cases:
        directory = copy_data(tmp_path / match.replace(" ", "_").replace("'", ""))
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
    assert "ENTRALINK_BUFF_KIND_STATUS_ROLL" in output.read_text()
