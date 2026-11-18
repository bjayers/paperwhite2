#!/usr/bin/env python3
"""Tests of the palette variation's reference transform and packer (tools/paperwhite2/palette_variation.py). The
shared vectors are checked here and by editor/tests/palette-variation.test.ts, so the editor's preview and the
reference agree; the C follows the same steps (checked in the emulator, docs/paperwhite2/design/palette-variation.md).

    python3 -m unittest tools.paperwhite2.test_palette_variation
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data import datajson  # noqa: E402
from tools.paperwhite2 import palette_variation as pv  # noqa: E402

DEFAULT = {"enabled": True, "hue_degrees": 12, "brightness_percent": 6, "saturation_percent": 10}
STRONG = {"enabled": True, "hue_degrees": 45, "brightness_percent": 25, "saturation_percent": 50}


class Vectors(unittest.TestCase):
    def test_vectors_match_the_reference(self):
        data = json.loads(pv.VECTORS.read_text())
        self.assertGreater(len(data["cases"]), 100)
        for case in data["cases"]:
            colors = [pv.from_bgr555(v) for v in data["palettes"][case["palette"]]]
            out = pv.vary_palette(colors, case["key"], case["settings"], case["strength"])
            self.assertEqual([pv.bgr555(c) for c in out], case["output"], case)

    def test_vectors_vary_something(self):
        data = json.loads(pv.VECTORS.read_text())
        moved = [c for c in data["cases"] if c["output"] != data["palettes"][c["palette"]]]
        self.assertGreater(len(moved), len(data["cases"]) // 3)


class Transform(unittest.TestCase):
    def test_greys_white_black_and_index_0_stay(self):
        greys = [(31, 0, 31)] + [(v, v, v) for v in range(0, 32, 2)][:15]
        for cfg in (DEFAULT, STRONG):
            for key in range(256):
                out = pv.vary_palette(greys, key, cfg, 100)
                self.assertEqual(out, greys, (cfg, key))

    def test_strength_0_and_off_change_nothing(self):
        colors = pv.MADE_PALETTE
        for key in range(256):
            self.assertEqual(pv.vary_palette(colors, key, STRONG, 0), colors)
            self.assertEqual(pv.vary_palette(colors, key, {**STRONG, "enabled": False}, 100), colors)

    def test_channels_stay_5_bit(self):
        for key in range(256):
            for c in pv.vary_palette(pv.MADE_PALETTE, key, STRONG, 100):
                self.assertTrue(all(0 <= axis <= 31 for axis in c))

    def test_the_hue_ends_turn_opposite_ways(self):
        cfg = {**DEFAULT, "brightness_percent": 0, "saturation_percent": 0}
        red = [(0, 0, 0), (28, 4, 4)]
        low = pv.vary_palette(red, 0x00, cfg, 100)[1]
        high = pv.vary_palette(red, 0x0F, cfg, 100)[1]
        self.assertNotEqual(low, high)
        self.assertEqual(low[0], high[0])
        # One end leans to green, the other to blue
        self.assertEqual(sorted([low[1] > low[2], high[1] > high[2]]), [False, True])

    def test_a_faint_tint_moves_less_than_a_strong_colour(self):
        cfg = {**DEFAULT, "brightness_percent": 0, "saturation_percent": 0}
        pale = (31, 29, 29)
        strong = (31, 6, 6)
        shift = [sum(abs(a - b) for a, b in zip(c, pv.vary_palette([(0, 0, 0), c], 0x0F, cfg, 100)[1]))
                 for c in (pale, strong)]
        self.assertLess(shift[0], shift[1])

    def test_the_candy_keeps_the_key(self):
        # The Shiny Candy keeps the PID's low 16 bits (PaperWhite2_MakeShinyPID), so its byte 1
        self.assertEqual(pv.key_of(0x1234ABCD), 0xAB)
        self.assertEqual(pv.key_of(0xFFFFABCD), pv.key_of(0x0000ABCD))


class Packer(unittest.TestCase):
    def test_the_file_packs(self):
        text = pv.header(pv.SOURCE)
        self.assertIn("PAPERWHITE2_PALETTE_VARIATION_STRENGTHS", text)
        cfg = pv.settings()
        self.assertIn(datajson.constants()["SPECIES_KECLEON"], cfg["strengths"])

    def test_a_species_listed_twice_is_refused(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            (folder / "palette_variation.schema.json").write_text(
                (pv.SOURCE.parent / "palette_variation.schema.json").read_text())
            path = folder / "palette_variation.json"
            path.write_text(json.dumps({**DEFAULT, "species": [{"species": "SPECIES_UNOWN", "strength": 0},
                                                               {"species": "SPECIES_UNOWN", "strength": 50}]}))
            with self.assertRaises(datajson.DataError):
                pv.settings(path)


if __name__ == "__main__":
    unittest.main()
