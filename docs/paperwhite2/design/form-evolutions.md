# Form evolutions, the Ice Stone and Sirfetch'd

Research for the user's question (2026-11-12): "Would a form still evolve into the next species' form? Would the
Alolan Vulpix evolve into an Alolan Ninetales, if one exists? Alolan Vulpix evolves with an Ice Stone rather than a Fire
Stone. Galarian Farfetch'd can evolve into Sirfetch'd, who I may want to add as well." And the user's follow-up: could
the evolution methods themselves carry the form ("if form 1 and Ice Stone", "if form 0 and Fire Stone"), as Gallade's
and Karrablast's conditions do? Read from the source and `res/`; anything inferred and not traced is marked so. It
builds on [forms-and-species.md](forms-and-species.md) sections 5.1 and 11 and [items.md](../items.md)'s Link Cord.

## 1. Summary

- **Today a form evolves by its species' list, and keeps its form number.** An Alolan Vulpix (Vulpix form 1) uses
  Vulpix's Fire Stone and becomes Ninetales **form 1**. If Ninetales has a form 1 (an Alolan Ninetales added with Add
  form), it *is* an Alolan Ninetales. If it doesn't, the Pokémon is a Ninetales whose box data says form 1, which every
  reader treats as form 0 (section 2.3). No crash, the same as the original game's Mothim from a Sandy Cloak Burmy.
- **What doesn't work today:** the Ice Stone (no such item in Gen 5), a different method per form (the list is the
  species'), and a form evolving into a species' other form (Galarian Farfetch'd into Sirfetch'd, which is form 0).
- **Recommended: the user's idea, a form condition on each evolution in the species' own list** (section 4). It fits
  the data without changing its size, needs one filter in `CheckEvolveSpecies` that covers every path (level, items,
  Link Cord, trades), works for forms without a record, and puts every path of a family in one list, as Gallade's
  does. Per-form evolution lists (section 5) are the alternative: more general, more code, and only worth it if a
  species runs out of its 7 entries.
- **The target form:** keep the form number when the target species has that form, else 0 (one hook in
  `setChangedPkmSpecies`). That gives Alolan Vulpix → Alolan Ninetales and Galarian Farfetch'd → Sirfetch'd with
  nothing else. An explicit target form (Pikachu form 0 into an Alolan Raichu) is an optional second step (section 6).
- **Ice Stone:** data only, in one of the 18 unused item IDs (section 7). Stones need no code: the bag and party list
  ask `CheckEvolveSpecies`, which compares the item with the list's parameter.
- **Sirfetch'd** waits for new species (section 8). Its evolution needs nothing more than the above, plus a method
  for its condition (Gen 8's three critical hits doesn't exist in Gen 5).

## 2. Today's behaviour

### 2.1 The data

- **Archive `a/0/1/9`** (`ARCID_EVOLUTIONS` 19), packed by `tools/data/species_data.py` from each record's
  `evolutions` in `res/pokemon/<species>/data.json` and `form_<n>.json`. One member **per personal record**: species
  0-684, then the form records in `forms.json`'s order (685 on), in the same order as the personal archive.
- **A member** is 7 entries (`EVOLUTION_COUNT`) of `{ u16 method, u16 param, u16 species }` (`Evolution`,
  `include/pml/evolution.h`), 42 bytes, empty entries zero. Methods are 0-27 (`EVO_METHOD_*`,
  `include/constants/pokemon.h`), so they use 5 of the method's 16 bits. Params are a level (≤ 100), an item (≤ 638),
  a move (≤ 559), a species (≤ 684) or a number (friendship, beauty), all below 2048. Species are below 2048 too, even
  with the planned 1500.
- **Every original form record's list is empty** (all 24, checked), and none of those species evolves, so the form
  records' members have never been read.
- The JSON schema (`res/pokemon/species.schema.json`, `evolutions`): `method`, `param`, `species`, at most 7.
  `species_data.py`'s `PARAM_PREFIXES` names the param's constant by method number. Eevee's list has all 7.
- **Readers must allocate 42 bytes**: `CheckEvolveSpecies` allocates `EVOLUTION_COUNT * sizeof(Evolution)` and
  `getEvolutionInfoParam` has a stack array of 7, and both read the whole member. **Growing a member overflows them**,
  so any design must keep 42 bytes.

### 2.2 Where evolutions are read

| Reader | What it reads | Form-aware? |
| --- | --- | --- |
| `CheckEvolveSpecies` (`src/system/evolution_check.c`), through `getEvolutionInfoFile(species)` | the species' member | Only `PaperWhite2_FormCannotEvolve` (`forms.no_evolution`, the Spiky-eared Pichu) |
| Its callers: battle return's level-up (`ov166/event_battle_return.c:317`), field level-up and items (`ov012/event_field_proclink.c:1016`, `:1022`), the party list's "won't have any effect" check (`ov165/plist_sys.c:2692`, `PokeList_CanEvolveWithItem`) and Rare Candy (`plist_item.c:561`), in-game trades (`ov033/fld_trade.c:221`), the Wonder Trade (`paperwhite2_wonder_trade.c:563`), the Link Cord and its partner (`paperwhite2_link_cord_event.c:30`), and the wireless trades (`ov194/pokemontrade_save.c`, `ov214/worldtrade_demo.c`) | the result species and `*method` | through it |
| The Link Cord, `PaperWhite2_LinkCordEvolves` (`paperwhite2_link_cord.c`), from the item mode's loop | each entry's method and param | through it |
| Eviolite, `CheckEvolution` (`ov167/btl_server_flow.c:7528`) | `getEvolutionInfoParam(file, species, 0, i)`: entry 0's method, param, species non-zero | No: the Spiky-eared Pichu gets Eviolite's boost |
| The TV doctor (`ov259/local_tvt_person_doctor.c:367`) | entry 0's method and param | No |
| The Pokédex Info page's Evo (`ov298/paperwhite2_pokedex_info_evo.c:366`) | each row's species' member; icons in the shown form | Only `FormCannotEvolve` |
| `tools/paperwhite2/pokedex_evo.py` | family roots by species from the JSON lists (`a/1/5/7` member 159) | No |
| `tools/paperwhite2/pokemon_center.py` `species_tables` | the Wonder Trade's pre-evolutions and least levels by species | No; the form is picked after the pre-evolution (`WonderTrade_Plan`) |
| `tools/paperwhite2/pokedex_templates.py` | the Evo art's previews | No |
| Editor: `PokemonEditor.tsx` `Evolutions` (every record's list; on a form page with the note that the game ignores it), the family tree (form 0 lists), `forms.ts`, the encounters editor's families (`encounters/load.ts`, by species) | JSON | No |

Not evolution data: the encounters' and DexNav's "family" is `baby_species` (`encounters.py` `families`).

### 2.3 What the evolved Pokémon gets

- The demo (`ov284/evolution_demo.c:436`, and the preview copy in `evolution_demo_view.c:285`) calls
  `setChangedPkmSpecies` (`poke_tool.c:394`): it sets the species, the ability (`setAbilityForForm`, by the **kept**
  form), the sex and, unless nicknamed, the name, then recalculates the stats. **The form is never changed.** The
  original game relies on it: Burmy's cloak becomes Wormadam's.
- **A form number the new species doesn't have is harmless** in every reader traced:
  - personal data (stats, types, abilities, growth, learnset): `PML_PersonalGetDatID` returns the species' record when
    `formCount <= form` (`poke_personal.c`);
  - battle sprites `GetPokemonDataIDBase`, icons `PokeParty_GetIconIndex`, icon palettes `PokeIcon_GetPalette`: all
    clamp to form 0;
  - Pokédex `getForm` (`pokedex_savedata.c:256`): a species outside the form directory returns, one in it clamps;
  - `PML_PkmSanitizeForme` users (musicals, Game Sync) clamp; the follower falls back to form 0 (plugins.md).
  - So a Vulpix form 1 evolved into a Ninetales without form 1 looks and plays as Ninetales. **No crash risk** was found
    from Add form today. The original game makes the same Pokémon: a Sandy or Trash Cloak Burmy evolves into Mothim
    (one form) and keeps form 1 or 2.
- **Two latent effects:** such a Ninetales becomes an Alolan Ninetales on its own if Ninetales later gets a form 1
  (which the user may want). And PKHeX may call it illegal (inferred, not checked).
- **Shedinja** (`evolution_demo.c:1344`) is made from Nincada, which has no forms.

### 2.4 Today's answers

- Vulpix form 1 with an Alolan Ninetales (Ninetales form 1) added: **Fire Stone → Alolan Ninetales**. The Ice Stone
  doesn't exist. A plain Vulpix still gets a plain Ninetales.
- Vulpix form 1 without a Ninetales form: Fire Stone → a Ninetales that reads as form 0.
- `form_<n>.json`'s `evolutions` (Add form `--record` copies the template's) are packed and ignored.
- The Evo tab shows Vulpix's tree (Fire Stone) for both forms, with the form's icons where species have them.

## 3. The two designs

| | A. A form condition on an evolution (recommended) | B. Per-form evolution lists |
| --- | --- | --- |
| Data | the species' list; an entry gets `"form": n` ("only form n evolves this way") | the form's own `form_<n>.json` list, its own member of `a/0/1/9` |
| Archive change | the condition in the method's high byte; size unchanged | none (members exist); readers look up by personal index |
| Needs a form record | no (cosmetic forms too) | yes, and then all the species' forms have records (section 11.5's rule) |
| Code | one filter after the list is read in `CheckEvolveSpecies`; masking in the Evo tab, Eviolite, the TV doctor | an exported `PML_PersonalGetDatID`, by-form reads in `CheckEvolveSpecies`, Evo tab, Eviolite; a family table by record |
| Every path covered | yes: the filter runs before every mode | yes, in the same place |
| Evo tab | one tree per species, filtered by the shown form | trees per record |
| Editor | one "Only form" picker per row on the species page | a full evolution editor on each form page |
| Limit | 7 entries per species, all forms together (Eevee is full) | 7 per form |
| Original data | identical (every method's high byte is 0) | identical (every form list is empty) |

**Why A:** it's the smaller change in code, data and editor; a reader that ignores the condition (an old tool) sees an
ordinary evolution, not a crash; it works for forms without a record; it's the shape that split evolutions already
have (Gallade by sex, Karrablast by partner, Ninjask/Shedinja); and the user can read a family's whole set of paths in
one list. B is only worth it if a species needs more than 7 entries across its forms, which none of the planned ones
does (Vulpix 2, Farfetch'd 1 with Sirfetch'd; Eevee's 7 don't change).

## 4. Design A: form conditions

### 4.1 Data

- JSON: an evolution entry may have `"form": n` (0 to 30): only a Pokémon of form n evolves this way. Without it, every
  form does, as today. Example, `res/pokemon/vulpix/data.json`:

  ```json
  "evolutions": [
      { "method": "EVO_METHOD_ITEM", "param": "ITEM_FIRE_STONE", "species": "SPECIES_NINETALES", "form": 0 },
      { "method": "EVO_METHOD_ITEM", "param": "ITEM_ICE_STONE", "species": "SPECIES_NINETALES", "form": 1 }
  ]
  ```

  Farfetch'd: `{ "method": <its method>, "param": ..., "species": "SPECIES_SIRFETCHD", "form": 1 }`.
- Packed: the method's high byte is the condition's form + 1 (0 for none): `method | (form + 1) << 8`. The param and the
  species keep their meaning, so every reader of the param (item names, levels) is unchanged. Methods stay below 256.
  `species_data.py dump` splits it back; `PARAM_PREFIXES` looks at the low byte. Schema: `"form": { "type": "integer",
  "minimum": 0, "maximum": 30 }` with a description.
- Why the method and not the param: the param already holds values up to 638 and its meaning differs by method; the
  method's high byte is free for every method alike, so one rule covers level, item, friendship, trade and the hack's
  methods. (Packing the form in the param's high bits works too, for items and levels, but each reader of the param
  would need to know.) A new method number per condition (`EVO_METHOD_ITEM_FORM`, `EVO_METHOD_LEVEL_FORM`...) was
  considered: it needs a case, a text and an editor entry per pair, and doubles every method that a form might want.

### 4.2 The runtime

- **`CheckEvolveSpecies`:** right after `getEvolutionInfoFile(species, evo)`, under `#ifdef PAPERWHITE2`, one call
  `PaperWhite2_FilterFormEvolutions(evo, form)` (in `paperwhite2_pokemon_forms.c`): an entry whose condition isn't the
  Pokémon's form is cleared (method `EVO_METHOD_NONE`), and the condition is stripped from the rest. The switch, the
  item mode, the trade mode and `PaperWhite2_LinkCordEvolves` then see ordinary methods. So:
  - a Fire Stone on an Alolan Vulpix returns 0, and the party list says "It won't have any effect." (`plist_sys.c`,
    message 0x52), exactly as the Link Cord does for a Karrablast without a Shelmet;
  - `*method` is the plain method, so the demo's trade item removal and `canCancel` work as before;
  - level-up, Rare Candy, battle return, the trades and the Link Cord all go through it.
- **The target form** (both designs need it): in `setNameChangedPkm` (`poke_tool.c`), under `#ifdef PAPERWHITE2`,
  after setting the species and before `setAbilityForForm`: if the form is at least the new species' form count, set
  it to 0. Every evolution, and the demo's preview copy, goes through `setChangedPkmSpecies`, so Sirfetch'd and Mothim
  get form 0 and Wormadam keeps Burmy's cloak. This changes the original's Mothim (form 1 or 2 becomes 0), which is
  invisible in the game; the user should agree (open decision 4).
- **Eviolite** (`CheckEvolution`) and the **TV doctor** read raw entries: mask the high byte in the doctor; for
  Eviolite, filter by the battler's form (and `FormCannotEvolve`), so a Farfetch'd form 0 without its own path gets no
  boost. Small hooks.

### 4.3 The Pokédex Info page's Evo

- Rows carry a form. The tree starts from the root with the shown Pokémon's form (or the form its family entry names,
  below), filters each row's list by the row's form, and gives each child the form by the same rule as the game (kept
  if the child has it, else 0). Icons use each row's form instead of the shown one.
- **The family table** (`pokedex_evo.py`, member 159, a `u16` per species): a species reached only through a form
  condition needs its root's form, or Sirfetch'd's page would filter itself out of Farfetch'd form 0's tree. Pack the
  root as `species | (form + 1) << 11` where it's form-specific (Sirfetch'd: Farfetch'd form 1), else as today.
  `pokedex_evo.py`'s docstring changes from "forms have no evolutions of their own".
- The method texts need nothing: an `EVO_METHOD_ITEM` row names its item ("Ice Stone"), as `sEvoMethodTexts` does.

### 4.4 The Wonder Trade

`pokemon_center.py`'s `species_tables`: a species whose pre-evolution path has a condition (Sirfetch'd) needs the
pre-evolution's form, since `WonderTrade_Plan` picks the form after stepping down to the pre-evolution. Pack
`sPreEvolutions` as `species | (form + 1) << 11` and have `WonderTrade_Plan` use that form instead of `PickForm` when
set. A conditional evolution's least level is its own (the first path naming the target stays the rule).

### 4.5 The editor

- The species page's Evolutions: each row gets **"Only form"**: Any, or each of the species' forms by its Pokédex name
  (`pokedex.forms`). The family tree shows a conditional row with the form's name.
- The form page's Evolution section: "Can't evolve" as now, plus the species' rows that apply to this form (read
  only, with a link to the species' list) and what it becomes, e.g. "Ice Stone → Ninetales (Alolan)" or "→ Ninetales
  (no Alolan form yet: it becomes the normal form)".
- A form record's own Evolutions editor (shown with "the game doesn't read them") goes; `pokemon_form.py add --record`
  should write an empty list, and the packer can refuse a non-empty form list so nothing looks editable that isn't.
- The encounters editor's `levelEvolutions` (level ranges) can ignore the condition.

## 5. Design B: per-form lists (the alternative)

- A form with a record reads its own member: `getEvolutionInfoFile` by `PML_PersonalGetDatID(species, form)` (exported
  from `poke_personal.c`); a form without a record reads the species'. The target form rule of section 4.2 is the same.
- Every reader of section 2.2 changes to the by-record read: Eviolite, the TV doctor, the Evo tab (rows by record, a
  family table by personal index), `pokedex_evo.py`, `pokemon_center.py`, the editor's form page gets the full
  evolution editor.
- Add form would have to turn records on for any form that evolves differently, and then for all of the species'
  forms. More data and more code for the same examples.

## 6. Optional: an explicit target form

For a form that evolves into another form of the next species (Pikachu form 0 into an Alolan Raichu, Koffing into a
Galarian Weezing), an entry gets `"target_form": n`, packed as the species' high bits: `species | (n + 1) << 11`
(species stay below 2048). `CheckEvolveSpecies` returns that value unmasked; every caller only tests it for 0 or
passes it on to `EvolutionDemoParam.species` or a trade's `evolveSpecies` (all `u16`/`u32`, checked: field,
battle return, fld_trade, Wonder Trade, Link Cord, wireless trades). The demo's init splits it: the species for the view
and the messages, the form set before `setChangedPkmSpecies` at its two sites. Readers that show the species (the Evo
tab, Eviolite, `pokedex_evo.py`) mask it. Not needed for Vulpix or Farfetch'd; do it when a species needs it.

## 7. New items: the Ice Stone

- **Stones need no code.** An item with `effects.evolve` makes the bag return 12 (`ov142/itemmenu.c:848`), the party
  list asks `PokeList_CanEvolveWithItem` and subtracts the item when it can (`plist_sys.c:1066`), and the field runs the
  demo with `CheckEvolveSpecies(..., EVO_CHECK_ITEM, item, ...)` (`event_field_proclink.c:1016`), which matches
  `EVO_METHOD_ITEM` entries whose param is the item. The Link Cord needed code only because it re-reads trade methods.
- **Adding it, as the Link Cord was** (commit 83a64d299b):
  1. `generated/items.txt`: rename an unused ID, e.g. `ITEM_UNUSED_115` to `ITEM_ICE_STONE`, with a `# Paper White 2:`
     comment (`tools/data/rename_constant.py` for its uses).
  2. `res/items/ice_stone/data.json`: a copy of `fire_stone`'s (field func 20, `effects.evolve`, kind 2, pocket Items,
     fling 30) with the name, plural, description ("It is colored like ice." or the like) and `sort_index`; delete
     `res/items/unused_115/`. The price as the user likes (the Fire Stone's `price` is 210, as the Link Cord's).
  3. `res/items/ice_stone/icon.png` and `icon.pal` (the editor's Graphics & Palettes, Item icons), its
     `ITEM_ICON_ICE_STONE` and `ITEM_ICON_PALETTE_ICE_STONE` in `generated/item_icons.txt`, and its row of
     `ITEM_GRAPHICS_CHARS_AND_PALETTES` in `src/system/pml_item.c` under `#ifdef PAPERWHITE2`.
  4. `sItemPockets` (`myitem_savedata.c`): the unused IDs are already `BAG_POCKET_ITEMS`; rename the comment.
  5. Where to get it: a shop, a hidden item, an NPC.
  6. `docs/paperwhite2/items.md`'s table and a section.
- **Free IDs without growing the list:** 18: 115, 120-133, 426, 427 and 622 (`ITEM_UNUSED_*`). 113 and 114 are the
  Shiny Candy and the Link Cord.
- **The ceiling:** the item ID is a `u16` in the box data and the bag, so there's no hard limit near; but `ITEM_LAST`
  (638) sizes tables (`sItemPockets`, `ITEM_GRAPHICS_CHARS_AND_PALETTES`, `BagItemList`'s `entries` and `inBag`,
  `bag.h`'s flags) and the item data and text archives have one member per ID. Past the 18 free IDs, growing
  `ITEM_LAST` is a project of its own (not traced: other per-item tables in overlays, and the Items pocket's 310
  slots, `BAG_ITEMS_MAX`). The Y button's registrable slots are full, but a stone isn't registrable.

## 8. Sirfetch'd

- **Depends on new species** ([forms-and-species.md](forms-and-species.md) sections 6 and 12): an internal ID past the
  egg and Pokéstar IDs, the personal, learnset, sprite, icon, cry and text members, the Pokédex save's bits and its
  display number 865.
- **The evolution side needs:** Farfetch'd form 1 (Galarian, with a record for its Fighting type) and an entry
  `{ method, param, "species": "SPECIES_SIRFETCHD", "form": 1 }`; the target rule gives form 0. Its ID must stay below
  2048 (both packings use the species' high bits elsewhere). The Evo tab's family root and the Wonder Trade's
  pre-evolution carry Farfetch'd's form 1 (sections 4.3, 4.4).
- **Its method:** Gen 8's "three critical hits in one battle" has no Gen 5 method. Options:
  - an existing one: level up holding a Leek (`ITEM_STICK`): `EVO_METHOD_HELD_ITEM_DAY` and `_NIGHT`, two entries.
    The demo removes the held item after these (`EvolutionDemo_RemoveHeldItem`, `evolution_demo.c:499`), so the Leek
    is used up, as Sneasel's Razor Claw is;
  - a new method (28 has a case in `CheckEvolveSpecies`, a Chargestone zone list, but no species uses it; 29 on are
    free): `EVO_METHOD_CRITICAL_HITS`, which needs the battle to count
    a battler's critical hits and the battle return to keep the count until the level-up check: a battle hook and a
    place to keep it (not traced).
  - A new method needs a case in `CheckEvolveSpecies`, a text in the Evo tab's `sEvoMethodTexts` and its strings,
    `pokedex_templates.py`'s `EVO_METHODS`, the editor's list and `PARAM_PREFIXES` if its param is a constant.

## 9. Recommended build

1. **Form conditions** (section 4.1, 4.2): `species_data.py` (pack, dump, schema), `PaperWhite2_FilterFormEvolutions`
   and its call in `CheckEvolveSpecies`, the target form rule in `setNameChangedPkm`, Eviolite and the TV doctor. Proof:
   with no condition in `res/`, the `--hack` ROM is byte for byte the one before, apart from the code (the data
   identical).
2. **The Ice Stone** (section 7), in ID 115.
3. **Test** with a Vulpix form 1 (Add form with a record, Ice type) and a Ninetales form 1: in py-desmume on a copy of
   the save, an Ice Stone on the Alolan Vulpix gives an Alolan Ninetales; a Fire Stone on it says "It won't have any
   effect."; a Fire Stone on a plain Vulpix gives a plain Ninetales; an Ice Stone on it has no effect; Rare Candy and
   battle level-ups unchanged for other species; Burmy's cloaks into Wormadam's; the Link Cord's trades unchanged.
   Then without Ninetales form 1: the Alolan Vulpix's Ninetales has form 0 in its box data.
4. **The Evo tab and `pokedex_evo.py`** (section 4.3), then the editor (4.5), the Wonder Trade (4.4).
5. Docs: forms-and-species.md section 5.1 and 11.3, plugins.md's Forms, items.md, `pokedex_evo.py`'s docstring.
6. Later: the explicit target form (section 6) when a species needs it; Sirfetch'd's method with new species.

## 10. Open decisions for the user

1. **Design A (form conditions in the species' list) or B (per-form lists)?** A is recommended.
2. **Sirfetch'd's method:** level up holding a Leek, or a new critical-hits method (more work, closer to Gen 8)?
3. **The Ice Stone:** its ID (115 suggested), price, description, icon, and where it's found. Other new stones
   (Gen 8's Sweet items, Gen 9's) would take more of the 18 IDs.
4. **The target rule's side effect:** a form the new species lacks becomes 0, so a Sandy Cloak Burmy's Mothim is form 0
   (the original keeps 1). Fine? (Without it, an Alolan Vulpix evolved before Ninetales gets an Alolan form becomes an
   Alolan Ninetales later.)
5. **Eviolite:** should it follow the form (no boost for a form without a path, such as the Spiky-eared Pichu)?
