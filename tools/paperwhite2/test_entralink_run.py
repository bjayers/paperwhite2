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


def fixture_data(tmp_path: Path) -> Path:
    """Entralink data of the tests' own: the real schemas and art, but a small set of rooms, templates and a run.json
    written here, so the tests don't depend on the rooms the user has made.
    Rooms: alpha, beta, gamma (generic enemy rooms; with choose, 4 generic rooms), choose (enemy_choice, two battles), first_boss (round 1),
    second_boss (round 2), last (final). Templates: rest, item, buff, shop, pre_boss_rest. Rounds: 2 rooms and a
    boss, 2 rooms and a boss, 2 rooms (12 places with the pre-boss rests and the final room)."""
    directory = tmp_path / "entralink"
    shutil.copytree(entralink_run.SOURCE, directory, ignore=shutil.ignore_patterns(
        "rooms", "templates", "run.json", "progress_ids.json"))
    (directory / "rooms").mkdir()
    (directory / "templates").mkdir()
    progress = iter(range(100))

    def make_room(name, role="room", battles=1, **extra):
        formats = []
        for i in range(battles):
            formats.append({"id": f"battle{i}", "progress_id": next(progress), "format": "single",
                            "enemies": [{"species": "SPECIES_PIKACHU", "level": 50}]})
        npcs = [{"type": "battle", "battle": b["id"], "sprite": "OBJ_CODE_LADY", "x": 12 + 3 * i, "z": 14,
                 "facing": "DIR_DOWN"} for i, b in enumerate(formats)]
        return {"name": name, "role": role, **extra, "battles": formats, "npcs": npcs}

    def make_template(name, kind, npc_type, **npc):
        return {"name": f"{name} (template)", "role": "room", "type": kind, "battles": [],
                "npcs": [{"type": npc_type, "x": 15, "z": 14, "facing": "DIR_DOWN", **npc}]}

    rooms = {"alpha": make_room("Alpha"), "beta": make_room("Beta"), "gamma": make_room("Gamma"),
             "choose": make_room("Choose", battles=2, type="enemy_choice"),
             "first_boss": make_room("First boss", "boss", rounds=[1]),
             "second_boss": make_room("Second boss", "boss", rounds=[2]),
             "last": make_room("Last", "final")}
    templates = {"rest": make_template("Rest", "rest", "heal", sprite="OBJ_CODE_NURSE"),
                 "item": make_template("Item", "item", "item", item="ITEM_POTION"),
                 "buff": make_template("Buff", "buff", "buff", sprite="OBJ_CODE_LADY"),
                 "shop": make_template("Shop", "shop", "shop", sprite="OBJ_CODE_82"),
                 "pre_boss_rest": make_template("Pre-boss rest", "rest", "heal", sprite="OBJ_CODE_NURSE")}
    for name, data in rooms.items():
        (directory / "rooms" / f"{name}.json").write_text(json.dumps(data))
    for name, data in templates.items():
        (directory / "templates" / f"{name}.json").write_text(json.dumps(data))
    (directory / "run.json").write_text(json.dumps({
        "rounds": [{"rooms": 2, "boss": True, "field_weather": "WEATHER_CUSTOM_TINT_9"},
                   {"rooms": 2, "boss": True, "field_weather": "WEATHER_CUSTOM_TINT_8"},
                   {"rooms": 2, "field_weather": "WEATHER_CUSTOM_TINT_7"}],
        "room_maps": ["ZONE_ENTREE_FOREST", "ZONE_ENTREE_FOREST_6"], "final_map": "ZONE_ENTREE_FOREST_2",
        "pre_boss_map": "ZONE_ENTREE_FOREST_10", "unknown_chance": 5,
        "marker_spots": {"north": [15, 12], "east": [21, 16], "west": [9, 16]}}))
    (directory / "progress_ids.json").write_text(json.dumps({"next_battle": 50, "next_catch": 0}))
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


def test_raid_takes_one_enemy(tmp_path, capsys):
    directory = copy_data(tmp_path)
    edit(room(directory, "rayquaza_raid"), lambda data: data["battles"][0]["enemies"].append(
        dict(data["battles"][0]["enemies"][0])))
    # (a warning, not an error: the game plays such a battle as the format its enemies fill)
    entralink_run.tables(directory)
    assert "a raid battle takes 1 enemy, not 2" in capsys.readouterr().err


def test_formats_take_exactly_their_enemies(tmp_path, capsys):
    directory = copy_data(tmp_path)
    path = directory / "rooms" / "short_triple.json"
    path.write_text(json.dumps({
        "name": "Short triple", "role": "room",
        "battles": [{"id": "battle", "progress_id": 1000, "format": "triple",
                     "enemies": [{"species": "SPECIES_PIKACHU"}]}],
        "npcs": [{"type": "battle", "battle": "battle", "x": 15, "z": 14, "facing": "DIR_DOWN"}]}))
    entralink_run.check_room(directory, "rooms/short_triple.json", json.loads(path.read_text()))
    assert "a triple battle takes 3 enemies, not 1" in capsys.readouterr().err


def test_battle_npc_default_sprite():
    """A battle NPC without a sprite shows its enemy's walking Pokémon: the hack's own (no row in the game's walking
    table), a form's, a sex's, a form without its own its species'; none for a species without one."""
    constants = {"OBJ_CODE_POKEMON_NEWMON": 0x4015, "OBJ_CODE_POKEMON_FORMED": 1, "OBJ_CODE_POKEMON_FORMED_FORM_1": 2,
                 "OBJ_CODE_POKEMON_SEXED_MALE": 3, "OBJ_CODE_POKEMON_SEXED_FEMALE": 4}
    sprite = entralink_run.walking_sprite
    assert sprite({"species": "SPECIES_NEWMON"}, constants) == "OBJ_CODE_POKEMON_NEWMON"
    assert sprite({"species": "SPECIES_FORMED", "form": 1}, constants) == "OBJ_CODE_POKEMON_FORMED_FORM_1"
    assert sprite({"species": "SPECIES_FORMED", "form": 2}, constants) == "OBJ_CODE_POKEMON_FORMED"
    assert sprite({"species": "SPECIES_SEXED"}, constants) == "OBJ_CODE_POKEMON_SEXED_MALE"
    assert sprite({"species": "SPECIES_SEXED", "gender": "female"}, constants) == "OBJ_CODE_POKEMON_SEXED_FEMALE"
    assert sprite({"species": "SPECIES_NONE"}, constants) is None


def test_battle_npc_follower_sprite():
    """Without a walking sprite, a battle NPC shows its enemy's follower: the female's where the species has the row,
    a form's (a form without its own its species'), the female's alone for a species that is always female; the
    walking sprite first where there is one."""
    constants = {"OBJ_CODE_POKEMON_NEWMON": 0x4015, "OBJ_CODE_FOLLOWER_NEWMON": 0x3000,
                 "OBJ_CODE_FOLLOWER_UNOVAN": 0x3100, "OBJ_CODE_FOLLOWER_UNOVAN_FEMALE": 0x3102,
                 "OBJ_CODE_FOLLOWER_UNOVAN_FORM_1": 0x3104, "OBJ_CODE_FOLLOWER_LADYLIKE_FEMALE": 0x3110}
    sprite = entralink_run.npc_sprite
    assert sprite({"species": "SPECIES_NEWMON"}, constants) == "OBJ_CODE_POKEMON_NEWMON"
    assert sprite({"species": "SPECIES_UNOVAN"}, constants) == "OBJ_CODE_FOLLOWER_UNOVAN"
    assert sprite({"species": "SPECIES_UNOVAN", "gender": "female"}, constants) == "OBJ_CODE_FOLLOWER_UNOVAN_FEMALE"
    assert sprite({"species": "SPECIES_UNOVAN", "form": 1, "gender": "female"}, constants) == \
        "OBJ_CODE_FOLLOWER_UNOVAN_FORM_1"
    assert sprite({"species": "SPECIES_UNOVAN", "form": 2}, constants) == "OBJ_CODE_FOLLOWER_UNOVAN"
    assert sprite({"species": "SPECIES_LADYLIKE"}, constants) == "OBJ_CODE_FOLLOWER_LADYLIKE_FEMALE"
    assert sprite({"species": "SPECIES_NONE"}, constants) is None


def test_battle_npc_without_walking_sprite(tmp_path):
    directory = copy_data(tmp_path)
    data = {"name": "No sprite", "role": "room",
            "battles": [{"id": "battle", "progress_id": 1000, "format": "single",
                         "enemies": [{"species": "SPECIES_NONE"}]}],
            "npcs": [{"type": "battle", "battle": "battle", "x": 15, "z": 14, "facing": "DIR_DOWN"}]}
    with pytest.raises(datajson.DataError, match="no walking or follower sprite"):
        entralink_run.check_room(directory, "rooms/no_sprite.json", data)
    data["npcs"][0]["sprite"] = "OBJ_CODE_LADY"
    entralink_run.check_room(directory, "rooms/no_sprite.json", data)


def test_npc_names_a_missing_battle(tmp_path):
    directory = copy_data(tmp_path)
    edit(room(directory, "dialga"), lambda data: data["npcs"][0].update(battle="missing"))
    with pytest.raises(datajson.DataError, match="missing"):
        entralink_run.tables(directory)


def test_draw_problems(tmp_path):
    directory = fixture_data(tmp_path)
    run, rooms = entralink_run.load_run(directory), entralink_run.load_rooms(directory)
    # 6 rooms drawn from the 4 generic ones repeat: a warning only
    assert entralink_run.draw_problems(run, rooms) == [("warning", "the rounds draw 6 rooms from 4, so rooms come up "
                                                        "more than once in a run (the least used first, never twice in a row)")]
    assert entralink_run.boss_pool(rooms, 1) == ["first_boss"] and entralink_run.boss_pool(rooms, 2) == ["second_boss"]
    # More rooms in a round than can come up in it still packs
    edit(directory / "run.json", lambda data: data["rounds"][0].update(rooms=4))
    entralink_run.tables(directory)
    # A round with no room at all can't, without the templates (step 6)
    for name in ("alpha", "beta", "gamma", "choose"):
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
    directory = fixture_data(tmp_path)
    edit(room(directory, "first_boss"), lambda data: data["npcs"][0].update(marker="rest"))
    edit(room(directory, "alpha"), lambda data: data.update(marker="challenge"))
    edit(directory / "run.json", lambda data: (data.pop("pre_boss_map"), data.pop("marker_spots"),
                                                 data["rounds"][1].pop("field_weather"),
                                                 data.update(field_weather="WEATHER_RAIN", unknown_chance=40)))
    data = entralink_run.tables(directory)
    rows = {name: row for name, row in zip(data["ids"], data["rooms"])}
    markers = entralink_run.MARKER_TYPES
    assert rows["alpha"]["marker"] == markers.index("challenge")
    assert rows["first_boss"]["marker"] == markers.index("boss") and rows["last"]["marker"] == markers.index("final")
    assert rows["beta"]["marker"] == markers.index("enemy")
    assert data["npcs"][rows["first_boss"]["firstNpc"]]["marker"] == data["npc_markers"].index("rest")
    assert data["npcs"][rows["alpha"]["firstNpc"]]["marker"] == entralink_run.NPC_MARKER_NONE
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
    directory = fixture_data(tmp_path)
    edit(room(directory, "alpha"), lambda data: data.update(type="challenge"))
    edit(directory / "run.json", lambda data: data["rounds"][0].update(type_weights={"shop": 0, "enemy": 7}))
    data = entralink_run.tables(directory)
    rows = {row["name"]: row for row in data["rooms"]}
    markers, types = entralink_run.MARKER_TYPES, entralink_run.ROOM_TYPES
    assert rows["alpha"]["type"] == types["challenge"] and rows["alpha"]["marker"] == markers.index("challenge")
    assert rows["templates/item"]["template"] == 1 and rows["templates/item"]["marker"] == markers.index("gift")
    assert rows["templates/pre_boss_rest"]["type"] == types["rest"]
    assert rows["templates/pre_boss_rest"]["marker"] == markers.index("rest")
    assert data["type_templates"][types["enemy"]] == entralink_run.TEMPLATE_NONE
    assert data["type_templates"][types["shop"]] == data["templates"]["shop"]
    weights = data["rounds"][0][3]
    assert weights[types["shop"]] == 0 and weights[types["enemy"]] == 7 and weights[types["rest"]] == 10
    # The pre-boss rests count: 3 rounds of 2 rooms, 2 bosses, 3 rests and the final
    assert entralink_run.place_count(entralink_run.load_run(directory)) == 12


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
    # (the tests' own rooms: enemy and enemy_choice rooms, no challenge or event room)
    directory = fixture_data(tmp_path)
    run, rooms = entralink_run.load_run(directory), entralink_run.load_rooms(directory)
    templates = entralink_run.load_templates(directory)
    problems = entralink_run.draw_problems(run, rooms, templates)
    assert ("warning", "round 1: no challenge or event room can come up, so those types are skipped") in problems
    assert not [p for p in problems if p[0] == "error"]
    # No premade room in round 1: its doors still draw the templates' types
    for name in ("alpha", "beta", "gamma", "choose"):
        edit(room(directory, name), lambda data: data.update(rounds=[2, 3]))
    rooms = entralink_run.load_rooms(directory)
    assert not [p for p in entralink_run.draw_problems(run, rooms, templates) if p[0] == "error"]
    run["rounds"][0]["type_weights"] = {kind: 0 for kind in entralink_run.ROOM_TYPES}
    assert ("error", "round 1's room type weights add up to 0, so its doors can't draw a room") in \
        entralink_run.draw_problems(run, rooms, templates)


def test_enemy_choice_and_room_problems(tmp_path):
    """Step 7: enemy_choice is a type with its own marker (after catch, so the others keep their members) and weight;
    an enemy room of 2 battles and an enemy_choice room of 1 are warned."""
    assert entralink_run.ROOM_TYPES["enemy_choice"] == 7 and entralink_run.MARKER_TYPES[-1] == "enemy_choice"
    assert entralink_run.MARKER_TYPES.index("catch") == 9
    assert entralink_run.DEFAULT_TYPE_WEIGHTS["enemy"] == 42 and entralink_run.DEFAULT_TYPE_WEIGHTS["enemy_choice"] == 8
    directory = fixture_data(tmp_path)
    assert entralink_run.room_problems(entralink_run.load_rooms(directory)) == []
    edit(room(directory, "alpha"), lambda data: data.update(type="enemy_choice"))
    edit(room(directory, "choose"), lambda data: data.update(type="enemy"))
    rooms = entralink_run.load_rooms(directory)
    assert entralink_run.room_problems(rooms) == [
        ("warning", "rooms/alpha.json: an enemy_choice room has battles to choose from, but it has 1"),
        ("warning", "rooms/choose.json: an enemy room has one battle, but it has 2: several to choose from make it "
                    "an enemy_choice room")]
    edit(room(directory, "choose"), lambda data: data.update(type="enemy_choice"))
    data = entralink_run.tables(directory)
    row = data["rooms"][data["ids"].index("choose")]
    assert row["type"] == 7 and row["marker"] == entralink_run.MARKER_TYPES.index("enemy_choice")
    assert len(entralink_run.marker_members(directory)) == len(entralink_run.MARKER_TYPES) + len(
        entralink_run.npc_marker_names(directory)) + data["icon_count"]


def test_dust_and_shop(tmp_path):
    """Step 7: run.json's dust, dust_round_percent and shop_items, with their defaults; a round left out of the
    percents takes the last one given."""
    text = entralink_run.header(entralink_run.SOURCE)
    assert "#define ENTRALINK_RUN_DUST { 40, 50, 80, 150, 0 }" in text
    assert "#define ENTRALINK_RUN_DUST_ROUND_PERCENT { 100, 150, 200 }" in text
    assert "#define ENTRALINK_RUN_SHOP_ITEMS 5" in text
    directory = copy_data(tmp_path)
    edit(directory / "run.json", lambda data: data.update(dust={"boss": 300}, dust_round_percent=[100, 120],
                                                          shop_items=8))
    data = entralink_run.tables(directory)
    assert data["dust"] == [40, 50, 80, 300, 0] and data["dust_round_percent"] == [100, 120, 120]
    assert data["shop_items"] == 8
    edit(directory / "run.json", lambda data: data.update(shop_items=9))
    with pytest.raises(datajson.DataError, match="shop_items"):
        entralink_run.tables(directory)


def test_swap_and_reserve(tmp_path):
    """Phase 7 of the buffs: run.json's swap_dust and reserve_slots, with their defaults and ranges, and a swap NPC
    packed as its type, its marker and the Lady."""
    directory = copy_data(tmp_path)
    edit(directory / "run.json", lambda data: [data.pop(key, None) for key in ("swap_dust", "reserve_slots")])
    text = entralink_run.header(directory)
    assert "#define ENTRALINK_RUN_SWAP_DUST 100" in text and "#define ENTRALINK_RUN_RESERVE_SLOTS 6" in text
    edit(directory / "run.json", lambda data: data.update(swap_dust=0, reserve_slots=30))
    data = entralink_run.tables(directory)
    assert data["swap_dust"] == 0 and data["reserve_slots"] == 30
    edit(room(directory, "dialga"), lambda data: data["npcs"].append(
        {"type": "swap", "x": 20, "z": 14, "facing": "DIR_DOWN", "marker": "swap"}))
    data = entralink_run.tables(directory)
    first = data["rooms"][data["ids"].index("dialga")]["firstNpc"]
    count = data["rooms"][data["ids"].index("dialga")]["npcCount"]
    npc = data["npcs"][first + count - 1]
    assert npc["type"] == entralink_run.NPC_TYPES["swap"] and npc["sprite"] == datajson.constants()["OBJ_CODE_LADY"]
    assert npc["marker"] == entralink_run.npc_marker_names(directory).index("swap")
    for key, value in (("swap_dust", 10000), ("reserve_slots", 0), ("reserve_slots", 31)):
        edit(directory / "run.json", lambda data: data.update({key: value}))
        with pytest.raises(datajson.DataError, match=key):
            entralink_run.tables(directory)
        edit(directory / "run.json", lambda data: data.pop(key))


def test_hub_shop(tmp_path):
    """The hub shop (entralink-buffs.md section 19): run.json's hub_shop, its defaults for what is left out, in the
    header; out of range refused."""
    directory = copy_data(tmp_path)
    edit(directory / "run.json", lambda data: data.pop("hub_shop", None))
    text = entralink_run.header(directory)
    for line in ("ROOM_SHARDS 1", "BOSS_SHARDS 3", "FINAL_SHARDS 10", "SHOP_PRICES { 5, 8, 12 }", "SHOP_PRICE_COUNT 3",
                 "SHOP_PRICE_STEP 4", "SHOP_TOTAL_CAP 8"):
        assert f"#define ENTRALINK_RUN_{line}\n" in text, line
    edit(directory / "run.json", lambda data: data.update(hub_shop={"prices": [7], "total_cap": 32}))
    data = entralink_run.tables(directory)
    assert data["hub_shop"]["prices"] == [7] and data["hub_shop"]["total_cap"] == 32
    assert data["hub_shop"]["room_shards"] == 1
    for key, value in (("total_cap", 33), ("prices", []), ("room_shards", 100), ("final_shards", -1)):
        edit(directory / "run.json", lambda data: data.update(hub_shop={key: value}))
        with pytest.raises(datajson.DataError, match=key):
            entralink_run.tables(directory)


def test_icon_shift():
    """Step 7: a bag icon's picture, in the top-left 24 by 24 of its 32 by 32, moves right 4 and down 8."""
    pixels = bytes([1] * 32 * 32)
    moved = entralink_run.shift_picture(pixels, 32, 4, 8)
    assert moved[8 * 32 + 4] == 1 and moved[8 * 32 + 3] == 0 and moved[7 * 32 + 4] == 0
    assert sum(moved) == (32 - 4) * (32 - 8)


def test_enemy_scaling_and_scale(tmp_path):
    """Phase 5 and its rebalances: run.json's enemy_scaling, a stat each (a room curve by depth across the run, a boss
    bonus a round over the curve at its round's last room: the last given for the others, the defaults for what is
    left out), the raid's HP factor, and an enemy's own scale (100 if left out), in the header."""
    directory = copy_data(tmp_path)
    edit(directory / "run.json", lambda data: data.update(
        rounds=[{"rooms": 3}, {"rooms": 2}], raid_hp_factor=2.5,
        enemy_scaling={"hp": {"start": 100, "end": 500, "curve": 200, "boss_bonus": [300]}}))
    edit(room(directory, "dialga"), lambda data: data["battles"][0]["enemies"][0].update(scale=150))
    data = entralink_run.tables(directory)
    # Round 1's boss at its last room (200%), round 2's (the last: the final room's) and round 3's at the run's last
    assert data["enemy_scaling"]["hp"] == {"start": 100, "end": 500, "curve": 200, "boss_bonus": [300] * 3,
                                           "boss": [600, 1500, 1500], "rooms": [100, 125, 200, 325, 500]}
    assert data["enemy_scaling"]["speed"] == {"start": 100, "end": 100, "curve": 100, "boss_bonus": [100] * 3,
                                              "boss": [100] * 3, "rooms": [100] * 5}
    assert data["raid_hp_percent"] == 250
    assert {e["scale"] for e in data["enemies"] if e["name"].startswith("dialga/")} == {150}
    text = entralink_run.header(directory)
    assert "#define ENTRALINK_RUN_ENEMY_SCALING { { { 100, 125, 200, 325, 500 }, { 600, 1500, 1500 } }, " in text
    assert "#define ENTRALINK_RUN_RAID_HP_PERCENT 250" in text
    edit(room(directory, "dialga"), lambda data: data["battles"][0]["enemies"][0].update(scale=5))
    with pytest.raises(datajson.DataError, match="scale"):
        entralink_run.tables(directory)


def test_boss_multi_foe_factors(tmp_path):
    """Fixes 9: run.json's boss_double_factor and boss_triple_factor in percent in the header (0.85 and 0.7 if left
    out)."""
    directory = copy_data(tmp_path)
    edit(directory / "run.json", lambda data: [data.pop(k, None) for k in ("boss_double_factor", "boss_triple_factor")])
    assert entralink_run.tables(directory)["boss_multi_percent"] == (85, 70)
    edit(directory / "run.json", lambda data: data.update(boss_double_factor=0.9, boss_triple_factor=0.55))
    text = entralink_run.header(directory)
    assert "#define ENTRALINK_RUN_BOSS_DOUBLE_HP_PERCENT 90" in text
    assert "#define ENTRALINK_RUN_BOSS_TRIPLE_HP_PERCENT 55" in text


def test_ambients(tmp_path):
    """Room ambients: their reactions packed with the defaults (near 3, no return, distance 4), a returning one's far,
    no dialogue packed, the Lady by default, and the rules: only a fading one returns, farther than it fades, and the
    ambient keys only on an ambient."""
    directory = copy_data(tmp_path)
    name = sorted(path.stem for path in (directory / "rooms").glob("*.json"))[0]
    base = {"type": "ambient", "z": 3, "facing": "DIR_DOWN", "sprite": "OBJ_CODE_POKEMON_DARKRAI"}
    lines = len(entralink_run.dialogue_lines(directory))
    edit(room(directory, name), lambda data: data["npcs"].extend([
        {**base, "x": 2, "dialogue": {"before": "Unused"}}, {**base, "x": 4, "return": True, "far": 8, "near": 2},
        {**base, "x": 6, "behaviour": "flee", "distance": 5}, {"type": "ambient", "x": 8, "z": 3, "facing": "DIR_UP"}]))
    data = entralink_run.tables(directory)
    row = data["rooms"][data["ids"].index(name)]
    npcs = data["npcs"][row["firstNpc"] + row["npcCount"] - 4:row["firstNpc"] + row["npcCount"]]
    assert [(n["type"], n["behaviour"], n["near"], n["far"], n["distance"]) for n in npcs] == [
        (11, 0, 3, 0, 4), (11, 0, 2, 8, 4), (11, 1, 3, 0, 5), (11, 0, 3, 0, 4)]
    assert npcs[0]["before"] == entralink_run.NONE16 and len(entralink_run.dialogue_lines(directory)) == lines
    assert npcs[3]["sprite"] == datajson.constants()["OBJ_CODE_LADY"]
    assert "#define ENTRALINK_RUN_NPCS" in entralink_run.header(directory)
    for change, message in ((lambda n: n.update({"behaviour": "flee", "return": True}), "only a fading one"),
                            (lambda n: n.update({"return": True, "far": 2}), "not farther"),
                            (lambda n: n.update(type="rest"), "ambient's reaction")):
        edit(room(directory, name), lambda data: change(data["npcs"][-3]))
        with pytest.raises(datajson.DataError, match=message):
            entralink_run.tables(directory)
        edit(room(directory, name), lambda data: data["npcs"].__setitem__(-3, {**base, "x": 4, "near": 2}))
