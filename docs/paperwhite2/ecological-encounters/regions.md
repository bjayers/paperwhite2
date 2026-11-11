# The regions of Unova

The user's picture of the region (2026-11-11), the frame for the area dictionary: 8 regions, plus The Rest for the
special places that fit none of them. Each region lists its encounter maps (`res/paperwhite2/encounters/areas/`);
a place is made of one or more of them, set by the user's groups in the Encounter Editor
(`res/paperwhite2/encounters/groups.json`). Which maps are leftovers from Black and White is decided place by place.

An area (a map here) is an encounter table, `ENCOUNTERS_<AREA>`, named like the zone that uses it, but not always the
same: the area `castelia_city` is the zone `castelia_city_31`, `route_4_2` is `route_4_16`, and Relic Castle's areas 3
to 8 are its zones 16, 17, 19, 21, 22 and 23. The groups list areas.

## 1. Southwest Unova

Aspertia City, Route 19, Floccesy Town and Ranch, Route 20, Pledge Grove, Virbank City and Virbank Complex.

- **Feel:** the Hudson Valley: hilly countryside down to a harbour. Chilly in winter, with light snow falling often
  and skiffs of it on the ground, unusual in Unova. Route 20 has the region's best autumn leaves (the user's favourite
  route). Virbank and its complex are industrial.
- **Maps:** `aspertia_city`, `route_19`, `floccesy_ranch`, `floccesy_ranch_2`, `route_20`, `virbank_city`,
  `virbank_complex`, `virbank_complex_2`.

## 2. Castelia and the desert

Castelia City and its sewers, Route 4 (White 2's Desert Route and Black 2's City Route), the Desert Resort, Relic
Castle and Relic Passage (the desert cave from the sewers to Driftveil, joining Relic Castle in part).

- **Feel:** a dense city (Manhattan) and its underbelly, then a sudden desert of ruins and sandstorms.
- **Maps:** `castelia_city` (the park, zone `castelia_city_31`), `castelia_sewers` to `_5`, `route_4` (Black 2's City
  Route), `route_4_2` (White 2's Desert Route, zone `route_4_16`; the zone `route_4_2` is a house), `desert_resort`,
  `desert_resort_2`, `relic_castle` to `_8` (all used: the zones relic_castle, 2, 16, 17, 19 and 21 to 23),
  `relic_passage` to `_3`.

## 3. Southeast Unova

Routes 1 to 3, Nuvema Town, Accumula Town, Striaton City, Nacrene City, Wellspring Cave, the Dreamyard and Pinwheel
Forest.

- **Feel:** suburbs with farmland, parks and nearby landmarks, with the original games' "start of an adventure"
  feel. Pinwheel Forest is the region's premier forest: dark, under a canopy with dappled light, with fallen logs.
- **Maps:** `route_1`, `route_2`, `route_3`, `striaton_city`, `wellspring_cave`, `wellspring_cave_2`, `dreamyard`,
  `dreamyard_2`, `pinwheel_forest` (the outskirts toward Nacrene, a route with cosmetic puddles),
  `pinwheel_forest_2` (the forest itself).

## 4. Central Unova

Nimbasa City, Route 5, Route 16, Lostlorn Forest, Route 15, Black City or White Forest, Route 14 and Abundant Shrine.

- **Feel:** the central plains round Nimbasa: civilization, but wild. Nimbasa is Coney Island (the amusement park,
  the sporty atmosphere); Route 5 the tailgate outside it (lots of people, the camper; Munchlax, Trubbish, Cinccino,
  Gulpin and the like). Route 15 and Lostlorn Forest are the wilderness just outside civilization. The eastern places
  belong here rather than with the beachy coast.
- **Maps:** `route_5`, `route_16`, `lostlorn_forest`, `route_15`, `marvelous_bridge` (bridge shadows only),
  `route_14`, `abundant_shrine`.
- Route 15 runs from Marvelous Bridge to Black City or White Forest. Route 14 and Abundant Shrine lie between that and
  Undella but don't feel coastal: Route 14 touches Undella's coast at its top (no encounters there) and is otherwise a
  mountainous riverland hike, with waterfalls, leading back inland.

## 5. Western Unova

Driftveil City, Routes 6 and 7, Chargestone Cave, Mistralton City and Cave, Celestial Tower, and the entrance of
Twist Mountain (not the mountain itself).

- **Feel:** the mid-game, rougher and wilder, and a little melancholy (Celestial Tower, Route 7). Often rainy and
  gloomy, in a good way; more weather likely here.
- **Maps:** `driftveil_drawbridge` (bridge shadows only; with Driftveil, the border with Central Unova), `route_6`,
  `route_7`, `chargestone_cave` to `_3`, `mistralton_cave`, `mistralton_cave_2`, `guidance_chamber` (part of
  Mistralton Cave), `celestial_tower` to `_4`. Twist Mountain's entrance is here physically but goes with the
  mountain in The Rest (it has no encounters of its own).

## 6. Icirrus

Icirrus City, Dragonspiral Tower, Route 8 and the Moor of Icirrus.

- **Feel:** a quaint town among windmills and marshes for most of the year; in winter, a winter wonderland: the
  wetlands freeze, heavy snow covers everything, and places out of reach the rest of the year can be reached over
  the snow piles.
- **Maps:** `icirrus_city`, `route_8`, `moor_of_icirrus`, `dragonspiral_tower` to `_4`.

## 7. Northern Central Unova

Route 9, Opelucid City, Route 11, Village Bridge, Route 12, Lacunosa Town, Giant Chasm, Route 23, Victory Road and
the Pokémon League.

- **Feel:** rugged endgame territory, wild and sometimes mysterious: from the city's outskirts to rustic Village
  Bridge, the mysterious Giant Chasm and the rugged cliffs of Route 23. Route 12 is flowers and hills, like spring in
  Sinnoh, full of Combee.
- **Maps:** `route_9`, `route_11`, `village_bridge`, `route_12`, `route_23`, `giant_chasm` to `_5`, `victory_road` to
  `_11`.
- **Giant Chasm:** three places: the outside (`giant_chasm`, zone 1, by Route 13 and Lacunosa), the caves
  (`giant_chasm_2`, the ring round the crater to Routes 22 and 23; `giant_chasm_5`, the cave with water) and the
  crater (`giant_chasm_3` and `_4`). Kyurem's inner cave (zone 6) has no encounter table.
- **Victory Road** (taken separately): its 11 tables are zones 16 to 26 in order; zones 1 to 15 and 27 have none
  (3 to 15 use a Black City matrix).

## 8. The east coast

Routes 13, 21 and 22, Undella Town and Bay, Humilau City and Seaside Cave.

- **Feel:** beachy, almost tropical, with a lot of water and a marine atmosphere. Little change in winter; the sea's
  life and the birds change with the seasons.
- **Maps:** `route_13`, `route_21`, `route_22`, `undella_town`, `undella_bay`, `humilau_city`, `seaside_cave`,
  `seaside_cave_2`.

## The Rest

Special places that don't fit their regions, taken one at a time: Reversal Mountain (Exterior, Black 2, White 2),
Lentimas Town, Twist Mountain, the Strange House, Clay Tunnel, the Underground Ruins, P2 Laboratory
with Routes 17 and 18, the Nature Preserve and the Regi chambers. Routes 17 and 18 feel marine, almost tropical, but
more distant and unknown than the east coast (Tropius, Exeggcute and the like).

- **Maps:** `reversal_mountain` to `_13` (1 the outside, 2–7 Black 2's Damp Caves, 8–13 White 2's Fiery Caves),
  `strange_house` to `_10`, `clay_tunnel` to `_3`, `underground_ruins` to `_3`,
  `twist_mountain` to `_4`, `p2_laboratory`, `route_17`, `route_18`, `nature_preserve`, `iron_chamber`,
  `iceberg_chamber`, `rock_peak_chamber`.

## Reachability

From Aspertia, by walking and warps (seamless routes, doors and stairs), 129 of the 135 maps can be reached. The 6
that can't are reached by scripts only: the Iron, Iceberg and Rock Peak Chambers, the Nature Preserve, and Underground
Ruins 2 and 3. This can't tell leftover maps that are still connected (Relic Castle's deep floors), so the user's
knowledge decides which maps are used.

## Tiles

`tiles.json` (made by `tools/tiles.py` in this folder) counts each encounter map's tiles where wild Pokémon appear,
from its terrain, in each season and version: the season's and the version's map replacements are applied
(`res/field/map_replacements/replacements.json`; a version's first value is Black 2's, and the base maps are Black
2's). An area with the same tiles all year has `tiles`; one that changes has `by_season` (or `by_version_season`).
Grass, dark grass (the step code's double-battle grass classes), surf water, and other ground by its class (cave
floor, deep sand, swamp puddles, indoor floors...), with water and bridges that have no encounters. It can't tell a
leftover map from a used one, and events' replacements are left as before the event.

What changes by season (2026-11-13): the Castelia Sewers are dry in autumn and winter (no water); the swamp puddles of
Icirrus City, the Moor of Icirrus and Route 8 freeze in winter (no walking encounters), their water staying;
Dragonspiral Tower's outside gains dark grass in winter.
