"""Tests of tools/paperwhite2/sprite_edit.py (the battle-palette icons' files and the Sprite Editor's saves) on a
fixture: test_icon_remap's made-up species, and a walking sheet of its own and an opted-out one."""
import contextlib
import io
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.datajson import dumps  # noqa: E402
from tools.data.nitro_2d import read_indexed_png, read_palette, write_indexed_png, write_palette  # noqa: E402
from tools.paperwhite2 import sprite_edit  # noqa: E402
from tools.paperwhite2.test_icon_remap import NORMAL, make_fixture, pad  # noqa: E402

OWN = [(0, 0, 0), (10, 20, 30), (200, 100, 50)]


def fixture(tmp_path):
    """make_fixture's species, and res/field/actors/pokemon/{fakemon (on its battle palette), oddmon (opted out)}."""
    root = make_fixture(tmp_path)
    actors = root / "res" / "field" / "actors" / "pokemon"
    for name, palette in (("fakemon", {"pokemon": "fakemon"}), ("oddmon", {"opt_out": "its own colours"})):
        d = actors / name
        d.mkdir(parents=True)
        (d / "data.json").write_text(dumps({"palette": palette}) + "\n")
        (d / "sprite.png").write_bytes(write_indexed_png(64, 32, bytes(64 * 32), pad([(9, 9, 9)])))
    (actors / "oddmon" / "sprite.pal").write_text(write_palette(pad(OWN)))
    return root


def icon_pixels(slots):
    px = bytearray(32 * 64)
    for i in range(len(slots)):
        px[100 + i] = i + 1
    px[0], px[1] = 14, 15
    return bytes(px)


def test_icon_keys():
    pokemon = Path("res/pokemon")
    assert sprite_edit.icon_paths(pokemon, "fakemon") == (pokemon / "fakemon/icon_battle.png",
                                                         pokemon / "fakemon/icon_battle.json")
    assert sprite_edit.icon_paths(pokemon, "fakemon_female")[0] == pokemon / "fakemon/icon_female_battle.png"
    assert sprite_edit.icon_paths(pokemon, "fakemon_form_1")[0] == pokemon / "fakemon/form_1/icon_battle.png"
    for bad in ("../x", "a/b", "_form_x", ""):
        with pytest.raises(sprite_edit.SpriteError):
            sprite_edit.icon_folder(pokemon, bad)


def test_canonical_merges_repeated_slots():
    # slots 1 and 3 are both battle index 7; slot 4 is unused
    pixels = bytes([0, 1, 2, 3, 14, 15, 3])
    out, slots = sprite_edit.canonical(pixels, [7, 2, 7, 9])
    assert slots == [7, 2] and out == bytes([0, 1, 2, 1, 14, 15, 1])
    assert sprite_edit.canonical(out, slots) == (out, slots)


def test_icon_round_trip(tmp_path):
    root = fixture(tmp_path)
    pokemon = root / "res" / "pokemon"
    slots = [2, 5, 3]
    written = sprite_edit.write_files(sprite_edit.icon_files(pokemon, "fakemon", icon_pixels(slots), slots))
    assert len(written) == 2
    pixels, read_slots = sprite_edit.read_icon(pokemon, "fakemon")
    assert pixels == icon_pixels(slots) and read_slots == slots
    w, h, _, colours = read_indexed_png(pokemon / "fakemon" / "icon_battle.png")
    assert (w, h) == (32, 64)
    normal = read_palette(pokemon / "fakemon" / "normal.pal")
    # 0 the battle palette's colour 0, the slots' normal colours, unused magenta, the two greys
    assert colours[0] == normal[0] and colours[1:4] == [normal[2], normal[5], normal[3]]
    assert colours[4] == sprite_edit.UNUSED and colours[14:] == sprite_edit.GREYS
    text = (pokemon / "fakemon" / "icon_battle.json").read_text()
    assert text == dumps({"slots": slots, "greys": ["#62625a", "#414141"]}) + "\n"
    # a palette-only form: its own folder, its own palette's colours
    sprite_edit.write_files(sprite_edit.icon_files(pokemon, "fakemon_form_1", icon_pixels(slots), slots))
    _, _, _, form_colours = read_indexed_png(pokemon / "fakemon" / "form_1" / "icon_battle.png")
    assert form_colours[1] != colours[1]


@pytest.mark.parametrize("slots, pixels, message", [
    (list(range(1, 15)), None, "room for 13"),
    ([0, 2], None, "from 1 to 15"),
    ([2, 2], None, "twice"),
    ([2], b"\x03" + bytes(2047), "only 1 slots"),
    ([2], b"\x10" + bytes(2047), "past the icon"),
    ([2], bytes(10), "32x64"),
])
def test_icon_checks(tmp_path, slots, pixels, message):
    root = fixture(tmp_path)
    with pytest.raises(sprite_edit.SpriteError, match=message):
        sprite_edit.icon_files(root / "res" / "pokemon", "fakemon", pixels or icon_pixels(slots[:13]), slots)


def run(argv):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = sprite_edit.main(argv)
    return code, json.loads(out.getvalue())


def test_save_icon_command(tmp_path):
    root = fixture(tmp_path)
    data = tmp_path / "data.json"
    data.write_text(json.dumps({"pixels": icon_pixels([4, 1]).hex(), "slots": [4, 1]}))
    code, out = run(["save-icon", "fakemon", str(data), "--res", str(root / "res")])
    assert code == 0
    assert out == {"ok": True, "written": ["res/pokemon/fakemon/icon_battle.png", "res/pokemon/fakemon/icon_battle.json"]}
    data.write_text(json.dumps({"pixels": icon_pixels([4, 1]).hex(), "slots": [4]}))
    code, out = run(["save-icon", "fakemon", str(data), "--res", str(root / "res")])
    assert code == 1 and "only 1 slots" in out["error"]
    assert sprite_edit.read_icon(root / "res" / "pokemon", "fakemon")[1] == [4, 1], "a refused save writes nothing"


def test_sheets(tmp_path):
    root = fixture(tmp_path)
    res = root / "res"
    pixels = bytes(range(16)) * (64 * 32 // 16)
    sprite_edit.write_files(sprite_edit.sheet_file(res, "field/actors/pokemon/fakemon", pixels))
    w, h, px, colours = read_indexed_png(res / "field/actors/pokemon/fakemon/sprite.png")
    assert (w, h, px) == (64, 32, pixels) and colours == pad(NORMAL), "a battle-palette sheet: normal.pal's colours"
    sprite_edit.write_files(sprite_edit.sheet_file(res, "field/actors/pokemon/oddmon", pixels))
    assert read_indexed_png(res / "field/actors/pokemon/oddmon/sprite.png")[3] == pad(OWN), "opted out: its sprite.pal"
    with pytest.raises(sprite_edit.SpriteError, match="64x32"):
        sprite_edit.sheet_file(res, "field/actors/pokemon/fakemon", bytes(10))
    with pytest.raises(sprite_edit.SpriteError, match="past 15"):
        sprite_edit.sheet_file(res, "field/actors/pokemon/fakemon", b"\x20" * (64 * 32))
    for outside in ("pokemon/fakemon", "field/actors/../../pokemon/fakemon", "field/actors/pokemon/nomon"):
        with pytest.raises(sprite_edit.SpriteError, match="not a sheet"):
            sprite_edit.sheet_file(res, outside, pixels)
