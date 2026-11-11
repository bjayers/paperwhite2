#!/usr/bin/env python3
"""The family dictionary's balance pass: what each place's tables would hold, and what looks wrong.

For every place, method and season, it counts the families there over the year and at one moment (by day and by
night, from each family's time and strength), and warns where:
- a table that has tiles would be empty at some moment (an empty table breaks the game's encounters);
- grass or dark grass holds more than 14 families over the year or 8 at one moment, or fewer than 3 at one moment
  (rules.md, 6, loose targets);
- one type holds more than 60% of a table at one moment (type diversity);
- a stage marked wild has no home that reaches it;
- a family of Unova (494-649) lives only in the Nature Preserve (rules.md, 3a);
- a pseudo-legendary or other strong line is common anywhere (rules.md, 8).
Weather-only homes don't count toward a table being filled.

Run from docs/paperwhite2/ecological-encounters: python3 tools/balance.py [--markdown]
"""

import os
import sys

import yaml

sys.path.insert(0, os.path.dirname(__file__))
import dictionary_check as dc  # noqa: E402

DAY = {"morning", "day", "evening"}
NIGHT = {"night", "late_night"}
MOMENTS = {"day": "day", "night": "night"}
# Tables that have no tiles in some seasons (places/*.yaml facts).
NO_TILES = {
    ("icirrus_city", "grass"): {"winter"},
    ("route_8", "grass"): {"winter"},
    ("moor_of_icirrus", "grass"): {"winter"},
    ("castelia_sewers", "surf"): {"autumn", "winter"},
    ("castelia_sewers", "fishing"): {"autumn", "winter"},
    ("castelia_sewers", "rippling_surf"): {"autumn", "winter"},
    ("castelia_sewers", "rippling_fishing"): {"autumn", "winter"},
    ("dragonspiral_entrance", "dark_grass"): {"spring", "summer", "autumn"},
}
STRONG = {"dratini", "larvitar", "bagon", "beldum", "gible", "deino", "axew", "druddigon", "pawniard", "absol"}
GRASS_YEAR, GRASS_MOMENT_MAX, GRASS_MOMENT_MIN = 14, 8, 3


def periods(value):
    if value in (None, "any"):
        return DAY | NIGHT
    if value == "day":
        return set(DAY)
    if value == "night":
        return set(NIGHT)
    out = set()
    for v in value:
        out |= periods(v) if v in ("day", "night", "any") else {v}
    return out


def present(family, home, moment):
    """Whether a home's family can be met at a moment (day or night)."""
    want = DAY if moment == "day" else NIGHT
    if "times" in home:
        return bool(periods(home["times"]) & want)
    t = family.get("time") or {}
    if t.get("strength") == "strict":
        return bool(periods(t.get("periods")) & want)
    return True


def main(argv):
    markdown = "--markdown" in argv
    with open("families/skeleton.yaml", encoding="utf-8") as f:
        skeleton = {fam["id"]: fam for fam in yaml.safe_load(f)["families"]}
    with open("families/batches.yaml", encoding="utf-8") as f:
        batches = yaml.safe_load(f)
    places = dc.load_places()
    methods = {pid: dc.place_methods(p) for pid, p in places.items()}
    families = {}
    for name in batches:
        if name == "not_wild":
            continue
        with open(f"families/{name}.yaml", encoding="utf-8") as f:
            for e in yaml.safe_load(f).get("families", []) or []:
                families[e["id"]] = e

    types = {}
    for fid, fam in skeleton.items():
        types[fid] = fam["members"][0]["types"].split("/")

    table = {}  # (place, method, season, moment) -> {family: [tiers]}
    filled = {}
    year = {}  # (place, method) -> set of families
    warnings = []
    for fid, e in families.items():
        members = [m["species"].lower() for m in skeleton[fid]["members"]]
        stages = e.get("stages") or {}
        wild = [m for m in members if stages.get(m) == "wild" or (isinstance(stages.get(m), dict) and stages[m].get("wild"))]
        reached = set()
        homes = e.get("homes") or []
        for h in homes:
            reached |= set(h.get("stages") or wild)
            if h.get("weather"):
                continue
            for m in h.get("methods", []):
                for s in dc.seasons_of(h.get("seasons")):
                    for moment in MOMENTS:
                        if present(e, h, moment):
                            table.setdefault((h["place"], m, s, moment), {}).setdefault(fid, []).append(h["tier"])
                    year.setdefault((h["place"], m), set()).add(fid)
            if fid in STRONG and h.get("tier") == "common":
                warnings.append(f"strong line {fid} is common at {h['place']}")
        for m in wild:
            if homes and m not in reached:
                warnings.append(f"{fid}: wild stage {m} has no home")
        number = skeleton[fid]["members"][0]["number"]
        homes_at = {h["place"] for h in homes}
        if number >= 494 and homes_at == {"nature_preserve"}:
            warnings.append(f"{fid}: a Unovan family only in the Nature Preserve")

    # The generator's fallback for rippling water (families/README.md): a rippling table with nothing of its own in a
    # season and time takes the families of the same water's plain table (surf or fishing) then, favouring their later
    # stages.
    for (pid, m, s, moment), fams in list(table.items()):
        if m in ("surf", "fishing"):
            key = (pid, "rippling_" + m, s, moment)
            if key not in table:
                filled.setdefault(key, dict(fams))
    for key, fams in filled.items():
        table.setdefault(key, fams)

    empty, crowded, sparse, uniform = [], [], [], []
    for pid in places:
        for m in sorted(methods[pid]):
            if m == "rustling":
                continue  # fills itself from the grass (system.md)
            for s in dc.SEASONS:
                if s in NO_TILES.get((pid, m), set()):
                    continue
                for moment in MOMENTS:
                    fams = table.get((pid, m, s, moment), {})
                    if not fams:
                        empty.append(f"{pid} {m} {s} {moment}")
                        continue
                    if m in ("grass", "dark_grass"):
                        if len(fams) > GRASS_MOMENT_MAX:
                            crowded.append(f"{pid} {m} {s} {moment}: {len(fams)}")
                        if len(fams) < GRASS_MOMENT_MIN:
                            sparse.append(f"{pid} {m} {s} {moment}: {len(fams)} ({', '.join(sorted(fams))})")
                    counts = {}
                    for fid in fams:
                        for t in types[fid]:
                            counts[t] = counts.get(t, 0) + 1
                    if len(fams) >= 4 and m in ("grass", "dark_grass"):
                        top, n = max(counts.items(), key=lambda kv: kv[1])
                        if n / len(fams) > 0.6:
                            uniform.append(f"{pid} {m} {s} {moment}: {top} {n}/{len(fams)}")
            if m in ("grass", "dark_grass") and len(year.get((pid, m), ())) > GRASS_YEAR:
                crowded.append(f"{pid} {m} over the year: {len(year[(pid, m)])}")

    def section(title, rows):
        print(f"\n{'## ' if markdown else ''}{title} ({len(rows)})\n")
        for r in rows:
            print(f"- {r}")

    print(f"{len(families)} families placed")
    section("Empty tables (must be filled)", empty)
    section("Crowded grass (over the loose targets)", crowded)
    section("Sparse grass (under 3 at a moment)", sparse)
    section("One type over 60%", uniform)
    section("Other warnings", warnings)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
