#!/usr/bin/env python3
"""Check the family dictionary (families/*.yaml) against the skeleton, the batches and the places.

Checks: every family of skeleton.yaml is in exactly one list of batches.yaml; every entry of a batch file is a family
of that batch, once; every wild family drafted has homes; each home names a place of places/*.yaml, methods that
place has, valid seasons, times, tier and stages. With --report, also prints, per place and method, the families that
live there in each season (the balance pass's raw numbers), and with --counts only the counts.

Run from docs/paperwhite2/ecological-encounters: python3 tools/dictionary_check.py [--report|--counts] [batch...]
"""

import glob
import os
import re
import sys

import yaml

SEASONS = ["spring", "summer", "autumn", "winter"]
PERIODS = ["morning", "day", "evening", "night", "late_night"]
TIERS = ["common", "uncommon", "rare", "very_rare", "exotic"]
WEATHERS = ["rain", "gusty_rain", "thunderstorm", "snow", "light_snow", "blizzard", "diamond_dust", "sandstorm"]
METHODS = ["grass", "dark_grass", "rustling", "surf", "rippling_surf", "fishing", "rippling_fishing"]


def place_methods(place):
    """The methods a place has, from its facts' method list (walking is the grass table)."""
    found = set()
    items = place.get("facts", {}).get("methods", []) or []
    for item in [items] if isinstance(items, str) else items:
        for word in re.findall(r"[a-z_]+", str(item)):
            if word == "walking":
                found.add("grass")
            elif word in ("grass", "dark_grass", "rustling", "surf", "fishing"):
                found.add(word)
    if "surf" in found:
        found.add("rippling_surf")
    if "fishing" in found:
        found.add("rippling_fishing")
    return found


def load_places():
    places = {}
    for path in sorted(glob.glob("places/*.yaml")):
        with open(path, encoding="utf-8") as f:
            for p in yaml.safe_load(f)["places"]:
                places[p["id"]] = p
    return places


def seasons_of(value):
    if value in (None, "all"):
        return list(SEASONS)
    return list(value) if isinstance(value, list) else [value]


def main(argv):
    report = "--report" in argv
    counts = "--counts" in argv
    only = [a for a in argv if not a.startswith("--")]
    with open("families/skeleton.yaml", encoding="utf-8") as f:
        skeleton = {fam["id"]: fam for fam in yaml.safe_load(f)["families"]}
    with open("families/batches.yaml", encoding="utf-8") as f:
        batches = yaml.safe_load(f)
    places = load_places()
    methods = {pid: place_methods(p) for pid, p in places.items()}
    errors = []

    listed = []
    for name, ids in batches.items():
        if name == "not_wild":
            for group in ids.values():
                listed += group
        else:
            listed += ids
    for fid in set(listed):
        if listed.count(fid) > 1:
            errors.append(f"batches.yaml: {fid} listed {listed.count(fid)} times")
    for fid in skeleton:
        if fid not in listed:
            errors.append(f"batches.yaml: {fid} not listed")
    for fid in listed:
        if fid not in skeleton:
            errors.append(f"batches.yaml: {fid} isn't a family")

    table = {}  # (place, method, season) -> [(family, tier, times)]
    drafted = 0
    for name, ids in batches.items():
        if name == "not_wild" or (only and name not in only):
            continue
        path = f"families/{name}.yaml"
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            doc = yaml.safe_load(f)
        entries = doc.get("families", []) or []
        seen = set()
        for e in entries:
            fid = e.get("id")
            where = f"{path}: {fid}"
            if fid not in ids:
                errors.append(f"{where}: not a family of batch {name}")
                continue
            if fid in seen:
                errors.append(f"{where}: twice")
            seen.add(fid)
            drafted += 1
            members = [m["species"].lower() for m in skeleton[fid]["members"]]
            stages = e.get("stages", {}) or {}
            for s in stages:
                if s not in members:
                    errors.append(f"{where}: stage {s} isn't a member")
            wild = [m for m in members if m in stages and (stages[m] == "wild" or (isinstance(stages[m], dict) and stages[m].get("wild")))]
            if not wild and e.get("homes"):
                errors.append(f"{where}: homes but no wild stage")
            if wild and not e.get("homes") and not e.get("homes_by"):
                errors.append(f"{where}: wild but no homes")
            for key in (e.get("weather") or {}):
                if key not in ("more", "less", "only", "never"):
                    errors.append(f"{where}: weather key {key} unknown")
            for key, ws in (e.get("weather") or {}).items():
                for w in ws or []:
                    if w not in WEATHERS:
                        errors.append(f"{where}: weather {w} unknown")
            for t in (e.get("trophy") or []):
                if t not in places:
                    errors.append(f"{where}: trophy place {t} unknown")
            for h in e.get("homes", []) or []:
                pid = h.get("place")
                if pid not in places:
                    errors.append(f"{where}: place {pid} unknown")
                    continue
                for m in h.get("methods", []):
                    if m not in METHODS:
                        errors.append(f"{where}: {pid}: method {m} unknown")
                    elif m not in methods[pid]:
                        errors.append(f"{where}: {pid} has no {m}")
                for s in seasons_of(h.get("seasons")):
                    if s not in SEASONS:
                        errors.append(f"{where}: {pid}: season {s} unknown")
                times = h.get("times", "any")
                for t in ([times] if isinstance(times, str) else times):
                    if t not in PERIODS + ["any", "day", "night"]:
                        errors.append(f"{where}: {pid}: time {t} unknown")
                if h.get("tier") not in TIERS:
                    errors.append(f"{where}: {pid}: tier {h.get('tier')} unknown")
                for s in h.get("stages", []) or []:
                    if s not in wild:
                        errors.append(f"{where}: {pid}: stage {s} isn't wild")
                for a in h.get("areas", []) or []:
                    if a not in places[pid].get("maps", []):
                        errors.append(f"{where}: {pid}: area {a} isn't one of its maps")
                for w in h.get("weather", []) or []:
                    if w not in WEATHERS:
                        errors.append(f"{where}: {pid}: weather {w} unknown")
                if not h.get("why"):
                    errors.append(f"{where}: {pid}: no reason")
                for m in h.get("methods", []):
                    for s in seasons_of(h.get("seasons")):
                        table.setdefault((pid, m, s), []).append((fid, h.get("tier"), times))
        for fid in ids:
            if fid not in seen and os.path.exists(path):
                errors.append(f"{path}: {fid} missing")

    for e in errors:
        print("error:", e)
    print(f"{drafted} families drafted, {len(errors)} errors")
    if report or counts:
        for pid in places:
            for m in METHODS:
                row = [(s, table.get((pid, m, s), [])) for s in SEASONS]
                if not any(r for _, r in row):
                    continue
                if counts:
                    print(f"{pid:28} {m:17} " + "  ".join(f"{s[:2]} {len(set(x[0] for x in r)):2}" for s, r in row))
                else:
                    print(f"{pid} / {m}")
                    for s, r in row:
                        print(f"  {s}: " + ", ".join(f"{fid}({tier[0:2]})" for fid, tier, _ in r))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
