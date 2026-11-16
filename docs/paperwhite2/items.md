# Paper White 2's items

The items the hack adds or changes. Each one takes the place of an item the game never uses, or changes what an
original item does, so the item list keeps its size and order. An item's data, name and description are in
`res/items/<item>/data.json`, named after its constant. Its icon is in `src/system/pml_item.c`'s table, its bag use in
`src/ov142/itemmenu.c`'s `sItemMenuFieldUses`, and its Y button shortcut in `src/system/shortcut_util.c` and
`src/ov012/event_shortcut_menu.c`. Every change to original code is an `#ifdef PAPERWHITE2` hook. The debug menu's
Give key items (`sDebugKeyItems`, plugins.md) gives all the key items below.

The Y button's shortcuts are saved in `ShortcutSave`, which has 36 slots. With the Exp. Share, the DexNav and the
Version Key, 36 shortcuts can be registered at once (`include/system/shortcut_util.h`), so the slots are full. One more
registrable item needs a larger save.

| Item | Constant (place) | Pocket | Y | Header |
| --- | --- | --- | --- | --- |
| Exp. Share | `ITEM_EXP_SHARE` (the original's) | Key Items | yes | `include/paperwhite2/exp_share.h` |
| Shiny Candy | `ITEM_SHINY_CANDY` (unused item 113) | Medicine | no | `include/paperwhite2/shiny_candy.h` |
| DexNav | `ITEM_POKE_RADAR` (the Poké Radar) | Key Items | yes | `include/paperwhite2/dexnav.h` |
| Version Key | `ITEM_GALACTIC_KEY` (the Galactic Key) | Key Items | yes | `include/paperwhite2/version_key.h` |
| Link Cord | `ITEM_LINK_CORD` (unused item 114) | Items | no | `include/paperwhite2/link_cord.h` |
| Tart Apple, Sweet Apple, Syrupy Apple | `ITEM_TART_APPLE`, `ITEM_SWEET_APPLE`, `ITEM_SYRUPY_APPLE` (unused items 120-122) | Items | no | none (data only) |
| Roseli Berry | `ITEM_ROSELI_BERRY` (unused item 123) | Berries | no | none (a row in `item_handlers.c`) |
| Fairy Gem | `ITEM_FAIRY_GEM` (unused item 124) | Items | no | none (a row in `item_handlers.c`) |
| Pixie Plate | `ITEM_PIXIE_PLATE` (unused item 125) | Items | no | `pml/poke_party.h` (`PaperWhite2_GetArceusPlateForm`) |
| Nightmare Ball | `ITEM_NIGHTMARE_BALL` (unused item 126) | Items | no | `paperwhite2/entralink_run_state.h` |

## Exp. Share

A key item that the player turns on and off, as in Gen 6, instead of a held item.

- **On:** while the bag has it and `EVENT_FLAG_EXP_SHARE_OFF` is clear, so it starts on when the player receives it.
  The state is in ARM9 main (`src/paperwhite2/main/paperwhite2_exp_share.c`).
- **Battle:** each Pokémon that can battle but didn't face the defeated one gets half of the whole experience, not
  split among them, and the EVs. The battlers' share is as before (`src/ov167/btl_server_flow_sub.c`).
- **Bag:** Use turns it on or off and says so, staying in the bag. The description ends with "It is currently ON." or
  "OFF." (`src/ov142/itemmenu_disp.c`, `res/text/system/btl_main.txt`).
- **Y:** `SHORTCUT_EXP_SHARE` runs `FIELD_COMMON_EVENT_EXP_SHARE`, script 2818 (`global_2800.s`), which turns it on or
  off and says so (`res/text/script/global_7000.txt`).
- **Obtained:** where the original gives the Exp. Share.

## Shiny Candy

Makes one Pokémon shiny. It is used from the bag on a party Pokémon (`src/paperwhite2/ov165/paperwhite2_shiny_candy.c`,
from the party list's item mode in `src/ov165/plist_sys.c`).

- **Shininess:** a shiny PID for the trainer ID that keeps the PID's low 18 bits, so the sex, nature, ability slot and
  Wurmple's evolution stay (`PaperWhite2_MakeShinyPID`, `src/paperwhite2/main/paperwhite2_shiny_pid.c`). It has no
  effect on an Egg or a shiny Pokémon.
- **Obtained:** a wild shiny Pokémon the player defeats drops one half the time (`SHINY_CANDY_DROP_PERCENT`), and so
  does a shiny Pokémon released from the PC. The PID decides it, so loading the save again doesn't roll it again. The
  drop's script is 2819 (`global_2800.s`).
- **Icon:** its own, in `res/items/shiny_candy/`.

## DexNav

The Poké Radar's place: shows what can appear in the current area under the current conditions, by method, with the
shares and levels of the new encounter rules (docs/paperwhite2/design/dexnav.md, plugins.md's DexNav).

- **Bag and Y:** Use leaves the bag with `BAG_RESULT_DEXNAV`, and Y opens it as `SHORTCUT_DEXNAV`; both open
  `FIELD_APP_DEXNAV`, in overlay 303 beside the Pokédex's Habitat List.
- **Obtained:** the debug menu for now.

## Version Key

A test item: switches every place Unova has as Black 2 or as White 2 at once, all to Black 2's or all back to White
2's. The game never gives it (the debug menu does); the Pokémon Centers' globe is to switch the places one by one
(docs/paperwhite2/design/version-key.md).

- **State:** a flag per place, `EVENT_FLAG_BLACK2_*` (0x931-0x935), set while the place is Black 2's
  (`include/paperwhite2/version_places.h`, `src/paperwhite2/main/paperwhite2_version_places.c`). Unova Link's city key
  is no longer read for it: Black City or White Forest follows its place's flag.
- **The places and what each flag switches:**
  - **Route 4:** its cells' zone (`ZONE_ROUTE_4` or `ROUTE_4_16`, `CityState_ApplyVersionZones`), its map pieces, the
    warp Castelia Gate and Join Avenue lead to (their level scripts), the Desert Resort's texture set
    (`ZoneData_GetAreaID`), and the Dowsing Machine's other Route 4.
  - **Reversal Mountain:** which cave the mountain's outside and Undella Town lead to (their level scripts).
  - **Mistralton City:** its and its gate's map pieces.
  - **Opelucid City:** its, its gate's and three interiors' map pieces, its texture set during the Kyurem freeze.
  - **Black City:** Black City or White Forest (`CityState_InitFromSave`, the return location, the town map's zone).
  - In every place's zones, the scripts' version checks (`GameGetVersion`, `ActorMsgVersioned`) see the place's
    version, so its people say their version's lines.
  - The map pieces follow the place of each cell (`MapReplace_ResolvePatchInZone`): Driftveil City's market, in no
    place, stays White 2's.
- **Bag and Y:** Use leaves the bag with `BAG_RESULT_VERSION_KEY`, and Y runs `SHORTCUT_VERSION_KEY`; both run
  `FIELD_COMMON_EVENT_VERSION_KEY` (`src/paperwhite2/ov012/paperwhite2_version_key_event.c`). It switches the key and
  says which version Unova is as now (script 2820 or 2821), then fades out and loads the map again where the player
  stands, in the zone the place is now (`PaperWhite2_GetUnversionedZone` in `src/system/zonedata.c`, then the version
  switch). It works only where a map change keeps the player as they are: walking on the grid in a normal zone. On
  rails, cycling, surfing, in the Union Room or the Entralink it says it can't be used (script 2822) and switches
  nothing.
- **Description:** ends with "It's set to Black 2." or "White 2.".
- **Icon:** its own, in the Galactic Key's files (`res/items/galactic_key/`), for now a copy of the GB Sounds'.
- **Obtained:** the debug menu for now.
- **Rebuilt by place (2026-11-04), to test.** The shelved version's problems: the white textures came from the gates'
  warps, which chose Route 4 by the game's version (now Route 4's flag), and the Kyurem freeze's and the Desert
  Resort's areas (now their places' flags); the re-battling trainer was Pokémon Breeder Irene, one of the game's
  re-battle trainers (design/version-key.md). Still to do: limiting where it can be used (the reload keeps the
  player's tile), the globe's page, and Unova Link's key screen.
- **Scripts:** 2820-2822 are past `global_2800.s`'s original last ID, so its row of `GLOBAL_SCRIPT_TABLE`
  (`src/ov012/script_sys.c`) ends at 2822 under `PAPERWHITE2`.

## Link Cord

Evolves the Pokémon that evolve by trade, as Legends: Arceus' Linking Cord does, since the hack has no trading. It is
used from the bag on a party Pokémon as an evolution stone is (`effects.evolve`, so the bag opens the party list's
evolution mode and the field plays the evolution demo), and it is used up.

- **What evolves:** the evolution check's item mode (`CheckEvolveSpecies`, `src/system/evolution_check.c`) asks
  `PaperWhite2_LinkCordEvolves` (`src/paperwhite2/main/paperwhite2_link_cord.c`) for each evolution: a plain trade
  evolves; a trade holding an item (Metal Coat, King's Rock, Up-Grade...) only while the Pokémon holds it, and the
  demo removes it, as after the trade; Karrablast and Shelmet only while the other, not an egg, is in the party, and
  then both evolve, the partner's demo right after the first (`src/paperwhite2/ov012/paperwhite2_link_cord_event.c`,
  from `src/ov012/event_field_proclink.c`; the partner is noted before the first evolves). Otherwise "It won't have
  any effect." The trades' own evolutions are unchanged, for a trade the hack may add.
- **Everstone:** ignored, as for the stones: the item mode never checks it.
- **Demo:** can't be stopped with B, as a stone's can't: the cord is used before it (the demo's method stays the
  trade's, so the app call clears `canCancel`).
- **Icon:** its own, in `res/items/link_cord/`, for now a copy of the Destiny Knot's.
- **Obtained:** the debug menu's Give item (item 114) for now.

## Tart Apple, Sweet Apple, Syrupy Apple

Evolution items for the added Applin (`docs/paperwhite2/design/new-species.md` section 18): an Applin given the Tart
Apple becomes Flapple, the Sweet Apple Appletun, the Syrupy Apple Dipplin (`EVO_METHOD_ITEM` entries in
`res/pokemon/applin/data.json`). They need no code: like the stones, `effects.evolve` makes the bag open the party list
in its evolution mode (ABLE/UNABLE), `CheckEvolveSpecies`' item mode finds the entry, the field plays the demo and the
apple is used up; on anything else, "It won't have any effect."

- **Added as the Link Cord was** (form-evolutions.md section 7): unused items 120, 121 and 122 renamed with
  `tools/data/rename_constant.py` (`generated/items.txt`, `res/items/<name>/`, `sItemPockets`' comments), each
  `data.json` the Link Cord's with its name, plural, description, price and `sort_index` (Items pocket, field use 20,
  kind 2, fling 30); their icons' constants at the end of `generated/item_icons.txt` and their rows of
  `ITEM_GRAPHICS_CHARS_AND_PALETTES` under `#ifdef PAPERWHITE2` (`src/system/pml_item.c`).
- **Price** 220 (shown ×10: 2,200, Sword/Shield's), so they sell for 1,100.
- **Descriptions** are short originals ("An apple so sour it makes your mouth pucker. It makes certain species of
  Pokémon evolve." and the like), for the user to rewrite.
- **Icons:** placeholders, copies of the Rindo (Tart), Sitrus (Sweet) and Tamato (Syrupy) Berries' icons, in
  `res/items/<name>/icon.png` and `icon.pal`, for the user to draw (Graphics & Palettes, Item icons).
- **Obtained:** nowhere yet; the debug menu's Give item (120, 121, 122). Places they could go: a shop (Castelia's or
  the Shopping Mall Nine), hidden or visible items near where Applin will live (it lives in orchards and the like in
  Galar), or an NPC who hands one over with an Applin.
- **Free unused IDs left:** 115, 127-133, 426, 427 and 622 (after the Roseli Berry, the Fairy Gem, the Pixie Plate and
  the Nightmare Ball).

## Roseli Berry, Fairy Gem

The Fairy type's held items (docs/paperwhite2/design/fairy-type.md section 12), added as the apples were: unused items
123 and 124 renamed with `tools/data/rename_constant.py`, each `data.json` a copy of a sibling's with its name, plural,
description and `sort_index`.

- **Roseli Berry:** the Occa Berry's data with Natural Gift Fairy 60, in the Berries pocket (`sItemPockets` under
  `PAPERWHITE2`), sorted after the Chilan Berry. In battle it halves a supereffective Fairy-type hit once and is eaten,
  with the other resist Berries' message (`HandlerRoseliBerry`: `CommonResistBerry` with `TYPE_FAIRY`; Ripen makes it a
  quarter). `PML_ItemIsBerry` counts it (Bug Bite, Pluck, Harvest, Unnerve, Ripen), and so does Basic AI's Natural
  Gift table. Its hold effect is 147, as every item Gen 5 added: the battle finds its handlers by item.
- **Fairy Gem:** the Fire Gem's data, sorted before the Fighting Gem. It powers up its holder's first Fairy-type
  damaging move by half, with the Gems' message, and is used up (`CommonGemDecide`/`CommonGemPower` with
  `TYPE_FAIRY`). The rustling grass and dust clouds' Gems (`effect_encount.c`, `ITEM_FIRE_GEM` + a random 0-16) don't
  give it.
- **Battle rows:** both under `#ifdef PAPERWHITE2` at the end of `sItemEventAddTable` (`src/ov167/item_handlers.c`),
  whose lookup runs to `NELEMS` (the original's `0xac`).
- **Price:** the Roseli Berry 2 (shown ×10: 20), the Fairy Gem 20 (200), as their siblings.
- **Descriptions:** short originals, for the user to rewrite.
- **Icons:** placeholders. The Roseli Berry's is a copy of the Pecha Berry's icon and palette
  (`res/items/roseli_berry/icon.png`, `icon.pal`); the Fairy Gem shows the Gems' shared icon (the Fire Gem's) with
  its own palette, a copy of the Psychic Gem's (`res/items/fairy_gem/icon.pal`). Their constants are at the end of
  `generated/item_icons.txt`, their rows of `ITEM_GRAPHICS_CHARS_AND_PALETTES` under `#ifdef PAPERWHITE2`.
- **Obtained:** nowhere yet; the debug menu's Give item (123, 124). Places they could go: the Roseli Berry where the
  other resist Berries are found or with a Berry-giving NPC; the Fairy Gem as a hidden item, a dust cloud's or rustling
  grass's find (a case in `effect_encount.c`), or a Battle Subway prize with the other Gems.


## Pixie Plate

Arceus's Fairy plate (docs/paperwhite2/design/fairy-type.md section 12.4): unused item 125 renamed with
`tools/data/rename_constant.py`, its `data.json` the Mind Plate's (price 100, Fling 90) with its name, description, hold
effect 147 and `sort_index` 90 (with the Pink Scarf).

- **Held:** Fairy moves ×1.2 (`HandlerPixiePlate`, the plates' `CommonTypeBoostingItem`, a row at the end of
  `sItemEventAddTable`); Judgment becomes Fairy (`HandlerJudgement`); a Multitype Arceus is Fairy
  (`PML_ItemGetArceusPlateType`) and takes **form 17**, its Fairy form (`PaperWhite2_GetArceusPlateForm`, in the party
  screen's and the PC's form changes); `IsArceusPlate` counts it, so it can't be taken from Arceus in battle.
- **Icon:** placeholder, the plates' shared icon with its own palette, a copy of the Mind Plate's
  (`res/items/pixie_plate/icon.pal`, `ITEM_ICON_PALETTE_PIXIE_PLATE` at the end of `generated/item_icons.txt`, its row
  of `ITEM_GRAPHICS_CHARS_AND_PALETTES` under `#ifdef PAPERWHITE2`).
- **Description:** "An item to be held by a Pokémon. It is a stone tablet that boosts the power of Fairy-type moves.",
  the plates' words.
- **Obtained:** nowhere yet; the debug menu's Give item (125). The other plates are found in the Abyssal Ruins,
  Victory Road and the like; one could go there, or with an Arceus event.

## Nightmare Ball

The Entralink roguelike's ball (docs/paperwhite2/design/entralink-roguelike-prototype.md, Step 3): unused item 126
renamed with `tools/data/rename_constant.py`, its `data.json` the Dream Ball's (Items pocket, the battle's Poké Balls
pocket, kind 4, value 24) with its name, description and `sort_index` 17.

- **Battle:** it catches as the Master Ball does, but only in a run's battle and only an enemy whose room data lets it
  (`catch`: its `after` battles won, and not caught before if `once`); anywhere else, and every other ball in a run,
  gets the trainer battle's refusal ("Don't be a thief!"). `PaperWhite2_ThrowBall_CanCatch` and `CheckBallCapture`
  (`src/ov167/btl_server_flow_sub.c`). The caught Pokémon joins the real party, or a Box if it is full, at its own level
  (`event_battle_return.c`), and the run records the catch in the save.
- **Battle bag:** archive 228 (a/2/2/8, a byte per item of its battle pockets) is the original's, built from no source,
  so `BBagItem_MakePocketLists` (`src/ov286/b_bag_item.c`) puts the Nightmare Ball in the balls pocket itself. A later
  item with a battle pocket needs the same, or a packer for that archive from `battle_pocket`.
- **Look:** the Dream Ball's ball in battle and on its Pokémon (`PML_ItemGetMonsBallID` gives it ball 25); no new ball
  graphics.
- **Icon:** placeholder, a copy of the Dream Ball's icon and palette (`res/items/nightmare_ball/icon.png`, `icon.pal`;
  `ITEM_ICON_NIGHTMARE_BALL`, `ITEM_ICON_PALETTE_NIGHTMARE_BALL` at the end of `generated/item_icons.txt`, its row of
  `ITEM_GRAPHICS_CHARS_AND_PALETTES` under `#ifdef PAPERWHITE2`), for the user to draw.
- **Description:** "A Ball born of the Entralink's nightmare. It catches a nightmare's Pokémon without fail, and works
  nowhere else.", for the user to rewrite.
- **Obtained:** only in a run, from a room's item NPC (into the run's bag, emptied at the run's end); the debug menu's
  Give item (126) puts one in the real bag, where it does nothing.
