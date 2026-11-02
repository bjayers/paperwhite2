#!/usr/bin/env python3
"""Paper White 2's profile learner: how the game draws an edge or a step across a tile, measured from every straight
run of it in the atlas (docs/paperwhite2/design/map-reader.md, Profiles learned).

    map_profiles.py cross TEXTURE [--drop UNITS] [--limit N]   # the cross-section of tiles edged with TEXTURE
    map_profiles.py draft TEXTURE_SET [--name N] [--out FILE]  # a map style for a texture set, learned from the atlas

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
import zlib
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/paperwhite2"))
import map_reader  # noqa: E402

DB = ROOT / "build/map_atlas.db"
STEPS = 17
DIRS = {"N": (0, -1), "E": (1, 0), "S": (0, 1), "W": (-1, 0)}


def straight_tiles(db, texture, drop=None, limit=200, models=None):
    """Tiles of straight runs edged with texture (as an edge, or a step whose faces it draws), in models if given:
    (model, x, z, outside, drop to the outside, own ground's height, outside's)."""
    rows = db.execute("""SELECT model, x, z, outside, ground_y, terrain, slope, downhill FROM tiles
                         WHERE (edge = ? OR slope = ?) AND ground_y IS NOT NULL""", (texture, texture)).fetchall()
    if models is not None:
        rows = [r for r in rows if r[0] in models]
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


KEYS = "abcdefghijkmnopqrsuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"


def median(values):
    values = [v for v in values if v is not None]
    return statistics.median(values) if values else None


def learn_profile(db, texture, models, chunks, limit=60):
    """An edge's or step's profile from its straight runs in models: (drop, lines, faces) for its commonest drop and
    cross-section, or None. Lines are where the top texture changes across the tile; a step's lines (the outside
    higher) are measured from the outside, its last from the tile's own ground."""
    tiles = straight_tiles(db, texture, None, limit, models)
    groups = defaultdict(list)
    for m, x, z, side, d, y, oy in tiles:
        if m not in chunks:
            chunks[m] = map_reader.load_chunk(m, "w2-original", None)
        section = cross(chunks[m], x, z, side, y, oy)
        drop = 0 if abs(d) <= 2 else d
        groups[(drop, tuple(st[0][0] if st else None for st in section))].append(section)
    if not groups:
        return None
    (drop, tops), sections = max(groups.items(), key=lambda kv: len(kv[1]))
    if len(sections) < 3 or None in tops:
        return None
    step = drop > 2
    points = []
    for i in range(STEPS):
        tops_i = [st[i][0] for st in sections if st[i]]
        points.append({"t": i / (STEPS - 1), "texture": tops_i[0][0], "above": median(p[1] for p in tops_i),
                       "below": median(p[2] for p in tops_i), "v": median(p[3] for p in tops_i)})
    breaks = [0] + [i for i in range(1, STEPS) if points[i]["texture"] != points[i - 1]["texture"]] + [STEPS - 1]
    lines, faces = [], []
    for j, i in enumerate(breaks):
        p = points[i]
        last = j == len(breaks) - 1
        if step and not last:
            lines.append({"offset": round(p["t"], 3), "lift": round(p["below"] / 16, 3), "from": "outside"})
        else:
            lines.append({"offset": round(p["t"], 3), "lift": round(p["above"] / 16, 3)})
    for j in range(len(breaks) - 1):
        a, b = points[breaks[j]], points[breaks[j + 1] - 1] if breaks[j + 1] - 1 > breaks[j] else points[breaks[j + 1]]
        face = {"between": [j, j + 1], "texture": a["texture"]}
        role = chunks[next(iter(chunks))].facts["textures"].get(a["texture"], {}).get("role")
        dy = abs((a["above"] or 0) - (b["above"] or 0))
        dv = (b["v"] or 0) - (a["v"] or 0)
        if role == "ground":
            face.update({"planar": True, "repeat": 1})
        elif dy > 3 and abs(dv) > 0.05:
            face.update({"v": [round(a["v"] % 1, 2), round(a["v"] % 1 + dv, 2)], "v_units": round(dy / abs(dv), 1)})
        else:
            face["v"] = [round(min(1, max(0, a["v"])), 2), round(min(1, max(0, b["v"])), 2)]
        faces.append(face)
    # The underlay: ground drawn flat at the tile's own height under see-through faces across most of the tile (the
    # lower grass under a ledge, which leaves a seam at its foot without it)
    if step:
        under = Counter()
        for st in sections:
            for i in range(STEPS):
                below = [layer for layer in st[i][1:] if abs(layer[1]) <= 1]
                if below:
                    under[below[0][0]] += 1
        if under:
            texture, n = under.most_common(1)[0]
            role = chunks[next(iter(chunks))].facts["textures"].get(texture, {}).get("role")
            if role == "ground" and n > len(sections) * STEPS / 2:
                lines.append({"offset": 0, "lift": 0})
                faces.insert(0, {"between": [len(lines) - 1, len(lines) - 2], "texture": texture, "planar": True, "repeat": 4})
    return drop, lines, faces


def draft(db, texture_set, name, verify=False, log=None, focus=None):
    """A map style drafted from the atlas for a texture set (verify: each learned edge checked by round trips on the
    chunks with most of it, and focus, the chunk it's for): its ground textures as terrains (each with the tile type
    most of its tiles have), and its edge and slope textures as edges, each with its learned profile, a terrain of
    its own, and its family: the ground inside an edge, the ground under a step."""
    models = {m for (m,) in db.execute("SELECT model FROM chunks WHERE texture_set = ? AND kind = 'overworld'", (texture_set,))}
    if not models:
        models = {m for (m,) in db.execute("SELECT model FROM chunks WHERE texture_set = ?", (texture_set,))}
    marks = ",".join("?" * len(models))
    roles = defaultdict(Counter)
    for t, role, n in db.execute(f"SELECT texture, role, SUM(tiles) FROM textures WHERE model IN ({marks}) GROUP BY texture, role", list(models)):
        roles[t][role] += n
    role = {t: c.most_common(1)[0][0] for t, c in roles.items()}
    grounds = Counter()
    types = defaultdict(Counter)
    for g, tt, n in db.execute(f"""SELECT ground, tile_type, COUNT(*) FROM tiles WHERE model IN ({marks}) AND edge IS NULL
                                   AND slope IS NULL AND ground IS NOT NULL GROUP BY ground, tile_type""", list(models)):
        if role.get(g) == "ground":
            grounds[g] += n
            types[g][tt] += n
    terrains, key_of = [], {}
    for g, n in grounds.most_common(10):
        if n < 20:
            break
        key = KEYS[len(terrains)]
        key_of[g] = key
        terrains.append({"key": key, "name": g, "color": f"hsl({sum(map(ord, g)) * 37 % 360}, 50%, 55%)",
                         "ground": {"texture": g, "repeat": 4}, "tile_type": types[g].most_common(1)[0][0]})
    insides = {t: i for t, i in db.execute(f"""SELECT texture, inside FROM textures WHERE model IN ({marks}) AND inside IS NOT NULL
                                               GROUP BY texture, inside ORDER BY COUNT(*)""", list(models))}
    chunks = {}
    edges = []
    candidates = Counter()
    for t, n in db.execute(f"SELECT edge, COUNT(*) FROM tiles WHERE model IN ({marks}) AND edge IS NOT NULL GROUP BY edge", list(models)):
        candidates[t] += n
    for t, n in db.execute(f"SELECT slope, COUNT(*) FROM tiles WHERE model IN ({marks}) AND slope IS NOT NULL GROUP BY slope", list(models)):
        candidates[t] += n
    for texture, n in candidates.most_common(12):
        if n < 20:
            break
        learned = learn_profile(db, texture, models, chunks)
        if not learned:
            continue
        drop, lines, faces = learned
        if drop > 2:
            # The ground of its tiles (a step's lower ground, a bank's bed: drawn as a slope or an edge), else what's
            # inside it (checked below, where verify is on: a guess for caves' walls made their round trip worse)
            under = Counter(g for (g,) in db.execute(f"SELECT ground FROM tiles WHERE model IN ({marks}) AND (slope = ? OR edge = ?)",
                                                     [*models, texture, texture]))
            family = next((key_of[g] for g, _ in under.most_common() if g in key_of), None) or key_of.get(insides.get(texture))
        else:
            family = key_of.get(insides.get(texture))
        if family is None:
            continue
        edge = {"name": texture, "to": family, "lines": lines, "faces": faces}
        if drop > 2:
            edge["step"] = True
            edge["from"] = [t["key"] for t in terrains]
            # A ramp where the game's own tiles of it mostly have sloped collision (stairs, hills): one walks it
            sloped = total = 0
            for (rec,) in db.execute(f"SELECT record FROM tiles WHERE model IN ({marks}) AND slope = ? AND record IS NOT NULL LIMIT 60",
                                     [*models, texture]):
                first = next((c for c in json.loads(zlib.decompress(rec))["collision"] if c["layer"] == 0), None)
                if first:
                    total += 1
                    sloped += bool(first.get("slope")) and not (first["tile_type"] >> 16) & 1
            if total and sloped > total / 2:
                edge["ramp"] = True
        else:
            edge["from"] = [t["key"] for t in terrains if t["key"] != family]
        edges.append(edge)
    wall = next((t for t, c in roles.items() if role.get(t) == "wall"), None) or next(iter(key_of))

    def assemble(chosen):
        out_terrains = [dict(t) for t in terrains]
        out_edges = [dict(e) for e in chosen]
        extra = KEYS[len(out_terrains):len(out_terrains) + len(out_edges)]
        for e in out_edges:
            e["from"] = sorted(set(e["from"]) | set(extra))
        for e in out_edges:
            base = next(t for t in out_terrains if t["key"] == e["to"])
            out_terrains.append({"key": KEYS[len(out_terrains)], "name": f"{e['name']} edge", "edge_of": e["to"], "edge": e["name"],
                                 "color": "#806040", "ground": base["ground"], "tile_type": base["tile_type"]})
        return {"$schema": "../map_style.schema.json", "name": name, "texture_set": texture_set,
                "wall": {"texture": wall, "repeat": 1, "alpha": "MASK"}, "edges": out_edges, "terrains": out_terrains}
    if not verify:
        return assemble(edges)
    # Each learned edge kept only if the round trip on the three chunks with most of it is no worse with it than without
    import map_roundtrip
    kept = []
    read = {}
    for e in edges:
        tops = [m for (m, _) in db.execute(f"""SELECT model, COUNT(*) n FROM tiles WHERE model IN ({marks}) AND (edge = ? OR slope = ?)
                                                GROUP BY model ORDER BY n DESC LIMIT 3""", [*models, e["name"], e["name"]])]
        if focus and focus not in tops:
            tops.append(focus)  # (the chunk being painted: a set shared by many places fits each differently)
        if not tops:
            continue
        for m in tops:
            if m not in read:
                read[m] = map_reader.load_chunk(m, "w2-original", None)

        def values(style):
            out = {}
            for m in tops:
                made = map_roundtrip.trip(read[m], style)[0].get("made", {})
                out[m] = sum(made.get(k) or 0 for k in ("terrain", "edge", "height within 2")) - (made.get("textures differ") or 0)
            return out
        before, after = values(assemble(kept)), values(assemble(kept + [e]))
        without, with_ = sum(before.values()), sum(after.values())
        # Clearly better over them (a tie may still hurt chunks outside these), and no worse for the chunk it's for
        if with_ > without + 0.005 * len(tops) and (not focus or after[focus] >= before[focus] - 0.005):
            kept.append(e)
        if log:
            log(f"{e['name']}: {'kept' if e in kept else 'left out'} ({', '.join(tops)}: {without:.3f} without, {with_:.3f} with)")
    return assemble(kept)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    c = commands.add_parser("cross")
    c.add_argument("texture")
    c.add_argument("--drop", type=int)
    c.add_argument("--limit", type=int, default=120)
    d = commands.add_parser("draft")
    d.add_argument("texture_set")
    d.add_argument("--name")
    d.add_argument("--out")
    d.add_argument("--verify", action="store_true", help="keep each learned edge only if the round trip is no worse with it")
    args = parser.parse_args()
    db = sqlite3.connect(DB)
    if args.command == "draft":
        style = draft(db, args.texture_set, args.name or args.texture_set, args.verify, log=print)
        text = json.dumps(style, indent=1)
        if args.out:
            Path(args.out).write_text(text + "\n")
        print(text if not args.out else f"{args.out}: {len(style['terrains'])} terrains, {len(style['edges'])} edges")
        return
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
