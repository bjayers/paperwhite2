#!/usr/bin/env python3
"""New maps for Paper White 2 from the game's unused zones (docs/paperwhite2/design/map-editor.md, New zones or unused
ones): about 75 zones are empty leftovers, each with the 1x1 MAP_MATRIX_BLACK_CITY_3, no events and no warp leading
in. Turning one into a new map takes no code:

    new_map.py unused                      # the unused zones, as JSON
    new_map.py create ZONE NAME --template MAP_MODEL_X [--width 1 --height 1] [--area AREA_X] [--map-type N]
                      [--parent ZONE_Y] [--place PLACE_Z] [--copy-props]
    new_map.py route ZONE NAME --template MAP_MODEL_X --cells C,R [C,R ...] [--filler MAP_MODEL_Y] [--area ...]

create renames the zone and its scripts and text bank after NAME (tools/data/rename_constant.py: ZONE_<NAME>,
SCRIPTS_<NAME>, SCRIPTS_INIT_<NAME>, SCRIPT_TEXT_<NAME>), gives it a matrix of its own (MAP_MATRIX_<NAME>, after the
game's in generated/map_matrices.txt, res/field/matrices/<name>.json) of width by height chunks, each a new map model
(MAP_MODEL_<NAME>_<column>_<row>, after the game's in generated/map_models.txt) copied from the template: its GLB, its
collision and, with --copy-props, its props; their data.json names the template, whose container the packer copies,
and says the model is written whole, bound to the area's texture set. The zone's header takes the matrix, the area, map
type and place name given, and how the template's zone looks and sounds (area, map type, BGM, weather, battle
background, camera and its boundary, place name) where not given; its parent is itself unless given. Warps to and from the map, its
events, scripts and text are the editors' to fill.
"""
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.datajson import DataError, dumps  # noqa: E402
from tools.data.gen_constants import parse  # noqa: E402

GENERATED = ROOT / "generated"
ZONES = ROOT / "res/field/zones"
EVENTS = ROOT / "res/field/events"
MATRICES = ROOT / "res/field/matrices"
MODELS = ROOT / "res/field/maps/models"
LEFTOVER_MATRIX = "MAP_MATRIX_BLACK_CITY_3"
LEFTOVER_ZONE = "ZONE_BLACK_CITY_3"
CHUNK_FILES = ("model.glb", "terrain_0.csv", "terrain_0_splits.csv", "terrain_1.csv", "terrain_1_splits.csv")


def zone_file(constant):
    return ZONES / f"{constant.removeprefix('ZONE_').lower()}.json"


def warp_targets():
    """Every zone some warp leads to."""
    targets = set()
    for path in EVENTS.glob("*.json"):
        if path.name.endswith(".schema.json") or path.name == "order.json":
            continue
        for warp in json.loads(path.read_text()).get("warps", []):
            targets.add(warp.get("zone"))
    return targets


def code_references():
    """The zones the C code names, which a new map shouldn't take (the code may treat them specially)."""
    result = subprocess.run(["git", "grep", "-ohw", "ZONE_[A-Z0-9_]*", "--", "src", "include", "lib"], cwd=ROOT,
                            capture_output=True, text=True)
    return set(result.stdout.split())


def unused():
    """The leftover zones: the 1x1 leftover matrix, no events, no warp to them, not named by the code and not on the
    town map."""
    targets = warp_targets()
    named = code_references()
    out = []
    for constant in parse(GENERATED / "zones.txt"):
        path = zone_file(constant)
        if constant == LEFTOVER_ZONE or not path.exists():
            continue
        zone = json.loads(path.read_text())
        if zone.get("matrix") != LEFTOVER_MATRIX or constant in targets or constant in named \
                or (ROOT / "res/town_map" / path.name).exists():
            continue
        events = EVENTS / path.name
        if events.exists() and any(json.loads(events.read_text()).get(kind) for kind in ("npcs", "warps", "triggers", "bg_events")):
            continue
        out.append({"zone": constant, "file": path.stem, "parent": zone.get("parent"), "place": zone.get("place")})
    return out


def append_constant(list_name, constant):
    path = GENERATED / f"{list_name}.txt"
    if constant in parse(path):
        raise DataError(f"{constant} is in generated/{list_name}.txt already")
    text = path.read_text()
    path.write_text(text + ("" if text.endswith("\n") else "\n") + constant + "\n")


def template_zone(template):
    """The zone the template chunk belongs to, for the defaults: the zone of its cell where its matrix names cells'
    zones (the overworld's), else the first zone whose header names the matrix."""
    for path in sorted(MATRICES.glob("*.json")):
        if path.name.endswith(".schema.json"):
            continue
        matrix = json.loads(path.read_text())
        for r, row in enumerate(matrix["maps"]):
            if template not in row:
                continue
            if "zones" in matrix and matrix["zones"][r][row.index(template)]:
                zone = zone_file(matrix["zones"][r][row.index(template)])
                return json.loads(zone.read_text()) if zone.exists() else None
            constant = "MAP_MATRIX_" + path.stem.upper()
            for zone in sorted(ZONES.glob("*.json")):
                if not zone.name.endswith(".schema.json") and json.loads(zone.read_text()).get("matrix") == constant:
                    return json.loads(zone.read_text())
    return None


# What a new map takes from its template's zone where not given: how it looks and sounds
COPIED = ("map_type", "area", "bgm", "weather", "battle_bg", "camera", "cam_bound", "projection", "place")


def area_texture_set(area):
    path = ROOT / "res/field/areas" / f"{area.removeprefix('AREA_').lower()}.json"
    return json.loads(path.read_text()).get("texture_set") if path.exists() else None


def create(zone, name, template, width=1, height=1, area=None, map_type=None, parent=None, place=None, copy_props=False,
           cells=None):
    """See the module's docstring; cells, for route, makes that many chunks in a row instead of width by height."""
    name = name.lower()
    upper = name.upper()
    if not name.replace("_", "").isalnum() or not name[0].isalpha():
        raise DataError("a map's name is letters, numbers and underscores, starting with a letter")
    if zone not in {u["zone"] for u in unused()}:
        raise DataError(f"{zone} isn't one of the unused zones")
    if not (MODELS / template.removeprefix("MAP_MODEL_").lower()).is_dir():
        raise DataError(f"no map model {template}")
    defaults = template_zone(template) or {}
    old = zone.removeprefix("ZONE_")
    # The zone, its scripts and its text after the map's name
    if old != upper:
        renames = [(f"ZONE_{old}", f"ZONE_{upper}")]
        scripts = parse(GENERATED / "field_scripts.txt")
        for prefix in ("SCRIPTS_", "SCRIPTS_INIT_"):
            if f"{prefix}{old}" in scripts:
                renames.append((f"{prefix}{old}", f"{prefix}{upper}"))
        if f"SCRIPT_TEXT_{old}" in parse(GENERATED / "script_text_banks.txt"):
            renames.append((f"SCRIPT_TEXT_{old}", f"SCRIPT_TEXT_{upper}"))
        batch = ROOT / "build" / "new_map_renames.txt"
        batch.parent.mkdir(parents=True, exist_ok=True)
        batch.write_text("".join(f"{a} {b}\n" for a, b in renames))
        result = subprocess.run([sys.executable, "tools/data/rename_constant.py", "--batch", str(batch)], cwd=ROOT,
                                capture_output=True, text=True)
        if result.returncode:
            raise DataError(f"renaming failed: {result.stdout}{result.stderr}")
    zone_constant = f"ZONE_{upper}"
    # Its chunks, copied from the template
    source = MODELS / template.removeprefix("MAP_MODEL_").lower()
    data = json.loads((source / "data.json").read_text())
    area = area or defaults.get("area")
    texture_set = (area_texture_set(area) if area else None) or data.get("texture_set") or data.get("texture_preview")
    if cells is not None:
        width, height = cells, 1
    cells = []
    for row in range(height):
        line = []
        for column in range(width):
            model = f"MAP_MODEL_{upper}_{column:02}_{row:02}"
            append_constant("map_models", model)
            folder = MODELS / model.removeprefix("MAP_MODEL_").lower()
            folder.mkdir()
            for file in CHUNK_FILES:
                if (source / file).exists():
                    shutil.copy2(source / file, folder / file)
            if not copy_props:
                strip_props(folder / "model.glb")
            (folder / "data.json").write_text(dumps({"$schema": "../map_model.schema.json", "texture_set": texture_set,
                                                     "written": True, "template": template}) + "\n")
            line.append(model)
        cells.append(line)
    matrix = f"MAP_MATRIX_{upper}"
    append_constant("map_matrices", matrix)
    (MATRICES / f"{name}.json").write_text(dumps({"$schema": "map_matrix.schema.json", "maps": cells}, width=1 << 20) + "\n")
    # The header
    path = zone_file(zone_constant)
    header = json.loads(path.read_text())
    header["matrix"] = matrix
    given = {"area": area, "map_type": map_type, "place": place}
    for field in COPIED:
        value = given.get(field) if given.get(field) is not None else defaults.get(field)
        if value is not None:
            header[field] = value
    # A map of its own unless it belongs to another (an interior to its town)
    header["parent"] = parent or zone_constant
    path.write_text(dumps(header) + "\n")
    return {"zone": zone_constant, "matrix": matrix, "file": path.stem, "models": [m for line in cells for m in line]}


OVERWORLD = "MAP_MATRIX_OVERWORLD"
OVERWORLD_FILES = (MATRICES / "overworld.json", MATRICES / "overworld_2.json")


def route(zone, name, template, cells, filler=None, area=None, place=None, copy_props=False):
    """An unused zone made a route of the overworld, which the player walks onto from its neighbours without a
    loading screen (the field swaps zones by the matrix's cell, fieldmap.c Field_ShouldSwapZone): new chunks copied
    from the template in the overworld's cells given (column, row), empty now or a filler with no zone, and the zone
    named in those cells of the overworld matrix (its chunks in overworld_2's too, which the gates use, with no zone).
    With a filler model (MAP_MODEL_OVERWORLD_2_MAP_OUTTREE, _OUTSEA), the empty cells around the route get it, as the
    game rings its areas, since the field draws the chunks around the player and nothing at an empty cell. The zone's
    header has the overworld's matrix and map type 0, and the template's zone's look unless given; the area should be
    the neighbours' (the field keeps the area it warped in with as the player walks across)."""
    matrices = [json.loads(path.read_text()) for path in OVERWORLD_FILES]
    main = matrices[0]
    rows, columns = len(main["maps"]), len(main["maps"][0])
    for column, row in cells:
        if not (0 <= column < columns and 0 <= row < rows):
            raise DataError(f"{column},{row} is outside the overworld's {columns} by {rows} cells")
        if main["zones"][row][column]:
            raise DataError(f"{column},{row} is {main['zones'][row][column]}'s")
    made = create(zone, name, template, 1, 1, area, 0, None, place, copy_props, cells=len(cells))
    for (column, row), model in zip(cells, made["models"]):
        for matrix in matrices:
            matrix["maps"][row][column] = model
        main["zones"][row][column] = made["zone"]
    ringed = []
    if filler:
        taken = set(cells)
        for column, row in cells:
            for dc in (-1, 0, 1):
                for dr in (-1, 0, 1):
                    c, r = column + dc, row + dr
                    if (c, r) in taken or not (0 <= c < columns and 0 <= r < rows) or main["maps"][r][c]:
                        continue
                    for matrix in matrices:
                        matrix["maps"][r][c] = filler
                    ringed.append((c, r))
    for path, matrix in zip(OVERWORLD_FILES, matrices):
        path.write_text(dumps(matrix, width=1 << 20) + "\n")
    # The route lives in the overworld's matrix, so the matrix create made for it goes again
    own = MATRICES / f"{made['file']}.json"
    own.unlink()
    remove_constant("map_matrices", made["matrix"])
    header_path = zone_file(made["zone"])
    header = json.loads(header_path.read_text())
    header["matrix"] = OVERWORLD
    header["map_type"] = 0
    header_path.write_text(dumps(header) + "\n")
    return {**made, "matrix": OVERWORLD, "cells": cells, "fillers": ringed}


def remove_constant(list_name, constant):
    path = GENERATED / f"{list_name}.txt"
    lines = path.read_text().splitlines(keepends=True)
    if not lines or lines[-1].strip() != constant:
        raise DataError(f"{constant} isn't the last of generated/{list_name}.txt")
    path.write_text("".join(lines[:-1]))


def strip_props(glb):
    """A copied chunk without its template's props."""
    sys.path.insert(0, str(ROOT / "tools/data"))
    from map_model_data import read_glb, write_glb
    doc, binary = read_glb(glb)
    keep = [i for i, node in enumerate(doc["nodes"]) if not node.get("name", "").startswith("bw2_prop_")]
    if len(keep) == len(doc["nodes"]):
        return
    renumber = {old: new for new, old in enumerate(keep)}
    nodes = []
    for i in keep:
        node = dict(doc["nodes"][i])
        if "children" in node:
            node["children"] = [renumber[c] for c in node["children"] if c in renumber]
        nodes.append(node)
    doc["nodes"] = nodes
    for skin in doc.get("skins", []):
        skin["joints"] = [renumber[j] for j in skin["joints"]]
        if "skeleton" in skin:
            skin["skeleton"] = renumber[skin["skeleton"]]
    for scene in doc.get("scenes", []):
        scene["nodes"] = [renumber[n] for n in scene.get("nodes", []) if n in renumber]
    write_glb(glb, doc, binary)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("unused", help="the unused zones, as JSON")
    c = commands.add_parser("create", help="turn an unused zone into a new map")
    c.add_argument("zone")
    c.add_argument("name")
    c.add_argument("--template", required=True)
    c.add_argument("--width", type=int, default=1)
    c.add_argument("--height", type=int, default=1)
    c.add_argument("--area")
    c.add_argument("--map-type", type=int)
    c.add_argument("--parent")
    c.add_argument("--place")
    c.add_argument("--copy-props", action="store_true")
    r = commands.add_parser("route", help="turn an unused zone into a route of the overworld, beside others")
    r.add_argument("zone")
    r.add_argument("name")
    r.add_argument("--template", required=True)
    r.add_argument("--cells", nargs="+", required=True, help="the overworld's cells, as column,row")
    r.add_argument("--filler")
    r.add_argument("--area")
    r.add_argument("--place")
    r.add_argument("--copy-props", action="store_true")
    args = parser.parse_args()
    try:
        if args.command == "unused":
            print(json.dumps(unused(), indent=1))
        elif args.command == "route":
            cells = [tuple(int(v) for v in cell.split(",")) for cell in args.cells]
            if len(set(cells)) != len(cells) or not 1 <= len(cells) <= 16:
                raise DataError("a route is 1 to 16 different cells")
            print(json.dumps(route(args.zone, args.name, args.template, cells, args.filler, args.area, args.place,
                                   args.copy_props)))
        else:
            if not 1 <= args.width <= 8 or not 1 <= args.height <= 8:
                raise DataError("a new map is 1 to 8 chunks each way")
            print(json.dumps(create(args.zone, args.name, args.template, args.width, args.height, args.area,
                                    args.map_type, args.parent, args.place, args.copy_props)))
    except DataError as error:
        sys.exit(f"error: {error}")


if __name__ == "__main__":
    main()
