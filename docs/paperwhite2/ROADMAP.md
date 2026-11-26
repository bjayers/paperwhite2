# Paper White 2 roadmap

First agreed with the user on 2026-10-29; audited against what is built on 2026-11-15 and again on 2026-11-25. Each big item has a design doc
for approval before code. Where something is built, the line says where (STATUS.md's dated entry, plugins.md's
section, a design doc's "Built" part, or the code). **Done** means built and the user has seen it; "untested" means
built and waiting for the user's playtest. Nothing here has had the full fresh-save playtest yet: it waits on more
features, and decisions that depend on it (trainer scaling's bosses, the badge soft cap, catching help, the Join
Avenue's further lines) wait with it (STATUS.md, 2026-11-06 "where things stand").

## Status at a glance

| Area | State |
| --- | --- |
| Small things (shiny rate, Shiny Candy, the party-wide Exp. Share, summary EVs/IVs, START debug menu, wild triples) | Done |
| Conditions module | Done |
| Encounter overhaul (seasons, times of day, weathers), habitat Dex, level scaling | Done |
| NPC spawn system | Mostly done (loose ends below) |
| Ambients and wanderers (overworld wild Pokémon) | Done, small gaps |
| Following Pokémon and their dialogue and gifts | Done as systems (loose ends below); the content is the user's to write |
| The editor | Done for everything built so far; later pages follow their features |
| New screens: DexNav, Pokédex pages, C-Gear | Done; two ideas not designed (berry picker, interaction menu) |
| Join Avenue offline | Believed done |
| Pokémon Center attendants | Done (Day Care, Training Services, Wonder Trade) |
| Forms (the Spiky-eared Pichu and others), new species, new moves and abilities | Done as systems; content grows with the user's art |
| Rig Editor v2 (battle sprites) | Done |
| Save expansion (Pokédex for 1500 species) | Done |
| Shiny palettes: palette variation, followers and icons on the battle palettes | Done (loose ends below) |
| Sprite Editor (icons and walking sheets) | Done |
| Fairy type | Done |
| Entralink roguelike (the Entree) | Built and playtested; screens' art, C-Gear run display and reaching it in play left |
| Roaming legendaries | Phase 1 built (roaming, encounters, weather, debug menu); DexNav page, gate board, harsh sun, editor, story left |
| Final wireless removal | Started: 9 wireless-only screens are shells; the final pass at the end |
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
   4. **Fairy type: done** (`design/fairy-type.md`; STATUS.md 2026-11-15: the type, its moves, the Roseli Berry, the
      Fairy Gem, Flower Shield, Fairy Lock, Crafty Shield, the Pixie Plate and Arceus-Fairy, step 2's cases tested).
      **Shiny variants: done** (below).
   5. **Follower dialogue and gifts: done as a system** (below).
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
   - **Roaming legendaries: phase 1 built, untested by the user** (design/roaming-legendaries.md, sections 9-10;
     plugins.md, Roaming legendaries; STATUS.md 2026-11-25): the eight roam Routes 1-23 once released (the debug
     menu's Release all for now), move on a 15-minute clock, scatter after a battle, keep their HP and status, come back
     the day after a knock-out, and bring their weather. Left: the DexNav's Roamers page, the gates' board, harsh sun
     (Entei, Moltres), the editor's page, the story's releases (phases 2-5).

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
- **Since 2026-11-15:** the Shop Editor and every shop's goods as data (STATUS.md 2026-11-15); the follower's shadow
  fixed across the game's cameras (`res/paperwhite2/follower_camera_fixes.json`; STATUS.md 2026-11-18 to 11-19); palette
  variation in the field and for wanderers (2026-11-18); damage numbers and HP bars in battle (2026-11-20, from the
  Entralink buffs); the Sprite Editor (2026-11-22, below).
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
Grotto entries are in the Encounter Editor. Roaming legendaries: phase 1 built (above).

## Shiny palettes: done

The goal (`design/shiny-palettes.md`) was one place for a species' colours that the battle sprite, the follower and the
party and box icons all follow. Built:
- **Palette variation** in battle and the field, wanderers included (STATUS.md 2026-11-18).
- **Followers and walking sprites on the battle palettes** (`design/follower-palette-remap.md`, method F; STATUS.md
  2026-11-22): sheets re-indexed onto `normal.pal`, shinies through `shiny.pal` at run time, the separate shiny sheets
  gone; female rows only where the art differs. Opted out: Castform, Cherrim, Hydrapple and the ??? Arceus sheet.
- **Party and box icons on the battle palettes, everywhere** (`design/shiny-icons.md`, `design/icon-screens.md`;
  STATUS.md 2026-11-22 to 11-24): one icon per species re-indexed onto its battle palette and hand-revised by the user,
  each with its own palette on every icon screen (extended palettes on the busy ones), shiny-aware, toned toward the
  vanilla banks at build time (`res/paperwhite2/icon_tone.json`).
- **The Sprite Editor** (Editors): icons and walking sheets edited in battle-palette indices, normal and shiny side by
  side, with review marks (`res/paperwhite2/sprite_review.json`).

Left: the user's 3DS pass over the icon screens (`design/icon-screens.md`, section 6), then removing the old three
shared icon banks kept as a fallback; Hydrapple's and Flapple's art and icons (the user is redrawing them); the
user's review of the follower sheets (about 50 flagged in `follower-palette-remap.md` section 9).

## Entralink roguelike (the Entree): built

`design/entralink-roguelike-prototype.md`, `design/entralink-buffs.md`; STATUS.md 2026-11-15 to 2026-11-22. Runs with
a level-100 copy of the party and a forfeit, rooms and room types as data (the Entree Editor), the run's bag, the
Nightmare Ball, Dream Dust, shops, the hub shop and Dream Shards, markers and fogs, random enemy rooms, the buff
catalogue (phases 1-7), enemy scaling, records, the Entree's menu, ranks and their rewards, and the difficulty tiers
(Daydream, Reverie, Delusion, Nightmare) with their modifiers. Playtested three times and rebalanced.

Left: the proper buff and Entree screens with the user's art (from Claude's specs), the C-Gear's run display, the
records page's layout tweaks the user listed, and how the player reaches the Entralink in normal play (the prototype
doc says it is reached by the debug menu; check before building anything on it).

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

## Following Pokémon, dialogue and gifts: done as a system

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

- **The Entralink's screens and run display:** above.
- **Final wireless removal:** one pass at the very end for whatever wireless is left. Until then wireless goes feature
  by feature as each is reworked to be local; no full audit before. Started 2026-11-23: the GTS, Wi-Fi Club, Game
  Sync, IR ranking, linked trades, link multi battles, the recorder's online rankings, the Battle Competition and the
  Dream Radar are shells (`design/wireless-shells.md`).
- **The berry picker and the wild-Pokémon interaction menu:** wanted, not designed.
- **Icons and followers:** the loose ends under Shiny palettes, above.
- **The move and ability effect designer:** later. The pieces for it are in `paperwhite2_battle.c` (small rules kept
  apart on purpose; `design/moves-and-abilities.md` section 9, step 6), with custom animations.
- **Rail maps' precision (Castelia's waterfront and other rail maps):** parked 2026-11-19. Vanilla rails place actors
  loosely: NPCs seem to float as the camera moves, the player can step onto tiles that look unwalkable, and the follower
  draws over a curb or railing in two spots of `castelia_city` (the player doesn't). Fixing it means tracing the rail
  system's fixed-point maths from rail line to world position and the rails' own collision grid
  (`following-pokemon.md` has the camera side); a large investigation, not a quick fix.
- **Later ideas:** DexNav starting the searched Pokémon's battle, an HGSS-style Pokédex grid, a new species' real art
  as the user draws it. (Roaming legendaries are being built: phase 1, above.) (Day/night encounters by season, wanderers, the party-wide Exp. Share
  and the Shiny Candy, once listed here, are built: see the table above.)
- **The full fresh-save playtest:** after more features land. Test findings and the decisions that wait for it are in
  STATUS.md.
