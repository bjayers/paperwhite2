# Dexnav (design, not built)

Research and a proposal for Paper White 2's Dexnav, written 2026-10-30, for the user's approval before any code. Its
base is Pokeweb's **Pokenav** (the user calls it Pokeweb's Dexnav, `bjayers/pokeweb-serverless`,
`runtime/pokenav/`), rebuilt on the hack's encounter engine (`docs/paperwhite2/encounters.md`). The ROADMAP
(`docs/paperwhite2/ROADMAP.md:22`) already places it in phase 3 as "a key item, Y-registrable".

**Verified** means read in the code or data cited. **Inferred** means reasoned from it, not tested.

## 1. Pokenav today

### What it shows (verified, `runtime/pokenav/README.md`, `view.cpp`, `logic.h`)

- **Opening:** a C-Gear button (caption NAV) from C-Gear Quick Actions 0.5.0. It is read-only and for the current area
  only.
- **Bottom screen:** two panels on a scrolling grid, with angled charcoal plates:
  - **Water** (top panel): four folder tabs, Surf, Surf Special, Rod and Rod Special, over one row of up to 5 icons.
  - **Land** (bottom panel): three tabs, Grass, Grass Doubles and Grass Special, over two rows of 6 icons.
  - **Controls:**
    - D-pad and touch select an icon or a tab.
    - Left/Right on a tab, or L/R anywhere, change the method. Empty methods are skipped, and it stops at the ends.
    - Each method remembers its selected icon.
    - Above the panels: the area's name. Below them: the native red X and blue return icons. B, X or return exits.
  - **Icons:**
    - Duplicate slots become one icon, in first-slot order.
    - "No encounters" fills an empty section.
    - With the Nuzlocke companion, caught families are grey and their share is 0%.
- **Top screen:** the Learnset viewer's species panel, with the share in place of the party index:
  - name, base stats with bars, and the evolution family as icons;
  - abilities, with the hidden one in purple;
  - the evolution requirement text, which A pages through.
- **Shares:** the original slot weights, 20/20/10/10/10/10/5/5/4/4/1/1 for land, 60/30/5/4/1 for Surf and 40/40/15/4/1
  for rods (`logic.h:57`), summed per species and form.
- **Not included:** static encounters, Hidden Grottoes, searching, browsing other seasons, other areas
  (`VALIDATION.md:138`).

### Where its data comes from (verified, `cgear-quick-actions/bw2/requests.inc:88-129`)

- When NAV is pressed, `navLaunch` copies the field's live seasonal `EncData` (232 bytes, valid when `data[7] & 0x80`)
  into a 256-byte `pokenav::Launch` request, with the zone and place name.
- It hands the request to the native field-menu application (`CG_CREATE_MENU_APPLICATION`, `map.call = 0`).
- Its screen runs inside the shared Learnset viewer, which lives in the native move tutor's application: a "Pokenav
  mode" with a private PK5 shell for the icons (`README.md:17`). That the party/tutor app sees the request's magic and
  switches mode is **inferred** from `view.cpp:114-118` and the Learnset README.
- `logic.h:decode` turns the 7 tables into per-method entries.

### What can be reused

| Part | Reuse? | Why |
| --- | --- | --- |
| **Layout and interaction:** the two panels, method tabs, L/R skipping empty methods, remembered selection, A paging, the exits | **Yes, as the design** | Pokenav's seven methods are exactly `ENCTYPE_*` in order (`tools/paperwhite2/encounters.py:64`), so each tab maps to one method of the new engine |
| **Navigation state machine** (`logic.h` `State`) | **Port to C, with changes** | Small and pure. Its fixed 12/5 icons per method must become a scrolling grid: one method has up to 36 candidates today, Route 7 grass, and 64 is the limit (`encounters.py check`) |
| **The top species panel** (`info_style.h`) | **As a design** | Its renderer belongs to the Learnset viewer, which the hack doesn't have. The Pokédex's planned stats and learnset pages (ROADMAP:22) could share one species panel with the Dexnav |
| **The decode of `EncData`** | **Yes, as a fallback** | A zone whose area has no file keeps the original table and slot code (`encounters.md`, "The build"). The Dexnav shows that table the way Pokenav does |
| **Bitmap renderer** (`style.cpp`: polygons, 8-bit surfaces, glyph cache; a 157 KB session, 777 of 1024 BG tiles) | **No** | It works around the tutor app it borrows. A decomp app draws tiles from graphics files (as the Season app does) and shows icons as OBJs through the game's icon loading (as the box does) |
| **Text cache** (`text.h`) | **No** | `GFL_MsgSysLoadData` with the hack's own text bank |
| **Assets** (`assets.py`) | **The art, from the archive** | It extracts the footer, selector pulse and controls from `a/0/8/2` members 19-21 and 27-28, and asserts fixed ARM9 addresses. In the decomp they are read from that archive by ID, or copied into `res/` |
| **C-Gear button** | **Later** | Quick Actions isn't in the hack. A Dexnav button would come with the planned C-Gear overhaul (ROADMAP:22) |

Everything else is tied to PMC and fixed addresses and doesn't port:
- `native<>(0x2021061, 0x2021035)`-style calls and `at<>(work, 0x4c)` offsets into the tutor's work struct;
- the tutor-window shrinking;
- `pokenav/ui.narc`, the Launch ABI, the PK5 shell and the CG_* address table (`native_addresses.h`).

As with the follower port (`docs/paperwhite2/following-pokemon.md`), the behaviour is ported and the mechanism is not.

## 2. What changes for the new engine

### What the engine does (verified, `src/paperwhite2/main/paperwhite2_encounters.c`)

`BuildSlots` (155-262) turns an area's candidates into the slots of one method:
- It fills a `ConditionContext` with `ConditionContext_FillGame` (world, lead, party: 174-175).
- Each candidate is tested on its method, season, period, weather and the level gate (`IsCandidateNow`, 124-140), then
  on its extra rule (201).
- **Rustling spots** draw on their own habitats first, then on the area's Rare, Very rare and Exotic Pokémon of grass
  and dark grass (the pooled pass, 184-212).
- **Tiers:** each tier present takes its share, split evenly among its members (213-224).
- **Shaking grass:** Audino takes the fixed share, or every encounter where no other Pokémon can appear (228-239).
- **Outbreaks:** the day's outbreak takes its share and the rest is scaled down (241-260).
- **Dust clouds and shadows:** the item share is decided apart, in `SpotGivesItem` (349-359).

**Two problems for a viewer:**
- **It changes encounter state.**
  - It writes the globals `sSlotCandidate` (208) and `sWeights` (222), which `SetupParam` and `RollPartner` read
    later.
  - It advances the game's RNG: `GFL_RandomLC(0)` (177).
  - Chance clauses are rolled (201), so one call can't show a "sometimes" candidate.
- **The level gate only drops a Pokémon.** A candidate below the gate is simply left out (139). Nothing reports "not
  yet" or "not now" or why.

**An aside for the encounter work (verified, not a Dexnav issue):** `BuildSlots` fills only `FillGame` (175), and
`Conditions_MatchClause` fails any clause whose part isn't filled (`paperwhite2_conditions.c`, 330-334). So an
encounter rule that tests the terrain or indoors/outdoors never matches. Yet `conditions.md` (around 436) says
encounters take the player's tile. The Dexnav would inherit the same gap.

### The runtime API

**Recommendation:** split `BuildSlots` into a pure core and its two callers, and keep the core in main. Main is the
only place that both the field's overlays and an app overlay can call (`conditions.md:222`). The area's block also
stays resident in main's BSS (`sBlock`, 32) while an app runs.

```c
// include/paperwhite2/encounters.h (proposed)

// What one built slot came from, for a viewer
enum {
    ENCOUNTERS_FROM_CANDIDATE,
    ENCOUNTERS_FROM_POOL,     // rustling spots drawing on the area's grass Pokémon
    ENCOUNTERS_FROM_SPOTS,    // shaking grass's own species (Audino)
    ENCOUNTERS_FROM_OUTBREAK,
};

typedef struct {
    WildEncSlot slots[ENCOUNTERS_SLOTS];
    u32 weights[ENCOUNTERS_SLOTS];
    u8 candidate[ENCOUNTERS_SLOTS];   // index into the block, or SLOT_SPECIAL
    u8 from[ENCOUNTERS_SLOTS];
    u8 count;
    u8 pool;
    u8 chancy;   // bit per slot whose rule has a chance clause (viewer mode only)
} EncountersBuild;

// The core: no globals written, no game RNG. rng NULL = viewer mode, where a chance clause holds and marks the slot
// in chancy. PrepareSlots and SpotGivesItem call it with the real context and a rolled rng, then copy into the
// statics as today
u8 PaperWhite2_Encounters_Build(const ConditionContext *ctx, u32 encType, u32 spots, u32 *rng, EncountersBuild *out);

// Read-only access for the app: the header, the current area's block (NULL when the zone isn't on the new data),
// its area number, and the outbreaks
const EncountersHeader *PaperWhite2_Encounters_GetHeader(void);
const EncountersArea *PaperWhite2_Encounters_GetCurrentArea(void);
u16 PaperWhite2_Encounters_GetCurrentAreaId(void);
s32 PaperWhite2_Encounters_GetOutbreak(GameData *gameData, const ConditionContext *ctx); // today's id, -1 for none
```

The core needs two small changes:
- **Viewer mode** for `Conditions_MatchRule`. Either NULL `rng` means "chance clauses hold", or the Dexnav scans the
  rule's clauses itself with `Conditions_GetClauses`, which is public.
- **A block parameter.** It reads the current block today, so a block pointer (current or another area's) is what
  lets the "another area" features work.

In the **Dexnav's overlay**, not main, so main pays only for the core and the getters:
- **"What can appear now" by method:** call `Build` with a context the field filled before the app opened, including
  the field part (`conditions.md:438-441`). Then merge by species and form, and turn weights into a share in tenths of
  a percent (the weight divided by the sum of all weights, the outbreak's included). The result per method:
  - each Pokémon: species, form, level range, share, tier, hidden ability chance, and where it came from;
  - the area's step rate for the season. A rate of 0 means the method isn't used here, and the tab is greyed;
  - for dust clouds and shadows, an "Item" row with `spotShares[spots]` (always 100% with no Pokémon);
  - for shaking grass, Audino at its fixed share.
- **"Not now":** loop over the block's candidates for the method and report the first test that fails: season,
  period, weather, level gate or rule. That gives "night only", "rain only", "spring only", "appears at higher
  levels" and "special conditions".
- **"What if":** the same core with a changed context (another season, period or weather, the gate's level). This
  needs no extra main code.
- **Another area** (from the Pokédex or the town map, later): read that area's block from `a/1/2/7`'s last member into
  the app's heap with the archive tools, as `PaperWhite2_Encounters_Load` does (60-92), and give it to the core.

**Cost (inferred):**
- **Main:** the refactor is about neutral in code. The getters and viewer mode add perhaps 100-300 bytes.
- **App:** about 7 × 66 slots of about 12 bytes, so about 6 KB for all methods, in its own heap.

**Coordination:** another session is editing `paperwhite2_encounters.c` now (its `RollPartner` changed during this
research). Do the refactor after the triples work lands, as its own commit. Check it with the packer's `odds`
(`encounters.py:321`) and the editor's `resolve.ts`, which must give the same shares.

## 3. Dexnav features beyond a browser

| Feature | On this engine and hardware | Cost | Needs |
| --- | --- | --- | --- |
| **Seen/caught marks** (a Poké Ball for caught, plain for seen) | Easy: `PokeDex_IsSeen` and `PokeDex_IsCaught` are in main (`include/save/pokedex_savedata.h:72-73`) | Low | Nothing saved |
| **"???" for unseen species** | Easy: a silhouette or "?" icon, with the top panel limited to share and level | Low | A choice of how much to reveal |
| **Conditions shown** (moon or sun, rain, season, level lock, outbreak badge) | From the "not now" reasons above | Low to medium | Icons in a graphics file, and text |
| **Hidden ability hint** (chance and name) | The candidate has its own `hiddenAbility` (`encounters.h:129`). The name comes from personal data | Low | Nothing |
| **"What if" browsing** (season, time, weather pickers) | The same core | Medium (UI) | Nothing |
| **Search for one Pokémon:** pick a seen species that can appear now, and the next encounters favour it | A static target in main that `PrepareSlots` gives a boosted share, like an outbreak. The hooks exist | Low to medium | Session RAM only. Rule: only Pokémon the area can give now |
| **Search as a hidden spot:** the target hides in a rustling spot near the player, and stepping in starts its battle | The phenomenon placer is in `effect_encount.c` (`positionShakingSpot`, 474), and Pokeweb's RADAR button already calls the native generator on demand. The spot's battle is given the target | Medium | Hooks in `effect_encount.c` (overlay 36, which costs the DS budget) |
| **Sneaking:** running, biking or straying too far scares the target off | A step check that cancels the spot (`EncountSystem_CancelPhenomenon`, 232) | Low after the above | Nothing |
| **Chain** (consecutive searched encounters raise the bonuses) | Session RAM, a few bytes in main, reset on fleeing, a zone change or another species | Low | Rules for bonuses |
| **Search bonuses** (more hidden abilities, a guaranteed IV, an egg move, more shiny rolls) | Hidden ability: `SetupParam` (302-312). Shiny: `paperwhite2_shiny_pid.c`. IVs and moves: after the Pokémon is made | Medium | Egg move data in the game (which archive is unverified) |
| **Search level** per species (ORAS's 0-999) | Needs a saved count per species. About 650 species × 1 byte is more than the 228-byte "Paper White 2 block", so it needs `SAVE_EXTRA_ID_20` (about 1 KB, not resident: `conditions.md:509-533`) | Medium to high | A save format decision |
| **A visible Pokémon in the grass** (ORAS's tail poking out, or a walking overworld Pokémon) | Runtime actors with the follower's or walking Pokémon's sprites. The same machinery as the planned spawn system (`npc-research.md` §5 D and §8): 64 actors, 32 sprite codes | High | The spawn system first. The rustling spot is the cheap stand-in |
| **Dexnav on the touch screen while walking** (ORAS style) | A field subscreen mode beside the C-Gear (`src/ov036/field_subscreen.c`). All of it is overlay 36 code, which has 0 bytes of room (`build/w2_us/memory.txt`: 139 KB left in the DS arena). It also competes with the C-Gear for the sub screen | High | A later option, after the C-Gear overhaul |

**Already in the game:** the Pokédex's **Habitat List** (overlay 303, `include/app/pokedex_habitat.h`) shows each
area's grass, water and fishing Pokémon, with seen and caught stamps. Its data, `res/pokedex/habitats/` (`a/2/9/6`),
and the Pokédex's area map (`ARCID_POKEDEX_AREA`, 176, not extracted) come from the original tables. They are now
**out of date** with the new encounters. Generating `res/pokedex/habitats/` from `res/paperwhite2/encounters/` is a
data-only fix the ROADMAP already wants ("Reworked with it: the habitat Pokédex"). It is worth doing whatever the
Dexnav becomes.

## 4. Where it lives

**Entry point.** The recommendation is a **key item "Dexnav", registrable to Y**, as the ROADMAP says. The precedent is
the Exp. Share:
- registrable through `SHORTCUT_EXP_SHARE` (`src/ov012/event_shortcut_menu.c:462`);
- a field common event (`src/paperwhite2/ov012/paperwhite2_exp_share_event.c`).

Its event:
1. fills the context with the field part (`ConditionContext_FillField`, overlay 36);
2. starts the app with `EventFieldSubprocessTransition_Create(gsys, field, OVERLAY, &DEXNAV_PROC_FUNCTIONS, param)`, as
   the Season app does (`src/ov036/scrcmd_proc_fld.c:175`).

A C-Gear button can call the same event once the C-Gear overhaul exists. A Pokédex page ("Dexnav of this area" from
the Habitat List) is the third way in.

**The overlay.** A new overlay isn't practical (`plugins.md:110`), so the app shares an existing app overlay:

| Option | For | Against |
| --- | --- | --- |
| **A. Overlay 303, beside the Habitat List (recommended)** | The same subject. Its graphics and text bank (`TEXT_BANK_POKEDEX_HABITAT`) are at hand. The Habitat List can later read the same engine API. It is loaded alone by `QueueGameProc` (`src/ov302/pokedex.c:462`) | The Pokédex's common code (overlay 302) may be needed for shared art. Unverified |
| B. The overlay of an app the hack drops (as Geonet's 312 became the Season app) | Clean separation | It needs an app the user agrees to give up |
| C. Overlay 36, a field subscreen | The ORAS feel | It costs the DS budget byte for byte, and fights the C-Gear |

**Memory.**
- The app runs with the field torn down. Overlay 303's address (0x0219fc00, `config/w2_us/arm9/overlays/ov303/`)
  overlaps overlay 36 (0x02184400-0x021fea20, `memory.txt`), so the two are never loaded together. Its code therefore
  costs the 139 KB DS arena only if it pushes its overlay group past the highest end (0x02211580). That is unlikely
  for an app of this size (inferred).
- Main pays only for the API (§2), plus a few bytes of search and chain state from phase 3.
- The session's data goes on the app's heap. Aim under about 64 KB:
  - tiled BGs and OBJ icons, as the box and Habitat List use, not Pokenav's two 48 KB 8-bit surfaces;
  - icons loaded per visible page (about 12-18), not all 56 at once.

**DSi mode.**
- On a DSi the overlays have about 5 MB (`memory.txt`), so DS mode is what limits size.
- Nothing here uses DSi-only hardware.
- As with every code change, run `tools/build/verify_dsi_rom.py build/paperwhite2.nds`. Test in both modes (flashcart
  DS mode, and TWiLight or Unlaunch DSi mode), especially the opening and closing transition and the touch screen.

## 5. Phased plan

1. **Engine API, with no UI (small).**
   - The `Build` refactor, the getters and viewer mode (§2), after the triples work.
   - A START debug menu page, "Encounters here", which lists each method's shares, "not now" reasons and the outbreak
     from the API.
   - This proves the numbers against `encounters.py odds` before any screen exists.
   - Also, separately: the terrain-context gap, and generating the habitat lists from the new data.
2. **Dexnav browser (the smallest useful version).**
   - The key item and Y, and the app in the chosen overlay.
   - Pokenav's layout and controls, with a scrolling grid per method.
   - Each icon shows its share and level range. The fixed Audino or Item rows, the outbreak badge and seen/caught
     marks are shown, with "???" for unseen species.
   - The top panel: name, types, level range, share, hidden ability chance and name, and its times, seasons and
     weather.
   - The "not now" list, per the user's choice below. The original-table fallback for zones not on the new data.
3. **"What if" and the Pokédex.** Season, time and weather pickers. The same view from the Habitat List for any area,
   reading another area's block.
4. **Search.** Pick a target and get boosted odds, or its rustling spot, with sneaking, a chain and bonuses (hidden
   ability, IVs, egg move, shiny). RAM only.
5. **Later.** Search level (an extra save block), visible Pokémon through the spawn system, and the walking subscreen
   after the C-Gear overhaul.

## 6. Open questions for the user

1. **Which tweaks beyond Pokeweb's Pokenav do you want?** You mentioned "a few"; the candidates are §3's features.
   Which belong in the first version?
2. **Conditional species:** how should a night-only Pokémon look during the day?
   - (a) hidden;
   - (b) a greyed icon with a reason (moon, rain, season), 0% and "not now";
   - (c) a separate "Other times" row.
   The proposal is (b) in the same grid, after the Pokémon that can appear.
3. **Level-locked species** ("appears at higher levels"): show them as "???" with a lock, or hide them until the party
   reaches the gate?
4. **How much to show for an unseen species:** only "???" and a silhouette, or also its share and levels? And should
   caught species be marked (a Poké Ball) or greyed, as the Nuzlocke companion did?
5. **Entry point:** a key item and Y only for now, with the C-Gear button after the C-Gear overhaul? Who gives the
   item, and when?
6. **Overlay:** A (beside the Habitat List), or B (an app you're willing to drop)?
7. **Shares as percentages, or as tiers** (Common, Rare, …), as the editor's tiers are named? Should outbreaks and
   Audino show their exact share?
8. **Search:** a boosted share (simple), or the hidden rustling spot with sneaking (closer to ORAS)? Which bonuses?
   Should shiny odds be affected, given the 1/1024 rate and the Shiny Candy?
9. **Search level:** worth a saved block, or does a chain in RAM only do?
10. **"What if" browsing:** should it be allowed to show species for other seasons and times (a spoiler), or only the
    present?
11. **The Habitat List and area map:** regenerate them from the new encounter data now, as a data change, whatever
    the Dexnav ends up being?
