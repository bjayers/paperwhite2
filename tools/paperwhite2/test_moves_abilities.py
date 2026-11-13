#!/usr/bin/env python3
"""Tests of the added moves' and abilities' lists (tools/data/move_list.py, tools/data/ability_list.py), the headers
the hack's build generates from them (tools/paperwhite2/moves.py, tools/paperwhite2/abilities.py) and Easy Chat's word
counts (tools/text/pms_words.py), on copies of generated/ and res/ in a temporary directory.

    python3 -m unittest tools.paperwhite2.test_moves_abilities
"""
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data import ability_list, move_data, move_list  # noqa: E402
from tools.data.datajson import constants  # noqa: E402
from tools.paperwhite2 import abilities, moves  # noqa: E402
from tools.text import pms_words, text_sources  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]


def original_lines(path: Path, last_original: str) -> str:
    """A list file's text up to its last original constant: the repository's own added ones taken out."""
    lines = path.read_text().splitlines(keepends=True)
    return "".join(lines[:[line.strip() for line in lines].index(last_original) + 1])


class Lists(unittest.TestCase):
    """A copy of moves.txt, abilities.txt, res/moves and res/abilities with only the original game's moves and
    abilities, that a test may append to."""

    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        base = Path(cls.temp.name)
        cls.pristine = base / "pristine"
        shutil.copytree(ROOT / "res" / "moves", cls.pristine / "moves")
        shutil.copytree(ROOT / "res" / "abilities", cls.pristine / "abilities")
        for move in move_list.added_moves():
            shutil.rmtree(cls.pristine / "moves" / move_list.directory(move))
        for ability in ability_list.added_abilities():
            (cls.pristine / "abilities" / ability_list.file_name(ability)).unlink()

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def setUp(self):
        self.work = Path(tempfile.mkdtemp(dir=self.temp.name))
        self.moves = self.work / "moves"
        self.abilities = self.work / "abilities"
        shutil.copytree(self.pristine / "moves", self.moves, symlinks=True)
        shutil.copytree(self.pristine / "abilities", self.abilities)
        self.move_list_file = self.work / "moves.txt"
        self.ability_list_file = self.work / "abilities.txt"
        self.move_list_file.write_text(original_lines(ROOT / "generated" / "moves.txt", move_list.LAST_ORIGINAL))
        self.ability_list_file.write_text(original_lines(ROOT / "generated" / "abilities.txt",
                                                         ability_list.LAST_ORIGINAL))
        patches = [mock.patch.object(move_list, "MOVE_LIST", self.move_list_file),
                   mock.patch.object(move_list, "MOVES", self.moves),
                   mock.patch.object(ability_list, "ABILITY_LIST", self.ability_list_file),
                   mock.patch.object(ability_list, "ABILITIES", self.abilities)]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)
        # The functions' defaults were bound at import
        for function in (move_list.added_table, move_list.move_data):
            patch = mock.patch.object(function, "__defaults__", (self.moves,))
            patch.start()
            self.addCleanup(patch.stop)
        for function in (ability_list.added_table, ability_list.ability_data):
            patch = mock.patch.object(function, "__defaults__", (self.abilities,))
            patch.start()
            self.addCleanup(patch.stop)
        move_list.constants.cache_clear()
        ability_list.constants.cache_clear()
        self.addCleanup(move_list.constants.cache_clear)
        self.addCleanup(ability_list.constants.cache_clear)

    def add_move(self, constant: str, data: dict):
        with self.move_list_file.open("a") as file:
            file.write(constant + "\n")
        directory = self.moves / move_list.directory(constant)
        directory.mkdir()
        template = json.loads((self.moves / "pound" / "data.json").read_text())
        (directory / "data.json").write_text(json.dumps({**template, **data}))
        move_list.constants.cache_clear()

    def add_ability(self, constant: str, data: dict):
        with self.ability_list_file.open("a") as file:
            file.write(constant + "\n")
        (self.abilities / ability_list.file_name(constant)).write_text(
            json.dumps({"name": "Test", "description": "A test.", **data}))
        ability_list.constants.cache_clear()


class MoveListTest(Lists):
    def test_original(self):
        self.assertEqual(move_list.count(), 560)
        self.assertEqual(move_list.constants()[559], "MOVE_FUSION_BOLT")
        self.assertEqual(move_list.added_moves(), [])
        self.assertEqual(move_list.added_table(), [])

    def test_header_without_added_moves(self):
        text = moves.header()
        self.assertIn("#define PAPERWHITE2_MOVE_FIRST_ADDED 560\n", text)
        self.assertIn("#define PAPERWHITE2_MOVE_ADDED_COUNT 0\n", text)
        self.assertIn("#define PAPERWHITE2_MOVE_COUNT 560\n", text)
        self.assertNotIn("PAPERWHITE2_MOVE_ANIMATIONS", text)

    def test_added_moves(self):
        self.add_move("MOVE_APPLE_ACID", {"name": "Apple Acid", "animation": "MOVE_ENERGY_BALL"})
        self.add_move("MOVE_TEST_COPY", {"name": "Test Copy", "animation": "MOVE_POUND",
                                         "handlers_like": "MOVE_FLAIL"})
        names = move_list.constants()
        self.assertEqual(move_list.added_table(), [("MOVE_APPLE_ACID", names.index("MOVE_ENERGY_BALL"), 0),
                                                   ("MOVE_TEST_COPY", 1, names.index("MOVE_FLAIL"))])
        self.assertTrue(move_list.is_added(561))
        text = moves.header()
        self.assertIn("#define PAPERWHITE2_MOVE_ADDED_COUNT 2\n", text)
        self.assertIn("#define PAPERWHITE2_MOVE_COUNT 562\n", text)
        self.assertIn("#define PAPERWHITE2_MOVE_ANIMATIONS MOVE_ENERGY_BALL, MOVE_POUND\n", text)
        # Without "handlers_like", the move itself, so a row of the hack's own handlers can match it
        self.assertIn("#define PAPERWHITE2_MOVE_HANDLERS_LIKE MOVE_APPLE_ACID, MOVE_FLAIL\n", text)

    def test_refused(self):
        cases = [
            ({"name": "No Animation"}, "needs an \"animation\""),
            ({"name": "Bad", "animation": "MOVE_NONE"}, "original move"),
            ({"name": "Bad", "animation": "TYPE_GRASS"}, "original move"),
            ({"name": "Thirteen Char", "animation": "MOVE_POUND"}, "longer than 12"),
        ]
        for data, message in cases:
            with self.subTest(data=data):
                self.setUp()
                self.add_move("MOVE_TEST", data)
                with self.assertRaisesRegex(move_list.MoveListError, message):
                    move_list.added_table()

    def test_added_animation_refused(self):
        self.add_move("MOVE_FIRST", {"name": "First", "animation": "MOVE_POUND"})
        self.add_move("MOVE_SECOND", {"name": "Second", "animation": "MOVE_FIRST"})
        with self.assertRaisesRegex(move_list.MoveListError, "original move"):
            move_list.added_table()

    def test_original_with_hack_field(self):
        path = self.moves / "pound" / "data.json"
        path.unlink()
        path.write_text(json.dumps({"name": "Pound", "animation": "MOVE_TACKLE"}))
        with self.assertRaisesRegex(move_list.MoveListError, "only for added moves"):
            move_list.added_table()

    def test_list_checks(self):
        text = original_lines(ROOT / "generated" / "moves.txt", move_list.LAST_ORIGINAL)
        with self.assertRaisesRegex(move_list.MoveListError, "must be move 559"):
            move_list.parse(text.replace("MOVE_FUSION_BOLT\n", ""))
        with self.assertRaisesRegex(move_list.MoveListError, "numbered in order"):
            move_list.parse(text + "MOVE_GAP = 600\n")
        with self.assertRaisesRegex(move_list.MoveListError, "past the last move ID"):
            move_list.parse(text + "".join(f"MOVE_TEST_{i}\n" for i in range(move_list.MOVE_MAX)))


class AbilityListTest(Lists):
    def test_original(self):
        self.assertEqual(ability_list.count(), 165)
        self.assertEqual(ability_list.added_table(), [])
        text = abilities.header()
        self.assertIn("#define PAPERWHITE2_ABILITY_FIRST_ADDED 165\n", text)
        self.assertIn("#define PAPERWHITE2_ABILITY_ADDED_COUNT 0\n", text)
        self.assertNotIn("HANDLERS_LIKE", text)

    def test_added_abilities(self):
        self.add_ability("ABILITY_BULLETPROOF", {"name": "Bulletproof"})
        self.add_ability("ABILITY_SWEET_SYRUP", {"name": "Sweet Syrup", "handlers_like": "ABILITY_INTIMIDATE"})
        self.assertEqual(ability_list.added_table(), [("ABILITY_BULLETPROOF", 0), ("ABILITY_SWEET_SYRUP", 22)])
        text = abilities.header()
        self.assertIn("#define PAPERWHITE2_ABILITY_ADDED_COUNT 2\n", text)
        self.assertIn("#define PAPERWHITE2_ABILITY_HANDLERS_LIKE ABILITY_BULLETPROOF, ABILITY_INTIMIDATE\n", text)

    def test_refused(self):
        self.add_ability("ABILITY_SUPERSWEET_SYRUP", {"name": "Supersweet Syrup"})
        with self.assertRaisesRegex(ability_list.AbilityListError, "longer than 12"):
            ability_list.added_table()
        text = original_lines(ROOT / "generated" / "abilities.txt", ability_list.LAST_ORIGINAL)
        with self.assertRaisesRegex(ability_list.AbilityListError, "in a byte"):
            ability_list.parse(text + "".join(f"ABILITY_TEST_{i}\n" for i in range(92)))
        self.assertEqual(len(ability_list.parse(text + "".join(f"ABILITY_TEST_{i}\n" for i in range(91)))), 256)


class RepositoryTest(unittest.TestCase):
    """The repository's own added moves and abilities (docs/paperwhite2/design/moves-and-abilities.md, section 13)."""

    def test_added(self):
        names = move_list.constants()
        self.assertEqual(move_list.added_table(), [("MOVE_APPLE_ACID", names.index("MOVE_ENERGY_BALL"), 0),
                                                   ("MOVE_GRAV_APPLE", names.index("MOVE_SEED_BOMB"), 0)])
        self.assertEqual(ability_list.added_table(), [("ABILITY_BULLETPROOF", 0)])
        # Their own handlers in the hack's battle code: Grav Apple's and Bulletproof's, not Apple Acid (data only)
        self.assertTrue(move_list.has_own_handlers("MOVE_GRAV_APPLE"))
        self.assertFalse(move_list.has_own_handlers("MOVE_APPLE_ACID"))
        self.assertTrue(ability_list.has_own_handlers("ABILITY_BULLETPROOF"))

    def test_ballistic_flag(self):
        """MOVE_FLAG_BALLISTIC packs as bit 14, on the ball and bomb moves only."""
        self.assertEqual(constants()["MOVE_FLAG_BALLISTIC"], 1 << 14)
        flagged = sorted(move for move in move_list.constants()[1:]
                         if "MOVE_FLAG_BALLISTIC" in move_list.move_data(move)["flags"])
        self.assertEqual(len(flagged), 22)
        self.assertIn("MOVE_SHADOW_BALL", flagged)
        self.assertNotIn("MOVE_GRAV_APPLE", flagged)
        for move, ballistic in (("MOVE_SEED_BOMB", True), ("MOVE_TACKLE", False)):
            data = move_list.move_data(move)
            flags = move_data.move_bytes(data, move)[-4:]
            self.assertEqual(bool(int.from_bytes(flags, "little") & 1 << 14), ballistic)

    def test_used_messages(self):
        """Bank 16's "used" messages of the added moves, three each, after the originals'."""
        self.assertEqual(text_sources.expand("added_moves.used")[:3],
                         ["{0102:0} used\\nApple Acid!", "The wild {0102:0} used\\nApple Acid!",
                          "The foe's {0102:0} used\\nApple Acid!"])
        self.assertEqual(len(text_sources.expand("added_moves.used")), 3 * len(move_list.added_moves()))


class EasyChatTest(unittest.TestCase):
    def test_counts(self):
        text = pms_words.header()
        self.assertIn("#define PMS_WORD_COUNT_MOVES 560\n", text)
        self.assertIn("#define PMS_WORD_COUNT_ABILITIES 165\n", text)

    def test_added_names_are_no_words(self):
        """With names past the original ones in the moves' and abilities' files, every word keeps its number."""
        before = pms_words.header()
        count = pms_words.message_count

        def longer(path):
            return count(path) + (3 if path.stem in ("move_names_upper", "ability_names_upper") else 0)

        with mock.patch.object(pms_words, "message_count", longer):
            self.assertEqual(pms_words.header(), before)


if __name__ == "__main__":
    unittest.main()
