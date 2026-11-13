# New species

Research and design for adding whole new Pokémon to Paper White 2 from the editor ("Add Pokémon"). The first are
Applin and its line (Applin, Flapple, Appletun, Dipplin, Hydrapple); later the user's own creatures, a few post-Gen-5
favourites, and uncatchable "nightmare" creatures for a future roguelike. Each new species gets full support:
- battle sprites through the art import and the Rig Editor, an icon, a follower and a cry;
- a Pokédex entry with a display number (Applin shows #840, an original "???" or a chosen number);
- learnsets and evolutions (form-conditioned ones too), encounters and trainers;
- the Wonder Trade pool (in it unless switched off) and the save.

This builds on [forms-and-species.md](forms-and-species.md) (§3 tables, §6 the first look at new species, §11 forms
as built, §12 display numbers), [save-expansion.md](save-expansion.md) §11, [form-evolutions.md](form-evolutions.md)
§12 and [battle-sprites.md](battle-sprites.md) §14-19, and doesn't repeat them.

**Evidence.** Everything was read from the source, the packers, `generated/`, `res/`, and the extracted and built
White 2 archives (`extract/w2_us/files`, `build/w2_us/files`, member counts measured). What is inferred and not traced
is marked *(inferred)*. Line numbers are from commit `1140b983ba`.

## 1. Summary

- **Recommended ID range: new species from 687, appended after the Pokéstar IDs; the egg and Pokéstar IDs stay where
  they are.** Max 1023, so up to 337 new species (§2).
  - IDs 685 and 686 stay reserved: the game already treats them as the egg and the Manaphy egg in four tables (§2.2).
  - The ceiling of 1023 comes from 10-bit species fields: the Pokédex search, its sort orders, Join Avenue and icon
    packing. The save holds 1504.
  - The cry gap 691-999 gives 309 new cries before cries need wave-archive slots past the sound archive's end.
- **Why not move the egg and Pokéstar IDs to the end** (what White2Upgrade did, §11):
  - In the decomp, `generated/species.txt` is shared with the plain matching build. Renumbering `SPECIES_EGG`
    changes compiled code everywhere, and the plain build's module checks would fail.
  - It also means ~24 numeric 650/651/652 literals, the Pokéstar `- 488` and `species - 2` rules, the musical's BW1
    layout, and records that store 650 (Join Avenue, the trade record).
  - Appending changes no existing constant. The only cost is that the Pokédex is no longer contiguous, and the
    display-number design (§12 of forms-and-species) already separates the shown number from the ID.
- **What the work is.** Every packer and most C lookups place egg, Pokéstar or form data right after ID 684. So:
  - The **packers lay the hack's groups out after the original ones**: new species' records and text lines at their
    IDs, the form records, form text slots, sprite, icon and cry groups pushed after them. All of this is computed
    from `res/` and none needs a hand-kept index. Each packer is proven byte-identical when no species is added.
  - **About 15 C sites** get one generated predicate, `PaperWhite2_IsAddedSpecies` / `PML_IsRealSpecies`, and
    generated bases.
  - About **35 places in tools, C and the editor** that say "before `SPECIES_EGG`" or "≤ Genesect" get one shared
    definition of "the Pokédex species": 1-649 and 687 to the last.
- **Biggest risks:**
  - **(a)** A follower row for a species above `FOLLOWING_MAX_SPECIES` disables the whole follower registry.
  - **(b)** `scrcmd_leaves.c:421` turns any party Pokémon above Genesect into a bad egg.
  - **(c)** The battle regulation's `bannedSpecies[0x52]` is read past its end for IDs ≥ 656 (PWT, Battle Subway).
  - **(d)** Display numbers over 999: Dipplin is 1011 and Hydrapple 1019, but every number is printed with 3 digits.
  - **(e)** The Applin line needs Gen 8/9 items, moves and abilities that Gen 5 lacks (§9).
- **Build order** (§10):
  1. packers that append, byte-identical with none added;
  2. one test species in game;
  3. the Pokédex numbering;
  4. Add Pokémon in the editor;
  5. followers, encounters and the Wonder Trade;
  6. the Applin line.

## 2. The species ID range

### 2.1 Today (verified)

`generated/species.txt` (686 lines: a header and 0-684):

| IDs | What | Stored in a save? |
| --- | --- | --- |
| 0 | `SPECIES_NONE` | |
| 1-649 | Bulbasaur to Genesect | yes |
| 650 | `SPECIES_EGG` | **No.** An egg keeps its real species plus `PkmBlockB.isEgg` (`include/pml/poke_party.h:85`). 650 is only returned by the getters (`PKM_PARAM_LEGAL_SPECIES`, and `PKM_PARAM_SPECIES` for a bad egg, `poke_tool.c:1529-1545`). It is stored only outside the box: Join Avenue's profile (`resonance_resort_data.c:486`, `JOIN_AVE_SPECIES_EGG`) and the trade record (`pokemontrade_save.c:222`) |
| 651 | `SPECIES_BAD_EGG` | **No.** A bad egg is `BoxPkm.badEgg` (`poke_party.h:24`), set when the checksum fails (`poke_tool.c:1427-1438`); the getters then return 650. 651 is only a name, icon and Easy Chat word index |
| 652-684 | the 33 Pokéstar Studios props (`SPECIES_POKESTAR_*`, `res/pokemon/pokestar/`) | no (the studio's movies only) |

After 684, each archive continues with something else:

| Archive | Index of species `s` | What follows 684 | Count (W2) |
| --- | --- | --- | --- |
| personal `a/0/1/6`, learnsets `a/0/1/8`, evolutions `a/0/1/9` | `s` (`PML_PersonalGetDatID`, `poke_personal.c:193`; egg and bad egg read record 0) | the form records 685-708, then the Unova table (the hack reads the last file) | 710 / 709 / 709 |
| babies `a/0/2/0`, cry volumes `a/1/9/1` | `s` | end of archive | 685 |
| egg moves `a/1/2/4` | `s`, national species only | end | 650 |
| battle sprites `a/0/0/4` | group `s` for `s` ≤ 651, `s - 2` above (`pokegra.c:314`) | groups 683-684 are the eggs (= species 685/686 by `s - 2`), form groups 685-750, Substitute, Arceus palettes, then the hack's form groups from 15,065 | 15,065 (15,085 built) |
| icons `a/0/0/7` | `8 + 2s` (`poke_icon.c:116`) | groups 683-684 the eggs, forms from 685, the hack's forms at the end | 1,510 (1,512) |
| icon palettes `sPokeIconPalettes` | `s` (756 bytes) | 685-686 the eggs, forms from 686 + offset | |
| names `a/0/0/2` 90 (and upper, with article) | `s` | **685-686 are "Egg", "Egg"** (`SpeciesNames_Text_Egg_2/_3`) | |
| Pokédex text 442, 451, 471, 450, 464 | `s` | 650 empty, then the form slots from 651 | |
| cries (sound archive) | wave archive `s` (`getResIDFunc`, `pm_voice.c:515`), cry 1 above 684 | 685-690 the six form cries, 691-999 free, music from 1000 | |
| footprints `a/1/6/5` | `s + 5` (`pokedex_info.c:2034`) | end | 655 |
| area maps `a/1/7/6` | `s - 1` (`pokedex_detail_map.c:2128`) | end | 684 |
| musical `a/0/5/1` + BW1 personal `a/3/0/2` | Black and White's layout: `s`, egg 650, forms 652+ (`musical_mcss.c:720`) | BW1's eggs and forms | 14,285 / 669 |
| Pokédex search `a/0/9/7` | files 1-2 by `s`, file 0 a chain by `s` and slot | slots from 651 | |

### 2.2 Why the first new ID is 687

IDs 685 and 686 are already "the egg" and "Manaphy's egg" by Game Freak's own index rules:
- sprites by `species - 2` reach the egg groups 683 and 684;
- the icon palette table has the eggs at 685 and 686 (`POKEICON_PALETTE_EGG 685`);
- the names bank has "Egg" at lines 685 and 686;
- 686 is a sentinel in two places:
  - `PERSONAL_CACHE_NONE 686` (`poke_tool.c:35`): the personal cache's "empty" species. A real species 686 would get
    whatever the cache holds on its first load;
  - `scrcmd_entree_forest.c:240` writes 686 into the 11-bit species field as "no Pokémon".
- Wireless code also treats 686 as one past the last (`pokemontrade_proc.c:834`, `br_bvrank_proc.c`, `gds_profile.c`,
  and the regulation's 686).

Starting at 687 avoids every one of these without touching them. 685 and 686 get placeholder records (copies of
`egg/`'s record, no Pokédex entry, no text change), as the Pokéstar species have. Two IDs is cheap, compared with
finding every reader of names 685/686. A symbol search found none, but a numeric read can't be ruled out.

### 2.3 The ceiling

| Field | Width | Max ID |
| --- | --- | --- |
| Pokédex search entries and the height/weight orders (`form << 10 \| species`, `pokedex_search_engine.c:25`, `a/0/9/7` 6-9) | 10 bits | **1023** |
| Join Avenue (`include/save/join_avenue.h:154`) | 10 bits | 1023 |
| Icon packing (`PokeIcon_PackSpecies`, Pokéstar records only) | 10 bits | 1023 |
| Wild slots, Battle Subway, Entree Forest, conditions, the form directory | 11 bits | 2047 |
| Hack's Pokédex save area | `species - 1` bits | 1504 |
| Evolution family, Wonder Trade pre-evolutions (`<< 11` form) | 11 bits | 2047 |
| Box data, trainers, facilities, trades, battle | u16 / 14 bits | — |
| Cries in the 691-999 gap | | 309 species (more past the archive's end, §3.6) |

So **687 to 1023: 337 new species.** Widening the 10-bit Pokédex fields would lift this, but nothing planned needs it.

### 2.4 The rejected alternative (b): move egg and Pokéstar to the end

New species at 650+ would keep the National Pokédex contiguous, and the text banks would grow naturally. But:
- **The plain build:** `generated/species.txt` and `res/` are shared by both builds. Changing `SPECIES_EGG`'s value
  changes the code of every user of `SPECIES_EGG` and the Pokéstar constants, so the plain build's modules no longer
  match. It would need a per-build species list, generated headers and packers that differ by build: a second
  source of truth.
- **Literals and rules:** the ~24 numeric 650/651/652 literals; `POKE_VOICE_DIRECT_MIN 652`; the Pokéstar cast's
  `species - 488` (`event_pokewood.c:54-56`); `species - 2` (`pokegra.c:316`); the PMS words; the musical's BW1
  egg at 650. A missed literal silently swaps a new species for the egg.
- **Saves:** Join Avenue profiles and trade records store 650 as "egg"; after a move they read as the new species.
- **What it would buy is now free:** contiguous numbers matter only for the shown number, and §12 separates it.

## 3. Every table keyed by species: what appending changes

"Pad" means entries for 650-686 that nothing reads (copies of a harmless entry). "Computed" means the packer derives
it from `res/` with no hand-kept index.

### 3.1 The one definition everything uses

Today, about 35 tools and C sites define "the Pokédex species" as "before `SPECIES_EGG`" (`national_species()` in
`form_groups.py:54`, `pokemon_graphics.py:68`, `species_data.py:302`, `pokedex_data.py:47`, `text_sources.py:56`)
or as "≤ `SPECIES_GENESECT`". Replace them with one module, `tools/data/species_list.py`:
- `pokedex_species()`: 1-649 and 687..last, in ID order;
- `added_species()`: 687..last;
- `FIRST_ADDED = 687`, `last_species()`.

`pokemon_forms.py` generates the C side into `paperwhite2/pokemon_forms_config.h` (hack build only):
- `PAPERWHITE2_SPECIES_FIRST_ADDED 687` and `PAPERWHITE2_SPECIES_LAST`;
- `POKEDEX_SPECIES_MAX` = `PAPERWHITE2_SPECIES_LAST`;
- an inline `PML_IsRealSpecies(s)` (1-649, or 687 to the last).

**A trap the sweep found:** a tool that raises its bound to "the last species" without the predicate meets
650-686, whose folders are `pokestar/<name>`, `egg/` and `bad_egg/`. For example `pokemon_center.py:119,208` build
`res/pokemon/<constant>/` and would crash. Every loop must use `pokedex_species()`.

### 3.2 Pokémon data (`species_data.py`)

| Data | Change |
| --- | --- |
| Personal, learnsets, evolutions | Records in `species.txt` order, so new species land at their IDs, and `forms.json`'s records follow; `formFile` is computed (`record_files`). Add records 685/686 (pads). `PERSONAL_FILE_REGIONAL_DEX`: the hack already reads the archive's last file (`poke_personal.c:168`). `index < national` checks become `pokedex_species()`. **Computed** |
| Babies `a/0/2/0` | Already one per species record (`with_babies`); new species append |
| Egg moves `a/1/2/4` | Pad 650-686 with empty entries, then new species. `day_care.c:1058, 1085` (`species >= / < SPECIES_GENESECT`) must accept added species, or new species' eggs hatch as themselves and get no egg TM moves. Under the same `#ifdef`, fix the off-by-one for Genesect (a `// BUG:` candidate, forms-and-species §6.1) |
| TM and tutor bits | In the record |
| Cry volume `a/1/9/1` | Indexed by species, so new entries append; `pokemon_cries.py pack` iterates the original's 685 entries and must append. Pads for 685/686 |
| `PML_PersonalGetDatID` | No change: a species' own record is its ID. `PERSONAL_CACHE_NONE` is safe because 686 is never a real species |

### 3.3 Text (`a/0/0/2`, `text_sources.py`)

| Bank | Today | New layout |
| --- | --- | --- |
| Names 90, upper, with article 483 | `\from{species.name}` (0-649), then Egg, Bad Egg, 33 Pokéstar, Egg, Egg | Unchanged up to 686, then `\from{added_species.name}` (687+). The upper names feed Easy Chat only up to Bad Egg (`pms_words.py:27`), so **new species get no Easy Chat word and no word ID moves** |
| Categories 464 | 650 lines | 0-649, empty 650-686, added species |
| Entries 442, heights 451, weights 471, form names 450 | species, one empty line, form slots from 651 | 0-649, empty 650-686, added species, one empty line, then the form slots from `last + 2` |
| Other languages | to 493 | none for new species (the Info page offers languages the save has, 1-649) |

The form slots' numbers live in `a/0/9/7` file 0, which `pokedex_data.py` already generates "from 651" (§11.2 of
forms-and-species). It takes the slot base from `species_list`. **No C hard-codes 651** (grep of the Pokédex
overlays and the hack's code), since every reader goes through the chain. A new `\from` source, `added_species`,
plus a padding directive (or a `pokedex_species` source that emits the empty line for 650-686), is the
`text_sources.py` change.

The Gen 5 name limit is 10 characters (the box data's nickname). The tool checks it.

### 3.4 The Pokédex app's data (`a/0/9/7`, `pokedex_data.py`)

| File | Change |
| --- | --- |
| 0 next-form chain, 2 shapes | Indexed by species, then by slot. Grows to `last + 1 + slots`. Computed |
| 1 initials (650 B by species) | Generated from the English names' first letter: verified byte-identical to the original, then extended. *(The mapping of letters to the original's group numbers must be read from file 1 and checked.)* |
| 3 | 1 to 649, copied. *(Its reader isn't traced.)* |
| 4 national order (649 u16) | 1-649, then the added species in display order (§5) |
| 5 alphabetical (649 u16) | Sorted by name. The generator must first reproduce the original order. **`box_search.c:390-399`**'s group start and end tables index into it, so they become a generated table under `#ifdef PAPERWHITE2`. `worldtrade_deposit.c` is the GTS (wireless) |
| 6-9 height and weight orders | Every Pokédex species and form (computed already) |

### 3.5 Graphics (`pokemon_graphics.py`, `form_groups.py`)

The hack's groups already follow the original archives' ends. New species' groups go **after the hack's form
groups**, in ID order, at generated bases:
- **Battle sprites:** from `POKEMON_FORMS_SPRITE_FILES + 20 × hack form groups`. In `GetPokemonDataIDBase`
  (`pokegra.c:268`), `PML_IsAddedSpecies(species) && form == 0` gives
  `PAPERWHITE2_SPECIES_SPRITE_FILES + (species - 687) × 20`. A new species' own forms use `sprite_offset` like any
  form: `form_groups.species_forms` must include added species, and `sprite_offset` ≥ 66 for them.
  - The packer builds each file "in the format of its species' own file" (`pokemon_graphics.py:430-436`); a new
    species has no original, so it takes a fixed template, its `--from` species', recorded in `data.json` as
    `"art_template"`, or simply Bulbasaur's formats.
  - `pokedex_sprites.py`' middles table must run to the new end.
- **Icons:** after the hack's form icons. In `PokeParty_GetIconIndex`, an added species gives
  `PAPERWHITE2_SPECIES_ICON_FILES + (species - 687) × 2`. In `PokeIcon_GetPalette`, a generated byte per added
  species (bank from the PNG via `icon_bank`, as the hack's forms do).
- **Footprints `a/1/6/5`:** `species + 5`. Pad 650-686 with `none/`'s footprint, then new species' `footprint.png`
  (16×32). Species past Arceus use the new cell set (`pokedex_info.c:2042`), so new ones do too.
- **Area maps `a/1/7/6`:** raw, `species - 1`. Append copies of an empty-habitat file for 684 to `last - 1`, or guard
  the vanilla Area page. The hack's own Area panel reads `encounters.py`'s member 162, which needs its count raised
  (`encounters.py:727`, hard-coded Genesect).
- **Musical:**
  - The musical draws a species from the BW1 personal archive (`a/3/0/2`, `PML_PersonalFetchBW1`, only for
    `form != 0`) and `a/0/5/1` in BW1's layout.
  - An added species reads BW1's forms' groups. The hook in `MusicalMcss_GetDataIDBase` for added species is a hack
    musical group appended to `a/0/5/1`, built from the battle sprite's files exactly as the packer already falls
    back for most musical members (`pokemon_graphics.py:410-415`).
  - So **a species can have no musical art of its own**: it gets its battle sprite's. *(Inferred: musical-specific
    `_info.bin` data, which 1,426 sides have, may hold accessory points. A copied battle bin may misplace
    accessories. Test in step 5.)*
- **Shiny palettes:** in the group (`shiny.pal`).

### 3.6 Cries (`sound_data.py`, `pokemon_cries.py`, `pm_voice.c`)

- **Format (verified, `pokemon_cries.read_wav`):** mono PCM8 or PCM16 WAV, 4,000-65,535 Hz, packed as one unlooped
  PCM8 wave whose wave archive must fit `CRY_BUFFER` 0x5c30.
  - That is about 23,500 samples: 1.76 s at the game's 13,379 Hz, 1.07 s at 22,050 Hz.
  - Yes, a new cry can be appended from a WAV the user provides. The editor should offer down-mixing, resampling to
    13,379 Hz and a length check, in pure Python (`audioop` is gone in 3.13) or in TypeScript.
- **Where:**
  - New wave archive constants in the gap 691-999 of `generated/sound_wave_archives.txt` (the format allows empty
    slots, `sdat.py:3`), e.g. `WAVE_ARC_PW2_CRY_APPLIN`, in ID order.
  - `sound_data.py`'s `CRIES = range(1, 691)` and `pokemon_cries.cry_folder` map 691+ to the added species' folders.
- **Runtime:**
  - `getResIDFunc`: an added species gives `PAPERWHITE2_SPECIES_CRY_FIRST + (species - 687)`.
  - `getWaveInfoFunc`: reads its volume at `species` from `a/1/9/1`, now in range.
  - `POKE_VOICE_SPECIES_MAX 684` stays for the original IDs. Today a species above it plays Bulbasaur's cry.
- **Optional:** a species without `cry.wav` could reuse another species' cry (`"cry": "SPECIES_X"`). Recommended for
  roguelike creatures while their cries are made.

### 3.7 Field, battle and the hack's systems

| System | Today for an ID ≥ 687 | Change |
| --- | --- | --- |
| Wild slots, trainers, facilities, trades, Habitat Dex, encounter candidates and outbreaks | resolve the constant; 11 bits or u16 | none |
| Box and party | u16 species; **`scrcmd_leaves.c:421` writes 0xff over encrypted bytes for `species > SPECIES_GENESECT`, making a bad egg** | `!PML_IsRealSpecies` |
| Scripts | `scrcmd_pokemon.c:311, 371`: party count and find skip ≥ 650 | `PML_IsRealSpecies` |
| Battle regulation (PWT, Subway, local) | `bannedSpecies[0x52]` (656 bits); `Regulation_CheckParamBit` reads past it for ≥ 656; `scrcmd_fld_battle.c:20` loops to 686; `regulation.c:170` caps at 686 | added species "not banned" (or a hack table); loop over `pokedex_species()` |
| Evolution | by species, form-conditioned (form-evolutions §12) | none. Evolution demo heights (`evolution_demo_view.c`) is a switch: none |
| Battle | personal data, sprites, cries; nothing sized by species | none |
| Day care | §3.2 | |
| Followers | `FOLLOWING_MAX_SPECIES 649` (`include/paperwhite2/following.h:21`): the registry, `sIndex[MAX + 2]`, trail, reactions, wanderers. **One row with a species above it makes the registry stream fail, and every follower goes** (`paperwhite2_following_registry.c:121`) | `PAPERWHITE2_SPECIES_LAST` (u16 each, 2 bytes a species). The Python side (`following_data.py`, `following_dialogue.py`) is already computed |
| Wonder Trade | `pokemon_center.py:76 LAST_SPECIES = SPECIES_GENESECT`; schema `excluded_species maxItems 649`; C refuses `species >= WONDER_TRADE_SPECIES_COUNT`. **Latent bug:** `speciesFlags` is `COUNT/8 + 1` bytes, read by the box picker by species (`box2_main.c:1097`), so an ID ≥ 656 in a box reads past it | last species from `species_list`; 650-686 always excluded; schema `maxItems` raised; the flags sized to the last species |
| Pokédex Info: Evo | `pokedex_evo.py:118` and `paperwhite2_pokedex_info_evo.c:378` stop at Genesect | family table to the last species |
| Pokédex Info: Flavour | other-game entries ≤ 649 (`dex_flavour.py`) | none (new species have none) |
| Pokédex Info: Area | `encounters.py:727` count = Genesect + 1 | the last species + 1 |
| DexNav | seen and caught from the save | via `PML_PkmIsBadMonsNo` |
| Debug menu | pickers to Genesect (`paperwhite2_debug_commands.c:133, 141`); Fill Pokédex loops to `POKEDEX_LAST_SPECIES` | raise; skip 650-686 |
| Editor: Encounter editor | `NATIONAL_DEX_SIZE = 649` (`editor/src/modules/encounters/load.ts:93`) | the species list's predicate |
| Editor: Pokémon list | sorts by constant value (`forms.ts:50-77`): new species list after the Pokéstar entries | list them in the Pokédex group, by display number |
| Pokéstar | `event_pokewood.c` cast 652-683 | none |
| Easy Chat | species words 0-651 | none (§3.3) |
| Wireless (GTS, Game Sync, beacons, Funfest, battle videos, Mystery Gift, Dream Radar) | `> SPECIES_GENESECT` checks throughout | ignore; removed feature by feature ([wireless removal](../STATUS.md)) |

### 3.8 The save

- **Pokédex:** bits at `species - 1` in the hack's area (1504) for seen, caught and shown.
  - `PML_PkmIsBadMonsNo` (`pokedex_savedata.c:151`) becomes `!PML_IsRealSpecies`, so 650-686 stay bad.
  - The count loops (`:542, :629, :730, :911`) go over real species.
  - The mirror into the original block already clears bits past Genesect (save-expansion §11.1).
  - Languages: 1-649 only, by design.
- **Adding species after a save exists is safe:** the save has no bits for them, and nothing moves.
- **Removing a species is not safe** (§4.3): its Pokémon in boxes become species past the last, which
  `PML_IsRealSpecies` rejects.
- **Forms of new species:** in the generated form directory like any (`POKEDEX_FORM_LIST`, 128 species and 1024
  bits a list). `pokemon_forms.pokedex_form_list` must iterate `pokedex_species()`.

## 4. The editor: Add Pokémon

### 4.1 The tool

`tools/paperwhite2/pokemon_species.py`, the model being `pokemon_form.py`, with JSON output and `--check`:

```
pokemon_species.py add NAME [--from SPECIES | --blank] [--number N] [--check]
pokemon_species.py remove SPECIES [--check]          # only a hack-added species, the last one
pokemon_species.py number SPECIES N|none             # display number
pokemon_species.py cry SPECIES WAV [--write]         # check, convert, preview
```

`add` writes the following.

1. `generated/species.txt`: `SPECIES_<NAME>` appended at the end. The first time, it also adds the reserved
   `SPECIES_PAPERWHITE2_RESERVED_685/686`. This is safe:
   - `gen_constants.py` numbers in order and no existing value changes;
   - `species_data.py:199` only checks the numbering.
   - Refuse a constant that exists, or a name over 10 characters.
2. `res/pokemon/<name>/data.json`:
   - from the template species, or from a blank template (`res/pokemon/none/` shaped with sane defaults);
   - `name`, and `pokedex` with the template's or empty category, entry, height, weight, shape and
     `display_number` (new, §5);
   - `regional_dex_number: null`, `baby_species` itself, `evolutions: []` (a template's evolutions name its family);
   - `forms` `{ count 1, sprite_offset 0 }`, `cry_volume` the template's, `learnset` copied
     (`egg_moves` included);
   - the schema's new `"art_template"` (the species whose file formats the packer copies).
3. Art copied from the template as placeholders:
   - the battle sheets, stills and palettes;
   - `front_rig.json` and `back_rig.json` (and `_rig_source.json` if any), with `$schema` paths rewritten, as Add form
     does;
   - `icon.png`, `footprint.png` and `cry.wav`.
   - Not `musical/` (the build falls back to the battle sprite's).
4. Followers: `res/field/actors/followers/<name>[_female][_shiny]/`, copies of the template's with `"species"`
   changed, and `OBJ_CODE_FOLLOWER_<NAME>...` after the last follower code (`pokemon_form.add_obj_codes`). They show
   the template's sprite until redrawn. The option "no follower" writes none, and the follower is then simply
   absent *(inferred from `FindFollowerRow`'s lookup; verify)*.
5. Optional `res/paperwhite2/encounters/species/<name>.json` (empty), so the Encounter editor offers it.
6. **Nothing else.** Text lines, Pokédex orders, sprite, icon and cry bases, the Wonder Trade (in by default),
   the save's bits and `POKEDEX_SPECIES_MAX` all follow from the data.

`remove` deletes all of that for **the last added species only**. A middle one would renumber every later species,
which moves their Pokémon in saves and their references in trainers, encounters and evolutions.
- It refuses while anything in `res/` names the constant: evolutions, trainers, encounters, trades, the Wonder
  Trade, conditions. It lists the referrers.
- For a middle species, offer **"Retire"** instead: `"retired": true` keeps its ID and data but leaves it out of the
  Pokédex, the Wonder Trade and the pickers.

### 4.2 The server and UI

- **The server:** `GET /api/pokemon-species` (the added species, the next ID, the numbers in use), and
  `POST /api/pokemon-species/add`, `/remove`, `/number`, `/cry`, next to the form routes (`editor/server/main.ts:650-694`).
  As with forms, the tool writes `res/` itself, so the editor refuses while those files have unsaved edits, then
  reloads them.
- **"Add Pokémon…"** on the Pokémon list (the Ambients-panel layout, per the user's layout preferences):
  - name; template (a species, or Blank);
  - display number (number field, or "None: shows ???"), with a uniqueness check against 1-649 and the other added
    species;
  - follower: copy the template's / none;
  - in the Wonder Trade (default on);
  - a dry run before Add.
- **A new species' page** is the species page, with:
  - the Pokédex card's **Display number**;
  - a **Cry** card: play, import a WAV (converted, length-checked), volume;
  - the **Footprint** (16×32 import);
  - the existing Battle sprite card and Rig Editor, icon and stills import (§11.6 of forms-and-species works per
    folder);
  - **Remove Pokémon** or **Retire**.
- The Wonder Trade row exists (it writes `excluded_species`).

## 5. Pokédex numbering (forms-and-species §12)

**Data:** `pokedex.display_number`: an integer, or absent / `null` for "???". Only on added species; 1-649 show
their ID.

**The list** (`PokedexCommon_CreateList` → `PokedexSearchEngine_LoadList(0)`, `pokedex_search_engine.c:263`):
- Today it builds `1..649` in code (`0x512` bytes) and trims after the last seen species.
- The hack builds `1..649`, then the generated `PAPERWHITE2_POKEDEX_ADDED_ORDER[]`: added species by display number,
  the unnumbered ones last by ID. So there are no rows for 650-839.
- `POKEDEX_LIST_SPECIES_COUNT` (`names[]`, `pokedex_list_main.c:460, 512`), `NATIONAL_COUNT` (`:21, 149, 273, 310`)
  and the `0x512` allocations become `PAPERWHITE2_POKEDEX_LIST_COUNT`.
- The list's heap is 0x60000 (`pokedex_list.c:25`), ample for a few hundred more names. White2Upgrade had to grow a
  proc allocation for 721 (§11): check it in step 3.
- An unseen added species shows a row with its number and the empty name, as an unseen 1-649 does. *(Whether unseen
  new species should show at all is a decision, §12.)*

**The shown number:** one function, `PaperWhite2_PokedexDisplayNumber(species)`:
- the ID for 1-649;
- the table's number for added species;
- `999` for none, which every caller already prints as its "no number" form, since 999 is the regional table's
  `REGIONAL_DEX_NONE`.

The callers:
- the list row (`pokedex_list_bmp.c:228`; "???" needs a text line, since today it always prints a number);
- the Info page (`pokedex_info.c:1097, 1195`, which already print `labels[1]` for 999);
- the summary (`p_sta_info.c:238-251`, `DEX_NUMBER_NONE`);
- the box (`box2_bmp.c:263`, which prints nothing for 999).

**Four digits:** Dipplin (1011) and Hydrapple (1019) need 4 digits. Every site prints 3
(`WordSetNumber(..., 3, ...)`).
- The list row puts the name at x = 28 (`pokedex_list_bmp.c:232`), so 4 digits need the name moved, or a narrower
  font for those rows.
- The Info page, summary and box have room *(inferred; check the windows)*.
- Alternatively the user gives them numbers under 1000. See §12.

**Search and sort:**
- The search's default order is the list's.
- Sorting by number uses file 4 (§3.4).
- A–Z uses file 5 and the box search's generated tables.
- Height and weight are computed.
- `engine->total == NATIONAL_COUNT` (`:149`) compares with the new count.

**Counts and completion:**
- SEEN and OBTAINED count every real species.
- `NATIONAL_DEX_COMPLETE 636`, the Shiny Charm, the diploma and the evaluation stay on 1-649 unless the user wants
  new species required (§12).
- The Unova-native counts (Victini-Genesect) are unchanged.

**The Habitat Dex** lists species by area from encounters data (by constant): no change. **DexNav** follows seen and
caught.

## 6. Applin's line in this design

| Species | Display number | Types | Evolution | What Gen 5 lacks |
| --- | --- | --- | --- | --- |
| Applin | 840 | Grass/Dragon | → Flapple (Tart Apple), Appletun (Sweet Apple), Dipplin (Syrupy Apple) | ability Ripen; moves Grav Apple, Apple Acid |
| Flapple | 841 | Grass/Dragon | | Grav Apple, Dragon Rush etc. exist |
| Appletun | 842 | Grass/Dragon | | Apple Acid |
| Dipplin | 1011 | Grass/Dragon | → Hydrapple: level up knowing Dragon Cheer | ability Supersweet Syrup; moves Syrup Bomb, Dragon Cheer |
| Hydrapple | 1019 | Grass/Dragon | | Fickle Beam |

Three new items (form-evolutions §7 is the recipe; `EVO_METHOD_ITEM` takes any item) or stand-ins such as existing
stones. "Level up knowing a move" (`EVO_METHOD_MOVE`, Gen 4+) needs Dragon Cheer, or a stand-in move. Abilities and
moves past Gen 5 are a separate expansion; until then, choose Gen 5 stand-ins (built in step 6 with the items Tart,
Sweet and Syrupy Apple and Focus Energy for Dragon Cheer; section 18 lists every stand-in). Each species needs:
- 2 sheets with their rigs, made in the Rig Editor;
- an icon (32×64, one bank of `icon_palettes.pal`), a footprint and a cry;
- optionally a follower sprite.

## 7. Risks

- **Silent failures**, from the sweeps:
  - the follower registry's all-or-nothing check (§3.7);
  - the bad-egg trap in `scrcmd_leaves.c`;
  - the regulation's over-read;
  - the Wonder Trade's `speciesFlags` over-read in the box;
  - `PersonalCache` and the Entree Forest sentinel, avoided by starting at 687;
  - text lines at 685/686 ("Egg"), kept.
- **Bounds missed:** after each step, grep `SPECIES_GENESECT`, `SPECIES_EGG`, `649`, `650`, `684`, `685`, `686`,
  `national_species` and `LAST_SPECIES` again. The sweep's lists are this document's §3; wireless sites are
  deliberately left.
- **Generated headers and ninja:** a first build after Add Pokémon may compile against the old
  `pokemon_forms_config.h` (save-expansion §11.3, the depfile path issue). Run `ninja` twice until that is fixed.
  Fixing it becomes more important now, because the species count changes code.
- **Save compatibility:**
  - Adding is safe.
  - Removing or reordering is not.
  - A build with fewer species than the save's Pokémon turns those Pokémon into rejected species. They stay in the
    box, but every species check refuses them *(inferred: no box code deletes them)*.
- **The plain build:**
  - Everything in C is under `#ifdef PAPERWHITE2`, and appended constants change no existing value, so the plain
    build's modules keep matching.
  - With added species in `res/`, the plain build's data archives differ, as they already do with the hack's data.
    `a/0/9/7`, which matches today, will differ too.
  - The proof of every packer change is byte-identical output with no species added (§10, step 1).
- **Musical accessories** on copied bins, **4-digit numbers**, and **missing Gen 8/9 mechanics** for the Applin line.
- **Wireless code** still rejects new species; the user is removing it feature by feature.

## 8. Requirements per new species

| Part | Required? | Default |
| --- | --- | --- |
| `data.json` (stats, types, abilities, learnset, etc.) | yes | the template's |
| Name (≤ 10 characters) | yes | |
| Battle sprite (front, back, rigs, stills, palettes) | yes | the template's copy |
| Icon | yes | the template's copy |
| Cry | recommended | the template's copy, or a reused cry (`"cry"`) |
| Footprint | recommended | the template's copy |
| Pokédex text (category, entry, height, weight, shape) | for a Pokédex species | the template's |
| Display number | no | "???" |
| Follower | no | none, or the template's copy |
| Musical sprite | no | the battle sprite's |
| Encounters, trainers, Wonder Trade | no | in the Wonder Trade pool, nowhere else |

**The roguelike creatures:** a `"pokedex": false` species (in `species_list`, but not in `pokedex_species()`) has
no Pokédex bits, list row or Wonder Trade entry, and `PML_IsRealSpecies` still accepts it for box and battle. It is
the Pokéstar model with the hack's full art support. It isn't built in the first steps.

## 9. Gen 8/9 content (not part of this project)

New species can only use Gen 5's moves, abilities, items and evolution methods. The Applin line's signature moves,
Ripen, Supersweet Syrup and the apples are separate work: moves and abilities are code in ov167 and the move data;
items follow form-evolutions §7. Stand-ins keep the species playable meanwhile.

## 10. Build order

Each step has its proof. Every hack build ends with `tools/build/verify_dsi_rom.py build/paperwhite2.nds`.

1. **The shared species list and appending packers, nothing added.**
   - `tools/data/species_list.py`, used by `species_data`, `form_groups`, `pokemon_graphics`, `pokemon_cries`,
     `sound_data`, `pokedex_data`, `text_sources`, `pokemon_forms`, `pokemon_center`, `pokedex_evo`, `encounters`
     and `pokemon_form`.
   - Generated bases and `PAPERWHITE2_SPECIES_*` in the hack header.
   - `a/0/9/7` files 1, 4 and 5 generated, each first proven equal to the original.
   - **Proof:** the `--hack` ROM's SHA1 unchanged against the commit before; the plain build's modules match.
2. **A test species, made by hand.**
   - Tools: `SPECIES_TESTMON` (687, after the reserved 685/686), a copy of Bulbasaur with tinted palettes, a
     mirrored icon and a different cry.
   - C: the hooks of §3.5-3.8 (sprites, icons, palette, cry, `PML_IsRealSpecies` in `PML_PkmIsBadMonsNo`, the day
     care, the scripts, `scrcmd_leaves`, the regulation, the follower bound, the Wonder Trade bounds).
   - **Proof (py-desmume, a copy of the user's save):**
     - given by the debug menu: party icon, summary (number "???"), box;
     - a wild battle: front sprite, cry, catch; the Pokédex marks it caught;
     - Rare Candy evolution into a second test species;
     - an egg from the day care hatching it;
     - Bulbasaur, Unown's forms, Rotom's, the Spiky-eared Pichu and the eggs unchanged against the build before;
     - an existing save loads, and `pokedex_save.py verify` passes after saving.
   - Then remove both species: the ROM is byte for byte step 1's.
3. **The Pokédex numbering:** display numbers, the list's added rows, search, sort and counts, 4-digit layout.
   - **Proof:** screenshots of the list around 649 → 840 → ???, the Info page, the summary and the box; the search
     by A–Z (box search too) and by height.
4. **Add Pokémon in the editor:** `pokemon_species.py` and the server routes, then the UI.
   - **Proof:** add and remove from the tool and the editor leaves `res/` and `generated/` as they were, and the ROM
     is byte-identical (as Add form's proof); `npm run typecheck`, `npm test`, `npx vite build`.
5. **Followers, encounters, Wonder Trade, musical:**
   - **Proof:** the test species follows, wanders and appears in DexNav and the Habitat Dex; it is received from the
     Wonder Trade (forced by the debug menu) and excluded when switched off; it performs in the musical.
6. **The Applin line:** the five species with stand-in items, moves and abilities; their art through the Rig
   Editor; display numbers 840-842, 1011, 1019 (or the user's choice); encounters and trainers.

## 11. Prior art: White2Upgrade

[White2Upgrade](https://github.com/ds-pokemon-hacking/White2Upgrade) (PlatinumMaster and others, based on KazoWAR's
Project 721; read in a local clone, code not copied) adds species 650-721 to White 2 by PMC code injection and
patched data.

| Topic | What it does | This design |
| --- | --- | --- |
| IDs | Option (b): Chespin-Volcanion at 650-721, `SPECIES_EGG` 722, `SPECIES_BAD_EGG` 723, placeholders 724+ (`include/Species.h`); 826 personal files, the regional table at a hard-coded 826 | Appends at 687. The decomp makes renumbering possible, but the shared plain build makes it costly (§2.4) |
| Sprites and icons | Replaces `GetPokemonDataIDBase`/`PokeParty_GetIconIndex` with hard-coded bases (`FORM_START 14480` = 724 × 20, `ICON_FORM_START 1456`, egg at 722) | Generated bases, recomputed from `res/` on every build |
| Icon palettes | moved to a data file (`pokeicon_palette_map.bin`) | a generated table for the hack's groups (forms already) |
| Form list | `poke_form_list.bin`, 0x48 entries, read by `getIndexPokemonWithForms` and friends | `POKEDEX_FORM_LIST` generated, with a save directory and remap (save-expansion §11) |
| Pokédex save | **not extended**: its lists stay 84 bytes (672 bits), and its own code comments that "the save file has not been extended and the PokéDex flags get all messed up" (`w2u_pokedex.cpp:286`) | the hack's 1504-species area, built and tested |
| Bounds | literal-pool patches to 721 in the Pokédex list and search (`Expansion_LimitAdjust.s`); the list proc's allocation grown; `PML_PkmIsBadMonsNo` to 721; the egg check in `PML_PersonalGetDatID` bypassed; National Pokédex forced | the same bounds as named constants and a predicate (§3.7) |
| Evolutions | 8 entries per species (file grown to 48 bytes, 4 loop bounds patched) | 7, with form conditions in the method's high byte (form-evolutions §12); 8 is possible if ever needed |
| Display numbers | none: the ID is the number | separate (§5) |
| Cries, footprints, text | footprints and text files in its data tree; no cry code found in its sources *(not checked further)* | §3.3, §3.6 |

What it confirms: the same lookups (`GetPokemonDataIDBase`, `PokeParty_GetIconIndex`, the icon palette,
`PML_PkmIsBadMonsNo`, the Pokédex list and search counts, the regional table's file) are the core of any species
expansion. The Pokédex list needed more memory at 721, and leaving the save's bit lists at 672 bits is a real failure
mode. What the decomp does more cleanly: every base and bound is computed from `res/`, so "Add Pokémon" needs no C
edit, and nothing is a patched literal.

## 12. Open decisions for the user

1. **The ID base: 687**, with 685/686 reserved (recommended), or 685 with the two sentinels and the "Egg" lines
   fixed in code.
2. **Display numbers over 999** (Dipplin 1011, Hydrapple 1019): 4 digits (the list row's layout changes), or
   numbers under 1000 for them.
3. **How originals are numbered:** "???" (no number), or user-chosen numbers. If chosen, from a range of their own
   (e.g. 1100+), or anywhere? Two species with one number are refused either way.
4. **Unseen new species in the list:** a row with the number and an empty name, as 1-649 (recommended, consistent),
   or hidden until seen (no spoilers for originals).
5. **Completion:** does the National Pokédex's completion (the Shiny Charm, the diploma, the evaluation) require the
   new species, or stay on 1-649?
6. **What's required per species** (§8): the cry and footprint recommended with defaults, the follower and musical
   optional. Should Add Pokémon refuse to build without a cry of the species' own, or allow a reused one?
7. **Removal policy:** only the last added species can be removed, and others retired (recommended)?
8. **Gen 8/9 mechanics** for the Applin line: stand-ins now, or the item, move and ability expansion first (§9)?
9. **Roguelike creatures:** a `"pokedex": false` flag in this design (§8), or deferred until the roguelike exists?

## 13. The user's decisions (2026-11-13)

1. **IDs from 687**, 685 and 686 reserved. Each species' Pokédex number is set on its own (the display number).
2. **Display numbers over 999** are supported, but numbers under 1000 keep 3 digits ("001", not "0001"); only numbers
   of 1000 and up print 4 digits (Dipplin 1011, Hydrapple 1019).
3. **Originals**: a blank number shows "???". Two species with one number are refused.
4. **Unseen new species are hidden** from the National list until seen (most will be secrets or special battles).
5. **Completion stays on 1-649**: no new species is required (as mythicals in the original).
6. **Cries**: a reused cry (the template's) is allowed, with a note, until the user has one of the species' own.
7. **Removal**: only the last added species can be removed; any other can be hidden (retired), and a retired slot can
   later be turned into a new species that is used.
8. **Gen 8/9 mechanics for the Applin line**: stand-ins for now; the real items, moves and abilities later.
9. **`"pokedex": false`** for creatures that never enter the Pokédex (the roguelike's), built now.

The build runs on the branch `new-species` (not main) in the steps of section 10, each proven before the next; the
Applin line (Applin 840, Flapple 841, Appletun 842, Dipplin 1011, Hydrapple 1019) is the test case, with placeholder
art until the user draws it.

## 14. Built: steps 1 and 2 (2026-11-13)

### 14.1 The shared species list (step 1)

`tools/data/species_list.py` is the one definition: `constants()` (generated/species.txt by ID, checked to have
`SPECIES_PAPERWHITE2_RESERVED_685`/`_686` before any added species), `directory()` (the reserved IDs read `egg/`, so their
records are the egg's without folders of their own), `national_count()`, `real_species()` (1-649 and 687..last),
`pokedex_species()` (less `"pokedex": false`), `added_species()`, `hidden_species()`, `last_real_species()`,
`last_pokedex_species()` and `NAME_LENGTH` (10). Its users:

| Tool | Change |
| --- | --- |
| `species_data.py` | `directory` is species_list's; the moved sprite offset and egg moves for added species too; egg-move entries pad the IDs between with empty ones |
| `form_groups.py` | `data_species()` (NONE, 1-649, added): an added species' forms are hack groups from 66 like any species without original groups |
| `pokemon_graphics.py` | `added_species()`, `template_species()` (`data.json`'s new optional `"art_template"`, else Bulbasaur): the added species' battle groups and icons after the hack's form groups; footprints padded to the last species with `none/`'s |
| `pokemon_cries.py`, `sound_data.py` | `cry_ids()`: added species' cries from 691 (`ADDED_CRY_FIRST`), named `WAVE_ARC_PAPERWHITE2_CRY_<SPECIES>` in the archive's empty slots by the packer (no list edit); volumes at their IDs, the reserved ones the egg's |
| `pokedex_data.py` | `pokedex_rows()`: files 0 and 2 indexed by ID with zero rows for 650-686 and hidden species; file 1 (initials) now generated from the names (proven equal to the original); files 3-5 still copied (step 3) |
| `text_sources.py` | `\from{added_species.name|name_upper|name_with_article}` (new last lines of the three name banks; names over 10 characters stop the build); the Pokédex banks' `\from{species.pokedex.*}` emit 650-686 and hidden species as empty lines, so the form slots follow at `last + 2` |
| `pms_words.py` | Easy Chat's species words end at the first `\from` (the added names come after Bad Egg) |
| `pokemon_forms.py` | the bases below; `no_evolution` and the form directory over real/Pokédex species; `POKEDEX_SPECIES_MAX` = the last Pokédex species |
| `pokemon_center.py` | the Wonder Trade's tables to the last real species; 650-686 and hidden species always excluded; schema `excluded_species` up to 1023 |
| `pokedex_evo.py`, `encounters.py` (Area), `pokedex_templates.py`, `pokemon_form.py`, `pokedex_sprites.py` | to the last real species / including the added groups |
| `following_data.py` | a follower row whose species isn't real stops the build (the game would drop the whole registry) |
| editor `shared/species.ts` | `isRealSpecies`, `inPokedex`: the Encounter editor's species and the Pokémon list's order (added species after Genesect) |

`"pokedex": false` is the schema's second form of `pokedex` (`$defs/pokedex_text` or `false`).

### 14.2 The generated bases and the C (step 1)

`paperwhite2/pokemon_forms_config.h` adds `PAPERWHITE2_SPECIES_FIRST_ADDED` (687), `_ADDED_COUNT`, `_LAST` (the last real
species: 649 without added ones), `_SPRITE_FILES` (15,065 + 20 × hack form groups), `_ICON_FILES`, `_CRY_FIRST` (691),
`_ICON_PALETTES` and `_NOT_IN_POKEDEX`. `include/paperwhite2/species.h` (included by `pokemon_forms.h`):
`PaperWhite2_IsAddedSpecies` (inline, `species - 687 < count`), and as macros `PML_IsRealSpecies`,
`PaperWhite2_IsPokedexSpecies`, `PaperWhite2_IsSkippedPokedexSpecies`; `PaperWhite2_IsHiddenSpecies` and
`PaperWhite2_GetSpeciesIconPalette` in `paperwhite2_pokemon_forms.c`, compiled only with added species.

The hooks: `GetPokemonDataIDBase` (pokegra.c), `PokeParty_GetIconIndex`/`PokeIcon_GetPalette` (poke_icon.c),
`getResIDFunc`/`getWaveInfoFunc` (pm_voice.c), `PML_PkmIsBadMonsNo` and Fill Pokédex (pokedex_savedata.c), the Day
Care's egg TMs and babies (day_care.c), the party scripts (scrcmd_pokemon.c), the bad-egg trap (scrcmd_leaves.c), the
regulation's banned bits (never banned, no over-read) and required species (regulation.c), `FOLLOWING_MAX_SPECIES`, the
Info page's family table, the debug pickers. The Wonder Trade needed no C: its count and flags follow the generated
last species.

**Byte identity without species.** Each check is the original when the count is 0: `species - 687 < 0u` folds away.
Two traps found: an inline function returning `a || b` makes MWCC put the value in a register before branching (so the
compound checks are macros), and a line added before a `__LINE__` allocation changes the code (the Info page's include
went into `pokemon_forms.h` instead).

**Proof:** the `--hack` ROM is `57cd9af0dfab0e720e9d82e3e12298a1c1cd904d` before and after (every packed file identical);
`verify_dsi_rom.py` intact; the plain `configure.py w2_us` build passes every module check (its archive checks fail as
before; a/0/9/7 among them since the Spiky-eared Pichu, not "matches today" as section 7 says).

### 14.3 The test species (step 2)

Made by hand (scratchpad `newsp/testmon.py add|remove`): `SPECIES_TESTMON` (687, Bulbasaur with red and blue swapped,
mirrored icon, Pikachu's cry, evolves at 16) and `SPECIES_TESTEVO` (688, Ivysaur with green and blue swapped, Meowth's
cry). Tested in py-desmume on a copy of the user's save (shots in the scratchpad's `newsp/shots/`):

- party icons (mirrored), summary (Testmon, Grass/Poison, the tinted sprite; Dex No. shows 687 until step 3);
- a forced wild battle (Route 6's double grass): tinted fronts and backs, cries asked as wave archives 691 and 692 and
  691 loaded (`PokeVoice_LoadWaveArc`), volumes read at 687/688; caught (party full: to Box 1, its PC entry No. 687 with
  sprite and icon); the hack's Pokédex area's caught and seen bits at 686 (species 687);
- a level-up in battle to 25: "Testmon is evolving!" into Testevo; 688's bits set;
- the Centers' Day Care: Testevo (female) and Testmon sent, the egg a Testmon (687), hatched ("Testmon hatched from the
  Egg!");
- no follower for Testmon and the boot's Pignite follower as before (the registry with `FOLLOWING_MAX_SPECIES` 688);
- the Pokédex Info page of Testmon (#687, "Test Pokémon", its entry, height, weight, sprite, footprint) and of Keldeo's
  Resolute Form (the moved form slots); every form's name, entry, height, weight and shape found through a/0/9/7's
  chain equal to the baseline's (83 forms), and every original and hack form group of a/0/0/4 and a/0/0/7 byte for
  byte;
- saved: `pokedex_save.py verify` every CRC right, the area seen 62/caught 15 (highest 687), the original block its
  mirror (61/14); reloaded with the party intact.

Removed: the ROM is `57cd9af0...` again.

### 14.4 Found on the way (for the next steps)

- The vanilla Area page (`pokedex_detail_map.c`, `species - 1` into a/1/7/6, copied from the ROM) would read past the
  archive for an added species; the hack's own Area panel is used, but the vanilla page isn't guarded.
- The musical (`MusicalMcss_GetDataIDBase`) has no hook yet: an added species reads BW1's layout (step 5).
- Debug pickers now run to the last species, the IDs 650-686 included (debug only).
- Step 3 must give the summary and Info page the display number (both show the ID today), and decide a/0/9/7 files
  3-5 and `box_search.c`'s tables.
- Step 4: Add Pokémon writes generated/species.txt (the reserved pair first), the folder with `"art_template"`, and
  nothing for cries (the packer names the slots); `pokemon_species.py remove` reverts both lists. Ninja picked up the
  header change in one build here (configure re-ran because species.txt changed).

## 15. Built: step 3, the Pokédex numbering (2026-11-13)

### 15.1 The data

- **`pokedex.display_number`** (`res/pokemon/species.schema.json`): null/absent ("???"), 650-998, or 1000-9999. 999 is
  refused because the game's tables already take it for "no number" (the regional table's `REGIONAL_DEX_NONE`, which
  the Info page and the summary print as "???"), so `PAPERWHITE2_POKEDEX_NUMBER_NONE` is 999 and those two sites print
  "???" without a new branch. `species_list.display_numbers()` stops the build for a duplicate, 999, a number out of
  range, or a number on an original species (1-649 show their ID); `pokedex_order()` is the National list's order.
- **Generated** (`pokemon_forms.py` → `paperwhite2/pokemon_forms_config.h`): `PAPERWHITE2_POKEDEX_ADDED_COUNT`,
  `_LIST_COUNT` (649 + those), `_ADDED_ORDER`, `_DISPLAY_NUMBERS` (by ID from 687, 999 for none or hidden),
  `_INITIAL_STARTS`/`_ENDS` (the A-Z order's first-letter groups).
- **a/0/9/7** (`pokedex_data.py`): file 3 the number order, file 4 the regional order (non-regional species in number
  order, then the regional ones by regional number; only the regional mode reads it, which the hack doesn't have),
  file 5 A to Z. The original's A-Z key, found by reproducing file 5: letters and digits only, case and accents folded
  (NFD, so Nidoran♀/♂ tie and fall back to ID order), ties by ID. All three are byte for byte the original's without
  added species. A Pokédex species' name must start with a letter (the search's initials).

### 15.2 The C

| Where | What |
| --- | --- |
| `include/paperwhite2/species.h` | `PaperWhite2_PokedexDisplayNumber(species)` (a macro over `PaperWhite2_GetAddedDisplayNumber`, so it is the species itself without added species), `PaperWhite2_PokedexNumberDigits`, `PaperWhite2_IsPokedexNumberNone`, `PaperWhite2_IsNotInPokedex`; functions in the new `src/paperwhite2/main/paperwhite2_pokedex_numbers.c`, built only with added species |
| `pokedex_search_engine.c` | the national list and the search's number order: 1-649 then `PAPERWHITE2_POKEDEX_ADDED_ORDER`; `NATIONAL_COUNT` = the list count (which also keeps the A-Z file's "species list, take the shown form" test right) |
| `pokedex_common.c` | `PokedexCommon_CreateList` drops the unseen added species (`PaperWhite2_PokedexHideUnseen`) before trimming after the last seen |
| `pokedex_list_main.h` | `POKEDEX_LIST_SPECIES_COUNT` (the names array and the frame list) = the list count. The work grows 4 bytes a species; it is allocated by `sizeof` from the list's 0x60000 heap, so the allocation White2Upgrade had to patch grows by itself |
| `pokedex_list_bmp.c` | the row's number, 4 digits from 1000, "???" (the Info page's, `BtlServerFlowTitle_Text_Empty_173`), the name after a 4-digit number at max(28, its width + 10): the font is proportional, so "1011" barely moves |
| `pokedex_info.c` (both entries, and the registration screen), `p_sta_info.c`, `box2_bmp.c` | the display number and its digits; the box prints "No." and its own "???" (106) for none |
| `box_search.c` | the first-letter tables from the generated groups |
| `pokedex_savedata.c` | the completion count (`PokeDex_GetCaughtNoPermissive`) runs 1-649; the National evaluation counts 1-649 (`PaperWhite2_PokedexGetCaughtOriginal`) when species are added |
| `event_battle_return.c`, `event_pdc_return.c` | no registration page for a `"pokedex": false` species |
| `plist_sys.c`, `p_sta_sys.c`, `paperwhite2_pokedex_shortcut.c` | no POKéDEX menu item, INFO button or START for one, and the detail screen's party/box list leaves it out |
| `pokedex_detail_map.c` | the vanilla Area page (never started in the hack) reads Bulbasaur's file, the empty habitat that 454 species share, for an added species |

**Counts, decided:** SEEN and OBTAINED (the list, the trainer card, the Continue screen, scripts' "how many have you
found", the capture odds, Join Avenue) include added Pokédex species, matching the list's rows. Completion (the Shiny
Charm, the diploma, the trainer card's star) and the National evaluation stay on 1-649, so an added species neither is
needed nor stands in for a missing original.

**Byte identity:** every hook folds to the original without added species. One trap: an `else { number =
macro(number); }` after the regional branch changed the Info page's register allocation, so the Info page assigns the
display number in place of `number = info->species` instead. The empty object file of the new source changes nothing.

### 15.3 Proof

- Without species: the `--hack` ROM `57cd9af0dfab0e720e9d82e3e12298a1c1cd904d`, as at the `new-species` tip; every
  changed C file's code compared against the tip's (all identical); `verify_dsi_rom.py` intact; the plain `w2_us`
  build fails only its archive and ROM checks, as before (no module check fails); a/0/9/7 packed byte for byte as
  before.
- With test species (scratchpad `newsp3/testmon3.py`): Testmon 687 (No. 840), Testevo 688 (1011), Testnone 689 (no
  number), Testhide 690 (`"pokedex": false`); ROM `660d6012...`. On a copy of the user's save (shots in
  `newsp3/shots/`):
  - the list before anything added is seen ends as before (`list_before`); with Testmon caught, Testnone seen and
    Testhide's bits set: 647, 648 ?????, 649 ?????, 840 Testmon, ??? Testnone, SEEN 63 / OBTAINED 15 (Testevo hidden,
    Testhide absent and uncounted; `list_a_end`); Testevo seen too: 840, 1011, ??? (`list_b_testevo`,
    `list_b_rows_zoom`);
  - Info pages: ??? Testnone, 1011 Testevo, 840 Testmon, 647 Keldeo (`info_*`); the summary's Dex No. 840, 1011, ???,
    and ??? for Testhide, which has no INFO button and ignores START (`summary_*`); the party menu without POKéDEX for
    Testhide (`partymenu_testhide`); from Testevo's summary the detail screen steps Testevo → Testnone → Zekrom,
    skipping Testhide (`shortcut_*`);
  - the PC box: No.840, No.1011, No.??? (Testnone and Testhide) (`box_test*`);
  - searches: by number (64 results ending 840, 1011, ???; `search_number`), A to Z (… Swinub, Tepig, Testevo,
    Testmon, Testnone, Timburr …; `search_az`), Tall to Short (caught only: 15, Testmon among them; `search_tall`); the
    PC box's search by name, T: Tepig, Testmon, Trubbish (`boxsearch_t`);
  - completion: 635 of the 636 needed originals and the three added species caught: no Pokédex star on the trainer
    card (blue, POKéDEX 639); with the 636th original: the star (green, 640) (`card_a`, `card_b`, `card_a_list`).
  - Refused by the build: a duplicate number (840 twice) and 999, by `species_list` and the schema.
- Removed: the ROM is `57cd9af0...` again.

**Not tested live:** a catch of a `"pokedex": false` species (the registration guard is read, not run; its caught bit
is ignored, as the counts show); the Japanese/other-language Info entry of an added species (none exist).

### 15.4 For the next steps

- Step 4: `pokemon_species.py add --number N` / `number SPECIES N|none` write `pokedex.display_number`, checked by
  `species_list.display_numbers()`; the editor's Pokédex card gets the field from the schema; the Pokémon list could
  sort added species by display number (`pokedex_order()`).
- Places that still print a species' ID as a number are none found beyond the five above; wireless screens (GTS, Game
  Sync) are left.
- Step 5: DexNav and the Habitat Dex print no numbers; they need encounters of added species. The musical's hook.

## 16. Built: step 4, Add Pokémon in the editor (2026-11-13)

### 16.1 The tool

`tools/paperwhite2/pokemon_species.py` (stdlib, JSON out like `pokemon_form.py`, `--check` for a dry run):

| Command | What it writes |
| --- | --- |
| `info` | nothing: the added species (ID, constant, folder, name, display number, `pokedex`, `retired`, `art_template`, whose cry its cry.wav copies, forms, whether it is the last), the next ID, the numbers in use, the name, number and cry limits |
| `add NAME --from SPECIES \| --blank [--number N] [--no-pokedex] [--no-wonder-trade]` | `generated/species.txt` (the reserved pair first, the first time), `res/pokemon/<name>/`: the template's top-level art files (sheets, stills, rigs, palettes, icon, footprint, cry; not `form_N/`, `form_N.json` or `musical/`) and its data.json (section 4.1: name, Pokédex text without languages, forms or form names, `display_number` or `"pokedex": false`, no evolutions or regional number, evolution stage 1, itself as baby, `art_template` the original species whose formats it uses, the template's own for a copy of an added species); services.json's `excluded_species` with `--no-wonder-trade`. The new data.json is validated against the schema first |
| `remove SPECIES` | the last added species only: its folder, its line (and the reserved pair with the last one), its `excluded_species` entry. Refused while any other file in `res/` (`.json`, `.txt`, `.s`, `.csv`) names it, listing them, or while it has added forms |
| `retire` / `unretire SPECIES` | `"retired": true` in data.json (new in the schema). `species_list.in_pokedex()` is false for it, so every packer, the generated C tables (`_NOT_IN_POKEDEX`), the Wonder Trade and the editor treat it as `"pokedex": false` while it keeps its data and ID. Unretire refuses a display number taken meanwhile |
| `reuse SPECIES NAME --from \| --blank ...` | a retired species' line renamed in place (same ID), its folder replaced by a new one as `add` makes it; refused while referenced or with forms. Saved Pokémon of the ID become the new species |
| `number SPECIES N\|none` | `pokedex.display_number` (schema order kept), with `species_list`'s rules: 650-9999 but 999, not an original's, not another species' |
| `cry SPECIES WAV [--rate HZ] [--write]` | checks any uncompressed WAV (8-32 bits, mono or stereo, mixed down), resampled to 13,379 Hz (linear) where its rate is outside 4,000-65,535 Hz or it is too long at its own rate; refused past `sound_data.CRY_BUFFER` (23,524 samples: 1.76 s at 13,379 Hz). Prints the game's PCM8 version as a WAV in base64; `--write` writes cry.wav as mono PCM16 |

Names: up to 10 characters, starting with a letter, letters, digits, space and `. ' - : é ♀ ♂`; the folder is the
ASCII-folded lower-case name with underscores (`Mr. Mime` → `mr_mime`), the constant `SPECIES_` + its upper case.
The blank template is `none/`'s "?" art with plain data (50s, Normal, Run Away, Tackle) and Bulbasaur's cry and formats.
IDs end at `species_list.SPECIES_MAX` (1023, section 2.3).

`pokemon_form.py icon|still SPECIES 0` now takes an added species' own icon and stills (its icon's bank comes from the
PNG, as for the hack's forms; an original species' bank is the original table's, so it is still refused there).

### 16.2 The server and the editor

- Routes next to the forms': `GET /api/pokemon-species`, `POST /api/pokemon-species/add`, `/reuse`, `/remove`,
  `/retire`, `/number`, `/cry` (WAV in base64). After a change of species.txt the server rereads the constants at once.
  `/api/asset` serves `.wav` too (the cry player).
- `AddedSpecies.tsx`: the **Add Pokémon** dialog (from **+ Add Pokémon** on the list's header; name, Copy of, In the
  Pokédex, display number with the numbers in use, In the Wonder Trade, a live dry run); the **Added species** card (ID,
  status, display number with Set, art formats; Retire / Bring back, Reuse ID…, Remove for the last one); the **Cry**
  card on every species (player, "Cry: a copy of X's" while an added species' cry.wav is byte for byte its art
  template's or Bulbasaur's, the WAV import with the game's version played before Apply, the volume); **Icon and
  stills** for added species.
- The list (`forms.ts`): added species after Genesect by display number, then unnumbered, then out of the Pokédex
  (retired or `"pokedex": false`), each tagged "added" and "hidden" when retired; the number column shows the display
  number, "???" or "—". `shared/species.ts`' `inPokedex` honours `retired`.
- **A bug found and fixed:** the Encounter Editor's species listing (`SPECIES_KEYS`) never asked for `pokedex`, so
  `inPokedex` saw every species as in the Pokédex: a `"pokedex": false` species was offered in the wild. It now asks
  for `pokedex.shape` and `retired` (a nested key is listed only where `pokedex` is an object), and
  `scripts/encounter-files.ts` picks nested keys as the server does.
- Tests: `tests/pokemon-species.test.ts` runs the tool in a scratch checkout (tools and generated/ copied, res/'s
  folders linked, services.json copied): add then remove leaves species.txt, services.json and res/pokemon's folders
  byte-identical; retire/unretire round-trips the data.json, frees and re-checks the number; reuse renames in place;
  refusals (999, a taken number, an original's, 10000, a number without the Pokédex, 11 characters, a digit first, an
  existing name, the egg as a template, a middle species, a referenced species); a cry mixed down, resampled and
  refused. `tests/pokemon-forms.test.ts` checks the list's order.

### 16.3 Proof

- The `--hack` ROM with only the tool's changes: `57cd9af0dfab0e720e9d82e3e12298a1c1cd904d`.
- In the editor on the worktree (port 7480; screenshots in the scratchpad's `newsp4/shots/`): Add Pokémon "Applin",
  Copy of Budew, No. 840 (`02-add-dialog-dry-run`; 999 refused in the dry run, `03`); its page (`04`), the list
  after Genesect (`05`), the Cry card's note "a copy of Budew's" (`06`), Icon and stills (`07`), a stereo 44.1 kHz WAV
  mixed down and resampled with its preview (`08-cry-import-chirp`) and a 2.5 s one refused (`08-cry-import-long`).
  Built from the editor's Build: one ninja run picked up the header (configure re-runs when species.txt changes;
  `ninja -n` after it had nothing to do), `verify_dsi_rom.py` intact.
- py-desmume on a copy of the user's save, a party Pokémon made species 687: the summary's Dex No. 840, Applin,
  Grass/Poison and Budew's sprite (`summary_applin`); the National list without it before it is seen
  (`dex_list_before_seen`, SEEN 61) and "840 Applin" after Genesect once seen and caught (`dex_list_after_seen`, SEEN
  62 / OBTAINED 15); its Info page, No. 840 with Budew's text (`dex_info_applin`).
- Retire and Reuse in the editor: Flapple added from Applin (841, out of the Wonder Trade, `09`), Applin then not the
  last (Remove disabled, `10`), retired (No. —, "hidden", Wonder Trade "Never", `11`), Reuse ID with Dipplin from
  Bulbasaur, 1011, with its warning and dry run (`12`, cancelled), brought back (`13`), Flapple removed (`14`).
- Applin removed in the editor (`15`): res/ and generated/ as before, and the ROM built from the editor is
  `57cd9af0...` again. A blank-template species packs (a/0/0/4, a/0/0/7, a/1/6/5, a/0/1/6, a/0/9/7, the text and the
  sound archive), not run in game.

### 16.4 For the next steps

- **Followers (step 5):** Add Pokémon writes none. A follower for an added species needs its folders under
  `res/field/actors/followers/` and OBJ codes (`pokemon_form.add_obj_codes` is the model); once it has them, `remove`
  and `reuse` refuse until they go, so step 5 should teach both to remove the species' own follower folders and codes
  as `pokemon_form.remove` does.
- **Encounters:** the Encounter Editor offers added species in the Pokédex (not retired, not `"pokedex": false`); an
  encounters species file is made there. A retired species stays packed wherever data still names it.
- **Wonder Trade:** in by default; `--no-wonder-trade` writes `excluded_species`; retired and `"pokedex": false`
  species are excluded by `pokemon_center.py` without an entry.
- **Musical:** still no hook (section 14.4).
- **The Applin line (step 6):** Add Pokémon each from a Grass species (Budew was used here) with 840, 841, 842, 1011,
  1019; then the art through Import art and the Rig Editor, Icon and stills, and the cry import; evolutions on the
  species page with stand-in items and moves. Add them in order (Applin first) so the IDs follow the line.
- Not tested live: a `"pokedex": false` or retired species' catch; the blank template in game (both done in step 5,
  section 17.2).

## 17. Built: step 5, followers, encounters, the Wonder Trade and the musical (2026-11-13)

### 17.1 What changed

| Where | What |
| --- | --- |
| `pokemon_species.py add`/`reuse` | copy the template's followers (`res/field/actors/followers/<template>[_shiny][_female][_female_shiny]/`, every file) as `<name>…/` with `"species"` its own and form 0, and a `"sprite"` that names another copied follower's code (Pignite's female shows `OBJ_CODE_FOLLOWER_PIGNITE`) renamed to the copy's; their `OBJ_CODE_FOLLOWER_<NAME>…` codes go after the last follower code (`pokemon_form.add_obj_codes`). `--no-follower` copies none; the blank template has none. The report's `followers` says how many |
| `pokemon_species.py remove`/`reuse` | delete the species' own followers, their codes and its follower dialogue file (`res/paperwhite2/following/dialogue/species/<name>.json`) instead of refusing; still refused while another file names the species or one of those codes, or while its encounters file (`res/paperwhite2/encounters/species/<name>.json`, which names it by file name) places it in the wild |
| `pokemon_species.py follower SPECIES --from X \| --none` | an added species' followers replaced by copies of X's, or removed (with its dialogue file); `info` lists each added species' followers |
| `paperwhite2_following_field.c` | **a lead without a follower stopped every follower** until the field was made again: `GetFollowerCode` gave 0, which the update took for an unreadable registry (`sConfigState = -1`). Now `SelectFollower` passes over a species without registry rows as it does an Egg (the next party member follows, L and R step past it). Only with added species (`PAPERWHITE2_SPECIES_ADDED_COUNT != 0`), so the ROM without them is unchanged |
| `btl_server_flow_sub.c` | a caught `"pokedex": false` or retired species no longer gets "X's data was added to the Pokédex." (the battle's `isNew`); the registration page and the bits were already skipped |
| `musical_mcss.c`, `PaperWhite2_GetMusicalSpecies` | the musical (`a/0/5/1`, Black and White's layout, with no record of an added species in their personal data) shows an added species with its art template's musical sprite (`PAPERWHITE2_SPECIES_MUSICAL_SPECIES`, generated from `"art_template"`), whose bin file places the props. Section 3.5's plan (a group built from the battle sprite's files) doesn't work: the musical's bin file has a layout of its own (each cell's quads and the prop markers), which a battle sprite's `_info.bin` isn't. Its forms show the same |
| editor | the Add Pokémon dialog's **Follower: a copy of X's** (on by default, off and disabled for Blank; the dry run says when the template has none); the added species' **Follower** card (its followers, **Copy from** any species with **Copy**, **Remove**, **Open in the Follower Editor**, which opens on the species: `#tool/followers?species=`); `POST /api/pokemon-species/follower`. The Follower Editor already lists and edits an added species (#687 Testfol) |

Encounters and the Wonder Trade needed no change.

### 17.2 Proof (py-desmume, a copy of the user's save; shots in the scratchpad's `newsp5/shots/`)

Test species added with the tool: Testfol (687, No. 840, from Pikachu, 4 followers copied), Testnof (688, No. 841,
the blank template, no follower), Testhide (689, `"pokedex": false`, from Squirtle), Testret (690, from Charmander,
retired), Testnowt (691, No. 842, from Eevee, `--no-wonder-trade`); Testfol in Route 6's grass (common, all year).

- **Followers** (`follow_testfol_testnof_pignite_testnowt.png`): party lead Testfol: code 0x3a12, Pikachu's sprite
  follows; Testnof: the next member (Klink) follows; Pignite again: Pignite; Testnowt: Eevee's. Before the fix
  (`follow_before_fix_testfol_testnof_pignite_testnowt.png`), Testnof left `sConfigState` -1 and Pignite and Testnowt
  got none after it.
- **Wanderers:** in Route 6 the wanderer runtime asked `PaperWhite2_FollowingCodeFor(687)` and got 0x3a12, beside
  Hoothoot, Pikachu and others (a species without a follower gets 0 and makes no wanderer).
- **Wild:** Route 6's grass slots were `[585, 587, 163, 165, 417, 25, 459, 687]`
  (`PaperWhite2_Encounters_PrepareSlots`), and the second battle picked 687, Testfol Lv. 12 with Pikachu's sprite;
  caught: "Testfol's data was added to the Pokédex.", the registration page "No. 840 Testfol, Mouse Pokémon", its
  caught and seen bits (`wild_testfol_caught_registered.png`). The Habitat List's Route 6 grid has it, its Info page's
  Area tab gives grass, Lv. 5-30, Common, all seasons, times and weathers, and the DexNav's Route 6 grass lists
  "Testfol, Electric, 27.7%, Lv. 11-17, Caught" (`dex_habitat_dexnav_area_testfol.png`).
- **Forced catches:** Testhide and Testret: "Gotcha!", no "data was added" (after the fix), no registration page,
  straight to the nickname question, to Box 1, no Pokédex bits, SEEN/OBTAINED unchanged
  (`catch_testhide_no_dex_entry.png`, `catch_testret_no_dex_entry.png`). The blank template in battle: Testnof with
  the "?" sprite (`blank_template_battle.png`).
- **Wonder Trade:** with `PokeParty_CreatePkm` forced to 687 at Castelia's middle counter, Flaaffy traded for "Zippy"
  from Jacob, a Testfol Lv. 9 with Pikachu's moves and Static, its caught bit set (`wonder_trade_testfol.png`). The
  real planner (`WonderTrade_Plan`, built for the host) over 1,000,000 plans, sent levels 1-100: Testfol 1,625,
  Testnof 1,640 (each about 1/603), Testhide, Testret and Testnowt 0, IDs 650-686 0, no problems (100,000: 164, 179,
  0, 0, 0).
- **Musical:** warped into the Musical Theater with Testfol leading; the first visit's dress-up loads it as Pikachu's
  musical sprite (`PaperWhite2_GetMusicalSpecies(687)` = 25, character file 502), and three props dragged onto it
  attach at its markers (kinds 4-15 reported), "Is this look OK?" (`musical_dressup_testfol.png`). The stage itself
  wasn't run (the reception is a walk away); it uses the same loader.
- **Editor** (port 7482): `ed01`-`ed05` (the dialog's Follower row with Budew, off, Blank; the Follower cards of
  Testfol and Testnof; the Follower Editor on #687 Testfol). `npm run typecheck`, `npm test` (the new follower test:
  copies, codes, Pignite's renamed sprite, `--no-follower`, Blank, `follower --from/--none`, the dialogue file and a
  code's referrer, reuse dropping the old followers), `npx vite build`.
- Removed with the tool (Testfol first refused for its encounters file): `res/` and `generated/` as before, and after
  `configure.py w2_us --hack` (the deleted follower folders were `build.ninja`'s dependencies, so ninja alone stops;
  the editor's Build runs configure) the ROM is `57cd9af0dfab0e720e9d82e3e12298a1c1cd904d`.

### 17.3 For step 6 (the Applin line)

- `generated/obj_codes.txt` already has walking sprites `OBJ_CODE_POKEMON_APPLIN`, `_DIPPLIN` and `_HYDRAPPLE` (the
  user's, rows after the followers'): Applin's, Dipplin's and Hydrapple's followers can be added from a template and
  their `"sprite"` pointed at those codes in the Follower Editor (Flapple and Appletun have none yet).
- Add them in order from a Grass template that has followers (Budew), so the followers come with them; Remove refuses
  while an evolution or encounters file names one, so take the line apart from the last.
- Encounters: an encounters species file each (the Encounter Editor makes it); the wild, the Habitat List, the Area
  tab and the DexNav then follow.
- The musical shows each with its art template's musical sprite until musical art of its own is supported (a group
  appended to `a/0/5/1` with a musical bin, section 3.5, would need that bin written).
- Still open: the stage of a musical with an added species (only the dress-up was run); the Repeat Ball never boosts a
  `"pokedex": false` species (never "caught" in the Pokédex).

## 18. Built: step 6, the Applin line (2026-11-13)

### 18.1 What was added

The five species with `pokemon_species.py add NAME --from SPECIES_BUDEW --number N`, in order, so the IDs follow the
line; then their data written into each `data.json` (validated by the schema), their evolutions, three new items and
the followers' sprites.

| ID | Constant | No. | Types | Abilities (slot 1 / slot 2 / hidden) | Evolves |
| --- | --- | --- | --- | --- | --- |
| 687 | `SPECIES_APPLIN` | 840 | Grass/Dragon | Harvest\* / Gluttony / Soundproof\* | Tart Apple → Flapple, Sweet Apple → Appletun, Syrupy Apple → Dipplin (`EVO_METHOD_ITEM`) |
| 688 | `SPECIES_FLAPPLE` | 841 | Grass/Dragon | Harvest\* / Gluttony / Hustle | |
| 689 | `SPECIES_APPLETUN` | 842 | Grass/Dragon | Harvest\* / Gluttony / Thick Fat | |
| 690 | `SPECIES_DIPPLIN` | 1011 | Grass/Dragon | Illuminate\* / Gluttony / Sticky Hold | → Hydrapple: level up knowing Focus Energy\* (`EVO_METHOD_KNOWS_MOVE`) |
| 691 | `SPECIES_HYDRAPPLE` | 1019 | Grass/Dragon | Illuminate\* / Regenerator / Sticky Hold | |

\* a stand-in (18.2).

- **The game's numbers** are Sword/Shield's and Scarlet/Violet's in Gen 5's fields:
  - base stats (HP/Atk/Def/SpA/SpD/Spe): Applin 40/40/80/40/40/20, Flapple 70/110/80/95/60/70, Appletun
    110/85/80/100/80/30, Dipplin 80/80/110/95/80/40, Hydrapple 106/80/110/120/80/44;
  - catch rates 255/45/45/45/10; EV yields Defense 1, Attack 2, HP 2, Defense 2, Sp. Atk 3; base experience
    52/170/170/170/270;
  - half male, egg groups Grass and Dragon, 20 hatch cycles, Erratic growth, colour green, no wild held items;
  - height and weight 0.2 m 0.5 kg, 0.3 m 1.0 kg, 0.4 m 13.0 kg, 0.4 m 9.7 kg, 1.8 m 93.0 kg;
  - base friendship 70 for the Gen 8 three, 50 for Dipplin and Hydrapple (Gen 9's);
  - categories as the real ones ("Apple Core", "Apple Wing", "Apple Nectar", "Candy Apple", "Apple Hydra");
  - Pokédex shapes chosen: Applin serpentine (12), Flapple one pair of wings (11), Appletun quadruped (4), Dipplin and
    Hydrapple multiple bodies (1).

  They were written from memory, not copied from a file: check them (and the learnset levels) against a reference
  before a release.
- **Pokédex entries are short original placeholders**, not the official text, for the user to rewrite (the editor's
  Pokédex card, or `pokedex.entry`).
- **Learnsets** follow the real level-up lists with Gen 5 moves, the post-Gen-5 moves replaced (18.2).
  - Gen 5 has no "move learned on evolving", so the evolution moves (Flapple's Wing Attack, Appletun's Headbutt,
    Dipplin's Double Hit, Hydrapple's Fickle Beam stand-in) are level-1 moves, which come from the Move Reminder.
  - On evolving, a Pokémon learns its new species' move of its current level, as before (an Applin at 24 became a
    Flapple that learned Dragon Dance).
  - TM, HM and tutor compatibility is a Gen 5 approximation (Gen 5's TMs aren't Gen 8/9's).
  - Applin's egg moves: Defense Curl, Dragon Rush, Recycle, Rollout and Sucker Punch; the line's eggs hatch as Applin.
- **Art, icon, footprint, cry, musical:** Budew's copies (`"art_template": "SPECIES_BUDEW"`), placeholders until the
  user draws them (the Rig Editor, Icon and stills, the Cry card, which says "a copy of Budew's").
- **Followers:**
  - Applin, Dipplin and Hydrapple's followers (all four of each: plain, shiny, female, female shiny) show the user's
    walking sprites `OBJ_CODE_POKEMON_APPLIN`, `_DIPPLIN`, `_HYDRAPPLE`: 8 frames, so `"animation_profile":
    "asymmetric"` and sprite controller 14, as the user's Purrloin. They have no shiny palette, so a shiny follower
    looks plain.
  - Flapple's and Appletun's followers are still Budew's copies.
  - Hydrapple's sprite is tall and stands close behind the player: its `gap` may want raising in the Follower Editor.
- **Pokédex and Wonder Trade:** in both (no `excluded_species`; the Wonder Trade's pre-evolutions give Applin for
  Flapple, Appletun and Dipplin, and Dipplin for Hydrapple).
- **No wild encounters:** each needs an encounters species file from the Encounter Editor
  (`res/paperwhite2/encounters/species/<name>.json`) before the wild, the Habitat List, the Area tab and the DexNav
  show it.
- **The apples** (`docs/paperwhite2/items.md`): `ITEM_TART_APPLE`, `ITEM_SWEET_APPLE`, `ITEM_SYRUPY_APPLE`, unused
  items 120-122, used from the bag as stones are (no code: `effects.evolve`). Not placed in the world; the debug menu's
  Items... > Give item... (120, 121, 122) gives them, and Party... > Give Pokémon... (687-691) the species.

### 18.2 The stand-ins

Gen 5 has none of the line's own moves and abilities (section 9). Each stand-in is the nearest Gen 5 thing; replace it
when the real one exists. All are in the species' `data.json` (`abilities`, `hidden_ability`, `learnset.by_level`,
`evolutions`).

| Real (Gen 8/9) | Who | Stand-in (Gen 5) | Why this one |
| --- | --- | --- | --- |
| Ripen (ability: doubles a Berry's effect) | Applin, Flapple, Appletun, slot 1 | Harvest | Gen 5's other Berry ability (may restore a used Berry): the nearest Berry effect |
| Bulletproof (ability, Gen 6: immune to ball and bomb moves) | Applin, hidden | Soundproof | the same kind of effect, immunity to one class of moves |
| Supersweet Syrup (ability: lowers the foes' evasion on entering, once a battle) | Dipplin, Hydrapple, slot 1 | Illuminate | no Gen 5 entry ability lowers evasion, and Intimidate would be far stronger; Illuminate does nothing in battle and raises wild encounters in the field, as Sweet Scent does, which the syrup echoes |
| Grav Apple (Grass, physical 80, lowers Defense) | Flapple, level 32 | Seed Bomb | Grass, physical, 80 |
| Apple Acid (Grass, special 80, lowers Sp. Def) | Appletun, level 28 | Energy Ball | Grass, special, 90, may lower Sp. Def |
| Body Press (Fighting, physical 80, uses Defense) | Appletun 24, Hydrapple 36 | Body Slam (Appletun), Heavy Slam (Hydrapple) | no Gen 5 move uses Defense; a bulky physical move at the same level |
| Syrup Bomb (Grass, special 60, lowers Speed for 3 turns) | Dipplin, Hydrapple, level 24 | Magical Leaf | Grass, special, 60, without the Speed drop |
| Dragon Cheer (Dragon status: raises the allies' critical-hit ratio) | Dipplin, Hydrapple, level 1 (Move Reminder) | Focus Energy | the same effect on itself, Gen 5's critical-hit move |
| Fickle Beam (Dragon, special 80, sometimes double power) | Hydrapple, on evolving (level 1) | Dragon Pulse | Dragon, special, 85 |
| Dipplin → Hydrapple: level up knowing Dragon Cheer | Dipplin's evolution | level up knowing Focus Energy (`EVO_METHOD_KNOWS_MOVE`) | the method exists (Aipom, Yanma); Focus Energy is Dragon Cheer's stand-in, and Dipplin learns it only at level 1, from the Move Reminder (Mistralton City, a Heart Scale), never by accident on levelling |

The apples aren't stand-ins but new items; their icons are placeholders (copies of the Rindo, Sitrus and Tamato
Berries'), as are every species' art, icon, cry and footprint (Budew's) and Flapple's and Appletun's followers.

### 18.3 Proof (py-desmume, a copy of the user's save; shots in the scratchpad's `newsp6/shots/`)

- **Given by the debug menu:** Give Pokémon 687 ("Applin joined the party.", `debug_give_applin`) and 690
  (`debug_give_dipplin_number`), both level 24; Give item 122 ("Item 122: Syrupy Apple", "Put Syrupy Apple x1 in the
  Bag.", `debug_give_item_syrupy_apple`, `debug_gave_syrupy_apple`).
- **Summary:** Applin, Dex No. 840, Grass/Dragon, Gluttony, Withdraw and Astonish, Budew's sprite
  (`summary_applin_840`, `summary_applin_ability_moves`); the Dipplin, No. 1011, with DragonBreath, Protect, Bullet
  Seed, Magical Leaf (`summary_dipplin_1011`).
- **Apples**, from the bag, with three copies of the Applin in the party:
  - the party list shows ABLE on the Applins only (`bag_tart_apple_party_able`; the description, `bag_tart_apple`);
  - Tart Apple: "Your Applin evolved into Flapple!" (688), "Flapple learned Dragon Dance!"; Sweet Apple: Appletun (689,
    Body Slam); Syrupy Apple: Dipplin (690, Magical Leaf); one apple used each time (`evolve_tart_apple_flapple`,
    `evolve_sweet_apple_appletun`, `evolve_syrupy_apple_dipplin`);
  - on Pignite (and every non-Applin UNABLE): "It won't have any effect.", none used (`apple_no_effect_pignite`).
- **Dipplin → Hydrapple:** a Rare Candy on the Dipplin taught Focus Energy: level 25, "Your Cheery evolved into
  Hydrapple!" (691; `CheckEvolveSpecies`' level mode); its summary No. 1019, Regenerator (the slot-2 ability carried
  over), Focus Energy kept (`evolve_hydrapple_knows_focus_energy`, `summary_hydrapple_1019`,
  `summary_hydrapple_ability_moves`). Rare Candies on the other Dipplin, without it: 24 → 28, four level-up checks, no
  evolution (`dipplin_without_focus_energy_no_evolution`).
- **Pokédex:** the evolutions set seen and caught for 687-691 (SEEN 66, OBTAINED 19); the National list ends 647
  Keldeo, 648 ?????, 649 ?????, 840 Applin, 841 Flapple, 842 Appletun, 1011 Dipplin, 1019 Hydrapple
  (`dex_list_840_1019`); the Info pages of 1019 Hydrapple (Apple Hydra Pokémon, 5'11", 205.0 lbs., BST 540), 1011
  Dipplin and 842 Appletun (`dex_info_*`).
- **Followers** (the lead's species set in turn): codes 0x3a12 Applin, 0x3a1e Dipplin, 0x3a22 Hydrapple with the user's
  sprites, 0x3a16 Flapple and 0x3a1a Appletun with Budew's, then Pignite again (`followers_zoom`).
- **Battle** (Route 6, the wild Pokémon forced to 687): a wild Applin Lv. 5 against the Hydrapple, Budew's sprites,
  Applin's cry asked as wave archive 691; DragonBreath "It's super effective!" (Dragon on Grass/Dragon), "The wild
  Applin fainted!" (`battle_hydrapple_vs_wild_applin`, `battle_super_effective`).

ROM `ff789030223a1c4777c070fc539f03604e0c415b`; `verify_dsi_rom.py` intact. The editor's tool tests used Applin and
Flapple as scratch names, which now exist: they use made-up names and numbers and take the next ID from `info`.

Not run: the Pokédex Info page's Evo tab for the line (`pokedex_evo.py` builds it from the data), the Day Care, a Wonder
Trade receiving one, the musical, the plain (matching) build.
