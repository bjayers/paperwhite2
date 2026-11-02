#!/usr/bin/env python3
"""Paper White 2's map maker: a map chunk generated from a painted grid (docs/paperwhite2/design/map-editor.md,
Painting maps).

    map_maker.py start MODEL STYLE [--fill KEY] [--flat HEIGHT]   # a project of a chunk, and a copy of the chunk
    map_maker.py generate PROJECT        # write the project's chunk's model.glb and collision
    map_maker.py stop MODEL              # the chunk as it was before painting, and the project gone

A project, res/paperwhite2/map_projects/<model>.json (map_project.schema.json), names the chunk it makes, its style,
each tile's terrain (a letter of the style's terrains, a string a row) and height (in half tiles), and the objects of
the library placed on it ([object, x, z]). A style, res/paperwhite2/map_styles/<style>.json (map_style.schema.json),
gives each terrain its look and tile type, from a vanilla area's texture set. The terrain "." keeps the chunk as it was
on that tile: its faces there (the painted rectangles cut out of them) and its collision, from the copy of the chunk that start
makes (res/paperwhite2/map_projects/<model>.base/), so a painting can change part of an existing map, a pond in a
field. start fills a project with "." (or a terrain) at the chunk's collision heights (or one height); stop puts the
chunk's files back from the copy and removes the project.

generate writes:
- the ground: each terrain's tiles at a height merged into rectangles (as large as the texture's reach in Nitro's
  coordinates allows), textured from above (u, v = x, z over the texture's repeat in tiles), so textures run on across
  tiles as the game's do; a rectangle's edges are split where another's corner lies on them, so no corner of one
  meets the middle of another's edge (a T-junction, which the DS draws with a gap);
- the edges between terrains (map_edges.py): a style's profile along a terrain's border, inside its outer tiles (a
  path's grass edge, a riverbank's ridge and bed), with the terrain's own ground inside it;
- the terrains' layers (tall grass's blades, above the ground);
- walls where neighbouring tiles' heights differ, facing the lower: the lower tile's terrain's wall (a riverbank),
  else the higher's, else the style's (a cliff), u along the wall, v down it;
- the objects, each standing on the ground of its north-west tile;
- the collision: each tile flat at its height (the game's height table's nearest), its terrain's tile type, and the
  objects' footprints' types over it; the chunk's other layer, if it has one, stays as it is.
The model is written whole (data.json "written", the style's texture set); the chunk's props stay.
"""
import argparse
import csv
import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools/paperwhite2"))
from tools.data.datajson import DataError, dumps, load, load_schema  # noqa: E402
from glb_mesh import TEXEL_REACH, Vertex, png_size, read_mesh, write_mesh  # noqa: E402
from map_model_data import read_glb  # noqa: E402
import map_edges  # noqa: E402

MODELS = ROOT / "res/field/maps/models"
TEXTURES = ROOT / "res/field/maps/textures"
STYLES = ROOT / "res/paperwhite2/map_styles"
OBJECTS = ROOT / "res/paperwhite2/map_objects"
PROJECTS = ROOT / "res/paperwhite2/map_projects"
TILE = 16
HALF_TILE = 8
KEEP = "."
BASE_FILES = ("model.glb", "data.json", "terrain_0.csv", "terrain_0_splits.csv")
# The copy's name of each file: data.json is kept as data.json.copy, which isn't data of res/ (its $schema, relative to
# the chunk's folder, doesn't hold beside the painting)
BASE_NAMES = {"data.json": "data.json.copy"}
REPEAT, CLAMP = 10497, 33071
UP = (0.0, 1.0, 0.0)
EPS = 1e-6


def _tables():
    """The game's slope normals (x, y, z, z negated as the game reads it) and plane offsets, in units
    (src/ov036/field_map_chunk_height.c)."""
    text = (ROOT / "src/ov036/field_map_chunk_height.c").read_text()

    def numbers(name):
        start = text.index(name)
        body = text[text.index("{", start) + 1:text.index("};", start)]
        return [int(v, 0) for v in re.findall(r"-?0x[0-9a-fA-F]+|-?\d+", body)]

    raw = numbers("MAP_HEIGHT_SLOPE_TABLE[]")
    slopes = [(raw[i] / 4096, raw[i + 1] / 4096, -raw[i + 2] / 4096) for i in range(0, len(raw) - 2, 3)]
    return slopes, [o / 4096 for o in numbers("MAP_HEIGHT_OFFSET_TABLE[]")]


def height_tables():
    """The game's flat-tile heights: the height of each offset for slope 0."""
    slopes, offsets = _tables()
    return [-o / slopes[0][1] for o in offsets]


def ground_heights(folder, size, images_from=None):
    """Each tile's ground height as a chunk's model draws it: the highest opaque, flat-enough face over the tile's middle
    (ground, ledges, bridges; not leaves, which are see-through, nor walls). Where the model has none there (a hole),
    the collision's height. The collision can't be used on its own, since a map's collision is sometimes raised to
    stand a bird in a tree."""
    collision = collision_heights(folder, size)
    best = ground_faces(folder, size, images_from)
    return {xz: best[xz][0] if xz in best else h for xz, h in collision.items()}


def ground_faces(folder, size, images_from=None):
    """Each tile's ground as ground_heights finds it: (height, the texture it's drawn with, without .png), for the
    tiles the model has ground over."""
    triangles, materials, _ = read_mesh(folder / "model.glb", images_from=images_from)
    half = size * TILE / 2
    best = {}
    for key, tri in triangles:
        if materials[key].get("alphaMode") in ("MASK", "BLEND"):
            continue
        a, b, c = (v.p for v in tri)
        n = ((b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
             (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
             (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
        length = math.sqrt(sum(x * x for x in n)) or 1
        if abs(n[1]) / length < 0.7:
            continue
        xs, zs = [p[0] for p in (a, b, c)], [p[2] for p in (a, b, c)]
        for x in range(max(0, math.floor((min(xs) + half) / TILE)), min(size, math.ceil((max(xs) + half) / TILE))):
            for z in range(max(0, math.floor((min(zs) + half) / TILE)), min(size, math.ceil((max(zs) + half) / TILE))):
                px, pz = x * TILE + TILE / 2 - half, z * TILE + TILE / 2 - half
                d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2])
                if abs(d) < 1e-9:
                    continue
                l1 = ((b[2] - c[2]) * (px - c[0]) + (c[0] - b[0]) * (pz - c[2])) / d
                l2 = ((c[2] - a[2]) * (px - c[0]) + (a[0] - c[0]) * (pz - c[2])) / d
                if min(l1, l2, 1 - l1 - l2) < -1e-6:
                    continue
                y = l1 * a[1] + l2 * b[1] + (1 - l1 - l2) * c[1]
                if (x, z) not in best or y > best[(x, z)][0]:
                    image = materials[key].get("pbrMetallicRoughness", {}).get("baseColorTexture", {}).get("image", "")
                    best[(x, z)] = (y, Path(image).stem)
    return best


def collision_heights(folder, size):
    """Each tile's height at its middle, as a chunk's first collision layer gives it (a split tile's first plane)."""
    slopes, offsets = _tables()
    rows = list(csv.DictReader((folder / "terrain_0.csv").open()))
    splits = list(csv.DictReader((folder / "terrain_0_splits.csv").open())) if (folder / "terrain_0_splits.csv").exists() else []
    half = size * TILE / 2
    out = {}
    for r in rows:
        x, z, shape = int(r["x"]), int(r["z"]), int(r["shape"])
        slope, offset = int(r["slope"]), int(r["offset"])
        if shape == 2 and offset < len(splits):
            slope, offset = int(splits[offset]["slope0"]), int(splits[offset]["offset0"])
        n = slopes[slope] if slope < len(slopes) else (0, 1, 0)
        o = offsets[offset] if offset < len(offsets) else 0
        px, pz = x * TILE + TILE / 2 - half, z * TILE + TILE / 2 - half
        out[(x, z)] = -(o + n[0] * px + n[2] * pz) / n[1] if n[1] else 0.0
    return out


def flat_offset(heights, y):
    best = min(range(len(heights)), key=lambda i: abs(heights[i] - y))
    if abs(heights[best] - y) > 0.25:
        raise DataError(f"the game's height table has no flat tile at {y / TILE} tiles")
    return best


class Materials:
    """The generated model's materials, by key, as glb_mesh holds them."""

    def __init__(self, texture_set):
        self.folder = texture_set.removeprefix("MAP_TEXTURE_SET_").lower()
        self.by_key = {}

    def get(self, texture, alpha=None, clamp_t=False, name=None):
        image = TEXTURES / self.folder / f"{texture}.png"
        if not image.exists():
            raise DataError(f"the texture set {self.folder} has no {texture}")
        material = {"name": (name or texture).replace(".", "_")[:16], "extensions": {"KHR_materials_unlit": {}},
                    "pbrMetallicRoughness": {"metallicFactor": 0, "baseColorTexture": {
                        "image": image.relative_to(ROOT).as_posix(),
                        "sampler": {"wrapS": REPEAT, "wrapT": CLAMP if clamp_t else REPEAT, "magFilter": 9728, "minFilter": 9728}}}}
        if alpha:
            material["alphaMode"] = alpha
        return self.add(material)

    def add(self, material):
        """A material's key, once; its name made unique among the others' (Nitro finds materials by name)."""
        key = json.dumps(material, sort_keys=True)
        if key in self.by_key:
            return key
        names = {m["name"] for m in self.by_key.values()}
        stem = material.get("name", "material")[:16]
        name, n = stem, 2
        while name in names:
            name = f"{stem[:16 - len(str(n)) - 1]}_{n}"
            n += 1
        self.by_key[key] = {**material, "name": name}
        return key

    def reach(self, key):
        """How many repeats of a material's texture Nitro's coordinates hold."""
        width, height = png_size(ROOT / self.by_key[key]["pbrMetallicRoughness"]["baseColorTexture"]["image"])
        return TEXEL_REACH / max(width, height) - 1


def rectangles(cells, size, limit):
    """Greedy rectangles of equal cells: cells maps (x, z) to a value; limit(value) is the most tiles a side may span."""
    done = set()
    out = []
    for z in range(size):
        for x in range(size):
            if (x, z) in done or (x, z) not in cells:
                continue
            value = cells[(x, z)]
            most = max(1, int(limit(value)))
            w = 1
            while w < most and (x + w, z) not in done and cells.get((x + w, z)) == value:
                w += 1
            d = 1
            while d < most and all((x + i, z + d) not in done and cells.get((x + i, z + d)) == value for i in range(w)):
                d += 1
            for i in range(w):
                for j in range(d):
                    done.add((x + i, z + j))
            out.append((value, x, z, w, d))
    return out


def ring(corners, splits):
    """A convex polygon's outline with the points of splits that lie inside its edges added in order."""
    out = []
    for i, a in enumerate(corners):
        b = corners[(i + 1) % len(corners)]
        out.append(a)
        inside = []
        for p in splits:
            if p in (a, b):
                continue
            ab = [b[k] - a[k] for k in range(3)]
            ap = [p[k] - a[k] for k in range(3)]
            length = sum(c * c for c in ab)
            t = sum(ab[k] * ap[k] for k in range(3)) / length
            if 1e-6 < t < 1 - 1e-6 and sum((ap[k] - t * ab[k]) ** 2 for k in range(3)) < 1e-6:
                inside.append((t, p))
        out += [p for _, p in sorted(inside)]
    return out


def fan(outline, uv, normal):
    """A polygon as triangles: two for a plain quad, else a fan around its middle (its outline has split points, where a
    fan from a corner would make triangles with no area)."""
    vertex = lambda p: Vertex(p, uv(p), (1.0, 1.0, 1.0), normal)  # noqa: E731
    if len(outline) == 4:
        a, b, c, d = (vertex(p) for p in outline)
        return [[a, b, c], [a, c, d]]
    middle = tuple(sum(p[k] for p in outline) / len(outline) for k in range(3))
    m = vertex(middle)
    return [[m, vertex(outline[i]), vertex(outline[(i + 1) % len(outline)])] for i in range(len(outline))]


def generate(project_path):
    project_path = Path(project_path)
    project = load(project_path, load_schema(PROJECTS / "map_project.schema.json"))
    style = load(STYLES / f"{project['style']}.json", load_schema(STYLES / "map_style.schema.json"))
    folder = MODELS / project["model"]
    size = project.get("size", 32)
    half = size * TILE / 2
    terrains = {t["key"]: t for t in style["terrains"]}
    base = PROJECTS / f"{project['model']}.base"
    keeps = any(KEEP in row for row in project["terrain"])
    if keeps and not (base / "model.glb").exists():
        raise DataError(f"{project_path}: tiles keep the chunk, but its copy ({base.relative_to(ROOT)}) is gone (discarded or "
                        "deleted): Stop painting removes the painting and leaves the chunk as it is, then Start painting again")
    kept_heights = ground_heights(base, size, images_from=folder) if keeps else {}
    grid = {}
    for z, row in enumerate(project["terrain"]):
        for x, key in enumerate(row):
            if key != KEEP and key not in terrains:
                raise DataError(f"{project_path}: no terrain {key!r} in the style")
            # A kept tile stands at the chunk's own height, which walls to painted tiles go down or up to
            grid[(x, z)] = (key, round(kept_heights.get((x, z), 0)) if key == KEEP else project["height"][z][x] * HALF_TILE)
    if len(grid) != size * size:
        raise DataError(f"{project_path}: the grid isn't {size} by {size}")
    materials = Materials(style["texture_set"])
    world = lambda x, z: (x * TILE - half, z * TILE - half)  # noqa: E731
    polygons = []

    # The edges between terrains (map_edges.py): each terrain with one, at each height, has its border's band, which
    # takes its outer tiles; the ground inside it is the terrain's own, at the band's inside line's lift
    ground_keys = {k: materials.get(t["ground"]["texture"]) for k, t in terrains.items()}
    painted = {xz: v for xz, v in grid.items() if v[0] != KEEP}
    kept_types = {}
    if keeps:
        kept_types = {(int(r["x"]), int(r["z"])): int(r["tile_type"]) for r in csv.DictReader((base / "terrain_0.csv").open())}
    by_type = {}
    for k, t in terrains.items():
        for tile_type in [t["tile_type"], *t.get("also_tile_types", [])]:
            by_type.setdefault(tile_type, k)

    # A kept tile's terrain: the one whose texture its ground is drawn with (a terrain's ground, or an edge's face,
    # which is its terrain's), else the one with its tile type
    by_texture = {}
    for k, t in terrains.items():
        by_texture.setdefault(t["ground"]["texture"], k)
    edge_outside = {}
    for e in style.get("edges", []):
        for face in e["faces"]:
            by_texture.setdefault(face["texture"], e["to"])
            if e.get("from") and face["texture"] not in {t["ground"]["texture"] for t in terrains.values()}:
                edge_outside.setdefault(face["texture"], e["from"][0])
    kept_textures = {xz: tex for xz, (_, tex) in ground_faces(base, size, images_from=folder).items()} if keeps else {}

    def terrain_of(xz):
        # A tile's terrain and height
        v = grid.get(xz)
        if v is None:
            return None
        if v[0] != KEEP:
            return v
        # By its ground's texture, else by its tile type
        return (by_texture.get(kept_textures.get(xz)) or by_type.get(kept_types.get(xz)), v[1])

    def unsure(xz):
        # A kept tile whose ground is drawn with a texture no terrain has (a bridge's deck, whose tile type is a path's)
        v = grid.get(xz)
        return v is not None and v[0] == KEEP and xz in kept_textures and kept_textures[xz] not in by_texture

    # Edge terrains (a path's edge, a riverbank) are painted where a border is wanted: each belongs to a family (the
    # path, the water), whose tiles and edge tiles make one region; the border is drawn in the edge tiles only, against
    # what lies outside them, which nothing here changes
    family = {k: t.get("edge_of", k) for k, t in terrains.items()}
    wall_grid = grid

    def joined(a, b):
        # No wall between a painted tile and a kept one of its family (painted water against the chunk's own river,
        # whose ground is its bed): the band, or the lack of one, joins them
        ta, tb = grid[a], grid.get(b)
        if tb is None or (ta[0] == KEEP) == (tb[0] == KEEP):
            return False
        pa, pb = terrain_of(a), terrain_of(b)
        return pa[0] is not None and pb[0] is not None and family.get(pa[0], pa[0]) == family.get(pb[0], pb[0])

    to_world = lambda p, h: (p[0] * TILE - half, h + p[1] * TILE, p[2] * TILE - half)  # noqa: E731
    corners = defaultdict(set)
    ground = dict(painted)
    pieces = []
    bands = []
    regions = defaultdict(set)
    for xz, v in painted.items():
        regions[(family[v[0]], v[1])].add(xz)
    for (key, h), tiles in sorted(regions.items()):
        edge = next((e for e in style.get("edges", []) if e["to"] == key), None)
        if edge is None:
            continue
        froms = edge.get("from")

        def banded(e, key=key, h=h, froms=froms):
            # From an edge tile of the family to a terrain the edge draws against (any other, when it names none, but
            # not a tile it's unsure of: a bridge spans the water rather than banks it)
            if painted[e[3]][0] == key:
                return False
            other = terrain_of(e[4])
            if other is None or other[0] is None or family.get(other[0], other[0]) == key:
                return False
            if froms is None and unsure(e[4]):
                return False
            return froms is None or (other[0] in froms and other[1] == h)
        result = map_edges.band(tiles, edge, banded, edge.get("points", False),
                                square=lambda t: terrains[painted[t][0]].get("square", False))
        inner_y = h + edge["lines"][edge.get("inner", len(edge["lines"]) - 1)]["lift"] * TILE
        for t in tiles - result["full"]:
            del ground[t]
        for t in result["full"]:
            ground[t] = (key, inner_y)
        for t, piece in result["pieces"]:
            pieces.append((key, inner_y, [(x * TILE - half, inner_y, z * TILE - half) for x, z in piece]))
        for p in result["outer"] | result["inner"]:
            corners[h + p[1] * TILE].add(to_world(p, h))
        for _, _, poly in pieces:
            for p in poly:
                corners[inner_y].add(p)
        # A dent's ground is what the outside's ground is at its border: a kept tile drawn with an edge's face (a path's
        # edge, michi01a) is that edge's outside there (grass); else the outside's terrain, else the first the edge names
        dents = []
        for outside, poly in result["dents"]:
            other = terrain_of(outside)
            texture = kept_textures.get(outside) if grid.get(outside, (None,))[0] == KEEP else None
            dkey = edge_outside.get(texture) or (other[0] if other and other[0] in terrains else None) \
                or (edge.get("from") or [key])[0]
            dents.append((dkey, [to_world(p, h) for p in poly]))
        bands.append((h, result["strips"], dents))
    # The ground: each terrain's tiles at a height merged into rectangles
    rects = rectangles(ground, size, lambda v: materials.reach(ground_keys[v[0]]) * terrains[v[0]]["ground"]["repeat"])
    # Every corner on each height's plane, which the ground's edges there are split at
    for (key, y), x, z, w, d in rects:
        for cx, cz in ((x, z), (x + w, z), (x + w, z + d), (x, z + d)):
            corners[y].add((world(cx, cz)[0], y, world(cx, cz)[1]))
    for (top, bottom), line in wall_runs(wall_grid, size, joined):
        for (x, z) in line:
            for y in (top, bottom):
                corners[y].add((x * TILE - half, y, z * TILE - half))

    def ground_uv(key):
        repeat = terrains[key]["ground"]["repeat"] * TILE
        return lambda p: ((p[0] + half) / repeat, (p[2] + half) / repeat)
    for (key, y), x, z, w, d in rects:
        (x0, z0), (x1, z1) = world(x, z), world(x + w, z + d)
        outline = [(x0, y, z0), (x0, y, z1), (x1, y, z1), (x1, y, z0)]
        polygons += [(ground_keys[key], t) for t in fan(ring(outline, corners[y]), ground_uv(key), UP)]
    def draw_polygon(key, poly):
        # A flat polygon of a terrain's ground, its edges split at the corners on its plane, in triangles
        y = poly[0][1]
        outline = ring(poly, corners[y])
        flat = [(p[0], p[2]) for p in outline]
        uv = ground_uv(key)
        for i, j, k in map_edges.ear_clip(flat):
            made = map_edges.triangle(*[(outline[q], uv(outline[q])) for q in (i, j, k)])
            if made:
                polygons.append((ground_keys[key], [Vertex(p, t, (1.0, 1.0, 1.0), made[1]) for p, t in made[0]]))

    # The bands, each strip split where the ground beside it has a corner on its lines
    def face_key(face):
        return materials.get(face["texture"], alpha=face.get("alpha"), clamp_t=not face.get("planar", False), name=face["texture"])

    def face_uv(face, w, u, v):
        repeat = face.get("repeat", 1)
        if face.get("planar", False):
            return ((w[0] + half) / (repeat * TILE), (w[2] + half) / (repeat * TILE))
        return (u / repeat, v)
    for h, strips, dents in bands:
        for face, (a0, a1), (b0, b1), (ua, ub) in strips:
            fv = face.get("v", [0, 0])
            sides = []
            for (p0, p1), v in (((a0, a1), fv[0]), ((b0, b1), fv[1])):
                w0, w1 = to_world(p0, h), to_world(p1, h)
                length2 = sum((w1[k] - w0[k]) ** 2 for k in range(3))
                ts = [0.0, 1.0]
                if length2 > EPS:
                    for c in corners.get(w0[1], ()) if abs(w0[1] - w1[1]) < EPS else ():
                        t = sum((c[k] - w0[k]) * (w1[k] - w0[k]) for k in range(3)) / length2
                        off = sum((c[k] - w0[k] - t * (w1[k] - w0[k])) ** 2 for k in range(3))
                        if EPS < t < 1 - EPS and off < 1e-4:
                            ts.append(t)
                side = []
                for t in sorted(set(ts)):
                    w = tuple(w0[k] + t * (w1[k] - w0[k]) for k in range(3))
                    side.append((w, face_uv(face, w, ua + t * (ub - ua), v), t))
                sides.append(side)
            key = face_key(face)
            for tri, normal in map_edges.strip_triangles(*sides):
                polygons.append((key, [Vertex(p, uv, (1.0, 1.0, 1.0), normal) for p, uv in tri]))
        for dkey, poly in dents:
            draw_polygon(dkey, poly)

    # The tiles the inside line crosses, clipped to it
    for key, y, poly in pieces:
        draw_polygon(key, poly)

    # The terrains' layers (tall grass's blades), over whole tiles
    for (key, y), x, z, w, d in rectangles(painted, size, lambda v: size):
        for layer in terrains[key].get("layers", []):
            lift = layer["lift"]
            lkey = materials.get(layer["texture"], alpha=layer.get("alpha", "MASK"))
            lrepeat = layer.get("repeat", 1) * TILE
            (x0, z0), (x1, z1) = world(x, z), world(x + w, z + d)
            louter = [(x0, y + lift, z0), (x0, y + lift, z1), (x1, y + lift, z1), (x1, y + lift, z0)]
            luv = lambda p, r=lrepeat: ((p[0] + half) / r, (p[2] + half) / r)  # noqa: E731
            polygons += [(lkey, t) for t in fan(louter, luv, UP)]

    # The walls between heights, facing the lower side
    for (top, bottom), line, facing, texture in wall_faces(wall_grid, size, terrains, style, joined):
        key = materials.get(texture["texture"], alpha=texture.get("alpha", "MASK"), clamp_t=True, name=texture["texture"])
        (ax, az), (bx, bz) = line
        a, b = (ax * TILE - half, az * TILE - half), (bx * TILE - half, bz * TILE - half)
        outline = [(a[0], top, a[1]), (a[0], bottom, a[1]), (b[0], bottom, b[1]), (b[0], top, b[1])]
        along = (b[0] - a[0], b[1] - a[1])
        length = math.hypot(*along)
        # Toward the lower side: across the line (west or north of it, or east or south when facing)
        side = 1.0 if facing else -1.0
        normal = (side * abs(along[1]) / length, 0.0, side * abs(along[0]) / length)
        e1 = [outline[1][k] - outline[0][k] for k in range(3)]
        e2 = [outline[2][k] - outline[0][k] for k in range(3)]
        cross = (e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0])
        if sum(c * n for c, n in zip(cross, normal)) < 0:
            outline = outline[::-1]
        repeat = texture.get("repeat", 1) * TILE
        uv = lambda p, a=a, along=along, length=length, repeat=repeat, top=top, bottom=bottom: (  # noqa: E731
            ((p[0] - a[0]) * along[0] + (p[2] - a[1]) * along[1]) / length / repeat, (top - p[1]) / (top - bottom))
        points = corners[top] | corners[bottom]
        polygons += [(key, t) for t in fan(ring(outline, points), uv, normal)]

    # The chunk's own faces over the tiles it keeps, clipped at their edges
    if keeps:
        cut = [(x, z, w, d) for _, x, z, w, d in rectangles({xz: 1 for xz, v in grid.items() if v[0] != KEEP}, size, lambda v: size)]
        triangles, base_materials, _ = read_mesh(base / "model.glb", images_from=folder)
        remap = {key: materials.add(material) for key, material in base_materials.items()}
        polygons += [(remap[key], tri) for key, tri in kept_faces(triangles, cut, half)]

    # The objects, on the ground of their north-west tile
    collision_over = {}
    for name, x, z in project.get("objects", []):
        obj_folder = OBJECTS / name
        if not (obj_folder / "object.json").exists():
            raise DataError(f"{project_path}: no object {name} in the library")
        info = json.loads((obj_folder / "object.json").read_text())
        triangles, obj_materials, _ = read_mesh(obj_folder / "model.glb")
        y = grid.get((x, z), (None, 0))[1]
        ox, oz = world(x, z)
        remap = {}
        for key, material in obj_materials.items():
            remap[key] = materials_from(materials, material)
        polygons += [(remap[key], [v.moved(ox, y, oz) for v in tri]) for key, tri in triangles]
        for dz, row in enumerate(info.get("collision") or []):
            for dx, tile_type in enumerate(row):
                if tile_type is not None:
                    collision_over[(x + dx, z + dz)] = tile_type

    old, _ = read_glb(folder / "model.glb")
    name = old["meshes"][0].get("name") or folder.name
    props = [n for n in old["nodes"] if n.get("name", "").startswith("bw2_prop_")]
    write_mesh(folder / "model.glb", name, polygons, materials.by_key, props)
    write_collision(folder, grid, size, terrains, collision_over, base if keeps else None)
    data_path = folder / "data.json"
    data = json.loads(data_path.read_text())
    data["texture_set"] = style["texture_set"]
    data["written"] = True
    data_path.write_text(dumps(data) + "\n")
    return sum(len(p) - 2 for _, p in polygons)


def _clip(polygon, axis, limit, keep_below):
    out = []
    for i, current in enumerate(polygon):
        previous = polygon[i - 1]
        inside = (lambda v: v.p[axis] <= limit + 1e-6) if keep_below else (lambda v: v.p[axis] >= limit - 1e-6)
        if inside(current):
            if not inside(previous):
                out.append(_lerp(previous, current, (limit - previous.p[axis]) / (current.p[axis] - previous.p[axis])))
            out.append(current)
        elif inside(previous):
            out.append(_lerp(previous, current, (limit - previous.p[axis]) / (current.p[axis] - previous.p[axis])))
    return out


def _lerp(a, b, t):
    mix = lambda u, v: tuple(x + (y - x) * t for x, y in zip(u, v))  # noqa: E731
    return Vertex(mix(a.p, b.p), mix(a.uv, b.uv), mix(a.color, b.color), mix(a.normal, b.normal))


def _subtract(polygon, rect):
    """A convex polygon without a rectangle (x0, z0, x1, z1) of the ground: up to four convex pieces, west, east, then
    north and south of it between those (a face on the rectangle's west or east edge stays whole on that side)."""
    x0, z0, x1, z1 = rect
    # A face standing on the rectangle's edge (a vanilla wall along it) goes with the rectangle: the generated walls
    # take its place, and two faces in one plane flicker
    xs, zs = [v.p[0] for v in polygon], [v.p[2] for v in polygon]
    if ((max(xs) - min(xs) < 1e-3 and x0 - 1e-3 <= xs[0] <= x1 + 1e-3 and min(zs) >= z0 - 1e-3 and max(zs) <= z1 + 1e-3)
            or (max(zs) - min(zs) < 1e-3 and z0 - 1e-3 <= zs[0] <= z1 + 1e-3 and min(xs) >= x0 - 1e-3 and max(xs) <= x1 + 1e-3)):
        return []
    out = []
    west = _clip(polygon, 0, x0, True)
    if len(west) >= 3:
        out.append(west)
    east = _clip(polygon, 0, x1, False)
    if len(east) >= 3:
        out.append(east)
    middle = _clip(_clip(polygon, 0, x0 + 1e-4, False), 0, x1 - 1e-4, True)
    if len(middle) >= 3:
        for piece in (_clip(middle, 2, z0, True), _clip(middle, 2, z1, False)):
            if len(piece) >= 3:
                out.append(piece)
    return out


def kept_faces(triangles, painted, half):
    """The chunk's triangles without the painted tiles: each triangle with the painted rectangles cut out of it, so it
    keeps its own shape everywhere else (painted: rectangles of tiles, x, z, w, d)."""
    rects = [(x * TILE - half, z * TILE - half, (x + w) * TILE - half, (z + d) * TILE - half) for x, z, w, d in painted]
    out = []
    for key, tri in triangles:
        pieces = [tri]
        xs, zs = [v.p[0] for v in tri], [v.p[2] for v in tri]
        for r in rects:
            if max(xs) <= r[0] or min(xs) >= r[2] or max(zs) <= r[1] or min(zs) >= r[3]:
                continue
            pieces = [part for piece in pieces for part in _subtract(piece, r)]
        out += [(key, piece) for piece in pieces if _area(piece) > 1e-3]
    return out


def _area(polygon):
    total = [0.0, 0.0, 0.0]
    for i in range(1, len(polygon) - 1):
        a, b, c = polygon[0].p, polygon[i].p, polygon[i + 1].p
        u = [b[k] - a[k] for k in range(3)]
        v = [c[k] - a[k] for k in range(3)]
        total = [t + c_ for t, c_ in zip(total, (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]))]
    return math.sqrt(sum(t * t for t in total))


def start(model, style, fill=KEEP, flat=None):
    """A project of a chunk: every tile fill ("." keeps the chunk) at its collision's height, or at flat (half
    tiles); and a copy of the chunk's files, which "." tiles draw from and stop puts back."""
    folder = MODELS / model
    if not (folder / "model.glb").exists():
        raise DataError(f"no map model {model}")
    path = PROJECTS / f"{model}.json"
    if path.exists():
        raise DataError(f"{model} is painted already")
    if not (STYLES / f"{style}.json").exists():
        raise DataError(f"no style {style}")
    base = PROJECTS / f"{model}.base"
    base.mkdir(parents=True, exist_ok=True)
    for name in BASE_FILES:
        if (folder / name).exists():
            (base / BASE_NAMES.get(name, name)).write_bytes((folder / name).read_bytes())
    rows = list(csv.DictReader((folder / "terrain_0.csv").open()))
    size = max(int(r["x"]) for r in rows) + 1
    heights = ground_heights(folder, size)
    height = [[max(-40, min(80, round((flat * HALF_TILE if flat is not None else heights.get((x, z), 0)) / HALF_TILE)))
               for x in range(size)] for z in range(size)]
    project = {"$schema": "../map_project.schema.json", "model": model, "style": style, "size": size,
               "terrain": [fill * size for _ in range(size)], "height": height, "objects": []}
    path.write_text(dumps(project, width=1 << 20) + "\n")
    return path


def stop(model):
    """The chunk's files as they were when painting started, and the project and its copy removed. A project started
    before copies were kept has none: it goes, and the chunk stays as it is."""
    base = PROJECTS / f"{model}.base"
    if not (base / "model.glb").exists():
        (PROJECTS / f"{model}.json").unlink(missing_ok=True)
        return False
    for name in BASE_FILES:
        # A copy made before data.json was kept as data.json.copy has it under its own name
        for kept in (BASE_NAMES.get(name, name), name):
            if (base / kept).exists():
                (MODELS / model / name).write_bytes((base / kept).read_bytes())
                break
    for f in base.iterdir():
        f.unlink()
    base.rmdir()
    (PROJECTS / f"{model}.json").unlink(missing_ok=True)
    return True


def materials_from(materials, material):
    """An object's material in the generated model: the same, its image the style's set's PNG of that name."""
    copy = json.loads(json.dumps(material))
    texture = copy["pbrMetallicRoughness"].get("baseColorTexture")
    if texture:
        png = texture["image"].rsplit("/", 1)[1]
        image = TEXTURES / materials.folder / png
        if not image.exists():
            raise DataError(f"the texture set {materials.folder} has no {png}: import it from the object's set first")
        texture["image"] = image.relative_to(ROOT).as_posix()
    return materials.add(copy)


def wall_runs(grid, size, joined=lambda a, b: False):
    """The ends of every wall segment, for the ground's corners: ((top, bottom), [(x, z), (x, z)]) per tile edge;
    joined says which neighbours have none between them."""
    out = []
    for (x, z), (key, h) in grid.items():
        for dx, dz in ((1, 0), (0, 1)):
            other = grid.get((x + dx, z + dz))
            if other is None or other[1] == h or (key == KEEP and other[0] == KEEP) or joined((x, z), (x + dx, z + dz)):
                continue
            ends = [(x + 1, z), (x + 1, z + 1)] if dx else [(x, z + 1), (x + 1, z + 1)]
            out.append(((max(h, other[1]), min(h, other[1])), ends))
    return out


def wall_faces(grid, size, terrains, style, joined=lambda a, b: False):
    """The walls, merged along straight runs of the same heights and texture: ((top, bottom), (start, end), facing,
    texture). facing says the wall faces the second side (east or south) rather than the first."""
    segments = defaultdict(list)
    for (x, z), (key, h) in grid.items():
        for dx, dz in ((1, 0), (0, 1)):
            nb = grid.get((x + dx, z + dz))
            if nb is None or nb[1] == h or (key == KEEP and nb[0] == KEEP) or joined((x, z), (x + dx, z + dz)):
                continue
            high, low = ((key, h), nb) if h > nb[1] else (nb, (key, h))
            texture = (terrains.get(low[0], {}).get("wall") or terrains.get(high[0], {}).get("wall") or style["wall"])
            facing = h > nb[1]  # the lower side is east or south
            # A vertical edge (between x and x+1) runs along z; a horizontal one along x
            line = (x + 1, z) if dx else (x, z + 1)
            segments[(dx, high[1], low[1], facing, json.dumps(texture, sort_keys=True), line[0] if dx else line[1])].append(
                line[1] if dx else line[0])
    out = []
    for (dx, top, bottom, facing, texture, fixed), starts in segments.items():
        starts.sort()
        run = [starts[0]]
        for s in starts[1:] + [None]:
            if s is not None and s == run[-1] + 1:
                run.append(s)
                continue
            a, b = run[0], run[-1] + 1
            ends = ((fixed, a), (fixed, b)) if dx else ((a, fixed), (b, fixed))
            out.append(((top, bottom), ends, facing, json.loads(texture)))
            if s is not None:
                run = [s]
    return out


def write_collision(folder, grid, size, terrains, over, base=None):
    heights = height_tables()
    kept = {}
    if base is not None:
        kept = {(int(r["x"]), int(r["z"])): r for r in csv.DictReader((base / "terrain_0.csv").open())}
    rows = []
    for z in range(size):
        for x in range(size):
            key, y = grid[(x, z)]
            if key == KEEP:
                row = {k: int(v) for k, v in kept[(x, z)].items()}
                if (x, z) in over:
                    row["tile_type"] = over[(x, z)]
                rows.append(row)
                continue
            tile_type = over.get((x, z), terrains[key]["tile_type"])
            y += terrains[key].get("collision_lift", 0) * TILE
            rows.append({"x": x, "z": z, "shape": 0, "slope": 0, "offset": flat_offset(heights, y),
                         "tile_type": tile_type, "diagonal": 0})
    with (folder / "terrain_0.csv").open("w", newline="") as out:
        writer = csv.DictWriter(out, fieldnames=["x", "z", "shape", "slope", "offset", "tile_type", "diagonal"],
                                lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    # Kept tiles may name the chunk's split planes, which stay
    if base is not None and (base / "terrain_0_splits.csv").exists():
        (folder / "terrain_0_splits.csv").write_text((base / "terrain_0_splits.csv").read_text())
    else:
        with (folder / "terrain_0_splits.csv").open("w", newline="") as out:
            out.write("index,unused,slope0,slope1,offset0,offset1\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("generate", help="write a project's chunk").add_argument("project")
    st = commands.add_parser("start", help="a project of a chunk, and a copy of the chunk")
    st.add_argument("model")
    st.add_argument("style")
    st.add_argument("--fill", default=KEEP)
    st.add_argument("--flat", type=float)
    commands.add_parser("stop", help="the chunk as it was, the project gone").add_argument("model")
    args = parser.parse_args()
    try:
        if args.command == "start":
            print(start(args.model, args.style, args.fill, args.flat * 2 if args.flat is not None else None).relative_to(ROOT))
        elif args.command == "stop":
            print(f"{args.model}: put back as it was" if stop(args.model)
                  else f"{args.model}: its painting is removed; it had no copy of the chunk, which stays as it is")
        else:
            print(f"{args.project}: {generate(args.project)} triangles")
    except DataError as error:
        sys.exit(f"error: {error}")


if __name__ == "__main__":
    main()
