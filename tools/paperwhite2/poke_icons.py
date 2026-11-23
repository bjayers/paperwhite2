#!/usr/bin/env python3
"""Paper White 2: party/box icons on their own battle palettes (docs/paperwhite2/design/icon-screens.md), packed into
the icon archive (ARCID_POKEICON, a/0/0/7) at build time from the files the Sprite Editor writes
(tools/paperwhite2/sprite_edit.py): res/pokemon/<group>/icon_battle.png and icon_battle.json (icon_female_battle.* for
a female icon, form_<n>/ for a form and for Arceus' palette-only forms), on the group's normal.pal and shiny.pal.

    poke_icons.py archive IN OUT        # the build: IN, the archive pokemon_graphics.py packed from the vanilla icons

What OUT has (include/paperwhite2/icon_palettes.h reads it):
- the archive's own members, each icon that has an icon_battle.png redrawn from it in its shared bank (the fallback
  for screens that still load the three banks): each slot takes the bank index that the vanilla icon has at the slot's
  pixels (the most common one; a pixel keeps its vanilla index where that index covers at least a quarter of its
  slot's pixels, so an unedited icon stays as it was), and a slot with no vanilla pixels under it the bank's nearest
  colour;
- after them, one member of 64 bytes per entry: the icon's 16 normal colours, then its 16 shiny ones, RGB555. Index 0
  is the battle palette's colour 0 (transparent), 1-13 the slots' colours, unused slots colour 0, 14-15 the greys;
- then one member per entry, the icon's characters on its slots, in the format of its own file.
An entry is an icon file from the archive's 8th (its shared files come first), then each palette-only form in its
forms.sprite_offset + form - 1 order. Eggs, the egg species' placeholder, and icons without icon_battle.png keep their
vanilla pixels, with their bank's colours for normal and shiny alike; an empty member (no female icon) has an empty
entry and zero colours.

When res/paperwhite2/icon_tone.json says "enabled": true, each battle-palette icon's normal and shiny colours are
toned toward the vanilla banks' lightness and chroma (tools/paperwhite2/icon_tone.py; the greys and transparency
untouched). The fallback pixels are picked from the untoned colours either way.
"""
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools" / "data"))
from tools.data import pokemon_graphics as graphics  # noqa: E402
from tools.data.form_groups import ORIGINAL_FORM_GROUPS, palette_form_groups  # noqa: E402
from tools.data.narc import read_narc, write_narc  # noqa: E402
from tools.data.nitro_2d import (character_pixels, color5, patch_characters, read_indexed_png,  # noqa: E402
                                 read_palette)
from tools.paperwhite2 import icon_tone  # noqa: E402

POKEMON = ROOT / "res" / "pokemon"
FIRST_FILE = len(graphics.ICON_FILES)
SIZE = (32, 64)
COLOURS = 16
SLOTS = 13


def hex_colour(text: str) -> tuple:
    return tuple(int(text[i:i + 2], 16) for i in (1, 3, 5))


def rgb555(colours) -> bytes:
    if len(colours) != COLOURS:
        raise ValueError(f"{len(colours)} colours, not {COLOURS}")
    return b"".join(struct.pack("<H", r | g << 5 | b << 10) for r, g, b in map(color5, colours))


def icon_colours(slots, greys, palette) -> list:
    """The 16 colours of an icon on a battle palette: colour 0, the slots' colours, colour 0 for the unused ones, the
    greys."""
    if len(slots) > SLOTS or len(greys) != 2:
        raise ValueError(f"{len(slots)} slots and {len(greys)} greys, at most {SLOTS} and 2")
    colours = [palette[0]] + [palette[s] for s in slots] + [palette[0]] * (SLOTS - len(slots))
    return colours + [hex_colour(g) if isinstance(g, str) else tuple(g) for g in greys]


def entry(battle: bytes, slots, greys, normal, shiny, vanilla: bytes, bank: list):
    """An icon's (fallback pixels, normal colours, shiny colours) from its icon_battle files and vanilla pixels."""
    if len(battle) != SIZE[0] * SIZE[1]:
        raise ValueError(f"{len(battle)} pixels, not {SIZE[0]}x{SIZE[1]}")
    for p in set(battle) - {0, 14, 15}:
        if p > len(slots):
            raise ValueError(f"a pixel's index {p} is past the {len(slots)} slots")
    normal_colours = icon_colours(slots, greys, normal)
    nearest_of = {}

    def closest(s):
        if s not in nearest_of:
            colour = color5(normal_colours[s])
            nearest_of[s] = min(range(1, COLOURS), key=lambda i: (sum((a - b) ** 2 for a, b in
                                                                      zip(colour, color5(bank[i]))), i))
        return nearest_of[s]

    counts = {}
    for s, v in zip(battle, vanilla):
        if s and v:
            counts.setdefault(s, {}).setdefault(v, 0)
            counts[s][v] += 1
    majority = {s: max(sorted(c), key=lambda v: c[v]) for s, c in counts.items()}
    pixels = bytearray()
    for s, v in zip(battle, vanilla):
        if not s:
            pixels.append(0)
        elif s not in counts:
            pixels.append(closest(s))
        elif v and counts[s].get(v, 0) * 4 >= sum(counts[s].values()):
            pixels.append(v)
        else:
            pixels.append(majority[s])
    return bytes(pixels), normal_colours, icon_colours(slots, greys, shiny)


def read_battle_icon(png: Path):
    """An icon_battle.png's pixels and its JSON's slots and greys."""
    width, height, pixels, _ = read_indexed_png(png)
    if (width, height) != SIZE:
        raise ValueError(f"{png}: {width}x{height}, not {SIZE[0]}x{SIZE[1]}")
    data = json.loads(png.with_suffix(".json").read_text())
    return pixels, data["slots"], data["greys"]


def battle_palettes(folder: Path):
    """A group folder's normal.pal and shiny.pal, its species' where a form has none."""
    for d in (folder, folder.parent):
        if (d / "normal.pal").is_file():
            return read_palette(d / "normal.pal"), read_palette(d / "shiny.pal")
    raise ValueError(f"{folder}: no normal.pal for its icon_battle.png")


def battle_png(icon: Path) -> Path:
    return icon.with_name(icon.stem + "_battle.png")


def is_egg(index: int) -> bool:
    """Whether an icon file is an egg's (the egg, Manaphy's egg) or SPECIES_EGG's placeholder: they keep their art."""
    group = (index - FIRST_FILE) // 2
    return group in (graphics.GROUPS["icons"][0], graphics.GROUPS["icons"][0] + 1) or group == graphics.national_species()


def icon_count() -> int:
    """The archive's members before the hack's: PAPERWHITE2_SPECIES_ICON_FILES + the added species' two each."""
    return (FIRST_FILE + (graphics.GROUPS["icons"][1] + ORIGINAL_FORM_GROUPS + graphics.added_form_groups()) * 2 +
            len(graphics.added_species()) * 2)


def toned_colours(pixels, normal_colours, shiny_colours, tone):
    """An icon's 64 bytes of normal and shiny colours, toned when tone (icon_tone.json's parameters) is given."""
    if tone is not None:
        counts = icon_tone.pixel_counts(pixels)
        normal_colours = icon_tone.tone(normal_colours, counts, tone)
        shiny_colours = icon_tone.tone(shiny_colours, counts, tone)
    return rgb555(normal_colours) + rgb555(shiny_colours)


def archive(source: Path, output: Path, root: Path = POKEMON, tone_file: Path = icon_tone.TONE_FILE):
    graphics.EXTRACTED = ROOT / "extract" / "w2_us" / "files"
    tone = icon_tone.load(tone_file)
    tone = tone if tone["enabled"] else None
    files = read_narc(source.read_bytes())
    if len(files) != icon_count():
        raise ValueError(f"{source}: {len(files)} members, not the {icon_count()} that icon_palettes.h's "
                         "ICON_BATTLE_PALETTES_MEMBER expects")
    banks = read_palette(root / "shared" / graphics.ICON_FILES[0])
    palettes = []
    chars = []
    for index in range(FIRST_FILE, len(files)):
        blob = files[index]
        if not blob:
            palettes.append(bytes(COLOURS * 4))
            chars.append(b"")
            continue
        path, _, options = graphics.icon_file(root, index)
        bank = banks[options["palette_bank"] * COLOURS:(options["palette_bank"] + 1) * COLOURS]
        png = battle_png(path)
        if is_egg(index) or not png.is_file():
            palettes.append(rgb555(bank) * 2)
            chars.append(blob)
            continue
        try:
            battle, slots, greys = read_battle_icon(png)
            normal, shiny = battle_palettes(path.parent)
            vanilla = bytes(character_pixels(blob, *SIZE)[2])
            fallback, normal_colours, shiny_colours = entry(battle, slots, greys, normal, shiny, vanilla, bank)
        except (ValueError, KeyError, IndexError) as error:
            raise ValueError(f"{png}: {error}") from error
        files[index] = blob if fallback == vanilla else patch_characters(blob, *SIZE, fallback)
        palettes.append(toned_colours(battle, normal_colours, shiny_colours, tone))
        chars.append(patch_characters(blob, *SIZE, battle))
    # The palette-only forms: their own pixels and colours, in the format of their species' icon
    names = graphics.species_names()
    for _, (species, form) in sorted(palette_form_groups(root).items()):
        base = FIRST_FILE + names.index(species) * 2
        folder = root / species / f"form_{form}"
        png = folder / "icon_battle.png"
        if not png.is_file():
            palettes.append(palettes[base - FIRST_FILE])
            chars.append(chars[base - FIRST_FILE])
            continue
        try:
            battle, slots, greys = read_battle_icon(png)
            normal, shiny = battle_palettes(folder)
        except (ValueError, KeyError, IndexError) as error:
            raise ValueError(f"{png}: {error}") from error
        palettes.append(toned_colours(battle, icon_colours(slots, greys, normal), icon_colours(slots, greys, shiny),
                                      tone))
        chars.append(patch_characters(files[base], *SIZE, battle))
    files += [b"".join(palettes), *chars]
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(write_narc(files))


def main():
    args = sys.argv[1:]
    try:
        if args[:1] == ["archive"] and len(args) == 3:
            archive(Path(args[1]), Path(args[2]))
        else:
            sys.exit(__doc__)
    except ValueError as error:
        sys.exit(f"poke_icons.py: {error}")


if __name__ == "__main__":
    main()
