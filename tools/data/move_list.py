#!/usr/bin/env python3
"""The one definition of the moves, for every tool: the original ones and the ones Paper White 2 adds
(docs/paperwhite2/design/moves-and-abilities.md).

    move_list.py            # print the counts and the added moves

generated/moves.txt numbers the moves from MOVE_NONE: the original game's 1 to 559 (Fusion Bolt), then the hack's
added moves from FIRST_ADDED (560), each with res/moves/<move>/data.json as the others. An added move's data.json has
the hack's fields, which move_data.py doesn't pack:

- "animation": the original move whose animation it plays (required): the battle view takes a move ID from 561 for one
  of its own effect animations, so an added move's is always mapped (tools/paperwhite2/moves.py, the generated
  PAPERWHITE2_MOVE_ANIMATIONS);
- "handlers_like": an original move whose battle handlers it takes (optional), registered with its own ID, but none
  of SUB_ID_COMPARED, whose handlers tell their moves apart by ID;
- "retired": true hides it from the editor's pickers (tools/paperwhite2/moves.py retire); the build ignores it.

Every tool loops over these rather than "up to MOVE_FUSION_BOLT", and stops on a list that doesn't number the moves
in order or puts anything but Fusion Bolt last before the added ones. Without added moves the lists are the original
game's.
"""
import json
import re
import sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MOVES = ROOT / "res" / "moves"
# The hack's battle handlers of the added moves whose rules are new, each built while its constant exists
BATTLE_CODE = ROOT / "src" / "paperwhite2" / "ov167" / "paperwhite2_battle.c"
MOVE_LIST = ROOT / "generated" / "moves.txt"
# The original game's last move, and the first ID the hack adds
LAST_ORIGINAL = "MOVE_FUSION_BOLT"
FIRST_ADDED = 560
# The last ID a move can have: a Pokémon, a learnset or a trainer keeps a move in 16 bits, but Entree Forest's
# records in 10 (include/field/entree_forest.h)
MOVE_MAX = 1023
# The longest name the summary and the battle menu are known to fit: every original name is at most 12 characters
NAME_LENGTH = 12
# The hack's fields of a move's data.json ("retired" only hides it from the editor's pickers)
HACK_FIELDS = ("animation", "handlers_like", "retired")
# The original moves' handler tables, sMoveEventAddTable's rows { MOVE_X, EventAddX }
HANDLERS_CODE = ROOT / "src" / "ov167" / "move_handlers.c"
HANDLERS_TABLE = "sMoveEventAddTable[] = {"
# The moves whose handlers tell them apart by their own ID (BattleEventItem_GetSubID compared with a literal move in
# move_handlers.c), so a move taking their handlers would act as the wrong one: Circle Throw's and Dragon Tail's
# switch effect (HandlerCircleThrow), Freeze Shock's and Ice Burn's charge message, the Fusions' doubled power, the
# pledges' combinations
SUB_ID_COMPARED = ("MOVE_CIRCLE_THROW", "MOVE_DRAGON_TAIL", "MOVE_FREEZE_SHOCK", "MOVE_ICE_BURN", "MOVE_FUSION_FLARE",
                   "MOVE_FUSION_BOLT", "MOVE_FIRE_PLEDGE", "MOVE_GRASS_PLEDGE", "MOVE_WATER_PLEDGE")


class MoveListError(ValueError):
    pass


def directory(move: str) -> str:
    """A move's directory in res/moves/: its constant without MOVE_, in lower case."""
    return move.removeprefix("MOVE_").lower()


def parse(text: str, where: str = str(MOVE_LIST)) -> tuple[str, ...]:
    """A moves.txt's constants by ID, checked: numbered from 0 in order, Fusion Bolt the last original, and no more
    than MOVE_MAX."""
    names = []
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        name, _, given = line.partition("=")
        if given and int(given.strip(), 0) != len(names):
            raise MoveListError(f"{where}: {name.strip()} is given {given.strip()}, not {len(names)}: the moves are "
                                "numbered in order from 0")
        names.append(name.strip())
    if len(names) < FIRST_ADDED or names[FIRST_ADDED - 1] != LAST_ORIGINAL:
        raise MoveListError(f"{where}: {LAST_ORIGINAL} must be move {FIRST_ADDED - 1}, the last original one, and the "
                            f"added moves follow it from {FIRST_ADDED}")
    if len(names) - 1 > MOVE_MAX:
        raise MoveListError(f"{where}: {len(names) - 1} is past the last move ID, {MOVE_MAX}")
    return tuple(names)


@lru_cache(maxsize=1)
def constants() -> tuple[str, ...]:
    """generated/moves.txt's constants, by ID."""
    return parse(MOVE_LIST.read_text())


def count() -> int:
    """The number of move IDs, MOVE_NONE's included: 560 without added moves."""
    return len(constants())


def added_moves() -> list[str]:
    """The added moves' constants, from FIRST_ADDED, in ID order."""
    return list(constants()[FIRST_ADDED:])


def is_added(number: int) -> bool:
    return FIRST_ADDED <= number < count()


def move_data(move: str, root: Path = MOVES) -> dict:
    path = root / directory(move) / "data.json"
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise MoveListError(f"{path}: {error}") from None


def original_move(move: str, field: str, value) -> int:
    """The ID of an original move that an added move's field names, checked."""
    names = constants()
    if not isinstance(value, str) or value not in names[1:FIRST_ADDED]:
        raise MoveListError(f"{directory(move)}: {field} {value!r} must be an original move's constant, MOVE_POUND to "
                            f"{LAST_ORIGINAL}")
    return names.index(value)


def check_original(move: str, data: dict):
    """An original move has none of the hack's fields: its animation and handlers are its own."""
    for field in HACK_FIELDS:
        if field in data:
            raise MoveListError(f"{directory(move)}: {field} is only for added moves; an original move has its own")


def added_table(root: Path = MOVES) -> list[tuple[str, int, int]]:
    """Each added move's constant, the ID of the move whose animation it plays, and the ID of the move whose handlers
    it takes (0, MOVE_NONE, for none), checked; also checks that no original move has the hack's fields."""
    rows = []
    for move in constants()[1:FIRST_ADDED]:
        check_original(move, move_data(move, root))
    for move in added_moves():
        data = move_data(move, root)
        if "animation" not in data:
            raise MoveListError(f"{directory(move)}: an added move needs an \"animation\", the original move whose "
                                "animation it plays (a move ID from 561 is one of the battle view's own effects)")
        name = data.get("name", "")
        if len(name) > NAME_LENGTH:
            raise MoveListError(f"{directory(move)}: its name {name!r} is longer than {NAME_LENGTH} characters")
        animation = original_move(move, "animation", data["animation"])
        handlers = original_move(move, "handlers_like", data["handlers_like"]) if "handlers_like" in data else 0
        if data.get("handlers_like") in SUB_ID_COMPARED:
            raise MoveListError(f"{directory(move)}: handlers_like {data['handlers_like']}: its handlers compare the "
                                "move's own ID with a literal one, so another move can't take them")
        rows.append((move, animation, handlers))
    return rows


def has_own_handlers(move: str, code: Path = BATTLE_CODE) -> bool:
    """Whether the hack's battle code has the move's own handlers (an #ifdef of its constant)."""
    return code.exists() and f"#ifdef {move}\n" in code.read_text()


def handler_rows(code: Path = HANDLERS_CODE) -> dict[str, str]:
    """sMoveEventAddTable's rows: each move with handlers, and its EventAdd function (the hack's rows too)."""
    text = code.read_text()
    start = text.index(HANDLERS_TABLE)
    table = text[start:text.index("\n};", start)]
    return dict(re.findall(r"\{\s*(MOVE_\w+)\s*,\s*(\w+)\s*\}", table))


def is_retired(move: str) -> bool:
    """Whether an added move is retired: hidden from the editor's pickers, keeping its ID and data."""
    return move_data(move).get("retired") is True


def main():
    added = added_table()
    names = constants()
    print(f"{count()} move IDs: 1-{FIRST_ADDED - 1} the original game's, {len(added)} added")
    for number, (move, animation, handlers) in enumerate(added, FIRST_ADDED):
        if handlers:
            like = f", handlers like {names[handlers]}"
        elif has_own_handlers(move):
            like = f", its own handlers in {BATTLE_CODE.relative_to(ROOT)}"
        else:
            like = ""
        print(f"{number:5} {move} (animation {names[animation]}{like})")


if __name__ == "__main__":
    try:
        main()
    except MoveListError as error:
        sys.exit(f"move_list.py: {error}")
