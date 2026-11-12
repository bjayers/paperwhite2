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

### Order

1. The Day Care attendant (smallest; builds the attendant setup and the walk to the tube).
2. Training Services, service by service.
3. The Wonder Trade, once the item lists are approved; the Pichu's form and sprite after.
