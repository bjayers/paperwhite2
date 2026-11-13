#!/usr/bin/env python3
"""Tests of the battle sprite rig's JSON form, writer and checks (tools/paperwhite2/mcss_rig.py), on the real
res/pokemon, read only. The whole archive's round trip is `mcss_rig.py roundtrip` (1,506 sides, about 20 seconds).

    python3 -m unittest tools.paperwhite2.test_mcss_rig
"""
import copy
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(1, str(Path(__file__).resolve().parents[2] / "tools" / "data"))
from tools.data.datajson import DataError, load_schema, validate  # noqa: E402
from tools.data.narc import read_narc  # noqa: E402
from tools.data.nitro_2d import decompress  # noqa: E402
from tools.data.pokemon_graphics import SUBSTITUTE_FILES, battle_file  # noqa: E402
from tools.paperwhite2 import mcss, mcss_rig  # noqa: E402

POKEMON = mcss_rig.ROOT / "res/pokemon"
# The original archive, where it is extracted (the ROM session's checkout)
ORIGINAL = mcss_rig.ROOT / "extract/w2_us/files/a/0/0/4"
# Each one has something the rest don't: Pichu; Charizard's never-pausing flame; Kyurem's form 2 and Servine, second
# copies of results; Crawdaunt and Forretress, parts sharing a track instance; species 0, the OBJ mapping and UEXT;
# Shelgon's back, unplayed tracks showing missing pictures; Celebi, Gliscor and Accelgor, the bin's padding; Anorith,
# a rectangle past the sheet's edge; the Spiky-eared Pichu, a hack form
ROUND_TRIP = ("pichu", "charizard", "kyurem/form_2", "servine", "crawdaunt", "forretress", "none", "shelgon",
              "celebi", "gliscor", "accelgor", "anorith", "pichu/form_1")


SCHEMA = load_schema(mcss_rig.SCHEMA)


def errors(rig):
    return [message for level, message in mcss_rig.check(rig) if level == "error"]


def schema_error(rig) -> str | None:
    """What the build's validator (tools/data/datajson.py) says of a rig, or None."""
    try:
        validate(rig, SCHEMA, "")
    except DataError as error:
        return str(error)
    return None


class RoundTrip(unittest.TestCase):
    def test_json_files_json(self):
        for group in ROUND_TRIP:
            for side in mcss_rig.SIDES:
                with self.subTest(group=group, side=side):
                    folder = POKEMON / group
                    text = mcss_rig.rig_path(folder, side).read_text()
                    rig = mcss_rig.loads(text)
                    self.assertEqual(errors(rig), [])
                    self.assertIsNone(schema_error(rig))
                    files = mcss_rig.files_from_rig(rig)
                    self.assertEqual(mcss_rig.dumps(mcss_rig.rig_from_files(files, side), folder), text)
                    self.assertEqual(mcss_rig.rig_from_files(mcss_rig.files_from_rig(rig, compress=False), side),
                                     rig)

    @unittest.skipUnless(ORIGINAL.is_file(), "no extracted White 2 (extract/w2_us)")
    def test_files_are_the_originals(self):
        """The files built from the rigs are the original archive's members (the hack's own form, the Spiky-eared
        Pichu's, after them, is left out)."""
        archive = read_narc(ORIGINAL.read_bytes())
        wanted = {POKEMON / group for group in ROUND_TRIP if group != "pichu/form_1"}
        found = 0
        for index in range(SUBSTITUTE_FILES):
            path, kind, options = battle_file(POKEMON, index, False)
            if kind == "rig" and path.parent in wanted:
                rig = mcss_rig.read_side(path.parent, options["side"])
                self.assertEqual(mcss_rig.files_from_rig(rig)[options["member"]], archive[index], path)
                found += 1
        self.assertEqual(found, 5 * 2 * len(wanted))

    def test_schema_catches(self):
        rig = mcss_rig.read_side(POKEMON / "pichu", "back")
        for edit in (lambda rig: rig["tracks"][0]["keys"][0].update(angle=3),
                     lambda rig: rig["poses"][0]["parts"][0].update(play="again"),
                     lambda rig: rig.update(format=2)):
            edited = copy.deepcopy(rig)
            edit(edited)
            self.assertIsNotNone(schema_error(edited))

    def test_agrees_with_the_reader(self):
        """The rig holds what mcss.read_rig reads, so the renderer's view and the writer's are the same files."""
        rig = mcss_rig.read_side(POKEMON / "charizard", "front")
        old = mcss.read_rig(POKEMON / "charizard", "front")
        self.assertEqual(len(rig["pictures"]), len(old["cells"]))
        self.assertEqual([[(r["sheet"][0], r["sheet"][1], r["size"][0], r["size"][1], r["at"][0], r["at"][1])
                           for r in p["rectangles"]] for p in rig["pictures"]],
                         [[(q["s"], q["t"], q["w"], q["h"], q["x"], q["y"]) for q in cell] for cell in old["cells"]])
        self.assertEqual([[(p["track"], *p["pivot"]) for p in pose["parts"]] for pose in rig["poses"]],
                         [[(n["sequence"], n["x"], n["y"]) for n in pose] for pose in old["multi_cells"]])
        self.assertEqual([[k["frames"] for k in t["keys"]] for t in rig["tracks"]],
                         [[f["frames"] for f in s["frames"]] for s in old["cell_animations"]])
        self.assertEqual(rig["idle_parts"], old["idle_nodes"])

    def test_write_side_writes_only_changes(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            shutil.copy(mcss_rig.rig_path(POKEMON / "pichu", "front"), folder)
            rig = mcss_rig.read_side(folder, "front")
            # The copy names its schema from where it is
            self.assertEqual(mcss_rig.write_side(rig, folder, "front"), [mcss_rig.rig_path(folder, "front")])
            self.assertEqual(mcss_rig.write_side(rig, folder, "front"), [])
            rig["poses"][0]["parts"][0]["pivot"] = [7, -9]
            rig["tracks"][2]["keys"].append({"picture": 0, "frames": 6, "rotation": 100, "scale": [1, 1.5],
                                             "move": [1, -1]})
            self.assertEqual(mcss_rig.write_side(rig, folder, "front"), [mcss_rig.rig_path(folder, "front")])
            self.assertEqual(mcss_rig.read_side(folder, "front"), rig)
            # and the renderer draws the edited rig
            self.assertEqual(mcss.read_rig(folder, "front")["multi_cells"][0][0]["x"], 7)

    def test_layout_and_schema_path(self):
        text = mcss_rig.rig_path(POKEMON / "pichu" / "form_1", "back").read_text()
        self.assertTrue(text.startswith('{\n  "$schema": "../../battle_sprite_rig.schema.json",\n  "format": 1,\n'))
        self.assertIn('\n      "rectangles": [ { "sheet": [', text)


class Compression(unittest.TestCase):
    def test_originals_byte_for_byte(self):
        # The musical sprites' own NANRs, which stay files, are originals
        for group in ("pichu", "spinda", "charizard"):
            blob = (POKEMON / group / "musical" / "back_animations.nanr.lz11").read_bytes()
            self.assertEqual(mcss_rig.compress_lz11(decompress(blob)), blob)

    def test_decompresses(self):
        data = os.urandom(3000) + bytes(5000) + b"abc" * 3000 + os.urandom(100) + b"x" * 70000
        self.assertEqual(decompress(mcss_rig.compress_lz11(data)), data)


class Checks(unittest.TestCase):
    def setUp(self):
        self.rig = mcss_rig.read_side(POKEMON / "pichu", "front")

    def test_originals_warn(self):
        rig = mcss_rig.read_side(POKEMON / "anorith", "front")
        self.assertEqual(errors(rig), [])
        self.assertTrue(any("mirrored" in message for _, message in mcss_rig.check(rig)))
        rig = mcss_rig.read_side(POKEMON / "shelgon", "back")
        self.assertEqual(errors(rig), [])
        self.assertTrue(any("past the 5 pictures" in message for _, message in mcss_rig.check(rig)))

    def test_errors(self):
        cases = {
            "parts": lambda rig: rig["poses"][0]["parts"].extend([rig["poses"][0]["parts"][0]] * 56),
            "past the sheet's mirrored copy": lambda rig: rig["pictures"][0]["rectangles"][0].update(sheet=[250, 0],
                                                                                                    size=[300, 8]),
            "past the 9 pictures": lambda rig: rig["tracks"][0]["keys"][0].update(picture=9),
            "past the 2 poses": lambda rig: rig["sequences"][0]["keys"][0].update(pose=2),
            "past the 18 tracks": lambda rig: rig["poses"][1]["parts"][0].update(track=18),
            "idle part": lambda rig: rig.update(idle_parts=[9]),
            "rectangles": lambda rig: rig["pictures"][1]["rectangles"].append(rig["pictures"][1]["rectangles"][0]),
            "rotation": lambda rig: rig["tracks"][2]["keys"][0].update(rotation=65536),
            "can't hold": lambda rig: rig["tracks"][0]["keys"][0].update(rotation=100),
            "has no move": lambda rig: rig["tracks"][2]["keys"][0].pop("move"),
            "track instance": lambda rig: rig["poses"][0].update(instances=3),
        }
        for expected, edit in cases.items():
            with self.subTest(expected):
                rig = copy.deepcopy(self.rig)
                edit(rig)
                self.assertTrue(any(expected in message for message in errors(rig)), errors(rig))
                with tempfile.TemporaryDirectory() as temp:
                    with self.assertRaises(mcss_rig.RigError):
                        mcss_rig.write_side(rig, Path(temp), "front")

    def test_generated_objs(self):
        for picture in self.rig["pictures"]:
            self.assertEqual(mcss_rig.generate_objs(picture), picture["objs"])


if __name__ == "__main__":
    unittest.main()
