#!/usr/bin/env python3
"""What a map chunk costs the DS: its model.glb packed as the build packs it (map_model_data.py's written model,
nitro_model_writer.py's display lists, strips or quads), and its vertex commands and polygons counted (a quad one),
as the GPU's vertex and polygon RAM take them. A GLB's own vertices say little of this: the writer shares corners
by value along strips, whatever the GLB does.

    map_cost.py MODEL      # JSON: {"vertices": ..., "polygons": ..., "triangles": ...}
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools/data"))
import map_model_data  # noqa: E402
import nitro_model_writer  # noqa: E402
from map_texture_data import with_imports  # noqa: E402

MODELS = ROOT / "res/field/maps/models"
TEXTURES = ROOT / "res/field/maps/textures"


def cost(model):
    folder = MODELS / model
    doc, binary = map_model_data.read_glb(folder / "model.glb")
    primitives = [p for mesh in doc["meshes"] for p in mesh["primitives"]]
    data = json.loads((folder / "data.json").read_text())
    texture_set = (data.get("texture_set") or data.get("texture_preview") or "").removeprefix("MAP_TEXTURE_SET_").lower()
    textures = texture_blob(texture_set)
    bmd = map_model_data.written_model(None, doc, primitives, binary, textures, "cost")
    vertices = polygons = triangles = 0
    for shape in nitro_model_writer.read_model(bmd).shapes:
        ops, quads = nitro_model_writer._counts(shape[3])
        drawn = len(nitro_model_writer.decode_display_list(shape[3]))
        vertices += ops
        triangles += drawn
        polygons += drawn - quads
    return {"vertices": vertices, "polygons": polygons, "triangles": triangles}


def texture_blob(name):
    """The texture set as the ROM packs it, with the textures its imports.json adds (only names and sizes matter)."""
    from graphics_paths import directories
    from narc import read_narc

    for version in ("w2_us", "b2_us"):
        archive = ROOT / "extract" / version / "files/a/0/1/4"
        if archive.exists():
            folders = directories("a/0/1/4")
            names = [d.name for d in folders]
            return with_imports(read_narc(archive.read_bytes()), folders)[names.index(name)]
    raise SystemExit("map_cost.py needs the extracted ROM (extract/w2_us) for the texture sets")


if __name__ == "__main__":
    print(json.dumps(cost(sys.argv[1])))
