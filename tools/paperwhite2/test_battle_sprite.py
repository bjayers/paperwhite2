#!/usr/bin/env python3
"""Tests of the battle sprite art's export and import (tools/paperwhite2/battle_sprite.py) and the rig reader
(mcss.py), on the real res/pokemon, read only: edits go to copies of a group's folder.

    python3 -m unittest tools.paperwhite2.test_battle_sprite
"""
import shutil
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.nitro_2d import color5, read_indexed_png, read_palette, write_indexed_png, write_rgba_png  # noqa: E402
from tools.paperwhite2 import battle_sprite, mcss  # noqa: E402

POKEMON = battle_sprite.POKEMON
# A species, a large one with a flame that never stops, one whose female differs, Spinda, an Unown form and the
# Spiky-eared Pichu (a hack form)
ROUND_TRIP = ("pichu", "charizard", "abomasnow", "spinda", "unown/form_1", "pichu/form_1")


def snapshot(folder: Path) -> dict[str, bytes]:
    return {p.name: p.read_bytes() for p in folder.iterdir() if p.is_file()}


class Workspace:
    """A copy of a group's folder (and its species' data.json beside it) to import into."""

    def __init__(self, name: str):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name) / name.replace("/", "_")
        shutil.copytree(POKEMON / name, self.folder, ignore=shutil.ignore_patterns("form_*", "musical"))

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.temp.cleanup()

    def file(self, name: str, data: bytes) -> Path:
        path = Path(self.temp.name) / "upload" / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path


def exported(folder: Path) -> dict[str, bytes]:
    out = Path(tempfile.mkdtemp()) / "art.zip"
    try:
        battle_sprite.export(folder, out)
        with zipfile.ZipFile(out) as archive:
            return {name.split("/", 1)[1]: archive.read(name) for name in archive.namelist()}
    finally:
        shutil.rmtree(out.parent)


class RoundTrip(unittest.TestCase):
    def test_export_imports_unchanged(self):
        for name in ROUND_TRIP:
            with self.subTest(name=name), Workspace(name) as work:
                before = snapshot(work.folder)
                zipped = Path(work.temp.name) / "art.zip"
                battle_sprite.export(work.folder, zipped)
                result = battle_sprite.check(work.folder, [zipped], False, True, preview=False)
                self.assertTrue(result["ok"], result["errors"])
                self.assertEqual(result["changed"], [])
                self.assertEqual(result["warnings"], [])
                self.assertEqual(snapshot(work.folder), before)

    def test_export_has_every_picture_shiny_copies_and_guides(self):
        files = exported(POKEMON / "abomasnow")
        for name in ("front", "back", "front_female", "back_female", "front_single", "back_single"):
            self.assertEqual(files[f"{name}.png"], (POKEMON / "abomasnow" / f"{name}.png").read_bytes())
            _, _, pixels, colours = read_indexed_png(self.png(files[f"{name}_shiny.png"]))
            self.assertEqual(colours, read_palette(POKEMON / "abomasnow/shiny.pal"))
        for name in ("guide/front.png", "guide/back.png", "guide/front_female.png", "preview/front.png", "README.txt",
                     "normal.pal", "shiny.pal"):
            self.assertIn(name, files)

    def png(self, data: bytes) -> Path:
        path = Path(tempfile.mkdtemp()) / "x.png"
        path.write_bytes(data)
        self.addCleanup(shutil.rmtree, path.parent)
        return path

    def test_other_encodings_import_unchanged(self):
        """An RGBA PNG, and an indexed one whose palette an editor compacted and reordered, give the same pixels."""
        with Workspace("pichu") as work:
            width, height, pixels, colours = read_indexed_png(work.folder / "front.png")
            rgba = bytearray()
            for index in pixels:
                rgba += bytes((*colours[index], 0 if index == 0 else 255))
            used = sorted(set(pixels) - {0}, reverse=True)
            order = [0] + used
            reordered = write_indexed_png(width, height, bytes(order.index(p) for p in pixels),
                                          [colours[i] for i in order])
            for data in (write_rgba_png(width, height, bytes(rgba)), reordered):
                result = battle_sprite.check(work.folder, [work.file("front.png", data)], False, False, preview=False)
                self.assertTrue(result["ok"], result["errors"])
                self.assertEqual(result["changed"], [])


class Edits(unittest.TestCase):
    def sheet(self, folder: Path, name="front"):
        return read_indexed_png(folder / f"{name}.png")

    def test_recolouring_pixels_inside_a_piece(self):
        with Workspace("pichu") as work:
            width, height, pixels, colours = self.sheet(work.folder)
            rig = mcss.read_rig(work.folder, "front")
            _, _, s, t, w, h = mcss.quad_rectangles(rig)[0]
            edited = bytearray(pixels)
            changed = [i for i in range(len(edited))
                       if edited[i] and s <= i % width < s + w and t <= i // width < t + h]
            for i in changed[:10]:
                edited[i] = 1 if edited[i] != 1 else 2
            upload = work.file("front.png", write_indexed_png(width, height, bytes(edited), colours))
            result = battle_sprite.check(work.folder, [upload], False, True)
            self.assertTrue(result["ok"], result["errors"])
            self.assertEqual(result["warnings"], [])
            self.assertEqual([p.rsplit("/", 1)[-1] for p in result["changed"]], ["front.png"])
            self.assertEqual(self.sheet(work.folder)[2], bytes(edited))
            self.assertIn("front", result["preview"]["sides"])

    def test_pixels_outside_every_piece_are_warned(self):
        with Workspace("pichu") as work:
            width, height, pixels, colours = self.sheet(work.folder)
            edited = bytearray(pixels)
            edited[(height - 1) * width + width - 1] = 3
            upload = work.file("front.png", write_indexed_png(width, height, bytes(edited), colours))
            result = battle_sprite.check(work.folder, [upload], False, False, preview=False)
            self.assertTrue(result["ok"])
            self.assertTrue(any("outside every piece" in w for w in result["warnings"]), result["warnings"])

    def test_recolouring_an_index_changes_the_palette_and_every_png(self):
        with Workspace("pichu") as work:
            width, height, pixels, colours = self.sheet(work.folder)
            colours = list(colours)
            colours[5] = (255, 0, 0)
            upload = work.file("front.png", write_indexed_png(width, height, pixels, colours))
            result = battle_sprite.check(work.folder, [upload], False, True, preview=False)
            self.assertTrue(result["ok"], result["errors"])
            names = sorted(p.rsplit("/", 1)[-1] for p in result["changed"])
            self.assertEqual(names, ["back.png", "back_single.png", "front.png", "front_single.png", "normal.pal"])
            self.assertEqual(color5(read_palette(work.folder / "normal.pal")[5]), (31, 0, 0))
            self.assertTrue(any("not in the shiny one" in w for w in result["warnings"]))
            self.assertEqual(read_indexed_png(work.folder / "back.png")[3][5], (255, 0, 0))

    def test_front_and_back_must_agree_on_the_palette(self):
        with Workspace("pichu") as work:
            uploads = []
            for side, colour in (("front", (255, 0, 0)), ("back", (0, 0, 255))):
                width, height, pixels, colours = self.sheet(work.folder, side)
                colours = list(colours)
                colours[5] = colour
                uploads.append(work.file(f"{side}.png", write_indexed_png(width, height, pixels, colours)))
            result = battle_sprite.check(work.folder, uploads, False, False, preview=False)
            self.assertFalse(result["ok"])
            self.assertTrue(any("share one palette" in e for e in result["errors"]))

    def test_too_many_colours_and_wrong_sizes_are_refused(self):
        with Workspace("pichu") as work:
            width, height, pixels, colours = self.sheet(work.folder)
            rgba = bytearray()
            for i, index in enumerate(pixels):
                many = index and i % 7 == 0
                rgba += bytes((i % 200, i // 200 % 200, 7, 255) if many else (*colours[index], 255 if index else 0))
            many = work.file("front.png", write_rgba_png(width, height, bytes(rgba)))
            result = battle_sprite.check(work.folder, [many], False, False, preview=False)
            self.assertFalse(result["ok"])
            self.assertTrue(any("indices are free" in e for e in result["errors"]), result["errors"])
            small = work.file("back.png", write_indexed_png(8, 8, bytes(64), colours))
            result = battle_sprite.check(work.folder, [small], False, False, preview=False)
            self.assertTrue(any("not 256 by 128" in e for e in result["errors"]), result["errors"])

    def test_a_female_sheet_needs_the_group_to_have_one(self):
        with Workspace("pichu") as work:
            width, height, pixels, colours = self.sheet(work.folder)
            upload = work.file("front_female.png", write_indexed_png(width, height, pixels, colours))
            result = battle_sprite.check(work.folder, [upload], False, False, preview=False)
            self.assertFalse(result["ok"])
            self.assertTrue(any("has no front female" in e for e in result["errors"]), result["errors"])

    def test_a_shiny_copy_sets_the_shiny_palette(self):
        with Workspace("pichu") as work:
            files = exported(work.folder)
            path = work.file("front_shiny.png", files["front_shiny.png"])
            width, height, pixels, colours = read_indexed_png(path)
            colours = list(colours)
            colours[3] = (0, 255, 0)
            upload = work.file("front_shiny.png", write_indexed_png(width, height, pixels, colours))
            result = battle_sprite.check(work.folder, [upload], False, True, preview=False)
            self.assertTrue(result["ok"], result["errors"])
            self.assertEqual([p.rsplit("/", 1)[-1] for p in result["changed"]], ["shiny.pal"])
            self.assertEqual(color5(read_palette(work.folder / "shiny.pal")[3]), (0, 31, 0))

    def test_stills_from_the_sheets(self):
        """Pichu's back still is exactly its back's first frame; its front still has 8 pixels touched up."""
        with Workspace("pichu") as work:
            result = battle_sprite.check(work.folder, [], True, False, preview=False)
            self.assertTrue(result["ok"], result["errors"])
            self.assertEqual([p.rsplit("/", 1)[-1] for p in result["changed"]], ["front_single.png"])


class Rig(unittest.TestCase):
    def test_pichu(self):
        rig = mcss.read_rig(POKEMON / "pichu", "front")
        self.assertEqual(len(rig["cells"]), 9)
        self.assertEqual(len(rig["multi_cells"]), 2)
        self.assertEqual(rig["animations"][0]["length"], 348)
        self.assertEqual(rig["parts"][1], ["head"])
        width, height, _, _, pixels = mcss.render(rig, mcss.sheet_pixels(POKEMON / "pichu/front.png"))
        self.assertEqual(sum(1 for p in pixels if p), 565)


if __name__ == "__main__":
    unittest.main()
