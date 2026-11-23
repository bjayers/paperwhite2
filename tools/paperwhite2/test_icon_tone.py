"""Tests of tools/paperwhite2/icon_tone.py (the icons' game tone) on made-up palettes."""
import json
import math
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.datajson import dumps  # noqa: E402
from tools.paperwhite2 import icon_tone, poke_icons  # noqa: E402

PARAMS = {"enabled": True, "strength": 1.0, "lightness_spread": 0.12, "min_contrast": 0.5, "chroma_knee": 0.18,
          "chroma_above_knee": 0.5}
GREYS = [(0x62, 0x62, 0x5a), (0x41, 0x41, 0x41)]
# A made-up icon palette: transparency, a deep-shaded blue body, a vivid red, white, black, an unused slot, the greys
COLOURS = ([(0, 128, 0), (20, 40, 120), (60, 90, 200), (140, 170, 250), (230, 20, 20), (255, 255, 255), (8, 8, 8),
            (200, 160, 40)] + [(0, 128, 0)] * 6 + GREYS)
COUNTS = [900, 120, 300, 200, 40, 60, 30, 0] + [0] * 6 + [300, 98]


def lightness_spread(colours, counts):
    used = [i for i in range(1, 14) if counts[i]]
    lch = {i: icon_tone.oklch(colours[i]) for i in used}
    total = sum(counts[i] for i in used)
    mean = sum(lch[i][0] * counts[i] for i in used) / total
    return math.sqrt(sum((lch[i][0] - mean) ** 2 * counts[i] for i in used) / total)


def test_strength_zero_is_the_identity():
    assert icon_tone.tone(COLOURS, COUNTS, PARAMS, 0) == COLOURS
    assert icon_tone.tone(COLOURS, COUNTS, {**PARAMS, "strength": 0.0}) == COLOURS


@pytest.mark.parametrize("strength", [0.25, 0.5, 1.0])
def test_transparency_and_outlines_untouched(strength):
    toned = icon_tone.tone(COLOURS, COUNTS, PARAMS, strength)
    assert toned[0] == COLOURS[0] and toned[14:] == GREYS


@pytest.mark.parametrize("strength", [0.5, 1.0])
def test_hue_kept(strength):
    toned = icon_tone.tone(COLOURS, COUNTS, PARAMS, strength)
    for before, after in zip(COLOURS[1:14], toned[1:14]):
        a, b = icon_tone.oklch(before), icon_tone.oklch(after)
        if a[1] > 0.04:
            assert abs((math.degrees(a[2] - b[2]) + 180) % 360 - 180) < 3


def test_lightness_spread_comes_down_toward_the_target_and_the_top_stays():
    before = lightness_spread(COLOURS, COUNTS)
    half = icon_tone.tone(COLOURS, COUNTS, PARAMS, 0.5)
    full = icon_tone.tone(COLOURS, COUNTS, PARAMS, 1.0)
    assert lightness_spread(full, COUNTS) < lightness_spread(half, COUNTS) < before
    # never flatter than min_contrast of it
    assert lightness_spread(full, COUNTS) >= 0.5 * before - 0.01
    assert full[5] == (255, 255, 255)
    # the dark colours lighten, never darken
    for i in (1, 2, 6):
        assert icon_tone.oklch(full[i])[0] > icon_tone.oklch(COLOURS[i])[0]


def test_a_flat_icon_keeps_its_lightness():
    colours = [(0, 0, 0), (200, 120, 120), (210, 130, 130)] + [(0, 0, 0)] * 11 + GREYS
    counts = [0, 100, 100] + [0] * 13
    assert icon_tone.tone(colours, counts, {**PARAMS, "chroma_knee": 1.0}) == colours


def test_chroma_above_the_knee_comes_down():
    red = icon_tone.oklch(COLOURS[4])
    assert red[1] > PARAMS["chroma_knee"]
    toned = icon_tone.oklch(icon_tone.tone(COLOURS, COUNTS, PARAMS, 1.0)[4])
    assert toned[1] < red[1]


def test_no_used_slots_or_bad_lengths():
    assert icon_tone.tone(COLOURS, [5] + [0] * 13 + [5, 5], PARAMS) == COLOURS
    with pytest.raises(ValueError):
        icon_tone.tone(COLOURS[:15], COUNTS, PARAMS)


def test_toned_colours_without_a_tone_are_the_plain_ones():
    pixels = bytes([1] * 100 + [2] * 100 + [0] * (32 * 64 - 200))
    plain = poke_icons.rgb555(COLOURS) + poke_icons.rgb555(COLOURS)
    assert poke_icons.toned_colours(pixels, COLOURS, COLOURS, None) == plain
    assert poke_icons.toned_colours(pixels, COLOURS, COLOURS, {**PARAMS, "strength": 0.0}) == plain
    assert poke_icons.toned_colours(pixels, COLOURS, COLOURS, PARAMS) != plain


def test_load_checks(tmp_path):
    path = tmp_path / "icon_tone.json"
    path.write_text(dumps(PARAMS))
    assert icon_tone.load(path) == PARAMS
    for bad in ({**PARAMS, "enabled": 1}, {**PARAMS, "strength": 1.5}, {**PARAMS, "min_contrast": -0.1},
                {k: v for k, v in PARAMS.items() if k != "chroma_knee"}):
        path.write_text(dumps(bad))
        with pytest.raises(ValueError):
            icon_tone.load(path)


def test_the_real_file_is_valid():
    # Validity only: the user tunes the values
    params = icon_tone.load()
    assert icon_tone.TONE_FILE.read_text() == dumps(params)


def test_command(tmp_path):
    data = tmp_path / "data.json"
    data.write_text(json.dumps({"colours": COLOURS, "counts": COUNTS, "strength": 0.5, "params": PARAMS}))
    out = subprocess.run([sys.executable, str(Path(icon_tone.__file__)), "colours", str(data)], capture_output=True,
                         text=True, check=True).stdout
    assert [tuple(c) for c in json.loads(out)["colours"]] == icon_tone.tone(COLOURS, COUNTS, PARAMS, 0.5)
