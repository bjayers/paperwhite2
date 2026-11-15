#!/usr/bin/env python3
"""Paper White 2: Cheren's type advice on the Xtransceiver (res/text/system/local_tvt_person_chelen_type.txt), kept
right for the type chart (src/paperwhite2/main/paperwhite2_type_chart.c).

    cheren_type_text.py          # writes the messages whose weaknesses changed, and the Fairy type's
    cheren_type_text.py --check  # says which would change, and fails if any would

Cheren names what a Pokémon of the party is weak against, one message per pair of types (local_tvt_person_chelen.c,
LocalTvtChelen_GetTypesMsg): the original 153 for the 17 types, the smaller type first, then the Fairy type's 18, by the
other type, Fairy alone last. A message whose weaknesses (the attacking types that do more than normal damage to the
pair, from the chart) are those it names is kept as the game wrote it; one whose aren't is written again in the
original's words, the types in the chart's order, and so is each Fairy message. Gen 6's chart makes Fairy a weakness of
Fighting, Dragon and Dark, and Ghost and Dark weaknesses of a Steel type with Ghost or Psychic, so those pairs'
original messages are rewritten.

The types' names are res/types/<type>.json's, in the order of generated/types.txt; TYPE_NULL is no type.
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEXT = ROOT / "res/text/system/local_tvt_person_chelen_type.txt"
CHART = ROOT / "src/paperwhite2/main/paperwhite2_type_chart.c"
TYPES = ROOT / "generated/types.txt"
PREFIX = "LocalTvtPersonChelenType_Text_"
NORMAL = 4
# The original types, TYPE_NORMAL to TYPE_DARK, and the Fairy type's number
ORIGINAL_COUNT = 17
# The longest line of the window, in characters, as the game's longest are
LINE_LENGTH = 41
# From this many weaknesses Cheren adds his warning
MANY = 5
MANY_TEXT = "{be01}\\nBecause it's weak against many types,\\na Trainer has to plan for it."
NONE_TEXT = "\\nIt is a rare type combination that\\ndoesn't have any weaknesses."


def type_names():
    """The types' constants and names, by number: generated/types.txt's order, its explicit values honoured."""
    names, number = {}, 0
    for line in TYPES.read_text().splitlines():
        line = line.split("#")[0].strip()
        if not line:
            continue
        name, _, value = line.partition("=")
        name = name.strip()
        if value.strip():
            number = int(value.strip(), 0)
        if name != "TYPE_NULL":
            data = json.loads((ROOT / "res/types" / (name.removeprefix("TYPE_").lower() + ".json")).read_text())
            names[number] = (name, data["name"])
        number += 1
    return names


def type_chart():
    values = [int(v) for v in re.findall(r"\d+", CHART.read_text().split("= {", 1)[1].split("};")[0])]
    size = int(len(values) ** 0.5)
    return [values[i * size:(i + 1) * size] for i in range(size)]


def pairs(fairy):
    """The pairs of types in the bank's order: the original ones with the smaller first, then the Fairy type's."""
    result = [(a, b) for a in range(ORIGINAL_COUNT) for b in range(a, ORIGINAL_COUNT)]
    return result + [(t, fairy) for t in range(ORIGINAL_COUNT)] + [(fairy, fairy)]


def weaknesses(chart, attackers, a, b):
    out = []
    for t in attackers:
        value = chart[t][a] * (chart[t][b] if b != a else NORMAL)
        if value > NORMAL * NORMAL:
            out.append(t)
    return out


def article(name):
    return "An" if name[0] in "AEIOU" else "A"


def wrap(words):
    lines, line = [], ""
    for word in words:
        if line and len(line) + 1 + len(word) > LINE_LENGTH:
            lines.append(line)
            line = word
        else:
            line = f"{line} {word}" if line else word
    lines.append(line)
    # The window has two lines: a third starts a new page
    text = ""
    for i, line in enumerate(lines):
        if i:
            text += "{be00}\\n" if i % 2 == 0 else "\\n"
        text += line
    return text


def message(names, a, b, weak):
    first, second = names[a][1], names[b][1]
    head = (f"{article(first)} {first}-type Pokémon...{{be01}}" if a == b
            else f"{article(first)} {first}- and {second}-type Pokémon...{{be01}}")
    shown = [names[t][1] for t in weak]
    if not shown:
        return head + NONE_TEXT + "{be01}"
    if len(shown) == 1:
        return head + f"\\nIt's weak against only\\n{shown[0]}-type attacks." + "{be01}"
    if len(shown) == 2:
        return head + f"\\nIt's weak against {shown[0]}- and\\n{shown[1]}-type attacks." + "{be01}"
    words = ["It's", "weak", "against"] + [f"{n}-," for n in shown[:-1]] + ["and", f"{shown[-1]}-type", "attacks."]
    body = "\\n" + wrap(words)
    return head + body + (MANY_TEXT if len(shown) >= MANY else "") + "{be01}"


def named(text, names):
    """The types a message says the pair is weak against, or None for "no weaknesses"."""
    if "doesn't have any weaknesses" in text:
        return set()
    body = text.split("{be01}", 1)[1].split("{be01}", 1)[0].replace("{be00}", "").replace("\\n", " ")
    by_name = {name: t for t, (_, name) in names.items()}
    return {by_name[n] for n in re.findall(r"([A-Z][a-z]+)-", body.split("against", 1)[1])}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    names = type_names()
    fairy = next(t for t, (name, _) in names.items() if name == "TYPE_FAIRY")
    chart = type_chart()
    attackers = sorted(names)
    lines = TEXT.read_text().splitlines()
    pad = [line for line in lines if line.startswith("\\pad{")]
    entries = [line.split(" = ", 1) for line in lines if not line.startswith("\\pad{")]
    out, changed = [], []
    for index, (a, b) in enumerate(pairs(fairy)):
        weak = weaknesses(chart, attackers, a, b)
        if index < len(entries) and named(entries[index][1], names) == set(weak):
            out.append(entries[index])
            continue
        if index < len(entries):
            key = entries[index][0]
        else:
            key = PREFIX + (f"{names[a][1]}TypePokemon" if a == b else f"{names[a][1]}{names[b][1]}TypePokemon")
        out.append([key, message(names, a, b, weak)])
        changed.append((index, names[a][1], names[b][1], [names[t][1] for t in weak]))
    for index, first, second, weak in changed:
        print(f"{index}: {first}/{second}: {', '.join(weak) or 'none'}")
    if args.check:
        sys.exit(1 if changed else 0)
    TEXT.write_text("".join(f"{key} = {text}\n" for key, text in out) + "".join(line + "\n" for line in pad))


if __name__ == "__main__":
    main()
