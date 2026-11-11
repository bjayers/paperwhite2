# Counts each encounter area's encounter tiles from its maps' terrain, in each season and version (regions.md, Tiles).
# Run from the repository:
#   python3 docs/paperwhite2/ecological-encounters/tools/tiles.py docs/paperwhite2/ecological-encounters/tiles.json
#
# An area's maps are the zone's chunks of its matrix (the overworld's cells that name the zone; any other matrix's
# cells), with the season's and the version's map replacements applied (res/field/map_replacements/replacements.json:
# a chunk or a whole matrix swapped; a version's first value is Black 2's, the second White 2's). White 2's Route 4 is
# the zone route_4_16 on Route 4's cells (src/system/zonedata.c's VERSION_SPECIFIC_ZONES). Events' replacements are left
# as before the event. A tile counts when its flags have the encounter bit: water is surf, the step code's double-battle
# grass classes are dark grass, the grass classes grass, and other ground is named by its class.
import collections
import csv
import json
import os
import sys
from functools import cache
from glob import glob

R = "res/field"
SEASONS = ["spring", "summer", "autumn", "winter"]
VERSIONS = ["black2", "white2"]
WATER, ENC = 0x2, 0x4
# The classes the step code counts as double-battle grass (MapTile_IsTallGrassDoubleBtl, map_attr.c) are dark grass;
# every other encounter tile on land is the grass method, named here by its class when it isn't grass
GRASS = {0x04, 0x05, 0x08, 0x21}
DGRASS = {0x06, 0x07, 0x09, 0x22}
BRIDGE = 0x20
CLASS_NAMES = {0x0a: "cave_floor", 0x0b: "sand", 0x0c: "deep_sand", 0x0e: "snow", 0x0f: "snow", 0x10: "ice",
               0x16: "indoor_floor", 0x18: "ice", 0x1c: "swamp_puddle", 0x23: "sand_floor", 0x30: "electric_field"}
# White 2's zones that stand on Black 2's cells
WHITE_ZONES = {"route_4": "route_4_16"}

zones = {os.path.basename(f)[:-5]: json.load(open(f)) for f in glob(R + "/zones/*.json") if "schema" not in f}
replacements = json.load(open(R + "/map_replacements/replacements.json"))["replacements"]


def pick(rep, season, version):
    values = rep["values"]
    if rep["condition"] == "season":
        return values[SEASONS.index(season)]
    if rep["condition"] == "version":
        return values[VERSIONS.index(version)]
    return values[0]  # an event's, before it; version_season only the Driftveil market (no encounters)


@cache
def terrain(model):
    d = f"{R}/maps/models/{model.removeprefix('MAP_MODEL_').lower()}"
    c = collections.Counter()
    for f in glob(d + "/terrain_*.csv"):
        if "splits" in f:
            continue
        for row in csv.DictReader(open(f)):
            t = int(row["tile_type"])
            if t == 0xFFFFFFFF:
                continue
            cls, fl = t & 0xFFFF, t >> 16
            if fl & ENC:
                if fl & WATER:
                    c["surf"] += 1
                elif cls in DGRASS:
                    c["dark_grass"] += 1
                elif cls in GRASS:
                    c["grass"] += 1
                else:
                    c[CLASS_NAMES.get(cls, f"class_{cls:#x}")] += 1
            elif fl & WATER:
                c["water_no_encounters"] += 1
            if cls == BRIDGE:
                c["bridge"] += 1
    return c


def load_matrix(name):
    path = f"{R}/matrices/{name.removeprefix('MAP_MATRIX_').lower()}.json"
    if not os.path.exists(path):
        return None
    m = json.load(open(path))
    maps = m.get("maps")
    if isinstance(maps, str):
        maps = eval(maps)
    return maps, m.get("zones")


def zone_tiles(zone, season, version):
    header = zones[zone]
    matrix = header["matrix"]
    for rep in replacements:
        if rep["kind"] == "matrix" and rep["matrix"] == matrix and rep["condition"] in ("season", "version"):
            matrix = pick(rep, season, version)
    loaded = load_matrix(matrix)
    if loaded is None:
        return collections.Counter()
    maps, cell_zones = loaded
    chunks = {rep["values"][0]: pick(rep, season, version) for rep in replacements
              if rep["kind"] == "chunk" and rep["matrix"] == header["matrix"]}
    c = collections.Counter()
    for r, row in enumerate(maps or []):
        for x, model in enumerate(row):
            if not model:
                continue
            if cell_zones:
                cell = cell_zones[r][x]
                if not cell:
                    continue
                cell = cell.removeprefix("ZONE_").lower()
                if version == "white2":
                    cell = WHITE_ZONES.get(cell, cell)
                if cell != zone:
                    continue
            c += terrain(chunks.get(model, model))
    return c


out = {}
for z, d in sorted(zones.items()):
    e = d.get("encounters")
    if not isinstance(e, str) or not e.startswith("ENCOUNTERS_"):
        continue
    area = e.removeprefix("ENCOUNTERS_").lower()
    black_only = z in WHITE_ZONES
    white_only = z in WHITE_ZONES.values()
    versions = ["black2"] if black_only else ["white2"] if white_only else VERSIONS
    variants = {(s, v): dict(zone_tiles(z, s, v)) for s in SEASONS for v in versions}
    entry = {"zone": z}
    if black_only:
        entry["version"] = "black2"
    if white_only:
        entry["version"] = "white2"
    first = variants[(SEASONS[0], versions[0])]
    if all(t == first for t in variants.values()):
        entry["tiles"] = first
    else:
        same_versions = all(variants[(s, versions[0])] == variants[(s, versions[-1])] for s in SEASONS)
        if same_versions:
            entry["by_season"] = {s: variants[(s, versions[0])] for s in SEASONS}
        else:
            entry["by_version_season"] = {f"{v} {s}": variants[(s, v)] for v in versions for s in SEASONS}
    out[area] = entry

json.dump(out, open(sys.argv[1], "w"), indent=1)
for a, v in out.items():
    print(a, {k: v[k] for k in v if k != "zone"})
