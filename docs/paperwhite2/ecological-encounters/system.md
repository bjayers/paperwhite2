# What the encounter system can and can't do

A summary for the redesign, from `docs/paperwhite2/encounters.md`, `docs/paperwhite2/plugins.md` (Conditions,
Wanderers, Seasons), the schemas in `res/paperwhite2/` and `tools/paperwhite2/encounters.py`, as of 2026-11-10. Those
are the authority; this is what the generator and the dictionaries need from them.

## Places

- **135 areas**, one per original table (`ENCOUNTERS_<AREA>`); every zone whose header names a table shares its
  Pokémon. Caves and towers have several (Victory Road 11, Reversal Mountain 13, Strange House 10, Relic Castle 8).
- **Groups** (`groups.json`, 21 now) name several areas at once (`group:<id>`); a habitat can name areas and groups.
- An area's **rates** per method (per season or all year) decide how often a step, a surf or a rod finds anything.
  A method with no rate there has no encounters, whatever lists it.
- Its **rustling spots** are one kind: shaking grass, dust clouds or bridge shadows.

## When a Pokémon can appear (a habitat's slot)

- **Methods:** grass, dark grass, rustling, surf, rippling surf, fishing, rippling fishing.
- **Seasons:** any of the four, with one slot for all, or each season its own methods, rarity, times and weather.
- **Times:** any of morning, day, evening, night, late night.
- **Weather:** any of the zone's weathers, or any when none is listed.
- **Form:** 0–31.
- **Extra conditions** (`when`, the conditions engine): flags and variables, zone or zone group, indoors or outdoors,
  the terrain under the player (grass, dark grass, tall grass, surf water, shore, shallow water, puddle, swamp, sand,
  snow, ice, cave, leaves, bridge, ground...), the party's level, a chance. None is used yet.
- **Levels:** a species' `min` gates it (it appears once the party's adjusted level reaches it) and `max` caps it.
  Where the party is below every minimum of a method in an area, the lowest minimum is the gate instead, so an area
  never goes empty. Wild levels are the adjusted party level ± a spread (15% of the party's level, 1 to 5), within
  the species' min and max. The adjusted level is 60% of the party's level, at most 10 below it (still being tuned).

## How often

- **Tiers:** common 55, uncommon 25, rare 12, very rare 7, exotic 1 (percent). At one moment, in one area, for one
  method, each tier present takes its share, split evenly among its Pokémon there, and the tiers present are
  rescaled to 100%. So rarity is relative: two commons and one rare give 41.0% each and 18.0%; adding a third common
  lowers each common, not the rare.
- **Rustling spots** draw on their own habitats first, then automatically on the area's Rare, Very rare and Exotic
  Pokémon of grass and dark grass. Shaking grass gives Audino 30% of the time; dust clouds and shadows give items
  30%. So a trophy (exotic) in grass is automatically more common in the area's shaking grass.
- **Rippling water** isn't filled automatically: a Pokémon there needs a habitat with that method.
- **Outbreaks:** after `FLAG_SWARMS`, one each day; its species takes 40% of its places' encounters by its methods.
  An outbreak has places, form, methods, seasons and times.

## Battles

- Each species has single, double and triple chances (percent), and its partners are its family or any Pokémon of the
  area by the same weights. The default is always single, family partners.
- Never while fishing. A triple needs three Pokémon that can fight (with two, it's a double).

## Wanderers (overworld encounters)

- Up to 3 wild Pokémon seen in tall and dark grass, picked as a step there would pick, drawn with their follower
  sprites. Per species (`overworld`): met as a wanderer and by steps (default), by steps only, or as a wanderer only;
  wanders at random (default), aggressively (toward the player) or passively (away); stands in the grass or floats
  over it (flyers, hoverers).
- So a family's dictionary entry can say how it behaves in the field: a predator that approaches, a shy one that
  flees, a flyer that floats.

## Weather

- Only the **24 zones of the weather calendar** have changing weather: Chargestone Cave, Dragonspiral Tower (2),
  Driftveil City, Floccesy Ranch (2), Floccesy Town, Icirrus City, Lentimas Town, Mistralton City, Pledge Grove,
  Reversal Mountain, Routes 6, 7, 8, 12, 14, 15 and 20, Twist Mountain (2), Virbank City and Virbank Complex (2).
  Every other zone has its zone header's fixed weather. A weather-limited Pokémon only makes sense in those zones.
- Each day of a season picks one date of the original calendar's months for that season, so a weather on N of a
  season's ~92 dates comes on about N/92 of its days. Now: snow in winter in the north and in Floccesy, Pledge Grove,
  Route 20 and Virbank; blizzards in Icirrus, Dragonspiral Tower and Route 8; rain in the other seasons in most of
  them; sandstorms in Lentimas and Reversal Mountain except in autumn.
- More weather (thunderstorms, sandstorms) is the calendar's files (the ROM session's); a 25th zone needs the
  calendar's limit raised in code.

## What the player sees

- The **Habitat Dex** lists an area's Pokémon by walking, dark grass, surfing and fishing, filtered by season, time
  and weather. It doesn't list rustling spots' own species or rippling water, and can't show `when` conditions, so a
  Pokémon found only there stays a discovery.
- The Pokédex's Area page shows walking, dark grass, surfing and fishing rows, with rustling and rippling as marks.

## Limits

- 64 candidates per method per area at one time: the runtime takes its slots from the candidates that fit the
  season, the time and the weather, so `check` counts the busiest season, time and weather group (most now: Route 5's
  grass, 35). A candidate is one habitat in one area, its seasons, methods and times bit masks.
- 4 KB per area's block (largest now: Route 12, 2956 bytes). About 20 bytes a candidate, so roughly 190 candidates an
  area.
- 128 outbreak entries (an entry is an outbreak's area); 8 tiers.
- `encounters.py check` reports all of these, and `odds` a place's odds.

## Not available (or not yet)

- Weather in zones outside the calendar; conditions on outbreaks beyond seasons and times.
- Habitats keyed to the player's progress are possible through `when` (flags), but the user decided on 2026-11-10
  not to use "moving in later".
- Deerling's and Sawsbuck's forms follow the season in the original; whether the hack keeps that or needs `form` per
  season is to be checked with the ROM session.
