#!/usr/bin/env python3
"""The alternate forms' sprite groups, from res/pokemon/<species>/data.json's forms, for every packer that needs them.

    form_groups.py                  # print each species' groups, and where a species' forms were moved

A form's sprite group is its species' forms.sprite_offset + form - 1, as in the original game, where groups 0 to 65
(ORIGINAL_FORM_GROUPS) are the original species' forms. Paper White 2's own groups follow, from 66, in two runs:

- the species whose data.json gives a sprite_offset from 66 (a species that had no sprite forms, such as the
  Spiky-eared Pichu's), in the order of their offsets, which must follow one another without gaps;
- then, in species order, the species whose original groups are too few for their forms (a form added to Rotom): all
  their forms move to the hack's groups, and the personal record's sprite_offset (species_data.py) is the moved one,
  so the game's own formula finds them. Their original groups stay, built from the same form_<n>/ folders, so the
  archives keep the original game's layout. Their data.json keeps the original offset.

The original game's form counts come from the extracted personal archive (a/0/1/6, the species' records' form count),
so a moved species is found from its data alone. Nothing changes where no species has more forms than its original
groups: the groups are then sprite_offset + form - 1 for every form, as before.
"""
import json
import struct
import sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.narc import read_narc  # noqa: E402
from tools.data import species_list  # noqa: E402

POKEMON = ROOT / "res" / "pokemon"
ORIGINAL_FORM_GROUPS = 66
# The personal record's form count (PersonalData.formCount, include/pml/personal.h)
FORM_COUNT_OFFSET = 0x20


class FormGroupsError(ValueError):
    pass


directory = species_list.directory


@lru_cache(maxsize=1)
def species_names() -> list[str]:
    """The directories of generated/species.txt's species, in order."""
    return species_list.directories()


def national_species() -> int:
    """The number of species up to the national Pokédex's last, the index of SPECIES_EGG."""
    return species_list.national_count()


def data_species() -> list[str]:
    """The directories of the species with a Pokémon's data, by ID: SPECIES_NONE, the national Pokédex's and the
    added species (tools/data/species_list.py), not the egg, the bad egg, the Pokéstar Studios' or the reserved IDs."""
    names = species_names()
    return [names[0]] + [names[number] for number in species_list.real_species()]


@lru_cache(maxsize=1)
def original_form_counts() -> dict[str, int]:
    """Each national species' number of forms in the original game, from the extracted personal archive (either
    version's: they agree)."""
    for version in ("w2_us", "b2_us"):
        path = ROOT / "extract" / version / "files" / "a/0/1/6"
        if path.is_file():
            records = read_narc(path.read_bytes())
            return {species: max(1, records[number][FORM_COUNT_OFFSET])
                    for number, species in enumerate(species_names()[:national_species()])}
    raise FormGroupsError("extract/w2_us/files/a/0/1/6 is missing: extract the base ROM first (docs/building.md)")


def species_forms(root: Path = POKEMON) -> list[tuple[str, dict, bool]]:
    """Each species' (directory, forms, palette_forms), in species order: the national Pokédex's, then the added ones."""
    out = []
    for species in data_species():
        data = json.loads((root / species / "data.json").read_text())
        out.append((species, data["forms"], data["palette_forms"]))
    return out


@lru_cache(maxsize=4)
def layout(root: Path = POKEMON) -> tuple[dict[int, tuple[str, int]], dict[str, int]]:
    """The groups, {group: (species, form)}, and each species' sprite_offset as the personal record has it (the moved
    one for a moved species), for every species with sprite forms."""
    groups: dict[int, tuple[str, int]] = {}
    offsets: dict[str, int] = {}
    moved: list[tuple[str, int]] = []

    def claim(group: int, species: str, form: int):
        if group in groups and groups[group] != (species, form):
            other = groups[group]
            raise FormGroupsError(f"res/pokemon/{species}: form {form}'s sprite group {group} is also {other[0]}'s "
                                  f"form {other[1]}'s (forms.sprite_offset)")
        groups[group] = (species, form)

    for species, forms, palette_only in species_forms(root):
        count, offset = forms["count"], forms["sprite_offset"]
        if count <= 1 or palette_only:
            continue
        offsets[species] = offset
        if offset >= ORIGINAL_FORM_GROUPS:
            for form in range(1, count):
                claim(offset + form - 1, species, form)
            continue
        # An added species has no original groups
        original = original_form_counts().get(species, 1)
        if original <= 1:
            # Forms on a species that had none, without an offset of the hack's: moved like the others
            moved.append((species, count))
            continue
        if count < original:
            raise FormGroupsError(f"res/pokemon/{species}: {count} forms, fewer than the original game's {original}, "
                                  "whose sprite groups the archives keep (an original form can't be removed)")
        for form in range(1, original):
            claim(offset + form - 1, species, form)
        if count > original:
            moved.append((species, count))
    lost = [group for group in range(ORIGINAL_FORM_GROUPS) if group not in groups]
    if lost:
        raise FormGroupsError(f"no form has the original sprite group {lost[0]}: each of 0 to "
                              f"{ORIGINAL_FORM_GROUPS - 1} must stay its species' form, since the archives keep them")
    added = sorted(group for group in groups if group >= ORIGINAL_FORM_GROUPS)
    if added != list(range(ORIGINAL_FORM_GROUPS, ORIGINAL_FORM_GROUPS + len(added))):
        missing = next(group for group in range(ORIGINAL_FORM_GROUPS, added[-1]) if group not in groups)
        raise FormGroupsError(f"no form has sprite group {missing}: the groups from {ORIGINAL_FORM_GROUPS} must "
                              "follow each other (forms.sprite_offset)")
    following = ORIGINAL_FORM_GROUPS + len(added)
    for species, count in moved:
        offsets[species] = following
        for form in range(1, count):
            groups[following + form - 1] = (species, form)
        following += count - 1
    return groups, offsets


def form_groups(root: Path = POKEMON) -> dict[int, tuple[str, int]]:
    """Each form sprite group's species and form."""
    return layout(root)[0]


def sprite_offset(species: str, forms: dict, root: Path = POKEMON) -> int:
    """The sprite_offset the personal record of a species gives the game: data.json's, or the moved one."""
    return layout(root)[1].get(species, forms["sprite_offset"])


def moved_species(root: Path = POKEMON) -> dict[str, int]:
    """The species whose forms were moved to the hack's groups, with their new sprite_offset."""
    _, offsets = layout(root)
    return {species: offsets[species] for species, forms, _ in species_forms(root)
            if species in offsets and offsets[species] != forms["sprite_offset"]}


def next_free_offset(root: Path = POKEMON) -> int:
    """The first group after the hack's own (data.json) groups, which a species getting its first sprite form takes."""
    end = ORIGINAL_FORM_GROUPS
    for _, forms, palette_only in species_forms(root):
        if forms["count"] > 1 and not palette_only and forms["sprite_offset"] >= ORIGINAL_FORM_GROUPS:
            end = max(end, forms["sprite_offset"] + forms["count"] - 1)
    return end


def main():
    groups, offsets = layout()
    moved = moved_species()
    for group in sorted(groups):
        species, form = groups[group]
        note = f" (moved: sprite_offset {moved[species]})" if species in moved else ""
        print(f"{group:4} {species} form {form}{note}")
    print(f"{sum(1 for g in groups if g >= ORIGINAL_FORM_GROUPS)} hack groups; moved: "
          f"{', '.join(f'{s} to {o}' for s, o in moved.items()) or 'none'}")


if __name__ == "__main__":
    try:
        main()
    except FormGroupsError as error:
        sys.exit(f"form_groups.py: {error}")
