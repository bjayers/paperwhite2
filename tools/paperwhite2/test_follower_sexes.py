"""Tests of tools/paperwhite2/follower_sexes.py: fixtures, and only validity on the real data (no female follower row
left that duplicates the male's)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.nitro_2d import write_indexed_png, write_palette  # noqa: E402
from tools.paperwhite2 import follower_sexes, overworld_palettes  # noqa: E402

CODES = """OBJ_CODE_MODEL_BIGROCK = 0x2000
OBJ_CODE_FOLLOWER_ONE = 0x3000
OBJ_CODE_FOLLOWER_ONE_FEMALE
OBJ_CODE_FOLLOWER_TWO
OBJ_CODE_FOLLOWER_TWO_FEMALE
OBJ_CODE_POKEMON_PURRLOIN = 0x4000
"""


def test_removed_codes_hand_on_the_block_start():
    text = follower_sexes.remove_codes_text(CODES, {"OBJ_CODE_FOLLOWER_ONE", "OBJ_CODE_FOLLOWER_TWO_FEMALE"})
    assert text.splitlines() == ["OBJ_CODE_MODEL_BIGROCK = 0x2000", "OBJ_CODE_FOLLOWER_ONE_FEMALE = 0x3000",
                                 "OBJ_CODE_FOLLOWER_TWO", "OBJ_CODE_POKEMON_PURRLOIN = 0x4000"]


def row(sex, sprite=None, gap=7, palette=None):
    data = {"$schema": "field_actor.schema.json", "type": "sprite", "sprite_atlas_size": 21,
            "follower": {"species": "SPECIES_ONE", "form": 0, "sex": sex, "shiny": False, "gap": gap}}
    if sprite:
        data["sprite"] = sprite
    if palette:
        data["palette"] = palette
    return data


def fixture(tmp_path, monkeypatch):
    actors = tmp_path / "actors"
    followers = actors / "followers"
    monkeypatch.setattr(overworld_palettes, "ACTORS", actors)
    monkeypatch.setattr(follower_sexes, "FOLLOWERS", followers)
    return followers


def write_row(followers, name, data, pixels=None):
    folder = followers / name
    folder.mkdir(parents=True)
    (folder / "data.json").write_text(json.dumps(data))
    if pixels is not None:
        colours = [(0, 0, 0)] + [(8 * i, 8 * i, 8 * i) for i in range(1, 16)]
        (folder / "sprite.png").write_bytes(write_indexed_png(4, 4, bytes(pixels), colours))
        (folder / "sprite.pal").write_text(write_palette(colours))


class Patch:
    """A small monkeypatch: setattr, undone by undo()."""

    def __init__(self):
        self.done = []

    def setattr(self, owner, name, value):
        self.done.append((owner, name, getattr(owner, name)))
        setattr(owner, name, value)

    def undo(self):
        for owner, name, value in reversed(self.done):
            setattr(owner, name, value)


def test_duplicates_are_the_same_sheet_and_settings(tmp_path):
    patch = Patch()
    try:
        followers = fixture(tmp_path, patch)
        art = [0, 1, 2, 3] * 4
        # One: the female shows the male's own sheet with the same settings, a duplicate
        write_row(followers, "one", row("GENDER_MALE"), art)
        write_row(followers, "one_female", row("GENDER_FEMALE", sprite="OBJ_CODE_FOLLOWER_ONE"))
        assert follower_sexes.duplicates(followers) == [("one", "one_female")]
        # Her own gap: not a duplicate
        (followers / "one_female" / "data.json").write_text(json.dumps(row("GENDER_FEMALE", "OBJ_CODE_FOLLOWER_ONE", 5)))
        assert follower_sexes.duplicates(followers) == []
        # Her own sheet of the same pixels and colours: a duplicate; other pixels: not
        (followers / "one_female" / "data.json").write_text(json.dumps(row("GENDER_FEMALE")))
        (followers / "one_female" / "sprite.png").write_bytes((followers / "one" / "sprite.png").read_bytes())
        (followers / "one_female" / "sprite.pal").write_bytes((followers / "one" / "sprite.pal").read_bytes())
        assert follower_sexes.duplicates(followers) == [("one", "one_female")]
        colours = [(0, 0, 0)] + [(8 * i, 8 * i, 8 * i) for i in range(1, 16)]
        (followers / "one_female" / "sprite.png").write_bytes(write_indexed_png(4, 4, bytes([0, 2] * 8), colours))
        assert follower_sexes.duplicates(followers) == []
    finally:
        patch.undo()


def test_no_female_row_duplicates_the_males():
    # Validity on the real data: a female row of her own only where her follower differs
    assert follower_sexes.duplicates() == []
