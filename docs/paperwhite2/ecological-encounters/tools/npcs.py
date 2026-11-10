# Lists the Pokémon placed as NPCs in zones (res/field/events/<zone>.json), by their object codes, whether a model is
# named or given by number. Unnamed codes (OBJ_CODE_128) have sprites of their own that may be Pokémon (128 is a Patrat,
# 306 a Lillipup, the user says): they're listed apart, and KNOWN names those the user has identified. Run from the repository: python3 docs/paperwhite2/ecological-encounters/tools/npcs.py ZONE...
import json, sys
from pathlib import Path

sys.path.insert(0, ".")
from tools.data.datajson import constants  # noqa: E402

KNOWN = {"OBJ_CODE_128": "PATRAT", "OBJ_CODE_306": "LILLIPUP"}
codes = {}
for name, value in constants().items():
    if name.startswith("OBJ_CODE_"):
        codes.setdefault(value, name)
for zone in sys.argv[1:]:
    npcs = json.loads(Path(f"res/field/events/{zone}.json").read_text())["npcs"]
    found, unnamed = {}, {}
    for npc in npcs:
        model = npc["model"]
        name = codes.get(model, str(model)) if isinstance(model, int) else model
        if name in KNOWN:
            name = "OBJ_CODE_POKEMON_" + KNOWN[name]
        if "POKEMON" in name or "FOLLOWER" in name:
            label = name.removeprefix("OBJ_CODE_").removeprefix("POKEMON_").removeprefix("FOLLOWER_")
            found[label] = found.get(label, 0) + 1
        elif name.removeprefix("OBJ_CODE_").isdigit():
            unnamed[name] = unnamed.get(name, 0) + 1
    line = ", ".join(f"{k}" + (f" x{n}" if n > 1 else "") for k, n in sorted(found.items()))
    if unnamed:
        line += " | unnamed codes: " + ", ".join(f"{k}" + (f" x{n}" if n > 1 else "") for k, n in sorted(unnamed.items()))
    print(f"{zone}: {line}")
