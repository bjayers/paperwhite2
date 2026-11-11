# Ecological encounters

The redesign of Paper White 2's wild encounters from a clean slate: each family placed by its ecology, generated
into `res/paperwhite2/encounters/` (`docs/paperwhite2/encounters.md`) once the rules and the dictionaries are done.
Nothing is written to the encounter data until then.

## Steps

1. **Rules** (`rules-questionnaire.md`, then `rules.md`): the placement philosophy, answered by the user.
2. **Places**: a dictionary of every area (the 135 original tables): the facts from `res/` (methods, zones, rates,
   rustling spots, story order) and the description (biome tags, climate, people, seasons, lore). It defines the
   habitat vocabulary.
3. **Families** (`families/`, drafted 2026-11-14): a dictionary of every family: habitats in that vocabulary,
   activity times, seasons and migration, weather, abundance, social behaviour, where its evolutions belong, how it
   came to Unova, lore, and its **homes**, the drafted placements with their reasons. `families/report.md` is the
   review summary.
4. **Exceptions**: forced placements, bans, events, static encounters, gifts and trades, applied last.
5. **The generator**: turns the homes into the species files, checking and balancing them within the game's limits
   (the story first: it doesn't invent placements). Repeatable, with review reports.
6. **Backup and test**: tag the current data, write the new files, check them with `encounters.py check` and `odds`
   and the Encounter Editor, then test in game.

Dictionaries are structured data (YAML) the generator reads, each with a readable summary for review.

## Decided

- 2026-10-31: areas and the 7 methods stay as they are. Every family is obtainable; legendaries and mythicals only
  by events; some special Pokémon by static encounters, gifts or trades; some species only by evolution or breeding.
  Season-, time- and weather-limited Pokémon are encouraged. A clean slate, the ported tables only as ideas.
- 2026-11-10: Pokécology notes are complete (in the questionnaire). Hidden Grottoes are set by hand; the generator
  only counts them as a source. Trade evolutions are mostly not wild (a Link Cable item will evolve them). Audino keeps
  its 30% of shaking grass; rustling spots make rare to exotic Pokémon more common, with their own species only where
  a story calls for it. No "moving in later". Placement reasons are for review only. The old tables are a loose
  source: deliberate-looking placements and bird migration, when nothing tells a better story. `system.md` sums up
  what the encounter system can and can't do.
- 2026-11-14: the family dictionary is story-first: each family's entry drafts its homes (place, methods, seasons,
  times, tier, reason), and the generator only checks and balances them (the user, 2026-11-13). Not wild: legendaries
  and mythicals, Zorua, Rotom, Larvesta, the starters but Charmander and Piplup (and Totodile's sewer trophy), the
  fossils but Lileep, Unown on hold. Battle chances by default: solitary 100/0/0, most 95/5/0, social 85/12/3, highly
  social 70/20/10; partners the family, or the area where that makes sense.
