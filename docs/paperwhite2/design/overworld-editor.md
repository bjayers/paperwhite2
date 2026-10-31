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

### Groups (a proposal)

A **group** is a set of members (instances, ambients, and NPCs whose appearing it decides) with:
- **a shared condition**, so a whole set appears only when it holds;
- **a choice:**
  - "all" (every member whose own condition holds);
  - "one" (one member by weight);
  - "some" (up to N members by weight, on different tiles).

Each member keeps its own weight and condition. A host's instances are already an implicit "one" group of its
alternatives, so groups are for choices across NPCs: a flock of three birds with one of four sprites, "one of these
five wanderers today", a festival crowd in summer. With a day-keyed pick, a group can span zones ("this traveler is in
one of these towns each day"), with no saved state. Groups come after instances and ambients, once their use is
clearer.

### The preview mode

The editor runs the selection as the game would, with every NPC's, instance's, ambient's and group's condition and the
encounter sprites:
- **conditions:** a bar to set season, time, weather, flags and vars;
- **Reload:** rolls a new seed, as another day.

It reuses the Encounter Editor's context and needs the conditions engine's matching in the editor (the Encounter
Editor already has part of it).

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
3. **Ambients:** the billboard renderer, paths, budget, and the editor's paths drawn on the map.
4. **Groups.**

Phase 0 and 1 of `npc-research.md` (the freeze test and the size guard) come with phase 1 here.

## For the user to decide

1. **Buildings:** the props in the map chunks (houses, trees, fences and the like), which Frost's Buildings tab edits.
   Signs you read are proxies.
2. **The instance host:** the editor makes and hides it, so you never handle a blank NPC.
3. **Lasting state:** an instance that should vanish for good after its script (a one-time gift) gets a flag the build
   assigns from a free range, so the editor asks only "disappears once done".
4. **The ambient budget** (8 a zone, 4 distinct sprites) as the first limit, raised after measuring.
5. **Groups** as proposed, after instances and ambients.
6. **Rail zones** after the grid ones.
