# Weather in Castelia City (research)

The user wants a slim chance of rain, thunderstorms or snow in Castelia City, for atmosphere only. Forced there, the
weather looks wrong on the 3DS: roads stand out against the fog, the docks drown in it, the waterfront has none, and
there is a blue splotch in the distance. This page explains why and lists the fixes. **Verified** means read in the
code or data, or seen in DeSmuME where it says so. **Computed** means worked out from the data with the DS's depth
formula. **Inferred** means reasoned without a test.

## 1. How a weather fogs the field (verified)

- Every weather's overlay calls `WeatherTask_InitFog` / `WeatherTask_ChangeFog` / `WeatherTask_ChangeFogOffset`
  (`src/ov036/weather_task.c`). These drive `FieldFog` (`src/ov036/field_fog.c`), which writes `G3X_SetFog`,
  `G3X_SetFogColor` and `G3X_SetFogTable`. The values are **fixed numbers in depth-buffer units**, the same in every
  zone:

  | Weather | Fog shift | Fog offset | Source |
  | --- | --- | --- | --- |
  | rain, flake | 8 | `0x7f5f` | `weather_rain.c`, `weather_particles.c` |
  | thunderstorm, gusty rain, flutter | 9 | `0x7f80` | same |
  | diamond dust | 8 | `0x7f57` | `weather_particles.c` |
  | blizzard | 4 | `0x7b18` | same |
  | sandstorm | 8 | `0x7f5e` | `weather_sandstorm.c` |
  | sunny | the zone's own fog file, if it has one | | `weather_sunny.c`, `field_zonefog.c` |

  The density table is always the default linear ramp (`FieldFog_SetDefaultTable`, 0 to 127 over 32 entries), and
  alpha is 31. Every weather with precipitation fogs. **No weather is free of fog**, so choosing different weathers
  doesn't help.
- **The fog's color and the clear color** come from the weather's light file (`FieldLight_FlushCore`:
  `materials[4]` is the fog color, `materials[5]` goes to `G3X_SetClearColor` with rear-plane fog **off**). The light
  files are `res/lighting/battle/007.json` for rain and `006.json` for the thunderstorm (`sWeatherLightIds`). These
  colors are the same in every zone.
- **Depth depends on the camera.** Each zone's camera (`res/field/zones/<zone>.json` `"camera"` →
  `res/field/cameras/defaults.json`) sets near, far, distance (`zoom`) and **Z- or W-buffering** (`swap_mode`,
  applied in `FieldCamera_CoordsLoadDefaults`). A fixed fog offset therefore sits at a different distance for each
  camera. Nothing in the weather code looks at the zone or the camera.
- **Opting out:** a material's polygon attribute has a fog-enable bit (bit 15). Polygons without it are never fogged.
  The game doesn't change the bit on map models: only the emotion bubble and the Driftveil gym call
  `NNS_G3dMdlSetMdlFogEnableFlag`. Castelia has no zone fog entry (archive 80, file 29: verified), so in vanilla its
  fog flags never mattered.

## 2. Castelia's zones and cameras (verified)

Every camera below is used **only** by Castelia zones.

| Zone | What it is (from its warps) | Camera | Buffer | Near | Far | Distance |
| --- | --- | --- | --- | --- | --- | --- |
| `castelia_city` | the curved waterfront (bridge gate, piers, the street ends; the fly spot), a rail map with a circle camera area | 2 | **W** | **100** | 2144 | 789 (909 on its rail) |
| `castelia_city_2` | Central Plaza (the streets' north ends) | 7 | Z | 5 | 1026 | 486 |
| `castelia_city_3`, `_6` | streets | 8, 14 | Z | 1 | 1536 | 348, 396 |
| `castelia_city_4`, `_5`, `_7` | streets | 13, 15, 6 | Z | 1 | 1536 | 236, 217, 158 |
| `castelia_city_8`–`_12` | the piers | 25 | Z | 1 | 1024 | 379 |
| a normal town, for comparison | | 0 | Z | 1 | 1024 | 237 |

## 3. Why each symptom happens

**Too much fog on the far-camera streets and the piers (computed).** The Z-buffer is nonlinear, so the fixed offset
starts the fog about 170–220 units from the camera whatever the camera's distance. In a normal town the player
stands at 237, inside the ramp: about 42% rain fog, or 32% thunderstorm fog. Castelia's cameras sit farther away:

| Camera | Rain fog at the player | Thunderstorm fog at the player |
| --- | --- | --- |
| normal town | 42% | 32% |
| piers (379) | 82% | **100%** |
| `castelia_city_6` (396) | 77% | **100%** |
| `castelia_city_3` (348) | 68% | 85% |
| `castelia_city_4` / `_5` / `_7` | 33% / 24% / 0% | 15% / 0% / 0% |
| plaza (486, near 5) | 0% (fog starts at 514) | 0% (fog starts at 573) |

These numbers match the user's photos: the piers and some streets wash out, while other streets look decent.

**Roads and benches unfogged (verified in the data, seen in DeSmuME).** Castelia's map models have many materials with
the fog bit off (dumped from the original `a/0/0/8`, polygon attribute bit 15):
- streets `castelia_city_3`/`_4`/`_6`/`_7` and their `_01` chunks: `c3_road1` (pale tiles), `c3_yuka`,
  `c3bay_yuka1`, `c3_test_1`, `c3_tree3` (bright green trees), `gra_w*`, `h_mado_1`, `c3_manhole`, `c3_g_dust2`
- piers `_8`–`_11`: **`bench`**, `sea_mizu1_1` (translucent water, alpha 16), `h_kage`
- waterfront chunk `c3_00_01`: `building4_2`; also `castelia_city_31`/`_32`

  With fog on, these polygons keep their full color while everything around them goes grey. In DeSmuME, Castelia
  street 3 with a thunderstorm shows the pink sidewalk tiles and the green planters unfogged, and the same frame with
  the fog bit of `DISP3DCNT` cleared confirms it. The "blocky" look is inferred to be the same thing: fogged and
  unfogged polygons side by side on one surface. Few other places have fog-off materials, and those are mostly
  interiors.

**The waterfront has no fog (inferred; DeSmuME disagrees).** Camera 2 is the only Castelia camera that uses
W-buffering. With W-buffering, the depth the fog compares is the linear w value, about `8 × distance` in its top 15
bits (GBATEK's formula). The weather offsets near `0x7f80` would only be reached about 4000 units away, past the far
plane (2144), so the hardware never fogs anything. That matches the 3DS photo. DeSmuME renders the same scene almost
entirely fogged, and clearing the fog bit there brings it back (seen). So **DeSmuME's W-buffer fog isn't
representative: test the waterfront on hardware or melonDS.**

**Sparser thunderstorm on the waterfront (verified data, computed clipping).** The thunderstorm's dense rain sheet is a
3D quad (`Field3DBG`, `WEATHER_BG_SETUPS` in `weather.c`) drawn **80 and 88 units** in front of the camera. Camera 2's
near plane is **100**, so the quad lies in front of it and is clipped away: only the OBJ drops are left. DeSmuME agrees:
the streets show the fine diagonal sheet and the waterfront doesn't. The OBJ drop count also varies over time
(`sThunderSpeedScale`), which is weather-wide.

**Blue splotch (verified colors, inferred cause).** In the daytime periods of rain's light file `007.json`, the clear
color is sky blue `(16,24,30)` while the fog is grey `(20,20,20)`. The clear color has rear-plane fog off. So
wherever the camera sees no polygon (past the end of a street's one- or two-chunk map, which the 1536 far plane
reaches), the screen shows unfogged sky blue against the grey. The thunderstorm's light (`006.json`) has the clear
color equal to the fog color, so this only happens in rain. A second possible source is the pale-blue `c3_road1` tiles
seen unfogged in the distance.

## 4. Can Castelia have weather that looks right without changing other places?

Yes. Everything wrong is either Castelia's own data (cameras used only by it, its map models) or can be keyed by zone.
The options, cheapest first:

| # | Option | What it fixes | Effort | Risk |
| --- | --- | --- | --- | --- |
| A | **Fog off in Castelia zones**: a hack table of zones checked in `WeatherTask_InitFog` / `ChangeFog` / `ChangeFogOffset` (all weathers go through these three), which keeps the fog disabled there | far-camera wash-out, unfogged roads and benches, the splotch's contrast (rain without fog); the light still dims | small: one hook in `weather_task.c` and a table in `src/paperwhite2/ov036/` | low: only listed zones change. The weather's light fade still runs |
| B | **Per-zone fog profile** in the same hook: a shift and offset per zone (or per camera) instead of "off", so the fog sits where a normal town's does relative to the player. Suggested values are below | as A, but keeps the misty look | small (A plus numbers) | low. The waterfront's W-buffer values need a hardware test |
| C | **Fog bit on for Castelia's fog-off materials** (list in section 3) | unfogged roads, trees, benches and sea under B | medium: `tools/data/map_model_data.py` doesn't expose bit 15 yet (it writes only color, alpha and double-sided); add a GLB material extra or a `data.json` list, then mark about 15 materials across about 20 chunks | low in sunny weather (Castelia has no fog then). The translucent sea and `gra_w` glows may want to stay unfogged: check each |
| D | **Rear-plane fog or a clear color equal to the fog color while weather fog is on**, for the listed zones (hook `G3X_SetClearColor` in `FieldLight_FlushCore`) | blue splotch in rain | small | low. Doing it everywhere would also grey the sky gaps on routes, so keep it per zone |
| E | **Draw the weather's 3D sheet past the near plane**: in `Field3DBG_DrawBillboard`, use `max(distance, near + 8)` (the quad scales with its distance, so it still fills the screen) | sparse thunderstorm, gusty rain, sandstorm and blizzard sheets on the waterfront | tiny | low: changes only cameras with near > 80, which are camera 2 (Castelia waterfront) and camera 35 (Entree Forest, whose tint weathers don't use the sheet, inferred). It could also be limited to the zone table |
| F | Camera data (`res/field/cameras/defaults.json`; Castelia's cameras are its own): shorter distances or Z-buffer on camera 2 | partly the wash-out | data only | changes how Castelia looks in every weather, and Z-buffering the waterfront may bring Z-fighting. Not recommended |
| G | A separate "rain without fog" weather ID | as A | medium: new weather values, groups, battle mapping and editor entries | more moving parts than A for the same result |
| — | Using only weathers that don't fog | — | — | not possible: every precipitation weather fogs |

**Recommendation:** A (or B) with E and D, data-free and keyed to Castelia's exterior zones (`castelia_city`,
`_2`–`_12`, `_31`, `_32`). Add C later if the user wants the fog look (B) rather than clear rain. Then add the zones
to the weather calendar (`res/field/weather_calendar/`, a few dates per season). Castelia's zones change by warp, which
restarts the field and its weather, so per-zone values take effect at each zone change (inferred from the events; a
seamless zone change keeps the running weather's fog).

### Suggested profile values (B; computed)

These keep a normal town's ramp relative to the camera target: rain starting 66 units before the target and full 275
units past it; thunderstorm starting 31 before and full 108 past. The format is fog shift / offset.

| Zone(s) | Rain, flake | Thunderstorm, flutter |
| --- | --- | --- |
| `castelia_city` (W; assumes depth = 8 × w, test on hardware) | 4 / `0x1a58` | 5 / `0x1b70` |
| `castelia_city_2` | 8 / `0x7f17` | 9 / `0x7f35` |
| `castelia_city_3` | 9 / `0x7fa0` | 10 / `0x7fac` |
| `castelia_city_4` | 8 / `0x7f53` | 9 / `0x7f74` |
| `castelia_city_5` | 8 / `0x7f3b` | 9 / `0x7f64` |
| `castelia_city_6` | 9 / `0x7fb0` | 10 / `0x7fba` |
| `castelia_city_7` | 7 / `0x7eaf` | 8 / `0x7f12` |
| piers `_8`–`_12` | 9 / `0x7fb6` | 10 / `0x7fc0` |

The far cameras leave little Z precision: shift 10 means one depth unit per table entry. A lighter fog is a larger
offset.

## 5. Testing notes

- DeSmuME: the debug menu's World → Weather takes effect at the next zone change; Player → Warp to zone reaches only
  `castelia_city` (the only Castelia zone with a fly spot; the debug Info shows it as zone 29). Clearing bit 7 of
  `DISP3DCNT` (0x04000060) each frame shows the scene without fog, and clearing bit 8 of `DISPCNT` shows the OBJ drops
  alone.
- The waterfront's fog must be judged on hardware or melonDS (section 3).

## As built (2026-11-10)

The user chose C, D and E, and for the fog, fog relative to the player in place of B. Details, values and tests:
`docs/paperwhite2/plugins.md`, "Weather".

- **Fog relative to the player** (instead of B): a falling weather's fog shift and offset are mapped at each flush from
  a normal town's camera to the current one, so the density at the camera's target (the player) is a normal town's
  (rain 41%, thunderstorm 31%) and the ramp around it about as long. It reads the camera every frame, so rails, camera
  areas and zone changes are covered, and a normal town's camera keeps the original's values exactly. The Z-buffer
  values it gives have the B table's shifts and offsets near its (it keeps the density at the target, where B kept
  fixed start and end distances). The plaza now fogs (it had none), and Route 4's camera area by the gate keeps a normal town's sandstorm
  as the camera pulls back. The waterfront's W-buffer values (shift 4 / 5, offsets near `0x1300`-`0x1770`) rest on
  depth = 8 x distance and need a hardware or melonDS check.
- **C**: `material_fog` in the map models' `data.json` (a new packer field) turns the fog on for the roads, floor
  tiles, trees, manholes, dust, benches, shadows and the waterfront's `building4_2`; the sea, `gra_w*` and `h_mado_1`
  stay unfogged.
- **D**: rear-plane fog on the clear colour in Castelia's outdoor zones, which equals the fog's colour wherever the fog
  is full at the far plane (every weather's ramp here) and does nothing without fog.
- **E**: the sheets move past the near plane by its distance where they'd lie in front of it (waterfront and Entree
  Forest only).
- After the 3DS test (normal routes right): the blue skyline and the blue gradients at the streets' ends were
  Castelia's light 2, the sky's light in its own light file, taking the weather light file's blue: it is the fog's
  colour now while the fog is on. The bright gate was two unlit materials, lit by light 0 now. A shop doorway's
  `h_mado_1` had the fog off. The waterfront's fog is 6 steps thicker (a tunable constant), as the 3DS showed it a bit
  far; whether the W-buffer's depth is really 8 a unit stays for the 3DS to tell.
- Not done yet: adding Castelia to the weather calendar.
