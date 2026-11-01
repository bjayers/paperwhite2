#!/usr/bin/env python3
"""Paper White 2's map object library, res/paperwhite2/map_objects/<object>/: whole objects (a tree, a ledge, a
doorway) saved from the game's map chunks, to place on existing maps and on the Map Editor's generated ones
(docs/paperwhite2/design/map-editor.md, Painting maps).

    map_objects.py save NAME CHUNK_FOLDER FACES ANCHOR SIZE [--category C]

save writes the object from a chunk's faces: FACES is JSON, [{"primitive": n, "triangles": [...]}, ...], the draw
calls and triangles of the chunk's model.glb; ANCHOR is x,y,z, the footprint's north-west corner in the chunk's own
coordinates at the height of the ground under it; SIZE is the footprint, w,d tiles. The object's model.glb holds the
faces moved to that origin (x east and z south from the corner, y up from the ground), each material's image the
PNG of the set it came from; object.json (map_object.schema.json) its name, category, footprint, the tile types the
chunk's collision has under it, its textures (<set>/<png>), and where it came from.
"""
import argparse
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools/paperwhite2"))
from tools.data.datajson import DataError, dumps  # noqa: E402
from glb_mesh import read_mesh, write_mesh  # noqa: E402

LIBRARY = ROOT / "res/paperwhite2/map_objects"
MODELS = ROOT / "res/field/maps/models"
TILE = 16


def slug(name):
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_") or "object"


def save(name, chunk, faces, anchor, size, category=None):
    folder = MODELS / chunk
    if not (folder / "model.glb").exists():
        raise DataError(f"no map model {chunk}")
    wanted = {(f["primitive"], t) for f in faces for t in f["triangles"]}
    triangles, materials, ids = read_mesh(folder / "model.glb")
    chosen = [(key, [v.moved(-anchor[0], -anchor[1], -anchor[2]) for v in tri])
              for (key, tri), at in zip(triangles, ids) if at in wanted]
    if not chosen:
        raise DataError("no faces chosen")
    used = {key: materials[key] for key, _ in chosen}
    ident = slug(name)
    n = 2
    while (LIBRARY / ident).exists():
        ident = f"{slug(name)}_{n}"
        n += 1
    out = LIBRARY / ident
    write_mesh(out / "model.glb", ident, chosen, used)
    # The collision under it: each footprint tile's type, as the chunk has it
    half = 256
    tx0, tz0 = round((anchor[0] + half) / TILE), round((anchor[2] + half) / TILE)
    rows = {(int(r["x"]), int(r["z"])): int(r["tile_type"]) for r in csv.DictReader((folder / "terrain_0.csv").open())}
    collision = [[rows.get((tx0 + x, tz0 + z)) for x in range(size[0])] for z in range(size[1])]
    textures = sorted({"/".join(m["pbrMetallicRoughness"]["baseColorTexture"]["image"].split("/")[-2:])
                       for m in used.values() if "baseColorTexture" in m["pbrMetallicRoughness"]})
    data = {"$schema": "../map_object.schema.json", "name": name}
    if category:
        data["category"] = category
    data.update({"size": list(size), "collision": collision, "textures": textures,
                 "source": {"model": chunk, "x": tx0, "z": tz0}, "triangles": len(chosen)})
    (out / "object.json").write_text(dumps(data) + "\n")
    return {"id": ident, "path": str((out / "object.json").relative_to(ROOT))}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    s = commands.add_parser("save", help="save faces of a chunk as an object")
    s.add_argument("name")
    s.add_argument("chunk")
    s.add_argument("faces")
    s.add_argument("anchor")
    s.add_argument("size")
    s.add_argument("--category")
    args = parser.parse_args()
    try:
        anchor = [float(v) for v in args.anchor.split(",")]
        size = [int(v) for v in args.size.split(",")]
        if len(anchor) != 3 or len(size) != 2 or not all(1 <= v <= 16 for v in size):
            raise DataError("an anchor is x,y,z and a size w,d of 1 to 16 tiles")
        print(json.dumps(save(args.name, args.chunk, json.loads(args.faces), anchor, size, args.category)))
    except DataError as error:
        sys.exit(f"error: {error}")


if __name__ == "__main__":
    main()
