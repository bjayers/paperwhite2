#!/usr/bin/env python3
"""Paper White 2's profile learner: how the game draws an edge or a step across a tile, measured from every straight
run of it in the atlas (docs/paperwhite2/design/map-reader.md, Profiles learned).

    map_profiles.py cross TEXTURE [--drop UNITS] [--limit N]   # the cross-section of tiles edged with TEXTURE

A tile is in a straight run when the reader found it an edge (or a step: a cliff tile against higher ground) whose
outside is a cardinal direction, and its two neighbours along the run are the same. The cross-section is sampled
at the tile's middle along the run, at 17 points from the border with the outside (0) to the far side (1): every
surface there, top first, that is ground, an edge or a slope (not decorations), with its texture, its height above
the tile's own ground and below the outside's, and its v. Points are grouped by the texture sequence they show, and
for each group the median of each.
"""
import argparse
import json
import sqlite3
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/paperwhite2"))
import map_reader  # noqa: E402

DB = ROOT / "build/map_atlas.db"
STEPS = 17
DIRS = {"N": (0, -1), "E": (1, 0), "S": (0, 1), "W": (-1, 0)}


def straight_tiles(db, texture, drop=None, limit=200):
    """Tiles of straight runs edged with texture (as an edge, or a step whose faces it draws): (model, x, z, outside,
    drop to the outside)."""
    rows = db.execute("""SELECT model, x, z, outside, ground_y, terrain, slope, downhill FROM tiles
                         WHERE (edge = ? OR slope = ?) AND ground_y IS NOT NULL""", (texture, texture)).fetchall()
    grid = {(m, x, z): (o, y, ter, d) for m, x, z, o, y, ter, sl, d in rows}
    ys = {}
    out = []
    for (m, x, z), (o, y, ter, down) in grid.items():
        side = o if o in DIRS else ({"N": "S", "S": "N", "E": "W", "W": "E"}.get(down) if down in DIRS else None)
        if side not in DIRS:
            continue
        dx, dz = DIRS[side]
        along = (dz, dx)
        a, b = grid.get((m, x + along[0], z + along[1])), grid.get((m, x - along[0], z - along[1]))
        if not a or not b:
            continue
        key = (m, x + dx, z + dz)
        if key not in ys:
            r = db.execute("SELECT ground_y FROM tiles WHERE model = ? AND x = ? AND z = ?", key).fetchone()
            ys[key] = r[0] if r else None
        outside_y = ys[key]
        if outside_y is None:
            continue
        d = round(outside_y - y)
        if drop is not None and abs(d - drop) > 2:
            continue
        out.append((m, x, z, side, d, y, outside_y))
        if len(out) >= limit:
            break
    return out


def cross(chunk, x, z, side, own_y, outside_y):
    """The surfaces across a tile from its border with side to the far side: per point, [(texture, height above own
    ground, below the outside, v)] top first."""
    tile = chunk.tiles[(x, z)]
    roles = chunk.facts["textures"]
    dx, dz = DIRS[side]
    out = []
    for i in range(STEPS):
        t = i / (STEPS - 1)
        # From the border (0) inward: the border is the side toward the outside
        u = 0.5 + dx * (0.5 - t) if dx else 0.5
        w = 0.5 + dz * (0.5 - t) if dz else 0.5
        stack = []
        for y, piece, uv in tile.surfaces_at(u, w):
            if roles.get(piece.texture, {}).get("role") not in ("ground", "edge", "slope"):
                continue
            stack.append((piece.texture, round(y - own_y, 1), round(y - outside_y, 1), round(uv[1], 2)))
        out.append(stack)
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    c = commands.add_parser("cross")
    c.add_argument("texture")
    c.add_argument("--drop", type=int)
    c.add_argument("--limit", type=int, default=120)
    args = parser.parse_args()
    db = sqlite3.connect(DB)
    tiles = straight_tiles(db, args.texture, args.drop, args.limit)
    chunks = {}
    groups = defaultdict(list)
    for m, x, z, side, d, y, oy in tiles:
        if m not in chunks:
            chunks[m] = map_reader.load_chunk(m, "w2-original", None)
        section = cross(chunks[m], x, z, side, y, oy)
        top = tuple(s[0][0] if s else None for s in section)
        groups[(d, top)].append(section)
    print(f"{len(tiles)} straight tiles of {args.texture}")
    for (d, top), sections in sorted(groups.items(), key=lambda kv: -len(kv[1]))[:6]:
        print(f"\n{len(sections)} with a drop of {d}: from the border inward")
        for i in range(STEPS):
            tops = [s[i][0] for s in sections if s[i]]
            if not tops:
                print(f"  {i / (STEPS - 1):.3f}  -")
                continue
            under = Counter(len(s[i]) for s in sections).most_common(1)[0][0]
            print(f"  {i / (STEPS - 1):.3f}  {tops[0][0]:12} above own {statistics.median(t[1] for t in tops):6.1f}  "
                  f"below outside {statistics.median(t[2] for t in tops):6.1f}  v {statistics.median(t[3] for t in tops):5.2f}"
                  f"  layers {under}" + (f"  under: {Counter(s[i][1][0] for s in sections if len(s[i]) > 1).most_common(1)[0][0]}"
                                         f" at {statistics.median(s[i][1][1] for s in sections if len(s[i]) > 1):.1f}"
                                         if any(len(s[i]) > 1 for s in sections) else ""))


if __name__ == "__main__":
    main()
