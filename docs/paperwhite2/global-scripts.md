# Global scripts

Written by `tools/paperwhite2/global_scripts.py`; run it again after adding a global script. Each row of
`GLOBAL_SCRIPT_TABLE` (`src/ov012/script_sys.c`) gives a file of the field script archive a range of script
IDs: its scripts are its `ScriptEntry` lines, in order from the range's first ID. An ID past the range's end
fails `FieldScript_ResolveSCRID`'s assert at run time (see plugins.md, Adding global scripts). The descriptions
and original file names are the user's reference list of Gen 5's global scripts.

| Range | File | Archive ID | Original | Description | IDs used | First free | Free |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2000-2099 | `res/field/scripts/global_2000.s` | 1230 | `common.ev` | Save game, blackout, unusable items | 2000-2006 (7) | 2007 | 93 |
| 2100-2199 | `res/field/scripts/global_2100.s` | 1231 | `pokecen.ev` | Pokémon Center actors | 2100-2110 (11) | 2111 | 89 |
| 2200-2224 | `res/field/scripts/global_2200.s` | 1232 | `sodateya_scr.ev` | Daycare | 2200-2201 (2) | 2202 | 23 |
| 2225-2249 | `res/field/scripts/global_2225.s` | 1233 | `namechange_scr.ev` | Name rater | 2225 (1) | 2226 | 24 |
| 2250-2259 | `res/field/scripts/global_2250.s` | 1234 | `egg_scr.ev` | Egg hatching | 2250 (1) | 2251 | 9 |
| 2260-2279 | `res/field/scripts/global_2260.s` | 1235 | `poke_waza.ev` | Move deleter, Move reminder | 2260-2261 (2) | 2262 | 18 |
| 2280-2299 | `res/field/scripts/global_2280.s` | 1236 | `move_tutor.ev` | Move tutors | 2280-2288 (9) | 2289 | 11 |
| 2500-2799 | `res/field/scripts/global_2500.s` | 1237 | `bg_attr.ev` | Interactible tiles - trash cans, bookcases... | 2500-2507 (8) | 2508 | 292 |
| 2800-2819 | `res/field/scripts/global_2800.s` | 1238 | `item_get_scr.ev` | Field item dialogs | 2800-2819 (20) | none | 0 |
| 3000-4999 | `res/field/scripts/global_3000.s` | 1239 | `trainer.ev` | Regular field trainers - single/primary double battle trainer | 3000-3816 (817) | 3817 | 1183 |
| 5000-6999 | `res/field/scripts/global_3000.s` | 1239 | `trainer.ev` | Regular field trainers - secondary double battle trainer (the file of 3000-, whose entries this range reaches from its own start) | 5000-5816 (817) | 5817 | 1183 |
| 7000-7799 | `res/field/scripts/global_7000.s` | 1240 | `fld_item.ev` | Regular field item logic | 7000-7400 (401) | 7401 | 399 |
| 8000-8799 | `res/field/scripts/global_8000.s` | 1241 | `hide_item.ev` | Hidden field item logic | 8000-8212 (213) | 8213 | 587 |
| 9600-9699 | `res/field/scripts/global_9600.s` | 1242 | `init_scr.ev` | Game initialization and post-HOF | 9600-9605 (6) | 9606 | 94 |
| 10000-10089 | `res/field/scripts/global_10000.s` | 1243 | `hiden.ev` | HM sequences | 10000-10015 (16) | 10016 | 74 |
| 10090-10099 | `res/field/scripts/global_10090.s` | 1244 | `pokecen_haihu_scr.ev` | Pokémon Center system | 10090 (1) | 10091 | 9 |
| 10100-10104 | `res/field/scripts/global_10100.s` | 1245 | `wifi_club_scr.ev` | Wi-Fi club/Pal pad actor scripts | 10100 (1) | 10101 | 4 |
| 10105-10109 | `res/field/scripts/global_10105.s` | 1246 | `global_terminal_scr.ev` | Global Terminal - GTS/online scripts | 10105 (1) | 10106 | 4 |
| 10110-10119 | `res/field/scripts/global_10110.s` | 1247 | `shop_scr.ev` | Regular and BP shops | 10110 (1) | 10111 | 9 |
| 10130-10149 | `res/field/scripts/global_10130.s` | 1248 | `field_event.ev` | Basic field events - repel, fishing, entralink warp | 10130-10146 (17) | 10147 | 3 |
| 10200-10249 | `res/field/scripts/global_10200.s` | 1249 | `dummy.ev` | Dummy script | 10200 (1) | 10201 | 49 |
| 10250-10259 | `res/field/scripts/global_10250.s` | 1250 | `blank.ev` | Dummy script | 10250 (1) | 10251 | 9 |
| 10260-10269 | `res/field/scripts/global_10260.s` | 1251 | `competition_check.ev` | Tournament eligibility checking | 10260-10261 (2) | 10262 | 8 |
| 10270-10279 | `res/field/scripts/global_10270.s` | 1252 | `deox_change_scr.ev` | Deoxys forme change system | 10270 (1) | 10271 | 9 |
| 10280-10289 | `res/field/scripts/global_10280.s` | 1253 | `fossil_scr.ev` | Fossil restoration | 10280 (1) | 10281 | 9 |
| 10290-10309 | `res/field/scripts/global_10290.s` | 1254 | `poketransfer_scr.ev` | Poké Transfer actor dialogues | 10290-10295 (6) | 10296 | 14 |
| 10310-10314 | `res/field/scripts/global_10310.s` | 1255 | `judge_scr.ev` | EV judge | 10310 (1) | 10311 | 4 |
| 10315-10324 | `res/field/scripts/global_10315.s` | 1256 | `rotom_change_scr.ev` | Rotom forme change system | 10315 (1) | 10316 | 9 |
| 10325-10329 | `res/field/scripts/global_10325.s` | 1257 | `trade_stats.ev` | Trading total check and rewards | 10325 (1) | 10326 | 4 |
| 10330-10349 | `res/field/scripts/global_10330.s` | 1258 | `bsubway_common.ev` | Battle subway script resource | 10330-10348 (19) | 10349 | 1 |
| 10350-10379 | `res/field/scripts/global_10350.s` | 1259 | `c03_c00_common.ev` | Castelia Street rush dialogue | 10350-10377 (28) | 10378 | 2 |
| 10380-10389 | `res/field/scripts/global_10380.s` | 1260 | `hyouka_scr.ev` | Pokémon Professor lab dialogue | 10380-10382 (3) | 10383 | 7 |
| 10390-10394 | `res/field/scripts/global_10390.s` | 1261 | `dream_remnant_scr.ev` | Entree forest item boy | 10390-10391 (2) | 10392 | 3 |
| 10395-10399 | `res/field/scripts/global_10395.s` | 1262 | `pgl_postman_scr.ev` | Pokémon Global Link Mystery Gift delivery | 10395-10397 (3) | 10398 | 2 |
| 10400-10404 | `res/field/scripts/global_10400.s` | 1263 | `vendor_scr.ev` | Vending machines | 10400 (1) | 10401 | 4 |
| 10405-10434 | `res/field/scripts/global_10405.s` | 1264 | `elevator.ev` | Elevator buttons and door dialogs | 10405-10426 (22) | 10427 | 8 |
| 10435-10439 | `res/field/scripts/global_10435.s` | 1265 | `passpower_scr.ev` | Pass power dialogs | 10435-10436 (2) | 10437 | 3 |
| 10440-10444 | `res/field/scripts/global_10440.s` | 1266 | `battle_inst.ev` | Battle institute reception dialogue | 10440-10441 (2) | 10442 | 3 |
| 10445-10449 | `res/field/scripts/global_10445.s` | 1267 | `dream_decor_scr.ev` | Loblolly Dream World Décor dialogue | 10445-10446 (2) | 10447 | 3 |
| 10450-10469 | `res/field/scripts/global_10450.s` | 1268 | `musical_scr.ev` | Pokémon Musical dialogue and logic | 10450-10466 (17) | 10467 | 3 |
| 10470-10479 | `res/field/scripts/global_10470.s` | 1269 | `dun200x_common.ev` | Abyssal ruins ambient | 10470-10477 (8) | 10478 | 2 |
| 10480-10489 | `res/field/scripts/global_10480.s` | 1270 | `collector_scr.ev` | Rare item collector dialogue | 10480-10484 (5) | 10485 | 5 |
| 10490-10509 | `res/field/scripts/global_10490.s` | 1271 | `forest_clearing_scr.ev` | Entree forest clearings common dialogs | 10490-10497 (8) | 10498 | 12 |
| 10510-10519 | `res/field/scripts/global_10510.s` | 1272 | `ferris_wheel.ev` | Ferris wheel actor dialogue | 10510 (1) | 10511 | 9 |
| 10520-10529 | `res/field/scripts/global_10520.s` | 1273 | `fungi_scr.ev` | Foongus/Amoonguss ambush | 10520-10521 (2) | 10522 | 8 |
| 10530-10534 | `res/field/scripts/global_10530.s` | 1274 | `tv_scr.ev` | TV programme | 10530 (1) | 10531 | 4 |
| 10535-10634 | `res/field/scripts/global_10535.s` | 1275 | `follow_common.ev` | Following actor interactions - N, Bianca... | 10535-10540 (6) | 10541 | 94 |
| 10635-10654 | `res/field/scripts/global_10635.s` | 1276 | `medal_scr.ev` | Mr. Medal dialogue | 10635-10638 (4) | 10639 | 16 |
| 10655-10664 | `res/field/scripts/global_10655.s` | 1277 | `pwt_lobby.ev` | PWT lobby system | 10655-10660 (6) | 10661 | 4 |
| 10665-10674 | `res/field/scripts/global_10665.s` | 1278 | `pwt_arena.ev` | PWT battle arena system | 10665-10667 (3) | 10668 | 7 |
| 10675-10684 | `res/field/scripts/global_10675.s` | 1279 | `pwt_trainer.ev` | PWT trainer dialogue | 10675-10678 (4) | 10679 | 6 |
| 10685-10734 | `res/field/scripts/global_10685.s` | 1280 | `resonance_common.ev` | Join Avenue script resource | 10685-10700 (16) | 10701 | 34 |
| 10735-10784 | `res/field/scripts/global_10735.s` | 1281 | `unova_challenge_scr.ev` | Black Tower/White Treehollow trainers | 10735-10754 (20) | 10755 | 30 |
| 10785-10794 | `res/field/scripts/global_10785.s` | 1282 | `field_minigame.ev` | Rock paper scissors, item trades... | 10785-10794 (10) | none | 0 |
| 10795-10814 | `res/field/scripts/global_10795.s` | 1283 | `hidden_grotto_enter.ev` | Hidden grotto entrance dialog | 10795-10814 (20) | none | 0 |
| 10815-10834 | `res/field/scripts/global_10815.s` | 1284 | `pokewood_lobby_common.ev` | Pokéstar studios lobby script resource | 10815-10823 (9) | 10824 | 11 |
| 10850-10859 | `res/field/scripts/global_10850.s` | 1285 | `dummy.ev` | Dummy script | 10850-10856 (7) | 10857 | 3 |
| 10860-10864 | `res/field/scripts/global_10860.s` | 1286 | `field_xtransceiver.ev` | Xtransceiver answer dialog | 10860 (1) | 10861 | 4 |
| 10865-10884 | `res/field/scripts/global_10865.s` | 1287 | `pokewood_theatre.ev` | Pokéstar studios theatre system | 10865-10869 (5) | 10870 | 15 |
| 10885-10914 | `res/field/scripts/global_10885.s` | 1288 | `dun2710_common.ev` | Plasma Frigate password hint trainers | 10885-10901 (17) | 10902 | 13 |

2621 IDs used, 4539 free.

## Hack scripts

The entries a file has beyond its count in the original game (git's `w2-original` tag). A file the hack
changed without adding entries isn't listed.

| ID | File | Entry | Purpose |
| --- | --- | --- | --- |
| 2818 | `res/field/scripts/global_2800.s` | Script_19 | The Exp. Share toggle, which the Y button's shortcut starts (`SCRID_EXP_SHARE_TOGGLE`, include/paperwhite2/exp_share.h) |
| 2819 | `res/field/scripts/global_2800.s` | Script_20 | The Shiny Candy drop after a wild battle won against a shiny Pokémon (`SCRID_SHINY_CANDY_DROP`, include/paperwhite2/shiny_candy.h) |
| 9603 | `res/field/scripts/global_9600.s` | Script_4 | The new game's starting flags, the original's subroutine of scripts 9600 and 9602 given an entry by the hack's data; nothing starts it by its ID |
| 9604 | `res/field/scripts/global_9600.s` | Script_5 | The survey's answers by the version and the player's sex, the original's subroutine of script 9600 given an entry by the hack's data; nothing starts it by its ID |
| 9605 | `res/field/scripts/global_9600.s` | Script_6 | The flags and work reset after the Hall of Fame, the original's subroutine of script 9601 given an entry by the hack's data; nothing starts it by its ID |
| 10146 | `res/field/scripts/global_10130.s` | Script_17 | The debug menu that START opens in the field (`SCRID_PAPERWHITE2_DEBUG_MENU`, src/ov036/fieldmap_event.c), under PAPERWHITE2_DEBUG_MENU |
| 10851 | `res/field/scripts/global_10850.s` | Script_2 | The user's: the Pokémon Center lottery girl's daily gift, a random item by chance tiers (`EVENT_FLAG_DAILY_0x0af0`), from the Centers' events |
| 10852 | `res/field/scripts/global_10850.s` | Script_3 | The user's: the seasonal NPC spawns, a map script that hides flags 500-599's NPCs and shows a random few of the current season's |
| 10853 | `res/field/scripts/global_10850.s` | Script_4 | The user's: gives a random item, 0x8011 plus a random number below 0x8010, through script 2805; 0x8012 is whether the bag had no room (Aspertia City, Route 20) |
| 10854 | `res/field/scripts/global_10850.s` | Script_5 | The user's: a scripted wild battle with species 0x8010 at four fifths of the lead's level, after its cry; 0x8012 is the result (Virbank Complex, Route 20) |
| 10855 | `res/field/scripts/global_10850.s` | Script_6 | The user's: sorts the value in 0x8010 into one of six groups, returned in 0x8012; nothing starts it by its ID (not identified) |
| 10856 | `res/field/scripts/global_10850.s` | Script_7 | The user's: picks a random value of tier 0x8010 (1-6) into 0x8012; nothing starts it by its ID (not identified) |
