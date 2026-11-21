"""Tests of tools/paperwhite2/entralink_random.py and the random rooms' rows of tools/paperwhite2/entralink_run.py:
fixtures' settings, and only validity on the real data."""
import json
import shutil
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data import datajson, species_list  # noqa: E402
from tools.paperwhite2 import entralink_random, entralink_run  # noqa: E402

# A clearing with every tile walkable, and one with a wall at x 10 z 15
OPEN = [0] * 32
WALLED = [0] * 15 + [1 << 10] + [0] * 16
SPOTS = [(15, 12), (21, 16), (9, 16)]


def copy_data(tmp_path: Path) -> Path:
    directory = tmp_path / "entralink"
    shutil.copytree(entralink_random.SOURCE, directory)
    return directory


def edit_run(directory: Path, change):
    path = directory / "run.json"
    data = json.loads(path.read_text())
    change(data)
    path.write_text(json.dumps(data))


def test_real_data_is_valid():
    data = entralink_random.tables(entralink_random.SOURCE)
    assert data["species"]
    text = entralink_random.header(entralink_random.SOURCE)
    assert f"#define ENTRALINK_RANDOM_SPECIES_FILE {entralink_random.species_file(entralink_random.SOURCE)}" in text
    member = entralink_random.species_member(data["species"])
    assert len(member) == entralink_random.ROW_SIZE * len(data["species"]) == 12 * len(data["species"])


def test_archive(tmp_path):
    """The species' table goes after the run's markers and icons, and only there."""
    from tools.data.narc import read_narc, write_narc
    count = entralink_random.species_file(entralink_random.SOURCE)
    source = tmp_path / "in.narc"
    source.write_bytes(write_narc([bytes([i]) for i in range(count)]))
    entralink_random.archive(source, tmp_path / "out.narc")
    files = read_narc((tmp_path / "out.narc").read_bytes())
    assert len(files) == count + 1 and files[count][:2] != b"" and len(files[count]) % entralink_random.ROW_SIZE == 0
    source.write_bytes(write_narc([b"x"] * (count - 1)))
    with pytest.raises(datajson.DataError, match="members"):
        entralink_random.archive(source, tmp_path / "out.narc")


def test_species_rules():
    """No species listed as legendary, none outside the Pokédex, each with a walking or follower sprite and a damaging
    move it knows at the level, its family its line's first species."""
    names = species_list.constants()
    excluded = {names[1], names[4]}
    rows = entralink_random.species_rows(70, excluded)
    numbers = {row["species"] for row in rows}
    assert 1 not in numbers and 4 not in numbers
    assert numbers <= set(species_list.pokedex_species())
    constants = datajson.constants()
    damaging = {}
    for row in rows:
        data = species_list.species_data(row["species"])
        assert row["bst"] == sum(data["base_stats"].values())
        assert any(level <= 70 and entralink_random.is_damaging(move, damaging)
                   for level, move in data["learnset"]["by_level"])
        sprite = entralink_run.npc_sprite({"species": names[row["species"]]}, constants)
        assert row["sprite"] == constants[sprite]
        female = entralink_run.npc_sprite({"species": names[row["species"]], "gender": "female"}, constants)
        assert row["sprite"] + row["female"] == constants[female]
        assert species_list.species_data(row["family"]) is not None
    by_number = {row["species"]: row for row in rows}
    # (an evolution's family is its line's first: Ivysaur's and Venusaur's are the same, never itself when it evolves
    # from another)
    if 2 in by_number and 3 in by_number:
        assert by_number[2]["family"] == by_number[3]["family"] == 1


def test_stand_in(tmp_path):
    """A follower showing another species' art (a new species' copy of its template's) is a stand-in; its own walking
    sprite's, a sprite of its own and a walking sprite aren't."""
    saved = entralink_random.ACTORS
    entralink_random.ACTORS = tmp_path
    try:
        for name, shown in (("newmon", "OBJ_CODE_POKEMON_BUDEW"), ("pikachu", "OBJ_CODE_POKEMON_PIKACHU_MALE"),
                            ("haxorus_female", "OBJ_CODE_FOLLOWER_HAXORUS"), ("haxorus", None)):
            (tmp_path / "followers" / name).mkdir(parents=True)
            (tmp_path / "followers" / name / "data.json").write_text(json.dumps({"sprite": shown} if shown else {}))
        assert entralink_random.stand_in("OBJ_CODE_FOLLOWER_NEWMON", "SPECIES_NEWMON")
        assert not entralink_random.stand_in("OBJ_CODE_FOLLOWER_PIKACHU", "SPECIES_PIKACHU")
        assert not entralink_random.stand_in("OBJ_CODE_FOLLOWER_HAXORUS_FEMALE", "SPECIES_HAXORUS")
        assert not entralink_random.stand_in("OBJ_CODE_FOLLOWER_HAXORUS", "SPECIES_HAXORUS")
        assert not entralink_random.stand_in("OBJ_CODE_POKEMON_BUDEW", "SPECIES_BUDEW")
    finally:
        entralink_random.ACTORS = saved


def test_defaults_and_bands(tmp_path):
    directory = copy_data(tmp_path)
    edit_run(directory, lambda data: (data.pop("random_rooms", None), data.pop("random_enemy_chance", None)))
    given = entralink_random.settings(entralink_run.load_run(directory))
    assert given["format_weights"] == entralink_random.DEFAULT_FORMAT_WEIGHTS
    assert given["anchors"] == entralink_random.DEFAULT_ANCHORS
    edit_run(directory, lambda data: data.update(random_rooms={"bst": [{"min": 200, "max": 300}]}))
    assert entralink_random.settings(entralink_run.load_run(directory))["bst"] == [{"min": 200, "max": 300}] * 3
    edit_run(directory, lambda data: data.update(random_rooms={"bst": [{"min": 400, "max": 300}]}))
    with pytest.raises(datajson.DataError, match="above its max"):
        entralink_random.tables(directory)
    edit_run(directory, lambda data: data.update(random_rooms={"bst": [{"min": 1400, "max": 1500}]}))
    with pytest.raises(datajson.DataError, match="no species has a base stat total"):
        entralink_random.tables(directory)
    edit_run(directory, lambda data: data.update(random_rooms={"format_weights": {"single": 0, "double": 0,
                                                                                  "triple": 0}}))
    with pytest.raises(datajson.DataError, match="add up to 0"):
        entralink_random.tables(directory)


def test_anchor_problems():
    one, two, three = entralink_random.DEFAULT_ANCHORS
    assert entralink_random.anchor_problems([one, two, three], {"a": OPEN}, SPOTS) == []
    # A wall under a triple's back tile, choices too close, the wrong count, an exit
    assert "can't be walked on in b" in entralink_random.anchor_problems([[[11, 16]], two, three], {"b": WALLED},
                                                                         SPOTS)[0]
    assert entralink_random.anchor_problems([one, [[12, 15], [15, 15]], three], {"a": OPEN}, SPOTS) == [
        "random_rooms.anchors[1][1] stands within a tile of choice 0"]
    assert entralink_random.anchor_problems([[[15, 15], [20, 15]], two, three], {"a": OPEN}, SPOTS) == [
        "random_rooms.anchors[0] has 2 anchors, not 1"]
    assert "an exit" in entralink_random.anchor_problems([[[15, 10]], two, three], {"a": OPEN}, SPOTS)[0]


def test_bad_anchor_refused(tmp_path):
    directory = copy_data(tmp_path)
    edit_run(directory, lambda data: data.setdefault("random_rooms", {}).update(
        anchors=[[[15, 12]], [[12, 15], [19, 15]], [[10, 15], [15, 15], [20, 15]]]))
    with pytest.raises(datajson.DataError, match="anchors"):
        entralink_random.tables(directory)


def test_random_rows_and_chance(tmp_path):
    """The room table ends with the two random rooms' rows (enemy and enemy_choice, their markers, never in a pool),
    and an enemy or enemy_choice door is never skipped while the chance is above 0."""
    directory = copy_data(tmp_path)
    data = entralink_run.tables(directory)
    enemy, choice = (data["rooms"][data["random_rooms"][kind]] for kind in entralink_run.RANDOM_TYPES)
    assert data["rooms"][-2:] == [enemy, choice]
    assert enemy["random"] == choice["random"] == 1 and enemy["template"] == choice["template"] == 1
    assert enemy["type"] == entralink_run.ROOM_TYPES["enemy"] and choice["type"] == entralink_run.ROOM_TYPES[
        "enemy_choice"]
    assert choice["marker"] == entralink_run.MARKER_TYPES.index("enemy_choice")
    assert not any(row["random"] for row in data["rooms"][:-2])
    text = entralink_run.header(directory)
    assert f"#define ENTRALINK_RUN_RANDOM_CHOICE_ROOM {data['random_rooms']['enemy_choice']}" in text
    # With no premade enemy_choice room, the type is skipped only when random rooms are off
    round_ = {"rooms": 2, "type_weights": {kind: 0 for kind in entralink_run.ROOM_TYPES} | {"enemy_choice": 1}}
    assert entralink_run.type_problems(round_, 1, {}, {}, 50) == []
    assert entralink_run.type_problems(round_, 1, {}, {}, 0)[0][0] == "error"
