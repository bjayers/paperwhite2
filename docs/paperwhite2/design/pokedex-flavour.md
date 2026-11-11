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

The games, in the order they came out, which is the order the page cycles through them and the order an entry that
games share is kept for (the first's):

| Game | ROM | Where | Format |
| --- | --- | --- | --- |
| Red, Blue, Yellow | `dex_red.gb`, `dex_blue.gb`, `dex_yellow.gb` | found from Bulbasaur's | Gen 1 (pokered, pokeyellow) |
| Gold, Silver, Crystal | `dex_gold.gbc`, `dex_silver.gbc`, `dex_crystal.gbc` | found from Bulbasaur's | Gen 2 (pokegold, pokecrystal) |
| Ruby, Sapphire, FireRed, LeafGreen, Emerald | `dex_ruby.gba` ... `dex_emerald.gba` | found from Bulbasaur's | Gen 3 (pokeruby, pokefirered, pokeemerald) |
| Diamond | `dex_diamond.nds` | `msgdata/msg.narc` 615 | Gen 4 |
| Pearl | `dex_pearl.nds` | `msgdata/msg.narc` 616 | Gen 4 |
| Platinum | `dex_platinum.nds` | `msgdata/pl_msg.narc` 700 | Gen 4 |
| HeartGold | `dex_heartgold.nds` | `a/0/2/7` 803 | Gen 4 |
| SoulSilver | `dex_soulsilver.nds` | `a/0/2/7` 804 | Gen 4 |
| Black | `dex_black.nds` | `a/0/0/2` 236 | Gen 5 (White 2's) |
| White | `dex_white.nds` | `a/0/0/2` 235 | Gen 5 |
| Black 2 | `dex_black2.nds` | `a/0/0/2` 442 | Gen 5 |

**The DS games**: each ROM holds both versions' banks (and English ones for other languages' games), so the bank is
named, and checked by its size and Bulbasaur's entry. Black's and White's were told apart by the version mascots: in
each game its own mascot's entry begins "This Pokémon appears in legends." Gen 4's text is decrypted (per-entry keys)
and converted from Gen 4's character table to White 2's UTF-16, 0xE000 to White 2's new line, curly quotes to the
straight ones White 2's English entries use. HeartGold and SoulSilver write species' names in capitals ("MILOTIC"),
as those games did; they are kept as written.

**The Game Boy and Game Boy Advance games** (`tools/paperwhite2/dex_flavour_gb.py`) are read in the community
disassemblies' formats, their entries found from Bulbasaur's record (its category "SEED", height and weight) rather
than at fixed offsets, so another revision reads too; each game's count is checked (151, 251, 386):

- Gen 1: `PokedexOrder` (found by its first numbers, Rhydon's 112 onwards) gives each internal species' Pokédex
  number; `PokedexEntryPointers` (found as the table whose Bulbasaur slot points to its record) each record; the
  record's far text command points to the description, which starts with 0x00 and ends with 0x5F, a full stop.
- Gen 2: `PokedexDataPointerTable` by Pokédex number; each quarter of the Pokédex (64 species) is in its own bank,
  Gold's and Silver's after Bulbasaur's, Crystal's elsewhere (the first bank where the whole quarter reads); the record
  has the two pages after the category, height and weight, each ending with "@".
- Gen 3: `gPokedexEntries` by national number (the species' internal order doesn't matter here), records of 0x24
  bytes with two description pointers (Ruby and Sapphire: two pages; FireRed and LeafGreen: the second empty) or of
  0x20 with one (Emerald).
- The charmaps are the disassemblies' (letters, digits, punctuation, Gen 1's and 2's `'d` `'s` ligatures, é); `#`
  (POKé) and `POKé` become Poké and `POKéMON` Pokémon as White 2 writes them, and species' names stay in capitals.
  Lines (and pages) are joined; a word the old games broke over two lines with a hyphen ("sur-" "roundings") is joined
  again, unless the entries write it with a hyphen and never without, or both halves are words and the whole isn't
  ("DNA-engineering", "needle-sharp"); 337 broken words in all, `dex_flavour.py report` lists them.

## What is kept

An entry is kept when it differs from White 2's (`res/pokemon/*/data.json`, so the hack's own edits count); one that
says the same as an earlier game's is not kept again, and that entry records both games (a bit each, 32-bit), which
the tab's label names. Two entries are the same when, with case, punctuation and accents set aside, their words are at
least 95% alike by difflib's ratio (`same_entry`, `SAME_ENTRY`), both against White 2's entry and between games.

Each kept entry must fit the text window as the page draws it: 3 lines, each at most 222 px in font 0 (its own widths
from `a/0/2/3`, as `GFL_FontGetLineWidth` adds them; White 2's widest entry is exactly 222), as written or wrapped at
its spaces (the older games' always are, their lines being narrower). **One that doesn't fit is drawn in font 1**, the
small font, 5 lines of 222 px measured in its widths, which the entry's flag says. Font 1's glyphs and their shadow are
8 of its 10 rows; drawn 2 px lower than font 0's text (their tops level with font 0's), at its line feed (10) only 4
lines end inside the box (the window's dark rows: its last 2 are the art's border), which would leave out 151 of Ruby's
and Sapphire's two-page entries, so the lines are 9 px apart, with a blank row between one line's shadow and the next
line's glyphs. An entry that fits neither is left out and reported (`dex_flavour.py report`); with all the ROMs, none.

With all nineteen ROMs (`dex_flavour.py report`):

| Game | Read | Differ from White 2 | Kept | Same as an earlier game's | Small font | Left out |
| --- | --- | --- | --- | --- | --- | --- |
| Red | 151 | 151 | 151 | 0 | 0 | 0 |
| Blue | 151 | 151 | 0 | 151 | 0 | 0 |
| Yellow | 151 | 151 | 151 | 0 | 0 | 0 |
| Gold | 251 | 251 | 251 | 0 | 0 | 0 |
| Silver | 251 | 251 | 251 | 0 | 0 | 0 |
| Crystal | 251 | 251 | 251 | 0 | 0 | 0 |
| Ruby | 386 | 386 | 386 | 0 | 386 | 0 |
| Sapphire | 386 | 386 | 202 | 184 | 202 | 0 |
| FireRed | 386 | 386 | 296 | 90 | 4 | 0 |
| LeafGreen | 386 | 386 | 84 | 302 | 0 | 0 |
| Emerald | 386 | 386 | 377 | 9 | 377 | 0 |
| Diamond | 493 | 289 | 289 | 0 | 0 | 0 |
| Pearl | 493 | 291 | 156 | 135 | 0 | 0 |
| Platinum | 493 | 289 | 0 | 289 | 0 | 0 |
| HeartGold | 493 | 493 | 279 | 214 | 0 | 0 |
| SoulSilver | 493 | 493 | 29 | 464 | 0 | 0 |
| Black | 649 | 304 | 232 | 72 | 0 | 0 |
| White | 649 | 304 | 156 | 148 | 0 | 0 |
| Black 2 | 649 | 0 | 0 | 0 | 0 | 0 |

3,541 entries in all (969 in the small font), 864,942 bytes; every species 1-649 has at least one, at most 13.
Blue's entries are Red's; Black 2's are White 2's; Platinum's are Diamond's; HeartGold
and SoulSilver often repeat Gold's and Silver's, LeafGreen Red's and Blue's.

## The page

- **Flavour** (shown once the species is caught, when it has another game's entry; the entry's text shows only then):
  the next entry, White 2's after the last; it puts the entry back in the game's language, and replaces a shown
  ability. Data still shows the held items in the window, and the window's other states hide the tab; going back
  shows the chosen entry again. Another form keeps it; another Pokémon starts on White 2's.
- **Select**: the Pokédex's other languages, as Language did (only where it has the entry in another language), back
  to White 2's entry.
- **The tab**: the user's art, `res/paperwhite2/pokedex_art/version_flavour.png` (256 by 192, the tab at x 0-111,
  y 123-139, its 16 colours, palette slots 3, 10, 11, 14 and 15 drawn), converted at build time, as four main OBJs
  (32 by 32, x 0-127, y 120-151) in main OBJ row 8. **The label** is on three OBJs of its own in front of those
  (x 0-95), in row 13, its own palette: the shadow and the games' colours (below). It is the game's name in font 1, or
  for an entry games share their short names 2 px apart (no separator), each game in its colour, from x 11 as the
  user's example, further left for a wide label so that it ends by x 89 (4 px before the art's stripes, which start at
  x 93 on the label's rows; `dex_flavour.py` checks the art is plain there), never left of x 2. The label's characters
  load in the VBlank that shows the entry's text, so the tab and the text change together, and both rows' colours with
  them (Area's map, which hides the tab, uses row 13 while it is open).
- **Templates** (`dex_flavour.py template`, also from `pokedex_templates.py`, into `build/pokedex_templates/`):
  `version_flavour_canvas.png` (the art), `version_flavour_guide.png` (the OBJs' region in red, the label's in green),
  `version_flavour_reference_soulsilver.png` and `_shared.png` (the widest labels as the page draws them, "SoulSilver"
  and "D P Pt B W"). A redrawn tab must keep its pixels inside the OBJs' region and the label's place plain; the
  label's place is `TAB_TEXT_*` in both the tool and the C file.

### The labels' colours and short names

The label's palette row has 15 colours: the shadow (40, 40, 48) and 14 for 18 games (Black 2 never shows: its entries
are White 2's). Games share a colour only where their names tell them apart and no label puts them side by side
(`dex_flavour.py report` names any side by side): Gold and HeartGold, and Silver and SoulSilver, are side by side in
"G HG" and "S SS" (HeartGold and SoulSilver repeat Gold's and Silver's entries), so each pair is two shades.

| Game | Short name | Colour | Shares it with |
| --- | --- | --- | --- |
| Red | R | red (232, 56, 48) | FireRed |
| Blue | B | blue (64, 144, 248) | Diamond |
| Yellow | Y | yellow (248, 216, 48) | HeartGold |
| Gold | G | dark gold (200, 144, 32) | |
| Silver | S | silver-grey (152, 160, 176) | |
| Crystal | C | cyan (88, 216, 232) | |
| Ruby | Ru | ruby (224, 48, 104) | |
| Sapphire | Sa | sapphire (96, 96, 240) | |
| FireRed | FR | red | Red |
| LeafGreen | LG | green (64, 200, 80) | Emerald |
| Emerald | E | green | LeafGreen |
| Diamond | D | blue | Blue |
| Pearl | P | pink (248, 136, 192) | |
| Platinum | Pt | lavender (192, 176, 232) | |
| HeartGold | HG | bright gold (yellow) | Yellow |
| SoulSilver | SS | light silver (216, 220, 232) | |
| Black | B | dark grey (112, 112, 120) | Black 2 |
| White | W | white (248, 248, 248) | |

The labels in use, widest first (font 1, the room is 87 px): SoulSilver 46, LeafGreen 45, HeartGold 44, D P Pt B W 38,
Sapphire 38, Crystal, Emerald, FireRed, Ru Sa E, G LG HG, S FR SS, Yellow, Silver, R B LG, Pearl, D P Pt, Black, White,
Ru Sa, FR SS, LG HG, FR LG, HG SS, Ruby, Gold, G HG, S SS, D Pt, G LG, S FR, R B, B W. None needed shortening.

## Possible later

- Gen 4's capitalised names could be written as White 2 writes them, if the user prefers.
- Forms: only species' entries are compared and shown (no form entries in these banks).

## History

- 2026-11-11, first version: Black, White, Black 2, Diamond, Pearl, Platinum, HeartGold and SoulSilver; exact
  comparison; the label drawn into the tab's three OBJs with "/" between short names.
- 2026-11-11, looser matching: the user found entries kept for an added comma (Murkrow's B/W entry against White 2's)
  or a name in Gen 4's capitals (Slowking's "SHELLDER" in D/P/Pt); `same_entry` came in.
- 2026-11-11, the Game Boy and Game Boy Advance games, the order by release, the small font for long entries (member
  format version 2: a version word first, 32-bit game masks, a flags word), the user's wider tab on four OBJs and the
  label on OBJs and a palette of its own, without separators.
