#!/usr/bin/env python3
"""The one definition of the species, for every tool: which IDs are Pokémon, which are the Pokédex's, and where their
data is (docs/paperwhite2/design/new-species.md, section 3.1).

    species_list.py            # print the ranges and the added species

generated/species.txt numbers the species from SPECIES_NONE: the national Pokédex's 1 to 649 (Genesect), then the
egg (650), the bad egg (651) and the Pokéstar Studios props and costumes (652-684), which are no Pokémon of the
Pokédex. Paper White 2's new species are appended after them, from FIRST_ADDED (687): 685 and 686 stay reserved
(RESERVED), since the game already treats them as the egg and Manaphy's egg in its sprite, icon, name and cache
tables, and their records are copies of the egg's (directory() gives them egg/). So:

- real_species(): the species a Pokémon can be, 1-649 and the added ones;
- pokedex_species(): those of them the Pokédex has, all but the added species whose data.json has "pokedex": false
  (creatures that never enter it, as the Pokéstar species);
- added_species(): the added ones' constants, from FIRST_ADDED, in ID order.

Every packer and generator loops over these rather than "before SPECIES_EGG" or "up to SPECIES_GENESECT", so that
the IDs 650-686 are never taken for Pokémon. Without added species the lists are the original game's.
"""
import json
import sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
POKEMON = ROOT / "res" / "pokemon"
SPECIES_LIST = ROOT / "generated" / "species.txt"
# The first added species, and the two IDs before it that only the egg's tables use
FIRST_ADDED = 687
RESERVED = ("SPECIES_PAPERWHITE2_RESERVED_685", "SPECIES_PAPERWHITE2_RESERVED_686")
# The longest name a Pokémon's nickname field holds
NAME_LENGTH = 10


class SpeciesListError(ValueError):
    pass


def directory(species: str) -> str:
    """A species' directory in res/pokemon/: its name, for a Pokéstar Studios species, which is no Pokémon but a
    movie's prop or costume, pokestar/ and its name there, and for the reserved IDs the egg's, whose records they copy."""
    if species in RESERVED:
        return "egg"
    name = species.removeprefix("SPECIES_").lower()
    return f"pokestar/{name.removeprefix('pokestar_')}" if name.startswith("pokestar_") else name


def _constants(text: str) -> list[str]:
    names = []
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        name, _, given = line.partition("=")
        if given and int(given.strip(), 0) != len(names):
            raise SpeciesListError(f"{SPECIES_LIST}: {name.strip()} is given {given.strip()}, not {len(names)}: the "
                                   "species are numbered in order from 0")
        names.append(name.strip())
    return names


@lru_cache(maxsize=1)
def constants() -> tuple[str, ...]:
    """generated/species.txt's constants, by ID. Checks that 685 and 686 are the reserved IDs when species follow."""
    names = _constants(SPECIES_LIST.read_text())
    if "SPECIES_EGG" not in names:
        raise SpeciesListError(f"{SPECIES_LIST}: no SPECIES_EGG")
    if len(names) > FIRST_ADDED - len(RESERVED) and tuple(names[FIRST_ADDED - len(RESERVED):FIRST_ADDED]) != RESERVED:
        raise SpeciesListError(f"{SPECIES_LIST}: the species after the Pokéstar Studios' must start with "
                               f"{' and '.join(RESERVED)}, then the added species from {FIRST_ADDED}")
    return tuple(names)


def directories() -> list[str]:
    """Each species' directory in res/pokemon/, by ID."""
    return [directory(name) for name in constants()]


def national_count() -> int:
    """The species from SPECIES_NONE to the national Pokédex's last, Genesect: the value of SPECIES_EGG."""
    return constants().index("SPECIES_EGG")


def last_species() -> int:
    """The highest species ID: the last added species, or the last Pokéstar Studios one."""
    return len(constants()) - 1


def added_species() -> list[str]:
    """The added species' constants, from FIRST_ADDED, in ID order."""
    return list(constants()[FIRST_ADDED:])


def is_added(number: int) -> bool:
    return FIRST_ADDED <= number <= last_species()


def is_real(number: int) -> bool:
    """Whether a species ID is a Pokémon's: 1 to Genesect, or an added species."""
    return 0 < number < national_count() or is_added(number)


def real_species() -> list[int]:
    """The species a Pokémon can be, in ID order: 1 to Genesect, then the added ones."""
    return [*range(1, national_count()), *range(FIRST_ADDED, last_species() + 1)]


def last_real_species() -> int:
    """The last species a Pokémon can be: the last added one, or Genesect without them."""
    return real_species()[-1]


@lru_cache(maxsize=4)
def _data(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise SpeciesListError(f"{path}: {error}") from None


def species_data(number: int, root: Path = POKEMON) -> dict:
    """A species' data.json."""
    return _data(root / directory(constants()[number]) / "data.json")


def in_pokedex(data: dict) -> bool:
    """Whether a species' data puts it in the Pokédex: all but those with "pokedex": false."""
    return data.get("pokedex") is not False


def pokedex_species(root: Path = POKEMON) -> list[int]:
    """The species the Pokédex has, in ID order: 1 to Genesect, then the added ones but those with "pokedex": false."""
    return [*range(1, national_count()),
            *(number for number in range(FIRST_ADDED, last_species() + 1) if in_pokedex(species_data(number, root)))]


def hidden_species(root: Path = POKEMON) -> list[int]:
    """The added species that never enter the Pokédex ("pokedex": false)."""
    return [number for number in range(FIRST_ADDED, last_species() + 1) if not in_pokedex(species_data(number, root))]


def last_pokedex_species(root: Path = POKEMON) -> int:
    return pokedex_species(root)[-1]


def main():
    names = constants()
    added = added_species()
    print(f"{len(names)} IDs: 1-{national_count() - 1} the national Pokédex's, {national_count()}-"
          f"{FIRST_ADDED - len(RESERVED) - 1} the egg, the bad egg and Pokéstar Studios', "
          f"{'reserved 685-686, ' if added else ''}{len(added)} added")
    hidden = set(hidden_species())
    for number, name in enumerate(added, FIRST_ADDED):
        print(f"{number:5} {name}{' (not in the Pokédex)' if number in hidden else ''}")


if __name__ == "__main__":
    try:
        main()
    except SpeciesListError as error:
        sys.exit(f"species_list.py: {error}")
