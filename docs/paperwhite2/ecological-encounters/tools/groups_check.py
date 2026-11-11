# Compares the Encounter Editor's groups (res/paperwhite2/encounters/groups.json) with the places of places/*.yaml:
# each place of several maps should have a group of exactly its maps, and every map should be in a place. Groups that
# span several places are listed, so a habitat naming one is known to land in each. Run from the repository:
#   python3 docs/paperwhite2/ecological-encounters/tools/groups_check.py
import glob
import json

import yaml

groups = {g["name"]: sorted(g["areas"]) for g in json.load(open("res/paperwhite2/encounters/groups.json"))["groups"]}
places = {}
for path in sorted(glob.glob("docs/paperwhite2/ecological-encounters/places/*.yaml")):
    for place in yaml.safe_load(open(path))["places"]:
        places[place["id"]] = sorted(place["maps"])
by_maps = {tuple(maps): name for name, maps in groups.items()}
print("Places of several maps without a group of exactly their maps:")
for pid, maps in places.items():
    if len(maps) > 1 and tuple(maps) not in by_maps:
        print(f"  {pid}: {maps}")
print("Groups spanning several places:")
place_of = {m: pid for pid, maps in places.items() for m in maps}
for name, maps in groups.items():
    spans = sorted({place_of.get(m, f"(no place: {m})") for m in maps})
    if len(spans) > 1:
        print(f"  {name}: {spans}")
