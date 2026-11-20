"""Tests of tools/paperwhite2/damage_digits.py, the damage numbers' digits (phase 6), and their settings' header lines
in entralink_buffs.py."""
import json
import struct
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.narc import read_narc, write_narc  # noqa: E402
from tools.data.nitro_2d import read_indexed_png, write_indexed_png  # noqa: E402
from tools.paperwhite2 import damage_digits, entralink_buffs  # noqa: E402

HP_CELL = ROOT / "res" / "graphics" / "btlv" / "457.ncer"


def write_sheet(path: Path, rows: int, pixels: bytes | None = None, width: int = damage_digits.WIDTH):
    pixels = pixels if pixels is not None else bytes(width * 32 * rows)
    path.write_bytes(write_indexed_png(width, 32 * rows, pixels, [(i * 16, i * 16, i * 16) for i in range(16)]))


def test_placeholder_packs(tmp_path):
    sheet = tmp_path / "digits.png"
    sheet.write_bytes(damage_digits.placeholder())
    rows, pixels, colors = damage_digits.read_sheet(sheet)
    assert rows == 1 + damage_digits.PLACEHOLDER_SHINE_FRAMES
    member = damage_digits.member(sheet)
    assert member[:4] == bytes([rows, 16, 32, 0])
    assert len(member) == 4 + 32 + rows * 10 * 256
    # Every digit uses the tier colours and keeps its side columns blank
    for row in range(rows):
        for digit in range(10):
            cell = [pixels[(row * 32 + y) * 160 + digit * 16 + x] for y in range(32) for x in range(16)]
            assert damage_digits.TIER_LIGHT in cell and damage_digits.TIER_DARK in cell
            assert not any(pixels[(row * 32 + y) * 160 + digit * 16 + x] for y in range(32) for x in (0, 15))


def test_cell_is_a_16_colour_texture(tmp_path):
    pixels = bytearray(damage_digits.WIDTH * 32)
    # Digit 1's cell: its top-left pixel 3 and the next 5, its last pixel 7
    pixels[16 + 1] = 3
    pixels[16 + 2] = 5
    pixels[31 * 160 + 16 + 14] = 7
    sheet = tmp_path / "s.png"
    write_sheet(sheet, 1, bytes(pixels))
    member = damage_digits.member(sheet)
    cell = member[4 + 32 + 256:4 + 32 + 512]
    assert cell[0] == 0x30 and cell[1] == 0x05
    assert cell[255] == 0x07


def test_palette_is_rgb555(tmp_path):
    sheet = tmp_path / "s.png"
    write_sheet(sheet, 2)
    member = damage_digits.member(sheet)
    colors = struct.unpack_from("<16H", member, 4)
    # Colour 15 of the fixture is (240, 240, 240): 30 a channel in 5 bits
    assert colors[15] == 29 | 29 << 5 | 29 << 10 or colors[15] == 30 | 30 << 5 | 30 << 10


@pytest.mark.parametrize("width,rows,message", [(144, 1, "160 wide"), (160, 9, "1 to 8 rows")])
def test_bad_sizes(tmp_path, width, rows, message):
    sheet = tmp_path / "s.png"
    write_sheet(sheet, rows, width=width)
    with pytest.raises(ValueError, match=message):
        damage_digits.read_sheet(sheet)


def test_bad_index(tmp_path):
    sheet = tmp_path / "s.png"
    pixels = bytearray(160 * 32)
    pixels[5] = 16
    sheet.write_bytes(write_indexed_png(160, 32, bytes(pixels), [(i, i, i) for i in range(32)]))
    with pytest.raises(ValueError, match="index 16"):
        damage_digits.read_sheet(sheet)


def test_hp_line_cell():
    cell = damage_digits.hp_line_cell(HP_CELL.read_bytes())
    assert len(cell) == len(HP_CELL.read_bytes())
    offset = 0x18 + struct.unpack_from("<I", cell, 0x1c)[0]
    assert struct.unpack_from("<H", cell, offset)[0] == 2
    oams = struct.unpack_from("<6H", cell, offset + 8)
    # Two 32 by 8 pieces at x -32 and 0, the second from tile 4
    assert oams == (0x40f8, 0x41e0, 0, 0x40f8, 0x4000, 2)
    with pytest.raises(ValueError):
        damage_digits.hp_line_cell(cell)


def test_archive(tmp_path):
    first = damage_digits.digits_member_number()
    members = [b"x"] * first
    members[damage_digits.HP_NUMBERS_CELL] = HP_CELL.read_bytes()
    source = tmp_path / "in.narc"
    source.write_bytes(write_narc(members))
    out = tmp_path / "out.narc"
    damage_digits.archive(source, out)
    files = read_narc(out.read_bytes())
    assert len(files) == first + 2
    assert files[first] == damage_digits.member()
    assert files[first + 1] == damage_digits.hp_line_cell(HP_CELL.read_bytes())
    source.write_bytes(write_narc(members[:-1]))
    with pytest.raises(ValueError, match="members"):
        damage_digits.archive(source, out)


def test_check_and_list(tmp_path):
    preview, info, output = tmp_path / "p.png", tmp_path / "i.json", tmp_path / "o.png"
    run = subprocess.run([sys.executable, str(ROOT / damage_digits.TOOL), "check", str(damage_digits.SHEET),
                          "--preview", str(preview), "--info", str(info), "--output", str(output),
                          "--palette", ",".join(["#ffffff"] * 16)], capture_output=True, text=True)
    assert run.returncode == 0, run.stderr
    assert json.loads(info.read_text())["colors"][0] == "#ffffff"
    width, height, _, colors = read_indexed_png(output)
    assert width == 160 and height % 32 == 0
    listed = json.loads(subprocess.run([sys.executable, str(ROOT / damage_digits.TOOL), "list"], capture_output=True,
                                       text=True, check=True).stdout)
    assert listed[0]["path"] == "res/paperwhite2/battle/damage_digits.png" and listed[0]["heightStep"] == 32
    bad = tmp_path / "bad.png"
    write_sheet(bad, 1, width=150)
    run = subprocess.run([sys.executable, str(ROOT / damage_digits.TOOL), "check", str(bad)], capture_output=True,
                         text=True)
    assert run.returncode == 1 and "160 wide" in run.stderr


def test_settings_lines():
    lines = entralink_buffs.damage_number_lines({"damage_numbers": {"battles": "all", "shine": "always",
                                                                     "tiers": [{"from": 0, "light": "#ffffff",
                                                                                "dark": "#000000"}]}})
    text = "\n".join(lines)
    assert "#define ENTRALINK_DAMAGE_NUMBERS_BATTLES 2" in text
    assert "#define ENTRALINK_DAMAGE_NUMBERS_SHINE 2" in text
    assert "#define ENTRALINK_DAMAGE_NUMBERS_TIERS { { 0, 0x7fff, 0x0000 } }" in text
    # Left out: the defaults
    assert f"#define ENTRALINK_DAMAGE_NUMBERS_OVERLAP {entralink_buffs.DEFAULT_DAMAGE_NUMBERS['overlap']}" in text
