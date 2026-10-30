# Paper White 2 research notes

Findings from reading the code, for features not built yet. Each says what was verified and what wasn't.

## Boot and title graphics (2026-10-29)

PNGs are 8-bit indexed with 256-entry JASC palettes; keep each palette's order when redrawing (docs/data.md, "2D
graphics").

| Stage | Source | Kind | Loader |
| --- | --- | --- | --- |
| Copyright and logo screens | `res/graphics/copyright/` (`ARCID_COPYRIGHT` 162): `01.png` 256×24, `03.png` 256×32, `05.png` and `07.png` 256×256 | 2D BG, PNG | `src/ov162/boot_screens.c` |
| Boot extra BG | `res/graphics/title/12.png` 256×32 (`ARCID_TITLE` 26) | 2D BG, PNG | `boot_screens.c` |
| Title screen | `res/graphics/title/`: `05.png` 32×40, `09.png` 192×16, `12.png`; the logo is `white2/00.png` (and `black2/00.png`) 256×128 | 2D BG and OBJ, PNG | `src/ov162/title.c` |
| Title screen's Kyurem | `ARCID_DEMO3D_RESOURCE` 158, members 454–460 for White 2 | 3D models and animations | `title.c` (`sResources`) |
| Game Freak logo | `res/demo/cdemo_gflogo/` (`ARCID_CDEMO_GFLOGO` 220): 152 frames, 256×256 RGBA PNG | bitmap movie | `src/ov264/cdemo_control.c` |
| Opening movie | `res/demo/cdemo_openingsw/` (`ARCID_CDEMO_OPENINGSW` 222): 626 frames | bitmap movie | `cdemo_control.c` |
| New-game intro | `res/graphics/intro/` (`ARCID_INTRO` 168): `05.png` 256×192, `professor.png` 256×128 and more; `22/23.nsbmd` are 3D | 2D, plus some 3D | `src/ov294/intro*.c` |
| Credits | `res/graphics/the_end/` (`ARCID_THE_END` 215): about 85 members, mostly 256×192 BGs; the credit text is in the system messages | 2D, PNG | `src/ov266/staff_roll_main.c`, `src/ov267/the_end.c` |

Which PNG holds which company logo isn't mapped; look at the images.

## Wild triple battles (2026-10-29)

Verdict: **medium**. The engine's triple support is generic and nothing forbids a wild triple.

- Wild setup: `FieldEncount_SetupNormal` (`src/ov036/field_encount.c`) makes `doubleBattle + 1` Pokémon from
  `src/ov036/enc_pokeset.c` (`WildPkmParam params[2]`) and calls `BtlSetup_SetWildNormal` (`src/system/btl_setup.c`),
  whose `battleStyle` is a plain field: set it to `BTL_STYLE_TRIPLE`.
- The battle's triple setup (`BtlMain_SetupAloneTriple`, `src/ov167/btl_main.c`) depends only on the style; the wild
  party copy, catching (`ThrowBall`), experience and running work by battle type, not style; the battle views and
  the wild messages handle triples.
- Needs care:
  - `GetClientAIFlags` gives wild battles AI flags 0x80 only in doubles; add a triple case if wanted.
  - A player party of fewer than 3 Pokémon: needs a guard that falls back to a double or a single.
  - The "Wild X and Y appeared!" text needs a three-name version.
  - The intro camera with three wild foes is untested.
  - Other double-only paths, such as the follower-ally multi setup, must not be taken.
- Not read: the escape chance, the dark-grass capture modifier, the AI scripts in `src/ov170/tr_ai.c`.

## Follower shiny palettes and shiny icons (2026-10-29)

- Shiny Zekrom's follower palette (`res/field/actors/followers/zekrom_shiny/sprite.pal`) is wrong: same index map as
  the normal sheet, but a recolour (tan and brown, pink key colour) instead of the teal-grey shiny. It is the same
  in Pokeweb's own `src/assets/following/gen5-followers.narc`, so there is no corrected upstream set.
- Of the followers, 348 have their own sheets (174 normal and shiny pairs); the others reuse the original walking
  sprites. Follower palettes are their own 16-colour quantisations and share no index order with the battle
  sprites' palettes, so they can't be swapped in directly.
- A data-only fix works: for each follower colour, find the nearest battle-normal colour, add the battle sprite's
  shiny minus normal difference, keep index 0 and black and white. Zekrom regenerated that way looks right (teal-grey
  body, green accents). Scripts: the scratchpad's `research2/r.py` and `h.py` (not committed).
- Suspects by comparing each follower's average shiny shift with its battle sprite's: kyurem_form_2, zekrom, kyurem,
  frillish (and female), jellicent_female, thundurus (and form 1), tornadus, darmanitan_form_1, reshiram, swoobat,
  venipede, landorus (both forms), samurott, deerling_form_3; then munna, deino, druddigon, tornadus_form_1,
  kyurem_form_1, cubchoo, krokorok, accelgor, cottonee, deerling_form_1, emboar. 51 pairs change the key colour too.
- Shiny party and box icons: the game has none. Icons use three shared 16-colour palettes chosen per species
  (`sPokeIconPalettes` in `src/system/poke_icon.c`). Showing shinies needs a shiny icon palette per species (about
  21 KB, derivable from the battle sprites' shiny shift) and, on each screen, a spare OBJ palette slot per visible
  shiny. Moderate for the party, the box and the in-battle party (`src/ov165/plist_plate.c`, `src/ov255/box2_obj.c`,
  `src/ov165/plist_battle.c`); about 35 overlays use icons in all.

## Event flags (2026-10-29)

`python3 tools/paperwhite2/flag_usage.py --csv flags.csv [--user-list list.csv]` lists every event flag with a
status (`used`, `range`, `indirect-candidate`, `unused`), its region, and where it is referenced.

**The flag space** (`include/save/event_work.h`, `src/system/event_work.c`): flag 0 means none. 3064 saved flags,
0x1–0xbf7 (0x17f bytes), then 64 temporary ones, 0x4000–0x403f, which the save doesn't keep. Inside the saved ones:
0x1–0x63 are cleared on every map change (`FieldScript_ResetMapLocalEvents`), the trainers' defeated flags are
0x5f0 + trainer ID (0x5f1–0x91d for the 813 trainers), 0xaa0–0xb03 are cleared daily (`EventWork_ResetDailyFlags`),
and the hidden items' are 0xb04 + `HIDDEN_ITEMS[].index` (0xb04–0xbd8, 213 items). A script can't name a temporary
flag: the VM reads 0x4000–0xbfff as a variable (`ScriptWork_GetWkAddr`).

**Method.** References come from: every script argument whose meaning in `tools/script/field_commands.json` is a
flag or a trainer; the zone events' `flag` fields; every `EVENT_FLAG_` name in res/, generated/, src/, include/ and
lib/; C calls of `EventWork_FlagGet/Set/Reset`, of the trainer flag functions and of their wrappers (found
automatically) with constant arguments; the C tables that hold flags (medals, BGM, Entralink, habitat, respawn);
the trainer NPCs (script 3000 + trainer); and three ROM archives the build packs unchanged: the Funfest missions
(0x121), the stadium trainers (0xce) and the gate boards (0xa4). A flag in a variable is resolved by running each
script in order with the set of values each variable can hold (WorkSet, WorkAdd, WorkMul, Random, RTCGetSeason,
loops), and a global script's parameters from the WorkSets before each RTCallGlobal of it. Every C call with a
non-constant argument must be in the tool's list of accounted sites, or it is reported as unresolved.

**Results** (the hack as of this date):

| Status | Flags |
| --- | --- |
| used | 2233 |
| range | 287: 253 trainer flags no code reads or sets, and 34 flags only a computed script range reaches |
| indirect-candidate | 0 (every variable reference resolved) |
| unused | 607 |

Unused: 0x2–0xe, 0x11–0x63 (map-local), 0x6b–0x6c, 0x71, 0x77, 0x7d–0x82, 0x86, 0x90, 0xd0, 0xd4, 0xd9, 0xdf–0xe0,
0xeb, 0xed–0xee, 0xf5, 0xfe–0xff, 0x118, 0x11b–0x11f, 0x129, 0x13b–0x13d, 0x153–0x154, 0x158, 0x15b, 0x160, 0x188,
0x18b, 0x1a2–0x1a3, 0x1a6–0x1a8, 0x1b7–0x1b9, 0x1dc–0x1df, 0x1f2–0x1f3, 0x258–0x25b, 0x25e, 0x268–0x26c,
0x278–0x27b, 0x291–0x293, 0x29e, 0x2a0–0x2a5, 0x2ba, 0x2bc, 0x2c0–0x2c1, 0x2c5, 0x2eb, 0x32c–0x32d, 0x330–0x333,
0x365–0x366, 0x36d, 0x389–0x38a, 0x3de, 0x400–0x401, 0x41c–0x44b, 0x450, 0x453, 0x5cc–0x5f0, 0x91e–0x92e,
0x930–0x95f, 0x96c, 0x976–0x97c, 0x980–0x984, 0x98b, 0x98e, 0x9a3–0x9a4, 0xa01–0xa4f, 0xa80–0xa9f, 0xaa1–0xaa9,
0xaad–0xaae, 0xab0–0xab1, 0xab6–0xab7, 0xada, 0xaea–0xaee, 0xaf1–0xb02 (daily), 0xbda–0xbf7, and all 64 temporary
flags. Map-local and daily flags are cleared by the game, so they only suit flags meant to be cleared that way.

The trainer flags no code reads or sets (the trainer is no trainer NPC, stadium trainer or `TrainerFlag*`
argument) are free in practice; 124 of them belong to trainers that a script battles with `CallTrainerBattle`,
which doesn't touch the flag. The CSV's `where` column says which.

**The unused-flags list** (233 flags) checked against it: 0x1f4–0x257, 0x41b, 0x92f and 0xbd9 are used now, as
expected (the seasonal spawns, Keldeo, the Exp. Share and the debug toggle; 22 of the seasonal ones only through
`global_10850.s`'s computed loops, so they show as `range`). 0x754–0x757 are trainer flags
(Team Plasma Grunt 3, Game Freak Nishino, Colress, Team Plasma Grunt 4) that no code reads or sets; 0x755–0x757's
trainers are battled by scripts, without the flag. Every other flag on the list is unused. 481 unused flags aren't
on the list, the largest runs being 0x2–0x63, 0x5cc–0x5ef, 0x91e–0x92e, 0xa01–0xa4f and 0xa80–0xa9f.

**Limits.** The resolution of script variables is per file and flow-approximate: a subroutine reached with a
variable its callers set gets every constant the file gives that variable. 45 trainer arguments come from
variables the tool can't follow (the trainer NPC scripts in `global_3000.s`, `Cmd_0220` in `global_10510.s`); they
stay inside the trainer range, but a trainer reached only that way would wrongly show as never read. The list of
accounted C sites and tables is hand-made from the code at this date: a new data-driven flag access in C shows up
as unresolved, but a new table holding flags only does once it is listed. The archives are read from
`extract/w2_us`, the original game's; if the hack replaces one, the tool must read the replacement. Code outside
src/ and lib/ (none known: every file is decompiled) isn't read.
