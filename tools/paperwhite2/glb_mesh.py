"""Meshes of GLBs as Paper White 2's map tools handle them: a map chunk's or a map object's triangles, each with its
material, read from a GLB, and polygons written into one, a draw call per material (map_maker.py, the editor's object
library; docs/paperwhite2/design/map-editor.md).

A material is held as the GLB has it, but with its texture as {"image": <path from the checkout's root>, "sampler":
{...}}, so that a material read from one GLB writes into another wherever it lies. Positions are as the mesh draws
them: the map chunks' one joint is at the origin, which read_mesh checks.
"""
import json
import math
import os
import struct
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/data"))
from map_model_data import accessor_values, read_glb, write_glb  # noqa: E402

REPEAT, MIRRORED_REPEAT = 10497, 33648
# Nitro's texture coordinates reach 2,048 texels either way
TEXEL_REACH = 2047


class Vertex:
    __slots__ = ("p", "uv", "color", "normal")

    def __init__(self, p, uv=(0.0, 0.0), color=(1.0, 1.0, 1.0), normal=(0.0, 1.0, 0.0)):
        self.p, self.uv, self.color, self.normal = p, uv, color, normal

    def moved(self, dx, dy, dz):
        return Vertex((self.p[0] + dx, self.p[1] + dy, self.p[2] + dz), self.uv, self.color, self.normal)


def _identity(matrix):
    return all(abs(v - (1 if i % 5 == 0 else 0)) < 1e-5 for i, v in enumerate(matrix))


def _matrices(doc, binary, index):
    accessor = doc["accessors"][index]
    view = doc["bufferViews"][accessor["bufferView"]]
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return [struct.unpack_from("<16f", binary, offset + 64 * i) for i in range(accessor["count"])]


def _colors(doc, binary, accessor, count):
    if accessor is None:
        return [(1.0, 1.0, 1.0)] * count
    scale = {5121: 255, 5123: 65535}.get(doc["accessors"][accessor]["componentType"], 1)
    return [tuple(c / scale for c in v[:3]) for v in accessor_values(doc, binary, accessor)]


def material_of(doc, index, directory):
    """A GLB's material, its texture's image as a path from the root, and a key for it: its name and all that draws it."""
    source = doc["materials"][index] if index is not None else {"name": "untextured"}
    material = {k: v for k, v in source.items() if k != "pbrMetallicRoughness"}
    pbr = dict(source.get("pbrMetallicRoughness", {}))
    if "baseColorTexture" in pbr:
        texture = doc["textures"][pbr["baseColorTexture"]["index"]]
        image = (directory / doc["images"][texture["source"]]["uri"]).resolve()
        sampler = doc["samplers"][texture["sampler"]] if "sampler" in texture else {}
        pbr["baseColorTexture"] = {"image": image.relative_to(ROOT).as_posix(), "sampler": sampler}
    material["pbrMetallicRoughness"] = pbr
    return json.dumps(material, sort_keys=True), material


def read_mesh(path, images_from=None):
    """A GLB's triangles as (material key, [three Vertex]), its materials by key, in the order it draws them, and
    each triangle's (draw call, number in it). images_from is the folder its images' paths start from, where the GLB
    is a copy kept elsewhere (its own folder otherwise)."""
    path = Path(path)
    doc, binary = read_glb(path)
    if len(doc["meshes"]) != 1:
        raise ValueError(f"{path}: expected one mesh")
    for node in doc["nodes"]:
        if "mesh" in node and any(k in node for k in ("matrix", "translation", "rotation", "scale")):
            raise ValueError(f"{path}: the mesh's node is moved")
    for skin in doc.get("skins", []):
        if not all(_identity(m) for m in _matrices(doc, binary, skin["inverseBindMatrices"])):
            raise ValueError(f"{path}: a joint isn't at the origin")
    materials = {}
    triangles = []
    ids = []
    for number, primitive in enumerate(doc["meshes"][0]["primitives"]):
        if primitive.get("mode", 4) != 4:
            raise ValueError(f"{path}: only triangles are supported")
        key, material = material_of(doc, primitive.get("material"), Path(images_from) if images_from else path.parent)
        materials[key] = material
        a = primitive["attributes"]
        positions = accessor_values(doc, binary, a["POSITION"])
        n = len(positions)
        uvs = accessor_values(doc, binary, a["TEXCOORD_0"]) if "TEXCOORD_0" in a else [(0.0, 0.0)] * n
        colors = _colors(doc, binary, a.get("COLOR_0"), n)
        normals = accessor_values(doc, binary, a["NORMAL"]) if "NORMAL" in a else [(0.0, 1.0, 0.0)] * n
        indices = [i[0] for i in accessor_values(doc, binary, primitive["indices"])]
        for t in range(0, len(indices), 3):
            triangles.append((key, [Vertex(positions[i], uvs[i], colors[i], normals[i]) for i in indices[t:t + 3]]))
            ids.append((number, t // 3))
    return triangles, materials, ids


def png_size(path):
    return struct.unpack(">II", Path(path).read_bytes()[16:24])


def _unit(v):
    length = math.sqrt(sum(c * c for c in v)) or 1
    return tuple(c / length for c in v)


def write_mesh(path, name, polygons, materials, extra_nodes=()):
    """Writes polygons (material key, [Vertex, ...], convex) as a GLB's one mesh, a draw call per material in the
    order of materials, each image named by its path from the GLB. UVs are moved by whole repeats near the texture's
    first (two where it mirrors, none where it clamps), together for a draw call whose UVs stay in Nitro's reach, so
    that neighbouring triangles keep the same corners, else for each polygon. extra_nodes (a chunk's props) follow
    the mesh's node."""
    path = Path(path)
    by_material = defaultdict(list)
    for material, polygon in polygons:
        by_material[material].append(polygon)
    order = {key: i for i, key in enumerate(materials)}
    by_material = dict(sorted(by_material.items(), key=lambda item: order.get(item[0], len(order))))
    images, textures, samplers, doc_materials = [], [], [], []
    streams = {k: bytearray() for k in ("POSITION", "TEXCOORD_0", "COLOR_0", "NORMAL", "indices")}
    layouts = {"POSITION": ("3f", "VEC3"), "TEXCOORD_0": ("2f", "VEC2"), "COLOR_0": ("3f", "VEC3"),
               "NORMAL": ("3f", "VEC3"), "indices": ("I", "SCALAR")}
    accessors = []

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
        span = [math.inf, math.inf]
        sampler = {}
        if texture:
            image = ROOT / texture["image"]
            if not image.exists():
                raise ValueError(f"{path}: no texture {texture['image']}")
            sampler = texture["sampler"]
            if sampler not in samplers:
                samplers.append(sampler)
            images.append({"uri": os.path.relpath(image, path.parent).replace(os.sep, "/")})
            width, height = png_size(image)
            span = [TEXEL_REACH / width - 1, TEXEL_REACH / height - 1]
            textures.append({"source": len(images) - 1, "sampler": samplers.index(sampler)})
            pbr["baseColorTexture"] = {"index": len(textures) - 1}
        doc_materials.append(material)
        steps = [{REPEAT: 1, MIRRORED_REPEAT: 2}.get(sampler.get(wrap, REPEAT)) for wrap in ("wrapS", "wrapT")]
        whole = [[v.uv[k] for polygon in group for v in polygon] for k in range(2)]
        shared = all(max(values) - min(values) <= span[k] for k, values in enumerate(whole))
        vertices, indices = [], []
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
            "TEXCOORD_0": add("TEXCOORD_0", [tuple(v.uv) for v in vertices]),
            "COLOR_0": add("COLOR_0", [tuple(v.color) for v in vertices]),
            "NORMAL": add("NORMAL", [_unit(v.normal) for v in vertices]),
        }
        primitives.append({"attributes": attributes, "indices": add("indices", indices), "material": len(doc_materials) - 1})
    binary = bytearray()
    views = []
    for stream, data in streams.items():
        view = {"buffer": 0, "byteOffset": len(binary), "byteLength": len(data),
                "target": 34963 if stream == "indices" else 34962}
        if stream != "indices":
            view["byteStride"] = struct.calcsize("<" + layouts[stream][0])
        views.append(view)
        binary.extend(data)
    nodes = [{"mesh": 0, "name": name}] + list(extra_nodes)
    doc = {
        "asset": {"version": "2.0", "generator": "Paper White 2 glb_mesh.py"},
        "extensionsUsed": ["KHR_materials_unlit"],
        "scene": 0, "scenes": [{"nodes": list(range(len(nodes))), "name": name}],
        "nodes": nodes, "meshes": [{"name": name, "primitives": primitives}], "materials": doc_materials,
        "textures": textures, "images": images, "samplers": samplers, "accessors": accessors, "bufferViews": views,
        "buffers": [{"byteLength": len(binary)}],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    write_glb(path, doc, bytes(binary))
