# Paper White 2 status

Kept by both Claude sessions (see CLAUDE.md). Newest first.

## 2026-11-27: Harsh sun and the dry thunderstorm (ROM session)

- **Built** (design/harsh-sun.md section 13, plugins.md "Harsh sun and the dry thunderstorm"): `WEATHER_HARSH_SUN`
  (27) and `WEATHER_DRY_THUNDERSTORM` (28). Harsh sun by day: warm bright light, a 1-pixel heat shimmer on the screen's
  top 64 lines only, the vanilla lens flare pulsing; evening: orange light and the evening flare; night: a warm night
  and rising embers (the weather's OBJs, under the banner and messages). Sun in battle; Sunny Day and Drought now leave
  harsh sun (battle weather); clear for encounters. The dry thunderstorm: the storm's dark light, flashes and thunder
  without rain; no battle weather; a thunderstorm for encounters. Entei and Moltres bring harsh sun, Raikou and Zapdos
  the dry thunderstorm. Calendar, Weather Editor, Entree run weather, debug menu, gates' board, Sweet Scent wired.
- **Try it:** START > World... > Weather > Harsh sun / Dry thunderstorm (the list's end); World... > Time changes the
  period's look.
- **Cost:** DS arena 0x46c0 → 0x4060 (16.1 KB); see design/memory.md.
- **Tested** in py-desmume on a save copy (`Pokemon Paper White\harsh_sun\built_*`): day, evening, night, banner and
  message box over both, battle start in sun, Sunny Day leaving harsh sun, the roamers' routes, the dry storm's flash.
  Editor tests: the round-trip check's two failures on `roamers.json` and `routes.json` were there before (the roamers'
  commit's hand-compact layout).
- **Next:** the user's look check; the shimmer on the 3DS and melonDS (per-line BG0 scroll, one backdrop column at the
  screen's edge).

## 2026-11-25: Roaming legendaries, phase 1 (ROM session)

- **Built** (design/roaming-legendaries.md sections 9-10, plugins.md "Roaming legendaries"): Articuno, Zapdos,
  Moltres, Raikou, Entei, Suicune, Tornadus and Thundurus, level 70, roam Routes 1-23 (22 routes: Route 10 has no town
  map place), one to a route, never the player's. Data in `res/paperwhite2/roamers/` (`roamers.json`, `routes.json`,
  schemas), packed by `tools/paperwhite2/roamers.py`; tests `tools/paperwhite2/test_roamers.py`.
- **Save:** the World Trade block (the GTS shell leaves it unused), 0xd0 of 0xf8 bytes.
- **Release:** script command `Roamers action, arg1, arg2, result` (0x2f9; **`Debug` is now 0x2fa**), for one roamer, a
  group or all; for now only the debug menu calls it: **START > Encounters... > Roamers... > Release all.** The same menu
  has Roamers now (routes and states), Bring one here, Heal one, Respawn the knocked out, Freeze movement, Run out
  their clocks, Reset all.
- **Behaviour:** each roamer moves to a neighbouring route every 15 minutes of real time, the clock paused on the
  player's route; time with the game off counts on load, at most 4 moves. 50% of a step's encounters on its route by
  its methods (walk; surf too for the birds and Suicune). It tries to flee every turn by the player's speed rule
  (trapping holds it), keeps its HP and status, scatters 2 links after a battle it leaves, and comes back the day after
  a knock-out at full HP with a new PID (shiny rolled again). Its route has its weather (gusty rain, thunderstorm, snow,
  hail); **Entei and Moltres have none until harsh sun exists** (a later phase; built 2026-11-27, above).
- **Cost:** overlay 12 +3.4 KB, overlay 36 +0.5 KB: the DS arena 0x55e0 → 0x46c0 (17.7 KB).
- **Tested** in py-desmume on a save copy, screenshots in `Pokemon Paper White\roamers\` (release, list, gusty rain and
  thunderstorm, Tornadus' battle and flight, "can't escape", knock-out and next-day return, the clock's pause and cap,
  Bring one here). Details in the design doc's section 10.
- **Next:** the user's playtest (odds, the 15 minutes, the bouncing between two routes noted in section 10); then
  phase 2 (the DexNav's Roamers page), harsh sun, the gates' board, the editor's page and the story's releases.

## 2026-11-23: Icon tone (ROM session)

- **Measured** (shiny-icons.md section 17, OKLCh):
  - The vanilla banks' muting is lightness. No body colour is darker than the light outline grey (battle palettes:
    18% of pixels are). Each icon's lightness spread is about 0.7x the battle palettes'.
  - Chroma is not lower in the banks, but it is capped at 0.22; the battle palettes reach 0.27.
- **The tone** (`tools/paperwhite2/icon_tone.py`, parameters in `res/paperwhite2/icon_tone.json`):
  - per icon and per palette, hue kept;
  - the darks are pulled toward the icon's lightest colour until its spread nears vanilla's (0.12, never under half
    its own);
  - chroma above 0.18 is halved;
  - `strength` 0..1, default 0.5. Normal and shiny stay apart: median distance 0.099 becomes 0.097.
- **Off in the build:** `"enabled": false`, so the hack ROM is byte-identical. To turn it on, set `"enabled": true`
  and rebuild; with it enabled the ROM was verified intact.
- **The editor:** the Sprite Editor's icon view has a **Game tone** toggle, on by default. It shows the in-game colours
  through `tone.ts`, which a test keeps equal to the Python.
- **Previews:** `C:\Modding\Pokemon ROM Hack Workspace\Pokemon Paper White\icon_tone\`.
- **Next:** the user looks at the previews and picks a strength, then enables it.

## 2026-11-23: Sprite Editor: review marks, Replace, stepping (ROM session)

- **The hand fixes are done**, so the hand-fix list (`icon_fix_list.json`, its tab and Done) is gone. In its place,
  **review marks** in `res/paperwhite2/sprite_review.json`, kept apart for icons and for walking/follower sheets
  (shiny-icons.md section 15.3): **hand-edited**, seeded with the 78 icons whose files differ from what
  `icon_remap.py apply` generates (regenerated in a worktree) and set by every save that changes a sprite; and
  **checked**, a Mark checked / Checked ✓ toggle (C) for the user's pass, with each kind's progress.
- **Navigation:** Show filters (All, Not checked, Checked, Hand-edited, Generated only, with counts) by the marks of
  the kind shown; ◀ ▶ (`[` `]`) beside the picker step through them, keeping the kind and frame; the picker's entries
  and the header show the marks.
- **Tools:** new hotkeys pencil S, fill Z, eyedropper Q; a **Replace** tool (R): every pixel of the clicked index in
  the frame or all frames, with a hover preview, the pencil's slot and transparency rules, one undo step.
- `icon_remap.py apply` keeps hand-edited icons unless `--force` (as before), marks those it keeps, unmarks those it
  overwrites. Tested on fixtures (Python and the editor's tests).

## 2026-11-23: Icons on their battle palettes, phase 6: the sweep (ROM session)

- **The Battle Recorder's video screen** (My Video's battle info, up to 12 icons) is converted after all: 8bpp icons
  on the main engine's OBJ extended palette 0 in VRAM bank G, mapped only while the icons show; species-only
  (icon-screens.md section 9.1).
- **The Dream Radar is a shell:** it only receives what the 3DS app wrote to a retail card, and only Unova Link's top
  menu (gone from the title menu) opens it; its menu item goes straight back (wireless-shells.md).
- **The sweep** (section 9.3): every call of the icon archive and its loaders that a hack build compiles is listed
  with its screen. Every reachable screen draws its icons on their own colours; the banks' path is left only in
  unreachable screens and shells (and the egg, by design). One more fix: an opened Wonder Card's icon drew the battle
  file on the banks' colours (`ov197/mystery_album.c`). Found: the battle video select is reachable only after link
  battles (the Subway saves with a plain Yes/No), so it can't be reached in the hack. The fallback stays in the build
  until the user has checked on the 3DS.
- **icon-screens.md section 6 is now the 3DS test checklist**: one row per screen, easiest first, with how to reach
  it, its status, the emulator result and an empty "3DS result" column for the user.
- **Cost:** overlay 268 +0.4 KB and 392 bytes of BSS, overlay 197 a few dozen bytes, overlay 332 −32 bytes; none in
  the arena's chain (DS arena 0x55e0, unchanged); main OBJ VRAM +1 KB per video icon and bank G while they show.
- **Tested** in py-desmume on a copy of the save: a Battle Subway battle recorded and saved as a video in the
  emulator (the copy is the worktree's `build/save_video.sav`), its six icons exact in My Video, after the profile and
  after playback, registers back on leaving; the final pass over every reachable converted screen after all phases
  (section 9.5: party list, save report, Xtransceiver pick, box, battle party list and command icons, name input,
  normal and shiny; Pokédex list, Evo, Area, Habitat list, DexNav), all exact; boot, title, field, save, C-Gear, PC.
  Screenshots `*_final.png` in `icon_screens/`.
- **Next:** the user's 3DS pass with the checklist; then the banks and the fallback redraw can go.

## 2026-11-23: Icons on their battle palettes, phase 5: the last screens and the wireless shells (ROM session)

- **Converted** (icon-screens.md section 8):
  - **the DexNav**: the grid's 18 icons 8bpp on a BG of their own with the sub engine's BG extended palettes (bank H),
    the top icon on its own colours in a row; species-only;
  - **the Xtransceiver's party pick** (Bianca's friendship check, Cheren's and the Professor's questions): rows,
    shiny-aware;
  - **the PWT's team choice** (party or Battle Box): rows, shiny-aware; not emulator-tested (needs a filled Battle Box).
- **Left on the fallback:** the Battle Recorder's video screen (local, but 12 icons with no free rows in the Battle
  Recorder's shared palette, and no saved video to test with); the Dream Radar (Unova Link is off the title menu).
- **Wireless-only screens emptied as shells** (docs/paperwhite2/design/wireless-shells.md, with the proof for each):
  the linked trades' box and offer, the Wi-Fi Club, the IR ranking, Game Sync, the GTS, the link multi battle's list,
  the Battle Recorder's online rankings and the Battle Competition, whose title menu item is gone. Each process ends at
  once and draws nothing; the in-game and Wonder Trades are untouched.
- **Cost:** overlay 36 +0x20; the shells free 5 KB of the DS arena (overlay 290 was the highest): 0x4260 → 0x55e0.
- **Tested** in py-desmume on a copy of the save: the DexNav (Route 6 and 7, a full grid forced in RAM, forms, all
  exact; leaving), the Xtransceiver's pick (exact, normal and shiny), the title menu, boot to the field, the save
  report, the party, the C-Gear and a Center's PC box. Screenshots `11_*`, `29_*` in `icon_screens/`.
- **Next:** phase 6, the sweep.

## 2026-11-23: Icons on their battle palettes, phase 4: the row screens (ROM session)

- **Converted** (icon-screens.md section 5), each icon on its own colours in a standard OBJ row of its own:
  - shiny-aware: the save report, the battle party list, the battle command screen's icons (double, triple, rotation;
    the battle now passes each icon's shininess, an Illusion's as shown), the name input when it names a Pokémon;
  - the Mystery Gift album: shiny when the gift always is;
  - normal colours, since their data keeps only species: the battle video select (it shows up to 12, not 2), the
    Battle Recorder profile, the Trial House award, and Pokéstar Studios' scenario screen, script book and record
    monitor.
- **Found:** the Mailbox draws no Pokémon icon (item icons only). **Moved to phase 5, wireless-only:** the party
  list's partner parties (Union Room and Battle Competition only) and the link multi battle's list.
- **Cost:** no ARM9 main code; overlays 168 and 169 +0x20 each, in the battle's chain, so the DS arena goes
  0x42a0 → 0x4260 (16.6 KB); no heap or VRAM change.
- **Tested** in py-desmume on a copy of the save (party slots 0, 2, 4 shiny in RAM): the save report (6 icons exact,
  normal and shiny; the field menu's rows as before after cancelling), the battle party list (exact, normal and shiny;
  back to the battle with registers as before), a triple battle's command screen (rows), the name input after a catch
  (Hoothoot exact, a shiny winter Deerling exact). Screenshots `13_*`, `14_*`, `16_*`, `17_*` in `icon_screens/`.
- **Not emulator-tested** (need a saved battle video, a Trial House challenge, a Wonder Card or Pokéstar Studios):
  the other seven; icon-screens.md's table says how to reach each for a 3DS test.

## 2026-11-23: Icons on their battle palettes, phase 3: the Pokédex (ROM session)

- **Converted, species-only (normal colours, forms and sex as shown):** icon-screens.md section 4.
  - **The list** (ov299): the touch screen's icons are 8bpp on main OBJ extended palette 0 in bank G (a band per icon
    actor); the top screen's take standard rows, each shown icon its own (0-15 but 14), given as icons load.
  - **The Info page** (ov298): Evo's strip on rows 5-7, 14, 15, and for Eevee's 8 the type icons' rows 0-2, borrowed
    while Evo shows and given back in the VBlank as it hides; Area's box icon on its own colours in row 12. Flavour
    unchanged (no Pokémon icon). The 32/32 ClAct slots aren't touched.
  - **The Habitat list** (ov303): the hack's grid shows 30 icons (the survey said 1), so they're 8bpp on main OBJ
    extended palettes 0-1 in bank G.
  - The Forms page and the original habitat map are never started in the hack: not converted (fallback).
- **New, shared:** `include/paperwhite2/icon_ext.h` (cells to 8bpp, 4bpp→8bpp in a band, the VBlank upload), now
  used by the box too. Screens with a `PaletteFade` keep the icons' colours in the fade's main OBJ extended buffer, so
  they fade with the rest. Icon actors' palette proxies point at row 0 where the row or extended palette isn't the
  resource's.
- **Cost:** ARM9 +0xe0 (DS arena 0x4380 → 0x42a0); ov299 +0.6 KB, ov303 +0.5 KB (no arena cost); the lists' heaps
  +3.1 / +2 KB; main OBJ VRAM +16 KB (list, 71 KB left) and +30 KB (habitat grid, 35 KB left).
- **Tested** in py-desmume on a copy of the save, the Pokédex filled with the debug menu (RAM only):
  - the list on five pages and a scroll-bar jump (bottom icons pixel-exact, top by palette rows), with forms and a
    palette-only Arceus form forced through the load;
  - Evo for Tepig's family (exact), Eevee's 8, then Matchups (rows 0-2 back byte for byte); an unseen evolution's "?";
    Area's box; Flavour; back to the list;
  - a full Habitat grid of 30 (exact), forced forms and a female icon, page 2, the next area;
  - leaving either list to the field: VRAMCNT and DISPCNT as before; the box retested after its refactor (exact).

  Screenshots are `03_*`, `05_*`, `06_*`, `10_*` and `02_pc_box_mixed_after_phase3` in `icon_screens/`.
- **Next:** phase 4, the easy screens and those whose rows need checking.

## 2026-11-23: Icons on their battle palettes, phase 2: the PC box (ROM session)

- **The box's icons are 8bpp on OBJ extended palettes** (`src/paperwhite2/ov255/paperwhite2_box_icons.c`,
  `include/paperwhite2/box_icons.h`, hooks in `box2_obj.c`/`box2_main.c`; icon-screens.md section 3):
  - bank G is the main OBJ extended palette while the box is open; each of the 66 icon actors has its own band
    (extended palettes 3-7), which travels with it when picked up, moved or scrolled;
  - extended palette 0 copies the standard one for the box list's tray icons (8bpp already), 8 the outline's row;
  - the palettes are kept in the box's work and copied to bank G in VBlank; icons made 8bpp when written, from the
    battle member; the cells set to 8bpp once loaded;
  - shiny-aware everywhere (tray, party side, held icon and range, every mode); eggs plain; a search greys the rest
    from their own colours in the original grey row's range.
- **API:** `PaperWhite2_ReadIconColoursOfPkm` added (ARM9 +36 bytes, DS arena 0x43c0 → 0x4380). Phase 1's
  `LoadIconExtPalette` is proven by a test build (`02_pc_box_ext_api_proof`), but the box doesn't use it: it writes
  bank G at once, mid-frame.
- **Cost:** ov255 +0.6 KB (no arena cost), the box's heap +6.6 KB, OBJ VRAM +18 KB (34 KB left), bank G 8 KB.
- **Tested** in py-desmume on a copy of the save, box 1 filled in RAM with 30 different icons (forms, female icons, an
  egg), all normal, all shiny and mixed, plus a shiny party (RAM only). 17 icons compared pixel for pixel with
  `icon_battle.png` on their palettes: exact. Also tested:
  - the party side, grabbing and dropping, a picked-up range, scrolling boxes and back, a gender search, the summary
    and back, leaving and reopening;
  - after leaving, VRAMCNT and DISPCNT are exactly as before the box.

  Screenshots are `02_pc_box_*` in `icon_screens/`.
- Tests: hack build (no warnings), DSi check (intact), `test_poke_icons.py`, editor tsc and npm test, plain build's
  modules.
- **Next:** phase 3, the Pokédex (its list's bottom screen by the same route; `box_icons.c` is the model).

## 2026-11-23: Icons on their battle palettes, phase 1: the foundation and the party list (ROM session)

- **Build:** `tools/paperwhite2/poke_icons.py` (configure.py's `HACK_ARCHIVE_MEMBERS`, `a/0/0/7`) reads
  `icon_battle.png`/`.json` and the battle palettes at build time. It writes:
  - each icon's own file redrawn in its shared bank, as the fallback for screens not yet converted;
  - a member of 64-byte entries, the normal and the shiny colours of each icon;
  - one member per entry with the icon's pixels on its slots, Arceus' palette-only forms included.

  Eggs keep their art and bank colours, never shiny. ROM +0.95 MB.
- **API** (`include/paperwhite2/icon_palettes.h`, ARM9 main, +576 bytes, DS arena 0x4600 → 0x43c0):
  - `PaperWhite2_GetIconBattleFile[OfPkm]` gives the member to load in place of the icon's file;
  - `PaperWhite2_LoadIconPalette[OfPkm]` loads the colours into an OBJ row (main or sub);
  - `PaperWhite2_LoadIconExtPalette[OfPkm]` loads them into an extended-palette band (untested until the box).
- **Party list converted** (`plist_plate.c`): each plate's icon in a row of its own (6-8, 12-14), normal or shiny.
  - Tested in py-desmume on a copy of the save: the list normal, all six made shiny in RAM, and after a Switch.
  - The box (tray and party side) and the Pokédex's National list were spot-checked on the fallback: right in bank
    colours.
  - Screenshots are in `icon_screens/`, named `01_*`, `02_*` and `03_*`.
- **The editor's Icon review page is removed** (module, server routes, test). `icon_remap.py` and the choices file
  stay as the record.
- `docs/paperwhite2/design/icon-screens.md` lists all 35 icon screens with their routes and status (1 converted).
- **Next:** phase 2, the box, with 8bpp icons on extended palette G, the API's first ext-palette user.
- Tests: `test_poke_icons.py` (new), test_icon_remap and test_sprite_edit, editor tsc and npm test (282), the hack
  build, and the DSi check (intact).

## 2026-11-22: Icons applied to res/, and the Sprite Editor (ROM session)

- **Applied:** `icon_remap.py apply` wrote all 744 reviewed icons as `icon_battle.png` and `icon_battle.json` (female:
  `icon_female_battle.*`) next to the vanilla art. By method: IHM 539, J 103, G2 57, K 32, IH 7, H 6. In 65 icons a
  battle index sat in two slots and was merged, which changes no colour.
  - The game still builds from `icon.png` and the shared banks: the hack ROM is byte-identical to before, and the DSi
    check says intact.
  - The hand-fix checklist is now `res/paperwhite2/icon_fix_list.json` (78 icons).
- **Sprite Editor** (Editors): pixel editing of an icon on its battle palettes, or of a walking or follower sheet,
  beside the battle sprite. The other palette is shown above both sides, and clicking it swaps the page's palette.
  - Tools: pencil with a hover preview, fill, eyedropper, undo and redo, and editing a palette colour (with a warning).
  - An icon is limited to 13 slots, and only the transparent swatch can clear a coloured pixel.
  - The hand-fix list has Done (unflag). Saves go through `tools/paperwhite2/sprite_edit.py`.
- **Tested:** Python tests (`test_sprite_edit.py` and the new apply test in `test_icon_remap.py`), editor tsc, npm
  test and vite build, the hack build before and after (`cmp` identical), and screenshots against a scratch copy.
  Details: shiny-icons.md section 15.

## 2026-11-22: Flagged icons: patterns, method K and the Flagged review mode (ROM session)

- **Patterns** of the 131 icons flagged to fix by hand (among the 416 reviewed): missing battle colour family (27),
  grey where the art has a pale tint (22), wrong-twin swap involved (42), darker than vanilla (16), collapsed vanilla
  shades (24); 21 show none (pose or design differences). Hydrapple's battle art is Budew's placeholder (not flagged);
  Appletun's and Dipplin's art is still in progress. Shiny suspects, registration fit and IHM against J don't predict
  the flag.
- **Method K** (flagged icons only): the pick corrected for those classes, then the twin swap. It changes 94 of the
  131; by eye about 11 are clearly better, about 4 worse, the rest marginal.
- **Tool and page:** `icon_remap.py` also writes G2, H, IH and K for the flagged icons (G2 and H match the experiments
  pixel for pixel). The Icon review page shows a flagged icon's pick, G2, H, IH and K on keys 1-5, with 0 for the
  flag; the choices file takes those method ids for flagged icons.
- **Tested:** Python tests (fixture), editor typecheck and tests, the hack build. Details: shiny-icons.md section 14.

## 2026-11-22: Icon review page (ROM session)

- **Tool:** `tools/paperwhite2/icon_remap.py` (IHM and J of shiny-icons.md sections 7-12, ported from the
  experiments) writes `build/icon_review/`; it reproduces the experiments' IHM and J pixel for pixel on all 744 icons.
- **Editor:** Tools, **Icon review (temporary)**: per icon, keep IHM (1), J (2) or neither (3, fix by hand); choices in
  `res/paperwhite2/icon_remap_choices.json`. 416 icons need a choice; the rest keep IHM.
- **Tested:** Python tests (fixture), editor typecheck and tests. Details and next steps: shiny-icons.md section 13.

## 2026-11-22: Follower card: shiny previews and one row for both sexes (ROM session, on a branch)

- **Shiny preview:** the Pokémon Editor's Follower card shows each row's sheet normal and shiny (the row's battle
  palettes as the build gives them; an opt-out sheet says it has no shiny colours).
- **Sexes:** the 547 female follower rows that showed the male's sheet with the same settings removed with their codes
  (`tools/paperwhite2/follower_sexes.py`; `a/0/4/7` -36,100 bytes, no sheets freed); 15 species keep female art of
  their own. `FindFollowerRow` takes the other sex's row of the same form (-2, was -20). Editor: "Both sexes", **Add a
  female sprite…** (import with F) and **Remove the female sprite**.
- **Tested:** build, DSi check, plain modules, Python and editor tests; emulator: females without their own sheet show
  the male's code, Pikachu/Frillish females theirs, form females their form's; an added Snivy female showed its own.
  Details: following-pokemon.md, "One row for both sexes".

## 2026-11-22: Overworld sheets on the battle palettes (ROM session, on a branch)

- **Every overworld Pokémon sheet** (174 follower sheets, 644 walking sprites) re-indexed in place onto its battle
  palette with method F (`tools/paperwhite2/palette_remap.py`, ported from the experiment and checked identical); the
  build writes its colours from the battle `normal.pal`; a shiny follower or wanderer gets `shiny.pal` through the
  palette slots (`a/0/4/7` member 24), with the variation on top. NPCs and ambients show the normal colours.
- **Data:** the 1302 shiny follower codes removed (174 `_shiny` sheets; `a/0/4/8` -872 KB, `res/field/actors`
  4.06 to 2.72 MB); Arceus rows 9-16 point at the right sheets, form 17 coloured by its own palette; opt-outs:
  Castform, Cherrim, Hydrapple, the ??? Arceus sheet; Appletun and Flapple mapped onto Budew's sheet. Usage listing:
  `docs/paperwhite2/design/overworld-sheet-usage.md`. New art through the walking sprite import is re-indexed with F.
- **Tested:** build, DSi check, Python and editor tests; emulator: followers normal and shiny (Dipplin, Krokorok,
  Reshiram, Arceus forms, Genesect, Appletun), shiny wanderers, NPC and Pidove ambient sheets with the battle colours,
  Castform unchanged. Arena -288 bytes. Details and the sheets worth a look: follower-palette-remap.md section 9.

## 2026-11-22: Entralink tiers follow-up: the hall's run and the chart buffs under inverse (ROM session, on a branch)

- **Hall of Fame:** one entry, the best win at the highest tier won (a higher tier's win replaces it, one at its tier
  in fewer turns too, a lower tier's never), its tier shown. No save change; an existing entry stays, an old save's as
  Daydream's. Tested: the four replace/keep cases and the Entree's page (old entry "at Daydream", then "at Delusion").
- **Chart buffs under the inverse chart:** every matchup test reads the chart in force (Expert, Expert Edge, Tinted,
  Prism, Spectral unchanged). Magnetised: the float stays; "counts as Flying" dropped under inverse, the team's
  Electric moves (rank 2 all) never below x1 on a paralyzed foe; its cards say "(Nightmare: x1 min)". Tested:
  Thundershock on a paralyzed Jellicent x0.5 -> x1 with it, Mud-Slap still misses, Expert and Tinted by the chart in
  force. Prototype doc, "Difficulty tiers"; entralink-buffs.md 22. Overlay 167 +20 bytes; arena unchanged.

## 2026-11-21: Entralink difficulty tiers and their modifiers (ROM session, on a branch)

- **AI:** a run battle's wild foe already picks moves through the trainer AI's VM, but with no scripts (a wild single
  has no AI flags, a double or triple only tag strategy), and a trainer's flags on the setup are never read for a
  wild foe. `GetClientAIFlags` now adds the run's tier's flags in run battles only. Tested: a foe with Dream Eater,
  Tackle and Body Slam against an awake Pignite: Daydream 10/10/9, Reverie (Basic) 0/15/14, Nightmare (+ Expert)
  0/1/14; with Tackle, Body Slam and a super-effective Confusion: Reverie 1/7/4, Delusion (+ Eval attack) Confusion
  3 of 3 (small samples: the emulator's turns are slow).
- **Four tiers** (`run.json`'s `tiers`, editable in the Entree page's Run section): Daydream (70, the wild AI, x1
  Shards), Reverie (80, Basic, x1.5, heavy fog), Delusion (90, + Eval attack, x2, + chaotic climate), Nightmare (100,
  + Expert, x3, + inverse types). Every run enemy's level is its tier's: the rooms' `level` field and the random rooms'
  level are gone (the 25 values removed from the room files; the packer drops any left).
- **Modifiers:** heavy fog (every door shows ???, bosses' and the final's too), chaotic climate (each run battle starts
  in sun, rain, sand or hail, `climate_weathers`, over the room's), inverse types (Gen 6's inverse chart in run
  battles, both sides; the chart buffs apply after it).
- **The hub's White 1 NPC** chooses the tier (locked ones shown locked; a tier opens once the one before has had its
  final room beaten; old saves with a run won count Daydream as beaten), saved at 0x622 of the progress block (0x623
  the tiers beaten), and lists the chosen tier's modifiers. Shards at a run's end times the tier's multiplier, then
  Black 5's x2.
- **Records:** "Highest tier beaten" on the Entree's Records page; the Hall of Fame's "Won in N turns at <tier>".
- **Tested** in py-desmume: the chooser (refusals, unlocks, save and reboot), levels 70-100 (custom room, random room,
  boss, raid), the fog, the climate, the inverse chart (Ember on Jellicent's Water x2, Tackle on its Ghost x2), Shards
  31/93/186 (x1, x3, x6), the Records and Hall lines. Arena 17.8 KB left (-704 bytes, overlay 12). Prototype doc,
  "Difficulty tiers"; entralink-buffs.md 21.

## 2026-11-21: Entralink records, step 4: fair room discovery and debug ranks (ROM session, on a branch)

- **Undiscovered rooms come up more:** a premade room the records don't have as discovered (and the run hasn't had)
  is `run.json`'s `undiscovered_weight` times likelier in every draw (4; editor: Run, **Undiscovered rooms**); the
  rounds', least-used and never-twice rules still apply.
- **The Entree's Records** lists the undiscovered rooms without naming them: "Undiscovered in round 1: 2", "in rounds
  2 and 3", "in any round", "final rooms", by where the draws can give them.
- **Debug:** START > Player... > Entralink records... > **Entree White Lv +1**, **Entree Black Lv +1** (each shows
  n/5) and **Entree ranks: reset**. Black sets Shards earned to the next threshold; White marks the next unmet
  milestone in a debug byte of the progress block (0x621) that the rank counts; Reset records clears it too. The
  hub's trees and NPCs follow on its next load.
- **Tested** in py-desmume: 300 seeded run starts twice (the undiscovered room about 4x the others), the Records rows,
  each option at 0 to 5 with the trees and NPCs. Arena 18.5 KB left (-384 bytes). Prototype doc, "Fair discovery and
  debug ranks".

## 2026-11-21: Entralink records, step 3: the ranks' rewards (ROM session, on a branch)

- **The trees grow:** the hub's two trees (the White and Black level models, overlay 130) show the ranks: stage =
  rank - 1, ranks 0 and 1 the first, rank 5 the fifth. The ranks moved to overlay 12 (`entralink_ranks.h`).
- **Rewards** (`records.json`'s `rewards`, each a tree and rank, editable): Black 1 the Reserve Box NPC, 2 the buff
  shop NPC (both hidden below), 3 the first room a buff room, 4 +50% Dream Dust, 5 x2 Dream Shards; White 1 a
  difficulty NPC (placeholder line), 2 a fog NPC (pink/purple/black/none, saved at 0x620 of the progress block),
  3 an item shop for Shards into the real bag (Nightmare Ball 15, Shiny Candy 60; `shard_shop`), 4 "Skip the first
  round?" at the forest entrance (6 picks from round 1's offers, 250 Dust, then round 2), 5 a form NPC (Lugia and
  Dialga to their special forms and back). The Nightmare Ball works as a Poké Ball outside runs now.
- **New NPCs** at placeholder places and sprites in `entralink.json` (ids 7-10 at (26,43), (36,43), (26,40), (36,40)).
- **Editor:** Entree page, Run, **Ranks' rewards** (tree and rank each, bonuses, skip, item shop goods).
- **Tested** in py-desmume: trees at 0/1/3/5, NPCs by rank, the buff room, Dust and Shards, fog, both purchases, a
  Nightmare Ball catch in a plain wild battle, the form change, the skip. Arena 18.8 KB left (-2 KB). Prototype doc,
  "The ranks' rewards".

## 2026-11-21: Entralink records, step 2: the Entree's menu (ROM session, on a branch)

- **The Entree** in the hub opens its menu again (bg event, script 4): the monolith (overlay 143) repurposed. Top:
  **Status**, the White Tree rank (milestones reached that count) and the Black Tree rank (Shards earned: 5, 20, 60,
  180, 450) with the next rank and the White/Black bar. Menu: Status (the milestones, Done or -), Records (two pages
  of rows), Nightmares, Bosses, Special, Catchable (caught, locked with the battles to win, catchable now), Buffs
  (unseen, tier-coloured name, every rank's description once taken), Hall of Fame (team and golds), Exit. Lists are
  plain for now; text placeholders at the end of `btl_main_title.txt`.
- **Data:** `records.json`'s `black_ranks` and `white_milestones` (schema, packer, tests); the editor's Entree page,
  Run section, **Entree ranks**.
- **Tested** in py-desmume with poked records: ranks at 4/5/450 Shards and 0, 2, 5 milestones, every page and list.
  Memory: overlay 143 only (+12 KB, loaded for the menu alone); arena unchanged at 20.8 KB. Prototype doc, "The
  Entree's menu".

## 2026-11-21: Entralink records, step 1: the data and saving (ROM session, on a branch)

- **Saved** in the progress block (0x1cc-0x61f, 1,108 bytes; 560 left): runs started, win streak and best, deepest
  place, Dream Shards earned, the biggest hit (damage, species/form, move, critical), the fewest turns of a win and its
  hall of fame (team with nicknames, golds); rooms entered/done by a new room **record id** (`progress_id` of each
  room file, `next_room`, given by the editor on save, checked by the packer); bosses' times beaten and fewest turns;
  the Nightmare codex (`"pokedex": false` species and `records.json`'s special forms: Primal Dialga, Shadow Lugia) met,
  beaten, caught; the buff compendium (offered, taken). Old saves read as empty.
- **Debug:** Player... > Entralink records... (pages, and a reset). Nothing shown in game yet.
- **Tested** in py-desmume: a loss, a run with a poked catch, an offer and a card, two raids and the final won, the
  hall of fame and golds, an in-game save and reboot, the reset. Memory: overlay 12 +3.0 KB (1.8 KB of it the debug
  readout); arena 20.8 KB left. Prototype doc, "Records".

## 2026-11-21: Follower sprites for room NPCs, and field memory freed (ROM session, on a branch)

- **Follower fallback:** a room's battle NPC without a sprite shows its enemy's walking Pokémon, else now its follower
  sprite (`OBJ_CODE_FOLLOWER_<SPECIES>[_FORM_n][_FEMALE]`, the registry's rule, normal colours); packer `npc_sprite`,
  editor `pokemonSprite` (preview and the error, now "no walking or follower sprite"). Random rooms draw 597 species
  (from 523); Flapple and Appletun stay out, their followers still Budew's art.
- **Memory:** an audit of the hack's objects in ARM9 main, overlay 12 and 36 (`docs/paperwhite2/design/memory.md`);
  the random rooms' species table moved from overlay 12 to a member of a/0/4/7, read into the event heap only while a
  room is made. DS arena **23.6 KB left** (from 18.5). Next candidates: the debug tooling (about 18 KB in a build
  without the debug menu), Wonder Trade's tables (2 KB), the run's RAM in main (7.3 KB, risky).
- **Tested** in py-desmume: a random room forced to follower-only species (sprites shown, a battle won, the offer and
  the viewer), a custom room with Haxorus's follower and Wailord's 64-pixel follower (battle won), the hub shop's list.
  entralink-buffs.md section 20.

## 2026-11-21: Entralink hub shop and Dream Shards (ROM session, on a branch)

- **Dream Shards** (permanent, in the progress block at 0x144): every run's end gives 1 a room done, +3 a boss beaten,
  +10 the final room (run.json's `hub_shop`); "You gained N Dream Shards! (total M)" before the warp to the hub.
- **The hub shop** (a new NPC at (34, 42), script 16 of `entralink.s`; look and place are placeholders): blue and
  purple cards (not type cards) a pick at a time, prices 5 / 8 / 12 then +4 per pick of that card, 8 picks in all, a
  card's in-run cap counting its bought picks; Reset gives every Shard back. Picks are saved by a hash key of the card's
  ID, so catalogue edits keep them. Held from each run's start (offers, the SELECT viewer, max HP).
- **Editor:** a Hub shop block in the Entree page's Run section. entralink-buffs.md section 19 has everything.
- **Tested** in py-desmume: buys, prices, too few Shards, the cap of 8, a card's max, Reset, the picks at a run's start
  and in a buff room's offer, the Shards of a back door, forfeit, loss, boss and final win, kept through an in-game
  save and reboot. Memory: overlay 12 +1.3 KB; arena 18.5 KB left.
- **Next:** the user places the NPC and writes its text; a playtest of the prices.

## 2026-11-21: Entralink buffs condensed per the audit (ROM session, on a branch)

- **Purples 33 → 18:** the audit's list (entralink-buffs.md section 18): survivors carry the merged cards as further
  effects (`more_effects`: Expert Edge + Glancing Blow, Keen Edge + Heavy Crit, Climate + Damp Rock + Overcoat, Hardy +
  Quick Recovery + Shed Skin, ...), new values, Giant Slayer in COND; Type Ward → **Ward** (foes' STAB hits −20%);
  Light Clay and Thrifty cut; new **Switch Hitter** (+40% on the first turn after each switch-in); First Blood counts
  each Pokémon's first two moves. Type Affinity rolls only the team's types.
- **Blues:** HP +15%, Guard 10%, Power +20% (FINAL cap 60); Accuracy replaced by **Evasion** (foes' moves −8%).
- **Recoil** in run battles: at most the move's share of the user's max HP (25/33/50%); Vampiric at most 25% a hit.
- **Code:** a card's further effects are effect rows after the cards' (packer, `AddCard` in overlay 167); the editor's
  Buffs tab has a More effects section. Meter example x22.6 (band 15-23); the simulator's late hit taken is now 13-16%
  (target 20%): enemy curves not refitted, waiting for a playtest.
- **Tested** in py-desmume: each merged part, Ward, recoil (73 of 293 HP after a 2,271 hit), First Blood / Switch
  Hitter on a Roar switch-in, Evasion's misses, the SELECT viewer. Memory: overlay 167 +0.7 KB, main and overlay 12
  smaller; arena 19.8 KB left.
- **Next:** a playtest; then `entralink_sim.py --fit` if the defence side is too easy.

## 2026-11-21: Entralink random enemy rooms (ROM session, on a branch)

- **Random rooms:** an enemy or enemy choice door leads to a random room at run.json's `random_enemy_chance` (50; a
  random room too when no premade one fits): 1 battle, or a choice of 2-3; each single, double or triple (weights 40,
  35, 25); never a raid, boss or final. Made as the room is entered, kept in ARM9 main through its battle.
- **Enemies:** Pokédex species with a walking sprite, not in `legendaries.json`, from the round's base stat total band
  (300-480, 380-540, 450-600); a double's or triple's share a type or family at 70%; a room's choices differ in types
  and families. Level 70, 4 of the last 7 level-up moves (a TM/tutor/egg move at 25%, always a damaging move), a random
  ability (hidden 5%), no item, gender by ratio; room curve scaling, enemy/enemy choice Dust.
- **Layout:** anchors in run.json (15,15 / 12,15 19,15 / 10,15 15,15 20,15), checked by the build; triples as Time and
  Space stands them. Editor: the Run section's Random rooms settings, a note in Templates.
- **Tested** in py-desmume (forced 100%): 13 rooms in rounds 1 and 3, all in band and varied; a single, a double, a
  triple and a 3-choice room's battle won, each room cleared. Details: `entralink-roguelike-prototype.md`, "Random enemy
  rooms"; memory `entralink-buffs.md` 17 (overlay 12 +7.4 KB, main +0.5 KB).

## 2026-11-20: Entralink fixes from the third playtest (ROM session, on a branch)

- **Boss HP:** round 1's bonus x1.6 (round 2 x2.3, final x5), and new `boss_double_factor` 0.85 / `boss_triple_factor`
  0.7 (run.json, editor Run section): a boss's foes share its HP bonus. Ho-Oh and Lugia ~1,400-1,470 HP each; round 2's
  three ~3,700-5,300. Simulator: 3.9 good hits for round 1's pair, 5.5 for round 2's trio.
- **Doubles' foe HP numbers:** not reproduced in py-desmume (both lines shown in every frame and flow tried, OAM and
  tiles checked); nothing changed. Needs the user's battle and emulator core.
- **Roar, Whirlwind, Dragon Tail, Circle Throw, Red Card** force a switch in run battles as in a trainer's, else fail
  (never end the battle); **Teleport** fails. The foe's Roar drags the player's next Pokemon out.
- **Buff room's box** goes once a card is taken.
- **Fire Within:** +15/25/35% Attack and Sp. Atk per burned foe on the field. **Wildfire:** burns 10/20/30% or the
  move's own chance if higher (new effect flag `at_least_move_chance`).
- **SELECT viewer:** Damage and Other multipliers lines (ATK, POW, STAB, MATCH, FINAL; COND, CRIT, DEF, GUARD; "+"
  where a held card adds more on some hits).
- Details, tests and calls: `entralink-buffs.md` section 16.

## 2026-11-20: Entralink rebalance 2: stronger buffs, bosses on the room curve, broken bars, merged cards, team-aware offers (ROM session, on a branch)

- **Verified first:** the user's debug build applies exactly as designed (x2-3 on a neutral STAB hit, x4 super
  effective); the first draft's buffs (x23.6 at most) simply couldn't match bosses scaled x25-x224. No bug.
- **Bosses** are the room curve at their round's last room times `boss_bonus` (run.json; HP x2.2 / x2.3 / x5 for the
  single final room, Attack x1.1); round 1's Ho-Oh and Lugia now have about 2,200 HP each (was 6,000+).
- **Buffs** roughly doubled (steps, gold ranks, bucket caps): a typical late build x15-20, an extreme one x77 (past the
  clamp with a critical hit, which the meter now calls fine). `entralink_sim.py` refitted the curves (tables in
  `entralink-buffs.md` 15.4: 5 rooms a round gives 1.5-4 hits a room, 6-8 good hits a boss, 17-22% a hit taken).
- **Heals stop at a broken bar** (Recover, drain, berries, Leftovers...: `HPAdd` holds them to the bar's top).
- **Merged cards:** Offense (Attack + Sp. Atk), Bulwark (Defense + Sp. Def; the gold Bulwark is now Bastion), Tough
  Claws takes Iron Fist, Technique takes Swift Hand; 109 cards.
- **Team-aware offers:** themes' `team_tags` (moves, abilities, own-type moves) in buffs.json; +75% a Pokémon, at most
  x4 (Buffs tab: Team row, Themes' team tags). **Summary:** the run's Offense / Bulwark / Speed shown on the stats page.
- Details, tests and calls: `entralink-buffs.md` section 15.

## 2026-11-20: Battle visuals from the playtest: damage numbers' place and depth, triples' HP lines, digit widths, HP drain (ROM session, on a branch)

- **Damage numbers** are placed from the battle camera at rest (not the attack's moving camera) and kept 4 px inside
  the screen at every size, so a triple's right-edge hit shows whole; each digit gets a W-buffer depth under the
  scene's (it tied with flat sprites at w = 1), so nothing in the scene can cover them.
- **Triples' (and raids', rotations') HP lines** sit beside each foe's bar instead of under it; singles and doubles keep
  them under.
- **Digits spaced by their real widths:** the packer measures each digit's glyph in the sheet's first row into the
  digits' member; `overlap` (now 2) is glyph to glyph, `group_space` the thousands' gap. The editor's Damage numbers'
  digits page has a Layout part (both settings, the measured widths, previews at the real spacing).
- **HP drain in every battle** takes 12 frames plus the change's share of 24 more (36 a bar on barred gauges), never
  slower than vanilla: a 271 HP hit on a 293 HP Pokémon 34 frames instead of 271.
- Tested in py-desmume (triple, both raids, doubles, single, drains measured). Found: a triple runs at about half
  speed in the emulator, so its drains take twice the real time. Details: `entralink-buffs.md` 13.9.

## 2026-11-20: Damage numbers: the user's digits and four tier colours (ROM session, on a branch)

- **The user's sheet** (`res/paperwhite2/battle/damage_digits.png`, 4 rows) is installed and packs; overlap 3 and
  thousands space 4 suit its italic face.
- **Five palette colours:** entry 1 the outline (shared, `settings.damage_numbers.outline`) and four a tier
  (`tiers[].colors`: dark shadow, light shadow, main, shine), replacing the 14/15 swap. The packer builds the five
  palettes into the digits' member; the game uploads them as they are. Colours in `entralink-buffs.md` 13.8.
- **Editor:** Graphics & Palettes → Sprite sheets → Damage numbers' digits has a Tier colours panel (pickers, a live
  `12 345` per tier, Play the shine, Save to `buffs.json`).
- Tested in the emulator: a number in each tier and the red critical's shine. Details and screenshots: 13.8.

## 2026-11-20: Entralink fixes: new species' battle NPCs invisible, a short triple crashing (ROM session, on a branch)

- **Invisible NPC** (`apples_to_applin`'s Dipplin): a battle NPC without a sprite took its enemy's from the game's
  walking table, which has no row for the hack's species or walking sprites, and the original's lookup bug read past
  it (object code 0). The packer now writes the walking sprite by name (form, sex, the hack's own codes), as the
  editor shows it; a species with none is an error in both.
- **Crash:** a triple (or double) with fewer enemies than places: the foe's AI read the empty places as Pokémon and
  encrypted one at address 0, the ITCM's mirror, overwriting the sprite renderer (undefined instruction at
  0x01ff802e). Proven with a write watch in py-desmume. The packer and the editor now require exactly 1/2/3/1
  enemies (single/double/triple/raid), and the run plays a short battle as the format its enemies fill.
- **The user's `apples_to_applin.json` (triple, one Dipplin) now fails the build** (the hack's and the plain one,
  which packs the run's dialogue text) and the packer's and editor's real-data tests until it is fixed in the editor
  (format Single or Raid, or three enemies). Details: `entralink-roguelike-prototype.md`, "Fixes: new species' NPC
  sprites and short doubles and triples".

## 2026-11-20: Entree page number boxes, learnable moves first, room ambients (ROM session, on a branch)

- **Number boxes:** every number of the Entree page (Scale, level, weights, chances, prices, Dust, the Run tables, Raid
  HP, the Buffs tab) keeps the typed text while focused and commits on blur, Enter or Ctrl+S: out of range shows red
  and is clamped on commit. Other editors still clamp per keystroke (listed in the prototype doc).
- **Move pickers** (enemy cards and the Trainer Editor's party) list the species' learnable moves first, marked
  ("Lv. 46", "TM32", "Tutor", "Egg"; a form's own record where it has one), then all moves; search covers both.
  `moves.py learnable`, `GET /api/moves/learnable`.
- **Room ambients:** NPC type `ambient` (`behaviour` fade or flee, `near` 3, `return` with `far` 6, `distance` 4):
  decoys that fade (and come back) or run away and fade as the player nears; they never keep a room from being done.
  `paperwhite2_entralink_ambients.c`; the prototype doc's "Room ambients". Tested in the emulator: three fading
  Darkrai (one returning, and fading again), one fleeing 4 tiles, and the room's real battle still won.

## 2026-11-20: Entralink enemy scaling rebalance after the first playtest (ROM session, on a branch)

- **Why:** room 2 was the Rayquaza raid, which had round 1's boss values (6,627 HP, x27.5, Attack x3): the user's
  Dipplin barely dented it. **Now** raids use the room curve with HP times `raid_hp_factor` (run.json, 3.0): that raid is
  1,270 HP (x5.4, Attack x1.0).
- **The curve:** `enemy_scaling` per stat is now `start`, `end`, `curve` (exponent in hundredths) keyed by depth across
  the whole run, and `boss` a round; the packer tabulates every room (up to 24), so a different rooms-a-round keeps the
  arc. Values: HP 140% to 750%, Attack 100 to 150, defences 100 to 130, Speed 100 to 145; bosses and the final room
  (about 50,000 HP) unchanged. Round 1 room 1 is x1.4 HP, others x1.0.
- **Simulated 3 and 5 rooms a round** (entralink-buffs.md, 12.7): hits to kill 1.4 rising to 4.0, an enemy's hit 16 to
  21% of HP; with 5 rooms the rooms are easier and the bosses shorter (raise `boss` for 5 rooms). The
  editor's Run section has the new table (First room, Last room, Curve, Boss R1-R3) and Raid HP. Tested in the
  emulator (raid, round 1 room 1, round 3 room 3, the final room).

## 2026-11-20: Entralink buffs, phase 7: the Reserve Box and the rest stops' swaps (ROM session, on a branch)

- **The Reserve Box:** a new hub NPC (`entralink.json` id 5, a clerk at (28, 43) left of the exit Lady, placeholder
  place) offers **Use the PC** (the PC's Box modes, as a Center's PC) and **Reserve Box**: the reserved Pokémon (name,
  level; species and box as the description), Add (the PC Box in a pick mode, as the Wonder Trade's) and taking one
  out. Saved as **live links**: a PID per slot in the progress block (0xc8-0x143); each use searches the boxes and
  uses the Pokémon as it is then; one released or moved into the party drops off. Size: `run.json`'s `reserve_slots`
  (6; at most 30).
- **The swap NPC** (`swap`, a choice NPC, in the rest and pre-boss rest templates, marker `swap`): for `swap_dust` (100)
  Dream Dust, a reserved Pokémon joins as a level 100 copy made like the run's first ones, in place of a copy that
  hasn't fainted, which leaves the run. Refused with no one to bring, too little Dust or every copy fainted; each
  reserved Pokémon joins once a run. At the run's end the real party comes back as before, and a joined Pokémon's box
  self gets the prestige its copy gained (same rule: only if level 100).
- **Editor:** the Swap type in the NPC pickers with its note, Swap Dust and Reserve Box in the Run section; new
  templates start with a swap NPC.
- **Tested** in py-desmume (scratchpad `buffs7/h/`, `entralink-buffs.md` section 14.3): the hub's menu, the PC, adding
  through the Box, the list, removal, already-reserved, full; a box edit (moves, held item) showing on the swapped-in
  copy, released ones dropping off, every refusal, two swaps (level 100, full HP and PP, item cleared, Dust taken, not
  listed twice), the run's end with the real party byte for byte and the boxes untouched but the joined level-100
  Pokémon's prestige. Hack build clean, DSi ROM intact, plain modules match, Python and editor tests pass.
- **Memory:** ARM9 main +0.9 KB, overlay 12 +1.7 KB, overlay 255 +86 bytes; DS arena 32 KB left (from 34).
- **For the user:** move the hub NPC and the swap NPCs where you want them, edit the placeholder text and the `swap`
  marker; the calls in section 14.5.

## 2026-11-20: Entralink buffs, phase 6: damage numbers and a foe's HP numbers (ROM session, on a branch)

- **Damage numbers:** each hit of the team's on a foe pops its full damage over the foe as the drain starts (a new
  server command, `SC_DAMAGE_NUMBER`), once per hit of a multi-hit move; drawn as 3D quads after the scene, so they
  start large (300%) and see-through and shrink into place in 5 frames, hold, then fade rising. No OBJ or affine
  slots; 10 KB of texture VRAM. Colour tiers (white, blue 1,000, purple 5,000, gold 10,000, red 40,000) swap the
  digits' palette entries 14 and 15; the shine rows sweep left to right on critical and capped hits. All of it is in
  `buffs.json`'s `settings.damage_numbers` (the Buffs tab's Damage numbers section); `battles: all` exists, `run` is set.
- **The digits' sheet** is a placeholder in the user's layout (`res/paperwhite2/battle/damage_digits.png`, 160 wide,
  16×32 cells, row 1 the digits, rows below the shine frames), on Graphics & Palettes → Sprite sheets; the spec is
  `entralink-buffs.md` section 13.3, packed by `tools/paperwhite2/damage_digits.py` into the battle view's archive.
- **A foe's HP numbers** in run battles: `43 232 ×9` under its bar, 5 digits and the bars left.
- **Tested** in py-desmume (scratchpad `buffs6/h/`, section 13.5): single, double and triple battles, every tier, a
  multi-hit move, a capped critical with the shine, the shrink frame by frame, 5-digit HP lines; gauges and menus
  intact. Hack build clean, DSi ROM intact, plain modules match, Python and editor tests pass.
- **Memory:** overlay 168 +1.9 KB, 167 ~0.2 KB; texture VRAM 10 KB, its palettes 160 bytes.
- **For the user:** draw the digits' sheet to the spec; playtest the timing settings; the calls in section 13.7.

## 2026-11-20: Entralink buffs, phase 5: enemy scaling and health bars (ROM session, on a branch)

- **A run simulator** (`tools/paperwhite2/entralink_sim.py`, stdlib): picks per place from the tier odds, three builds
  (balanced, glass cannon, defensive), the buckets' maths and Gen 5's damage formula; `--fit` proposes curves, and its
  table is in `entralink-buffs.md` section 12.1. Finding: with today's 3-room rounds the 50,000-HP final takes 21-30
  strong hits of one attacker; lowering HP's final `boss` value is the lever if playtests agree.
- **Enemy scaling:** `run.json`'s `enemy_scaling` (each stat: start, end, curve by depth across the run, boss a round, see the rebalance entry above; originally first room, a step a room, boss; the
  editor's Run section has a small table per stat) and each room enemy's `scale` (the enemy card's Scale). Applied to
  the foes' BattleMons as they are made and each time stats are re-read; a caught foe keeps its own stats and its HP
  share. Starting curves: room HP ×2.6-7.4, Attack ×1-1.5, defences ≤×1.3, Speed ≤×1.5; bosses ×27.5 / ×66 / ×224 HP.
- **Health bars:** a foe past `boss_bar_hp` (now 5,000) shows up to 10 equal bars (buffs.json's `bar_colors`, the
  Buffs tab), the current one draining over the next one's colour, "×N" under it; damage over time is a fraction of one
  bar; bars drain about half a second each.
- **Tested** in py-desmume (scratchpad `buffs5/`, section 12.4): multipliers at room 1, round 1 and round 3 rooms, the
  final room and round 2's triple; the per-enemy scale; a 9-bar Darkrai drained through four colours; poison 597 a
  turn (a bar's 1/8); a caught Dialga with normal stats. Hack build clean, DSi ROM intact, plain modules match, Python
  and editor tests pass.
- **Memory:** main +64 bytes, overlay 12 +0.4 KB, 167 +0.5 KB, 168 +1.4 KB; a BattleMon +4 bytes; no VRAM.
- **For the user:** playtest the curves (the final's length, Darkrai's `scale`); the calls in section 12.6.

## 2026-11-20: Entralink buffs, phase 4: the harder effects (ROM session, on a branch)

- **Every card works now** (`entralink-buffs.md` section 11): the HP blue (run copies' max HP through
  `PokeParty_RecalcStats`, gain healed, 999 at most), Spectral (super effective past type immunities, rolled once a use
  and target), Magnetised, **frostbite** as a new condition (`CONDITION_FROSTBITE` 38: 1/16 a turn, Sp. Atk halved,
  its messages and a placeholder "FRB" gauge icon in app_menu_common 012-018), Permafrost, Corrosion, Wildfire r3,
  Contagion, Self-harm, Forecast (a weather list when first taken; a room's weather wins), Baton, Follow-through,
  Shattering Blow, Defiance r3, Parasite (and its spread), Overflow, Thorn Guard.
- The packer numbers the game's custom handlers in a fixed order (a catalogue without one still builds); Nightmare Field
  finds its own card beside Parasite.
- **Tested** in py-desmume (scratchpad `buffs4/`, section 11.3), each with numbers; screenshots of a Spectral hit on a
  Normal type, frostbite's icon and messages, Forecast's menu and rain. Hack build clean, `verify_dsi_rom.py` intact,
  plain modules match, Python and editor tests pass.
- **Memory:** overlay 167 +2.9 KB, main +0.25 KB, a BattleMon +4 bytes.
- **For the user:** redraw the FRB icon (row 8 of app_menu_common/012.png); the calls in section 11.5.

## 2026-11-20: Entralink buffs, phase 3: the battle effects (ROM session, on a branch)

- **The buffs work in run battles** (`src/paperwhite2/ov167/paperwhite2_entralink_battle.c`,
  `include/paperwhite2/entralink_battle.h`; `entralink-buffs.md` section 10): at a run battle's start the battle reads
  the run's buffs into a table of its own and adds two event items, last in priority (vanilla on top). One handler a
  host event sums each damage bucket's entries, holds the sum to the bucket's cap and multiplies once (ATK, DEF, POW,
  COND, STAB, MATCH, CRIT, FINAL, GUARD). Effects are kinds read from the catalogue: the packer now writes
  `ENTRALINK_BUFF_EFFECTS` (overlay 167) and `ENTRALINK_BUFF_VALUES` (main, `EntralinkBuffs_GetValue`).
- **Built:** every Easy kind and the Medium ones that are per-battle state (Clear Amulet, First Blood, First Strike,
  Focus, Second Wind, Opening Gambit, Thrifty, Vampiric, the on-hit statuses, sleep/confusion turns, Hardy, Lockjaw,
  Madness), Vigor in the run after a win. **Phase 4:** HP blue, Spectral, Magnetised, Frostbite, Permafrost, Corrosion,
  Wildfire r3, Contagion, Self-harm, Forecast, Baton, Follow-through, Shattering Blow, Defiance r3, Parasite, Overflow,
  Thorn Guard.
- **Damage clamp** at `damage_cap` where the damage is first cut to 16 bits (`ServerEvent_CalcDamage`), the full hit
  kept for phase 6's numbers; `fixed_round` saturates.
- **Bosses** (new `ENTRALINK_RUN_BOSS_BTL_SETUP_FLAG`: role boss or final, or a raid; new settings `boss_*`, on the
  Buffs tab): damage over time a fraction of min(max HP, 6,000) on any run foe, bad poison stops at 4/16, fixed damage
  at most half a bar, OHKO moves and Pain Split don't affect them, sleep 2 turns at most, never frozen, full paralysis
  halved.
- **Tested** in py-desmume (scratchpad `buffs3/`, section 10.4): each bucket's factor, two caps holding, a 141,699 hit
  clamped to 60,000, Guard, sure criticals and Sniper, the boss's 750 poison tick, Super Fang 3,000, sleep counts,
  Vigor, Opening Gambit with Simple, Second Wind, Regrowth. Hack build clean, `verify_dsi_rom.py` intact, plain
  modules match, Python and editor tests pass.
- **Memory:** overlay 167 +11.6 KB, main +1 KB, the main arena 36 KB to 35 KB free.
- **Next:** phase 4's hooks (the list above); phase 5's boss bars replace `boss_bar_hp`.

## 2026-11-20: Entralink buffs, phase 2: choosing buffs in the game (ROM session, on a branch)

- **The run holds buffs** (`include/paperwhite2/entralink_buffs.h`): in `EntralinkRunState`, a level a card (a blue's
  or purple's count, a gold's rank), 5 gold slots, a type card's count a type; emptied at every run's start and end.
  Read functions in ARM9 main for phase 3 (`EntralinkBuffs_GetCount`, `_GetTypeCount`, `_GetGoldRank`, `_GetGoldSlot`,
  `_ListHeld`).
- **Offers** (`src/paperwhite2/ov012/paperwhite2_entralink_buff_offers.c`, the cards' table now in the generated
  header): 3 cards after every battle won but the final one's, right after its Dust message (row by the room: enemy,
  challenge, boss with a gold guaranteed), drawn by weight in the tier with the pools, rounds, held themes
  (`held_theme_weight`), held golds' rank-ups (`rank_up_weight`, new) and the team's types for type cards; Skip gives
  `skip_dust`. Gift NPCs mix items and buffs (`gift_buff_chance`, new, 50%); buff rooms offer a chooser (the template
  now has one ball); shops sell `shop_buffs` (new, 2) buffs from a list of their own (Items / Buffs / Leave; the
  Mart's screen shows only items). New tier-odds rows gift, buff_room, shop; the Buffs tab's Offers section edits all
  of it, and the packer and the editor refuse a description longer than the window's two lines.
- **The chooser:** a list menu, each card's title coloured by tier (`{ff00:2}` blue, `{ff00:478}` magenta,
  `{ff00:444}` gold) with a gold's numeral ("Galvanic II") and its line in the window below as the cursor moves; a new
  gold with 5 held asks which to replace (Cancel back to the cards). **SELECT** in a run lists the buffs held.
  **Debug:** Player... > Entralink buffs... (Set a buff..., Show held).
- **Tested** in py-desmume (scratchpad `buffs2/`; `entralink-buffs.md` section 9.4): enemy, challenge and boss offers,
  the colours, a rank-up, the replace flow, Skip, a gift, a buff room, a shop's buff bought and refused, buffs gone at
  the run's end, the viewer, the debug entries, type cards toward the team's types. Hack build clean,
  `verify_dsi_rom.py` intact, plain modules match, Python and editor tests pass.
- **Memory:** run state +208 bytes (main BSS); overlay 12 +6.5 KB, the main arena 43 KB to 36 KB free.
- **Next (phase 3):** the battle effects reading the levels.

## 2026-11-19: Entralink buffs, phase 1: the catalogue as data and the Entree page's Buffs tab (ROM session, on a branch)

- **The doc** (`design/entralink-buffs.md`) has the user's decisions (section 6, the open questions answered), Spectral
  made generic (20/40/60% that a hit is super effective, even on a type immune to it: the `#ifdef` hook at the top of
  `ServerControl_CheckMoveEffectiveness`, before the immunity), Tag team and Harvest gone, and a **Stall** theme
  (4.13): Overflow (core: healing past max HP hits a foe), Parasite (Leech Seed 1/6, 1/5, 1/4, spreading at r3),
  Thorn Guard (Protect heals and hurts blocked contact), Mending, Regrowth, Siphon, each with its hook point checked in
  the code. Section 7 is the data and the effect kinds; section 8 the later phases' decisions (boss health bars, the
  chooser, skipping, damage numbers with no MAX text, enemy scaling).
- **The data:** `res/paperwhite2/entralink/buffs.json` (10 blues, 35 purples, 68 golds, 13 themes, the 9 buckets, the
  offers' settings, the meter's reference and example) against `buffs.schema.json`, whose 31 `effect_*` definitions are
  the effect kinds (`damage_ratio`, `stat_ratio`, ... `ability_like`, `custom`): the game will implement kinds, not
  cards. Icons: one per **category** (12; each card names one), drawn in its **tier's palette**
  (`buff_icons/<category>.png` indices, `tier_<tier>.png` a swatch whose PNG palette is the tier's 16 colours: one
  16-colour texture an icon and one palette a tier for the game); placeholders, listed on Graphics & Palettes with the
  markers (`entralink_marker_art.py`) and shown in the tier's colours in the editor.
- **The packer:** `tools/paperwhite2/entralink_buffs.py` (configure.py, hack builds) checks it (ids, themes, one core a
  theme, buckets by kind and side, ranks, icons, odds) and writes `paperwhite2/entralink_buffs_config.h` (IDs and
  settings, included by nothing yet); `--check` prints the balance meter. Tests in `test_entralink_buffs.py` (pytest
  style; run with a shim, pytest isn't installed).
- **The balance meter** (packer and `editor/src/modules/entree/buffs.ts`, same arithmetic): every attack bucket reaches
  its cap, ×23.6: 14,175 on the 600 reference, 35,438 critical (47,250 on 800), under 60,000; the example build ×7.56,
  4,538. Matches the doc's 5.2 and 5.3.
- **The Buffs tab:** list with tier, theme, pool and text filters, Add / Duplicate / Delete (stable ids); Basics,
  Offer, Effect (kind and parameters from the schema, the bucket, step/soft limit/cap or ranks), Relations; the meter
  with an editable reference and example build; Themes; Offers settings; Checks. Build clean, `verify_dsi_rom.py`
  intact, editor tests pass (259), screenshots in the scratchpad's `buffs1/`.
- **Next (phase 2):** the tables in the header and the C that reads them; the card offer after battles.

## 2026-11-19: follower shadow, final tuning: 15 and 14a built in, the centers' offset x 0.85 (ROM session, on a branch)

- **Built in** after the user's melonDS tests: variant 15 for Castelia's streets (setup 2: the follower's oval low, the
  actors 0.9% nearer; `"low_oval": true`, `low_oval_pull` is gone) and 14a for Victory Road's outside (setup 11).
  The debug rows are `14a Nearer in W: now 0` and `15 Low oval: now 0`, list id and word slots kept.
- **Pokémon Centers (setup 3, 12c): `offset_scale` 0.85** (new optional field: the factor on the offset times the near
  plane; `following_camera_fixes.py`, the schema and `FollowingRender_ClipOffset`). Smallest k that keeps the
  follower's oval off its body over every frame of long walks on both floors (down frames included, in DeSmuME): about
  0.81 (0.80 fails on a down frame); 0.85 built in. The NPC by the upper floor's ledge (the man at the stairwell):
  **44 pixels over the ledge's rim at k = 1, 2 at 0.85** (against the original game); the player along the ledge's
  row 194 pixels in all against 91; the nurse's waist 3 against 0. The notch corner by the stairs still draws 29 and
  52 pixels (the oval's share included). k = 0 is pixel for pixel the original.
- The final per-setup table is in `following-pokemon.md` ("Where each camera setup stands"); shots in the scratchpad's
  `shadow7/`. Build clean, `verify_dsi_rom.py` intact, editor tests pass (251).
- **For the user:** in melonDS, a Center's upper floor (the NPC at the stairwell's ledge, the player along its row)
  and the follower's feet while walking there; Castelia's street and Victory Road's outside are unchanged from what
  you tested.

## 2026-11-19: follower shadow, 14a built in on the bridges and the gate; variant 15 for Castelia (ROM session, on a branch)

- **Built in** (`"w_pull_built_in": true` in `follower_camera_fixes.json`): 14a's pull for setups 1 (Skyarrow
  Bridge), 4 (the gate by Skyarrow), 10 (the Tubeline Bridge) and 39 (the Marine Tube), always on like the centers'
  and the forest's fixes; `13 Camera fixes off` still turns it off. Setups 2 (Castelia's streets) and 11 (Victory
  Road's outside, untested) stay on the debug row, now `14a Nearer in W: 2, 11`.
- **Variant 15** (`15 Low oval, Castelia`, after 14b, same list id and word slot), setup 2 only: the follower's oval
  at the ground + 0.25 and the actors pulled by `low_oval_pull` 0.009 (2.6 units at 288), the smallest that keeps the
  oval off the follower's body on every frame of two walks in DeSmuME (0.008 doesn't; 14a's own smallest is 0.014, as
  tested 0.024). Edge band in front of the feet 1.3 pixels on the street, 0.95 at the harbor railing, against 14a's
  3.5 and 2.5; DeSmuME: 14a 3 rows of legs over the railing and the hair around a streetlight, 15 none. The lowered
  oval should not fight the street (0.5 units along the ray in a W-buffer; the player's oval is at + 0.5 already);
  melonDS is the check.
- **The gate's floor flicker is vanilla**, not 14: the projection is scaled only for the actors' pass, after the map
  is drawn, and restored before anything else; no floor pixel differs between 13, 0 and 14a in DeSmuME by the red
  mat. The gate's model has two translucent shadows exactly coplanar 1 unit over the floor there, the likely flicker.
- Details in `following-pokemon.md` ("14a built in ...", "The gate's floor flicker"); shots in the scratchpad's
  `shadow6/`. Build clean, `verify_dsi_rom.py` intact, editor tests pass (251).
- **For the user:** in melonDS, Castelia's street on 15 (railings, streetlights, the oval on the street, the feet
  while walking); if clean, 15 becomes setup 2's built-in fix. The gate spot under `13 Camera fixes off`, to confirm
  the flicker is vanilla.

## 2026-11-19: follower shadow, variant 14 "actors nearer in W" (ROM session, on a branch)

- **For the W-buffered outdoor setups** that keep their planes, buffering and fog (1 Skyarrow Bridge, 2 Castelia's
  streets, 4 the Skyarrow gate, 10 the Tubeline Bridge, 11 Victory Road's outside, 39 the Marine Tube): new debug
  rows `14a Nearer in W` and `14b Nearer in W, full` after 13 (same list and word slot). `FollowingRender_NearerInW`
  scales the actors' pass's projection (x, y, z rows) by 1 - pull, so every actor comes nearer along its eye ray with
  its picture unchanged and their order kept. 14a: the actors by the setup's `w_pull` in
  `follower_camera_fixes.json` (0.024 to 0.032 of the distance: 6 to 9 units, the smallest that clears the oval on
  the walk's down frames), the effects in place. 14b: the normal maps' depth (actors 6% of the distance, 12 to 17
  units; effects half that).
- **Edge overlap:** a surface less than pull / cos(pitch) in front of an actor loses to it; 14a about 3.5 pixels in
  front of the feet on Castelia's street and the Skyarrow span, 8 to 10 on the bridge's stairs and Victory Road; 14b
  about 2.5 times that; a normal map's offset is about 21. DeSmuME: 3 (14a) or 4 (14b) rows of the player's legs over
  Castelia's railing. A sprite row can repeat by rounding in some poses (one hair row in 2 of 7 shots under 14a).
- Table and details in `following-pokemon.md`, "Variant 14"; shots in the scratchpad's `shadow5/`. Build clean,
  `verify_dsi_rom.py` intact, editor tests pass.
- **For the user:** in melonDS, Castelia's street and Skyarrow Bridge first, 14a against 14b against 0: the feet,
  the railing and parapets, the player and the follower crossing.

## 2026-11-19: trapped in Black City's or White Forest's Center after the globe's switch, fixed (ROM session, on a branch)

- **Cause, proven in the emulator** (user's save, debug warp to White Forest's Center, the globe's Alter Unova): each
  Center has two exits on the doorway, and its `Script_4` (init types 2 and 3) moved the one the flag doesn't pick to
  tile 0, 0. The field loads a zone's warps only at a map change (`FieldMapControl_LoadZone`), so after the Season app
  the type 3 run worked on the warps as entry left them and moved the other one too. Read from `EventData`: before,
  warp 0 (White Forest) at 104, 312 and warp 1 (Black City) at 8, 8; after picking Black City, both at 8, 8, so no exit,
  and switching back only moved one again. Not a later regression: the feature's own commit, 63ff9cd6de, built and run
  the same way, traps the player the same. (A switch made outside the Center, or with the Version Key, which loads the
  map again, never showed it.)
- **Fix** (`res/field/scripts/{white_forest,black_city}_pokemon_center.s`): `Script_4` puts the picked city's exit on
  the doorway (`ObjInitWarpGPos n, 6, 0, 19`) and the other off it, every run (plugins.md, Season app).
- **Tested** in the emulator: in White Forest's Center, Black City; Black City then White Forest; three and four
  switches in one visit; in Black City's Center the same both ways: each time the exit led to the last pick's city
  (zone 0 or 424). Opelucid City's Center has one exit that never moves (its city's pieces follow the flag at the map
  change): Modern City then Old Town there, and the exit leads to Opelucid City. `verify_dsi_rom.py` intact, editor
  tests pass. To test on hardware: switch at the globe in either Center, both ways, and walk out each time.

## 2026-11-19: follower shadow, camera fixes across the game (ROM session, on a branch)

- **Camera fixes are data now:** `res/paperwhite2/follower_camera_fixes.json` (a camera setup each: Z-buffer, near
  plane, offset scaled by the near plane), packed by `tools/paperwhite2/following_camera_fixes.py` into a generated
  header that `FollowingRender_AdjustCamera` and `FollowingRender_ClipOffset` read. The camera table stays vanilla;
  deleting an entry reverts that setup alone.
- **Built in:** the Pokémon Centers (setup 3, 12c: Z-buffered, near 64, offset scaled; the user's melonDS and 3DS tests
  passed), the Entree Forest (35, as before), Castelia's Central Plaza (7, `castelia_city_2`: offset scaled by its near
  plane of 5) and White Forest/Black City with their gates (24: W to Z, near 32, offset scaled; the layer maths gives
  3.2 steps or more at the view's farthest, no fog).
- **The audit:** `tools/paperwhite2/camera_audit.py table` (every setup's buffering, planes, distance, pitch, zones,
  G sin p, the oval's cover) and `layers SETUP` (near-coplanar overlapping layers of the setup's maps and props, Z steps
  per near plane). Table and decisions in `following-pokemon.md`, "The whole game".
- **Debug rows:** `9 Center near 1` (the old 9 over the fix), `12c Center fix: now 0`, new `13 Camera fixes off`.
- **Not changed, for the user:** Castelia's streets (setup 2: the far plane in view, windows 0.2 units off their
  facades, weather fog tuned for W), Skyarrow Bridge (1: zone fog, the span sees the horizon), Victory Road's outside
  (11: zone fog), the Tubeline Bridge, the Marine Tube and the Skyarrow gate (fog, low cameras), and five Z-buffered
  near-1 setups under the line by about a pixel (a Castelia street, the Opelucid and Castelia Gyms, Celestial Tower,
  PWT). A W-depth offset for the actors (untried) is noted as the way for the W outdoor ones.
- Shots in the scratchpad's `shadow4/`. Build clean, `verify_dsi_rom.py` intact, editor tests 251 pass.
- **For the user:** in melonDS and on the 3DS, walk White Forest (feet, and any shimmer on painted shadows or the
  Pokémon Center's walls) and Castelia's Central Plaza; `13 Camera fixes off` compares live.

## 2026-11-19: follower shadow, the forest's fix built in, center variants 12a to 12c (ROM session, on a branch)

- **Entree Forest, permanent:** the actors' clip Z offset is scaled by the near plane for camera setup 35 alone
  (`FollowingRender_ClipOffset`, now given the `FieldCamera`), with no debug override; setup 7 (`castelia_city_2`,
  near 5) and every other camera keep the vanilla offset. Variant 11 keeps its row (`11 Forest fix: now 0`) and draws
  as 0.
- **Debug switch, new rows 12a/12b/12c Center near 16/32/64:** setup 3 Z-buffered as 9, with that near plane and the
  offset scaled by it. The model: the outside view `in02_window` is one opaque quad 2 units behind the back wall's
  plane, which is the opaque `in02_pc` bands and the translucent `in02_pcwin` panes side by side; it runs behind the
  solid bands, so it fights them at near 1 (0.3 to 0.7 depth steps). Near 16, 32, 64 give 5 to 11, 11 to 23, 22 to 47
  steps: all should resolve. Nothing comes within 150 units of the eye. The ledge NPC's legs and the nurse's pixel stay
  as in 9 (they come from the offset). DeSmuME doesn't show the window fight at all, so it's for melonDS.
- Details and the table: `following-pokemon.md`, "Camera-side fixes". Shots in the scratchpad's `shadow3/`. Build
  clean, `verify_dsi_rom.py` intact, editor tests 251 pass.
- **For the user:** in a Pokémon Center, cycle 12a to 12c in melonDS and look at the back windows upstairs and the
  follower's feet; the chosen one then goes into setup 3's row of `res/field/cameras/defaults.json` and the switch
  goes.

## 2026-11-19: follower shadow, camera-side variants 8 to 11 (ROM session, on a branch)

- **Debug menu, Follower... > `Follower shadow`** cycles on to 8 Forest near 1, 9 Center Z-buffer, 10 Both cameras and
  11 Offset x near, live (A sets the camera's planes and buffering again; no map load). The follower is drawn as 0 in
  all of them; only camera setups 3 (the centers) and 35 (the Entree Forest) change, only while the RAM override is
  set. The camera table in `res/` is unchanged.
- **Findings:** vanilla partners (`ActorPair*`, `MOVE_CODE_FOLLOW_PLAYER`) are ordinary NPCs, drawn with no priority
  or offset of their own. 8 breaks the forest's zone fog (the whole screen pink): not a candidate. 9 shows the
  follower's toes over its oval in the centers, overlap with the player unchanged; the cost is NPCs pulled a little
  through the ledge and the counter (a few pixels). 11 (scale the actors' clip Z offset by the near plane) fixes the
  forest with its fog and precision intact.
- Details, depth maths, zones sharing the setups: `following-pokemon.md`, "Camera-side fixes". Sheets in the
  scratchpad's `shadow2/`. Build clean, `verify_dsi_rom.py` intact, editor tests 251 pass.
- **For the user:** check 9 in a Pokémon Center and 11 in the Entree Forest in melonDS (standing, walking down, beside
  the player); then they become fixed and the switch goes.

## 2026-11-18: follower shadow variants, a debug switch (ROM session, on a branch)

- **Debug menu, Follower... > `Follower shadow: <name>`**: A cycles 8 candidate fixes of the oval over the follower's
  feet, live (0 Current, 1/2 oval back 2/4, 3/4 oval 80%/65% a unit back, 5 no lowering, 6 oval low, 7 the lift on
  the screen only). Only the follower's oval and body change; 0 is the default, and a reset goes back to it. Details
  and the depth maths: `following-pokemon.md`, "The shadow variants".
- **The Entree Forest** is camera setup 35: Z-buffered, but its near plane of 112 units makes the actors' clip Z
  offset worth about 0.08 units of depth, so it behaves as the W-buffered Pokémon Centers (camera setup 3) do.
- Debug actions 57 and 58 are new (`DEBUG_ACTION_FOLLOWER_SHADOW_WORD`, `_NEXT`), word slot 5 in the Follower menu.
- Tested in py-desmume: the menu cycles 0 to 7 and back; contact sheets in the scratchpad's `shadow/`. Build clean,
  `verify_dsi_rom.py` intact, editor tests 249 pass.
- **For the user:** pick a variant by eye in melonDS (a Pokémon Center and the Entree Forest, standing and walking
  down); it then becomes the fixed behaviour and the switch goes.

## 2026-11-19: Entralink step 7: fixes, enemy choice rooms, Dream Dust, shops, the Dowsing MCHN (ROM session, on a branch)

Details, data tables, tests and shots: `docs/paperwhite2/design/entralink-roguelike-prototype.md`, "Step 7".

- **Fixes:** the doors before the pre-boss rest already drew any type but rest and shop (retested); the item room's
  icons moved right 4 and down 8 in their textures (centred over the balls); the NPC markers go along the camera's up
  from where the sprite is drawn, directly over the heads (they were in front); placeholder NPC markers challenge, heal,
  revive, used by the rest templates' heal and revive NPCs. Triple battles don't stall: the game's own auto center moves
  the last two to the middle (tested), and the raid's lone foe stands there; nothing to fix.
- **enemy_choice:** a room type (weight 8, enemy's 50 -> 42) and door marker (EE placeholder) for a room of several
  battles; the packer and the editor warn an enemy room with more than 1 battle (Prince or Princess now: the user's
  call) and an enemy_choice room with fewer than 2.
- **Dream Dust:** run.json `dust` (enemy 40, enemy_choice 50, challenge 80, boss 150, final 0) x `dust_round_percent`
  (100/150/200), given on a win or a catch and shown after the battle; in the run's RAM state, 0 at the start, gone at
  the end.
- **Shops:** the Poké Mart's own screen with a Dream Dust currency (`scrcmd_shop.c`, shop ID 0xfc), the room's
  `shop_items` (5) drawn from the shop pool as it is entered; buying goes to the run's bag; talking to the shop is the
  room's choice (the pre-boss rest's others go), and it opens again after.
- **Dowsing MCHN:** the run's bag holds it in Key Items (shown and usable in a run), it finds the room's hidden item,
  isn't drawn again while held, and goes with the run's bag. Not in `items.json` yet: the user adds it.
- **Editor:** the Run section's Dream Dust (per kind, per round) and Shop items, enemy_choice everywhere types are, the
  Items tab's price as Dream Dust; tests 251 (two new), the packer's 24.
- **Memory:** about 1.2 KB of code (overlays 12, 36, 86, 142), ARM9 main +56 bytes; the DS arena 45 KB left (from 46).
- **For the user:** Prince or Princess as enemy_choice or not; the placeholders (markers, lines, prices, Dust amounts);
  adding the Dowsing MCHN to the item table.

## 2026-11-18: Entralink step 6, the game side (ROM session, on a branch)

Details, data tables and tests: `docs/paperwhite2/design/entralink-roguelike-prototype.md`, "Step 6".

- **Room types:** each forward door draws a type by its round's `type_weights` (no rest after a rest, no rest or shop
  just before the pre-boss rest, a type with no room skipped), then a premade room or, for rest/item/buff/shop (at
  `custom_chance`), its template (`templates/`). A pre-boss rest (`templates/pre_boss_rest.json`, in the pre-boss map)
  comes before each boss and the final room: the real run is 15 rooms (max now 20).
- **New NPCs:** heal (the unfainted only), revive (the party screen, a fainted one to full HP), gift (a list of 3 from
  the item table), shop (a placeholder line), item_choice (its item's bag icon over the ball, Yes takes it), buff_choice
  (placeholder). Using one is the room's choice: the others go, the room is done; battles in such a room are bonus.
- **Items:** `items.json` (pools item_room, gift, shop, ground; rounds; weights; prices for step 7); the Nightmare Ball
  only while something can still be caught. A ball on the ground (`ground_item_chance`) and a hidden item on a flower
  tile, found with A (`hidden_item_chance`; hook in `fieldmap_event.c`); no Dowsing MCHN in a run (no key items).
- **Flower tiles:** found from the map models (the `hana` textures, `tools/paperwhite2/entralink_flowers.py`), 15-44 per
  clearing (none in `entree_forest_9`), in `flower_tiles.json`, editable in the editor.
- **The copies** hold no items but form items (plates on Arceus, Drives, the Griseous Orb on Giratina).
- **Memory:** the DS arena 46 KB left (from 50): overlay 12 +4.3 KB, ARM9 main +0.2 KB; at run time VRAM 544 bytes per
  bag icon (3 in an item room) and 16 marker materials (from 12).
- **Packer and editor agree** (the coordinator's points): with templates, a round with no premade room still draws; the
  repeat warnings count enemy, challenge and event rooms; a missing template is an error only when a round draws its
  type (pre_boss_rest always); flower lists keep their order, clearings by number.
- Tested in py-desmume (scratchpad `roomtypes/`): every point of the doc's test list passed. Packer tests 21, the
  editor's (merged) pass, `verify_dsi_rom.py` intact.
- **For the user:** the placeholders (templates' NPCs and lines, the item table's weights and prices), the challenge and
  event weights (no such rooms yet, so skipped), and whether a used shop placeholder should count as the choice.

## 2026-11-18: Entralink step 6, the editor side (ROM session, on a branch)

- **Built on the game side's schemas** (commit f4ea610829, merged in): room `type`, the new NPC types, `type_weights`
  and the run's chances, `items.json`, `flower_tiles.json` (patternProperties).
- **Live validation:** `editor/shared/schema.ts` takes `patternProperties` as datajson does (the first pattern found in
  a key, as `re.search`); `tests/entree-step6.test.ts` checks the editor and the build agree on flower tiles.
- **Room:** a Type picker (enemy ... event, role room only; enemy is left out of the file), the door marker following
  it unless set (`defaultMarker`); a Type filter in the room list; a type on a boss/final room is warned as unused.
- **Templates:** a Templates group under the rooms (rest, item, buff, shop, pre_boss_rest, and event if it exists),
  edited as rooms are, with a note that every generated room of the type is it; no rename, duplicate or delete; a
  missing one is listed with Make (the spec's placeholder NPCs) and in Over all rooms. Templates get progress ids too.
- **NPC types:** heal, revive, gift, shop, item_choice, buff_choice (notes, a grouped Add/Type select); people default
  to the Lady and balls to the item ball (no sprite written; the old "rest/buff need a sprite" error is gone), and new
  NPCs get a marker (heal/revive rest, gift item, shop shop, buff_choice buff) when `npc_markers/` has it. A room with
  1-2 item_choice balls is warned.
- **Run:** Premade rooms (`custom_chance`), Ground items, Hidden items; Room types: a weights table (types by rounds,
  each cell its live %, a Sum row, Defaults). With templates known, `runProblems` errors on weights summing to 0 and
  warns on types skipped for want of rooms. The Run section scrolls on its own now (sticky head).
- **Items tab** (`ItemsPage.tsx`): the table (bag icon, item, weight, rounds, price, pools), Add/remove, checks (an
  empty pool, fewer than 3 items for item room/gift, an item twice in a pool and round), each pool's chances per round
  with or without something catchable, and the Nightmare Ball's rule.
- **Flower tiles:** the grid's Edit switch (NPCs / Flower tiles) paints the shown clearing's tiles (click toggles, drag
  paints, the first tile decides), drawn pink (`MapView`'s new optional `tileMarks`); saved by the page's Save.
- tsc clean, `npm test` 249 passing. No data files committed: the game side makes items.json, flower_tiles.json and
  the templates.

## 2026-11-18: field palettes read from the archive where no capture is kept (ROM session, on a branch)

- **The gap:** a slot (wanderer or follower) whose sprite was still loaded but whose colours the capture store (8)
  had replaced drew the shared, unvaried material. Reproduced in py-desmume (scratchpad `palvar3/t_evict.py`): R
  through the party twice with ten other species, back on the lead Pignite: its capture gone, the slot unbound,
  plain. The "stock sprite an NPC loaded" case of the design note can't reach a slot: slots' codes are all follower
  codes (from `FOLLOWING_CODE_BASE`), which are always captured; the eviction is the real case.
- **The fix:** `ActorPalettes_ReadFromArchive` (`paperwhite2_actor_palettes.c`) reads the palette from the sprite's
  file in the field actors' archive by ranges (header, block offset, `NNSG3dResTex`, palette: 124 bytes), once as the
  slot's copy is made without kept colours, and keeps it as a capture. `PaperWhite2_ActorPalettes_Bind` takes the
  `MMSys` now (for the archive), not the billboard system. Same run after the fix: one read (0x37b0), the slot on its
  own material, colours equal to the reference and to the field start's. `npm test` 243 passed, DSi check intact.
- `generated/obj_codes.txt` gets the three Primal Dialga lines the main checkout had uncommitted (the build failed
  without them: `OBJ_CODE_POKEMON_DIALGA_FORM_1` unknown).

## 2026-11-18: the battle freeze after Primal Dialga, and the debug menu's forms (ROM session, on a branch)

- **The freeze:** every battle started to a white top screen, with the C-Gear still on the lower one, once the palette
  variation and Primal Dialga were merged. **Cause: melonDS DS's JIT literal optimisations** (the known issue of
  2026-11-05, below), not the game. `RetroArch-Win64/config/melonDS DS/melonDS DS.opt` (written 2026-11-07) had
  `melonds_jit_literal_optimisations = "enabled"` again, with DSi mode and the JIT on. The palette variation's code in
  ARM9 main moved every overlay, and that freeze comes and goes with where code lands. **Proof:** the same build
  (main with the uncommitted `obj_codes.txt` lines) and the user's current save (`saves/melonDS DS/paperwhite2.srm`)
  start the Entralink Dialga battle in py-desmume, and with literal optimisations off the user's battles work again,
  palette variation included. No code change. **Keep JIT Literal Optimisations off.**
- **Primal Dialga (Dialga form 1):** its data from Add form is complete. In battle the game asks for form 1's sprite
  (`GetPokemonCharacterDataNo` and `GetPokemonPaletteDataNo` hooked: species 483, form 1), the archive's file 15103
  (group 67's palette) is form_1/normal.pal, and the battle shows the Primal art. Spiky-eared Pichu, given in form 1,
  has form 1 in the party.
- **Debug menu:** Give Pokémon asks for the form after the species, only when the species has more than one
  (`DEBUG_NUMBER_FORM`, `DEBUG_ACTION_FORM_COUNT`, `GivePokemon`'s form). Encounters has **Wild form**, which Force
  species also asks for (`DEBUG_OVERRIDE_WILD_FORM`, `PaperWhite2_Debug_OverrideWilds`, which keeps form 0 for a form
  the species lacks). A form entry's range is its species' personal form count. Tested in py-desmume: Pichu form 1
  given; Dialga form 1 forced on Route 19 gave a wild double battle of two Dialga loaded as form 1 (the wanderers were
  Dialga too). plugins.md's Debug menu has them.

## 2026-11-18: palette variation in the field; wanderers' PIDs; debug Triple battles (ROM session, on a branch)

- **Wanderers' PIDs:** a wanderer's whole PID is rolled as it spawns, by the battle's own rolls
  (`FieldEncount_RollWildPID`: Cute Charm, Shiny Charm, Pass Power, debug Always shiny), kept in its `WildPkmParam`
  (`pid`, `fixedPid`) and used for its battle's Pokémon, so its sprite, battle sprite and the Pokémon caught match.
- **Own palettes:** each wanderer and the follower draw a copy of their billboard's material with a 16-colour palette
  of their own, varied by their PID (`src/paperwhite2/ov036/paperwhite2_actor_palettes.c`); the shared sheet stays
  unvaried. Two wanderers of a species differ, and the L/R switch between two same-sprite party members shows the new
  one's colours at once (the old known limit is gone). Cost: 32 bytes of palette VRAM a slot (128 at most), one
  billboard material a slot, 0x224 bytes of BSS.
- **Debug:** Encounters... > Triple battles (`EVENT_FLAG_DEBUG_FORCE_TRIPLE`, 0xbde): wild encounters of the new
  encounter data become triple battles (double or single with fewer able Pokémon), wanderers' too.
- **Tests (py-desmume, scratchpad `palvar2/`):** all of the above checked by memory reads against the reference and
  screenshots (palette-variation.md, Tests). `--hack` build without warnings, DSi intact, plain modules match, editor
  243 tests pass.
- **For the user:** the variation is subtle by design; Triple battles shows three side by side to compare.

## 2026-11-18: palette variation (ROM session, on a branch)

`docs/paperwhite2/design/palette-variation.md` has the design and the proof.

- **Game:** every Pokémon's colours turn a little by its PID's second byte (hue +/-12 degrees in 16 steps, brightness
  +/-6% and saturation +/-10% in 4 steps each, weighted so greys, white and black never change), normal and shiny,
  in battle, the summary, evolution, trade, hatching, the Hall of Fame, the PC's preview and the follower; Arceus's
  palette forms take it on top. `src/paperwhite2/main/paperwhite2_palette_variation.c`; hooks in `mcss.c`,
  `mcss_tool.c`, `btlv_mcss.c`, `hall_of_fame_demo_main.c`, `pokegra.c`, `field_actor_billboard.c`,
  `paperwhite2_following_field.c`. Settings and per-species strength (Unown, Kecleon 0) in
  `res/paperwhite2/palette_variation.json`.
- **Editor:** the Pokémon Editor's Palette variation card: strength, 16-variant preview (normal/shiny), the settings.
- **Tests:** shared vectors pass in Python and the editor (243 editor tests); the C matched the reference on every
  palette hooked in py-desmume (battle, summary, follower, shiny, Arceus form 10, Kecleon unchanged, PC box in OBJ
  palette RAM). `--hack` build without warnings, DSi intact, plain build's modules match.
- **For the user:** playtest the strengths; set other species to 0 in the card if their colours should stay (Arceus?).
  (The L/R known limit is fixed: see the entry above.)

## 2026-11-18: Entralink markers upright; the marker art in Graphics & Palettes (ROM session, on a branch)

- **Flip:** the ground markers drew with a vertical flip (the game's flat billboards put a texture's top on the south
  side; seen in py-desmume with an asymmetric "F"). Fixed in the packer (`entralink_run.marker_texture(flat=True)`
  reverses the rows), so a PNG's top is the north. NPC markers were already upright. Test:
  `test_ground_markers_are_packed_upside_down`.
- **Editor:** the ten room markers and the NPC markers are on Graphics & Palettes > Sprite sheets
  (`tools/paperwhite2/entralink_marker_art.py` lists them and checks an import; the page got a palette editor for
  sheets that say `palette: true`). New `editor/tests/marker-art.test.ts`; typecheck and 239 editor tests pass.
- **For the user:** the placeholder art is unchanged; draw yours with its top toward the north. Not yet pushed.

## 2026-11-17: the Entralink roguelike's step 5: doors, markers, round fogs (ROM session, on a branch)

`docs/paperwhite2/design/entralink-roguelike-prototype.md`, "Step 5", has the design and the proof.

- **Doors:** entering a room draws the rooms behind its north, east and west doors; the door taken decides the next
  room. Before a boss or the final room the room is in `run.json`'s `pre_boss_map` (`ZONE_ENTREE_FOREST_5` as a
  stand-in until the two-exit `ZONE_ENTREE_FOREST_10` lands) and only its north door leads on, to the boss.
- **Markers:** once a room is done (battle won; or every item/rest/buff NPC used; or nothing spawned), 2x2 icons lie
  on the ground at `run.json`'s `marker_spots`, one per door: the room's `marker` (default by role), catch when a
  catchable enemy's conditions hold and the run's bag has a Nightmare Ball, ??? by `unknown_chance` (5%). NPCs can
  have an icon over their heads (`marker`). Placeholder art in `res/paperwhite2/entralink/markers/` (32x32) and
  `npc_markers/` (16x16), packed into the model table from member 24. Own billboard system in the field heap (~2.5 KB
  while in a run), code ~2.3 KB (arena 54 KB left).
- **Fogs:** each round has its `field_weather`: pink, dark purple, black (the final room takes round 3's). A room's
  `weather` is now its battles' only.
- **Editor:** room and NPC marker pickers, per-round fog, unknown chance, marker spots (drawn on the grid; NPCs on them
  warned), pre-boss map shown.
- **For the user:** replace the placeholder icons; check the spots in play (east/west sit near the screen's edges);
  set `pre_boss_map` to the new zone when merging. Tested in py-desmume (doors, hidden-until-done, gift room, catch
  with/without the ball, unknown, pre-boss, rain in battle only, the three fogs); `--hack` build without warnings,
  DSi intact, packer tests (14) and editor tests (234) pass.

## 2026-11-17: Entree Forest 10, the pre-boss map (ROM session, on a branch)

- **New clearing** `ZONE_ENTREE_FOREST_10` (276, was the unused `ZONE_NS_CASTLE_GATE_10`), from `entree_forest_5`'s
  chunk and props, its header matching `entree_forest_5`'s; events are its north and south exits (the same exit
  scripts) without the east one. `GetZoneIsEntreeForest` takes it (`#ifdef PAPERWHITE2`), so the C-Gear, actors and
  the run treat it as the forest. Prototype doc, "The pre-boss map".
- **New Map tool fix:** `new_map.py` now copies the whole look and flags of the template's zone (it left the leftover
  gate's transition, place name display, cycling and easy level). map-editor.md.
- **For the user:** close the east opening (trees and collision around 26, 15-17) in the Map Editor; put the zone in
  `run.json` where the pre-boss room should be.
- Tested in py-desmume with a scratch `run.json` (room 1 there): loads, blank lower screen, south asks to return,
  north blocked then leads on, east does nothing. `--hack` build without new warnings, DSi intact, plain build's
  modules match, editor tests (233) pass (the Entree checks' clearing count is 7 with an up exit at 16, 9).

## 2026-11-17: no money lost in a run; custom field tints (ROM session, on a branch)

- **Money:** a run battle's loss takes no money and shows no "dropped"/"paid out" message (`CalcLossMoney` skips run
  battles); a forfeit never did; a win's money is the original's (none for a wild battle but Pay Day's). Proven in
  py-desmume: run loss 50000 to 50000; the same battle made plain, "dropped $3600", 46400. Prototype doc, "Money".
- **Custom tints:** field weathers `WEATHER_CUSTOM_TINT_1`-`_12`, data in `res/paperwhite2/field_tints/tints.json`
  (colour, strength %, `flat` or `fog`), packed into a header. They are the DS's fog in the tint's colour: flat is a
  screen fade, fog thickens with distance. Slots 1-9: black, dark purple, pink, each flat light, flat heavy, fog.
  Debug menu World > Weather lists them as "Custom tint 1"-"12"; `run.json`'s `field_weather` and the weather calendar
  take them (a room's own `weather` is a battle weather, so it can't). plugins.md, "Custom tints".
- **Correction** to the 2026-11-15 entry below: the original's tints are depth fog, and their tables are the fog's
  shift and offset, not a level and a colour.
- **For the user:** judge the nine in the forest (screenshots in the session's scratchpad `tints/shots/`); change colours and strengths in `tints.json`.
  `--hack` build without warnings, DSi intact, plain build's modules match, editor tests (233) and the conditions tests
  pass.

## 2026-11-16: the Entralink roguelike's step 4, game and editor (ROM session, on a branch)

`docs/paperwhite2/design/entralink-roguelike-prototype.md`, "Step 4", has the design and the proof.

- **The run:** `run.json` is 3 rounds of 3 rooms, rounds 1 and 2 ending in a boss, then the final (12 rooms). The
  user's rooms are in: Prince or Princess (generic), Seaside Gales (`ho_oh.json`, round-1 boss), Time and Space
  (round-2 boss). **The draw** now repeats rooms when it must: each place takes, at random, one of the least used
  fitting rooms other than the room just before (so no repeat while an unused room fits, never twice in a row unless a
  round has one room); a round's boss comes from the bosses kept to it, else the generic ones. The packer and the
  editor agree: errors only for a round with no room, a boss round with no boss, no final; warnings for repeats.
- **Window styles** for room dialogue, per message (`before_style`, `after_style`): talk (`ActorMsg`), bubble
  (`InfoMsg`), yell (`ActorMsg`'s spiky frame), event (`SystemMsg`, through a new `PaperWhite2_SystemMsgStrBuf` in
  `scrcmd_msg.c`); one generic script path (`ENTRALINK_RUN_ACTION_SHOW_DIALOGUE`, then `MsgWinCloseAll`).
- **The bag:** in a run the TMs, Key Items and Free Space pocket buttons are greyed (a grey palette in the lower
  screen's free OBJ palette 15).
- **Editor:** the Entree page's Run section has Rounds (add/remove, rooms, boss, the live pool summary), the maps read
  only, the draw's checks, and Hide; each dialogue box a Window switch, its preview drawn in that window
  (`TextBox`'s new `look`: talk and yell with their tail, the spiky frame, the dark system window).
- **Tested** (py-desmume): ten seeded draws all right and all different; a full run (below); each style on screen;
  the greyed buttons. Packer tests, editor tests (233), DSi check. The full run went through all 12 rooms in order to
  the hub (the two boss rooms opened by poking, the harness can't win double or triple battles).
- **For the user:** the room data came from your uncommitted edits in the main checkout (`ho_oh.json` as Seaside Gales,
  `prince_or_princess.json`, `time_and_space.json`, `progress_ids.json`); Prince or Princess is a generic room there,
  not a boss. No room uses a style yet: pick them in the editor.

## 2026-11-15: the debug menu's Weather lists every field weather (ROM session, on a branch)

World > Weather: now has all 15 (it stopped at Diamond dust): the 9 before, then White mist (`WEATHER_TINT_9`), Tint
10 and 11, Sandstorm 2 (desert), Tint 13 and 14 (the Entralink's). It sets the field's weather at once and keeps it
(any map, indoors too) until Off. For a dark, foggy look to compare (looks only, battle effects follow the weather's
group):

- **The tints** (`src/ov078/weather_tint.c`) fade the whole screen to a colour at a level taken by the camera's defaults
  index (34 of them). Almost all are near-white at level 8 (`0x7f5f`), so Tint 10, 11, 13 and 14 look like clear on
  most maps (seen on Castelia's street, DeSmuME); the dark ones are index 10 (black, level 1) and 24 (dark brown,
  level 4), so a darker look needs a camera with those, or a new table entry. White mist (9) is a true white fog.
- **Known limits:** none crash by the code (every weather is a `WeatherData` on archive 0x37, any exterior), but the
  weather system doesn't check for interiors, so indoors rain and snow fall inside; the sandstorms and tints have no
  per-zone setup. No separate fog or cave-darkness list: those belong to the zone's fog and the camera, not a weather.
- **Proof:** py-desmume (user's save, a copy): list shows all entries; White mist fogs the screen; Tints 10 and 13
  set without a crash. Looks to be judged by the user.

## 2026-11-15: the Entralink roguelike's step 3, game side (ROM session, on a branch)

`docs/paperwhite2/design/entralink-roguelike-prototype.md`, "Step 3" and "The room format", has the design, the proof
and the gaps; merged with the editor's step 3 (below).

- **Rooms:** the game reads `rooms/` (`challenges/` gone); `run.json` is now `rounds` (rooms per round, optional
  bosses), the maps and `field_weather`. Several battles per room (one won: the room opens, every battle NPC goes),
  item NPCs into the run's bag, rest/buff NPCs' dialogue or a placeholder, `requires` and `chance` rolled on entry, a
  room with no battle NPC open at once, sprites, dialogue packed into the script text bank `entralink_dialogue`
  (`{0100:0}` is the player's name). A room's `weather` shows on the field too.
- **No event flags or variables:** the run's state is RAM only (0x405b-0x405d free again); "run completed" is the
  progress block's run count, `requires: ["run/completed"]`.
- **The run's bag:** `GameData`'s bag swapped for an empty RAM bag (32 items, 16 medicine, 16 berries), as the party is;
  the bag screen shows only those pockets; Give/Take and the battle's bag use it; the real bag untouched.
- **Progress in the save:** the Symbol block (0x850 B, same place and size) holds magic, version, runs completed and
  the won/caught bits by progress id; an old save's forest data is cleared on first read; the forest's old code gets
  an empty forest in RAM.
- **The Nightmare Ball** (unused item 126, Dream Ball placeholder icon and look): catches as a Master Ball only an
  enemy whose `catch` holds, into the real party or a Box at its own level; every other case refused.
- **The back door** asks "Return to the Entralink?" (Yes ends the run as a forfeit, No steps back).
- **Proof:** py-desmume with two temporary test rooms: spawning by requires/chance, rain on the field and in battle,
  two NPCs for one battle with before/after dialogue, the other battle's NPC gone, a free room, item NPCs and the run's
  bag (pockets, Give/Take, emptied, the real bag byte for byte), the ball refused (no catch, `after` unmet, `once`,
  a Poké Ball) and catching Dialga into a Box at level 70, the progress through a save and a reload, the back door's
  Yes and No. `--hack` builds without warnings, DSi intact, the plain build's modules match, the packer's and the
  editor's tests pass (232). DS arena: 58 KB left (about 5 KB used).
- **For the user:** which Nightmares can be caught (no real room has a `catch` yet) and where the Nightmare Ball is
  found; the ball's icon to draw; the placeholder texts.

## 2026-11-15: the Entree Editor's dialogue, catching, progress ids and run weather (ROM session, on a branch)

"The room format" (In the editor, step 3) has the details; the game side of the same spec is a separate branch.

- **Schemas:** `room.schema.json` gains `npc.dialogue` (`before`, `after`; `x-message: "game"`, real line breaks as the
  trainers' messages), `npc.requires` (replacing `flag`: `"<room>/<battle>"` keys and `"run/completed"`),
  `enemies[].catch` (`after`, `once`), `progress_id` on battles (required, 0-1023) and catchable enemies (0-511);
  `run.schema.json` gains `field_weather` (the calendar's `WEATHER_*` enum); new `progress_ids.json` and its schema.
  The four converted rooms have battle ids 0-3; `progress_ids.json` is at 4 / 0.
- **Editor:** dialogue boxes with preview, wait/new-page buttons, Fit to the window and width/scroll warnings
  (`text/DialogueField.tsx`, `message.ts` checkMessage/fitMessage); catch toggle, Only after, Only once; Spawns after;
  ids given on Save, shown read-only; keys follow battle and room renames; Run section with the field weather.
- **Tests:** `tests/entree-progress.test.ts`, `tests/dialogue.test.ts`; typecheck clean, 232 tests pass.

Open: which word buffer the compiled dialogue fills with the player's name (the box has no Player's name button
until the game side decides); the game helper's schema wins on field names if it differs.

## 2026-11-15: the Entralink roguelike's level-100 team and forfeit (ROM session, on a branch)

`docs/paperwhite2/design/entralink-roguelike-prototype.md`, "Step 2", has the design, the proof and the gaps.

- **The team:** a run plays with copies of the party at level 100 (stats recalculated, healed; eggs untouched), kept in
  ARM9 main; `GameData`'s party pointer points at them for the run, so every screen, the follower and the battles show
  them. HP, PP and status carry between rooms. The real party stays in the save's party block, untouched, so **any
  save writes the real party** (and nothing in the run's zones can save anyway). Any end (Darkrai, a loss, a forfeit,
  a map load outside the forest such as the debug warps) puts it back as it was, with prestige written back.
- **Prestige:** a copy of a level-100 Pokémon gains prestige in run battles and keeps it; copies of the others gain none.
- **Forfeit:** RUN in a run's battle asks "If you run, you'll wake from the nightmare and your run will end. Run
  anyway?" (`res/text/system/0019.txt`); Yes always escapes, past traps and Smoke Ball, and ends the run ("You turned
  away from the nightmare and woke up...", `global_10490.txt`); No returns to the menu.
- **Proof:** py-desmume on the user's save copy: the copies' levels, stats and healing, the egg; PP carried from room 1
  to 4; prestige gained (level-100 copy only) and written back after Darkrai; the real party byte for byte after a win
  (apart from prestige), a loss and a forfeit (against a Speed 999 Shadow Tag foe, No then Yes); a party of one left
  by the debug warp. `--hack` builds without warnings, DSi intact; plain `modules.ok` passes.

Decide: held items taken from or given to a copy in the party screen (duplicated or lost at the run's end), and bag
items (stones, Rare Candy) used on copies; hiding the party screen's Item command in a run would do until the run bag.

## 2026-11-15: the Entree Editor and the room format (ROM session, on a branch)

`docs/paperwhite2/design/entralink-roguelike-prototype.md`, "The room format", has the format and its checks.

- **Data:** `res/paperwhite2/entralink/rooms/<id>.json` with `room.schema.json`: a name, optional rounds (1-3; none =
  any round), a role (room / boss / final), optional battle weather (none = random), battles (id, format, enemies) and
  NPCs (battle / item / rest / buff, which battle and which enemy it shows, item and count, sprite override, flag,
  chance, tile and facing). No map per room: the game will pick the clearing by the door taken. The prototype's four
  challenges are converted; `challenges/` and `run.json` stay until the wiring step (game and packer untouched).
- **Editor:** the "Entree" page (`editor/src/modules/entree/`): rooms listed and filtered by round and role (new,
  duplicate, delete, rename); the clearings' shared grid in the Overworld Editor's map view, overhead, with a chosen
  clearing faint behind it (`MapView`'s new `modelOpacity`), its exits and blocked tiles, NPCs as their sprites (click,
  drag, Shift+click to add); headed sections Room, Battles, NPCs and the checks. Saving writes through the build's
  validator; deleting is allowed for room files only (`server/weather.ts` `removable`).
- **Checks:** `tsc` clean; `tests/entree.test.ts` passes. `npm test`: 223 of 224, the other is
  `scriptlang.test.ts` failing on the prototype's `global_10490.s` script 8 (reopens differently), from before this work.

Next: wire the game and the packer to `rooms/` (rounds, roles, NPC types, chances, flags), then drop `challenges/`.

## 2026-11-15: the Entralink roguelike's first prototype (ROM session, on a branch)

`docs/paperwhite2/design/entralink-roguelike-prototype.md` has what was built, the data format, the proof and the gaps.

- **The hub** is cleared (no monolith event, no tutorial, one NPC who takes the player home). The way in is the debug
  menu's Player... > Entralink (outdoors, where vanilla allowed the Pass Power warp).
- **A run:** walking off the hub's top edge starts it. Rooms 1-3 are Dialga, a Rayquaza 3v1 raid and Ho-Oh in a random
  order, in `entree_forest` / `entree_forest_6`; room 4 is Darkrai in `entree_forest_2`. Talking to a room's enemy
  starts its battle; exits stay shut ("A nightmare blocks the way.") until it's won. Winning Darkrai, losing or running
  away ends the run at the hub's entrance (a loss heals). Balls are refused. The raid's Rayquaza stands in the center.
- **Data:** `res/paperwhite2/entralink/run.json` and `challenges/<id>.json` (schemas beside them), packed by
  `tools/paperwhite2/entralink_run.py` into a generated header. New script command 0x2f8 `EntralinkRun`; `Debug` is now
  0x2f9. Run state: variables 0x405b-0x405d.
- **Re-entry:** re-entering the same map works as a fresh room (tested by forcing two rooms into `entree_forest`).
- **Proof:** py-desmume on the user's save copy: a full run through all four rooms to the hub, three random orders, the
  raid's positions (enemy at 3, 1 and 5 empty) and target screen, blocked exits, a loss, a flee, a refused ball, the hub
  NPC's warp home, a new run after a lost one. `--hack` builds without warnings, DSi intact; plain `modules.ok` passes.

Next: the user's playtest; then level 100 battle copies, the run's own flee warning and ball message, a real save.

## 2026-11-15: Fairy step 2's skipped cases tested; Shed Shell fixed (ROM session, on a branch)

`docs/paperwhite2/design/fairy-type.md` section 12.4, "The skipped cases, tested", has each case and its proof.

- **Pass:** Fairy Lock wears off the turn after (switch and Run work again), blocks Run ("Can't escape!"), and lets a
  Ghost type, Run Away and the Smoke Ball flee and U-turn, Baton Pass and Roar work; Teleport fails under it. Crafty
  Shield lets Thunder Shock, Perish Song and Spikes through, blocks two Pikachu's Growl on both allies in a double while
  the ally's own Swords Dance goes through, and fails when used last. Flower Shield fails with no Grass type and in a
  double raises the Grass ally and both Grass foes, not the non-Grass user. The Pixie Plate given in the party screen
  makes Arceus form 17 (summary: FAIRY, the form's palette), taken back form 0 (NORMAL).
- **Fixed, an original bug:** a Shed Shell holder in the lead could never switch, trapped or not ("can't be switched
  out!"): `CanMonSwitch`'s Shed Shell branch leaves `trapMonId` unset and the stale 0 matched the lead's ID, which the
  party list reads as a blocked switch. `btl_client.c` sets it under `BUGFIX` or `PAPERWHITE2` (`// BUG:`); Shed Shell
  now switches with no trap, under Mean Look and under Fairy Lock. DSi check intact.

Next: the PC's give and take of the plate and the Pokédex are still untested.

## 2026-11-15: Flower Shield, Fairy Lock, Crafty Shield, the Pixie Plate and Arceus-Fairy (ROM session, on a branch)

`docs/paperwhite2/design/fairy-type.md` section 12.4 has what was built and the proof; `items.md` the Pixie Plate;
`moves-and-abilities.md` section 17 the engine pieces.

- **Moves 574-576**, Gen 6's rules: Flower Shield ("FlowerShield": every Grass type on the field, both sides, Defense
  +1, fails with none), Fairy Lock (a 2-turn field condition: no switching or fleeing next turn, Ghost types exempt,
  Shed Shell / Run Away / Smoke Ball still work), Crafty Shield ("CraftyShield", +3: the user's side is protected from
  status moves for the turn; fails if used last, never for being used in a row). New: a field condition and a side
  condition slot, messages in banks 18 and 19. Nothing learns them: no Gen 1-5 species does in Gen 6 that I know.
  Metronome can call all three (Gen 6 excludes Crafty Shield).
- **Pixie Plate** (item 125): Fairy moves ×1.2, Judgment Fairy, a Multitype Arceus Fairy and in **form 17** (not 18,
  so there is no dead ??? form; Gen 6's number too). Add form now takes palette-only species: Arceus's form 17 "Fairy"
  was made with it; its palettes follow the hack's sprite groups (`PAPERWHITE2_PALETTE_FORM_FILES`).
- **Placeholders for the user:** the Pixie Plate's icon palette (a copy of the Mind Plate's); Arceus-Fairy's
  `res/pokemon/arceus/form_17/normal.pal`, `shiny.pal` and its followers (copies of the Psychic form's).
- **Proof (light, as asked):** Flower Shield raised a Bulbasaur user's and a wild Oddish's Defense; after Fairy Lock a
  switch gave "Oinkums can't be switched out!" (the same switch without it worked); Crafty Shield blocked a Pikachu's
  Thunder Wave ("Crafty Shield protected Oinkums!"); an Arceus with the plate shows FAIRY and the form's palette in the
  summary and in battle, and its Judgment was ×1.2 and super effective on a Dragonair. ROM `b9835c51…`, DSi check intact,
  plain build's code modules match.

Next: the user's picks (learners for the three moves, where the Pixie Plate goes, Crafty Shield and Metronome), the
art; untested paths are listed in section 12.4.

## 2026-11-15: the Fairy moves, the Roseli Berry and the Fairy Gem (ROM session, on a branch)

`docs/paperwhite2/design/fairy-type.md` section 12 has the research, what was built and the proof; `items.md` the two
items; `plugins.md`'s Fairy type the code's map.

- **Moves 566-573, all data** (`moves.py add`): Fairy Wind, Disarming Voice ("Disarm Voice"), Draining Kiss ("Drain
  Kiss"), Play Rough, Moonblast, Dazzling Gleam ("Dazzle Gleam"), Baby-Doll Eyes ("BabyDollEyes"), Aromatic Mist
  ("Aroma Mist"): Gen 6's numbers, borrowed animations and AI effects, our own descriptions. Five names shortened to
  12 characters; their constants keep the full names.
- **Learnsets:** 17 species by level (the Clefairy, Jigglypuff, Marill, Snubbull, Ralts and Cottonee lines, Togetic,
  Mawile, Eevee, Teddiursa), Teddiursa's egg Play Rough, and Dazzling Gleam at the Lentimas Town tutor (10 Blue
  Shards) for 30 species, Gen 6's TM99 learners that I'm sure of. Unsure levels and later-generation choices are
  marked in the design. Aromatic Mist has no Gen 1-5 learner in Gen 6, so nothing learns it yet.
- **Items:** the Roseli Berry (123, Berries pocket) and the Fairy Gem (124), with the resist Berries' and the Gems'
  common handlers and `TYPE_FAIRY`; placeholder icons (the Pecha Berry's; the Gems' icon with the Psychic Gem's
  palette); not placed in the world (debug Give item 123, 124).
- **Proof (py-desmume, the user's save):** Moonblast, Fairy Wind, Dazzling Gleam and Disarming Voice super effective
  on a Dragonair, with Moonlight's, Silver Wind's, Flash's and Hyper Voice's animations; Dragon Tail doesn't affect
  Clefable; Draining Kiss healed 75% (13 → 10, 25 → 19); Disarming Voice never rolls accuracy and hits both foes in a
  double battle, as Dazzling Gleam does; Play Rough's Attack drop (forced); Baby-Doll Eyes moved before a faster
  Snorlax; the Roseli Berry halved Moonblast (54 → 27) once, the Fairy Gem raised it by half once (27, then 19); the
  summary and the Pokédex's move list show the moves with the FAIRY label; the bag shows both items. The plain build's
  code modules still match. Shots in the scratchpad's `fairymoves/shots/keep/`.
- **Noticed, not changed:** the Pokédex Info opened from a party Pokémon's summary listed another party member's
  learnset (slot 3's) when the slot's species had been changed in memory (a test artifact, perhaps not a bug); Aromatic
  Mist in a single battle shows "used" and nothing else, not Gen 6's "But it failed!".

Next: the user's picks (Aromatic Mist's learners, Play Rough at a tutor, the unsure levels), then Flower Shield, Fairy
Lock and Crafty Shield (C, researched in section 12.1), then the Pixie Plate and Arceus-Fairy.

## 2026-11-15: the Pokédex Info page's type labels flickering on the way to Area (ROM session, on a branch)

The user saw the FAIRY label on the Info page's top screen flicker on changing tabs, mostly around Evo, not every
time. plugins.md's "The type icons as Area's map opens" has the mechanism.

- **Cause, proven:** Area's map takes the entry's text (`PokedexInfo_FreeText`), which freed the shown type labels at
  once; Area's opening loads for about 8 frames in one update, and its places' and box's characters went into the
  labels' VRAM in that update while the old OAM still showed the labels: 2-3 frames of the map's markers in place of
  PSYCHIC and FAIRY (Gardevoir: Stats, Data, Moves, Evo, Area, frames 10-12 of the change). Not Fairy's own doing:
  Masquerain's BUG and FLYING did the same on the same ROM. It happens when the labels were last loaded at the top of
  the used VRAM, which coming to Evo from Data or Moves does; the Fairy retypes' extra labels moved those places.
  Not the label's resource (its mapping is set to the engine's at load, as every label's), not its palette (rows 2-4
  never change), not a slot or VRAM shortage (no failed allocation, 360+ free blocks).
- **Fix:** `src/ov296/pokedex_info.c`: the labels are hidden in the other slot and freed a frame later, with a change's
  hidden set (`PokedexInfo_FreeOtherSlots`).
- **Proof** (py-desmume, the scratchpad's `fairyflk/`; each frame's OAM over the labels checked against the 26 label
  members' characters, and every allocation at 32 slots trapped): the same steps before and after
  (`shots/proof_evo_area.png`, and Masquerain's in `shots/proof_masquerain.png`). Before, random runs of tabs, D-pad,
  L/R, Up/Down and Evo taps showed it 2 times in 120 actions and 2 in 150; after, none in 700 random actions from
  Gardevoir through the neighbouring Pokémon (Fairy and not), nor in 62 actions on every tab of a party of Clefable,
  Gardevoir, Togekiss, Azumarill, Mawile and Flaaffy from the summary's INFO; no failed allocation. Peak 32 slots for a
  frame (Area's opening holding the labels, Evo's Up/Down and family taps, with a dual type), never 33.
- **Also found:** the page now peaks at 32 of the ClAct system's 32 character slots for a frame (with a dual type, since
  the 18th Matchups label; 31 before): no room is left for another resource on the page.

## 2026-11-15: the Fairy type foundation (ROM session, on the `fairy` branch)

`docs/paperwhite2/design/fairy-type.md` §0 has what was built and the placeholders; `plugins.md`'s "Fairy type" the
code's map. Five commits, steps 0-4 of the design's build order, with its recommendations: Gen 6's Steel change in,
Charm / Sweet Kiss / Moonlight Fairy, Hidden Power never Fairy; Arceus, Fairy items, Gen 6 stat changes, the PWT's
Type Expert and the type medals out.

- **Built:** `TYPE_FAIRY = 18` (after `TYPE_NULL`), the 19 x 19 chart, the type name banks' message 18 (17 a "???"
  placeholder), Easy Chat's types capped at 17 (`pms_words.h` unchanged), the four out-of-bounds guards (type medals,
  PWT main type and simulated matches, Hall of Fame) and Cheren's 171 messages from the chart
  (`tools/paperwhite2/cheren_type_text.py`), the label (`a/0/8/2` 182) on every screen, the battle button palette
  (`a/0/1/1` 572), the HUD wedge colors, the preview, the Pokédex search's Fairy row, 22 species and 3 moves retyped.
- **Proof:** hack build DSi-intact; the plain build's 350 code modules all match (its archive and SHA1 failures are the
  hack's data, as before); `compile_all.py` fails only on hack files it compiles without the hack's define, as before;
  the editor's tsc, tests (only the known Applin rig failure) and vite build pass. In py-desmume with the user's save:
  summary, box, bag, Pokédex entry, Matchups, search by Fairy, and battles (Dragon into Fairy no effect, Fighting
  resisted, Poison super effective, Ghost and Dark neutral on Steel, Roost on Togekiss then Earthquake hits,
  Conversion 2 choosing Fairy). Screenshots in the scratchpad's `fairy-build/shots/`.
- **Found and fixed:** the bag's actor unit was full with an 18th type label (an assert on changing pockets); it is 55
  under `PAPERWHITE2`.
- **Placeholders for the user:** the FAIRY label (`res/graphics/app_menu_common/182.png`, 32 x 16, `033.pal` row 2's
  colors 8 and 9), the move button palette (`res/graphics/btlv/572.pal`, colors 8-13) and the HUD wedge's two colors
  (`paperwhite2_type_icons.c`); the Hall of Fame uses Psychic's particles and plate for Fairy.

Next: the user's art; a fresh-save playtest of Fairy matchups; later Arceus's Fairy form and the Pixie Plate, Fairy
items, new Fairy moves, Gen 6 stat changes, a chart editor page.

## 2026-11-15: the Shop Editor and every shop's goods as data (ROM session, on a branch)

docs/data.md's Shops and editor/README.md's Shop Editor have the details.

- **Data:** `res/field/shops/` (a JSON and schema per kind): `poke_mart.json` (shop 255's six badge tiers, checked
  against `BADGE_SHOP_DAT_IDS`), `marts.json` (shops 0 to 25, named after where they are: the Pokémon Centers' second
  clerks, Shopping Mall Nine's counters, Driftveil's market), `special_marts.json` (239–242, 247–250: no script opens
  them, empty), `bp_shops.json` (253/254, BP prices) and `move_tutors.json` (243–246, shard prices, menu places).
  `tools/data/shop_data.py` packs `a/2/8/2`/`a/2/8/3` for both builds; the hack's build writes the BP and tutor C tables
  from the JSON (`paperwhite2/shops_config.h`; `scrcmd_shop.c` under `PAPERWHITE2`, `paperwhite2_move_tutors.c`), the
  matching build keeps scrcmd_shop.c's. `species_data.py` takes the tutor bits from `move_tutors.json`.
- **Proof:** with the data unchanged the hack ROM is `92194b47…` as before (DSi intact); the marts' archives match the
  ROM's; the species archives are byte-identical to the old packer's; the plain build's modules all match (its archive
  and SHA1 failures are the hack's imported data, as before).
- **Editor:** the Shop Editor (`editor/src/modules/shops/`): shops by kind, the Poké Mart a section per tier, item icons
  and pickers, drag to reorder, BP and shard prices, the tutors' moves with the species that learn them; removing or
  replacing a tutor move that species learn changes their tutor lists too, after asking.
- **In game** (py-desmume, scratchpad `shops/`): a test build with the 3–4-badge tier's Poké Ball changed to a Rare
  Candy (and, for the test only, Castelia's second clerk opening shop 255, since the harness couldn't reach the first
  clerk) listed Rare Candy ₽4800 first; both changes reverted.
- **Join Avenue's shops** stay in the Join Avenue Editor: they aren't this system (no script opens them with
  `CallFriendlyShopBuy`; their goods are rows of `a/2/4/4`, sold by the avenue's own code).

Next: the user's own edits; the special marts could be opened by a script if wanted.

## 2026-11-13: new moves and abilities, step 5: the Applin line's real moves and abilities (ROM session, on a branch)

design/moves-and-abilities.md section 15 has the details; new-species.md section 18.2 marks every stand-in replaced.

- **Added:** Body Press 562 (attacks with Defense), Fickle Beam 563 (30%: double power, "…is going all out for this
  attack!"), Dragon Cheer 564 (every ally's critical-hit stage +1, +2 for Dragons; a new target kind; fails without an
  ally), Syrup Bomb 565 (a new condition: the Speed falls at 3 turn ends while the user stays in); Sweet Syrup 166 (the
  adjacent foes' evasion -1 on entering, once a battle, no field effect) and Ripen 167 (Berries' HP, stat stages,
  attacker damage doubled, resist Berries a quarter). Rules in `src/paperwhite2/ov167/paperwhite2_battle.c`, small
  pieces for a later effect designer.
- **Applin line:** Ripen / Sweet Syrup in slot 1, the real moves in the learnsets, Dipplin evolves knowing Dragon Cheer.
  Pokémon saved before keep their stand-ins (no fix on load).
- **Proof** (py-desmume, scratchpad `moves5/keep/`): each move and ability in battle with numbers (Body Press's attack
  stat 150 = Defense, 300 at +2; Fickle Beam ×2 when forced; Dragon Cheer +1/+2 in doubles and triples, failing in
  singles; the syrup's three Speed falls, none after a switch; Sweet Syrup once; Sitrus 250 vs 125, Oran 20, Liechi +2,
  Occa 198 vs 396 damage), Metronome into each, and a Dipplin knowing Dragon Cheer evolving into Hydrapple. ROM
  `905ca4cc…`, DSi intact; the plain build's modules match.

Next: the user's playtest; later steps (section 9, step 6): blocks / an effect designer, custom animations, Fairy.

## 2026-11-13: the Spiky-eared Pichu: female, a Zap Plate, and never sent back (ROM session, on a branch)

design/pokemon-center.md's "The Spiky-eared Pichu: female, its Zap Plate, and kept back" has the details.

- **Female with a Zap Plate**, as in HeartGold and SoulSilver: `special_reward.gender` (`male`/`female`/`random`, new in
  the schema and generator, `WONDER_TRADE_SPECIAL_SEX`) goes to `PML_GenPID`'s sex, so the PID agrees with the sex;
  still never shiny. `held_item` is `ITEM_ZAP_PLATE`.
- **The easter egg:** `wonder_trade.never_tradeable` (species and form; Pichu form 1) gives
  `WONDER_TRADE_CHECK_NEVER_TRADEABLE`, checked before the excluded species and the held item, and the attendant's new
  lines `Global10100_Text_WonderTradeNeverTradeable` (the Pichu came from another time through the tube; sending it again
  could be dangerous; it should stay with the player).
- **Proof** in py-desmume on a copy of the user's save, real build: the 30th trade gave a female form-1 Pichu (PID low
  byte below 127) holding the Zap Plate, the player's OT/TID/SID, not shiny, checksum valid, from the party and from a
  Box; offered back from both, the new lines and nothing taken; a form-0 Pichu still gets the fee question. Shots in
  scratchpad `spiky/shots/`.

## 2026-11-13: editor follow-ups: the art zip's icon and follower, Follower cards, Don't mirror (ROM session, on a branch)

- **Export art (.zip)** also has the party/box icon (`icon.png`, a 2x preview, `icon_palette.pal` and the README's note
  on its bank) and the follower's walking sprite sheets (`follower/<code>.png`/`.pal`, 3x previews, the rows listed in
  the README). Import takes the icon back (checked as the form icon import, an original group in its table's bank);
  the follower sheets are export only (no checked overworld sprite import yet). battle-sprites.md section 14.
- **Follower card** on every species' and form's page: the follower rows, the walking sprite each shows with a picker
  and preview, and Open in the Follower Editor (`&form=N`). The Follower Editor draws walking sprites a row names.
- **Don't mirror (asymmetric)** on species and form pages; a form without a record gets one first. Every reader of the
  flag already loads the form's data (forms-and-species.md section 11.10); **the Spiky-eared Pichu has a record now,
  asymmetric**: its Info page and list row show it as drawn, the plain Pichu still mirrored (py-desmume).
- **Proof:** Python 16 battle-sprite tests, all 724 groups exported and imported unchanged; editor typecheck, tests,
  vite build; CDP shots and an end-to-end on a scratch copy (a row's sprite picked and saved; Unown's form 1 toggle
  made its records and set the flag). Shots in scratchpad `followup/shots/`, emulator shots in `followup/emu/shots/`.

Open: the trade and the musical stage with the Spiky-eared Pichu weren't run; overworld sprite import (a checked PNG
import for walking sprites) would let the zip's follower sheets come back.

## 2026-11-13: new moves and abilities, step 4: the Move Editor, the Ability Editor, Add move and Add ability (ROM session, on a branch)

design/moves-and-abilities.md section 14 has the details; editor/README.md the pages.

- **Move Editor** and **Ability Editor** under Editors: every move and ability in headed sections (basics; effect with
  the fields the quality reads and the flags as checkboxes; battle: animation, "works like", AI effect, and "This one
  has battle code in src/paperwhite2/ov167/paperwhite2_battle.c" for Grav Apple and Bulletproof; text; who learns or has
  it, with links to the Pokémon and Trainer Editors).
- **Add move / Add ability** from a template or blank, with a dry run and warnings (rules the battle checks by the
  template's ID; the pledges' handlers refused); **Retire** (hidden from every picker) and **Remove** (last only).
  Tools: `moves.py` and `abilities.py` `json`, `uses`, `add`, `remove`, `retire`, `unretire`
  (`tools/paperwhite2/battle_entries.py` shared); the server reconfigures after a change of a list.
- **Mold Breaker's added list is generated** from `"mold_breaker_ignores"` (Bulletproof's set), replacing the hand-written
  one: ROM unchanged.
- **Proof:** Python 21 tests, editor 119 tests, typecheck, vite build; end to end, Test Move (562) added in the editor from
  Tackle with Body Slam's animation and given to Snorlax at level 30: the wild Snorlax knew it, the lead's summary
  listed it, "Oinkums used Test Move!" with Body Slam's animation (effect 34) and 13 damage; removed in the editor, plain
  `ninja` gave main's `d87b0aca…` again. Shots in scratchpad `moves4/shots/`.

Next: step 5, the Applin line's remaining moves and abilities (section 14.4 says how to add them).

## 2026-11-13: new moves and abilities, steps 2 and 3: Apple Acid, Grav Apple, Bulletproof (ROM session, on a branch)

design/moves-and-abilities.md section 13 has the details.

- **Apple Acid** (move 560, data only: Grass special 80, Sp. Def -1, Energy Ball's animation), **Grav Apple** (561:
  physical, Defense -1, Seed Bomb's animation, ×1.5 power under Gravity in `paperwhite2_battle.c`), **Bulletproof**
  (ability 165: no effect from ball and bomb moves, popup and "It doesn't affect…"; Mold Breaker ignores it; the AI's
  `basic.s` avoids the moves; the Move Effectiveness Preview shows them immune).
- **`MOVE_FLAG_BALLISTIC`** (bit 14) on the 22 Gen 5 ball and bomb moves, as data; the editor offers it.
- **Bank 16's "X used Y!"** had no lines past Fusion Bolt: `\from{added_moves.used}` writes them for every added move.
- Handler commands and message kinds named in `btl_handler.h` (`BATTLE_HANDLER_*`).
- The Applin line: Flapple's Grav Apple, Appletun's Apple Acid and Applin's hidden Bulletproof replace their stand-ins
  (new-species.md 18.2).
- **Proof** (py-desmume, `moves2/shots/`): Apple Acid 16 damage and "Special Defense fell!"; Grav Apple 33 without
  Gravity and 48 with it (power ratio ×0x1800 logged, max damage roll forced), "Defense fell!"; Bulletproof blocked
  Shadow Ball, Seed Bomb and Energy Ball with its popup, Tackle hit, Mold Breaker's Shadow Ball hit; the preview grey for
  the three; Metronome forced to 560 and 561 ran both; the summary's names, data and descriptions. ROM `d87b0aca…`,
  `verify_dsi_rom.py` intact, plain modules match. Without the three entries and the flags the ROM is main's
  `ff789030…`; with the flags kept only the 22 flag bytes (and the DSi digests over them) differ.

Next: step 4, Add move and Add ability in the editor (section 13.5 lists what it needs).

## 2026-11-13: new moves and abilities, steps 0 and 1, the foundation (ROM session, on a branch)

design/moves-and-abilities.md section 12 has the details.

- **Step 0:** the battle's events, event variables and factor types are named in `include/battle/btl_event.h`
  (`BATTLE_EVENT_*` 146, `BATTLE_EVENT_VAR_*` 81, `BATTLE_EVENT_FACTOR_*` 8; swan has none, so the names are ours, from
  the server functions that fire each and what handlers read), and every literal use in ov167 and ov169 spells them.
  The objects of both versions are identical before and after; the plain `w2_us` modules match.
- **Step 1:** moves append to `generated/moves.txt` from 560 and abilities to `generated/abilities.txt` from 165 (up to
  255), with nothing hand-kept: `tools/data/move_list.py`, `ability_list.py`; `tools/paperwhite2/moves.py`,
  `abilities.py` (`info`, and the generated `moves_config.h`/`abilities_config.h`); the hack's fields `animation`
  (required for an added move) and `handlers_like`; Easy Chat's move and ability words stay the original 560 and 165.
  Hooks: an added move's animation in `BtlvEffect_StartMove` (and its queue), "handlers like" in `MoveEvent_AddItem` and
  `AbilityEvent_AddItem`, the ability table's whole length (was `0x9e`), Metronome over every move (was `0x230`), the
  condition list's whole length (was 35). `CONDITION_ID_COUNT` is left to step 5 (it sizes `BattleMon`).
- **Proof:** the `--hack` ROM is `ff789030223a1c4777c070fc539f03604e0c415b` before and after; `verify_dsi_rom.py`
  intact; a dummy move (560, Energy Ball's) and ability (165, like Overgrow) packed and generated as expected and
  removed again to `ff789030...`; `python3 -m unittest tools.paperwhite2.test_moves_abilities` (12 tests).

Next: step 2, Apple Acid and Grav Apple (section 12.5).

## 2026-11-13: new species, step 6, the Applin line (ROM session, branch from `new-species`)

design/new-species.md section 18 has the details and the stand-ins table; items.md the apples.

- Added with `pokemon_species.py add --from SPECIES_BUDEW`: Applin 687 (No. 840), Flapple 688 (841), Appletun 689
  (842), Dipplin 690 (1011), Hydrapple 691 (1019), Grass/Dragon, their Gen 8/9 stats and data in Gen 5's fields,
  learnsets, evolutions, in the Pokédex and the Wonder Trade.
- New items: Tart Apple, Sweet Apple, Syrupy Apple (unused items 120-122), evolution items used from the bag like stones
  (data only). Dipplin → Hydrapple: level up knowing Focus Energy (Dragon Cheer's stand-in).
- Followers: Applin, Dipplin and Hydrapple use the user's walking sprites; Flapple and Appletun Budew's copies.
- The editor's species tool tests no longer use Applin/Flapple as scratch names (they exist now).
- Proven in py-desmume: debug Give Pokémon/Give item, summaries (840, 1011, 1019), the three apples (and "no effect"),
  Hydrapple only with Focus Energy, the National list 840-842, 1011, 1019 and Info pages, followers, a battle. ROM
  `ff789030...`.

**For the user (placeholders and stand-ins to replace):**
1. **Art:** battle sprites (front/back sheets and rigs in the Rig Editor), icons, stills and footprints for all five
   (now Budew's); Flapple's and Appletun's walking sprites (their followers are Budew's); shiny palettes for the walking
   sprites; the apples' icons (now the Rindo, Sitrus and Tamato Berries').
2. **Cries:** each species plays Budew's (the Cry card's WAV import).
3. **Text:** the five Pokédex entries and the apples' descriptions are short placeholders to rewrite; check the stats,
   learnset levels and EV yields against a reference (written from memory).
4. **Encounters:** none yet; make an encounters species file for each in the Encounter Editor and place them.
5. **Item placement:** the apples are only in the debug menu; put them in a shop, as items in the field or as an NPC gift.
6. **Real moves and abilities:** Ripen, Bulletproof, Supersweet Syrup, Grav Apple, Apple Acid, Body Press, Syrup Bomb,
   Dragon Cheer and Fickle Beam have Gen 5 stand-ins (the table in section 18.2), Hydrapple's evolution included.
7. Tune Hydrapple's follower `gap` in the Follower Editor if it crowds the player.

## 2026-11-13: new species, step 5, followers, encounters, the Wonder Trade and the musical (ROM session, branch from `new-species`)

design/new-species.md section 17 has the details.

- `pokemon_species.py`: `add`/`reuse` copy the template's followers with their codes (`--no-follower`),
  `remove`/`reuse` delete them (and the follower dialogue file), `follower SPECIES --from X | --none`; removal is
  refused while the species' encounters file exists. Editor: the dialog's Follower row, the added species' Follower
  card (Copy from, Remove, Open in the Follower Editor, which now takes `?species=`).
- Fixed: a lead without a follower stopped every follower until the next field (now passed over as an Egg, only with
  added species); a caught `"pokedex": false`/retired species got "data was added to the Pokédex"; the musical's hook
  (an added species shows its art template's musical sprite: the battle sprite's files can't stand in, the musical's
  bin has a layout of its own).
- Proven in py-desmume: follower (Pikachu's copy), none (the next member follows), wanderer, wild in Route 6 from its
  encounters file, catch with registration No. 840, Habitat List, Area tab, DexNav; Testhide/Testret caught with no
  Pokédex trace; the Wonder Trade received one (forced) and the planner's 1,000,000 plans never gave the excluded ones;
  the musical's dress-up with props. Without added species the ROM is `57cd9af0...`.

Next: step 6, the Applin line (section 17.3).

## 2026-11-13: new species, step 4, Add Pokémon in the editor (ROM session, on a branch from `new-species`)

design/new-species.md section 16 has the details.

- `tools/paperwhite2/pokemon_species.py`: `add` (from a template species or a blank "?" one; name, display number,
  `--no-pokedex`, `--no-wonder-trade`), `remove` (the last added species only, refused while anything names it),
  `retire`/`unretire` (the new `"retired": true`: out of the Pokédex, Wonder Trade and pickers, keeping the ID),
  `reuse` (a retired ID made a new species), `number`, `cry` (a WAV checked, mixed down, resampled, previewed), `info`;
  each with a `--check` dry run. Server routes `/api/pokemon-species/*`.
- The editor: **+ Add Pokémon** on the Pokémon list's header and its dialog with the dry run; added species after
  Genesect in Pokédex order, tagged "added"/"hidden"; an added species' card (number, Retire, Reuse ID, Remove), Icon
  and stills, and a Cry card on every species (player, "a copy of X's" note, WAV import played as the game will).
  Fixed on the way: the Encounter Editor offered `"pokedex": false` species (its listing never asked for `pokedex`).
- Proof: `npm run typecheck`, `npm test` (new `pokemon-species.test.ts` in a scratch checkout: add/remove
  byte-identical, retire/unretire, reuse, refusals, cries), `npx vite build`; Applin added in the editor from Budew as
  No. 840, built from the editor (one ninja run is enough), and in py-desmume its summary (Dex No. 840) and, once
  seen, the National list's "840 Applin" and its Info page; removed in the editor: the ROM is `57cd9af0...` again.

Next: step 5, followers, encounters, the Wonder Trade and the musical for added species.

## 2026-11-13: new species, step 3, the Pokédex numbering (ROM session, on a branch from `new-species`)

design/new-species.md section 15 has the details.

- `pokedex.display_number` (schema; checked in `species_list.py`), `PaperWhite2_PokedexDisplayNumber` in the list rows,
  the Info page, the summary and the PC box: 3 digits under 1000, 4 from 1000, "???" for none.
- The National list: 1-649 as before, then the seen added species by display number (unnumbered last), no gap rows;
  unseen added species are hidden. a/0/9/7 files 3-5 generated (byte-identical without species), the PC box's search
  groups generated. Completion (Shiny Charm, diploma, trainer card star, evaluation) stays on 1-649; SEEN/OBTAINED
  include added species. `"pokedex": false` honoured on every Pokédex path found.
- Proof: the `--hack` ROM without species is `57cd9af0...`, as before; with test species (840, 1011, ???, and a
  `pokedex: false` one) py-desmume shots of the list, Info, summary, box, searches (number, A-Z, height), the box
  search, the party menu, the trainer card's completion; removed: `57cd9af0...` again. The plain build's modules match.

Next: step 4, Add Pokémon in the editor (`pokemon_species.py`, which also writes `display_number`).

## 2026-11-13: new species, steps 1 and 2 (ROM session, on a branch from `new-species`)

design/new-species.md section 14 has the details.

- **Step 1:** `tools/data/species_list.py`, the one definition of the species (1-649 and 687 on, 685/686 reserved,
  `"pokedex": false` out of the Pokédex), used by every packer and generator that said "before SPECIES_EGG" or "up to
  Genesect", and `editor/shared/species.ts`. The packers lay added species' records, text, sprite and icon groups,
  footprints, cries and volumes at their IDs or after the hack's form groups; `pokemon_forms.py` generates the bases;
  `include/paperwhite2/species.h` and about 15 `#ifdef PAPERWHITE2` hooks use them. The `--hack` ROM is byte for byte
  the one before (`57cd9af0...`), and the plain build's modules match.
- **Step 2:** Testmon (687) and Testevo (688) by hand, tested in py-desmume on a copy of the user's save: icons,
  summary, box, a wild battle (sprites, cries 691/692 loaded), the catch and the Pokédex bits, evolution, the Day Care's
  egg and hatching, no follower without breaking others, Keldeo's form text from the moved slots, save and reload with
  `pokedex_save.py verify`. Removed: the ROM is `57cd9af0...` again.

Next: step 3, the Pokédex numbering (display numbers, the list's added rows, a/0/9/7 files 3-5, `box_search.c`).

## 2026-11-12: battle sprites, the armature and curves (ROM session, on a branch)

The rig editor plan's step 3 (design/battle-sprites.md section 19; editor/README.md, The armature):

- A side's armature is `<side>_rig_source.json` beside its flat rig (schema `res/pokemon/battle_sprite_rig_source.schema.json`):
  each track's bone (parent, key poses with constant, linear, eased or Bézier curves per channel, loop, step) and each
  sequence's pose keys with the root's key poses. The **editor** bakes it into the flat rig on every change; the flat
  rig stays the build's only input (nothing in tools/ or the build changed), and `editor/tests/armature.test.ts` fails
  if a committed flat rig isn't what its armature bakes.
- The bake (`editor/src/modules/rig/armature.ts`): samples at the step (6 by default, per sequence or bone) and at each
  key pose, composes children with their parents' baked keys, merges equal samples between key poses; the root goes
  into the sequence's keys over continuing parts (as Game Freak's whole-sprite moves) and into the parts' tracks over
  restarting ones (a sequence key change restarts them); shears warned of. Parenting keeps a part where it is
  (Keep Transform).
- Convert to armature bakes back byte for byte on all 1,506 sides; Pichu and Spiky-eared Pichu with head and ears
  parented too. Tests: `npm test` 106 (13 new), typecheck, vite build.
- UI: outliner (drag to parent), bones on the preview, auto-keying gizmos, key-pose diamonds on the timeline, a graph
  editor with Bézier handles, the bake step, the shear warning in Checks, and the timeline docked at the page's bottom
  in a resizable panel (height remembered per viewer).
- End to end: Spiky-eared Pichu's front converted, head and ears parented, a root jump (0, 12, 24 frames, eased),
  saved, built, `verify_dsi_rom.py` ok, and seen in py-desmume's summary jumping as the preview drew it; 8,463 bytes
  resident (6,671 before). Reverted (res/ unchanged by these commits).

Next: the user's own armature edits; a test of a heavier bake (step 2 or 3) on the battle and Pokédex screens.

## 2026-11-12: battle sprites, the Rig Editor (ROM session, on a branch)

The rig editor plan's step 2 (design/battle-sprites.md section 18; editor/README.md, The Rig Editor):

- `editor/src/modules/rig/`: a tool page for one side's `<side>_rig.json`, opened by **Edit rig…** on the Battle
  sprite card. Live preview (`mcss.ts`, a port of `mcss.render`) at 60 fps with play/step/scrub, shiny, female, onion
  skin, the battle's idle pauses and a status's slow-down, and Pivot/Move/Rotate/Scale gizmos; the sheet with each
  picture's rectangles (move, resize snapped to 8, OBJs made again, art outside them red); the timeline (sequence
  keys, the pose's parts front to back with drag-to-reorder and idle toggles, keys as blocks, edge drag for frames);
  the side panel (part, key, picture, sequence key, sprite, checks, size against ~40 KB); Copy front to back.
- Save runs `mcss_rig.check` (`POST /api/battle-sprite/rig-check`, `editor/server/python/rig_check.py`) then the
  validator. The render port matches `mcss.render` pixel for pixel (test on 5 groups; a one-off sweep of 44,136 frames
  of 218 sides found no difference).
- End to end: Spiky-eared Pichu's front edited in the editor (ear pivot, a −45° wiggle key), built, seen in py-desmume's
  summary as the preview drew it, then reverted (res/ unchanged by these commits).
- Tests: typecheck, `npm test` (93), vite build.

Next: step 3, the armature and curves (section 18.2 says where they plug in).

## 2026-11-12: battle sprites, the rig as source (ROM session)

The rig editor plan's step 1 (design/battle-sprites.md sections 16 and 17):

- Every battle sprite side in res/pokemon (1,506: species, forms, eggs, Pokéstar, the Substitute, the Spiky-eared
  Pichu) is now `front_rig.json` / `back_rig.json` beside its sheet (compact JSON layout, `$schema` first:
  `res/pokemon/battle_sprite_rig.schema.json`, moved from tools/). The 7,530 binary rig files are gone from res/;
  `pokemon_graphics.py` builds them from the JSON at build time (checked against the schema and `mcss_rig.check`).
  The musical's `musical/` folders keep their own files where they differ, and take the rest from the rig.
- `mcss_rig.py`: `check`, `files`, `dump` (from five files), `convert` (what made the change, each side proven byte
  for byte first), `roundtrip` (JSON -> files -> JSON, 1,506 of 1,506). `datajson.dumps_compact` writes the layout
  the editor knows. Readers moved to the JSON: `mcss.read_rig` (battle_sprite.py), `pokedex_sprites.py`,
  `pokemon_form.py` (Add form rewrites the copied rig's `$schema` path), `pokemon_graphics.py extract`.
- **Byte-identical:** `--hack` ROM SHA1 unchanged (`57cd9af0...`), `a/0/0/4`, `a/0/0/7`, `a/0/5/1` byte for byte; the
  plain build's five graphics archives byte for byte (its `a/0/0/4` check failed before too: the hack's form group
  and two edited shiny palettes).
- Tests: `test_mcss_rig` + `test_battle_sprite` (23), editor typecheck, `npm test` (81), vite build.
- **Size:** res/pokemon 28.1 MB -> 71.3 MB on disk (the rig JSON is 47.6 MB, 11 times the binaries' 4.4 MB); git's
  compressed size about the same (2.74 MB against 2.86 MB). Section 17.3 proposes a compact form (keys as rows, OBJs
  only where not generated: about 19 MB) if the user wants it.

Next: step 2, the editor's flat rig editing (section 16), on `read_side` / `write_side` and the JSON files.

## 2026-11-12: battle sprite rig writer and JSON form (ROM session)

The foundation of the approved rig editor (design/battle-sprites.md section 15), no editor UI yet:

- `tools/paperwhite2/mcss_rig.py` (stdlib only): a side's rig as one flat JSON object (pictures as rectangles on the
  sheet, tracks of held keys, poses of parts with pivots in layer order, sequences, idle parts, box, flags), holding
  every byte of the five files, and a writer back to them; `dump`, `write`, `check`, `roundtrip`. Schema:
  `tools/paperwhite2/mcss_rig.schema.json` (moves to res/ with the rigs once the source format is decided; no rig
  JSON is in res/ yet).
- **All 1,506 sides round-trip byte for byte** (files → rig → JSON → rig → files), the NANR included: its LZ11
  compressor matches the originals' (greedy, farthest of the longest matches, never distance 1). The checks find no
  error on any original; 8 sides get warnings for what they really do (rectangles past the sheet's edge, which shows
  it mirrored; unplayed tracks with missing pictures).
- Measured: no fixed buffer for the files (heap blocks by size); the battle view's heap had 353,732 bytes free in a
  wild single battle; the largest original side is 30,845 bytes resident. A 35-part, 240-frame bake every 6 frames is
  about 36 KB (as the largest originals), every 2 about 103 KB, every frame about 204 KB (too big). Keep to about
  40 KB a side unless tested on every screen.
- `generate_objs` lays out a picture's NCER OBJs as 96.5% of the originals' are, for pictures whose rectangles change.

Tests: `python3 -m unittest tools.paperwhite2.test_mcss_rig` (10), `test_battle_sprite` (12), `mcss_rig.py
roundtrip`. No res/ or ROM change.

Next (the editor): load a sprite's flat rig, edit rectangles, pivots, layers and keys with the preview, save through
`write_side`; then the armature and curves baked to it. Decide where the rig JSON lives in res/.

## 2026-11-12: form evolutions (ROM session)

design/form-evolutions.md sections 11 and 12, as the user decided:

- **An evolution may be for one form:** `"form": n` on an entry of a species' `evolutions`; the editor's **Only form**
  picker on each row makes any existing method one form's (an Alolan Vulpix by the Ice Rock, a plain one by the Fire
  Stone). One filter in `CheckEvolveSpecies` covers every way of evolving; an item for another form has no effect.
- **No Ice Stone**: the Ice Rock (Twist Mountain) with a form condition. **The form number is kept** on evolving, as
  before. A form's record has no evolutions of its own (the packer refuses them).
- **Eviolite** follows the form: no boost for a `no_evolution` form or one with no evolution of its own; the
  Xtransceiver Professor reads the form's evolution too.
- **Pokédex Evo** filters by the row's form and names a one-form method's form ("Near an Ice Rock (Alolan)"); the
  family table and the Wonder Trade's pre-evolutions carry a form where only one leads on (for Sirfetch'd later).
- A form's page in the editor lists the evolutions it takes, or says it can't evolve.

Tested: with no condition, every data file equals main's but the Pokédex text bank (one new message); a test build in
py-desmume (Fire Stone no effect on the Alolan Vulpix, Ninetales from the plain one; the Alolan by Rare Candy in
Twist Mountain into Ninetales form 1, not in Opelucid; Eviolite boost only for the forms that can evolve; the Evo tab's
labels); removing the test forms gave the ROM back byte for byte. Editor: typecheck, 78 tests, build, screenshots in
the session scratchpad (`formevo/shots/`).

Open: Sirfetch'd waits for new species (two held-Leek entries, day and night: Gen 5 has no any-time held-item method);
an explicit target form (Pikachu into an Alolan Raichu) isn't built; tapping a family member on the Evo tab opens it
in its default form.

## 2026-11-12: battle sprite art, export and import (ROM session, which owns `editor/` for now)

The user asked for a sprite importer and buttons to export the current sprite to edit and re-import; the rig editor
comes later. Built (design/battle-sprites.md section 14):

- **Battle sprite card** on every species' page and every form with its own art (the Spiky-eared Pichu too): the
  sprite animated as the battle draws it, **Export art (.zip)** (sheets, stills, palettes, shiny copies, a numbered
  guide of the pieces per sheet, README), **Import art…** (any of those files or the zip: checked, previewed on the
  rig, normal and shiny, front and back, then **Apply**), **Make stills from the sheets**.
- `tools/paperwhite2/mcss.py` reads a rig and draws any frame (the research decoder made a tested module);
  `tools/paperwhite2/battle_sprite.py export|check|import` (stdlib only) writes only the res/ sources that change.
- The form page's note says "its own" once a form's sheets differ from its species'.
- The originals' 96x96 stills: the first frame centred, 860 of 1,667 pixel for pixel, most of the rest with a few
  pixels touched up.

Proven: all 752 groups export and import unchanged (nothing to write); six (Pichu, Charizard, Abomasnow, Spinda, Unown
form 1, Spiky-eared Pichu) through the CLI's write mode leave res/ and the `--hack` ROM byte for byte (`e3f841fb...`).
An edit in the editor (the Spiky-eared Pichu's ears red, the shiny red made green) showed in py-desmume in the summary,
a battle's back sprites and the Info page, normal and shiny; reverted. Tests: `python3 -m unittest
tools.paperwhite2.test_battle_sprite` (12), editor typecheck, 78 tests (3 new), build. Screenshots: the session scratchpad's
`spriteio/shots/`.

Next (the rig editor): write the rig files back from `mcss.read_rig`'s shape byte for byte, then pieces that move and
resize, keyframes, the checks of section 11.

## 2026-11-12: Add form in the editor (ROM session, which owns `editor/` for now)

Built as design/forms-and-species.md section 11.5 planned it (now sections 11.5 to 11.9):

- **The Pokémon Editor lists every form under its species** (Pichu's Spiky-eared, Rotom's six, Castform's four...),
  each with a page: its Pokédex text, sprite and icon, "Own stats, types, abilities and moves" (a record of its own),
  "Can't evolve", "In the random pool" (the Wonder Trade), its art, and with a record the species' data sections.
- **Add form** on every species' page copies the species or one of its forms (data, Pokédex text, art, followers,
  optional record) as a new form; **Remove form** undoes it for the hack's last form. Both run
  `tools/paperwhite2/pokemon_form.py` (also `record`, `icon`, `still`; `--check` for a dry run), which the server calls.
- **Any species can take a form:** one whose forms outgrow its original sprite groups (a 7th Rotom) has them moved to
  the hack's groups by the packers (`tools/data/form_groups.py`), with no code change.
- **No C edit for followers any more:** `GetIndexOfObjID`'s last follower code is generated (`FOLLOWING_LAST_OBJ_CODE`).
- **Wonder Trade:** new forms are received unless `wonder_trade.excluded_forms` lists them (the Pichu's form is);
  new species unless `excluded_species` does.
- **Art import:** a form's icon (32x64 PNG; its palette bank picked from its colours) and 96x96 stills. The animated
  battle sprite is a copy of the template's until the rig importer.

Tested: the hack ROM is byte for byte the one before with no forms added, and again after adding and removing a Vulpix
form and a 7th Rotom form (from the editor and from the tool). In py-desmume on a copy of the user's save, with a test
build holding both: the save upgrade equals the tool's, Keldeo's marks kept; summary Ice type and the form's own
sprite and icon; the Info page's Form button lists "Alolan" and Rotom's seven; Rotom's original pages as before.
Editor: typecheck, 75 tests, build. Screenshots in the session scratchpad (`addform/shots/`).

Open: only a species' last form can be removed; a form's own evolutions are packed but not read (evolutions are by
species); the battle sprite needs the rig importer; Arceus's palette forms can't take a form.

## 2026-11-12: the save expansion, a Pokédex for 1500 species (ROM session)

Built as design/save-expansion.md designed it, with the user's decisions (its section 11; plugins.md "Save expansion"):

- **The Pokédex lives in the Pal Pad's block** (0x1f, 0xd54 bytes, its size unchanged, so the save's layout is the
  original's): species 1-1504, 1024 form bits a list, a form directory of 128 species, languages 1-649.
- **The game upgrades old saves itself** on load (the title and Continue): an old save's Pokédex is copied in, the form
  bits remapped to the new order; nothing is written until the player saves. A later change of forms remaps too.
- **Each save mirrors the Pokédex into the original block** for species 1-649, so PKHeX and older builds read it.
- **Forms come from `res/pokemon`**: `POKEDEX_FORM_LIST` is generated (`forms.count` > 1, minus `forms.pokedex: false`
  on Arceus and Genesect). "Add form" needs no C edit any more.
- The wireless features left get a Pal Pad in memory. `tools/paperwhite2/pokedex_save.py inspect|verify|upgrade` reads,
  checks and upgrades a `.sav` offline.

Tested headless on copies of the user's save (numbers in the design doc, 11.2): the in-game upgrade equals the tool's
byte for byte (seen 61, caught 14, Keldeo's forms, 9 language bits, mode, last species), the Pokédex list and Keldeo's
Info page pixel-identical to the build before, a save from the field menu valid in both copies with the original block
unchanged, a reload with no change, quitting without saving leaves the card as it was, the Spiky-eared Pichu's marks
carried over, a full (debug-filled) Pokédex saved and mirrored, a test build with forms inserted and removed remapping
every mark to its new place, and a new game's first save initializing both blocks. `--hack` builds with no warnings,
`verify_dsi_rom.py` intact, the plain build's modules match, the editor's tests 72 of 72.

**To test on the 3DS (TWiLight Menu++):**
1. **Back up the save first.** Copy the game's `.sav` from the SD card (TWiLight keeps it in a `saves` folder beside
   the ROM, named like the ROM) to the PC, and keep that copy untouched. If the new ROM's file name differs, copy the
   save to the new name too.
2. Put the new `paperwhite2.nds` on the card, start it, and look at the Continue screen's Pokédex number: it should be
   the one the last build showed.
3. Continue, open the Pokédex (C-Gear), switch to National: seen and obtained as before; open a species with forms
   you've seen (Keldeo, if seen) and press Form.
4. Turning off without saving changes nothing on the card. To keep the new Pokédex, save from the menu, turn the
   console off, start again and check the Pokédex once more.
5. If anything looks wrong, put the backed-up `.sav` back and tell me; a copy of the `.sav` lets me check it with
   `pokedex_save.py inspect`.

Open: a wild battle or catch on the new build wasn't run live (the debug fill writes through the same functions);
the link trade can't be reached. **Found:** the compilers' depfiles name generated headers by absolute path, so the
first `ninja` after a generated header changes doesn't recompile its includers (the second does); after "Add form", run
`ninja` twice until that is fixed (design doc 11.3).

## 2026-11-12: new forms, the foundation, and the Spiky-eared Pichu (ROM session)

Steps 1 and 3 of design/forms-and-species.md's build order ("Built" there and in battle-sprites.md section 6, plugins.md
"Forms"):

- **Packers from `res/` that can add forms.** `a/0/9/7` (the Pokédex's next-form table, shapes and height/weight
  orders) is packed by `tools/data/pokedex_data.py` from the species' `pokedex.forms`, and the form names are the
  species' data (`pokedex.form_name`, `pokedex.forms[].name`) through `\from` lines, so a form added anywhere keeps every
  later form's text. The battle sprites and icons append the hack's form groups (`sprite_offset` 66 on) after the
  Substitute's files and Arceus' palettes (battle) and the original icons; the icon banks come from the icon PNGs'
  palettes into a generated table; the Info page's sprite middles follow. The regional Pokédex table is read as the
  personal archive's last file. **With no new forms every packed file was byte-identical to a build of main before,
  and `a/0/9/7` to the original's.**
- **The Spiky-eared Pichu** is Pichu's form 1 with placeholder art (copies of Pichu's battle sprites, palettes and icon
  in `res/pokemon/pichu/form_1/`): Pichu's data, "Spiky-eared" in the Pokédex (Pichu's first form is "Normal"), never
  evolves (`forms.no_evolution`), seen bits 83 and 84 of `pokemonFormList` (3 of 88 left), followers with the original
  game's Spiky-eared field sprite. The Wonder Trade's special reward is form 1, still off.

Tested headless on a copy of the user's save, with the form's palettes and icon tinted and mirrored in a test build so
the hack's group could be told from Pichu's: party icon, summary, a wild battle's back sprite, the Pokédex Info page
(Form button, "Spiky-eared" tab, entry, Evo showing it alone), the follower, no evolution by Rare Candy or a battle's
level-up at 255 friendship (a plain Pichu evolves both ways), and Unown's, Rotom's and Giratina's forms' names and
sizes unchanged. To do: the user draws the real art (`form_1/`'s files, rig format later); then `enabled` on the
special reward; encounters where it should appear.

## 2026-11-12: the Pokémon Center attendants, the user's follow-ups (ROM session)

Five requests after the user tried the three attendants (design/pokemon-center.md, "Follow-ups"):

- **The trade scene shows the sent Pokémon from behind:** vanilla. The Wonder Trade runs the in-game trade's demo with
  the same parameters as `FieldTradeStart`; the demo shows the sent Pokémon's front while the scene fades in and swaps
  in its back sprite for the farewell. A test build running the game's own `FieldTradeStart 29` gave the same frames.
  Left as it is.
- **Hyper Training shows BP** in the money window's place while it runs (new action `BP_WIN_DISP`, the BP shop's own
  text), and the money comes back after.
- **The Day Care counter opens after the first Gym Badge** (`daycare.required_badges`), not after meeting the couple;
  before that she says to come back with the first Badge. Everything works with the couple never met (tested: first
  visit, two Pokémon sent, compatibility, an Egg); her first visit now sets the Day-Care Lady's flag 0x0069.
- **Random forms in the Wonder Trade** (`wonder_trade.forms`): Unown's 28, Burmy, Wormadam, Shellos, Gastrodon,
  Basculin evenly; Deerling and Sawsbuck in the season's form. Rotom's appliances and the battle-only forms are left
  out (why in the design doc).
- **The Champion's discount:** after the Hall of Fame, 50% off every attendant's money fee (`champion_discount_percent`;
  BP and items optional, off by default), inside the fee itself so shown and charged always match; the Day Care's own
  withdrawal fee isn't discounted. Each attendant says so once before the greeting.

Found and fixed on the way: a Wonder Trade Pokémon of a species after Arceus in a foreign language without a nickname
stopped the game (the US ROM's foreign species-name banks end at Arceus); it keeps its English name now.

`--hack` builds with no warnings, `verify_dsi_rom.py` intact, the editor's script round trip 7 of 7. Tested headless on
a copy of the user's save (the design doc's list). To test on hardware: as Champion, each attendant's line and halved
prices; Hyper Training's BP window; the Day Care counter on a save with no badges; Wonder Trades for Unown and the others
(rare, so best with patience). Open: a received Rotom is always its normal form (the user may want appliances).

## 2026-11-12: the Pokémon Centers' Wonder Trade (ROM session)

The third upstairs attendant (design/pokemon-center.md, Wonder Trade, "Built"): the middle counter, the Wi-Fi Club's
(script 10100), is the Wonder Trade in every town's Center. A Pokémon from the party (the party screen) or a Box (the
PC Box in a pick-only mode, the Dream World's with the trade's own title, button and messages) goes through the tube
for ₽1,000, and a generated one comes back in its place with the in-game trade's scene, a trade evolution if it
qualifies, and the Pokédex (with its language). Eggs, legendaries and mythicals, held items and the party's last
Pokémon that can battle are refused. The generator (`src/paperwhite2/ov012/paperwhite2_wonder_trade.c`) reads
everything from `services.json`'s `wonder_trade`, which now also has the excluded species, the least levels of
evolutions by other methods (stage 2: 20, stage 3: 30), each language's 20 male and 20 female trainers' names and 20
nicknames (packed into the new system bank `wonder_trade_names`), the female trainers' rate, the balls with weights,
the perfect IVs' count, and the special reward's Pokémon (a plain Pichu placeholder, `enabled: false`). New save data:
flags 0x937 `EVENT_FLAG_WONDER_TRADE_EXPLAINED` and 0x938 `EVENT_FLAG_WONDER_TRADE_SPECIAL_RECEIVED`, variable 0x405a
`EVENT_WORK_WONDER_TRADE_COUNT` (plugins.md's Flags and new Variables table). Japanese and Korean names draw in the
trade scene, the evolution, messages, the party and the summary, so Korean keeps its weight.

`--hack` builds with no warnings, `verify_dsi_rom.py` says intact, 76 KB left in the arena (the Wonder Trade's code and
tables are about 5.5 KB of overlay 12). Tested headless in DeSmuME on a copy of the user's save in Castelia's Center
(the list in the design doc): party and Box trades, every refusal, the fee, the walk and scene, forced shiny, items
and trade evolutions, the Pokédex bits, Japanese and Korean on screen, and the special reward with a test build; 100,000
plans of the real planner code on the PC matched the data's rates with no illegal species or level. To test on
hardware: talk to the middle upstairs attendant in any Center. Open: the special reward's scene says "came back from"
the player (its dialogue and the Spiky-eared form wait for the user); trading the followed Pokémon leaves no follower
until the Following Pokémon picks again.

The editor's script round trip failed on `global_2100.s` script 11 because the Day Care helper put `#ifdef
PAPERWHITE2`, a blank line and a comment between Script_11's movement data and `Script_12:`; the translator keeps
those lines as a raw `asm {}` block, and reopening moves the blank line and the comment outside it. The script now has
the `#ifdef` right after the data and the comment inside Script_12 (no change to what it runs), and every script of the
game round trips again (`editor/tests/scriptlang.test.ts`, 7 of 7). The editor quirk is open (editor/'s session):
a trailing raw block's blank and comment lines don't reopen inside it.

## 2026-11-12: the Pokémon Centers' Training Services (ROM session)

The second upstairs attendant (design/pokemon-center.md, Training Services, "Built"): the right counter, the Global
Terminal's (script 10105), is Training Services in every town's Center, one attendant with a scrolling list of nine
services for a party Pokémon: Name Rater (₽1,000, only when the name changed; another OT's Pokémon refused), Move
Relearner (1 Heart Scale + ₽3,000, only when a move was learned), Move Deleter (₽2,000), Hyper Training (one IV to 31
for 24 BP, after the Hall of Fame and at level 100), Effort Services (one stat's EVs ₽5,000, all ₽20,000), Ability
Services (swap ₽50,000, hidden ₽150,000), Grooming (+10/+30/+60 friendship, ₽2,000/₽8,000/₽20,000), Poké Ball
Services (₽3,000 and a ball from the bag) and Nature Services (₽30,000). Every price and requirement is
`services.json`'s `training` (new: `nature_change`, `hyper_training.requires_champion`; grooming is exactly three
courses), read through new `PokemonCenter` actions; no new script commands or flags. An ability swap flips the PID's
ability bit with its blocks reordered, so evolution and breeding keep the swapped ability (plugins.md). The middle
counter (Wi-Fi Club, 10100) is left for the Wonder Trade.

`--hack` builds with no warnings, `verify_dsi_rom.py` says intact, 82 KB left in the arena. Tested headless in DeSmuME
on a copy of the user's save in Castelia's Center, each service's payment and data checked in the party's decrypted
memory (the list in the design doc). To test on hardware: talk to the right upstairs attendant in any Center; Hyper
Training needs the Hall of Fame. The editor's script round-trip test passes for `global_10105.s`; it fails on
`global_2100.s` script 11 (the Day Care's, before this change).

## 2026-11-12: the Pokémon Centers' Day Care attendant (ROM session)

The first of the three upstairs attendants (design/pokemon-center.md, "Built"): the left counter, the Union Room's
(script 2101), is now the Day Care attendant in every town's Center. Through the tube behind her she sends a party
Pokémon to the Route 3 Day Care, brings one home, collects its Egg (declining leaves it with the couple) and asks how
the pair get along, with the Day Care's own commands and checks. Each transfer costs the Center's fee,
`daycare.transfer_fee` (₽500) in the new `res/paperwhite2/pokemon_center/services.json`, which also holds the
proposed Training Services and Wonder Trade values (checked, not read yet); a withdrawal costs the Day Care's fee too.
She needs the player to have met the Day-Care Lady first (`EVENT_FLAG_0x0069`), and explains the counter once
(`EVENT_FLAG_DAYCARE_COUNTER_EXPLAINED`, 0x936). For each transfer she walks to the tube and back: global script 2111
(`SCRID_POKEMON_CENTER_ATTENDANT_TUBE`), which the Wonder Trade's attendant will call too. New script command
`PokemonCenter` (0x2f7; the debug menu's `Debug` is now 0x2f8). The middle (Wi-Fi Club, 10100) and right (Global
Terminal, 10105) counters are left for Training Services and the Wonder Trade.

`--hack` builds with no warnings, `verify_dsi_rom.py` says intact, 84 KB left in the arena. Tested headless in
DeSmuME on a copy of the user's save in Castelia's Center: not-yet message, first visit, two deposits (₽500 each,
20712 → 20212 → 19712), the pair's compatibility, a withdrawal (₽100 + ₽500), an Egg forced ready (declined, then
collected for ₽500 and in the party), and too little money (nothing taken); after sending the lead, the next
Pokémon follows. To test on hardware: talk to the left upstairs attendant in any Center after meeting the Day-Care
Lady; check the walk and the sound (a guess, `SEQ_SE_PC_LOGIN`).

## 2026-11-12: the ecological wild encounters are in `res/` (ROM session: build and test)

The family dictionary (`docs/paperwhite2/ecological-encounters/families/*.yaml`, reviewed region by region with the
user) now generates every species file: `python3 docs/paperwhite2/ecological-encounters/tools/generate.py --install`
replaced `res/paperwhite2/encounters/species/` (482 species, 2586 habitats, 5229 candidates, 20 outbreaks: the
original game's 19 mass outbreaks, `families/imported_outbreaks.yaml`, and Tentacruel's in Undella and Route 13). Hand
edits to species files will be lost at the next generation: change the dictionary and regenerate. Also:
- `encounters.py check` now counts the 64 slots as the runtime fills them: the busiest season, time and weather group
  of a method (IsCandidateNow filters before taking slots), not every candidate with the method's bit. Busiest now:
  Route 5's grass, 35 of 64; largest block Route 12, 2956 of 4096 bytes.
- `res/paperwhite2/encounters/areas/twist_mountain_5.json` (Twist Mountain's pit) has a dark grass rate (3), for the
  dark grass the user added there.
- Weather splits follow each area's possible weather (its zone's default and its weather calendar). Homes waiting on
  weather the user plans to add have no effect yet: Absol, Castform, Poliwag, Tympole and Wooper at the Abundant
  Shrine (rain or storms), Absol and Electrike on Route 14, Sandile and Trapinch on Route 4 (Black 2's odd sandstorm).
  Rerun the generator after adding a calendar.
- Update: the generator now writes with `tools/data/datajson.py`'s `write`, the layout the editor saves, so the
  editor's format test passes (`cd editor && npx tsx --test tests/format.test.ts`); same data. The weather to add and
  the maps to check for depth are in `docs/paperwhite2/ecological-encounters/to-check.md`.

To test (ROM session): `python3 configure.py w2_us --hack && ninja`, `tools/build/verify_dsi_rom.py
build/paperwhite2.nds`, then the `paperwhite2.local` copy in RetroArch: Route 1 and Route 2 early (Oshawott in Route
1's dark grass, Tepig on Route 2, both exotic), the season changes (Route 12 and Village Bridge differ by season), night
on Route 7 (Misdreavus and a Litwick wisp in the dark grass, very rare; no Litwick in rain), a rainy day on a calendar route, and an outbreak.

## 2026-11-11: Pokédex Flavour, a crash to watch (found and fixed)

Flavour shows other games' Pokédex entries (Red to Black 2, taken at build time from the user's ROMs in `orig/`,
never committed; plugins.md and design/pokedex-flavour.md). On hardware, cycling all of Magnemite's or Charizard's
entries a few times and then switching Area and Evo garbled sprites and then crashed (crash watch: a data abort in
OS_SaveContext). The tab and label then shared one resource (30 of 32 ClAct character slots), but the crash came back
on Keldeo: Form, Area, Evo (garbled icons), Moves (crash). Reproduced in DeSmuME and proven slot by slot: overlay 296's
entry kept the previous Pokémon's type icons and footprint (3 slots) after any change of Pokémon, form or language;
Area then filled all 32, Evo's icon characters got `CLACT_RES_NONE`, and leaving Evo freed slot -1 over the ClAct
system's data. The entry first freed them at once, which the user confirmed ended the crash on hardware but made the
type icons flicker at a change (the new footprint loaded into the old icons' characters while the screen, its OAM
not yet rebuilt after the change's long frame, still showed them); now they are freed a frame later, after a VBlank
has sent the OAM that hides them (plugins.md, Pokédex, "The ClAct slots"). Checked frame by frame on Form, Up/Down and
held Down: no flicker; the page peaks at 31 of 32 for a frame (a change from Evo, its icons and both sets of type
icons and footprint), 30 elsewhere, and long runs on six species don't garble or crash. To test on the
3DS: Form and Up/Down for flicker, and the crash's steps. The form sprites that face left (Keldeo's Resolute, Shaymin's Sky)
are vanilla's per-form no-flip flag, not a bug; mirroring them anyway is a one-line change if wanted.

## 2026-11-09: Pokédex Area sub-page done

The Info page has six sub-pages (Area between Evo and Matchups, plugins.md and design/pokedex-area.md "As built"):
the town map on top with season-coloured glows and the current Pokémon's box, and on the bottom the seasons, up to
four method rows by terrain (walking, dark grass, surf, fishing; a special version shakes the icon, special-only greys
it except bridges) and the time and weather rows, the user's art and icons (sprites, four palette rows, importable in
the editor's Graphics & Palettes > Sprite sheets). Areas without a town-map place (only the Nature Preserve) are
left out; how to add a place is in the design doc. The detail screen's page tabs are gone (always Info), and the
top screen's sprite fades with the rest. Next: the Habitat Dex and DexNav UIs reusing the Area icons.

## 2026-11-08: quality of life batch

Merged and tested in DeSmuME (plugins.md has each): Pokédex Info from the party menu and the summary (INFO button,
START); HMs usable by any party Pokémon that can learn them (White 2 gates none by badge), listed in the party menu,
and Fly from the Town Map and the C-Gear map; the debug menu's Pokédex fill and National Pokédex; wanderers' dust
cloud silent; the waiting follower kept hidden through menus; the C-Gear's picture change in one VBlank. Open: which
C-Gear flicker the user meant (the picture change, or vanilla's dim step after events); whether the follower should
come out on a menu; the follower stayed hidden after Cut by a learner (not yet compared with a Pokémon knowing Cut).

## 2026-11-07: Pokédex, final polish and the hardware flickers

Built, DSi check intact, not yet tested in game (plugins.md, Pokédex): Abilities and the learnset hidden until caught
("Learnset Unknown"), the move panel's value columns 6 and 19 px right, Evo's banner grid scrolling with the red grid
(copied onto BG4), Matchups' coloured multipliers with the black text's shadow and ×0 light grey, L/R in one ring of
the sub-pages and Moves' sets. Flickers: a form change loaded the new sprite into the shown one's texture mid-frame
(now a second sprite loaded in the VBlank, swapped once loaded, `MCSS_IsLoaded`); Evo's balls and the Moves list had
their characters written mid-frame but screen entries at the VBlank (now both at the VBlank); the move panel's
changes now land in one VBlank. Next: the user's retest on the 3DS.

Fixed after the user's report: changing Pokémon on the info page to or from a caught Dewott halted the game. The next
sprite's allocation failed in the full Pokédex heap (`OS_Terminate`, found in DeSmuME with py-desmume and the user's
save); the heap is 64 KB larger (plugins.md, Memory).

## 2026-11-07: Pokédex, the Evo page

Built (plugins.md, Pokédex), not yet tested in game: the family's party icons in a strip ("?" for unseen), the tree
with the user's Pokéballs (caught, seen, unknown), names (gold for the shown species, "????" unseen), gold lines and
each evolution's method (normal font, else small, else short wording; more than 5 rows in a small layout). Touching a
seen species opens its page. The family roots and the balls are ARCID_POKEDEX_GRA's members 152 and 153, appended at
build time by `tools/paperwhite2/pokedex_evo.py` from res/pokemon/*/data.json (configure.py's HACK_ARCHIVE_MEMBERS);
the tool stops if the archive no longer has 152 members, so new art members must move them. The ability slot label
is grey (148,148,148) with a near-black shadow. Next: the user's Evo background, drawn over the templates.

## 2026-11-07: Pokédex, ability slots, dark grass, the buttons lifted

Built, not yet tested in game: the ability pages say "Ability 1", "Ability 2" or "Hidden Ability" on line 1 (the
entry's label grey); a third held item reads "Dark grass only: 1%"; Stats' buttons 2 px higher and Matchups' 3 px, by
scrolling BG6 per sub-page (`sSubpageLift`), the touch rects with it, and the art converted that much lower so it stays
as drawn (a target's new `offset_y` in `screen_art.py`, art.md). Next: the user designs Evo (its plan in the reply of
this date: tree rows drawn by the code, gold lines and the user's two 16x16 hexagon icons, a family table generated at
build time, Matchups' icons freed while Evo shows).

## 2026-11-07: Pokédex, abilities and held items on the top screen

Built (plugins.md, Pokédex), not yet tested in game:
- The move panel's values right-aligned: Power and Accuracy to the category icon's right edge (x 112, from its cell
  data: the icon's pixels are x 85-112, not centred at 94 as the screenshot seemed), PP and Priority to x 217.
- An Abilities button, Stats' sixth (y 144-167), cycling the entry's area: the entry, each ability (name in gold,
  colour 3 of the font row 3, and its two-line description), the hidden one ("Hidden ability undiscovered." until
  caught), the entry again; changing sub-page, Pokémon or form, or Language, returns to the entry.
- On Data, the entry's area shows the wild held items, one a line with its rate (50%, 5%, 1%; one item at 100% where
  slots 1 and 2 hold the same), "Has no hold items." or "?" until caught. In the game the third slot's 1% is only in
  dark grass (`enc_pokeset.c`, `HELD_ITEM_RATES`), and Compound Eyes raises them.
- The entry hands its text window to the page for these (`PokedexInfo_BeginOtherText` / `_EndOtherText`, ov296).

## 2026-11-07: Pokédex, every tab has its art

The user's Moves art (updated), a blank Evo art (for the full tab bar) and the Matchups art (targets
`pokedex_info_evo` 146-148, `pokedex_info_matchups` 149-151). Matchups' rows closer for the art's top margin (the first
6 px lower, the pitch 35), the multipliers all in the small font. Not yet tested in game. Next: the last page (Evo),
with a possible addition to an earlier one, which the user will explain.

## 2026-11-07: Pokédex, the user's Moves art and move panel art

Built (plugins.md, Pokédex; art.md, `pokedex_info_moves` 140-142 and `pokedex_move_panel` 143-145), not yet tested
in game: Moves' tab strip and sets bar (the code's rows still placeholders, the sets' text 1 px lower); the move panel
10 px lower (no longer over the head bar: its cover removed, the bar still dimmed by palette), its art on BG1 (45
tiles, about 20 left), drawn into the text windows behind the text, the windows a tile lower with the text 2 px down
in them (the name 1 px, to fit its window); the name white on the art's header. Next: the user's Matchups art.

## 2026-11-07: Pokédex, the head bar dimmed under the move panel

The head bar shares BG 1 with the move panel, so the hardware dimming (by BG) couldn't reach it. Now its palette row
is darkened as the hardware darkens (EVY 8 of 16), but for the two colours the panel's edge takes over it, and put
back when the panel closes (`PokedexMovePanel_DimHeadbar`). The panel keeps its place from y 21. Not yet tested in
game.

First test: the bar turned green, not darker. The dimmed colours were in a stack array, and the palette's load is
a DMA, which can't read the stack (DTCM): it loaded whatever main memory held there. Now in the panel's work.

## 2026-11-07: Pokédex Moves, the user's test notes

The user's test of Moves went well; fixed from the notes (plugins.md, Pokédex), not yet tested in game: the 3D sprite
off (BG 0) while the move panel is open; the panel from y 21, covering the head bar's bottom edge (its 31 tiles of
tile row 2 copied with the panel's edge drawn in, and their screen entries restored on closing); the scroll bar
dragged by touch (as `ov139/frame_list.c`); the rows centred (y 41-159, the track 45-155); the panel open at once on
the set's first move when Moves shows, following set and Pokémon changes, hidden on an empty set, closed by B and
reopened by A. Keys: the D-pad's Left/Right step the five top tabs, L/R the Moves sets (on Moves only), both
wrapping. Templates for Moves' bottom and top screens regenerated for the user's art.

## 2026-11-07: Pokédex, five tabs, the Moves list and the move panel

Built (plugins.md, Pokédex), not yet tested in game:
- Five sub-pages, Stats, Data, Moves, Evo (blank for now), Matchups, touched by the art's tab icons (x 64-192, 32
  apart); L/R and the D-pad's Left/Right cycle them and Moves' four sets, wrapping, and no longer go to Area, Cry or
  Forms (touch only). The user's new Stats and Data art, with icons in the tab bar.
- Moves: the sets bar (Level Up, TM/HM, Tutor, Egg), 5 rows at the relearner's size with its cursor (converted to the
  Pokédex's sprite mapping, members 137-139, `tools/paperwhite2/obj_remap.py`), the list's scroll bar as the Pokédex
  list's; "Lv. N", "TM05"/"HM04", the tutor's town (Driftveil, Lentimas, Humilau, Nacrene for the shard tutors, the
  PWT for Pledges and the ultimate moves, Opelucid for Draco Meteor) or "―" for egg moves. Up/Down move the list there.
- The move panel over the top screen (A or a touch), the rest dimmed; B closes it. The entry's text is freed while it's
  open and printed again after.
- The tutors' lists moved to ARM9 main (`PaperWhite2_MoveTutorMoves`, values checked identical), which the shops read.
- Data: values and the Egg column 1 px left, egg groups in the small font.
- About 29-30 of the screen's 32 sprite resource slots are in use: tight for Evo's icons.

## 2026-11-07: Pokédex, Matchups in the battle's colours, a Default button

The user tested Matchups: it works. Now the multipliers are in the battle's move preview colours (light blue above
×1, yellow below, grey for ×0, dark shadows; ×1 the panels' text), through a second palette for the content window
while Matchups shows (`sMatchupColors`, row 9), and the "×" is the small font's. The ability buttons are "Default" for
every ability that changes no matchup, if the species has one, then each that does (Croagunk: Default, Dry Skin;
Gastly: Levitate; Zebstrika: its three). Not yet tested in game.

## 2026-11-06: Pokédex, the Matchups sub-page

Built (plugins.md, Pokédex), not yet tested in game: the 17 attacking types' icons in 3 rows of 6 (the 18th slot kept
for a Fairy type), each with its multiplier against the species' types; buttons along the bottom for the abilities
it can have (the hidden one once caught), the chosen one applying its effect (Levitate, Thick Fat, Filter and the
rest). The type chart moved to ARM9 main (`PaperWhite2_TypeChart`, the same values), which the battle reads too.
Templates for Matchups written. The user tests: Tepig with Thick Fat (Fire and Ice ×0.25), Gastly, Shedinja,
Toxicroak (Fire ×1.25), Mr. Mime (×1.5), forms, long ability names, a battle's type effectiveness.

## 2026-11-06: Pokédex, Data's art without the grey column

The flicker is gone (the user). The user prefers Data's labels light, without the grey column behind them: new Data
art, and the labels mid grey again. Next: the Matchups sub-page's design.

## 2026-11-06: Pokédex, no flicker between Stats and Data

The user saw a flicker when changing sub-page. Two causes in `PokedexInfoPanels_LoadArt`: the screen was written to
VRAM at once (a sync load) and its palette row set only after, so it showed a frame in row 0; and the art's tiles
were freed and loaded again while the old screen still showed them. Now every sub-page's art is loaded with the page,
each in its own palette row, and a change only sets the screen in the buffer for the VBlank. The Data rows' labels
are darker (the panels' dark grey) over the user's light grey column. Not yet tested in game. If a slight tear
remains, it is the text windows' tiles, which BmpWin_Transfer copies at once; a VBlank transfer would fix it.

## 2026-11-06: Pokédex, the user's Data art; Stats' text placed

The user's Stats art works; its text moved to fit (rows 5 px lower, the first column 4 px right, the bars 5 px shorter
at each end). The user's new Stats art (with a tab behind the current sub-page's name, to try) and the Data art are
built in (`pokedex_info_data`, members 134-136). Data's rows 4 px lower, GROUP and the groups 6 px lower; "Egg" in the
art's yellow, which the 80-99 stat bars now use too; the Egg column's values white, as the art's column is dark. Not
yet tested in game.

## 2026-11-06: Pokédex, the user's Stats art in the game

The user's first art, the Stats sub-page's (strip and panel, in the top screen's palette row 0), is built in
(plugins.md, Pokédex; art.md): 21 distinct tiles. The game no longer draws the line above BST. Not yet tested in
game; the text will likely need moving to fit the art. The templates (`tools/paperwhite2/pokedex_templates.py`) don't
yet show the art itself under the text.

## 2026-11-06: Pokédex step 2, the user's first check

The user's screenshots look right. Fixed: the touch bar locked after touching INFO on Info. Step 1's
`PokedexDetailTouchbar_SetBG` frees the bar, and freeing stops the glow, which sets `selectedPage` to "none"; the bar
made again then had no current tab that couldn't be touched, and the Info page (as the original) never unlocks the
bar for its own tab. Only after coming back to Info from another page, so it seemed random. Now `SetBG` keeps the
page (which also keeps INFO's glow). Layout: the sprite 24 px higher; Stats and Data with 10 px of padding round
their text, rows 16 apart, the stat bars 63 px long; more room before GROUP; the male share blue and the female pink
(the panels' palette has pink in the orange bars' shade's place). Not yet tested in game.

## 2026-11-06: Pokédex step 2, the new Info page

Built (hack, no warnings, DSi intact), **not yet tested in game** (plugins.md, Pokédex): the entry and the animated
sprite on the top screen, the sub-pages Stats, Data and Matchups (blank) on the bottom with L/R, and the buttons Cry,
Turn, Form, Shiny and Language on Stats. Positions are constants for the user to check; then step 3, the templates.

## 2026-11-06: Pokédex step 1, the engines swapped on Info

The user tested the C-Gear's save: it works. Pokédex step 1 is built (plugins.md, Pokédex): the Info page runs with
the 3D engine on the top screen, the other pages as before, with no visible change meant. Built (hack, no warnings,
DSi intact); **not yet tested in game**. The user tests: Info looks as before; switching to and from Area, Cry and Forms
by touch and with Left/Right (no flashes, no bar on the wrong screen, the right tab glowing); the check icon; Up/Down
on Info; the language buttons (touch, L/R, A); Forms' 3D sprites; Area's map and seasons; closing (X) and returning
(B) from each page; entering from a catch's registration. If it causes much trouble, the fallback is the still sprite
on top. Next, once it works: step 2, the new Info page.

## 2026-11-06: the C-Gear's save, dimmed as the menu's

The user found that saving from the C-Gear didn't dim the field or show the arrow, and that after a No the field
stayed dim with the arrow (still taking input) until another menu closed. Cause: the field menu does the dimming, and
saving's No goes back to the field menu, which dims again; the C-Gear's event then left for the C-Gear without the
menu's own undo. Now the event dims before saving and undoes it after a No (plugins.md, C-Gear). Not yet tested in
game.

## 2026-11-06: where things stand (the user's notes, end of a long session)

- **Testing:** the user has tried most recent features briefly and will test them properly on a fresh save, playing
  as a player would. The Join Avenue's latest additions work.
- **Decisions waiting on that playtest:** trainer scaling (bosses below their original levels, the tiers of N,
  Colress, Ghetsis and Cynthia), the badge soft cap, help with catching, the Join Avenue's further lines and the
  user's own owners and visitors. Don't push for them before the user has played.
- **Wireless:** removed piece by piece as each feature is reworked to be local (the user is still thinking about
  some), then one final pass at the end for whatever is left. No full audit before then.
- **Version Key:** kept for debugging only; not given to the player. The Route 4 textures and the "re-battle" are both
  resolved: the re-battle was never a bug (the user misread the trainer's lines). The version-key.md report predates
  the fix.
- **Larger features:** mostly done. Still open: the DexNav starting the searched Pokémon's battle, perhaps with a
  shiny chance that grows over time; the user hasn't decided how, so it waits (design/dexnav.md).
- **The editor:** the user will test it properly while adding content to each map, and may want additions then.
- **melonDS DS's JIT freeze** (literal optimisations on): gone after the follower rebuild, so the follower code was
  involved after all, not only the JIT. The user keeps the setting off to be safe.
- **New ideas on the books** (not started): the Pokédex's informative pages and the DexNav's UI, both with the user
  drawing the art from specs (design/pokedex.md, design/dexnav.md), and the Pokémon Center as a hub with new
  attendants in place of the wireless ones (design/pokemon-center.md).

## 2026-11-06: no wireless visitors; the owners' own lines

No one comes to the avenue by wireless or online any more (one gate, `JoinAvenue_MergeExisting`). Owners have lines of
their own for four moments (waiting, their dream, thanks when invited, welcome in their shop), a first pass written for
the eight placeholders, editable on the editor's page. The Battle Box stays (the Battle Subway uses it). Not yet tested
in game.

## 2026-11-06: the avenue's help, the guide's tip, the PC menu

The user tested the tutorial owner: it works. The guide no longer talks of the C-Gear and the Union Room, the office
assistant's help describes owners and visitors (no Recruit), and the PCs' storage menu is reordered (plugins.md). Not
yet tested in game.

## 2026-11-06: the tutorial's owner

The user tested step 4 and the filter removal: both work. The word lists aren't loaded at all now. The avenue's
tutorial brings in the first owner (Flora, Flower Shop, now first in the table) in place of Janus, then the others
come one a day; the editor marks the tutorial owner, reorders owners and lists Venus, the tutorial's visitor. The
opening stays as it is (the user's choice). Not yet tested in game: it needs a save that hasn't done the avenue's
tutorial. Next: the wireless sources of visitors, then the owners' own dialogue.

## 2026-11-06: Join Avenue, step 4: the editor's page

The editor's **Join Avenue** page (`editor/src/modules/joinavenue/`, editor README) edits the owners and the random
visitors: name, gender, look, trainer ID, greeting and messages, and an owner's shop (kind and variant). Adding,
changing and removing owners were tested on a scratch copy: the saved files pack. Not yet tested in game. Next: step 5,
the opening (its tutorial invites a visitor who isn't an owner) and the wireless sources; then the owners' own
dialogue (`line_1` to `line_12`, which only Gym Leaders use so far).

## 2026-11-06: no word filter, no warning about other players

The user tested the avenue's first day: it works. The name entry no longer checks for profane words or long numbers,
and the avenue's intro no longer warns that its words go to other players (plugins.md). Not yet tested in game.

## 2026-11-06: Join Avenue, steps 1 and 2

- The avenue's tables are JSON in `res/field/join_avenue/` (packed byte for byte as the original's).
- Eight placeholder owners, one per shop kind, join the daily visitors one a day (plugins.md, Join Avenue); the
  original's menu still lets any visitor be invited until step 3. Not yet tested in game: the avenue must be opened
  (its intro) first.
- Step 3: only the owners can be invited (while a lot is free) and only the others recommended to; no recruiting, so
  owners never leave. Not yet tested in game.
- Next: step 4, the editor's Join Avenue page; then step 5, the opening (its tutorial invites a visitor who isn't an
  owner) and the wireless sources.

## 2026-11-06: the C-Gear's buttons with the console's wireless off (3DS)

The user's 3DS (DSi mode, wireless off) showed only the clock, the battery and the save button: the start menu still
started the C-Gear off when the wireless was off, a check kept while the C-Gear still networked. It now starts on
whatever the setting, and Aspertia's C-Gear scene doesn't check it either (it showed the wireless error and never
powered the C-Gear on). Not yet tested on the 3DS. The follower rebuild (branch `follower-rebuild`): the user's first
tests on melonDS and the 3DS found nothing wrong, so it is merged into `main` (the user's decision), and the Trainer
sight's re-measure (`event_trainer_eye.c`, for Policeman Dell) is back to vanilla: nothing holds events any more, so the
original's distance is right again.
## 2026-11-05 (branch `follower-rebuild`): stage 2, the movement and drawing tidied, and one gap

The same behavior throughout; to test in one batch with stage 1 (the user's choice). Not yet tested in game.

- **The hardware divider and square root unit** (`include/paperwhite2/following_math.h`) in place of the four
  64-bit long divisions done a bit at a time (`ScaleStep`, `MulDiv`, `DivS64` in the trail, `Divide` in the render
  math) and the two 64-bit square roots: the same truncated, saturating results.
- **The camera basis once per camera** (`FollowingRender_Basis` keeps the last camera's), not up to four times a draw.
- **The step check skips far actors** (`FollowingScene_IsStepClear`, more than 4 tiles in X or Z by their position and
  both grid tiles): the grid checks are the same, and a rail actor that far no longer has its next step predicted,
  the costliest part on a crowded street. One edge changes on purpose: a far rail actor whose prediction failed
  blocked the follower's step; it no longer does.
- **One gap** (the user's decision): each follower's `data.json` has `gap` for the four `gaps`, all 2,574 of which
  were equal, so the packed table is byte for byte the same (`tools/paperwhite2/following_data.py` writes it four
  times; `import_followers.py` reads the largest). The Follower Editor shows one field, from the schema.
- **Kept on purpose:** the busy-wait for the scanline before a texture's upload (`WaitVramWindow`). A VBlank transfer
  could copy freed memory into another texture's VRAM when an effect's resource is freed in the frame its upload was
  queued, and the line flicker it prevents shows only on hardware; it runs only on L/R, a new sheet, a ball change or
  an emote's start.
- **Cleanup:** the original files' exports that only the policy used are gone (`PaperWhite2_Is*Callback` in
  event_sound.c, scrcmd_camera.c, field_transition.c, field_event.c, scrcmd_menu.c and scrcmd_sound.c, and
  `PaperWhite2_GetActiveFieldScriptSubEvents`); the battle's and the menu return's stay, still used.
  `following-pokemon.md` marks the hooks the rebuild removed or changed.
- **Next:** the user's batch test of stages 1 and 2; then the Dell re-measure back to vanilla, and the merge.

## 2026-11-05 (branch `follower-rebuild`): stage 1, the follower's events watched, never held

On the branch `follower-rebuild` (from the tag `follower-before-rebuild` on `main`), the plan of
`docs/paperwhite2/design/following-rewrite.md`. Not yet tested in game.

- **No event waits for the follower, nor the player's input:** the event hook only watches
  (`PaperWhite2_FollowingOnEvent`, game_event.c), the D-pad gate is gone (field_player.c), and so are the script
  command and script-freed hooks (vm.c).
- **The scene** (`paperwhite2_following_scene.c`, 1224 lines to 854): during any event the follower waits where it is.
  It is recalled only when the event needs its place (the checks kept as they were: an actor's scripted move,
  placement or new actor over it, a scripted move of the player, its own actor taken). The allow-list of 376 commands
  with its generator and data (`tools/paperwhite2/following_scene_policy.py`,
  `res/paperwhite2/following/event-policy.json`, `audio-event-policy.json`), the event and VM tables, and the PC's,
  Repel's, return's and finisher's special cases are gone.
- **Fades:** a fade during an event hides the follower with no recall effect (`REASON_FADE`) and keeps its pose as
  the restore token (`FollowingScene_PreserveForFade`), which comes back on the same field when the event ends, or on
  the next field (the PC's storage), if the player is on the same tile of the same zone. A summon (a menu's or a
  battle's return, the boot) still wins, with its send-out. A battle the follower leads into keeps it through its fade,
  as before.
- **Memory:** the DS arena has 90 KB left, from 87.
- **To test:** talking to NPCs and signs, menus (the bag, the party, the save, which no longer recalls the follower),
  the PC, wild and trainer battles (with the follower in front and not), Policeman Dell and other trainers,
  cutscenes with NPCs walking, doors, seamless connections, Castelia's streets, Fly and Dig, the Escape Rope.
- **Next:** stage 2, tidying the movement and drawing with the same behavior; then the dead exports the policy used
  (`PaperWhite2_Is*Callback` in original files), and the Dell re-measure back to vanilla once nothing holds events.

## 2026-11-05: a patrolling Trainer walking onto the player with the follower out (Route 4's Policeman Dell)

- **The user's tests:** with the follower out, Dell (Route 4, `MOVE_CODE_WALK_BACK_AND_FORTH`, the route's only
  patroller) sometimes stops beside the player, sometimes a few tiles short, and mostly walks onto the player; with
  the follower off, and in vanilla Black 2, he stops beside the player.
- **Read from the code:** the walk's distance is measured when he sees the player (`EventTrainerEye_FindClashActor`),
  but he is paused only later: by the clash script's `ActorsPauseAll`, which lets an actor in mid-step finish it, and
  by the eye event's own wait for that step. The Following Pokémon's scene can hold events while its recall plays
  (`FollowingEvents_Bind`'s hold, `FollowingEffects_IsRecalling`), and a patroller left moving walks on meanwhile, so
  the distance is stale by however far he went. Which callback starts the recall here isn't pinned down yet.
- **The fix:** `EventTrainerEyeSub_ForceTrainerDir` measures the distance again once the Trainer is still and paused
  (`#ifdef PAPERWHITE2`), keeping the original's when he's no longer in line. If he now always stops beside the
  player, the stale distance was the whole bug; if he still stops short, steps are being lost, which is another.
  Not yet tested in game.
- **Tested by the user:** no longer reproducible.
- **Then the follower review** (the user's request): `docs/paperwhite2/design/following-rewrite.md`, with the four
  reports in `docs/paperwhite2/design/following-review/`. The plan rebuilds the core (events that are watched, never
  held; the game's own partner movement and drawing) and keeps the content, in stages on a branch. Waiting on the
  user's approval and four decisions listed there.

## 2026-11-05: the C-Gear, first steps

- Loading a save no longer asks about the C-Gear: it starts on whenever the save has it on (plugins.md, "C-Gear").
- The battery is under the clock's digits; the right-hand circle stays, empty but for the DS's wireless icon.
- `tools/paperwhite2/cgear_sprites.py` exports the C-Gear's sprites as editable pieces and imports them; the user
  has an export in their workspace (`Pokemon Paper White/C-Gear sprites`) to work on icons.
- The user tested the above in game (works). Then: no networking and no dimming, nothing turns the C-Gear off, the
  markers, help, power and the title strip start nothing, the survey button and the center log are gone, and the
  markers' labels are three 32 by 16 objects shared by every skin. Not yet tested in game.
- Then five markers: red Pokédex, yellow bag, blue party, green DexNav, purple map, each opening its app as a Y
  shortcut does; the red label 48 by 16 for POKEDEX. The user's BAG and PARTY labels are imported. Not yet tested
  in game.
- Then the user's POKEDEX, DEXNAV and MAP labels; the title strip cycles the skins again; markers that can't be used
  show dimmed with their lamp off; six more places on the rings (the middle, where the log and the survey were). Not
  yet tested in game.
- Then power saves (the user's icon) and is dimmed where saving can't be done, help cycles the background's colors,
  and the right-hand circle shows the date. Tested by the user: works.
- Then help cycles background pictures instead (C-Gear skins, `res/paperwhite2/cgear_pictures/`, the Keldeo one the
  user found), with the editor's C-Gear Pictures page to import PNGs and .cgb files. Not yet tested in game.

## 2026-11-05: a freeze in melonDS DS with JIT literal optimisations (known issue)

- **The freeze:** after a trainer battle, or after a wild battle once the player does anything, the game freezes in
  melonDS DS 1.3.1 (RetroArch) with JIT on, in DS and DSi mode alike. It doesn't on a 3DS (TWiLight Menu), and not
  with **JIT Literal Optimisations** off; block size, branch optimisations and fast memory don't matter.
- **Address-sensitive:** builds `1d5cda3742` and `70200eba70` don't freeze with the same save; `b0e81a5561` does,
  though what it changed doesn't run in that test (no level 100 Pokémon). The JIT reads a function's literal pool
  once and re-reads it only when it sees that memory written; the game loads different overlays at the same
  addresses, and part of an overlay arrives by DMA, which the JIT may not watch. So a stale constant from replaced
  code, whose effect depends on where each overlay lands. The field overlay (ov036) now reaches into the battle
  menus' memory (ov285-ov290), which the original's layout doesn't; no overlap is between overlays loaded together.
- **On branch `layout-original` (main backed up as tag `backup/before-layout-2026-11-05`):** the linker keeps the
  original's layout, so no two overlays that are apart in the original overlap (plugins.md, Memory); 94 KB of the DS
  budget left. **It still freezes** with literal optimisations on, so the layout isn't the cause. The freeze comes
  when the field's event check runs again after a battle: at the end of a trainer's after-battle dialogue, or after
  a wild battle once the player walks, talks or opens a menu.
- **A crash report for debug builds** (`paperwhite2/crash_watch.h`): with no main-loop frame for 5 seconds, the VBlank
  interrupt draws, red, the address it came in at and its registers, and the main thread's saved registers; an
  exception draws its registers, blue (NitroSDK's `OS_SetUserExceptionHandler`, which the original drops, added to
  `os_exception.c`). **What it showed** (DS mode, native BIOS): the CPU ran `IsSafeCallback`'s literal pool (the
  Following Pokémon's scene, ov036) as Thumb code; the registers left (r0 0x1000, r1 0xe9, r2 0x85) are those bytes as
  instructions, and the abort's lr is 8 past the `ldrh` at 0x1030 that they make. It then ran on in abort mode with
  sp 0. With the built-in BIOS the same freeze shows no screen.
- **A code check** (same header): ARM9 main's, ov012's, ov036's, ov167's and ov168's code, checksummed in 2 KB blocks
  when each loads and checked 64 KB a frame, magenta on a change. With literal optimisations on it never fired before
  the freeze: the code was intact, so the JIT went wrong over unchanged memory. **Conclusion: melonDS DS's JIT with
  literal optimisations, not the game.** The user plays with it off. Merged to main 2026-11-05 with the layout change.
- **For now:** the user plays with literal optimisations off. **If it matters later:** variants of a freezing build
  that each move one group of overlays by padding would show which region goes stale; that region could then be
  kept apart as the original's is.

## 2026-11-05: Prestige levels

- **Prestige levels** (plugins.md, Prestige levels): past level 100, the Exp. a party Pokémon would gain becomes
  prestige, 4% more per level, shown as 100 plus the prestige level in gold up to 999 in the battle HP box, the party
  list, the summary and the PC box, with "X's Prestige rose to Lv. N!" in battle. Stored in unused bits of the
  Pokémon's data. Built; **not yet tried in game**: the gold in each place (the battle message's palette color 15
  above all), the message, and a box move keeping it.

## 2026-11-05: the difficulty setting

- **Trainer scaling** (plugins.md, Trainer scaling): every trainer battle's Pokémon scale to the party level (at
  least the badge floor) by tier: normal −2 to −5, strong 0 to −3, boss +1 to −2, ally 0 to −3, the ace at the top and
  the rest by their gaps; guests and facilities fixed. `res/paperwhite2/trainer_scaling/trainer_scaling.json`; the
  Trainer Editor previews it. **Not yet tried in game.** Open: whether bosses may go below their original levels (all
  may, for now: `below_original`), and the tiers of N, Colress, Ghetsis and Cynthia.
- The intro's menu lists NORMAL first.

- **Difficulty** (plugins.md, Difficulty): the new game asks after the rival's name (EASY / NORMAL / HARD); the
  Options screen's DIFFICULTY row (EASY / NORM / HARD) replaces Save Before IR, which is now always "no save". Kept in
  the key system's slot, so the leaders', Elite Four's and Champion's Challenge Mode teams come with HARD. Trainers'
  Pokémon change level by −4 / −1 / +2 with their stats (`level_scaling.json`'s `difficulty_*`); the original's
  shown-level offset is off. Built and verified; **not yet tried in game**: the Options row's layout, the intro's
  menu window, the levels and stats in battle, a gym on HARD.

## 2026-11-05: the party's level, for playtesting; editor tabs; saving the flag notes

- **The party's level** replaces the median for the wild levels (and the trainers' when they scale):
  `Conditions_PartyLevel`, the 3 highest levels, the ace less the pull of the other two within a fifth of its level
  (plugins.md, Level scaling; design/trainer-scaling.md, "The party's level: chosen"). `level_scaling.json` has
  `party_top` and `party_band`; the Encounter Editor's Settings edits them and tries a party. `PARTY_LEVEL_MEDIAN` is
  `PARTY_LEVEL_BASE`. Built and verified; **not yet tried in game**: the debug menu's Conditions shows the party level
  as "Party". The conditions tests pass, the level scaling one fixed for the spread of 3.
- **The wild modifier** is a percent with a cap: 60% of the party's level, at most 10 below; wild levels ±15% of it,
  1 to 5 (`level_scaling.json`'s `cap`, `spread_percent`, `spread_min`, `spread_max`; `Conditions_WildSpread`), fitting
  the user's table. **Not yet tried in game.**
- **Trainers' modifiers, the user's** (design/trainer-scaling.md, The modifiers): most 2-5 below the party, rivals and
  leaders 0-3 below, the Elite Four and Champion 1 above to 2 below; Easy −4, Normal −1, Challenge +2. Not built.
- **Still open:** the badge soft cap; help with catching when the party is strong (a catch bonus for out-levelling,
  False Swipe early, or both).
- The editor's tools open in tabs, kept open, with Back after a link; the Flag and Var Reference saves the notes.

## 2026-11-05: the Flag and Var Reference complete; the Discord list of unused variables checked

- The reference lists every flag and variable and every use (the usage tools' `--all-uses`), and each one's region:
  what resets it or what it is (plugins.md, What resets flags and variables). The variable tool's map-local range is
  0x4000-0x401e (0x401f isn't cleared), and it knows the map replacements' events and the Following Pokémon's talk
  days.
- The user's Discord list of "unused" variables, against the source: 0x4010-0x401e reset on every map change (as it
  said); 54 of its 143 are used by the original game, among them 0x4031-0x403a (map replacement events: 0x4031,
  which the user's Route 20 Wurmple affection uses, is Opelucid's Kyurem freeze) and 0x4041, 0x4043, 0x404c, 0x4078,
  0x4085, 0x408a, 0x408d, 0x4095, 0x4096, 0x40a4, 0x40b7, 0x40c4, 0x40e1, 0x411c, 0x4144, 0x414a-0x414e, 0x4161,
  0x4174, 0x417a, 0x4181, 0x4189, 0x4190, 0x4191, 0x4195. The user's others are safe: 0x401f (night), 0x402f (the
  Wurmple, whose object code `OBJ_CODE_WORK_0F` no NPC uses), 0x4050 (the season setting).

## 2026-11-04 (evening): the version switch by place, tested; Alter Unova on the globe; no Unova Link

- Each place Unova has as Black 2 or White 2 has its own flag (`paperwhite2/version_places.h`): Route 4, Reversal
  Mountain, Mistralton City, Opelucid City, Black City. The map pieces follow each cell's place, the gates' and
  Undella Town's level scripts the flags, the textures their places; the Version Key sets them all (a test item). The
  globe's Season app has the Alter Unova page with a preview of each place in each version
  (`res/paperwhite2/version_preview.json`, cameras to tune). Tested by the user: every place switches with the right
  textures. Black City's and White Forest's Pokémon Centers now lead out to the city the flag has.
- Unova Link is gone from the title menu; the Aspertia scene that gave the keys is the original's again
  (design/version-key.md, Progress).
- The Regi chamber is a variable (`EVENT_WORK_REGI_CHAMBER`), and script 2823 (`ReloadMapHere`) loads the map again
  for NPCs that switch a place: plugins.md, Version places, lists every place's flag and variable.

## 2026-11-04 (afternoon): the re-battling Route 4 trainer explained; a flag watch in the debug menu

- The Route 4 trainer who battles on every visit is Pokémon Breeder Irene (296), one of the original game's 12
  re-battle trainers, whose defeats every map change resets (`resetRebattleTrainers`, src/ov012/trainer_script.c):
  the Pokémon Breeders and four Black Tower bosses (design/version-key.md, "Why a Route 4 trainer battles again").
  The Overworld Editor and the Script Editor say so on a trainer NPC.
- The debug menu's flag watch (World, Flag get/set..., Watch; World, Flag watch log...;
  include/paperwhite2/flag_watch.h): logs where a flag changes (a frame's step, a script command with its script and
  offset, a zone init's step) and what else changed with it. Built and tested by the user.
- The editors: a script entry that shares its label with others (global_3000.s's 815 trainer entries) opens it, with
  a warning and the script it runs on into; a trainer NPC names its trainer, its defeat flag and opens the Trainer
  Editor, which takes `?trainer=`.

## 2026-11-04 (morning): the user's decisions, and Route 4 in both versions in the Overworld Editor

- The user's decisions on the three researches are in each design doc ("The user's decisions"): the Join Avenue
  keeps its rank, earned by paid upgrades, with fixed shops and people and their own dialogue, and loses everything
  wireless; the Version Key gets its own flag in place of Unova Link's keys, swaps every place the version's map
  replacements change (Mistralton, Opelucid, Route 4, Driftveil's market, Black City / White Forest), refuses inside
  them, and the gates' warps follow it; trainer scaling shares one party level with the wild Pokémon, with a badge
  floor, five candidate formulas compared in trainer-scaling.md (top-heavy recommended).
- Black 2's Castelia Gate leads to `ZONE_ROUTE_4`, White 2's to `ZONE_ROUTE_4_16` (zone 551; the script moves the
  unused warp off the doorway). The Overworld Editor now shows `route_4` with Black 2's map pieces (each version
  replacement's first value) over its own NPCs and texture set, and a White 2 | Black 2 switch on the two zones of a
  place. Screenshotted on a scratch copy.

## 2026-11-04 (overnight): research for the Join Avenue, the Version Key and trainer level scaling

Three research reports, read from the source and data, nothing built; each ends with the user's open questions:
- `design/join-avenue.md`: all of it is complete C ("resort"); the game already adds local visitors each day
  (`ResortField_AddInitialEntries`, file 9 of `a/2/4/4`); plan: a packer for `a/2/4/4` (`ARCID_RESORT_BINARY`, not in
  `res/` yet), seed the eight shops' owners from `res/paperwhite2/join_avenue/` once, daily visitors from the same
  roster, and paid shop upgrades through `MoneySub` and `AddShopExperience`.
- `design/version-key.md`: the white textures come from the field's single texture set per field open (the area of
  the zone it opens in) and from gates whose exit picks Route 4 by the build's version (`GameGetVersion`), which leaves
  the player in White 2's Route 4 header over Black 2's chunks; trainer defeats are global flags (`0x5f0 + ID`), so
  the 5220 re-battle is still unexplained (a debug test is in the report). An eight-step plan; steps 1-3 should fix the
  textures. The current item also switches Mistralton's and Driftveil's version pieces (items.md corrected).
- `design/trainer-scaling.md`: one hook in `BtlSetup_LoadTrainer` (src/system/btl_setup.c) after the party loads;
  tiers from the trainer class (`SPECIAL_TRAINER_CLASSES`), the team's highest level set to the tier's target with
  the others keeping their distance below; the facilities never reach it with a trainer ID except the Black Tower's
  bosses, excluded by class. `res/paperwhite2/trainer_scaling.json` with a new packer.
- plugins.md's level scaling example corrected to `level_scaling.json`'s spread of 3.

## 2026-11-04 (evening): the script language in the Script Editor

- The script language (docs/paperwhite2/design/script-language.md) is in the Script Editor: a script shows as
  `script N { ... }` with Frost's names, if/else, `say(26)`, `flag(492) == 1`, `var(0x4060) += 1`, `wild_battle(74)`;
  Apply checks it and puts it into its block of the .s only, Save writes; Restore… to the last commit or the original
  game; + New script; Text file over the code; the sidebar's reference, argument helpers (messages, species, flags and
  variables with notes and uses) and choices (sounds, species, items, moves, flags, variables, zones, ...). Every one
  of the game's 4051 scripts round trips (`editor/tests/scriptlang.test.ts`). Screenshotted on a scratch copy (Restore
  needs git, which the copy hasn't). **The user's test run next.**
- Not yet: movements inline, menus as a switch, `sub` routines, `alias`, the editor's warning for a message number
  past the bank's lines, completions while typing.

## 2026-11-04 (later): ambients streamed, up to 32 a zone; Global groups

- **Ambients are streamed** (plugins.md, Ambients, Streaming): a zone has up to 32, and the 8 whose path areas come
  nearest the player are made, joining out of view and leaving past a margin, their sprites loaded and given back as
  they go. The editor's warning is now "more than 8 near one place", and its sprite worst case takes the 8 nearest
  the player standing at each ambient. Built (hack, no warnings, DSi intact). **Not tested in game**: watch for an
  ambient popping in view (a camera wider than 9 by 7 tiles round the player would show one joining) and for the
  sprite cache filling as they come and go.
- The Groups panel's tabs are This zone and Global (the groups with no home zone only).

## 2026-11-04: spawn groups, the runtime, the packing and the debug page

- The design agreed with the user is in design/overworld-editor.md, Groups: at most one member at a time, picked by
  weight with a nobody weight; members are NPCs, instances or ambients, one group each, across zones; the group's own
  rolls; groups in `res/paperwhite2/overworld/groups.json`, membership on the member.
- Built (plugins.md, NPC spawns, Groups): `overworld.py` packs each zone's groups with every member's parts;
  `Spawns_GroupDenied` (paperwhite2_spawns.c) picks and denies; the debug menu's Conditions, Spawn groups shows the
  picks. Checked with a scratch two-zone group's dump. Built (hack, no warnings, DSi intact). **Not tested in game**:
  groups.json is empty until the editor can add them.
- **The editor** (`editor/src/modules/overworld/groups.ts`, `GroupsUI.tsx`): the ◇ Groups button opens the zone's
  groups (at home here, or with a member here) or all of them; New group, name, home zone, rolls, nobody weight,
  delete (once empty); each member with its weight and its chance of being picked, worked out exactly (sampled past 14
  members), with the Conditions preview's world when it's on; "Add" puts the chosen NPC, instance or ambient in a
  group, × takes it out. A Group section in the NPC's, the instance's and the ambient's panels: group, weight, chance,
  New group, Show only its group, which fades the rest of the map. Warnings for a cross-zone group rolling each entry
  or reading the weather or the tile. The 8-ambient count and the sprite worst case count a group's ambients once.
  Tested in the browser on a scratch copy (a group of an NPC and an ambient, 50/50, then 25/25 with nobody 2); 34
  editor tests pass (groups.test.ts). **Not tested in game.**

## 2026-11-03 (late night): the Version Key shelved

- Tested (with the fade-in fix): switching works, but Route 4 shows white textures until a battle, and a Black 2
  Route 4 trainer battles again on every visit. Shelved; the leads are in items.md, Version Key. The item stays in the
  build (debug menu only). The user's save is switched until the key is used again.
- Next: spawn groups.

## 2026-11-03 (night): the Version Key; the items documented

- **The Version Key** (the Galactic Key's place, GB Sounds' icon for now): switches Unova between Black 2's and White
  2's from the bag or Y, without the Unova Link keys. Its state is the save's city key, so Black City / White Forest
  follow it as they follow the keys; Route 4's zone and the version's map pieces (Route 4, Opelucid City, Driftveil's
  market) and Opelucid City's scripts' version checks now read it too. Use says which version, then reloads the map
  where the player stands; on rails, cycling, surfing or in the Union Room / Entralink it can't be used. Its
  description says the current setting. The debug menu's Give key items gives it. Built (hack, no warnings, DSi
  intact). **Not tested in game.**
- **docs/paperwhite2/items.md**: every item the hack adds or changes (Exp. Share, Shiny Candy, DexNav, Version Key).
  The Y button's shortcut slots are now full (36): another registrable item needs a larger save.
- Next, per the user: spawn groups (NPC, Instance and Ambient groups, and the random chance rework).

## 2026-11-03 (later evening): a shorter dust cloud; sinking into sand

- Tested: the dust cloud lasted too long. Now one appears as the cloud is cut off after a second; one goes from sand
  or snow by sinking in, in the landing puff, and from a cave's floor still in the whole cloud (plugins.md,
  Wanderers). Built (hack, no warnings, DSi intact). **Not tested in game.**
- For later (the user): switching Black City / White Forest, Route 4 and the version-dependent map pieces from the
  game, by an NPC or a key item, without the Unova Link keys. The machinery: the save's city key
  (`CityState_InitFromSave`, `CityState_ApplyVersionZones`), `VERSION_SPECIFIC_ZONES`' third entry (Route 4, always
  on in White 2), and `MapReplace_LoadVariables`' version (by the game's origin); a save flag and a few hooks.

## 2026-11-03 (evening): wanderers appear and go in the dust cloud

- Tested: the puff showed as one went, but was too small to hide it, and wasn't seen as one appeared. Now the
  rustling spots' dust cloud plays once where it appears or goes (with its sound), and it shows, or is gone, a third
  of the way in, once the dust covers it (plugins.md, Wanderers). Built (hack, no warnings, DSi intact). **Not
  tested in game.**

## 2026-11-03 (afternoon): wanderers on sand and in caves

- Where a wanderer's tile has no grass (cave floors, sand), it appears and goes in a puff of dust (the landing
  actors' puff) instead of rising out of the ground. In deep sand (Route 4's, the Desert Resort's) it stands sunk in 7
  units and leaves deep-sand tracks as actors do; in sand or snow, footprints. No shadow, as before (plugins.md,
  Wanderers). Built (hack, no warnings, DSi intact). **Not tested in game.**
- Next, per the user: fliers flying in from above and leaving upward (no-grass species), after this round.

## 2026-11-03 (midday): Route 4 in the Overworld Editor; no area empty under the level gate

- **Route 4 is zone 551 (route_4_16) in White 2.** The game plays the overworld's ZONE_ROUTE_4 cells as
  ZONE_ROUTE_4_16, as it plays Black City's as White Forest's (`VERSION_SPECIFIC_ZONES`, `src/system/zonedata.c`):
  its own events (NPCs), scripts, text and encounters (`ENCOUNTERS_ROUTE_4_2`). The editor now reads that table and
  shows the cells under route_4_16, with the map, White 2's NPCs and the buildings, in the chunk map too; route_4,
  black_city and black_city_gate are marked "(Black 2)" in the zone list. Screenshotted.
- **No encounters on Route 4's sand or in Desert Resort 2** was the scaled level gate: nothing there has a minimum
  under 14 (Route 4) or 17 (Desert Resort 2), so a party scaled below that met no species at all. Now, where the
  gate would leave a method empty, the lowest minimum among its own candidates is the gate (`LevelForGate` in
  paperwhite2_encounters.c; encounters.py's `odds` and the editor's preview do the same). Built (hack, DSi intact).
  **Not tested in game.**

## 2026-11-03 (morning): Overworld Editor conveniences

- The overworld's chunk map (the Map Editor's, under the zone filter), a zone's wild Pokémon for reference (a
  table over the map from the encounter species files that name its area: methods, seasons, times, rarity, levels,
  weather and conditions, filtered by season, time and method, sorted by any column), and ambients' sprites by
  condition (plugins.md, Ambients). Built (hack, no warnings, DSi intact); each checked in the browser. **Not tested
  in game** (the sprites by condition).
- **The other sidebars in sections, as the Ambients panel** (`editor/src/modules/overworld/EventPanel.tsx`): NPCs,
  proxies, triggers, warps, level scripts and an instance's NPC get headed sections with a label column and hints,
  each control the form's own or the editor's (sprite, height, script), NPC facing as arrows, and the whole form under
  All fields; buildings, cameras and rails their own sections (blend direction and curve as buttons). Nothing removed:
  every field the form had is still under All fields or a section. Screenshotted: NPC, warp, trigger, building,
  camera. Left for later: the camera's own settings are still the schema form inside its Camera section.

## 2026-11-03 (towards morning): five new ambient paths; a condition's default

- **The new paths** (plugins.md, Ambients: Traveling paths): wander, waypoints, peek, surface, fly-over; the record is
  104 bytes. The panel groups the paths in three rows (Stays, Round, Travels) with each one's settings, the map draws
  their areas and stops and previews them, and the editor's tests cover waypoints, a wander's area and a peek. The
  follower's emotes for ambients: dropped by the user. Built (hack, no warnings, DSi intact). **Not tested in game.**
- **The user's spring-only Taillow didn't show:** the game evaluates an ambient's condition as an NPC instance's (the
  same context, season by `GameData_GetSeason`), and the rule compiles right; the panel's "Add a condition" started
  with the time set to morning, day and evening, so a spring condition also left out the night. It starts empty now
  for an ambient. **For the user:** if it still doesn't show, Debug → Info gives the game's season then (a forced
  season takes effect at the next map change into an exterior).

## 2026-11-03 (later at night): ambients' reactions, climbing lines, offset buttons

- **The user's asks:** ambients that fly, run or hide when the player comes near, on a heading away from the player
  or fixed, with a random spread; a sprite to change to (a sitting Pidove to a flying one); an emote; returning after
  a customizable while, or not; a straight-up move. All in (plugins.md, Ambients: Reactions): the record is 56 bytes
  now, the Ambients panel has a Reaction section, the map shows a chosen one's trigger tiles and fixed heading, and
  the sprite bar counts its reaction sprite. The offset already reached the corner between four tiles (8 units): the
  panel now has buttons for the middle, edges and corners. Built (hack, no warnings, DSi intact); the panel
  screenshotted. **Not tested in game.**
- **Next:** the follower's own emotes for ambients (drawn without the follower's actor), then the new paths: wander,
  waypoints, peek, fly-over, surface.

## 2026-11-03 (late night): wanderers spread out; deleted files no longer go stale

- **Spawns** (the user's): at least 3 tiles from the player (was 4), never beside another wanderer, and more likely the
  farther from the nearest one (plugins.md, Wanderers). The per-species settings tested by the user: they work.
- **A deleted source kept its old pack:** the user undid the commit of Route 20's test ambient, and the build still
  had it. Ninja rebuilds for an input newer than its output, not one gone, so `configure.py` now writes each pack
  step's globbed sources to `build/<version>/sources/*.txt` (rewritten only when the list changes) and the step
  depends on it (`source_list`): the data packs, the hack's generated data and its archive members. Checked: adding
  and deleting a file in `res/paperwhite2/overworld/` each repack a/1/2/6; nothing else rebuilds on an unchanged
  configure.
- **The editor and a file deleted under it:** it couldn't save (nothing unsaved) or revert (the reload threw). Now a
  document whose file is gone is dropped when it has no unsaved changes; with some, a notice says Save writes it again
  and Revert drops it; Revert of a gone file drops it; only a 404 counts as gone (`isNotFound`). The document store
  tells views of files changed on disk (`filesChanged`, `useFileEpoch`), so a file that comes back (a commit
  redone) is held again (`useHeld`) and the Overworld Editor looks for its zone's file again. Checked in the browser on
  a scratch copy: delete and restore with no changes, and delete then Save with changes.

## 2026-11-03 (night): wanderers spawn more readily; their per-species settings

- **Spawns:** the user found new ones hard to come by on the move. Now every grass tile in view is a candidate (those
  ahead of the player 3 times as likely), tries come every 2 to 4 seconds (1 after a try without grass), and one off
  the screen for 2 seconds goes, so the ones left behind make room (plugins.md, Wanderers).
- **Per species** (plugins.md, Wanderers: Per species and Repel): `overworld` in the encounter species files, appears
  (both, steps, overworld), wanders (random, aggressive, passive) and grass; packed in the encounter member (version
  2, a species table); the Encounter Editor's species page has an Overworld card (in the Encounter Editor, which already
  writes these files, rather than the Pokémon Editor). Repel keeps weaker ones away. Built (hack, no warnings, DSi
  intact); the packer's byte checked; the card screenshotted. **Not tested in game.** **For the user:** the zone's
  switch is next.

## 2026-11-03 (late): overworld encounters, stage 1 (wanderers)

- **The design agreed with the user** (design/overworld-editor.md, Overworld encounters): up to 3 wild Pokémon in tall
  and dark grass, picked as a step would pick them, solid; a touch (either way, never sharing a tile) faces the two,
  plays the cry and starts a single battle. Per species later: appears in both / steps only / overworld only, and
  random / aggressive / passive. Repel: only those weaker than the lead keep away. Aggressive ones stay in their grass.
  Grass now; caves and sand later. A zone switch, on by default. Extras: "!", shiny sparkle, grass rustle; a DexNav
  search later.
- **Built, stage 1** (plugins.md, Wanderers): spawning, rising and sinking, wandering, the touch and the battle; the
  debug menu's Fewer step encounters (a quarter of the rate), No wanderers and Wanderers now. Built (hack, no warnings,
  DSi intact). **Not tested in game.** **For the user:** Route 20's grass; a touch both ways, a shiny (Always shiny),
  dark grass (always single), after a battle, cycling into one, and the follower walking behind.
- **Tested by the user:** working. Changed after: it stays visible until the battle starts; a "!" over it on a touch
  (to try; perhaps aggressive ones only later); the grass rustle as it rises, sinks and steps; a shiny's sparkle
  (silent: no shiny sound found by name yet). The non-shiny Wurmple, Silcoon and Swinub on Route 20 in winter are
  likely script 10852's seasonal NPCs (walking-Pokémon sprites, never shiny), not wanderers: to check with Wanderers
  now, or No wanderers on. Built (hack, no warnings, DSi intact). **Not tested in game.**
- **The user's second test:** the shake was the wrong grass; the wanted one is the actors' standing grass (now, at
  its tile, plugins.md, Wanderers: Effects). The sparkle is lower (3 units) and half as long. The "!" never showed: its
  bubble had the held task's update, which ends one without an actor at once; now it's the one that ends itself, over
  the one walked into. The non-shiny Swinub with a sparkle: Swinub's, Wurmple's and Silcoon's shiny follower rows are
  placeholders (975 in all). The user chose to leave them for the shared shiny palettes (note in
  design/shiny-palettes.md, 1.3). Built (hack, no warnings, DSi intact).
- **The user's third test:** the grass and the "!" work. The grass now moves as an actor's, on one tile only (down
  and sideways at the step's start, up on arrival). **For the per-Pokémon settings (stage 2):** an option to show no
  grass under a species that flies or hovers; perhaps the sparkle's height by the sprite (the registry's sprite Y),
  since it floats over small ones and the user left it as is for large ones. Built (hack, no warnings, DSi intact).
  **Not tested in game.**

## 2026-11-03 (later still): ambients' turn directions, a new one's height, their paths in the editor

- **Turns to:** a perch can turn to only some directions (`path.faces`, the panel's Turns to buttons; plugins.md,
  Ambients). Packed in the flags' top bits; the game picks among them. Built (hack, no warnings, DSi intact). **Not
  tested in game.**
- A new ambient starts on the ground (0 over it), not a tile up.
- **Paths in the editor:** drawn on the map, and moving in the Movement preview as the game moves them (the user's
  paths: perch, hover, circle, line, figure eight). Checked in the browser on a scratch copy; tests for the formulas.

## 2026-11-03 (later): the sprite cache tested; the Ambients panel; more than 8 ambients placed

- **Tested by the user, emulator and 3DS:** Route 20 at autumn night with 7 more ambients of new sprites: 39 of 48
  cached (14 on demand), none uncached, textures 303 KB (peak 304), largest free 80 KB, no failures; no missing NPCs,
  wrong sprites, pop-in, crashes or freezes, there or elsewhere. 48 stays.
- **The Ambients panel** (`editor/src/modules/overworld/AmbientPanel.tsx`), laid out as the spawn panels: Ambient (name,
  its sprites with the sprite browser, which marks the zone's own and can hide them, up to 4; facing), Place (tile,
  offset, height over the ground), Movement (the path's kind and only its settings), Shadow, Appears, Rolls, and all
  fields last.
- **More than 8 ambients:** a zone can have 32 (the schema); the game already showed the first 8 whose conditions hold.
  The editor warns where more than 8 can hold at once, and the sprite bar counts only the 8 shown.

## 2026-11-03: the sprite cache raised to 48, with a VRAM reserve (trial)

- **More measurements (the user's):** Castelia's Mode Street (zone 33) 8 of 32 sprites, textures 252 KB, largest free
  131 KB, palettes 7,792; Pokéstar Studios 15 (13 on demand), 230 KB, largest free 153 KB. An estimate of every
  exterior zone (texture sets of a/0/1/4 and a/1/7/4, plus about 55 KB the field always has, plus sprites) puts none
  above Castelia's outer ring (272 KB measured).
- **The trial** (plugins.md, Sprite limits): cache 48, materials 96, and a sprite loaded on demand waits until a cache
  entry and 32 KB of texture VRAM are free, then loads. The Overworld Editor's bar reads the 48 from
  `include/paperwhite2/sprites.h` (Route 20 now 36 of 48, Virbank City 26). Built (hack, no warnings, DSi intact).
  **Not tested in game.** **For the user:** Route 20 at autumn night (its worst case) and a busy city, with Memory:
  sprites past 32 now show, no texture failures, and the largest free block stays above about 24 KB.

## 2026-11-03 (night): sprite and VRAM research; the debug menu's Memory readout

- **What limits sprites** (research, from the code): the field's G3D system has 384 KB of texture VRAM (3 slots) and
  16 KB of palette VRAM, linked-list managers that free anywhere (`FieldRoutine_Open`), shared by the maps, buildings,
  effects and sprites. The sprite cache holds 32 codes (`FldActSys_InitBillboardActor`, a number Game Freak passed),
  the field billboard system 64 materials and 128 billboards (`FieldG3D_Init`). A sprite uploads its frames whole (a
  person's 7 of 32 by 32 at 4 bits, 3.5 KB; a walking Pokémon's 8, 4 KB; the player's about 8 KB) and a 16-color
  palette. A preload list is read only at a warp, fly or game start (`FieldMapControl_InitSpawn`), not when walking
  into a zone, so each list covers a region (Route 20's is Floccesy Town's, Floccesy Ranch's and Route 19's too: 14 of
  its 23 on Route 20, the rest those zones' people). The loader reads one sprite at a time from the card.
- **The plan the user agreed:** measure first (this readout), then sprite streaming: the cache counts its users, preloads
  become hints released when unused, NPCs far from the camera hold no sprite, unused sprites stay until the space is
  needed; then raise the 32 as far as the measured VRAM allows.
- **Memory** in the debug menu (plugins.md, Memory readout): the sprite cache's use, peak and sprites that found no
  entry; billboards and materials; texture and palette VRAM used, peak, largest free block and failures. Built (hack, no
  warnings, DSi intact). **Not tested in game.** **For the user:** open it in busy places (Route 20, Virbank City,
  Castelia City, a zone after a battle) and note the numbers, with Reset peaks before walking around.
- **The user's numbers (tested in game):** Virbank City 21 of 32 sprites (4 on demand), textures 247 of 384 KB, largest
  free 136 KB, palettes 6,576 of 16,384 bytes; Route 20 28 of 32 (3 on demand), textures 241 KB, largest free 142 KB,
  palettes 6,128; Castelia City's outer ring 11 of 32 (9 on demand), textures 271 KB (peak 272), largest free 112 KB,
  palettes 4,032. No sprite went uncached and no allocation failed; the largest free block is nearly all that's free,
  so the texture VRAM isn't fragmented. Billboards at most 24 of 128, materials 28 of 64.
- **Debug warp froze the game** (Warp to zone...): the warp's map change ran with the number entry's window open, and
  the script, which outlives the warp, then closed a window of the old field. Now the script checks the fly spot,
  closes the window, then warps as `MapChangeFlyWarp` does (`EventMapChangeWarp_CreateGrid`, a door's fades; Fly's map
  change needs the screen faded first). Built (hack, no warnings, DSi intact). **Not tested in game.**

## 2026-11-03 (evening): ambients' sprites loaded on demand; the bird moved to Virbank City

- **The user's next test (Virbank City):** Swellow showed, but always from behind, unanimated, and now and then gone.
  Pokémon sprites (animation set 13) have 4 animations, one a direction, always playing (`RailActorAnim_DrawWalking`);
  the ambients used a person's layout (status times 4 plus direction), so a hop asked for animation 8 or more, past the
  set's end, and standing stopped the animation. An ambient whose set has fewer than 12 now plays its facing's
  animation, always (`byDirection`). **Tested in game by the user (2026-11-03):** Swellow sits on the railing at
  205, 649 with its shadow, flaps, turns and hops, and stays shown the whole time.

- **The user's test (Route 20):** the bird was invisible with its shadow showing, then drew a trainer's sprite. Cause:
  Pidove wasn't loaded (not preloaded, and the cache full), and the reflections' call it used drew a billboard with no
  material, which pointed at an empty slot and later a trainer's. Fixed (plugins.md, Ambients, Sprites not loaded):
  the sprite loads on demand as an NPC's does, an ambient whose sprite can't get a cache entry doesn't show, NPCs going
  don't unload an ambient's sprite, and a zone change cancels and releases.
- The bird is now in Virbank City (`res/paperwhite2/overworld/virbank_city.json`) on the railing at 205, 649, height
  16 (ground 0 there), as Pidove or Swellow; Route 20's file had only the bird and is gone. Built (hack, no warnings, DSi
  intact). **Not tested in game.** Still to see: an ambient over a full cache now shows nothing, and one that couldn't
  load at zone entry doesn't try again until the zone is entered again.

## 2026-11-03 (early): the Overworld Editor's sprite bar

- The header's second bar: the sprites a zone can have loaded at once, in the worst case, against the sprite cache's 32
  (overworld-editor.md, The sprite load bar). The zones' preload lists are in `res/field/actors/preloads.json` now
  (dumped; `npc_cache_data.py check` matches the ROM's 25), read-only so far: the build packs the ROM's a/0/5/7.
- Script 10852 is modelled now (`spriteLoad.ts`, `seasonalFlags`): in zones whose scripts call it, flags 500 to 599
  show as it shows them (the season's base and its three rolls, 540's set, the night swaps where EVENT_WORK_0x401f is
  set and it is night, 550 to 559 always, 590 to 599 at 10% each), every season, roll and time tried. Route 20: 37 of
  32 at worst (autumn night, rolls 1, 5, 9): 23 preloads, the player and follower, 10 NPC sprites and the ambient.
  Virbank City 25, Virbank Complex 2 24, Aspertia City 22, Castelia City 15. With at most 2 of the 10% NPCs the figures
  are the same, so the tooltip only gives that figure where it is lower. Other flags (story flags) count as shown.
- **For the user:** packing the preload lists from res/ (hack builds) would let a zone drop vanilla preloads it no
  longer uses, freeing cache slots; moving 10852's NPCs to conditions would make the bar exact for them.

## 2026-11-02 (night, later still): ambients' shadows and sprite sets

- Shadows (none, under its feet, on the ground below), the actors' oval drawn for each ambient (plugins.md, Ambients),
  and `sprites`, a set of up to 4 an ambient shows one of, picked by its roll. Route 20's bird at 183, 647 is now
  Pidove or Swellow, with its shadow under its feet. Built (hack, no warnings, DSi intact). **Not tested in game.**

## 2026-11-02 (night, later): ambients, first version

- Ambients (plugins.md, Ambients): `ambients` in the zones' overworld files, packed with the NPC rules; drawn as
  billboards from the actor system's sprite cache by `paperwhite2_ambients.c`, on perch, hover, ellipse, line and
  figure-eight paths. The Overworld Editor's Ambients tab: a list, Shift+click to add, drag to move (keeping the height
  over the ground), a panel of every field, and each drawn at its height on a line down to its tile.
- The first test, at the user's tile: `res/paperwhite2/overworld/route_20.json`, Pidove (`OBJ_CODE_POKEMON_PIDOVE`)
  perched on the tree at 183, 647, at height 46 (the canopy's top layer there, over ground at 0), turning and hopping.
- Built (hack, no warnings, DSi intact). **Not tested in game.** Not yet: shadows, flying off, the paths drawn in the
  editor, picking again in the zone, sprites from a set or the encounters.

## 2026-11-02 (night): NPCs picked again in the zone, rolls by the hour

- `Spawns_Repick` and `PaperWhite2_SpawnsUpdate` (plugins.md, NPC spawns): once a second while no event runs, a
  change of the hour or the time of day picks the zone's NPCs again; an NPC whose record should change is changed only
  while it, and where it would appear, are out of the field camera's view (a frustum test, two tiles of margin), its
  actor removed and made again if it shows. `EVENT_WORK_SPAWN_PICK` (0x4058) holds the key the picks were made for.
- Each NPC's `rolls` (overworld.schema.json; the Overworld Editor's Rolls box): the hour's seed by default, or the
  day's, the time of day's or each entry's. The conditions engine gained the hour's and the time of day's seeds.
- Built (hack, no warnings, DSi intact). **Not tested in game**; the test list is in the reply of 2026-11-02 night,
  with phase 2's (a night NPC at zone entry, a host with day and night instances).

## 2026-11-02 (evening): tile tasks for tonight (the user's notes on the debug paint; not started)

The user compared Route 20's map04_20 vanilla, debug-painted and hand-corrected overhead. River corners and the
round path corners now look like vanilla. Tasks, atlas first (map-maker-atlas-first):
1. **Reading mislabels some tiles:** the river corner by the large tree in the middle: the bottom-right tile of the
   tree's 3x3 footprint was read as water edge, not grass; painted as grass by hand, the corner matches vanilla. A
   reading fault, likely blocked tree tiles beside water.
2. **Path corners are too small:** vanilla's path corners span about 2.5 tiles and ours 1.5 (the user's markup:
   the corner's angle starts further back). River corners are right at 1.5. So the corner's size belongs to each
   edge's profile, measured from the atlas (CORNER_IN and CORNER_SCALE per edge, or a taper per edge). Path points
   (1.5 tiles each side, 3 in all) are right.
3. **Half-tile ledges' corners:** vanilla draws them square; ours come out rounded (they look good, but aren't the
   game's). The square corners the reading paints don't reach ledges.
4. **One-way ledges on paths are dropped:** the little jump-down ledges across the path on the left of map04_20
   aren't generated.
5. **Paths beside a half-tile ledge** go wrong (by the upper bridge).
6. Still open: ledges back to back with river banks; paths meeting bridges (their square corners there); cliffs
   (a ridge texture at the bottom, the face above, separate points along the top, per the user's 2026-11-02 notes);
   banks under cliffs.
7. **Real examples to check and match against (agreed in outline; to think on, maybe tried tonight):**
   - automatic: vanilla's tiles cut with a 5x5 neighbourhood key, heights normalized, beside the atlas, to score
     generated tiles against vanilla's in the same situation and fit the profiles (corner sizes, points, ledges);
   - manual **snippets**, the user's idea: the user selects tiles in an area and saves them to a snippet library
     (apart from the objects): the mesh cut at tile edges, its height normalized, with a reading of its tiles and a
     ring round them. The generator uses a snippet's mesh where a painting matches its pattern, ring included. A
     snippet's border must lie on plain ground so its seams can't show (the editor warns otherwise); no turning or
     mirroring unless the snippet is marked symmetric. Snippets double as test cases (generate their pattern, compare).
     Made per area as the user reaches it; for what doesn't follow patterns (paths at bridges, ledges at banks).
   - Order: the reading fixes and tonight's list first, the automatic checking with them, snippets after.

## 2026-11-02 (later): the user's first round of testing, fixed

- **Dark grass drawn black in game:** materials new to a chunk (kusa_ec1s and kusa_ec2s had never been in Route 20's
  map04_20) took the model writer's default record, which had no light on; the GPU colors a vertex with a normal by
  the lights on plus emission, so they drew black. A new material whose shapes have normals now has light 0 on, as
  98% of vanilla's do (map_model_data.py written_model). Rebuild to see it in game.
- **The debug button** (Paint the whole chunk from its reading) dropped trees, fences and bridges: the chunk's own
  structures and standing decorations are now kept wherever its copy exists, every tile painted or not. It raised the
  river to the land's height (banks read half a tile lower than the water, splitting each body from its banks): a
  bank now takes the height of the water beside it. Bridges keep the chunk under them (their walkway's collision).
  Pillars came from blocked tiles whose collision the hack raised (perches): such a tile is painted at its drawn
  ground, and the generated collision keeps a blocked tile's height where the chunk's was blocked too. It is now one
  painting edit with its generate, so Ctrl+Z undoes both (before, putting the chunk back left the painting fully
  painted, so the next stroke regenerated it all).
- **Vertices:** the editor counted the GLB's vertices, which say little of the DS's cost; the Chunks tab now shows the
  model packed as the build packs it (tools/paperwhite2/map_cost.py: vertex commands, polygons with a quad one),
  against vanilla's busiest by the same count (overworld 3,933 vertices, 1,873 polygons). The user's chunk with a
  little dark grass painted: 2,296 vertices to vanilla's 2,178. The writer packs a vanilla chunk about 10% heavier
  than Game Freak's lists. The user saw no slowdown on a 3DS with the debug-painted chunk (about 5,400 vertices).
- **Still to do (tiles):** the reading doesn't pick square path or water corners; path corners' chamfer cuts into the
  grass tile beside it instead of being a small corner of grass inside the path tile; the corner by the bridge; small
  dark holes at a few path and water corners; banks under cliffs (the water below a cliff face), not made yet.

## 2026-11-02: grass painted apart from terrain (the Decorations tab)

**Done:** grass is its own layer of a painting (`grass` rows), painted in the Map Editor's new Decorations tab
(pencil, rectangle, fill, eraser) and built by the map maker over whatever ground each tile has; repainting terrain
under it keeps it. Eight kinds learned from the atlas (`res/paperwhite2/map_grass/grass.json`,
`tools/paperwhite2/map_grass.py survey`): tall and dark grass, their "snowy rustle" (B) and "other rustle" (C) kinds,
and very tall grass and very tall dark grass (Route 7's textures only). Hidden Grotto "grass" is the entrance's trees,
left out. Route 20's Tall grass and Dark grass terrains are gone from its style (the grass tab replaces them). Details
in docs/paperwhite2/design/map-editor.md, "Grass, painted apart from the terrain".

Also: Start painting defaults to a style made for the chunk's texture set, or learns one ("auto", a minute for
Route 7); learned styles take a ground's commonest walkable tile type (Route 7's grass had come out blocked), which
also lifted its round trip's heights within 2 units from 93% to 99.5%.

**Tested:** browser runs on Route 20 (dark grass painted, a field of tall grass erased to the ground, path painted
under grass, collision checked) and Route 7 (very tall grass regenerated with no edits: vanilla's collision exactly,
looking the same, boardwalks over it); typecheck, tests, round trips. **Untested in game**, in particular the
encounters, the rustles and very tall grass's no-cycling.

**For the user:** paintings started before today have no grass rows; the Decorations tab offers "Take the chunk's
grass" for them. Grass painted over blocked tiles or boardwalks (orange) is drawn but keeps that collision.

## 2026-11-05 (morning): next — editor controls and the object library; tiles still needed

**Done (2026-11-05):** the editor controls the user asked for before more tiles:
- the object library's browser and viewer (Browse... in the Objects and Paint tabs; rename changes the name shown, the
  folder stays);
- the faded model off by default; the painted overlay drawn over the map (tops only, outlines drawn normally); the
  toolbar's Overhead view; the Paint tab's fill tool;
- the gizmo (three.js TransformControls): on the Faces tab's selection, arrows on each axis, stepping by the game's
  grid, a step in units, or smooth (Move section); drag an arrow or a plane square, or click an arrow for one step
  the way it points (Shift+click: back); on the Paint tab's selected object, by whole tiles across only. Each move is
  one undo step;
- quarter turns of placed objects (R, Shift+R, or the Turn buttons): projects' objects take an optional fourth value,
  quarter turns clockwise from above (schema updated); map_maker turns the model, normals, footprint and collision
  about the north-west tile. Tested in the browser: drawn, generated and collision tiles line up.
  **Untested on hardware.** Directional tile types (a ledge's jump direction) don't turn with the object; a turned
  ledge still jumps the way the original did.

**Dark grass (done):** Route 20's style has a Dark grass terrain (key d): tile type 0x240006 (the double-battle
grass class), blades kusa_ec3 / kusa_ec2s / kusa_ec1s at lifts 2, 6 and 10 as vanilla's dark grass has them. The
reader now takes the layered terrain with the most of its layers standing on a tile (tall and dark grass share
kusa_ec3); it reads Route 20's dark grass exactly (54 and 28 tiles in map05_20 and map04_21). Untested in game.

**Tiles still needed** (atlas, overworld edge and slope textures by tile count; done: paths, Route 20's banks,
ledges, cliffs and tiers, stairs, grass hills):
1. Sea shores and beaches: sea cliffs (sea_gake01, 2,227 tiles, 9 sets), wave foam (sea_zanami2), wet sand
   (sea_simi.1). The biggest left; Route 13, Humilau.
2. Area cliffs and paths: out57_gake*, out07_gake*, the desert's sabaku_el and ga_s1_0, Icirrus's c8_michi03b; learned
   banks and tiers (they fail verification).
3. Water: rapids and currents, deep and shallow sea (sea_asase), waterfalls.
4. Hedges, flower beds, rock edges, tree lines (plant01, iwa01, ki04bx): maybe library objects.
5. Towns' curbs and pavements (mostly structures and walls); caves' walls and water edges (Wellspring's edges 60%).
6. Winter chunks (Icirrus's winter05_05): a painted chunk with a winter counterpart needs it painted too.
7. Polygons (the user's decision after testing): T-junction splits and run counts; see below.

## 2026-11-05 (overnight, later): tiers, stairs, hills, learned styles; polygons are the open problem

- Tall cliffs as 16-unit tiers (rock rim under the tier above), stairs and grass slopes as ramps with sloped collision
  (vanilla's slope indices), styles learned for any texture set and verified by round trips (`map_profiles.py draft
  --verify`), learned underlays. Route 20 round trip: terrain 93–97%, edges 96–98%; Desert Resort 2 72→96% terrain
  with a learned style.
- **Polygons, for the user's decision.** The editor's bar now counts polygons as the DS does (a quad once, as the
  writer pairs triangles): the busiest vanilla overworld chunk has 1,345 (its 2,367 triangles are mostly quads),
  caves and buildings up to 2,457. Regenerated Route 20 chunks have 1,443–2,044 against vanilla's 519–790, so a
  fully painted chunk can pass the overworld's ceiling (map04_21 does). Measured on Route 20's four chunks:
  - not splitting the ground's edges at every corner on them (vanilla doesn't; we do to avoid T-junctions, which the
    user's tests have shown no cracks with) saves 20–27%; not splitting strips either, a further 5–10%. Whether the
    DS shows cracks without the splits needs an in-game test;
  - the rest is the bands: a strip per face per straight run, and runs break at every bend, chamfer and rounded
    corner (map04_21: 801 strips). Fewer runs means simpler corners, a trade against the look the user asked for.
  Quad-friendly strips and clean-corner fans are in (about 10–17% fewer triangles, 7% fewer polygons).

## 2026-11-05 (overnight): profiles from the atlas, chamfered corners, seams, borders

Working through the user's tile list on their go-ahead; each change checked with the round trip on Route 20's four
chunks (map_roundtrip.py; numbers in each commit) and the scratch-copy paintings, none tried in game.
- Ledges and cliffs: profiles measured across every straight run in the atlas (map_profiles.py); the lower ground
  drawn under the whole step tile (the seam at a ledge's foot); cliff faces repeat by height (v_units) instead of
  stretching.
- Corners as the game draws them (the user's chamfer observation, checked in the atlas): outward corners chamfered,
  rounded ones at a constant width, inward corners chamfered out into the diagonal tile (which is carved), u by
  length round corners. Tiles beside an island are clipped right (they had holes).
- The sliver where painted water ends against a vanilla bank is gone (a wedge strip along the end of the band).
- Path edges face a bridge's end (all 23 in the game do); tiles past the chunk's border are read from the
  neighbouring chunk.
- Round trip now (Route 20): terrain 89–97%, edges 96–98%, no holes. **For the morning:** triangles are up
  (1,606–2,339 against vanilla's 952–1,426; map04_21 is near the busiest vanilla overworld chunk, 2,367), so the
  triangle work matters before big paintings; generating near a chunk's border reads its neighbour (about a second
  each).

## 2026-11-04 (night): terrain-only cutting; the user's ledge and cliff test

- Painting over a chunk cuts only its terrain (ground, edges, slopes, walls that top out at a neighbour's ground,
  a terrain's own layers like tall grass, decals on the ground), by the textures' roles: trees (canopy, shadow,
  trunk), fences above the ground and bridges stay whole.
- The user's test of ledges and cliffs (2026-11-04): ledges look right but leave a seam at their foot (vanilla draws
  the lower ground across the whole tile under the see-through face) and meet water edges oddly; cliffs' textures
  stretch (v over the whole drop) and their corners are off; water edges' inward corners are square (never rounded:
  not a regression, checked); the sliver at vanilla banks and the bridge corner remain. The user's rule from now on:
  fix tile-building issues by what's learned from the atlas before any pinpointed fix. Plan: learn edge and step
  profiles from the atlas (faces, widths by drop, v per height, what's under see-through faces, corners), then seams
  matched to vanilla's side cross-sections (which also gives chunk borders), then stairs and walkable slopes, then
  triangles.

## 2026-11-04 (evening): the atlas

- `tools/paperwhite2/map_atlas.py build` (under two minutes; build/, out of git): every chunk of the original game
  read into SQLite, twice, the second time with the texture roles the game agrees on. 0 chunks fail. Next, by the
  user's order: the terrain types the round trip found missing (ledges and cliffs: edges at height changes; slopes),
  then chunk borders, then triangle counts.

## 2026-11-04 (later): the round trip, and what it found

- `tools/paperwhite2/map_roundtrip.py` reads a vanilla chunk, paints it from the reading, generates it in a
  temporary folder and compares tile by tile, with a page of the two from above. Findings in map-reader.md, Round-trip
  findings: plain ground comes back nearly exact; edges at height changes (cliff and ledge tops, cave rims, desert
  sand), cliffs, chunk borders and triangle counts are what's missing. The budget bars measure against the busiest
  vanilla chunk of the chunk's kind (overworld 2,367 triangles; caves and buildings 3,821).

## 2026-11-04: edge families learned per chunk; snow ground, billboards, moved joints

- Each edge texture's inside (the ground a tile toward where its v grows) is learned per chunk, and with no style a
  tile of the edge or a bend of it reads as that ground: Route 13's grassy road, the desert's sand edges and
  shorelines no longer flip colour tile to tile, and bends are found without a style. See-through flat ground lowest
  on its tiles is ground (Icirrus's snow over grass; not tree canopies). Sloped see-through faces that all lean one
  way are billboards (Floccesy's flowers), not slopes. Confidence is agreement among the points that found ground
  (a riverbank's bed showing at two points is sure). glb_mesh reads skins whose joints are moved and bound back
  (Nuvema Town). Humilau's door planks over its piers are honestly unsure (two surfaces share those tiles).

## 2026-11-03 (night): stairs, rivers, dunes; the grid hidden over the original game

- Tall grass needs its blades over half the tile (not stairs beside it); a tile's own texture rising over its middle
  (a stair's upper steps) isn't a structure on it. Under water the ground is the bed within two tiles under the
  surface, else a see-through surface over the whole tile (the sea), never a shadow or the rapids. An edge needs a
  fifth of the tile (not a sliver of sand edge on a dune). The Tile grid is hidden while the Reading layer shows the
  original game (it's drawn from the current collision, with the hack's height edits: Virbank's pipes are walkable
  only in the hack).
- Known: shoreline tiles (Route 13) read as wet sand or water by whichever has more of the tile; the atlas should
  learn that both are one shore.

## 2026-11-03 (evening): structures by their open sides; see-through water; empty tiles

- A texture is a structure (a deck) only where its sides are open: Route 20's bridges and Virbank's walkways over its
  canal (a second collision layer of water under them), not the desert's plateaus and cliff caps over the sand the
  game draws beneath. Water drawn see-through at the collision's height is a tile's ground (Virbank's canal under its
  pipe, which now reads as water with the pipe over it; the sea). Edges count only near the ground (not the desert's
  sand edge under a cliff's cap). A texture drawn by two materials takes its most common alpha. Tiles with no faces
  at all (Desert Resort 2's last row) are outlined grey; clicking a place again takes the next square down.

## 2026-11-03 (later): the reader on Virbank, the Desert Resort, Routes 12 and 13

- The Reading layer names textures by a style only where the style's texture set is the chunk's (no more "not in the
  style" against Route 20 everywhere); the atlas will learn texture roles from every area instead.
- A blocked tile's ground is its top surface (the desert's cliff caps, ga_s_futa at 48, over sand at the collision's
  0). A layer's surface may be blended (a canal's water). Layers with nothing drawn at their height (Route 13's
  invisible blockers in the air) aren't drawn on the layer; the Reading squares take clicks first (squares under a
  walkway, floating ones). Routes 12 and 13 and the Desert Resort otherwise read well by the user's check.

## 2026-11-03: the map reader, after the user's checks of Route 20 and Virbank

- Fixed: clipped slivers faced wrong (road tiles by the bridge, fence tiles), arrows in paths' middles (now bends),
  rapids as edges, cliffs as unsure, stairs far below a tile counted as its slope, ground under a canopy (from the
  neighbours), Virbank's roads read at the canal floor (the ground is now where the collision walks), red squares
  for textures the style doesn't know (confidence is now the geometry's agreement). New: decks and what's under
  them, a reading per collision layer, open sides (vanilla's unwalled holes). Next: the user's checks of Route 12,
  Route 13 and the Desert Resort.

## 2026-11-02 (night): the map reader

- `tools/paperwhite2/map_reader.py` reads a chunk tile by tile (map-reader.md, Built so far); the Map Editor's
  Reading toggle shows it, and a click a tile's record. On Route 20 (vanilla) it reads the paths with their edges'
  outsides, the river and its banks, the bridges as structures over water, tall grass by its blades, and forests by
  their tile type (unsure, no ground drawn under the canopy). Next: the user checks it on chunks of different
  terrain; then the round trip, then the atlas.

## 2026-11-02 (design): reading vanilla maps

- The user agreed to step back from per-case fixes: `docs/paperwhite2/design/map-reader.md` designs a reader of
  vanilla chunks (every face over each tile, read into the painting's own terms, shown as a layer in the Paint tab),
  a round-trip test (read, paint, generate, compare with vanilla), an atlas of every vanilla overworld chunk (SQLite,
  out of git, built only after the round trip passes on a few chunks of different terrain), an eyedropper (copy a
  tile's reading; stamp its faces as the exception), textures from other areas, seams matched to vanilla's side
  cross-sections, and rules as tables. Next: the reader.
- Open from the last test: the bridge's underside, a sliver where painted water meets a vanilla bank, road corners
  at a bridge (image 5 of the user's last test), the grid drawn at the painted height over water.

## 2026-11-02 (late): dents by what's at the border; bridges

- A rounded corner's gap next to a vanilla path's edge tile (michi01a) is grass, as that tile's outer side is.
- A kept tile whose ground texture no terrain has (a bridge's deck, hashi01a, path by its tile type) counts by its
  tile type for paths, so a road's grass edges run up to a bridge square, as vanilla's do, but water edges draw no
  bank against it. A pond by Route 20's lower bridge and a road ending at the bridge look right on the scratch copy;
  **not tried in game.** Plain Water tiles against the river's own bank tiles leave a drop to the bed: paint Water
  edge where painted water meets a vanilla bank.

## 2026-11-02 (night): vanilla's riverbank; square-corner edges; paths edged against water

- Water's profile is now Route 20's own bank: the land half a tile above the water's surface, the bank sloping down
  from its edge (gake1_1, gake01a2, the water's edge), the bed a tile below the land. Water and its edge tiles'
  collision is half a tile under their painted height (collision_lift), so paint water level with the land. No wall
  between painted tiles and the chunk's own of their family, and no lip where painted water meets the river: a pond
  joined to Route 20's river looks like the river's own banks (scratch copy). The meadow west of that river, level
  with the water under a ridge, is the game's other bank, not made yet.
- Path edge and Water edge have square-corner variants, for corners the rounding shouldn't touch. Path edges draw
  their grass against water and its edges too.
- Discarding a painted map's project or its copy discards both; generate says what to do when the copy is gone.
  Flat test chunk: 755 triangles; packs. **Not tried in game.**

## 2026-11-02 (evening): edges are painted; straight bends; kept tiles read by their texture

- The margin is gone (it overwrote a bridge and a bank). Borders are drawn where Path edge or Water edge tiles are
  painted, against what's outside them, which is read but not changed: kept tiles by their ground's texture, else
  their tile type. Water edge tiles are vanilla's bank type.
- Bends' sides are straight, as vanilla's; rounded corners no longer fold on the lines further in (the spike at a
  pond's corner). Test chunk with painted edges: 875 triangles; **not tried in game.**

## 2026-11-02 (later): paths' bends and corners as vanilla's; the margin round a painting

- Bends are three tiles wide and half a tile deep, one is always across from a T's branch, convex corners are cut
  round (paths and banks), and the gap a bend or corner leaves at the border is the outside's ground (no stretched
  grass). Kept riverbank tiles count as blocked grass, so a path beside them gets its border.
- Painting over a chunk draws its margin again (kept grass and path tiles up to two from the painting): their ground
  faces only, so fences and trees stay; a painted path joining a vanilla one turns into it. Test chunk: 904 triangles
  flat, 1,274 joined onto Route 20 (vanilla 1,114); packs. **Not tried in game.**

## 2026-11-02: vanilla-style paths and riverbanks; hiding faces; paste selects; discard in Changes

- **Edges as profiles** (`tools/paperwhite2/map_edges.py`, the style's `edges`): paths' grass edges now lie inside
  the path's outer tiles, as vanilla's do, with half-tile bends every third tile on alternating sides; painted water
  gets vanilla's riverbank (a dirt ridge, the water's edge, the bed half a tile down) in its outer tiles, which take
  the bank's tile type (0x830041, vanilla's). Straight runs are merged: a test chunk with three roads, a pond and tall
  grass is 392 triangles; packs. **Not tried in game**, nor whether the bank's tile type lets the player surf from
  it.
- The Faces tab: H hides the selection (from view and clicks; the model doesn't change), Alt+H shows it again; a
  paste selects what it pasted; Ctrl+Z now works while a checkbox has focus (it didn't after ticking Paste).
- Put it back can keep the chunk's collision. The Changes panel can check every file shown and discard the checked
  ones (back as last committed; new files deleted), after a confirm.

## 2026-11-01 (night): smart path edges, put back, faded painting, generate after each stroke

- **Smart edges** (`map_maker.py`, a style's `edges`): grass, tall grass and blocked grass blend into path with
  `michi01a` across a tile, corners rounded, as vanilla's paths are. A test chunk with a path, a branch and a square:
  171 triangles; packs. **Not tried in game.**
- Kept tiles take their heights from the chunk's model (its highest opaque ground face), not its collision, so
  collision raised for perches no longer makes pillars when painting starts. A height painted on a kept tile makes it
  a painted tile, so a generated area can be repainted.
- The Chunks tab's **Put it back** (as the original game, the tag `w2-original`, or as last committed): the chunk's
  folder as git has it, written to the working tree only; undoable. Checked byte for byte on a scratch copy.
- The Paint tab: the painting's colors and the model faded to half are two toggles; Generate can run after each
  stroke (one undo step with the stroke); the height drags; the tile grid lies at the tiles' heights.
- Painted water meeting a chunk's own river keeps the river's curved bed; no fix yet.

## 2026-11-01 (evening): the object library and painted maps

- The tile slicer and its Route 20 library are gone (the user's call): too many triangles, near-duplicate pieces,
  textures that didn't join.
- **Object library** (`tools/paperwhite2/map_objects.py`, `res/paperwhite2/map_objects/`): the Faces tab saves a
  selection as an object; the Objects tab places one on an existing chunk (faces pasted, collision painted).
- **Painted maps** (`tools/paperwhite2/map_maker.py`, `res/paperwhite2/map_styles/route_20.json`, projects in
  `res/paperwhite2/map_projects/`): the Paint tab paints terrain and heights, places and drags objects, and generates
  the chunk's model and collision. A test chunk (grass, a path, a river, a plateau, tall grass, trees): 417 triangles,
  packed. **Not tried in game.**
- The Map Editor's **Wireframe** toggle.
- Painting part of an existing chunk: start from the chunk as it is (terrain "." keeps it: its faces with the
  painted rectangles cut out, its collision); a copy of the chunk sits beside the painting, which Stop painting puts
  back; Generate is undoable. A pond in Route 20: 1,176 triangles (vanilla 1,114), packed; undo and stop give vanilla
  back byte for byte (scratch copy).
- Next: smart edges between terrains, bulk tools (forest scatter, fence paths), and the user's in-game tests.

## 2026-11-01 (afternoon): the written models' box, moving faces, pasting at the right height

- **Fixed: a chunk packed whole vanished** unless the camera was over its middle (the user's test on Route 20). The
  model writer stored the model box's scale without the position scale, so the game read the box 64 times too small
  and skipped drawing the chunk. `nitro_model_writer.py check` now builds every vanilla model's box and checks it
  holds every vertex. Route 20's chunk is back to vanilla (its data.json said "written" after the undo).
- Faces: **Move** (a tile, or a unit up and down; Alt+arrows), and a paste keeps the copy's height above its own ground
  (vanilla trees' shadows sit just over the grass). Both pack (scratch copy).

## 2026-11-01 (day): new maps, new routes, collision painting

- **New maps from unused zones** (`tools/paperwhite2/new_map.py`, the Map Editor's **New map…**): about 60 leftover
  zones (no events, no warp in, not named by the code, not on the town map) can become maps. The zone, its scripts and
  text bank are renamed, and new chunks copied from a template are appended after the game's (`map_models.txt`; the
  packer copies the template's container, `"template"` in data.json, and writes the model whole). A map of its own gets
  a matrix of its own; **a route** goes into the overworld's cells, seamless with its neighbours (the field swaps zones
  by the cell, fieldmap.c `Field_ShouldSwapZone`), ringed with a filler. Built in a scratch worktree, hack build with
  DSi intact, for both (a 2-chunk map, and a 2-cell route south of Route 20); **not tried in game**.
- The Map Editor's **Collision** tab: paint tile types (the game's classes from field_map.h, and flags), flat heights,
  or copied tiles, by drag, on either layer of two-layer chunks (Virbank Complex), with season variants painted too where
  their tile matched. Checked in the browser.
- Design doc: the seamless overworld research (what swaps at a cell boundary, what doesn't, the two overworld
  matrices, fillers, room in the matrix).
- **Copy and paste faces between chunks and zones**, and **textures imported between sets**
  (`tools/data/nitro_texture_writer.py`, all 409 vanilla sets written back byte for byte; a set's `imports.json`). Pinwheel
  Forest 2's doorway (the tree block with `d2mori01s` and `d2_hika02` at its east exit) pasted onto Route 20 and its two
  textures imported into Route 19's four season sets: both pack (scratch copy). **Not tried in game.**
- Next: in-game tests; the Map Editor showing a route's neighbours; warps between maps from the editor.

## 2026-11-01: the Map Editor's research, framework, model writer and Route 20's tiles

- `docs/paperwhite2/design/map-editor.md` (new): the research and plan: the chunk and model layout, the limits, the
  seasons (texture sets by name in 66 of the 70 seasonal areas; Route 20's autumn chunks, a different layout), unused
  zones (about 75 empty leftovers, no code needed) against new ones (possible, with three fixes), what a new map
  needs, the model writer and the tile library.
- `tools/data/nitro_model_writer.py` (new): reads a map model into its parts and writes one from them; all 1,065
  vanilla models write back byte for byte, and all 17,129 shapes draw again the same (`nitro_model_writer.py check`).
  The packer writes a whole model from the GLB when a model's `data.json` has `"written": true`, so a GLB can add
  materials and draw calls: every vanilla model with a confirmed set, written from its GLB, draws the same positions
  and UVs (lists about 5% larger at the median: strips or quads, whichever is shorter). **Not tried in game:** a written chunk.
- `tools/paperwhite2/map_tiles.py` (new): tile libraries, `res/paperwhite2/map_tiles/<library>/library.json`, cut into
  ground pieces and whole objects into `build/map_tiles/`. Route 20 (four chunks and their autumn variants): 3,274
  tiles.
- The editor's Map Editor (new): Chunks (the matrix, the inspector against the limits and each season's set, season
  variants), Faces (select, connected, the stack of a tree, delete, retexture, undo; written to model.glb at once) and
  Tiles (the palette). Checked in the browser on a scratch copy: a tree deleted and a face retextured, then packed (34
  materials and draw calls where vanilla has 33). **Not tested in game.**
- Layouts (`res/paperwhite2/map_layouts/<model>.json`): a chunk as tiles, started from a chunk as it is, painted in
  the Tiles tab, composed into the chunk's model.glb (`map_tiles.py compose`). Route 20's map04_20 rebuilt from its own
  layout looks the same in the editor (2,085 triangles against 1,114; 71 KB of the 86 KB buffer). A painted tile
  brings its source's terrain rows into the chunk's first layer, its planes moved to its height (refused where the
  game's height table lacks the height; split tiles keep the chunk's rows). **Not tried in game.**
- Next: smaller composed chunks (the composer moves each triangle's UVs on its own, so neighbours share no vertices
  for strips), New Map with an unused zone, collision painting in the Map Editor, two-layer chunks.

## 2026-10-31: NPC conditions and instances (phase 2)

- `res/paperwhite2/overworld/<zone>.json` (new, `tools/paperwhite2/overworld.py`, a member after a/1/2/6's files in
  the hack's build) and `Spawns_OnZoneInit` (`src/paperwhite2/ov012/paperwhite2_spawns.c`, filling the placeholder):
  NPCs hidden by their conditions (`EVENT_FLAG_SPAWN_HIDDEN`, 0x930) and hosts given an instance at zone entry
  (plugins.md, NPC spawns). The events' schema has its NPC record as `$defs/npc` now; the events pack the same.
- The Overworld Editor: conditions, instances and the conditions preview. Checked in the browser on a scratch copy
  (a night NPC and a host with two instances saved, packed and dumped; the preview shows the night NPC only at night).
  Built (hack, DSi intact). **Not tested in game:** an NPC with a time condition, and a host with day and night
  instances, at the two times.
- Next: picking again on a time-of-day change, then ambients, then groups.

## 2026-10-31: camera yaw the short way round, values to drag everywhere

- `src/ov036/fld_scenearea_loader.c` (`#ifdef PAPERWHITE2`): a camera rect's yaw blends the short way round between
  its two values (the original took the plain difference, so 0 to 300 degrees turned 300 on; no original area turns
  its yaw). The editor's preview does the same. Built; **not tested in game**.
- The forms' number fields drag (a ⇔ grip, clamped to the schema's range, not on IDs, flags and the like), and so do
  the Overworld Editor's heights, buildings' place and turn, and rail points and arc centers; a drag is one undo step.

## 2026-10-31: rectangles on the map, values to drag, chunk sizes (editor only)

- Triggers', warps' and camera rects' rectangles move, resize by their edges and corners, and draw on the map; the
  camera values drag (one undo step a drag); a rect's blend direction and ends are set in the panel. Revert drops a
  file the editor made and never saved (a new camera file stayed unsaved before).
- The map placed every chunk 512 units apart; the map type gives the size (Skyarrow Bridge's are 2048, the Pokémon
  League's 1024 with 64 by 64 tiles), which fixes Skyarrow Bridge's overlapping models. Checked in the browser.

## 2026-10-31: the camera areas in res/ and the Cameras tab

- `tools/data/camera_data.py` (new): `res/field/cameras/` holds the grid zones' camera areas (a/1/5/6, a file a zone
  group, `areas/<zone>.json`), the rail maps' (a/0/7/9, `rail_areas/`) and the default cameras (a/0/5/9,
  `defaults.json`); all three pack byte for byte as the original. The boundaries (`cam_bound`, a/1/0/9) aren't in res/
  yet.
- The hack's build reads which zones have which file from the files' "zones" (`camera_data.py archive` appends a table
  to a/1/5/6; `PaperWhite2_GetCameraIDForZone`, src/paperwhite2/ov036/paperwhite2_camera_areas.c, in
  `Field_LoadSceneArea` in place of `ZONE_CAMERA_ASSIGNMENTS`), so any zone can be given camera areas. Built (hack,
  DSi intact); **not tested in game**: check the Aspertia overlook's camera still works (the same data, read through
  the new table), then a new area.
- The Overworld Editor's Cameras tab: areas drawn, edited in degrees and units, previewed through the game's camera
  (checked in the browser on Aspertia's overlook, first row and last), added (a zone's file made if it has none) and
  removed. The preview shows only the zone's own chunks.

## 2026-10-31: the Rails tab (editor only)

- The Overworld Editor edits rail files: move points (also by their fields, in tiles), add points and lines (slots,
  direction, curve, measured length and a new attributes file), set a line's curve and center, fit its length
  (resizing its attributes), remove the last point or line. Checked in the browser on Castelia (edit, undo, add a
  point, add a line) and that a rail file with an added point, line, curve and attributes packs
  (`rail_data.py pack`). Not saved from the editor or built into a ROM yet.

## 2026-10-31: the user's walking Pokémon sprites out of Unown's forms

- Before the decomp the user drew 22 walking sprites for Pokémon the original game has none for in place of Unown and
  its forms 1 to 21. They are now codes of their own, `OBJ_CODE_POKEMON_PURRLOIN = 0x4000` on (generated/obj_codes.txt,
  `res/field/actors/pokemon/<species>/`, 8 frames, sprite_controller_type 14), the table's rows after the followers'
  (`GetIndexOfObjID`, src/system/field_actor_savedata.c); Unown's sprites are the original's again (w2-original), and
  the 18 NPCs that used them (9 zones; no original NPC or script used Unown) use the new codes. The follower's forced
  forms (Unown '?', Arceus Normal) are gone, so an Unown or Arceus follower shows its own form. Five the user named after:
  Applin, Hydrapple, Rufflet, Vullaby and Dipplin (the Applin line isn't in the game: the user's favorite, for an
  easter egg, perhaps a trainer saying it can't be found around here, with a nod to the Big Apple). Built (hack, DSi intact); **not tested in game**: check an NPC with a new code
  (Castelia's Trubbish), an Unown follower's letter and an Arceus follower's form.

## 2026-10-31: the Funfest mission spots removed from every zone

- The 1,690 proxies with condition 4 and script 0 (up to 20 a zone, in 118 zones) were the Entralink Funfest missions'
  places: `fest_mission_people.c` and `fest_mission_sparkle_place.c` pick their people's and sparkles' spots from a
  zone's condition-4 (and 5) proxies, and nothing else reads them (`CheckProxyEntityEvent` skips condition 3 and up).
  The user is removing the wireless features, so they are gone: 33,800 bytes, up to 400 a zone (11 NPCs). A mission
  of those kinds now finds no place in a zone and shows no people or sparkles (no crash: `PickPlaces` returns FALSE
  before placing any). Removing them shifts later proxies' indices, which only `ObjInitPointGPos` scripts
  (aspertia_city_2, driftveil_city_gym_2, hidden_grotto) and Join Avenue's shops use, none in zones that had spots.
- To do: remove those mission types from the Funfest's mission lists, or rework them with the new NPC spawn system.
  Packs; not yet built or tested in game.

## 2026-10-31: rails in the Overworld Editor (editor only)

- The zones without a grid show their rails (`editor/src/modules/overworld/rails.ts`, from `field_rail.c`,
  `field_rail_func.c` and `rail_attr.c`: straight lines, flat and 3D arcs, widths, attributes), with their NPCs,
  warps, triggers and proxies on them; dragging along rails, adding on them, painting rail tiles' types, and one
  height at a time (Castelia's levels: -3.5, about 1, 4.5, 7.5 and 10 tiles). Checked in the browser on Castelia City:
  the rails follow the plaza's arcs, and a drag, an add and a paint each undo in one step. Not saved or built.
- Painting now keeps a tile's flags other than collision, water, encounters and reflection (rail tiles carry 0x80).
- Next: editing the rails themselves (points, lines, curves, widths), then the new features (conditions first).

## 2026-10-31: seasons' maps, the events' limit in the build, buildings and movement previews

- **Seasons' map models:** `res/field/map_replacements/replacements.json` (new, `tools/data/map_replace_data.py`,
  `a/0/1/0` packed byte for byte in the build): the chunks and matrices that the season, the version or an event
  replace when the field loads a matrix (`MapMatrix_Patch`). The Overworld Editor's **Season** shows a seasonal
  zone's chunks and the season area's textures; painting edits the chunks shown (Route 20's autumn chunks have their
  own collision). Built (hack build, DSi intact); not tested in game, nothing in game changed.
- **The events' limit:** `event_data.py` refuses a zone whose packed events pass 2,436 bytes (the game freezes
  entering it); the editor shows the zone's load as a bar (green, yellow from 80%, red past it).
- **Buildings:** the chunks' props, drawn, moved, added, removed and turned, saved into the chunk's GLB through the
  server's new `PUT /api/glb-props`. Checked: the saved GLB packs (`patch_props`) with the new turn, and an unedited
  one still packs the ROM's chunk. Not built into a ROM or tested in game yet.
- **Movement previews** (▶ Movement): the move codes as `src/ov036/field_actor_movecode.c` runs them. Checked by eye
  in the browser; the ROUTE_* codes that read past their table in game start over in the preview.
- Also: a warp's link to the zone it leads to, a border while painting, the wheel on the painter's height.

## 2026-10-31: Overworld Editor fixes after the user's first test (editor only)

- Mouse: left selects, drags and paints; middle orbits, right pans, the wheel zooms to the cursor. The camera stays
  put after a paint. Paint shows during the stroke and is one undo step; one undo history covers the events and the
  terrain. Painting heights: a flat tile at a height in tiles, from the game's height table.
- Heights in tiles (an NPC's y is 65536 a tile, the others 16); entities stand on the layer nearest their height, as
  `FieldG3DMapper_GetTerrain` chooses (the birds on Virbank City's wall), faded on the other layer. Sprites face
  their direction (sheets: up, down, left; right mirrored). Global scripts open in the drawer (the table in
  `script_sys.c`), which lies over the map. The model picker (sprites, banks), Show script beside the script, groups
  open in place, the others on a tile, a back button.
- Checked in the browser (Aspertia City, Virbank City and Complex): pan, the panel, the picker, a global script,
  painting heights and its undo, layers. **Not yet checked:** saving and building these edits (the test ran on the
  real checkout, so nothing was saved).
- Found: the user's moved NPCs didn't show because the save file keeps a map's NPCs; leaving the map shows them.

## 2026-10-31: the Overworld Editor, phase 1 (editor only)

- `editor/src/modules/overworld/`: a zone's events on its 3D map (chunks' GLBs, collision tiles at their heights,
  two-layer chunks), NPCs with sprites, facing, leashes and sight; proxies, triggers, warps and level scripts; select,
  drag, Shift+click add, remove, the script drawer (the embedded Script Editor), a tile-type painter, and the 2,436-byte
  events budget. Tested in the browser on Virbank City, Virbank Complex (both layers) and Aspertia City Gym: loading,
  add, remove, drag, the script drawer and the layer switch work. **Not yet tested:** a saved move or paint built and
  run in game, painting's look on the map.
- Still to come in phase 1: Buildings (map props, as CTRMap edits them), the movement preview, heights in the painter,
  and a build check of the events budget. Then conditions and instances, ambients, groups (the design doc's phases).

## 2026-10-31: fixes after the user's test of the Habitat Dex and the editors

- **Habitat Dex** (built, DSi intact, plain `modules.ok` passes; **not yet tested in game**): touches on the text box
  are checked before the buttons' unterminated touch table (whose search ran into other data, so the text box never
  got them); an area shows each kind of habitat (water, fishing) the Habitat Dex has, past the original 30; Info leaves
  the Habitat Dex's list for the Pokédex's page (`src/paperwhite2/main/paperwhite2_habitat_dex_info.c`, taken in
  `PokedexCommon_LoadHabitatSpecies`), so it opens on the chosen Pokémon (Route 20 opened Patrat: the original list of
  the saved season didn't have the Pokémon).
- **Editor:**
  - forms stack each label over its field in narrow places (a container query), so nested numbers and dropdowns keep
    their width;
  - a palette's unused colors get a ring in the corner instead of being dimmed, so each swatch shows its true color;
  - `x-message` ("game" or "follower") in a schema shows the talk window under the field (the follower's dialogue, the
    trainers' lines);
  - the Text and Script editors have the files' numbers, a sort by name or number, collapsible groups (text), and the
    zones that use a file, with links;
  - the Script Editor shows the game's script ID (Frost's index is it minus 1) and the NPCs, background events,
    triggers and level scripts that run it;
  - the Trainer Editor has a Gym Leaders / Elite Four filter, grouping by area, and where each trainer appears (NPCs
    from script 3000 + its number, and scripts' `CallTrainerBattle`);
  - `#tool/<id>?<params>` links between the editors (`src/navigation.ts`), and `src/modules/world/world.ts` indexes the
    zones and their events.

## 2026-10-31: C-Gear research (nothing changed)

The user's questions about redesigning the C-Gear are answered in `docs/paperwhite2/design/cgear.md`: the native
markers can take new actions (one table and one `case` each), the right-hand top circle already has an unused touch
circle for a skin button, the battery is one sprite coordinate, the survey button can go and bottom-left buttons be
added as new sprites, more markers need arrays, palettes, cells and save bytes (0x25 are free), and the load-save
question and networking can be skipped with four hooks plus a sweep of what assumes a connection. Waiting on the
user's design before any change.

## 2026-10-31 (overnight, second batch): Text, Script, Pokémon and Trainer editors

All in `editor/` (README sections for each); every editor test passes; each checked with Playwright on the real `res/`
read only, and saving a text bank and a script on a scratch copy (each changed exactly the edited line).

- **Text Editor** (`src/modules/text/`): story and system banks, line numbers, search in a bank or all, and the
  reusable `TextBox`: the talk window of `talkmsgwin.c` (bottom balloon, `winframe/05.png` in `00.pal`), the game's
  font 0 and palette 5 from `extract/` (`GET /api/font`, never in `res/` or git), printed a letter a frame; `{be01}`
  waits then scrolls at the next line break, `{be00}` waits then starts a new box (its following line break, which all
  3,758 have, starts the box), `{ff00:n}` colors, words as `Word<n>`. Click = A. The game's fonts keep each glyph's
  widths in the first 3 bytes of its 48-byte cell. Also `MessageEditor` for other pages.
- **Script Editor** (`src/modules/scripts/`): a file whole or one script by its ScriptEntry number, highlighted
  (unknown commands from `field_script.inc` in red), the command's parameters at the cursor, Go to for labels, and the
  message an ID names (editable, previewed). Reusable `ScriptEditor embedded` and `CodeEditor`.
- **Pokémon Editor** (`src/modules/pokemon/`): sprite (normal/shiny), stats with bars, record, evolutions (parameter by
  method) and the family tree, learnset, Pokédex. `SpeciesIcon` reads `sPokeIconPalettes` for the icon's bank.
- **Trainer Editor** (`src/modules/trainers/`): class sprite, settings, party cards (items and moves for the whole
  party or none), lines with the talk window.
- **Not checked:** the preview against the game side by side (the frame and the line spacing are from the code, not a
  screenshot); the words' samples are placeholders, not the script's real words. The user's editor was restarted
  (detached) to serve the new endpoints.

## 2026-10-31 (overnight): the art converter and the boot screen

The user's plan for the night: 1. the art converter in the editor, with the boot and title screens editable and one
more boot screen after the copyright; 2. the Habitat Dex reworked; 3. a Follower Editor, fixing the editor's two old
test failures; 4. shiny extras in the Palette Editor. All four are done:

- **1. Art converter** (`docs/paperwhite2/art.md`): `tools/paperwhite2/screen_art.py` turns PNGs into a screen's
  tiles, screen resources and palette, for the targets of `res/paperwhite2/art/targets.json` (boot logos, copyright,
  the new boot screen, title logo, title's other screen). The editor's Palette Editor is now **Graphics & Palettes**,
  with a **Screens** page (preview, problems per tile, Apply) beside **Palettes**.
  - **New boot screen** after the copyright (`src/paperwhite2/ov162/paperwhite2_boot_screen.c`, hooked in
    `boot_screens.c`): `ARCID_COPYRIGHT` members 9 to 13, blank, skipped while its palette is all black.
  - **Checked:** every target's screens export and convert back pixel for pixel; art converted and built packs as
    16-color members with the same pixels; every target written with --write, built and decoded from the ROM's
    archives shows the same pixels as before (boot logos, copyright, title logo and streaks in 256 colors, the title's
    other screen); Playwright on a scratch copy (choose art, problems marked, Apply). Not yet tested in game: the boot
    with the new screen blank (should be unchanged) or with art.
- **2. Habitat Dex** (`docs/paperwhite2/encounters.md`, "The Habitat Dex"): the Habitat List's screen lists every
  Pokémon of the area's kind of habitat from a new member of `a/2/9/6` (written by `encounters.py habitats`), in pages
  of 20 (L/R, the side arrows, or the cursor past the last row), with method tabs (Select or touch) and season, time
  and weather filters (touch, "any" by default) in the text box. The map, areas and stamps are unchanged. **Not yet
  tested in game at all**; built without warnings, DSi intact.
- **3. Follower Editor** (`editor/README.md`): species' followers (sprites, placement settings), their own dialogue
  (or a button to start one), shared dialogue, item pools, interactions, emotes and balls, with message previews. The
  editor's tests all pass again: the hand-written compact JSON layout (indent 4 or 2) is a known layout, five files
  were rewritten in it with the same data, and `$schema` fragments (`#/$defs/name`) work in the index, forms and the
  save check. Tools hold files without tabs (`documents.hold`, `documents.create`); schemas' cross-file `$ref`s are
  merged as `datajson.load_schema` does. Checked with Playwright on a scratch copy (Snivy's page, a save that changed
  one line, the shared page).
- **4. Shinies** (Graphics & Palettes' third page): every Pokémon's and form's front sprite in its normal and shiny
  palettes, filtered to the five shinies identical to normal (the placeholder, the egg, Manaphy's egg, Castform's
  forms 1 and 3) or the rest; a click opens the shiny palette beside the normal.
  Checked with Playwright read-only on the real `res/`.
- **To test in the morning:** the boot (unchanged while the new screen is blank); the Habitat Dex (pages, tabs,
  filters, the cursor across pages, the stamps, the info button); the DexNav's tabs and cells; the editor's Graphics &
  Palettes (Screens, Palettes, Shinies) and Follower Editor.
- **Also:** I stopped the user's running editor by mistake while stopping my test servers, and restarted it detached
  (`setsid nohup editor/start.sh`, log in the session's scratchpad); it serves tonight's page.

## 2026-10-30: DexNav polish, its art templates, and the editor's Palette Editor

- **DexNav** (not yet tested in game after these changes; the first build was tested and worked):
  - each tab row spaced evenly by the labels' widths, the chosen tab underlined;
  - the cells' shares as wide as their icons and centered, an empty cell's share clear.
- **Art:** `res/paperwhite2/dexnav/` has the README for custom art (the DS's limits, an Aseprite workflow) and
  `templates/{top,touch}.png` of the current layout, from `tools/paperwhite2/dexnav_templates.py`. The converter and
  the app's wiring wait for the first art.
- **Editor:** the Palette Editor (`editor/src/modules/palettes/`, README): every `.pal` under `res/` in the DS's colors,
  on the folder's images, with a sprite's other palette beside it (normal and shiny), hue/saturation/lightness shifts,
  ramps, import from a .pal or a PNG, and .pal downloads for Aseprite. The server has `GET /api/list` (files under
  `res/` by glob). Checked with Playwright on a scratch copy: loading, the preview, saving. `tests/palettes.test.ts`:
  every palette round-trips; the PNG reader agrees with the build's.

## 2026-10-30: the DexNav (not yet tested in game)

- **Built** per docs/paperwhite2/design/dexnav.md ("As built"):
  - the Poké Radar as the DexNav, from Y or the bag;
  - an app in overlay 303 beside the Habitat List;
  - lists from the encounter engine, with "?" for unseen species, the user's method names, and a scrolling grid;
  - logic and screens in separate files, for a later redesign.
- **Along the way:**
  - The hack's `SHORTCUT_SAVE_MAX` is 36, using the save's two spare bytes.
  - `plugin_lcf.py` adds a `.data` section to a module without one.
  - The field saves the encounters' context whenever it closes for an app.
- **Checks:**
  - `--hack` builds without warnings; DSi intact; the plain `modules.ok` passes; main's DS arena has 137 KB left.
  - Overlay 303 can grow 384 KB more before the arena moves.

## 2026-10-30: triple battle fixes, the Dexnav's engine API, the generated Habitat List

- **Triples (the user tested them; they work):**
  - The intro message groups the same species ("Three wild X", "Two wild X and a wild Y").
  - The ball message says three with three up.
  - The editor notes that fishing is always single.
- **Engine:**
  - `PaperWhite2_Encounters_Build` is a side-effect-free core, with read-only getters, for the Dexnav.
  - Encounters' extra conditions now see the field's part (the player's tile, indoors and outdoors).
- **Habitat List:** the hack's build writes it from the encounter data (`encounters.py habitats`) and packs it. 16
  areas have more than its 30 species, and their extra species are left out until the Habitat Dex overhaul. The area
  map isn't regenerated yet.
- **Dexnav decisions:** docs/paperwhite2/design/dexnav.md. The Poké Radar becomes the Dexnav.
- **Checks:** `--hack` builds without warnings; DSi intact; the plain `modules.ok` passes; main's DS arena has 138 KB
  left.

## 2026-10-30: wild triple battles, and the Dexnav design (not yet tested in game)

- **Triples:** a species' triple chance now makes a wild triple battle (docs/paperwhite2/encounters.md, Wild
  triples): a new wild triple intro with a three-name message (the battle bank's message 201), three params,
  style 2, and the wild double's AI flag. `--hack` builds without warnings, DSi intact, plain `modules.ok` passes.
- **Dexnav:** the design is docs/paperwhite2/design/dexnav.md, based on Pokeweb's Pokenav, with eleven open questions
  for the user. Found while researching:
  - encounters' extra conditions can't test the terrain or indoors/outdoors, since BuildSlots fills only the game's
    context;
  - the Pokédex's Habitat List and area map still show the original tables.

## 2026-10-30: the new wild encounter engine (ROM session; not yet tested in game)

- **Built** per docs/paperwhite2/encounters.md:
  - **Data:** per-species data in `res/paperwhite2/encounters/`, with schemas, exported from the original tables by
    the editor's import (`editor/scripts/export-encounters.ts`). level_scaling.json's spread is now 3.
  - **Packer:** `tools/paperwhite2/encounters.py` packs it into one member after `a/1/2/7`'s tables (`check`,
    `odds`).
  - **Runtime:** `src/paperwhite2/main/paperwhite2_encounters.c`, hooked into the table load, the slot picking,
    `GenWildsCore`'s count and partner, the hidden ability, the bulletin board's swarm zone, and the rustling spots'
    item chance.
- **Failsafe:** where no Pokémon can appear, there is no encounter by any method, and an original table's empty slot
  gives none either.
- **Not yet:** wild triples (they count as doubles; the battle intro needs a 3-Pokémon wild version).
- **Behaviour change:** dark grass no longer rolls its own 40% double battle; doubles come from the species' battle
  styles, which default to 100% single.
- **Editor:** the Encounter Editor reads and saves the files (Save, Revert, Settings' import). `datajson.load_schema`
  now follows a `$ref` into another schema file (the habitats' `when`, the follower dialogue's).
- **Checks:**
  - `--hack` builds without warnings; `verify_dsi_rom.py` intact; the plain `modules.ok` passes; clang-format and
    check_style are clean.
  - The editor's tests pass, including `encounters-packed.test.ts`: the packed member's odds equal the editor's for a
    sample of places. Playwright: the editor reads the files with nothing to save, and an edit marks one file.

## 2026-10-30: the editor's first specialty editor, the Encounter Editor (ROM session, in editor/)

- **Who edits editor/ for now:** the user asked the ROM session to work in `editor/` until the encounter work is done,
  and the cloud session is paused meanwhile. The usual split (CLAUDE.md) returns after that.
- **The sidebar:** specialty editors first ("Editors", `ToolModule.section: "editors"`), then Tools, then the
  per-file editors folded under "Data files". `#tool/<id>` in the address opens a tool. New requests:
  `GET /api/data?schema=&keys=` (every file of a kind, parsed) and `GET /api/asset?path=` (a PNG under res/).
  `PAPERWHITE_PORT` runs a second copy on another port.
- **The Encounter Editor** (`editor/src/modules/encounters/`): the planned per-species format, built as a draft from
  the current tables, editable but not saved. The user's decisions are in it: rarity tiers Common 55, Uncommon 25,
  Rare 12, Very rare 7, Exotic 1 (editable, a tier's share split among its Pokémon); per-species min and max levels
  (min gates appearing, max caps), scaled level 80% ± 3; five periods with Day/Night groups; hidden ability 10%;
  single/double/triple chances with family or area partners. Planned files: `res/paperwhite2/encounters/settings.json`,
  `areas/<area>.json`, `species/<name>.json`. The habitat dex will need a new filterable app (location, season,
  weather, time).
- **Revised after the user's review:** list sorts (family, generation) and filters (not in the wild, family not in
  the wild, not obtainable: no family member wild, in a grotto, traded, gifted or static, read from `res/` and the
  scripts); habitats with several places or a whole group (groups by parent zone), several methods, and per-season
  slots ("Same in every season" or each its own); the import merges slots by species into one tier, methods and
  seasons that agree, and groups, and refines levels by evolution (max = evolution level + 2, min = the level it
  evolved at); the town map's real art (`07.png` + `16.nscr` + `00.pal`); a species habitat map coloured by season;
  heatmap colour schemes and an "empty method" measure; areas grouped by parent; rustling spots tentatively Audino
  30% and the rest from the area's Rare, Very rare and Exotic grass Pokémon; the level gate defaults to the scaled
  level. 2,053 habitats for 493 wild species; 31 families can't be had (the legendaries and mythicals).
- **Second revision:** outbreaks (the game's swarms, read from `SWARM_DATA`, White 2's) and Hidden Grotto entries on
  a species' page, counting as "in the wild" for the filters; a legendaries and mythicals switch (off); groups the
  user can add, rename, change and remove on the Areas page (removing one makes its habitats name its areas); a
  whole-family view with shared, linked habitats (each member keeps its rarity and levels); season-coloured buttons
  for per-season slots; on the map, places pinned by clicking with an Open area button, and methods to leave out of
  the empty measure; rustling spots by kind (shaking grass Audino 30%, dust clouds and bridge shadows the game's items
  30%, all of it with no Pokémon there), each area's kind from its zones (caves by battle background 4 and 5, bridges
  by map type 11 and 18).
- **Planned:** a rules pass over the encounter data (the user's rules and exceptions applied in bulk), and turning
  trade-only evolutions into level evolutions.
- **Checks:** `npm run typecheck`, the page builds, `tests/encounters.test.ts` (the import is exact, every slot is
  covered by a habitat, merges, levels, rustling by kind, outbreaks, grottoes, sources) and
  `tests/encounters-render.test.ts` pass; checked in Chromium with Playwright, no page errors. Two older editor tests fail on the conditions and
  follower JSON: those files aren't in the data tools' layout, and their `$schema` has a `#/$defs/...` fragment that
  the editor doesn't resolve.

## 2026-10-30: the follower's dialogue rules, gifts, pickups and steps (branch follower-dialogue, not yet tested in game)

- **Built** per the user's follower design notes, on the conditions engine (following-pokemon.md, "Dialogue rules,
  gifts and steps"): a dialogue library and item pools as `a/0/4/7` members 4 and 5 (`tools/paperwhite2/following_dialogue.py`
  from `res/paperwhite2/following/dialogue/` and `pools.json`, with schemas), talk rules as steps (message, box style,
  emote, motion, cry, action), Frost's `[N]` `[L]` `[C]` codes with multi-page messages, gifts as actions (an item or
  a pool), pickups and ambient emotes on the follower's steps, a talk's friendship once a day, a script step's
  hand-off. The old contextual dialogues, one-time gifts and their ribbon-bit claims are gone.
- **Engine:** new clause kinds `FACING`, `TILE_X`, `TILE_Y`, `TOTAL_STEPS`, `ITEM_WAITING` and the context part
  `CONDITION_CONTEXT_POSITION`; compiler, schema and tests (24) updated.
- **Storage:** five bytes the game never writes, block B 0x1c (u32) and block C 0x16 (u8): waiting item, steps since
  the last gift, total steps; Shedinja clears them. Variables 0x4052-0x4057 (`EVENT_WORK_FOLLOWER_TALK_DAY_0`-`_5`).
- **Debug:** START > Follower... (actions 38-42).
- `configure.py`'s tool dependencies now follow `from tools.paperwhite2 import X`.
- `--hack` builds without warnings, `verify_dsi_rom.py` intact, memory 148 KB left (2.3 KB used); matching
  `modules.ok` passes; check_style, clang-format and the conditions tests pass.
- **To test in game:** following-pokemon.md, "To test" of that section; what remains is at its end.

## 2026-10-30: the conditions engine, phase 1 (not committed, not yet tested in game)

- **Built** per `design/conditions.md` (§10's decisions; §11 lists where it differs): the condition format
  (`res/paperwhite2/conditions/condition.schema.json`, `terrain_groups.json`, `zone_groups.json`), the compiler
  `tools/paperwhite2/conditions.py` (hack-only in `configure.py`: members 2 and 3 of the weather calendar's archive
  `a/0/9/6`, and three generated headers), the matcher, selection, seeds and level scaling in main
  (`paperwhite2_conditions.c`, `paperwhite2_conditions_context.c`), the field part in overlay 36
  (`paperwhite2_conditions_field.c`), and the spawn system's empty placeholder (`include/paperwhite2/spawns.h`).
- **Zone-load counter**: `EVENT_WORK_ZONE_LOAD_COUNTER` (0x4051), found free by the new variable survey
  `tools/paperwhite2/var_usage.py`; bumped in `FieldScript_CallOnZoneInit` (`src/ov012/script_sys.c`).
- **Level scaling**: `res/paperwhite2/level_scaling.json`, adjusted = median * 80% (floor), 2-100, wild +-5.
- **Script commands**: `GetPartyLevel kind, result` (0x2f3) and `CheckCondition id, result` (0x2f4) in every hack
  build; `Debug` moved from 0x2f3 to 0x2f5 (scripts reassemble by name). `script_conditions.json` gives
  CheckCondition's IDs (`SCRIPT_CONDITION_NIGHT` ...).
- **Debug readout**: START menu > Conditions: the context in two messages, the nine sample rules' matches, the pick.
- The weather date's hash is now `Conditions_Hash` (same values; host-tested).
- `--hack` builds with no warnings, `verify_dsi_rom.py` intact, memory check passes (150 KB left, about 4.8 KB used);
  the matching `modules.ok` passes; check_style and clang-format clean; `global_scripts.py --check` current;
  `python3 -m unittest tools.paperwhite2.test_conditions` passes (23 tests).
- **To test in game**: plugins.md, Conditions, "The debug readout".

## 2026-10-29: the START debug menu built out (not committed, not yet tested)

- **Moved** from `global_10130.s` (back to the original's, with its text) to `global_10200.s`, the original's empty
  `dummy.ev` (10200-10249): `Script_2`, script 10201 (`SCRID_PAPERWHITE2_DEBUG_MENU`), its text at the end of
  `global_10200.txt` (a new bank would change the matching build's archive list). `global-scripts.md` regenerated.
- **One command**: `Debug action, arg1, arg2, result` (0x2f3) replaces `PokePartySetEV`; 34 actions in
  `include/paperwhite2/debug_actions.h`, handled in `paperwhite2_debug_commands.c`.
- **Menus**: Party (target cycling, EVs, IVs, level, nature, shiny, friendship, heal, give Pokémon), Items (give item,
  safe key items), World (time, season, weather overrides, flag and variable get/set), Encounters (Always shiny, No
  wild encounters, force species, wild level), Player (warp to last Center, warp to zone, walk through walls, money),
  Info. Number entry is the script's own adjuster (+/- step, step x10 or /10, Done, Cancel) with names shown.
- **Hooks**: `GetRealTimeDayPeriod` (rtc.c), the field's light seconds (fieldmap.c), `GetWeatherAll`
  (zone_weather.c), `EventWildBattleCall_CreateRandom` (field_encount.c, twice), `PlayerMoveCollCheck`
  (field_player_grid.c), `FieldPlayerRail_GetHitBits` (field_player_nogrid.c). The value overrides are RAM in main
  (`paperwhite2_debug.c`): a reset clears them. New flags 0xbda (No wild encounters) and 0xbdb (Walk through walls).
  The Shiny Candy's PID moved to main (`paperwhite2_shiny_pid.c`) for Make shiny.
- `--hack` builds with no warnings, `verify_dsi_rom.py` intact, memory check passes (155 KB left); the matching
  `modules.ok` passes; check_style, clang-format and `global_scripts.py --check` clean; `flag_usage.py` no conflicts.
- Tests: see plugins.md's Debug menu; each category once (Party on the lead and after Next target, a give with a full
  party, Items, each World override across a door, Encounters in grass, both warps, walls on a grid and a rail, Info).

## 2026-10-29: scripted drops reverted, EV bars grey what's out of reach, no wireless icon, Chaos shows ??? (not committed, not yet tested)

- **Shiny Candy from scripted wild battles: reverted** (`PaperWhite2_ShinyCandyDropForScript`,
  `PaperWhite2_ShinyCandyDropAfterScriptBattle`, `Script_21` of `global_2800.s`). Field-battle and release drops stay.
  The crash (Route 19's Patrat, a won battle with a drop): `GLOBAL_SCRIPT_TABLE` (`src/ov012/script_sys.c`) gives
  global_2800 the IDs 2800-2819 only, so `FieldScript_ResolveSCRID` hit `GFL_ASSERT_MSG(scriptId <= end)` for 2820 and
  the assert callback (`AssertFailErrorDisp`) showed "An error has occurred". The Venipede rolled no drop, so it never
  created the VM. A new global script beyond a range's end needs that range's end raised (or a new range) first.
  If retried: a script command (`PaperWhite2_GiveScriptShinyCandy`, say) that the hack's scripts call after
  `CallWildBattleEnd`, which reads a flag the battle's event set and, through `RTCallGlobal`'s path, calls a drop
  script whose ID the table covers; no hook in `CallWildBattleEnd`, which every script shares.
- **EV bars**: the track is white up to min(252, EV + 510 - sum) and grey from there to 252 (the part the stat can't
  reach any more); the IV bars have no grey. The old grey ran from the blue to the reach.
- **Wireless icon**: hidden in hack builds at its only writer, `WmIcon_WriteOam` (`src/gfl/wm_icon.c`): both of its OBJ
  (the icon and the OBJ window under it) are written hidden. The icon still exists, moves and takes its signal level;
  the net error screen and the Union Room's sub screen just have no unblended square. "EVs n/510" (ending at x 252) is
  no longer covered.
- **Season app**: in Chaos the status says "Season outside: ???" (`SeasonApp_Text_OutsideUnknown`); the banner stays
  the game's own season.
- `--hack` builds with no warnings, `verify_dsi_rom.py` intact, memory check passes (159 KB left); the matching
  `modules.ok` passes.
- Tests: Always shiny on; Route 19's Patrat (Script_13/17) and a field shiny: win, no crash, field drop still ~50%;
  release drop still works. Summary on a Pokémon with few EVs (no grey), one near 510 (right ends grey), one at 510
  (grey right after each blue). C-Gear on: no icon at the top right of the summary or the field; Union Room and an
  IR/wireless link still work. Season app in Chaos: "Season outside: ???".

## 2026-10-29: EV reach bars, the Season app's projected season, and more Shiny Candy drops (not committed, not yet tested)

- **Summary, hidden view**: each EV bar is grey after its blue up to min(252, EV + 510 - the sum), the most that stat
  can still reach; none at 252 or with the sum at 510. The title bar shows "EVs 85/510" at its right, where HIDDEN
  STATS was (the title window is 17 tiles again, to the screen's edge). IV bars unchanged (plugins.md).
- **Season app**: the status says "Season outside: X", the season the next exterior gets by the setting
  (`PaperWhite2_GetCurrentSeason`), not the game's current one; the banner and preview follow. On Dynamic Options the
  D-pad cursor previews each mode's season of today (Chaos: the game's own); on Set Hemisphere it previews the
  real-time season of that hemisphere, only while the mode is real time (in other modes the hemisphere changes nothing
  outside, so the top screen keeps the season outside). BACK returns to the projected season.
- **Shiny Candy from scripted wild battles** (`CallWildBattle`, `CallWildBattleEx`, every script): the battle's shiny
  foe is recorded at its start as before; on its return to the script a victory rolls the 50%
  (`PaperWhite2_ShinyCandyDropForScript`, from `EventWildBattleCall_Callback`), and the script's `CallWildBattleEnd`,
  after its fade in, calls `Script_21` of `global_2800.s` (script 2820) as `RTCallGlobal` would, which keeps the
  script's 0x8000-0x8010 values it uses. A catch, a run or a loss drops nothing.
- **Releasing a shiny** in the PC (box or party side of the box app): after "Bye-bye, X!", 50%: "X left behind a Shiny
  Candy!" with the candy in the bag, or "It left a Shiny Candy, but the Bag is full." (`Box2Seq_ReleaseDo`, text in
  `box2_bmp.txt`). Eggs can't be released. The party list has no release.
- **Flags**: 0xaef (Wurmple feeding) and 0xaf0 (the Center's lottery girl), the user's daily flags, in plugins.md.
- Tests: Always shiny on (START debug menu); a scripted static Pokémon (e.g. Dreamyard's Latias or Latios,
  any `CallWildBattle`): defeat it a few times (about half drop, message after the fade in, then the script goes on),
  catch it or run (no drop). Release a shiny from the PC a few times (about half), once with 999 Shiny Candies (bag
  full message). Summary: L/R on a Pokémon with some EVs. Season app: check the status in each mode and the hovers.

## 2026-10-29: fixes after the first test of the Shiny Candy, the Exp. Share and the summary (not committed, not yet tested)

- **Shiny Candy**: its own icon (`ITEM_ICON_SHINY_CANDY` and `_PALETTE_`, appended to `generated/item_icons.txt`;
  `res/items/shiny_candy/icon.png` and `icon.pal`, for now copies of the Rare Candy's to redraw), price 1 in the data
  (prices are in tens: ₽10), the Medicine pocket (data and `myitem_savedata.c`), sorted after the Rare Candy; still at
  Virbank. **Drops:** a wild battle won (`BTL_RESULT_VICTORY`) against a shiny Pokémon gives one if its PID says so
  (`PaperWhite2_IsShinyCandyDropper`: a hash of the whole PID, under `SHINY_CANDY_DROP_PERCENT` (50) of 100, so the
  Pokémon decides it when it is made and reloading doesn't reroll it; releasing a shiny uses the same test), back on
  the field: "The shiny Pokémon dropped a Shiny Candy!", then the usual
  obtained/put-away messages, or "no more room" with a full bag (`Script_20` of `global_2800.s`, script 2819, via
  `L_0151`). `src/paperwhite2/ov012/paperwhite2_shiny_candy_drop.c`, from `EventWildBattleCall_Callback`; the setup's
  shininess is read when the event is created (`candyFoe`), since the battle frees the setup. Grass, surfing and fishing
  encounters only: a scripted static battle returns before the field's fade back in.
- **Exp. Share from Y** never turned it on: `VMJumpIf CMP_STACK` jumps when the comparison is *false*, so Script_19
  took the "off" branch whenever the flag was set. Fixed (compare with 0). Its flag moved to 0x92f (the hack's block,
  see plugins.md's Flags); 0x5d0 is `EVENT_FLAG_0x05d0` again, so a save that turned it off is on again. The follower
  stayed recalled after it: the Y shortcut's events (`EventShortcutCallDirect_Callback`,
  `EventShortcutChoicePopup_Callback`) weren't known to the scene policy, so it now keeps the follower out through them
  as through the X menu; what they chain (an application, the bike, a script) is decided on as before. The Bag's
  description ends with "It is currently ON./OFF." (`itemmenu_disp.c`, text in `btl_main.txt`; the description is two
  lines now). The Bicycle's item-get effect is gone: effects are fixed 3D cut-ins (`Fld3DCi`), none shows an item's
  icon, so the Exp. Share gets the plain key-item fanfare.
- **Summary**: the IV order was right (each row reads its own stat's `PKM_PARAM_IV_*`, as the stat calculation and
  Hidden Power do). Bars added, "HIDDEN STATS" removed (plugins.md). Freeze review: the hidden view has no loop or
  timer; its redraw waits on the print queue only while connected; it found nothing that could hang.
- **Season globe**: back to the black fade while the preview reloads (5f58c202c7's parent).
- **Debug menu**: "Always shiny: ON/OFF" (`EVENT_FLAG_DEBUG_ALWAYS_SHINY`, 0xbd9), in a list built to take more toggles.
- `--hack` builds with no warnings, `verify_dsi_rom.py` intact, memory check passes; the matching `modules.ok` passes.

## 2026-10-29: shinies at 1/1024, the Shiny Candy, and the Gen 6 Exp. Share (not committed, not yet tested)

- **Shiny rate**: `PID_RARE_THRESHOLD` (`include/pml/poke_party.h`) is 64 in hack builds, 8 in the original;
  `PML_UtilPIDIsRare` uses it, and every check (wild and egg PIDs, the Shiny Charm's and the Masuda method's rerolls,
  `PML_GenPID`) goes through it. The Shiny Charm still adds two rerolls.
- **Shiny Candy** (`ITEM_SHINY_CANDY`, unused item 113, Items pocket, the Shiny Charm's icon, 10000): used from the bag
  on a party Pokémon (`src/paperwhite2/ov165/paperwhite2_shiny_candy.c`, called from the party list's item mode in
  `plist_sys.c`). It rewrites the PID's high half and keeps its low 18 bits (sex; bit 16, the ability slot; bit 17,
  which with bits 13-16 orders the box data's blocks) and Wurmple's evolution side; eggs and shinies get "It won't
  have any effect." For testing, Virbank City's second Mart clerk (shop 22) sells it (`scrcmd_shop.c`).
- **Exp. Share**: a registrable key item (same ID and icon). It is on while the bag has it and
  `EVENT_FLAG_EXP_SHARE_OFF` (0x5d0 then, 0x92f now) is clear, so it starts on when received. "Use" in the bag
  toggles it with a message; registered to Y (`SHORTCUT_EXP_SHARE`) it runs `FIELD_COMMON_EVENT_EXP_SHARE`, script 2818
  (`Script_19` of `global_2800.s`). Receiving it shows the Bicycle's item-get effect (`fld_wipe_3dobj.c`, effect 0x2c;
  check in a test that it isn't the Bicycle's own picture). In battle (`AddExpAndEVs`), while it is on, each party
  member that can battle but didn't face the defeated Pokémon gets half the undivided experience, and its EVs; the
  battlers' share is unchanged; holding one does nothing. A save that has it in the Items pocket won't find it.
- `--hack` builds with no warnings, `verify_dsi_rom.py` intact, memory check passes (159 KB left); the matching
  `modules.ok` passes. Next: test in melonDS.

## 2026-10-29: the follower's return after menus and battles, the ball's light, the recall's height (not committed)

Three fixes from the first melonDS test (docs/paperwhite2/following-pokemon.md, "Fixes after the first melonDS test"):
the follower comes back at once beside the player after a menu's application, a battle, or a warp a menu started (Fly,
Dig, Teleport, the Escape Rope), placed during the return's fade and the reopened X menu, while doors keep the walk-in;
the Poké Ball effect is lit as the follower's body (it showed light 0's color, about 2/3 of its palette by day and 1/3
at night); the recall's silhouette shrinks at the body's drawn height instead of sinking to its feet. `--hack` builds
with no warnings, `verify_dsi_rom.py` says intact, the memory check passes (0x285c0, 161 KB left). Next: test in melonDS.

## 2026-10-29: the follower's Options row and battle opening (branch following-port, not yet tested in an emulator)

Steps 5 and 6 of the Following Pokémon port are done, so the base package is ported
(docs/paperwhite2/following-pokemon.md, "Step 5" and "Step 6"). The Options screen has a sixth row, FOLLOWERS: ON/OFF,
saved in Config's `followersOff` (`src/paperwhite2/ov140/paperwhite2_following_options.c`; the screen's work types moved
unchanged into `include/app/config_panel_work.h`, with PAPERWHITE2 wrappers of seven statics in `config_panel.c`). Its
text, the four `title_2` entries the installer changed, is imported into `res/text/system/title_2.txt`; packed, they
equal the hack's (the hack's file is 10 bytes shorter only because the installer dropped four unchanged entries' second
terminator and the size rounding). A wild or trainer single battle that the field marked opens with the follower already
on the platform: no throw, ball or "Go!" (`src/ov167/btlv_scu.c` under PAPERWHITE2). Overlay 140 is
0x0219d320-0x0219fda0; overlay 167 grew 0x1a0, so overlay 168 starts at 0x021de0a0; the DS arena still has 0x28c00 (163
KB). `--hack` builds with no warnings, `verify_dsi_rom.py` says intact, nothing of the hack's is in the IRDO range, and
a plain configure passes `ninja build/w2_us/stamps/modules.ok`. Next: test in melonDS (the doc's lists for steps 3 to
6). Open question: the gifts' claims in block C's ribbons.

## 2026-10-29: the follower's events, talk and effects (branch following-port, not yet tested in an emulator)

Step 4 of the Following Pokémon port is done (docs/paperwhite2/following-pokemon.md, "Step 4"): the ball effects with
the follower's own ball type, the reactions and gifts, the talk (A in front of the follower), the events bridge in
overlay 12 with its actor hooks in `field_actor.c`, `field_actor_tool.c` and `field_actor_rail.c`, and the scene
policy, whose command and sound lists `tools/paperwhite2/following_scene_policy.py` generates from
`res/paperwhite2/following/event-policy.json` and `audio-event-policy.json`. The stubs header
`following_hooks.h` is gone: the follower now waits through talks, signs, prompts and music, and is recalled into its
ball when a script moves something through it. Overlay 36 ends at 0x021f8aa0, overlay 12 at 0x0216ef60; the DS arena
has 0x28c00 (163 KB) left. `--hack` builds with no warnings, `verify_dsi_rom.py` says intact, nothing of the hack's
is in the IRDO range, and a plain configure passes `ninja build/w2_us/stamps/modules.ok`. Open question for the user:
the gifts keep their claims in the top 16 bits of block C's ribbons, as the original did. Next: test in melonDS (the
doc's lists for steps 3 and 4), then step 5 (Options).

## 2026-10-29: the follower walks behind the player (branch following-port, not yet tested in an emulator)

Step 3 of the Following Pokémon port is done but for the talk (docs/paperwhite2/following-pokemon.md, "Step 3: the
follower in the field"): `field.c` and `render.c` are `src/paperwhite2/ov036/paperwhite2_following_field.c` and
`paperwhite2_following_render.c`, and the hooks field-actor-update, field-follower-matcache, field-unload, the three
billboard draws and field-player-recall-direction-gate are in `src/ov036/fieldmap.c` and `field_player.c`. The lead
follows on grids and rails with swaps, stairs and ledges, L/R switches it, SELECT turns it off and on. Ball effects,
talk, the scene policy and the events bridge are stubs (`include/paperwhite2/following_hooks.h`): no ball, and any
running event removes the follower, which walks in again after. Overlay 36 ends at 0x021ef3e0; the DS arena has
0x322c0 (200 KB) left. `--hack` builds with no warnings, `verify_dsi_rom.py` says intact, nothing of the hack's is in
the IRDO range, and a plain configure passes `ninja build/w2_us/stamps/modules.ok`. Next: test in melonDS (the
doc's list), then step 4.

## 2026-10-29: the followers' field actors as sources (branch following-port)

The Following Pokémon port has started on the branch `following-port` (docs/paperwhite2/following-pokemon.md: the
hooks, calls, data and steps). Step 2 is done: the 2,574 table rows and 348 sprites that Pokeweb's installer added to
`a/0/4/7` and `a/0/4/8` are `res/field/actors/followers/` (`tools/paperwhite2/import_followers.py`), with their
constants `OBJ_CODE_FOLLOWER_<SPECIES>[_FORM_<n>][_FEMALE][_SHINY]` from 0x3000 in `generated/obj_codes.txt`; rows
that show another code's sprite name it in `"sprite"`. Packed, both archives equal the hack ROM's byte for byte, so
STATUS's "Not imported yet" no longer has them. No code yet: the ROM has the entries, and nothing uses them.

## 2026-10-28: a 3D preview of Route 1 in the Season app (Remote Control session, not committed)

The Season app's top screen is now a live 3D view of the southern stretch of Route 1 in the previewed season, under
the season's banner (moved up as a label) and the message window (docs/paperwhite2/plugins.md, Season app: The
preview, The spot and the camera). The engines are swapped (main engine on top for the 3D, the touch UI on the sub
engine); VRAM B and C are the BGs, A the textures, F their palettes. `src/paperwhite2/ov312/paperwhite2_season_preview.c`
draws matrix cells 24,22 and 24,21 with the area's season texture set (`shared_dansa01a_2` to `_5`), its SRT animation
(water), its texture pattern animation (the yellow flowers), its props (the two signs and the `r01_a`/`r01_b` falling
petals or leaves, which the season's map replacement picks) and the lights of the time of day (light sets 140 to 143).
The spot and the camera are `res/paperwhite2/season_preview.json`, turned into a header by
`tools/paperwhite2/season_preview.py` in `--hack` builds: target (12592, 4, 11440), distance 300, yaw 30, pitch 45,
fov 20 (the field's Route 1 camera is distance 237, yaw 0, pitch 53.2, fov 20). If the preview doesn't fit, the old
banner-over-grid top screen comes back. The app's heap is 384 KB (was 256 KB); the preview takes about 90 KB, 104 KB
of texture VRAM and 4 KB of palette VRAM. Overlay 312 is 0x21e0 bytes, still under overlay 35's 0x2c40, so nothing
moved; the DS arena still has 210 KB (`0x34880`). `FieldLightEntry` and the GFBTP types moved, unchanged, into
`field/field_environment.h` and `field/field_terrain_animator.h`. `--hack` builds with no warnings, `verify_dsi_rom.py`
says intact, and a plain configure passes `ninja build/w2_us/stamps/modules.ok`. Not yet tested in an emulator or on
hardware. Offline renders of the framing (a software rasterizer of the GLBs, an approximation) were made in the session's
scratchpad. To test: open a Center's globe; the top screen should show Route 1 with "Spring" (or the current season) at
the top; on Set Season, move the key cursor over the four seasons (each change blinks the view dark and fades in the
season's textures); Cancel should fade out to the field cleanly. To reframe, edit the JSON and rebuild with `--hack`.

## 2026-10-28: one weather date a day, from an editable calendar; chaos never repeats (Remote Control session, not committed)

The calendar zones' weather is the original's again, read for one date a day (docs/paperwhite2/plugins.md, Seasons):
each real day picks one date of the current season's months (a hash of the save clock's day number and GameData's
season, uniform over the season's 92 or 90 days), and every calendar zone reads its original weather of that date
through `Calendar_ReadWeatherValue`, so neighbors agree (Virbank City and both Virbank Complex zones snow on the same
winter days). The per-season rates are gone (`res/paperwhite2/seasonal_weather.json`,
`tools/paperwhite2/seasonal_weather.py`, the hack-only `.inc` rule, the rates table). The calendar `a/0/9/6` is now
built from `res/field/weather_calendar/`, a JSON file per zone (each month's days with weather, by "day" or
"first-last", the rest sunny) plus `order.json`, by `tools/data/weather_calendar_data.py` in `DATA_PACKS`; dump and pack
of the base ROM round-trip byte for byte, and the matching build's archive check passes. More than 24 zones would need
`CALENDAR_ZONE_MAX` and `Calendar.zones[24]` raised. Chaos now draws among the three seasons other than GameData's, so
no two exteriors in a row share a season (a discarded interior draw doesn't change the saved season). `--hack` builds
with no warnings, `verify_dsi_rom.py` says intact, the memory check passes (`0x34880`, 210 KB left), `ninja
build/w2_us/stamps/modules.ok` and the `a/0/9/6` check pass on a plain configure, and a host test of the date pick
(every day of 2000-2099 in every season) passes. Not yet tested in game: on a winter day Virbank City and both Complex
zones should snow or not together; spring should bring rain on some days in most zones; in chaos every warp or Fly into
an exterior should change the season.

## 2026-10-28: DS Protect disarmed in hack builds (Remote Control session, not committed)

Hack builds never run DS Protect (docs/paperwhite2/plugins.md, DS Protect), the suspected cause of the shifted
build's black screen on the 3DS (Hardware tests below). Its four sites, in `game_system.c`, `event_battle.c`,
`event_mapchange.c` and `pokelist.c`, call under `PAPERWHITE2` the callbacks that its checks call when they pass, and
overlay 337 is never loaded. No object outside `lib/dsprot` references `DSProt_Init` or `DSProt_CallRunChecks*` in a
hack build. `--hack` and `--hack --shift 0x100` build with no warnings and `verify_dsi_rom.py` says intact for both,
and a plain configure passes `ninja build/w2_us/stamps/modules.ok`. To test on the 3DS through TWiLight Menu++, in DS
and DSi mode: `paperwhite2.nds` and `paperwhite2_shifted.nds` in the Windows folder (the shifted one is also
`build/paperwhite2_shifted.nds`). Load the save, change maps, battle, open the party list. If the shifted build still
goes black, DS Protect wasn't the cause (or not the only one).

## 2026-10-28: the Season app at the Centers' globe (Remote Control session, not committed)

The Pokémon Centers' globe opens a touch-screen Season app instead of Geonet, which hack builds no longer have
(docs/paperwhite2/plugins.md, Season app): `src/paperwhite2/ov312/paperwhite2_season_app.c`, linked into Geonet's
overlay 312 and started by `Scrcmd_ProcFld_CallGeonet` under `PAPERWHITE2`; `global_2100.s`'s `Script_9` no longer
checks `EVENT_FLAG_0x006a` in hack builds (the flag and the Castelia Geonet girl are untouched). It is Geonet's parts
without the globe: the grid on both screens, the message window on the top screen with the setting, the current
season and the game's season banner (its black made transparent over the grid), and on the touch screen Geonet's list
(Set Season, Dynamic Options, Set Hemisphere, Cancel) leading to pages of task-menu buttons with Geonet's Quit button
as BACK. Touch and D-pad + A/B both work; the current mode's or hemisphere's button is amber. Text is a new bank,
`res/text/system/season_app.txt` (`TEXT_BANK_SEASON_APP`); the buttons' art is three new members of Geonet's archive,
`res/graphics/geonet/08.png` (a copy of the task menus' frame), `09.pal` and `10.pal`, loaded through a new
`AppTaskMenuRes_CreateFromArchive` in `app_taskmenu.c`. `--hack` builds with no warnings, `verify_dsi_rom.py` says
intact, the memory check passes (209 KB left; overlay 312 0x3440 bytes, now the largest of its group, so overlays 36,
170 and 337 moved up 0x720, within overlay 36's room), and a plain configure passes `ninja
build/w2_us/stamps/modules.ok`. Not yet tested in an emulator or on hardware: plugins.md has the layout; the test is
to open the globe, try every page by touch and by keys, and leave the Center after each change to see its banner.

## 2026-10-28: the seasons ported, revised (Remote Control session, not committed)

The PMC season plugin is C again, revised rather than copied (docs/paperwhite2/plugins.md, Seasons): the setting is
still `EVENT_WORK_SEASON_SETTING` (bits 0-3 the mode, bit 4 the hemisphere; old saves' 0-7 mean what they meant), with a
southern hemisphere and a chaos mode (8) added, the daily mode counting real days (the plugin's `month * 31 + day`
skipped days at month ends) and the banner shown once for every mode but real time, which keeps the original's walk,
and chaos, which shows none. `Season_GetNext`/`GetPrevious` are the original's again. The 24 calendar zones' weather
is drawn once a day from per-season rates (`res/paperwhite2/seasonal_weather.json`, dumped from `a/0/9/6` by
`tools/paperwhite2/seasonal_weather.py`). `--hack` builds, `verify_dsi_rom.py` says intact, 210 KB (`0x34800`) left
in the main arena, `ninja build/w2_us/stamps/modules.ok` passes on a plain configure, and a host test of the date
math (every day of 2000-2099) passes. No in-game test yet; with the season NPC gone the mode can only be set by a
debug edit of the save's work value until the Season app exists.

## 2026-10-28: the season NPC removed (Remote Control session, not built yet)

The hack's season-change NPC (sets `EVENT_WORK_SEASON_SETTING`, the PMC season code's setting) is gone from the Pokémon
Centers of Aspertia, Floccesy and Virbank: its NPC (at 10,11, shown by `EVENT_FLAG_TRAINER_TEAM_PLASMA_GRUNT_3`), its
script and its messages. Floccesy's and Virbank's scripts and text are the original's again; Aspertia's keep the
hack's other changes, and the daily-gift NPC (global 10851) keeps its messages in Aspertia's bank. Castelia's Center
had only an unreachable copy of the script (no NPC, numeric message IDs past its text), now removed. Bianca's
post-gym scene in `aspertia_city.s` no longer resets that flag (nor Hugh's opening scene sets it), and her C-Gear
lines are the original's again (the hack had appended the "new service in the Pokémon Center" speech).

## 2026-10-28: the battle plugins ported (Remote Control session)

Type Icons (the angular-wedge "Solid" style the hack's ROM has) and Move Effectiveness Preview are C in overlay 168,
`src/paperwhite2/ov168/paperwhite2_{type_icons,move_preview}.c`, hooked from `btlv_effect.c`, `btlv_gauge.c` and
`btlv_input.c` under `PAPERWHITE2`. `docs/paperwhite2/plugins.md` has the files, the hook table and the data.

- The installer's panel expansion is in `res/graphics/btlv/438.png` (8 more blank tiles) and `439.ncer` (a third OAM
  piece); packed, `a/0/1/1` members 438 and 439 equal the hack ROM's.
- The move colors are the hack's (its installer edited the DLL's six color bytes at `0xba4`): super effective light
  blue `0x7ecc`, resisted yellow `0x2f7e`, immune gray `0x4210`.
- `BtlvGauge`, `BtlvInput` and `PaletteFade` moved from their `.c` files into their headers, unchanged; a plain
  `configure.py w2_us` build still passes `ninja build/w2_us/stamps/modules.ok`.
- The hack builds and `verify_dsi_rom.py` says intact. Memory: 210 KB left in the main arena after the heaps (was
  220 KB); overlay 168 is now the highest overlay.
- Not yet play-tested: wedges on the name boxes in single, double and triple battles (player and enemy), hidden under
  a status and back after a cure, following type changes (Roost, Soak, Reflect Type, Illusion); move names colored on
  the move screen in single and rotation battles, and the selected move's name above the target cards in double and
  triple battles.

## 2026-10-28: the trial and the first import (Remote Control session)

### Build

- `orig/baserom_w2_us.nds` matches `w2_us.sha1`. The hack ROM is `orig/paperwhite2_v0.21.nds` (SHA1 `71669351...`,
  trimmed to 297 MB).
- A matching White 2 builds in WSL (Ubuntu 26.04, Python 3.14): `python3 configure.py w2_us && ninja`.
- New `configure.py --hack`: builds `build/paperwhite2.nds` without the SHA1, module and archive checks (no padding,
  no BUGFIX). `python3 configure.py w2_us --hack && ninja`. A plain `configure.py w2_us` goes back to matching.
- The clean data is kept as the git tag `w2-original` (the fork point, 9a2dd68a0e) and, locally, as a copy in
  `extract/res_original/` (ignored). `git diff w2-original -- res/` shows every hack change.

### Imported into res/ (from the hack ROM, verified by rebuilding)

Each archive below, packed from `res/`, equals the hack ROM's member for member, except where noted.

| What | Archive | Files | Note |
| --- | --- | --- | --- |
| Script text | `a/0/0/3` | 17 in `res/text/script/` | Same text; 3 files encode smaller than Frost's (Frost writes uncompressed) |
| Berry descriptions | `a/0/0/2` | 10 `res/items/*_berry/data.json` | Cheri–Aspear gain a flavor line, Figy–Iapapa reworded |
| Zone header | `a/0/1/2` | `res/field/zones/black_city.json` | `enc_slot` 0 → 7 |
| Zone events | `a/1/2/6` | 17 in `res/field/events/` | 4 files (Castelia City 7, Aspertia City, Aspertia and Virbank gates) are 2 bytes shorter in the hack: Frost under-pads the init scripts. Harmless |
| Field scripts | `a/0/5/6` | 24 in `res/field/scripts/` | Byte for byte. No commands from code injection are used. Disassemble *after* importing the script text: the disassembler names messages from `res/text/script/` |
| Wild encounters | `a/1/2/7` | all 135 in `res/field/encounters/` | Byte for byte. Dumped as White 2 for both versions: the hack has seasonal tables where Black 2 has one, which the shared format can't hold, so Black 2's own encounters are gone |
| Trainers | `a/0/9/1`, `a/0/9/2` | Cheren ×2, Roxie ×2, Lass Isabel | Only the real changes; Frost's uncompressed names, reordered message table and a stray `\x{ffff}` on Colress's name were left out. Colress 2's type-20 message also differs in the hack, but the user didn't change it (Frost's table rebuild), so it stays original |
| Map terrain | `a/0/0/8` | 23 CSVs in 20 `res/field/maps/models/*/` | Collision/attributes only, no geometry. 23 tiles use shape 1, which the original never does; `map_terrain_data.py` now packs it unchanged |

Tool fixes: `trainer_data.py dump` named held items with `ITEM_ICON_*` constants (the `ITEM_` prefix lookup), now it
uses `items.txt`; `map_terrain_data.py` accepts tile shape 1.

The trial's comparison scripts are in `tools/paperwhite2/` (start of the editor's Import from ROM).

### Not imported yet

- **Following Pokémon** (port with its code): (done on the branch `following-port`: the 2,574 new field actors in
  `a/0/4/7`/`a/0/4/8`, and the Options text of `title_2`, `a/0/0/2` member 32); files in `following/`,
  `patches/`, `codeinjection/`, `overlay/overlay_0344.bin`, and the root `rail_data_index.tbl` and
  `field_camera_data_index.tbl`.
- (Done, see below: Unown sprites.)
- (Done, see below: Hidden Grottoes and Pokédex habitats.)
- (Done, see the battle plugins above: the type icons' `a/0/1/1` members 438–439.)
- (Done: the banner, see below.)
- Code: arm9 and overlays (PMC hooks, seasons, following) — the plugin port. (MoveEffectiveness and TypeIcons are
  done, see above.)

### Left alone on purpose

- (Corrected below: the rails are real edits.)
- Repacked with no member changes: `a/0/0/4`, `a/0/0/7`, `a/0/1/6`, `a/0/1/9`, `a/1/2/0`, `a/1/2/4`, `a/2/8/2`.

### Rails (found after the first test)

The user edited Castelia City's rails (zone 28 → `a/1/1/0` entry 1 → rail file 11, tile attributes file 36): copies
of the original rails at several heights, with new NPCs on them. Without them the NPCs are missing and leaving the
Castelia Pokémon Center freezes the game (the imported events use rail lines that the original file lacks).

Frost writes rail files with a 6-word header (no end offset, so the game takes the tile width, 0x1000, as the end of
the curves; it works because curves are only looked up by index). Every file it saved has that layout, which is all
26 changed files. The import must keep every point, line, camera and curve index, and write the game's 7-word header.

The root `rail_data_index.tbl` is Frost's zone → `a/1/1/0` index table (zone 28 → 1), and
`field_camera_data_index.tbl` the same for cameras; neither is read by the game.

### Field actor sprites

`tools/paperwhite2/import_field_actors.py BASE_FILES HACK_FILES [ROOT]` writes the sprites of the hack's changed
existing actors into `res/field/actors/`, reading only the base's 1,008 table entries and 975 graphics members (the
rest is the follower plugin's). It imported 23: `OBJ_CODE_POKEMON_UNOWN` and its forms 1–21 (Unown A–V, now other
species' 8-frame walking sprites, 256×32, which the follower plugin's entries also point at) and `OBJ_CODE_253`
(a Castelia NPC given back and walking frames). The table is unchanged, so the entries keep their 6-frame
`sprite_atlas_size` as in the hack. Packed, the graphics equal the hack's first 975 members.

### Rails, grottoes and habitats imported

- `tools/data/rail_data.py` (`res/field/rails/`), `grotto_data.py` (`res/field/grottoes/`) and `habitat_data.py`
  (`res/pokedex/habitats/`) are in `DATA_PACKS`; each packs the base ROM back byte for byte. Built, the rails equal the
  hack's with the header fixed (Castelia's rail file 11: 8 → 36 points, 6 → 30 lines, the originals an unchanged
  prefix), and the grottoes and habitats equal the hack's members.
- Grottoes: 18 of 20 changed, Pokémon only. Three slots had kept the gender thresholds of the species they replaced
  (Nidoran♂/♀ 0/0/100/100, Ditto 0, Kingler/Corsola 30/30/60/60); at the user's request Route 2's Tepig and Giant
  Chasm's Umbreon are now 12 and Route 18's Chatot 50, their species' ratios (31 and 127 of 256), and so are all
  15 starters in grottoes (12, in both versions' sets where the hack placed them). The original game
  sets most slots to 30 by hand, whatever the species.
- Build bug, fixed: `tools/build/files_tree.py` left the symlink to the extracted file at a path that had just started
  being built, so the first pack of a new `DATA_PACKS` archive wrote through it into `extract/<version>/files/` (it
  overwrote the base's `a/2/7/3` and `a/2/9/6`, restored from a fresh extract). It now removes that link.
- Habitats, as Frost regenerated them: every form icon is 0 (the base had 205 seasonal and regional forms), every area
  shows by season, and 18 areas are cut at the game's limit of 30 species (their encounters have 31–77). A habitat
  generator from `res/field/encounters/` that keeps forms belongs in the editor.
- `trade_data.py`'s dump names `held_item` with `name("ITEM_")`, which can give `ITEM_ICON_*` names (as trainer_data
  did); the current trade sources are right.

### Banner

`res/paperwhite2/banner/` (banner.yaml, bitmap.png, palette.png, animation.bin) is the hack's banner; `--hack` builds
point the ROM config at it (`banner_edit` in configure.py), matching builds keep the original. The title is the
hack's (English and Japanese "Paper White 2", the other languages "White Version 2" as in the hack); Frost had filled
the Chinese and Korean titles with 0xFFFF, and they are the original's again (empty, and the Korean "White Version
2"). The icon is the original's, as in the hack.

### DSi header check

`tools/build/verify_dsi_rom.py build/paperwhite2.nds`: every DS and DSi sector digest, block digest and the six
HMACs (ARM7, digest, banner, ARM9i, ARM7i, ARM9) are valid. The DSi settings (dsi.yaml: unit code, flags, access
control, SCFG, title ID) equal the original's; the header bytes that differ are the sizes, offsets, digests and HMACs
that dsd recomputes, and the header and logo CRCs are valid. The RSA signature is the original's, as in the hack,
which runs in DSi mode through TWiLight Menu++ (it doesn't verify it). Run the verifier after every change to the
ROM's layout or code. It can't read Frost's ROM, whose ARM9 isn't BLZ-compressed as it expects.

### First code build (2026-10-28)

With the user's DS ARM7 BIOS at `orig/bios7.bin` (16 KB, ignored by git), `--hack` builds with the example hook
(`PaperWhite2_NextFieldFrame` in ov036, called every field frame) and `--hack --shift 0x100` both build and pass
`verify_dsi_rom.py` (the secure area's own sector digests can't be checked from a decrypted ROM, so it skips them).
The user play-tests both: `build/paperwhite2.nds` and `build/paperwhite2_shifted.nds` (a copy; a shifted build
writes `build/paperwhite2.nds`).

### Hardware tests (2026-10-28)

On the user's 3DS through TWiLight Menu++ (nds-bootstrap; DSi mode at 133 MHz, and DS mode): the normal hack build
with the battle plugins boots, loads the save and battles. The `--shift 0x100` build reaches the title screen and
the save menu, then goes black on loading the save, in both modes; melonDS runs it. nds-bootstrap wrote no log
(`NDSBTSRP.LOG`). The suspected cause is DS Protect (overlay 337): nds-bootstrap disarms it with patches at the
original's addresses, which miss once code moves, and the first check after the save loads is the map change's. The
hack's builds no longer run DS Protect (2026-10-28 entry above); that fix is pending a 3DS test. It matters for normal
hack builds too: ARM9 main has grown since, so every overlay has moved.

### Upstream sync

Remote `upstream` is fuddlesworth/pokebw2; merge (never rebase) `upstream/main` between milestones. First sync
2026-10-28, 102 commits (8f5bf2788c): only data conflicts, in files the hack changed, because upstream renamed script
commands and changed `event_data.py`. Resolve such conflicts by taking upstream's file and dumping the hack's data
again with the new tools (`tools/paperwhite2/events_lenient.py`, `tools/script/field_script.py disasm` after the
hack's text is in `res/text/script/`), never by hand. Then check `ninja build/w2_us/stamps/modules.ok` (code still
matches), build `--hack`, run `verify_dsi_rom.py`, and compare the archives with `tools/paperwhite2/narc_diff.py`.

### NPCs moved back (2026-10-28)

The Aspertia science guy's line is the original again. Back to their original places: Aspertia's advice NPC
(script 5), Floccesy's school kid (script 4, with her original facing and movement), Castelia's Geonet girl
(script 4, 9,12 facing up; the user remembers her on the season NPCs' tile 10,11 facing down after her event,
which the data doesn't show: ask before moving her). Kept as the user placed them: Mr. Medal (global 10638) in the
top-left corner of every Center up to Castelia, moved there so his medals aren't triggered by accident, and
Castelia's upstairs clerk (script 6) moved to make room for him.

### The 3DS crashes: nds-bootstrap's IRDO anti-piracy fix (2026-10-29)

nds-bootstrap applies `retail/apfix/files/IRDO-FFFF.ips` to every ROM with game code IRDO, modified ones
included: it hooks the end of `MIi_UncompressBackward` (0x02004ea4) and writes a 224-byte stub over
0x020933d0-0x020934af. The original has an unused debug font there; once main moved, it overwrote AreaMan's and
the VRAM manager's tables, so billboard-actor and BG allocations failed (invisible NPCs and player, "Virban") and
the original's unchecked AREAMAN_FAIL path then freed garbage (Data Abort at 0x20202020). Confirmed on the 3DS: a
per-ROM override (`sd:/_nds/nds-bootstrap/apFix/<rom>.ips` restoring `bx lr`) fixed the failing build. Fix: hack
builds use game code IRDD, White 2's German code (`HACK_GAMECODE` in configure.py; the DSi title ID follows). IRDZ
was tried first, but emulators then don't know the save chip (melonDS: "The save data could not be accessed").
nds-bootstrap's fixes for IRDO and IRDJ match any CRC (FFFF), those for IRDD/F/I/S/K only the retail ROM's header CRC;
`tools/paperwhite2/check_header_crc.py` fails the build if ours ever equals IRDD's (0xE2DB). nds-bootstrap's Gen 5
fixes (alternate read method, ROM location, ARM9 patch) check only "IRD", so they still apply. DS Protect is
disarmed, so the AP fix isn't needed.

### Later (polish)

- The small follower's occasional clip at the Pokémon Center counter: the split runs there and clears the counter in a
  model of the real geometry; the user still sees something now and then. Look again with a screenshot.

- Boot-time repair of nds-bootstrap's IRDO anti-piracy fix: at startup, if the word at 0x02004ea4 isn't the original
  `bx lr`, restore it and copy back the build's own bytes of 0x020933d0-0x020934af from a copy the build embeds. That
  makes hack builds immune to that fix whatever their game code; it can't cover a future fix at other addresses.
  After any nds-bootstrap update, a quick Castelia check (NPCs visible) on the 3DS.
- If the follower's shadow ever misbehaves badly in Pokémon Centers: try switching camera setup 3 (`a/0/5/9`, used by
  every Pokémon Center) from W-buffering to Z-buffering. In W mode the field's projection depth offsets (actors full,
  shadows half, `FieldRenderPhase2_Fieldmap`) do nothing, so the floor and the oval beat the lowered follower; in Z
  mode the Centers would sort like outdoor maps, and the shadow pass's offset could be lowered to push the oval back
  without sinking it. Risks: z-fighting of near-coplanar details (floor emblem, rugs, counter top, trims), and any
  other map sharing setup 3 (check; give the Centers their own copy if so). One test build, revert if anything flickers.
  The user chose to leave it, since the current state works and the shadow has taken many rounds.

### Next

1. The user tests `build/paperwhite2.nds` (`\\wsl$\Ubuntu\home\riku\paperwhite2\build\paperwhite2.nds`) in melonDS
   (DSi mode) and on 3DS TWiLight Menu++. It is the hack's data on clean code: no followers, seasons or plugins.
3. Port the PMC plugins.
