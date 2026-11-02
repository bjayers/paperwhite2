#!/usr/bin/env python3
"""Paper White 2's map round trip: a vanilla chunk read, painted from its reading, generated and read again, and the
two readings compared tile by tile (docs/paperwhite2/design/map-reader.md, The round-trip test).

    map_roundtrip.py MODEL --style STYLE [--rev REV] [--out DIR]

The chunk is read as the original game has it (--rev, w2-original by default). Each tile becomes a painted tile:
its terrain (an edge tile its family's edge terrain, a cliff the style's blocked ground), its height where one walks
(the collision's, water's raised to the land it's painted level with). Tiles the map maker can't make yet (a deck,
nothing drawn) are painted as what's round them and counted apart. The painting is generated into a temporary
folder (nothing under res/ changes) and read again with the same style, and each tile compared:

- terrain: the same reading, and for edges the same outside;
- height: the ground's height (units; a tile is 16);
- sides: each side's cross-section, eight heights along it, the mean difference (where both have ground);
- textures: how much of the tile, seen from above, each texture of its ground, edges and slopes covers, the share
  that differs (decorations, trees and grass decals, are objects to place, not compared).

It prints the scores by kind of tile, the worst tiles, and with --out writes the two readings (vanilla.json,
generated.json), the painting, the report (report.json) and a page of the two side by side from above
(compare.html).
"""
import argparse
import json
import math
import shutil
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools/paperwhite2"))
import map_maker  # noqa: E402
import map_profiles  # noqa: E402
import map_reader  # noqa: E402
from tools.data.datajson import dumps  # noqa: E402

TILE = map_maker.TILE
HALF = map_maker.HALF_TILE


KEYS = "abcdefghijklmnopqrsuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"


def draft_style(chunk, texture_set):
    """A style drafted from a chunk's own reading, for a chunk no style is made for: each ground texture a terrain
    (its tile type the one most of its tiles have), a blocked one for cliffs, and each edge texture whose inside the
    reader learned an edge of that terrain, two lines a tile apart with v from 0 to 1 (no bends, no banks)."""
    roles = chunk.facts["textures"]
    types = defaultdict(Counter)
    for t in chunk.tiles.values():
        g = t.facts["ground"]
        c = next((c for c in t.facts["collision"] if c["layer"] == 0), None)
        if g and c and not t.facts["reading"]["edge"]:
            types[g["texture"]][c["tile_type"]] += 1
    grounds = sorted((tex for tex, r in roles.items() if tex and r["role"] == "ground" and types.get(tex)),
                     key=lambda tex: -sum(types[tex].values()))
    terrains, key_of = [], {}
    for i, tex in enumerate(grounds[:len(KEYS) - 8]):
        key_of[tex] = KEYS[i]
        terrains.append({"key": KEYS[i], "name": tex, "ground": {"texture": tex, "repeat": 1},
                         "tile_type": types[tex].most_common(1)[0][0]})
    terrains.append({"key": "t", "name": "blocked", "ground": {"texture": grounds[0], "repeat": 1}, "tile_type": 0x810001})
    edges = []
    for tex, r in roles.items():
        inside = r.get("inside")
        if r["role"] == "edge" and inside in key_of:
            edges.append({"to": key_of[inside], "from": [k for t, k in key_of.items() if t != inside],
                          "lines": [{"offset": 0, "lift": 0}, {"offset": 1, "lift": 0}],
                          "faces": [{"between": [0, 1], "texture": tex, "v": [0, 1]}]})
    for e in edges:
        terrains.append({"key": _free(terrains), "name": f"{e['faces'][0]['texture']} edge",
                         "edge_of": e["to"], "ground": next(t["ground"] for t in terrains if t["key"] == e["to"]),
                         "tile_type": next(t["tile_type"] for t in terrains if t["key"] == e["to"])})
    # Readings name terrains by texture: the draft's names are its textures, so its keys stand for them
    return {"name": f"{chunk.model} (drafted)", "texture_set": texture_set,
            "wall": {"texture": next((t for t, r in roles.items() if r["role"] in ("wall", "slope")), grounds[0]), "alpha": "MASK"},
            "edges": edges, "terrains": terrains}


def _free(terrains):
    used = {t["key"] for t in terrains}
    return next(k for k in KEYS if k not in used)


def painting_of(chunk, style):
    """The painting a chunk's reading makes: (terrain rows, heights in half tiles, each tile's kind for the score)."""
    terrains = {t["key"]: t for t in style["terrains"]}
    edge_terrain = {}
    for t in style["terrains"]:
        if t.get("edge_of") and not t.get("square"):
            edge_terrain.setdefault(t["edge_of"], t["key"])
    blocked = next((t["key"] for t in style["terrains"] if not t.get("edge_of") and (t["tile_type"] >> 16) & 1), None)
    # A drafted style names its terrains by their textures, which the reading without a style uses
    by_name = {t["name"]: t["key"] for t in style["terrains"] if not t.get("edge_of")}
    # The style's steps (ledges, cliffs): each edge terrain of a step edge, with the deepest drop it's for (a ledge's
    # half tile, else any), shallowest first
    step_edges = {e.get("name"): e for e in style.get("edges", []) if e.get("step")}
    steps = {}
    for t in style["terrains"]:
        e = step_edges.get(t.get("edge"))
        if e and (not t.get("square") or e.get("ramp")):
            steps[t["key"]] = (e["name"], HALF + 2 if e["name"] == "ledge" else 1e9 if not e.get("ramp") else -1)
    steps = dict(sorted(steps.items(), key=lambda kv: kv[1][1]))
    plain = style["terrains"][0]["key"]
    size = chunk.size
    keys = [[plain] * size for _ in range(size)]
    heights = [[0] * size for _ in range(size)]
    kinds = {}
    for (x, z), tile in chunk.tiles.items():
        f = tile.facts
        r = f["reading"]
        terrain = r["terrain"] if r["terrain"] in terrains or r["terrain"] == "cliff" else by_name.get(r["terrain"], r["terrain"])
        first = next((c for c in f["collision"] if c["layer"] == 0 and c["height"] is not None), None)
        walk = first["height"] if first else (f["ground"] or {}).get("y", 0.0)
        if first and (first["tile_type"] >> 16) & 1 and f["ground"] and f["ground"]["y"] > walk + 2:
            walk = f["ground"]["y"]  # blocked and drawn higher: a plateau's top over the beach its collision is at
        if r.get("empty"):
            kind = "nothing drawn"
        elif r.get("deck"):
            kind = "deck"
            under = r.get("under") if r.get("under") in terrains else by_name.get(r.get("under"))
            terrain = under or terrain
        elif terrain == "cliff":
            kind = "cliff"
            walk = (f["ground"] or {}).get("y", walk)
            # The step that fits the drop to the highest neighbour (a ledge for half a tile, else a cliff)
            drop = max([(n.facts["ground"] or {}).get("y", -1e9) - walk for n in
                        (tile.neighbour(1, 0), tile.neighbour(-1, 0), tile.neighbour(0, 1), tile.neighbour(0, -1)) if n] or [0])
            fits = [k for k, (name, depth) in steps.items() if drop >= 2 and drop <= depth] or \
                   [k for k, (name, depth) in sorted(steps.items(), key=lambda kv: -kv[1][1])][:1]
            # (a ramp, depth -1, is never chosen by its drop, only by its face)
            terrain = fits[0] if fits and drop >= 2 else (blocked or plain)
            # The step whose faces draw the slope the reader found (stairs' kaidan01a), before the drop's
            seen = (r.get("slope") or {}).get("texture")
            by_face = [k for k, (name, _) in steps.items() if seen in {f["texture"] for f in step_edges[name]["faces"]}]
            if by_face and drop >= 2:
                terrain = by_face[0]
        elif r["edge"] and terrain in edge_terrain:
            kind = "edge"
            terrain = edge_terrain[terrain]
        elif terrain in terrains:
            kind = "plain"
        else:
            kind = "unknown terrain"
            terrain = plain
        if terrain not in terrains:
            terrain = plain  # a deck over nothing known, a tile with nothing drawn
        lift = terrains.get(terrain, {}).get("collision_lift", 0) * TILE
        keys[z][x] = terrain
        heights[z][x] = max(-40, min(80, round((walk - lift) / HALF)))
        kinds[(x, z)] = kind
    # A ramp (stairs) is painted at its bottom, the far side from its higher neighbour, where the reading gives its
    # middle: bottom = 2 middle - top, the top being the higher neighbour's painted height; down each flight from its
    # top
    ramp_keys = {k for k, (name, _) in steps.items() if step_edges[name].get("ramp")}
    ramps = sorted(((x, z) for (x, z) in chunk.tiles if keys[z][x] in ramp_keys), key=lambda xz: -heights[xz[1]][xz[0]])
    for x, z in ramps:
        middle = heights[z][x] * HALF
        tops = [heights[z + dz][x + dx] * HALF for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1))
                if 0 <= x + dx < size and 0 <= z + dz < size and heights[z + dz][x + dx] * HALF > middle + 2]
        if tops:
            heights[z][x] = max(-40, min(80, round((2 * middle - max(tops)) / HALF)))
    return ["".join(row) for row in keys], heights, kinds


def generate(chunk, style_name, keys, heights, work, styles=None):
    """Generates the painting into work/<model>, a copy of the chunk's folder; the folder."""
    model = chunk.model
    folder = work / "models" / model
    folder.mkdir(parents=True)
    for name in ("model.glb", "data.json", "terrain_0.csv", "terrain_0_splits.csv", "terrain_1.csv"):
        if (chunk.folder / name).exists():
            shutil.copy(chunk.folder / name, folder / name)
    if not (folder / "data.json").exists():
        (folder / "data.json").write_text(json.dumps({"texture_set": None}) + "\n")
    projects = work / "projects"
    projects.mkdir()
    shutil.copy(map_maker.PROJECTS / "map_project.schema.json", projects / "map_project.schema.json")
    project = {"$schema": "../map_project.schema.json", "model": model, "style": style_name, "size": chunk.size,
               "terrain": keys, "height": heights, "objects": []}
    path = projects / f"{model}.json"
    path.write_text(dumps(project, width=1 << 20) + "\n")
    saved = map_maker.MODELS, map_maker.PROJECTS, map_maker.STYLES
    map_maker.MODELS, map_maker.PROJECTS = work / "models", projects
    if styles:
        map_maker.STYLES = styles
    try:
        triangles = map_maker.generate(path)
    finally:
        map_maker.MODELS, map_maker.PROJECTS, map_maker.STYLES = saved
    return folder, triangles


def compare(vanilla, generated, kinds):
    """Each tile's differences: terrain, edge, height, sides, textures."""
    out = {}
    for xz, a in vanilla.tiles.items():
        b = generated.tiles[xz]
        fa, fb = a.facts, b.facts
        ra, rb = fa["reading"], fb["reading"]
        ga, gb = fa["ground"], fb["ground"]
        sides = []
        for side in ("N", "E", "S", "W"):
            for p, q in zip(fa["sides"][side], fb["sides"][side]):
                if p and q:
                    sides.append(abs(p[0] - q[0]))
        cover_a, cover_b = _cover(fa, vanilla.facts["textures"]), _cover(fb, generated.facts["textures"])
        textures = sum(abs(cover_a.get(t, 0) - cover_b.get(t, 0)) for t in set(cover_a) | set(cover_b)) / 2
        out[xz] = {
            "kind": kinds[xz],
            "terrain": ra["terrain"] == rb["terrain"],
            "edge": (bool(ra["edge"]) == bool(rb["edge"])) and (not ra["edge"] or ra["edge"]["outside"] == rb["edge"]["outside"]),
            "height": abs(ga["y"] - gb["y"]) if ga and gb else None,
            "sides": sum(sides) / len(sides) if sides else None,
            "textures": round(min(1.0, textures), 3),
            "vanilla": f"{ra['terrain']}" + (f"/{ra['edge']['outside']}" if ra["edge"] else ""),
            "generated": f"{rb['terrain']}" + (f"/{rb['edge']['outside']}" if rb["edge"] else ""),
        }
    return out


def _cover(facts, roles):
    """How much of the tile each texture covers from above, among its ground, edges and slopes (not decorations,
    trees and grass, which are objects to place, nor structures or walls), as shares of their total."""
    c = Counter()
    for s in facts["surfaces"]:
        if s["facing"] == ["vertical"] or roles.get(s["texture"], {}).get("role") not in ("ground", "edge", "slope"):
            continue
        c[s["texture"]] += s["cover"]
    total = sum(c.values()) or 1
    return {t: v / total for t, v in c.items()}


def score(results):
    """The scores by kind of tile, and over the tiles the map maker can make (plain, edge, cliff)."""
    groups = defaultdict(list)
    for r in results.values():
        groups[r["kind"]].append(r)
        if r["kind"] in ("plain", "edge", "cliff"):
            groups["made"].append(r)
    out = {}
    for kind, rs in groups.items():
        heights = [r["height"] for r in rs if r["height"] is not None]
        sides = [r["sides"] for r in rs if r["sides"] is not None]
        out[kind] = {"tiles": len(rs), "terrain": round(sum(r["terrain"] for r in rs) / len(rs), 3),
                     "edge": round(sum(r["edge"] for r in rs) / len(rs), 3),
                     "height within 2": round(sum(h <= 2 for h in heights) / len(heights), 3) if heights else None,
                     "sides mean": round(sum(sides) / len(sides), 2) if sides else None,
                     "textures differ": round(sum(r["textures"] for r in rs) / len(rs), 3)}
    return out


def badness(r):
    return (0 if r["terrain"] else 2) + (0 if r["edge"] else 1) + min(2, (r["sides"] or 0) / 4) + r["textures"]


PALETTE = ["#7cc860", "#d8b878", "#3a7ae0", "#a07850", "#e07040", "#9050d0", "#40c0c0", "#e0d040", "#d04080",
           "#2f8a3a", "#6070a0", "#f0a0a0", "#80e0a0", "#c0c0c0", "#805020", "#4040a0"]


def top_down(chunk, colours, scale=12):
    """An SVG of a chunk from above: its ground, edges and slopes (not decorations, structures or walls), each texture
    in a colour of its own, lowest first."""
    roles = chunk.facts["textures"]
    polys = []
    for key, tri in sorted(chunk.triangles, key=lambda kt: min(v.p[1] for v in kt[1])):
        m = chunk.materials[key]
        texture = Path(m.get("pbrMetallicRoughness", {}).get("baseColorTexture", {}).get("image", "?")).stem
        if roles.get(texture, {}).get("role") not in ("ground", "edge", "slope"):
            continue
        c = colours.setdefault(texture, PALETTE[len(colours) % len(PALETTE)])
        pts = " ".join(f"{(v.p[0] + chunk.half) / TILE * scale:.1f},{(v.p[2] + chunk.half) / TILE * scale:.1f}" for v in tri)
        polys.append(f'<polygon points="{pts}" fill="{c}" stroke="{c}" stroke-width="0.3"/>')
    size = chunk.size * scale
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" style="background:#111">' + "".join(polys) + "</svg>"


def page(model, vanilla, generated, results, scores):
    colours = {}
    a = top_down(vanilla, colours)
    b = top_down(generated, colours)
    scale = 12
    marks = "".join(f'<rect x="{x * scale}" y="{z * scale}" width="{scale}" height="{scale}" fill="none" stroke="#ff3030" stroke-width="1.2"/>'
                    for (x, z), r in results.items() if badness(r) >= 2 and r["kind"] in ("plain", "edge"))
    b = b.replace("</svg>", marks + "</svg>")
    legend = "".join(f'<span style="display:inline-block;margin:2px 8px"><span style="display:inline-block;width:10px;height:10px;background:{c}"></span> {t}</span>'
                     for t, c in sorted(colours.items()))
    rows = "".join(f"<tr><td>{k}</td>" + "".join(f"<td>{v[c]}</td>" for c in ("tiles", "terrain", "edge", "height within 2", "sides mean", "textures differ")) + "</tr>"
                   for k, v in scores.items())
    return f"""<!doctype html><meta charset="utf-8"><title>Round trip {model}</title>
<style>body{{font:13px system-ui;background:#1b1d22;color:#ddd;margin:16px}} td,th{{padding:2px 8px;text-align:right}} .pair{{display:flex;gap:16px;flex-wrap:wrap}}</style>
<h2>{model}</h2><table><tr><th>tiles</th><th>count</th><th>terrain</th><th>edge</th><th>height within 2</th><th>sides mean</th><th>textures differ</th></tr>{rows}</table>
<div class="pair"><div><h3>Vanilla</h3>{a}</div><div><h3>Generated (plain and edge tiles that differ most in red)</h3>{b}</div></div>
<p>{legend}</p><p>Ground, edges and slopes only: trees, grass and fences are objects to place, and bridges structures.</p>"""


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("model")
    parser.add_argument("--style", help="a map style; without one, a style is drafted from the chunk's reading")
    parser.add_argument("--rev", default="w2-original")
    parser.add_argument("--out")
    args = parser.parse_args()
    work = Path(tempfile.mkdtemp(prefix="map_roundtrip_"))
    styles = None
    if args.style:
        style_name = args.style
        style = json.loads((map_maker.STYLES / f"{style_name}.json").read_text())
        vanilla = map_reader.load_chunk(args.model, args.rev, style_name)
    else:
        vanilla = map_reader.load_chunk(args.model, args.rev, None)
        data = json.loads((vanilla.folder / "data.json").read_text()) if (vanilla.folder / "data.json").exists() else {}
        texture_set = data.get("texture_set") or data.get("texture_preview")
        if not texture_set:
            shown = json.loads((map_maker.MODELS / args.model / "data.json").read_text())
            texture_set = shown.get("texture_set") or shown.get("texture_preview")
        style_name = "drafted"
        # A style learned from the atlas for the chunk's texture set (map_profiles.py), else drafted from its reading
        style = None
        if texture_set and map_profiles.DB.exists():
            import sqlite3
            style = map_profiles.draft(sqlite3.connect(map_profiles.DB), texture_set, "drafted")
            if not style["terrains"]:
                style = None
        style = style or draft_style(vanilla, texture_set)
        styles = work / "styles"
        styles.mkdir()
        shutil.copy(map_maker.STYLES / "map_style.schema.json", styles / "map_style.schema.json")
        (styles / "drafted.json").write_text(json.dumps(style))
    keys, heights, kinds = painting_of(vanilla, style)
    try:
        folder, triangles = generate(vanilla, style_name, keys, heights, work, styles)
        generated = map_reader.Chunk(args.model, folder, style if args.style else None)
        results = compare(vanilla, generated, kinds)
        scores = score(results)
        print(f"{args.model}: vanilla {len(vanilla.triangles)} triangles, generated {triangles}")
        for kind, s in scores.items():
            print(f"  {kind:16} {s}")
        worst = sorted(results.items(), key=lambda kv: -badness(kv[1]))[:12]
        print("  worst:", "; ".join(f"{xz} {r['kind']} {r['vanilla']}->{r['generated']} sides {r['sides'] and round(r['sides'], 1)}"
                                    for xz, r in worst))
        if args.out:
            out = Path(args.out)
            out.mkdir(parents=True, exist_ok=True)
            (out / "vanilla.json").write_text(json.dumps(vanilla.record(), separators=(",", ":")))
            (out / "generated.json").write_text(json.dumps(generated.record(), separators=(",", ":")))
            (out / "painting.json").write_text(json.dumps({"terrain": keys, "height": heights}))
            (out / "report.json").write_text(json.dumps({"scores": scores, "tiles": {f"{x},{z}": r for (x, z), r in results.items()}}))
            (out / "compare.html").write_text(page(args.model, vanilla, generated, results, scores))
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
