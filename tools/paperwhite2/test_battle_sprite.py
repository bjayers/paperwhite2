#!/usr/bin/env python3
"""Tests of the battle sprite art's export and import (tools/paperwhite2/battle_sprite.py) and the rig reader
(mcss.py), on the real res/pokemon, read only: edits go to copies of a group's folder.

    python3 -m unittest tools.paperwhite2.test_battle_sprite
"""
import json
import shutil
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.nitro_2d import (color5, read_indexed_png, read_palette, write_indexed_png, write_palette,  # noqa: E402
                                 write_rgba_png)
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


class IconAndFollower(unittest.TestCase):
    """The zip also carries the party icon (imported back, checked as pokemon_form.py's icon import checks it) and the
    follower's walking sprite sheets (export only)."""

    def test_export_has_the_icon_and_the_follower_sheets(self):
        files = exported(POKEMON / "pichu/form_1")
        self.assertEqual(files["icon.png"], (POKEMON / "pichu/form_1/icon.png").read_bytes())
        for name in ("icon_palette.pal", "preview/icon.png", "preview/follower_pokemon_pichu_form_1.png"):
            self.assertIn(name, files)
        walking = battle_sprite.ACTORS / "pokemon/pichu_form_1"
        self.assertEqual(files["follower/pokemon_pichu_form_1.png"], (walking / "sprite.png").read_bytes())
        # (a sheet on its battle palette has no sprite.pal: the palette given is the group's normal.pal)
        group = battle_sprite.sheet_group(walking)
        palette = POKEMON / group / "normal.pal" if group else walking / "sprite.pal"
        self.assertEqual(files["follower/pokemon_pichu_form_1.pal"], palette.read_bytes())
        readme = files["README.txt"].decode()
        for row in ("pichu_form_1 ", "pichu_form_1_female "):
            self.assertIn(row, readme)
        self.assertIn("Import them back", readme)
        # A sheet a follower has of its own (no "sprite") is exported under its own code
        own = exported(POKEMON / "accelgor")
        self.assertIn("follower/follower_accelgor.png", own)

    def test_an_original_icon_keeps_its_bank(self):
        """Pichu's icon is in the game's bank for it; a colour of another bank only is refused, as for its form any
        bank that has every colour works."""
        palette = read_palette(battle_sprite.pokemon_form.ICON_PALETTES)
        bank = battle_sprite.pokemon_form.original_icon_banks()[(POKEMON / "pichu/icon.png").resolve()]
        other = next(palette[i] for i in range(len(palette)) if i // 16 != bank and i % 16
                     and color5(palette[i]) not in [color5(x) for x in palette[bank * 16:bank * 16 + 16]])
        pixels = [None, tuple(color5(other))] * (32 * 32)
        with self.assertRaises(battle_sprite.pokemon_form.FormError):
            battle_sprite.pokemon_form.fit_icon(pixels, bank)
        found, _, _ = battle_sprite.pokemon_form.fit_icon(pixels)
        self.assertNotEqual(found, bank)
        self.assertNotIn((POKEMON / "pichu/form_1/icon.png").resolve(), battle_sprite.pokemon_form.original_icon_banks())

    def test_an_edited_icon_is_written_and_an_unchanged_follower_sheet_writes_nothing(self):
        with Workspace("pichu/form_1") as work:
            width, height, pixels, colours = read_indexed_png(work.folder / "icon.png")
            mirrored = bytes(pixels[y * width + width - 1 - x] for y in range(height) for x in range(width))
            sheet = (battle_sprite.ACTORS / "pokemon/pichu_form_1/sprite.png").read_bytes()
            result = battle_sprite.check(work.folder, [work.file("icon.png", write_indexed_png(width, height, mirrored,
                                                                                               colours)),
                                                       work.file("pokemon_pichu_form_1.png", sheet)], False, True)
            self.assertTrue(result["ok"], result["errors"])
            self.assertEqual([p.rsplit("/", 1)[-1] for p in result["changed"]], ["icon.png"])
            self.assertTrue(result["preview"]["icons"]["icon"]["changed"])
            self.assertEqual([item["stem"] for item in result["walking"]], ["pokemon_pichu_form_1"])
            self.assertFalse(result["walking"][0]["changed"])
            self.assertEqual(read_indexed_png(work.folder / "icon.png")[2], mirrored)

    def test_a_wrong_icon_is_refused(self):
        with Workspace("pichu/form_1") as work:
            result = battle_sprite.check(work.folder, [work.file("icon.png", write_rgba_png(32, 32, bytes(32 * 32 * 4)))],
                                         False, False, preview=False)
            self.assertFalse(result["ok"])
            self.assertIn("not 32 by 64", result["errors"][0])
            result = battle_sprite.check(work.folder, [work.file("icon_female.png", (work.folder / "icon.png").read_bytes())],
                                         False, False, preview=False)
            self.assertFalse(result["ok"])


class WalkingTree:
    """A copy of the follower rows and walking sprites of a few species (and generated/obj_codes.txt), which the
    walking sprite functions write into: battle_sprite's ACTORS, FOLLOWERS and OBJ_CODES point at it meanwhile."""

    SPECIES = ("budew", "flapple", "applin", "accelgor")

    def __enter__(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.actors = root / "actors"
        for name in self.SPECIES:
            for source in (battle_sprite.FOLLOWERS).glob(f"{name}*"):
                shutil.copytree(source, self.actors / "followers" / source.name)
        for name in ("budew", "applin"):
            shutil.copytree(battle_sprite.ACTORS / "pokemon" / name, self.actors / "pokemon" / name)
        self.codes = root / "obj_codes.txt"
        shutil.copy(battle_sprite.OBJ_CODES, self.codes)
        self.saved = (battle_sprite.ACTORS, battle_sprite.FOLLOWERS, battle_sprite.OBJ_CODES)
        battle_sprite.ACTORS, battle_sprite.FOLLOWERS, battle_sprite.OBJ_CODES = (
            self.actors, self.actors / "followers", self.codes)
        return self

    def __exit__(self, *_):
        battle_sprite.ACTORS, battle_sprite.FOLLOWERS, battle_sprite.OBJ_CODES = self.saved
        self.temp.cleanup()

    def snapshot(self) -> dict[str, bytes]:
        return {p.relative_to(self.temp.name).as_posix(): p.read_bytes()
                for p in Path(self.temp.name).rglob("*") if p.is_file()}

    def sheet(self, name: str):
        return read_indexed_png(self.actors / "pokemon" / name / "sprite.png")


class WalkingSprites(unittest.TestCase):
    """The walking sprites' checked import: each sheet replaced in its own colours, and a new one for a species that
    shows another species' (Flapple: Budew's)."""

    def test_every_sheet_imports_unchanged(self):
        """Each walking sprite of res/field/actors that a follower row shows, imported as it is (its PNG and its
        palette, and the PNG alone): nothing to write, no error."""
        rows = battle_sprite.follower_rows()
        real = battle_sprite.follower_rows
        battle_sprite.follower_rows = lambda: rows
        try:
            seen = 0
            for species, form in sorted({(r["species"], r["form"]) for r in rows}):
                name, _ = battle_sprite.species_names(species)
                for code, sheet in battle_sprite.walking_sheets(name, form).items():
                    png = (sheet["directory"] / "sprite.png").read_bytes()
                    group = battle_sprite.sheet_group(sheet["directory"])
                    pal = (POKEMON / group / "normal.pal" if group else sheet["directory"] / "sprite.pal").read_bytes()
                    for given in ((png, pal), (png, None), (None, pal)):
                        plan = battle_sprite.plan_walking(name, form, code, *given, preview=False)
                        self.assertEqual(plan["errors"], [], code)
                        self.assertEqual(plan["writes"], {}, code)
                    seen += 1
            self.assertGreater(seen, 500)
        finally:
            battle_sprite.follower_rows = real

    def test_a_palette_alone_is_refused_for_a_sheet_on_its_battle_palette(self):
        """A sheet on its battle palette is recoloured in the group's normal.pal, not from here."""
        with WalkingTree() as tree:
            colours = read_palette(POKEMON / "applin/normal.pal")
            recoloured = [colours[0], (255, 0, 0), *colours[2:]]
            plan = battle_sprite.plan_walking("applin", 0, "OBJ_CODE_POKEMON_APPLIN", None,
                                              write_palette(recoloured).encode())
            self.assertTrue(any("normal.pal" in e for e in plan["errors"]), plan["errors"])
            self.assertEqual(plan["writes"], {})

    def test_new_art_is_re_indexed_onto_the_battle_palette(self):
        """A PNG in colours of its own: re-indexed with method F, sprite.png written in the battle normal colours."""
        with WalkingTree() as tree:
            width, height, pixels, colours = tree.sheet("applin")
            # The sheet mirrored, in lighter colours of its own: new art
            mirrored = bytes(pixels[y * width + width - 1 - x] for y in range(height) for x in range(width))
            edited = [colours[0]] + [tuple(min(255, v + 24) for v in c) for c in colours[1:]]
            plan = battle_sprite.plan_walking("applin", 0, "OBJ_CODE_POKEMON_APPLIN",
                                              write_indexed_png(width, height, mirrored, edited), None)
            self.assertEqual(plan["errors"], [])
            self.assertEqual([p.name for p in plan["writes"]], ["sprite.png"])
            self.assertTrue(any("method F" in n for n in plan["notes"]), plan["notes"])
            written = plan["writes"][tree.actors / "pokemon/applin/sprite.png"]
            normal = read_palette(POKEMON / "applin/normal.pal")
            check = tree.actors / "written.png"
            check.write_bytes(written)
            self.assertEqual([battle_sprite.color5(c) for c in read_indexed_png(check)[3][:16]],
                             [battle_sprite.color5(c) for c in normal])

    def test_wrong_sizes_and_too_many_colours_are_refused(self):
        with WalkingTree() as tree:
            width, height, pixels, colours = tree.sheet("applin")
            half = write_indexed_png(width // 2, height, bytes(width // 2 * height), colours)
            plan = battle_sprite.plan_walking("applin", 0, "OBJ_CODE_POKEMON_APPLIN", half, None)
            self.assertIn("not 256 by 32", plan["errors"][0])
            self.assertEqual(plan["writes"], {})
            # 16 distinct opaque colours need 16 indices besides transparent
            rgba = bytearray()
            for i in range(width * height):
                shade = (i // 4) % 16 * 16 + 8
                rgba += bytes((shade, 255 - shade, 77, 255))
            plan = battle_sprite.plan_walking("applin", 0, "OBJ_CODE_POKEMON_APPLIN",
                                              write_rgba_png(width, height, bytes(rgba)), None)
            self.assertTrue(any("colours besides transparent" in e for e in plan["errors"]), plan["errors"])
            self.assertEqual(plan["writes"], {})
            # A palette of fewer than 16 colours
            plan = battle_sprite.plan_walking("applin", 0, "OBJ_CODE_POKEMON_APPLIN", None, write_palette(colours[:8]).encode())
            self.assertIn("8 colours, not 16", plan["errors"][0])
            # A sheet that another species' followers show isn't changed from here
            plan = battle_sprite.plan_walking("flapple", 0, "OBJ_CODE_POKEMON_BUDEW",
                                              write_indexed_png(192, 32, bytes(192 * 32), colours), None)
            self.assertTrue(any("also the walking sprite of other species" in e for e in plan["errors"]), plan["errors"])

    def test_a_new_walking_sprite_makes_the_code_the_sheet_and_the_rows(self):
        with WalkingTree() as tree:
            width, height, pixels, colours = tree.sheet("applin")
            before = tree.codes.read_text()
            plan = battle_sprite.plan_walking("flapple", 0, None, write_indexed_png(width, height, pixels, colours), None)
            self.assertEqual(plan["errors"], [])
            for path, data in plan["writes"].items():
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            # The code follows the last walking Pokémon's, once
            lines = tree.codes.read_text().splitlines()
            self.assertEqual(lines[-1], "OBJ_CODE_POKEMON_FLAPPLE")
            self.assertEqual(lines[:-1], before.splitlines())
            folder = tree.actors / "pokemon/flapple"
            # Re-indexed onto Flapple's battle palette (method F); no sprite.pal of its own
            remapped = battle_sprite.onto_battle_palette(width, height, pixels, [battle_sprite.color5(c) for c in colours],
                                                         "flapple", False)[0]
            self.assertEqual(read_indexed_png(folder / "sprite.png")[2], remapped)
            self.assertFalse((folder / "sprite.pal").exists())
            actor = json.loads((folder / "data.json").read_text())
            self.assertEqual((actor["sprite_controller_type"], actor["sprite_atlas_size"]), (14, 21))
            self.assertEqual(actor.pop("palette"), {"pokemon": "flapple"})
            applin = json.loads((tree.actors / "pokemon/applin/data.json").read_text())
            applin.pop("palette")
            self.assertEqual(actor, applin)
            names = sorted(p.name for p in (tree.actors / "followers").glob("flapple*"))
            self.assertEqual(len(names), 2)
            for name in names:
                data = json.loads((tree.actors / "followers" / name / "data.json").read_text())
                self.assertEqual(data["sprite"], "OBJ_CODE_POKEMON_FLAPPLE")
                self.assertEqual(data["follower"]["animation_profile"], "asymmetric")
                self.assertEqual(data["sprite_controller_type"], 14)
            # It is the species' own now: replacing it again is allowed, and the button's job is done
            self.assertIn("OBJ_CODE_POKEMON_FLAPPLE", battle_sprite.walking_sheets("flapple", 0))
            again = battle_sprite.plan_walking("flapple", 0, None, write_indexed_png(width, height, pixels, colours), None)
            self.assertTrue(any("exists already" in e for e in again["errors"]), again["errors"])
            self.assertEqual(again["writes"], {})

    def test_a_six_frame_sheet_is_mirrored_and_a_wrong_layout_refused(self):
        with WalkingTree() as tree:
            plan = battle_sprite.plan_walking("flapple", 0, None, write_indexed_png(192, 32, bytes(192 * 32), [(0, 0, 0)] * 16), None)
            self.assertEqual(plan["errors"], [])
            self.assertEqual(plan["item"]["layout"], "mirrored")
            row = [d for p, d in plan["writes"].items() if p == tree.actors / "followers/flapple/data.json"][0]
            data = json.loads(row)
            self.assertEqual((data["sprite_controller_type"], data["follower"]["animation_profile"]), (13, "mirrored"))
            self.assertIn("Frame 1 is empty", plan["warnings"][0])
            for size in ((200, 32), (224, 32), (96, 32), (192, 64)):
                bad = battle_sprite.plan_walking("flapple", 0, None,
                                                 write_indexed_png(*size, bytes(size[0] * size[1]), [(0, 0, 0)] * 16), None)
                self.assertTrue(bad["errors"] and not bad["writes"], size)

    def test_the_zip_flow_takes_a_follower_sheet_back(self):
        """An exported zip comes back unchanged; a follower sheet's palette recoloured alone is refused."""
        with WalkingTree() as tree, Workspace("applin") as work:
            zipped = Path(work.temp.name) / "art.zip"
            battle_sprite.export(work.folder, zipped)
            unchanged = battle_sprite.check(work.folder, [zipped], False, False, preview=False)
            self.assertEqual(unchanged["changed"], [], unchanged["errors"])
            self.assertEqual([i["stem"] for i in unchanged["walking"]], ["pokemon_applin"])
            # A recoloured palette alone for a sheet on its battle palette is refused (normal.pal colours it)
            colours = read_palette(POKEMON / "applin/normal.pal")
            pal = write_palette([colours[0], (255, 0, 0), *colours[2:]]).encode()
            result = battle_sprite.check(work.folder, [work.file("pokemon_applin.pal", pal)], False, True, preview=False)
            self.assertFalse(result["ok"])
            self.assertEqual(result["changed"], [])
            # A sheet the group's rows don't show is skipped with a warning
            stray = battle_sprite.check(work.folder, [work.file("pokemon_budew.pal", pal)], False, False, preview=False)
            self.assertTrue(any("not a walking sprite" in w for w in stray["warnings"]), stray["warnings"])
            self.assertEqual(stray["changed"], [])


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
