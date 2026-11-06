# Join Avenue offline (research, 2026-11-04)

Research for the user's Join Avenue overhaul, nothing changed yet: the avenue kept usable without any wireless
feature, filled with the user's own people from the first visit, and the management game either removed or turned
into shops bought up with money. Everything here is read from the source and from the extracted ROM's
`a/2/4/4`; nothing was tried in game. "Verified" means read in the code or data, with the place; "inferred" means
deduced and not checked.

## 1. What it is in the game

A street off Route 4 (zone `join_avenue`, 490, and its building `join_avenue_2`, 491) with eight shop lots. People
the player meets come and stand on it as visitors. The player, its manager, can **invite** a visitor to open a shop
on a free lot (the visitor becomes an occupant) or **recommend** a shop to a visitor, who visits it: the visit gives
the shop experience toward its next level and the avenue popularity toward its next rank. Shops sell goods or
services for money; their stock grows with their level. The avenue's rank (1 to 100, with a title such as "Fresh
Avenue") brings more ambient NPCs, a discount at every shop, and unlocks. Four records keep people who left.

Eight kinds of shop (`res/text/script/global_10685.txt`, messages 280-287, in this order, which is the shop table's
kind column): 0 Raffle Shop, 1 Beauty Salon, 2 Market, 3 Flower Shop, 4 Dojo, 5 Nursery, 6 Antique Shop, 7 Café.

## 2. Where it is in the code

All of it is complete, matching C, so every change is an `#ifdef PAPERWHITE2` edit of named code.

| Part | File | State |
| --- | --- | --- |
| Save block 0x43, adding visitors, people and entries | `src/system/join_avenue_savedata.c`, header `include/save/join_avenue.h` | complete (ARM9 main) |
| The records' fields, merging, the info, the daily reset | `src/system/resonance_resort_data.c` | complete (main) |
| The tables of `a/2/4/4` (`ARCID_RESORT_BINARY`, 244) | `src/system/resort_binary.c`, `include/system/resort_binary.h` | complete (main) |
| The fixed lot places and zones | `src/system/resort_layout.c` | complete (main) |
| Values from the player's records | `src/system/resort_work.c` | complete (main) |
| The field gimmick: setup, people, NPCs, data, system | overlay 137: `resort_field.c`, `resort_people.c`, `resort_data_manager.c`, `resort_npc.c`, `resort_sys.c`; header `include/field/resort.h` | 5 of 5 complete |
| Script plugin 8 (commands 1000-1039) | overlay 58 `scrcmd_resort_table.c`, 59 `scrcmd_resort.c`, 60 `scrcmd_resort_shop.c` (the shop menu) | all complete |
| Shop buildings patched into the map | `src/ov036/resort_mapcreate.c`, called from `Field_LoadJoinAvenue` (`src/ov036/fieldmap.c:1315`) | complete |
| Scripts | `res/field/scripts/global_10685.s` (`resonance_common.ev`, the shared one, 4477 lines), `join_avenue.s`, `join_avenue_2.s`, `init_join_avenue*.s` | source |
| Text | `res/text/script/global_10685.txt` (2200 lines: names, greetings, all the people's lines, shop names), `join_avenue.txt`, `join_avenue_2.txt` | source |
| Zone events | `res/field/events/join_avenue.json` (5 NPCs: staff), `join_avenue_2.json` (4) | source |

The commands' names and arguments are in `tools/script/field_commands.json` under `plugins/8` (zones 490 and 491;
1036 is unused; 1000 and 1011 are the shop menu while overlay 60 is loaded).

`a/2/4/4` is in `res/field/join_avenue/` since 2026-11-06 (`tools/data/join_avenue_data.py`, byte for byte). The hack's ROM v0.21 has
the same `a/2/4/4` as the clean ROM (compared byte for byte), and `git diff w2-original` shows only command renames in
the avenue's scripts: Frost's edits didn't touch the avenue.

## 3. Data and save layout

### The save block (verified, `include/save/join_avenue.h:333-350`, sizes from the structs)

`JoinAvenueSave`, block 0x43, 0x16a8 bytes:

| Offset | Part | What |
| --- | --- | --- |
| 0x000 | people met, `JoinAvenuePersonList` | count, lock, 8 `JoinAvenuePerson` of 0xc4 bytes. Filled only by wireless sources (section 4) |
| 0x628 | entries, `JoinAvenueEntryList` | count, 12 `JoinAvenueEntry` of 0x60 bytes: visitors to come, from local sources, GTS and Game Sync |
| 0xaac | `JoinAvenueOccupants` | the **8 occupants** (one per lot, `JoinAvenuePerson`), 4 records (`JoinAvenueRecord`, 0x58), the player's own person at +0x780, a lock |
| 0x12f4 | `JoinAvenueInfo` | the avenue's name and title (21 chars each, given by the player), 32 visitor IDs seen today, popularity, rank, season, flags (initial entries added today, unopened, the unlocks), a seed, the max-level week |
| 0x13e0 | `unk13E0[0x2c8]` | **712 bytes that nothing names**: `JoinAvenueSave_Init` leaves them (`join_avenue_savedata.c:66`), and no code found refers to them. Inferred unused; worth a check of the asm's offsets before taking them |

A RAM-only second list of 8 people exists while the player is on the avenue (`GameData_UpdateJoinAvenueForZone`,
`src/ov035/event_mapchange.c:1518`).

### A person (verified, `join_avenue.h:107-125, 186-223`)

`JoinAvenueProfile`: name (`u16[7]`, 7 characters, the reader adds the terminator), country and region, greeting
(`u16[8]`), version, language, gender (4 bits), trainer ID (`u16`), job and hobby (survey answers), play time,
**trainer type**, which is the actor's object code. Then the shop the person wants (`choice.shopId`, a row of the shop
table) and the rank of their own avenue; 7 extra data (their adventure, records, recent activities, and two
8-character messages); arrival date; the shop they run (`JoinAvenueShop`: its row ID, level 0-9, experience, a bit
per goods bought); lot (`slot`) and row; a seed.

An entry (`JoinAvenueEntry`) is the short form: profile, the two messages, a source kind (`unk4E`: 0 GTS, 1 Game
Sync, 2-5 local), a "person type" (`unk52`), lot and row, date, wanted shop, seed. Two people are the same when
trainer ID, name and gender all match (`JoinAvenueProfile_IsSame`, `resonance_resort_data.c:347`).

### The tables, `a/2/4/4` (verified by `resort_binary.c` and a dump of the extracted file)

Rows of `u16` columns, loaded uncompressed by `ResortBinary_Load(file, columns)`:

| File | Columns x rows | What (verified unless marked) |
| --- | --- | --- |
| 0 | 4 x 38 | the people's script IDs (`resort_people.c:296`, `ResortBinary_FindRow`) |
| 1 | 25 x 321 | **shops**: kind, variant (0-3), level (0-9), experience to the next level, name format message (e.g. "{name}'s Shop"), tier, map patch / lot place columns 6-7, then up to 16 goods (rows of file 2). 8 kinds x 4 variants x 10 levels, row 0 empty |
| 2 | 10 x 331 | **goods**: needs unlock 6, has its own name, name and description messages, price / 10, kind, item, count |
| 3 | 4 x 8 | the 8 lots: x, z of the building (`resort_mapcreate.c`) |
| 4 | 42 x 144 | "person types": what a visitor wants, lines by gender (`resort_sys.c:315-322`; meaning of most columns inferred) |
| 5 | 11 x 17 | the avenue's ambient NPCs: object code, zone, x, z, **minimum rank**, move code, area, script, text row (`resort_npc.c:7-18`) |
| 7 | 13 x 37 | **ranks**: rank range, chances, popularity to the next rank (300-2000), title message, the unlock reached (col 9), special visitor chance (col 10) |
| 9 | 23 x 62 | **the local people** (below) |
| 6, 8, 10, 11, 12 | | discounts and raffles (12 is the raffle's prize weights, `resort_sys.c:2126`); not all read |

File 9, the local people (verified, `ResortEntry_Fill`, `resort_sys.c:1912-1958`): column 0 a type, 1 name message,
2 trainer type (object code), 3 gender, 4 trainer ID, 5 wanted shop (row of file 1), 6 person type, 7 greeting
message, 8 and 9 the two messages, 11-22 lines of their own (only type 3 has them). Its rows:

| Rows | Type | Who | Used by |
| --- | --- | --- | --- |
| 0-1 | 0, 1 | Janus, Venus | `ResortSys_AddEntryOrRecord` mode 1, which no script calls (grep) |
| 2-5 | 4-7 | Gardner, Artos, Alena, Judith | the four records the intro and `join_avenue_2.s` add (mode 3) |
| 6-53 | 2 | **48 generic people** (Union Room looks: Youngster, Lass, Ace Trainers, Rangers, Breeders, Scientists, Nurse, Preschoolers...), trainer IDs 12351-12382, greeting "Hi." | the daily local visitors |
| 54-61 | 3 | 8 Gym Leaders (Cheren, Roxie, ... Marlon), object codes 223-230, with lines in columns 11-22 | the special visitor |

So **the game already has a table of NPC visitors in ROM data**: names and lines in a text bank, appearance, gender,
ID and shop in a table. That is the main lever.

## 4. How people get in

### Wireless and online (verified: the calls of `JoinAvenue_Add`/`JoinAvenue_AddStepwise`)

| Source | Where | Into |
| --- | --- | --- |
| Pass By (C-Gear beacons) | `src/system/game_beacon.c:766-784` | people met |
| Union Room | `src/ov028/union_receive.c:419` | people met |
| IR battle | `src/ov174/ircbattlematch.c:563` | people met |
| GTS Negotiations | `src/ov195/gtsnego_proc.c:324` | people met |
| Random Matchup | `src/ov260/wifibattlematch_net.c:1720` | people met |
| GTS trade | `src/ov214/worldtrade_upload.c:1112` (entry type 6) | entries |
| Game Sync / Dream World | `src/ov199/gsync_state.c:1747` (entry type 7) | entries |

A person from these must have one of the **16 Union Room looks** as trainer type (`JoinAvenueProfile_IsValid`,
`resonance_resort_data.c:312-333`, against `src/system/union_view.c:11-15`).

### Local, already there (verified, `src/ov137/resort_field.c:1842-1931`)

`ResortField_Setup` (`resort_field.c:371-372`) runs on every entry of the main zone:

- **Daily visitors, `ResortField_AddInitialEntries`.** Once a day (the daily reset clears `entriesAdded`,
  `resonance_resort_data.c:2561-2568`, from `src/ov012/ev_time.c:102`) and only once the avenue is open, it adds
  `stars + badges + medal rank` entries (tables `sCountByUnk`, `sCountByBadges`, `sCountByRank`, `resort_field.c:293-297`;
  about 1 to 12), each a random row of type 2 of file 9 (`ResortSys_MakeShopEntry`, `resort_sys.c:1969`), until the 12
  entries are full.
- **The special visitor, `ResortField_AddSpecialEntry`.** Once event flag 2400 is set, once a day, by the rank's
  chance (file 7 column 10), one Gym Leader (type 3) unless one is already waiting.
- **Records**: `AddEntryOrRecord 3, n` in the intro (`global_10685.s:4427-4428`) and `join_avenue_2.s:39,50`.

Local entries skip the 16-look check: `JoinAvenueEntry_IsValid` checks only source kinds 0-1
(`resonance_resort_data.c:1361`), and ResortEntry_Fill sets the source kind to 4 or 5 (the Gym Leaders use object
codes 223-230). So **the original already works offline**, slowly: only the 12 entries, never the people-met list, and
starting empty.

An entry or person becomes an occupant by the script's "Invite" (`MakeData 0`, `global_10685.s:266`;
`ResortSys_MakeData`, `resort_sys.c:1801`), which copies it into a free lot with `JoinAvenuePerson_InitFromEntry`
(`resonance_resort_data.c:1842`) and sets up the shop from its wanted shop (`JoinAvenue_ChooseShop`: the wanted row,
or a default from trainer ID and version when it is 0 or not allowed; Nursery only after unlock 6).

## 5. Shops

- A shop is a row of file 1: its kind, its variant, its level. The occupant keeps the row ID and level
  (`JoinAvenueShop`); leveling moves to the row of the next level (`ResortShopData_FindShop`, `resort_sys.c:946`).
- **Stock grows with level**: each row lists its goods (Raffle Shop rows 11-13 list 3, 4, 5 goods).
- **Price**: goods' column 4 x 10, less the rank's discount (rank - 1 percent, up to 40 percent) and 1.75 times more of
  it in the week after every shop is at level 9 (`ResortShop_GetDiscountedPrice`, `scrcmd_resort_shop.c:1937`). Paid
  with `subCashFromTotal` (`:686`).
- Services are script commands: `SetFriendship`, `RaiseLevel`, `ChangeEffortValue`, `ShortenEggSteps`,
  `RaffleShopItem` (`scrcmd_resort.c:500-700`); which kind uses which is inferred from the names.
- The building's look changes at some levels (column 6 of the row; a change returns 2 and the script reloads the
  field, `global_10685.s:903-934`).
- The shop's name is a format message with the owner's name ("{name}'s Shop", "Florist {name}"), 3 per kind by tier.

## 6. Management

| State | Where | Raised by |
| --- | --- | --- |
| Shop experience, level 0-9 | occupant's `JoinAvenueShop` | `AddShopExperience` (1009), called once, after a recommended visit (`global_10685.s:868`). Buying doesn't raise it |
| Popularity, rank 1-100 | `JoinAvenueInfo.popularity`, `rank` | `AddPopularity` (1010, `global_10685.s:999`), after visits; file 7 gives the points per rank |
| Unlocks 1-8 | `JoinAvenueInfo.unlocked*` | rank (file 7 col 9: ranks 2, 4, 6, 8, 10, 15, 20, 21), given by script; 6 allows the Nursery. What the others give is not traced |
| The avenue's name and title | `JoinAvenueInfo.name`, `title` | `NameEntry` in the intro |
| "Unopened" | `JoinAvenueInfo.unopened` | cleared by `SetOwnValue 18, 0` at the intro's end (`global_10685.s:4426`) |

The rank also decides which of the 17 ambient NPCs stand on the avenue (file 5 column 4).

## 7. How the people are drawn and placed (verified)

- **Spawned by code from the save**, not from the zone's events: `ResortPerson_CreateActor` (`resort_people.c:292`)
  makes a `ZoneNPC` with `modelId = (u8)trainerType` and UID `0x50 + index`. Occupants stand at their lot's place
  (`ResortLayout_GetOccupantPlace` from the shop row's columns 6-7, `resort_people.c:254`), records at 4 fixed places,
  entries and visitors are moved by the walker groups. Ambient NPCs come from file 5 with UIDs from 0x94.
- **Appearance** is the object code. Creating it truncates to `u8` (`resort_people.c:295`), so codes 0-255 only (no
  `OBJ_CODE_POKEMON_*`, no 3D models). The shop menu also loads the person's texture by object code
  (`ResortShop_GetModelTexture`, `scrcmd_resort_shop.c:1926`).
- **Dialogue**: generic lines of `global_10685` picked by gender and situation (`ResortSys_GetScriptValue`,
  `resort_sys.c:270-600`), with the person's name, 8-character greeting and two 8-character messages put in. Only
  special visitors (source kind 5) get lines of their own, from file 9's columns 11-22, **looked up by trainer type**
  (`ResortSys_GetTrainerTypeText`, `resort_sys.c:1690`): two people with the same look share them.

## 8. Limits

| Limit | Value | Where |
| --- | --- | --- |
| Shops (occupants, lots) | 8 | `JOIN_AVE_OCCUPANT_COUNT`, map lots in file 3 |
| Entries (waiting visitors) | 12 | `JOIN_AVE_ENTRY_COUNT` |
| People met (wireless) | 8 saved + 8 in RAM | `JOIN_AVE_PERSON_COUNT` |
| Records | 4 | `JOIN_AVE_RECORD_COUNT` |
| Shop kinds, variants, levels | 8, 4, 10 | file 1 |
| Goods per shop row | 16 | `RESORT_SHOP_GOODS_MAX` |
| Name | 7 characters | `u16 name[7]` |
| Greeting, messages | 8 `u16` each | `greeting[8]`, `JoinAvenueMessage` |
| Object codes | 0-255 | the `u8` cast |
| Wireless people's looks | the 16 Union Room looks | `JoinAvenueProfile_IsValid` |
| Text lines | any number in a text bank; a line's own length is the message box's | |
| Free save space | 0x2c8 bytes in the block (inferred unused); the hack's flag blocks (`plugins.md`, Flags) | |

A custom roster belongs in ROM data, not the save: the save holds only who is there now, as today.

## 9. Options

**(a) Seed the save from a data file, keep the original code.** A hack file in `src/paperwhite2/main/` reads
`res/paperwhite2/join_avenue/` and fills the 8 occupants (each with its shop and level, through
`JoinAvenuePerson_InitFromEntry`) and some entries, once, guarded by a hack flag. It has to run **before the map is
built**, since `Field_LoadJoinAvenue` patches the shops into the map from the occupants: at the map change
(`GameData_UpdateJoinAvenueForZone`, `src/ov035/event_mapchange.c:1518`) or at the start of `Field_LoadJoinAvenue`, not
in `ResortField_Setup`, which runs later. The intro (the tutorial that has the player invite the first shop owner)
must be shortened in `global_10685.s` so it doesn't contradict eight open shops. Size: small (one C file of ~200 lines,
two hooks, a packer, script edits). Saves past the intro get it on their next entry.

**(b) Replace the visitor source.** Hook `ResortSys_MakeShopEntry`/`ResortField_AddInitialEntries` so the daily
visitors come from the user's roster instead of file 9's type 2, and optionally make the wireless calls in section 4
do nothing under `PAPERWHITE2`. Even with no code, rewriting file 9's 48 type-2 rows and their text gives the avenue
the user's own visitors (needs only the packer). Size: small; the no-code part is just data.

**(c) Remove the management.** Hide Invite and Recommend in the scripts, keep shops fixed at their seeded levels.
Small in scripts, but it leaves rank, popularity, unlocks and visitors' dialogue unused, and the shops never grow.

**(d) Paid upgrades.** At each owner, a menu "Upgrade for X?": `MoneyCheck`/`MoneySub` (existing commands), then
`AddShopExperience` with a big point count, which raises exactly one level (it zeroes experience on a level,
`resort_sys.c:937-944`), and the existing branch that reloads the field when the building changes. Prices from a data
table through one new plugin command (or written per level in the script). Rank could follow total upgrades by
calling `AddPopularity`, keeping the discount and the ambient NPCs meaningful. Size: medium (scripts plus one
command), no change to the save.

**Recommendation: (a) + (b) + (d).** Seed eight shops and a few visitors from the user's data at the first entry,
let the daily visitors come from the same roster, and replace "recommend" with paid upgrades while keeping rank as a
reward for upgrading. Everything stays in the original data model, so the shop menu, buildings, records, and the town
map keep working, and nothing new goes in the save but one flag. Start with the packer for `a/2/4/4` (it is needed by
every option and lets the editor show the vanilla tables), then (b)'s data-only roster, which can be tried in game
before any code.

**Risks:** the seeding's timing against the map build; the intro's state machine (`EVENT_WORK_0x4110`,
`global_10685.s:4424`); occupants' dialogue paths that expect a person's extra data (wireless people carry adventure
and records, local ones don't: the game already handles entries turned occupants, so this is inferred safe); custom
lines keyed by look; saves from before the change already having occupants (seed only into empty lots).

**Not verified by reading:** anything in game; what unlocks 1-5, 7 and 8 give; the meaning of files 0, 6, 8, 10, 11
and several columns; whether an occupant made from a source-kind-5 entry works as a shop owner (the Gym Leaders
seem to be visitors only); how `JoinAvenue_GetDefaultShop` picks; that `unk13E0` is unused.

## 10. A proposed editor data shape

`res/paperwhite2/join_avenue/people.json` (the roster) and `shops.json` (upgrade prices), plus the vanilla tables as
JSON under `res/field/join_avenue/` once the packer exists. A person:

```json
{
  "id": "baker_mira",
  "name": "Mira",
  "gender": "female",
  "model": "OBJ_CODE_BAKER",
  "trainer_id": 40001,
  "greeting": "Hello!",
  "messages": ["Fresh!", "Bye!"],
  "lines": { "talk": "Mira: Have you tried the\nscones today?", "shop": "...", "upgrade": "..." },
  "shop": { "kind": "SHOP_CAFE", "variant": 0, "level": 0 },
  "start": "occupant",
  "lot": 2
}
```

- `name` up to 7 characters, `greeting` and `messages` up to 8; `model` an object code 0-255; `trainer_id` unique in
  the roster (identity is ID, name and gender); `gender` male or female.
- `start`: `occupant` (with a `lot` 0-7, at most one per lot), `visitor` (an entry at the first visit) or `pool` (comes
  as a daily visitor).
- `lines` needs a small hook in `ResortSys_GetScriptValue` that looks a person up by trainer ID in the hack's table,
  since the game's own per-person lines are keyed by look; without it, people get the generic lines with their name and
  three short texts.
- `shops.json`: a price for each kind and level (`{"SHOP_CAFE": [0, 2000, 4000, ...]}`), and whether an upgrade adds
  popularity.

## 11. Open questions for the user

1. Keep the avenue's rank (discounts, ambient NPCs, its title), earned by upgrading, or drop it?
2. Remove "Recommend" and "Invite" entirely, or keep inviting from the roster's visitors to fill empty lots?
3. Keep the four records and the people-met lists, or hide them?
4. Should wireless still add visitors when used, or be switched off?
5. Should the eight shops be fixed (always the same owners) or should owners change over time?
6. Do people need their own full dialogue (the `lines` hook), or are name, greeting and two messages enough?
7. The tutorial when the avenue opens: shorten it, or replace it with a scene of the user's?

## The user's decisions (2026-11-04)

- **Keep the rank system**, earned a new way: upgrading the shops (with Poké money, section 9's paid upgrades), not
  by visitors' recommendations.
- **Remove everything multiplayer or wireless**: the people met by Pass By, IR, Wi-Fi and the Union Room, inviting,
  recommending, and whatever else only they feed.
- **Fixed shops and people**: the eight owners and the avenue's people are the user's, the same in every game
  (no daily roster that changes them).
- **Their own dialogue**, in place of the generic lines by gender and the eight-character messages: the `lines`
  hook (keyed by trainer ID, section 9) is wanted.
- **The opening tutorial** will likely be changed or shortened by the user.

## The user's decisions (2026-11-06), the plan

The original's progression stays: inviting, recommending, shop levels, the rank and its discounts and unlocks.

- **The owners are the user's**, from the editor, each wanting its shop, so all eight kinds come. Each day the visitors
  are first the owners who haven't opened a shop yet, then random visitors as now (a hook in the daily visitors,
  `ResortField_AddInitialEntries` / `ResortSys_MakeShopEntry`).
- **Only the owners can be invited, and only the others recommended to**: the talk's menu tells them apart by a
  trainer ID range kept for the owners (a small command the avenue's script asks).
- **Owners can't leave or be replaced.** Records of people who left are hidden.
- **The Nursery's owner comes from rank 15** (unlock 6), as the original allows the Nursery.
- **The random visitors** are the original's 48 until the user edits them (`res/field/join_avenue/09_people.json`,
  type 2, data only); the Gym Leaders stay special visitors. Everything wireless is off.
- **The owners' own dialogue** (the `lines` hook of section 10), and a shortened opening, which the user may rewrite.

Steps: 1. the packer (done); 2. the owners' data and the daily hook; 3. the menu's rule and owners that stay;
4. the editor page; 5. the opening and the wireless sources. To check in game or in the code on the way: whether
Invite goes when the eight lots are full, how the talk's menu is built, what unlocks 1-5, 7 and 8 give.
