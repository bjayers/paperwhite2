"""Tests of tools/paperwhite2/palette_remap.py (method F) and overworld_palettes.py: fixtures, and only validity on the
real data (every Pokémon sheet on a battle palette or opted out, every follower row coloured)."""
import json
import struct
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "data"))  # (nitro_btx imports its neighbours so)
from tools.data import field_actor_data  # noqa: E402
from tools.data.datajson import DataError  # noqa: E402
from tools.data.nitro_2d import write_indexed_png, write_palette  # noqa: E402
from tools.paperwhite2 import overworld_palettes, palette_remap  # noqa: E402

BLACK, DARK = (16, 16, 16), (24, 24, 32)
WHITE, GREY, RED = (248, 248, 248), (160, 160, 168), (232, 48, 40)


def battle_palette(colours):
    return [(0, 0, 0)] + colours + [(0, 0, 0)] * (15 - len(colours))


def figure(size, outline, body, stripe=None):
    """A frame: a body square with a one-pixel outline in a transparent margin, and a band through its middle."""
    rows = [[0] * size for _ in range(size)]
    for y in range(4, size - 4):
        for x in range(4, size - 4):
            edge = y in (4, size - 5) or x in (4, size - 5)
            rows[y][x] = outline if edge else body
    if stripe is not None:
        for x in range(6, size - 6):
            for y in range(size // 2 - 2, size // 2 + 2):
                rows[y][x] = stripe
    return rows


def art(normal, shiny, frame):
    return palette_remap.BattleArt(normal, shiny, [frame], [frame])


def sheet(frame, colours, frames=6):
    size = len(frame)
    rows = [sum((row for _ in range(frames)), []) for row in frame]
    return palette_remap.Sheet(size * frames, size, bytes(v for row in rows for v in row), battle_palette(colours))


def test_lookalikes_take_their_roles():
    # The battle sprite's outline (1) and stripe (9) are both near-black: one colour of the sheet takes both, the
    # outline pixels the edge role, the stripe's the inner one
    normal = battle_palette([BLACK, WHITE, GREY, RED] + [(0, 0, 0)] * 4 + [DARK])
    shiny = battle_palette([BLACK, WHITE, GREY, RED] + [(0, 0, 0)] * 4 + [(240, 216, 40)])
    battle = art(normal, shiny, figure(32, 1, 2, 9))
    drawn = sheet(figure(32, 1, 2, 1), [BLACK, WHITE])
    pixels, mapping = palette_remap.remap(drawn, battle)
    rows = palette_remap.rows_of(drawn.width, drawn.height, pixels)
    assert rows[4][10] == 1 and rows[16][10] == 9
    assert mapping[2] == 2


def test_remap_is_deterministic():
    normal = battle_palette([BLACK, WHITE, GREY, RED, DARK])
    battle = art(normal, normal, figure(32, 1, 2, 4))
    drawn = sheet(figure(32, 3, 1, 2), [WHITE, RED, (40, 40, 40)])
    assert palette_remap.remap(drawn, battle) == palette_remap.remap(drawn, battle)


def test_neutrals_stay_neutral():
    normal = battle_palette([BLACK, (200, 200, 200), (90, 160, 230)])
    battle = art(normal, normal, figure(32, 1, 2, 3))
    drawn = sheet(figure(32, 1, 2), [BLACK, (210, 210, 214)])
    _, mapping = palette_remap.remap(drawn, battle)
    assert mapping[2] == 2


def test_palette_member_layout():
    normal = [(8 * i, 0, 0) for i in range(16)]
    shiny = [(0, 8 * i, 0) for i in range(16)]
    member = overworld_palettes.palette_member([(0x3000, (normal, shiny)), (0x3001, None), (0x3002, (normal, shiny))],
                                               0x3000)
    magic, version, count = struct.unpack_from("<4sHH", member)
    index = struct.unpack_from("<3H", member, 8)
    assert (magic, version, count) == (b"FWCL", 1, 3)
    assert index == (0, 0xFFFF, 0)
    assert len(member) == 8 + 6 + 64
    assert struct.unpack_from("<H", member, 14 + 2)[0] == 1  # normal colour 1: red 8 is 5-bit 1
    assert struct.unpack_from("<H", member, 14 + 32 + 2)[0] == 1 << 5


def groups(tmp_path, monkeypatch_dirs):
    for name, colours in monkeypatch_dirs.items():
        path = tmp_path / name
        path.mkdir(parents=True)
        (path / "normal.pal").write_text(write_palette(colours))
        (path / "shiny.pal").write_text(write_palette(list(reversed(colours))))
        frame = figure(16, 1, 2)
        (path / "front.png").write_bytes(write_indexed_png(16, 16, bytes(v for r in frame for v in r), colours))
        (path / "back.png").write_bytes(write_indexed_png(16, 16, bytes(v for r in frame for v in r), colours))


def test_row_palettes(tmp_path):
    a = [(8 * i, 8 * i, 8 * i) for i in range(16)]
    b = [(8 * i, 0, 0) for i in range(16)]
    groups(tmp_path, {"budew": a, "appletun": b})
    old = overworld_palettes.POKEMON
    overworld_palettes.POKEMON = tmp_path
    try:
        owner = {"palette": {"pokemon": "budew"}}
        row = {"follower": {"species": "SPECIES_BUDEW", "form": 0}}
        assert overworld_palettes.row_palettes(row, owner) == (a, list(reversed(a)))
        mapped = {"follower": {"species": "SPECIES_APPLETUN", "form": 0},
                  "palette": {"pokemon": "appletun", "map": [0] + [15] * 15}}
        normal, shiny = overworld_palettes.row_palettes(mapped, owner)
        assert normal[1] == b[15] and shiny[1] == b[0]
        with pytest.raises(ValueError, match="map"):
            overworld_palettes.row_palettes({"follower": {"species": "SPECIES_APPLETUN", "form": 0}}, owner)
        assert overworld_palettes.row_palettes({"follower": row["follower"], "palette": {"opt_out": "x"}}, owner) is None
        assert overworld_palettes.row_palettes(row, {"palette": {"opt_out": "x"}}) is None
    finally:
        overworld_palettes.POKEMON = old


def test_copied_palette():
    own = overworld_palettes.copied_palette({"palette": {"pokemon": "budew"}}, "budew/form_1", True)
    assert own["palette"] == {"pokemon": "budew/form_1"}
    row = overworld_palettes.copied_palette({"sprite": "OBJ_CODE_POKEMON_BUDEW"}, "roselia_x", False)
    assert row["palette"] == {"pokemon": "roselia_x", "map": list(range(16))}
    kept = overworld_palettes.copied_palette({"palette": {"opt_out": "why"}}, "x", True)
    assert kept["palette"] == {"opt_out": "why"}


def test_packer_checks(tmp_path):
    sheet_dir = tmp_path / "pokemon" / "budew"
    sheet_dir.mkdir(parents=True)
    (sheet_dir / "sprite.png").write_bytes(b"")
    data = {"type": "sprite"}
    with pytest.raises(DataError, match="needs a \"palette\""):
        field_actor_data.check_palette(sheet_dir, data, True)
    (sheet_dir / "sprite.pal").write_text("")
    with pytest.raises(DataError, match="not both"):
        field_actor_data.check_palette(sheet_dir, {"type": "sprite", "palette": {"pokemon": "a", "opt_out": "b"}}, True)
    field_actor_data.check_palette(sheet_dir, {"type": "sprite", "palette": {"opt_out": "b"}}, True)
    with pytest.raises(DataError, match="map"):
        field_actor_data.check_palette(sheet_dir, {"type": "sprite", "palette": {"pokemon": "a", "map": [0] * 16}},
                                       True)


def test_real_sheets_are_on_battle_palettes():
    actors = overworld_palettes.Actors()
    for code in actors.codes:
        if not actors.is_pokemon_sheet(code):
            continue
        palette = actors.data[code].get("palette", {})
        path = overworld_palettes.directory(code)
        assert "pokemon" in palette or "opt_out" in palette, code
        if "pokemon" in palette:
            assert (overworld_palettes.POKEMON / palette["pokemon"] / "normal.pal").is_file(), code
            assert not (path / "sprite.pal").is_file(), code
        else:
            assert (path / "sprite.pal").is_file(), code


def test_real_rows_are_coloured():
    actors = overworld_palettes.Actors()
    for code in actors.codes:
        data = actors.data.get(code, {})
        if "follower" in data:
            owner = actors.owner(code)
            overworld_palettes.row_palettes(data, actors.data[owner])
