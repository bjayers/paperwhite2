# Harsh sun and the dry thunderstorm: new field weathers (research 2026-11-26, built 2026-11-27)

A field weather that works like the others: on the weather calendar and in the Weather Editor, kept across maps by the
calendar, sun in battle (as field rain gives battle rain), and the weather of Entei's and Moltres's routes
(roaming-legendaries.md 9.2 and 10, where they have none until it exists). This note is research, mock-ups and a
plan, then (section 13) the user's decisions and what was built. [V] means seen in the code or in DeSmuME; [P] means
inferred or still to check on hardware.

Mock-ups and real captures: `Pokemon Paper White\harsh_sun\` (Windows folder), contact sheet
`harsh_sun_options.png`. Places: Route 19 (grass, day), Aspertia City (town, day), Desert Resort (sand, day, weather
forced clear), Route 19 at night (clock +9 h). Per place `<p>_base.png`, `<p>_A_warm_light.png`,
`<p>_B_shimmer.gif`, `<p>_C_rays_glare.png/.gif`, `<p>_D_motes.gif`, `<p>_AB.gif`, `<p>_ABC_light.gif`,
`<p>_AD.gif` (`p` = `r19`, `asp`, `des`, `r19n`); GIFs are 16 frames at 2x, two DS frames apart. Also
`real_<p>_Abright.png` (A plus a BLDY brighten) and `real_r19_tintwarm.png` (a warm flat custom tint).

**A, B and A+B are real**: DeSmuME (py-desmume) running `build/paperwhite2.nds` on a copy of the user's save, with
RAM and register writes only, no ROM change. C and D are composites on those real frames, with the DS's 2D maths
(5-bit colour, BLDALPHA EVA/EVB in sixteenths clamped at 31, whole-pixel OBJs).

## 1. How field weather works now

**The system** (`src/ov036/weather.c`) [V]. `FieldWeather_Create` makes two `Field3DBg` billboard layers (3D quads 80
and 88 units in front of the camera, `WEATHER_BG_SETUPS`), a ClAct unit of 0x40 OBJ actors on the main screen
(`WEATHER_SURFACE_SETUP`), and two `WeatherTask`s (`weather_task.c`) so that one weather can fade out while the next
fades in (`WEATHER_TRANSITION_SEQUENTIAL` / `_CROSSFADE`). `WEATHER_OVERLAYS[WEATHER_MAX]` maps each weather id to its
`WeatherData` and the overlay that holds it: 74 sunny, 75 the particle weathers (flake, blizzard, flutter, speck), 76
rain / thunderstorm / gusty rain, 77 the sandstorms, 78 the original tints; the hack's custom tints keep their
`WeatherData` in overlay 36 (`PAPERWHITE2_CUSTOM_TINT_WEATHERS`) and only name 78.

**A weather** (`include/field/field_weather.h`) [V] is a `WeatherData`: graphics (`WeatherGraphics`: archive, OBJ
chars/palette/cells/animations, up to two billboard textures), a work size, seven functions (Init, FadeIn,
InitNoFade, Main, InitFadeOut, FadeOut, Exit) and an `objFunc` per particle. Its tools are the task's API:
particles (`WeatherTask_AddParticle`, the spawner `WeatherTask_SetupSpawner`), the billboards (visible, texture
scroll, scale), fog (`WeatherTask_InitFog`, `_ChangeFog`, `_ChangeFogOffset`), light (`WeatherTask_FadeLight` /
`_SetLight` to a weather light file, `_FlashLight`, `_SetLightColor`, `_ResetLight`) and sound.

- **Sunny** (`src/ov074/weather_sunny.c`): nothing but the zone's own fog and light.
- **Rain** (`src/ov076/weather_rain.c:250-283`): OBJ drops from a spawner, fog shift 8 / offset `0x7f5f`, the
  weather light `FieldLightStatus_GetWeatherLight(2)` faded in, the rain sound. The thunderstorm adds a billboard
  sheet, a darker light colour (`WeatherTask_SetLightColor(task, 0x28c6, 8)`) and flashes (`_FlashLight(0x23de)`).
- **Sandstorm** (overlay 77): scrolling billboards plus OBJ grains.
- **Tints** (`src/ov078/weather_tint.c`, the hack's `src/paperwhite2/ov036/paperwhite2_field_tint.c`): depth fog, no
  particles. A custom tint is a colour, a strength and a style (`flat`: the whole fog table at one density, a screen
  fade over the 3D; `fog`: the ramp), from `res/paperwhite2/field_tints/tints.json`.

**Weather lights** [V]. `sWeatherLightIds` (`src/system/field_light_status.c:41`) maps the original's 15 weathers to
files of `ARCID_LIGHTS_BATTLE` (61, `res/lighting/battle/000-009.json`, the same `lights.schema.json` as the field's
sets: per period, four lights, diffuse/ambient/specular/emission, fog and clear colours). The rain overlay's
`WEATHER_SOUND_TYPE 0x3d` is that archive's id (61), misnamed. `FieldLightStatus_Get` gives a battle its lights by the
field weather (`src/ov168/btlv_effect.c:311`); the hack skips its tints there (`weather < WEATHER_CUSTOM_TINT_1`).

**The field's light** (`src/ov036/field_light.c`) [V]. `FieldLight` holds the zone's light set (up to 16 period
entries) and a `current` `FieldLightEntry` that it interpolates between periods. `FieldLight_Flush` (each 30 fps
frame from `FieldRenderPhase1_Fieldmap`, `fieldmap.c:1461`) calls `FieldLight_FlushCore` when `dirty`, which sets the
four `G3DLight` colours and directions, `NNS_G3dGlbMaterialColorDiffAmb`/`SpecEmi`, the fog colour and the clear
colour; `GFL_G3DLightFlush` sends the lights. In DeSmuME, writing the day entry into the night's `current` turned
the map to day, and the light colours alone hardly changed it: the lights, the global material colours and the fog
together give the time of day (all of the map's look comes from this entry, not from texture palettes). Edge marking is per area: `Field_LoadEdgeColorTable` (`fieldmap.c:1112`) loads the area's edge colour table (`AreaData_GetEdgeColorTableID`) or turns marking off; DISP3DCNT read `0x0039` on Route 19 (textures, alpha blend, anti-aliasing, edge marking on; toon/highlight shading off), so no toon table is in use and the edge colours could be warmed too, but they are outlines only [V, one DeSmuME read].

**The 2D side** in the field (DeSmuME register reads on Route 19, Aspertia, Desert Resort) [V]: DISPCNT `0x00111718`
(mode 0, BG0 = 3D, BG0-BG2 and OBJ on, BG3 off until the place name), BG0CNT `0x1f03` (priority 3), BG1 `0x0010`
(the message window, priority 0), BG2 `0x1f12` (priority 2, the message system's second layer and the transitions'),
BG3 `0x0205` (the place name banner, which also uses the windows, `field_place_name.c:721-748`). BLDCNT is 0 in the
plain field (it was `0x1b44`, BG2 alpha over the rest, in one other zone), BLDY 0, master brightness 0. VRAM
(`FIELDMAP_VRAM_CONFIG`, `fieldmap.c:211`): main BG bank D (128 KB), main OBJ bank E (64 KB), sub BG H, sub OBJ I,
textures A-C, texture palettes G; **bank F (16 KB) is unused**. The weather's OBJs share bank E with the field's
other OBJs; a few 8x8 cells are nothing.

**HBlank** [V]. `main.c:53-57` installs `GFLAppIRQHBlank` and enables the HBlank IRQ for the whole game; it runs the
GFL HBlank TCB manager (`gfl_use.c`, 4 slots), which the wipe (`wipe.c`) uses during transitions and the battle's
background wave uses (`src/ov168/btlv_bg.c`, `BtlvBg_WaveHBlank`: a sine table written to BG3's offset per line,
the model for a heat shimmer). In DeSmuME the IRQ fired 263 times a frame in the field.

**The lens flare** [V]. Vanilla has a sun lens flare: `field_goout_effect.c`, a 3D scene (archive 0xe8, `a/2/3/2`)
placed 60 units in front of the camera and played when leaving a building into a sunny zone that one may fly from
(`FieldLensFlare_DecideForZoneTransit`, `FieldLensFlare_IsApplicable`), by period (day, evening, night sets).

## 2. Weather ids and who reads them

The enum is `include/system/zone_weather.h`: the original's 0-14, then `WEATHER_CUSTOM_TINT_1`-`_12` (15-26) under
`PAPERWHITE2`, then `WEATHER_MAX`. Harsh sun would be **`WEATHER_HARSH_SUN` = 27**, after the tints. Readers:

| Where | What to add |
| --- | --- |
| `src/ov036/weather.c` `WEATHER_OVERLAYS` | `{ &PAPERWHITE2_HARSH_SUN_WEATHER, OVERLAY_ID(78) }` (code in ov036, as the tints) |
| `src/ov036/field_encount.c:552` `ConvFieldWeatherToBtl` | `case WEATHER_HARSH_SUN: return BTL_WEATHER_SUN;` |
| `src/paperwhite2/ov012/paperwhite2_battle_weather_event.c` `BattleWeather_ToFieldWeather` | sun gives `WEATHER_HARSH_SUN`, not `WEATHER_SUNNY` (Sunny Day / Drought then leave harsh sun for 5 minutes, as Rain Dance leaves rain) |
| `src/system/field_light_status.c` | a battle light for it: a new `res/lighting/battle/010.json`, chosen by id past the tints' check |
| `include/paperwhite2/weather_groups.h`, `paperwhite2_conditions_context.c:51` | a group: either clear (as the tints, keeps the 16-bit encounter masks) or a new `WEATHER_GROUP_SUN` (bit 27 doesn't fit 16-bit masks: map it in the context as the tints are) |
| `src/ov104/field_gimmick_gate.c:672` | the gates' board: a name for it ("Harsh sunlight") instead of the tints' fallback |
| `res/field/scripts/global_10200.s` `L_DebugWeather` | entry 28 "Harsh sun" (and the `CMP_GT 27` bound) |
| `res/field/weather_calendar/weather_calendar.schema.json` enum, `tools/data/weather_calendar_data.py` (reads the header's enum) | the name; the packer follows the header |
| `res/paperwhite2/entralink/run.schema.json` `field_weather` | the name, if runs may use it |
| `editor/src/modules/weather/weathers.ts` `LOOKS`, `editor/src/modules/encounters/model.ts` groups | label, swatch, "Sun in battle" note |
| `tools/paperwhite2/roamers.py` `WEATHERS["harsh_sun"]`, `roamers.schema.json` | `WEATHER_HARSH_SUN` instead of `WEATHER_NONE` |
| `field_goout_effect.c:166` | optional: let the lens flare play in harsh sun too |
| `zone_weather.c` `GetWeatherAll` | nothing: calendar, header, battle weather and roamers all return ids |

## 3. The options

### A. Warm, bright light (real in DeSmuME)

The light entry made warmer and brighter: lights and diffuse/ambient lifted toward warm white, blue cut
(`warm(c,k)`: r + (31-r)·0.7k + 2k, g + (31-g)·0.35k, b·(1-0.45k), k 0.45 by day, 0.25 at night). Done in DeSmuME by
writing `FieldLight.current` (offset 0x356 of the `FieldLight` that `FieldLight_Flush` gets in r0) and `dirty`
(0x38c). It shows within a few frames on every map tried. `real_*_Abright.png` adds BLDCNT `0x0081` / BLDY 2 (BG0
brightened by 2/16), which washes the scene: not recommended alone.

**Build:** a weather light file `res/lighting/battle/010.json` (the day periods warm and bright, evening a deeper
orange, night close to the normal night with a little warmth), faded in with `WeatherTask_FadeLight(task, 61, 10)`
as rain fades in its own, reset on exit. Zero code beyond the weather's functions; the battle gets the same file.
The light replaces the zone's light set while the weather plays, as rain's does, so one file serves every zone
(a zone with a strongly tinted set of its own, a cave entrance or a forest, loses it, as it does in rain). Fine
tuning is data. **Cost:** one ~0.5 KB file in the archive, no RAM. A flat warm custom tint (the tints' fog path,
`real_r19_tintwarm.png`, colour (31,22,10) at 17%) also works but greys distance and contrast; light is better.

### B. Heat shimmer (real in DeSmuME)

Per-line horizontal offset of the 3D layer: BG0HOFS written from the HBlank IRQ, each line a sum of two sines moving
with the frame, strongest at the top of the screen (far away) and none from line 150 down (by the player's feet),
amplitude 3 px by day, 2 at night. DeSmuME draws it: the 3D map, its billboard actors and the fog wobble; the 2D
layers (message window, OBJs) don't.

- The field doesn't touch BG0HOFS (the 3D layer has no 2D scroll) [V by reading]; the message window scrolls BG1
  only. Hardware takes horizontal scroll on the 3D layer (GBATEK: BG0HOFS scrolls the 3D layer, no vertical) and the
  2D engine reads it per line, so per-line offsets work as on a text BG [P: check on the 3DS and in melonDS].
- **Edges:** shifted lines show the backdrop (BG palette colour 0, here blue `(9,10,31)`) in the 1-3 edge columns.
  Fixes: keep the amplitude at 2 px or less, and set the backdrop colour to the light's fog colour (or a mid ground
  colour) while the weather plays; restore it on exit.
- **Build:** an HBlank TCB (`GFL_HBlankTCBAdd`, as `btlv_bg.c`) that writes `REG_BG0HOFS` from a 192-entry s8 table,
  rebuilt (or its phase advanced) each frame by the weather's Main; or an HBlank DMA of the table if a DMA channel is
  free (zero CPU) [P: which channels are free is in undecompiled library code]. Write 0 and remove the TCB on exit,
  on the field's close and before a battle or a wipe (the wipe uses its own TCB slot; 4 slots exist).
- **Cost:** ~200 bytes of code, 192 bytes of table; the IRQ already runs every line, so the extra is a lookup and a
  store per line (well under 1% of the ARM9). DSi mode: same 2D engine, faster CPU; nothing changes.
- **Taste:** a constant wobble can tire the eye; a slow, small one (1-2 px, waves rising) reads as heat. Turn it off
  in menus that freeze the field is not needed (the field still draws).

### C. Sun rays and lens glare (mock-up)

Diagonal shafts from a sun off the top-left corner and a few lens-glare hexagons along the line through the screen's
centre. Faithful build: the shafts as a 4bpp BG (BG2 when the message system isn't using it, or a dedicated layer:
only BG2 is spare-ish, and it is the message system's second layer and the transitions', so it must be given back)
with three palette shades, blended with BLDCNT target 1 = that BG, target 2 = BG0 + OBJ, EVA 8 / EVB 16 (additive,
clamped); the glare as semi-transparent OBJs (EVA 6). Or, cheaper and conflict-free, the **vanilla lens flare** 3D
scene (archive 0xe8) re-used, or a third billboard textured with soft shafts (the `Field3DBg` path rain's sheet uses,
3D polygon alpha 0-31, no 2D layer or BLDCNT needed).

- **Problems:** a screen-fixed sun doesn't match the map's light direction or the camera; BLDCNT and the windows are
  shared with the place name banner and other effects; strong rays read as a filter on a 256x192 screen. The mock-up's
  full strength is too much; "C light" (half, no glare) is the most it should be. Off at night.
- **Cost:** BG: 16 KB of chars at most (bank D has room) and a palette; billboard: a 64x64 texture (bank A-C).

### D. Heat motes (mock-up)

22 tiny OBJs (1-px specks, 2x2 dots, 3x3 sparkles that twinkle over three cell frames), rising ~1.6 px a frame and
swaying, semi-transparent warm white. Exactly the particle path the snow weathers use (`WeatherTask_SetupSpawner`,
`objFunc`, ClAct, overlay 75's flakes as the model): an 8x8 cell set and a palette in a graphics archive, ~0.3 KB of
code. They don't wobble with B (OBJ, not 3D). In the 2x GIFs they read as dust or pollen as much as heat; at night
they look like fireflies.

## 4. The battle side

`ConvFieldWeatherToBtl` gives `BTL_WEATHER_SUN`; `BtlServerFlow_StartBattle` (`src/ov167/btl_server_flow.c:140`)
starts any non-zero `env.weather` with `ServerControl_ChangeWeather(flow, weather, 0xff)`, permanent, which plays the
vanilla sun animation and "The sunlight is strong." at the battle's start, as field rain does for rain; every sun
rule follows (Fire 1.5x, Water 0.5x, Solar Beam, Synthesis, Weather Ball, Chlorophyll, Solar Power, Leaf Guard,
Flower Gift, Dry Skin, Castform). Drizzle, Sand Stream and Snow Warning replace it as usual. The battle's lights come
from the weather light file (A's file 10). After the battle, the hack's battle weather (plugins.md "Battle
weather") should map sun to harsh sun, so Sunny Day or Drought leave the field in harsh sun for 5 minutes; and a
battle that ends with rain in a harsh-sun zone leaves rain there (already the rule). A roamer's battle on its route
starts in sun: Entei's and Moltres's Fire moves gain, which fits.

## 5. Recommendation (first round; superseded by section 11)

**A + B, with D optional and C left out** (or C only as the vanilla lens flare on leaving a building, which already
exists): a weather light file that makes day bright and warm (evening orange, night near normal), plus a slow 1-2 px
heat shimmer on the top half of the screen by day, none at night. Both are proven in DeSmuME on real maps, cost
almost nothing, need no 2D layer, blend register or VRAM, and leave the message window and menus alone. D is cheap
to add later if the user wants movement on calm maps. Sound: none, or a faint cicada loop if one exists in the sound
archive [P].

## 6. Build plan (first round; section 11 extends it)

1. `WEATHER_HARSH_SUN` in `zone_weather.h` after the tints (id 27), its `WeatherData` in a new
   `src/paperwhite2/ov036/paperwhite2_harsh_sun.c` (`include/paperwhite2/harsh_sun.h`): Init/FadeIn fade the light
   to file 10 over ~90 frames and ramp the shimmer's amplitude; Main advances the phase; FadeOut/Exit ramp it to 0,
   reset the light, remove the HBlank TCB, write BG0HOFS 0 and restore the backdrop. The field's close also stops it
   (as the tints' exit clears their state).
2. `res/lighting/battle/010.json` (light file 10), and `FieldLightStatus_Get` choosing it for `WEATHER_HARSH_SUN`
   (battle lights).
3. Battle: `ConvFieldWeatherToBtl`, `BattleWeather_ToFieldWeather`.
4. Wiring: the weather group (decide: clear, or a sun group mapped for the 16-bit masks), the gates' board name and
   text, the debug menu's entry, the calendar schema, `run.schema.json`, the editor's lists (weathers.ts,
   encounters/model.ts) and the roamers' `harsh_sun` (`roamers.py`, schema); Entei and Moltres then get it.
5. Test in py-desmume (a route by day and night, a crossfade from rain, a battle's start and Sunny Day's after), then
   the 3DS and the user's melonDS core for the shimmer's edges and per-line scroll.
6. Optional: D's motes (overlay 75's particle path with an 8x8 cell set); the lens flare in harsh sun.

**Cost, total:** overlay 36 about 0.6 KB (code and the 192-byte table), a few bytes elsewhere, a 0.5 KB light file;
no heap, no VRAM. Overlay 36 is in the arena's chain (memory.md), so the arena loses that much.

## 7. Open questions of the first round (answered or replaced in sections 8 and 12)

- The look: A + B as recommended, or with D, or C-light? Strength of A (k 0.35-0.6) and B's amplitude (1-3 px).
- At night: warm night and no shimmer (recommended), or harsh sun counts as clear at night?
- Encounters: does harsh sun count as clear for habitats and conditions, or as its own weather group?
- Should Sunny Day / Drought leave harsh sun on the field (as Rain Dance leaves rain)?

# Second round (2026-11-26, after the user's feedback)

The user loved the shimmer but wants it subtler, likes the flare/rays, wants **A + D at night** (warm light and rising
heat motes: in lore, what keeps Sunny Day's power working with no sun), and asked for a **dry thunderstorm** for Raikou
and Zapdos. All prototypes again in DeSmuME on the save copy with RAM and register writes only; files with the `r2_`
prefix in `Pokemon Paper White\harsh_sun\`, contact sheet `r2_options.png`.

## 8. How rain and snow stay out of the banner and the message boxes [V]

- **Particles are OBJs at BG priority 3.** `WeatherTask_AddParticle` creates each drop or flake with `ClActor_Create`
  and `WEATHER_OBJ_SETUP = { 0, 0, 0, 0x40, 3 }` (`src/ov036/weather_task.c:122`, the last field the BG priority).
  The OAM read in DeSmuME agrees: rain 13 OBJs (8x8 and tall cells), light snow 11 (8x8), thunderstorm 45 (32x32), all
  **priority 3, normal mode** (not semi-transparent), palette 0. An OBJ beats a BG of the same priority, so they draw
  over the 3D layer (BG0, priority 3) and **under** BG2 (priority 2), the place-name banner (BG3, priority 1) and the
  message window (BG1, priority 0). That is the whole trick: no window, no blend register.
- **Sheets are 3D.** The thunderstorm's, gusty rain's and sandstorm's scrolling layers are `Field3DBg` billboards,
  textured quads 80 and 88 units in front of the camera (`weather.c` `WEATHER_BG_SETUPS`, `field_3dbg.c`), drawn as
  part of the 3D scene: under every 2D layer, with per-polygon alpha (0-31), and under the shimmer too.
- **Light and fog are the 3D's own.** Rain's grey and lightning are the field light and fog (`WeatherTask_FadeLight`,
  `_FlashLight`, `_InitFog`), not 2D fades; screen fades (wipes, master brightness) darken everything together.
- **Blend registers are not the weather's.** BLDCNT stayed 0 in the plain field and in every weather; it read `0x1b44`
  (BG2 alpha over the rest) only after the debug menu had been open. So a semi-transparent OBJ (which needs BLDALPHA
  and BLDCNT's second targets) would change look whenever a menu leaves those registers set: avoid it; opaque OBJs or
  3D polygons need nothing shared.
- **The vanilla lens flare is 3D too.** `field_goout_effect.c` adds a scene (`LENS_FLARE_SCENE` 3) to the field's
  `FieldExpObjSystem`: one model and four animations from archive 0xe8 (`a/2/3/2`, `LENS_FLARE_RESOURCE_IDS`, 8
  flares), placed 60 units ahead of the camera every frame (`FieldLensFlare_CalcPos`). The day flare of each season
  (sets 1-4: flares 0-3) and the evening one (set 5: flare 4) are listed per building-exit transition in archive 0xf1
  (`a/2/4/1`, 67 entries of `FieldLensFlareEntry`: zone, the zone left, sets by season x day/evening/night); nights
  have none. It plays once (about 2 s), shown and hidden with the actor.

So the rays and flare can be drawn the rain/snow way in two forms: **the vanilla flare scene** (or a third weather
billboard with a soft-ray texture), both 3D, and **opaque OBJs at priority 3** for glints. Both stay under the banner and
the messages by construction.

**Prototype (real, `r2_day_*`, `r2_flare_vanilla_aspertia.gif`):** the vanilla flare forced in RAM (the entry index
read by `GameData_GetLensFlareEntryIdx`, GameData+0x308, set to Aspertia's entry 20, and the day sub-index), started by
setting `FieldLensFlare.requested`/`active`, then **held at its peak**: after ~10 frames its four
`FieldExpObjAnm.paused` set and its state put back to waiting, so the scene stays shown and follows the camera. It
works on Route 19, Aspertia and the Desert Resort: a soft white wash and faint shafts from the top left, subtle by day.

## 9. Day: A + B (subtle) + C (flare), real

`r2_day_{r19,asp,des}_A_Bsubtle_Cflare.gif` (16 frames), `r2_day_*_C_flare_held.png`, `r2_day_*_base.png`. B is now
**1 px, slow and top-only**: offset `round(sin(line·2π/28 + frame·0.22))`, full on lines 0-63 (far away), fading to
none by line 104, so most lines are 0 and the player and the near ground never move; with 1 px the backdrop edge
(section 3 B) is a single column at most. A as before (k 0.45). The held flare is the C.

Build of C: harsh sun loads a flare into `LENS_FLARE_SCENE` itself (`FieldLensFlare_Load` with the season's day flare,
or a flare of its own in archive 0xe8 later), shows it, plays it to its peak frame and pauses it (or loops it slowly
with `FieldExpObjAnm_SetFrameStep`/`SetLooped`), and hides it in the evening and at night. The vanilla building-exit
flare uses the same scene: while harsh sun shows its own, skip the exit flare (`FieldLensFlare_DecideForZoneTransit`
already gives none for non-sunny weathers: harsh sun is one, so only the weather's own shows). Cost: the flare's model
and animations in the field heap (the vanilla code refuses below 15,000 bytes free; the field heap had 355 KB free in
the test), ~0.3 KB of code.

## 10. Night: A + D, the snow way, real and mock

- `r2_night_r19_A_D_specks_real.gif`: diamond dust (weather 8, overlay 75's specks) at night, its OBJ palette 0
  rewritten each frame to an ember ramp (palette RAM takes 16-bit writes only), the light warmed (k 0.3). Small
  twinkling embers, priority 3.
- `r2_night_r19_A_D_flakes_real.gif`: the light snow (weather 1) recoloured the same way: bigger 8x8 embers.
- `r2_night_r19_A_D_rising_mock.gif`: the motion wanted, rising and swaying (a new move function), over the real night
  A frame; opaque OBJ pixels.

Both real ones run under those weathers' own grey night light (their light file); the build uses harsh sun's file,
whose night entry is the warm night of A. Build of D: overlay 75's particle path exactly (spawner, `WeatherObj`,
`objFunc`), an ember cell set (or the speck/flake cells with an ember palette, which costs only a palette) and a
`Ember_Move` that rises 1-2 px a frame with a sine sway and a lifetime (the speck's `Speck_Move` has a `// BUG:` that
never sets the position; the new function sets it). ~0.4 KB of code, a 32-byte palette, OBJ VRAM for a few cells.

**One weather or two:** one **`WEATHER_HARSH_SUN`** whose look follows the day period is the better fit:
- the calendar holds one weather per day (`weather_calendar_data.py`: a byte per day of 366), so a night-only id
  can't be scheduled for nights; it would need code to swap ids at dusk anyway;
- a roamer has one weather (`roamers.json`), and the battle is sun either way (Sunny Day's power, the lore);
- the editor, debug menu, gates' board and encounter groups list one entry instead of two.
The weather's Main checks the period (`Field_GetDayPeriod`, as the lens flare's sub-index does) and crossfades its
parts: **morning/day** A + B + C, **evening** A (orange) + C's evening flare, no B, **night** A (warm night) + D.
The light file's periods do A's part on their own. A separate id is still cheap if the user wants to schedule a
"heat night" by itself: it would share all the code.

## 11. Dry thunderstorm (Raikou, Zapdos)

**How the thunderstorm is built [V]** (`src/ov076/weather_rain.c`, `THUNDERSTORM_WEATHER`, graphics
`{ 0x37, 1, 1, 0x11, 0xe, 0x10, 0xf, ... }`: archive 0x37, OBJ drops, one billboard sheet):
- drops: OBJs from a spawner (`WeatherTask_SetupSpawner(..., Thunder_AddDrops)`, prewarmed in `InitNoFade`);
- the sheet: billboard 0, shown with `WeatherTask_SetBillboardVisible(task, 1, 0)` and scrolled (`Thunder_ScrollBg`);
- fog: shift 9, offset `0x7f80`; light: weather light file 6 (`FieldLightStatus_GetWeatherLight(6)`), then dimmed
  (`WeatherTask_SetLightColor(task, 0x28c6, 8)`: (6,6,10));
- lightning: `Lightning_Update`, a state machine that picks flickers, a bolt or a forked strike and runs light flashes
  (`WeatherTask_FlashLight`) to `Lightning_GetShade`'s colour `shade | shade << 5 | 0x2000` = (s, s, 8), a **yellow**
  light, with the first flash `0x23de` (30,30,8); the flash is the 3D light, not a 2D effect;
- sound: `SEQ_SE_FLD_31` (the storm's rain loop, `WeatherTask_PlaySe`), the thunder claps per strike (`SEQ_SE_FLD_33`
  and the strike's own, `WeatherTask_PlaySeDirect`, delayed after the flash).

**It runs without the rain.** Prototype: the debug menu's thunderstorm with `Thunder_AddDrops`' count forced to 0 and
`WeatherTask_SetBillboardVisible`'s `enabled` forced to 0. The field went dark grey with no drops or sheet, and the
lightning flashed yellow as usual (`r2_dry_thunder_dark.png`, `_flash.png`, `_flash.gif`, the night pair
`_night_dark/_night_flash.png`, and the vanilla storm for comparison `_vanilla_rain.png`). Day and night look alike,
as the vanilla storm's light file does.

**Build:** `WEATHER_DRY_THUNDERSTORM` (id 28, after harsh sun), a `WeatherData` added to `weather_rain.c` under
`#ifdef PAPERWHITE2` (overlay 76, so it can use the static `Lightning_*` and `ThunderWork`): graphics with no OBJs and
no sheet (`{ 0x37, 0, 0 }`), and `DryThunder_*` functions that are the thunderstorm's minus the spawner, the sheet and
the rain loop (thunder claps kept; a wind loop if the sound archive has one [P]); same fog and light file 6.
~0.3 KB in overlay 76 (not in the arena's chain). `sWeatherLightIds` needs an entry for it only if a battle should use
the storm's light; the user settled there is **no battle weather**: `ConvFieldWeatherToBtl` gives none (the default),
and `FieldLightStatus_Get` lights the battle as in the clear (as the tints are).

**Encounters and habitats:** the weather groups (`weather_groups.h`) decide. Simplest: put it in
`WEATHER_GROUP_THUNDERSTORM`, so a habitat or condition that lists the thunderstorm also matches it. As its own
target it needs its own bit: the condition and encounter weather masks are 16-bit (`conditions.h`
`CONDITION_KIND_WEATHER`, `encounters.h`'s `u16 weather`); ids 0-14 use bits 0-14 and the context maps the hack's
tints to 0, so **bit 15 is the one free bit**: the context can map one new weather (dry thunderstorm or harsh sun) to it,
and a second would need the masks widened to 32 bits.

## 12. Recommendations and questions (second round)

- **Harsh sun:** one weather id (27) with the look by period: day A + B (1 px, top-only, as `r2_day_*`) + C (the
  vanilla flare scene held at its peak, 3D, under the banner and messages), evening A + evening flare, night A + D
  (rising ember OBJs at priority 3, the snow way). Battle: sun. Build order: A (light file), B, C, D.
- **Dry thunderstorm:** id 28 in overlay 76, the thunderstorm minus drops, sheet and rain loop; no battle weather;
  Raikou and Zapdos move to it in `roamers.json`.
- **Questions for the user:**
  1. Is the held flare's strength right, or should it pulse slowly (looped at a slow frame step)?
  2. Ember colour and size: the specks (small) or flake-size (8x8)?
  3. Encounters: should harsh sun and the dry thunderstorm be weathers that habitats can target on their own (one can
     take the free bit 15; both need 32-bit masks), or count as clear and thunderstorm?
  4. The dry thunderstorm's sound: thunder only, or thunder over a wind loop?
  5. Still open from the first round: should Sunny Day or Drought leave harsh sun on the field for 5 minutes, as Rain
     Dance leaves rain?

# Third round: the user's decisions and the build (2026-11-27)

## 13. Decisions and what was built

The user's answers to section 12 and the first round's questions:

1. **Harsh sun** is one weather id whose look follows the game's day periods. Day: the warm bright light (A), the
   shimmer (B) at 1 px, slow, moved up so it never touches the player sprite, and the vanilla lens flare slowly
   **pulsing**, not held. Evening: the orange light and the evening flare, pulsing. Night: a warm night light and
   embers, small specks with a new rising movement (up, a slight sway, fading), drawn the rain/snow way. Battle: sun
   (vanilla animation and message); Sunny Day and Drought leave harsh sun for 5 minutes, as Rain Dance and Hail leave
   theirs. Encounters: clear (no new encounter weather bit).
2. **The dry thunderstorm**: the thunderstorm's dark light and yellow flashes, no drops, sheet or rain sound, thunder
   kept; its own id. No battle weather. Encounters: the thunderstorm. The wind loop was left out: the only one among
   the weathers' sounds, 0x6e3, is the sandstorm's and blizzard's howl, played at full volume by `WeatherTask_PlaySe`
   (no volume), so it would read as a sandstorm rather than a light wind.
3. Wiring for both (ids, names, calendar, editor lists, debug menu, the roamers: Entei and Moltres harsh sun, Raikou
   and Zapdos the dry thunderstorm, the gates' board, the other weather readers).

**Built** as plugins.md's "Harsh sun and the dry thunderstorm" describes (the files, hooks, cost and tests there). What
this note's plan changed:

- **Ids** 27 and 28 after the tints, as planned; `PAPERWHITE2_CUSTOM_TINT_SLOTS` counts the tints alone now.
- **Where the code is:** the weather in overlay 75 (the particle weathers', whose speck cells the embers use), the
  shimmer and flare in overlay 36 (they need the field: its camera, 3D objects and lens flare), the dry thunderstorm in
  overlay 76's `weather_rain.c` under `PAPERWHITE2`, as section 11 planned.
- **The light (A):** `res/lighting/battle/010.json`, written once from summer's field lights (141.json) by these
  formulas (5-bit channels, rounded and clamped): day k = 0.45: r + (31 - r)·0.7k + 2k, g + (31 - g)·0.35k, b·(1 -
  0.45k) (the prototype's warm); evening: r + (31 - r)·0.6 + 2, g·0.85, b·0.5, and the day's last entry half way to it;
  night: r·1.2 + 2, g·1.05 + 0.5, b·0.75. Lights 0 and 1, diffuse and ambient take the whole change, light 2 half, the
  fog half and the clear colour 0.4 of it. The first night (k 0.25 of the day's formula) lifted the night too much
  toward dusk; the first evening (the day's formula with k 0.5) was yellow, not orange.
- **The shimmer (B):** full on lines 0-39, fading to none by line 64 (the prototype: 0-63, to 104), so the player at
  the screen's middle never moves. 1 px, a 28-line wave, a slow drift.
- **The flare (C):** measured in DeSmuME, the flare's animations start at their brightest and fade out by frame ~28
  (the top-left corner's mean brightness 160 at frame 0, 149 at 10, 137 at 20, 118 at 28 = no flare; past 30 they
  restart). So "held at its peak after ~10 frames" (section 8) was a mid strength; the pulse runs between frames 6 and
  16 (about the prototype's strength at its middle), and the weather's fades move the frame toward 28.
- **The embers (D):** the specks' 5-pixel plus and 4-pixel fleck cells (each shape a cell in each of 4 shades, drawing
  with colours 1-4), the palette's colours 1-4 replaced by (31,27,12), (31,19,5), (27,11,3), (17,6,2): the shade
  steps from dim to bright to dim over the ember's life.
- **The battle's light:** `FieldLightStatus_Get` turned out to get the battle's weather (`BTL_WEATHER_*`), not the
  field's, which the original indexes as a field weather (rain 2 takes the rain's light by coincidence); sun now takes
  file 10. Before, a battle in sun (which the field never gave) would have taken the snow's light.
- **Also found:** Sweet Scent works only in weather 0, so harsh sun is let through there too, as it is clear for
  encounters.

**Left for the user:** the look (the light's strength by period, the shimmer's lines and speed, the pulse, the embers'
number and colours are all constants or data: `paperwhite2_harsh_sun_field.c`'s and `paperwhite2_harsh_sun.c`'s
defines, `010.json`); the shimmer on the 3DS and in melonDS (per-line BG0 scroll, and the backdrop's single column at
the screen's edge on a shifted line, seen in DeSmuME as a blue pixel column at the top left).
