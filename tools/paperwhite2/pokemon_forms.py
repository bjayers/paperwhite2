#!/usr/bin/env python3
"""Paper White 2's own forms of existing species: the generated header of res/pokemon's forms.

    pokemon_forms.py OUTPUT_HEADER      # paperwhite2/pokemon_forms_config.h

The header has, for src/paperwhite2/main/paperwhite2_pokemon_forms.c (include/paperwhite2/pokemon_forms.h):

- the number of the hack's form sprite groups, the groups from form_groups.ORIGINAL_FORM_GROUPS that the
  species' forms.sprite_offset and forms.count give (tools/data/form_groups.py, which also moves a species with more
  forms than its original groups there), and each group's icon palettes: the bank of
  res/pokemon/shared/icon_palettes.pal that its form_<n>/icon.png is drawn in (pokemon_graphics.icon_bank) in the low
  nibble, and its icon_female.png's, or the same where it has none, in the high one, as sPokeIconPalettes has them;
- the forms that never evolve, every species' forms.no_evolution;
- the Pokédex's form directory, POKEDEX_FORM_LIST: { species, count } for every species with more than one form
  (forms.count) that the Pokédex lists (forms.pokedex isn't false), in species order, whose form bits follow one
  another in the save's form lists (src/system/pokedex_savedata.c, src/paperwhite2/main/paperwhite2_pokedex_save.c);
  and POKEDEX_SPECIES_MAX, the national Pokédex's last species. The save keeps the directory it was written with and
  the game remaps its bits on load when this one differs, so forms can be added anywhere
  (docs/paperwhite2/design/save-expansion.md);
- FOLLOWING_LAST_OBJ_CODE, the last follower's object code in generated/obj_codes.txt (OBJ_CODE_FOLLOWER_*), the end of
  the followers' range that GetIndexOfObjID (src/system/field_actor_savedata.c) maps, so that a form's followers
  added after the others need no change to the C.

Only the hack's build runs this (configure.py --hack). tools/paperwhite2/pokedex_save.py reads the same list.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
# pokemon_graphics imports its siblings by name
sys.path.insert(1, str(ROOT / "tools" / "data"))
from tools.data.gen_constants import load as load_list  # noqa: E402
from tools.data.pokemon_graphics import (ORIGINAL_FORM_GROUPS, form_names, icon_bank, national_species,  # noqa: E402
                                         species_names)

POKEMON = ROOT / "res" / "pokemon"
# The save's capacities (include/save/pokedex_savedata.h): species bits, form bits a list, directory entries, and the
# box data's 5-bit form field. A directory entry keeps the species in 11 bits
POKEDEX_SPECIES_CAPACITY = 1504
POKEDEX_FORM_BITS = 1024
POKEDEX_FORM_ENTRY_MAX = 128
POKEDEX_FORM_COUNT_MAX = 32


class FormsError(Exception):
    pass


def icon_palettes() -> list[int]:
    """Each hack form sprite group's icon palettes, in group order."""
    palettes = []
    for group, (species, form) in sorted(form_names().items()):
        if group < ORIGINAL_FORM_GROUPS:
            continue
        folder = POKEMON / species / f"form_{form}"
        if not (folder / "icon.png").is_file():
            raise FormsError(f"{folder / 'icon.png'}: missing, and the form's sprite group needs it")
        male = icon_bank(POKEMON, folder / "icon.png")
        female = icon_bank(POKEMON, folder / "icon_female.png") if (folder / "icon_female.png").is_file() else male
        palettes.append(female << 4 | male)
    return palettes


def no_evolution() -> list[tuple[str, int]]:
    """Every species' forms that never evolve, in species order."""
    forms = []
    for species in species_names()[:national_species()]:
        data = json.loads((POKEMON / species / "data.json").read_text())
        for form in data["forms"].get("no_evolution", []):
            if not 0 < form < data["forms"]["count"]:
                raise FormsError(f"res/pokemon/{species}/data.json: forms.no_evolution's {form} is no alternate form "
                                 f"of its {data['forms']['count']}")
            forms.append(("SPECIES_" + species.upper(), form))
    return forms


def pokedex_species_max() -> int:
    """The national Pokédex's last species, the one before SPECIES_EGG."""
    last = national_species() - 1
    if last > POKEDEX_SPECIES_CAPACITY:
        raise FormsError(f"the Pokédex's {last} species pass the save's {POKEDEX_SPECIES_CAPACITY}")
    return last


def pokedex_form_list() -> list[tuple[int, str, int]]:
    """The Pokédex's form directory: (species number, directory name, form count) of every species with forms that
    the Pokédex lists, in species order. Stops if it passes the save's capacity."""
    entries = []
    for number, species in enumerate(species_names()[:national_species()]):
        if number == 0:
            continue
        forms = json.loads((POKEMON / species / "data.json").read_text())["forms"]
        if forms["count"] <= 1 or not forms.get("pokedex", True):
            continue
        if forms["count"] > POKEDEX_FORM_COUNT_MAX:
            raise FormsError(f"res/pokemon/{species}/data.json: {forms['count']} forms pass the "
                             f"{POKEDEX_FORM_COUNT_MAX} that a Pokémon's form field holds")
        entries.append((number, species, forms["count"]))
    bits = sum(count for _, _, count in entries)
    if len(entries) > POKEDEX_FORM_ENTRY_MAX or bits > POKEDEX_FORM_BITS:
        raise FormsError(f"the Pokédex's forms ({len(entries)} species, {bits} forms) pass the save's "
                         f"{POKEDEX_FORM_ENTRY_MAX} species and {POKEDEX_FORM_BITS} forms")
    return entries


def last_follower() -> str:
    """The follower object code with the highest value, the last of the followers' rows."""
    codes = {name: number for name, number in load_list("obj_codes").items() if name.startswith("OBJ_CODE_FOLLOWER_")}
    if not codes:
        raise FormsError("generated/obj_codes.txt has no OBJ_CODE_FOLLOWER_ codes")
    return max(codes, key=lambda name: (codes[name], name))


def header() -> str:
    palettes = icon_palettes()
    forms = no_evolution()
    dex_forms = pokedex_form_list()
    lines = [
        "#ifndef POKEBW2_PAPERWHITE2_POKEMON_FORMS_CONFIG_H",
        "#define POKEBW2_PAPERWHITE2_POKEMON_FORMS_CONFIG_H",
        "",
        "// Generated by tools/paperwhite2/pokemon_forms.py from res/pokemon, edit that instead",
        "// (include/paperwhite2/pokemon_forms.h)",
        "",
        "// The hack's form sprite groups, from POKEMON_FORMS_ORIGINAL_GROUPS, and their icons' palettes: the male's",
        "// in the low nibble and the female's in the high one, then an unused 0",
        f"#define POKEMON_FORMS_ADDED_GROUPS {len(palettes)}",
        "#define POKEMON_FORMS_ICON_PALETTES " + ", ".join(f"0x{value:02x}" for value in [*palettes, 0]),
        "// The forms that never evolve, as { species, form }, until SPECIES_NONE's",
        "#define POKEMON_FORMS_NO_EVOLUTION " + ", ".join(
            f"{{ {species}, {form} }}" for species, form in [*forms, ("SPECIES_NONE", 0)]),
        "// The Pokédex's form directory, { species, count } of each species whose forms it lists, in species order,",
        f"// {sum(count for _, _, count in dex_forms)} forms; and its last species",
        "#define POKEDEX_FORM_LIST " + ", ".join(
            f"{{ SPECIES_{species.upper()}, {count} }}" for _, species, count in dex_forms),
        f"#define POKEDEX_FORM_ENTRY_COUNT {len(dex_forms)}",
        f"#define POKEDEX_SPECIES_MAX {pokedex_species_max()}",
        "// The last follower's object code (generated/obj_codes.txt), the end of GetIndexOfObjID's followers",
        f"#define FOLLOWING_LAST_OBJ_CODE {last_follower()}",
        "",
        "#endif // POKEBW2_PAPERWHITE2_POKEMON_FORMS_CONFIG_H",
    ]
    return "\n".join(lines) + "\n"


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    try:
        text = header()
    except (FormsError, ValueError) as error:
        sys.exit(f"pokemon_forms.py: {error}")
    output = Path(sys.argv[1])
    if not output.is_file() or output.read_text() != text:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(text)


if __name__ == "__main__":
    main()
