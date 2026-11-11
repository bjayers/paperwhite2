# Street chatter: Castelia's passer-by balloons

Research note (2026-11-10), then what was done (the last section). It covers where the short balloon lines
("Wooooo!", "Huh?") come from, the code that shows them, and how to edit them or add more. The tables below describe
the original game; the hack's values are in "Done".

## The lines

- Bank: `res/text/script/global_10350.txt` (`SCRIPT_TEXT_GLOBAL_10350`). It holds one message per line, and a
  message's ID is its 0-based line index. The last line, `\pad{7e}`, isn't a message.
- Indices 0-26 (lines 1-27) are what the walkers say when you talk to them, in a normal message box. Global scripts
  10350-10377 show them by name (`res/field/scripts/global_10350.s`), and `Zowieee!` at index 27 is one of these
  too (`global_10350.s:281`).
- **Balloon set A, indices 28-47 (lines 29-48):** from `Wooooo!` to `What?`, 20 lines. The three Castelia street
  zones use it.
- **Balloon set B, indices 48-57 (lines 49-58):** from `10Q!` to `Wahaha!`, 10 lines. Only Tubeline Bridge's entry
  uses it, and no W2 script starts a crowd there (below).
- The hack ROM's archive 183 and this bank are the same as the clean ones (`cmp` and `git diff w2-original`).

## The code: overlay 121, `src/ov121/castelia_rush.c`

- Started by script command 0x134 `CasteliaRushInit` (`src/ov036/scrcmd_misc.c:88`), which adds
  `CASTELIA_RUSH_PROC_DEF`. Scripts 2 and 3 of `castelia_city_4.s`, `castelia_city_5.s` and `castelia_city_6.s`
  call it (`castelia_city_4.s:16,20`).
- Per-zone config: archive 183 (`ARCID_CASTELIA_RUSH`, `castelia_rush.c:21`). File 5 is the zone list. Files 0-4
  are one 0x32-byte `CasteliaRushConfig` per zone (struct at `castelia_rush.c:65-84`), read by
  `CasteliaRushConfig_Load` (`:431-455`). File 6 is `CasteliaRushScripts`: 6 talk scripts per object code, picked
  with `rand % 6` (`:317-323`).
- The pick: `CasteliaRushBalloons_Init` loads bank 10350 (`:695`). `CasteliaRushBalloons_Update` (`:722-745`)
  shows a balloon every `rand % intervals[dayPeriod] + 16` frames, at the next of 16 fixed spots (`sBalloonX`/`sBalloonY`,
  `:178-179`). `CasteliaRushBalloon_Show` (`:755-763`) prints message **`msgBase + rand % msgCount`**, so the pick is
  uniformly random over a contiguous range. It doesn't depend on the NPC or the time of day; only the zone matters.
  A balloon stays up for 16 frames (`BALLOON_FRAMES`, `:32`). Bringing up a field event clears the balloons
  (`src/ov036/fieldmap_event.c:462-464`).
- Archive 183 contents in W2 (`msgBase` is byte 0x16 and `msgCount` byte 0x17 of each config file):

| File | Zone | Object codes | msgBase | msgCount |
| --- | --- | --- | --- | --- |
| 0 | 34 `ZONE_CASTELIA_CITY_6` (has Game Freak's building: Castelia Street) | clerk M, clerk F, gentleman | 28 | 20 |
| 1 | 32 `ZONE_CASTELIA_CITY_4` | clerk M, clerk F, worker | 28 | 20 |
| 2 | 33 `ZONE_CASTELIA_CITY_5` (Casteliacone stand: Mode Street) | clerk M, clerk F | 28 | 20 |
| 3 | 254 `ZONE_TUBELINE_BRIDGE` | biker | 48 | 10 |
| 4 | 0 (terminator, all zero) | | | |

  The three Castelia streets share one set. Tubeline Bridge's biker set (shorter talk scripts, step 2) has data,
  but no W2 script calls `CasteliaRushInit` there. Join Avenue's balloon-like lines (`global_10685.txt`, which also
  has a `Wooooo!`) belong to the resort code (`src/ov059/scrcmd_resort.c`, `src/ov060/scrcmd_resort_shop.c`), not
  this system. Driftveil has none.

## Editing and adding lines

- **Edit a line:** change its text in `global_10350.txt` at indices 28-47. That's data only. The editor's Text
  panel (`editor/src/modules/text/`) opens and saves `res/text/script` banks, so the user can already edit these
  lines there. The panel edits existing messages but doesn't appear to add new ones.
- **Add lines:** insert them right after `Global10350_Text_What = What?` (index 47), each with a unique ID, so set A
  stays contiguous. That pushes set B to later indices. Its only user is the unused Tubeline entry, so if it matters,
  also raise that entry's `msgBase`. Talk scripts refer to messages by name, so inserting is safe. Then raise
  `msgCount` from 20 for zones 32-34. That count lives in archive 183, which no packer in `res/` covers (it comes
  from the base ROM), so there are two ways:
  1. **Code (small):** an `#ifdef PAPERWHITE2` in `CasteliaRushConfig_Load` after `GFL_ArcToolReadRange`, with a
     `// Paper White 2:` comment, sets `msgCount` (and, if wanted, a per-street `msgBase`) from a hack table keyed
     by zone. It needs a hack build with `orig/bios7.bin` and `verify_dsi_rom.py`.
  2. **Data:** a new packer for a/1/8/3 (`res/field/castelia_rush/*.json`) added to `DATA_PACKS` in
     `configure.py`. This is more work, but it would let the editor show crowds, lanes, intervals and line ranges.
- Per-street sets are possible: give each zone its own `msgBase`/`msgCount` range in the bank.
- **Limits:**
  - `msgBase` and `msgCount` are u8, so indices stay at or below 255.
  - `msgCount` must not be 0, because it is used as a modulus.
  - The balloon is a fixed 8 x 2 tile window (`castelia_rush.c:761-762`, `MsgBGPrinter_AddSubMsgWinMsg` in
    `src/ov036/field_msgbg.c:1484`). It doesn't grow to fit the text, so keep a line short and on one line, like
    the originals (11 characters at most, "Is that so?"). Test longer lines in game.
  - The string buffer holds 0x40 characters (`MSGBG_NUMBERED_STRBUF_LEN`, `field_msgbg.c:71`).
  - The text uses the normal field font and the bank's usual character set and control codes.

## Done (2026-11-10)

- **The data:** `res/field/castelia_rush/` holds archive 183 (`tools/data/castelia_rush_data.py`, in `DATA_PACKS`):
  a file per crowd zone named after its `ZONE_` constant (`crowd.schema.json`: the intervals by day period, lanes,
  object codes, `msg_base`/`msg_count`, `step_frames`; the fields no code reads stay as `unk_a` and `unk19`),
  `order.json` (the files' order), and `talk_scripts.json` (file 6). The packer appends the all-zero entry for zone 0
  that ends the list. The dumped data packs byte for byte the same as the ROM's archive (checked by the matching
  build's `check_file`).
- **The range:** the three streets and Tubeline Bridge have `msg_base` 28 and `msg_count` 228, messages 28 to 255.
  `global_10350.txt` has empty messages 58 to 255 (`Global10350_Text_Empty_3` to `_200`) to fill in. The biker lines
  48 to 57 are now in the streets' range too; blank them (or overwrite them) if they don't suit the streets.
- **The pick:** under `PAPERWHITE2`, `CasteliaRushBalloons_FindLines` lists the range's non-empty messages when the
  crowd starts (a message past the bank's end loads as empty), and `CasteliaRushBalloon_Show` picks uniformly among
  them; with none, no balloon shows. It costs 258 bytes of the crowd's work and reads up to 228 messages once.
- **How long a line can be:** the balloon is 8 x 2 tiles, one line of the field font (font 0 of a/0/2/3) in 64 pixels.
  Summing the font's advances: "Is that so?" is 62 pixels, the longest original; "One, two..." 60, "I love you!" 59,
  "What's up?" 57, "Wooooo!" 41. So about 11 characters of average letters; wide letters (W is 6 pixels, "WWWWWWWW" 48)
  take fewer, and a line of "i" more. Keep a line at or under 62 pixels to be safe; the text isn't wrapped or
  shrunk, so a longer one is cut off. This wasn't checked in game: the emulator save available isn't near the
  streets, and the debug warp needs a zone with a fly spot.
- **The editor:** the Text panel adds a message after the bank's last one ("Add line", an empty
  `<Bank>_Text_Empty_N` message) and removes the last one ("Remove last line") when no script, data file or code names
  its ID. It never inserts in the middle: scripts and code that name a message by its ID would follow it (the IDs'
  header is rebuilt), but data and code that give messages by number, such as this range, would not, and no search
  can find those for certain.
