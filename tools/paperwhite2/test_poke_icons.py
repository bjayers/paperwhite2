"""Tests of tools/paperwhite2/poke_icons.py (the icons' battle palettes packed for the game) on made-up icons."""
import struct
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.paperwhite2 import poke_icons  # noqa: E402

GREYS = ["#62625a", "#414141"]
# A battle palette: colour i is (i * 16, 0, 255 - i * 16); the shiny's (0, i * 16, 0)
NORMAL = [(i * 16, 0, 255 - i * 16) for i in range(16)]
SHINY = [(0, i * 16, 0) for i in range(16)]
# A bank: colour i is (i * 17, i * 17, i * 17)
BANK = [(i * 17, i * 17, i * 17) for i in range(16)]


def icon(*runs):
    """32x64 pixels: runs of (index, count) from the top left, the rest 0."""
    pixels = bytearray(32 * 64)
    at = 0
    for index, count in runs:
        pixels[at:at + count] = bytes([index]) * count
        at += count
    return bytes(pixels)


def test_colours_follow_the_slots():
    colours = poke_icons.icon_colours([3, 7], GREYS, NORMAL)
    assert len(colours) == 16
    assert colours[0] == NORMAL[0]
    assert colours[1] == NORMAL[3] and colours[2] == NORMAL[7]
    assert colours[3:14] == [NORMAL[0]] * 11
    assert colours[14:] == [(0x62, 0x62, 0x5a), (0x41, 0x41, 0x41)]
    with pytest.raises(ValueError):
        poke_icons.icon_colours(list(range(1, 15)), GREYS, NORMAL)


def test_rgb555():
    data = poke_icons.rgb555([(255, 0, 0), (0, 255, 0), (0, 0, 255)] + [(0, 0, 0)] * 13)
    assert struct.unpack_from("<3H", data) == (0x001f, 0x03e0, 0x7c00)
    assert len(data) == 32
    with pytest.raises(ValueError):
        poke_icons.rgb555([(0, 0, 0)])


def test_an_unedited_icon_keeps_its_vanilla_pixels():
    # Slot 1 covers vanilla 4 and 5 (a merge), slot 2 vanilla 9; each keeps its own index
    vanilla = icon((4, 10), (5, 6), (9, 8), (0, 4), (15, 3))
    battle = icon((1, 16), (2, 8), (0, 4), (15, 3))
    fallback, normal, shiny = poke_icons.entry(battle, [2, 6], GREYS, NORMAL, SHINY, vanilla, BANK)
    assert fallback == vanilla
    assert normal[1] == NORMAL[2] and shiny[1] == SHINY[2] and shiny[14] == normal[14]


def test_a_minor_vanilla_index_takes_the_slots_main_one():
    # Slot 1 over 10 pixels of vanilla 4 and 2 of vanilla 7: those 2 are under a quarter, so they become 4
    vanilla = icon((4, 10), (7, 2))
    battle = icon((1, 12))
    fallback, _, _ = poke_icons.entry(battle, [5], GREYS, NORMAL, SHINY, vanilla, BANK)
    assert fallback[:12] == bytes([4]) * 12


def test_edits_follow_the_battle_icon():
    # A pixel drawn where vanilla was clear takes its slot's index; one cleared stays clear
    vanilla = icon((0, 1), (6, 8), (3, 1))
    battle = icon((1, 9), (0, 1))
    fallback, _, _ = poke_icons.entry(battle, [8], GREYS, NORMAL, SHINY, vanilla, BANK)
    assert fallback[:10] == bytes([6]) * 9 + b"\0"


def test_a_new_slot_takes_the_nearest_bank_colour():
    # Slot 2 has no vanilla pixels under it: battle colour 8 is (128, 0, 127), nearest grey 5 or 6 (85 or 102)
    vanilla = icon((4, 4))
    battle = icon((1, 4), (2, 4))
    fallback, _, _ = poke_icons.entry(battle, [1, 8], GREYS, NORMAL, SHINY, vanilla, BANK)
    assert fallback[4:8] == bytes([5]) * 4


def test_checks():
    with pytest.raises(ValueError, match="past"):
        poke_icons.entry(icon((3, 1)), [1, 2], GREYS, NORMAL, SHINY, icon(), BANK)
    with pytest.raises(ValueError):
        poke_icons.entry(b"\0" * 10, [1], GREYS, NORMAL, SHINY, icon(), BANK)
