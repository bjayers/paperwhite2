#!/usr/bin/env python3
"""Pack the Pokédex's data archive (a/0/9/7) from the species in res/pokemon.

    pokedex_data.py pack res/pokemon black2|white2 OUTPUT

The archive's files (pokedex_search_engine.c, pokedex_detail_form.c, pokedex_info.c and the hack's Info page):

0. The table of next forms: a u16 per species from SPECIES_NONE to Genesect (to the last added species, with 0 for
   the IDs between and the species that never enter the Pokédex, where species are added: pokedex_rows()), an empty
   slot, then a slot per alternate form (form 1 of a species onward), in species order and form order. A species' entry is its form 1's slot and a
   slot's entry the next form's, 0 after its species' last. The slots are the lines of the alternate forms in the
   text that \\from{species.pokedex.forms.<field>} writes (their names, entries, heights and weights), so the table is
   made from the same pokedex.forms lists, and a form added to a species keeps every other form's text.
1. The species' initials' groups, a byte per species: its English name's first letter, A as 0 to Z as 25 (an
   accented letter as its own, É as E), or 26 for none (SPECIES_NONE's, and the IDs that have no Pokédex row).
2. The search's shapes (PokedexSearchEngine_GetShape): a byte per species, its pokedex.shape, then the empty slot's
   and the alternate forms', their pokedex.forms[].shape, by slot. The empty slot has the last species' shape, as the
   original's has, which nothing reads, since no form's slot is the empty one.
3. 4. 5. Lists of the national Pokédex's species, a u16 each: 3 in number order (1 to 649, then the added species
   by display number, species_list.pokedex_order(), as the hack's list builds it in PokedexSearchEngine_LoadList);
   4 the regional Pokédex's order, every species without a regional number in number order and then the regional
   ones by it (PokedexSearchEngine_LoadList's regional list, which keeps those of the table, and the regional search's
   first order); 5 A to Z by English name (the search's second order, and the PC box's search by name with the first
   letters' groups that tools/paperwhite2/pokemon_forms.py generates from initial_groups()): letters and digits only,
   without case or accents, equal names in ID order (Nidoran♀ before Nidoran♂, Ho-Oh after Honchkrow, Porygon2 before
   Porygon-Z), as the original's. Nothing reads file 3 (the national order is built in code); the hack has no
   regional mode, so file 4 is kept only as the original has it. The added species that enter the Pokédex are in each
   (docs/paperwhite2/design/new-species.md section 5).
6. 7. 8. 9. Every species and alternate form, as form << 10 | species, by height from the tallest, by height from the
   shortest, by weight from the heaviest and by weight from the lightest: the record's height and weight, the form's
   record's for a form that has one (res/pokemon/forms.json) and the species' for one that doesn't. Equal ones are in
   species order and then form order, as the original's are.

An unchanged res/pokemon reproduces the original archive byte for byte.
"""

import json
import struct
import sys
import unicodedata
from pathlib import Path

from narc import read_narc, write_narc
import species_list

ROOT = Path(__file__).resolve().parents[2]
FILE_FORMS, FILE_INITIALS, FILE_SHAPES = 0, 1, 2
FILE_NUMBER_ORDER, FILE_REGIONAL_ORDER, FILE_NAME_ORDER = 3, 4, 5
# The initials' group of a name that starts with no letter
NO_INITIAL = 26
# The orders' files, each with its field and whether it starts from the greatest
ORDERS = {6: ("height", True), 7: ("height", False), 8: ("weight", True), 9: ("weight", False)}
FORM_SHIFT = 10
SPECIES_MASK = (1 << FORM_SHIFT) - 1


class PokedexDataError(Exception):
    pass


def pokedex_rows() -> list[str | None]:
    """The directories of the species that have a row in the archive's species tables, by ID: from SPECIES_NONE to the
    national Pokédex's last, then, where species are added (tools/data/species_list.py), None for the IDs from
    SPECIES_EGG to the first added species and the added species, None for one that never enters the Pokédex."""
    names = species_list.directories()
    rows: list[str | None] = names[:species_list.national_count()]
    if species_list.added_species():
        pokedex = set(species_list.pokedex_species())
        rows += [names[number] if number in pokedex else None
                 for number in range(species_list.national_count(), species_list.last_species() + 1)]
    return rows


def load(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise PokedexDataError(f"{path}: {error}") from None


def species_forms(root: Path) -> tuple[list[dict | None], list[tuple[int, int, dict, dict]]]:
    """The species' data by pokedex_rows(), from SPECIES_NONE (None for an ID without a row), and each alternate form in
    slot order as (species, form, its pokedex.forms entry, its record: the form's own or else the species')."""
    rows = pokedex_rows()
    species = [None if name is None else load(root / name / "data.json") for name in rows]
    records = {(row[0], row[1]) for row in load(root / "forms.json")}
    forms = []
    for number, (name, data) in enumerate(zip(rows, species)):
        if data is None:
            continue
        entries = data["pokedex"].get("forms", [])
        if len(entries) != max(data["forms"]["count"] - 1, 0):
            raise PokedexDataError(f"{name}: pokedex.forms has {len(entries)} forms for a forms.count of "
                                   f"{data['forms']['count']}")
        if number > SPECIES_MASK or len(entries) >= 1 << (16 - FORM_SHIFT):
            raise PokedexDataError(f"{name}: past what the height and weight orders can hold")
        for form, entry in enumerate(entries, 1):
            constant = "SPECIES_" + name.upper()
            record = load(root / name / f"form_{form}.json") if (constant, form) in records else data
            forms.append((number, form, entry, record))
    return species, forms


def forms_file(species: list[dict], forms: list) -> bytes:
    table = [0] * (len(species) + 1 + len(forms))
    previous = {}
    for slot, (number, _, _, _) in enumerate(forms, len(species) + 1):
        table[previous.get(number, number)] = slot
        previous[number] = slot
    return struct.pack(f"<{len(table)}H", *table)


def shapes_file(species: list[dict | None], forms: list) -> bytes:
    shapes = [0 if data is None else data["pokedex"]["shape"] for data in species]
    return bytes([*shapes, shapes[-1], *(entry["shape"] for _, _, entry, _ in forms)])


def folded_name(name: str) -> str:
    """A name as the A to Z order compares it: its letters and digits, lower case and without accents."""
    return "".join(c for c in unicodedata.normalize("NFD", name).lower() if c.isascii() and c.isalnum())


def initial(data: dict | None) -> int:
    """A species' initials' group: its name's first letter, A as 0 to Z as 25, or NO_INITIAL."""
    letter = unicodedata.normalize("NFD", data["name"])[:1].upper() if data else ""
    return ord(letter) - ord("A") if "A" <= letter <= "Z" else NO_INITIAL


def initials_file(species: list[dict | None]) -> bytes:
    return bytes(initial(data) for data in species)


def name_order(species: list[dict | None]) -> list[int]:
    """The Pokédex's species from A to Z (file 5). Stops on a species whose name starts with no letter, which the
    search by first letter and the PC box's groups couldn't place."""
    numbers = [number for number, data in enumerate(species) if number and data is not None]
    for number in numbers:
        if initial(species[number]) == NO_INITIAL:
            raise PokedexDataError(f"{species[number]['name']!r} (species {number}): a Pokédex species' name must start "
                                   "with a letter, which the search by first letter groups it by")
    return sorted(numbers, key=lambda number: (folded_name(species[number]["name"]), number))


def initial_groups(root: Path) -> tuple[list[int], list[int]]:
    """Where each first letter's species start and end in file 5, A to Z (the PC box's search by name, box_search.c)."""
    species, _ = species_forms(root)
    initials = [initial(species[number]) for number in name_order(species)]
    starts = [sum(1 for group in initials if group < letter) for letter in range(NO_INITIAL)]
    ends = [sum(1 for group in initials if group <= letter) for letter in range(NO_INITIAL)]
    return starts, ends


def number_order(root: Path) -> list[int]:
    return species_list.pokedex_order(root)


def regional_order(species: list[dict | None], root: Path) -> list[int]:
    """The regional Pokédex's order (file 4): the species without a regional number, then those with one, by it."""
    order = number_order(root)
    regional = {number: species[number].get("regional_dex_number") for number in order}
    return ([number for number in order if regional[number] is None] +
            sorted((number for number in order if regional[number] is not None), key=lambda number: regional[number]))


def u16_file(values: list[int]) -> bytes:
    return struct.pack(f"<{len(values)}H", *values)


def order_file(species: list[dict | None], forms: list, field: str, greatest_first: bool) -> bytes:
    entries = [(data[field], number, 0) for number, data in enumerate(species) if number and data is not None]
    entries += [(record[field], number, form) for number, form, _, record in forms]
    entries.sort(key=lambda entry: (-entry[0] if greatest_first else entry[0], entry[1], entry[2]))
    return struct.pack(f"<{len(entries)}H", *(form << FORM_SHIFT | number for _, number, form in entries))


def pack(root: Path, game: str, output: Path):
    extracted = ROOT / "extract" / {"black2": "b2_us", "white2": "w2_us"}[game] / "files" / "a/0/9/7"
    original = read_narc(extracted.read_bytes())
    species, forms = species_forms(root)
    files = list(original)
    files[FILE_FORMS] = forms_file(species, forms)
    files[FILE_INITIALS] = initials_file(species)
    files[FILE_SHAPES] = shapes_file(species, forms)
    files[FILE_NUMBER_ORDER] = u16_file(number_order(root))
    files[FILE_REGIONAL_ORDER] = u16_file(regional_order(species, root))
    files[FILE_NAME_ORDER] = u16_file(name_order(species))
    for number, (field, greatest_first) in ORDERS.items():
        files[number] = order_file(species, forms, field, greatest_first)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.unlink(missing_ok=True)
    output.write_bytes(write_narc(files))


if __name__ == "__main__":
    if len(sys.argv) != 5 or sys.argv[1] != "pack":
        raise SystemExit(__doc__)
    try:
        pack(Path(sys.argv[2]), sys.argv[3], Path(sys.argv[4]))
    except (PokedexDataError, species_list.SpeciesListError) as error:
        sys.exit(f"pokedex_data.py: {error}")
