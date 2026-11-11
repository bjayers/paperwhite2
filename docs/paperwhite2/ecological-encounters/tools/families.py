#!/usr/bin/env python3
"""Build the family skeleton for the family dictionary (families/skeleton.yaml).

A family is every species linked by evolution (res/pokemon/<sp>/data.json's `evolutions`), headed by its first
stage (the baby where there is one). For each family it lists the members with their evolution method, types, base
stat total, egg groups and Pokédex text; a status (legendary, starter, fossil...); the other ways the game already
gives it (gifts and static battles in the scripts, trades, Hidden Grottoes); and the areas the hack's current
tables use it in (res/field/encounters), as a reference only.

Run from the repository's root: python3 docs/paperwhite2/ecological-encounters/tools/families.py
It writes plain YAML by hand (no PyYAML needed); the output is checked to parse when PyYAML is present.
"""

import glob
import json
import os
import re

ROOT = os.getcwd()
OUT = os.path.join(ROOT, "docs/paperwhite2/ecological-encounters/families/skeleton.yaml")

SPECIES_TXT = "generated/species.txt"

LEGENDARY = """ARTICUNO ZAPDOS MOLTRES MEWTWO RAIKOU ENTEI SUICUNE LUGIA HO_OH REGIROCK REGICE REGISTEEL LATIAS LATIOS
KYOGRE GROUDON RAYQUAZA UXIE MESPRIT AZELF DIALGA PALKIA HEATRAN REGIGIGAS GIRATINA CRESSELIA COBALION TERRAKION
VIRIZION TORNADUS THUNDURUS RESHIRAM ZEKROM LANDORUS KYUREM""".split()
MYTHICAL = """MEW CELEBI JIRACHI DEOXYS PHIONE MANAPHY DARKRAI SHAYMIN ARCEUS VICTINI KELDEO MELOETTA GENESECT""".split()
STARTERS = """BULBASAUR CHARMANDER SQUIRTLE CHIKORITA CYNDAQUIL TOTODILE TREECKO TORCHIC MUDKIP TURTWIG CHIMCHAR PIPLUP
SNIVY TEPIG OSHAWOTT""".split()
FOSSILS = """OMANYTE KABUTO AERODACTYL LILEEP ANORITH CRANIDOS SHIELDON TIRTOUGA ARCHEN""".split()
# The user's decisions (README.md, 2026-11-13 and the dictionary's plan).
NOT_WILD = {
    "ZORUA": "illusion NPCs (a child in Nimbasa, from Lostlorn)",
    "ROTOM": "a special place of its own",
    "LARVESTA": "a special Pokémon (gift)",
    "UNOWN": "on hold",
}
WILD_STARTERS = {"CHARMANDER": "rarely outside Reversal Mountain", "PIPLUP": "Dragonspiral's entrance in winter"}

GENERATIONS = [(1, 1), (152, 2), (252, 3), (387, 4), (494, 5)]


def read_species():
    names = []
    with open(SPECIES_TXT, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            names.append(line.split("=")[0].strip())
    # names[0] is SPECIES_NONE: the index is the national number.
    return names


def generation(number):
    gen = 1
    for start, g in GENERATIONS:
        if number >= start:
            gen = g
    return gen


def short(name):
    return name[len("SPECIES_"):] if name.startswith("SPECIES_") else name


def folder(sp):
    return short(sp).lower()


def load(sp):
    path = os.path.join("res/pokemon", folder(sp), "data.json")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def evo_text(method, param):
    m = method.replace("EVO_METHOD_", "").lower()
    if m == "level":
        return f"level {param}"
    if m in ("item", "item_male", "item_female"):
        return f"{m.replace('_', ' ')}: {str(param).replace('ITEM_', '').lower()}"
    if m.startswith("trade"):
        return f"{m.replace('_', ' ')}" + (f": {str(param).replace('ITEM_', '').lower()}" if param else "")
    if param not in (0, None):
        return f"{m.replace('_', ' ')} ({str(param).replace('ITEM_', '').replace('MOVE_', '').replace('SPECIES_', '').lower()})"
    return m.replace("_", " ")


def scan_scripts(names):
    """Gifts and static battles in the field scripts, by species, with the script files that hold them."""
    gift = re.compile(r"^\s+PokePartyAdd(?:Ex|Egg|NPoke)?\s+[^,]+,\s*(\w+)")
    static = re.compile(r"^\s+CallWildBattle\s+(\w+),")
    found = {}
    for path in sorted(glob.glob("res/field/scripts/*.s")):
        base = os.path.basename(path)[:-2]
        with open(path, encoding="utf-8", errors="replace") as f:
            for line in f:
                for kind, pattern in (("gift", gift), ("static", static)):
                    m = pattern.match(line)
                    if not m:
                        continue
                    arg = m.group(1)
                    if arg.startswith("SPECIES_"):
                        sp = arg
                    elif arg.isdigit() and 0 < int(arg) < len(names):
                        sp = names[int(arg)]
                    else:
                        continue  # a variable: set elsewhere
                    found.setdefault(sp, set()).add(f"{kind} ({base})")
    return found


def scan_trades():
    found = {}
    for path in sorted(p for p in glob.glob("res/field/trades/*.json") if not p.endswith(".schema.json")):
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        found.setdefault(d["species"], set()).add(f"trade ({os.path.basename(path)[:-5]})")
    return found


def scan_grottoes():
    found = {}
    for path in sorted(p for p in glob.glob("res/field/grottoes/*.json") if not p.endswith(".schema.json")):
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        for version in ("white2",):
            for slot in d.get(version, []):
                for g in slot.get("groups", []):
                    found.setdefault(g["species"], set()).add(f"grotto ({os.path.basename(path)[:-5]})")
    return found


def scan_current():
    """The hack's current tables: area → methods per species, a reference for what the user already chose."""
    found = {}
    for path in sorted(glob.glob("res/field/encounters/*.json")):
        area = os.path.basename(path)[:-5]
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        for season, table in d.items():
            if not isinstance(table, dict):
                continue
            for method, slots in table.items():
                if method == "rates" or not isinstance(slots, list):
                    continue
                for slot in slots:
                    sp = slot[0] if isinstance(slot, list) else slot.get("species")
                    if not sp or sp == "SPECIES_NONE":
                        continue
                    found.setdefault(sp, {}).setdefault(area, set()).add(method)
    return found


def q(s):
    """A YAML double-quoted scalar."""
    return json.dumps(s, ensure_ascii=False)


def main():
    names = read_species()
    national = {sp: i for i, sp in enumerate(names) if 0 < i <= 649}
    data = {sp: load(sp) for sp in national}
    parent = {}
    children = {}
    for sp, d in data.items():
        for e in (d or {}).get("evolutions", []) or []:
            child = e["species"]
            if child == "SPECIES_NONE" or child not in national:
                continue
            parent.setdefault(child, (sp, evo_text(e["method"], e["param"])))
            children.setdefault(sp, []).append(child)

    def root(sp):
        while sp in parent:
            sp = parent[sp][0]
        return sp

    families = {}
    for sp in sorted(national, key=national.get):
        families.setdefault(root(sp), []).append(sp)

    sources = {}
    for found in (scan_scripts(names), scan_trades(), scan_grottoes()):
        for sp, s in found.items():
            sources.setdefault(sp, set()).update(s)
    current = scan_current()

    lines = [
        "# The family skeleton, generated by tools/families.py from res/ (don't edit: the batches hold the decisions).",
        "# Each family: its members (stage, evolution, types, base stat total, egg groups, Pokédex entry), a status",
        "# from the user's decisions, the game's other sources (gifts, static battles, trades, Hidden Grottoes) and the",
        "# areas of the hack's current tables (a reference: the new placements start from ecology).",
        "",
        "families:",
    ]
    for head in sorted(families, key=national.get):
        members = families[head]
        ids = [short(m) for m in members]
        status = []
        for m in ids:
            if m in LEGENDARY:
                status.append(f"legendary ({m.lower()})")
            if m in MYTHICAL:
                status.append(f"mythical ({m.lower()})")
            if m in FOSSILS:
                status.append("fossil")
            if m in STARTERS:
                status.append("starter (wild: " + WILD_STARTERS[m] + ")" if m in WILD_STARTERS else "starter (grottoes, by hand)")
            if m in NOT_WILD:
                status.append(f"not wild: {NOT_WILD[m]}")
        lines.append(f"  - id: {short(head).lower()}")
        lines.append(f"    generation: {generation(national[head])}")
        if status:
            lines.append(f"    status: [{', '.join(q(s) for s in status)}]")
        lines.append("    members:")
        for m in members:
            d = data[m] or {}
            bst = sum(d.get("base_stats", {}).values())
            types = "/".join(t.replace("TYPE_", "").lower() for t in dict.fromkeys(d.get("types", [])))
            eggs = "/".join(e.replace("EGG_GROUP_", "").lower() for e in dict.fromkeys(d.get("egg_groups", [])))
            lines.append(f"      - species: {short(m)}")
            lines.append(f"        number: {national[m]}")
            if m in parent:
                lines.append(f"        from: {short(parent[m][0])}")
                lines.append(f"        by: {q(parent[m][1])}")
            lines.append(f"        types: {types}")
            lines.append(f"        bst: {bst}")
            lines.append(f"        egg_groups: {eggs}")
            forms = d.get("forms", {}).get("count", 1)
            if forms > 1:
                lines.append(f"        forms: {forms}")
            entry = d.get("pokedex", {}).get("entry", "").replace("\n", " ")
            category = d.get("pokedex", {}).get("category", "")
            if entry:
                lines.append(f"        dex: {q(category + ': ' + entry)}")
            if m in sources:
                lines.append(f"        sources: [{', '.join(q(s) for s in sorted(sources[m]))}]")
            if m in current:
                where = ", ".join(f"{a} ({'/'.join(sorted(ms))})" for a, ms in sorted(current[m].items()))
                lines.append(f"        current: {q(where)}")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    try:
        import yaml

        with open(OUT, encoding="utf-8") as f:
            n = len(yaml.safe_load(f)["families"])
        print(f"{n} families written to {os.path.relpath(OUT, ROOT)}")
    except ImportError:
        print(f"{len(families)} families written to {os.path.relpath(OUT, ROOT)} (PyYAML missing: not checked)")


if __name__ == "__main__":
    main()
