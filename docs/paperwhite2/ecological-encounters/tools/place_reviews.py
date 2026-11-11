#!/usr/bin/env python3
"""Write the place reviews (reviews/place_reviews.md, one document): each place's Pokémon by method and season, from the family
dictionary, with the assessment kept in reviews/assessments.yaml.

The tables are generated (run this again after any change to the dictionary); the assessments are written by hand,
one entry per place id: {vision, good: [...], unsure: [...], ideas: [...]}.

Run from docs/paperwhite2/ecological-encounters: python3 tools/place_reviews.py
"""

import glob
import json
import os
import sys

import yaml

sys.path.insert(0, os.path.dirname(__file__))
import balance  # noqa: E402
import dictionary_check as dc  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
TIERS = ["common", "uncommon", "rare", "very_rare", "exotic"]
TIER_NAMES = {"common": "common", "uncommon": "uncommon", "rare": "rare", "very_rare": "very rare", "exotic": "exotic"}
METHOD_NAMES = {
    "grass": "Grass",
    "dark_grass": "Dark grass",
    "rustling": "Rustling spots",
    "surf": "Surfing",
    "rippling_surf": "Rippling water (surfing)",
    "fishing": "Fishing",
    "rippling_fishing": "Rippling water (fishing)",
}
CAVE = {"cave", "deep_cave", "mine", "sewer", "tower", "building", "ruins", "volcanic", "underground_water"}
FORMS = {
    "deerling": ["spring form", "summer form", "autumn form", "winter form"],
    "basculin": ["Red-Striped", "Blue-Striped"],
    "shellos": ["West Sea", "East Sea"],
    "burmy": ["Plant Cloak", "Sandy Cloak", "Trash Cloak"],
}
SPOTS = {"grass": "shaking grass", "dust": "dust clouds", "shadow": "bridge shadows"}
REGIONS = [
    ("southwest", "Southwest Unova"),
    ("castelia_desert", "Castelia and the desert"),
    ("southeast", "Southeast Unova"),
    ("central", "Central Unova"),
    ("west", "Western Unova"),
    ("icirrus", "Icirrus"),
    ("north_central", "Northern Central Unova"),
    ("east_coast", "The east coast"),
    ("rest", "The Rest"),
]


def species_names():
    names = {}
    for path in glob.glob(os.path.join(ROOT, "res/pokemon/*/data.json")):
        with open(path, encoding="utf-8") as f:
            names[os.path.basename(os.path.dirname(path))] = json.load(f).get("name", "")
    names.update({"nidoran_f": "Nidoran♀", "nidorina": "Nidorina", "nidoran_m": "Nidoran♂"})
    return names


def main():
    names = species_names()
    with open("families/skeleton.yaml", encoding="utf-8") as f:
        skeleton = {fam["id"]: fam for fam in yaml.safe_load(f)["families"]}
    with open("families/batches.yaml", encoding="utf-8") as f:
        batches = yaml.safe_load(f)
    families = {}
    for name in batches:
        if name == "not_wild":
            continue
        with open(f"families/{name}.yaml", encoding="utf-8") as f:
            for e in yaml.safe_load(f).get("families", []) or []:
                families[e["id"]] = e
    path = "reviews/assessments.yaml"
    assessments = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            assessments = yaml.safe_load(f) or {}

    def chain(fid):
        """The family's members in evolution order: the first stage, then each one's evolutions."""
        ms = skeleton[fid]["members"]
        kids = {}
        for m in ms:
            if m.get("from"):
                kids.setdefault(m["from"].lower(), []).append(m["species"].lower())
        order, todo = [], [fid]
        while todo:
            x = todo.pop(0)
            order.append(x)
            todo += kids.get(x, [])
        return order

    def label(fid, e, h):
        members = chain(fid)
        stages = e.get("stages") or {}
        wild = [m for m in members if stages.get(m) == "wild" or (isinstance(stages.get(m), dict) and stages[m].get("wild"))]
        shown = h.get("stages") or wild
        text = "/".join(names.get(m, m) for m in shown)
        notes = []
        if "form" in h and fid in FORMS:
            notes.append(FORMS[fid][h["form"]])
        moments = [m for m in ("day", "night") if balance.present(e, h, m)]
        if isinstance(h.get("times"), list) and len(h["times"]) == 1:
            notes.append(f"{h['times'][0].replace('_', ' ')} only")
        elif len(moments) == 1:
            notes.append(f"{moments[0]} only")
        elif (e.get("time") or {}).get("strength") == "preferred" and "times" not in h:
            p = (e.get("time") or {}).get("periods")
            if p in ("day", "night"):
                notes.append(f"more by {p}" if p == "day" else "more at night")
        never = (e.get("weather") or {}).get("never") or []
        if never and not h.get("weather"):
            notes.append("never in " + ", ".join(w.replace("_", " ") for w in never))
        if h.get("weather"):
            notes.append("only in " + ", ".join(w.replace("_", " ") for w in h["weather"]))
        if h.get("areas"):
            notes.append("only in " + ", ".join(h["areas"]))
        return text + (f" ({'; '.join(notes)})" if notes else "")

    os.makedirs("reviews", exist_ok=True)
    out = ["# Place reviews", ""]
    out.append(
        "Every place's Pokémon by method and season, from the family dictionary, with my assessment of each. Generated "
        "by `tools/place_reviews.py` (run it again after any change); the assessments come from "
        "`reviews/assessments.yaml`, and the patterns below from `reviews/patterns.md`. Tiers are a family's in that "
        "place: a later stage is one tier rarer, and the level gate decides which stages show. \"More by day\" or "
        "\"more at night\" is a preferred time (a tier rarer outside it); \"day only\" or \"night only\" is strict."
    )
    out.append("")
    if os.path.exists("reviews/patterns.md"):
        with open("reviews/patterns.md", encoding="utf-8") as f:
            out += f.read().rstrip().split("\n")
        out.append("")
    for region, title in REGIONS:
        with open(f"places/{region}.yaml", encoding="utf-8") as f:
            doc = yaml.safe_load(f)
        out.append(f"## {title}")
        out.append("")
        for p in doc["places"]:
            pid = p["id"]
            out.append(f"### {p['name']} (`{pid}`)")
            out.append("")
            pic = " ".join(str(p.get("picture", "")).split())
            if pic:
                out.append(f"*The place:* {pic}")
                out.append("")
            spots = set()
            for m in p.get("maps", []):
                ap = os.path.join(ROOT, f"res/paperwhite2/encounters/areas/{m}.json")
                if os.path.exists(ap):
                    with open(ap, encoding="utf-8") as f:
                        spots.add(json.load(f).get("spots"))
            methods = dc.place_methods(p)
            for m in ["grass", "dark_grass", "rustling", "surf", "rippling_surf", "fishing", "rippling_fishing"]:
                if m not in methods:
                    continue
                rows = []
                for s in dc.SEASONS:
                    if s in balance.NO_TILES.get((pid, m), set()):
                        rows.append((s, "no tiles this season"))
                        continue
                    by_tier = {}
                    for fid, e in families.items():
                        for h in e.get("homes") or []:
                            if h["place"] != pid or m not in h["methods"] or s not in dc.seasons_of(h.get("seasons")):
                                continue
                            by_tier.setdefault(h["tier"], []).append(label(fid, e, h))
                    parts = []
                    for t in TIERS:
                        if t in by_tier:
                            parts.append(f"**{TIER_NAMES[t]}:** " + ", ".join(sorted(set(by_tier[t]))))
                    rows.append((s, "; ".join(parts)))
                if all(not r for _, r in rows) and m.startswith("rippling"):
                    out.append(f"**{METHOD_NAMES[m]}:** nothing of its own: the generator's rule fills it from "
                               f"{'surfing' if m == 'rippling_surf' else 'fishing'}, favouring the later stages.")
                    out.append("")
                    continue
                heading = METHOD_NAMES[m]
                if m == "grass" and set(p.get("habitats", [])) & CAVE and "meadow" not in p.get("habitats", []):
                    heading = "Walking (the floor)"
                if m == "rustling":
                    kind = ", ".join(SPOTS.get(x, x) for x in sorted(spots - {None})) or "rustling spots"
                    heading = f"Rustling spots ({kind})"
                out.append(f"**{heading}**")
                out.append("")
                if m == "rustling":
                    out.append("Besides what's listed, rustling spots fill themselves from the grass's rare, very rare "
                               "and exotic Pokémon" + (" (Audino keeps 30% of shaking grass)" if "grass" in spots else
                                                       " (items 30% of the time)") + ".")
                    out.append("")
                if len({r for _, r in rows}) == 1:
                    out.append(f"- All year: {rows[0][1] or '(nothing of its own)'}")
                else:
                    for s, r in rows:
                        out.append(f"- {s.capitalize()}: {r or '(nothing of its own)'}")
                out.append("")
            a = assessments.get(pid)
            if a:
                out.append("**What I think**")
                out.append("")
                if a.get("vision"):
                    out.append(" ".join(a["vision"].split()))
                    out.append("")
                for key, title2 in (("good", "Satisfied with"), ("unsure", "Not satisfied, or unsure"), ("ideas", "Ideas"),
                            ("discussed", "Discussed with the user")):
                    if a.get(key):
                        out.append(f"*{title2}:*")
                        out.append("")
                        for x in a[key]:
                            out.append(f"- {' '.join(x.split())}")
                        out.append("")
    with open("reviews/place_reviews.md", "w", encoding="utf-8") as f:
        f.write("\n".join(out).rstrip() + "\n")
    print("written reviews/place_reviews.md")

if __name__ == "__main__":
    main()
