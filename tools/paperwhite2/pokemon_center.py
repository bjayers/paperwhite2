#!/usr/bin/env python3
"""Paper White 2's Pokémon Center services: the generated header of res/paperwhite2/pokemon_center/services.json.

    pokemon_center.py SOURCE_JSON OUTPUT_HEADER        # paperwhite2/pokemon_center_config.h
    pokemon_center.py --check                          # checks services.json alone

The file (its schema beside it) has the fees, rates and lists of the Centers' upstairs attendants
(docs/paperwhite2/design/pokemon-center.md): the Day Care attendant's, Training Services' and the Wonder Trade's. The
header has the fees that the script command PokemonCenter reads
(src/paperwhite2/ov012/paperwhite2_pokemon_center_commands.c), in the order of include/paperwhite2/pokemon_center.h's
POKEMON_CENTER_FEE_* IDs, which this checks, Training Services' other values (the Move Relearner's item, Hyper
Training's requirements and the grooming courses' friendship), the Champion's discount, the Day Care attendant's Gym
Badges, and the Wonder Trade's generator (src/paperwhite2/ov012/paperwhite2_wonder_trade.c): its rates, languages,
balls, item tiers and forms, the excluded species as bits, the forms never sent (never_tradeable), and for every species its pre-evolution and least level,
worked out from res/pokemon/*/data.json's evolutions.
The forms the hack adds to a species (past the original game's forms.count, tools/data/form_groups.py's
original_form_counts) are received without being listed: a species with such forms and no wonder_trade.forms entry
gets one, with weight 1 for its first form and each added form and 0 for its other original ones. A form in
wonder_trade.excluded_forms is never received (weight 0, in a listed species' weights too); a species in
excluded_species never at all, which is how a new species is left out.
The trainers' names and nicknames go into the system text bank wonder_trade_names (a line `\\from{wonder_trade.names}`,
tools/text/text_sources.py, from name_lines here), in the order whose first lines the header's language rows give.
Only the hack's build runs this (configure.py --hack).
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data import datajson  # noqa: E402
from tools.data.form_groups import original_form_counts  # noqa: E402
from tools.data import species_list  # noqa: E402

SOURCE = ROOT / "res" / "paperwhite2" / "pokemon_center" / "services.json"
IDS_HEADER = ROOT / "include" / "paperwhite2" / "pokemon_center.h"
GUARD = "POKEBW2_PAPERWHITE2_POKEMON_CENTER_CONFIG_H"
# The fees the game reads: each ID of pokemon_center.h and its value's path in the file. A new one takes the next ID
FEES = [
    ("POKEMON_CENTER_FEE_DAYCARE_TRANSFER", ("daycare", "transfer_fee")),
    ("POKEMON_CENTER_FEE_NAME_RATER", ("training", "name_rater", "price")),
    ("POKEMON_CENTER_FEE_MOVE_RELEARNER", ("training", "move_relearner", "price")),
    ("POKEMON_CENTER_FEE_MOVE_DELETER", ("training", "move_deleter", "price")),
    ("POKEMON_CENTER_FEE_HYPER_TRAINING", ("training", "hyper_training", "bp_per_stat")),
    ("POKEMON_CENTER_FEE_EFFORT_ONE", ("training", "effort_reset", "one_stat")),
    ("POKEMON_CENTER_FEE_EFFORT_ALL", ("training", "effort_reset", "all_stats")),
    ("POKEMON_CENTER_FEE_ABILITY_SWAP", ("training", "ability", "swap")),
    ("POKEMON_CENTER_FEE_ABILITY_HIDDEN", ("training", "ability", "hidden")),
    ("POKEMON_CENTER_FEE_GROOMING", ("training", "grooming", 0, "price")),
    ("POKEMON_CENTER_FEE_GROOMING_2", ("training", "grooming", 1, "price")),
    ("POKEMON_CENTER_FEE_GROOMING_3", ("training", "grooming", 2, "price")),
    ("POKEMON_CENTER_FEE_BALL_CHANGE", ("training", "ball_change", "price")),
    ("POKEMON_CENTER_FEE_NATURE_CHANGE", ("training", "nature_change", "price")),
    ("POKEMON_CENTER_FEE_WONDER_TRADE", ("wonder_trade", "fee")),
]
# The languages' IDs (constants/language.h) and their species names' text banks (the game's own for English)
LANGUAGES = {
    "japanese": ("LANGUAGE_JAPANESE", "TEXT_BANK_SPECIES_NAMES_JA"),
    "english": ("LANGUAGE_ENGLISH", "TEXT_BANK_SPECIES_NAMES"),
    "french": ("LANGUAGE_FRENCH", "TEXT_BANK_SPECIES_NAMES_FR"),
    "italian": ("LANGUAGE_ITALIAN", "TEXT_BANK_SPECIES_NAMES_IT"),
    "german": ("LANGUAGE_GERMAN", "TEXT_BANK_SPECIES_NAMES_DE"),
    "spanish": ("LANGUAGE_SPANISH", "TEXT_BANK_SPECIES_NAMES_ES"),
    "korean": ("LANGUAGE_KOREAN", "TEXT_BANK_SPECIES_NAMES_KO"),
}
# The most characters of a trainer's name and of a nickname (the Pokémon's fields hold 7 and 10 and a terminator),
# and in Japanese and Korean, whose games allow 5
NAME_LENGTH = {"male_names": 7, "female_names": 7, "nicknames": 10}
SHORT_LANGUAGES = {"japanese", "korean"}
SHORT_LENGTH = 5
# The evolution methods whose parameter is the level they evolve at (constants/pokemon.h)
LEVEL_METHODS = {"EVO_METHOD_LEVEL", "EVO_METHOD_LEVEL_ATK_GT_DEF", "EVO_METHOD_LEVEL_ATK_EQ_DEF",
                 "EVO_METHOD_LEVEL_ATK_LT_DEF", "EVO_METHOD_LEVEL_PERSONALITY_LOW", "EVO_METHOD_LEVEL_PERSONALITY_HIGH",
                 "EVO_METHOD_SHEDINJA", "EVO_METHOD_SHEDINJA_MADE", "EVO_METHOD_LEVEL_MALE", "EVO_METHOD_LEVEL_FEMALE"}
# A pre-evolution's species below this bit, and from it the form it must have plus one, or 0 for any
PRE_EVOLUTION_FORM_SHIFT = 11
# The special reward's IVs, in the order of PKM_PARAM_IV_HP's fields
STATS = ("hp", "attack", "defense", "speed", "special_attack", "special_defense")
# The seasons, each a form of Deerling and Sawsbuck (season_form.c)
SEASON_COUNT = 4
# The special reward's gender and the sex PML_GenPID gives it (constants/pokemon.h; GENDER_UNKNOWN is the ratio's)
GENDERS = {"male": "GENDER_MALE", "female": "GENDER_FEMALE", "random": "GENDER_UNKNOWN"}
# The gender ratios of a species that is always male, always female or genderless (personal data's sex ratio)
FIXED_RATIOS = {0: "male", 254: "female", 255: None}


class DataError(Exception):
    pass


def load(path: Path = SOURCE) -> dict:
    data = datajson.load(path, datajson.load_schema(path.parent / "services.schema.json"))
    for section, key in (("training", "grooming"), ("wonder_trade", "item_tiers")):
        names = [entry["name"] for entry in data[section][key]]
        if len(set(names)) != len(names):
            raise DataError(f"{datajson.label(path)}: two of {section}.{key} have the same name")
    languages = [entry["language"] for entry in data["wonder_trade"]["languages"]]
    if len(set(languages)) != len(languages):
        raise DataError(f"{datajson.label(path)}: a language is listed twice in wonder_trade.languages")
    if not any(entry["weight"] for entry in data["wonder_trade"]["languages"]):
        raise DataError(f"{datajson.label(path)}: wonder_trade.languages' weights are all 0")
    if not any(tier["weight"] for tier in data["wonder_trade"]["item_tiers"]):
        raise DataError(f"{datajson.label(path)}: wonder_trade.item_tiers' weights are all 0")
    if not any(ball["weight"] for ball in data["wonder_trade"]["balls"]):
        raise DataError(f"{datajson.label(path)}: wonder_trade.balls' weights are all 0")
    check_forms(path, data["wonder_trade"])
    check_excluded_forms(path, data["wonder_trade"])
    check_never_tradeable(path, data["wonder_trade"])
    check_special_gender(path, data["wonder_trade"]["special_reward"])
    for entry in data["wonder_trade"]["languages"]:
        for key, length in NAME_LENGTH.items():
            if entry["language"] in SHORT_LANGUAGES:
                length = SHORT_LENGTH
            for name in entry[key]:
                if len(name) > length or any(c in name for c in "{}\\"):
                    raise DataError(f"{datajson.label(path)}: wonder_trade.languages' {entry['language']} {key}: "
                                    f"{name!r} is longer than {length} characters or has a control code")
    return data


def form_count(species: str) -> int:
    """A species' number of forms, res/pokemon/*/data.json's forms.count (1 without forms)."""
    path = ROOT / "res" / "pokemon" / species.removeprefix("SPECIES_").lower() / "data.json"
    forms = json.loads(path.read_text()).get("forms")
    return forms["count"] if isinstance(forms, dict) else 1


def check_forms(path: Path, trade: dict):
    """wonder_trade.forms: each species once, not excluded, with weights for each of its forms or the season's."""
    seen = set()
    for entry in trade["forms"]:
        species = entry["species"]
        where = f"{datajson.label(path)}: wonder_trade.forms' {species}"
        if species in seen:
            raise DataError(f"{where} is listed twice")
        seen.add(species)
        if species in trade["excluded_species"]:
            raise DataError(f"{where} is an excluded species")
        if ("weights" in entry) == ("season" in entry):
            raise DataError(f"{where} needs either weights or season, not both")
        count = form_count(species)
        if "season" in entry and count != SEASON_COUNT:
            raise DataError(f"{where} has {count} forms, not one a season")
        if "weights" in entry:
            if len(entry["weights"]) != count:
                raise DataError(f"{where} has {len(entry['weights'])} weights for its {count} forms")
            if not any(entry["weights"]):
                raise DataError(f"{where}'s weights are all 0")


def check_excluded_forms(path: Path, trade: dict):
    """wonder_trade.excluded_forms: each an alternate form of its species, once."""
    seen = set()
    for entry in trade["excluded_forms"]:
        key = (entry["species"], entry["form"])
        where = f"{datajson.label(path)}: wonder_trade.excluded_forms' {entry['species']} form {entry['form']}"
        if key in seen:
            raise DataError(f"{where} is listed twice")
        seen.add(key)
        if entry["form"] >= form_count(entry["species"]):
            raise DataError(f"{where} isn't a form of the species' {form_count(entry['species'])}")


def check_never_tradeable(path: Path, trade: dict):
    """wonder_trade.never_tradeable: each a form of its species, once."""
    seen = set()
    for entry in trade["never_tradeable"]:
        key = (entry["species"], entry["form"])
        where = f"{datajson.label(path)}: wonder_trade.never_tradeable's {entry['species']} form {entry['form']}"
        if key in seen:
            raise DataError(f"{where} is listed twice")
        seen.add(key)
        if entry["form"] >= form_count(entry["species"]):
            raise DataError(f"{where} isn't a form of the species' {form_count(entry['species'])}")


def check_special_gender(path: Path, special: dict):
    """special_reward.gender: not the other sex of a species that is always one sex or none."""
    data = ROOT / "res" / "pokemon" / special["species"].removeprefix("SPECIES_").lower() / "data.json"
    ratio = json.loads(data.read_text()).get("gender_ratio")
    if special["gender"] != "random" and ratio in FIXED_RATIOS and FIXED_RATIOS[ratio] != special["gender"]:
        raise DataError(f"{datajson.label(path)}: wonder_trade.special_reward's {special['species']} can't be "
                        f"{special['gender']} (its gender ratio is {ratio})")


def form_entries(trade: dict) -> list[tuple[str, bool, list[int]]]:
    """The species received in other forms than their first, (species, season, weights): wonder_trade.forms, then in
    species order every species with forms the hack added that isn't listed (weight 1 for its first form and each
    added one), each with the excluded forms' weights 0. A species whose forms are then all 0 but its first is left
    out, since it is received as its first form anyway."""
    excluded = {(entry["species"], entry["form"]) for entry in trade["excluded_forms"]}
    listed = {entry["species"] for entry in trade["forms"]}
    entries = []
    for entry in trade["forms"]:
        weights = [0 if (entry["species"], form) in excluded else weight
                   for form, weight in enumerate(entry.get("weights", []))]
        entries.append((entry["species"], bool(entry.get("season")), weights))
    for species, original in original_form_counts().items():
        name = f"SPECIES_{species.upper()}"
        count = form_count(name)
        if count <= original or name in listed or name in trade["excluded_species"]:
            continue
        weights = [1] + [0] * (original - 1) + [0 if (name, form) in excluded else 1 for form in range(original, count)]
        if any(weights[1:]):
            entries.append((name, False, weights))
    return entries


def name_lines(path: Path = SOURCE) -> list[str]:
    """The text bank wonder_trade_names: each language's male names, female names and nicknames, in the order of
    wonder_trade.languages."""
    return [name for entry in load(path)["wonder_trade"]["languages"]
            for key in ("male_names", "female_names", "nicknames") for name in entry[key]]


def species_tables(data: dict) -> tuple[list[int], list[int]]:
    """Each National Pokédex species' pre-evolution (0 for none) and least level, from res/pokemon/*/data.json: a
    species that evolves from another at a level needs that level, one that evolves by anything else
    other_evolution_levels' level for its stage, and never less than its pre-evolution's. A pre-evolution that evolves
    into the species in one form only (its evolutions into it all have that "form") has the form plus one in the
    high bits, PRE_EVOLUTION_FORM_SHIFT on, which WonderTrade_Plan gives the Pokémon (Sirfetch'd's Farfetch'd is a
    Galarian one)."""
    values = datajson.constants()
    # The last species a Pokémon can be (tools/data/species_list.py): Genesect, or the last added one. The IDs between
    # are no Pokémon, and have no pre-evolution
    last = species_list.last_real_species()
    if last >= 1 << PRE_EVOLUTION_FORM_SHIFT:
        raise DataError(f"species {last} is past the pre-evolutions' {1 << PRE_EVOLUTION_FORM_SHIFT} species")
    pre = [0] * (last + 1)
    pre_forms = [set() for _ in range(last + 1)]
    method = [None] * (last + 1)
    stage = [1] * (last + 1)
    for number in species_list.real_species():
        species = species_list.species_data(number)
        stage[number] = species["evolution_stage"]
        for evolution in species.get("evolutions", []):
            target = values[evolution["species"]]
            if species_list.is_real(target) and not pre[target]:
                pre[target] = number
                method[target] = evolution
            if species_list.is_real(target) and pre[target] == number:
                pre_forms[target].add(evolution.get("form"))
    levels = data["wonder_trade"]["other_evolution_levels"]

    def least_level(number: int) -> int:
        if not pre[number]:
            return 1
        evolution = method[number]
        if evolution["method"] in LEVEL_METHODS and isinstance(evolution["param"], int) and evolution["param"] > 0:
            level = evolution["param"]
        else:
            level = levels["third_stage"] if stage[number] >= 3 else levels["second_stage"]
        return max(level, least_level(pre[number]))

    packed = [number | (next(iter(forms)) + 1) << PRE_EVOLUTION_FORM_SHIFT
              if len(forms) == 1 and None not in forms else number for number, forms in zip(pre, pre_forms)]
    return packed, [least_level(number) if number else 1 for number in range(last + 1)]


def fee_ids() -> dict[str, int]:
    """The POKEMON_CENTER_FEE_* IDs that include/paperwhite2/pokemon_center.h defines."""
    return {name: int(value, 0) for name, value in
            re.findall(r"^#define (POKEMON_CENTER_FEE_\w+) (\w+)$", IDS_HEADER.read_text(), re.MULTILINE)}


def fees(data: dict) -> list[int]:
    ids = fee_ids()
    if sorted(ids) != sorted(name for name, _ in FEES):
        raise DataError(f"{datajson.label(IDS_HEADER)}'s fees aren't this tool's FEES: {sorted(ids)}")
    out = []
    for index, (name, path) in enumerate(FEES):
        if ids[name] != index:
            raise DataError(f"{datajson.label(IDS_HEADER)}: {name} is {ids[name]}, not {index} as FEES has it")
        value = data
        for key in path:
            value = value[key]
        out.append(value)
    return out


def header(path: Path) -> str:
    data = load(path)
    values = fees(data)
    training = data["training"]
    relearner = training["move_relearner"]
    hyper = training["hyper_training"]
    friendship = ", ".join(str(course["friendship"]) for course in training["grooming"])
    lines = [
        f"#ifndef {GUARD}", f"#define {GUARD}", "",
        f"// Generated by tools/paperwhite2/pokemon_center.py from {datajson.label(path)}, edit that instead",
        "// (docs/paperwhite2/design/pokemon-center.md)", "",
        "// The fees in Pokédollars (Hyper Training's in Battle Points), by their POKEMON_CENTER_FEE_* IDs",
        "// (paperwhite2/pokemon_center.h)",
        f"#define POKEMON_CENTER_FEE_COUNT {len(values)}",
        "#define POKEMON_CENTER_FEES \\",
        *(f"    {value}, /* {name} */ \\" for value, (name, _) in zip(values, FEES)),
        "",
        "// The Move Relearner's item (constants/items.h) and how many it takes, with its money",
        f"#define POKEMON_CENTER_RELEARNER_ITEM {relearner['item']}",
        f"#define POKEMON_CENTER_RELEARNER_ITEM_COUNT {relearner['item_count']}",
        "// Hyper Training's least level, and whether the player must be Champion",
        f"#define POKEMON_CENTER_HYPER_TRAINING_LEVEL {hyper['level_after_champion']}",
        f"#define POKEMON_CENTER_HYPER_TRAINING_NEEDS_CHAMPION {1 if hyper['requires_champion'] else 0}",
        "// The grooming courses' friendship, in their order",
        f"#define POKEMON_CENTER_GROOMING_COUNT {len(training['grooming'])}",
        f"#define POKEMON_CENTER_GROOMING_FRIENDSHIP {friendship}",
        "// The Champion's discount in percent, and whether it applies to Battle Points and to items too",
        f"#define POKEMON_CENTER_CHAMPION_DISCOUNT_PERCENT {data['champion_discount_percent']}",
        f"#define POKEMON_CENTER_CHAMPION_DISCOUNT_BP {1 if data['champion_discount_battle_points'] else 0}",
        f"#define POKEMON_CENTER_CHAMPION_DISCOUNT_ITEMS {1 if data['champion_discount_items'] else 0}",
        "// The Gym Badges the Day Care attendant needs",
        f"#define POKEMON_CENTER_DAYCARE_REQUIRED_BADGES {data['daycare']['required_badges']}",
        "",
        *wonder_trade_lines(data),
        "", f"#endif // {GUARD}", "",
    ]
    return "\n".join(lines)


def array(name: str, values: list, per_line: int = 16) -> list[str]:
    """A #define of a list of values, a line each per_line."""
    rows = [", ".join(str(v) for v in values[i:i + per_line]) for i in range(0, len(values), per_line)]
    return [f"#define {name} \\", *(f"    {row}, \\" for row in rows[:-1]), f"    {rows[-1]}"]


def wonder_trade_lines(data: dict) -> list[str]:
    trade = data["wonder_trade"]
    values = datajson.constants()
    last = species_list.last_real_species()
    excluded = [0] * (last // 8 + 1)
    for name in trade["excluded_species"]:
        number = values[name]
        if not species_list.is_real(number):
            raise DataError(f"wonder_trade.excluded_species: {name} isn't a Pokémon species")
        excluded[number // 8] |= 1 << (number % 8)
    # The IDs that are no Pokémon (the egg's to the reserved ones) and the species that never enter the Pokédex are
    # never received nor sent
    pokedex = set(species_list.pokedex_species())
    for number in range(1, last + 1):
        if number not in pokedex:
            excluded[number // 8] |= 1 << (number % 8)
    pre, least = species_tables(data)
    rows = []
    first = 0
    for entry in trade["languages"]:
        language, bank = LANGUAGES[entry["language"]]
        counts = [len(entry[key]) for key in ("male_names", "female_names", "nicknames")]
        ranges = ", ".join(f"{{ {first + sum(counts[:i])}, {counts[i]} }}" for i in range(3))
        rows.append(f"    {{ {language}, {bank}, {entry['weight']}, {{ {ranges} }} }}, \\")
        first += sum(counts)
    tiers = []
    items = []
    for tier in trade["item_tiers"]:
        tiers.append(f"    {{ {tier['weight']}, {len(items)}, {len(tier['items'])} }}, /* {tier['name']} */ \\")
        for item in tier["items"]:
            items.append((item, 1) if isinstance(item, str) else (item["item"], item["weight"]))
    form_rows = []
    form_weights = []
    for species, season, weights in form_entries(trade):
        if len(form_weights) > 255:
            raise DataError(f"wonder_trade: {species}'s form weights start past the 255 that FormSpecies.first holds")
        form_rows.append(f"    {{ {species}, {1 if season else 0}, {len(form_weights)}, {len(weights)} }}, \\")
        form_weights.extend(weights)
    if not form_rows:
        # C has no empty arrays: a row for species 0, never received
        form_rows.append("    { 0, 0, 0, 0 }, \\")
    never = [f"    {{ {entry['species']}, {entry['form']} }}, \\" for entry in trade["never_tradeable"]]
    if not never:
        # C has no empty arrays: species 0, no Pokémon
        never.append("    { 0, 0 }, \\")
    special = trade["special_reward"]
    ivs = ", ".join(str(special["ivs"][stat]) for stat in STATS)
    moves = special["moves"] + ["MOVE_NONE"] * (4 - len(special["moves"]))
    return [
        "// The Wonder Trade (paperwhite2_wonder_trade.c): the level's spread, and the rates in percent",
        f"#define WONDER_TRADE_LEVEL_SPREAD {trade['level_spread']}",
        f"#define WONDER_TRADE_FEMALE_TRAINER_PERCENT {trade['female_trainer_percent']}",
        f"#define WONDER_TRADE_SHINY_ONE_IN {trade['shiny_one_in']}",
        f"#define WONDER_TRADE_HIDDEN_ABILITY_PERCENT {trade['hidden_ability_percent']}",
        f"#define WONDER_TRADE_PERFECT_IVS_PERCENT {trade['perfect_ivs_percent']}",
        f"#define WONDER_TRADE_PERFECT_IV_COUNT {trade['perfect_iv_count']}",
        f"#define WONDER_TRADE_POKERUS_PERCENT {trade['pokerus_percent']}",
        f"#define WONDER_TRADE_NICKNAME_PERCENT {trade['nickname_percent']}",
        f"#define WONDER_TRADE_HELD_ITEM_PERCENT {trade['held_item_percent']}",
        "// The species never received nor sent, a bit each by species number",
        *array("WONDER_TRADE_EXCLUDED_SPECIES", [f"0x{byte:02x}" for byte in excluded]),
        f"#define WONDER_TRADE_SPECIES_COUNT {last + 1}",
        "// Each species' pre-evolution (0 for none; its form plus one from WONDER_TRADE_PRE_EVOLUTION_FORM_SHIFT",
        "// where only that form evolves into it) and least level, below which a received one is its pre-evolution",
        f"#define WONDER_TRADE_PRE_EVOLUTION_FORM_SHIFT {PRE_EVOLUTION_FORM_SHIFT}",
        *array("WONDER_TRADE_PRE_EVOLUTIONS", pre),
        *array("WONDER_TRADE_LEAST_LEVELS", least, 32),
        "// The species received in other forms: { species, whether its form is the season's, first, count } of",
        "// WONDER_TRADE_FORM_WEIGHTS, a weight a form",
        f"#define WONDER_TRADE_FORM_SPECIES_COUNT {len(form_rows)}",
        "#define WONDER_TRADE_FORM_SPECIES \\", *form_rows, "",
        f"#define WONDER_TRADE_FORM_WEIGHT_COUNT {max(len(form_weights), 1)}",
        *array("WONDER_TRADE_FORM_WEIGHTS", form_weights or [0]),
        "// The languages: { language, its species names' bank, weight, { first line, count } in the bank",
        "// wonder_trade_names of the male names, the female names and the nicknames }",
        f"#define WONDER_TRADE_LANGUAGE_COUNT {len(rows)}",
        "#define WONDER_TRADE_LANGUAGES \\", *rows, "",
        "// The balls: { item, weight }",
        f"#define WONDER_TRADE_BALL_COUNT {len(trade['balls'])}",
        "#define WONDER_TRADE_BALLS \\",
        *(f"    {{ {ball['item']}, {ball['weight']} }}, \\" for ball in trade["balls"]), "",
        "// The held items' tiers: { weight, first, count } of WONDER_TRADE_ITEMS' { item, weight }",
        f"#define WONDER_TRADE_ITEM_TIER_COUNT {len(tiers)}",
        "#define WONDER_TRADE_ITEM_TIERS \\", *tiers, "",
        f"#define WONDER_TRADE_ITEM_COUNT {len(items)}",
        "#define WONDER_TRADE_ITEMS \\", *(f"    {{ {item}, {weight} }}, \\" for item, weight in items), "",
        "// The forms never sent, { species, form }, which the attendant keeps back with her own words",
        f"#define WONDER_TRADE_NEVER_TRADEABLE_COUNT {len(never)}",
        "#define WONDER_TRADE_NEVER_TRADEABLE \\", *never, "",
        "// The special reward, once, at a percent a trade until the trade WONDER_TRADE_SPECIAL_GUARANTEED_AT",
        f"#define WONDER_TRADE_SPECIAL_ENABLED {1 if special['enabled'] else 0}",
        f"#define WONDER_TRADE_SPECIAL_PERCENT {special['percent']}",
        f"#define WONDER_TRADE_SPECIAL_GUARANTEED_AT {special['guaranteed_at']}",
        f"#define WONDER_TRADE_SPECIAL_SPECIES {special['species']}",
        f"#define WONDER_TRADE_SPECIAL_FORM {special['form']}",
        f"#define WONDER_TRADE_SPECIAL_LEVEL {special['level']}",
        f"#define WONDER_TRADE_SPECIAL_MOVES {', '.join(moves)}",
        f"#define WONDER_TRADE_SPECIAL_NATURE {special['nature']}",
        "// In the order of PKM_PARAM_IV_HP's fields: HP, Attack, Defense, Speed, Sp. Atk, Sp. Def",
        f"#define WONDER_TRADE_SPECIAL_IVS {ivs}",
        f"#define WONDER_TRADE_SPECIAL_ABILITY_SLOT {special['ability_slot']}",
        f"#define WONDER_TRADE_SPECIAL_BALL {special['ball']}",
        f"#define WONDER_TRADE_SPECIAL_ITEM {special['held_item']}",
        f"#define WONDER_TRADE_SPECIAL_SEX {GENDERS[special['gender']]}",
    ]


def write_if_changed(path: Path, text: str):
    if not path.exists() or path.read_text() != text:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", type=Path, nargs="?", default=SOURCE)
    parser.add_argument("output", type=Path, nargs="?")
    parser.add_argument("--check", action="store_true", help="only check the file")
    args = parser.parse_args()
    try:
        if args.check or args.output is None:
            fees(load(args.source))
            print(f"{datajson.label(args.source)} is fine")
            return
        write_if_changed(args.output, header(args.source))
    except (DataError, datajson.DataError) as error:
        sys.exit(f"error: {error}")


if __name__ == "__main__":
    main()
