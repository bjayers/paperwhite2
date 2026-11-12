# The Pokémon Center as a hub (ideas, 2026-11-06)

The user's ideas, on the books, not started. Roadmap phase 3 ("the Pokémon Centers' upstairs attendants"). The
wireless attendants are replaced by useful local services, making the Pokémon Center even more of a hub.

## The attendants

- **A training assistant:**
  - the move relearner and deleter;
  - IV and EV services, for a price;
  - nature changes, for a price.
- **A Wonder Trade:** send an unwanted Pokémon for a chance at something special.
  - Randomised Pokémon, but no legendaries; except that one particular legendary could be found here, at a raised rate
    until it's obtained, with a pity count that guarantees it at some point (as in a gacha).
  - Better odds than the wild of being shiny, having the hidden ability or holding a rare item.
  - Randomised trainer names, IDs and regions (a Japanese Pokémon is possible).
- **A third, undecided:** randomised trainer battles? Day Care access from anywhere?

## Notes from the ROM session (2026-11-06)

- **Relearner and deleter:** the game has both (`res/field/scripts/global_2260.s`, `MoveReminderCheckPkm`,
  `MoveReminderCallMoveSelect`), so the attendant can call the same screens.
- **IVs, EVs, natures:** script commands of our own that change the Pokémon's data, with `MoneyCheck` and `MoneySub`.
  To verify: Gen 5 is believed to keep the nature in a byte of its own, which would let it change without touching
  the PID (shininess, gender, ability slot); if not, a nature change needs care.
- **Wonder Trade:** the in-game trade's commands and scene exist (`FieldTradeStart`, `FieldTradeCheck`,
  `FieldTradeSavePokemon`), so a generated Pokémon could be traded in by the same path. Its level could follow the
  party's level (`Conditions_PartyLevel`). To check: that the font shows Japanese names (a Japanese OT and nickname).
- **Trade evolutions:** 22 species still evolve only by trade (6 plain trades, 14 trades holding an item, Karrablast
  and Shelmet's trade for each other), which is impossible without wireless. They need a local way: changed evolution
  methods, a trade-evolution service, or the Wonder Trade (or a "trade with the attendant and back") doing it.
- **Ideas for the third:** a delivery attendant in place of Mystery Gift, which is wireless-only, giving event
  Pokémon and items for milestones or codes; local randomised trainer battles in place of the Union Room's, at the
  party's level; Day Care access; or the trade-evolution service above.

## The design (2026-11-11)

The user's decisions, with Claude's proposed prices, odds and item lists, which wait for the user's approval. They
replace the ideas above where they differ (the Wonder Trade's special reward is the Spiky-eared Pichu, not a
legendary; the third attendant is the Day Care's). The services are money sinks: each costs more than its free,
out-of-the-way original, and the price is for the convenience.

### Training Services (one attendant, a scrolling list)

The field's list menus scroll (they keep a top row and a cursor row: `MsgBGPrinter_CreateMenuFuncCallback`'s
`listTop` and `cursorRow`), so eight services fit one list.

| Service | What it does | Proposed price |
| --- | --- | --- |
| Name Rater | Rename. Pokémon with another OT are refused, as in vanilla, so a Wonder Trade's foreign name is kept | ₽1,000 |
| Move Relearner | The vanilla relearner's screen | 1 Heart Scale + ₽3,000 |
| Move Deleter | The vanilla deleter's screen | ₽2,000 |
| Hyper Training | One stat's IV to 31. After becoming Champion, level 100 only. Changes the real IV (so Hidden Power's type can change) | 24 BP a stat |
| Effort Services | Reset one stat's EVs, or all | ₽5,000 one, ₽20,000 all |
| Ability Services | Swap the two normal abilities, or change to the hidden ability (its own field, `PKM_PARAM_HIDDEN_ABILITY`) | ₽50,000 swap, ₽150,000 hidden |
| Grooming | Raise friendship: brush +10, deluxe +30, royal +60 | ₽2,000 / ₽8,000 / ₽20,000 |
| Poké Ball Services | Move the Pokémon into a ball from the bag; the ball is taken and the old one destroyed | ₽3,000 + the ball |
| Nature Services | Change the nature (its own field, `PKM_PARAM_NATURE`, so shininess, gender and ability stay) | ₽30,000 |

- **Battle Points** come only from the Battle Subway and the PWT once wireless is gone (the Random Matchup's award,
  `res/field/scripts/global_2100.s`, is wireless). For scale, the BP shop (`src/ov036/scrcmd_shop.c`) sells
  vitamins for 1 BP, Choice items and Rare Candy for 24: Hyper Training a whole Pokémon is 144 BP.
- The user approved every price, rate and list here (2026-11-11), and wants all of them (fees, BP costs, odds, the
  item tiers and their items) in a data file editable in the editor.

#### Built (2026-11-12)

- **The counter:** the right of the three upstairs, the Global Terminal's (script 10105, `global_10105.s`'s
  `Script_1` under `#ifdef PAPERWHITE2`, the GTS's code in `#else`; the attendant keeps `OBJ_CODE_81`'s sprite). Its
  text is appended to `res/text/script/global_10105.txt` (`Global10105_Text_Training*`). The middle counter is the
  Wonder Trade's.
- **The menu:** a greeting, then a list of the nine services and Cancel that scrolls (six rows show), looping with
  "anything else?" until Cancel or B. The money window stays up. A service with one price checks the money before
  the party screen; each picks a party Pokémon with the Name Rater's party screen (`CallPokeSelect`; an Egg is
  refused), shows the price, asks Yes/No and pays before the change, saying so when the money is short. The long lists (services, stats, Poké Balls, natures) are at the top left, under
  nothing; the short ones (abilities, grooming) at the top right under the money window.
- **Name Rater:** the vanilla rename screen (`CallPokeNameInput`), refusing a Pokémon whose OT isn't the player
  (`PokePartyIsOriginGame`, as `global_2225.s` does) with praise for its name. Paid only when the name changed.
- **Move Relearner:** `MoveReminderCheckPkm` and the vanilla screen (`MoveReminderCallMoveSelect`), for the
  relearner's item and money (1 Heart Scale + ₽3,000), checked first and taken only when a move was learned.
- **Move Deleter:** the vanilla screen (`CallPokeMoveReplace` with HMs allowed, as `global_2260.s`), refusing a
  Pokémon with one move; ₽2,000, paid at the confirmation, after the move was chosen.
- **Hyper Training:** after the Hall of Fame (`EVENT_FLAG_0x0960`, set by `global_9600.s`'s `Script_6` the first
  time, which the game's own postgame checks read) and at level 100, both from the data; explains which is missing. A
  list of the six stats marks those at 31 "(best)" and refuses them; 24 BP a stat from the Battle Subway's BP
  (`BSubwayScoreData`), and the message says how many the player has. Sets the real IV and recalculates the stats.
- **Effort Services:** "All stats" or one stat (₽20,000 / ₽5,000); refuses a Pokémon with no EVs, or a stat at 0.
  Recalculates the stats.
- **Ability Services:** shows the ability; Swap (₽50,000) or Hidden (₽150,000). A swap needs two different normal
  abilities and no hidden ability; it flips the PID's ability bit (bit 16, or bit 0 for Pokémon from before Black and
  White) and sets the other ability, because evolution, form changes (`setAbilityForForm`) and breeding
  (`getPkmAbilSlotNumber`) read the slot from the PID; the PID's blocks are moved to the new order (bits 13-17 order
  them), and the flip keeps shininess (the threshold is even) and the sex (bit 16 isn't in the low byte; a bit-0 flip
  that would change the sex is refused). Wurmple, whose evolution reads the PID's high half, has one ability, so it is
  never swapped. The hidden ability sets `PKM_PARAM_ABILITY` and `PKM_PARAM_HIDDEN_ABILITY`, as the game's
  `PokeParty_SetHiddenAbil` does; refused when the species has none different from its normal ones, or it has it.
- **Grooming:** Brush, Deluxe, Royal with their prices in the list (+10, +30, +60 friendship, at most 255);
  refuses a Pokémon at 255.
- **Poké Ball Services:** refuses with no Poké Balls in the bag; lists the bag's balls (every ball item, by ID, that
  `PML_ItemGetMonsBallID` knows); refuses the ball the Pokémon is already in; ₽3,000 and one ball from the bag; the
  old ball is gone.
- **Nature Services:** the 25 natures in a list, the current one "(now)" and refused; ₽30,000; `PokeParty_SetNature`
  (the nature's own field, which the stat calculation reads) and the stats; the PID, so shininess, sex and ability,
  stays.
- **The data:** `services.json`'s `training`, now read: the prices, the relearner's item and count, Hyper Training's
  BP, level and `requires_champion`, the three grooming courses (friendship and price; the schema keeps exactly three,
  named in the text), and the new `nature_change` (₽30,000). `pokemon_center.py` writes them as fees
  (`POKEMON_CENTER_FEE_*`) and defines.
- **The command:** `PokemonCenter`'s new actions (`include/paperwhite2/pokemon_center.h`): a fee in full in a word
  (32-bit, for ₽150,000), checking money, paying BP, the relearner's fee, and the party Pokémon's IVs, EVs, ability,
  friendship, ball and nature. Word 2 is the money window's (`MoneyWinDisp` and `MoneyWinUpdate` write it), so the
  script never keeps anything there across them.
- **Tested** in DeSmuME on a copy of the user's save (Castelia's Center), each service with the data read from the
  party's decrypted memory: a rename (₽1,000) and a kept name (no charge), a foreign OT refused, too little money;
  Tackle relearned (Heart Scale 2 → 1, ₽3,000), a cancelled relearn (nothing taken), no Heart Scale; Arm Thrust
  deleted (₽2,000, the moves moved up), one move refused; Hyper Training before the Hall of Fame, below level 100,
  a stat at 31, no BP, then HP 0 → 31 (50 → 26 BP, HP recalculated), all at 31; one stat's EVs and all (₽5,000,
  ₽20,000, stats recalculated), no EVs, a stat at 0; Swinub's swap Oblivious → Snow Cloak (PID 0x8cb0c90d →
  0x8cb1c90d, the data intact and checksummed), too little money, Pignite's and Swinub's hidden Thick Fat (₽150,000,
  the flag set), one ability, already hidden, hidden then swap, Keldeo without one; brush 100 → 110, royal 230 → 255,
  at 255, too little money; Luxury Ball (17 → 11, the ball taken, ₽3,000), the same ball, no balls; Naive → Adamant
  (₽30,000, PID kept, Attack up and Sp. Atk down), the same nature; an Egg refused; Cancel and B. The service, stat,
  ball and nature lists scroll.
- **Open:** the evolution after a swap is reasoned from the code, not played; the Move Relearner's "nothing to
  remember" refusal wasn't reached (every Pokémon tried had moves to relearn).

### Wonder Trade

- **Fee:** ₽1,000 a trade (proposed), so sending worthless Pokémon for a chance at good ones still costs something.
- **What can be sent:** from the party or a box (the PC Box returns a chosen Pokémon's tray and position, as for the
  Dream World's `BOX2_MODE_DREAM_WORLD`), and the new one takes its slot. No Eggs, legendaries, mythicals, or Pokémon
  holding an item.
- **The Pokémon received:**
  - A National Dex species, any but legendaries and mythicals (starters allowed).
  - Its level is the sent one's ±1-10, clamped to 1-100. A species too evolved for that level falls back to its
    pre-evolution (no level 8 Garchomp), and it knows its level-up moves for that level.
  - Trade evolutions happen as in a real trade.
  - **Its trainer:** a random OT name from a list per language, OT gender, trainer ID and secret ID, and language
    (proposed: English 35%, Japanese 20%, French, German, Spanish, Italian and Korean 9% each). A foreign Pokémon is
    named in its language (`res/text/system/species_names_*.txt`) and counts for the Pokédex's languages. To check:
    that the font draws Japanese and Korean. The user may add silly names later.
  - **Surprises (proposed):** shiny 1/256; hidden ability 10%; three perfect IVs 10%; Pokérus 1%; a nickname 25%; a
    ball other than a Poké Ball, as its trainer might have used.
  - **Held item:** 40% of Pokémon hold one. The user's split is 50% common, 30% uncommon, 19.5% rare, 0.5% ultra-rare;
    Claude suggests 50/30/18/2 (see the odds below).
- **The Spiky-eared Pichu (later; the foundation now):** a one-time reward, 2% a trade until received and guaranteed
  on the 30th trade. It comes with the attendant's special dialogue ("something went wrong"). Fixed moves, stats and
  so on, never shiny, the player's own OT and ID, and it can't evolve. The save keeps the trade count and a
  received flag; the reward is an entry in a data table of special rewards, disabled until the form and the user's
  sprite exist.

#### Built (2026-11-12)

- **The counter:** the middle of the three upstairs, the Wi-Fi Club's (script 10100, `global_10100.s`'s `Script_1`
  under `#ifdef PAPERWHITE2`, the Wi-Fi Club's code in `#else`; the attendant keeps `OBJ_CODE_82`'s sprite). Its text
  is appended to `res/text/script/global_10100.txt` (`Global10100_Text_WonderTrade*`).
- **The flow:** the first visit explains the trade and its fee once (`EVENT_FLAG_WONDER_TRADE_EXPLAINED`, 0x937),
  later ones greet; the money window stays up. A menu: **From your party** (the Name Rater's party screen,
  `CallPokeSelect`), **From a Box** (the PC Box in a mode that only picks: the Dream World's, with `Box2Param`'s new
  `wonderTrade` giving it the title "SELECT A POKÉMON TO TRADE", a Trade button, "Trade X?", and "This Pokémon can't
  go in the Wonder Trade." for the species it greys out, the excluded ones; Eggs are refused there as for the Dream
  World), Cancel. The Pokémon picked is refused when it is an Egg, an excluded species ("far too special to trade"),
  holds an item, or is the party's last Pokémon that can battle. Else the fee from the data (₽1,000), Yes/No, paid
  (too little money says so and takes nothing), "I'll send X through the tube", the attendant's walk to the tube
  (`SCRID_POKEMON_CENTER_ATTENDANT_TUBE`), and the in-game trade's scene (overlay 194's demo procs, as `fld_trade.c`
  runs them) with both Pokémon and the trainer's name. The new Pokémon takes the old one's party slot or Box
  position; a trade evolution follows as a trade does (`CheckEvolveSpecies` with `EVO_CHECK_TRADE` and the sent
  Pokémon as the partner, so Karrablast and Shelmet evolve with each other too; the evolution demo takes a
  trade-evolution item, as it does for any); a Box Pokémon evolves in a party of its own before it goes back. The
  Pokédex registers it as seen and caught, with its language (`addPkmToDex`, up to Arceus, as the Pokédex keeps).
  "X came from Y! Please take good care of it!", then "Would you like to trade another Pokémon?" and the menu again.
- **The generator** (`src/paperwhite2/ov012/paperwhite2_wonder_trade.c`, `WonderTrade_Plan` for the picks, which use
  only the random numbers and the data, then the Pokémon made with the game's own functions):
  - A species from 1 to Genesect, any but `excluded_species` (the 48 legendaries and mythicals, Phione included;
    starters and babies are allowed), evenly.
  - The level: the sent one's plus or minus 1 to `level_spread` (10), clamped to 1-100. Then, while the level is below
    the species' least level, its pre-evolution instead. The least levels are worked out at build time from
    `res/pokemon/*/data.json`'s evolutions: an evolution at a level needs that level (Gabite 24, Garchomp 48); any
    other (friendship, a stone, a trade, a move, a place) needs `other_evolution_levels`' level for its stage (20 for
    the second, 30 for the third: Pikachu 20, Raichu 30, Alakazam 30, Crobat 30), never less than its pre-evolution's
    (Mamoswine 33). It knows its level-up moves for its level (`PokeParty_CreatePkm`).
  - Its trainer: a language by `languages`' weights (English 35, Japanese 20, French, German, Spanish, Italian and
    Korean 9); a female trainer at `female_trainer_percent` (50); a name from that language's 20 male or 20 female
    names; a random trainer ID and secret ID. The names and nicknames are in the data (`male_names`, `female_names`,
    `nicknames`, 20 each a language; at most 7 characters, 10 for a nickname, 5 in Japanese and Korean), packed into
    the system text bank `wonder_trade_names`.
  - A foreign Pokémon is named in its language from the game's own banks (`species_names_ja.txt` and the others,
    which the US ROM has for the Pokédex's foreign entries), and keeps it after a trade evolution (renamed from the
    evolution's English); a nickname from its language's list at `nickname_percent` (25).
  - The PID from `PML_GenPID` for the trainer's ID: shiny at 1 in `shiny_one_in` (256), never shiny by accident
    otherwise; the ability bit random and the sex by the species' ratio, which `PokeParty_CreatePkm` reads. The
    nature random (its own field). The hidden ability at `hidden_ability_percent` (10); `perfect_iv_count` (3)
    different IVs at 31 at `perfect_ivs_percent` (10); Pokérus at `pokerus_percent` (1), a random strain and its days.
  - A ball by `balls`' weights (Poké Ball 400 of 1000, Great 180, Ultra 120, Premier 40, Heal and Quick 30, Net,
    Nest, Luxury and Dusk 25, Dive, Repeat and Timer 20, the Apricorn balls and the Dream Ball 5).
  - A held item at `held_item_percent` (40): a tier by `item_tiers`' weights (the user's 500/300/195/5), then an item
    of it, evenly or by its own weight (the Master Ball 14 of the ultra-rare tier's 56, a quarter).
  - Met in an in-game trade (`LOCATION_IN_GAME_TRADE`) at its level, today, in this game; its friendship the
    species' base. Obedience follows the game's rules for a Pokémon with another trainer's ID.
- **The special reward** (the Spiky-eared Pichu's foundation): `special_reward` has the rate (2%), the trade that
  guarantees it (30th), the species, form, level, four moves, nature, IVs, ability slot, ball and held item (form 1,
  the Spiky-eared Pichu, whose art is a copy of Pichu's until the user draws its own), and `enabled` (false). When enabled and not yet received
  (`EVENT_FLAG_WONDER_TRADE_SPECIAL_RECEIVED`, 0x938), each trade rolls it before the walk (`WONDER_TRADE_ROLL_SPECIAL`,
  guaranteed once the trade count reaches `guaranteed_at`); then the attendant says "Huh? That's odd... Something
  strange just came through the tube!" after the walk, the trade's scene shows the player as the other side, and "X...
  No Trainer sent it. It seems to want to stay with you!". It is never shiny, with the player's name, ID and
  language, met here. Every trade counts in `EVENT_WORK_WONDER_TRADE_COUNT` (0x405a, at most 65535).
- **The command:** `PokemonCenter`'s new actions `WONDER_TRADE_CHECK`, `_PICK_BOX`, `_ROLL_SPECIAL`, `_START`
  (`include/paperwhite2/pokemon_center.h`), and the fee `POKEMON_CENTER_FEE_WONDER_TRADE`. `PICK_BOX` and `START` are
  events the script waits for, as `CallPC` is.
- **Tested** in DeSmuME on a copy of the user's save (Castelia's Center), reading the party's and the Box's decrypted
  data: the first visit and later greetings; a party trade (Swinub Lv. 15 for Sarah's Ekans Lv. 25 in a Heal Ball,
  Shed Skin from the PID's bit, its level-25 moves, ₽20,712 → ₽19,712) and Box trades (Trubbish Lv. 4 for a Klink
  Lv. 1, Shinx for a German Eevee "Evoli", written back to its Box position, checksums valid); each refusal (Keldeo,
  a held item, an Egg, the last Pokémon that can battle) and too little money, nothing taken; the walk to the tube and
  the trade's scene; a forced shiny (PID shiny for its trainer's IDs); a forced item of each tier (Oran Berry, Dragon
  Scale, Leftovers, Master Ball); trade evolutions, forced by species: Kadabra to Alakazam (Korean, renamed 후딘 after
  the English evolution's name), from a Box too (Japanese フーディン, written back), and Onix holding a Metal Coat to
  Steelix with the coat used up; the Pokédex's caught bit and language bit for the received and evolved species;
  Japanese and Korean names in the trade's scene, the evolution, the messages, the party screen and the summary (the
  font has kana and hangul); and, with a test build (Japanese and Korean only, the special reward on at 0% until the
  3rd trade), the trade count 1 to 4, the special reward on the 3rd (its words, a Pichu Lv. 30 with the data's moves,
  IVs and nature, the player's name and IDs, met in Castelia, not shiny) and none on the 4th. 100,000 plans of the
  real planner code built on the PC (`WonderTrade_Plan` with the same random generator) gave no excluded species and
  no species below its least level, levels within ±10, and the data's rates: shiny 0.38%, hidden ability 10.2%,
  perfect IVs 10.0%, Pokérus 1.0%, nickname 25.0%, a held item 40.0% (tiers 49.5/30.1/19.9/0.5%, the Master Ball 24%
  of the ultra-rare), the languages and balls to their weights.
- **Open:** the special reward's trade scene shows the player as the other trainer, so it says "Pichu came back from
  (the player)! Welcome back, Pichu!" (the scene's words for one's own Pokémon); its own dialogue and the form wait for
  the user. Trading away the Pokémon that follows the player leaves no follower until the Following Pokémon picks one
  again (its own rule when the followed Pokémon leaves the party). Received Pokémon come in random forms now (the
  follow-ups below). The Pokédex keeps languages only up to Arceus, as the game does.

#### Item odds in practice

| Split of held items | Ultra-rare, per trade | Master Ball (a quarter of ultra-rare draws) | Seen in 100 trades |
| --- | --- | --- | --- |
| 50/30/19.5/0.5 (user's) | 1 in 500 | 1 in 2,000 | 5% |
| 50/30/18/2 (suggested) | 1 in 125 | 1 in 500 | 18% |

#### Item lists (draft)

- **Common (50%):** Oran, Cheri, Chesto, Pecha, Rawst, Aspear, Persim and Leppa Berries; Potion, Super Potion,
  Antidote, Paralyze Heal, Awakening; Poké Ball, Great Ball; Repel, Escape Rope; Honey, Tiny Mushroom, Pearl.
- **Uncommon (30%):** Fire, Water, Thunder, Leaf, Moon, Sun, Shiny, Dusk and Dawn Stones, Oval Stone; the
  trade-evolution items (Metal Coat, King's Rock, Dragon Scale, Up-Grade, Dubious Disc, Protector, Electirizer,
  Magmarizer, Reaper Cloth, Prism Scale, Deep Sea Tooth, Deep Sea Scale, Razor Claw, Razor Fang); HP Up, Protein,
  Iron, Calcium, Zinc, Carbos; Ultra Ball, Heart Scale, Big Pearl, Stardust, Sitrus Berry, Everstone.
- **Rare (18%):** Leftovers, Choice Band, Choice Specs, Choice Scarf, Life Orb, Focus Sash, Expert Belt, Rocky
  Helmet, Eviolite, Black Sludge, Light Clay, Destiny Knot, Lucky Egg, Soothe Bell, Quick Claw, Shell Bell, Lum
  Berry, Rare Candy, PP Up, Nugget, Star Piece.
- **Ultra-rare (2%):** Master Ball (a quarter of the draws); PP Max, Big Nugget, Comet Shard; the berries Gen 5 gives
  only through the Dream World (Liechi, Ganlon, Salac, Petaya, Apicot, Lansat, Starf, Micle, Custap, Jaboca, Rowap).

### Day Care attendant

- The tube behind her carries Poké Balls and Eggs to and from the Route 3 Day Care: she deposits, withdraws and hands
  over Eggs, and reports how the pair get along (she's in touch with the Day Care couple).
- She turns, walks to the tube and back, as the Wonder Trade attendant does for each trade.
- **Fees:** the Day Care's own fee on withdrawal, plus a Pokémon Center fee (proposed ₽500 for each transfer).

#### Built (2026-11-12)

- **The counter:** the left of the three upstairs counters, the Union Room's (script 2101, `global_2100.s`'s
  `Script_2`, the woman `OBJ_CODE_79` at 4,4 in every town's Center; the Pokémon League's and Victory Road's Centers
  have no upstairs counters). The Union Room was where Eggs were traded, and the left counter leaves the other two
  together: the middle (Wi-Fi Club, script 10100, `global_10100.s`, `OBJ_CODE_82`) and the right (Global Terminal,
  script 10105, `global_10105.s`, `OBJ_CODE_81`) stay for Training Services and the Wonder Trade (the GTS's counter
  suits the trades). Each counter has the same glass tube with a red top right behind the attendant, so all three
  can use the walk.
- **The script:** `Script_2` under `#ifdef PAPERWHITE2` (the Union Room's code in `#else`), its text appended to
  `res/text/script/global_2100.txt` (`Global2100_Text_DayCare*`). Until the player has the first Gym Badge
  (`daycare.required_badges`; it was meeting the Day-Care Lady until the follow-ups below) she only explains where the
  tube goes. The first visit after that explains the counter and the fee once (`EVENT_FLAG_DAYCARE_COUNTER_EXPLAINED`, 0x936). Then a menu, built from
  the Day Care's state, loops until Cancel: **Send a Pokémon** (while it has fewer than two; the Day Care's checks:
  not the only Pokémon that can battle, not the last two with empty boxes, not an Egg), **Bring one home** (the
  Day Care's list with levels; its level gain, then the Day Care's fee and the tube's and their total; party room),
  **Collect the Egg** (when there is one; also offered at the greeting; declining leaves it with the couple, unlike the
  Day-Care Man, who discards it) and **How are they doing?** (one Pokémon, or the pair's compatibility as the
  Day-Care Man says it, 70/88 very well, 50/80 get along, 20/40 not much, 0 others). Every transfer is paid before
  it happens, with `PokemonCenter POKEMON_CENTER_ACTION_PAY_FEE`, which takes nothing and says so when the money is
  short. The money window stays up while she is talked to.
- **The walk:** global script 2111 (`SCRID_POKEMON_CENTER_ATTENDANT_TUBE`, `global_2100.s`'s `Script_12`): the
  attendant talked to (0x8011) faces up, steps up to the tube, waits while it runs (`SEQ_SE_PC_LOGIN`), and steps back
  facing the player. Any attendant's script calls it with `RTCallGlobal SCRID_POKEMON_CENTER_ATTENDANT_TUBE` with its
  message window closed; it changes no variable.
- **The data:** `res/paperwhite2/pokemon_center/services.json` (schema beside it) holds all three attendants':
  `daycare.transfer_fee` (500), and the proposed values above for `training` and `wonder_trade` (prices, BP, item
  tiers with weights, languages, rates, the special reward, off), all read now (Training Services' and the Wonder
  Trade's Built sections).
  `tools/paperwhite2/pokemon_center.py` writes `paperwhite2/pokemon_center_config.h` at build time with the fees the
  game reads, in the order of `include/paperwhite2/pokemon_center.h`'s `POKEMON_CENTER_FEE_*` IDs (it checks them); a
  new fee is a new ID there and a row of the tool's `FEES`. The item tiers use the user's split (50/30/19.5/0.5, as
  weights out of 1000); the Master Ball is a quarter of the ultra-rare draws by its item weight.
- **The command:** `PokemonCenter action, arg1, arg2, result` (0x2f7; Debug moved to 0x2f8),
  `src/paperwhite2/ov012/paperwhite2_pokemon_center_commands.c`: `GET_FEE` puts a fee plus arg2 in a variable (at most
  65535, for messages), `PAY_FEE` pays it in 32 bits. Later services add actions, not commands.
- **Tested** in DeSmuME with a copy of the user's save (Castelia's Center): the not-yet message, the first visit,
  sending Swinub and Pignite (₽500 each), the pair's compatibility, bringing Swinub home (₽100 + ₽500), an Egg
  forced ready (declined and kept, then collected for ₽500, in the party), and too little money (nothing taken).
- **Open:** the sound is a guess (the PC's login); the attendant's stand-in OBJ is the Union Room's woman.

### Follow-ups (2026-11-12)

The user's requests after trying the three attendants.

- **The trade scene's sent Pokémon from behind:** vanilla, left as it is. The Wonder Trade runs the in-game trade's
  own demo (overlay 194's `data_ov194_021c63ac`, `PokemonTrade_StartRequest4`) with the same parameter as
  `fld_trade.c` (`FieldTradeStart`): the player's Pokémon first, the other second. The demo adds both with their front
  sprites (`PokemonTrade_SetupMcssPokemon`), then for a Pokémon that isn't its partner's own (`IsTrainerOT`, the
  "returning" case) makes a back sprite (`PokemonTradeIrcDemo_StateMoves`, `Poketrade3D_AddPokemonMcssPlain(wk, 2,
  FALSE, ...)`) and swaps it in six frames into the farewell (`PokemonTradeIrcDemo_StateMessage`): the Pokémon shows
  its front only while the scene fades in, then turns its back and hops into its ball. A test build whose Wonder
  Trade script ran the game's own `FieldTradeStart 29` (the Ambipom trade's data) gave the same frames as the Wonder
  Trade, front then back (`scratchpad/pcfollow/shots/van2_sheet.png` and `wt2_sheet.png`, `scene_compare.png`).
  Earlier generations' trade animations showed the front; Black and White's turn it around.
- **Hyper Training shows Battle Points:** the money window shows the player's BP from choosing Hyper Training until
  it is done (`PokemonCenter POKEMON_CENTER_ACTION_BP_WIN_DISP, 31, 1`, the BP shop's own `ScrcmdShop_Text_Bp_2` in
  the money window's place, with its own word set), refreshed after the party screen and after paying, and the money
  comes back after (`MoneyWinDisp`). No script command shows BP; the BP shop draws its own window.
- **The Day Care counter opens after the first Gym Badge** (`daycare.required_badges`, 1; the Route 3 Day Care opens
  only after the Hall of Fame in White 2). Before that, she explains the tube and says to come back once the player
  has earned their first Badge (with another number, "N Gym Badges"). The couple don't have to be met: the Day Care's
  save, steps, Egg and compatibility don't read the Day-Care Lady's flag (`EVENT_FLAG_0x0069`), which only picks her
  first greeting; the counter's first visit sets it, so the Lady on Route 3 greets the player as a customer.
- **Forms in the Wonder Trade:** `wonder_trade.forms`, a weight for each form of a species, or `season` for the ones
  that follow it: Unown's 28 letters (A-Z, ! and ?), Burmy's and Wormadam's three cloaks, Shellos' and Gastrodon's two
  seas and Basculin's two stripes, evenly; Deerling and Sawsbuck in the season's form, as the game turns those in the
  party (`TransformVsPokePartyBySeason`). Not listed, so always the first form: Castform, Cherrim, Darmanitan (their
  forms are battle-only), Rotom (its appliance forms come from an event with their own move,
  `PML_ChangeRotomForme`, and a received one couldn't change back without it), the Pichu's special form, Arceus and
  Genesect (by item) and the excluded legendaries and mythicals (Giratina, Shaymin, Deoxys, Meloetta, Keldeo, Kyurem,
  the Forces of Nature). **The forms the hack adds** (past the original game's `forms.count`, such as the editor's Add
  form makes) are received without being listed: a species with such forms and no `wonder_trade.forms` entry gets a
  generated one, weight 1 for its first form and each added form, 0 for its other original ones (2026-11-12,
  `pokemon_center.py`'s `form_entries`). `wonder_trade.excluded_forms` (`{ species, form }`, the editor's "In the
  random pool" switch on a form's page) leaves one out, in a listed species too; it holds the Spiky-eared Pichu, the
  special reward. A form that changes only by an event or item (a new Rotom appliance) should be left out, as Rotom's
  are. A new species is received unless `excluded_species` lists it (the species page's switch). The species falls
  back to its pre-evolution first, then the form is picked for it. The
  Pokémon is made as the game makes a wild one of a form (`enc_pokeset.c`): `PokeParty_ChangeForme` (the form's
  ability from the PID's slot, its sex and stats), then the form's level-up moves (`PokeParty_SetDefaultMoves`,
  Wormadam's differ), a hidden ability for the form, and the PID for the form (`PML_GenPID`). Evolution keeps the
  form, as the game does (`setNameChangedPkm` changes only the species); none of these species evolves by trade. The
  Pokédex registers the form seen (`PokeDex_RegistPkm`'s `getForm`).
- **The Champion's discount:** after the Hall of Fame (`EVENT_FLAG_0x0960`), `champion_discount_percent` (50) off every
  attendant's fee in money, rounded in the player's favour: the tube's fee (not the Day Care's own fee for a
  withdrawal, which is the couple's), the Wonder Trade's fee, and every Training Services price, the relearner's
  money included. `champion_discount_battle_points` and `champion_discount_items` (both false) would take it off
  Hyper Training's BP and the relearner's Heart Scales too (at least one); BP is left out because Hyper Training needs
  the Hall of Fame anyway, so the discount would always apply and the price would just be half. The discount is in
  `PokemonCenter`'s fee itself, so every amount shown (`GET_FEE`, `WORD_SET_FEE`, the relearner's words) is the one
  charged (`PAY_FEE`, `HAS_FEE`, the relearner's). Each attendant says so once a visit, before the greeting ("Oh, if
  it isn't our Champion! The tube's fee is 50% off for you!", "Trades are...", "Our fees are...";
  `GET_CHAMPION_DISCOUNT`).
- **Fixed on the way:** a received species after Arceus (Basculin, Deerling, any of Black and White's) in a foreign
  language without a nickname stopped the game: the US ROM's foreign species-name banks (`species_names_ja.txt` and
  the others, `\from{species.pokedex.ja.name}`) end at Arceus, and the name was read past the bank's end. Such a
  Pokémon keeps the game's (English) name now; earlier tests had only met earlier species in foreign languages.
- **Japanese names of Black and White's species (2026-11-12):** the user asked for Japanese Gen 5 Pokémon. The 156
  Japanese names, Victini to Genesect, are `pokedex.languages.ja.name` in their `res/pokemon/*/data.json`, which
  extends the Japanese names bank to 650 lines (`\from` stops at the first species without the field), so a Japanese
  Gen 5 Pokémon is named in Japanese (tested: a forced Japanese Minccino arrived as チラーミィ, shown in the trade scene,
  the messages and the party). The other languages still stop at Arceus. The Pokédex's language marks stop at Arceus.
- **Tested** in DeSmuME on a copy of the user's save (Castelia's Center): the vanilla and Wonder Trade scenes frame by
  frame; Hyper Training as Champion (50 BP shown at the party screen and stat list, 24 BP paid, 26 BP shown, the money
  back at the menu); the Day Care counter with no badges (the "first Gym Badge" line), and with the couple never met
  (flag 0x0069 cleared): the first visit (the flag set after), Swinub and Pignite sent (₽500 each), their
  compatibility ("don't really seem to like each other much", the 20 of two species of one trainer), a forced Egg
  collected (₽500, a Swinub Egg from the Day Care's place); as Champion, the discount's line and bringing Swinub home
  for ₽100 + ₽250 = ₽350, charged 350; Training's line, Nature Services for ₽15,000 (charged), the relearner's "1 Heart
  Scale and ₽1500"; the Wonder Trade's line and ₽500 fee (charged); forced trades of each species with forms, their
  forms, abilities, moves and stats, and the Pokédex's form bits (Unown M, K, C and !, Trash Wormadam with its own
  stats and moves, the blue-striped Basculin's Rock Head, East Shellos, summer Deerling and autumn Sawsbuck when the
  season was forced, the Korean Basculin that used to stop the game); and through the trade's own evolution path (its
  check made a level-up one by a test hook, since none of these evolves by trade) Trash Burmy to Trash Wormadam, Plant
  Burmy to Plant Wormadam and West Shellos to West Gastrodon, both forms in the Pokédex. 200,000 plans a
  season of the real planner on the PC: every Unown letter, the cloaks, seas and stripes evenly, Deerling and Sawsbuck
  always the season's, no other species with a form.

### Order

1. The Day Care attendant (smallest; builds the attendant setup and the walk to the tube).
2. Training Services, service by service.
3. The Wonder Trade, once the item lists are approved; the Pichu's form and sprite after.
