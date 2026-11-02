#!/usr/bin/env python3
"""Paper White 2's grass: the kinds the Map Editor's Decorations tab paints over a chunk's terrain
(res/paperwhite2/map_grass/grass.json), built as vanilla builds them.

    map_grass.py survey            # the atlas's grass tiles by texture set and tile class: what grass.json is learned from
    map_grass.py available SET     # the kinds a texture set has the textures of
    map_grass.py donors KIND SET...  # JSON: for each set lacking a kind's textures, the set to import them from

A painting's grass rows (map_project.schema.json) give each tile a kind's letter or none. The map maker
(map_maker.py) builds them over the generated ground:
- blades: flat sheets over each tile at their lifts over its ground, inset from a patch's north border as vanilla's
  are (the blades' tips would overhang the tile in front of them otherwise);
- a volume (very tall grass): a top over the ground, and along the patch's border a skirt from near the ground up to
  the top's edge, inset by side, and a fringe from there up to its tip; two sides meeting at an outer corner share
  their corner's edges, so the corner closes as vanilla's does.
Grass isn't built on water, on edges (a path's border, a bank, a cliff, stairs, a slope) or on sloped collision: the
editor marks those tiles red and the map maker skips them. A grass tile takes its kind's tile type at the terrain's
height, except where the tile's own collision is blocked or has a class of its own (a boardwalk's, a bridge's): there
the grass is drawn and the tile keeps its collision, as vanilla's grass under Route 7's boardwalks and its trees does
(the editor marks those orange).

A chunk's grass is read from its collision's class, and where that isn't grass's, from what's drawn: a tile with a
kind's look (its top blade's or its volume's top's texture over most of it) is the first kind of that look (tall,
dark or very tall grass; the B and C kinds look the same as those).
"""
import argparse
import collections
import functools
import json
import sqlite3
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.datajson import load, load_schema  # noqa: E402

GRASS = ROOT / "res/paperwhite2/map_grass"
TEXTURES = ROOT / "res/field/maps/textures"
TILE = 16
NONE = "."
FLAG_COLLISION, FLAG_WATER = 0x1, 0x2


@functools.cache
def kinds_file():
    return load(GRASS / "grass.json", load_schema(GRASS / "map_grass.schema.json"))


def kind_textures(kind):
    if "blades" in kind:
        return [b["texture"] for b in kind["blades"]]
    return [kind["volume"]["top"], kind["volume"]["side"]]


def all_textures(data=None):
    """Every texture any kind is drawn with: kept faces with them over grass tiles are the old grass."""
    data = data or kinds_file()
    return {t for k in data["kinds"] for t in kind_textures(k)}


def available(texture_set, data=None):
    """The kinds whose textures the texture set has."""
    data = data or kinds_file()
    folder = TEXTURES / texture_set.removeprefix("MAP_TEXTURE_SET_").lower()
    return [k for k in data["kinds"] if all((folder / f"{t}.png").exists() for t in kind_textures(k))]


def kind_of(tile_type, data=None):
    """The kind a vanilla tile's collision is (by its tile class), or None."""
    data = data or kinds_file()
    for k in data["kinds"]:
        if (k["tile_type"] & 0xFFFF) == (tile_type & 0xFFFF):
            return k["key"]
    return None


def can_hold(tile_type, slope=0):
    """Whether grass may be built on a tile of this collision: not water, not sloped."""
    return not (tile_type >> 16) & FLAG_WATER and not slope


def takes_type(tile_type):
    """Whether a grass tile of this collision takes the grass's tile type: not blocked, and its class a ground's (below
    0x40: grass, sand, snow, paths...), not one of its own (a boardwalk, a bridge), which it keeps."""
    return not (tile_type >> 16) & FLAG_COLLISION and ((tile_type & 0xFFFF) < 0x40 and (tile_type & 0xFFFF) != 0x20)


def look(kind):
    """What a kind looks like: the texture that tells it from the others drawn (its top blade's, or its volume's top)."""
    return kind["blades"][-1]["texture"] if "blades" in kind else kind["volume"]["top"]


def kind_drawn(textures, tile_type, data=None):
    """A tile's kind: the one its collision's class names, else the one its drawing shows (textures maps the textures
    drawn over it to how much of it they cover), the first of that look; None where no grass is."""
    data = data or kinds_file()
    named = kind_of(tile_type, data)
    if named:
        return named  # (a corner of very tall grass shows less than half its top)
    shown = [k for k in data["kinds"] if textures.get(look(k), 0) >= 0.5]
    return shown[0]["key"] if shown else None


def rows_of(chunk, data=None):
    """A chunk's grass rows (a map_reader Chunk read with its tiles): each tile's kind as drawn (kind_drawn)."""
    data = data or kinds_file()
    rows = [[NONE] * chunk.size for _ in range(chunk.size)]
    for (x, z), tile in chunk.tiles.items():
        first = next((c for c in tile.facts["collision"] if c["layer"] == 0), None)
        covers = {}
        for surface in tile.facts["surfaces"]:
            covers[surface["texture"]] = max(covers.get(surface["texture"], 0), surface["cover"])
        rows[z][x] = kind_drawn(covers, first["tile_type"] if first else 0, data) or NONE
    return ["".join(row) for row in rows]


def build(cells, materials, half, data=None):
    """The polygons of the grass: cells maps (x, z) to (kind key, the ground's height). Returns (material key,
    [vertex, ...]) polygons, as the map maker's are."""
    from glb_mesh import Vertex

    data = data or kinds_file()
    kinds = {k["key"]: k for k in data["kinds"]}
    up = (0.0, 1.0, 0.0)
    polygons = []

    def same(xz, key):
        return cells.get(xz, (None,))[0] == key

    def quad(mkey, points, uvs):
        # (every grass vertex's normal points up, as vanilla's do)
        polygons.append((mkey, [Vertex(p, uv, (1.0, 1.0, 1.0), up) for p, uv in zip(points, uvs)]))

    # Blades: over rectangles of tiles of one kind at one height, those on a patch's north border (inset) apart
    blades = {xz: (key, y, not same((xz[0], xz[1] - 1), key)) for xz, (key, y) in cells.items() if "blades" in kinds[key]}
    for (key, y, border), x, z, w, d in _rectangles(blades):
        north = data["blades_north_inset"] if border else 0
        x0, z0, x1, z1 = x * TILE - half, z * TILE - half + north, (x + w) * TILE - half, (z + d) * TILE - half
        for blade in kinds[key]["blades"]:
            mkey = materials.get(blade["texture"], alpha=blade.get("alpha", "MASK"))
            h = y + blade["lift"]
            points = [(x0, h, z0), (x0, h, z1), (x1, h, z1), (x1, h, z0)]
            quad(mkey, points, [((p[0] + half) / TILE, (p[2] + half) / TILE) for p in points])

    # Volumes: each tile's skirt and fringe on its open sides; the tops over rectangles of tiles alike (the same
    # kind, height and insets)
    tops = {}
    for (x, z), (key, y) in sorted(cells.items()):
        kind = kinds[key]
        x0, z0 = x * TILE - half, z * TILE - half
        if "blades" in kind:
            continue
        volume = data["volume"]
        top_key = materials.get(kind["volume"]["top"])
        side_key = materials.get(kind["volume"]["side"], alpha="MASK")
        # Which sides are the patch's border, and how far in the top's edge is on each
        open_ = {side: not same((x + dx, z + dz), key) for side, (dx, dz) in
                 {"north": (0, -1), "south": (0, 1), "west": (-1, 0), "east": (1, 0)}.items()}
        inset = {side: volume["top_inset"][side] if open_[side] else 0 for side in open_}
        fringe = {side: volume["fringe_inset"] if open_[side] else 0 for side in open_}
        top = y + volume["top_lift"]
        foot = y + volume["skirt_lift"]
        tip = y + volume["fringe_lift"]
        tx0, tx1, tz0, tz1 = x0 + inset["west"], x0 + TILE - inset["east"], z0 + inset["north"], z0 + TILE - inset["south"]
        tops[(x, z)] = (top_key, top, tuple(inset[side] for side in ("north", "south", "west", "east")))
        fx0, fx1, fz0, fz1 = x0 + fringe["west"], x0 + TILE - fringe["east"], z0 + fringe["north"], z0 + TILE - fringe["south"]
        # Each open side: (the border's ends, the top's edge's ends, the fringe tip's ends), west to east or north to
        # south, and which way it faces
        sides = {
            "north": (((x0, z0), (x0 + TILE, z0)), ((tx0, tz0), (tx1, tz0)), ((fx0, fz0), (fx1, fz0)), (0.0, 0.0, -1.0)),
            "south": (((x0, z0 + TILE), (x0 + TILE, z0 + TILE)), ((tx0, tz1), (tx1, tz1)), ((fx0, fz1), (fx1, fz1)), (0.0, 0.0, 1.0)),
            "west": (((x0, z0), (x0, z0 + TILE)), ((tx0, tz0), (tx0, tz1)), ((fx0, fz0), (fx0, fz1)), (-1.0, 0.0, 0.0)),
            "east": (((x0 + TILE, z0), (x0 + TILE, z0 + TILE)), ((tx1, tz0), (tx1, tz1)), ((fx1, fz0), (fx1, fz1)), (1.0, 0.0, 0.0)),
        }
        for side, ((b0, b1), (e0, e1), (f0, f1), normal) in sides.items():
            if not open_[side]:
                continue
            # u along the border, a tile a repeat; v from the foot (1) to the top's edge (0.5) to the tip (0)
            along = (lambda p: (p[0] + half) / TILE) if side in ("north", "south") else (lambda p: (p[1] + half) / TILE)
            skirt = [(b0[0], foot, b0[1]), (b1[0], foot, b1[1]), (e1[0], top, e1[1]), (e0[0], top, e0[1])]
            quad(side_key, *_facing(skirt, [(along(b0), 1.0), (along(b1), 1.0), (along(e1), 0.5), (along(e0), 0.5)], normal))
            tips = [(e0[0], top, e0[1]), (e1[0], top, e1[1]), (f1[0], tip, f1[1]), (f0[0], tip, f0[1])]
            quad(side_key, *_facing(tips, [(along(e0), 0.5), (along(e1), 0.5), (along(f1), 0.0), (along(f0), 0.0)], normal))
    for (top_key, top, (north, south, west, east)), x, z, w, d in _rectangles(tops):
        x0, z0 = x * TILE - half + west, z * TILE - half + north
        x1, z1 = (x + w) * TILE - half - east, (z + d) * TILE - half - south
        points = [(x0, top, z0), (x0, top, z1), (x1, top, z1), (x1, top, z0)]
        quad(top_key, points, [((p[0] + half) / TILE, (p[2] + half) / TILE) for p in points])
    return polygons


def _rectangles(cells):
    """Greedy rectangles of equal cells, rows first: ((value, x, z, width, depth), ...)."""
    done, out = set(), []
    for x, z in sorted(cells, key=lambda xz: (xz[1], xz[0])):
        if (x, z) in done:
            continue
        v = cells[(x, z)]
        w = 1
        while (x + w, z) in cells and (x + w, z) not in done and cells[(x + w, z)] == v:
            w += 1
        d = 1
        while all((x + i, z + d) in cells and (x + i, z + d) not in done and cells[(x + i, z + d)] == v for i in range(w)):
            d += 1
        for i in range(w):
            for j in range(d):
                done.add((x + i, z + j))
        out.append((v, x, z, w, d))
    return out


def _facing(points, uvs, normal):
    """The quad wound to face its normal's way (its front, for a renderer that culls backs)."""
    a, b, c = points[0], points[1], points[2]
    e1 = [b[i] - a[i] for i in range(3)]
    e2 = [c[i] - a[i] for i in range(3)]
    cross = (e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0])
    if sum(c * n for c, n in zip(cross, normal)) < 0:
        return points[::-1], uvs[::-1]
    return points, uvs


AREAS = ROOT / "res/field/areas"
SEASONS = ("spring", "summer", "autumn", "winter")


def set_seasons():
    """Each texture set's seasons, as the areas that use it name them (route_19_winter.json: winter; no suffix: spring,
    or every season for an area without variants)."""
    out = collections.defaultdict(set)
    for path in AREAS.glob("*.json"):
        if path.name.endswith(".schema.json"):
            continue
        texture_set = json.loads(path.read_text()).get("texture_set")
        if not texture_set:
            continue
        season = next((x for x in SEASONS[1:] if path.stem.endswith("_" + x)), "spring")
        out[texture_set.removeprefix("MAP_TEXTURE_SET_").lower()].add(season)
    return out


def donors(key, targets, data=None):
    """For each target set (a folder name) lacking the kind's textures, the set to import them from: one used in the
    same season whose images of them are that season's commonest (grass is drawn differently each season), else the
    commonest anywhere. {target: donor}; a target that has them is left out."""
    import hashlib

    data = data or kinds_file()
    kind = next(k for k in data["kinds"] if k["key"] == key)
    names = kind_textures(kind)
    seasons = set_seasons()
    have = {}
    for folder in TEXTURES.iterdir():
        if folder.is_dir() and all((folder / f"{t}.png").exists() for t in names):
            have[folder.name] = hashlib.md5(b"".join((folder / f"{t}.png").read_bytes() for t in names)).hexdigest()
    out = {}
    for target in targets:
        if target in have:
            continue
        wanted = seasons.get(target) or {"spring"}
        pool = [s for s in have if seasons.get(s, set()) & wanted] or list(have)
        if not pool:
            raise SystemExit(f"no texture set has {kind['name']}'s textures")
        common = collections.Counter(have[s] for s in pool).most_common(1)[0][0]
        out[target] = sorted(s for s in pool if have[s] == common)[0]
    return out


def survey():
    db = sqlite3.connect(ROOT / "build/map_atlas.db")
    data = kinds_file()
    by_class = {k["tile_type"] & 0xFFFF: k for k in data["kinds"]}
    rows = db.execute(f"""SELECT c.texture_set, t.tile_type, t.ground, t.record FROM tiles t JOIN chunks c USING (model)
                          WHERE (t.tile_type & 65535) IN ({','.join(map(str, by_class))}) AND t.record IS NOT NULL""")
    found = collections.defaultdict(lambda: [0, collections.Counter()])
    for texture_set, tile_type, ground, record in rows:
        r = json.loads(zlib.decompress(record))
        gy = next((s["y"][0] for s in r["surfaces"] if s["texture"] == ground), r["collision"][0]["height"])
        drawn = tuple(sorted((s["texture"], round(s["y"][0] - gy, 1)) for s in r["surfaces"]
                             if s["texture"] != ground and s["texture"] in all_textures(data)))
        e = found[(texture_set, by_class[tile_type & 0xFFFF]["name"])]
        e[0] += 1
        e[1][drawn] += 1
    for (texture_set, name), (n, drawn) in sorted(found.items()):
        top = ", ".join(f"{c}× {list(d)}" for d, c in drawn.most_common(2))
        print(f"{texture_set:40} {name:28} {n:5} tiles  {top}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("survey")
    commands.add_parser("available").add_argument("texture_set")
    d = commands.add_parser("donors")
    d.add_argument("kind")
    d.add_argument("sets", nargs="+")
    args = parser.parse_args()
    if args.command == "survey":
        survey()
    elif args.command == "donors":
        print(json.dumps(donors(args.kind, args.sets)))
    else:
        for k in available(args.texture_set):
            print(k["key"], k["name"])


if __name__ == "__main__":
    main()
