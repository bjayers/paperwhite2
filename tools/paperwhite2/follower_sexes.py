"""Paper White 2: the follower rows' sexes (docs/paperwhite2/following-pokemon.md, "One row for both sexes").

A species' or form's female has a follower row of her own (followers/<row>_female, OBJ_CODE_FOLLOWER_..._FEMALE)
only when her follower art differs from the male's; otherwise the male's row is both sexes': FindFollowerRow
(paperwhite2_following_field.c) takes the other sex's row of the same form before another form's, and the Entralink
tools (entralink_run.follower_sprite) fall back to it too. A species that is always female keeps her row alone.

    follower_sexes.py duplicates                          the female rows that show what the male's does
    follower_sexes.py dedupe [--dry-run]                  removes them (run once on 2026-11-22)
    follower_sexes.py remove-female SPECIES [--form N] [--write]
                                                          the Pokémon Editor's "Remove the female sprite" (JSON)

A duplicate shows the same sheet (the same code, or a sheet of the same pixels and colours) with the same follower
fields (profile, offsets, gaps, palette) and record. Removing a female row removes its folder (its sprite.png too,
when it has one no other row shows) and its line of generated/obj_codes.txt; the follower codes after it renumber,
which is safe: nothing stores a follower code (the follower and the wanderers pick theirs at run time, events and
rooms name them by constant), and a code something in res/ names isn't removed.
"""
import argparse
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.nitro_2d import read_indexed_png, read_palette  # noqa: E402
from tools.paperwhite2.overworld_palettes import OBJ_CODES, directory, group_name, row_palettes  # noqa: E402

FOLLOWERS = ROOT / "res" / "field" / "actors" / "followers"
RES = ROOT / "res"
FOLLOWER_CODE = re.compile(r"\bOBJ_CODE_FOLLOWER_[A-Z0-9_]+\b")
TEXT_SUFFIXES = {".json", ".s", ".txt", ".inc", ".h"}
MALE, FEMALE = "GENDER_MALE", "GENDER_FEMALE"


def code_of(row: str) -> str:
    return f"OBJ_CODE_FOLLOWER_{row.upper()}"


def read_rows(followers: Path = FOLLOWERS) -> dict[tuple[str, int], dict[str, tuple[str, dict]]]:
    """The follower rows by (species, form), then by sex: (row folder, data.json)."""
    groups: dict[tuple[str, int], dict[str, tuple[str, dict]]] = {}
    for path in sorted(followers.glob("*/data.json")):
        data = json.loads(path.read_text())
        follower = data.get("follower")
        if not follower:
            continue
        key = (follower["species"], follower.get("form", 0))
        groups.setdefault(key, {})[follower.get("sex", "")] = (path.parent.name, data)
    return groups


def owner(row: str, data: dict) -> str:
    """The code whose sprite.png a row shows."""
    return data.get("sprite") or code_of(row)


def sheet_look(code: str) -> tuple | None:
    """What a sheet shows: its pixels and the colours its own data gives them (a battle group or its sprite.pal)."""
    folder = directory(code)
    if not (folder / "sprite.png").is_file():
        return None
    width, height, pixels, _ = read_indexed_png(folder / "sprite.png")
    data = json.loads((folder / "data.json").read_text())
    palette = data.get("palette", {})
    colours = palette.get("pokemon") or (tuple(read_palette(folder / "sprite.pal"))
                                         if (folder / "sprite.pal").is_file() else None)
    return width, height, pixels, colours


def colours_of(data: dict, sheet: str) -> tuple | None:
    """A row's colours as the build writes them (row_palettes), None for a sheet's own."""
    owner_data = json.loads((directory(sheet) / "data.json").read_text())
    try:
        found = row_palettes(data, owner_data)
    except ValueError:
        return ("error",)
    return None if found is None else (tuple(map(tuple, found[0])), tuple(map(tuple, found[1])))


# (the sheet's own: a row that shows another code's sheet has none of them)
RECORD_SKIP = {"follower", "sprite", "palette", "texture_set_format", "sprite_batch"}


def is_duplicate(male: tuple[str, dict], female: tuple[str, dict]) -> bool:
    """Whether a female row shows what the male's does: the same sheet (or one of the same pixels and colours), the
    same colours, and the same follower fields and record."""
    (m_row, m), (f_row, f) = male, female
    m_sheet, f_sheet = owner(m_row, m), owner(f_row, f)
    if m_sheet != f_sheet:
        m_look, f_look = sheet_look(m_sheet), sheet_look(f_sheet)
        if m_look is None or m_look != f_look:
            return False
    if colours_of(m, m_sheet) != colours_of(f, f_sheet):
        return False
    strip = lambda d: {k: v for k, v in d["follower"].items() if k != "sex"}  # noqa: E731
    if strip(m) != strip(f):
        return False
    record = lambda d: {k: v for k, v in d.items() if k not in RECORD_SKIP}  # noqa: E731
    return record(m) == record(f)


def duplicates(followers: Path = FOLLOWERS) -> list[tuple[str, str]]:
    """(male row, female row) for each female row that duplicates the male's, in row order."""
    out = []
    for sexes in read_rows(followers).values():
        if MALE in sexes and FEMALE in sexes and is_duplicate(sexes[MALE], sexes[FEMALE]):
            out.append((sexes[MALE][0], sexes[FEMALE][0]))
    return sorted(out, key=lambda pair: pair[1])


def named_codes(skip: set[Path]) -> set[str]:
    """Every follower code a file of res/ names, but the follower rows' own data.json files in skip."""
    found: set[str] = set()
    for path in RES.rglob("*"):
        if path.suffix not in TEXT_SUFFIXES or path in skip or not path.is_file():
            continue
        found.update(FOLLOWER_CODE.findall(path.read_text(errors="replace")))
    return found


def remove_codes_text(text: str, removed: set[str]) -> str:
    """obj_codes.txt without the removed codes; a removed code that gave the block's first value hands it on."""
    lines, anchor = [], None
    for line in text.splitlines():
        name = line.split("#")[0].split("=")[0].strip() if line.startswith("OBJ_CODE_") else None
        if name in removed:
            if "=" in line:
                anchor = line.split("=", 1)[1].strip()
            continue
        if name and anchor is not None:
            line = line if "=" in line else f"{name} = {anchor}"
            anchor = None
        lines.append(line)
    return "\n".join(lines) + "\n"


def remove_rows(rows: list[str]):
    """The rows' folders and their codes' lines removed."""
    OBJ_CODES.write_text(remove_codes_text(OBJ_CODES.read_text(), {code_of(r) for r in rows}))
    for row in rows:
        shutil.rmtree(FOLLOWERS / row)


def shown_by_others(row: str) -> list[str]:
    """The other follower rows that show a row's own sheet."""
    code = code_of(row)
    return sorted(p.parent.name for p in FOLLOWERS.glob("*/data.json")
                  if p.parent.name != row and json.loads(p.read_text()).get("sprite") == code)


def dedupe(dry_run: bool) -> dict:
    pairs = duplicates()
    rows = [female for _, female in pairs]
    named = named_codes({FOLLOWERS / r / "data.json" for r in rows})
    kept = [r for r in rows if code_of(r) in named or shown_by_others(r)]
    removed = [r for r in rows if r not in kept]
    sizes = sum(f.stat().st_size for r in removed for f in (FOLLOWERS / r).iterdir())
    sheets = [r for r in removed if (FOLLOWERS / r / "sprite.png").is_file()]
    if not dry_run:
        remove_rows(removed)
    return {"removed": len(removed), "kept_named": kept, "own_sheets": sheets, "source_bytes": sizes}


def remove_female(species: str, form: int, write: bool) -> dict:
    """Remove a species' or form's female row: the male's then shows both sexes. Refused when there is no male row
    (a species that is always female), when another row shows the female's sheet, or when res/ names her code."""
    constant = species if species.startswith("SPECIES_") else "SPECIES_" + species.upper()
    sexes = read_rows().get((constant, form), {})
    label = constant.removeprefix("SPECIES_").title() + (f" form {form}" if form else "")
    errors = []
    if FEMALE not in sexes:
        errors.append(f"{label} has no female follower row")
    elif MALE not in sexes:
        errors.append(f"{label} has no male follower row to fall back to (a species that is always female keeps hers)")
    else:
        row = sexes[FEMALE][0]
        others = shown_by_others(row)
        if others:
            errors.append(f"{row}'s sheet is shown by {', '.join(others)}: point them at another sheet first")
        elif code_of(row) in named_codes({FOLLOWERS / row / "data.json"}):
            errors.append(f"{code_of(row)} is named in res/ (an NPC, ambient or room): change that first")
    changed = []
    if not errors:
        row = sexes[FEMALE][0]
        changed = sorted(f"res/field/actors/followers/{row}/{f.name}" for f in (FOLLOWERS / row).iterdir())
        changed.append("generated/obj_codes.txt")
        if write:
            remove_rows([row])
    message = (f"Can't remove: {errors[0]}" if errors else
               f"{'Removed' if write else 'Removes'} {sexes[FEMALE][0]}: the male's sprite shows both sexes")
    return {"ok": not errors, "check": not write, "errors": errors, "changed": changed, "message": message,
            "group": group_name(constant, form)}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("duplicates")
    p = commands.add_parser("dedupe")
    p.add_argument("--dry-run", action="store_true")
    p = commands.add_parser("remove-female")
    p.add_argument("species")
    p.add_argument("--form", type=int, default=0)
    p.add_argument("--write", action="store_true")
    args = parser.parse_args()
    if args.command == "duplicates":
        for male, female in duplicates():
            print(f"{female} = {male}")
    elif args.command == "dedupe":
        print(json.dumps(dedupe(args.dry_run)))
    else:
        result = remove_female(args.species, args.form, args.write)
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(0 if result["ok"] or not args.write else 1)


if __name__ == "__main__":
    main()
