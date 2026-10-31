# Ecological encounters

The redesign of Paper White 2's wild encounters from a clean slate: each family placed by its ecology, generated
into `res/paperwhite2/encounters/` (`docs/paperwhite2/encounters.md`) once the rules and the dictionaries are done.
Nothing is written to the encounter data until then.

## Steps

1. **Rules** (`rules-questionnaire.md`, then `rules.md`): the placement philosophy, answered by the user.
2. **Places**: a dictionary of every area (the 135 original tables): the facts from `res/` (methods, zones, rates,
   rustling spots, story order) and the description (biome tags, climate, people, seasons, lore). It defines the
   habitat vocabulary.
3. **Families**: a dictionary of every family: habitats in that vocabulary, activity times, seasons and migration,
   weather, abundance, social behaviour, where its evolutions belong, how it came to Unova, and lore.
4. **Exceptions**: forced placements, bans, events, static encounters, gifts and trades, applied last.
5. **The generator**: scores each family against each area, season, period, weather and method, then picks and
   ranks within the game's limits. Repeatable, with review reports.
6. **Backup and test**: tag the current data, write the new files, check them with `encounters.py check` and `odds`
   and the Encounter Editor, then test in game.

Dictionaries are structured data (YAML) the generator reads, each with a readable summary for review.

## Decided

- 2026-10-31: areas and the 7 methods stay as they are. Every family is obtainable; legendaries and mythicals only
  by events; some special Pokémon by static encounters, gifts or trades; some species only by evolution or breeding.
  Season-, time- and weather-limited Pokémon are encouraged. A clean slate, the ported tables only as ideas.
