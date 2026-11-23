# Wireless-only screens kept as shells (2026-11-23)

Paper White 2 is fully local. A screen that every path of which needs wireless (DS wireless, infrared or Wi-Fi), with
no local purpose at all, is **emptied but kept as a shell**: its process's table (`GameProcFunctions`) stays, under
the same name, but in hack builds its Init, Main and Exit are one function that returns TRUE at once, so the process
ends the frame it starts, draws nothing, allocates nothing and leaves its caller's parameters as they were (each
caller's "nothing happened" value, below). Nothing that refers to the table dangles; the linker drops the code that
only the old functions reached, so most shells shrink their overlay to a few bytes. The plain build is unchanged
(`#ifdef PAPERWHITE2`, the original in `#else`). A screen with any local use is converted instead (icon-screens.md).

Found while converting the party icons (icon-screens.md, phase 5, section 8). How the field's paths were already cut:
the C-Gear's IR, Xtransceiver and Game Sync markers are replaced by the hack's apps (`src/ov079/c_gear_sw.c`,
`sMarkerActions`), and the Pokémon Centers' upstairs counters run the Day Care attendant (script 2101, was the Union
Room), the Wonder Trade (10100, was the Wi-Fi Club) and Training Services (10105, was the Global Terminal): the
wireless script commands (`MapChangeUnionRoom`, `NetConnectWiFiClub`, `NetConnectWiFiBattle`, `NetConnectGTS`,
`NetConnectGTSNegotiation`, `NetConnectBattleVideo`) are only in those scripts' `#else` branches, and no other
script uses them.

**To reuse a shell:** put the original functions back in the table (delete the `#ifdef PAPERWHITE2` branch), then give
it a path: a script command, a C-Gear marker (`CGearSw_GetActionApp`) or a title menu item. Its icons are still on the
fallback (the banks; icon-screens.md section 1), so convert them as the other screens were.

## The shells

| Screen | Files and overlay | What was kept | How it was reached | Proof it is wireless-only |
| --- | --- | --- | --- | --- |
| **Linked trades: the trade box and the offer** | `src/ov194/pokemontrade_proc.c` (the tables), `pokemontrade_2d.c`, `pokemontrade_nego.c`; overlay 194 | the four network tables (`data_ov194_021c63dc` IR, `data_ov194_021c640c` Union Room, `POKEMONTRADE_WIFICLUB_PROC_FUNCTIONS`, `POKEMONTRADE_PROC_FUNCTIONS` GTS Negotiations) point at `PokemonTrade_Shell`; the in-game and Wonder Trades' table (`data_ov194_021c63ac`, `PokemonTrade_StartRequest4`, the trade scene only) and the GTS's demo tables are unchanged, so the overlay keeps its code | IR (`ov012/event_ircbattle.c`), Union Room (`ov028/union_subproc.c`), Wi-Fi Club (`ov008/event_wificlub.c`), GTS Negotiations (`ov001/event_gtsnego.c`) | each of the four is a network link; in-game trades (`ov033/fld_trade.c`) and the Wonder Trade (`paperwhite2_wonder_trade.c`) use type 4, which skips the box (`PokemonTrade_Init`: `type < 4` loads the box) |
| **Wi-Fi Club** | `src/ov173/wifi_p2pmatch.c`, overlay 173 (43.6 KB → 9 KB) | `WIFICLUB_PROC_FUNCTIONS` → `WifiP2PMatch_Shell`; the club's `mode` stays 0, which the event takes as leaving | `ov036/scrcmd_net.c` `NetConnectWiFiClub` ← `global_10100.s` (`#else`) | Wi-Fi only |
| **IR ranking** (the Feeling Check's ranking) | `src/ov180/irc_ranking.c`, overlay 180 (8.5 KB → 64 B) | `IRC_RANKING_PROC_FUNCTIONS` → `IrcRanking_Shell`; its parameter has no result | `ov175/irc_compatible.c` ← the IR menu ← `CallIRC` ← the C-Gear's IR marker | infrared only; the marker is gone |
| **Game Sync** (its process and menu) | `src/ov199/gsync_state.c`, `gsync_menu.c` (`gsync_disp.c` drew the icon), overlay 199 (27.8 KB → 12.8 KB) | `GSYNC_PROC_FUNCTIONS` → `GSync_Shell`, `GSYNC_MENU_PROC_FUNCTIONS` → `GSyncMenu_Shell`; the event's result stays none (leave) | `ov000/event_gsync.c` ← the C-Gear's Game Sync marker | Wi-Fi only; the marker is gone. The title's Game Sync Settings is another process (`game_sync_settings_proc.c`), untouched |
| **GTS** | `src/ov214/worldtrade.c` (`worldtrade_box.c` drew the box), overlay 214 | `WORLDTRADE_PROC_FUNCTIONS` → `WorldTradeProc_Shell`; the event reads no result | `ov004/event_worldtrade.c` ← `NetConnectGTS` ← `global_10105.s` (`#else`) | Wi-Fi only |
| **Multi battle list** | `src/ov171/vs_multi_list.c`, overlay 171 (5 KB → 32 B) | `VS_MULTI_LIST_PROC_FUNCTIONS` → `VsMultiList_Shell`; its parameter is input only | `ov010/event_make.c`, after the link's timing sync, from the Union Room's and IR's battles | DS wireless or IR only |
| **Battle video rankings** (the Battle Recorder's online list) | `src/ov268/br_bvrank_proc.c`, overlay 268 (shared with the local video screen, which is kept) | `BR_BVRANK_PROC_FUNCTIONS` → `BrBvRank_Shell`; the Battle Recorder's process stack goes back to its menu | only the Global Link mode's menu 7 (`ov271/br_btn_data.c`), set by `ov003/event_battle_video.c` ← `NetConnectBattleVideo` ← `global_10105.s` (`#else`); the Vs. Recorder's own menus never push it | Wi-Fi only |
| **Battle Competition** (Wi-Fi and live; its cards and team lists in `ov262/wifibattlematch_view.c`) | `src/ov290/wifibattlematch_sys.c`, overlay 290 (6 KB → 1.1 KB), and the title menu (`src/ov162/startmenu.c`) | `WIFIBATTLEMATCH_PROC_FUNCTIONS` → `WifiBattleMatchSys_Shell`; the title menu no longer lists Battle Competition (as Unova Link) | the title menu's Battle Competition (unlocked by `aspertia_city.s`'s `StartMenuUnlockItem 1`), and the field's `NetConnectWiFiBattle` ← `global_10105.s` (`#else`) | every card and team screen needs a cup entry, which only Wi-Fi or a live tournament's infrared delivery gives (`digitalcardcheck.c`: "no card" while the cup's ID is 0) |

| **Dream Radar** (phase 6; Unova Link's receiving of what the 3DS app wrote, its legend scenes and the 12 icons of the Pokémon it brings, `cygnus_flow.c`) | `src/ov332/key_system_main.c` (the top menu), `cygnus_flow.c`; overlay 332, shared with the Key System and Memory Link, which are kept | Unova Link's process and top menu are unchanged; in hack builds the top menu's Dream Radar item goes straight back to the menu, and the Dream Radar's work is never made (`CygnusFlow_Init`/`_Exit` and the `CygnusFlow_SeqMenu` push under `#ifndef PAPERWHITE2`). Its code stays in the overlay (global functions, so the linker keeps them; −32 bytes) | only Unova Link's top menu, which only the title menu's Unova Link opens: gone from the hack's title menu (`ov162/startmenu.c`); the game clear (`ov012/event_game_clear.c`) and the Key System script command (`ov012/scrcmd_keysystem.c`) open Unova Link in its game-clear mode, which starts at the Key System's game-clear flow (only a wireless error in a key exchange pops back to the top menu, and so to the shell) | it only receives what the 3DS app Pokémon Dream Radar wrote to a retail card (`src/system/cygnus_save_control.c`, `CYGNUS_DATA_CARD_OFFSET`); a hack's card (flashcart, TWiLight Menu++, an emulator) never gets that, so it has no local use |

Overlay 290 was the highest overlay in main RAM, so the DS arena, which starts at its end, gains its 5 KB: 0x4240 →
0x55e0 (memory.md).

**Kept as they are:** the party list's partner parties (`ov165/plist_battle.c`, `showPartners`): a mode of a local
screen, set only by the Union Room, the Battle Competition and the Wi-Fi Club's battles, all shells or unreachable
now; the battle party list without partners is local and converted. Other wireless screens with no Pokémon icons (the
IR menu, the Union Room, the wireless Xtransceiver, Mystery Gift's receiving, Game Sync Settings) are outside this
pass: wireless-removal-approach's final pass.

**Tested** (py-desmume, a copy of the save): the ROM boots, the title menu lists Continue, New Game, Mystery Gift,
Game Sync Settings, Nintendo WFC Settings and Mic Test, the game continues to the field, the save report, the party,
the C-Gear and a Center's PC box open and close as before. The shells themselves can't be reached, which is the point.
