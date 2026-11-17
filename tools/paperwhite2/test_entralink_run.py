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


def test_draw_problems(tmp_path):
    directory = copy_data(tmp_path)
    run, rooms = entralink_run.load_run(directory), entralink_run.load_rooms(directory)
    # The real run: 9 rooms from 3 generic ones repeat, a warning only
    assert entralink_run.draw_problems(run, rooms) == [("warning", "the rounds draw 9 rooms from 3, so rooms come up "
                                                        "more than once in a run (the least used first, never twice in a row)")]
    assert entralink_run.boss_pool(rooms, 1) == ["ho_oh"] and entralink_run.boss_pool(rooms, 2) == ["time_and_space"]
    # More rooms in a round than can come up in it still packs
    edit(directory / "run.json", lambda data: data["rounds"][0].update(rooms=4))
    entralink_run.tables(directory)
    # A round with no room at all can't
    for name in ("dialga", "prince_or_princess", "rayquaza_raid"):
        edit(room(directory, name), lambda data: data.update(rounds=[2, 3]))
    with pytest.raises(datajson.DataError, match="round 1 draws 4 rooms, but no room"):
        entralink_run.tables(directory)


def test_boss_pool_falls_back_to_generic_bosses(tmp_path):
    directory = copy_data(tmp_path)
    edit(room(directory, "time_and_space"), lambda data: data.pop("rounds"))
    rooms = entralink_run.load_rooms(directory)
    assert entralink_run.boss_pool(rooms, 1) == ["ho_oh"] and entralink_run.boss_pool(rooms, 2) == ["time_and_space"]
    edit(room(directory, "time_and_space"), lambda data: data.update(role="room"))
    with pytest.raises(datajson.DataError, match="round 2 ends with a boss"):
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
    next_catch = json.loads((directory / "progress_ids.json").read_text())["next_catch"]
    edit(room(directory, "dialga"), lambda data: data["battles"][0]["enemies"][0].update(
        catch={"after": ["dialga/dialga"]}, progress_id=next_catch))
    with pytest.raises(datajson.DataError, match="next_catch"):
        entralink_run.tables(directory)
    edit(directory / "progress_ids.json", lambda data: data.update(next_catch=next_catch + 1))
    entralink_run.tables(directory)
    edit(room(directory, "ho_oh"), lambda data: data["battles"][0]["enemies"][0].update(catch={}, progress_id=next_catch))
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
    edit(room(directory, "ho_oh"), lambda data: data["npcs"][0].update(
        dialogue={"after": "Burn{be01}", "after_style": "yell"}))
    data = entralink_run.tables(directory)
    row = data["rooms"][data["ids"].index("ho_oh")]
    ho_oh = [data["npcs"][row["firstNpc"]], data["npcs"][row["firstNpc"] + row["npcCount"] - 1]]
    lines = entralink_run.dialogue_lines(directory)
    assert lines[ho_oh[0]["after"]] == "Burn{be01}" and ho_oh[0]["before"] == entralink_run.NONE16
    assert ho_oh[0]["afterStyle"] == entralink_run.STYLES["yell"] and ho_oh[0]["beforeStyle"] == entralink_run.STYLES["talk"]
    assert lines[ho_oh[1]["before"]] == "Take this,\\n{0100:0}." and ho_oh[1]["after"] == entralink_run.NONE16
    requirements = data["requirements"][ho_oh[1]["firstRequirement"]:][:ho_oh[1]["requirementCount"]]
    assert requirements == [entralink_run.REQUIRE_RUN_COMPLETED, 1]
    assert ho_oh[1]["sprite"] == datajson.constants()["OBJ_CODE_110"] and ho_oh[1]["chance"] == 50
