#!/usr/bin/env python3
"""The ecological encounters' generator: the family dictionary (families/*.yaml) to the species files of
res/paperwhite2/encounters/species/ (docs/paperwhite2/encounters.md).

It doesn't invent placements: every habitat comes from a family's homes. What it adds is the dictionary's rules
(families/README.md, rules.md):
- each wild stage is a species file, with levels by the default rule (a first stage from 2 to its evolution level
  + 3; a later stage from the level it evolves at to 100, or to its own evolution level + 3 when it evolves again by
  level), or the entry's `levels`;
- a home's tier is its family's: a later stage is one tier rarer for each step from the home's first stage;
- the family's time: strict keeps it to its periods; preferred makes it a tier rarer outside them; a home's `times`
  limit it;
- the family's weather: `more` a tier commoner, `less` a tier rarer, `only` and a home's `weather` limit it, `never`
  hides it; by the game's weather groups (clear, rain, thunderstorm, snow, sandstorm), and only by those an area
  can have (its zone's default weather and its weather calendar, res/field/), so a habitat that allows all of an
  area's weathers has no weather list there;
- rippling water: where a place's rippling method has nothing of its own in a season, it takes the same water's
  plain table then, the later stages a tier commoner and the first stages a tier rarer;
- only methods the area has (a rate above 0 in that season);
- battles and the wanderer's settings, the outbreaks: a family's own, or else the original game's mass outbreaks
  (families/imported_outbreaks.yaml);
- habitats that differ only in places, seasons, methods or times are merged, since a candidate's are bit masks.

    python3 tools/generate.py              # write the species files into a staging folder (generated/species)
    python3 tools/generate.py --install    # replace res/paperwhite2/encounters/species with them

Then `python3 tools/paperwhite2/encounters.py check` from the repository checks the sizes against the game's limits.
"""

import glob
import json
import os
import re
import shutil
import sys
from pathlib import Path

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import dictionary_check as dc  # noqa: E402

sys.path.insert(0, os.path.abspath(os.path.join(HERE, "../../../../tools/data")))
import datajson  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "../../../.."))
ENC = os.path.join(ROOT, "res/paperwhite2/encounters")
TIERS = ["common", "uncommon", "rare", "very_rare", "exotic"]
PERIODS = ["morning", "day", "evening", "night", "late_night"]
DAY = ["morning", "day", "evening"]
NIGHT = ["night", "late_night"]
SEASONS = ["spring", "summer", "autumn", "winter"]
GROUPS = ["clear", "rain", "thunderstorm", "snow", "sandstorm"]
GROUP_WEATHER = {
    "clear": "WEATHER_SUNNY",
    "rain": "WEATHER_RAIN",
    "thunderstorm": "WEATHER_THUNDERSTORM",
    "snow": "WEATHER_FLAKE",
    "sandstorm": "WEATHER_SANDSTORM",
}
WEATHER_GROUP = {
    "rain": "rain",
    "gusty_rain": "rain",
    "thunderstorm": "thunderstorm",
    "snow": "snow",
    "light_snow": "snow",
    "blizzard": "snow",
    "diamond_dust": "snow",
    "sandstorm": "sandstorm",
}
# The game's weathers in WEATHER_* order (system/zone_weather.h) and their groups (paperwhite2/weather_groups.h)
WEATHERS = {
    "WEATHER_SUNNY": "clear",
    "WEATHER_FLAKE": "snow",
    "WEATHER_RAIN": "rain",
    "WEATHER_SANDSTORM": "sandstorm",
    "WEATHER_BLIZZARD": "snow",
    "WEATHER_FLUTTER": "snow",
    "WEATHER_THUNDERSTORM": "thunderstorm",
    "WEATHER_GUSTY_RAIN": "rain",
    "WEATHER_DIAMOND_DUST": "snow",
    "WEATHER_TINT_9": "clear",
    "WEATHER_TINT_10": "clear",
    "WEATHER_TINT_11": "clear",
    "WEATHER_SANDSTORM_2": "sandstorm",
    "WEATHER_TINT_13": "clear",
    "WEATHER_TINT_14": "clear",
}
METHODS = ["grass", "dark_grass", "rustling", "surf", "rippling_surf", "fishing", "rippling_fishing"]
RIPPLING = {"rippling_surf": "surf", "rippling_fishing": "fishing"}


def shift(tier, steps):
    return TIERS[max(0, min(len(TIERS) - 1, TIERS.index(tier) + steps))]


def periods(value):
    if value in (None, "any"):
        return list(PERIODS)
    if value == "day":
        return list(DAY)
    if value == "night":
        return list(NIGHT)
    out = []
    for v in value:
        for p in periods(v) if v in ("any", "day", "night") else [v]:
            if p not in out:
                out.append(p)
    return [p for p in PERIODS if p in out]


def groups_of(names):
    return {WEATHER_GROUP[n] for n in names or []}


def evo_level(text):
    """The level an evolution happens at, from the skeleton's "by" (level 16, level female (20)...), or None."""
    if not text or not (text.startswith("level") or text.startswith("shedinja")):
        return None
    m = re.search(r"(\d+)", text)
    return int(m.group(1)) if m else None


class Generator:
    def __init__(self):
        with open(os.path.join(HERE, "../families/skeleton.yaml"), encoding="utf-8") as f:
            self.skeleton = {fam["id"]: fam for fam in yaml.safe_load(f)["families"]}
        with open(os.path.join(HERE, "../families/batches.yaml"), encoding="utf-8") as f:
            batches = yaml.safe_load(f)
        self.families = {}
        for name in batches:
            if name == "not_wild":
                continue
            with open(os.path.join(HERE, f"../families/{name}.yaml"), encoding="utf-8") as f:
                for e in yaml.safe_load(f).get("families", []) or []:
                    self.families[e["id"]] = e
        cwd = os.getcwd()
        os.chdir(os.path.join(HERE, ".."))
        self.places = dc.load_places()
        os.chdir(cwd)
        self.rates = {}
        for path in glob.glob(os.path.join(ENC, "areas/*.json")):
            with open(path, encoding="utf-8") as f:
                d = json.load(f)
            r = d.get("rates", {})
            area = os.path.basename(path)[:-5]
            self.rates[area] = {s: (r.get("all_year") or r.get(s) or {}) for s in SEASONS}
        self.area_groups = self.load_area_groups()
        with open(os.path.join(HERE, "../families/imported_outbreaks.yaml"), encoding="utf-8") as f:
            self.imported_outbreaks = {}
            for o in yaml.safe_load(f)["outbreaks"]:
                self.imported_outbreaks.setdefault(o["species"], []).append(o)
        self.warnings = []
        self.species = {}  # species folder name -> file content

    def load_area_groups(self):
        """The weather groups each area's zone can have: its header's default weather and its calendar's."""
        root = os.path.join(ENC, "../../field")
        names = list(WEATHERS)
        out = {}
        for path in glob.glob(os.path.join(root, "zones/*.json")):
            with open(path, encoding="utf-8") as f:
                d = json.load(f)
            enc = d.get("encounters")
            if not enc or not enc.startswith("ENCOUNTERS_"):
                continue
            area = enc[len("ENCOUNTERS_"):].lower()
            zone = os.path.basename(path)[:-5]
            groups = {WEATHERS[names[d.get("weather", 0)]]}
            cal = os.path.join(root, "weather_calendar", zone + ".json")
            if os.path.exists(cal):
                with open(cal, encoding="utf-8") as f:
                    for days in json.load(f).get("months", {}).values():
                        groups |= {WEATHERS[w] for w in days.values()}
            out.setdefault(area, set()).update(groups)
        return out

    def chain(self, fid):
        members = self.skeleton[fid]["members"]
        kids, by = {}, {}
        for m in members:
            sp = m["species"].lower()
            by[sp] = m.get("by")
            if m.get("from"):
                kids.setdefault(m["from"].lower(), []).append(sp)
        depth, order, todo = {fid: 0}, [], [fid]
        while todo:
            x = todo.pop(0)
            order.append(x)
            for k in kids.get(x, []):
                depth[k] = depth[x] + 1
                todo.append(k)
        return order, kids, by, depth

    def wild(self, e, order):
        stages = e.get("stages") or {}
        return [m for m in order if stages.get(m) == "wild" or (isinstance(stages.get(m), dict) and stages[m].get("wild"))]

    def levels(self, e, sp, kids, by):
        override = (e.get("levels") or {}).get(sp)
        if override:
            return {"min": max(1, override[0]), "max": min(100, override[1])}
        own = evo_level(by.get(sp))
        if by.get(sp) is None:
            low = 2
        elif own is not None:
            low = own
        else:
            low = 30
            self.warnings.append(f"{sp}: evolves by {by.get(sp)!r}; minimum guessed at 30")
        nexts = [evo_level(by.get(k)) for k in kids.get(sp, [])]
        nexts = [n for n in nexts if n is not None]
        high = min(100, max(nexts) + 3) if nexts else 100
        if kids.get(sp) and not nexts:
            high = 100
        if high < low:
            high = low
        return {"min": low, "max": high}

    def areas_of(self, h):
        place = self.places[h["place"]]
        areas = h.get("areas") or place.get("maps", [])
        out = []
        for a in areas:
            if a not in self.rates:
                self.warnings.append(f"{h['place']}: area {a} has no file")
                continue
            out.append(a)
        return out

    def splits(self, e, h, tier):
        """A home's (tier, times, weather groups) pieces after its family's time and weather rules."""
        t = e.get("time") or {}
        if "times" in h:
            time_pieces = [(0, periods(h["times"]))]
        elif t.get("strength") == "strict":
            time_pieces = [(0, periods(t.get("periods")))]
        elif t.get("strength") == "preferred" and periods(t.get("periods")) != PERIODS:
            inside = periods(t.get("periods"))
            outside = [p for p in PERIODS if p not in inside]
            time_pieces = [(0, inside), (1, outside)]
        else:
            time_pieces = [(0, list(PERIODS))]
        w = e.get("weather") or {}
        allowed = set(GROUPS) - groups_of(w.get("never"))
        if w.get("only"):
            allowed &= groups_of(w["only"])
        if h.get("weather"):
            allowed &= groups_of(h["weather"])
        more, less = groups_of(w.get("more")) & allowed, groups_of(w.get("less")) & allowed
        plain = allowed - more - less
        weather_pieces = [(0, plain), (-1, more), (1, less)]
        out = []
        for ts, times in time_pieces:
            for ws, groups in weather_pieces:
                if not groups or not times:
                    continue
                out.append((shift(tier, ts + ws), times, groups))
        return out

    def add(self, sp, habitat):
        self.species.setdefault(sp, []).append(habitat)

    def run(self):
        plain = {}  # (area, method, season) -> [(species, tier, family, depth, times, groups, form)]
        own_rippling = set()  # (area, method, season)
        meta = {}
        for fid, e in sorted(self.families.items()):
            order, kids, by, depth = self.chain(fid)
            wild = self.wild(e, order)
            homes = e.get("homes") or []
            for sp in wild:
                meta[sp] = (fid, e, kids, by, depth)
            for h in homes:
                stages = h.get("stages") or wild
                stages = [s for s in stages if s in wild]
                if not stages:
                    continue
                base = min(depth[s] for s in stages)
                areas = self.areas_of(h)
                seasons = dc.seasons_of(h.get("seasons"))
                for sp in stages:
                    tier = shift(h["tier"], depth[sp] - base)
                    pieces = self.splits(e, h, tier)
                    for m in h["methods"]:
                        usable = [a for a in areas if any(self.rates[a][s].get(m, 0) > 0 for s in seasons)]
                        if not usable:
                            if not all(m == "rustling" for m in h["methods"]):
                                self.warnings.append(f"{fid}: {h['place']} has no {m} rate in {seasons}")
                            continue
                        for a in usable:
                            possible = self.area_groups.get(a, {"clear"})
                            here = [(pt, times, groups & possible) for pt, times, groups in pieces if groups & possible]
                            if not here:
                                self.warnings.append(f"{fid}: {h['place']} ({a}) never has its weather")
                                continue
                            for s in seasons:
                                if self.rates[a][s].get(m, 0) <= 0:
                                    continue
                                if m in RIPPLING:
                                    own_rippling.add((a, m, s))
                                    continue
                                for pt, times, groups in here:
                                    plain.setdefault((a, m, s), []).append((sp, pt, fid, depth[sp], times, groups, h.get("form")))
                            for pt, times, groups in here:
                                hab = {"places": [a]}
                                if h.get("form"):
                                    hab["form"] = h["form"]
                                hab["seasons"] = [s for s in seasons if self.rates[a][s].get(m, 0) > 0]
                                hab["methods"] = [m]
                                hab["rarity"] = pt
                                hab["times"] = times
                                if groups != possible:
                                    hab["weather"] = [GROUP_WEATHER[g] for g in GROUPS if g in groups]
                                self.add(sp, hab)
        # Rippling water's fallback
        for (a, m, s), cands in sorted(plain.items()):
            for rip, base_m in RIPPLING.items():
                if base_m != m or (a, rip, s) in own_rippling or self.rates[a][s].get(rip, 0) <= 0:
                    continue
                families_here = {}
                for sp, tier, fid, d, times, groups, form in cands:
                    families_here.setdefault(fid, set()).add(d)
                for sp, tier, fid, d, times, groups, form in cands:
                    deepest = max(families_here[fid])
                    step = -1 if d > 0 else (1 if deepest > 0 else 0)
                    hab = {"places": [a]}
                    if form:
                        hab["form"] = form
                    hab["seasons"] = [s]
                    hab["methods"] = [rip]
                    hab["rarity"] = shift(tier, step)
                    hab["times"] = times
                    if groups != self.area_groups.get(a, {"clear"}):
                        hab["weather"] = [GROUP_WEATHER[g] for g in GROUPS if g in groups]
                    self.add(sp, hab)
        # Merge habitats that differ only in their places or seasons
        files = {}
        for sp, habs in self.species.items():
            merged = {}
            for hab in habs:
                key = json.dumps({k: v for k, v in hab.items() if k not in ("places", "seasons")}, sort_keys=True)
                key2 = key + "|" + ",".join(hab["seasons"])
                merged.setdefault(key2, {**hab, "places": []})
                for a in hab["places"]:
                    if a not in merged[key2]["places"]:
                        merged[key2]["places"].append(a)
            bykey = {}
            for hab in merged.values():
                key = json.dumps({k: v for k, v in hab.items() if k != "seasons"}, sort_keys=True)
                if key in bykey:
                    for s in hab["seasons"]:
                        if s not in bykey[key]["seasons"]:
                            bykey[key]["seasons"].append(s)
                else:
                    bykey[key] = dict(hab)
            bymethod = {}
            for hab in bykey.values():
                hab["seasons"] = [s for s in SEASONS if s in hab["seasons"]]
                hab["places"] = sorted(hab["places"])
                key = json.dumps({k: v for k, v in hab.items() if k != "methods"}, sort_keys=True)
                if key in bymethod:
                    bymethod[key]["methods"] += [m for m in hab["methods"] if m not in bymethod[key]["methods"]]
                else:
                    bymethod[key] = dict(hab)
            bytime = {}
            for hab in bymethod.values():
                hab["methods"] = [m for m in METHODS if m in hab["methods"]]
                key = json.dumps({k: v for k, v in hab.items() if k != "times"}, sort_keys=True)
                if key in bytime:
                    bytime[key]["times"] += [t for t in hab["times"] if t not in bytime[key]["times"]]
                else:
                    bytime[key] = dict(hab)
            out = []
            for hab in bytime.values():
                hab["times"] = [t for t in PERIODS if t in hab["times"]]
                hab["places"] = sorted(hab["places"])
                out.append(hab)
            out.sort(key=lambda h: (h["places"][0], h["methods"][0], SEASONS.index(h["seasons"][0]), TIERS.index(h["rarity"])))
            fid, e, kids, by, depth = meta[sp]
            data = {"$schema": "../species.schema.json", "levels": self.levels(e, sp, kids, by)}
            b = e.get("battles")
            if b and (b.get("single"), b.get("double"), b.get("triple"), b.get("partners")) != (100, 0, 0, "family"):
                data["battles"] = {"single": b["single"], "double": b["double"], "triple": b["triple"], "partners": b["partners"]}
            data["habitats"] = out
            w = e.get("wanderer") or {}
            ow = {}
            if w.get("appears", "both") != "both":
                ow["appears"] = w["appears"]
            if w.get("wanders", "random") != "random":
                ow["wanders"] = w["wanders"]
            if w.get("grass") == "float":
                ow["grass"] = False
            if ow:
                data["overworld"] = ow
            obs = []
            for o in e.get("outbreaks") or []:
                stages = o.get("stages") or [sp]
                if sp not in stages:
                    continue
                areas = []
                for p in o["places"]:
                    areas += [a for a in self.places[p].get("maps", []) if a in self.rates]
                obs.append({"places": areas, "methods": o.get("methods", ["surf"]), "seasons": dc.seasons_of(o.get("seasons")), "times": list(PERIODS)})
            if not obs:
                for o in self.imported_outbreaks.get(sp, []):
                    obs.append({"places": o["areas"], "methods": o["methods"], "seasons": list(SEASONS), "times": list(PERIODS)})
            if obs:
                data["outbreaks"] = obs
            files[sp] = data
        return files


def main(argv):
    gen = Generator()
    files = gen.run()
    staging = os.path.join(HERE, "../generated/species")
    if os.path.exists(staging):
        shutil.rmtree(staging)
    os.makedirs(staging)
    for sp, data in sorted(files.items()):
        # The repository's writer, whose layout the editor saves too (tools/data/datajson.py)
        datajson.write(Path(staging) / f"{sp}.json", data)
    habitats = sum(len(d["habitats"]) for d in files.values())
    print(f"{len(files)} species, {habitats} habitats written to generated/species")
    for w in sorted(set(gen.warnings)):
        print("warning:", w)
    if "--install" in argv:
        target = os.path.join(ENC, "species")
        for path in glob.glob(os.path.join(target, "*.json")):
            os.remove(path)
        for sp in files:
            shutil.copy(os.path.join(staging, f"{sp}.json"), os.path.join(target, f"{sp}.json"))
        print(f"installed into {os.path.relpath(target, ROOT)}")


if __name__ == "__main__":
    main(sys.argv[1:])
