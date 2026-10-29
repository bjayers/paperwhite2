# Paper White 2 roadmap

Agreed with the user on 2026-10-29. Design notes, not final; each big item gets a design doc for approval before code.

## Order

1. **Small things first:** shiny rate and a shiny-making item, the Exp. Share as a key item, EVs/IVs on the summary,
   the grid behind the Season globe's preview, a START debug menu, a look at the title screen and credits art, and a
   wild triple battle prototype.
2. **Phase 1, foundations that change data formats** (before the editor's pages for them):
   1. A shared **conditions module**: season, time of day, weather, story flags, variables, zone, terrain, plus the
      spawn system's mutually exclusive groups. Checked first through the START debug menu, which shows what it
      returns.
   2. The **encounter overhaul**, below, with the habitat Pokédex's data.
   3. The **NPC spawn system**, below.
   4. **Fairy type**, and the decision on shiny variants (multiple palettes).
   5. **Follower dialogue and gifts** (the cloud session's design notes), just before the editor, which they need for
      testing.
3. **The editor.** The cloud session builds the stable parts now (text, trainers, items, moves, species, events,
   scripts, rails, grottoes, the weather calendar), reading this repo without changing it; the new formats' pages
   follow as they settle.
4. **Phase 3, new screens:** the Dexnav (a key item, Y-registrable), the C-Gear overhaul, the Season globe's map per
   Pokémon Center and its art for the dynamic options, the berry picker and the wild-Pokémon interaction menu, the
   Pokédex's new pages (evolutions, stats, learnsets) and maybe an HGSS-style grid, Join Avenue offline, the
   Pokémon Centers' upstairs attendants, roaming legendaries.

## Encounter overhaul

- Edited per species (`res/pokemon/<species>/habitats.json` or similar): zones, method (grass, dark grass, shaking
  grass, surf, rippling water, rods), seasons, times, weathers, weight, level range, and a pack flag for double or
  triple battles, possible in normal grass too.
- Compiled per zone at build time; the game filters the zone's entries by the current conditions at each encounter,
  so day/night and weather changes apply at once.
- A **priority** so that conditional spawns (rain, snow, night) show through instead of being drowned out.
- A build check (and the editor's): every zone and method with terrain for it has a Pokémon under every
  combination of conditions.
- **Level scaling** from the party's median, then lowered: wild Pokémon a bit below the party (a party of 50 meets
  about 35–45), more evolved species a little higher, each clamped to its own range and eligible only from its
  minimum. The user's scripts today use floor(floor(lead / 5) * 4). The formula is exposed to the editor for tuning.
- Later: auto-generating starting encounters from the user's descriptions of each species' habitat and behavior
  and of each area.
- Later, undecided: Hidden Grottoes and mass outbreaks (swarms) will need updates; more dark grass on maps.
- Reworked with it: the habitat Pokédex (the 30-species cap goes), the encounter-biasing abilities (Static, Magnet
  Pull) as weight modifiers, fishing, Sweet Scent, shaking grass and rippling water drops.
- Roaming legendaries: look for BW1's roaming Tornadus/Thundurus code first.

## Shiny palettes (deep dive before changing any)

- Goal: one place to define a species' shiny colours (or several variants) that the battle sprites, the follower
  sprites and the party/box icons all follow, so editing or adding a palette is one change.
- Questions: whether shiny followers can use the normal follower sheet with only a different palette (making the
  174 duplicated shiny sheets obsolete, and saving their space; it depends on how the billboard texture sets bind
  palettes); whether follower and icon palettes can be derived from the battle sprite's palettes (research.md has a
  colour-shift rule that fixes Zekrom); how a variant is picked (PID bits) and stored; spare palette slots for icons
  on the party, box and battle party screens.
- Hold the regeneration of the wrong follower shiny palettes (research.md lists the suspects) until then.

## NPC spawn system

- Spawn groups per zone, with candidates, weights and conditions, pick one or N, and mutually exclusive groups;
  replaces the hack's flag-500–599 scripts. Only NPCs that spawn are created.
- First find the real limit behind the maps that freeze with many NPCs (actors, event data, the 64 billboard
  materials and 128 handles per map).
- Ambient wildlife from the habitat data, on perch points (per-map positions with tags such as treetop), plus
  hand-placed Pokémon where the user wants them. The user's existing hand placements up to Castelia are ported to the
  new structure.
- Curved flight paths as a path movement type for scenery NPCs, not rails.
