# The Overworld Editor (design, 2026-10-31)

The user's plan for the Overworld Editor: everything Frost's Gen 5 Editor edits on a map, then the new spawn features
(instances, ambients, groups). This is the proposal: what each part edits, how the new runtime features would work
within the game's limits, the phases, and the user's open decisions. Nothing is built yet. Background:
`design/npc-research.md` (the event buffer's limit and the actor pools), `docs/data.md` (Zone events, Map model
sources), `ROADMAP.md` (the later Map Editor, which shares this editor's map view).

## The modules and their data

| Module | The game's data | Notes |
| --- | --- | --- |
| **NPCs** | `res/field/events/<zone>.json`, `npcs`: id, model (`OBJ_CODE_*`), movement (`MOVE_CODE_*`), type (trainer, item and so on), flag, script, direction, three params, area (the leash's width and height), grid position (x, z and the height y) or a rail position | A trainer's sight range is one of its params (to confirm from the code before the editor draws it) |
| **Proxies** | `bg_events`: script, condition, direction, position | The interactive points: hidden items, signs to read, things to check |
| **Buildings** | the props of the zone's map chunks: Blender empties in each `res/field/maps/models/<chunk>/model.glb`, `bw2_prop_NNNN_id_XXXXX`, with a position, a Y rotation and a model ID | The packer writes them back (`docs/data.md`, Map model sources). The editor moves, rotates, adds and removes them by rewriting the empties' nodes in the GLB. It shares the files with the later Map Editor |
| **Triggers** | `triggers`: script, var and value, type, position and size | Drawn as their rectangle |
| **Warps** | `warps`: destination zone and warp, transition, position and size | A link opens the destination zone at that warp |
| **Level scripts** | `init_scripts`: type, script, var and value conditions | Not in the list, but Frost edits them and the Script Editor already lists them |

Positions are grid tiles (x, z) and a height y in the game's fixed point. Some zones place things on rails instead
(Skyarrow Bridge and others); those come later, as their own overlay.

## The map view (shared with the later Map Editor)

- **3D:** each map chunk of the zone's matrix (`res/field/matrices/`) as its GLB, through three.js. The GLBs reference
  the shared texture PNGs, so the view is textured. Orbit, pan and zoom, and a top-down camera.
- **Tiles over it:** each tile drawn at the height its collision gives (`terrain_0.csv`: shape, slope and height
  indices into the tables of `field_map_chunk_height.c`), colored by tile type and walkability.
- **Layers:** the 60 two-layer chunks (`terrain_1.csv`, as in Virbank City and Virbank Complex) show a layer switch.
  Each entity is drawn on the layer its height puts it on.
- **Entities:** each one where it is, at its height, with its sprite, as a billboard facing the camera:
  - **sprites:** an NPC's model's `sprite.png` and `sprite.pal` (`res/field/actors/`), its frame by its direction;
  - **leashes:** the movement area as a rectangle around the NPC;
  - **sight:** a trainer's sight as a line of tiles from its facing;
  - **triggers and warps:** their rectangles.

  A **movement preview** plays the move code as an approximation: wandering inside the leash, turning, walking a line.
- **Editing:**
  - drag an entity to another tile, and its position and height follow the tile;
  - Shift+click a tile to add an NPC there (or a proxy, trigger or warp, by the module);
  - entities on one tile are listed together, so each can be picked;
  - a side panel edits the chosen entity's fields: the schema's, with the constants' dropdowns, sprite and movement
    pickers, and its script in the Script Editor's embedded view (or a link to it), with messages in the talk window.
- **Permissions painter:** choose a tile type and a height (and, on two-layer chunks, a layer), then paint tiles by
  dragging. It writes the chunk's terrain CSVs, which the packer checks. This is the Map Editor's first piece; the full
  painter, with shapes, slopes and splits, comes with it.
- **Budget check:** the zone's events file against the 2,436-byte buffer (the freeze, `npc-research.md` §4), the live
  actors (64), and the distinct sprite codes (32), with a warning before saving and a guard in the build (phase 1 of the
  research).

## The new runtime features

### Conditions on any NPC

Every NPC, placed or instance, can have a condition: the conditions engine's `when`, as habitats have (season, time,
weather, flags, vars, zone and the rest), edited with the same checkboxes and options as the Encounter Editor. At zone
entry, an NPC whose condition fails isn't created, without a flag. A flag is still the way to remove an NPC for good
(after a gift, a battle).

### Instances

- **The host:** an NPC record in the zone's events, which the editor makes and keeps off-map. The user doesn't place
  a blank NPC; adding an NPC with instances makes its host. It takes one slot of the events buffer, as any NPC does,
  however many instances it has.
- **The instances:** each has everything an NPC has (position and height, direction, movement, leash, flag, script,
  sprite, event type), plus its condition and a weight. They are kept in the hack's own file,
  `res/paperwhite2/overworld/<zone>.json`, packed into an archive member that is read at zone entry, so they cost
  nothing of the events buffer.
- **Choosing one:** at zone entry (and again on a time-of-day change, off-screen), the engine picks one instance whose
  condition holds, by weight, from the day's seed, so the same day, time and zone give the same pick, and writes it
  into the host's record before the actors are made. That is the research's option C. It needs no new actor and no
  new memory, and talking, scripts and saving work as for any NPC.
- **Height:** an instance's height is its own, so a bird can sit in a tree. To verify: that a still NPC
  (`MOVE_CODE_NONE`) keeps its height rather than snapping to the ground. A moving one follows the ground, as the game
  does.
- **The editor:** an instance shows with a translucent purple box. The host's panel lists its instances, and each can
  be shown on the map alone.
- **Sprites from the encounters:** an instance's sprite can be "a Pokémon of this area's encounters now", optionally
  filtered by type, method or tag. The engine picks one of the species that can appear (the encounters' build) and
  uses its follower sprite (`OBJ_CODE_FOLLOWER_*`). Its script can then talk about it (the species is put in a word
  set buffer).

### Ambients

- **What they are:** sprites drawn without an actor, as the follower's effects are drawn, so they take no actor slot
  and no event buffer. They aren't interactive and don't collide.
- **Fields:**
  - any position and height;
  - a path that isn't tied to the grid: a circle or ellipse, a line back and forth, a figure eight, hovering in
    place, or perching with turns, at a speed;
  - a condition and a chance to appear;
  - a sprite: fixed, from a group of sprites, or from the area's current encounters.
- **Where they belong:** the user's rule, "only out of bounds", can be a warning in the editor rather than a rule.
- **Memory and limits:**
  - each distinct sprite is a texture in VRAM (a follower sprite is a few KB), and the billboard system's resources are
    shared with the actors (32 distinct sprite codes, 64 materials);
  - so a zone gets a budget: **up to 8 ambients and 4 distinct sprites** at first, raised once the busiest maps'
    texture VRAM is measured (`npc-research.md` §7);
  - their work is a small pool in the field's heap, made at zone entry and freed at unload;
  - the engine skips any that don't fit, rather than failing.
- **Cost each frame:** a path's position per ambient, which is tiny.

### Picking again while in the zone (decided 2026-11-02)

- **When:** once a second the field compares the time of day and the hour with their last values; on a change,
  every NPC with a condition or instances is checked again: shown, hidden, or given another instance.
- **Only out of view:** a change is applied to an NPC only while it's outside the camera's view (its box tested
  against the field camera's frustum, with a margin, so custom camera areas and the vanilla camera's angle are the
  same case), and never while it's talking, in a script or cutscene, has spotted the player, or a menu is open. One in
  view keeps its state and is checked again each second. One that should appear is created only if its spot is out
  of view too.
- **Rolls by the hour:** a chance (10%) is rolled from the hour's seed by default (`Conditions_Hash(day, hour,
  zone, id)`), so people come and go during the day and a reroll happens at most once an hour, out of view; a
  member can choose the day's, the period's or each entry's seed instead. Weather keeps the day's.
- **Walking off (later, the user's backburner):** an NPC whose time is over walks off to a door or out of view
  instead of waiting until it's looked away from. Not with the scripts' path command (fragile, and it freezes the
  game on a far target): a few steps at a time toward the way out, giving up and waiting out of view when blocked,
  and only while the player is free to move.

### Overworld encounters (the user's idea, 2026-11-02; after ambients)

Pokémon seen walking in tall and dark grass, drawn as ambients are (no actor), up to 3 on screen:
- **Spawning:** every few seconds while fewer than 3 are on screen, one rises out of a random grass tile of the
  right kind near the screen's edges and never within a few tiles of the player: the sprite comes up out of the
  grass over a few frames with the grass's rustle, so it looks as if it pops out of it. Its species and level are
  picked as a step in that grass picks them (the same tables, conditions and rates), and its personality then, so a
  shiny one looks shiny.
- **Wandering:** tile to tile within grass of the same kind, with pauses, facing its way, never into another's tile.
  Each species wanders randomly by default; an option per Pokémon makes it aggressive (toward the player, faster) or
  passive (away from the player). Under a Repel, every one wanders away from the player.
- **Despawning:** after its time on screen (20 to 40 seconds), when far out of view, or when the time or weather
  changes so its table no longer has it; it sinks back into the grass with a rustle, never vanishing in view.
- **Battle:** the player stepping onto its tile, or it walking into the player, starts a single battle with that
  Pokémon at that level (always single, whatever the grass).
- **Undecided (the user will playtest first):** whether random grass encounters stay, get rarer or go where
  wanderers are; a debug switch for the three while testing.

### Groups: sets where only one can appear (the user's idea, 2026-10-31; agreed 2026-11-03)

A group is a set of members of which at most one appears at a time. It works as an NPC's instances do, across
separate NPCs, instances, ambients and zones, and it helps keep a zone in its budget: eight groups of ambients never
show more than eight ambients.

- **Members:** an NPC (whole, whichever instance it shows), a single instance, or an ambient. Each belongs to one
  group at most, and an NPC in a group can't have an instance in another. Each keeps its own condition and its own
  chance, rolled as before from its own `rolls`.
- **The pick:** among the members whose conditions (chances included) hold and whose flags aren't set, one by weight.
  The group has a **nobody** weight too, so it has a chance of its own: "someone's here 60% of the time, one of these
  four". Its own `rolls` (the hour by default, the day, the time of day, each entry) say how long the pick holds, from
  a seed keyed by the group that ignores the zone, so every zone picks the same.
- **Across zones:** a group's members can be in several zones ("this traveler is in one of these towns today").
  Each zone works out every member's condition as that member's own zone would (its seed, its key, the same order of
  rolls), so a member's chance comes out the same everywhere. A cross-zone group can't roll "each entry" (every entry
  would roll again), and what a zone can't know for another (its weather, the player's tile) is read where the player
  is, so the editor warns about those clauses in a cross-zone group.
- **Budget:** members still count toward the zone's NPC and sprite budget; a group only guarantees that at most one
  of its members shows.

**Data.** `res/paperwhite2/overworld/groups.json` (`groups.schema.json`) has the groups: an id, a name, a home zone
(optional, where the editor lists it), `rolls` and `nobody`. A member says its group where it is defined, in its zone's
file: `"group": {"id": "traveler", "weight": 2}` on an NPC's entry, an instance or an ambient. A group's members are
found by looking through the zones.

**Packing.** `overworld.py` adds to each zone's table the groups it has a member of, each a header rule and then every
member's rules from whichever zone, so a zone needs no other zone's table. An NPC in a group that has no rules of its
own gets an empty condition, so the field sees it.

**The editor.**
- A zone lists its own groups (home zone) and those it has a member of; a button opens the full list, where a group
  can be added, renamed or deleted, and an NPC, instance or ambient added to any group.
- Each member's panel gets a Group section: its group, its weight, and its chance of appearing, simulated.
- The simulated chance is worked out exactly from the members' chances and weights and the nobody weight, taking their
  other conditions as met (later, with the preview mode's context, as they are then).
- "Show only this group": the map fades everything else and shows the group's members in this zone.
- Warnings: a cross-zone group rolling each entry, a cross-zone member's condition reading the weather or the tile.

**Debug.** A debug menu page lists the zone's groups, each member's state (eligible or not) and the pick.

### The preview mode

The editor runs the selection as the game would, with every NPC's, instance's, ambient's and group's condition and the
encounter sprites:
- **conditions:** a bar to set season, time, weather, flags and vars;
- **Reload:** rolls a new seed, as another day.

It reuses the Encounter Editor's context and needs the conditions engine's matching in the editor (the Encounter
Editor already has part of it).

### The sprite load bar (the user's request, 2026-10-31)

Beside the events buffer's load bar, a second bar for the sprites the zone can have loaded at once, against the
actor sprite and texture limits (green, yellow from 80%, red past it). It counts the worst case over the conditions,
not every sprite on the map: for each combination of the conditions the zone's NPCs, instances, groups and ambients
use (season, time, weather, flags and vars as they appear), the NPCs and instances that can appear together (one per
group, the most a group's members need), the ambients' budget and the overworld encounters' sprites, and takes the
highest. Built with instances and ambients (phases 2 and 3), when the limit's real numbers are measured.

**Built (2026-11-02, `editor/src/modules/overworld/spriteLoad.ts`):** the limit that makes sprites vanish is the sprite
material cache, 32 object codes. It holds the zone's preloads first: the list its header's `npc_cache` names
(`res/field/actors/preloads.json`, dumped from a/0/5/7 by `tools/data/npc_cache_data.py`, which `check` confirms
matches the ROM; the build still packs the ROM's), which Route 20's takes 23 of. Then the player (counted 2: walking,
and cycling or surfing), the Following Pokémon (1), and the NPCs', instances' and ambients' sprites past those, in the
worst case over every combination of the seasons, times, weathers and flags the zone's conditions name, every chance
coming up, each host and ambient counting whichever of its choices adds one more. 3D models don't count. An NPC
without spawn data counts as shown, since its story flag isn't known, except script 10852's seasonal NPCs (flags 500
to 599) in the zones whose scripts call it: those show as the script shows them, for every season, roll and time
(with its night swaps where the zone sets EVENT_WORK_0x401f first), and the 10% ones all at once at worst. The bar's tooltip lists the sprites.
The research's 24 codes on Route 20 (§4) left the preloads out.

## Phases

1. **The editor over the existing data.** The map view with tiles and layers; NPCs, proxies, triggers, warps and level
   scripts with every Frost field; drag, Shift+click, stacked tiles, sprite, leash and sight previews, and the movement
   preview; the embedded Script Editor; the permissions painter; the budget check. Then buildings, which need GLB node
   editing.
2. **Conditions and instances:**
   - the runtime: an archive member, selection at zone entry, writing the host's record, time-of-day re-selection,
     encounter sprites;
   - the editor's instance panels and purple boxes;
   - the preview mode.
3. **Ambients** (order of 2026-11-02): picking again in the zone (above) and a game test of phase 2; the ambients'
   format and the editor (a list, placing, paths drawn, the sprite moving along them in the preview); the engine's
   first test (Pidove perched on a Route 20 tree the user hasn't edited); then every path, conditions and chances,
   shadows (none, under its feet, or on the ground below), flying off when the player comes near, the budget,
   sprites from the encounters, and the editor's warnings.
4. **Overworld encounters** (above), on the ambients' framework.
5. **Groups** (mutually exclusive sets), agreed 2026-11-03: runtime and packing, then the editor.

Phase 0 and 1 of `npc-research.md` (the freeze test and the size guard) come with phase 1 here.

## The user's decisions (2026-10-31)

1. **Buildings:** the map chunks' props, as CTRMap's building editor edits them (Frost's editor had none). A sign is
   two things: the building (the model) and its proxy (the tile that reads it), which move separately; the editor may
   offer to move a proxy with its building.
2. **The instance host:** the editor makes and hides it, off-map while unused.
3. **Lasting state:** an instance whose flag is set leaves the pool (Groups, Flags).
4. **The ambient budget:** 8 a zone and 4 distinct sprites to start. Planned for later, perhaps: overworld encounters
   in grass and dark grass (sprites from the area's Pokémon that start a wild battle when touched), up to 3 on screen.
   They would be actors, so they share the sprite and texture budget with ambients.
5. **Groups:** mutually exclusive sets (Groups), agreed 2026-11-03.
6. **Rail zones** after the grid ones.
7. **The phases** as listed: the editor over the existing data, designed with room for the new; then the engine's
   conditions and instances; then ambients and groups.
