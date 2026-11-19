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
    # A round with no room at all can't, without the templates (step 6)
    for name in ("dialga", "prince_or_princess", "rayquaza_raid"):
        edit(room(directory, name), lambda data: data.update(rounds=[2, 3]))
    rooms = entralink_run.load_rooms(directory)
    assert ("error", "round 1 draws 4 rooms, but no room can come up in it (role room, rounds left out or naming "
            "it)") in entralink_run.draw_problems(entralink_run.load_run(directory), rooms)
    # With them its doors draw the templates' types; with every weight 0 it can't
    entralink_run.tables(directory)
    edit(directory / "run.json", lambda data: data["rounds"][0].update(
        type_weights={kind: 0 for kind in entralink_run.ROOM_TYPES}))
    with pytest.raises(datajson.DataError, match="round 1's room type weights add up to 0"):
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


def test_markers_and_round_fogs_pack(tmp_path):
    directory = copy_data(tmp_path)
    edit(room(directory, "ho_oh"), lambda data: data["npcs"][0].update(marker="rest"))
    edit(room(directory, "dialga"), lambda data: data.update(marker="challenge"))
    edit(directory / "run.json", lambda data: (data.pop("pre_boss_map"), data.pop("marker_spots"),
                                                 data["rounds"][1].pop("field_weather"),
                                                 data.update(field_weather="WEATHER_RAIN", unknown_chance=40)))
    data = entralink_run.tables(directory)
    rows = {name: row for name, row in zip(data["ids"], data["rooms"])}
    markers = entralink_run.MARKER_TYPES
    assert rows["dialga"]["marker"] == markers.index("challenge")
    assert rows["ho_oh"]["marker"] == markers.index("boss") and rows["darkrai"]["marker"] == markers.index("final")
    assert rows["rayquaza_raid"]["marker"] == markers.index("enemy")
    assert data["npcs"][rows["ho_oh"]["firstNpc"]]["marker"] == data["npc_markers"].index("rest")
    assert data["npcs"][rows["dialga"]["firstNpc"]]["marker"] == entralink_run.NPC_MARKER_NONE
    weathers = entralink_run.field_weathers()
    # A round without a fog takes the run's field_weather
    assert [w for _, _, w, _ in data["rounds"]] == [weathers["WEATHER_CUSTOM_TINT_9"], weathers["WEATHER_RAIN"],
                                                  weathers["WEATHER_CUSTOM_TINT_7"]]
    assert data["pre_boss_zone"][1] == entralink_run.PRE_BOSS_ZONE_NONE and data["unknown_chance"] == 40
    assert data["marker_spots"] == [tuple(entralink_run.DEFAULT_MARKER_SPOTS[d]) for d in entralink_run.DOORS]
    assert "#define ENTRALINK_RUN_MARKER_SPOTS { { 15, 12 }, { 21, 16 }, { 9, 16 } }" in entralink_run.header(directory)


def test_npc_marker_needs_its_art(tmp_path):
    directory = copy_data(tmp_path)
    edit(room(directory, "ho_oh"), lambda data: data["npcs"][0].update(marker="nothing"))
    with pytest.raises(datajson.DataError, match="npc_markers/nothing.png"):
        entralink_run.tables(directory)


def test_marker_members(tmp_path):
    members = entralink_run.marker_members()
    assert len(members) == (len(entralink_run.MARKER_TYPES) + len(entralink_run.npc_marker_names())
                            + len(entralink_run.icon_items()))
    assert all(member[:4] == b"BTX0" for member in members)
    directory = copy_data(tmp_path)
    (directory / "markers" / "boss.png").write_bytes((directory / "npc_markers" / "rest.png").read_bytes())
    with pytest.raises(datajson.DataError, match="must be 32 by 32"):
        entralink_run.marker_members(directory)
    (directory / "markers" / "boss.png").unlink()
    with pytest.raises(datajson.DataError, match="missing"):
        entralink_run.marker_members(directory)


def test_ground_markers_are_packed_upside_down(tmp_path):
    # The game's flat billboards put a texture's top edge on the quad's south side, so a ground marker's rows are
    # packed reversed: its PNG's top is toward the north, as the player sees it from the south
    from tools.data.nitro_2d import read_indexed_png, write_indexed_png
    width, height, pixels, colors = read_indexed_png(entralink_run.SOURCE / "markers" / "enemy.png")
    size = entralink_run.MARKER_SIZE
    rows = [pixels[row * size:(row + 1) * size] for row in range(size)]
    assert rows != rows[::-1]
    flipped = tmp_path / "enemy.png"
    flipped.write_bytes(write_indexed_png(size, size, b"".join(reversed(rows)), colors))
    path = entralink_run.SOURCE / "markers" / "enemy.png"
    assert entralink_run.marker_texture(path, size, flat=True) == entralink_run.marker_texture(flipped, size)
    assert entralink_run.marker_texture(path, size, flat=True) != entralink_run.marker_texture(path, size)


def test_room_types_and_templates_pack(tmp_path):
    directory = copy_data(tmp_path)
    edit(room(directory, "dialga"), lambda data: data.update(type="challenge"))
    edit(directory / "run.json", lambda data: data["rounds"][0].update(type_weights={"shop": 0, "enemy": 7}))
    data = entralink_run.tables(directory)
    rows = {row["name"]: row for row in data["rooms"]}
    markers, types = entralink_run.MARKER_TYPES, entralink_run.ROOM_TYPES
    assert rows["dialga"]["type"] == types["challenge"] and rows["dialga"]["marker"] == markers.index("challenge")
    assert rows["templates/item"]["template"] == 1 and rows["templates/item"]["marker"] == markers.index("gift")
    assert rows["templates/pre_boss_rest"]["type"] == types["rest"]
    assert rows["templates/pre_boss_rest"]["marker"] == markers.index("rest")
    assert data["type_templates"][types["enemy"]] == entralink_run.TEMPLATE_NONE
    assert data["type_templates"][types["shop"]] == data["templates"]["shop"]
    weights = data["rounds"][0][3]
    assert weights[types["shop"]] == 0 and weights[types["enemy"]] == 7 and weights[types["rest"]] == 10
    # The pre-boss rests count: 3 rounds of 3 rooms, 2 bosses, 3 rests and the final
    assert entralink_run.place_count(entralink_run.load_run(directory)) == 15


def test_missing_template(tmp_path):
    directory = copy_data(tmp_path)
    (directory / "templates" / "shop.json").unlink()
    with pytest.raises(datajson.DataError, match="shop.json is missing: the run draws it"):
        entralink_run.tables(directory)
    # No round draws a shop: only a warning, and its doors skip the type
    edit(directory / "run.json", lambda data: [r.update(type_weights={"shop": 0}) for r in data["rounds"]])
    data = entralink_run.tables(directory)
    assert data["type_templates"][entralink_run.ROOM_TYPES["shop"]] == entralink_run.TEMPLATE_NONE
    (directory / "templates" / "pre_boss_rest.json").unlink()
    with pytest.raises(datajson.DataError, match="pre_boss_rest.json is missing"):
        entralink_run.tables(directory)


def test_template_type_is_its_files(tmp_path):
    directory = copy_data(tmp_path)
    edit(directory / "templates" / "item.json", lambda data: data.update(type="rest"))
    with pytest.raises(datajson.DataError, match="its type is item"):
        entralink_run.tables(directory)


def test_items_and_icons_pack(tmp_path):
    data = entralink_run.tables(entralink_run.SOURCE)
    icons = entralink_run.icon_items()
    rows = {row["name"]: row for row in data["items"]}
    assert rows["ITEM_POTION"]["icon"] == entralink_run.ICON_NONE and rows["ITEM_REVIVE"]["icon"] == icons.index("ITEM_REVIVE")
    assert rows["ITEM_HYPER_POTION"]["rounds"] == 0b110
    assert rows["ITEM_NIGHTMARE_BALL"]["pools"] == 0b111
    # The bag's own icon and palette: the Super Potion shares the Potion's icon, with its own palette
    icon, palette = entralink_run.item_icon_files("ITEM_SUPER_POTION")
    assert icon.parent.name == "potion" and palette.parent.name == "super_potion"
    assert entralink_run.icon_texture("ITEM_SUPER_POTION")[:4] == b"BTX0"
    directory = copy_data(tmp_path)
    edit(directory / "items.json", lambda data: data["items"][0].update(pools=["nowhere"]))
    with pytest.raises(datajson.DataError, match="nowhere"):
        entralink_run.tables(directory)


def test_clearings_pack(tmp_path):
    data = entralink_run.tables(entralink_run.SOURCE)
    clearings = {c["name"]: c for c in data["clearings"]}
    assert set(clearings) == {"ZONE_ENTREE_FOREST", "ZONE_ENTREE_FOREST_6", "ZONE_ENTREE_FOREST_10",
                              "ZONE_ENTREE_FOREST_2"}
    forest = clearings["ZONE_ENTREE_FOREST"]
    # The arrival tile can be walked on, the forest's edge can't
    assert not forest["blocked"][23] >> 15 & 1 and forest["blocked"][0] == 0xffffffff
    flowers = data["flower_tiles"][forest["firstFlower"]:][:forest["flowerCount"]]
    assert (18, 10) in flowers and len(flowers) == forest["flowerCount"] > 0
    directory = copy_data(tmp_path)
    edit(directory / "flower_tiles.json", lambda data: data.update(ZONE_ENTREE_FOREST_99=[[1, 2]]))
    with pytest.raises(datajson.DataError, match="not an Entree Forest clearing"):
        entralink_run.tables(directory)


def test_draw_problems_with_templates(tmp_path):
    directory = copy_data(tmp_path)
    run, rooms = entralink_run.load_run(directory), entralink_run.load_rooms(directory)
    templates = entralink_run.load_templates(directory)
    problems = entralink_run.draw_problems(run, rooms, templates)
    assert ("warning", "round 1: no challenge or event room can come up, so those types are skipped") in problems
    assert not [p for p in problems if p[0] == "error"]
    # No premade room in round 1: its doors still draw the templates' types
    for name in ("dialga", "prince_or_princess", "rayquaza_raid"):
        edit(room(directory, name), lambda data: data.update(rounds=[2, 3]))
    rooms = entralink_run.load_rooms(directory)
    assert not [p for p in entralink_run.draw_problems(run, rooms, templates) if p[0] == "error"]
    run["rounds"][0]["type_weights"] = {kind: 0 for kind in entralink_run.ROOM_TYPES}
    assert ("error", "round 1's room type weights add up to 0, so its doors can't draw a room") in \
        entralink_run.draw_problems(run, rooms, templates)
