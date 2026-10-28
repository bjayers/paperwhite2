"""Export the terrain CSVs of the map chunks the hack changed, and check them against res/.

Usage: map_terrain_import.py BASE_FILES HACK_FILES OUTPUT
For each changed chunk, exports the base and the hack terrain to OUTPUT/{base,hack}/<model>/ and reports whether
the base export equals res/'s CSVs (so the hack's CSVs can replace them) and whether patching the hack's CSVs into
the base chunk rebuilds the hack's chunk byte for byte.
"""

import filecmp
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools/data"))
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from narc import read_narc
from map_terrain_data import export_terrains, patch_terrains
from tools.data.gen_constants import load as load_list

RES = Path(__file__).resolve().parents[2] / "res/field/maps/models"


def main():
    base = read_narc((Path(sys.argv[1]) / "a/0/0/8").read_bytes())
    hack = read_narc((Path(sys.argv[2]) / "a/0/0/8").read_bytes())
    output = Path(sys.argv[3])
    names = {v: k.removeprefix("MAP_MODEL_").lower() for k, v in load_list("map_models").items()}
    for i, (b, h) in enumerate(zip(base, hack)):
        if b == h:
            continue
        name = names[i]
        for kind, chunk in (("base", b), ("hack", h)):
            (output / kind / name).mkdir(parents=True, exist_ok=True)
            export_terrains(chunk, output / kind / name)
        csvs = sorted(p.name for p in (output / "base" / name).glob("*.csv"))
        same_as_res = all(filecmp.cmp(output / "base" / name / c, RES / name / c, shallow=False) for c in csvs)
        try:
            rebuilt = patch_terrains(b, output / "hack" / name) == h
        except Exception as error:  # report, keep going
            rebuilt = f"error: {error}"
        print(f"{name}: base export == res: {same_as_res}; hack CSVs rebuild hack chunk: {rebuilt}")


main()
