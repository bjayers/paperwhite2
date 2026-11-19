#!/usr/bin/env python3
"""Paper White 2's Entralink roguelike: the Entree Forest clearings' flower tiles, where a run's hidden item may lie.

    entralink_flowers.py            # writes res/paperwhite2/entralink/flower_tiles.json
    entralink_flowers.py --check    # says which clearings' lists differ from their models'
    entralink_flowers.py --show ZONE_ENTREE_FOREST

A tile is a flower tile when at least FLOWER_AREA of it is covered by the clearing's flower faces: its map model's
faces with a flower texture (FLOWER_TEXTURES, the forest's "hana" textures, Japanese for flower), as
tools/paperwhite2/map_reader.py clips the model's triangles to tiles. A clearing is its zone header's matrix's one
chunk (res/field/zones, res/field/matrices). The list is the clearings' shared 32 by 32 grid; the file is the editor's
to change (it shows the tiles on the Entree page's grid and toggles them): writing it again keeps each list's tiles in
their order and appends the model's tiles it lacks (so a tile the editor took off comes back), clearings in their
numbers' order and one with none left out, as the editor writes it; --check says which lists differ from their models. tools/paperwhite2/entralink_run.py packs it for the game (docs/paperwhite2/design/
entralink-roguelike-prototype.md, Step 6).
"""
import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools" / "paperwhite2"))
from tools.data import datajson  # noqa: E402

OUTPUT = ROOT / "res" / "paperwhite2" / "entralink" / "flower_tiles.json"
# The Entree Forest's flower textures (res/field/maps/textures/entree_forest/)
FLOWER_TEXTURES = {"out25_hana01", "out25_hana02", "out25_hana03", "out37_hana01"}
# How much of a tile the flowers must cover, as a fraction of it
FLOWER_AREA = 0.2


def clearings() -> dict[str, str]:
    """Each Entree Forest clearing's zone and its chunk's map model, by the zone header's matrix, in clearing number
    order."""
    result = {}
    for path in sorted((ROOT / "res" / "field" / "zones").glob("entree_forest*.json")):
        matrix = json.loads(path.read_text())["matrix"]
        maps = json.loads((ROOT / "res" / "field" / "matrices" / f"{matrix.removeprefix('MAP_MATRIX_').lower()}.json")
                          .read_text())["maps"]
        result[f"ZONE_{path.stem.upper()}"] = maps[0][0].removeprefix("MAP_MODEL_").lower()
    return dict(sorted(result.items(), key=lambda item: clearing_number(item[0])))


def clearing_number(zone: str) -> int:
    """A clearing's number, its zone's suffix (ZONE_ENTREE_FOREST is 0), the order of the file's clearings as the
    editor keeps them (editor/src/modules/entree/model.ts, setFlowerTiles)."""
    suffix = zone.removeprefix("ZONE_ENTREE_FOREST").removeprefix("_")
    return int(suffix) if suffix else 0


def flower_tiles(model: str) -> list[list[int]]:
    """A model's flower tiles, [x, z] in z then x order."""
    from map_reader import MODELS, Chunk
    chunk = Chunk(model, MODELS / model, tiles=False)
    covered = defaultdict(float)
    for (x, z), pieces in chunk.pieces.items():
        for piece in pieces:
            if piece.texture in FLOWER_TEXTURES and piece.facing != "vertical":
                covered[(x, z)] += piece.area
    return [[x, z] for (x, z), area in sorted(covered.items(), key=lambda item: (item[0][1], item[0][0]))
            if area >= FLOWER_AREA]


def generate(current: dict | None = None) -> dict:
    """The file: each clearing's flower tiles, in zone number order. A list the file has already keeps its tiles and
    their order, the model's tiles it lacks appended, so the editor's additions stay and nothing is reordered."""
    current = current or {}
    data = {"$schema": "flower_tiles.schema.json"}
    for zone, model in clearings().items():
        tiles = [list(tile) for tile in current.get(zone, [])]
        tiles += [tile for tile in flower_tiles(model) if tile not in tiles]
        # A clearing with none is left out, as the editor leaves it
        if tiles:
            data[zone] = tiles
    return data


def write(data: dict, path: Path = OUTPUT):
    text = "{\n" + ",\n".join(f"    {json.dumps(key)}: {json.dumps(value)}" for key, value in data.items()) + "\n}\n"
    path.write_text(text)


def show(tiles: list[list[int]]):
    marked = {tuple(tile) for tile in tiles}
    for z in range(32):
        print("".join("*" if (x, z) in marked else "." for x in range(32)))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="only say which clearings differ from their models")
    parser.add_argument("--show", metavar="ZONE", help="draw a clearing's flower tiles from its model")
    args = parser.parse_args()
    if args.show:
        show(flower_tiles(clearings()[args.show]))
        return
    current = json.loads(OUTPUT.read_text()) if OUTPUT.is_file() else {}
    if args.check:
        data = generate()
        differ = [zone for zone in clearings() if current.get(zone, []) != data.get(zone, [])]
        print(f"{datajson.label(OUTPUT)}: " + (f"differs from the models in {', '.join(differ)}" if differ
                                               else "as the models have it"))
        return
    data = generate(current)
    write(data)
    print(f"wrote {datajson.label(OUTPUT)}: " + ", ".join(f"{zone} {len(tiles)}" for zone, tiles in data.items()
                                                          if zone != "$schema"))


if __name__ == "__main__":
    main()
