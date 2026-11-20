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


# Fixture settings: two tiers, their colours and the outline set apart from the fixture sheet's
NUMBERS = {**entralink_buffs.DEFAULT_DAMAGE_NUMBERS, "outline": "#080000",
           "tiers": [{"from": 0, "colors": ["#100000", "#200000", "#300000", "#400000"]},
                     {"from": 1000, "colors": ["#000800", "#001000", "#001800", "#002000"]}]}


def test_placeholder_packs(tmp_path):
    sheet = tmp_path / "digits.png"
    sheet.write_bytes(damage_digits.placeholder())
    rows, pixels, colors = damage_digits.read_sheet(sheet)
    assert rows == 1 + damage_digits.PLACEHOLDER_SHINE_FRAMES
    member = damage_digits.member(sheet, NUMBERS)
    assert member[:4] == bytes([rows, 16, 32, 2])
    assert len(member) == 4 + 2 * 32 + rows * 10 * 256
    # Every digit uses the outline and the tier colours, its shine rows the shine, and keeps its side columns blank
    for row in range(rows):
        for digit in range(10):
            cell = [pixels[(row * 32 + y) * 160 + digit * 16 + x] for y in range(32) for x in range(16)]
            assert {damage_digits.OUTLINE, damage_digits.MAIN, damage_digits.LIGHT_SHADOW} <= set(cell)
            assert set(cell) <= {0, *range(1, 6)}
            assert not any(pixels[(row * 32 + y) * 160 + digit * 16 + x] for y in range(32) for x in (0, 15))


def test_cell_is_a_16_colour_texture(tmp_path):
    pixels = bytearray(damage_digits.WIDTH * 32)
    # Digit 1's cell: its top-left pixel 3 and the next 5, its last pixel 7
    pixels[16 + 1] = 3
    pixels[16 + 2] = 5
    pixels[31 * 160 + 16 + 14] = 7
    sheet = tmp_path / "s.png"
    write_sheet(sheet, 1, bytes(pixels))
    member = damage_digits.member(sheet, NUMBERS)
    cell = member[4 + 2 * 32 + 256:4 + 2 * 32 + 512]
    assert cell[0] == 0x30 and cell[1] == 0x05
    assert cell[255] == 0x07


def test_tier_palettes(tmp_path):
    """Each tier's palette is the sheet's with the outline over entry 1 and the tier's four colours over 2-5."""
    sheet = tmp_path / "s.png"
    write_sheet(sheet, 2)
    member = damage_digits.member(sheet, NUMBERS)
    first = struct.unpack_from("<16H", member, 4)
    second = struct.unpack_from("<16H", member, 4 + 32)
    assert first[1] == second[1] == 1
    assert first[2:6] == (2, 4, 6, 8)
    assert second[2:6] == (1 << 5, 2 << 5, 3 << 5, 4 << 5)
    # The rest is the sheet's: colour 15 of the fixture is (240, 240, 240), 29 a channel in 5 bits
    assert first[6:] == second[6:]
    assert first[15] == 29 | 29 << 5 | 29 << 10


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
    info = json.loads(info.read_text())
    assert info["colors"][0] == "#ffffff"
    # The pixels, a hex digit each, for the editor's preview
    rows, pixels, _ = damage_digits.read_sheet(damage_digits.SHEET)
    assert info["pixels"] == "".join("%x" % p for p in pixels) and len(info["pixels"]) == 160 * 32 * rows
    width, height, _, colors = read_indexed_png(output)
    assert width == 160 and height % 32 == 0
    listed = json.loads(subprocess.run([sys.executable, str(ROOT / damage_digits.TOOL), "list"], capture_output=True,
                                       text=True, check=True).stdout)
    assert listed[0]["path"] == "res/paperwhite2/battle/damage_digits.png" and listed[0]["heightStep"] == 32
    # The tier colours' place: the settings that hold the outline and the tiers' four colours each
    spec = listed[0]["tierColors"]
    held = json.loads((ROOT / spec["file"]).read_text())
    for key in spec["at"]:
        held = held[key]
    assert (spec["first"], spec["outline"]) == (2, 1) and all(len(t["colors"]) == 4 for t in held["tiers"])
    bad = tmp_path / "bad.png"
    write_sheet(bad, 1, width=150)
    run = subprocess.run([sys.executable, str(ROOT / damage_digits.TOOL), "check", str(bad)], capture_output=True,
                         text=True)
    assert run.returncode == 1 and "160 wide" in run.stderr


def test_settings_lines():
    lines = entralink_buffs.damage_number_lines({"damage_numbers": {"battles": "all", "shine": "always",
                                                                     "tiers": NUMBERS["tiers"]}})
    text = "\n".join(lines)
    assert "#define ENTRALINK_DAMAGE_NUMBERS_BATTLES 2" in text
    assert "#define ENTRALINK_DAMAGE_NUMBERS_SHINE 2" in text
    assert "#define ENTRALINK_DAMAGE_NUMBERS_TIER_COUNT 2" in text
    assert "#define ENTRALINK_DAMAGE_NUMBERS_TIER_FROM { 0, 1000 }" in text
    # Left out: the defaults
    assert f"#define ENTRALINK_DAMAGE_NUMBERS_OVERLAP {entralink_buffs.DEFAULT_DAMAGE_NUMBERS['overlap']}" in text
