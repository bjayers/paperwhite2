"""Paper White 2: the one-time conversion of the overworld Pokémon sheets onto the battle palettes, run on 2026-11-22
(docs/paperwhite2/design/follower-palette-remap.md, section 9). Kept for the record and for a re-run on an older
checkout; on the converted res/ it finds nothing to do. `overworld_palettes.py convert [--dry-run]` runs it:

1. The Arceus follower rows of forms 9 to 16 showed the walking sprite of the form before theirs (the walking
   sprites keep the original game's ??? form at 9, so sheet N has battle form N - 1's colours from 10 on), and form
   17's showed form 13's: each row now shows the sheet of its colours, form 17 (no sheet of its own) sheet 14, which
   its own palette colours.
2. Every shiny follower row (follower.shiny) and its object code removed: a shiny follower or wanderer shows its
   normal row's sheet with its group's battle shiny palette (paperwhite2_actor_palettes.c), so the 174 hand-made
   _shiny sheets and the 1128 rows that pointed at a normal sheet are duplicates. Nothing else names them.
3. Every other Pokémon sheet re-indexed onto its group's battle palette with F (overworld_palettes.remap_sheet), the
   group the sheet's own code shows, its sexes' art those of the rows on it; the opt-outs (OPT_OUTS) keep their own.
4. A row on a sheet of another species whose palette can't colour it gets a map (Appletun's and Flapple's on Budew's).
"""
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.paperwhite2.overworld_palettes import (OBJ_CODES, Actors, directory, group_name, has_female_art,  # noqa: E402
                                                  remap_sheet, row_map, same_layout, write_json)

OPT_OUTS = {
    "OBJ_CODE_POKEMON_CASTFORM": "one sheet for Castform's four forms, whose battle palettes can't colour it: they "
                                 "need sheets of their own",
    "OBJ_CODE_POKEMON_CHERRIM": "one sheet for Cherrim's two forms, whose battle palettes can't colour it: they need "
                                "sheets of their own",
    "OBJ_CODE_POKEMON_HYDRAPPLE": "Hydrapple's battle sprites and palettes are still Budew's placeholders, so it has "
                                  "no palette of its own to index this sheet on",
    "OBJ_CODE_POKEMON_ARCEUS_FORM_9": "the original game's ??? Arceus: none of the hack's battle forms has its "
                                      "colours (forms 9 to 16 are sheets 10 to 17)",
}
# Sheet N of the walking Arceus has battle form N - 1's colours from 10 on (step 1)
ARCEUS_SHEETS = {f"OBJ_CODE_POKEMON_ARCEUS_FORM_{n}": f"arceus/form_{n - 1}" for n in range(10, 18)}
ARCEUS_ROWS = {**{form: f"OBJ_CODE_POKEMON_ARCEUS_FORM_{form + 1}" for form in range(9, 17)},
               17: "OBJ_CODE_POKEMON_ARCEUS_FORM_14"}


def fix_arceus(dry_run: bool) -> list[str]:
    done = []
    for form, sheet in ARCEUS_ROWS.items():
        path = directory(f"OBJ_CODE_FOLLOWER_ARCEUS_FORM_{form}") / "data.json"
        data = json.loads(path.read_text())
        if data.get("sprite") != sheet:
            done.append(f"arceus form {form}: {data.get('sprite')} -> {sheet}")
            data["sprite"] = sheet
            if not dry_run:
                write_json(path, data)
    return done


def remove_shiny(actors: Actors, dry_run: bool) -> list[str]:
    shiny = [code for code in actors.codes if actors.data.get(code, {}).get("follower", {}).get("shiny")]
    for code in actors.codes:
        if code not in shiny and actors.owner(code) in shiny:
            raise SystemExit(f"{code} shows the shiny code {actors.owner(code)}'s sheet")
    if dry_run or not shiny:
        return shiny
    removed = set(shiny)
    lines = []
    anchor = None
    for line in OBJ_CODES.read_text().splitlines():
        name = line.split()[0] if line.startswith("OBJ_CODE_") else None
        if name in removed:
            if "=" in line:
                anchor = line.split("=", 1)[1].strip()
            continue
        if name and anchor is not None:
            line = f"{name} = {anchor}" if "=" not in line else line
            anchor = None
        lines.append(line)
    OBJ_CODES.write_text("\n".join(lines) + "\n")
    for code in shiny:
        shutil.rmtree(directory(code))
    return shiny


def sexes_on(actors: Actors, sheet: str, group: str) -> str:
    """The art a sheet's remap reads: the female art when a female row or code of the group shows it."""
    own = actors.own_group(sheet)
    found = {own[1]} if own and own[0] == group else set()
    for code in actors.codes:
        follower = actors.data.get(code, {}).get("follower")
        if follower is None or actors.owner(code) != sheet:
            continue
        row_group = group_name(follower["species"], follower["form"])
        if same_layout(group, row_group):
            found.add("f" if follower["sex"] == "GENDER_FEMALE" and has_female_art(group) else "m")
    return "".join(sorted(found)) or "m"


def convert(dry_run: bool = False):
    print("\n".join(fix_arceus(dry_run)))
    actors = Actors()
    shiny = remove_shiny(actors, dry_run)
    print(f"{len(shiny)} shiny follower codes {'to remove' if dry_run else 'removed'}")
    actors = Actors()
    report = {}
    for code in actors.codes:
        if not actors.is_pokemon_sheet(code) or code in shiny:
            continue
        data = actors.data[code]
        if "palette" in data:
            continue
        path = directory(code)
        if code in OPT_OUTS:
            report[code] = ["opt-out: " + OPT_OUTS[code]]
            if not dry_run:
                data["palette"] = {"opt_out": OPT_OUTS[code]}
                write_json(path / "data.json", data)
            continue
        group = ARCEUS_SHEETS.get(code) or (actors.own_group(code) or (None,))[0]
        if group is None:
            raise SystemExit(f"{code}: no battle group")
        report[code] = remap_sheet(path, group, sexes_on(actors, code, group), dry_run)
    actors = Actors()
    for code in actors.codes:
        data = actors.data.get(code, {})
        follower = data.get("follower")
        owner = actors.owner(code)
        if follower is None or owner is None or "palette" in data or dry_run:
            continue
        sheet = actors.data[owner].get("palette", {})
        group = group_name(follower["species"], follower["form"])
        if "pokemon" in sheet and not same_layout(sheet["pokemon"], group):
            sexes = "f" if follower["sex"] == "GENDER_FEMALE" and has_female_art(group) else "m"
            data["palette"] = {"pokemon": group, "map": row_map(directory(owner), sheet["pokemon"], group, sexes)}
            write_json(directory(code) / "data.json", data)
            report[code] = [f"mapped onto {sheet['pokemon']}'s sheet"]
    flagged = {code: reasons for code, reasons in report.items() if reasons}
    print(f"{len(report)} sheets and rows; {len(flagged)} with notes:")
    for code, reasons in flagged.items():
        print(f"  {code}: {'; '.join(reasons)}")
