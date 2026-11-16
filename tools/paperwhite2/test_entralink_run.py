"""Tests of tools/paperwhite2/entralink_run.py: the real data packs, and broken copies of it are refused."""
import json
import shutil
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data import datajson  # noqa: E402
from tools.paperwhite2 import entralink_run  # noqa: E402


def copy_data(tmp_path: Path) -> Path:
    directory = tmp_path / "entralink"
    shutil.copytree(entralink_run.SOURCE, directory)
    return directory


def edit(path: Path, change):
    data = json.loads(path.read_text())
    change(data)
    path.write_text(json.dumps(data))


def room(directory: Path, name: str) -> Path:
    return directory / "rooms" / f"{name}.json"


def test_real_data_packs():
    data = entralink_run.tables(entralink_run.SOURCE)
    assert any(r["role"] == entralink_run.ROLES["final"] for r in data["rooms"])
    text = entralink_run.header(entralink_run.SOURCE)
    assert "#define ENTRALINK_RUN_ROOMS" in text and "#define ENTRALINK_RUN_NPCS" in text
    assert entralink_run.dialogue_lines()[0] == ""


def test_raid_takes_one_enemy(tmp_path):
    directory = copy_data(tmp_path)
    edit(room(directory, "rayquaza_raid"), lambda data: data["battles"][0]["enemies"].append(
        dict(data["battles"][0]["enemies"][0])))
    with pytest.raises(datajson.DataError, match="raid"):
        entralink_run.tables(directory)


def test_npc_names_a_missing_battle(tmp_path):
    directory = copy_data(tmp_path)
    edit(room(directory, "dialga"), lambda data: data["npcs"][0].update(battle="missing"))
    with pytest.raises(datajson.DataError, match="missing"):
        entralink_run.tables(directory)


def test_too_many_rooms_for_a_round(tmp_path):
    directory = copy_data(tmp_path)
    edit(directory / "run.json", lambda data: data["rounds"][0].update(rooms=4))
    with pytest.raises(datajson.DataError, match="round 1"):
        entralink_run.tables(directory)


def test_bad_ability(tmp_path):
    directory = copy_data(tmp_path)
    edit(room(directory, "dialga"), lambda data: data["battles"][0]["enemies"][0].update(ability="ABILITY_NOPE"))
    with pytest.raises(datajson.DataError, match="ability"):
        entralink_run.tables(directory)


def test_missing_progress_id(tmp_path):
    directory = copy_data(tmp_path)
    edit(room(directory, "dialga"), lambda data: data["battles"][0].pop("progress_id"))
    with pytest.raises(datajson.DataError, match="progress_id"):
        entralink_run.tables(directory)


def test_duplicate_progress_id(tmp_path):
    directory = copy_data(tmp_path)
    edit(room(directory, "dialga"), lambda data: data["battles"][0].update(progress_id=0))
    with pytest.raises(datajson.DataError, match="as darkrai/darkrai has"):
        entralink_run.tables(directory)


def test_catch_needs_its_own_id_below_the_next(tmp_path):
    directory = copy_data(tmp_path)
    edit(room(directory, "dialga"), lambda data: data["battles"][0]["enemies"][0].update(
        catch={"after": ["dialga/dialga"]}, progress_id=0))
    with pytest.raises(datajson.DataError, match="next_catch"):
        entralink_run.tables(directory)
    edit(directory / "progress_ids.json", lambda data: data.update(next_catch=1))
    entralink_run.tables(directory)
    edit(room(directory, "ho_oh"), lambda data: data["battles"][0]["enemies"][0].update(catch={}, progress_id=0))
    with pytest.raises(datajson.DataError, match="as dialga/dialga's SPECIES_DIALGA has"):
        entralink_run.tables(directory)


def test_requirement_names_a_battle(tmp_path):
    directory = copy_data(tmp_path)
    edit(room(directory, "ho_oh"), lambda data: data["npcs"][0].update(requires=["dialga/nothing"]))
    with pytest.raises(datajson.DataError, match="dialga/nothing"):
        entralink_run.tables(directory)


def test_dialogue_and_requirements_pack(tmp_path):
    directory = copy_data(tmp_path)
    edit(room(directory, "ho_oh"), lambda data: data["npcs"].append(
        {"type": "item", "item": "ITEM_POTION", "count": 2, "requires": ["run/completed", "dialga/dialga"],
         "chance": 50, "dialogue": {"before": "Take this,\n{0100:0}.", "after": "ignored"},
         "x": 12, "z": 18, "facing": "DIR_DOWN"}))
    edit(room(directory, "ho_oh"), lambda data: data["npcs"][0].update(dialogue={"after": "Burn{be01}"}))
    data = entralink_run.tables(directory)
    ho_oh = data["npcs"][data["rooms"][data["ids"].index("ho_oh")]["firstNpc"]:][:2]
    lines = entralink_run.dialogue_lines(directory)
    assert lines[ho_oh[0]["after"]] == "Burn{be01}" and ho_oh[0]["before"] == entralink_run.NONE16
    assert lines[ho_oh[1]["before"]] == "Take this,\\n{0100:0}." and ho_oh[1]["after"] == entralink_run.NONE16
    requirements = data["requirements"][ho_oh[1]["firstRequirement"]:][:ho_oh[1]["requirementCount"]]
    assert requirements == [entralink_run.REQUIRE_RUN_COMPLETED, 1]
    assert ho_oh[1]["sprite"] == datajson.constants()["OBJ_CODE_110"] and ho_oh[1]["chance"] == 50
