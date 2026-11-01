#!/usr/bin/env python3
"""Paper White 2's map maker: a map chunk generated from a painted grid (docs/paperwhite2/design/map-editor.md,
Painting maps).

    map_maker.py generate PROJECT        # write the project's chunk's model.glb and collision

A project, res/paperwhite2/map_projects/<model>.json (map_project.schema.json), names the chunk it makes, its style,
each tile's terrain (a letter of the style's terrains, a string a row) and height (in half tiles), and the objects of
the library placed on it ([object, x, z]). A style, res/paperwhite2/map_styles/<style>.json (map_style.schema.json),
gives each terrain its look and tile type, from a vanilla area's texture set.

generate writes:
- the ground: each terrain's tiles at a height merged into rectangles (as large as the texture's reach in Nitro's
  coordinates allows), textured from above (u, v = x, z over the texture's repeat in tiles), so textures run on across
  tiles as the game's do; a rectangle's edges are split where another's corner lies on them, so no corner of one
  meets the middle of another's edge (a T-junction, which the DS draws with a gap);
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

MODELS = ROOT / "res/field/maps/models"
TEXTURES = ROOT / "res/field/maps/textures"
STYLES = ROOT / "res/paperwhite2/map_styles"
OBJECTS = ROOT / "res/paperwhite2/map_objects"
PROJECTS = ROOT / "res/paperwhite2/map_projects"
TILE = 16
HALF_TILE = 8
REPEAT, CLAMP = 10497, 33071
UP = (0.0, 1.0, 0.0)


def height_tables():
    """The game's flat-tile heights: slope 0's normal and the height of each offset (src/ov036/field_map_chunk_height.c)."""
    text = (ROOT / "src/ov036/field_map_chunk_height.c").read_text()

    def numbers(name):
        start = text.index(name)
        body = text[text.index("{", start) + 1:text.index("};", start)]
        return [int(v, 0) for v in re.findall(r"-?0x[0-9a-fA-F]+|-?\d+", body)]

    slopes = numbers("MAP_HEIGHT_SLOPE_TABLE[]")
    offsets = numbers("MAP_HEIGHT_OFFSET_TABLE[]")
    ny = slopes[1] / 4096
    return [-o / 4096 / ny for o in offsets]


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
    grid = {}
    for z, row in enumerate(project["terrain"]):
        for x, key in enumerate(row):
            if key not in terrains:
                raise DataError(f"{project_path}: no terrain {key!r} in the style")
            grid[(x, z)] = (key, project["height"][z][x] * HALF_TILE)
    if len(grid) != size * size:
        raise DataError(f"{project_path}: the grid isn't {size} by {size}")
    materials = Materials(style["texture_set"])
    world = lambda x, z: (x * TILE - half, z * TILE - half)  # noqa: E731
    polygons = []

    # The ground and the layers above it, as rectangles of a terrain at a height
    ground_keys = {k: materials.get(t["ground"]["texture"]) for k, t in terrains.items()}
    rects = rectangles(grid, size, lambda v: materials.reach(ground_keys[v[0]]) * terrains[v[0]]["ground"]["repeat"])
    # Every corner on each height's plane, which the rectangles' edges there are split at
    corners = defaultdict(set)
    for (key, y), x, z, w, d in rects:
        for cx, cz in ((x, z), (x + w, z), (x + w, z + d), (x, z + d)):
            corners[y].add((*world(cx, cz)[:1], y, world(cx, cz)[1]))
    walls = wall_runs(grid, size)
    for (top, bottom), line in walls:
        for (x, z) in line:
            for y in (top, bottom):
                corners[y].add((x * TILE - half, y, z * TILE - half))
    for (key, y), x, z, w, d in rects:
        terrain = terrains[key]
        (x0, z0), (x1, z1) = world(x, z), world(x + w, z + d)
        outline = [(x0, y, z0), (x0, y, z1), (x1, y, z1), (x1, y, z0)]
        repeat = terrain["ground"]["repeat"] * TILE
        uv = lambda p, r=repeat: ((p[0] + half) / r, (p[2] + half) / r)  # noqa: E731
        polygons += [(ground_keys[key], t) for t in fan(ring(outline, corners[y]), uv, UP)]
        for layer in terrain.get("layers", []):
            lift = layer["lift"]
            lkey = materials.get(layer["texture"], alpha=layer.get("alpha", "MASK"))
            lrepeat = layer.get("repeat", 1) * TILE
            louter = [(p[0], y + lift, p[2]) for p in outline]
            luv = lambda p, r=lrepeat: ((p[0] + half) / r, (p[2] + half) / r)  # noqa: E731
            polygons += [(lkey, t) for t in fan(louter, luv, UP)]

    # The walls between heights, facing the lower side
    for (top, bottom), line, facing, texture in wall_faces(grid, size, terrains, style):
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
    write_collision(folder, grid, size, terrains, collision_over)
    data_path = folder / "data.json"
    data = json.loads(data_path.read_text())
    data["texture_set"] = style["texture_set"]
    data["written"] = True
    data_path.write_text(dumps(data) + "\n")
    return sum(len(p) - 2 for _, p in polygons)


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


def wall_runs(grid, size):
    """The ends of every wall segment, for the ground's corners: ((top, bottom), [(x, z), (x, z)]) per tile edge."""
    out = []
    for (x, z), (_, h) in grid.items():
        for dx, dz in ((1, 0), (0, 1)):
            other = grid.get((x + dx, z + dz))
            if other is None or other[1] == h:
                continue
            ends = [(x + 1, z), (x + 1, z + 1)] if dx else [(x, z + 1), (x + 1, z + 1)]
            out.append(((max(h, other[1]), min(h, other[1])), ends))
    return out


def wall_faces(grid, size, terrains, style):
    """The walls, merged along straight runs of the same heights and texture: ((top, bottom), (start, end), facing,
    texture). facing says the wall faces the second side (east or south) rather than the first."""
    segments = defaultdict(list)
    for (x, z), (key, h) in grid.items():
        for dx, dz in ((1, 0), (0, 1)):
            nb = grid.get((x + dx, z + dz))
            if nb is None or nb[1] == h:
                continue
            high, low = ((key, h), nb) if h > nb[1] else (nb, (key, h))
            texture = terrains[low[0]].get("wall") or terrains[high[0]].get("wall") or style["wall"]
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


def write_collision(folder, grid, size, terrains, over):
    heights = height_tables()
    rows = []
    for z in range(size):
        for x in range(size):
            key, y = grid[(x, z)]
            tile_type = over.get((x, z), terrains[key]["tile_type"])
            rows.append({"x": x, "z": z, "shape": 0, "slope": 0, "offset": flat_offset(heights, y),
                         "tile_type": tile_type, "diagonal": 0})
    with (folder / "terrain_0.csv").open("w", newline="") as out:
        writer = csv.DictWriter(out, fieldnames=["x", "z", "shape", "slope", "offset", "tile_type", "diagonal"],
                                lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    with (folder / "terrain_0_splits.csv").open("w", newline="") as out:
        out.write("index,unused,slope0,slope1,offset0,offset1\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("generate", help="write a project's chunk").add_argument("project")
    args = parser.parse_args()
    try:
        print(f"{args.project}: {generate(args.project)} triangles")
    except DataError as error:
        sys.exit(f"error: {error}")


if __name__ == "__main__":
    main()
