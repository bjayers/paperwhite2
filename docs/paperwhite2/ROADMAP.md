# Paper White 2 roadmap

First agreed with the user on 2026-10-29; audited against what is built on 2026-11-15. Each big item has a design doc
for approval before code. Where something is built, the line says where (STATUS.md's dated entry, plugins.md's
section, a design doc's "Built" part, or the code). **Done** means built and the user has seen it; "untested" means
built and waiting for the user's playtest. Nothing here has had the full fresh-save playtest yet: it waits on more
features, and decisions that depend on it (trainer scaling's bosses, the badge soft cap, catching help, the Join
Avenue's further lines) wait with it (STATUS.md, 2026-11-06 "where things stand").

## Status at a glance

| Area | State |
| --- | --- |
| Small things (shiny rate, Shiny Candy, Exp. Share, summary EVs/IVs, START debug menu, wild triples) | Done |
| Conditions module | Done |
| Encounter overhaul, habitat Dex, level scaling | Done |
| NPC spawn system | Mostly done (loose ends below) |
| Ambients and wanderers (overworld wild Pokémon) | Done, small gaps |
| Follower dialogue and gifts | Believed done (loose ends below) |
| The editor | Done for everything built so far; later pages follow their features |
| New screens: DexNav, Pokédex pages, C-Gear | Done; two ideas not designed (berry picker, interaction menu) |
| Join Avenue offline | Believed done |
| Pokémon Center attendants | Done (Day Care, Training Services, Wonder Trade) |
| Forms, new species, new moves and abilities | Done as systems; content grows with the user's art |
| Rig Editor v2 (battle sprites) | Done |
| Save expansion (Pokédex for 1500 species) | Done |
| Shiny palettes | Not done |
| Fairy type | Next |
| Entralink roguelike | Design pending |
| Final wireless removal | After the Entralink roguelike |
| Move and ability effect designer | Later |

## Order, with what became of each step

1. **Small things first: done.** The shiny rate and the Shiny Candy, the Exp. Share as a key item (STATUS.md,
   2026-10-29; `docs/paperwhite2/items.md`), EVs/IVs on the summary (plugins.md, Hidden stats on the summary screen), the
   START debug menu (plugins.md, Debug menu), the title and boot screens' art (the editor's Graphics & Palettes,
   STATUS.md 2026-10-31) and wild triple battles (STATUS.md, 2026-10-30; `encounters.md`, Wild triples). The grid behind
   the Season globe's preview: the Season app has its grid on both screens (STATUS.md 2026-10-28), not checked further.
2. **Phase 1, foundations that change data formats:**
   1. **Conditions module: done** (plugins.md, Conditions; `design/conditions.md`; compiler
      `tools/paperwhite2/conditions.py`; the debug menu's Conditions pages).
   2. **Encounter overhaul: done** (below).
   3. **NPC spawn system: mostly done** (below).
   4. **Fairy type: next.** The research is `design/moves-and-abilities.md` section 8 (a type appended as 18 keeps every
      constant; the places that treat 17 as "none" need patching). The Pokédex's type icons already leave an 18th
      place (`design/pokedex.md`). **Shiny variants: not done** (below).
   5. **Follower dialogue and gifts: built, believed done** (below).
3. **The editor: done for what exists, and growing.** Specialty editors: Encounter, Graphics & Palettes, Follower,
   Overworld, Map, Text, Script, Pokémon (with Add form and Add Pokémon), Move and Ability (with Add move and Add
   ability), Rig, Trainer, Join Avenue, Pokémon Center, Weather, C-Gear Pictures, and the Flag and Var Reference
   (`editor/README.md`). Pages follow features as they settle.
4. **Phase 3, new screens:**
   - **DexNav: done**, a key item, Y-registrable (plugins.md, DexNav; `design/dexnav.md`). Open: starting the searched
     Pokémon's battle, perhaps with a shiny chance that grows over time; the user hasn't decided how.
   - **Pokédex's new pages: done**: Stats, Data, Moves with the move panel, Evo, Area, Matchups and Flavour, the
     party's and summary's shortcuts, Unova natives, no opening (plugins.md, Pokédex; STATUS.md 2026-11-06 to
     2026-11-11; `design/pokedex*.md`). An HGSS-style grid was an idea only (not started).
   - **C-Gear overhaul: done** (plugins.md, C-Gear; STATUS.md 2026-11-05/06; the editor's C-Gear Pictures page): no
     wireless, the markers as app shortcuts, skins, power saves, the date. Further changes wait on the user.
   - **Season globe: the Season app is done** (plugins.md, Season app; STATUS.md 2026-10-28). The map per Pokémon
     Center and the art for the dynamic options were not checked in this audit.
   - **Berry picker and the wild-Pokémon interaction menu: wanted, not designed yet** (no design doc, no code).
   - **Join Avenue offline: believed done** (below).
   - **Pokémon Centers' upstairs attendants: done** (below).
   - **Roaming legendaries: not started** (the idea was to look at BW1's roaming Tornadus/Thundurus code first).

## Beyond the original order: built since

- **Pokémon Center attendants** (plugins.md, Pokémon Center attendants; `design/pokemon-center.md`, the "Built" parts;
  STATUS.md 2026-11-12; the editor's Pokémon Center page): the Day Care attendant (remote Day Care, transfer fee,
  badges), Training Services (Name Rater, Move Relearner, Move Deleter, Hyper Training, EV resets, ability changes,
  grooming, ball and nature changes) and the Wonder Trade (fee, languages and trainers, odds, held-item tiers, balls,
  forms, exclusions, the special reward), all with a champion discount, from `res/paperwhite2/pokemon_center/services.json`.
  Untested by the user: the Wonder Trade's tuning (item tiers, rates).
- **Forms** (plugins.md, Forms; `design/forms-and-species.md`, `design/form-evolutions.md`; STATUS.md 2026-11-12): Add
  form in the editor, form evolutions, the Spiky-eared Pichu (female, a Zap Plate, never sent back through the Wonder
  Trade; STATUS.md 2026-11-13).
- **New species** (plugins.md, New species; `design/new-species.md`; STATUS.md 2026-11-13): Add Pokémon in the editor,
  the Pokédex numbering, followers, encounters and the Wonder Trade for them, and the Applin line (Applin, Flapple,
  Appletun, Dipplin, Hydrapple) with the Link Cord and the three apples (`items.md`). Their art (battle sprites, walking
  sprites, icons) comes from the user and the Rig Editor; the apples' and Link Cord's icons are copies for now.
- **New moves and abilities** (plugins.md, New moves and abilities; `design/moves-and-abilities.md`; STATUS.md
  2026-11-13): the foundation, Add move and Add ability in the Move and Ability Editors, Apple Acid, Grav Apple, Body
  Press, Fickle Beam, Dragon Cheer, Syrup Bomb, Bulletproof, Sweet Syrup and Ripen.
- **Rig Editor v2** (`design/rig-editor-v2.md`, `design/battle-sprites.md`; STATUS.md 2026-11-12 to 2026-11-14;
  `editor/src/modules/rig/`): sequences and a timeline, armatures with curves, inherit scale per bone, battle-sprite art
  export and import.
- **Save expansion** (plugins.md, Save expansion; `design/save-expansion.md`; STATUS.md 2026-11-12): the Pokédex in the
  Pal Pad's block for 1500 species, old saves upgraded on load, the original block mirrored for species 1-649.
- **Also built:** trainer level scaling, the difficulty setting and Prestige levels (plugins.md; STATUS.md
  2026-11-05; their numbers wait for the playtest), the Version Key (kept as a debug tool), the weather calendar and
  the Weather Editor, street chatter in Castelia (`design/street-chatter.md`), HMs by learners, name entry without the
  word filter, the Map Editor and map maker (`design/map-editor.md`, `design/map-reader.md`; STATUS.md 2026-11-01 to
  2026-11-05), and the Overworld Editor with its rails, cameras and ambients.

## Encounter overhaul: done

Built per species in `res/paperwhite2/encounters/` (`encounters.md`; the Encounter Editor): zones, methods, seasons,
times, weathers, weights, level ranges and pack flags; compiled per zone, filtered at each encounter by the current
conditions; priority; level scaling from the party's level (`res/paperwhite2/level_scaling.json`); the habitat Pokédex
without its 30-species cap (plugins.md, Habitat Dex); the ecological encounters are in `res/` (STATUS.md 2026-11-12).
Not checked in this audit: whether the encounter-biasing abilities (Static, Magnet Pull) as weight modifiers, fishing,
Sweet Scent and rippling-water drops were reworked beyond what plugins.md's Wild encounters lists. Outbreaks and Hidden
Grotto entries are in the Encounter Editor. Roaming legendaries are not started.

## Shiny palettes: not done

The deep dive is `design/shiny-palettes.md` ("Nothing here is built"). Decided 2026-10-29: variants by PID bits 8-15
(`((pid >> 8) & 0xff) % N`), the shiny check unchanged, N per species and form, mostly 1. The goal is one place that
defines a species' shiny colours, which the battle sprites, the followers and the party and box icons all follow. Open:
whether shiny followers can share the normal sheet with only another palette, deriving follower and icon palettes
from the battle sprite's, spare palette slots for icons. Until then the wrong follower shiny palettes stay (the
regeneration is on hold), and new species' shiny walking sprites are placeholders (STATUS.md 2026-11-13). The editor's
Shinies page shows the shiny palette beside the normal. Comes after the conditions module (done), so it is unblocked.

## NPC spawn system: mostly done

Built (plugins.md, NPC spawns, Ambients, Wanderers; `design/npc-research.md`, `design/overworld-editor.md`; STATUS.md
2026-10-31 to 2026-11-04; the Overworld Editor): conditions and weighted instances per NPC, picked at zone entry and
again as the hour changes while out of the camera's view; mutually exclusive groups; the real limit behind frozen maps
researched; ambient wildlife on perch points (up to 32 a zone, 8 shown) with paths (perch, hover, curved flight);
wanderers; the user's hand placements up to Castelia ported.

Left:
- a script's `SpawnRefresh`, and NPCs walking off when their time is over (plugins.md, NPC spawns, "Not yet");
- ambients: the zone's switch, a "!" for an aggressive one noticing the player, a sparkle sound (plugins.md, Ambients,
  "Not yet"); wanderers: flying off when the player comes near, picking again in the zone, and sprites from the
  encounters (plugins.md, Wanderers, "Not yet");
- the maps with many NPCs that freeze: the research found the limits (actors, event data, the 64 billboard materials
  and 128 handles per map) but each map is still checked as the user places things.

## Follower dialogue and gifts: believed done

Built (STATUS.md 2026-10-30; `following-pokemon.md`, Dialogue rules, gifts and steps; the Follower Editor): dialogue as
condition rules, gifts as actions (items or pools), pickups and ambient emotes on steps, a daily friendship from a talk.
The Following Pokémon runtime itself is ported (plugins.md; stages rebuilt 2026-11-05, `design/following-rewrite.md`).
Loose ends found:
- movement routines on tiles (running a circle, running off and back): only the sprite-offset motions exist
  (`following-pokemon.md`, What remains);
- no sample `script` step, so that action's hand-off is untried;
- on a rail the talk's facing is the rail's line, so `facing` clauses read that, and tile bounds don't follow rails;
- a few content gaps: the dialogue library is the user's to write, and the follower is not shown sinking into deep sand
  (tried and reverted, 2026-11-15).

## Join Avenue offline: believed done

Built (STATUS.md 2026-11-06 steps 1 to 4, "no wireless visitors", the owners' own lines, the guide's tip; plugins.md,
Join Avenue; `design/join-avenue.md`; the Join Avenue Editor): the avenue works with no wireless, owners arrive one a
day and open the shops they want, random visitors come and go, the tutorial's owner, no word filter. The user's own
owners and visitors, and the further lines, wait on the playtest.

## Map Editor (a big project): built, still growing

The map views and the Map Editor exist (STATUS.md 2026-11-01 to 2026-11-05, `design/map-editor.md`): collision and
tile painting, new maps and routes, the object library, vanilla-style paths and riverbanks read from the atlas. Still
to build or settle: adding whole new chunks and models as new archive members, whatever Nitro features a custom
Blender model needs beyond the converter (new material slots, draw calls), and polygons (STATUS.md 2026-11-05, "the
open problem"). The Map Editor and the Overworld Editor stay separate editors on one shared map view.

## Still to come, in the user's words

- **Fairy type:** next. Research done; no code.
- **The Entralink roguelike:** design pending. `design/entralink.md` is the research (the Entralink is unreachable in the
  hack today; its wireless parts and what still works alone). Wireless leaves in its place.
- **Final wireless removal:** one pass at the very end, after the Entralink roguelike, for whatever wireless is left.
  Until then wireless goes feature by feature as each is reworked to be local; no full audit before.
- **The berry picker and the wild-Pokémon interaction menu:** wanted, not designed.
- **Shiny palettes:** above.
- **The move and ability effect designer:** later. The pieces for it are in `paperwhite2_battle.c` (small rules kept
  apart on purpose; `design/moves-and-abilities.md` section 9, step 6), with custom animations.
- **Rail maps' precision (Castelia's waterfront and other rail maps):** parked 2026-11-19. Vanilla rails place actors
  loosely: NPCs seem to float as the camera moves, the player can step onto tiles that look unwalkable, and the follower
  draws over a curb or railing in two spots of `castelia_city` (the player doesn't). Fixing it means tracing the rail
  system's fixed-point maths from rail line to world position and the rails' own collision grid
  (`following-pokemon.md` has the camera side); a large investigation, not a quick fix.
- **Later ideas:** day/night encounter tables per season, party-wide Exp. Share, DexNav starting the searched Pokémon's
  battle, an HGSS-style Pokédex grid, roaming legendaries, a new species' real art as the user draws it.
- **The full fresh-save playtest:** after more features land. Test findings and the decisions that wait for it are in
  STATUS.md.
