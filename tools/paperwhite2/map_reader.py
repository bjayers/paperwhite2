#!/usr/bin/env python3
"""Paper White 2's map reader: a map chunk described tile by tile from everything over each tile
(docs/paperwhite2/design/map-reader.md).

    map_reader.py read MODEL [--style STYLE] [--rev REV] [--out FILE]   # the chunk's record, as JSON
    map_reader.py show MODEL [--style STYLE] [--rev REV] [--fact NAME]  # its readings as a map of letters

The model's faces are clipped to each tile's square, and each tile's record is built from those pieces, its
collision and the chunk's props by the facts below, in order. A fact is a function of the tile that returns
something JSON can hold, registered with @tile_fact (or @chunk_fact for the chunk as a whole); a later fact can use
an earlier one's value (tile.facts). Adding a record to the reader is adding a fact.

--rev reads the chunk as a git revision has it (w2-original: the game as it shipped), not as the working tree has it.
--style names a map style (res/paperwhite2/map_styles/), whose terrains name the readings; without one, a tile's
reading is its ground's texture.
"""
import argparse
import csv
import json
import math
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools/paperwhite2"))
from glb_mesh import read_mesh  # noqa: E402
from map_maker import STYLES, TILE, _clip, _tables  # noqa: E402
from map_model_data import read_glb  # noqa: E402

MODELS = ROOT / "res/field/maps/models"
CLAMP = 33071
SIDES = {"N": ((0, 0), (1, 0)), "E": ((1, 0), (1, 1)), "S": ((1, 1), (0, 1)), "W": ((0, 1), (0, 0))}
SAMPLES = 8

TILE_FACTS = []
CHUNK_FACTS = []


def tile_fact(name):
    """Registers a fact of each tile, under name, computed in the order registered."""
    def register(function):
        TILE_FACTS.append((name, function))
        return function
    return register


def chunk_fact(name):
    """Registers a fact of the chunk, computed before the tiles' facts (tile.chunk.facts)."""
    def register(function):
        CHUNK_FACTS.append((name, function))
        return function
    return register


# ---------------------------------------------------------------- Geometry


class Piece:
    """The part of one of the model's triangles over one tile: its corners (Vertex, in the model's units), material,
    and what can be said of it alone."""

    def __init__(self, triangle, polygon, material, corners):
        self.triangle = triangle
        # Clipping can leave two corners on one point; a polygon without them
        self.polygon = [v for i, v in enumerate(polygon) if i == 0 or max(abs(v.p[k] - polygon[i - 1].p[k]) for k in range(3)) > 1e-6]
        if len(self.polygon) > 1 and max(abs(self.polygon[0].p[k] - self.polygon[-1].p[k]) for k in range(3)) <= 1e-6:
            self.polygon.pop()
        self.material = material
        texture = material.get("pbrMetallicRoughness", {}).get("baseColorTexture", {})
        self.texture = Path(texture.get("image", "")).stem or None
        self.alpha = material.get("alphaMode", "OPAQUE")
        self.clamp_v = texture.get("sampler", {}).get("wrapT") == CLAMP
        # Its facing and normal are its whole triangle's (a clipped sliver's own corners may be too close to tell)
        a, b, c = (v.p for v in corners)
        n = ((b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
             (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
             (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
        length = math.sqrt(sum(x * x for x in n)) or 1.0
        self.normal = tuple(x / length for x in n)
        ny = abs(self.normal[1])
        self.facing = "flat" if ny >= 0.9 else "slope" if ny >= 0.3 else "vertical"
        self.area = abs(_area_xz(self.polygon)) / (TILE * TILE)
        self.gradient = _uv_gradient(corners)

    def height_at(self, x, z):
        """The piece's height and uv over a point (model units), or None where it isn't over it."""
        if self.facing == "vertical":
            return None
        a = self.polygon[0]
        for b, c in zip(self.polygon[1:], self.polygon[2:]):
            w = _barycentric((a.p[0], a.p[2]), (b.p[0], b.p[2]), (c.p[0], c.p[2]), (x, z))
            if w is not None:
                y = w[0] * a.p[1] + w[1] * b.p[1] + w[2] * c.p[1]
                uv = tuple(w[0] * a.uv[k] + w[1] * b.uv[k] + w[2] * c.uv[k] for k in (0, 1))
                return y, uv
        return None


def _area_xz(polygon):
    return sum(a.p[0] * b.p[2] - b.p[0] * a.p[2] for a, b in zip(polygon, polygon[1:] + polygon[:1])) / 2


def _barycentric(a, b, c, p):
    d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(d) < 1e-9:
        return None
    l1 = ((b[1] - c[1]) * (p[0] - c[0]) + (c[0] - b[0]) * (p[1] - c[1])) / d
    l2 = ((c[1] - a[1]) * (p[0] - c[0]) + (a[0] - c[0]) * (p[1] - c[1])) / d
    l3 = 1 - l1 - l2
    return (l1, l2, l3) if min(l1, l2, l3) >= -1e-6 else None


def _uv_gradient(polygon):
    """How u and v change across the ground, per tile: ((du/dx, du/dz), (dv/dx, dv/dz)), or None for a piece seen
    edge-on from above."""
    a, b, c = polygon[:3]
    x1, z1 = b.p[0] - a.p[0], b.p[2] - a.p[2]
    x2, z2 = c.p[0] - a.p[0], c.p[2] - a.p[2]
    d = x1 * z2 - x2 * z1
    if abs(d) < 1e-6:
        return None
    out = []
    for k in (0, 1):
        q1, q2 = b.uv[k] - a.uv[k], c.uv[k] - a.uv[k]
        out.append(((q1 * z2 - q2 * z1) / d * TILE, (x1 * q2 - x2 * q1) / d * TILE))
    return tuple(out)


def _compass(dx, dz):
    """A direction on the ground as N, NE, E... (z grows south)."""
    if abs(dx) < 1e-9 and abs(dz) < 1e-9:
        return None
    angle = math.degrees(math.atan2(dx, -dz)) % 360
    return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][int((angle + 22.5) // 45) % 8]


# ---------------------------------------------------------------- The chunk


class Chunk:
    def __init__(self, model, folder, style=None, images_from=None):
        self.model = model
        self.folder = Path(folder)
        self.size = 32
        self.half = self.size * TILE / 2
        triangles, self.materials, _ = read_mesh(self.folder / "model.glb", images_from=images_from or self.folder)
        self.triangles = triangles
        self.style = style
        self.layers = []
        for n in range(4):
            path = self.folder / f"terrain_{n}.csv"
            if path.exists():
                self.layers.append({(int(r["x"]), int(r["z"])): r for r in csv.DictReader(path.open())})
        splits = self.folder / "terrain_0_splits.csv"
        self.splits = list(csv.DictReader(splits.open())) if splits.exists() else []
        doc, _ = read_glb(self.folder / "model.glb")
        self.props = [n for n in doc["nodes"] if n.get("name", "").startswith("bw2_prop_")]
        self.pieces = defaultdict(list)
        for number, (key, tri) in enumerate(triangles):
            xs, zs = [v.p[0] for v in tri], [v.p[2] for v in tri]
            for tx in range(max(0, math.floor((min(xs) + self.half) / TILE)), min(self.size, math.ceil((max(xs) + self.half) / TILE))):
                for tz in range(max(0, math.floor((min(zs) + self.half) / TILE)), min(self.size, math.ceil((max(zs) + self.half) / TILE))):
                    x0, z0 = tx * TILE - self.half, tz * TILE - self.half
                    poly = _clip(_clip(_clip(_clip(tri, 0, x0, False), 0, x0 + TILE, True), 2, z0, False), 2, z0 + TILE, True)
                    if len(poly) >= 3:
                        piece = Piece(number, poly, self.materials[key], tri)
                        if len(piece.polygon) >= 3:
                            self.pieces[(tx, tz)].append(piece)
        # Walls on a tile's edge are clipped into both tiles beside it, which is what a tile's walls should list
        self.facts = {}
        for name, function in CHUNK_FACTS:
            self.facts[name] = function(self)
        self.tiles = {}
        for tz in range(self.size):
            for tx in range(self.size):
                self.tiles[(tx, tz)] = Tile(self, tx, tz)
        for name, function in TILE_FACTS:
            for tile in self.tiles.values():
                tile.facts[name] = function(tile)

    def record(self):
        return {"model": self.model, "size": self.size, "chunk": self.facts,
                "tiles": [{"x": t.x, "z": t.z, **t.facts} for t in self.tiles.values()]}


class Tile:
    def __init__(self, chunk, x, z):
        self.chunk, self.x, self.z = chunk, x, z
        self.pieces = chunk.pieces.get((x, z), [])
        self.facts = {}

    def point(self, u, w):
        """A point of the tile (u, w from 0 to 1 across it) in the model's units."""
        return (self.x + u) * TILE - self.chunk.half, (self.z + w) * TILE - self.chunk.half

    def surfaces_at(self, u, w, opaque=False):
        """The pieces over a point of the tile, top first: (height, piece, uv)."""
        x, z = self.point(min(max(u, 0.001), 0.999), min(max(w, 0.001), 0.999))
        out = []
        for piece in self.pieces:
            if opaque and piece.alpha != "OPAQUE":
                continue
            hit = piece.height_at(x, z)
            if hit:
                out.append((hit[0], piece, hit[1]))
        return sorted(out, key=lambda h: -h[0])

    def neighbour(self, dx, dz):
        return self.chunk.tiles.get((self.x + dx, self.z + dz))


# ---------------------------------------------------------------- Facts of the chunk


@chunk_fact("textures")
def textures(chunk):
    """Each texture's role, learned from how the chunk uses it: wall (mostly vertical); decoration (blended: a
    season's overlay, a shadow); slope (mostly sloped: a cliff's or a bank's face, clamped or not); edge (flat, v
    clamped, mapped along a border, u running on past one repeat: a path's edge, the water's edge); decoration
    (otherwise see-through or stamped once: grass, trees, fences, the water's sparkles); structure (opaque and flat,
    nearly always over other ground, with open sides: a bridge's deck); ground
    (opaque, flat, planar: the terrains)."""
    stats = defaultdict(lambda: {"area": 0.0, "facing": Counter(), "alphas": Counter(), "clamp_v": False, "tiles": set(),
                                 "over_ground": 0})
    for (tx, tz), pieces in chunk.pieces.items():
        for p in pieces:
            s = stats[p.texture]
            s["area"] += p.area if p.facing != "vertical" else 0.0
            s["facing"][p.facing] += 1
            s["alphas"][p.alpha] += 1
            s["clamp_v"] = s["clamp_v"] or p.clamp_v
            s["tiles"].add((tx, tz))
    # A flat opaque texture with another flat opaque face under it at the tile's middle, on most of its tiles, and
    # open sides: where its tiles drop to a lower neighbour, no face stands in the drop (one sees under a bridge's
    # edge; a plateau over the same lower ground has a cliff down to it)
    tops = {}
    for (tx, tz), pieces in chunk.pieces.items():
        x, z = (tx + 0.5) * TILE - chunk.half, (tz + 0.5) * TILE - chunk.half
        hits = sorted(((p.height_at(x, z)[0], p) for p in pieces
                       if p.alpha == "OPAQUE" and p.facing == "flat" and p.height_at(x, z)), key=lambda h: h[0])
        if hits:
            tops[(tx, tz)] = (hits[-1][0], hits[-1][1].texture)
        if len(hits) >= 2 and hits[-1][0] - hits[0][0] > TILE / 4:
            stats[hits[-1][1].texture]["over_ground"] += 1
    drops = defaultdict(lambda: [0, 0])  # texture: [drops, walled]
    for (tx, tz), (y, texture) in tops.items():
        for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = tops.get((tx + dx, tz + dz))
            if not n or n[1] == texture or y - n[0] <= TILE / 4:
                continue
            drops[texture][0] += 1
            low, high = n[0] + 1, y - 1
            walled = any(p.facing != "flat" and p.texture != texture and max(v.p[1] for v in p.polygon) >= low
                         and min(v.p[1] for v in p.polygon) <= high
                         for t in ((tx, tz), (tx + dx, tz + dz)) for p in chunk.pieces.get(t, []))
            drops[texture][1] += walled
    # How far u runs across one triangle: a border's texture runs along it (a path's edge, the water's edge), a
    # stamp's covers its quad once (the water's sparkles)
    u_run = defaultdict(float)
    for key, tri in chunk.triangles:
        image = chunk.materials[key].get("pbrMetallicRoughness", {}).get("baseColorTexture", {}).get("image", "")
        us = [v.uv[0] for v in tri]
        u_run[Path(image).stem or None] = max(u_run[Path(image).stem or None], max(us) - min(us))
    out = {}
    for texture, s in stats.items():
        total = sum(s["facing"].values())
        # A texture drawn by more than one material (the sea, both blended and opaque) takes its most common alpha
        s["alpha"] = s["alphas"].most_common(1)[0][0]
        if s["facing"]["vertical"] > total / 2:
            role = "wall"
        elif s["alpha"] == "BLEND":
            role = "decoration"
        elif s["facing"]["slope"] > s["facing"]["flat"]:
            role = "slope"
        elif s["clamp_v"] and u_run[texture] > 1.05:
            role = "edge"
        elif s["alpha"] != "OPAQUE" or s["clamp_v"]:
            role = "decoration"
        elif s["over_ground"] > len(s["tiles"]) / 2 and drops[texture][1] < drops[texture][0] / 2:
            role = "structure"
        else:
            role = "ground"
        out[texture] = {"role": role, "alpha": s["alpha"], "tiles": len(s["tiles"]), "pieces": total}
    return out


# ---------------------------------------------------------------- Facts of each tile


@tile_fact("collision")
def collision(tile):
    """Each collision layer's tile type, shape, slope and offset, and layer 0's height at the tile's middle."""
    slopes, offsets = _tables()
    out = []
    for n, layer in enumerate(tile.chunk.layers):
        r = layer.get((tile.x, tile.z))
        if not r:
            continue
        entry = {"layer": n, "tile_type": int(r["tile_type"]), "shape": int(r["shape"]), "slope": int(r["slope"]),
                 "offset": int(r["offset"])}
        slope, offset = entry["slope"], entry["offset"]
        if entry["shape"] == 2 and n == 0 and offset < len(tile.chunk.splits):
            slope, offset = int(tile.chunk.splits[offset]["slope0"]), int(tile.chunk.splits[offset]["offset0"])
        nrm = slopes[slope] if slope < len(slopes) else (0, 1, 0)
        o = offsets[offset] if offset < len(offsets) else 0
        x, z = tile.point(0.5, 0.5)
        entry["height"] = round(-(o + nrm[0] * x + nrm[2] * z) / nrm[1], 2) if nrm[1] else None
        out.append(entry)
    return out


@tile_fact("surfaces")
def surfaces(tile):
    """Each texture over the tile: how much of the tile it covers seen from above, its height range, its facings,
    and how it's mapped: planar (u and v from x and z, with the tiles a repeat spans) or along a border (v changing
    across it: the direction v grows, and v at each side's middle)."""
    groups = defaultdict(list)
    for p in tile.pieces:
        groups[(p.texture, p.alpha)].append(p)
    out = []
    for (texture, alpha), pieces in groups.items():
        ys = [v.p[1] for p in pieces for v in p.polygon]
        entry = {"texture": texture, "alpha": alpha, "cover": round(sum(p.area for p in pieces if p.facing != "vertical"), 3),
                 "y": [round(min(ys), 2), round(max(ys), 2)], "facing": sorted({p.facing for p in pieces}),
                 "triangles": len({p.triangle for p in pieces})}
        flat = [p for p in pieces if p.gradient and p.facing != "vertical"]
        if flat:
            # Over all its pieces, weighted by their area (a corner's pieces turn)
            weight = sum(p.area for p in flat) or 1.0
            dux, duz, dvx, dvz = (sum(p.gradient[a][b] * p.area for p in flat) / weight for a, b in ((0, 0), (0, 1), (1, 0), (1, 1)))
            if pieces[0].clamp_v and math.hypot(dvx, dvz) > 1e-3:
                entry["mapping"] = {"kind": "border", "v_grows": _compass(dvx, dvz)}
                sides = {}
                for side, ((u0, w0), (u1, w1)) in SIDES.items():
                    hits = [h for h in tile.surfaces_at((u0 + u1) / 2 + (0.5 - (u0 + u1) / 2) * 0.04,
                                                         (w0 + w1) / 2 + (0.5 - (w0 + w1) / 2) * 0.04)
                            if h[1].texture == texture]
                    if hits:
                        sides[side] = round(hits[0][2][1], 2)
                entry["mapping"]["v_at_sides"] = sides
            else:
                su, sv = math.hypot(dux, duz), math.hypot(dvx, dvz)
                entry["mapping"] = {"kind": "planar", "repeat": [round(1 / su, 2) if su > 1e-6 else None,
                                                                 round(1 / sv, 2) if sv > 1e-6 else None]}
        out.append(entry)
    return sorted(out, key=lambda e: -e["cover"])


@tile_fact("levels")
def levels(tile):
    """Every surface over the tile's middle, top first: its height, texture, alpha and facing (the ground, a
    bridge's deck over a bed, the water's edge over its bed)."""
    out = []
    for y, piece, _ in tile.surfaces_at(0.5, 0.5):
        if out and abs(out[-1]["y"] - y) < 0.5 and out[-1]["texture"] == piece.texture:
            continue
        out.append({"y": round(y, 2), "texture": piece.texture, "alpha": piece.alpha, "facing": piece.facing})
    return out


@tile_fact("sides")
def sides(tile):
    """Each side's cross-section: at eight points along it (just inside the tile), the topmost opaque surface's
    height, texture and v. Two tiles join cleanly where their shared side's sections agree."""
    out = {}
    for side, ((u0, w0), (u1, w1)) in SIDES.items():
        samples = []
        for i in range(SAMPLES):
            t = (i + 0.5) / SAMPLES
            u, w = u0 + (u1 - u0) * t, w0 + (w1 - w0) * t
            u, w = u + (0.5 - u) * 0.04, w + (0.5 - w) * 0.04
            hits = tile.surfaces_at(u, w, opaque=True)
            samples.append([round(hits[0][0], 2), hits[0][1].texture, round(hits[0][2][1], 2)] if hits else None)
        out[side] = samples
    return out


@tile_fact("walls")
def walls(tile):
    """Vertical faces over the tile: the side they stand on (or inside, when within neither side), their top and
    bottom, texture."""
    out = []
    for p in tile.pieces:
        if p.facing != "vertical":
            continue
        us = [((v.p[0] + tile.chunk.half) / TILE - tile.x) for v in p.polygon]
        ws = [((v.p[2] + tile.chunk.half) / TILE - tile.z) for v in p.polygon]
        side = ("W" if max(us) < 0.15 else "E" if min(us) > 0.85 else "N" if max(ws) < 0.15 else "S" if min(ws) > 0.85
                else "inside")
        ys = [v.p[1] for v in p.polygon]
        out.append({"side": side, "top": round(max(ys), 2), "bottom": round(min(ys), 2), "texture": p.texture})
    merged = {}
    for wall in out:
        key = (wall["side"], wall["texture"])
        if key in merged:
            merged[key]["top"] = max(merged[key]["top"], wall["top"])
            merged[key]["bottom"] = min(merged[key]["bottom"], wall["bottom"])
        else:
            merged[key] = wall
    return list(merged.values())


@tile_fact("ground")
def ground(tile):
    """The ground, where one walks: at the tile's middle and four points round it, the drawn surface at the first
    collision layer's height (within half a tile; a bridge's deck, a town's raised road), else (and on blocked tiles)
    the topmost opaque surface that isn't a wall's or a structure's; the texture most of them have, at their middle height, how many of
    the five found ground and how many agree, and what lies under a structure's deck."""
    roles = tile.chunk.facts["textures"]
    first = next((c for c in tile.facts["collision"] if c["layer"] == 0 and c["height"] is not None), None)
    height = first["height"] if first else None
    # A blocked tile's collision height says nothing of what's seen (a desert cliff's cap stands over sand at the
    # collision's height): it's the top that counts
    blocked = bool(first and (first["tile_type"] >> 16) & 1)
    found, under = [], []
    for u, w in ((0.5, 0.5), (0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75)):
        hits = [h for h in tile.surfaces_at(u, w, opaque=True) if roles.get(h[1].texture, {}).get("role") != "wall"]
        at = [h for h in hits if height is not None and abs(h[0] - height) <= TILE / 2] if height is not None else []
        if not at and height is not None and not blocked:
            # Water drawn see-through at the collision's height (a canal, the sea), when nothing opaque is there
            at = [h for h in tile.surfaces_at(u, w) if abs(h[0] - height) <= TILE / 2
                  and roles.get(h[1].texture, {}).get("role") != "wall"]
            if at:
                hits = at
        if blocked:
            pick = hits[0] if hits else None
        else:
            pick = min(at, key=lambda h: abs(h[0] - height)) if at else next(
                (h for h in hits if roles.get(h[1].texture, {}).get("role") != "structure"), None)
        if pick is None:
            continue
        found.append((pick[1].texture, pick[0], pick[2][1]))
        if roles.get(pick[1].texture, {}).get("role") == "structure":
            below = next((h for h in hits if h[0] < pick[0] - TILE / 4 and roles.get(h[1].texture, {}).get("role") != "structure"), None)
            if below:
                under.append(below[1].texture)
    if not found:
        return None
    texture, agree = Counter(t for t, _, _ in found).most_common(1)[0]
    ys = sorted(y for t, y, _ in found if t == texture)
    v = next(v for t, _, v in found if t == texture)
    out = {"y": round(ys[len(ys) // 2], 2), "texture": texture, "role": roles.get(texture, {}).get("role"),
           "v": round(v, 2), "samples": len(found), "agree": agree}
    if under:
        out["under"] = Counter(under).most_common(1)[0][0]
    return out


@tile_fact("standing")
def standing(tile):
    """What stands on the tile: structures (a bridge's deck) and decorations (trees, fences, grass), each texture
    with how high above the ground it reaches and how much of the tile it covers."""
    roles = tile.chunk.facts["textures"]
    base = (tile.facts["ground"] or {}).get("y", 0.0)
    first = next((c for c in tile.facts["collision"] if c["layer"] == 0), None)
    passable = bool(first) and not (first["tile_type"] >> 16) & 1
    out = defaultdict(lambda: {"cover": 0.0, "top": -1e9, "bottom": 1e9})
    for p in tile.pieces:
        role = roles.get(p.texture, {}).get("role")
        # Anything opaque (not a wall) wholly over the ground of a tile one passes (not blocked) spans it: a pipe over
        # a canal one surfs under
        if role not in ("structure", "decoration", "wall") and p.alpha == "OPAQUE" and tile.facts["ground"] and passable \
                and min(v.p[1] for v in p.polygon) > base + TILE / 2:
            role = "structure"
        if role not in ("structure", "decoration"):
            continue
        e = out[(role, p.texture)]
        e["cover"] += p.area if p.facing != "vertical" else 0.0
        ys = [v.p[1] - base for v in p.polygon]
        e["top"], e["bottom"] = max(e["top"], max(ys)), min(e["bottom"], min(ys))
    return [{"kind": role, "texture": texture, "cover": round(e["cover"], 3), "above_ground": [round(e["bottom"], 2), round(e["top"], 2)]}
            for (role, texture), e in out.items()]


@tile_fact("props")
def props(tile):
    """The chunk's props (buildings, signs: nodes of their own) whose origin is on the tile, by their id."""
    out = []
    for node in tile.chunk.props:
        t = node.get("translation", [0, 0, 0])
        if math.floor((t[0] + tile.chunk.half) / TILE) == tile.x and math.floor((t[2] + tile.chunk.half) / TILE) == tile.z:
            out.append(node["name"])
    return out


@tile_fact("budget")
def budget(tile):
    """The model's triangles that reach over the tile."""
    return {"triangles": len({p.triangle for p in tile.pieces})}


@tile_fact("reading")
def reading(tile):
    """What the tile is, in the painting's terms: its terrain (the style's, by its ground's texture, else the
    texture), whether it's an edge and which way its outside lies (where the edge texture's v falls toward 0),
    its levels (ground, water, structure), and how sure the reading is."""
    roles = tile.chunk.facts["textures"]
    g = tile.facts["ground"]
    out = {"terrain": None, "edge": None, "bend": None, "slope": None, "structure": False, "deck": None, "under": None,
           "decoration": False, "confidence": "low", "known": False}
    by_texture = {}
    style = tile.chunk.style
    if style:
        for t in style["terrains"]:
            if not t.get("edge_of"):
                by_texture.setdefault(t["ground"]["texture"], t["key"])
        for e in style.get("edges", []):
            for face in e["faces"]:
                by_texture.setdefault(face["texture"], e["to"])
    if g:
        out["terrain"] = by_texture.get(g["texture"], g["texture"]) if style else g["texture"]
        if g.get("role") == "structure":
            # A deck: the tile is the deck's, over what's under it (a bridge over the river)
            out["deck"] = g["texture"]
            out["under"] = by_texture.get(g.get("under"), g.get("under")) if style else g.get("under")
        # How sure: how many of the ground's five points agree; whether the style knows it is apart from that
        agree = g.get("agree", g.get("samples", 0))
        out["confidence"] = "high" if agree >= 4 else "medium" if agree >= 3 else "low"
        out["known"] = (not style) or g["texture"] in by_texture
    elif style and tile.facts["collision"]:
        # No ground drawn (under a forest's canopy): the terrain with its tile type, unsure
        tile_type = tile.facts["collision"][0]["tile_type"]
        out["terrain"] = next((t["key"] for t in style["terrains"] if not t.get("edge_of")
                               and tile_type in (t["tile_type"], *t.get("also_tile_types", []))), None)
    # An edge texture's share of the tile, and the way its v grows (over all its pieces)
    compass_back = {"N": "S", "NE": "SW", "E": "W", "SE": "NW", "S": "N", "SW": "NE", "W": "E", "NW": "SE"}
    # Edges at or near the ground count, not ones under a cliff's cap (a desert's sand edge at its foot)
    near = (g["y"] - TILE / 2) if g else -1e9
    edge_surface = next((x for x in tile.facts["surfaces"] if roles.get(x["texture"], {}).get("role") == "edge"
                         and x.get("mapping", {}).get("kind") == "border" and x["y"][1] >= near), None)
    # Slopes at or near the ground count, not ones far under it (a staircase below a cliff's top)
    floor = (g["y"] - TILE / 2) if g else -1e9
    slope_cover = sum(x["cover"] for x in tile.facts["surfaces"]
                      if roles.get(x["texture"], {}).get("role") == "slope" and x["y"][1] >= floor)
    if edge_surface:
        grows = edge_surface["mapping"]["v_grows"]
        outside = compass_back.get(grows)
        family = by_texture.get(edge_surface["texture"]) if style else None
        ground_family = out["terrain"]
        # A bend: an edge reaching a little into a plain tile of its own terrain (a path's middle at a point)
        if edge_surface["cover"] < 0.5 and family is not None and family == ground_family and not slope_cover:
            out["bend"] = {"texture": edge_surface["texture"], "from": outside, "cover": edge_surface["cover"]}
        elif edge_surface["cover"] >= 0.5 or slope_cover:
            out["edge"] = {"texture": edge_surface["texture"], "outside": outside, "of": family, "cover": edge_surface["cover"]}
            if family:
                out["terrain"] = family
    # A cliff or a slope: sloped faces over most of the tile, or its ground sloped; downhill is where their normals lean
    if (slope_cover >= 0.5 or (g and g.get("role") == "slope")) and not out["edge"]:
        nx = nz = 0.0
        for piece in tile.pieces:
            if roles.get(piece.texture, {}).get("role") == "slope" and piece.facing == "slope" \
                    and max(v.p[1] for v in piece.polygon) >= floor:
                sign = 1 if piece.normal[1] > 0 else -1
                nx, nz = nx + sign * piece.normal[0] * piece.area, nz + sign * piece.normal[2] * piece.area
        out["slope"] = {"texture": max((x for x in tile.facts["surfaces"] if roles.get(x["texture"], {}).get("role") == "slope"
                                        and x["y"][1] >= floor),
                                       key=lambda x: x["cover"])["texture"] if slope_cover else g["texture"],
                        "down": _compass(nx, nz), "cover": round(slope_cover, 3)}
        out["terrain"] = "cliff"
        out["confidence"] = "high"
    # A terrain drawn with layers over its ground (tall grass's blades) is the one whose layers stand on the tile
    if style and not out["edge"]:
        standing_textures = {x["texture"] for x in tile.facts["standing"]}
        for t in style["terrains"]:
            if t.get("layers") and standing_textures & {layer["texture"] for layer in t["layers"]}:
                out["terrain"] = t["key"]
                break
    out["empty"] = not tile.pieces
    out["structure"] = bool(out.get("deck")) or any(x["kind"] == "structure" for x in tile.facts["standing"])
    out["decoration"] = any(x["kind"] == "decoration" for x in tile.facts["standing"])
    levels_ = [lv for lv in tile.facts["levels"] if lv["alpha"] == "OPAQUE"]
    out["levels"] = len({round(lv["y"] / 4) for lv in levels_})
    return out


@tile_fact("filled")
def filled(tile):
    """A tile with no ground drawn (under a fence or a forest's canopy) is most likely what the tiles round it are:
    its reading takes the terrain most of its four neighbours with ground have, at its own collision height. Returns
    where the reading came from: the model, the neighbours, or the tile type."""
    r = tile.facts["reading"]
    if tile.facts["ground"] or r["slope"]:
        return "model"
    height = (tile.facts["collision"] or [{}])[0].get("height")
    votes = Counter()
    for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        n = tile.neighbour(dx, dz)
        if n and n.facts["ground"] and n.facts["reading"]["terrain"] and not n.facts["reading"]["edge"] \
                and (height is None or abs(n.facts["ground"]["y"] - height) < TILE / 2):
            votes[n.facts["reading"]["terrain"]] += 1
    if votes:
        r["terrain"] = votes.most_common(1)[0][0]
        r["confidence"] = "medium"
        return "neighbours"
    return "tile type"


@tile_fact("layers")
def layers(tile):
    """Each collision layer's surface: the drawn surface (not a wall) nearest the layer's height at the tile's
    middle, within half a tile, its texture and terrain. A town on two levels (walkways over a canal) has a reading
    per level."""
    style = tile.chunk.style
    by_texture = {}
    if style:
        for t in style["terrains"]:
            if not t.get("edge_of"):
                by_texture.setdefault(t["ground"]["texture"], t["key"])
    roles = tile.chunk.facts["textures"]
    out = []
    for c in tile.facts["collision"]:
        if c["height"] is None:
            continue
        best = None
        for y, piece, _ in tile.surfaces_at(0.5, 0.5):
            if roles.get(piece.texture, {}).get("role") == "wall":
                continue
            if abs(y - c["height"]) <= TILE / 2 and (best is None or abs(y - c["height"]) < abs(best[0] - c["height"])):
                best = (y, piece.texture)
        out.append({"layer": c["layer"], "height": c["height"], "tile_type": c["tile_type"],
                    "y": round(best[0], 2) if best else None, "texture": best[1] if best else None,
                    "terrain": (by_texture.get(best[1], best[1]) if style else best[1]) if best else None})
    return out


@tile_fact("open_sides")
def open_sides(tile):
    """Sides where the ground drops to the neighbour's by more than a quarter tile with no wall closing the drop on
    either tile: holes the game leaves where the camera never looks (behind a forest), which the round trip and
    the atlas skip rather than copy."""
    out = []
    g = tile.facts["ground"]
    if not g:
        return out
    for side, (dx, dz), opposite in (("N", (0, -1), "S"), ("E", (1, 0), "W"), ("S", (0, 1), "N"), ("W", (-1, 0), "E")):
        n = tile.neighbour(dx, dz)
        if not n or not n.facts.get("ground"):
            continue
        if g["y"] - n.facts["ground"]["y"] > TILE / 4:
            walled = any(w["side"] == side for w in tile.facts["walls"]) or any(w["side"] == opposite for w in n.facts["walls"])
            slopes = any(x["facing"] != ["flat"] and "slope" in x["facing"] for x in tile.facts["surfaces"] + n.facts["surfaces"])
            if not walled and not slopes:
                out.append(side)
    return out


@tile_fact("neighbourhood")
def neighbourhood(tile):
    """The readings round the tile, from the north-west row by row (the tile itself in the middle), as one signature
    to look cases up by: each its terrain, and its edge's outside where it's an edge."""
    out = []
    for dz in (-1, 0, 1):
        for dx in (-1, 0, 1):
            n = tile.neighbour(dx, dz)
            if n is None:
                out.append("#")
                continue
            r = n.facts.get("reading") or reading(n)
            n.facts.setdefault("reading", r)
            out.append(f"{r['terrain']}" + (f"/{r['edge']['outside']}" if r["edge"] else ""))
    return out


# ---------------------------------------------------------------- Command line


def load_chunk(model, rev=None, style_name=None):
    style = None
    if style_name:
        style = json.loads((STYLES / f"{style_name}.json").read_text())
    folder = MODELS / model
    if rev is None:
        return Chunk(model, folder, style)
    temp = Path(tempfile.mkdtemp(prefix="map_reader_"))
    for name in ("model.glb", "terrain_0.csv", "terrain_1.csv", "terrain_0_splits.csv"):
        shown = subprocess.run(["git", "show", f"{rev}:res/field/maps/models/{model}/{name}"], cwd=ROOT, capture_output=True)
        if shown.returncode == 0:
            (temp / name).write_bytes(shown.stdout)
    return Chunk(model, temp, style, images_from=folder)




def show(chunk, fact):
    """A map of the chunk's tiles, a letter each: its reading's terrain (or the fact named), and a legend."""
    legend = {}
    rows = []
    for tz in range(chunk.size):
        row = ""
        for tx in range(chunk.size):
            r = chunk.tiles[(tx, tz)].facts
            value = r["reading"]["terrain"] if fact == "terrain" else json.dumps(r.get(fact))
            if fact == "terrain" and r["reading"]["edge"]:
                value = f"{value}, edge"
            if value not in legend:
                legend[value] = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"[len(legend) % 62]
            row += legend[value]
        rows.append(row)
    return "\n".join(rows) + "\n\n" + "\n".join(f"{v} {k}" for k, v in legend.items())


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("read", "show"):
        c = commands.add_parser(name)
        c.add_argument("model")
        c.add_argument("--style")
        c.add_argument("--rev")
        if name == "read":
            c.add_argument("--out")
        else:
            c.add_argument("--fact", default="terrain")
    args = parser.parse_args()
    chunk = load_chunk(args.model, args.rev, args.style)
    if args.command == "read":
        text = json.dumps(chunk.record(), separators=(",", ":"))
        if args.out:
            Path(args.out).write_text(text)
        else:
            sys.stdout.write(text)
    else:
        print(show(chunk, args.fact))


if __name__ == "__main__":
    main()
