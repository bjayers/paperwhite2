# New forms and new species

Research for adding forms to existing species (first the Spiky-eared Pichu, Pichu's form 1, which can't evolve and
whose eggs are plain Pichu, as in HeartGold and SoulSilver; later regional forms with their own types, abilities,
moves, stats and sprites) through an editor flow "Add form" that copies the species' data as a template, and, much
later, whole new species. Everything here was read from the source, the packers and the extracted White 2 archives
(`extract/w2_us/files/`); what is inferred and not traced is marked so. Battle sprite formats and the rig are in
[battle-sprites.md](battle-sprites.md), which this document doesn't repeat.

## 1. Summary

- **One form fits everywhere, with work in four places.** The save has room (the Pokédex's form bits have 5 free),
  the box data's form field is 5 bits, and the personal, learnset and icon archives take a new form at their ends.
  The work: the battle sprite archive is full where a new form group would go (`a/0/0/4`), the graphics packer can't
  add archive members, the Pokédex's form text is reached through a raw table that nothing packs (`a/0/9/7` file 0),
  and "can't evolve" needs a hook, since evolutions are read by species only.
- **Save capacity:** `seenForms`/`shownForms` hold 88 bits per list, 83 used, so 5 bits are free. Pichu needs 2,
  which leaves 3. More forms than that, or any new species in the Pokédex, mean resizing `PokeDexSave`. That changes
  the Pokédex save block and every block after it, which breaks old saves.
- **Nothing blocks the Pichu form.** Breeding already resets the form, and the Wonder Trade already has a
  disabled Spiky-eared Pichu reward that waits for it.
- **Verdict on new species: possible, but a project of its own.** IDs 650 to 684 are the egg, the bad egg and the 33
  Pokéstar Studios props. Every archive puts the egg, the forms or the Substitute right after those IDs, so a species
  at 685 collides in the personal, sprite, icon and cry tables. About 40 checks are hard-coded to Genesect or 649.
  The Pokédex save holds bits for species up to 672 only.
  - Species outside the Pokédex (the roguelike creatures) can follow the Pokéstar species' model, which is cheaper.
  - Pokédex species need the save extended and, sensibly, the egg and Pokéstar IDs moved to the end.
  - "New species as forms of a placeholder" doesn't work for real species: the name, the Pokédex entry and
    evolutions are all per species.

## 2. How forms work today

- **Personal records** (`a/0/1/6`, 0x4c bytes, `PersonalData` in `include/pml/personal.h`):
  - species 0 to 684 come first, then the 24 form records 685 to 708, in the order of `res/pokemon/forms.json`.
  - Then comes file 709, the Unova Pokédex numbers. Its index is hard-coded as `PERSONAL_FILE_REGIONAL_DEX 709` in
    `src/system/poke_personal.c:17`.
  - A species' form 0 record holds `formFile` (u16 at 0x1c, the first form record), `formSpriteOffset` (u16 at
    0x1e) and `formCount` (u8 at 0x20). Bit 7 of 0x21 is `palette_forms` (Arceus).
  - `PML_PersonalGetDatID` (`poke_personal.c:186`) returns `formFile + form - 1` for a form below `formCount`, and
    the species' own record when `formFile` is 0. So a form without a record of its own uses the species' data:
    Unown, Shellos, Deerling and Genesect work this way.
  - `species_data.py` sets `formFile` from `forms.json`; `forms.count` and `forms.sprite_offset` come from the
    species' `data.json`.
- **Valid forms:** `PML_PkmSanitizeForme` (`src/system/poke_tool.c:2609`) clamps a form to the record's
  `PERSONAL_FORM_COUNT`. The egg allows 2. No per-species maximum exists anywhere else in PML.
- **Sprites and icons:** a form's group is `sprite_offset + form - 1` past the forms' base:
  - `GetPokemonDataIDBase`, `src/system/pokegra.c:268`;
  - `PokeParty_GetIconIndex`, `src/system/poke_icon.c:116`;
  - species whose forms only change the palette (`palette_forms`) use the palette block instead.
  - Offsets 0 to 65 are taken. Genesect's 62 + 4 forms is the last.
- **Shared sprites:** `PML_PkmGetSpriteForme` (`poke_tool.c:2623`, `sSharedSpriteFormSpecies`) draws form 0 for
  Castform, Cherrim, Darmanitan and Meloetta.
- **The box data:** `u8 form : 5` (`include/pml/poke_party.h:92`), so a species has at most 32 forms. Other widths:
  - `BattleMon.form`: u8;
  - battle videos: 7 bits (`battle_rec.c:255`);
  - icon packing (`PokeIcon_PackSpecies`): 4 bits, or 6 for Unown and Arceus;
  - Pokédex search entries: 6 bits form, 10 bits species (`pokedex_search_engine.c:25`).

## 3. Every table keyed by species or form

The archive numbers are White 2's. "Raw" means `configure.py` copies the original file and no packer builds it.

### 3.1 Pokémon data

| Data | ROM | Source and packer | Index | Count | One new form | One new species (ID 685+) |
| --- | --- | --- | --- | --- | --- | --- |
| Personal records | `a/0/1/6` | `res/pokemon/*/data.json`, `form_<n>.json`, `forms.json`; `species_data.py` | species, then form records, then the Unova Pokédex table | 710 | Optional record (a type, stat or egg group change needs one). Append it to `forms.json` and raise `PERSONAL_FILE_REGIONAL_DEX` to 710 | The records 685+ are the forms'. Moving them is safe for the data (`formFile` is a pointer the packer sets), but `PERSONAL_FILE_REGIONAL_DEX` must follow |
| Level-up learnsets | `a/0/1/8` | `learnset.by_level`; `species_data.py` | as personal, by `PML_PersonalGetDatID` | 709 | Comes with the form record | As personal |
| Evolutions | `a/0/1/9` | `evolutions`; `species_data.py` | **species only** (`evolution_check.c:295`, `getEvolutionInfoParam`) | 709 (the forms' entries are packed but nothing reads them) | No effect: see section 5 | As personal |
| Baby species | `a/0/2/0` | `baby_species`; `species_data.py` | species, read only for `species < SPECIES_GENESECT` (`day_care.c:1085`) | 685 | None | Raise the day care's bounds |
| Egg moves | `a/1/2/4` | `learnset.egg_moves`; `species_data.py` | species only | 650 | None: egg moves are per species | Add an entry |
| TM and tutor bits | in the personal record | `by_tm`, `by_tutor` | per record | | Comes with the record | Comes with the record |
| Growth tables | `a/0/1/7` | `growth_rates.csv` | rate | 8 | None | None |
| Cry volume | `a/1/9/1` | `cry_volume`; `pokemon_cries.py` | species | 685 | None (forms use the species' volume) | Add an entry |
| BW1 personal (the musical's) | `a/3/0/2` | raw | Black and White's | | None: the musical draws form 0 (`musical_mcss.c:738`) | Collides with the musical's egg at 650 |

### 3.2 Text (`a/0/0/2`, `tools/text/text_sources.py`, `species_data.py:46-60`)

| Data | File | Index | One new form | One new species |
| --- | --- | --- | --- | --- |
| Names, names with article, categories, entries | 90, 483, 464, 442 | species from 0 | None | Append a line (names run on past the Pokéstar species) |
| Heights and weights as shown | 451, 471 | species, an empty line, then the alternate forms in species order (`pokedex.forms`) | Insert lines at Pichu's place (slot 651), which shifts every later form's line | Add lines |
| Other languages | 444-477, 490-494 | species up to Arceus (`POKEDEX_LANGUAGE_SPECIES_MAX 493`); Giratina's and Shaymin's form sizes | None (forms show the game's language only) | None |
| Form names | bank 450, `res/text/system/pokedex_detail_form.txt` (hand-written, 733 lines) | 0-649 the species' first form, 650 empty, 651-732 the form slots | Name Pichu's form 0 (its line 172 is empty) and add a slot line | Add lines |
| Easy Chat words | PMS | species words 0-651, then moves (`tools/text/pms_words.py:27`) | None | Adding words shifts every later word ID: keep new species out of Easy Chat |

The form slots are linked through **`a/0/9/7` file 0**, a raw, LZ-compressed table of 733 u16:
- It is a "next form" chain: `t[species]` gives the slot of form 1, and `t[slot]` gives the next form's slot.
- It is read by `pokedex_detail_form.c:1275`, `pokedex_info.c:1080-1089` and the hack's
  `paperwhite2_pokedex_info_flavour.c:207`.
- Its slots are in the same species order as the generated height, weight and entry lines (`t[201] = 651` for Unown).
- Because the lines are generated and the chain isn't, adding a Pichu form desyncs every form after it unless file 0
  is rebuilt.
- File 2 (body shapes, 733 bytes, by species and then slot, `pokedex_search_engine.c:336`) is indexed the same way.

### 3.3 The Pokédex app (`a/0/9/7`, raw, 10 files)

| File | Contents | One new form | One new species |
| --- | --- | --- | --- |
| 0 | the next-form chain above | Add a slot; rebuild | Extend |
| 1 | initials, by species (650 B) | None | Add |
| 2 | shapes by species and slot (733 B) | Add a slot | Add |
| 3 | 1 to 649 | None | Extend |
| 4 | the national order (649 u16) | None | Add |
| 5 | alphabetical (649 u16), also used by `box_search.c:2349` and the GTS | None | Insert, then recompute the A to Z tables in `box_search.c:390-399` and `worldtrade_deposit.c:137, 897` |
| 6-9 | height and weight orders, 731 u16 each (649 species + 82 forms, `form << 10 \| species`) | Add one entry to each, sorted | Add |

Other Pokédex data:
- **Area maps:** `a/1/7/6`, raw, file `species - 1`, 684 files (`pokedex_detail_map.c:2125`).
- **Footprints:** `a/1/6/5` (5 shared files, then by species). The form footprints are `a/2/2/9`, which only
  Giratina, Shaymin, Kyurem ×2, Keldeo and the Therian forms have (`PokedexInfo_GetFootprintFormFile`,
  `pokedex_info.c:2060-2085`, and the packer's `FORM_FOOTPRINTS`). A form without its own footprint shows its
  species'.
- **The form list:** `pokedex_detail_form.c:1708-1714` reads `PERSONAL_FORM_COUNT`, then replaces it with
  `getNumberOfForms`, the Pokédex's own `pokemonFormList` (section 4). A form missing from that list is never shown.
- **Off-centre sprites:** a per-species position table at `pokedex_detail_form.c:471`.

### 3.4 Graphics (`tools/data/pokemon_graphics.py`)

| Data | ROM | Layout | One new form | One new species |
| --- | --- | --- | --- | --- |
| Battle sprites | `a/0/0/4`, 15,065 members | 20 per group: species 0-649 and the Pokéstar species as `species - 2`, egg 683, Manaphy egg 684, form groups 685-750 (`POKEGRA_FORM_FILES` 0x3584), Substitute 15,020-15,032, Arceus palettes 15,033+ (`POKEGRA_FORM_PALETTES` 0x3ab9) | Group 751 is where the Substitute is. Either move the Substitute and Arceus' palettes, or add a hack base after them for `sprite_offset >= 66` ([battle-sprites.md](battle-sprites.md) section 6). The packer must learn to add members | `species - 2` = 683 is the egg's group: needs a base of its own |
| Shiny palettes | slots 18 and 19 of each group (`normal.pal`, `shiny.pal`) | per group | Come with the group | Same |
| Icons | `a/0/0/7`, 1,510 = 8 shared + 2 × 751 | species × 2, egg 683, Manaphy egg 684, forms from 685 | **Appending is free**: group 751 is the archive's end | 685 is the forms' first |
| Icon palette banks | `sPokeIconPalettes`, `poke_icon.c:45`, 756 bytes | species, eggs at 685-686, forms at `686 + sprite_offset + form` | One byte (index 753) | Collides with the eggs and forms |
| Musical sprites | `a/0/5/1` | Black and White's layout (`musical_mcss.c:114`) | None (shows form 0) | Collides |
| Footprints | `a/1/6/5`, `a/2/2/9` | above | None for the Pichu form | Add one; species past Arceus use the new cell set |

### 3.5 Sound (`res/sound`, `tools/data/pokemon_cries.py`, `src/system/pm_voice.c`)

- **Cries:**
  - Wave archives 1-684 are the species' cries by number (`getResIDFunc`, `pm_voice.c:515`; `POKE_VOICE_SPECIES_MAX 684`).
  - 685-690 are the six form cries in `POKE_VOICE_EXTRA_ENTRIES` (Sky Shaymin, Kyurem ×2, the three Therian forms).
  - The music's wave archives start at 1000 (`WAVE_MUS_WB_SOUNDLIST`), so 691-999 are free.
  - **Pichu's form uses Pichu's cry:** nothing to add.
  - A form with its own cry needs a wave archive in 691-999, a row of `POKE_VOICE_EXTRA_ENTRIES`, and a
    `form_<n>/cry.wav`, with the sound packer taking the new slot.
  - A species above 684 gets cry 1 (`getResIDFunc` returns 1 past the maximum), so new species need that bound
    raised and a mapping past the form cries.
- Every cry's wave archive must fit `POKE_VOICE_BUFFER_SIZE` 0x5c30.

### 3.6 Field, battle and other per-species tables

| Data | Key | One new form | One new species |
| --- | --- | --- | --- |
| Wild slots (`a/1/2/7`, `encounter_data.py:56`) | 11-bit species, 5-bit form | As data | Fits |
| Trainers, facilities, in-game trades (`trainer_data.py:72`, `facility_data.py:68`, `trade_data.py:41`) | species + form | As data | Fits |
| Walking Pokémon (`a/2/0/8`, raw, `tpoke_data.c:15`) | species, sex, form | Only to walk in the original system | Same |
| Battle regulation bitfield (`scrcmd_fld_battle.c:20`, `REGULATION_SPECIES_COUNT 686`) | species | None | Extend |
| Medal types (`a/2/3/9`, raw) | list of 301 | None | Optional |
| Evolution demo sprite heights (`evolution_demo_view.c:545`) | species | None | Optional |
| Pokéstar cast (`event_pokewood.c:55`) | 652-683, names at `species - 488` | None | None for 685+ |

### 3.7 The hack's own systems

| System | Key, limits | One new form | One new species |
| --- | --- | --- | --- |
| Following Pokémon | `res/field/actors/followers/<name>/data.json` (2,574 rows and 348 sprites, tracked); `a/0/4/7` rows 1008+, sprites `a/0/4/8` 975+; registry `a/0/4/7` member 1, key `species*2048 + form*8 + sex*2 + shiny` (`following_data.py:39`). `FindFollowerRow` (`paperwhite2_following_field.c:1637`) falls back to form 0 when a form has no row | Add `pichu_form_1[_female][_shiny]` folders with `"form": 1` (a sprite of its own, or a `"sprite"` reference); the packer appends | `FOLLOWING_MAX_SPECIES 649` (`include/paperwhite2/following.h:21`) blocks the registry, the trail (`following_trail.c:11`), reactions (`:228`) and `sIndex`; wanderers use the same lookup (`paperwhite2_wanderers.c:519`) |
| Follower dialogue | `a/0/4/7` member 4, by species; index sized to the highest species + 1 | None | Add a file |
| Wonder Trade | `services.json` → `tools/paperwhite2/pokemon_center.py` → a generated header. `LAST_SPECIES = SPECIES_GENESECT` (`:70`) sizes the exclusions and per-species tables; `wonder_trade.forms` has at most 32 species, one weight per `forms.count`, totals ≤ 255 (`FormSpecies.first` is a u8). `special_reward` is the Spiky-eared Pichu slot, `enabled: false`, made through `PokeParty_ChangeForme` (`paperwhite2_wonder_trade.c:406`) | Set `special_reward.form` to 1 and enable it. A `wonder_trade.forms` entry for Pichu, if one is ever added, must list 2 weights | Raise `LAST_SPECIES` and the schema's `excluded_species` `maxItems 649` |
| Encounters, Habitat Dex, DexNav | `species.schema.json` `form` 0-31; `EncountersCandidate`, `EncountersOutbreak`, `HabitatDexEntry` carry `u8 form`; DexNav icons and types per form (`paperwhite2_dexnav.c:276`); the wanderer byte table is per species up to `ENCOUNTERS_SPECIES_MAX 1024` | `"form": 1` in `res/paperwhite2/encounters/species/pichu.json` where it should appear | Fits, but has no overworld sprite (followers) |
| Pokédex Info Form button | `PokedexInfoPage_NextForm` (`paperwhite2_pokedex_info.c:1518`), `getNumberOfForms × 2` looks filtered by `PokeDex_HasSeenVariant` | Follows the vanilla form list | |
| Pokédex sprite middles | `a/1/5/7` member 161, a byte per `a/0/0/4` member up to `SPRITE_MEMBERS = 15020` (`tools/paperwhite2/pokedex_sprites.py:35`) | Grows with `a/0/0/4`; follow the chosen layout | Same |
| Pokédex Evo page | member 159+ (`pokedex_evo.py:105`), roots per species up to Genesect; children from `ARCID_EVOLUTIONS` by species (`paperwhite2_pokedex_info_evo.c:340, 360`); a family has at most 8 | No form evolutions shown | Raise the caps |
| Pokédex flavour and area | member 166 (`dex_flavour.py:157`, `LAST_SPECIES = 649`), member 162 (`encounters.py:727`); C bounds at `paperwhite2_pokedex_info_flavour.c:252, 262` and `paperwhite2_pokedex_info_area.c:558` | None (per species) | Raise the caps |
| Conditions | `species \| (form + 1) << 11`, species ≤ 2047, form ≤ 30 (`include/paperwhite2/conditions.h:124`) | Fits | Fits |
| Debug menu | pickers to `SPECIES_GENESECT` (`paperwhite2_debug_commands.c:133, 141`); `GivePokemon` has no form; Fill Pokédex loops to Genesect | A form parameter for Give would help testing | Raise |
| Prestige, trainer scaling, difficulty, move tutors, field moves | go through personal data per form | Nothing | Nothing |

## 4. Save data capacity

**Superseded (2026-11-12):** the Pokédex's save is now the hack's own area in the Pal Pad's block, with room for 1504
species and 1024 forms a list, and its form directory is generated from `res/pokemon` and remapped in old saves on
load (`save-expansion.md` section 11). What follows is the original block, which the area mirrors at each save.

`PokeDexSave` (`include/save/pokedex_savedata.h`, 0x4dc bytes, `SAVE_BLOCK_POKEDEX` in `src/system/save_table.c:122`):

| Field | Size | Use | Free |
| --- | --- | --- | --- |
| `caught`, and `seen` and `shown` (×4 each: male, female, shiny male, shiny female) | `POKEDEX_SPECIES_BYTES` 0x54 = 672 bits each, bit `species - 1` | 649 | 23 bits each (species 650-672) |
| `seenForms`, `shownForms` (×2: normal, shiny) | `POKEDEX_FORM_BYTES` 0xb = 88 bits each | 83, at cumulative offsets of `pokemonFormList` (`src/system/pokedex_savedata.c:71`) | **5 bits each** |
| `languages` | 0x1b0 bytes, 7 bits per species | species up to 493 | none needed: forms and new species have no languages |
| `spindaPersonality`, header bits | | | `unused4_22`: 10 bits |

`pokemonFormList` lists 21 species (Unown 28, Deoxys 4, Shaymin 2, Giratina 2, Rotom 6, Shellos 2, Gastrodon 2, Burmy 3,
Wormadam 3, Castform 4, Cherrim 2, Deerling 4, Sawsbuck 4, Meloetta 2, Darmanitan 2, Basculin 2, Kyurem 3, Keldeo 2,
Thundurus 2, Tornadus 2, Landorus 2 = 83). Arceus and Genesect aren't in it, so the Pokédex never lists their forms.

- **The Pichu form:** append `{ SPECIES_PICHU, 2 }` **at the end**, before `{ 0, 0 }`. It takes bits 83 and 84 of
  each list. Inserting it at Pichu's place in species order would shift every later species' bits and corrupt the
  forms seen in existing saves. 3 bits remain.
- **N more forms:**
  - Up to 3 more bits fit, for example one more two-form species with one bit to spare.
  - Beyond that, `POKEDEX_FORM_BYTES` must grow. That changes `sizeof(PokeDexSave)`, so the Pokédex block and every
    block after it move: **old saves stop loading correctly**.
  - The only save-compatible alternatives are a hack-owned save area of its own for extra form bits, if the hack
    has or gets one, or bits found in `unused4_22`: 10 bits, a stopgap only.
  - Either way the form bits stay keyed by `pokemonFormList`'s order, so new species must always be appended there.
  - The trade code copies the whole block (`pokemontrade_save.c:281`), which still works at a new size.
- **New Pokédex species:**
  - The 23 spare bits only cover species 650-672, which are the egg, the bad egg and the Pokéstar IDs.
  - A species at 685 needs bit 684, past the 672 bits, so it needs a larger `POKEDEX_SPECIES_BYTES` (9 lists, so
    9 bytes per 8 species), with the same save break.
  - `PML_PkmIsBadMonsNo` (`pokedex_savedata.c:134`, `species > SPECIES_GENESECT`) and every completion loop
    (`for (i = 1; i <= SPECIES_GENESECT; i++)`) must change too.
- **Other per-form save fields:** none. A Pokémon's form lives in its box data (5 bits); battle videos keep 7 bits.

## 5. Code assumptions about forms

### 5.1 Evolution

(Since built: an evolution's form condition, [form-evolutions.md](form-evolutions.md) section 12.)
- **The table is per species:** `CheckEvolveSpecies` (`src/system/evolution_check.c:35`) reads `ARCID_EVOLUTIONS`
  by species (`getEvolutionInfoFile`, `:294`), whatever the form. The packer writes form entries that nothing reads.
- **Every evolution goes through it:** level-up and battle return, trades (`pokemontrade_save.c:611`,
  `worldtrade_demo.c`), items (`plist_sys.c:2692`, `plist_item.c:561`), the field (`event_field_proclink.c:1016`)
  and the hack's link cord (`paperwhite2_link_cord_event.c:30`).
- **The form survives evolution:** the evolution demo calls `setChangedPkmSpecies` (`poke_tool.c:394`), which
  changes the species and recalculates the stats only.
  - So a regional form evolves into the same form number of the next species. Both species must then give the
    regional variant the same form number, or a hook must set it.
- **"Can't evolve" for one form:** one `#ifdef PAPERWHITE2` early return in `CheckEvolveSpecies`, next to the
  existing Everstone and egg checks: return 0 for `SPECIES_PICHU` with form 1.
  - That covers every path above.
  - For regional forms later, the general change is to read evolutions by `PML_PersonalGetDatID(species, form)`
    when the form has its own record: the form entries are already packed.
  - The Pokédex Info Evo page reads evolutions by species too (`paperwhite2_pokedex_info_evo.c:360`) and needs the
    same rule, so the Spiky-eared Pichu's tree doesn't show Pikachu.

### 5.2 Breeding
- **The egg's form is reset:** `zeroFormData` (`src/ov036/day_care.c:647`) sets it to 0. Only Shellos/Gastrodon,
  Burmy/Wormadam and Basculin pass theirs on (`:651-672`).
- **The baby is found by species:** `validateSpeciesAndGetOffspring` (`:1081`, `a/0/2/0`).
- **So eggs are plain Pichu already:** any egg from a Pikachu or Raichu line hatches as a form 0 Pichu.
- **Pichu can't breed:** it is `EGG_GROUP_UNDISCOVERED` in both groups (`res/pokemon/pichu/data.json`), so the
  Spiky-eared form can't breed either unless its own record gives it other groups.
  - In HeartGold and SoulSilver the Spiky-eared Pichu has Pichu's data. That it can't breed there is inferred from
    Pichu's egg groups and not checked against HGSS's data.
  - If the hack wants it to breed, a form record with Field and Fairy is enough: the day care reads egg groups per
    form (`day_care.c:429`) and the egg comes out as form 0.
- **Light Ball:** the check (`pichuLightBallHandler`, `:989`) is per species and unaffected.

### 5.3 HeartGold and SoulSilver behaviour to mirror
In HGSS the Spiky-eared Pichu can't evolve, and its eggs are plain Pichu. HGSS also stops it being traded to other
games or to the GTS (from memory, not checked). The hack's wireless trading is being removed, so only the first two
matter. It uses Pichu's cry, stats, moves and footprint.

### 5.4 Per-species form code
None of it reacts to a new Pichu form. All of it is keyed to one species, in `poke_tool.c`:
- `PML_PkmChangeForme`, `PML_PkmChangeRotomForme` (`ROTOM_FORM_COUNT 6`) and `setAbilityForForm`;
- the Kyurem, forces of nature and Keldeo checks (`:674-713`);
- Arceus' plates and Genesect's drives.

The battle's form changes are in ov167: Castform, Cherrim, Darmanitan, Meloetta, Shaymin's thaw and Giratina's Orb.
The field changes forms by season, for Shaymin and for Burmy (`src/ov012/season_form.c`, `shaymin_form.c`,
`burmy_form.c`). The box UI special-cases Shaymin and Kyurem. `PML_PkmSanitizeForme` is the only generic check, and
it reads `PERSONAL_FORM_COUNT`, so the form needs Pichu's `forms.count` set to 2.

The Pokédex keeps a form count of its own (`pokemonFormList`, `getNumberOfForms`). The battle-changing species are
special-cased in `getForm` (`pokedex_savedata.c:248-258`, all forms marked seen together), and a plain form is
marked seen on its own.

Wild forms: `enc_pokeset.c:649` chooses `WILD_ENC_FORM_RANDOM` or clamps the form to the count. The hack's encounters
name the form directly.

## 6. New species

### 6.1 What assumes 649 (or 684)

- **The ID space:** after Genesect (649) come `SPECIES_EGG` 650, `SPECIES_BAD_EGG` 651 and the Pokéstar species
  652-684 (`generated/species.txt`).
  - Each has a personal record, a name line, a sprite group (`species - 2`), an icon and a cry.
  - IDs from 685 collide with:
    - the form records (`a/0/1/6`);
    - the egg's sprite group 683 (`a/0/0/4`);
    - the form icons 685+ (`a/0/0/7`) and their palette banks;
    - the form cries 685-690.
- **Hard-coded bounds** (about 40), each to be raised or given a hack rule:
  - The Pokédex:
    - `POKEDEX_LIST_SPECIES_COUNT 649` (`include/app/pokedex_list_main.h:22`, which sizes `names[]`);
    - `NATIONAL_COUNT 649` and the national list built in code (`src/ov302/pokedex_search_engine.c:21, 263, 327`);
    - the save's loops and `PML_PkmIsBadMonsNo`;
    - `pokedex_info.c`'s `> SPECIES_ARCEUS` language and footprint switches (fine for new species).
  - Day care: `species >= SPECIES_GENESECT` (`day_care.c:1058, 1085`). This is off by one even for Genesect,
    a `// BUG:` candidate.
  - Mystery gift: `species > 649` (`include/app/mystery/mystery_gift_data.h:69`).
  - Battle videos: `> SPECIES_GENESECT` reads as 0 (`battle_rec.c:347`).
  - Game Sync, beacons, Funfest missions and the GTS (`gsync_*`, `game_beacon_accessor.c`, `fest_mission_beacon.c`,
    `worldtrade_deposit.c:37 MONSNO_TABLE_SIZE 650`, `cygnus_flow.c:1393`). These are wireless, so they can be
    ignored if wireless features are removed.
  - Scripts: `scrcmd_pokemon.c:311, 371` (`<= SPECIES_EGG - 1`) and `scrcmd_leaves.c:421`; the regulation
    bitfield (`REGULATION_SPECIES_COUNT 686`).
  - Easy Chat: `pms_input_data.c:658`.
  - Cries: `pm_voice.c:20` `POKE_VOICE_SPECIES_MAX 684`.
  - The hack: `FOLLOWING_MAX_SPECIES`, the Wonder Trade's `LAST_SPECIES`, the Pokédex Info Evo, Flavour and Area
    caps, `dex_flavour.py`, the debug pickers, and the editor's `NATIONAL_DEX_SIZE = 649`
    (`editor/src/modules/encounters/load.ts:93`).
- **Bit widths that cap the ID:**
  - icons pack 10 bits (1023);
  - Pokédex search entries 10 bits;
  - wild slots 11 bits;
  - conditions 11 bits.
  
  None blocks a few dozen new species.
- **Raw data that needs new packers:**
  - `a/0/9/7` (all 10 files);
  - `a/1/7/6` (area maps);
  - `a/3/0/2` and `a/0/5/1`'s layout (musical);
  - `a/2/0/8`.

### 6.2 Options

1. **Non-Pokédex species after the Pokéstar ones** (for uncatchable roguelike creatures).
   - The Pokéstar species are the precedent: they have records, sprites, icons, cries and names, but no Pokédex
     entry, no save bits and no Easy Chat word.
   - It needs:
     - the packers to place the form records, form sprite and icon groups, and form cries after the new species,
       or new hack bases for each, with `PERSONAL_FILE_REGIONAL_DEX` following;
     - `POKE_VOICE_SPECIES_MAX` raised;
     - the battle sprite base for `species > 684`;
     - each "is this a real species" check deciding what these are (the box, trading and the Pokédex should
       treat them as the Pokéstar species).
   - No save change is needed if they are never caught. If they can be caught, the box can hold them (u16
     species), but the Pokédex and every 649 check must know them.
2. **Pokédex species with the egg and Pokéstar IDs moved to the end** (for Applin's line or originals).
   - New species take 650, 651 and so on, so the Pokédex stays contiguous.
   - Moving the egg means:
     - about 32 uses of `SPECIES_EGG` and about 24 numeric 650/651 literals in `src/` and `include/`;
     - `POKE_VOICE_DIRECT_MIN 652`;
     - the Pokéstar cast table and its `species - 488` text index;
     - `JOIN_AVE_SPECIES_EGG 650` and the sprite and icon `species - 2` rule;
     - the PMS word IDs (species words come first, so new ones shift the moves');
     - every hard-coded alphabetical table.
   - **Eggs in old saves store species 650**, so the move needs a fresh save or a migration. A fresh save is needed
     anyway for the Pokédex bitfields, which grow by 9 bytes per 8 species.
   - This is the clean long-term route.
3. **New species as forms of a placeholder species:** not sane for real species.
   - The species name, nickname, Pokédex number and entry, category, egg moves, baby species, cry volume and
     evolutions are all per species.
   - The form cap is 32 and the Pokédex's form bits are nearly full.
   - It only suits throwaway battle-only creatures that never show a name of their own. Option 1 does that better.

**Risks:**
- Old saves break with any Pokédex resize.
- Raw archives need packers before they can grow.
- Wireless code paths reject the species unless removed.
- Easy Chat word IDs shift.
- Some bound may be missed: grep `SPECIES_GENESECT`, `649`, `650`, `684` and `685` again after each change.

## 7. The editor today

**Superseded (2026-11-12):** what follows is the editor before Add form; section 11.6 is the editor as built.

- **One panel edits species:** `editor/src/modules/pokemon/PokemonEditor.tsx`.
  - It has dedicated sections for:
    - `base_stats` and `ev_yields`;
    - `learnset.by_level`;
    - `evolutions` (at most 7);
    - a read-only family tree.
  - A generic schema form covers every other field of `species.schema.json` that the file already has:
    - names, types, abilities, the hidden ability and held items;
    - gender ratio, catch rate, base exp, growth rate, egg groups, hatch cycles, friendship, flee rate and colour;
    - height and weight, `evolution_stage`, `baby_species` and `regional_dex_number`;
    - `forms.count`/`sprite_offset` as bare numbers, `asymmetric`, `palette_forms`, `cry_volume`, `underground`
      and `name_article`;
    - `by_tm`, `by_tutor` and `egg_moves`, and the whole `pokedex`, including `pokedex.forms`.
- **It lists form records wrongly.**
  - The list comes from `api.data("res/pokemon/species.schema.json", ...)`, which also returns `form_<n>.json`.
  - It cuts the path as if every file were `<species>/data.json`, so `castform/form_1.json` shows as `castform/f`
    with no sprite (`PokemonEditor.tsx:254-269`).
  - Forms without records aren't listed.
  - Nothing reads or writes `forms.json`, or keeps `forms.count`, `sprite_offset`, `pokedex.forms` and `forms.json`
    in step.
- **Art:**
  - Sprites and icons are shown, not imported (`Sprite`, `SpeciesIcon.tsx`, species only).
  - Palettes, form ones included, are edited on the Palettes and Shinies pages.
  - Nothing touches `cry.wav` or `footprint.png`.
  - No server route copies binary files or folders.
- **The model for "Add form":**
  - New Map (`POST /api/new-map/create`, `server/main.ts:600`, which runs `tools/paperwhite2/new_map.py`, from
    `NewMapDialog.tsx`) copies a template's files through a Python tool.
  - `documents.create` (`editor/src/documents.ts:102`) holds new JSON unsaved until Save, as "Add a calendar" does
    in `WeatherEditor.tsx:225`.
- **Form pickers:**
  - Encounters show a 0 to `forms.count - 1` dropdown (`encounters/SpeciesPage.tsx:368`, `WildExtras.tsx:96`).
  - Trainers show a bare number (`TrainerEditor.tsx:142`).
  - Followers have variants by form (`followers/data.ts`).
  - The Wonder Trade's `forms` is only reachable through the generic Data files form.
- There is no "Import from ROM" for species yet.

**What an "Add form" flow must write:** `res/pokemon/<species>/form_<n>.json` (a copy of the species' record minus
`name`, `pokedex`, `baby_species`, `regional_dex_number`, `cry_volume` and `egg_moves`, which forms don't have),
a `forms.json` row, `forms.count` + 1 and, for a sprite form, `sprite_offset` in `data.json`, a `pokedex.forms` entry
(entry, height, weight), the form's name line, a `form_<n>/` folder copied from the species' art (the 20 battle
files' sources, `icon.png`, `normal.pal`, `shiny.pal`), the icon palette bank, and the follower folders. It must also
fix the list's path parsing so the new form shows under its species.

## 8. Checklist: add one form (the Spiky-eared Pichu)

Data (`res/`):
- [x] `res/pokemon/pichu/data.json`:
  - `forms.count` 2;
  - `forms.sprite_offset` 66, the next free; Pichu's own offset 0 is unused while its count is 1;
  - a `pokedex.forms` entry: entry, height `1'00"`, weight `4.4 lbs.`, the same as Pichu's.
- [ ] Optional `res/pokemon/pichu/form_1.json` and a `["SPECIES_PICHU", 1]` row **appended** to
  `res/pokemon/forms.json`. Needed only if the form differs in data (egg groups, evolution stage). Without them the
  form uses Pichu's record.
- [x] `res/pokemon/pichu/form_1/`: `front.png`, `back.png`, `front_single.png`, `back_single.png`, and female
  variants only if the form has them. Also `normal.pal`, `shiny.pal`, `icon.png`, the cells, animations, multi-cells,
  multi-animations and `*_info.bin` (copied from Pichu, then redrawn; since 2026-11-12 the rig is `front_rig.json`
  and `back_rig.json`, battle-sprites.md section 17).
- [x] The form name: Pichu's form 0 name and "Spiky-eared" in `res/text/system/pokedex_detail_form.txt`, at the slot
  the rebuilt chain gives it.
- [x] `res/field/actors/followers/pichu_form_1[_female][_shiny]/` with `"form": 1`.
- [ ] `res/paperwhite2/pokemon_center/services.json`: `special_reward.form` 1, `enabled` true, when the user wants
  it.
- [ ] Encounters: `"form": 1` where it should appear (`res/paperwhite2/encounters/species/pichu.json`).

Code (`#ifdef PAPERWHITE2`, marked `// Paper White 2:`):
- [x] `src/system/pokedex_savedata.c` `pokemonFormList`: `{ SPECIES_PICHU, 2 }` appended before `{ 0, 0 }`.
- [x] `src/system/evolution_check.c` `CheckEvolveSpecies`: Pichu form 1 doesn't evolve.
  - Mirror it in the hack's Evo page (`paperwhite2_pokedex_info_evo.c`).
- [x] `src/system/pokegra.c` `GetPokemonDataIDBase`: a hack base for `sprite_offset + form - 1 >= 66`, past the
  Arceus palettes (15,065). Or move the Substitute and palettes ([battle-sprites.md](battle-sprites.md) section 6).
- [x] `src/system/poke_icon.c` `sPokeIconPalettes`: the form's bank at index 753, inside the table's 756 bytes.
- [x] `src/system/poke_personal.c` `PERSONAL_FILE_REGIONAL_DEX` 710, only if a form record is added. Better: a
  generated constant from the packer.
- [ ] Debug menu: give a Pokémon in a form, for testing.

Tools:
- [x] `tools/data/pokemon_graphics.py`: append members past the original archive, for `a/0/0/4` (the new group, at
  the hack base) and `a/0/0/7` (two icon members at 1,510). `trainer_graphics.py` is the model.
- [x] A packer for `a/0/9/7` files 0, 2 and 6-9 from `res/pokemon` (chain slots in species order, shapes, the
  height and weight orders with forms), replacing the raw copy.
  - Then `pokedex_detail_form.txt`'s form lines should come from the species' data (a `form_name` per form) rather
    than a hand-kept file, so they can't drift from the chain.
- [x] `tools/paperwhite2/pokedex_sprites.py`: `SPRITE_MEMBERS` follows the new layout and measures the new group.
- [x] `configure.py`: the new packers' inputs and outputs.
- [x] After the build: `tools/build/verify_dsi_rom.py build/paperwhite2.nds`.

Editor:
- [x] Fix the species list's path parsing for `form_<n>.json`, and list forms under their species.
- [x] "Add form": a server route that runs a Python tool (as New Map does) to copy the record, art and follower
  folders and update `forms.json`, `forms.count`, `sprite_offset`, `pokedex.forms` and the form name. Then open the
  form in the panel. (Section 11.6.)

## 9. Open risks

- **Old saves:** appending to `pokemonFormList` is safe; anything that resizes `PokeDexSave` isn't. The user's
  playtest saves are on v0.21 and the decomp build.
- **The `a/0/9/7` desync:** generated Pokédex text and a raw chain table disagree as soon as a form is added.
  Rebuild file 0 in the same change, or every form after Pichu (Unown onward) shows the wrong height, weight, entry
  and name.
- **Sprite archive placement:** moving the Substitute touches battle code (`BtlvMcss_SetSubstitute`'s hard-coded
  members). A hack base past the palettes is smaller but adds a second form range that every tool must know
  (`pokemon_graphics.py`, `pokedex_sprites.py`, the editor).
- **Form records shift the regional Pokédex file:** `PERSONAL_FILE_REGIONAL_DEX` must move with it, or
  regional numbers read garbage.
- **Raw archives:** `a/0/9/7`, `a/1/7/6`, `a/2/0/8`, `a/3/0/2` and the musical can't change until they have packers.
- **Evolution by species:** regional forms need form-aware evolutions, and the form number carries over on
  evolution.
- **The editor's form listing bug** would show a new form as `pichu/f`.
- **The HGSS facts** in section 5.3 (breeding, trade limits) are from memory; the user may want them checked.

## 10. Recommended build order

1. **Packers first, with a byte-identical plain build:**
   - `pokemon_graphics.py` learns to append members;
   - a new `a/0/9/7` packer reproduces files 0, 2 and 6-9 from `res/pokemon`;
   - `pokedex_detail_form.txt`'s form lines are generated;
   - `PERSONAL_FILE_REGIONAL_DEX` comes from the packer.
   
   Each is checked against the original archive.
2. **Editor:** fix the form listing, then show form records and art under their species.
3. **The Pichu form, data and code:**
   - `forms.count`, the `pokedex.forms` entry and the name;
   - `pokemonFormList`;
   - the evolution hook;
   - the icon bank;
   - the sprite base, with a copy of Pichu's art as a placeholder.
   
   Test in the Pokédex form list, in battle, in the box, in evolution (none) and in breeding (a plain Pichu egg).
4. **The real Spiky-eared art:**
   - the battle sprites through the rig work in [battle-sprites.md](battle-sprites.md);
   - the icon and the follower sprites;
   - then enable the Wonder Trade reward and place encounters.
5. **"Add form" in the editor**, generalised from step 3, then the first regional form, with a form record and
   form-aware evolutions.
6. **New species:**
   - decide option 1 (non-Pokédex, roguelike) or option 2 (move the egg and Pokéstar IDs, fresh save);
   - inventory the bounds again;
   - start with one species end to end.

## 11. Built (2026-11-12): the foundation and the Spiky-eared Pichu

Steps 1 and 3 of section 10. The checklist in section 8 is ticked where done; what follows is how.

### 11.1 The data, all in `res/pokemon`

- **A form's sprite group** is `forms.sprite_offset + form - 1`, as in the original. Groups 0 to 65 are the original
  game's; the hack's start at **66** and must follow one another without gaps (the packer stops on a gap or on two
  forms with one group). The editor matches a species to its forms from `data.json` alone: `forms.count`,
  `sprite_offset`, `palette_forms` and the `form_<n>/` folders. No index file is kept.
- **The Pokédex's form text**: `pokedex.form_name` (the first form's name, such as "Plant Cloak") and
  `pokedex.forms[]` with `name`, `entry`, `height`, `weight` and `shape`. `res/text/system/pokedex_detail_form.txt` is
  now three lines (`\from{species.pokedex.form_name}`, the empty slot, `\from{species.pokedex.forms.name}`).
- **`pokedex.shape`** (0 to 13, the search's 14 shape icons) for every species, so `a/0/9/7` file 2 has a source.
- **`forms.no_evolution`**: the forms that never evolve, such as Pichu's `[ 1 ]`.
- `species_data.py dump` writes all of it from a ROM (`a/0/9/7` file 2 and text bank 450).

### 11.2 The packers

| Packer | What it now does | Unchanged sources |
| --- | --- | --- |
| `tools/data/pokedex_data.py` (new, `a/0/9/7`) | File 0, the next-form table: a slot per alternate form in species and form order, from 651, linked from the species. File 2, the shapes by species and slot (the empty slot repeats the last species', as the original). Files 6 to 9, every species and form by height and weight, down and up, ties by species then form, each form's record's numbers (the species' when it has none). Files 1, 3, 4, 5 copied. | The original archive, byte for byte |
| `tools/data/pokemon_graphics.py` (`a/0/0/4`, `a/0/0/7`) | After the original files, the hack's groups: 20 battle files a group from member 15,065 (`ADDED_FORM_FILES`), 2 icon files a group from 1,510. Each file is built in the format of its species' own file of the same kind (the male's slot for a female one, the normal palette for both palettes), and is that file's bytes where the art is the same. A missing female file is empty; any other missing file stops the build. An icon's bank is the one of `shared/icon_palettes.pal` its PNG's colours match (`icon_bank`). | The same archives as before |
| `tools/paperwhite2/pokedex_sprites.py` (`a/1/5/7` member 161) | The middles table runs to the end of the hack's groups (15,020 bytes without them) | The same member |
| `tools/paperwhite2/pokemon_forms.py` (new, `paperwhite2/pokemon_forms_config.h`, hack only) | The number of hack groups, their icon palettes (male low nibble, female high) and the `no_evolution` list | |
| Text (`species_data`'s `\from` sources) | The form names from the species' data | Bank 450 byte for byte |

**Regression proof:** with only the data moved into `res/` (no new form), a `--hack` build's 181 packed files in
`build/w2_us/files` were compared with a build of main before the change: all identical, and `a/0/9/7` is identical to
the extracted original. A plain `configure.py w2_us` build passes the module checks and `a/0/9/7`'s check (the
other archive checks fail as on main, from the hack's data).

### 11.3 The code (`#ifdef PAPERWHITE2`, `include/paperwhite2/pokemon_forms.h`)

- `GetPokemonDataIDBase` (`pokegra.c`): a group from 66 is at `POKEMON_FORMS_SPRITE_FILES` (15,065) +
  (group - 66) × 20. Every sprite user goes through it (battle, summary, Pokédex, trade, evolution, boxes' stills).
- `PokeParty_GetIconIndex` needs nothing: the hack's icons follow the original ones where it already looks.
  `PokeIcon_GetPalette` (`poke_icon.c`) reads a group from 66 from the generated table
  (`PaperWhite2_GetFormIconPalette`), since `sPokeIconPalettes` has room for 3 more only.
- `CheckEvolveSpecies` (`evolution_check.c`) returns 0 for a `no_evolution` form (`PaperWhite2_FormCannotEvolve`), which
  covers level-up, items, trades and the Link Cord. The Info page's Evo shows such a form alone.
- `PML_PersonalLoadRegionalDexTable` (`poke_personal.c`) reads the archive's last file instead of 709, so form records
  can be added.
- `pokemonFormList` (`pokedex_savedata.c`): `{ SPECIES_PICHU, 2 }` after Landorus: bits 83 and 84 of `seenForms` and
  `shownForms`. **3 bits are left** in each list. (Since replaced by the generated directory and the hack's save area,
  save-expansion.md section 11: the Pichu's bits are 0 and 1 there, and the original block keeps 83 and 84.)

### 11.4 The Spiky-eared Pichu

- `res/pokemon/pichu/data.json`: `forms` `{ count 2, sprite_offset 66, no_evolution [1] }`, `form_name` "Normal",
  `forms[0]` "Spiky-eared" with Pichu's entry, height, weight and shape. No form record: it is Pichu in data, cry and
  footprint.
- `res/pokemon/pichu/form_1/`: copies of Pichu's 17 battle sprite files, palettes and icon, as placeholders.
- Followers `pichu_form_1`, `_shiny`, `_female`, `_female_shiny` with the original game's walking sprite
  `OBJ_CODE_POKEMON_PICHU_FORM_1`, four codes after the imported followers (`GetIndexOfObjID`'s last follower code is
  now `OBJ_CODE_FOLLOWER_PICHU_FORM_1_FEMALE_SHINY`).
- The Wonder Trade's `special_reward.form` is 1, `enabled` still false.

Tested headless (the scratchpad's `forms/` harness), with the form's palettes tinted and icon mirrored in a test build so
that its group could be told from Pichu's: party icon, summary, a wild battle's back sprite, the Pokédex Info page (the
Form button between "Normal" and "Spiky-eared", entry, height and weight, Evo alone), the follower, no evolution by Rare
Candy or a battle's level-up at 255 friendship (a plain Pichu evolves both ways), and Unown's, Rotom's and Giratina's
forms' names, entries and sizes as before.

### 11.5 What "Add form" writes (built 2026-11-12)

`tools/paperwhite2/pokemon_form.py add SPECIES [--from FORM] [--name NAME] [--record] [--check]`, which the editor's
Add form runs. For species `S` getting form `n` (its `forms.count` before), copied from the species or its form `--from`:

1. `res/pokemon/S/data.json`: `forms.count` + 1; `pokedex.forms` gains `{ name, entry, height, weight, shape }`
   (the template's, the name `--name` or "Form n"); `pokedex.form_name` the species' name if it had none.
   `forms.sprite_offset`:
   - a species with no sprite forms takes the next free group after the hack's own (67 after the Pichu);
   - a species whose groups are the hack's (66 on) keeps its place, and every hack species' offset is laid out again
     from 66 in the order of their offsets, so its new group is its own and the ones after it move up one (they are
     only renumbered: the packer builds them from the folders);
   - a species whose groups are the original game's (Unown, Rotom, Kyurem...) keeps its offset: the packers move its
     forms (section 11.7).
2. `res/pokemon/S/form_n/`: copies of the template's battle files (`front*`, `back*`, female ones where it has them),
   `normal.pal`, `shiny.pal`, `icon.png` and `icon_female.png`. Not its cry, footprint or musical sprites, which the
   form shares with its species.
3. `res/pokemon/S/form_n.json` (the template's record minus `name`, `name_article`, `pokedex`, `baby_species`,
   `regional_dex_number`, `cry_volume` and `learnset.egg_moves`; `forms` `{ count, sprite_offset 0 }`) and
   `["SPECIES_S", n]` in `res/pokemon/forms.json` after the species' last row, with `--record`, **or always when the
   species' forms have records**: `PML_PersonalGetDatID` reads a form's record at `formFile + form - 1` for every form
   below the count, so a species' forms have records all or none (Rotom's 7th form without one would read Castform's).
   Records missing for the species' other forms are made as copies of the species', and its records' `forms.count`
   follows.
4. The followers: `res/field/actors/followers/S_form_n[_female][_shiny]/`, copies of the template's (its own sprite
   files too, where it has them) with `"form": n`, and their `OBJ_CODE_FOLLOWER_S_FORM_N...` constants after the last
   follower code in `generated/obj_codes.txt`. `GetIndexOfObjID`'s range now ends at `FOLLOWING_LAST_OBJ_CODE`, which
   `tools/paperwhite2/pokemon_forms.py` generates from the list, so the C never changes.
5. The Wonder Trade: a species listed in `wonder_trade.forms` gets a weight for the form (its first form's); one not
   listed receives the form anyway (section 11.8).
6. Nothing for the Pokédex: `forms.count` puts the species in the generated form directory, and the game remaps old
   saves' form bits on load (save-expansion.md section 11).

`remove S n` undoes it, for the species' last form only and never an original game's form (the original counts are
the extracted personal archive's): the folder, record, row, followers and their codes, the `pokedex.forms` entry, the
`no_evolution` entry, the `excluded_forms` row and the form's Wonder Trade weight; `sprite_offset` 0 when no sprite
form is left, else the hack groups laid out again; `form_name` dropped when one form is left and the original game had
none. A middle form can't be removed (later forms would change number in saves and data): remove the forms after it
first. `record S n on|off` gives the form (and any of the species' forms without one) a record, or removes every form
record of a species whose forms have none in the original game. `icon` and `still` import art (section 11.6).

Proven: adding a Vulpix form with a record and a 7th Rotom form, then removing both (from the tool and from the
editor), leaves `res/` and `generated/` as they were, and the `--hack` ROM byte for byte the one before
(`d11fd024...`).

### 11.6 The editor (built 2026-11-12)

- **The list** has every species and, under it, each of its `forms.count` forms by its Pokédex name (`pokedex.forms`),
  whether or not it has a record: Pichu's Spiky-eared, Rotom's six, Castform's four, Unown's 27, with the form's icon
  and an "added" tag on the hack's (`editor/src/modules/pokemon/forms.ts`, tested against `res/`).
- **A species' page** has a Forms card (its forms, the sprite groups they take, "moved" for a moved species) with
  **Add form**: copy of the species or one of its forms, the name, and "Own stats, types, abilities and moves" (forced
  on where the species' forms have records); a dry run (`--check`) says what it will write before Add. Its Wonder
  Trade row switches the species in and out of `excluded_species`.
- **A form's page** (`FormPage.tsx`): its sprite (its `form_n/` art, or its species'); a Form section with Remove form
  (the hack's last form, with a confirm listing what goes), Data ("Own stats, types, abilities and moves": on runs
  `record on`; off, with a confirm, `record off`), Evolution ("Can't evolve", `forms.no_evolution`) and Wonder Trade
  ("In the random pool", `excluded_forms`; an original form shows its `wonder_trade.forms` weight); its Pokédex entry
  (name, entry, height, weight, shape); its Art (the battle sprite says "a copy of <species>'s" while its sheets are the species'
  files, "its own" once they differ; its art is exported and imported on its rig by the Battle sprite card,
  battle-sprites.md section 14; the icon and the 96x96 front and back
  stills import as PNGs, checked and previewed first: an icon must be 32x64 in one bank of
  `shared/icon_palettes.pal`'s colours, which picks its bank as the build does, a still in the form's `normal.pal`
  colours); and with a record the species page's sections on `form_n.json` (types, stats, abilities and the rest,
  evolutions, which the game doesn't read for forms yet, learnset).
- **The server** runs the tool: `GET /api/pokemon-forms` (the original form counts, the species with original
  records, the moved species), `POST /api/pokemon-forms/add`, `/remove`, `/record`, `/art`. The tool writes `res/`
  itself, not the document store, because it copies binary art and follower folders and edits `obj_codes.txt` and
  other species' offsets in one step; the editor refuses while any of those files has unsaved edits, then reads the
  changed files again. Everything else on the pages (names, entries, types, Can't evolve, the Wonder Trade switches)
  is an ordinary edit, saved with Save.

### 11.7 Species whose forms outgrow their original groups

`tools/data/form_groups.py` lays out the groups for every packer (`pokemon_graphics.py`, `species_data.py`,
`pokemon_forms.py`, and through them `pokedex_sprites.py`): the original 0-65 by `sprite_offset + form - 1`, then the
hack's own offsets from 66, then **every species with more forms than its original groups** (the original counts from
`extract/.../a/0/1/6`), moved whole, in species order, after them. A moved species keeps its original `sprite_offset`
in `data.json` and its original groups, still built from its `form_1/` to `form_k/` folders so the archives keep the
original layout; `species_data.py` writes the moved offset into its personal record, so `GetPokemonDataIDBase`,
`PokeParty_GetIconIndex` and the icon palettes find every form there with no code change. An original group left
without its form (an original form removed) stops the packers.

Proven: with nothing moved, the `--hack` ROM is byte for byte the build before. With a 7th Rotom form: every member of
`a/0/0/4` (15,085) and `a/0/0/7` (1,512) is unchanged, Rotom's six groups are appended (its form 1's cells, animations
and info files equal group 40's; the characters and palettes are encoded in Rotom's own files' format), and its record
gives 67 for 40.

### 11.8 The Wonder Trade

The forms the hack adds join the random pool (`tools/paperwhite2/pokemon_center.py`): a species with forms past the
original game's and no `wonder_trade.forms` entry gets a generated one, weight 1 for its first form and each added
form, 0 for its other original forms. `wonder_trade.excluded_forms` (`{ species, form }`) leaves a form out, in a
listed species too; the Spiky-eared Pichu (the special reward) is in it, so the header is the one before. New species
are in the pool unless `excluded_species` lists them (`LAST_SPECIES` must rise with them, section 6).

### 11.9 Tested in the ROM (py-desmume, a copy of the user's save)

A test build with a Vulpix form 1 ("Alolan", own record, Ice/Ice) and a 7th Rotom form ("Stereo"), both with their
palettes tinted and icons mirrored so their groups could be told apart:
- the save's upgrade on load (the user's save has no area yet) equals `pokedex_save.py upgrade`'s byte for byte; the
  directory has 23 species (Vulpix first), and Keldeo's marks (form 0 seen and shown, form 1 seen) moved to bits 84
  and 85 with their values;
- party icons (both mirrored, the plain Vulpix and Heat Rotom as before), the follower a Vulpix, summaries: Vulpix
  form 1 Ice with the tinted sprite, Rotom form 6 Electric/Ghost with its tinted sprite, a plain Vulpix Fire, Heat
  Rotom (from its moved group) as before;
- after the debug Fill Pokédex, the Info page's Form button: "Alolan" (Ice) and "Vulpix" (Fire); Rotom's seven
  ("Stereo", Rotom, Heat, Wash, Frost, Fan, Mow) with their names, types, entries and sizes. Against the baseline ROM on
  the same save, Rotom's six original pages are the same apart from the animated background and the sprite's frame.

Removing both forms gave back the baseline ROM (`d11fd024...`).

## 12. New species' Pokédex numbers (the user's direction, 2026-11-12)

The National Pokédex keeps its gaps for 1–649 (a "???" row for each number not yet seen). A new species' Pokédex
number is separate from its internal species ID (which is wherever the renumbering puts it, past the egg and Pokéstar
IDs): each new species gets an optional display number in its data, e.g. Applin's 840, or none for the user's own
creations, which show "???". After 649 the list holds only the species that exist, in display-number order with the
unnumbered ones last, without placeholder rows for the numbers between them (no 650–839 gap before Applin). The save's
Pokédex bits stay keyed by the internal ID (save-expansion.md).
