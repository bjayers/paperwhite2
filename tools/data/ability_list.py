#!/usr/bin/env python3
"""The one definition of the abilities, for every tool: the original ones and the ones Paper White 2 adds
(docs/paperwhite2/design/moves-and-abilities.md).

    ability_list.py            # print the counts and the added abilities

generated/abilities.txt numbers the abilities from ABILITY_NONE: the original game's 1 to 164 (Teravolt), then the
hack's added abilities from FIRST_ADDED (165), each with res/abilities/<ability>.json as the others. A Pokémon and a
species keep their ability in 8 bits, so the last is ABILITY_MAX (255). An added ability's JSON has the hack's field
"handlers_like" (optional): an original ability whose battle handlers it takes, registered with its own ID, so its
popup shows its own name (tools/paperwhite2/abilities.py, the generated PAPERWHITE2_ABILITY_HANDLERS_LIKE). An added
ability without it does nothing in battle until the hack's battle code adds its row to sAbilityEventAddTable.
"""
import json
import sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ABILITIES = ROOT / "res" / "abilities"
ABILITY_LIST = ROOT / "generated" / "abilities.txt"
# The original game's last ability, and the first ID the hack adds
LAST_ORIGINAL = "ABILITY_TERAVOLT"
FIRST_ADDED = 165
# The last ID an ability can have: the box data and the species data keep it in a byte
ABILITY_MAX = 255
# The longest original name ("Lightningrod", "Compoundeyes"), which the summary and the battle popup fit
NAME_LENGTH = 12
HACK_FIELDS = ("handlers_like",)


class AbilityListError(ValueError):
    pass


def file_name(ability: str) -> str:
    """An ability's file in res/abilities/: its constant without ABILITY_, in lower case, .json."""
    return ability.removeprefix("ABILITY_").lower() + ".json"


def parse(text: str, where: str = str(ABILITY_LIST)) -> tuple[str, ...]:
    """An abilities.txt's constants by ID, checked: numbered from 0 in order, Teravolt the last original, and no more
    than ABILITY_MAX."""
    names = []
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        name, _, given = line.partition("=")
        if given and int(given.strip(), 0) != len(names):
            raise AbilityListError(f"{where}: {name.strip()} is given {given.strip()}, not {len(names)}: the "
                                   "abilities are numbered in order from 0")
        names.append(name.strip())
    if len(names) < FIRST_ADDED or names[FIRST_ADDED - 1] != LAST_ORIGINAL:
        raise AbilityListError(f"{where}: {LAST_ORIGINAL} must be ability {FIRST_ADDED - 1}, the last original one, "
                               f"and the added abilities follow it from {FIRST_ADDED}")
    if len(names) - 1 > ABILITY_MAX:
        raise AbilityListError(f"{where}: {len(names) - 1} is past the last ability ID, {ABILITY_MAX}: a Pokémon "
                               "keeps its ability in a byte")
    return tuple(names)


@lru_cache(maxsize=1)
def constants() -> tuple[str, ...]:
    """generated/abilities.txt's constants, by ID."""
    return parse(ABILITY_LIST.read_text())


def count() -> int:
    """The number of ability IDs, ABILITY_NONE's included: 165 without added abilities."""
    return len(constants())


def added_abilities() -> list[str]:
    """The added abilities' constants, from FIRST_ADDED, in ID order."""
    return list(constants()[FIRST_ADDED:])


def is_added(number: int) -> bool:
    return FIRST_ADDED <= number < count()


def ability_data(ability: str, root: Path = ABILITIES) -> dict:
    path = root / file_name(ability)
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise AbilityListError(f"{path}: {error}") from None


def added_table(root: Path = ABILITIES) -> list[tuple[str, int]]:
    """Each added ability's constant and the ID of the ability whose handlers it takes (0, ABILITY_NONE, for none),
    checked; also checks that no original ability has the hack's fields."""
    names = constants()
    for ability in names[1:FIRST_ADDED]:
        for field in HACK_FIELDS:
            if field in ability_data(ability, root):
                raise AbilityListError(f"{file_name(ability)}: {field} is only for added abilities")
    rows = []
    for ability in added_abilities():
        data = ability_data(ability, root)
        name = data.get("name", "")
        if len(name) > NAME_LENGTH:
            raise AbilityListError(f"{file_name(ability)}: its name {name!r} is longer than {NAME_LENGTH} characters")
        like = data.get("handlers_like")
        handlers = 0
        if like is not None:
            if not isinstance(like, str) or like not in names[1:FIRST_ADDED]:
                raise AbilityListError(f"{file_name(ability)}: handlers_like {like!r} must be an original ability's "
                                       f"constant, ABILITY_STENCH to {LAST_ORIGINAL}")
            handlers = names.index(like)
        rows.append((ability, handlers))
    return rows


def main():
    added = added_table()
    names = constants()
    print(f"{count()} ability IDs: 1-{FIRST_ADDED - 1} the original game's, {len(added)} added")
    for number, (ability, handlers) in enumerate(added, FIRST_ADDED):
        like = f"handlers like {names[handlers]}" if handlers else "no handlers yet (the hack's battle code)"
        print(f"{number:5} {ability} ({like})")


if __name__ == "__main__":
    try:
        main()
    except AbilityListError as error:
        sys.exit(f"ability_list.py: {error}")
