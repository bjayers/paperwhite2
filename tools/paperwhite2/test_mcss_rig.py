#!/usr/bin/env python3
"""Tests of the battle sprite rig's JSON form, writer and checks (tools/paperwhite2/mcss_rig.py), on the real
res/pokemon, read only. The whole archive's round trip is `mcss_rig.py roundtrip` (1,506 sides, a few seconds).

    python3 -m unittest tools.paperwhite2.test_mcss_rig
"""
import copy
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.nitro_2d import decompress  # noqa: E402
from tools.paperwhite2 import mcss, mcss_rig  # noqa: E402

POKEMON = mcss_rig.ROOT / "res/pokemon"
# Each one has something the rest don't: Pichu; Charizard's never-pausing flame; Kyurem's form 2 and Servine, second
# copies of results; Crawdaunt and Forretress, parts sharing a track instance; species 0, the OBJ mapping and UEXT;
# Shelgon's back, unplayed tracks showing missing pictures; Celebi, Gliscor and Accelgor, the bin's padding; Anorith,
# a rectangle past the sheet's edge; the Spiky-eared Pichu, a hack form
ROUND_TRIP = ("pichu", "charizard", "kyurem/form_2", "servine", "crawdaunt", "forretress", "none", "shelgon",
              "celebi", "gliscor", "accelgor", "anorith", "pichu/form_1")


SCHEMA = json.loads((Path(mcss_rig.__file__).parent / "mcss_rig.schema.json").read_text())


def errors(rig):
    return [message for level, message in mcss_rig.check(rig) if level == "error"]


def schema_errors(value, schema=SCHEMA, where="rig") -> list[str]:
    """The keywords of the schema that the rig's schema uses (no jsonschema in the venv)."""
    if "$ref" in schema:
        target = SCHEMA
        for step in schema["$ref"].lstrip("#/").split("/"):
            target = target[step]
        return schema_errors(value, {**target, **{k: v for k, v in schema.items() if k != "$ref"}}, where)
    out = []
    kinds = {"object": dict, "array": list, "string": str, "null": type(None)}
    kind = schema.get("type")
    if kind == "integer" and not (isinstance(value, int) and not isinstance(value, bool)):
        return [f"{where}: not an integer"]
    if kind == "number" and not isinstance(value, (int, float)):
        return [f"{where}: not a number"]
    if kind in kinds and not isinstance(value, kinds[kind]):
        return [f"{where}: not {kind}"]
    if "const" in schema and value != schema["const"]:
        out.append(f"{where}: not {schema['const']}")
    if "enum" in schema and value not in schema["enum"]:
        out.append(f"{where}: {value!r} not in {schema['enum']}")
    if "minimum" in schema and value < schema["minimum"] or "maximum" in schema and value > schema["maximum"]:
        out.append(f"{where}: {value} out of range")
    if "oneOf" in schema and sum(not schema_errors(value, option, where) for option in schema["oneOf"]) != 1:
        out.append(f"{where}: matches no one of oneOf")
    if isinstance(value, dict):
        for name in schema.get("required", []):
            if name not in value:
                out.append(f"{where}: no {name}")
        for name, item in value.items():
            if name in schema.get("properties", {}):
                out += schema_errors(item, schema["properties"][name], f"{where}.{name}")
            elif schema.get("additionalProperties") is False:
                out.append(f"{where}: {name} isn't in the schema")
    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0) or len(value) > schema.get("maxItems", len(value)):
            out.append(f"{where}: {len(value)} items")
        for number, item in enumerate(value):
            out += schema_errors(item, schema.get("items", {}), f"{where}[{number}]")
    return out


class RoundTrip(unittest.TestCase):
    def test_files_json_files(self):
        for group in ROUND_TRIP:
            for side in mcss_rig.SIDES:
                with self.subTest(group=group, side=side):
                    files = mcss_rig.read_files(POKEMON / group, side)
                    rig = json.loads(json.dumps(mcss_rig.rig_from_files(files, side)))
                    self.assertEqual(errors(rig), [])
                    self.assertEqual(schema_errors(rig), [])
                    self.assertEqual(mcss_rig.files_from_rig(rig), files)

    def test_json_rig_json(self):
        rig = mcss_rig.read_side(POKEMON / "pichu", "front")
        text = json.dumps(rig, indent=1)
        self.assertEqual(json.dumps(mcss_rig.rig_from_files(mcss_rig.files_from_rig(json.loads(text)), "front"),
                                    indent=1), text)

    def test_schema_catches(self):
        rig = mcss_rig.read_side(POKEMON / "pichu", "back")
        rig["tracks"][0]["keys"][0]["angle"] = 3
        rig["poses"][0]["parts"][0]["play"] = "again"
        self.assertEqual(len(schema_errors(rig)), 2)

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
        rig = mcss_rig.read_side(POKEMON / "pichu", "front")
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            for kind, blob in mcss_rig.read_files(POKEMON / "pichu", "front").items():
                (folder / f"front{mcss_rig.FILES[kind]}").write_bytes(blob)
            self.assertEqual(mcss_rig.write_side(rig, folder, "front"), [])
            rig["poses"][0]["parts"][0]["pivot"] = [7, -9]
            rig["tracks"][2]["keys"].append({"picture": 0, "frames": 6, "rotation": 100, "scale": [1, 1.5],
                                             "move": [1, -1]})
            written = mcss_rig.write_side(rig, folder, "front")
            self.assertEqual(sorted(path.name for path in written),
                             ["front_animations.nanr.lz11", "front_multi_cells.nmcr"])
            self.assertEqual(mcss_rig.read_side(folder, "front"), rig)
            # and the renderer draws the edited rig
            self.assertEqual(mcss.read_rig(folder, "front")["multi_cells"][0][0]["x"], 7)


class Compression(unittest.TestCase):
    def test_originals_byte_for_byte(self):
        for group in ("pichu", "kyurem/form_2", "spinda"):
            blob = (POKEMON / group / "back_animations.nanr.lz11").read_bytes()
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
