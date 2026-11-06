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
