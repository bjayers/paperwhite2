# Follower sheets re-indexed onto the battle palettes

Sections 1-8: the experiment (2026-11-22). **Section 9: what was built from it the same day** (method F as a tool,
every overworld Pokémon sheet re-indexed, the battle palettes the only source of colour). The experiment's question: can every following-Pokémon overworld sheet be
re-indexed onto its species'/form's battle `normal.pal`, so that `normal.pal`/`shiny.pal` are the followers' only
colours (shiny for every follower, no follower palettes or `_shiny` sheets), and with which mapping method?
Background: [shiny-palettes.md](shiny-palettes.md) sections 1.3, 2 and 4.2.

**Sheets for the user**, in `C:\Modding\Pokemon ROM Hack Workspace\Pokemon Paper White\remap2\` (copies of the
scratchpad files in `/tmp/claude-1000/-home-riku-paperwhite2/ed33b65d-513a-5b30-a72b-6382677189d9/scratchpad/remap2/`):

| file | what it shows |
| --- | --- |
| `key_examples_F.png` | **latest (method F, section 8).** Columns: original \| A \| E \| E shiny \| F \| F shiny \| hand-made shiny \| battle \| battle shiny. Same 20 Pokémon, with reshiram, dipplin and krokorok first |
| `anomalies_F.png` | the 16 sheets where F still has a flagged outline pixel, worst first, with E's and F's counts under each row |
| `contact_F_worst.png`, `contact_F_random.png` | F's 30 worst (E's score plus F's outline anomalies) and 30 random, in F's column layout; the `.txt` files list the rows |
| `key_examples_E.png` | **start here.** Columns: original \| A \| D \| D shiny \| E \| E shiny \| hand-made shiny \| battle \| battle shiny, labelled, at 3x. Rows: charmeleon, zekrom, vulpix, gothita, zorua, reshiram, ludicolo, jynx, dipplin, sableye, patrat, snivy, togetic, krokorok, miltank, pikachu, gyarados, gengar, lucario, chandelure |
| `key_examples.png` | the first round's sheet (A, B, C, C shiny, D), for comparison |
| `problems_E.png` | sheets that no mapping fixes or that still need a look, same columns, a note under each row |
| `contact_E_worst.png`, `contact_E_random.png` | E's 30 worst and 30 random (seed 7); the `.txt` files list the rows |

## 1. Set-up

- **Jobs.** The 2604 follower rows resolve to 744 distinct sheets: 174 own sheets (`followers/<name>/`) and 570
  walking sprites (`field/actors/pokemon/<name>/`). The hand-made `_shiny` sheets are kept only for comparison.
  Female rows, shiny rows and most forms reuse a sheet, so there are 755 (sheet, battle group) jobs, not ~990.
- **Battle colours.** Two sets:
  - Colours used by the assembled frames (`front_single`, `back_single`, and their `_female` versions), which also
    give the outlines and the adjacency.
  - Colours used only by the part sheets (`front.png`, `back.png`). These are animation parts such as Reshiram's
    tail flames (indices 10-14), or leftovers such as the pink in Unfezant's female parts.

  A sheet used only by female rows takes the female art, and a sheet used by both sexes takes both.
- **Colour space.** OKLab ×100 with 1% black flare (the screen's black level; without it, (0,0,0) and (8,8,8)
  measure 13 apart). Assignment costs weight lightness ×1.5.
- **Battle shiny palettes.** Run on the restored original Reshiram and Zekrom `shiny.pal` (commit `4f0711016e`).
- **Scripts and data** in the scratchpad folder: `survey.py`, `core.py` (A-D and the metrics), `emethod.py` (E),
  `run.py`, `keysheet2.py`, `sheet.py`, `formcheck.py`; per-job maps and metrics in `results.json`.

## 2. Methods

| | what it does |
| --- | --- |
| **A** | Each follower colour goes to the nearest battle colour in RGB. |
| **B** | Identical colours merged, then a Hungarian assignment in OKLab gives one-to-one targets (reused only when the follower has more colours). |
| **C** | B plus hue ramps matched ramp to ramp, shades ordered by lightness rank, the outline anchor (outline colours to battle outline colours), merging the closest and least adjacent pair when there are too many colours, and only used battle colours. |
| **D** | C, then a local search on one score: shift, lightness flips, contrast collapse, an outline getting lighter, and a price of 10 per extra merge. Hard limit: at most 8 dE beyond the nearest colour. |
| **E** | D plus the four rules below, and the part-sheet colours as extra targets. |

E's rules, hard unless noted:

1. **Neutrals stay neutral.** A low-chroma follower colour (white, grey, black; chroma under 4) may only go to a
   battle colour with chroma under 7, when one lies within 12 dE of its nearest. Among those, a difference in tint
   (a, b) is weighted ×2 (soft).
2. **Coloured shades stay coloured** (soft). A chromatic colour pays for losing chroma, and pays for a hue change in
   proportion to the hue difference times its chroma.
3. **Accents keep their hue.** An accent is a high-chroma (10 or more), non-outline colour whose whole hue family
   covers 8% of the sprite or less: flames, eyes, gems, markings. It may only go to a battle colour within 35° of
   its hue, when the battle sprite has one. It may not merge into a non-accent colour (soft, 200). Any non-outline
   colour with chroma 15 or more gets the same hue lock.
4. **Reserved battle colours.** Colours used only by the part sheets, and small battle accents (chroma 10 or more,
   3% of the battle art or less), are available only to non-outline follower colours of the same hue family with at
   least 0.6 of their chroma.

## 3. The flag ("needs a look")

A sheet needs a look when any of these holds:
- mean shift over 8 dE, or a max shift over 20 (over colours with 3% or more of the pixels)
- an outline colour more than 15 L lighter
- a contrast collapse: an adjacent pair sharing at least 8 edges, with contrast of at least 12, that keeps under
  40% of it
- a lightness flip of at least 6 between adjacent colours
- new this round, **tint**: a neutral colour with 2% or more of the pixels ends on chroma 7 or more
- new this round, **accent**: an accent changes hue family (more than 45° or to grey) although the battle sprite,
  parts included, has its family

With the two new checks every method's count rose; D's 89 of the first round is 263 under this flag.

## 4. Results (755 jobs)

| | A | B | C | D | **E** |
| --- | --- | --- | --- | --- | --- |
| **needs a look** | 347 (46%) | 366 | 422 | 263 (35%) | **195 (26%)** |
| of them own sheets | 52 | 61 | 76 | 37 | 31 |
| mean dE: median / p90 / max | 4.5 / 6.4 / 11.4 | 5.2 / 8.0 / 18.7 | 5.9 / 8.9 / 17.0 | 4.7 / 6.4 / 11.1 | 4.7 / 6.5 / 13.0 |
| mean RGB: median / p90 | 27.9 / 38.4 | 34.6 / 52.1 | 37.6 / 57.6 | 31.1 / 45.2 | 30.9 / 44.4 |
| max dE: median / p90 / max | 9.0 / 13.1 / 30.2 | 11.0 / 21.3 / 70.8 | 12.4 / 22.2 / 32.6 | 9.4 / 14.1 / 25.9 | 9.4 / 14.2 / 23.3 |
| **neutral tinted** (sheets) | 69 | 188 | 183 | 148 | **8** |
| **accent lost its hue** (sheets) | 53 | 70 | 63 | 68 | **4** |
| lightness flips (sheets) | 18 | 56 | 61 | 1 | 14 |
| contrast collapse (sheets) | 273 | 142 | 165 | 72 | 171 |
| outline lighter (sheets) | 3 | 46 | 48 | 3 | 3 |
| sheets with merges / colours merged | 687 / 1771 | 157 / 194 | 157 / 194 | 465 / 775 | 533 / 986 |
| new shiny against hand-made (174 own): median / p90 | 3.7 / 10.7 | 3.8 / 12.3 | 4.5 / 11.6 | 3.3 / 11.3 | 3.3 / 11.3 |

Mean-dE histogram (bins of 2: 0-2, 2-4, ... 12+):

| | bins |
| --- | --- |
| A | 31, 236, 370, 107, 8, 3, 0 |
| D | 30, 211, 377, 121, 15, 1, 0 |
| E | 29, 213, 374, 123, 15, 0, 1 |

**Why E flags 195 sheets.** For 144 of them the only reason is a contrast collapse: E merges more than D, because
the neutral lock leaves fewer targets for a sprite's greys. On the contact sheet most of these look fine. In E's 30
worst, about 9 are real problems: Arceus forms 10, 13 (and 17) and 16, cherrim form 1, tornadus (both forms), and
hydrapple (a Budew placeholder). Across all 755, the real problems are about 25-30.

## 5. What went wrong in D, and the fix

| case | cause, proven on the colour tables (`show.py`) | fix in E |
| --- | --- | --- |
| Reshiram's red/orange fire turned blue | **Not the outline rule.** The battle flame colours (indices 10-14) appear only in the part sheets, never in the assembled frames, so they weren't targets. One-to-one plus contrast-keeping then put the fire and a lavender grey on the 2-pixel blue eye colours. | part-sheet colours are targets, reserved by hue (rule 4); fire maps to 13/14 |
| Reshiram's and Togetic's whites look pale blue | Togetic's dark navy outline went to the battle sprite's saturated blue (18 px); Reshiram's lavender outline grey went to the blue eye colour. | small battle accents reserved (rule 4); neutrals locked (rule 1) |
| Neutral greys tinted (148 sheets in D) | Contrast-keeping preferred a tinted target to merging two greys. | rule 1: 8 left |
| Tornadus's bright green went grey | Lightness weight made a light grey cheaper than a darker green. | the chroma-loss cost (rule 2) |

Re-checked on `key_examples_E.png`: Krokorok's head stays brown (C made it pink), Miltank stays grey (C made it
blue), Jynx's hair stays yellow (B and C made it dark gold), and Reshiram is white with red and orange fire, its
shiny gold-trimmed as in battle. Flips: 14 sheets (D 1). Each is a 1-2 pixel accent of a family with only one
battle shade, where two follower shades share it (bronzor, gallade, pidgeotto, sudowoodo). Not visible at 1x.

## 6. Sheets no mapping fixes (`problems_E.png`)

| group | sheets | note |
| --- | --- | --- |
| **Wrong sheet in the registry** | arceus_form_10 … _16 (shown: 11, 16), and form 17 | Sheet N matches battle form N-1 for N = 10-16 (sheet 11 is the Water Arceus, battle form 11 is Grass). The pink form-17 row uses sheet 13 (Electric, yellow). The walking sprites seem to keep the original "???" form at 9. Fix the rows. |
| **One sheet for several palettes** | castform (4 forms), cherrim (2) | The sunny, snowy and sunshine palettes can't colour the normal-form art: these forms need their own sheets. genesect's 5 forms share a sheet and that works, since the drives' palettes share a layout (mean 2.6). |
| **Art coloured differently, remap acceptable or better** | zubat, golbat (teal sprite, blue/purple battle: the remap gives the battle colours), deoxys and its 3 forms, natu, venonat, squirtle, cyndaquil, quilava | They look fine after the remap; a glance is enough. |
| **Art coloured differently, check** | koffing, weezing (blue-purple against magenta-purple); tornadus, both forms (follower greens brighter than any battle green) | Decide by eye, or redraw. |
| Placeholders (skipped) | hydrapple, and budew's sheet for appletun and flapple | |

**Other odd sheets:** no sheet has more than 15 colours (palettes have 16 entries); 116 use all 15, and 129 use more
colours than their battle sprite, so they need merges. 19 have duplicate colours. In 27, three or more colours appear
in half the frames or fewer: parts drawn only in some poses, not a second palette (list in the first round's
`final_stats.txt`).

## 7. Recommendation

- **Use E as the remap tool's default** (`--match refined`). It keeps the normal colours about as close as A and D
  do (median 4.7 dE), and fixes D's two visible weaknesses: tinted neutrals (148 sheets to 8) and accents changing
  hue (68 to 4). Its shinies are as close to the hand-made ones as D's.
- **Review:** one pass over E's 195 flagged sheets with `contact_E_worst.png`-style renders. The real work is about
  25-30 sheets, nearly all in section 6. Fix the Arceus rows and give Castform and Cherrim forms their own sheets
  before remapping.
- **Possible next refinement:** let a grey pair stay distinct on a lightly tinted target when the battle sprite has
  too few neutrals. That would cut the 144 sheets flagged only for contrast collapse. They look fine, so this is
  optional.
- **For the tool:** take the targets from `*_single(_female).png` plus the part sheets (reserved by hue), and the
  female art for female-only sheets. Put the flag and its reasons in `report`, and the 9-column layout in
  `--render`.

## 8. Method F: choosing among look-alike indices pixel by pixel (shinies)

**Symptoms under E** (shinies only; the normals look right): Reshiram's shiny has gold outlines, Dipplin's stem
outline turns red, and Krokorok's outline turns the yellow its stripes become.

**Cause, proven on the palettes.** Battle palettes have look-alike indices: near-identical normal colours whose
shiny colours differ. Examples:
- Reshiram: indices 7/8/9 duplicate 2/3/4 exactly; in the shiny they become the gold trim.
- Krokorok: outline 1 (16,16,16), stripe 9 (24,24,32) and stripe 8 (41,41,49) are all near-black; in the shiny,
  1 stays black and 8/9 turn yellow.
- Dipplin: stem 14 (8,82,24) and 15 (57,90,49) are both dark green; in the shiny, 15 turns red.

E chooses by normal colour only, so it picks among these by chance.

**F = E, then per pixel:**
1. The candidates are the battle indices whose normal colour lies within the look-alike threshold of E's target.
   Usually there is only one, and nothing changes.
2. With several, F learns each index's role from the battle art: its neighbour histogram over all part sheets and
   assembled frames (8 neighbours, including itself), and how often it touches transparency (assembled frames
   only).
3. It picks the candidate whose neighbours best match the pixel's mapped neighbours (log-likelihood). Pixels
   touching transparency also favour edge-role indices (weight 8 on the log of the edge share), and every pixel
   favours the more common of the candidates (weight 3 on the log of the size share). Without the size prior,
   Reshiram's rare gold-trim indices won next to black outlines.

A follower colour can therefore split across look-alike indices.

**Look-alike threshold: 6 dE** (OKLab ×100), **8 when both colours are dark** (L under 40). This covers
Krokorok's 1/8 (7.4), Dipplin's 14/15 (5.3) and Reshiram's exact duplicates. At 8 everywhere, unrelated dark brown
and dark grey (Dodrio, 8.0) become look-alikes and F makes things worse; 4 misses Krokorok.

**Normal unchanged:** F changes 136k pixels on 450 of the 755 sheets. Each pixel's normal colour stays within the
threshold of E's (measured max 8.0, all on dark colours; 6.0 elsewhere).

**Shiny anomaly check.** It looks at the follower's outline pixels (an outline colour touching transparency) and
counts two kinds:
- **role anomaly:** the pixel's normal colour looks like one of the battle sprite's edge-role indices (within 12),
  but its shiny is more than 15 away from what every edge-role index becomes;
- **avoidable:** an edge-role look-alike (within 5) exists whose shiny moves at least 12 less.

A sheet is flagged at 3 pixels and 2% of its outline pixels or more.

| | A | D | E | **F** |
| --- | --- | --- | --- | --- |
| sheets flagged (either kind) | 17 | 23 | 18 | **10** |
| sheets with any anomalous outline pixel | 17 | 23 | 18 | 16 |
| anomalous outline pixels (role + avoidable), of 344k | 3338 | 4555 | 3697 | **1152** |
| shiny against hand-made, median / p90 dE (**reference only**, not tuned toward) | 3.7 / 10.7 | 3.3 / 11.3 | 3.3 / 11.3 | 3.7 / 11.3 |

The needs-a-look flag of section 3 (normal colours) is unchanged from E's 195, since F keeps the normal colours.

**On the renders (`key_examples_F.png`):** Reshiram's shiny has no gold outlines. Dipplin's stem outline stays dark
green, and Krokorok's outline stays black while its stripes turn yellow as in battle. The other 17 look like E.

**What `anomalies_F.png` still shows** (16 sheets):
- grimer, muk, miltank, nidoran_f, sentret: the battle sprite has no outline-like index that keeps its colour, so
  the role check fires whatever the mapping does. It doesn't look wrong.
- emboar, misdreavus, cubchoo, aggron, milotic, slowking, shuckle, relicanth, zangoose, vanillish: a few to a few
  dozen pixels where context picked the shifting look-alike; mostly fine at 1x.
- budew (2 pixels).

**Recommendation:** make F (E plus the look-alike pass) the tool's mode for followers. The pass is cheap (per
pixel, once at build time) and keeps the normal sprite within the threshold. Since the hand-made shinies are a
reference only, review F's shinies on `contact_F_worst.png` instead.

## 9. Built (2026-11-22): the battle palettes colour every overworld sheet

Decided with the user the same day: every overworld Pokémon sheet re-indexed in place onto its battle palette with
F, one copy per sheet used by everyone (NPCs, ambients, wanderers, followers); its normal colours generated at build
time from the battle `normal.pal`; the shiny (and the palette variation on top) applied at run time for individuals
only; the `_shiny` duplicates removed; opt-outs where a sheet can't share yet.

**Usage first:** [overworld-sheet-usage.md](overworld-sheet-usage.md), generated by
`tools/paperwhite2/overworld_palettes.py usage`: each of the 818 sheets (174 follower sheets, 644 walking Pokémon,
bank 1's 0x4000 codes included), its group, the follower rows on it, the zone NPCs, scripts, ambients and Entralink
rooms that show it, and flags. Before the conversion it found three sheets serving groups with other palettes:
Castform's and Cherrim's walking sprites (every form's rows on one sheet) and Budew's (Appletun's and Flapple's
rows); Arceus sheet 13 also served form 17 and Genesect's sheet its four drive forms (palettes with the same roles,
fine). Nothing outside the followers named a `_SHINY` code.

### The data (`res/`)

- `data.json` of every Pokémon sheet has `"palette"` (`field_actor.schema.json`): `{"pokemon": "<group>"}`, the
  battle group (`res/pokemon/<species>` or `<species>/form_<n>`) its pixels are indices of, and no `sprite.pal`; or
  `{"opt_out": "<reason>"}`, keeping its own `sprite.pal`. A follower row on another species' sheet has
  `{"pokemon": "<its group>", "map": [16 indices]}`: the index of its own palette that each sheet index plays.
- **Opt-outs (4):** `pokemon/castform` and `pokemon/cherrim` (one sheet for forms whose palettes can't colour it,
  until the user draws per-form sheets), `pokemon/hydrapple` (its battle art and palettes are still Budew's
  placeholders), `pokemon/arceus_form_9` (the original game's ??? Arceus, which no battle form has the colours of).
  Their rows keep the sheet's own colours, normal and shiny.
- **Mapped (4 rows):** Appletun's and Flapple's (both sexes) on Budew's sheet, coloured by their own battle palettes
  through a map (E's colour map from Budew's palette onto theirs): they look wrong until the user draws their sheets.
- **Arceus fixed:** rows of forms 9-16 now show walking sheet N+1 (sheet N has battle form N-1's colours from 10 on;
  the experiment's "10-16" missed that row 9 showed the ??? sheet too); form 17 (no sheet of its own) shows sheet 14,
  coloured by form 17's palette (Arceus's forms share their palettes' roles). Sheets 10-17 are indexed on battle forms
  9-16.
- **Forms:** Primal Dialga (`pokemon/dialga_form_1`) and Shadow Lugia (`pokemon/lugia_form_1`) indexed on their
  form groups. Genesect's drive forms' rows colour its one sheet with their own palettes.
- **Removed:** the 1302 shiny follower codes (`follower.shiny`): 174 hand-made `_shiny` sheets and 1128 rows that
  pointed at a normal sheet, with their `obj_codes.txt` lines and directories. The follower codes after them
  renumber (nothing stores one: the follower and wanderers pick theirs at run time, events name them by constant).
  `res/field/actors` went from 4.06 MB to 2.72 MB; `a/0/4/8` from 6,754,744 to 5,882,944 bytes (-871,800: the 174
  sheets) and `a/0/4/7` from 243,232 to 207,260 (the rows' records, registry and positioning rows, -83 KB, with the
  palettes member's 47 KB added).

### The tools

- `tools/paperwhite2/palette_remap.py`: F (E's colour map, then the look-alike choice per pixel), ported from the
  scratchpad scripts and checked against them: on all 755 jobs of the experiment E's maps are identical, and F's
  pixels on 43 sampled jobs (Reshiram, Dipplin, Krokorok and 40 random). Deterministic. `report()` is section 3's flag.
- `tools/paperwhite2/overworld_palettes.py`: `usage`, `remap DIR GROUP` (new art in DIR re-indexed, `sprite.pal`
  removed, `"palette"` written), the build's side (`row_palettes`, `palette_member`, `sheet_palette`) and
  `copied_palette` for new species and forms. `overworld_palettes_convert.py`: the one-time conversion, kept for the
  record (on the converted `res/` it finds nothing to do).
- **The conversion's notes** (section 3's flag on the 814 remapped sheets): 199 flagged, 149 of them only for a
  contrast collapse. The rest, worth a glance: mean shift 8-9.5 (Zubat, Golbat, Venonat, Koffing, Weezing, Ditto,
  Quilava, Natu, Shuppet, Deoxys and its forms, Manaphy, Tornadus form 1), a colour shifting 21-23 dE (Beautifly,
  Kirlia, Gardevoir, Maractus both sheets, Tornadus both forms), an outline lighter (Remoraid, Exploud, Jirachi), an
  accent losing its hue (Scizor, Sceptile, Surskit, Unfezant's follower), a tinted neutral (Meowth, Dratini, Mew,
  Jumpluff, Kingdra, Blissey, Walrein, Primal Dialga), lightness flips of 1-2 pixel accents (Pidgeotto, Ninetales,
  Arcanine, Victreebel, Typhlosion, Sudowoodo, Larvitar, Bronzor, Chatot, Munchlax, Yanmega, Gliscor, Arceus,
  Deerling, Woobat). `overworld_palettes.py convert --dry-run` on an older checkout prints the list.
- **The import path:** the Pokémon Editor's walking sprite import and the battle sprite zip
  (`battle_sprite.py plan_walking`) re-index new art onto the group's battle palette with F and give section 3's
  reasons as warnings; art already in the battle colours (an exported sheet coming back) keeps its indices; a
  palette alone for a battle-palette sheet is refused (recolour `normal.pal`). A new walking sprite gets
  `"palette"`. New species' and forms' follower copies (`pokemon_species.py`, `pokemon_form.py`) get their own
  group (an identity map for rows on another group's sheet); no `_shiny` copies.
- **The packer** (`field_actor_data.py`): a sheet with `"palette": {"pokemon"}` is written with the group's
  `normal.pal`; a Pokémon sheet without `"palette"`, or with one and a `sprite.pal` (new art dropped in), stops the
  build with the `remap` command to run; a row whose group can't colour its sheet (neither its group nor a form with
  the same art) stops it too, asking for a map or an opt-out. It writes the followers' palettes as `a/0/4/7` member
  24 (`FOLLOWING_PALETTES_FILE`): "FWCL", version 1, a u16 per follower code (the index of its pair, 0xffff for
  none) and the distinct (normal, shiny) pairs, 32 + 32 bytes; 1302 codes, 1288 with a pair, 699 pairs, 47,348 bytes.
  The Entralink markers moved to member 25 (`entralink_run.MARKER_FIRST_MEMBER`).
- **Editing a battle `normal.pal` and rebuilding** recolours every overworld sheet of the group, NPCs and ambients
  included; `shiny.pal` the shiny followers and wanderers.

### The runtime

`paperwhite2_actor_palettes.c` (palette-variation.md's slots): `PaperWhite2_ActorPalettes_Set` takes the
individual's shininess; a slot's base colours are its follower code's pair from member 24, the shiny one for a shiny
individual, and only where the code has none (opt-outs) the sheet's own colours as before (captured at load, else
read from the sheet's file). The variation applies on top as before. The follower passes `mon->shiny`, a wanderer its
rolled shininess. `FindFollowerRow`'s scoring is unchanged: with no shiny rows a shiny Pokémon takes its normal row
(score -8, over the -100 floor). NPCs and ambients draw the shared material, the sheet's generated normal colours.
**Cost:** overlay 36 +0x120 bytes of code (the arena 0x4720 to 0x4600, about 17.5 KB left); no BSS (the shiny flag sits
in the slot's padding); one 8-, one 2- and one 32-byte archive read when a slot's individual changes, none a frame.
A slot that gets no material copy (no room) shows the shared normal colours, so a shiny would look normal there.

### Tested

- **Build:** `--hack` build with no warnings, `verify_dsi_rom.py` intact; plain build's modules (STATUS).
- **Python:** `test_overworld_palettes.py` (F on fixtures: look-alikes take their roles, neutrals stay neutral,
  determinism; the member's layout; rows' palettes, maps, opt-outs; the packer's checks; validity on the real data),
  `test_battle_sprite.py` updated (23 pass).
- **Editor:** `tsc` clean, `npm test` 273 pass (the follower and species tests updated: no `_shiny` copies).
- **Emulator** (py-desmume, the user's save, scratchpad `remapbuild/emu/`): an exec hook on `PaperWhite2_VaryPalette`
  and on the load hook. Followers (party slot 1 made each, R to follow): Dipplin, Krokorok, Reshiram normal and
  shiny, Arceus forms 9, 13, 16, 17 (normal and shiny), Genesect form 2, Appletun shiny (mapped): in every case the
  colours the variation got were the row's battle palette from `res/` (normal or shiny) and its output the variation
  reference. Castform (opted out), normal and shiny: its sheet's own `sprite.pal`, varied. Route 20 with Always shiny:
  two shiny Swinub wanderers bound with Swinub's battle shiny palette, varied. Every sheet the field loaded there
  (zone NPCs Wurmple, Silcoon, Cascoon, Venipede; followers) had `res/`'s colours; walking up to the Pidove ambients,
  the perching `POKEMON_PIDOVE` and the flying `FOLLOWER_PIDOVE` loaded with Pidove's battle normal colours, the same
  as the follower Pidove's. Screenshots: `remapbuild/emu/shots/follow_grid.png`, `amb_grid.png`.

### Left

- The user's review of the flagged sheets above, and art: Castform's and Cherrim's forms, Hydrapple (battle art too),
  Appletun and Flapple (then their rows lose the map: the walking sprite import gives them sheets of their own).
- `import_field_actors.py` and `import_followers.py` (the Frost/Pokeweb imports) still write `sprite.pal`: an import
  that changes a Pokémon sheet stops the build until `overworld_palettes.py remap` is run on it.
- Choosing another species' sheet for a row in the Pokémon Editor's Follower card needs a map: the build says so.
