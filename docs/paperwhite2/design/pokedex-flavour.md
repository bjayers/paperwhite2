# Pokédex Flavour: the other games' entries (2026-11-11)

The Info page's Stats sub-page has a **Flavour** button, first in its column (Flavour, Turn, Cry, Form, Shiny,
Abilities, each shown only when it applies). It cycles the entry's description on the top screen through the other
games' Pokédex entries of the species, then back to White 2's own; a tab over the entry's panel names the game. The
Language button's job moved to **Select**. How it is wired: `docs/paperwhite2/plugins.md`, Pokédex (Flavour).

## Where the entries come from

Nothing extracted is committed. At build time (the hack build only), `tools/paperwhite2/dex_flavour.py` reads the
user's own US ROMs in `orig/` (ignored) and writes `build/w2_us/paperwhite2/dex_flavour.bin`, which
`pokedex_evo.py` packs as `ARCID_POKEDEX_GRA`'s member 166. A missing ROM is skipped, and with none the member has no
entries and the button never shows. Adding a ROM later needs `configure.py` to run again.

| Game | ROM | Bank | Format |
| --- | --- | --- | --- |
| Black | `dex_black.nds` | `a/0/0/2` 236 | Gen 5 (White 2's) |
| White | `dex_white.nds` | `a/0/0/2` 235 | Gen 5 |
| Black 2 | `dex_black2.nds` | `a/0/0/2` 442 | Gen 5 |
| Diamond | `dex_diamond.nds` | `msgdata/msg.narc` 615 | Gen 4 |
| Pearl | `dex_pearl.nds` | `msgdata/msg.narc` 616 | Gen 4 |
| Platinum | `dex_platinum.nds` | `msgdata/pl_msg.narc` 700 | Gen 4 |
| HeartGold | `dex_heartgold.nds` | `a/0/2/7` 803 | Gen 4 |
| SoulSilver | `dex_soulsilver.nds` | `a/0/2/7` 804 | Gen 4 |

Each ROM holds both versions' banks (and English ones for other languages' games), so the bank is named, and checked
by its size and Bulbasaur's entry. Black's and White's were told apart by the version mascots: in each game its own
mascot's entry begins "This Pokémon appears in legends." Gen 4's text is decrypted (per-entry keys) and converted from
Gen 4's character table to White 2's UTF-16, 0xE000 to White 2's new line, curly quotes to the straight ones White 2's
English entries use. HeartGold and SoulSilver write species' names in capitals ("MILOTIC"), as those games did; they
are kept as written.

## What is kept

An entry is kept when it differs from White 2's (`res/pokemon/*/data.json`, so the hack's own edits count), after
normalising line breaks and spaces; one with the same wording as an earlier game's is not kept again, and that entry
records both games (a bit each), which the tab's label names. Each kept entry must fit the text window as the page
draws it: 3 lines, each at most 222 px in font 0 (its own widths from `a/0/2/3`, as `GFL_FontGetLineWidth` adds them;
White 2's widest entry is exactly 222). One that doesn't is re-wrapped at its spaces, and one that still needs more
lines is left out and reported (`dex_flavour.py report`).

With all eight ROMs (`dex_flavour.py report`):

| Game | Read | Differ from White 2 | Kept | Same as an earlier game's |
| --- | --- | --- | --- | --- |
| Black | 649 | 310 | 310 | 0 |
| White | 649 | 310 | 156 | 154 |
| Black 2 | 649 | 0 | 0 | 0 |
| Diamond | 493 | 312 | 241 | 71 |
| Pearl | 493 | 313 | 156 | 157 |
| Platinum | 493 | 312 | 0 | 312 |
| HeartGold | 493 | 493 | 493 | 0 |
| SoulSilver | 493 | 493 | 258 | 235 |

1,614 entries in all; every species 1-649 has at least one (most have HeartGold's), at most 5. None needed
re-wrapping and none was left out. Black 2's entries are White 2's; Platinum's are Diamond's; Black and White share
Diamond's and Pearl's for 71 older species. The labels in use: Black, White, Pearl, HeartGold, SoulSilver, B/W,
D/Pt, D/P/Pt, HG/SS, B/W/D/P/Pt.

## The page

- **Flavour** (shown once the species is caught, when it has another game's entry; the entry's text shows only then):
  the next entry, White 2's after the last; it puts the entry back in the game's language, and replaces a shown
  ability. Data still shows the held items in the window, and the window's other states hide the tab; going back
  shows the chosen entry again. Another form keeps it; another Pokémon starts on White 2's.
- **Select**: the Pokédex's other languages, as Language did (only where it has the entry in another language), back
  to White 2's entry.
- **The tab**: the user's art, `res/paperwhite2/pokedex_art/version_flavour.png` (256 by 192, the tab at x 0-77,
  y 123-139, 16 colours in the top screen's art palette), converted at build time; the game's name in font 1 (the art's
  colour 4, shadow 9), from x 11 as the user's example, further left for a wide label so that it ends by x 64, before
  the stripes. Three main OBJs (32 by 32, x 0-95, y 120-151), main OBJ palette row 8; the label is drawn into their
  characters, which load in the VBlank that shows the entry's text, so the tab and the text change together.
- **Templates** (`dex_flavour.py template`, also from `pokedex_templates.py`, into `build/pokedex_templates/`):
  `version_flavour_canvas.png` (the art), `version_flavour_guide.png` (the OBJs' region in red, the label's in green),
  `version_flavour_reference_soulsilver.png` and `_shared.png` (the widest labels as the page draws them). A redrawn tab
  must keep its pixels inside the OBJs' region; the label's place is `TAB_TEXT_*` in both the tool and the C file.

## Possible later

- Gen 4's capitalised names could be written as White 2 writes them, if the user prefers.
- Forms: only species' entries are compared and shown (Gen 4 has no form entries in these banks).

## Looser matching (2026-11-11)

The user found entries kept for an added comma (Murkrow's B/W entry against White 2's) or a name in Gen 4's capitals
(Slowking's "SHELLDER" in D/P/Pt). `same_entry` now compares entries with case, punctuation and accents set aside, and
counts them the same when their words are at least `SAME_ENTRY` (95%) alike by difflib's ratio, both against White 2's
entry and between games. That left 1,582 entries (from 1,614): Black 304, White 156, Diamond 217, Pearl 156,
HeartGold 493, SoulSilver 256; Black 2 and Platinum add none of their own.
