#!/usr/bin/env python3
"""Paper White 2: add, remove and fill in a species' alternate forms in res/ (the editor's Pokémon page, Add form;
docs/paperwhite2/design/forms-and-species.md section 11.5).

    pokemon_form.py info                                    # JSON: the forms the original game has, and the groups
    pokemon_form.py add SPECIES [--from FORM] [--name NAME] [--record] [--check]
    pokemon_form.py remove SPECIES FORM [--check]           # only a form the hack added, the last one
    pokemon_form.py record SPECIES FORM on|off [--check]    # whether the form has a data record of its own
    pokemon_form.py icon SPECIES FORM PNG [--female] [--write]
    pokemon_form.py still SPECIES FORM front|back PNG [--write]

SPECIES is a species' directory in res/pokemon (vulpix) or its constant (SPECIES_VULPIX). Every command but info
prints one line of JSON: what it changed ("changed", the files under the checkout, "removed" those it deleted) and a
message; with --check it changes nothing and says what it would do. A refusal exits 1 with the reason.

add makes form N, the species' forms.count, from the species (or from --from FORM) as a template:
- data.json: forms.count + 1; a species without sprite forms gets forms.sprite_offset, the first group after the
  hack's own (tools/data/form_groups.py); a species whose groups are the hack's has every hack species' offsets laid
  out again in their order, so the groups stay without gaps; a species whose groups are the original game's keeps its
  offset, and the packers move its forms (form_groups.py). pokedex.forms gains the template's name (or --name),
  entry, height, weight and shape, and pokedex.form_name the species' name if it has none.
- form_<N>/: the template's battle sprite files, palettes and icons (not its cry, footprint or musical sprites, which
  the form shares with its species).
- form_<N>.json and its forms.json row, with --record, or always when the species' forms have records (the game
  reads a form's record at formFile + form - 1, so a species' forms have records all or none): the template's record
  without what only a species has (name, name_article, pokedex, baby_species, regional_dex_number, cry_volume and
  learnset.egg_moves), and with no evolutions: the game reads the species' for every form, and an evolution's form
  says which form takes it. Records made for the species' other forms then too, as copies of the species'. The
  species' form records' forms.count follows.
- the followers: res/field/actors/followers/<species>_form_<N>[_female][_shiny]/, copies of the template's, with
  their OBJ_CODE_FOLLOWER_ constants after the last follower code in generated/obj_codes.txt (GetIndexOfObjID's range
  ends at the generated FOLLOWING_LAST_OBJ_CODE).
- the Wonder Trade: a species listed in wonder_trade.forms gets a weight for the form, its first form's; one not listed
  receives the form anyway (pokemon_center.py), unless wonder_trade.excluded_forms lists it.
The Pokédex needs nothing: its form directory and the save's remap follow forms.count (save-expansion.md section 11).

remove undoes add for the species' last form, if the original game doesn't have it: also its no_evolution entry, the
species' evolutions for it (and every evolution's form condition when one form is left), its excluded_forms row, the
sprite_offset when no sprite form is left (0) or the hack groups laid out again, and the
form_name when the species is left with one form and had none in the original game.

record on gives the form (and any of the species' forms without one) a record copied from the species'; off removes
every form record of the species, if the original game has none for it.

icon checks a PNG (32 by 64, the icon's two frames; indexed or RGB(A), colors rounded to the DS's) against
res/pokemon/shared/icon_palettes.pal's banks and, with --write, writes it as form_<N>/icon.png (icon_female.png with
--female) in the first bank that has all its colors: the bank the build then gives the form (pokemon_graphics.icon_bank,
pokemon_forms.py). still writes a 96 by 96 front_single.png or back_single.png in the form's normal.pal. Both print a
preview (an RGBA PNG in base64). The animated battle sprite (front.png, back.png and their cells and animations) of a
new form is a copy of its template's; its art is exported and imported on that rig by battle_sprite.py
(docs/paperwhite2/design/battle-sprites.md section 14).
"""
import argparse
import base64
import json
import shutil
import struct
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.datajson import dumps  # noqa: E402
from tools.data.form_groups import (ORIGINAL_FORM_GROUPS, FormGroupsError, layout, moved_species,  # noqa: E402
                                    data_species, national_species, next_free_offset, original_form_counts,
                                    species_names)
from tools.data.gen_constants import parse  # noqa: E402
from tools.data.narc import read_narc  # noqa: E402
from tools.data.nitro_2d import (color5, read_indexed_png, read_palette, read_rgba_png, write_indexed_png,  # noqa: E402
                                 write_rgba_png)
from tools.paperwhite2 import mcss_rig  # noqa: E402

POKEMON = ROOT / "res/pokemon"
FORMS = POKEMON / "forms.json"
FOLLOWERS = ROOT / "res/field/actors/followers"
OBJ_CODES = ROOT / "generated/obj_codes.txt"
SERVICES = ROOT / "res/paperwhite2/pokemon_center/services.json"
ICON_PALETTES = POKEMON / "shared/icon_palettes.pal"
# A Pokémon's form field is 5 bits (include/pml/poke_party.h)
FORM_MAX = 32
# What only a species' record has (docs/paperwhite2/design/forms-and-species.md section 11.5)
SPECIES_ONLY = ("name", "name_article", "pokedex", "baby_species", "regional_dex_number", "cry_volume")
# The files of a form's art: the battle sprite group's sources (pokemon_graphics.SLOT_NAMES, a side's five MCSS files
# from its rig, mcss_rig.py) and the icons
ART_FILES = tuple(f"{side}{kind}" for side in ("front", "back") for kind in (
    "_single.png", "_single_female.png", ".png", "_female.png", mcss_rig.RIG_FILE)) + ("normal.pal", "shiny.pal",
                                                                                         "icon.png", "icon_female.png")
# The follower variants of a form, in the order their codes take (as the Spiky-eared Pichu's)
FOLLOWER_SUFFIXES = ("", "_shiny", "_female", "_female_shiny")
# The pokedex object's keys in the schema's order, where form_name goes
POKEDEX_ORDER = ("category", "entry", "height", "weight", "shape", "form_name", "forms", "languages")
ICON_SIZE = (32, 64)
STILL_SIZE = (96, 96)


class FormError(Exception):
    pass


class Changes:
    """The files a command writes and removes, applied at the end unless it is a check."""

    def __init__(self):
        self.writes: dict[Path, bytes] = {}
        self.removes: list[Path] = []

    def json(self, path: Path, data):
        self.writes[path] = (dumps(data) + "\n").encode()

    def text(self, path: Path, text: str):
        self.writes[path] = text.encode()

    def copy(self, source: Path, target: Path):
        self.writes[target] = source.read_bytes()

    def remove(self, path: Path):
        self.removes.append(path)

    def apply(self):
        for path, data in self.writes.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as temporary:
                temporary.write(data)
            Path(temporary.name).replace(path)
        for path in self.removes:
            if path.is_dir():
                shutil.rmtree(path)
            elif path.exists():
                path.unlink()

    def report(self, message: str, check: bool, **extra) -> dict:
        def rel(path: Path) -> str:
            return path.relative_to(ROOT).as_posix()
        return {"ok": True, "check": check, "message": message, "changed": sorted(rel(p) for p in self.writes),
                "removed": sorted(rel(p) for p in self.removes), **extra}


def read(path: Path):
    return json.loads(path.read_text())


def species_dir(name: str) -> str:
    folder = name.removeprefix("SPECIES_").lower()
    if folder not in data_species()[1:]:
        raise FormError(f"{name} isn't a Pokémon species")
    return folder


def constant(folder: str) -> str:
    return f"SPECIES_{folder.upper()}"


def personal_original(folder: str) -> tuple[int, int]:
    """The original game's (formFile, formCount) of a species, from the extracted personal archive; none for an added
    species (tools/data/species_list.py)."""
    if species_names().index(folder) >= national_species():
        return 0, 1
    for version in ("w2_us", "b2_us"):
        path = ROOT / "extract" / version / "files/a/0/1/6"
        if path.is_file():
            record = read_narc(path.read_bytes())[species_names().index(folder)]
            form_file, _, count = struct.unpack_from("<HHB", record, 0x1C)
            return form_file, count
    raise FormError("extract/w2_us/files/a/0/1/6 is missing: extract the base ROM first")


def record_rows(folder: str) -> tuple[list, list[int]]:
    """forms.json's rows, and the indices of the species' rows."""
    rows = read(FORMS)
    return rows, [i for i, (name, _) in enumerate(rows) if name == constant(folder)]


def form_record(template: dict, count: int) -> dict:
    """A form's record from a species' or another form's: without what only a species has, and evolutions."""
    record = {key: value for key, value in template.items() if key not in SPECIES_ONLY}
    record["forms"] = {"count": count, "sprite_offset": 0}
    record["learnset"] = {key: value for key, value in record["learnset"].items() if key != "egg_moves"}
    # the game reads its species' evolutions (tools/data/species_data.py refuses a form's own)
    record["evolutions"] = []
    return record


def with_form_name(pokedex: dict, name: str) -> dict:
    """The pokedex object with a form_name, in the schema's order of its keys."""
    out = dict(pokedex, form_name=name)
    return {key: out[key] for key in sorted(out, key=lambda k: POKEDEX_ORDER.index(k) if k in POKEDEX_ORDER else 99)}


def hack_species_offsets(changed: dict[str, dict]) -> dict[str, int]:
    """Every species with the hack's own groups (a data.json sprite_offset from 66), laid out again from 66 in the
    order of their offsets, with changed's forms in place of their files'. Returns {species: new offset}."""
    found = []
    for folder in data_species()[1:]:
        data = changed.get(folder) or read(POKEMON / folder / "data.json")
        forms = data["forms"]
        if forms["count"] > 1 and not data["palette_forms"] and forms["sprite_offset"] >= ORIGINAL_FORM_GROUPS:
            found.append((forms["sprite_offset"], folder, forms["count"]))
    offsets = {}
    following = ORIGINAL_FORM_GROUPS
    for _, folder, count in sorted(found):
        offsets[folder] = following
        following += count - 1
    return offsets


def relayout(changes: Changes, changed: dict[str, dict]):
    """Writes the hack species' new offsets (and changed's data.json files)."""
    for folder, offset in hack_species_offsets(changed).items():
        data = changed.get(folder) or read(POKEMON / folder / "data.json")
        if data["forms"]["sprite_offset"] != offset:
            data["forms"]["sprite_offset"] = offset
            changed[folder] = data
    for folder, data in changed.items():
        changes.json(POKEMON / folder / "data.json", data)


def follower_codes() -> list[str]:
    return [name for name in parse(OBJ_CODES) if name.startswith("OBJ_CODE_FOLLOWER_")]


def follower_folder(folder: str, form: int, suffix: str) -> str:
    return f"{folder}_form_{form}{suffix}" if form else f"{folder}{suffix}"


def add_obj_codes(text: str, names: list[str]) -> str:
    """obj_codes.txt with names after the last follower code."""
    lines = text.splitlines(keepends=True)
    last = follower_codes()[-1]
    index = next(i for i, line in enumerate(lines) if line.split("#")[0].split("=")[0].strip() == last)
    return "".join(lines[:index + 1] + [f"{name}\n" for name in names] + lines[index + 1:])


def remove_obj_codes(text: str, names: set[str]) -> str:
    return "".join(line for line in text.splitlines(keepends=True)
                   if line.split("#")[0].split("=")[0].strip() not in names)


def wonder_trade_add(changes: Changes, species: str):
    """A species listed in wonder_trade.forms gets a weight for its new form, its first form's."""
    services = read(SERVICES)
    for entry in services["wonder_trade"]["forms"]:
        if entry["species"] == species and "weights" in entry:
            entry["weights"].append(entry["weights"][0])
            changes.json(SERVICES, services)


def wonder_trade_remove(changes: Changes, species: str, form: int):
    services = read(SERVICES)
    trade = services["wonder_trade"]
    changed = False
    for entry in trade["forms"]:
        if entry["species"] == species and "weights" in entry and len(entry["weights"]) > form:
            del entry["weights"][form]
            changed = True
    kept = [entry for entry in trade["excluded_forms"] if (entry["species"], entry["form"]) != (species, form)]
    if len(kept) != len(trade["excluded_forms"]):
        trade["excluded_forms"] = kept
        changed = True
    if changed:
        changes.json(SERVICES, services)


def add(name: str, template_form: int, form_name: str | None, record: bool, check: bool) -> dict:
    folder = species_dir(name)
    data = read(POKEMON / folder / "data.json")
    forms = data["forms"]
    count = forms["count"]
    if data["palette_forms"]:
        raise FormError(f"{folder}'s forms are palettes only (palette_forms), which Add form can't make")
    if count >= FORM_MAX:
        raise FormError(f"{folder} has {count} forms, the most a Pokémon's form field holds")
    if not 0 <= template_form < count:
        raise FormError(f"{folder} has no form {template_form} to copy")
    form = count
    changes = Changes()
    source = POKEMON / folder / (f"form_{template_form}" if template_form else "")
    if template_form and not (source / "front.png").is_file():
        # A form without art of its own (Unown's are all there; Genesect's drives only change the record) is drawn as
        # the species
        source = POKEMON / folder
    # The form's art
    for art in ART_FILES:
        if (source / art).is_file():
            target = POKEMON / folder / f"form_{form}"
            if art.endswith(mcss_rig.RIG_FILE):
                # A rig names its schema relative to its folder
                side = art.removesuffix(mcss_rig.RIG_FILE)
                changes.text(target / art, mcss_rig.dumps(mcss_rig.read_side(source, side), target))
            else:
                changes.copy(source / art, target / art)
    # The species' data
    pokedex = data["pokedex"]
    template_dex = pokedex["forms"][template_form - 1] if template_form else pokedex
    entry = {"name": form_name or f"Form {form}", "entry": template_dex["entry"],
             "height": template_dex["height"], "weight": template_dex["weight"], "shape": template_dex["shape"]}
    if "form_name" not in pokedex:
        pokedex = with_form_name(pokedex, data["name"])
    pokedex["forms"] = [*pokedex.get("forms", []), entry]
    data["pokedex"] = with_form_name(pokedex, pokedex["form_name"])
    forms["count"] = count + 1
    if count == 1:
        forms["sprite_offset"] = next_free_offset()
    changed = {folder: data}
    relayout(changes, changed)
    # The records
    rows, own = record_rows(folder)
    if own or record:
        records = {f: POKEMON / folder / f"form_{f}.json" for f in range(1, count + 1)}
        template_record = (read(records[template_form]) if template_form and records[template_form].is_file()
                           else read(POKEMON / folder / "data.json"))
        new_rows = []
        for f in range(1, count + 1):
            if f < count and records[f].is_file():
                existing = read(records[f])
                existing["forms"]["count"] = count + 1
                changes.json(records[f], existing)
                continue
            base = template_record if f == count else read(POKEMON / folder / "data.json")
            changes.json(records[f], form_record(base, count + 1))
            new_rows.append([constant(folder), f])
        at = own[-1] + 1 if own else len(rows)
        changes.json(FORMS, rows[:at] + new_rows + rows[at:])
    # The followers
    names = []
    template_base = follower_folder(folder, template_form, "")
    if not (FOLLOWERS / template_base).is_dir():
        template_base = folder
    for suffix in FOLLOWER_SUFFIXES:
        source_folder = FOLLOWERS / f"{template_base}{suffix}"
        if not (source_folder / "data.json").is_file():
            continue
        target = FOLLOWERS / follower_folder(folder, form, suffix)
        for file in sorted(source_folder.iterdir()):
            if file.name == "data.json":
                follower = read(file)
                follower["follower"]["form"] = form
                changes.json(target / "data.json", follower)
            else:
                changes.copy(file, target / file.name)
        names.append(f"OBJ_CODE_FOLLOWER_{follower_folder(folder, form, suffix).upper()}")
    if names:
        changes.text(OBJ_CODES, add_obj_codes(OBJ_CODES.read_text(), names))
    wonder_trade_add(changes, constant(folder))
    if not check:
        changes.apply()
        form_groups_check()
    template = f"form {template_form}" if template_form else "the species"
    return changes.report(f"{data['name']}'s form {form}, \"{entry['name']}\", copied from {template}"
                          + (", with its own record" if own or record else ""), check, form=form)


def removable(folder: str, form: int, data: dict):
    count = data["forms"]["count"]
    original = original_form_counts()[folder]
    if not 0 < form < count:
        raise FormError(f"{folder} has no form {form}")
    if form < original:
        raise FormError(f"{folder}'s form {form} is the original game's, which can't be removed")
    if form != count - 1:
        raise FormError(f"only {folder}'s last form ({count - 1}) can be removed: remove the forms after {form} first")


def remove(name: str, form: int, check: bool) -> dict:
    folder = species_dir(name)
    data = read(POKEMON / folder / "data.json")
    removable(folder, form, data)
    changes = Changes()
    forms = data["forms"]
    forms["count"] = form
    original_count = original_form_counts()[folder]
    if "no_evolution" in forms:
        forms["no_evolution"] = [f for f in forms["no_evolution"] if f != form]
        if not forms["no_evolution"]:
            del forms["no_evolution"]
    # the evolutions for the form go, and with one form left, every evolution is for it: no condition is needed
    data["evolutions"] = [e for e in data["evolutions"] if e.get("form") != form]
    if form == 1:
        data["evolutions"] = [{k: v for k, v in e.items() if k != "form"} for e in data["evolutions"]]
    pokedex = data["pokedex"]
    pokedex["forms"] = pokedex["forms"][:form - 1]
    if form == 1:
        del pokedex["forms"]
        if original_count == 1:
            pokedex.pop("form_name", None)
        if forms["sprite_offset"] >= ORIGINAL_FORM_GROUPS:
            forms["sprite_offset"] = 0
    changed = {folder: data}
    relayout(changes, changed)
    folder_path = POKEMON / folder / f"form_{form}"
    if folder_path.is_dir():
        changes.remove(folder_path)
    rows, own = record_rows(folder)
    record_path = POKEMON / folder / f"form_{form}.json"
    if record_path.is_file():
        changes.remove(record_path)
        changes.json(FORMS, [row for row in rows if row != [constant(folder), form]])
    for f in range(1, form):
        path = POKEMON / folder / f"form_{f}.json"
        if path.is_file():
            existing = read(path)
            existing["forms"]["count"] = form
            changes.json(path, existing)
    names = set()
    for suffix in FOLLOWER_SUFFIXES:
        target = FOLLOWERS / follower_folder(folder, form, suffix)
        if target.is_dir():
            changes.remove(target)
            names.add(f"OBJ_CODE_FOLLOWER_{target.name.upper()}")
    if names:
        changes.text(OBJ_CODES, remove_obj_codes(OBJ_CODES.read_text(), names))
    wonder_trade_remove(changes, constant(folder), form)
    if not check:
        changes.apply()
        form_groups_check()
    return changes.report(f"{data['name']}'s form {form} removed", check, form=form)


def set_record(name: str, form: int, on: bool, check: bool) -> dict:
    folder = species_dir(name)
    data = read(POKEMON / folder / "data.json")
    count = data["forms"]["count"]
    if not 0 < form < count:
        raise FormError(f"{folder} has no form {form}")
    rows, own = record_rows(folder)
    changes = Changes()
    if on:
        new_rows = []
        for f in range(1, count):
            path = POKEMON / folder / f"form_{f}.json"
            if not path.is_file():
                changes.json(path, form_record(data, count))
                new_rows.append([constant(folder), f])
        if not new_rows:
            return changes.report(f"{data['name']}'s form {form} already has its own record", check)
        if own:
            raise FormError(f"forms.json lists some of {folder}'s forms but not all: fix it by hand")
        changes.json(FORMS, rows + new_rows)
        made = ", ".join(str(f) for _, f in new_rows)
        message = f"{data['name']}'s form{'s' if len(new_rows) > 1 else ''} {made}: a record of its own, copied from the species'"
    else:
        if personal_original(folder)[0]:
            raise FormError(f"{folder}'s forms have records in the original game, which can't be removed")
        if not own:
            return changes.report(f"{data['name']}'s forms have no records of their own", check)
        for f in range(1, count):
            path = POKEMON / folder / f"form_{f}.json"
            if path.is_file():
                changes.remove(path)
        changes.json(FORMS, [row for i, row in enumerate(rows) if i not in own])
        message = f"{data['name']}'s forms use the species' record again"
    if not check:
        changes.apply()
    return changes.report(message, check)


def form_groups_check():
    """The packers' layout of the result, which stops on a gap or two forms with one group."""
    layout.cache_clear()
    layout()


def quantized(color) -> tuple:
    return tuple(color5(color))


def image_colors(path: Path) -> tuple[int, int, list]:
    """A PNG's size and its pixels as DS colors, None where transparent: indexed (index 0 transparent) or RGB(A)
    (alpha under 128 transparent)."""
    try:
        width, height, pixels, colors = read_indexed_png(path)
        return width, height, [None if p == 0 else quantized(colors[p]) for p in pixels]
    except (ValueError, IndexError, KeyError):
        width, height, rgba = read_rgba_png(path)
        out = []
        for i in range(width * height):
            r, g, b, a = rgba[i * 4:i * 4 + 4]
            out.append(None if a < 128 else quantized((r, g, b)))
        return width, height, out


def preview(width: int, height: int, indices: list[int], colors: list) -> str:
    rgba = bytearray()
    for index in indices:
        r, g, b = (round(axis * 255 / 31) for axis in quantized(colors[index]))
        rgba += bytes((r, g, b, 0 if index == 0 else 255))
    return base64.b64encode(write_rgba_png(width, height, bytes(rgba))).decode()


def art_target(name: str, form: int) -> tuple[str, Path, dict]:
    folder = species_dir(name)
    data = read(POKEMON / folder / "data.json")
    if not 0 < form < data["forms"]["count"]:
        raise FormError(f"{folder} has no form {form}")
    target = POKEMON / folder / f"form_{form}"
    if not (target / "front.png").is_file():
        raise FormError(f"{folder}'s form {form} has no art of its own (form_{form}/): it is drawn as its species")
    return folder, target, data


def import_icon(name: str, form: int, png: Path, female: bool, write: bool) -> dict:
    _, target, _ = art_target(name, form)
    width, height, pixels = image_colors(png)
    if (width, height) != ICON_SIZE:
        raise FormError(f"The icon must be {ICON_SIZE[0]} by {ICON_SIZE[1]} pixels (its two frames, one above the "
                        f"other), not {width} by {height}")
    palette = read_palette(ICON_PALETTES)
    used = sorted(set(p for p in pixels if p is not None))
    for bank in range(len(palette) // 16):
        colors = [quantized(c) for c in palette[bank * 16:bank * 16 + 16]]
        if all(c in colors[1:] for c in used):
            indices = [0 if p is None else colors.index(p, 1) for p in pixels]
            changes = Changes()
            out = target / ("icon_female.png" if female else "icon.png")
            changes.writes[out] = write_indexed_png(width, height, bytes(indices), palette[bank * 16:bank * 16 + 16])
            if write:
                changes.apply()
            return changes.report(f"The icon fits palette bank {bank} of shared/icon_palettes.pal", not write,
                                  bank=bank, preview=preview(width, height, indices, palette[bank * 16:bank * 16 + 16]))
    best = min(range(len(palette) // 16), key=lambda bank: sum(
        c not in [quantized(x) for x in palette[bank * 16 + 1:bank * 16 + 16]] for c in used))
    missing = [c for c in used if c not in [quantized(x) for x in palette[best * 16 + 1:best * 16 + 16]]]
    raise FormError(f"The icon's colors aren't all in one of the {len(palette) // 16} icon palettes: the closest, bank "
                    f"{best}, lacks {len(missing)} (as 5-bit RGB: {', '.join(str(c) for c in missing[:6])}). Draw it "
                    "in one bank's colors (an exported icon.png has them)")


def import_still(name: str, form: int, side: str, png: Path, write: bool) -> dict:
    _, target, _ = art_target(name, form)
    width, height, pixels = image_colors(png)
    if (width, height) != STILL_SIZE:
        raise FormError(f"The still must be {STILL_SIZE[0]} by {STILL_SIZE[1]} pixels, not {width} by {height}")
    palette = read_palette(target / "normal.pal")[:16]
    colors = [quantized(c) for c in palette]
    missing = sorted(set(p for p in pixels if p is not None and p not in colors[1:]))
    if missing:
        raise FormError(f"{len(missing)} of the still's colors aren't in the form's normal.pal (as 5-bit RGB: "
                        f"{', '.join(str(c) for c in missing[:6])}): draw it in the palette's colors, which the "
                        "animated sprite shares")
    indices = [0 if p is None else colors.index(p, 1) for p in pixels]
    changes = Changes()
    changes.writes[target / f"{side}_single.png"] = write_indexed_png(width, height, bytes(indices), palette)
    if write:
        changes.apply()
    return changes.report(f"The {side} still fits the form's palette", not write,
                          preview=preview(width, height, indices, palette))


def info() -> dict:
    """The original game's form counts (species with more than one), which species' forms have records there, the
    species moved to the hack's groups, and the next free group."""
    counts = original_form_counts()
    records = []
    for folder, count in counts.items():
        if count > 1 and personal_original(folder)[0]:
            records.append(folder)
    return {"original": {folder: count for folder, count in counts.items() if count > 1},
            "originalRecords": records, "moved": moved_species(), "nextFreeGroup": next_free_offset(),
            "formMax": FORM_MAX}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("info")
    p = commands.add_parser("add")
    p.add_argument("species")
    p.add_argument("--from", dest="template", type=int, default=0)
    p.add_argument("--name")
    p.add_argument("--record", action="store_true")
    p.add_argument("--check", action="store_true")
    p = commands.add_parser("remove")
    p.add_argument("species")
    p.add_argument("form", type=int)
    p.add_argument("--check", action="store_true")
    p = commands.add_parser("record")
    p.add_argument("species")
    p.add_argument("form", type=int)
    p.add_argument("state", choices=("on", "off"))
    p.add_argument("--check", action="store_true")
    p = commands.add_parser("icon")
    p.add_argument("species")
    p.add_argument("form", type=int)
    p.add_argument("png", type=Path)
    p.add_argument("--female", action="store_true")
    p.add_argument("--write", action="store_true")
    p = commands.add_parser("still")
    p.add_argument("species")
    p.add_argument("form", type=int)
    p.add_argument("side", choices=("front", "back"))
    p.add_argument("png", type=Path)
    p.add_argument("--write", action="store_true")
    args = parser.parse_args()
    try:
        if args.command == "info":
            result = info()
        elif args.command == "add":
            result = add(args.species, args.template, args.name, args.record, args.check)
        elif args.command == "remove":
            result = remove(args.species, args.form, args.check)
        elif args.command == "record":
            result = set_record(args.species, args.form, args.state == "on", args.check)
        elif args.command == "icon":
            result = import_icon(args.species, args.form, args.png, args.female, args.write)
        else:
            result = import_still(args.species, args.form, args.side, args.png, args.write)
    except (FormError, FormGroupsError, mcss_rig.RigError, ValueError) as error:
        print(json.dumps({"ok": False, "message": str(error)}))
        sys.exit(1)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
