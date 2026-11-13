"""What tools/paperwhite2/moves.py and abilities.py share to add, remove and retire moves and abilities (the editor's
Move Editor and Ability Editor; docs/paperwhite2/design/moves-and-abilities.md section 6): names and constants, the
list files, the files of res/ and the code that name a constant, the species that learn a move or have an ability,
and the battle code that checks one by its ID.

Every command prints one line of JSON, as tools/paperwhite2/pokemon_species.py does (its Changes writes the files): what
it changed ("changed", the files under the checkout, "removed" those it deleted) and a message; with --check it changes
nothing and says what it would do. A refusal exits 1 with the reason.
"""
import json
import os
import re
import unicodedata
from pathlib import Path

from tools.paperwhite2.pokemon_species import Changes, read

ROOT = Path(__file__).resolve().parents[2]
RES = ROOT / "res"
POKEMON = RES / "pokemon"
TRAINERS = RES / "trainers" / "data"
# The battle facilities' sets (Battle Subway, PWT, Black Tower and White Treehollow)
FACILITIES = RES / "trainers" / "facilities"
# The characters a move's or an ability's name may have: what the game's font and the text packer take
NAME_PATTERN = re.compile(r"[A-Za-z][A-Za-z0-9 .'\-é]*")
# The files of res/ that may name a constant (text)
REFERRER_SUFFIXES = (".json", ".txt", ".s", ".csv")
# The code that may name a constant: the game's and the hack's C, and the headers (not generated/ or build/)
CODE_FOLDERS = ("src", "include")
CODE_SUFFIXES = (".c", ".h", ".inc", ".s")
# The battle overlays' code, where a move or an ability may be checked by its ID (ov167 the server, ov168 the view,
# ov169 the tables and conditions, ov170 the trainer AI)
BATTLE_CODE = tuple(ROOT / "src" / f"ov{n}" for n in (167, 168, 169, 170))
# Where TM_MOVE_LIST gives each TM and HM its move: TM01-TM92, HM01-HM06, then TM93-TM95
TM_CODE = ROOT / "src" / "system" / "pml_item.c"
TM_TABLE = "TM_MOVE_LIST[] = {"


class EntryError(Exception):
    pass


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def check_name(name: str, kind: str, length: int) -> str:
    """A new move's or ability's name checked."""
    if not name or name != name.strip():
        raise EntryError(f"Give the {kind} a name, without spaces at its ends")
    if len(name) > length:
        raise EntryError(f"\"{name}\" has {len(name)} characters: {"an" if kind[0] in "aeiou" else "a"} {kind}'s name holds {length} (the summary, the "
                         "battle menu and the popups fit no more)")
    if not NAME_PATTERN.fullmatch(name):
        raise EntryError(f"\"{name}\" must start with a letter and have only letters, digits, spaces and . ' - é")
    return name


def constant_of(prefix: str, name: str) -> str:
    """A new constant from a name: ASCII letters and digits, upper case, words joined by underscores (U-turn: U_TURN,
    King's Shield: KINGS_SHIELD)."""
    text = unicodedata.normalize("NFKD", name.replace("'", "")).encode("ascii", "ignore").decode().upper()
    return prefix + re.sub(r"[^A-Z0-9]+", "_", text).strip("_")


def appended(path: Path, constant: str) -> str:
    """A list file's text with a constant appended as its last line."""
    text = path.read_text()
    return text + ("" if not text or text.endswith("\n") else "\n") + constant + "\n"


def without_last(path: Path, constant: str) -> str:
    """A list file's text without its last line, which must be the constant."""
    lines = path.read_text().splitlines(keepends=True)
    if not lines or lines[-1].strip() != constant:
        raise EntryError(f"{rel(path)} doesn't end with {constant}")
    return "".join(lines[:-1])


def res_files() -> list[Path]:
    # (os.walk following links: a test's scratch checkout links res/'s folders)
    return sorted(Path(folder) / name for folder, _, names in os.walk(RES, followlinks=True) for name in names
                  if name.endswith(REFERRER_SUFFIXES))


def naming(constant: str, files) -> list[Path]:
    """The files that name a constant (as a whole word)."""
    pattern = re.compile(word(constant))
    return [path for path in files if path.is_file() and pattern.search(path.read_text(errors="replace"))]


def code_files(folders=None) -> list[Path]:
    folders = folders or [ROOT / folder for folder in CODE_FOLDERS]
    return sorted(Path(folder) / name for top in folders if top.is_dir()
                  for folder, _, names in os.walk(top, followlinks=True) for name in names
                  if name.endswith(CODE_SUFFIXES))


def word(constant: str) -> str:
    """A pattern of a constant as a whole word."""
    return rf"(?<![A-Za-z0-9_]){re.escape(constant)}(?![A-Za-z0-9_])"


def checks_by_id(constant: str, listed: dict[str, int]) -> list[str]:
    """The battle code's files that name a constant, besides the tables that already stand for what a copy takes
    (listed: a file name and how many of its mentions those are, its handler table's rows, the Mold Breaker list):
    the places that check it by its ID, which a move or ability taking its handlers doesn't get. Each as "file (n)"."""
    found = []
    for path in code_files(list(BATTLE_CODE)):
        count = len(re.findall(word(constant), path.read_text(errors="replace"))) - listed.get(path.name, 0)
        if count > 0:
            found.append(f"{rel(path)} ({count})")
    return found


def tm_moves() -> list[tuple[str, str]]:
    """TM_MOVE_LIST's TMs and HMs and their moves, in its order: TM01-TM92, HM01-HM06, TM93-TM95."""
    text = TM_CODE.read_text()
    start = text.index(TM_TABLE) + len(TM_TABLE)
    moves = re.findall(r"MOVE_\w+", text[start:text.index("};", start)])
    labels = ([f"TM{i + 1:02}" for i in range(92)] + [f"HM{i + 1:02}" for i in range(6)]
              + [f"TM{i}" for i in (93, 94, 95)])
    return list(zip(labels, moves))


def species_name(path: Path) -> str:
    """The species a species' or form's record is, by its name ("Castform", "Castform (form 2)")."""
    species = path.parent / "data.json"
    try:
        name = str(read(species).get("name") or path.parent.name)
    except (OSError, json.JSONDecodeError):
        name = path.parent.name
    form = re.fullmatch(r"form_(\d+)\.json", path.name)
    return f"{name} (form {form[1]})" if form else name


def species_records() -> list[Path]:
    """Every species' data.json and its forms' records."""
    return sorted(path for folder in POKEMON.iterdir() if folder.is_dir()
                  for path in [folder / "data.json", *folder.glob("form_*.json")] if path.is_file())


def species_constant(path: Path) -> str:
    return "SPECIES_" + path.parent.name.upper()


def trainer_constant(path: Path) -> str:
    return "TRAINER_" + path.stem.upper()
