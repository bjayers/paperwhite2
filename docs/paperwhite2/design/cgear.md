# The C-Gear: what can change, and the limits (research, 2026-10-31)

Research for the user's C-Gear redesign, nothing changed yet. The C-Gear is complete, matching C, so every change
below is an `#ifdef PAPERWHITE2` edit of named code, not a binary patch. Not tested in game: everything here is read
from the source.

## How it is built

| Part | Where |
| --- | --- |
| The C-Gear's touch screen | `src/ov079/c_gear_sw.c` (overlay 79), loaded as the field's touch screen mode 0 (`src/ov036/field_subscreen.c`, `sFieldSubscreenDefs`) |
| Its art | `res/graphics/c_gear/` (`ARCID_C_GEAR`): BG tiles `08.png` with the screens `09`-`12.nscr` (`12` the concentric rings), palettes `04`/`05` (by gender), `06` and `07` the six color schemes of the rings and the background, `13`-`15` the lamps' and sprites' palettes; sprites: tiles `16.png` with cells and animations `17.ncer`/`18.nanr` (buttons, markers, clock) and `29`/`30`, and `19`-`28.png` the five built-in skins for each gender |
| The on/off question | `src/ov088/c_gear_power_onoff.c` (touch screen mode 9), from the power button |
| The question when a save loads | `src/ov162/startmenu.c`, `StartMenu_Continue` |
| Its saved settings | `include/save/c_gear_savedata.h`, `CGearSettings` (0x34 bytes): the ring colors, on/was on, the three markers' places (named `colors[3]`), the skin, a downloaded skin's CRC, and **0x25 unused bytes** |
| "On" | `GameData_IsCGearOn` (`GSYS_IsCGearOn`), set by the start menu's Yes or the power-on event (`src/ov012/event_cgear_poweron.c`) |

On screen, everything is a table in `c_gear_sw.c`:

- **The three native buttons are "markers"** (sprites), one each for infrared, wireless (the Xtransceiver) and online
  (Game Sync). In edit mode they drag between **42 fixed places on the rings** (`sMarkerPositions`: x, y and the
  ring, 0 the center to 4 the outermost), which the save keeps. What each starts is `sMarkerActions`.
- **The fixed buttons** are sprites with touch circles (`sActorData`, `sCGearSwButtonRects`): power (200, 180), help
  (215, 163) and edit (228, 144) at the bottom right, the survey (Research Radar, 35, 160) at the bottom left, the
  center (the C-Gear log, a box at the middle), a strip at the top over the title, which **already cycles the
  skins**, and **two circles at the top, the clock's (48, 22) and the battery's (208, 22), which can be touched but do
  nothing** (`TOUCH_CLOCK_LEFT` and `TOUCH_CLOCK_RIGHT` have no case).
- What a touch starts is `CGearSw_CheckEvent` and `CGearSw_EventMain`: one `case` per action, each making a game
  event.
- The rings' colors (six schemes each, and the background) are palettes the edit mode cycles; the skins are sprite
  tiles over them.

## The questions

**1. Can the native buttons (IR, Wireless, Online) start new actions?** Yes, and it's the easy part. Each marker's
action is one entry of `sMarkerActions`, and each action one `case` in `CGearSw_CheckEvent` and `CGearSw_EventMain`:
a new action is a new `case` that makes our event (open a hack app the way the DexNav opens, run a script, and so
on). The markers keep their dragging, their places on the rings and their saved positions. Their icons and the
lamps are sprite tiles in `16.png` (cells in `17.ncer`), so new icons are an edit of those tiles. The lamps blink by
the communication's state; without communication they'd be given steady patterns of our own (the five patterns are
code, `CGearSw_UpdatePatterns`).

**2. New buttons like the originals, in other colors, snapping to the same places?** Yes, with more work than 1.
`MARKER_COUNT` (3) sizes the actors, touch circles, lamps and the save's positions; raising it means:
- the actor and lamp arrays;
- each new marker's color, which is a lamp palette (`lampPalettes`, palette 13-15 members), so new colors are new
  palette rows;
- its icon in the sprite tiles;
- its saved place, which fits in the 0x25 unused bytes of `CGearSettings`.

They snap to the same 42 places (`CGearSw_FindMarkerPos` takes any marker). Limits:
- Sprite memory and the 42 places (the code keeps two markers from sharing one).
- The sprite cells, which need a Nitro editor (NitroPaint) or a small tool of ours, since the art converter does
  backgrounds only.
- Sprite palettes: there are 16, and the C-Gear uses some.

**3. Remove the Survey button and add buttons at the bottom left like the bottom right's?** Yes:
- **Removing it:** hide the radar sprite and drop its touch circle.
- **Adding buttons:** mirror the bottom right's, at about (56, 180), (41, 163) and (28, 144), as new sprites with
  their own animations (the bottom right's are animations 6-11, normal and pressed), touch circles and actions. Their
  art goes in `16.png` with new cells.
- **The corner's art:** the buttons are sprites over the background's corners, so the bottom left needs no background
  change unless its art should look different.

**4. Move the battery icon into the clock's circle?** Yes, as code: the battery is one sprite whose place is
`sActorData` (208, 22). Moving it is one coordinate. Whether it fits is the art's question: the clock's circle (radius
16) holds the four digits, so the battery would go beside or under them, maybe with smaller digits or a reshaped
circle in the background art (`09.nscr`).

**5. Make the right-hand circle a skin button?** Yes, and it's the easiest change: its touch circle already exists
(`TOUCH_CLOCK_RIGHT`, 208, 22, radius 16) and does nothing, so it needs one `case` that does what the title strip does
(`TOUCH_SKIN`: the next of the five skins, saved). The DS's own wireless icon there is drawn by the network library
(`GFL_NetSetIconScreen`), and it goes once the network does (7). The circle would then need an icon of its own
(sprite art).

**6. Can the screens those buttons open be repurposed?** Partly. Each is a whole app in its own overlay built around
networking, so the useful parts are their screens and menus rather than their logic:

| Button | Opens | Reuse |
| --- | --- | --- |
| Infrared | `CallIRC` → the IR battle menu (`src/ov036/ircbattlemenu.c`): a touch menu of choices | A hub menu: its list and buttons could launch our features |
| Wireless | The Xtransceiver (`src/ov198/comm_tvt_field.c`, then the video chat, overlay 257) | Little: it's built around the call and the camera |
| Online | Game Sync's menu (`src/ov199/gsync_menu.c`): three large touch buttons | A three-button menu for our apps, like the IR menu |
| Survey | The Research Radar (`src/ov310/`): a list, then a survey's bar and pie charts | A statistics screen, such as a Pokédex or encounter summary, its charts fed from game data |
| Center | The C-Gear log (`src/ov084/beacon_view*.c`, touch screen mode 4): a scrolling feed of passers-by's messages with icons | A news feed or journal: the feed's view, fed our own lines |
| Help | `src/ov200/cg_help.c`: pages of a title and text from a text bank | The easiest: an in-game manual is a new text bank (and a page list) |

For anything new, building our own app (as the DexNav is) and pointing a button at it is usually simpler than
bending these apps. The reuse that pays is the help pages and the menu screens.

**7. Skip the load-save question, always say Yes, stop checking the wireless, and work as if connected?** Yes, as four
changes, plus a sweep for features that assume a connection:
1. **The question:** `StartMenu_Continue` asks only while the save has the C-Gear on. The hack would set `cgearOff =
   FALSE` at once, with no question and no `isWirelessEnabled` check (the DSi's wireless setting).
2. **No networking:** "on" also starts the beacon search and Entralink (`GSYS_TryBootGameComm`, gated by
   `GSYS_CanBootGameComm`). The hack would make `GSYS_CanBootGameComm` return FALSE, so the C-Gear is on and nothing
   ever goes on air.
3. **No dimming:** the C-Gear dims itself while it is on and the network isn't running (`CGearSw_SetActive` →
   `CGearSw_SetCommDark`). The hack would skip that, so the screen is always lit. The lamps would get steady patterns
   instead of the wireless states.
4. **The buttons work:** touches are allowed only while "on" (`work->beacons`), which stays TRUE, so the buttons
   (ours) work; the power button would be ours too, or hidden.
5. **The sweep:** everything that reads `GSYS_IsCGearOn` and expects a connection:
   - Funfest missions (`fieldmap_event.c`'s `CheckFunfestMissionEvent`, which with the C-Gear off ends a mission);
   - the Entralink;
   - the info window's beacon messages (`infowin.c`), which simply stay empty;
   - the original IR, Xtransceiver and Game Sync apps, which go once the buttons are ours;
   - script commands that read the C-Gear's state (`scrcmd_network.c`).
   Each is kept from starting or redirected.

Before the C-Gear is obtained in the story, the touch screen stays blank as now (`CGearSettings_IsOn` is the
obtained-and-on setting); the story's own power-on event is unchanged.

## What's easy, what's art, what's hard

- **Code only:**
  - new actions on the native buttons (1);
  - the right circle as a skin button (5);
  - moving the battery (4, its coordinate);
  - removing the survey button (3);
  - skipping the question and the networking (7).
- **Needs sprite art:**
  - new icons on the native buttons;
  - the bottom-left buttons;
  - the right circle's skin icon;
  - the battery's new spot.

  Background art (the rings, the corners, the clock's circle) can go through the art converter once the C-Gear's
  screens are added as a target (`res/paperwhite2/art/targets.json`). Sprite cells and animations need a Nitro editor
  or a tool of ours.
- **More work:**
  - more markers than three (2: arrays, palettes, save bytes, cells);
  - repurposing the networked apps (6).

## To decide

- **The buttons:** what each one starts (our apps, scripts, menus), and how many markers there should be.
- **The look:**
  - the bottom-left buttons' look;
  - whether the clock's circle is redrawn to hold the battery;
  - whether the right circle gets a skin icon.
- **The skins:** the original five, our own, or both. The downloaded skin's save slot (the extra save block 4, 0x2800
  bytes) could hold one of ours.
- **The power button:** keep it as our own action, or hide it.
