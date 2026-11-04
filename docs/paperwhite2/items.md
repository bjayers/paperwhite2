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
- **Icon:** the GB Sounds' for now.
- **Obtained:** the debug menu for now.
- **Rebuilt by place (2026-11-04), to test.** The shelved version's problems: the white textures came from the gates'
  warps, which chose Route 4 by the game's version (now Route 4's flag), and the Kyurem freeze's and the Desert
  Resort's areas (now their places' flags); the re-battling trainer was Pokémon Breeder Irene, one of the game's
  re-battle trainers (design/version-key.md). Still to do: limiting where it can be used (the reload keeps the
  player's tile), the globe's page, and Unova Link's key screen.
- **Scripts:** 2820-2822 are past `global_2800.s`'s original last ID, so its row of `GLOBAL_SCRIPT_TABLE`
  (`src/ov012/script_sys.c`) ends at 2822 under `PAPERWHITE2`.
