#!/usr/bin/env python3
"""Export and pack Pokémon battle sprites, icons, and footprints.

    pokemon_graphics.py extract res/pokemon
    pokemon_graphics.py pack res/pokemon black2|white2 OUTPUT...

Images are indexed PNGs: their pixel indices select colors in the adjacent
JASC palette. Nitro cell, animation, and other binary resources remain separate
files so every archive member has a source without inventing lossy metadata.

Packing walks the original archive's files and builds each from its source. Paper White 2's own form sprite groups
(a species' forms.sprite_offset + form - 1 from ORIGINAL_FORM_GROUPS, res/pokemon/<species>/form_<n>/) are appended:
the battle sprites' 20 files a group after the Substitute's files and Arceus' palettes (ADDED_FORM_FILES,
include/paperwhite2/pokemon_forms.h), the icons' two a group after the original ones, each made in the format of its
species' own file of the same kind. Without such forms the archives are the original's.
"""

import json
import re
import struct
import sys
from functools import lru_cache
from pathlib import Path

from narc import read_narc, write_narc
from species_data import directory
from nitro_2d import (character_pixels, color5, palette_colors, palette_indices, patch_characters, patch_palette,
                      read_indexed_png, read_palette, write_indexed_png, write_palette)


ROOT = Path(__file__).resolve().parents[2]
# The extracted files of the version being packed, which hold the originals that the sources are compared with.
# Exporting reads Black 2's; pack() switches to the version it packs, the only one extracted in its CI job
EXTRACTED = ROOT / "extract/b2_us/files"
ARCHIVES = {"a/0/0/4": "battle", "a/0/0/7": "icons", "a/0/5/1": "musical",
            "a/1/6/5": "footprints", "a/2/2/9": "footprint_forms"}
SLOT_NAMES = ("front_single", "front_single_female", "front", "front_female",
              "front_cells", "front_animations", "front_multi_cells", "front_multi_animations", "front_info",
              "back_single", "back_single_female", "back", "back_female",
              "back_cells", "back_animations", "back_multi_cells", "back_multi_animations", "back_info",
              "normal", "shiny")
CHAR_SLOTS = {0, 1, 2, 3, 9, 10, 11, 12}
PALETTE_SLOTS = {18, 19}
FORM_FOOTPRINTS = (("giratina", 1), ("shaymin", 1), ("kyurem", 1), ("kyurem", 2),
                   ("keldeo", 1), ("tornadus", 1), ("thundurus", 1), ("landorus", 1))


@lru_cache(maxsize=1)
def species_names():
    """Returns the directories of the species of generated/species.txt, in order: the national Pokédex's, then
    the egg, the bad egg and the Pokéstar Studios species."""
    return [directory(re.match(r"SPECIES_[A-Z0-9_]+", line).group(0))
            for line in (ROOT / "generated/species.txt").read_text().splitlines()
            if line.startswith("SPECIES_")]


@lru_cache(maxsize=1)
def national_species():
    """Returns the number of species up to the national Pokédex's last, the index of SPECIES_EGG."""
    return species_names().index("egg")


@lru_cache(maxsize=2)
def form_names(musical=False):
    """Returns the species and form of each form sprite group, from its species' forms (sprite_offset and count) in
    res/pokemon. The musical sprites follow Black and White's species data instead (ARCID_PERSONAL_BW1, a/3/0/2,
    which MusicalMcss_GetDataIDBase reads), whose offsets differ and which has no source. Forms told apart only by
    their palette (palette_forms, Arceus) have no groups. Paper White 2's form groups, from ORIGINAL_FORM_GROUPS,
    must follow the original ones without gaps, since the archives append them in order."""
    records = read_narc((EXTRACTED / "a/3/0/2").read_bytes()) if musical else None
    result = {}
    for number, species in enumerate(species_names()[:national_species()]):
        if musical:
            _, sprite_offset, count = struct.unpack_from("<HHB", records[number], 0x1C)
            palette_only = records[number][0x21] >> 7 & 1
        else:
            data = json.loads((ROOT / "res/pokemon" / species / "data.json").read_text())
            sprite_offset, count = data["forms"]["sprite_offset"], data["forms"]["count"]
            palette_only = data["palette_forms"]
        if count <= 1 or palette_only:
            continue
        for form in range(1, count):
            group = sprite_offset + form - 1
            if group in result:
                raise ValueError(f"res/pokemon/{species}: form {form}'s sprite group {group} is also "
                                 f"{result[group][0]}'s form {result[group][1]}'s (forms.sprite_offset)")
            result[group] = (species, form)
    added = sorted(group for group in result if group >= ORIGINAL_FORM_GROUPS)
    if not musical and added != list(range(ORIGINAL_FORM_GROUPS, ORIGINAL_FORM_GROUPS + len(added))):
        missing = next(group for group in range(ORIGINAL_FORM_GROUPS, added[-1]) if group not in result)
        raise ValueError(f"no form has sprite group {missing}: the groups from {ORIGINAL_FORM_GROUPS} must follow "
                         "each other (forms.sprite_offset)")
    return result


def added_form_groups():
    """Returns the number of Paper White 2's form sprite groups, from ORIGINAL_FORM_GROUPS."""
    return sum(1 for group in form_names() if group >= ORIGINAL_FORM_GROUPS)


# Each sprite archive's groups of files (20 to a battle or musical group, 2 to an icon group): the egg's, the next
# Manaphy's egg's, and the first form's. Before them, a group is a species' (in a/0/0/4, of the species two after it
# past the bad egg, which has no sprites of its own, GetPokemonDataIDBase)
GROUPS = {"battle": (683, 685), "icons": (683, 685), "musical": (650, 652)}
# Paper White 2: the original game's form groups, 0 to 65 (sprite_offset + form - 1). The battle sprites' 66 form
# groups end where the Substitute's files start (SUBSTITUTE_FILES), so the hack's form groups, from 66, follow Arceus'
# palettes, at the archive's original end (ADDED_FORM_FILES, PaperWhite2_GetFormSpriteFile); the icons' form groups
# end at the archive's end, so theirs follow them as they are (PokeParty_GetIconIndex)
ORIGINAL_FORM_GROUPS = 66
SUBSTITUTE_FILES = 15020
FORM_PALETTE_FILES = 15033
ADDED_FORM_FILES = 15065
GROUP_FILES = 20


def group_folder(root, group, kind):
    egg, forms = GROUPS[kind]
    names = species_names()
    if group == egg:
        path = root / "egg"
    elif group == egg + 1:
        path = root / "manaphy" / "egg"
    elif group >= forms:
        if group - forms not in form_names(kind == "musical"):
            raise ValueError(f"{kind} group {group} is no species' form")
        species, form = form_names(kind == "musical")[group - forms]
        path = root / species / f"form_{form}"
    else:
        path = root / names[group + 2 if kind == "battle" and group >= national_species() else group]
    return path / "musical" if kind == "musical" else path


# The Substitute doll's files after the sprite groups, as BtlvMcss_SetSubstitute loads them: the front's and the
# back's, then the palette. The musical archive keeps Black and White's, which nothing in Black 2 and White 2 loads
SUBSTITUTE_SLOTS = ("front", "front_cells", "front_animations", "front_multi_cells", "front_multi_animations",
                    "front_info", "back", "back_cells", "back_animations", "back_multi_cells",
                    "back_multi_animations", "back_info", "normal")
EXTENSIONS = {"cells": ".ncer", "animations": ".nanr.lz11", "multi_cells": ".nmcr", "multi_animations": ".nmar",
              "info": ".bin"}


def battle_group(index, musical):
    """Returns a battle or musical sprite file's group and its slot in the group, or None where the file is the
    Substitute's or a form's palette. Past those come Paper White 2's form groups, in group order."""
    if not musical and index >= ADDED_FORM_FILES:
        group, slot = divmod(index - ADDED_FORM_FILES, GROUP_FILES)
        return GROUPS["battle"][1] + ORIGINAL_FORM_GROUPS + group, slot
    if index >= (14240 if musical else SUBSTITUTE_FILES):
        return None
    return divmod(index, GROUP_FILES)


def battle_file(root, index, musical):
    end = 14240 if musical else SUBSTITUTE_FILES
    if battle_group(index, musical) is None:
        palette_start = 14253 if musical else FORM_PALETTE_FILES
        if index >= palette_start:
            offset = index - palette_start
            folder = root / "arceus" / f"form_{offset // 2 + 1}"
            if musical:
                folder /= "musical"
            return folder / ("shiny.pal" if offset % 2 else "normal.pal"), "palette", None
        folder = root / "shared" / "substitute"
        if musical:
            folder /= "musical"
        name = SUBSTITUTE_SLOTS[index - end]
        if name == "normal":
            return folder / "normal.pal", "palette", None
        if name in ("front", "back"):
            # The musical copy's sheets are single 96 by 96 images, as the musical sprites' are
            return (folder / f"{name}_single.png" if musical else folder / f"{name}.png"), "char", {
                "single_cell": musical, "linear": not musical}
        return folder / (name + EXTENSIONS[name.split("_", 1)[1]]), "raw", None
    group, slot = battle_group(index, musical)
    folder = group_folder(root, group, "musical" if musical else "battle")
    name = SLOT_NAMES[slot]
    if slot in CHAR_SLOTS:
        return folder / f"{name}.png", "char", {
            "single_cell": slot in (0, 1, 9, 10), "linear": slot in (2, 3, 11, 12)}
    if slot in PALETTE_SLOTS:
        return folder / f"{name}.pal", "palette", None
    extension = {4: ".ncer", 5: ".nanr.lz11", 6: ".nmcr", 7: ".nmar",
                 13: ".ncer", 14: ".nanr.lz11", 15: ".nmcr", 16: ".nmar"}.get(slot, ".bin")
    return folder / f"{name}{extension}", "raw", None


@lru_cache(maxsize=1)
def icon_palettes():
    source = (ROOT / "src/system/poke_icon.c").read_text()
    table = source.split("static const u8 sPokeIconPalettes[] = {", 1)[1].split("};", 1)[0]
    return [int(value, 16) for value in re.findall(r"0x[0-9a-fA-F]+", table)]


# The icons' shared files (poke_icon.c): the palettes, the second the PC boxes', and the animations and cells for 1D
# OBJ mappings of 32K, 64K and 128K
ICON_FILES = ("icon_palettes.pal", "icon_palettes_box.pal", "icon_animations_32k.nanr", "icon_cells_32k.ncer",
              "icon_animations_64k.nanr", "icon_cells_64k.ncer", "icon_animations_128k.nanr", "icon_cells_128k.ncer")


def icon_file(root, index):
    if index < len(ICON_FILES):
        path = root / "shared" / ICON_FILES[index]
        return (path, "palette", None) if path.suffix == ".pal" else (path, "raw", None)
    group, female = divmod(index - len(ICON_FILES), 2)
    path = group_folder(root, group, "icons") / ("icon_female.png" if female else "icon.png")
    if group == national_species():
        # SPECIES_EGG's own icon, a copy of SPECIES_NONE's: an egg shows the egg's, icon.png (PokeParty_GetIconIndex)
        path = path.with_name("species_icon_female.png" if female else "species_icon.png")
    if group >= GROUPS["icons"][1] + ORIGINAL_FORM_GROUPS:
        # Paper White 2's forms: past sPokeIconPalettes' entries, so the bank is the one the icon is drawn in
        return path, "char", {"size": (32, 64), "palette_bank": icon_bank(root, path) if path.exists() else 0}
    palette_index = group if group < GROUPS["icons"][0] else group + 2
    table = icon_palettes()
    bank = (table[palette_index] >> (4 if female else 0)) & 15 if palette_index < len(table) else 0
    return path, "char", {"size": (32, 64), "palette_bank": bank}


def icon_bank(root, path):
    """Returns the bank of res/pokemon/shared/icon_palettes.pal whose colors an icon's PNG has at the indices that it
    draws with: an icon exported or copied from another keeps its bank's colors in its PNG's palette. Paper White 2's
    forms' icons have their banks so (tools/paperwhite2/pokemon_forms.py writes them for PokeIcon_GetPalette)."""
    _, _, pixels, png_colors = read_indexed_png(path)
    colors = read_palette(root / "shared" / ICON_FILES[0])
    used = sorted(set(pixels) - {0})
    for bank in range(len(colors) // 16):
        if all(i < len(png_colors) and i < 16 and color5(png_colors[i]) == color5(colors[bank * 16 + i])
               for i in used):
            return bank
    raise ValueError(f"{path}: its palette is none of shared/{ICON_FILES[0]}'s banks; draw it in one of them")


# The footprints' shared files (pokedex_info.c): the palette, then the animations and cells of the species up to
# Arceus, then those of the species from Victini
FOOTPRINT_FILES = ("footprint_palette.pal", "footprint_animations_old.nanr", "footprint_cells_old.ncer",
                   "footprint_animations.nanr", "footprint_cells.ncer")


def footprint_file(root, index, forms=False):
    if forms:
        species, form = FORM_FOOTPRINTS[index]
        return root / species / f"form_{form}" / "footprint.png", "char", {"size": (16, 32)}
    if index < len(FOOTPRINT_FILES):
        path = root / "shared" / FOOTPRINT_FILES[index]
        return (path, "palette", None) if path.suffix == ".pal" else (path, "raw", None)
    return root / species_names()[index - len(FOOTPRINT_FILES)] / "footprint.png", "char", {"size": (16, 32)}


def source_file(root, archive_name, index):
    kind = ARCHIVES[archive_name]
    if kind in ("battle", "musical"):
        return battle_file(root, index, kind == "musical")
    if kind == "icons":
        return icon_file(root, index)
    return footprint_file(root, index, kind == "footprint_forms")


def palette_member(kind, index):
    """Returns the file of a battle or musical sprite's palette: its group's normal.pal, or the Substitute's."""
    end = 14240 if kind == "musical" else SUBSTITUTE_FILES
    group = battle_group(index, kind == "musical")
    if group is None:
        return end + SUBSTITUTE_SLOTS.index("normal")
    return index - group[1] + SLOT_NAMES.index("normal")


def colors_for(root, archive_name, archive, index, options):
    kind = ARCHIVES[archive_name]
    if kind in ("battle", "musical"):
        return palette_colors(archive[palette_member(kind, index)])[:16]
    if kind == "icons":
        colors = palette_colors(archive[0])
        bank = options["palette_bank"]
        return colors[bank * 16:(bank + 1) * 16]
    if kind == "footprint_forms":
        archive = read_narc((EXTRACTED / "a/1/6/5").read_bytes())
    return palette_colors(archive[0])[:16]


def current_colors(root, archive_name, archive, index, options):
    """Returns the colors the game shows a sprite with: its palette's source file, as edited, or else the original's."""
    kind = ARCHIVES[archive_name]
    member, palette_archive = ((palette_member(kind, index), archive_name) if kind in ("battle", "musical") else
                               (0, "a/1/6/5") if kind == "footprint_forms" else (0, archive_name))
    path, source_kind, _ = source_file(root, palette_archive, member)
    if palette_archive == "a/0/5/1" and not path.exists() and path.parent.name == "musical":
        path = path.parent.parent / path.name
    if source_kind != "palette" or not path.exists():
        return colors_for(root, archive_name, archive, index, options)
    colors = read_palette(path)
    bank = options["palette_bank"] if kind == "icons" else 0
    return colors[bank * 16:(bank + 1) * 16]


def export(root):
    for archive_name in ARCHIVES:
        path = EXTRACTED / archive_name
        archive = read_narc(path.read_bytes())
        for index, blob in enumerate(archive):
            if not blob:
                continue
            target, kind, options = source_file(root, archive_name, index)
            target.parent.mkdir(parents=True, exist_ok=True)
            if kind == "raw":
                target.write_bytes(blob)
            elif kind == "palette":
                target.write_text(write_palette(palette_colors(blob)))
            else:
                width, height, pixels = character_pixels(blob, *(options.get("size", (None, None)) if options else
                                                          (None, None)),
                                                          single_cell=options.get("single_cell", False) if options else False,
                                                          linear=options.get("linear", False) if options else False)
                target.write_bytes(write_indexed_png(width, height, pixels,
                                                    colors_for(root, archive_name, archive, index, options)))
        print(f"{archive_name}: {len(archive)} entries", flush=True)
    musical = read_narc((EXTRACTED / "a/0/5/1").read_bytes())
    for index, blob in enumerate(musical):
        if not blob:
            continue
        path, _, _ = battle_file(root, index, True)
        if path.parent.name != "musical":
            continue
        shared = path.parent.parent / path.name
        if shared.is_file() and path.read_bytes() == shared.read_bytes():
            path.unlink()


def pack_file(root, archive_name, archive, index, original, path, kind, options):
    """Returns a file of the archive from its source, as the original file where they are the same: raw files as they
    are, palettes and images patched into the original's format."""
    if kind == "raw":
        return path.read_bytes()
    if kind == "palette":
        edited_colors = read_palette(path)
        original_colors = palette_colors(original)
        return (original if all(round(a * 31 / 255) == round(b * 31 / 255)
                                for left, right in zip(edited_colors, original_colors)
                                for a, b in zip(left, right)) and len(edited_colors) == len(original_colors)
                else patch_palette(original, edited_colors))
    width, height, pixels, png_colors = read_indexed_png(path)
    pixels = palette_indices(path, pixels, png_colors, current_colors(root, archive_name, archive, index, options))
    expected_width, expected_height, original_pixels = character_pixels(
        original, *(options.get("size", (None, None)) if options else (None, None)),
        single_cell=options.get("single_cell", False) if options else False,
        linear=options.get("linear", False) if options else False)
    if (width, height) != (expected_width, expected_height):
        raise ValueError(f"{path}: expected {expected_width} by {expected_height} pixels")
    return (original if pixels == original_pixels else
            patch_characters(original, width, height, pixels,
                             single_cell=options.get("single_cell", False) if options else False,
                             linear=options.get("linear", False) if options else False))


def pack(root, game, output):
    archive_name = Path(output).as_posix().split("/files/", 1)[-1]
    if archive_name not in ARCHIVES:
        raise ValueError(f"unexpected Pokémon graphics archive {archive_name}")
    global EXTRACTED
    EXTRACTED = ROOT / "extract" / {"black2": "b2_us", "white2": "w2_us"}[game] / "files"
    archive = read_narc((EXTRACTED / archive_name).read_bytes())
    result = []
    for index, original in enumerate(archive):
        path, kind, options = source_file(root, archive_name, index)
        if not original:
            # The game has no file here, such as a female sprite of a species that has none
            if path.exists():
                raise ValueError(f"{path}: the archive has no file for this, so it can't be packed")
            result.append(original)
            continue
        if archive_name == "a/0/5/1" and not path.exists() and path.parent.name == "musical":
            path = path.parent.parent / path.name
        result.append(pack_file(root, archive_name, archive, index, original, path, kind, options))
    # Paper White 2's form groups, after the archive's files: each file made from its source, in the format of its
    # species' own file of the same kind (the male's, the normal palette's), which it is where the two are the same
    added = added_form_groups() if ARCHIVES[archive_name] in ("battle", "icons") else 0
    if ARCHIVES[archive_name] == "battle" and added and len(result) != ADDED_FORM_FILES:
        raise ValueError(f"{archive_name} has {len(result)} files, not the {ADDED_FORM_FILES} that the hack's form "
                         "groups follow")
    for _ in range(added * (GROUP_FILES if ARCHIVES[archive_name] == "battle" else 2)):
        index = len(result)
        path, kind, options = source_file(root, archive_name, index)
        species = species_names().index(path.parent.parent.name if path.parent.name.startswith("form_") else
                                        path.parent.name)
        if ARCHIVES[archive_name] == "battle":
            slot = (index - ADDED_FORM_FILES) % GROUP_FILES
            template_slot = 18 if slot in PALETTE_SLOTS else slot - 1 if slot in (1, 3, 10, 12) else slot
            template = archive[species * GROUP_FILES + template_slot]
            optional = slot in (1, 3, 10, 12)
        else:
            template = archive[len(ICON_FILES) + species * 2]
            optional = (index - len(ICON_FILES)) % 2 == 1
        if not path.exists():
            if not optional:
                raise ValueError(f"{path}: missing, and the form's sprite group needs it")
            result.append(b"")
            continue
        result.append(pack_file(root, archive_name, archive, index, template, path, kind, options))
    target = Path(output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.unlink(missing_ok=True)
    target.write_bytes(write_narc(result))


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "extract":
        export(Path(sys.argv[2]))
    elif len(sys.argv) == 4 + len(ARCHIVES) and sys.argv[1] == "pack":
        for output in sys.argv[4:]:
            pack(Path(sys.argv[2]), sys.argv[3], output)
    else:
        raise SystemExit(__doc__)
