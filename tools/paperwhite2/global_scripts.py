#!/usr/bin/env python3
"""Writes docs/paperwhite2/global-scripts.md, the reference of the global script files and their free IDs.

Each row of GLOBAL_SCRIPT_TABLE (src/ov012/script_sys.c) is a range of script IDs, the SCRIPTS_GLOBAL_* file of the
field script archive that holds them (res/field/scripts/global_NNNN.s, its archive ID from
generated/field_scripts.txt) and its text bank. A file's scripts are its ScriptEntry lines, in order from the range's
first ID; an ID past the file's last entry is free, up to the range's end (FieldScript_ResolveSCRID asserts past it).
Where the hack's build changes a row under #ifdef PAPERWHITE2, the hack's row is the one read.

The hack's scripts are the entries a file has beyond its count in the original game (the w2-original tag of git), each
described by HACK_SCRIPTS, or as not identified.

Usage: python3 tools/paperwhite2/global_scripts.py [--output docs/paperwhite2/global-scripts.md] [--check]
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT_SYS = ROOT / "src" / "ov012" / "script_sys.c"
SCRIPTS = ROOT / "res" / "field" / "scripts"
FIELD_SCRIPTS = ROOT / "generated" / "field_scripts.txt"
OUTPUT = ROOT / "docs" / "paperwhite2" / "global-scripts.md"
ORIGINAL = "w2-original"

# The original's source file of each range and what it holds, by the range's first ID (from the user's reference list
# of Gen 5's global scripts)
DESCRIPTIONS = {
    2000: ("common.ev", "Save game, blackout, unusable items"),
    2100: ("pokecen.ev", "Pokémon Center actors"),
    2200: ("sodateya_scr.ev", "Daycare"),
    2225: ("namechange_scr.ev", "Name rater"),
    2250: ("egg_scr.ev", "Egg hatching"),
    2260: ("poke_waza.ev", "Move deleter, Move reminder"),
    2280: ("move_tutor.ev", "Move tutors"),
    2500: ("bg_attr.ev", "Interactible tiles - trash cans, bookcases..."),
    2800: ("item_get_scr.ev", "Field item dialogs"),
    3000: ("trainer.ev", "Regular field trainers - single/primary double battle trainer"),
    5000: ("trainer.ev", "Regular field trainers - secondary double battle trainer"),
    7000: ("fld_item.ev", "Regular field item logic"),
    8000: ("hide_item.ev", "Hidden field item logic"),
    9600: ("init_scr.ev", "Game initialization and post-HOF"),
    10000: ("hiden.ev", "HM sequences"),
    10090: ("pokecen_haihu_scr.ev", "Pokémon Center system"),
    10100: ("wifi_club_scr.ev", "Wi-Fi club/Pal pad actor scripts"),
    10105: ("global_terminal_scr.ev", "Global Terminal - GTS/online scripts"),
    10110: ("shop_scr.ev", "Regular and BP shops"),
    10130: ("field_event.ev", "Basic field events - repel, fishing, entralink warp"),
    10200: ("dummy.ev", "Dummy script"),
    10250: ("blank.ev", "Dummy script"),
    10260: ("competition_check.ev", "Tournament eligibility checking"),
    10270: ("deox_change_scr.ev", "Deoxys forme change system"),
    10280: ("fossil_scr.ev", "Fossil restoration"),
    10290: ("poketransfer_scr.ev", "Poké Transfer actor dialogues"),
    10310: ("judge_scr.ev", "EV judge"),
    10315: ("rotom_change_scr.ev", "Rotom forme change system"),
    10325: ("trade_stats.ev", "Trading total check and rewards"),
    10330: ("bsubway_common.ev", "Battle subway script resource"),
    10350: ("c03_c00_common.ev", "Castelia Street rush dialogue"),
    10380: ("hyouka_scr.ev", "Pokémon Professor lab dialogue"),
    10390: ("dream_remnant_scr.ev", "Entree forest item boy"),
    10395: ("pgl_postman_scr.ev", "Pokémon Global Link Mystery Gift delivery"),
    10400: ("vendor_scr.ev", "Vending machines"),
    10405: ("elevator.ev", "Elevator buttons and door dialogs"),
    10435: ("passpower_scr.ev", "Pass power dialogs"),
    10440: ("battle_inst.ev", "Battle institute reception dialogue"),
    10445: ("dream_decor_scr.ev", "Loblolly Dream World Décor dialogue"),
    10450: ("musical_scr.ev", "Pokémon Musical dialogue and logic"),
    10470: ("dun200x_common.ev", "Abyssal ruins ambient"),
    10480: ("collector_scr.ev", "Rare item collector dialogue"),
    10490: ("forest_clearing_scr.ev", "Entree forest clearings common dialogs"),
    10510: ("ferris_wheel.ev", "Ferris wheel actor dialogue"),
    10520: ("fungi_scr.ev", "Foongus/Amoonguss ambush"),
    10530: ("tv_scr.ev", "TV programme"),
    10535: ("follow_common.ev", "Following actor interactions - N, Bianca..."),
    10635: ("medal_scr.ev", "Mr. Medal dialogue"),
    10655: ("pwt_lobby.ev", "PWT lobby system"),
    10665: ("pwt_arena.ev", "PWT battle arena system"),
    10675: ("pwt_trainer.ev", "PWT trainer dialogue"),
    10685: ("resonance_common.ev", "Join Avenue script resource"),
    10735: ("unova_challenge_scr.ev", "Black Tower/White Treehollow trainers"),
    10785: ("field_minigame.ev", "Rock paper scissors, item trades..."),
    10795: ("hidden_grotto_enter.ev", "Hidden grotto entrance dialog"),
    10815: ("pokewood_lobby_common.ev", "Pokéstar studios lobby script resource"),
    10850: ("dummy.ev", "Dummy script"),
    10860: ("field_xtransceiver.ev", "Xtransceiver answer dialog"),
    10865: ("pokewood_theatre.ev", "Pokéstar studios theatre system"),
    10885: ("dun2710_common.ev", "Plasma Frigate password hint trainers"),
}

# What each script that the hack added does, by its ID
HACK_SCRIPTS = {
    2818: "The Exp. Share toggle, which the Y button's shortcut starts (`SCRID_EXP_SHARE_TOGGLE`, "
          "include/paperwhite2/exp_share.h)",
    2819: "The Shiny Candy drop after a wild battle won against a shiny Pokémon (`SCRID_SHINY_CANDY_DROP`, "
          "include/paperwhite2/shiny_candy.h)",
    9603: "The new game's starting flags, the original's subroutine of scripts 9600 and 9602 given an entry by the "
          "hack's data; nothing starts it by its ID",
    9604: "The survey's answers by the version and the player's sex, the original's subroutine of script 9600 given an "
          "entry by the hack's data; nothing starts it by its ID",
    9605: "The flags and work reset after the Hall of Fame, the original's subroutine of script 9601 given an entry by "
          "the hack's data; nothing starts it by its ID",
    10201: "The debug menu that START opens in the field (`SCRID_PAPERWHITE2_DEBUG_MENU`, src/ov036/fieldmap_event.c), "
           "with its submenus as labeled blocks, under PAPERWHITE2_DEBUG_MENU",
    10851: "The user's: the Pokémon Center lottery girl's daily gift, a random item by chance tiers "
           "(`EVENT_FLAG_DAILY_0x0af0`), from the Centers' events",
    10852: "The user's: the seasonal NPC spawns, a map script that hides flags 500-599's NPCs and shows a random few of "
           "the current season's",
    10853: "The user's: gives a random item, 0x8011 plus a random number below 0x8010, through script 2805; 0x8012 is "
           "whether the bag had no room (Aspertia City, Route 20)",
    10854: "The user's: a scripted wild battle with species 0x8010 at four fifths of the lead's level, after its cry; "
           "0x8012 is the result (Virbank Complex, Route 20)",
    10855: "The user's berry flavor: 0x8010 is a berry's item ID; 0x8012 returns 0 spicy, 1 dry, 2 sweet, 3 bitter, 4 "
           "sour, 5 not a berry",
    10856: "The user's random berry by category: 0x8010 is the category, 1 battle, 2 food (two of each flavor), 3 rare, "
           "4 type resist, 5 EV, 6 forage; 0x8012 returns a random berry's item ID from it",
}

ROW = re.compile(r"\{\s*(\d+),\s*(\d+),\s*SCRIPTS_GLOBAL_(\d+),\s*\w+,\s*SCRIPT_TEXT_GLOBAL_(\d+)\s*\}")
ENTRY = re.compile(r"^\s*ScriptEntry\s", re.MULTILINE)


def table_rows() -> list[tuple[int, int, int, int]]:
    """GLOBAL_SCRIPT_TABLE's rows (first ID, last ID, script file, text bank), in ID order, taking the PAPERWHITE2
    branch of an #ifdef PAPERWHITE2 over its #else."""
    text = SCRIPT_SYS.read_text(encoding="utf-8")
    body = text[text.index("GLOBAL_SCRIPT_TABLE["):]
    body = body[:body.index("};")]
    rows = []
    stack = []
    for line in body.splitlines():
        stripped = line.strip()
        if stripped.startswith("#if"):
            stack.append(stripped == "#ifdef PAPERWHITE2")
            continue
        if stripped.startswith("#else"):
            stack[-1] = not stack[-1]
            continue
        if stripped.startswith("#endif"):
            stack.pop()
            continue
        if not all(stack):
            continue
        match = ROW.search(line)
        if match:
            rows.append(tuple(int(group) for group in match.groups()))
    return sorted(rows)


def archive_ids() -> dict[str, int]:
    """The field script archive's file IDs by constant, from the constant list (NAME = N, then one more each line)."""
    ids = {}
    value = -1
    for line in FIELD_SCRIPTS.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        name, _, number = line.partition("=")
        value = int(number.strip(), 0) if number else value + 1
        ids[name.strip()] = value
    return ids


def entry_count(text: str) -> int:
    return len(ENTRY.findall(text))


def original_count(path: Path) -> int | None:
    result = subprocess.run(["git", "show", f"{ORIGINAL}:{path.relative_to(ROOT).as_posix()}"], cwd=ROOT,
                            capture_output=True, text=True, encoding="utf-8")
    return entry_count(result.stdout) if result.returncode == 0 else None


def id_range(first: int, last: int) -> str:
    return f"{first}" if first == last else f"{first}-{last}"


def render() -> str:
    ids = archive_ids()
    lines = [
        "# Global scripts",
        "",
        "Written by `tools/paperwhite2/global_scripts.py`; run it again after adding a global script. Each row of",
        "`GLOBAL_SCRIPT_TABLE` (`src/ov012/script_sys.c`) gives a file of the field script archive a range of script",
        "IDs: its scripts are its `ScriptEntry` lines, in order from the range's first ID. An ID past the range's end",
        "fails `FieldScript_ResolveSCRID`'s assert at run time (see plugins.md, Adding global scripts). The descriptions",
        "and original file names are the user's reference list of Gen 5's global scripts.",
        "",
        "| Range | File | Archive ID | Original | Description | IDs used | First free | Free |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    hack = []
    totals = [0, 0]
    seen = set()
    for first, last, number, _ in table_rows():
        path = SCRIPTS / f"global_{number}.s"
        count = entry_count(path.read_text(encoding="utf-8"))
        size = last - first + 1
        used = min(count, size)
        free = size - used
        totals[0] += used
        totals[1] += free
        source, description = DESCRIPTIONS.get(first, ("", ""))
        if number != first:
            description += f" (the file of {number}-, whose entries this range reaches from its own start)"
        lines.append(f"| {first}-{last} | `{path.relative_to(ROOT).as_posix()}` | {ids.get(f'SCRIPTS_GLOBAL_{number}', '')} "
                     f"| `{source}` | {description} | {id_range(first, first + used - 1) if used else 'none'} ({used}) "
                     f"| {first + used if free else 'none'} | {free} |")
        if number in seen:
            continue
        seen.add(number)
        original = original_count(path)
        if original is not None and count > original:
            for index in range(original, count):
                script = first + index
                hack.append(f"| {script} | `{path.relative_to(ROOT).as_posix()}` | Script_{index + 1} "
                            f"| {HACK_SCRIPTS.get(script, 'Not identified')} |")
    lines += [
        "",
        f"{totals[0]} IDs used, {totals[1]} free.",
        "",
        "## Hack scripts",
        "",
        f"The entries a file has beyond its count in the original game (git's `{ORIGINAL}` tag). A file the hack",
        "changed without adding entries isn't listed.",
        "",
        "| ID | File | Entry | Purpose |",
        "| --- | --- | --- | --- |",
        *hack,
        "",
    ]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--check", action="store_true", help="fail if the output isn't up to date, writing nothing")
    args = parser.parse_args()
    text = render()
    if args.check:
        current = args.output.read_text(encoding="utf-8") if args.output.exists() else ""
        if current != text:
            sys.exit(f"{args.output} is out of date: run tools/paperwhite2/global_scripts.py")
        return
    args.output.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
