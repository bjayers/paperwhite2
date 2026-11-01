#!/usr/bin/env python3
"""Paper White 2's map tile libraries, res/paperwhite2/map_tiles/<library>/: pieces of the game's map chunks, cut on
the tile grid, for the editor's Map Editor to build new chunks from (docs/paperwhite2/design/map-editor.md).

    map_tiles.py slice LIBRARY      # cut the library's source chunks into tiles.glb and tiles.json
    map_tiles.py list LIBRARY       # the library's tiles, for checking

A library's library.json names its source chunks (map model folders of res/field/maps/models/). Slicing reads each
chunk's model.glb and terrain_0.csv and cuts its triangles into pieces of two kinds:
- ground: the chunk's large connected meshes (paths, grass, cliffs, water, ledges), clipped to each tile's square,
  so a piece is what the chunk draws over one tile;
- objects: small meshes (a tree, a sign, a fence post), with any small meshes their footprint overlaps (a tree's
  trunk and its leaves), kept whole, with a footprint of whole tiles.
Pieces that are the same geometry wherever they stand are one tile, counted: its position, UVs (moved by whole
repeats where the texture wraps) and colors, its materials named the same. Each piece starts at its footprint's
north-west corner and its lowest point, which is where the editor places it.

The catalogue is generated into build/map_tiles/<library>/: tiles.glb holds one node per tile, named by its key, its
mesh's primitives one per material, the texture images named by path from the GLB; tiles.json lists the tiles, the
most used first: each one's key, kind, footprint, how many times and where the sources use it, its triangles and
materials, and its first source's terrain rows, for its collision. library.json's "tiles" holds the user's name,
category and hidden flag for tiles by key, which the catalogue copies.
"""
import argparse
import hashlib
import json
import math
import struct
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/data"))
from map_model_data import GLB_BIN, GLB_JSON, accessor_values, read_glb  # noqa: E402
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


def chunk_triangles(directory):
    """The chunk's triangles as (material key, three vertices), and its materials by key."""
    doc, binary = read_glb(directory / "model.glb")
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
        for tx in range(math.floor((box[0] + half) / TILE), math.ceil((box[1] + half) / TILE)):
            for tz in range(math.floor((box[2] + half) / TILE), math.ceil((box[3] + half) / TILE)):
                x0, z0 = tx * TILE - half, tz * TILE - half
                part = polygon
                for axis, limit, below in ((0, x0, False), (0, x0 + TILE, True), (2, z0, False), (2, z0 + TILE, True)):
                    part = clip(part, axis, limit, below)
                    if len(part) < 3:
                        break
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


def uv_gradient(polygon):
    """How a polygon's UVs change across x and z, (du/dx, du/dz, dv/dx, dv/dz), or None for a wall."""
    a, b, c = polygon[0], polygon[1], polygon[2]
    dx1, dz1 = b.p[0] - a.p[0], b.p[2] - a.p[2]
    dx2, dz2 = c.p[0] - a.p[0], c.p[2] - a.p[2]
    det = dx1 * dz2 - dx2 * dz1
    if abs(det) < 1e-3:
        return None
    out = []
    for k in range(2):
        du1, du2 = b.uv[k] - a.uv[k], c.uv[k] - a.uv[k]
        out += [(du1 * dz2 - du2 * dz1) / det, (dx1 * du2 - dx2 * du1) / det]
    return tuple(out)


def height_at(polygon, x, z):
    """The polygon's height at a point of its XZ footprint, or None outside it."""
    for i in range(1, len(polygon) - 1):
        a, b, c = polygon[0].p, polygon[i].p, polygon[i + 1].p
        d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2])
        if abs(d) < 1e-6:
            continue
        l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d
        l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d
        l3 = 1 - l1 - l2
        if min(l1, l2, l3) >= -1e-4:
            return l1 * a[1] + l2 * b[1] + l3 * c[1]
    return None


def surface(polygons):
    """A ground piece's key, by what it looks like rather than how the chunk cut it into triangles: the materials and
    heights over a 4 by 4 grid of points, its walls' materials and extents, and how each material's texture runs
    across it. Where the texture starts isn't part of it: the editor moves a placed tile's UVs to suit where it
    stands (map-editor.md, Tile library)."""
    samples = []
    for i in range(4):
        for j in range(4):
            x, z = (i + 0.5) * TILE / 4, (j + 0.5) * TILE / 4
            hits = []
            for material, polygon in polygons:
                y = height_at(polygon, x, z)
                if y is not None:
                    hits.append((round(y), json.loads(material)["name"]))
            samples.append(tuple(sorted(hits)))
    walls = set()
    mappings = set()
    for material, polygon in polygons:
        name = json.loads(material)["name"]
        gradient = uv_gradient(polygon)
        if gradient is None:
            walls.add((name, *(round(v) for v in bounds(polygon)), round(min(v.p[1] for v in polygon)),
                       round(max(v.p[1] for v in polygon))))
        else:
            mappings.add((name, *(round(g, 3) for g in gradient)))
    return [tuple(samples), tuple(sorted(walls)), tuple(sorted(mappings))]


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
        canonical = surface(moved)
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
    rows = read_csv(directory / "terrain_0.csv", HEIGHT_FIELDS)
    return {(row["x"], row["z"]): {k: row[k] for k in HEIGHT_FIELDS[2:]} for row in rows}


def chunk_half(triangles):
    """Half the chunk's span: most are 32 tiles across, Skyarrow Bridge's 128 and the League's 64."""
    extent = max(abs(c) for _, polygon in triangles for v in polygon for c in (v.p[0], v.p[2]))
    for half in (256, 512, 1024):
        if extent <= half + TILE * 2:
            return half
    raise ValueError("chunk is wider than any map type's")


def slice_library(name):
    folder = LIBRARIES / name
    library = json.loads((folder / "library.json").read_text())
    previous = library.get("tiles", {})
    tiles = {}
    materials = {}
    for source in library["sources"]:
        directory = MODELS / source
        triangles, chunk_materials = chunk_triangles(directory)
        materials.update(chunk_materials)
        terrain = terrain_rows(directory)
        half = chunk_half(triangles)
        for piece in pieces(triangles, half):
            kind, tx, tz, width, depth, polygons = piece
            key, base, moved = normalized(piece, half, materials)
            tile = tiles.get(key)
            if tile is None:
                collision = [[terrain.get((tx + x, tz + z)) for x in range(width)] for z in range(depth)]
                tile = tiles[key] = {"key": key, "kind": kind, "size": [width, depth], "uses": 0, "at": [],
                                     "collision": collision, "_polygons": moved}
            tile["uses"] += 1
            if len(tile["at"]) < 8:
                tile["at"].append({"model": source, "x": tx, "z": tz, "y": base})
    write_library(CATALOGUES / name, library, tiles, materials, previous)
    return tiles


def write_library(folder, library, tiles, materials, previous):
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
        for material, polygon in tile.pop("_polygons"):
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
    out = {"library": library["name"], "tiles": entries}
    (folder / "tiles.json").write_text(json.dumps(out, separators=(",", ":")) + "\n")


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
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    for command in ("slice", "list"):
        commands.add_parser(command).add_argument("library")
    args = parser.parse_args()
    if args.command == "slice":
        tiles = slice_library(args.library)
        print(f"{args.library}: {len(tiles)} tiles")
    else:
        list_library(args.library)


if __name__ == "__main__":
    main()
