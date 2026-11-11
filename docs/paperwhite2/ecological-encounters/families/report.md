# The family dictionary: report

The morning summary of the overnight draft (2026-11-14): what's in the dictionary, what the balance pass found and
changed, the calls that need the user's eye, and suggestions for special (non-wild) encounters. Re-run the checks
with `python3 tools/dictionary_check.py` and `python3 tools/balance.py` from this folder.

## What's there

- **329 families**: 257 wild (473 wild species), 72 not wild (`batches.yaml`'s `not_wild`: 12 starters left to the
  Hidden Grottoes, 8 fossils, 48 legendaries and mythicals, Zorua, Rotom, Larvesta, and Unown on hold).
- **1,050-odd homes**, each a place, methods, seasons, tier and a one-line reason, in nine batch files: `birds.yaml`
  (21 families), `water.yaml` (42), `bugs_forest.yaml` (40), `grassland.yaml` (46), `mountains_caves.yaml` (39),
  `desert_fire.yaml` (20), `strange.yaml` (32), `strong.yaml` (11), `rest.yaml` (6). Each file opens with a summary.
- `migration.md`: the seasonal map the birds follow (and some others: whales, Corsola, Swinub, Delibird, Riolu).
- `skeleton.yaml`: the facts from `res/` each entry builds on (members, evolutions, types, Pokédex text, the game's
  gifts, statics, trades and grottoes, and the hack's current tables).
- Every request in `requests.md` is placed, and the Pokécology notes are used where they fit (the one left aside is
  Tangrowth hunting Cubone: they share no habitat).

## The balance pass

`tools/balance.py` builds every place's tables by season and by day and night, from the homes, and checks them.

- **Empty tables: none.** The first run found 30 water and grass tables with nothing in some season (most of them
  rippling water, also Seaside and Victory Road's pools, P2 Laboratory's and Route 18's fishing, Dragonspiral's
  entrance outside winter, Route 13's island in autumn and winter). I filled the plain ones with homes, and for
  rippling water I've written down a **generator rule** to approve: *a rippling table with nothing of its own in a
  season and time takes the same water's plain table then, favouring the later stages* (the "bigger ones" of
  rules.md, 6). Rippling homes of their own (Gyarados, Wailord, Sharpedo, Jellicent, Seaking spawning, Relicanth,
  Dratini...) come first.
- **Crowding.** The loose target is 5 to 8 families in a grass table at a moment. I trimmed the worst (Castelia's
  small walled garden had 17, now 10; Floccesy Ranch 20, now 14; Route 5 18, now 13; Pinwheel's depths and Twist
  Mountain 17, now 12; Virbank Complex, Routes 2, 12, 16 and 19, the Desert Resort, Route 9 and Reversal Mountain's
  pass by 2 to 6 each). What's left over 8 at its busiest moment:
  - 14: Floccesy Ranch's grass (winter nights: the farm's own, its NPCs' families, Starly flocks, Swinub, the Shinx
    trophy, owls);
  - 13: Route 5 and Route 19's grass;
  - 12: Virbank Complex, Twist Mountain, Routes 2, 3, 7, 9 and 23, the Desert Resort and its path, Pinwheel's
    depths, Reversal Mountain's dark grass;
  - 9 to 11: about 25 more tables.

  These are counts of families (a family shows one or two stages at a time, by the level gate), and most of each
  table is rare to exotic: with the tiers, three or four commons make up most encounters. **Say if you'd like them
  cut to the target**: the easy lever is moving a place's rare extras to its rustling spots only, or dropping the
  second home of widespread Pokémon.
- **Sparse:** only Pinwheel's outskirts in winter (2 families: the insects' nursery sleeps). Left as it is.
- **One type over 60%** at some moments, all on purpose: Normal in the towns and farms (Castelia, Routes 3, 9, 16,
  19, Floccesy, Village Bridge, Abundant Shrine), Bug in Pinwheel Forest, Psychic in the Dreamyard's dark grass,
  Fighting on Route 14's cliffs and Route 11, Ice at Dragonspiral's entrance in winter and in Giant Chasm, Fire in
  the Fiery Caves, Ghost in the Strange House, Water in Icirrus's fens.
- No Unovan family lives only in the Nature Preserve; no strong line is common anywhere.

## New calls of mine to approve

- **Stone and special evolutions wild only where a place explains them** (rules.md, 5):
  - Leaf Stone: Pinwheel Forest's depths (Shiftry) and Route 18's jungle (Exeggutor, the user's request; Victreebel);
  - Sun Stone: Route 1's summer meadow (Sunflora, the places' plan; Whimsicott in autumn) and Route 12's flower hills
    (Sunflora in summer and autumn);
  - Moon Stone: Giant Chasm, a meteor crater (Clefable); the Dreamyard's basement for Musharna (its Dream Mist);
  - Chargestone's charged stones and magnetic field: Raichu (the places' plan), Eelektross (the user's list),
    Probopass and Magnezone;
  - Dusk Stone: Honchkrow only as Route 7's night trophy;
  - item, move and condition evolutions kept to one story each: Weavile and Mamoswine in Giant Chasm
    (Pokécology's hunt; an ice age's relic), Yanmega, Tangrowth, Ambipom, Ninjask, Vespiquen, Electabuzz, Magmar,
    Jynx, Hitmontop.
- **Friendship and move evolutions that are the natural adult are wild**: Pikachu, Jigglypuff, Marill, Roselia,
  Chimecho, Clefairy, Sudowoodo, Mr. Mime, Chansey. The rest (Crobat, Lucario, Togetic, Blissey, Lopunny...) aren't.
- **Met by a step only** (no wanderer), for Pokémon that hide: Stunfisk, Spinarak, Pineco, Shuckle, Foongus,
  Carnivine, Diglett, Geodude, Ferroseed, Trapinch, Ditto, Kecleon.
- **Partners from the area**: Volbeat with Illumise, Karrablast with Shelmet, Plusle with Minun, the two Nidoran,
  Corsola, Remoraid and Mantyke on the reef, Joltik on the cave's big Pokémon.
- **Sandstorm-only**: Flygon and Krookodile (Pokécology); **other weather-only**: Castform (rain, storms, snow), Absol
  (storms and blizzards), Cryogonal at Dragonspiral's entrance in diamond dust, Electrike more on Route 14 in storms.
  Most of these need the weather the user would add (weather.md).
- **Trophies (exotic)**, by place: Abundant Shrine (Farfetch'd, Feebas), Castelia's park (Eevee, Chatot), Castelia's
  sewers (Totodile), Chargestone Cave (Raichu, Probopass, Tynamo's line), Dragonspiral's lake (Dratini), the Dreamyard
  (Musharna), Floccesy Ranch (Riolu, Shinx), Giant Chasm (Beldum in the caves, Mamoswine in the crater), Humilau
  (Lileep), Mistralton Cave (Axew), the Moor of Icirrus (Carnivine), Pinwheel Forest (Pinsir, Leafeon), Relic Passage
  (Gible), Reversal Mountain (Charmander), Route 2 (Ralts: your Petalburg memory), Route 5 (Munchlax), Route 7
  (Honchkrow, Scyther), Route 12 (Heracross, Vespiquen), Route 17 (Dragonite), Route 23 (Feebas, Bagon), Striaton
  (Feebas), Twist Mountain (Glaceon), Undella (Relicanth), Victory Road (Larvitar, Deino in the caves; Altaria on the
  mountainside), Virbank Complex (Pichu, Riolu, Growlithe, by season).

## Special encounters to consider

Non-wild ideas, for the exceptions or later events:

- **Snorlax** asleep across a path (a static encounter), as its own legend; Munchlax stays Route 5's trophy.
- **Ninetales**, Abundant Shrine's thousand-year fox, met at night at the shrine (a static encounter); Vulpix is wild
  there.
- **Spiritomb** from an Odd Keystone (Sinnoh's Hallowed Tower), perhaps at the Strange House or Celestial Tower.
- **Togepi** as an egg from someone kind (a gift); Togetic could instead visit Village Bridge, wild.
- **Spiky-eared Pichu**, the Virbank NPC's form, as a one-off event (it can't evolve).
- **Porygon2** by a trade or a gift from P2 Laboratory's staff (its Up-Grade), with Porygon wild on the island.
- **Rotom** (your special place), **Zorua** (the Nimbasa child), **Larvesta** (a gift), as already decided.
- **Unown**, still on hold: the Underground Ruins (Clay Tunnel's), the Abyssal Ruins or Relic Castle would suit it.

## The review list

Every entry's `review` notes, by batch.

### Birds

- **Pidgey**: A migrant rather than native: Pidgey isn't Unovan; making it the region's classic migrant uses that. Its summer and winter ranges are mine.
- **Farfetch'd**: Very rare everywhere, as the Pokédex has it hunted; only two homes.
- **Natu**: Natu in the desert follows its Pokédex entry (cactus food); Relic Castle's floors are sand inside a ruin, so a stretch.
- **Murkrow**: Honchkrow wild by a Dusk Stone's evolution: only as Route 7's trophy at night. Say if it should stay evolve-only.
- **Chatot**: Its season (spring and summer) is my guess; Castelia's feral colony is an introduced population, as the rules allow.
- **Ducklett**: Swanna winter at Icirrus (the polders), not the south: the reverse of a simple 'south for winter'.
- **Hoppip**: Strict to the day, since it rides the sun's warmth; say if it should be found at night too.

### Water

- **Seel**: Unova has no icy sea; Seel take the coolest water (Routes 17 and 18) and spread in winter.
- **Staryu**: Starmie not wild (a Water Stone); it could be a rippling-surf rarity if you'd like one.
- **Corsola**: Partners 'area': the reef's small Pokémon hiding among Corsola join its battles (Pokécology).
- **Remoraid**: Partners 'area': Mantyke swim with its schools.
- **Lotad**: Lombre on fishing rods is the Pokédex's joke made real; say if it's too odd.
- **Wailmer**: The whales' seasonal route is real-world humpback behaviour; check it suits.
- **Corphish**: Introduced (escaped pets), so near people. On the sewers' dry floors in autumn and winter: say if that's a stretch.
- **Lileep**: One home only; Undella's walkable shallows could be a second.
- **Mantine**: Mantine evolves by a Remoraid in the party, so wild levels are a guess.
- **Basculin**: Route 3's lake and the Nature Preserve count as east (Red-Striped); the Nature Preserve's side of the line is a guess.
- **Stunfisk**: Met by a step only (it lies hidden in the mud): no wanderer.

### Bugs and forest

- **Spinarak**: Met by a step only (it waits on its web).
- **Pineco**: Met by a step only: it hangs in the trees like a cone.
- **Volbeat**: Partners 'area' so that Illumise joins Volbeat (and the reverse), as they display together.
- **Burmy**: Burmy's cloak by place (Plant 0, Sandy 1, Trash 2): check the form numbers in-game.
- **Karrablast**: Partners 'area' so that Shelmet can join (they're always together).
- **Durant**: Heatmor (the desert batch) shares these four places, a tier rarer.
- **Joltik**: Partners 'area': it clings to the cave's bigger Pokémon.
- **Tangela**: The Tangrowth-Cubone note isn't used: Cubone lives in dry badlands and canyons.
- **Foongus**: Met by a step only (it lies still and looks like an item).

### Grassland, farm and town

- **Nidoran♂**: Partners 'area' so that the two Nidoran meet together.
- **Lickitung**: Little lore to place it by; two quiet homes.
- **Eevee**: Glaceon at Twist Mountain mirrors the user's Leafeon; say if it should stay a grotto only.
- **Pikachu**: Pikachu wild though it comes by friendship. The NPC's Spiky-eared form could be the wild Pichu's (it can't evolve).
- **Jigglypuff**: Jigglypuff wild though it comes by friendship.
- **Sunkern**: Route 1's summer meadow and Route 12's flower hills as Sun Stone sites (Sunflora wild in both, Whimsicott on Route 1).
- **Stantler**: Dawn and dusk preferred (deer feed then): two single periods, used sparingly.
- **Plusle**: Partners 'area' so that Minun can join.
- **Roselia**: Roselia wild though it comes by friendship.

### Mountains, caves and ice

- **Diglett**: Met by a step only (it's underground).
- **Geodude**: Met by a step only (it looks like a rock).
- **Sneasel**: Weavile wild though it evolves by a held item at night: only where Pokécology has it hunting.
- **Swinub**: Mamoswine wild (a move evolution) as Giant Chasm's trophy.
- **Sudowoodo**: Sudowoodo wild though it evolves by a move (it's the natural adult).
- **Tynamo**: Eelektross wild by the charged stones' influence, as Raichu (the user listed all three).
- **Ferroseed**: Met by a step only (it hangs from the ceiling).
- **Cryogonal**: A weather-only home: Dragonspiral's entrance in diamond dust (1% of winter days).
- **Piplup**: Rare rather than exotic; the predator (Glalie) is rare too.

### Desert and fire

- **Charmander**: Read as 'on Reversal Mountain's outside'. If it meant 'mostly in the mountain, rarely elsewhere', the Fiery Caves would be its home instead.
- **Trapinch**: Met by a step only (it waits in its pit); Flygon is the wanderer of the family, but the family shares one setting.

### Ghosts, psychic and space

- **Ralts**: Route 2 as Ralts's trophy home is my pick for the Petalburg homage; say if another place should have it.
- **Chimecho**: The top floor's table needs checking in-game (STATUS.md's open item).
- **Spiritomb**: Not wild: an Odd Keystone event suits it (Sinnoh's Hallowed Tower).
- **Munna**: Musharna wild (a Moon Stone's) only in the basement, by the Dream Mist; check dreamyard_2 is the basement.
- **Ditto**: Met by a step only: it looks like something else until it's met.
- **Kecleon**: Met by a step only: it's invisible as a wanderer.
- **Castform**: Weather-only everywhere; its battle form follows the weather by itself.
- **Togepi**: Not wild: an egg given by someone kind (a gift) suits its lore; or Togetic as a rare visitor to Village Bridge, if you'd like it wild.

### Strong lines

- **Dratini**: Dragonite wild only at sea and at its own evolution level (55).
- **Gible**: Gible early (Relic Passage) as a trophy: the level gate keeps its later stages late.
- **Deino**: Victory Road's caves have two trophies (Larvitar, Deino); one could move.
- **Absol**: Weather-only: the user would add rare storms to Route 14 and Abundant Shrine (weather.md).

## Next steps

1. The user's review of the batches (above all the calls in "New calls" and the review list); changes go in the
   batch files, and the checks run again.
2. `exceptions.yaml` from `requests.md` and the decisions above (the static and gift ideas, the Hidden Grottoes as
   sources).
3. The generator: homes to `res/paperwhite2/encounters/species/*.json`, with the default levels, the tiers' later-stage
   step, the time strengths, the weather shifts, the rippling rule, and the limits (64 candidates, 4 KB an area).
