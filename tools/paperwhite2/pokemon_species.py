#!/usr/bin/env python3
"""Paper White 2: add, remove, retire and reuse whole new species in res/ (the editor's Pokémon page, Add Pokémon;
docs/paperwhite2/design/new-species.md sections 4 and 16).

    pokemon_species.py info                                      # JSON: the added species, the next ID, the numbers
    pokemon_species.py add NAME [--from SPECIES | --blank] [--number N] [--no-pokedex] [--no-wonder-trade]
                           [--no-follower] [--check]
    pokemon_species.py remove SPECIES [--check]                  # only the last added species
    pokemon_species.py retire SPECIES [--check]                  # hidden, keeping its ID
    pokemon_species.py unretire SPECIES [--check]
    pokemon_species.py reuse SPECIES NAME [--from SPECIES | --blank] [--number N] [--no-pokedex] [--no-wonder-trade]
                             [--no-follower] [--check]           # a retired slot made a new species
    pokemon_species.py follower SPECIES --from SPECIES | --none [--check]   # its followers copied, or removed
    pokemon_species.py number SPECIES N|none [--check]           # the Pokédex's display number ("none": "???")
    pokemon_species.py cry SPECIES WAV [--rate HZ] [--write]     # a WAV checked, converted and previewed

SPECIES is a species' directory in res/pokemon (applin) or its constant (SPECIES_APPLIN). Every command but info prints
one line of JSON, as tools/paperwhite2/pokemon_form.py does: what it changed ("changed", the files under the checkout,
"removed" those it deleted) and a message; with --check (or cry without --write) it changes nothing and says what it
would do. A refusal exits 1 with the reason.

add makes the species SPECIES_<NAME> at the next ID (tools/data/species_list.py: from 687; the first time it also
appends the reserved SPECIES_PAPERWHITE2_RESERVED_685 and _686 to generated/species.txt, which number in order, so no
existing constant changes). Its folder res/pokemon/<name>/ is a copy of the template's (--from, an original or added
species; --blank: res/pokemon/none/'s "?" art with plain data and Bulbasaur's cry) as placeholders: the battle sheets,
stills, rigs, palettes, icon, footprint and cry, not its forms or musical sprites (the musical falls back to the battle
sprite's). Its data.json is the template's with the name, Pokédex text without the other languages, forms, form names
and the template's display number, its own display number (--number, or none: "???"), or "pokedex": false
(--no-pokedex: never in the Pokédex, as the roguelike's creatures), no evolutions, regional number or name article,
evolution stage 1, itself as its baby species, and "art_template": the original species whose files' formats the
packers use (tools/data/pokemon_graphics.py). --no-wonder-trade lists it in services.json's excluded_species. Its
followers are copies of the template's (unless --no-follower; the blank template has none): each of
res/field/actors/followers/<template>[_shiny][_female][_female_shiny]/ copied to <name>... with "species" its own and a
sprite named by another of the copied followers' codes renamed to the copy's, so they show the template's sprite
until redrawn, and their OBJ_CODE_FOLLOWER_<NAME>... codes after the last follower code in generated/obj_codes.txt
(pokemon_form.add_obj_codes). A species without followers has none in the game, and the others' are unchanged. The
packers, the generated headers and the save follow from these (new-species.md section 14): nothing else is written.

remove undoes add for the last added species only (removing another would renumber every later one, moving their
Pokémon in saves and their references): its folder, its line of species.txt (and the reserved pair with the last),
its excluded_species entry, its own followers and their object codes, and its follower dialogue file
(res/paperwhite2/following/dialogue/species/<name>.json). It refuses while anything else in res/ names the species or
its followers' codes (evolutions, trainers, events...) or places it in the wild (its encounters file,
res/paperwhite2/encounters/species/<name>.json), listing them, or while it has forms (Add form's, which have sprite
groups of their own: remove them first).

retire sets "retired": true: the species keeps its ID and data, so Pokémon of it in saves stay valid, but is out of
the Pokédex (as "pokedex": false), the Wonder Trade and the editor's encounter pickers; unretire undoes it. reuse turns
a retired species into a new one at the same ID: its constant and folder renamed, its data, art and followers
replaced from a template as add makes them. Any Pokémon of that ID already in a save becomes the new species.

follower gives an added species copies of another species' followers (--from), replacing its own, or removes them
(--none), as add and remove do.

number sets pokedex.display_number (650 to 9999 but 999, the game's "no number"; never one another species shows).

cry checks a WAV (PCM 8 to 32 bits, mono or stereo, which it mixes down) for the game: one unlooped PCM8 wave whose
wave archive fits the cry buffer (tools/data/sound_data.py's CRY_BUFFER, about 1.76 s at 13,379 Hz). A rate outside
4,000-65,535 Hz, or one too long for the buffer, is resampled to 13,379 Hz (or --rate), and refused if still too long.
It prints the result as the game plays it (a PCM8 WAV in base64), and with --write writes cry.wav.
"""
import argparse
import base64
import io
import json
import os
import re
import shutil
import struct
import sys
import tempfile
import unicodedata
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools/data"))
from tools.data import species_list  # noqa: E402
from tools.data.datajson import DataError, dumps, load_schema, validate  # noqa: E402
from tools.data.pokemon_cries import wav_bytes  # noqa: E402
from tools.data.sound_data import CRY_BUFFER, cry_swar  # noqa: E402
from tools.paperwhite2.pokemon_form import (FOLLOWER_SUFFIXES, FOLLOWERS, OBJ_CODES, add_obj_codes,  # noqa: E402
                                            remove_obj_codes)

POKEMON = ROOT / "res/pokemon"
SPECIES_TXT = ROOT / "generated/species.txt"
SERVICES = ROOT / "res/paperwhite2/pokemon_center/services.json"
SCHEMA = POKEMON / "species.schema.json"
FOLLOWER_DIALOGUE = ROOT / "res/paperwhite2/following/dialogue/species"
ENCOUNTERS = ROOT / "res/paperwhite2/encounters/species"
FOLLOWER_CODE = "OBJ_CODE_FOLLOWER_"
BLANK_ART = "none"
BLANK_CRY = "bulbasaur"
DEFAULT_ART_TEMPLATE = "SPECIES_BULBASAUR"
# The keys of the pokedex object in the schema's order
POKEDEX_ORDER = ("category", "entry", "height", "weight", "shape", "display_number", "form_name", "forms", "languages")
# The characters a name may have: what the game's font and the text packer take for a Pokémon's name
NAME_PATTERN = re.compile(r"[A-Za-z][A-Za-z0-9 .'\-:éÉ♀♂]*")
# The game's cry rate, which the original cries have
CRY_RATE = 13379
CRY_RATES = (4000, 65535)
# The files of a species folder that are no art: its data, its forms' records and art, its musical sprite
NOT_ART = re.compile(r"^(data\.json|form_\d+\.json)$")
# Where a species' constant may be named, besides its own folder (text files in res/)
REFERRER_SUFFIXES = (".json", ".txt", ".s", ".csv")


class SpeciesError(Exception):
    pass


class Changes:
    """The files a command writes and removes, applied at the end unless it is a check: removed first, so a folder
    that is replaced keeps only its new files."""

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
        for path in self.removes:
            if path.is_dir():
                shutil.rmtree(path)
            elif path.exists():
                path.unlink()
        for path, data in self.writes.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as temporary:
                temporary.write(data)
            Path(temporary.name).replace(path)

    def report(self, message: str, check: bool, **extra) -> dict:
        def rel(path: Path) -> str:
            return path.relative_to(ROOT).as_posix()
        return {"ok": True, "check": check, "message": message, "changed": sorted(rel(p) for p in self.writes),
                "removed": sorted(rel(p) for p in self.removes), **extra}


def read(path: Path):
    return json.loads(path.read_text())


def species_lines() -> list[str]:
    return SPECIES_TXT.read_text().splitlines(keepends=True)


def constants() -> list[str]:
    return list(species_list.constants())


def resolve(name: str) -> tuple[int, str, str]:
    """A species given by its folder or constant: (ID, constant, folder)."""
    constant = name if name.startswith("SPECIES_") else f"SPECIES_{name.upper()}"
    names = constants()
    if constant not in names:
        raise SpeciesError(f"{name} isn't a species of generated/species.txt")
    number = names.index(constant)
    return number, constant, species_list.directory(constant)


def added(name: str) -> tuple[int, str, str]:
    number, constant, folder = resolve(name)
    if not species_list.is_added(number):
        raise SpeciesError(f"{folder} is the original game's: only species Paper White 2 added (from "
                           f"{species_list.FIRST_ADDED}) can be changed here")
    return number, constant, folder


def folder_of(name: str) -> str:
    """A new species' folder from its name: ASCII letters and digits, lower case, words joined by underscores
    (Mr. Mime: mr_mime, Nidoran♀: nidoran_f)."""
    text = name.replace("♀", " f").replace("♂", " m")
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "_", text).strip("_")


def check_name(name: str, replacing: str | None = None) -> tuple[str, str]:
    """A new species' name checked: its (constant, folder)."""
    if not name or name != name.strip():
        raise SpeciesError("Give the species a name, without spaces at its ends")
    if len(name) > species_list.NAME_LENGTH:
        raise SpeciesError(f"\"{name}\" has {len(name)} characters: a Pokémon's name holds "
                           f"{species_list.NAME_LENGTH}")
    if not NAME_PATTERN.fullmatch(name):
        raise SpeciesError(f"\"{name}\" must start with a letter (the Pokédex's search groups names by it) and have "
                           "only letters, digits, spaces and . ' - : é ♀ ♂")
    folder = folder_of(name)
    constant = f"SPECIES_{folder.upper()}"
    if constant in constants() and constant != replacing:
        raise SpeciesError(f"{constant} exists already: give the species another name")
    if (POKEMON / folder).exists() and constant != replacing:
        raise SpeciesError(f"res/pokemon/{folder}/ exists already: give the species another name")
    return constant, folder


def numbers_in_use(skip: int | None = None) -> dict[int, str]:
    """The display numbers the added species in the Pokédex show, by number, but skip's: those of retired species
    and those out of the Pokédex are free."""
    out = {}
    for number in range(species_list.FIRST_ADDED, species_list.last_species() + 1):
        if number == skip:
            continue
        data = read(POKEMON / species_list.directory(constants()[number]) / "data.json")
        if species_list.in_pokedex(data) and data["pokedex"].get("display_number") is not None:
            out[data["pokedex"]["display_number"]] = data["name"]
    return out


def check_number(shown: int | None, skip: int | None = None):
    if shown is None:
        return
    if not species_list.DISPLAY_NUMBER_MIN <= shown <= species_list.DISPLAY_NUMBER_MAX:
        if 0 < shown < species_list.national_count():
            raise SpeciesError(f"No. {shown} is the original game's: added species are numbered from "
                               f"{species_list.DISPLAY_NUMBER_MIN}")
        raise SpeciesError(f"A display number is from {species_list.DISPLAY_NUMBER_MIN} to "
                           f"{species_list.DISPLAY_NUMBER_MAX}")
    if shown == species_list.DISPLAY_NUMBER_NONE:
        raise SpeciesError(f"{shown} is the game's \"no number\" (shown as \"???\"): leave the number blank for that")
    owner = numbers_in_use(skip).get(shown)
    if owner:
        raise SpeciesError(f"No. {shown} is {owner}'s: each species has its own number")


def ordered_pokedex(pokedex: dict) -> dict:
    return {key: pokedex[key] for key in sorted(pokedex, key=lambda k: POKEDEX_ORDER.index(k)
                                                if k in POKEDEX_ORDER else len(POKEDEX_ORDER))}


def blank_data() -> dict:
    """The blank template's data: none/'s record with plain values that make a working Pokémon."""
    data = read(POKEMON / BLANK_ART / "data.json")
    stats = {key: 50 for key in data["base_stats"]}
    data.update({
        "name": "", "base_stats": stats, "types": ["TYPE_NORMAL", "TYPE_NORMAL"], "catch_rate": 45,
        "evolution_stage": 1, "ev_yields": dict({key: 0 for key in stats}, hp=1), "gender_ratio": 127,
        "hatch_cycles": 20, "base_friendship": 70, "growth_rate": "GROWTH_MEDIUM_FAST",
        "egg_groups": ["EGG_GROUP_FIELD", "EGG_GROUP_FIELD"], "abilities": ["ABILITY_RUN_AWAY", "ABILITY_NONE"],
        "forms": {"count": 1, "sprite_offset": 0}, "color": "COLOR_GRAY", "base_exp": 64, "height": 10, "weight": 100,
        "learnset": {"by_level": [[1, "MOVE_TACKLE"]], "by_tm": [], "by_tutor": []},
        "cry_volume": read(POKEMON / BLANK_CRY / "data.json")["cry_volume"],
    })
    data["pokedex"] = {"category": "New Pokémon", "entry": "", "height": "3'03\"", "weight": "22.0 lbs.", "shape": 0,
                       "languages": {}}
    return data


def template_of(source: str | None) -> tuple[Path, dict, str, Path]:
    """The template: (its art folder, its data, the art_template a copy names, the cry it copies)."""
    if source is None:
        return POKEMON / BLANK_ART, blank_data(), DEFAULT_ART_TEMPLATE, POKEMON / BLANK_CRY / "cry.wav"
    number, constant, folder = resolve(source)
    if not species_list.is_real(number):
        raise SpeciesError(f"{folder} isn't a Pokémon species to copy")
    data = read(POKEMON / folder / "data.json")
    art_template = data.get("art_template", DEFAULT_ART_TEMPLATE) if species_list.is_added(number) else constant
    return POKEMON / folder, data, art_template, POKEMON / folder / "cry.wav"


def new_data(template: dict, name: str, constant: str, art_template: str, shown: int | None, pokedex: bool) -> dict:
    """A new species' data.json from its template's (see add in the module's description)."""
    data = {key: value for key, value in template.items() if key not in ("name_article", "retired", "art_template")}
    data["name"] = name
    if pokedex:
        source = template.get("pokedex") or blank_data()["pokedex"]
        text = {key: source[key] for key in ("category", "entry", "height", "weight", "shape")}
        if shown is not None:
            text["display_number"] = shown
        text["languages"] = {}
        data["pokedex"] = ordered_pokedex(text)
    else:
        data["pokedex"] = False
    data["evolution_stage"] = 1
    data["forms"] = {"count": 1, "sprite_offset": 0}
    data["palette_forms"] = False
    data["evolutions"] = []
    data["regional_dex_number"] = None
    data["baby_species"] = constant
    data["art_template"] = art_template
    # the schema's order: name and pokedex first, as every species' file has them
    head = {key: data.pop(key) for key in ("$schema", "name", "pokedex") if key in data}
    data = {**head, **data}
    try:
        # (its own constant isn't in generated/species.txt yet)
        validate(dict(data, baby_species="SPECIES_NONE"), load_schema(SCHEMA), "data.json")
    except DataError as error:
        raise SpeciesError(f"The new data.json doesn't fit the schema: {error}") from None
    return data


def write_species(changes: Changes, folder: str, data: dict, art: Path, cry: Path):
    """The species' folder: its data.json and the template's art (its files, not its forms' or musical folders)."""
    target = POKEMON / folder
    for file in sorted(art.iterdir()):
        if file.is_file() and not NOT_ART.match(file.name):
            changes.copy(file, target / file.name)
    if cry.is_file():
        changes.copy(cry, target / "cry.wav")
    changes.json(target / "data.json", data)


def wonder_trade(changes: Changes, remove: str | None, add: str | None):
    """services.json's excluded_species without remove and with add."""
    services = read(SERVICES)
    excluded = services["wonder_trade"]["excluded_species"]
    kept = [s for s in excluded if s != remove]
    if add and add not in kept:
        kept.append(add)
    if kept != excluded:
        services["wonder_trade"]["excluded_species"] = kept
        changes.json(SERVICES, services)


def follower_folders(folder: str) -> list[Path]:
    """The species' own followers (form 0's: an added species with forms is refused before this), in code order."""
    return [FOLLOWERS / f"{folder}{suffix}" for suffix in FOLLOWER_SUFFIXES
            if (FOLLOWERS / f"{folder}{suffix}" / "data.json").is_file()]


def follower_code(follower: Path) -> str:
    return f"{FOLLOWER_CODE}{follower.name.upper()}"


def own_files(folder: str) -> list[Path]:
    """What is the species' own and goes with it: its folder, its followers and its follower dialogue file."""
    dialogue = FOLLOWER_DIALOGUE / f"{folder}.json"
    return [POKEMON / folder, *follower_folders(folder), *([dialogue] if dialogue.is_file() else [])]


def referrers(constant: str, folder: str) -> list[str]:
    """The files of res/ that name the species or its followers' codes, but its own (own_files) and services.json's
    excluded_species."""
    names = [constant, *(follower_code(f) for f in follower_folders(folder))]
    pattern = re.compile(r"\b(" + "|".join(re.escape(name) for name in names) + r")\b")
    own = own_files(folder)
    found = []
    # (os.walk following links: a test's scratch checkout links res/'s folders)
    paths = (Path(folder) / name for folder, _, names in os.walk(ROOT / "res", followlinks=True) for name in names)
    for path in sorted(paths):
        if (path.suffix not in REFERRER_SUFFIXES or not path.is_file()
                or any(path == mine or path.is_relative_to(mine) for mine in own)):
            continue
        text = path.read_text(errors="replace")
        if not pattern.search(text):
            continue
        if path == SERVICES:
            services = json.loads(text)
            excluded = services["wonder_trade"]["excluded_species"]
            services["wonder_trade"]["excluded_species"] = [s for s in excluded if s != constant]
            if not pattern.search(json.dumps(services)):
                continue
        found.append(path.relative_to(ROOT).as_posix())
    # (an encounters file names its species by its file name: the species is still in the wild)
    encounters = ENCOUNTERS / f"{folder}.json"
    if encounters.is_file():
        found.append(encounters.relative_to(ROOT).as_posix())
    return sorted(found)


def refuse_referred(constant: str, folder: str, what: str):
    found = referrers(constant, folder)
    if found:
        shown = ", ".join(found[:8]) + (f" and {len(found) - 8} more" if len(found) > 8 else "")
        raise SpeciesError(f"{what}: {constant} is still named in {shown}. Change those first")


def refuse_forms(folder: str, data: dict, what: str):
    if data["forms"]["count"] > 1:
        raise SpeciesError(f"{what}: {folder} has {data['forms']['count'] - 1} added form(s) with sprite groups of "
                           "their own. Remove them first (Remove form on each form's page)")


def drop_followers(changes: Changes, folder: str, codes: str, dialogue: bool = True) -> tuple[str, list[Path]]:
    """The species' own followers deleted (and its follower dialogue file, with dialogue) and their codes taken out of
    codes, obj_codes.txt's text: the new text and the followers deleted."""
    followers = follower_folders(folder)
    for follower in followers:
        changes.remove(follower)
    if dialogue and (FOLLOWER_DIALOGUE / f"{folder}.json").is_file():
        changes.remove(FOLLOWER_DIALOGUE / f"{folder}.json")
    return remove_obj_codes(codes, {follower_code(f) for f in followers}), followers


def copy_followers(changes: Changes, source_folder: str, folder: str, constant: str, codes: str) -> tuple[str, int]:
    """Copies of source_folder's followers for the species, and their codes after the last follower code: the new text
    of obj_codes.txt and how many were copied. A copy names its own species and form 0, and a sprite that names another
    of the copied followers' codes names that one's copy (so a female follower that shows the plain one's sprite keeps
    doing so with the species' own)."""
    sources = follower_folders(source_folder)
    renamed = {follower_code(s): f"{FOLLOWER_CODE}{(folder + s.name[len(source_folder):]).upper()}" for s in sources}
    for source in sources:
        target = FOLLOWERS / f"{folder}{source.name[len(source_folder):]}"
        for file in sorted(source.iterdir()):
            if file.name == "data.json":
                follower = read(file)
                follower["follower"]["species"] = constant
                follower["follower"]["form"] = 0
                if follower.get("sprite") in renamed:
                    follower["sprite"] = renamed[follower["sprite"]]
                changes.json(target / "data.json", follower)
            elif file.is_file():
                changes.copy(file, target / file.name)
    if sources:
        codes = add_obj_codes(codes, list(renamed.values()))
    return codes, len(sources)


def make(changes: Changes, name: str, source: str | None, shown: int | None, pokedex: bool, trade: bool,
         follower: bool, codes: str, replacing: str | None = None,
         skip: int | None = None) -> tuple[str, str, str, int]:
    """The new species' files, and with follower copies of the template's followers, whose codes go into codes
    (obj_codes.txt's text): its constant, folder, the new codes and the number of followers copied."""
    constant, folder = check_name(name, replacing)
    if not pokedex and shown is not None:
        raise SpeciesError("A species out of the Pokédex has no display number")
    check_number(shown, skip)
    art, template, art_template, cry = template_of(source)
    data = new_data(template, name, constant, art_template, shown, pokedex)
    write_species(changes, folder, data, art, cry)
    wonder_trade(changes, replacing, None if trade else constant)
    copied = 0
    if follower and source is not None:
        codes, copied = copy_followers(changes, resolve(source)[2], folder, constant, codes)
    return constant, folder, codes, copied


def followers_text(copied: int, source: str | None) -> str:
    if not copied:
        return ", without a follower"
    return f", with {copied} follower{'s' if copied != 1 else ''} copied from {template_name(source)}'s"


def template_name(source: str | None) -> str:
    return "the blank template" if source is None else read(POKEMON / resolve(source)[2] / "data.json")["name"]


def add(name: str, source: str | None, shown: int | None, pokedex: bool, trade: bool, follower: bool,
        check: bool) -> dict:
    changes = Changes()
    names = constants()
    lines = species_lines()
    first = len(names) == species_list.FIRST_ADDED - len(species_list.RESERVED)
    number = species_list.FIRST_ADDED if first else len(names)
    if number > species_list.SPECIES_MAX:
        raise SpeciesError(f"The species' IDs end at {species_list.SPECIES_MAX} (the Pokédex's 10-bit fields)")
    codes = OBJ_CODES.read_text()
    constant, folder, new_codes, copied = make(changes, name, source, shown, pokedex, trade, follower, codes)
    if new_codes != codes:
        changes.text(OBJ_CODES, new_codes)
    new_lines = [*(f"{reserved}\n" for reserved in species_list.RESERVED if first), f"{constant}\n"]
    if lines and not lines[-1].endswith("\n"):
        lines[-1] += "\n"
    changes.text(SPECIES_TXT, "".join(lines + new_lines))
    if not check:
        changes.apply()
    shown_text = "not in the Pokédex" if not pokedex else f"No. {shown}" if shown is not None else "No. ???"
    return changes.report(f"{name} ({constant}, ID {number}, {shown_text}), a copy of {template_name(source)}"
                          + ("" if trade else ", out of the Wonder Trade") + followers_text(copied, source)
                          + (", with the reserved IDs 685 and 686 first" if first else ""), check,
                          species=constant, folder=folder, id=number, followers=copied)


def remove(name: str, check: bool) -> dict:
    number, constant, folder = added(name)
    if number != species_list.last_species():
        raise SpeciesError(f"Only the last added species ({constants()[-1]}) can be removed: removing {constant} "
                           "would renumber every species after it. Retire it instead")
    data = read(POKEMON / folder / "data.json")
    refuse_forms(folder, data, "Can't remove it")
    refuse_referred(constant, folder, "Can't remove it")
    changes = Changes()
    changes.remove(POKEMON / folder)
    drop = {constant} | (set(species_list.RESERVED) if number == species_list.FIRST_ADDED else set())
    changes.text(SPECIES_TXT, "".join(line for line in species_lines() if line.split("#")[0].strip() not in drop))
    wonder_trade(changes, constant, None)
    codes = OBJ_CODES.read_text()
    new_codes, _ = drop_followers(changes, folder, codes)
    if new_codes != codes:
        changes.text(OBJ_CODES, new_codes)
    if not check:
        changes.apply()
    return changes.report(f"{data['name']} ({constant}, ID {number}) removed"
                          + (", and the reserved IDs 685 and 686 with it" if number == species_list.FIRST_ADDED
                             else ""), check, species=constant)


def retire(name: str, retired: bool, check: bool) -> dict:
    number, constant, folder = added(name)
    path = POKEMON / folder / "data.json"
    data = read(path)
    if bool(data.get("retired")) == retired:
        raise SpeciesError(f"{data['name']} is {'already' if retired else 'not'} retired")
    if retired:
        data["retired"] = True
    else:
        del data["retired"]
        if species_list.in_pokedex(data):
            try:
                check_number(data["pokedex"].get("display_number"), number)
            except SpeciesError as error:
                raise SpeciesError(f"{error}: give {data['name']} another number first") from None
    changes = Changes()
    changes.json(path, data)
    if not check:
        changes.apply()
    message = (f"{data['name']} retired: out of the Pokédex, the Wonder Trade and the encounter pickers, keeping ID "
               f"{number} so saved Pokémon of it stay valid") if retired else f"{data['name']} back in use"
    return changes.report(message, check, species=constant)


def reuse(name: str, new_name: str, source: str | None, shown: int | None, pokedex: bool, trade: bool,
          follower: bool, check: bool) -> dict:
    number, constant, folder = added(name)
    old = read(POKEMON / folder / "data.json")
    if not old.get("retired"):
        raise SpeciesError(f"{old['name']} isn't retired: retire it first (only a retired species' ID is reused)")
    refuse_forms(folder, old, "Can't reuse it")
    refuse_referred(constant, folder, "Can't reuse it")
    changes = Changes()
    changes.remove(POKEMON / folder)
    codes = OBJ_CODES.read_text()
    kept_codes, _ = drop_followers(changes, folder, codes)
    new_constant, new_folder, new_codes, copied = make(changes, new_name, source, shown, pokedex, trade, follower,
                                                       kept_codes, replacing=constant, skip=number)
    if new_codes != codes:
        changes.text(OBJ_CODES, new_codes)
    lines = [f"{new_constant}\n" if line.split("#")[0].strip() == constant else line for line in species_lines()]
    changes.text(SPECIES_TXT, "".join(lines))
    if not check:
        changes.apply()
    return changes.report(f"ID {number}, {old['name']} (retired), becomes {new_name} ({new_constant}), a copy of "
                          f"{template_name(source)}{followers_text(copied, source)}. Any {old['name']} in a save "
                          f"becomes {new_name}", check, species=new_constant, folder=new_folder, id=number,
                          followers=copied)


def set_followers(name: str, source: str | None, check: bool) -> dict:
    """An added species' followers replaced by copies of source's, or (source None) removed with its dialogue file."""
    number, constant, folder = added(name)
    data = read(POKEMON / folder / "data.json")
    refuse_forms(folder, data, "Can't change its followers here")
    source_folder = None
    if source is not None:
        source_number, _, source_folder = resolve(source)
        if not species_list.is_real(source_number) or source_folder == folder:
            raise SpeciesError(f"{source_folder} has no followers to copy")
        if not follower_folders(source_folder):
            raise SpeciesError(f"{read(POKEMON / source_folder / 'data.json')['name']} has no follower to copy")
    codes = {follower_code(f) for f in follower_folders(folder)}
    pattern = re.compile(r"\b(" + "|".join(re.escape(code) for code in codes) + r")\b") if codes else None
    found = [path for path in referrers(constant, folder) if pattern and pattern.search((ROOT / path).read_text())]
    if found:
        raise SpeciesError(f"Can't change them: its followers' codes are named in {', '.join(found[:8])}")
    changes = Changes()
    text = OBJ_CODES.read_text()
    new_text, dropped = drop_followers(changes, folder, text, dialogue=source is None)
    copied = 0
    if source_folder is not None:
        new_text, copied = copy_followers(changes, source_folder, folder, constant, new_text)
    elif not dropped:
        raise SpeciesError(f"{data['name']} has no follower")
    if new_text != text:
        changes.text(OBJ_CODES, new_text)
    if not check:
        changes.apply()
    message = (f"{data['name']}'s followers: {copied} copied from {template_name(source)}'s"
               if source_folder is not None
               else f"{data['name']}'s {len(dropped)} follower{'s' if len(dropped) != 1 else ''} removed")
    return changes.report(message, check, species=constant, followers=copied)


def set_number(name: str, shown: int | None, check: bool) -> dict:
    number, constant, folder = added(name)
    path = POKEMON / folder / "data.json"
    data = read(path)
    if data.get("pokedex") is False:
        raise SpeciesError(f"{data['name']} isn't in the Pokédex (\"pokedex\": false), so it has no number")
    check_number(shown, number)
    pokedex = dict(data["pokedex"])
    if shown is None:
        pokedex.pop("display_number", None)
    else:
        pokedex["display_number"] = shown
    data["pokedex"] = ordered_pokedex(pokedex)
    changes = Changes()
    changes.json(path, data)
    if not check:
        changes.apply()
    return changes.report(f"{data['name']} shows No. {shown if shown is not None else '???'}", check,
                          species=constant)


# Cries

def read_any_wav(data: bytes) -> tuple[int, list[float], str]:
    """A WAV's rate and mono samples (-1 to 1), and what was done to them."""
    try:
        with wave.open(io.BytesIO(data), "rb") as file:
            if file.getcomptype() != "NONE":
                raise SpeciesError("The WAV must be uncompressed PCM")
            channels, width, rate = file.getnchannels(), file.getsampwidth(), file.getframerate()
            frames = file.readframes(file.getnframes())
    except (wave.Error, EOFError) as error:
        raise SpeciesError(f"Not a WAV the game can take ({error}): save it as uncompressed PCM, 8 or 16 bits") \
            from None
    if width == 1:
        values = [(b - 128) / 128 for b in frames]
    elif width == 2:
        values = [v / 32768 for (v,) in struct.iter_unpack("<h", frames)]
    elif width == 3:
        values = [int.from_bytes(frames[i:i + 3], "little", signed=True) / 8388608 for i in range(0, len(frames), 3)]
    elif width == 4:
        values = [v / 2147483648 for (v,) in struct.iter_unpack("<i", frames)]
    else:
        raise SpeciesError(f"A {width * 8}-bit WAV isn't supported: save it as 8 or 16 bits")
    notes = [f"{width * 8}-bit"]
    if channels > 1:
        values = [sum(values[i:i + channels]) / channels for i in range(0, len(values), channels)]
        notes.append(f"{channels} channels mixed down to one")
    return rate, values, ", ".join(notes)


def resample(values: list[float], rate: int, target: int) -> list[float]:
    """Linear interpolation from rate to target."""
    if rate == target or not values:
        return values
    count = max(1, round(len(values) * target / rate))
    step = rate / target
    out = []
    for i in range(count):
        at = i * step
        low = int(at)
        high = min(low + 1, len(values) - 1)
        out.append(values[low] + (values[high] - values[low]) * (at - low))
    return out


def pcm8(values: list[float]) -> bytes:
    """The game's samples: signed 8-bit, as pokemon_cries.read_wav makes them of a 16-bit WAV."""
    return bytes(max(-128, min(127, round(max(-32768, min(32767, round(v * 32768))) / 256))) & 255 for v in values)


def pcm16_wav(rate: int, values: list[float]) -> bytes:
    out = io.BytesIO()
    with wave.open(out, "wb") as file:
        file.setnchannels(1)
        file.setsampwidth(2)
        file.setframerate(rate)
        file.writeframes(b"".join(struct.pack("<h", max(-32768, min(32767, round(v * 32768)))) for v in values))
    return out.getvalue()


def max_samples() -> int:
    """The most samples a cry's wave archive holds in the game's buffer."""
    overhead = len(cry_swar(CRY_RATE, b""))
    return (CRY_BUFFER - overhead) // 4 * 4


def import_cry(name: str, wav: Path, rate: int | None, write: bool) -> dict:
    number, constant, folder = resolve(name)
    if not species_list.is_real(number):
        raise SpeciesError(f"{folder} isn't a Pokémon species")
    original_rate, values, notes = read_any_wav(wav.read_bytes())
    done = [notes]
    target = rate or original_rate
    if rate and not CRY_RATES[0] <= rate <= CRY_RATES[1]:
        raise SpeciesError(f"The rate must be from {CRY_RATES[0]} to {CRY_RATES[1]} Hz")
    if not CRY_RATES[0] <= target <= CRY_RATES[1]:
        target = CRY_RATE
    limit = max_samples()
    if not rate and len(values) * target / original_rate > limit and target > CRY_RATE:
        target = CRY_RATE
    if target != original_rate:
        values = resample(values, original_rate, target)
        done.append(f"resampled from {original_rate} to {target} Hz")
    seconds = len(values) / target
    if len(values) > limit:
        raise SpeciesError(f"The cry is {seconds:.2f} s at {target} Hz ({len(values)} samples): the game's buffer "
                           f"holds {limit} samples, {limit / target:.2f} s at {target} Hz"
                           + (f" ({limit / CRY_RATE:.2f} s at {CRY_RATE} Hz)" if target != CRY_RATE else "")
                           + ". Shorten it")
    if not values:
        raise SpeciesError("The WAV has no samples")
    game = pcm8(values)
    swar = cry_swar(target, game)
    changes = Changes()
    changes.writes[POKEMON / folder / "cry.wav"] = pcm16_wav(target, values)
    if write:
        changes.apply()
    return changes.report(f"{seconds:.2f} s at {target} Hz ({'; '.join(done)}): {len(swar)} of the game's {CRY_BUFFER} "
                          "bytes", not write, seconds=round(seconds, 3), rate=target, samples=len(values),
                          bytes=len(swar), limit=CRY_BUFFER,
                          preview=base64.b64encode(wav_bytes(target, game)).decode())


# What the editor lists

def cry_copy(folder: str, data: dict) -> str | None:
    """The species whose cry an added species' cry.wav is a byte-for-byte copy of: its art template's (or Bulbasaur's,
    the blank template's), or none when it has its own."""
    own = POKEMON / folder / "cry.wav"
    if not own.is_file():
        return None
    for constant in dict.fromkeys((data.get("art_template", DEFAULT_ART_TEMPLATE), DEFAULT_ART_TEMPLATE)):
        other = POKEMON / species_list.directory(constant) / "cry.wav"
        if other.is_file() and other.read_bytes() == own.read_bytes():
            return read(other.parent / "data.json").get("name", constant)
    return None


def info() -> dict:
    names = constants()
    out = []
    last = species_list.last_species()
    for number in range(species_list.FIRST_ADDED, last + 1):
        constant = names[number]
        folder = species_list.directory(constant)
        data = read(POKEMON / folder / "data.json")
        pokedex = data.get("pokedex")
        out.append({
            "id": number, "species": constant, "folder": folder, "name": data.get("name", folder),
            "pokedex": pokedex is not False, "retired": bool(data.get("retired")),
            "number": pokedex.get("display_number") if isinstance(pokedex, dict) else None,
            "artTemplate": data.get("art_template", DEFAULT_ART_TEMPLATE), "cryCopyOf": cry_copy(folder, data),
            "forms": data["forms"]["count"], "last": number == last,
            "followers": [f.name for f in follower_folders(folder)],
        })
    first = len(names) <= species_list.FIRST_ADDED - len(species_list.RESERVED)
    return {"firstAdded": species_list.FIRST_ADDED, "nextId": species_list.FIRST_ADDED if first else len(names),
            "maxId": species_list.SPECIES_MAX, "nameLength": species_list.NAME_LENGTH,
            "numberMin": species_list.DISPLAY_NUMBER_MIN, "numberMax": species_list.DISPLAY_NUMBER_MAX,
            "numberNone": species_list.DISPLAY_NUMBER_NONE, "nationalLast": species_list.national_count() - 1,
            "numbers": {str(k): v for k, v in sorted(numbers_in_use().items())}, "species": out,
            "cryRate": CRY_RATE, "cryMaxSamples": max_samples()}


def display(value: str) -> int | None:
    if value.lower() in ("none", "???", ""):
        return None
    try:
        return int(value)
    except ValueError:
        raise argparse.ArgumentTypeError(f"{value} isn't a number") from None


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("info")

    def new_species_options(p):
        source = p.add_mutually_exclusive_group()
        source.add_argument("--from", dest="template")
        source.add_argument("--blank", action="store_true")
        p.add_argument("--number", type=display)
        p.add_argument("--no-pokedex", action="store_true")
        p.add_argument("--no-wonder-trade", action="store_true")
        p.add_argument("--no-follower", action="store_true")
        p.add_argument("--check", action="store_true")

    p = commands.add_parser("add")
    p.add_argument("name")
    new_species_options(p)
    for command in ("remove", "retire", "unretire"):
        p = commands.add_parser(command)
        p.add_argument("species")
        p.add_argument("--check", action="store_true")
    p = commands.add_parser("reuse")
    p.add_argument("species")
    p.add_argument("name")
    new_species_options(p)
    p = commands.add_parser("follower")
    p.add_argument("species")
    source = p.add_mutually_exclusive_group(required=True)
    source.add_argument("--from", dest="template")
    source.add_argument("--none", action="store_true")
    p.add_argument("--check", action="store_true")
    p = commands.add_parser("number")
    p.add_argument("species")
    p.add_argument("number", type=display)
    p.add_argument("--check", action="store_true")
    p = commands.add_parser("cry")
    p.add_argument("species")
    p.add_argument("wav", type=Path)
    p.add_argument("--rate", type=int)
    p.add_argument("--write", action="store_true")
    args = parser.parse_args()
    try:
        if args.command == "info":
            result = info()
        elif args.command in ("add", "reuse"):
            if not args.template and not args.blank:
                raise SpeciesError("Give a template species (--from) or --blank")
            options = (args.template, args.number, not args.no_pokedex, not args.no_wonder_trade,
                       not args.no_follower, args.check)
            result = (add(args.name, *options) if args.command == "add"
                      else reuse(args.species, args.name, *options))
        elif args.command == "remove":
            result = remove(args.species, args.check)
        elif args.command in ("retire", "unretire"):
            result = retire(args.species, args.command == "retire", args.check)
        elif args.command == "follower":
            result = set_followers(args.species, None if args.none else args.template, args.check)
        elif args.command == "number":
            result = set_number(args.species, args.number, args.check)
        else:
            result = import_cry(args.species, args.wav, args.rate, args.write)
    except (SpeciesError, species_list.SpeciesListError, OSError) as error:
        print(json.dumps({"ok": False, "message": str(error)}, ensure_ascii=False))
        sys.exit(1)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
