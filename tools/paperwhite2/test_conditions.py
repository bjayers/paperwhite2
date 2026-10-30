#!/usr/bin/env python3
"""Host tests of Paper White 2's conditions: the compiler (tools/paperwhite2/conditions.py) and the matcher, the
selection, the median and the level scaling (src/paperwhite2/main/paperwhite2_conditions.c), which is compiled
unchanged with the host's C compiler against stubs of the game's headers and driven through ctypes.

    python3 -m unittest tools.paperwhite2.test_conditions

Needs clang or gcc. The stubs make u32 32 bits wide (the game's types.h has it unsigned long), give EventWork's flags
and variables a table the tests set, and GFL_RandomLC a fixed sequence.
"""
import ctypes
import json
import math
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.datajson import DataError, constants  # noqa: E402
from tools.paperwhite2 import conditions  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "src" / "paperwhite2" / "main" / "paperwhite2_conditions.c"

STUBS = {
    "types.h": """
#ifndef POKEBW2_TYPES_H
#define POKEBW2_TYPES_H
typedef unsigned char u8;
typedef unsigned short u16;
typedef unsigned int u32;
typedef unsigned long long u64;
typedef signed char s8;
typedef signed short s16;
typedef signed int s32;
typedef int BOOL;
#define TRUE 1
#define FALSE 0
#define NULL ((void *)0)
#define NELEMS(array) (sizeof(array) / sizeof((array)[0]))
#endif
""",
    "struct_decls.h": """
#ifndef POKEBW2_STRUCT_DECLS_H
#define POKEBW2_STRUCT_DECLS_H
typedef struct EventWork EventWork;
typedef struct GameData GameData;
typedef struct PartyPkm PartyPkm;
typedef struct PokeParty PokeParty;
typedef struct Field Field;
#endif
""",
    "gfl/heap.h": "typedef unsigned short HeapID;\n",
    "gfl/random.h": "u32 GFL_RandomLC(u32 max);\n",
    "save/event_work.h": "BOOL EventWork_FlagGet(EventWork *ew, u16 flag);\nu16 *EventWork_GetWkPtr(EventWork *ew, u16 work);\n",
}

# The test's side: the flags and variables, GFL_RandomLC, and flat entry points that build a context from an array,
# so Python needn't lay out ConditionContext
HARNESS = """
#include "types.h"
#include "paperwhite2/conditions.h"

static u8 sFlags[0x4000];
static u16 sVars[0x200];
static u32 sRandom = 1;

BOOL EventWork_FlagGet(EventWork *ew, u16 flag) { return sFlags[flag]; }
u16 *EventWork_GetWkPtr(EventWork *ew, u16 work) { return &sVars[work - 0x4000]; }
u32 GFL_RandomLC(u32 max) { sRandom = sRandom * 69069 + 1; return max ? sRandom % max : sRandom; }

void Test_SetFlag(u32 flag, u32 on) { sFlags[flag] = on; }
void Test_SetVar(u32 var, u32 value) { sVars[var - 0x4000] = value; }

enum { F_FILLED, F_SEASON, F_PERIOD, F_WEATHER, F_ZONE, F_EXTERIOR, F_TERRAIN, F_FOLLOWER, F_SPECIES, F_FORM,
       F_LEVEL, F_TYPE1, F_TYPE2, F_NATURE, F_FRIENDSHIP, F_HP, F_STATUS, F_STEPS, F_MEDIAN, F_SCALED, F_LOAD_SEED,
       F_DAY_SEED, F_TOTAL_STEPS, F_ITEM_WAITING, F_FACING, F_TILE_X, F_TILE_Y, F_COUNT };

static void Fill(ConditionContext *ctx, const u32 *v) {
    u32 i;
    for (i = 0; i < sizeof(*ctx); i++) ((u8 *)ctx)[i] = 0;
    ctx->filled = v[F_FILLED]; ctx->season = v[F_SEASON]; ctx->period = v[F_PERIOD]; ctx->weather = v[F_WEATHER];
    ctx->zone = v[F_ZONE]; ctx->exterior = v[F_EXTERIOR]; ctx->terrain = v[F_TERRAIN];
    ctx->followerSpecies = v[F_FOLLOWER]; ctx->species = v[F_SPECIES]; ctx->form = v[F_FORM]; ctx->level = v[F_LEVEL];
    ctx->type1 = v[F_TYPE1]; ctx->type2 = v[F_TYPE2]; ctx->nature = v[F_NATURE]; ctx->friendship = v[F_FRIENDSHIP];
    ctx->hpPercent = v[F_HP]; ctx->status = v[F_STATUS]; ctx->steps = v[F_STEPS]; ctx->medianLevel = v[F_MEDIAN];
    ctx->scaledLevel = v[F_SCALED]; ctx->loadSeed = v[F_LOAD_SEED]; ctx->daySeed = v[F_DAY_SEED];
    ctx->totalSteps = v[F_TOTAL_STEPS]; ctx->itemWaiting = v[F_ITEM_WAITING]; ctx->facing = v[F_FACING];
    ctx->tileX = v[F_TILE_X]; ctx->tileY = v[F_TILE_Y];
}

u32 Test_ContextFields(void) { return F_COUNT; }
BOOL Test_Valid(const ConditionTable *table, u32 size) { return Conditions_IsTableValid(table, size); }
BOOL Test_Match(const ConditionTable *table, u32 rule, const u32 *v, u32 *rng) {
    ConditionContext ctx;
    Fill(&ctx, v);
    return Conditions_MatchRule(table, rule, &ctx, rng);
}
s32 Test_Select(const ConditionTable *table, const u32 *v, u32 share, u32 *rng, u32 *matched) {
    ConditionContext ctx;
    Fill(&ctx, v);
    return Conditions_Select(table, &ctx, share, rng, matched);
}
u32 Test_Seed(const u32 *v, u32 seed, u32 key) {
    ConditionContext ctx;
    Fill(&ctx, v);
    return Conditions_Seed(&ctx, seed, key);
}
u32 Test_Payload(const ConditionTable *table, u32 rule, const char **payload) {
    u32 size;
    *payload = Conditions_GetPayload(table, rule, &size);
    return size;
}
"""

FIELDS = ["filled", "season", "period", "weather", "zone", "exterior", "terrain", "follower", "species", "form",
          "level", "type1", "type2", "nature", "friendship", "hp", "status", "steps", "median", "scaled", "load_seed",
          "day_seed", "total_steps", "item_waiting", "facing", "tile_x", "tile_y"]
ALL = 0x3F
U32 = ctypes.c_uint32


def compiler() -> str | None:
    return shutil.which("clang") or shutil.which("gcc") or shutil.which("cc")


class Library:
    """The matcher, built for the host with the default level scaling."""

    def __init__(self, directory: Path):
        stubs = directory / "stubs"
        for name, text in STUBS.items():
            (stubs / name).parent.mkdir(parents=True, exist_ok=True)
            (stubs / name).write_text(text)
        (stubs / "paperwhite2").mkdir(exist_ok=True)
        (stubs / "paperwhite2" / "level_scaling_config.h").write_text(conditions.level_scaling_header())
        shutil.copy(ROOT / "include" / "paperwhite2" / "conditions.h", stubs / "paperwhite2" / "conditions.h")
        harness = directory / "harness.c"
        harness.write_text(HARNESS)
        output = directory / "libconditions.so"
        subprocess.run([compiler(), "-std=c99", "-shared", "-fPIC", "-O1", "-Wall", "-Werror", "-Wno-unused-parameter",
                        "-I", str(stubs), str(SOURCE), str(harness), "-o", str(output)], check=True)
        self.lib = ctypes.CDLL(str(output))
        for name, result in (("Test_Match", ctypes.c_int), ("Test_Select", ctypes.c_int32), ("Test_Valid", ctypes.c_int),
                             ("Test_Seed", U32), ("Conditions_Hash", U32), ("Conditions_MedianLevel", U32),
                             ("Conditions_ScaledLevel", U32), ("Conditions_ScaledLevelMin", U32),
                             ("Conditions_ScaledLevelMax", U32), ("Test_Payload", U32)):
            getattr(self.lib, name).restype = result
        self.lib.Conditions_Hash.argtypes = [U32, U32]
        if self.lib.Test_ContextFields() != len(FIELDS):
            raise AssertionError("the harness's fields and the test's differ")

    @staticmethod
    def context(**values) -> ctypes.Array:
        values.setdefault("filled", ALL)
        return (U32 * len(FIELDS))(*[values.get(name, 0) for name in FIELDS])

    def match(self, table: bytes, rule: int, rng: int = 1, **values) -> bool:
        state = U32(rng)
        return bool(self.lib.Test_Match(table, rule, self.context(**values), ctypes.byref(state)))

    def select(self, table: bytes, share: int, rng: int, **values) -> int:
        state = U32(rng)
        return self.lib.Test_Select(table, self.context(**values), share, ctypes.byref(state), None)


def table_of(*whens, share: int = 100, priorities=None, weights=None) -> bytes:
    """A table of rules made from conditions, through the compiler."""
    compiler_ = conditions.Compiler()
    rules = []
    for index, when in enumerate(whens):
        rules.append((compiler_.compile(when, f"rule {index}"), (priorities or [0] * len(whens))[index],
                      (weights or [1] * len(whens))[index], f"rule{index}".encode() + b"\0"))
    return conditions.pack_table(rules, compiler_.lists, share)


def chi_squared(observed: list[int], expected: list[float]) -> float:
    return sum((o - e) ** 2 / e for o, e in zip(observed, expected))


# The chi-squared distribution's value that a fair draw exceeds 0.1% of the time, by degrees of freedom
CHI_SQUARED_999 = {1: 10.83, 2: 13.82, 3: 16.27, 4: 18.47}


@unittest.skipIf(compiler() is None, "no host C compiler")
class MatcherTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.c = Library(Path(cls.directory.name))

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    def check(self, when: dict, cases: list[tuple[dict, bool]]):
        table = table_of(when)
        self.assertTrue(self.c.lib.Test_Valid(table, len(table)))
        for values, expected in cases:
            with self.subTest(when=when, values=values):
                self.assertEqual(self.c.match(table, 0, **values), expected)

    def test_masks(self):
        for season, name in enumerate(conditions.SEASONS):
            self.check({"season": [name]}, [({"season": s}, s == season) for s in range(4)])
        self.check({"time": ["night", "late_night"]}, [({"period": p}, p >= 3) for p in range(5)])
        rain = conditions.weathers()["WEATHER_RAIN"]
        self.check({"weather": ["WEATHER_RAIN"]}, [({"weather": w}, w == rain) for w in range(15)] +
                   [({"weather": 0xFFFF}, False)])
        self.check({"nature": ["NATURE_BOLD"]}, [({"nature": n}, n == constants()["NATURE_BOLD"]) for n in range(25)])
        self.check({"status": ["any"]}, [({"status": s}, s != 0) for s in range(6)])
        self.check({"status": ["none", "burn"]}, [({"status": s}, s in (0, 3)) for s in range(6)])

    def test_types_either_slot(self):
        grass, water, fire = (constants()[f"TYPE_{t}"] for t in ("GRASS", "WATER", "FIRE"))
        self.check({"type": ["TYPE_GRASS"]}, [({"type1": grass, "type2": grass}, True),
                                              ({"type1": water, "type2": grass}, True),
                                              ({"type1": water, "type2": fire}, False)])

    def test_flags_and_vars(self):
        self.c.lib.Test_SetFlag(0x1F4, 1)
        self.c.lib.Test_SetFlag(0x1F5, 0)
        self.check({"flags": {"set": ["0x01f4"]}}, [({}, True)])
        self.check({"flags": {"unset": ["0x01f4"]}}, [({}, False)])
        self.check({"flags": {"set": ["0x01f4"], "unset": ["0x01f5"]}}, [({}, True)])
        for op, results in (("=", (False, True, False)), ("!=", (True, False, True)), (">=", (False, True, True)),
                            ("<=", (True, True, False)), (">", (False, False, True)), ("<", (True, False, False))):
            when = {"vars": [{"var": "EVENT_WORK_ZONE_LOAD_COUNTER", "op": op, "value": 10}]}
            table = table_of(when)
            for value, expected in zip((9, 10, 11), results):
                self.c.lib.Test_SetVar(constants()["EVENT_WORK_ZONE_LOAD_COUNTER"], value)
                with self.subTest(op=op, value=value):
                    self.assertEqual(self.c.match(table, 0), expected)

    def test_zones(self):
        castelia = conditions.zone_groups()["castelia"]
        self.assertEqual(len(castelia), 37)
        route = constants()["ZONE_ROUTE_20"]
        self.check({"zone_group": ["castelia"]}, [({"zone": z}, True) for z in castelia] +
                   [({"zone": route}, False), ({"zone": 0}, False), ({"zone": 614}, False)])
        self.check({"zone": ["ZONE_ROUTE_20"]}, [({"zone": route}, True), ({"zone": route + 1}, False)])
        self.check({"zone": ["ZONE_ROUTE_20", "ZONE_ROUTE_19"]},
                   [({"zone": route}, True), ({"zone": constants()["ZONE_ROUTE_19"]}, True), ({"zone": 5}, False)])

    def test_field(self):
        names = [group["name"] for group in conditions.terrain_groups()]
        grass = 1 << names.index("grass")
        self.check({"exterior": True}, [({"exterior": 1}, True), ({"exterior": 0}, False)])
        self.check({"exterior": False}, [({"exterior": 0}, True), ({"exterior": 1}, False)])
        self.check({"terrain": ["grass", "dark_grass"]},
                   [({"terrain": grass}, True), ({"terrain": 1 << names.index("dark_grass")}, True),
                    ({"terrain": 1 << names.index("sand")}, False), ({"terrain": 0}, False)])
        pikachu = constants()["SPECIES_PIKACHU"]
        self.check({"follower": True}, [({"follower": pikachu}, True), ({"follower": 0}, False)])
        self.check({"follower": False}, [({"follower": 0}, True), ({"follower": pikachu}, False)])
        self.check({"follower": ["SPECIES_PIKACHU"]}, [({"follower": pikachu}, True), ({"follower": 1}, False)])

    def test_ranges(self):
        for field, context in (("level", "level"), ("party_level", "median"), ("scaled_level", "scaled"),
                               ("hp", "hp"), ("friendship", "friendship"), ("steps", "steps"),
                               ("total_steps", "total_steps"), ("tile_x", "tile_x"), ("tile_y", "tile_y")):
            self.check({field: {"min": 20, "max": 40}}, [({context: v}, 20 <= v <= 40) for v in (0, 19, 20, 40, 41)])
            self.check({field: {"min": 20}}, [({context: v}, v >= 20) for v in (19, 20, 255)])
            self.check({field: {"max": 5}}, [({context: v}, v <= 5) for v in (0, 5, 6)])
        with self.assertRaises(DataError):
            table_of({"level": {"min": 5, "max": 4}})

    def test_follower_position_and_item(self):
        self.check({"facing": ["left", "right"]}, [({"facing": f}, f in (2, 3)) for f in range(4)] +
                   [({"facing": 9}, False)])
        self.check({"item_waiting": True}, [({"item_waiting": 155}, True), ({"item_waiting": 0}, False)])
        self.check({"item_waiting": False}, [({"item_waiting": 0}, True), ({"item_waiting": 155}, False)])
        self.check({"total_steps": {"min": 100000 & 0xFFFF}}, [({"total_steps": 1 << 20}, True)])
        # The position is its own part: a rule on it fails when the consumer gives none
        self.check({"facing": ["up"]}, [({"filled": ALL & ~0x20, "facing": 0}, False)])
        self.check({"tile_x": {"min": 3}}, [({"filled": ALL & ~0x20, "tile_x": 5}, False)])

    def test_species(self):
        deerling = constants()["SPECIES_DEERLING"]
        self.check({"species": ["SPECIES_DEERLING"]},
                   [({"species": deerling, "form": f}, True) for f in range(4)] + [({"species": 1}, False)])
        self.check({"species": [{"species": "SPECIES_DEERLING", "form": 2}]},
                   [({"species": deerling, "form": f}, f == 2) for f in range(4)])
        self.check({"species": [{"species": "SPECIES_DEERLING", "form": 2}, "SPECIES_PIKACHU"]},
                   [({"species": deerling, "form": 2}, True), ({"species": deerling, "form": 1}, False),
                    ({"species": constants()["SPECIES_PIKACHU"], "form": 3}, True)])

    def test_unfilled_parts_fail(self):
        self.check({"level": {"min": 1}}, [({"filled": ALL & ~0x4, "level": 50}, False), ({"level": 50}, True)])
        self.check({"terrain": ["grass"]}, [({"filled": 0x1, "terrain": 1}, False)])
        self.check({"season": ["spring"]}, [({"filled": 0, "season": 0}, False)])
        self.check({}, [({"filled": 0}, True)])

    def test_chance(self):
        table = table_of({"chance": 25})
        hits = sum(self.c.match(table, 0, rng=seed) for seed in range(4000))
        self.assertLess(chi_squared([hits, 4000 - hits], [1000, 3000]), CHI_SQUARED_999[1])

    def test_selection_by_priority(self):
        # A night rule at priority 1 over a default at 0: always the night rule at night with a share of 100
        table = table_of({"time": ["night"]}, {}, priorities=[1, 0])
        for seed in range(50):
            self.assertEqual(self.c.select(table, 100, seed, period=3), 0)
            self.assertEqual(self.c.select(table, 100, seed, period=1), 1)
        self.assertEqual(self.c.select(table_of({"time": ["night"]}), 100, 1, period=1), -1)

    def test_selection_by_weight(self):
        table = table_of({}, {}, {}, weights=[1, 2, 5])
        counts = [0, 0, 0]
        for seed in range(8000):
            counts[self.c.select(table, 100, seed)] += 1
        self.assertLess(chi_squared(counts, [1000, 2000, 5000]), CHI_SQUARED_999[2])

    def test_selection_by_share(self):
        # With a share of 40%, the priority-1 rule is picked in about 40% of the checks, the default otherwise; the
        # lowest priority that matches is always picked from, even at a share below 100
        table = table_of({"weather": ["WEATHER_RAIN"]}, {}, priorities=[1, 0])
        rain = conditions.weathers()["WEATHER_RAIN"]
        picks = [self.c.select(table, 40, seed, weather=rain) for seed in range(5000)]
        high = picks.count(0)
        self.assertEqual(picks.count(-1), 0)
        self.assertLess(chi_squared([high, 5000 - high], [2000, 3000]), CHI_SQUARED_999[1])
        self.assertTrue(all(self.c.select(table_of({}), 10, seed) == 0 for seed in range(100)))

    def test_selection_is_stable_for_a_seed(self):
        table = table_of({}, {}, {}, {})
        for seed in (0, 1, 0xDEADBEEF):
            self.assertEqual(len({self.c.select(table, 100, seed) for _ in range(5)}), 1)

    def test_seeds(self):
        context = self.c.context(load_seed=1234, day_seed=99)
        self.assertEqual(self.c.lib.Test_Seed(context, 0, 7), self.c.lib.Conditions_Hash(1234, 7))
        self.assertEqual(self.c.lib.Test_Seed(context, 1, 7), self.c.lib.Conditions_Hash(99, 7))
        self.assertNotEqual(self.c.lib.Test_Seed(context, 0, 7), self.c.lib.Test_Seed(context, 0, 8))

    def test_hash_is_the_weather_dates(self):
        # The weather's date used the same finalizer of day * 0x9e3779b1 + season before it was shared
        def old(day, season):
            h = (day * 0x9E3779B1 + season) & 0xFFFFFFFF
            h ^= h >> 16
            h = (h * 0x85EBCA6B) & 0xFFFFFFFF
            h ^= h >> 13
            h = (h * 0xC2B2AE35) & 0xFFFFFFFF
            return h ^ (h >> 16)

        for day in (0, 1, 9800, 36524):
            for season in range(4):
                self.assertEqual(self.c.lib.Conditions_Hash(day, season), old(day, season))

    def test_median(self):
        for levels, expected in (([], 0), ([7], 7), ([5, 50], 5), ([50, 5, 30], 30), ([10, 40, 20, 30], 20),
                                 ([50, 52, 48, 51, 49, 47], 49)):
            array = (ctypes.c_uint8 * 6)(*levels)
            self.assertEqual(self.c.lib.Conditions_MedianLevel(array, len(levels)), expected, levels)

    def test_level_scaling_defaults(self):
        lib = self.c.lib
        self.assertEqual(lib.Conditions_ScaledLevel(50), 40)
        self.assertEqual((lib.Conditions_ScaledLevelMin(40), lib.Conditions_ScaledLevelMax(40)), (35, 45))
        self.assertEqual(lib.Conditions_ScaledLevel(1), 2)
        self.assertEqual(lib.Conditions_ScaledLevel(0), 2)
        self.assertEqual(lib.Conditions_ScaledLevel(100), 80)
        self.assertEqual(lib.Conditions_ScaledLevel(9), 7)
        self.assertEqual(lib.Conditions_ScaledLevelMin(2), 1)
        self.assertEqual(lib.Conditions_ScaledLevelMax(98), 100)

    def test_samples_compile_and_validate(self):
        for path in conditions.TABLES.values():
            table = conditions.compile_rule_set(path)
            self.assertTrue(self.c.lib.Test_Valid(table, len(table)))
            self.assertFalse(self.c.lib.Test_Valid(table[:-4], len(table) - 4))
            payload = ctypes.c_char_p()
            data = json.loads(path.read_text())
            for index, rule in enumerate(data["rules"]):
                size = self.c.lib.Test_Payload(table, index, ctypes.byref(payload))
                self.assertGreater(size, len(rule["name"]))
                self.assertEqual(payload.value.decode(), rule["name"])


class CompilerTest(unittest.TestCase):
    def test_round_trip(self):
        compiler_ = conditions.Compiler()
        whens = [{"season": ["spring"], "chance": 5, "zone": ["ZONE_ROUTE_20", "ZONE_ROUTE_19"]},
                 {"species": [{"species": "SPECIES_DEERLING", "form": 3}], "zone": ["ZONE_ROUTE_19", "ZONE_ROUTE_20"]},
                 {}]
        rules = [(compiler_.compile(when, "test"), i, i + 1, b"x" * i) for i, when in enumerate(whens)]
        data = conditions.pack_table(rules, compiler_.lists, 60)
        table = conditions.unpack_table(data)
        self.assertEqual(table["share"], 60)
        self.assertEqual(len(table["lists"]), 1, "identical zone lists are shared")
        for (clauses, priority, weight, payload), (got_clauses, got_priority, got_weight, got_payload) in zip(
                rules, table["rules"]):
            self.assertEqual([tuple(c) for c in got_clauses], clauses)
            self.assertEqual((got_priority, got_weight), (priority, weight))
            self.assertEqual(got_payload[:len(payload)], payload)
            self.assertEqual(len(got_payload) % 4, 0)
        self.assertEqual(rules[0][0][-1][0], conditions.kind("CHANCE"), "a chance is the last clause")

    def test_layout(self):
        data = conditions.pack_table([([(1, 9, 0, 0x18)], 2, 3, b"ab\0")], [], 100)
        self.assertEqual(struct.unpack_from("<IBBHHH", data), (conditions.MAGIC, 1, 100, 1, 0, len(data)))
        (offset,) = struct.unpack_from("<H", data, 12)
        self.assertEqual(offset, 16)
        self.assertEqual(data[16:20], bytes([1, 2, 3, 0]))
        self.assertEqual(struct.unpack_from("<BBHI", data, 20), (1, 9, 0, 0x18))
        self.assertEqual(data[28:32], b"ab\0\0")

    def test_bad_names(self):
        compiler_ = conditions.Compiler()
        for when in ({"terrain": ["lava"]}, {"zone_group": ["atlantis"]}, {"season": ["monsoon"]},
                     {"species": ["SPECIES_NOTHING"]}):
            with self.subTest(when=when), self.assertRaises(DataError):
                compiler_.compile(when, "test")

    def test_kinds_are_the_headers(self):
        self.assertEqual(conditions.kind("SEASON"), 0)
        self.assertEqual(conditions.kind("CHANCE"), 19)
        self.assertEqual(conditions.kind("ITEM_WAITING"), len(conditions.enum("CONDITION_KIND_")) - 1)
        self.assertEqual(conditions.op("UNSET"), 11)

    def test_headers(self):
        terrain = conditions.terrain_header()
        self.assertIn("#define TERRAIN_GROUP_COUNT 18", terrain)
        self.assertIn("#define LEVEL_SCALING_PERCENT 80", conditions.level_scaling_header())
        self.assertIn("#define SCRIPT_CONDITION_NIGHT 0", conditions.script_header())


if __name__ == "__main__":
    unittest.main()
