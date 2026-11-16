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


def test_real_data_packs():
    data = entralink_run.tables(entralink_run.SOURCE)
    assert len(data["pool"]) >= data["pool_rooms"]
    assert "#define ENTRALINK_RUN_CHALLENGES" in entralink_run.header(entralink_run.SOURCE)


def test_raid_takes_one_enemy(tmp_path):
    directory = copy_data(tmp_path)
    edit(directory / "challenges" / "rayquaza_raid.json",
         lambda data: data["enemies"].append(dict(data["enemies"][0])))
    with pytest.raises(datajson.DataError, match="raid"):
        entralink_run.tables(directory)


def test_unknown_challenge_in_pool(tmp_path):
    directory = copy_data(tmp_path)
    edit(directory / "run.json", lambda data: data["pool"].append("missing"))
    with pytest.raises(datajson.DataError, match="missing"):
        entralink_run.tables(directory)


def test_too_many_pool_rooms(tmp_path):
    directory = copy_data(tmp_path)
    edit(directory / "run.json", lambda data: data.update(pool_rooms=4))
    with pytest.raises(datajson.DataError, match="pool_rooms"):
        entralink_run.tables(directory)


def test_bad_ability(tmp_path):
    directory = copy_data(tmp_path)
    edit(directory / "challenges" / "dialga.json", lambda data: data["enemies"][0].update(ability="ABILITY_NOPE"))
    with pytest.raises(datajson.DataError, match="ability"):
        entralink_run.tables(directory)
