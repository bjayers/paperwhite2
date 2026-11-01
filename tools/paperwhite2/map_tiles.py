#!/usr/bin/env python3
"""Paper White 2's map tile libraries, res/paperwhite2/map_tiles/<library>/: pieces of the game's map chunks, cut on
the tile grid, for the editor's Map Editor to build new chunks from (docs/paperwhite2/design/map-editor.md).

    map_tiles.py slice LIBRARY          # cut the library's source chunks into tiles.glb and tiles.json
    map_tiles.py list LIBRARY           # the library's tiles, for checking
    map_tiles.py start LIBRARY MODEL    # a layout of one of its source chunks as it is
    map_tiles.py compose LAYOUT         # write the layout's chunk's model.glb from its tiles

A library's library.json names its source chunks (map model folders of res/field/maps/models/). Slicing reads each
chunk's model.glb and terrain_0.csv as the clean data has them (the git tag w2-original), so the hack's edits of a
chunk don't change its tiles, and cuts its triangles into pieces of two kinds:
- ground: the chunk's large connected meshes (paths, grass, cliffs, water, ledges), clipped to each tile's square,
  so a piece is what the chunk draws over one tile;
- objects: small meshes (a tree, a sign, a fence post), with any small meshes their footprint overlaps (a tree's
  trunk and its leaves), kept whole, with a footprint of whole tiles.
Pieces that are the same wherever they stand are one tile, counted: the same polygons, UVs (up to whole repeats where
the texture wraps) and materials. Each piece starts at its footprint's north-west corner and its lowest point, which
is where a layout places it.

The catalogue is generated into build/map_tiles/<library>/: tiles.glb holds one node per tile, named by its key, its
mesh's primitives one per material, the texture images named by path from the GLB; tiles.json lists the tiles, the
most used first: each one's key, kind, footprint, how many times and where the sources use it, its triangles and
materials, and its first source's terrain rows, for its collision. library.json's "tiles" holds the user's name,
category and hidden flag for tiles by key, which the catalogue copies. The catalogue also gives where each source's
pieces are, its "placements", from which `start` makes a layout.

A layout, res/paperwhite2/map_layouts/<model>.json (map_layout.schema.json), is a chunk as tiles: a ground tile for
each cell, [x, z, key, height], and objects, [key, x, z, height]. `compose` writes the chunk's model.glb from it: the
tiles' polygons where the layout puts them, stitched back where cutting split them (coplanar pieces of one material
and texture run merge into the regions they make, triangulated again), a draw call per material in the sources'
order, the chunk's props kept; its data.json is marked written. A layout started from a chunk composes to the chunk as
it was, with more triangles where its pieces overlap (Route 20's map04_20: 1,114 to about 2,100).
"""
import argparse
import hashlib
import json
import math
import struct
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/data"))
from map_model_data import GLB_BIN, GLB_JSON, accessor_values, read_glb, write_glb  # noqa: E402
sys.path.insert(0, str(ROOT))
from tools.data.datajson import DataError, dumps, load, load_schema  # noqa: E402
from map_terrain_data import HEIGHT_FIELDS, read_csv  # noqa: E402

MODELS = ROOT / "res/field/maps/models"
LIBRARIES = ROOT / "res/paperwhite2/map_tiles"
CATALOGUES = ROOT / "build/map_tiles"
TILE = 16
# A connected mesh wider or deeper than this, in tiles, is ground and is cut per tile
GROUND_SPAN = 4
REPEAT, MIRRORED_REPEAT = 10497, 33648
USER_FIELDS = ("name", "category", "hidden")


class Vertex:
    __slots__ = ("p", "uv", "color", "normal")

    def __init__(self, p, uv, color, normal):
        self.p, self.uv, self.color, self.normal = p, uv, color, normal

    def lerp(self, other, t):
        mix = lambda a, b: tuple(x + (y - x) * t for x, y in zip(a, b))  # noqa: E731
        return Vertex(mix(self.p, other.p), mix(self.uv, other.uv), mix(self.color, other.color),
                      mix(self.normal, other.normal))


def identity(matrix):
    return all(abs(v - (1 if i % 5 == 0 else 0)) < 1e-5 for i, v in enumerate(matrix))


def matrices(doc, binary, index):
    """A MAT4 float accessor's matrices, which map_model_data's reader doesn't take."""
    accessor = doc["accessors"][index]
    if accessor["type"] != "MAT4" or accessor["componentType"] != 5126:
        raise ValueError("expected float matrices")
    view = doc["bufferViews"][accessor["bufferView"]]
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return [struct.unpack_from("<16f", binary, offset + 64 * i) for i in range(accessor["count"])]


CLEAN_TAG = "w2-original"


def clean(directory, name):
    """A source file of a chunk as the clean data has it (the git tag w2-original), so a library's tiles stay the same
    whatever the hack's edits of its chunks; the file itself where the checkout has no such tag."""
    relative = (directory / name).relative_to(ROOT).as_posix()
    cached = CATALOGUES / ".clean" / relative
    if cached.exists():
        return cached
    result = subprocess.run(["git", "show", f"{CLEAN_TAG}:{relative}"], cwd=ROOT, capture_output=True)
    if result.returncode != 0:
        return directory / name
    cached.parent.mkdir(parents=True, exist_ok=True)
    cached.write_bytes(result.stdout)
    return cached


def chunk_triangles(directory):
    """The chunk's triangles as (material key, three vertices), and its materials by key, from the clean data."""
    doc, binary = read_glb(clean(directory, "model.glb"))
    if len(doc["meshes"]) != 1:
        raise ValueError(f"{directory.name}: expected one mesh")
    for node in doc["nodes"]:
        if "mesh" in node and any(k in node for k in ("matrix", "translation", "rotation", "scale")):
            raise ValueError(f"{directory.name}: the mesh's node is moved")
    for skin in doc.get("skins", []):
        for matrix in matrices(doc, binary, skin["inverseBindMatrices"]):
            if not identity(matrix):
                raise ValueError(f"{directory.name}: a joint isn't at the origin")
        for joint in skin["joints"]:
            if any(k in doc["nodes"][joint] for k in ("matrix", "translation", "rotation", "scale")):
                raise ValueError(f"{directory.name}: a joint is moved")
    materials = {}
    triangles = []
    for primitive in doc["meshes"][0]["primitives"]:
        if primitive.get("mode", 4) != 4:
            raise ValueError(f"{directory.name}: only triangles are supported")
        key, material = material_of(doc, primitive["material"], directory)
        materials[key] = material
        attributes = primitive["attributes"]
        positions = accessor_values(doc, binary, attributes["POSITION"])
        count = len(positions)
        uvs = accessor_values(doc, binary, attributes["TEXCOORD_0"]) if "TEXCOORD_0" in attributes else [(0, 0)] * count
        colors = colors_of(doc, binary, attributes.get("COLOR_0"), count)
        normals = accessor_values(doc, binary, attributes["NORMAL"]) if "NORMAL" in attributes else [(0, 1, 0)] * count
        indices = [i[0] for i in accessor_values(doc, binary, primitive["indices"])]
        for t in range(0, len(indices), 3):
            triangles.append((key, [Vertex(positions[i], uvs[i], colors[i], normals[i]) for i in indices[t:t + 3]]))
    return triangles, materials


def colors_of(doc, binary, accessor, count):
    if accessor is None:
        return [(1.0, 1.0, 1.0)] * count
    info = doc["accessors"][accessor]
    scale = {5121: 255, 5123: 65535}.get(info["componentType"], 1)
    return [tuple(c / scale for c in v[:3]) for v in accessor_values(doc, binary, accessor)]


def material_of(doc, index, directory):
    """A material as the tile GLB stores it, and its key: its name and everything that draws it."""
    source = doc["materials"][index]
    material = {k: v for k, v in source.items() if k != "pbrMetallicRoughness"}
    pbr = dict(source.get("pbrMetallicRoughness", {}))
    sampler = {}
    if "baseColorTexture" in pbr:
        texture = doc["textures"][pbr["baseColorTexture"]["index"]]
        uri = doc["images"][texture["source"]]["uri"]
        image = (directory / uri).resolve()
        sampler = doc["samplers"][texture["sampler"]] if "sampler" in texture else {}
        pbr["baseColorTexture"] = {"image": str(image.relative_to(ROOT)), "sampler": sampler}
    material["pbrMetallicRoughness"] = pbr
    key = json.dumps(material, sort_keys=True)
    return key, material


def clip(polygon, axis, limit, keep_below):
    """The part of a polygon on one side of the plane where its axis is limit."""
    out = []
    for i, current in enumerate(polygon):
        previous = polygon[i - 1]
        inside = lambda v: v.p[axis] <= limit if keep_below else v.p[axis] >= limit  # noqa: E731
        if inside(current):
            if not inside(previous):
                out.append(previous.lerp(current, (limit - previous.p[axis]) / (current.p[axis] - previous.p[axis])))
            out.append(current)
        elif inside(previous):
            out.append(previous.lerp(current, (limit - previous.p[axis]) / (current.p[axis] - previous.p[axis])))
    return out


def without_repeats(polygon):
    """A clipped polygon without the corners it repeats, where a corner lay on the clipping line."""
    out = []
    for v in polygon:
        if not out or any(abs(a - b) > 1e-4 for a, b in zip(v.p, out[-1].p)):
            out.append(v)
    if len(out) > 1 and all(abs(a - b) <= 1e-4 for a, b in zip(out[0].p, out[-1].p)):
        out.pop()
    return out


def area(polygon):
    """Twice the polygon's area in 3D, to drop the slivers clipping leaves."""
    total = [0.0, 0.0, 0.0]
    for i in range(1, len(polygon) - 1):
        a, b, c = polygon[0].p, polygon[i].p, polygon[i + 1].p
        u = [b[k] - a[k] for k in range(3)]
        v = [c[k] - a[k] for k in range(3)]
        cross = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
        total = [t + c for t, c in zip(total, cross)]
    return math.sqrt(sum(t * t for t in total))


def components(triangles):
    """The triangles' connected meshes, as lists of indices: triangles sharing a position are connected."""
    parent = list(range(len(triangles)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    owner = {}
    for i, (_, vertices) in enumerate(triangles):
        for v in vertices:
            key = tuple(round(c * 16) for c in v.p)
            if key in owner:
                a, b = find(i), find(owner[key])
                if a != b:
                    parent[a] = b
            else:
                owner[key] = i
    groups = defaultdict(list)
    for i in range(len(triangles)):
        groups[find(i)].append(i)
    return list(groups.values())


def bounds(vertices):
    xs = [v.p[0] for v in vertices]
    zs = [v.p[2] for v in vertices]
    return min(xs), max(xs), min(zs), max(zs)


def overlap(a, b):
    """Whether two XZ boxes overlap by more than a sliver."""
    return min(a[1], b[1]) - max(a[0], b[0]) > 0.5 and min(a[3], b[3]) - max(a[2], b[2]) > 0.5


def pieces(triangles, half):
    """The chunk's pieces: (kind, tile x, tile z, width, depth, [(material, polygon)]), tile coordinates from the
    chunk's north-west corner."""
    ground = []
    objects = []
    for group in components(triangles):
        box = bounds([v for i in group for v in triangles[i][1]])
        if box[1] - box[0] > GROUND_SPAN * TILE or box[3] - box[2] > GROUND_SPAN * TILE:
            ground += group
        else:
            objects.append([group, box])
    # A small mesh within another's footprint belongs with it: a tree's leaves and its trunk
    merged = True
    while merged:
        merged = False
        for i in range(len(objects)):
            for j in range(i + 1, len(objects)):
                if overlap(objects[i][1], objects[j][1]):
                    a, b = objects[i], objects.pop(j)
                    a[0] += b[0]
                    a[1] = (min(a[1][0], b[1][0]), max(a[1][1], b[1][1]), min(a[1][2], b[1][2]), max(a[1][3], b[1][3]))
                    merged = True
                    break
            if merged:
                break
    out = []
    cells = defaultdict(list)
    for i in ground:
        material, polygon = triangles[i]
        box = bounds(polygon)
        # A face standing on a grid line (a tree's card) has no width there, and goes in the cell east or south of it
        first_x, first_z = math.floor((box[0] + half) / TILE), math.floor((box[2] + half) / TILE)
        for tx in range(first_x, max(math.ceil((box[1] + half) / TILE), first_x + 1)):
            for tz in range(first_z, max(math.ceil((box[3] + half) / TILE), first_z + 1)):
                x0, z0 = tx * TILE - half, tz * TILE - half
                part = polygon
                for axis, limit, below in ((0, x0, False), (0, x0 + TILE, True), (2, z0, False), (2, z0 + TILE, True)):
                    part = clip(part, axis, limit, below)
                    if len(part) < 3:
                        break
                part = without_repeats(part)
                if len(part) >= 3 and area(part) > 0.01:
                    cells[tx, tz].append((material, part))
    for (tx, tz), polygons in cells.items():
        out.append(("ground", tx, tz, 1, 1, polygons))
    for group, box in objects:
        width = max(1, round((box[1] - box[0]) / TILE))
        depth = max(1, round((box[3] - box[2]) / TILE))
        tx = round(((box[0] + box[1]) / 2 + half) / TILE - width / 2)
        tz = round(((box[2] + box[3]) / 2 + half) / TILE - depth / 2)
        out.append(("object", tx, tz, width, depth, [triangles[i] for i in group]))
    return out


def uv_shift(polygons, materials):
    """Per material, the whole repeats to move the piece's UVs by so that the same piece anywhere has the same UVs."""
    shifts = {}
    for material, polygon in polygons:
        low = shifts.get(material, (math.inf, math.inf))
        shifts[material] = (min(low[0], min(v.uv[0] for v in polygon)), min(low[1], min(v.uv[1] for v in polygon)))
    out = {}
    for material, low in shifts.items():
        sampler = materials[material]["pbrMetallicRoughness"].get("baseColorTexture", {}).get("sampler", {})
        shift = []
        for axis, wrap in enumerate((sampler.get("wrapS", REPEAT), sampler.get("wrapT", REPEAT))):
            step = {REPEAT: 1, MIRRORED_REPEAT: 2}.get(wrap)
            shift.append(math.floor(low[axis] / step + 1e-6) * step if step else 0)
        out[material] = tuple(shift)
    return out






def exact_ground(polygons):
    """A ground piece's key: its polygons exactly (positions to a sixteenth of a unit and UVs to a 1024th, both
    corners and UVs up to whole repeats of the texture, in any order and from any corner) with each one's material.
    Pieces cut from the same polygon at the same place in it are one tile, and fit their neighbours exactly where a
    layout puts them as they were; where the texture starts is part of it, since a forest block's leaves start at the
    block's corner, not on a grid the whole map shares."""
    canonical = []
    for material, polygon in polygons:
        corners = [(*(round(c * 16) for c in v.p), round(v.uv[0] * 1024), round(v.uv[1] * 1024)) for v in polygon]
        start = corners.index(min(corners))
        canonical.append((json.loads(material)["name"], tuple(corners[start:] + corners[:start])))
    canonical.sort(key=repr)
    return canonical


def normalized(piece, half, materials):
    """A piece moved to its origin: its footprint's north-west corner at its lowest point, and its key."""
    kind, tx, tz, width, depth, polygons = piece
    origin = (tx * TILE - half, min(v.p[1] for _, polygon in polygons for v in polygon), tz * TILE - half)
    base = round(origin[1])
    shifts = uv_shift(polygons, materials)
    moved = []
    for material, polygon in polygons:
        shift = shifts[material]
        moved.append((material, [Vertex((v.p[0] - origin[0], v.p[1] - base, v.p[2] - origin[2]),
                                        (v.uv[0] - shift[0], v.uv[1] - shift[1]), v.color, v.normal) for v in polygon]))
    if kind == "ground":
        canonical = exact_ground(moved)
    else:
        # The key doesn't depend on the order the chunk drew the polygons in, or where each polygon starts
        canonical = []
        for material, polygon in moved:
            vertices = [(round(v.p[0] * 16), round(v.p[1] * 16), round(v.p[2] * 16), round(v.uv[0] * 1024),
                         round(v.uv[1] * 1024), *(round(c * 31) for c in v.color)) for v in polygon]
            start = vertices.index(min(vertices))
            canonical.append((json.loads(material)["name"], tuple(vertices[start:] + vertices[:start])))
        canonical.sort()
    key = kind[0] + hashlib.sha1(repr((width, depth, canonical)).encode()).hexdigest()[:12]
    return key, base, moved


def terrain_rows(directory):
    rows = read_csv(clean(directory, "terrain_0.csv"), HEIGHT_FIELDS)
    return {(row["x"], row["z"]): {k: row[k] for k in HEIGHT_FIELDS[2:]} for row in rows}


def chunk_half(triangles):
    """Half the chunk's span: most are 32 tiles across, Skyarrow Bridge's 128 and the League's 64."""
    extent = max(abs(c) for _, polygon in triangles for v in polygon for c in (v.p[0], v.p[2]))
    for half in (256, 512, 1024):
        if extent <= half + TILE * 2:
            return half
    raise ValueError("chunk is wider than any map type's")


def cut(name):
    """A library's tiles, by key, with each one's polygons and where its first source has it; the materials, by key;
    and where every piece of each source is, by model: its ground [x, z, key, y] and objects [key, x, z, y]."""
    library = json.loads((LIBRARIES / name / "library.json").read_text())
    tiles = {}
    materials = {}
    placements = {}
    for source in library["sources"]:
        directory = MODELS / source
        triangles, chunk_materials = chunk_triangles(directory)
        materials.update(chunk_materials)
        terrain = terrain_rows(directory)
        half = chunk_half(triangles)
        placed = placements[source] = {"ground": [], "objects": []}
        for piece in pieces(triangles, half):
            kind, tx, tz, width, depth, polygons = piece
            key, base, moved = normalized(piece, half, materials)
            tile = tiles.get(key)
            if tile is None:
                collision = [[terrain.get((tx + x, tz + z)) for x in range(width)] for z in range(depth)]
                tile = tiles[key] = {"key": key, "kind": kind, "size": [width, depth], "uses": 0, "at": [],
                                     "collision": collision, "_polygons": moved, "_origin": (tx, tz, base)}
            tile["uses"] += 1
            if len(tile["at"]) < 8:
                tile["at"].append({"model": source, "x": tx, "z": tz, "y": base})
            if kind == "ground":
                placed["ground"].append([tx, tz, key, base])
            else:
                placed["objects"].append([key, tx, tz, base])
    for placed in placements.values():
        placed["ground"].sort()
        placed["objects"].sort(key=lambda o: (o[2], o[1], o[0]))
    return library, tiles, materials, placements


def slice_library(name):
    library, tiles, materials, placements = cut(name)
    write_library(CATALOGUES / name, library, tiles, materials, library.get("tiles", {}), placements)
    return tiles


def write_library(folder, library, tiles, materials, previous, placements):
    """tiles.glb and tiles.json, the tiles most used first."""
    order = sorted(tiles.values(), key=lambda t: (t["kind"] != "ground", -t["uses"], t["key"]))
    material_index = {}
    images = []
    image_index = {}
    textures = []
    doc_materials = []
    samplers = []
    binary = bytearray()
    views, accessors, meshes, nodes = [], [], [], []

    def material_slot(key):
        if key not in material_index:
            material = json.loads(json.dumps(materials[key]))
            pbr = material["pbrMetallicRoughness"]
            texture = pbr.get("baseColorTexture")
            if texture:
                uri = Path("../../..") / texture["image"]
                if str(uri) not in image_index:
                    image_index[str(uri)] = len(images)
                    images.append({"uri": uri.as_posix()})
                sampler = texture["sampler"]
                if sampler not in samplers:
                    samplers.append(sampler)
                textures.append({"source": image_index[str(uri)], "sampler": samplers.index(sampler)})
                pbr["baseColorTexture"] = {"index": len(textures) - 1}
            material_index[key] = len(doc_materials)
            doc_materials.append(material)
        return material_index[key]

    # One buffer view per attribute, shared by every tile, keeps the GLB's JSON small
    streams = {name: bytearray() for name in ("POSITION", "TEXCOORD_0", "COLOR_0", "NORMAL", "indices")}
    layouts = {"POSITION": ("3f", "VEC3"), "TEXCOORD_0": ("2f", "VEC2"), "COLOR_0": ("3f", "VEC3"),
               "NORMAL": ("3f", "VEC3"), "indices": ("I", "SCALAR")}
    view_of = {name: i for i, name in enumerate(streams)}

    def add(stream, data, extra=None):
        fmt, kind = layouts[stream]
        accessor = {"bufferView": view_of[stream], "byteOffset": len(streams[stream]),
                    "componentType": 5125 if fmt == "I" else 5126, "count": len(data), "type": kind}
        for item in data:
            streams[stream].extend(struct.pack("<" + fmt, *item) if isinstance(item, tuple) else struct.pack("<I", item))
        accessor.update(extra or {})
        accessors.append(accessor)
        return len(accessors) - 1

    entries = []
    for tile in order:
        by_material = defaultdict(list)
        for material, polygon in tile["_polygons"]:
            by_material[material].append(polygon)
        vertices = [v for polygons in by_material.values() for polygon in polygons for v in polygon]
        positions = [v.p for v in vertices]
        attributes = {
            "POSITION": add("POSITION", positions, {"min": [min(p[k] for p in positions) for k in range(3)],
                                                    "max": [max(p[k] for p in positions) for k in range(3)]}),
            "TEXCOORD_0": add("TEXCOORD_0", [v.uv for v in vertices]),
            "COLOR_0": add("COLOR_0", [v.color for v in vertices]),
            "NORMAL": add("NORMAL", [unit(v.normal) for v in vertices]),
        }
        primitives = []
        triangle_count = 0
        names = set()
        start = 0
        for material, polygons in by_material.items():
            indices = []
            for polygon in polygons:
                for i in range(1, len(polygon) - 1):
                    indices += [start, start + i, start + i + 1]
                start += len(polygon)
            triangle_count += len(indices) // 3
            primitives.append({"attributes": attributes, "indices": add("indices", indices),
                               "material": material_slot(material)})
            names.add(json.loads(material)["name"])
        meshes.append({"name": tile["key"], "primitives": primitives})
        nodes.append({"name": tile["key"], "mesh": len(meshes) - 1})
        entry = {"key": tile["key"]}
        for field in USER_FIELDS:
            if field in previous.get(tile["key"], {}):
                entry[field] = previous[tile["key"]][field]
        entry.update({k: tile[k] for k in ("kind", "size", "uses")})
        entry["triangles"] = triangle_count
        entry["materials"] = sorted(names)
        entry["at"] = tile["at"]
        entry["collision"] = tile["collision"]
        entries.append(entry)
    for name, stream in streams.items():
        views.append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(stream),
                      "target": 34963 if name == "indices" else 34962})
        if name != "indices":
            views[-1]["byteStride"] = struct.calcsize("<" + layouts[name][0])
        binary.extend(stream)
    doc = {
        "asset": {"version": "2.0", "generator": "Paper White 2 map_tiles.py"},
        "extensionsUsed": ["KHR_materials_unlit"],
        "scene": 0, "scenes": [{"nodes": list(range(len(nodes)))}],
        "nodes": nodes, "meshes": meshes, "materials": doc_materials, "textures": textures,
        "images": images, "samplers": samplers, "accessors": accessors, "bufferViews": views,
        "buffers": [{"byteLength": len(binary)}],
    }
    folder.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(doc, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    (folder / "tiles.glb").write_bytes(struct.pack("<4sII", b"glTF", 2, 28 + len(encoded) + len(binary))
                                       + struct.pack("<II", len(encoded), GLB_JSON) + encoded
                                       + struct.pack("<II", len(binary), GLB_BIN) + binary)
    out = {"library": library["name"], "tiles": entries, "placements": placements}
    (folder / "tiles.json").write_text(json.dumps(out, separators=(",", ":")) + "\n")


# ---------------------------------------------------------------- Composing a chunk from tiles

LAYOUTS = ROOT / "res/paperwhite2/map_layouts"
# Nitro's texture coordinates reach 2,048 texels either way
TEXEL_REACH = 2047


def plane_gradient(polygon):
    """How a polygon's UVs change across space, in its plane: for u and for v, the vector g with g . (p - p0) the
    change from its first corner to a point p of it; None for a sliver."""
    a, b, c = (v.p for v in polygon[:3])
    e1 = [b[k] - a[k] for k in range(3)]
    e2 = [c[k] - a[k] for k in range(3)]
    d11, d12, d22 = (sum(x * y for x, y in zip(e1, e1)), sum(x * y for x, y in zip(e1, e2)),
                     sum(x * y for x, y in zip(e2, e2)))
    det = d11 * d22 - d12 * d12
    if abs(det) < 1e-9 * max(d11 * d22, 1e-12):
        return None
    out = []
    for k in range(2):
        du1, du2 = polygon[1].uv[k] - polygon[0].uv[k], polygon[2].uv[k] - polygon[0].uv[k]
        alpha = (du1 * d22 - du2 * d12) / det
        beta = (du2 * d11 - du1 * d12) / det
        out.append(tuple(alpha * e1[i] + beta * e2[i] for i in range(3)))
    return out


def placed_polygons(tile, x, z, y, half):
    """A tile's polygons where a layout places it: its footprint's north-west corner on tile x, z of the chunk and its
    lowest point at height y, its UVs as the tile has them."""
    return [(material, [Vertex((v.p[0] + x * TILE - half, v.p[1] + y, v.p[2] + z * TILE - half), v.uv, v.color, v.normal)
                        for v in polygon]) for material, polygon in tile["_polygons"]]










def stitched(polygons):
    """The polygons with neighbours merged back where cutting on the tile grid split them: polygons of one material
    and one plane, whose texture runs on from one to the other, that share an edge merge while the result stays
    convex, and the corners left in the middle of a straight edge go. Ground cut from one large polygon and placed as
    it was comes back as that polygon; walls and slopes merge the same way."""
    groups = defaultdict(list)
    rest = []
    for material, polygon in polygons:
        key = stitch_key(material, polygon)
        if key is None:
            rest.append((material, polygon))
        else:
            groups[key].append(polygon)
    out = list(rest)
    for key, group in groups.items():
        for part in touching(group):
            regions = merge_regions(part) if len(part) > 1 else part
            # A region traced wrong (pieces that overlap, a pinch taken the wrong way) covers more or less than its
            # pieces did: those go together the safe way
            if regions is None or abs(sum(area(p) for p in regions) - sum(area(p) for p in part)) > 0.5:
                regions = merge_convex(part)
            out += [(key[0], polygon) for polygon in regions]
    return out


def touching(group):
    """A group's polygons by the regions they make: those sharing a corner, and so on."""
    parent = list(range(len(group)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    owner = {}
    for i, polygon in enumerate(group):
        for v in polygon:
            k = _key(v.p)
            if k in owner:
                parent[find(i)] = find(owner[k])
            else:
                owner[k] = i
    parts = defaultdict(list)
    for i, polygon in enumerate(group):
        parts[find(i)].append(polygon)
    return list(parts.values())


def stitch_key(material, polygon):
    """What two polygons must share to merge: material, plane, and the texture's run and its phase. Each corner keeps
    its own color."""
    if len(polygon) < 3:
        return None
    a, b, c = (v.p for v in polygon[:3])
    n = ((b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
         (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
         (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
    length = math.sqrt(sum(x * x for x in n))
    gradient = plane_gradient(polygon)
    if length < 1e-6 or gradient is None:
        return None
    n = tuple(x / length for x in n)
    d = sum(n[k] * a[k] for k in range(3))
    phase = [(polygon[0].uv[k] - sum(gradient[k][i] * a[i] for i in range(3))) % 1 for k in range(2)]
    return (material, tuple(round(x, 3) for x in n), round(d, 2), tuple(round(g, 4) for k in range(2) for g in gradient[k]),
            tuple(round(x, 3) % 1 for x in phase))


def _key(p):
    return tuple(round(x * 64) for x in p)


def merge_regions(group):
    """Coplanar polygons, all wound the same way, as the regions they cover, triangulated again: the edges two of them
    share cancel, the rest trace each region's outline and its holes, corners in the middle of a straight edge go, and
    each region is cut into triangles by ear clipping. None where the outlines don't trace cleanly (two pieces that
    split a shared edge differently), for merge_convex to take instead."""
    anchor = group[0]
    a, b, c = (v.p for v in anchor[:3])
    normal = ((b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
              (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
              (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
    drop = max(range(3), key=lambda k: abs(normal[k]))
    axes = [k for k in range(3) if k != drop]
    points = {}
    loops_in = []
    for polygon in group:
        loop = []
        for v in polygon:
            k = _key(v.p)
            points.setdefault(k, v)
            if not loop or loop[-1] != k:
                loop.append(k)
        if len(loop) > 1 and loop[0] == loop[-1]:
            loop.pop()
        loops_in.append(loop)
    flat = {k: (points[k].p[axes[0]], points[k].p[axes[1]]) for k in points}
    # An edge with another piece's corner along it (two pieces that split their shared edge at different points) is
    # split there, so that shared edges cancel whole
    directed = Counter()
    keys = list(points)
    for loop in loops_in:
        for i in range(len(loop)):
            u, v = loop[i], loop[(i + 1) % len(loop)]
            for a, b in zip([u] + on_segment(u, v, keys, flat), on_segment(u, v, keys, flat) + [v]):
                directed[(a, b)] += 1
    # The group's winding, as its first polygon has it in the projection, tells outlines from holes
    orientation = signed_area([flat[_key(v.p)] for v in anchor])
    boundary = defaultdict(list)
    for (u, v), count in directed.items():
        net = count - directed.get((v, u), 0)
        if net > 1:
            return None
        if net == 1:
            boundary[u].append(v)
    loops = []
    while boundary:
        start = next(iter(boundary))
        loop = [start]
        k = boundary[start].pop()
        prev = start
        while k != start:
            if not boundary.get(k):
                return None
            loop.append(k)
            # Where two regions touch at a corner, the tightest turn keeps to this region's outline
            options = boundary[k]
            choice = min(options, key=lambda n: turn(flat[prev], flat[k], flat[n], orientation)) if len(options) > 1 else options[0]
            options.remove(choice)
            prev, k = k, choice
            if len(loop) > len(points) + 1:
                return None
        for u in [u for u, vs in boundary.items() if not vs]:
            del boundary[u]
        if len(loop) < 3:
            return None
        loops.append(simplify_loop(loop, flat))
    outer = [l for l in loops if signed_area([flat[k] for k in l]) * orientation > 0]
    holes = [l for l in loops if signed_area([flat[k] for k in l]) * orientation < 0]
    for hole in holes:
        owner = next((o for o in outer if inside(flat[hole[0]], [flat[k] for k in o])), None)
        if owner is None:
            return None
        bridged = bridge(owner, hole, flat, [l for l in holes if l is not hole] + [o for o in outer if o is not owner])
        if bridged is None:
            return None
        outer[outer.index(owner)] = bridged
    out = []
    origin = anchor[0]
    gradient = plane_gradient(anchor)
    for loop in outer:
        triangles = ear_clip(loop, flat, orientation)
        if triangles is None:
            return None
        for triangle in triangles:
            polygon = []
            for k in triangle:
                v = points[k]
                uv = tuple(origin.uv[c] + sum(gradient[c][i] * (v.p[i] - origin.p[i]) for i in range(3))
                           for c in range(2))
                polygon.append(Vertex(v.p, uv, v.color, v.normal))
            out.append(polygon)
    return out


def on_segment(u, v, keys, flat):
    """The corners lying inside the segment u, v, in order along it."""
    (x1, y1), (x2, y2) = flat[u], flat[v]
    dx, dy = x2 - x1, y2 - y1
    length2 = dx * dx + dy * dy
    if length2 < 1e-12:
        return []
    found = []
    lo_x, hi_x, lo_y, hi_y = min(x1, x2) - 1e-3, max(x1, x2) + 1e-3, min(y1, y2) - 1e-3, max(y1, y2) + 1e-3
    for k in keys:
        if k in (u, v):
            continue
        x, y = flat[k]
        if not (lo_x <= x <= hi_x and lo_y <= y <= hi_y):
            continue
        t = ((x - x1) * dx + (y - y1) * dy) / length2
        if 1e-6 < t < 1 - 1e-6 and abs((x - x1) * dy - (y - y1) * dx) / math.sqrt(length2) < 2e-3:
            found.append((t, k))
    return [k for _, k in sorted(found)]


def turn(p, q, r, orientation):
    """How far a path p, q, r turns away from the side its region lies on: smallest for the sharpest turn toward it."""
    a = math.atan2(q[1] - p[1], q[0] - p[0])
    b = math.atan2(r[1] - q[1], r[0] - q[0])
    angle = (b - a + math.pi) % (2 * math.pi) - math.pi
    return -angle if orientation > 0 else angle


def signed_area(points):
    return sum(points[i - 1][0] * points[i][1] - points[i][0] * points[i - 1][1] for i in range(len(points))) / 2


def simplify_loop(loop, flat):
    out = list(loop)
    changed = True
    while changed and len(out) > 3:
        changed = False
        for i in range(len(out)):
            p, q, r = flat[out[i - 1]], flat[out[i]], flat[out[(i + 1) % len(out)]]
            if abs((q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0])) < 1e-4:
                out.pop(i)
                changed = True
                break
    return out


def inside(point, polygon):
    x, y = point
    result = False
    for i in range(len(polygon)):
        (x1, y1), (x2, y2) = polygon[i - 1], polygon[i]
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            result = not result
    return result


def _segments_cross(p1, p2, q1, q2):
    def side(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    d1, d2, d3, d4 = side(q1, q2, p1), side(q1, q2, p2), side(p1, p2, q1), side(p1, p2, q2)
    return ((d1 > 1e-9 and d2 < -1e-9) or (d1 < -1e-9 and d2 > 1e-9)) and \
        ((d3 > 1e-9 and d4 < -1e-9) or (d3 < -1e-9 and d4 > 1e-9))


def bridge(outer, hole, flat, others=()):
    """An outline with a hole joined in along a cut from one of the hole's corners to a corner of the outline it can
    see, nearest first, crossing none of the other loops."""
    edges = [(loop[i], loop[(i + 1) % len(loop)]) for loop in (outer, hole, *others) for i in range(len(loop))]
    candidates = sorted(((sum((flat[h][k] - flat[o][k]) ** 2 for k in range(2)), hi, oi)
                         for hi, h in enumerate(hole) for oi, o in enumerate(outer)))
    for _, hi, oi in candidates:
        h, o = flat[hole[hi]], flat[outer[oi]]
        if any(_segments_cross(h, o, flat[u], flat[v]) for u, v in edges if hole[hi] not in (u, v) and outer[oi] not in (u, v)):
            continue
        return outer[:oi + 1] + hole[hi:] + hole[:hi + 1] + outer[oi:]
    return None


def ear_clip(loop, flat, orientation):
    """A simple polygon's triangles, of its corners' keys, wound as the group is. A corner with nothing to its sides
    (where a hole's bridge doubles back, or three corners in a line) goes without a triangle."""
    remaining = list(loop)
    out = []
    while len(remaining) > 3:
        n = len(remaining)
        for i in range(n):
            a, b, c = remaining[i - 1], remaining[i], remaining[(i + 1) % n]
            pa, pb, pc = flat[a], flat[b], flat[c]
            cross = ((pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0])) * (1 if orientation > 0 else -1)
            if abs(cross) <= 1e-6 and (a == c or not strictly_inside_any(remaining, (a, b, c), flat)):
                remaining.pop(i)
                break
            if cross <= 1e-6:
                continue
            if strictly_inside_any(remaining, (a, b, c), flat):
                continue
            out.append((a, b, c))
            remaining.pop(i)
            break
        else:
            return None
    pa, pb, pc = (flat[k] for k in remaining)
    if abs((pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0])) > 1e-6:
        out.append(tuple(remaining))
    return out


def strictly_inside_any(remaining, triangle, flat):
    """Whether a corner other than the triangle's own lies inside it, off its edges."""
    pa, pb, pc = (flat[k] for k in triangle)
    area = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0])
    if abs(area) < 1e-9:
        return False
    for k in remaining:
        if k in triangle:
            continue
        p = flat[k]
        if p in (pa, pb, pc):
            continue
        w1 = ((pb[0] - p[0]) * (pc[1] - p[1]) - (pb[1] - p[1]) * (pc[0] - p[0])) / area
        w2 = ((pc[0] - p[0]) * (pa[1] - p[1]) - (pc[1] - p[1]) * (pa[0] - p[0])) / area
        w3 = 1 - w1 - w2
        if w1 > 1e-7 and w2 > 1e-7 and w3 > 1e-7:
            return True
    return False


def merge_convex(group):
    """Coplanar polygons, all wound the same way, merged across shared edges while each stays convex."""
    if len(group) == 1:
        return group
    anchor = group[0]
    gradient = plane_gradient(anchor)
    a, b, c = (v.p for v in anchor[:3])
    normal = ((b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
              (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
              (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
    # Projected onto the plane's two axes that its normal leaves widest
    drop = max(range(3), key=lambda k: abs(normal[k]))
    axes = [k for k in range(3) if k != drop]
    sign = 1 if normal[drop] > 0 else -1
    if drop == 1:
        sign = -sign
    points = {}
    loops = []
    for polygon in group:
        loop = []
        for v in polygon:
            k = _key(v.p)
            points.setdefault(k, v)
            if not loop or loop[-1] != k:
                loop.append(k)
        if len(loop) > 1 and loop[0] == loop[-1]:
            loop.pop()
        if len(loop) >= 3:
            loops.append(loop)

    def flat(k):
        p = points[k].p
        return (p[axes[0]], p[axes[1]])

    def convex(loop):
        n = len(loop)
        turn = 0
        for i in range(n):
            p, q, r = flat(loop[i - 1]), flat(loop[i]), flat(loop[(i + 1) % n])
            cross = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0])
            if abs(cross) < 1e-6:
                continue
            if turn == 0:
                turn = 1 if cross > 0 else -1
            elif (cross > 0) != (turn > 0):
                return False
        return True

    def simplify(loop):
        # Corners in the middle of a straight edge go
        out = list(loop)
        changed = True
        while changed and len(out) > 3:
            changed = False
            for i in range(len(out)):
                p, q, r = flat(out[i - 1]), flat(out[i]), flat(out[(i + 1) % len(out)])
                if abs((q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0])) < 1e-6:
                    out.pop(i)
                    changed = True
                    break
        return out

    alive = {i: loop for i, loop in enumerate(loops)}
    edges = {}
    for i, loop in alive.items():
        for j in range(len(loop)):
            edges[(loop[j], loop[(j + 1) % len(loop)])] = i
    merged = True
    while merged:
        merged = False
        for (u, v), i in list(edges.items()):
            j = edges.get((v, u))
            if j is None or j == i or i not in alive or j not in alive:
                continue
            a_loop, b_loop = alive[i], alive[j]
            ia = a_loop.index(u)
            ib = b_loop.index(v)
            # a: ... u -> v ...; b: ... v -> u ...; the union runs a from v round to u, then b from u round to v
            a_path = [a_loop[(ia + 1 + k) % len(a_loop)] for k in range(len(a_loop))]
            b_path = [b_loop[(ib + 1 + k) % len(b_loop)] for k in range(len(b_loop))]
            union = a_path[:-1] + b_path[:-1]
            if len(set(union)) != len(union) or not convex(union):
                continue
            for loop in (a_loop, b_loop):
                for k in range(len(loop)):
                    edges.pop((loop[k], loop[(k + 1) % len(loop)]), None)
            del alive[j]
            alive[i] = union
            for k in range(len(union)):
                edges[(union[k], union[(k + 1) % len(union)])] = i
            merged = True
    out = []
    origin = anchor[0]
    for loop in alive.values():
        loop = simplify(loop)
        polygon = []
        for k in loop:
            v = points[k]
            uv = tuple(origin.uv[c] + sum(gradient[c][i] * (v.p[i] - origin.p[i]) for i in range(3)) for c in range(2))
            polygon.append(Vertex(v.p, uv, v.color, v.normal))
        out.append(polygon)
    return out


def compose(layout_path):
    """Writes the model.glb of a layout's chunk from its tiles: the ground, merged where it's flat, then the objects,
    a draw call per material; the chunk's props stay as they were, and its data.json is marked written."""
    layout = load(Path(layout_path), load_schema(LAYOUTS / "map_layout.schema.json"))
    _, tiles, materials, _ = cut(layout["library"])
    directory = MODELS / layout["model"]
    size = layout.get("size", 32)
    half = size * TILE / 2
    cells = defaultdict(list)
    for x, z, key, y in layout["ground"]:
        if key not in tiles:
            raise DataError(f"{layout_path}: the library has no tile {key}")
        cells[(x, z)] += placed_polygons(tiles[key], x, z, y, half)
    polygons = [p for polys in cells.values() for p in polys]
    for key, x, z, y in layout.get("objects", []):
        if key not in tiles:
            raise DataError(f"{layout_path}: the library has no tile {key}")
        polygons += placed_polygons(tiles[key], x, z, y, half)
    polygons = stitched(polygons)
    data = json.loads((directory / "data.json").read_text())
    texture_set = data.get("texture_set") or data.get("texture_preview")
    if not texture_set:
        raise DataError(f"{directory}: the chunk needs a texture set")
    write_chunk_glb(directory, polygons, materials, texture_set.replace("MAP_TEXTURE_SET_", "").lower())
    if not data.get("written") or not data.get("texture_set"):
        data["texture_set"] = texture_set
        data["written"] = True
        (directory / "data.json").write_text(dumps(data) + "\n")
    return polygons


def write_chunk_glb(directory, polygons, materials, texture_set):
    """A chunk's model.glb of polygons, its mesh named as the old one's and its prop nodes kept."""
    old, _ = read_glb(directory / "model.glb")
    name = old["meshes"][0].get("name") or directory.name
    props = [n for n in old["nodes"] if n.get("name", "").startswith("bw2_prop_")]
    by_material = defaultdict(list)
    for material, polygon in polygons:
        by_material[material].append(polygon)
    # In the order the sources draw their materials, which blending depends on
    order = {key: i for i, key in enumerate(materials)}
    by_material = dict(sorted(by_material.items(), key=lambda item: order.get(item[0], len(order))))
    images, textures, samplers, doc_materials = [], [], [], []
    streams = {k: bytearray() for k in ("POSITION", "TEXCOORD_0", "COLOR_0", "NORMAL", "indices")}
    accessors = []
    layouts = {"POSITION": ("3f", "VEC3"), "TEXCOORD_0": ("2f", "VEC2"), "COLOR_0": ("3f", "VEC3"),
               "NORMAL": ("3f", "VEC3"), "indices": ("I", "SCALAR")}

    def add(stream, data, extra=None):
        fmt, kind = layouts[stream]
        accessor = {"bufferView": list(streams).index(stream), "byteOffset": len(streams[stream]),
                    "componentType": 5125 if fmt == "I" else 5126, "count": len(data), "type": kind}
        for item in data:
            streams[stream].extend(struct.pack("<" + fmt, *item) if isinstance(item, tuple) else struct.pack("<I", item))
        accessor.update(extra or {})
        accessors.append(accessor)
        return len(accessors) - 1

    primitives = []
    for key, group in by_material.items():
        material = json.loads(json.dumps(materials[key]))
        pbr = material["pbrMetallicRoughness"]
        texture = pbr.get("baseColorTexture")
        span = [0.0, 0.0]
        if texture:
            png = Path(texture["image"]).name
            uri = f"../../textures/{texture_set}/{png}"
            if not (MODELS.parent / "textures" / texture_set / png).exists():
                raise DataError(f"{directory}: the texture set {texture_set} has no {png}")
            if texture["sampler"] not in samplers:
                samplers.append(texture["sampler"])
            images.append({"uri": uri})
            width, height = struct.unpack(">II", (MODELS.parent / "textures" / texture_set / png).read_bytes()[16:24])
            span = [TEXEL_REACH / width - 1, TEXEL_REACH / height - 1]
            textures.append({"source": len(images) - 1, "sampler": samplers.index(texture["sampler"])})
            pbr["baseColorTexture"] = {"index": len(textures) - 1}
        doc_materials.append(material)
        # UVs near their texture's first repeat, which Nitro's coordinates need: moved by whole repeats where it
        # repeats, by two where it mirrors, not where it clamps
        sampler = materials[key]["pbrMetallicRoughness"].get("baseColorTexture", {}).get("sampler", {})
        steps = [{REPEAT: 1, MIRRORED_REPEAT: 2}.get(sampler.get(wrap, REPEAT)) for wrap in ("wrapS", "wrapT")]
        vertices = []
        indices = []
        # One shift for the whole draw call where its UVs span few enough repeats, so that neighbouring triangles keep
        # the same corners, which the writer's strips share; else a shift for each polygon
        whole = [[v.uv[k] for polygon in group for v in polygon] for k in range(2)]
        shared = all(max(values) - min(values) <= span[k] for k, values in enumerate(whole))
        for polygon in group:
            values = whole if shared else [[v.uv[k] for v in polygon] for k in range(2)]
            low = [math.floor(min(values[k]) / steps[k] + 1e-6) * steps[k] if steps[k] else 0 for k in range(2)]
            start = len(vertices)
            vertices += [Vertex(v.p, (v.uv[0] - low[0], v.uv[1] - low[1]), v.color, v.normal) for v in polygon]
            for i in range(1, len(polygon) - 1):
                indices += [start, start + i, start + i + 1]
        positions = [v.p for v in vertices]
        attributes = {
            "POSITION": add("POSITION", positions, {"min": [min(p[k] for p in positions) for k in range(3)],
                                                    "max": [max(p[k] for p in positions) for k in range(3)]}),
            "TEXCOORD_0": add("TEXCOORD_0", [v.uv for v in vertices]),
            "COLOR_0": add("COLOR_0", [v.color for v in vertices]),
            "NORMAL": add("NORMAL", [unit(v.normal) for v in vertices]),
        }
        primitives.append({"attributes": attributes, "indices": add("indices", indices),
                           "material": len(doc_materials) - 1})
    binary = bytearray()
    views = []
    for stream, data in streams.items():
        view = {"buffer": 0, "byteOffset": len(binary), "byteLength": len(data),
                "target": 34963 if stream == "indices" else 34962}
        if stream != "indices":
            view["byteStride"] = struct.calcsize("<" + layouts[stream][0])
        views.append(view)
        binary.extend(data)
    nodes = [{"mesh": 0, "name": name}] + props
    doc = {
        "asset": {"version": "2.0", "generator": "Paper White 2 map_tiles.py compose"},
        "extensionsUsed": ["KHR_materials_unlit"],
        "scene": 0, "scenes": [{"nodes": list(range(len(nodes))), "name": name}],
        "nodes": nodes, "meshes": [{"name": name, "primitives": primitives}], "materials": doc_materials,
        "textures": textures, "images": images, "samplers": samplers, "accessors": accessors, "bufferViews": views,
        "buffers": [{"byteLength": len(binary)}],
    }
    write_glb(directory / "model.glb", doc, bytes(binary))


def start_layout(library, model):
    """A layout of a chunk as it is: its pieces from the library's catalogue, which must have the chunk as a source."""
    _, _, _, placements = cut(library)
    if model not in placements:
        raise DataError(f"the library {library} doesn't cut {model}")
    layout = {"$schema": "../map_layout.schema.json", "library": library, "model": model, "size": 32,
              "ground": placements[model]["ground"], "objects": placements[model]["objects"]}
    LAYOUTS.mkdir(parents=True, exist_ok=True)
    path = LAYOUTS / f"{model}.json"
    path.write_text(dumps(layout) + "\n")
    return path


def unit(v):
    length = math.sqrt(sum(c * c for c in v)) or 1
    return tuple(c / length for c in v)


def list_library(name):
    data = json.loads((CATALOGUES / name / "tiles.json").read_text())
    kinds = Counter(t["kind"] for t in data["tiles"])
    print(f"{data['library']}: {len(data['tiles'])} tiles ({', '.join(f'{n} {k}' for k, n in kinds.items())})")
    for t in data["tiles"]:
        print(f"  {t['key']} {t['kind']:6} {t['size'][0]}x{t['size'][1]} used {t['uses']:4}  "
              f"{t['triangles']:4} triangles  {', '.join(t['materials'])}")


def main():
    try:
        run()
    except DataError as error:
        sys.exit(f"error: {error}")


def run():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    for command in ("slice", "list"):
        commands.add_parser(command).add_argument("library")
    start = commands.add_parser("start", help="a layout of a chunk as it is, from a library that cuts it")
    start.add_argument("library")
    start.add_argument("model")
    commands.add_parser("compose", help="write a layout's chunk's model.glb").add_argument("layout")
    args = parser.parse_args()
    if args.command == "start":
        print(start_layout(args.library, args.model))
    elif args.command == "compose":
        polygons = compose(args.layout)
        print(f"{args.layout}: {sum(len(p) - 2 for _, p in polygons)} triangles")
    elif args.command == "slice":
        tiles = slice_library(args.library)
        print(f"{args.library}: {len(tiles)} tiles")
    else:
        list_library(args.library)


if __name__ == "__main__":
    main()
