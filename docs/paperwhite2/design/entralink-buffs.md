# Entralink roguelike: the buff catalogue

First draft, 2026-11-19, for the user to mark up. Nothing here is built. The mode itself is in
`entralink-roguelike.md` (sections 1-2 for the design, 3.8 for the damage pipeline); how the hack adds battle effects
is in `moves-and-abilities.md`. Every number below is a starting value to tune in playtests.

## 1. How it works

**Three tiers.** After every battle the player picks 1 of 3 cards. Each card rolls its tier by the battle's source:

| Source | Blue | Purple | Gold |
| --- | --- | --- | --- |
| Enemy | 70% | 25% | 5% |
| Challenge | 40% | 45% | 15% |
| Boss | 10% | 40% | 50%, and at least one gold card |

Shops sell golds more often. There is no pity counter.

- **Blue:** stat buffs, team-wide, stacking freely (section 2).
- **Purple:** generic mechanics that most teams can use, stacking like blues (section 3). Some are **related** to a gold
  theme and are offered more while the player holds a gold of that theme.
- **Gold:** themed boons that change a mechanic (section 4). There are **5 gold slots**. Each gold has ranks 1-3, and
  picking a gold already held ranks it up. With all five slots full, a new gold replaces one. The themes held make
  their golds and related purples come up more often.

**Damage buckets.** Bonuses in the same bucket **add**; buckets **multiply** each other. Each bucket has a hard cap on
its sum, whatever the sources, and the caps are what keep the strongest build under the 60,000 target (section 5).

| Bucket | What feeds it | Cap of the sum | Factor at cap | Host event (`include/battle/btl_event.h`) |
| --- | --- | --- | --- | --- |
| ATK | the attacking stat (Attack or Sp. Atk) | +100% | ×2.0 | `BATTLE_EVENT_ATTACK_STAT` 0x3b |
| POW | move power: type bonuses, move kinds | +100% | ×2.0 | `BATTLE_EVENT_MOVE_POWER_RATIO` 0x38 |
| STAB | the same-type bonus, vanilla ×1.5 | ×2.25 | ×1.5 over vanilla | `BATTLE_EVENT_SAME_TYPE_BONUS` 0x41 |
| MATCH | super-effective and resisted hits | +40% | ×1.4 | `BATTLE_EVENT_DAMAGE_RATIO` 0x47 |
| COND | situations: the foe's status, weather, HP, speed gap | +125% | ×2.25 | `BATTLE_EVENT_MOVE_POWER_RATIO` 0x38 |
| CRIT | critical damage, vanilla ×2 | ×2.5 | ×1.25 over vanilla | `BATTLE_EVENT_DAMAGE_RATIO` 0x47, on a critical hit |
| FINAL | "all damage" | +25% | ×1.25 | `BATTLE_EVENT_DAMAGE_RATIO` 0x47 |
| DEF | your defending stat (Defense or Sp. Def) | +100% | ×2.0 | `BATTLE_EVENT_DEFENSE_STAT` 0x3c, the player's Pokémon defending |
| GUARD | damage taken | −50% | ×0.5 | `BATTLE_EVENT_DAMAGE_RATIO` 0x47, the player's Pokémon defending |

- **Implementation:** one roguelike handler per host event and side sums each bucket's entries, applies the cap, and
  calls `BattleEventVar_MulValue` once per bucket. Vanilla handlers (abilities, items, stat stages, weather) keep
  multiplying on top, outside the buckets. Section 5 shows what that means for the cap.
- **Residual damage** (poison, burn, sleep ticks, weather, Leech Seed) is not a hit and has no bucket. Its buffs
  multiply the tick. Against 50,000-HP bosses, vanilla's "1/8 of max HP" is far too strong, so the draft assumes a rule
  (open question 2): a tick on an enemy is its fraction of `min(max HP, 6,000)`.
- **Not damage** in the tables marks chances, priority, healing, durations and the like.

**Feasibility.** "Easy" is one handler on an existing event, usually with a vanilla precedent ("vanilla: X" names the
ability or item whose handler shows how). "Medium" adds per-battle state (a flag per Pokémon, a counter) or needs a
`#ifdef PAPERWHITE2` hook in a function that has no event. "Hard" is a new mechanism: a new condition, a type change,
new UI. "(unsure)" marks what wasn't checked in the code.

Facts checked for this draft: the vanilla abilities' event tables in `src/ov167/ability_handlers.c` (`sHandlersX`);
full paralysis is a fixed 25% (`RollEffectChance(0x19)`, `btl_server_flow.c:2718`) and confusion's self-hit a fixed 50%
(`ServerControl_CheckConfusion`, `:2791`), with no event for either; Early Bird is hard-coded in `BattleMon_TickSleep`
(`btl_pokeparam.c:1180`); Life Orb and Expert Belt are `DAMAGE_RATIO` item handlers.

**Reading the tables.** "Step" is what one pick adds. "Soft limit" is where the step halves; the bucket cap is the hard
stop. Golds give their value at rank 1 / 2 / 3, not added together.

## 2. Blue: stats

All team-wide. Full step for the picks up to the soft limit, half step after, and nothing past the blue cap (the bucket
cap still applies on top, shared with purples and golds).

| Blue | Step | Soft limit | Blue cap | Bucket | Feasibility |
| --- | --- | --- | --- | --- | --- |
| Attack | +10% | 6 picks | +80% | ATK (physical moves) | Easy: `ATTACK_STAT`; vanilla Guts, Hustle |
| Sp. Atk | +10% | 6 picks | +80% | ATK (special moves) | Easy: as Attack |
| Defense | +10% | 6 picks | +80% | DEF (physical hits) | Easy: `DEFENSE_STAT`; vanilla Marvel Scale |
| Sp. Def | +10% | 6 picks | +80% | DEF (special hits) | Easy: as Defense |
| HP | +8% max HP | 5 picks | +50%, and never above 999 | not damage (bulk) | Medium: raise the run copies' max HP (u16); the gain is also healed |
| Speed | +8% | 6 picks | +60% | not damage (turn order) | Easy: `CALCULATE_SPEED`; vanilla Quick Feet |
| Guard | −4% damage taken | 5 picks | −40% | GUARD | Easy: `DAMAGE_RATIO` on the defender; vanilla Multiscale |
| Power | +4% all damage | 3 picks | +20% | FINAL | Easy: `DAMAGE_RATIO`; vanilla Life Orb without the cost |
| Accuracy | +4% | 3 picks | +20% | not damage | Easy: `GET_MOVE_ACCURACY`; vanilla Compound Eyes |
| Vigor | heal 8% max HP after each battle | 3 picks | 40% | not damage (run sustain) | Easy: run code, outside the battle |

- **HP and 999:** the player's HP shows 3 digits (`btlv_gauge.c`, 3.8). Blissey's 714 reaches 999 at about +40%; a pick that
  can't raise a Pokémon past 999 does nothing for it. Shedinja is left out.
- **Speed** races the enemies' Speed scaling; Trick Room reverses its value.

## 3. Purple: mechanics

Stack like blues, within the bucket caps and their own caps. "Once" means the card leaves the pool after one pick.
Related themes are the gold themes of section 4.

| # | Purple | Effect per pick | Own cap | Bucket | Related | Feasibility |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Type Affinity (the card names a type) | that type's moves +15% power | +60% a type | POW | Paralysis (Electric), Burn (Fire), Frost (Ice), Poison (Poison), Type mastery (Ghost) | Easy: `MOVE_POWER_RATIO`; vanilla Blaze-likes, Charcoal |
| 2 | Type Ward (the card names a type) | −15% damage from that type | −45% a type | GUARD | Type mastery | Easy: `DAMAGE_RATIO` on the defender; vanilla Thick Fat, Heatproof |
| 3 | Expert Edge | super-effective hits +8% | +40% | MATCH | Type mastery | Easy: vanilla Expert Belt |
| 4 | Glancing Blow | resisted hits +15% | +60% | MATCH (exempt from the cap: a resisted hit stays under a neutral one) | Type mastery | Easy: vanilla Tinted Lens |
| 5 | Kinship | STAB +0.05 (×1.5 → ×1.55) | +0.25 | STAB | Type mastery | Easy: `SAME_TYPE_BONUS`; vanilla Adaptability |
| 6 | Keen Edge | critical stage +1 | +2 | not damage (chance) | Critical | Easy: `CHECK_CRITICAL`; vanilla Super Luck |
| 7 | Heavy Crit | critical damage +0.1 (×2 → ×2.1) | +0.3 | CRIT | Critical | Easy: vanilla Sniper |
| 8 | Lingering Ailment | your residual damage on foes +15% | +60% | residual | Poison, Burn, Sleep, Weather | Easy: `CONDITION_DAMAGE`; vanilla Poison Heal (reverse) |
| 9 | Serene Touch | added-effect chances of your moves ×1.2 | ×2 | not damage | every status theme | Easy: vanilla Serene Grace |
| 10 | Sure Hand | status moves +10% accuracy | 100% | not damage | Paralysis, Sleep, Poison, Confusion | Easy: `GET_MOVE_ACCURACY` |
| 11 | Opportunist | +12% damage to foes with a major status | +36% | COND | every status theme | Easy: read the defender's condition |
| 12 | Hardy | −15% chance to be given a status | −60% | not damage (defence) | none | Medium: `CHECK_MOVE_ADD_CONDITION` on the target (unsure the target side is exposed) |
| 13 | Quick Recovery | your sleep and confusion last 1 turn less | −2 turns | not damage | Sleep, Confusion | Medium: Early Bird is hard-coded in `BattleMon_TickSleep`; `#ifdef` hook |
| 14 | Damp Rock | weather you set +2 turns | +6 | not damage | Weather | Easy: `INCREASE_MOVE_WEATHER_TURNS`; vanilla Damp Rock |
| 15 | Climate | +10% to the moves your weather boosts (Fire in sun, Water in rain, Rock/Ground/Steel in sand, Ice in hail) | +40% | COND | Weather | Easy: vanilla Sand Force |
| 16 | Overcoat (once) | no damage from sand and hail | once | not damage | Weather | Easy: `CHECK_WEATHER_DAMAGE`; vanilla Overcoat |
| 17 | Tough Claws | contact moves +10% power | +30% | POW | Last stand, Tag team | Easy: move flag check in `MOVE_POWER_RATIO` |
| 18 | Iron Fist | punching moves +15% power | +45% | POW | none | Easy: vanilla Iron Fist |
| 19 | Technique | moves of power 60 or less +20% | +60% | POW | Speed | Easy: vanilla Technician |
| 20 | Swift Hand | priority moves +20% power | +60% | POW | Speed | Easy: `MOVE_POWER_RATIO` on the move's priority |
| 21 | Second Hit | multi-hit moves hit at least one more time (2 → 3 → 4 → 5) | 5 hits | not damage (hits) | Critical | Easy: `CHECK_MULTIHIT_HITS`; vanilla Skill Link |
| 22 | Big Root | draining moves heal +25% | +75% | not damage | Last stand | Easy: `CALC_DRAIN_AMOUNT`; vanilla Big Root |
| 23 | Vampiric | heal 3% of the damage you deal | 15% | not damage | Last stand | Medium: after-damage heal; vanilla Shell Bell (item). Big hits heal to full, which is fine |
| 24 | Rock Skin | recoil −20% | −100% | not damage | Last stand | Easy: `CALC_RECOIL`; vanilla Rock Head |
| 25 | Flinch Edge | +5% flinch chance on moves that flinch | +20% | not damage | Speed | Easy: `GET_FLINCH_CHANCE`. Bosses may need to ignore it |
| 26 | Pinch Power | +12% damage while below 50% HP | +36% | COND | Last stand | Easy: read the attacker's HP |
| 27 | Focus Band | 8% chance to survive a KO with 1 HP | 32% | not damage | Last stand | Easy: `CHECK_ENDURE`; vanilla Focus Band |
| 28 | Light Clay | your screens last +2 turns | +4 | not damage | Weather (field play), Tag team | Easy: vanilla Light Clay |
| 29 | Clear Amulet | the first stat drop on each of your Pokémon each battle is blocked; a 2nd pick blocks two | 2 | not damage | Stat stages | Medium: `CHECK_STAT_CHANGE` plus a counter; vanilla Clear Body |
| 30 | Tempo | 15% chance your stat-raising moves give +1 more stage | 60% | not damage | Stat stages | Easy: `STAT_CHANGE_AMOUNT` with a roll; vanilla Simple |
| 31 | Momentum Strike | +5% damage per positive stage of the attacking stat | +30% | COND | Stat stages | Easy: read the stage |
| 32 | First Blood | +15% damage on each Pokémon's first turn out | +45% | COND | Tag team, Speed | Medium: a flag per Pokémon |
| 33 | Giant Slayer | +10% damage to bosses and raid targets | +20% | FINAL | Last stand | Easy: the battle's setup flags the boss |
| 34 | Thrifty | 15% chance a move uses no PP (PP carries between rooms) | 45% | not damage | none | Medium: `CALC_PP_DECREMENT`; vanilla Pressure (reverse) |
| 35 | Shed Skin | 10% chance each turn's end to cure your own major status | 30% | not damage | Sleep, Paralysis | Easy: `TURN_CHECK_EARLY`; vanilla Shed Skin |

35 purples, 2 of them rolling a type (17 variants each).

## 4. Gold: themed boons

Values at rank 1 / 2 / 3. **Core** marks the theme's centrepiece, the one gold the theme is built around. 14 themes,
72 golds.

### 4.1 Paralysis (the user's set)

| Gold | Effect (r1 / r2 / r3) | Bucket | Feasibility | Notes |
| --- | --- | --- | --- | --- |
| **Galvanic** (core) | +60% / +80% / +100% damage to paralyzed foes | COND | Easy: read the defender's condition | The user's "2× vs paralyzed" at rank 3 |
| Overcharge | Electric moves +40% / +70% / +100% power | POW | Easy: vanilla Technician's shape | The user's "Electric 2×" at rank 3; fills POW alone |
| Magnetised | paralyzed foes float (Ground moves miss) and count as Flying for your Electric moves / for all your moves / and a paralyzed Ground type loses its Electric immunity | type chart | Medium (unsure): `CHECK_FLOATING` is Easy (vanilla Levitate); adding Flying's matchup means recomputing effectiveness in `CHECK_TYPE_EFFECTIVENESS` with `poke_type_pair.c` | Turns neutral hits into super-effective ones; covered by the reference hit (section 5) |
| Static Field | your contact and Electric hits paralyze 10% / 20% / 30% | not damage | Medium: add the condition after the hit (`DAMAGE_PROCESS_END_HIT_REAL`); vanilla Static is the defender's version | Feeds Galvanic |
| Lockjaw | paralyzed foes are fully paralyzed 30% / 35% / 40% of turns (vanilla 25%) | not damage | Medium: fixed `RollEffectChance(0x19)` at `btl_server_flow.c:2718`, `#ifdef` hook | Strong on bosses: open question 6 |

Related purples: Type Affinity (Electric), Opportunist, Serene Touch, Sure Hand. Pairs with Speed (Slipstream) and Stat
stages (Simple), as in the user's example; Adaptability is in Type mastery.

### 4.2 Sleep

| Gold | Effect (r1 / r2 / r3) | Bucket | Feasibility | Notes |
| --- | --- | --- | --- | --- |
| **Nightmare Field** (core) | sleeping foes lose 1/16 / 1/10 / 1/8 of their max HP each turn | residual | Easy: `TURN_CHECK`; vanilla Bad Dreams | Under the residual rule: at most 750 a turn on a boss before buffs |
| Deep Sleep | sleep you inflict lasts +1 / +2 / +3 turns | not damage | Medium (unsure): the turn count is set when the condition is added; Early Bird shows the counter is plain data | Boss sleep needs a limit (open question 6) |
| Dream Eater | +30% / +50% / +75% damage to sleeping foes | COND | Easy | |
| Lullaby | STAB +0.25 / +0.4 / +0.5 against sleeping foes | STAB | Easy: `SAME_TYPE_BONUS`, reading the defender | The user's "bigger STAB vs sleeping foes" |
| Sandman | your sleep moves never miss / and your damaging moves sleep 5% / 10% | not damage | Easy (accuracy, `GET_MOVE_ACCURACY`); Medium (the added sleep) | |

### 4.3 Poison

| Gold | Effect (r1 / r2 / r3) | Bucket | Feasibility | Notes |
| --- | --- | --- | --- | --- |
| **Virulence** (core) | poison damage ×1.5 / ×2 / ×2.5 | residual | Easy: `CONDITION_DAMAGE`; vanilla Poison Heal | Toxic's ramp vs bosses: open question 2 |
| Venom Strike | +30% / +50% / +75% damage to poisoned foes | COND | Easy; vanilla Venoshock is the move version | |
| Corrosion | you can poison Steel and Poison types / and your poison is always bad poison / and bad poison starts at 2/16 | not damage | Medium (unsure): the type immunity sits in the add-condition check | Gen 7's Corrosion |
| Merciless | +2 / +3 critical stages against poisoned foes / always critical | not damage (crit chance) | Easy: `CHECK_CRITICAL` | Gen 7's Merciless; with the Critical theme it guarantees the CRIT bucket |
| Contagion | a poisoned foe that faints poisons the foes beside it / and your Poison moves poison 20% / 30% | not damage | Medium: `BEFORE_FAINT` | Only matters in doubles, triples |

### 4.4 Burn

| Gold | Effect (r1 / r2 / r3) | Bucket | Feasibility | Notes |
| --- | --- | --- | --- | --- |
| **Searing** (core) | burn damage ×1.5 / ×2 / ×2.5 | residual | Easy: `CONDITION_DAMAGE`; vanilla Heatproof (reverse) | |
| Kindling | +30% / +50% / +75% damage to burned foes | COND | Easy | |
| Smoulder | burned foes' special moves also deal −15% / −25% / −35% (vanilla halves physical only) | GUARD | Easy: `DAMAGE_RATIO` on the burned attacker | The theme's defence |
| Wildfire | your Fire moves burn +10% / +20% / +30% / and can burn Fire types at r3 | not damage | Easy for moves that already burn (vanilla Serene Grace); Medium for the rest and the Fire-type immunity | |
| Fire Within | your burned Pokémon ignore burn's Attack drop and get +20% / +35% / +50% Attack | ATK | Easy: vanilla Guts | Pairs with Flame Orb in the run bag, and with Last stand |

### 4.5 Frost (frostbite)

| Gold | Effect (r1 / r2 / r3) | Bucket | Feasibility | Notes |
| --- | --- | --- | --- | --- |
| **Frostbite** (core) | your Ice moves frostbite 10% / 20% / 30% instead of freezing: 1/16 HP a turn, Sp. Atk halved | residual | Hard: a new condition with its icon and messages; Syrup Bomb's condition slot is the precedent (`moves-and-abilities.md` 4.1) | Legends: Arceus's frostbite. Keeps Ice viable without freeze-locking bosses |
| Shatter | +30% / +50% / +75% damage to frostbitten or frozen foes | COND | Easy | |
| Cold Snap | Ice moves +40% / +70% / +100% power | POW | Easy | |
| Permafrost | frostbitten foes lose 1 Speed / 1 Speed and 1 Attack / 1 Speed, Attack and Sp. Atk each turn | not damage | Easy: `TURN_CHECK`; vanilla Moody's shape | |
| Thaw-proof | your Pokémon can't be frozen / and take −20% / −30% from Ice | GUARD | Easy | The theme's defence |

### 4.6 Confusion

| Gold | Effect (r1 / r2 / r3) | Bucket | Feasibility | Notes |
| --- | --- | --- | --- | --- |
| **Madness** (core) | confused foes hit themselves 60% / 65% / 70% of the time (vanilla 50%) | not damage | Medium: fixed `RollEffectChance(0x32)` in `ServerControl_CheckConfusion`, `#ifdef` hook | |
| Self-harm | a confused foe's self-hit has ×1.5 / ×2 / ×3 power (vanilla 40) | its own | Medium: hook `ServerControl_ConfusionDamage` | Uses the foe's own Attack and Defense, so it scales with the boss by itself |
| Dizzy Strike | +25% / +40% / +60% damage to confused foes | COND | Easy | |
| Vertigo | confusion you inflict lasts +1 / +2 / +3 turns | not damage | Medium (unsure): the count is set when added | |
| Daze | your damaging moves confuse 5% / 10% / 15% | not damage | Medium: add the condition after the hit | |

### 4.7 Weather

| Gold | Effect (r1 / r2 / r3) | Bucket | Feasibility | Notes |
| --- | --- | --- | --- | --- |
| **Stormcaller** (core) | weather you set lasts 8 / 12 turns / until the battle ends | not damage | Easy: `INCREASE_MOVE_WEATHER_TURNS` (r1-2); Medium for r3 | |
| Forecast | pick a weather when taking this gold; every battle starts in it for 3 / 5 / 8 turns | not damage | Medium: `MEMBER_IN` as vanilla Drought, plus a choice menu when picked | Rooms with a set weather override it? (open) |
| Heatwave | the weather boost on your moves +25% / +40% / +60% (on top of vanilla ×1.5) | COND | Easy: `MOVE_POWER_RATIO` reading the weather; vanilla Sand Force | One gold for all four weathers |
| Sandblast | sand and hail hurt foes ×2 / ×3 / ×4 and never your team | residual | Easy: `CHECK_WEATHER_DAMAGE`; vanilla Overcoat, Sand Force | |
| Weather Ward | in any weather, your Pokémon take −10% / −20% / −30% damage | GUARD | Easy | |
| Storm Speed | in any weather, your Speed ×1.25 / ×1.5 / ×2 | not damage | Easy: `CALCULATE_SPEED`; vanilla Swift Swim, Chlorophyll | |

### 4.8 Type mastery (the Ghost chart, STAB)

| Gold | Effect (r1 / r2 / r3) | Bucket | Feasibility | Notes |
| --- | --- | --- | --- | --- |
| **Adaptability** (core) | STAB ×2.0 / ×2.15 / ×2.25 | STAB | Easy: vanilla Adaptability | The user's "STAB twice as effective"; fills STAB at r3 |
| Spectral | Ghost moves are super effective on Normal / and Fighting / and neutral on Dark | type chart | Medium (unsure): `CHECK_TYPE_EFFECTIVENESS`; vanilla Scrappy only sets the ignore flag, so writing the effectiveness itself needs checking | The user's example |
| Expert | super-effective hits +15% / +25% / +40% | MATCH | Easy: vanilla Expert Belt | Fills MATCH at r3 |
| Tinted | resisted hits ×1.5 / ×1.75 / ×2 | MATCH (exempt from the cap) | Easy: vanilla Tinted Lens | |
| Coverage | your non-STAB moves get a STAB of ×1.25 / ×1.35 / ×1.5 | STAB | Medium: `CHECK_SAME_TYPE` and `SAME_TYPE_BONUS` | For mixed movesets |
| Prism | super-effective hits on you −15% / −25% / −35% | GUARD | Easy: vanilla Solid Rock, Filter (`EventAddSolidRock`) | The theme's defence |

Other per-type themes (Dragon, Fighting...) can copy this pattern later: a type's power, a chart change, a defence.

### 4.9 Last stand (low HP, recoil, risk)

| Gold | Effect (r1 / r2 / r3) | Bucket | Feasibility | Notes |
| --- | --- | --- | --- | --- |
| **Last Stand** (core) | more damage the more HP is missing: up to +50% / +75% / +100% at 1 HP | COND | Easy: the attacker's HP | The user's example; linear in missing HP% |
| Bulwark | Defense and Sp. Def rise as HP falls: up to +40% / +70% / +100% at 1 HP | DEF | Easy: `DEFENSE_STAT` | The user's example |
| Second Wind | once a battle, each Pokémon survives a KO with 1 HP: from full HP / from above 50% / always | not damage | Easy: `CHECK_ENDURE`; vanilla Sturdy | Lets the theme sit at low HP on purpose |
| Blood Price | your attacks cost 1/10 HP and deal +20% / +30% / +40% | FINAL | Easy: vanilla Life Orb | Capped by FINAL; a glass-cannon tool |
| Reckless | recoil moves +20% / +35% / +50% power, and r3 halves recoil | POW | Easy: vanilla Reckless, Rock Head | |

### 4.10 Stat stages

| Gold | Effect (r1 / r2 / r3) | Bucket | Feasibility | Notes |
| --- | --- | --- | --- | --- |
| **Simple** (core) | your stat boosts are doubled / and the foes' drops on you halved / and your first boost each battle gets +1 more | stages (vanilla) | Easy: `STAT_CHANGE_AMOUNT`; vanilla Simple, Contrary | The user's "stat stages twice as effective". Stages still stop at +6 (×4): section 5 |
| Opening Gambit | each battle starts with +1 Attack and Sp. Atk / and Speed / and Defense and Sp. Def | stages | Easy: `MEMBER_IN`, as vanilla Intimidate on itself | The first entry of each Pokémon only |
| Baton | your positive stages carry over when you switch: at half / in full / and the negative ones are dropped | stages | Medium: store at `SWITCH_OUT`, restore at `MEMBER_IN`; Baton Pass exists | |
| Unaware | your Pokémon ignore the foe's defensive boosts / and offensive boosts / and accuracy and evasion | not damage | Easy: vanilla Unaware | The answer to bosses that set up |
| Defiance | a foe lowering your stat gives +2 Attack / +2 Attack or Sp. Atk (your higher) / and the drop is blocked | stages | Easy: vanilla Defiant, Competitive (`STAT_CHANGE_APPLIED`) | |

### 4.11 Speed

| Gold | Effect (r1 / r2 / r3) | Bucket | Feasibility | Notes |
| --- | --- | --- | --- | --- |
| **Slipstream** (core) | damage up by how much faster you are than the target: up to +10% / +20% / +30% (at twice its Speed) | COND | Easy (unsure): read both Pokémon's speed in the power-ratio handler | The user's example |
| First Strike | each Pokémon's first move in a battle gets +1 priority / and +25% damage / and the second move too | not damage, then COND | Medium: `GET_MOVE_PRIORITY` plus a counter per Pokémon | |
| Speed Boost | +1 Speed every 2nd turn / every turn / every turn and +1 on entry | stages | Easy: vanilla Speed Boost (`TURN_CHECK`) | |
| Afterburner | a KO gives +1 Speed / and +1 to the higher attacking stat / and heals 10% | stages | Easy: vanilla Moxie (`DAMAGE_PROCESS_END_HIT_REAL`) | |
| Quick Draw | 10% / 20% / 30% chance to move first in your priority bracket | not damage | Easy: `CHECK_SPECIAL_PRIORITY`; vanilla Quick Claw | |

### 4.12 Critical

| Gold | Effect (r1 / r2 / r3) | Bucket | Feasibility | Notes |
| --- | --- | --- | --- | --- |
| **Sniper** (core) | critical hits ×2.25 / ×2.4 / ×2.5 (vanilla ×2) | CRIT | Easy: vanilla Sniper (`DAMAGE_RATIO`) | Fills CRIT at r3. Vanilla Sniper is ×3: trimmed for the cap |
| Keen Eye | critical stage +1 / +2 / +3 | not damage | Easy: vanilla Super Luck | Gen 5's stages: 1/16, 1/8, 1/4, 1/3, 1/2 |
| Focus | after a turn using a status move / or switching in / or being hit, the next attack is a sure critical | not damage | Medium: a flag per Pokémon, `CHECK_CRITICAL` | The theme's way to a sure critical without Merciless |
| Follow-through | a critical hit gives +1 to the attacking stat / and +1 Speed / +2 to the attacking stat | stages | Medium (unsure): needs the critical flag after the hit; vanilla Anger Point is the defender's version | |
| Shattering Blow | a critical hit lowers the target's Defense or Sp. Def (the one hit) by 1 / 1 and the other by 1 / 2 | not damage | Medium | |

### 4.13 Tag team (switching, doubles and raids)

| Gold | Effect (r1 / r2 / r3) | Bucket | Feasibility | Notes |
| --- | --- | --- | --- | --- |
| **Relay** (core) | a Pokémon switching in gets +1 to its higher attacking stat / and +1 Speed / and heals 10% | stages | Medium: `MEMBER_IN`, telling a switch from the battle's start | |
| Regenerator | switching out heals 1/6 / 1/4 / 1/3 HP | not damage | Easy: vanilla Regenerator | |
| Fresh Entry | the first move after switching in +25% / +40% / +60% damage | COND | Medium: a flag per Pokémon | |
| Natural Cure | switching out cures status / and resets negative stages / and the incoming Pokémon takes −30% damage that turn | GUARD (r3) | Easy: vanilla Natural Cure; Medium for r2-3 | |
| Teamwork | in doubles, triples and raids: +10% / +20% / +30% damage when an ally already hit the same target this turn | COND | Medium: a per-turn record of hits | Gives the 3v1 raids their own build |

### 4.14 Harvest (berries and held items)

| Gold | Effect (r1 / r2 / r3) | Bucket | Feasibility | Notes |
| --- | --- | --- | --- | --- |
| **Ripen** (core) | HP berries heal double / all berries' effects doubled / and pinch berries trigger at 50% HP | not damage | Easy: the hack's Ripen (`moves-and-abilities.md` 15); r3 Medium (vanilla Gluttony has no handler table, its check is in the item code) | |
| Harvest | an eaten berry regrows at the turn's end 25% / 50% / 100% of the time | not damage | Easy: vanilla Harvest (`TURN_CHECK`) | |
| Recycler | used berries / all used held items come back after each battle / and once mid-battle | not damage | Easy: run code; r3 Medium | |
| Booster | held items' damage boosts (Charcoal, plates, Life Orb, Expert Belt) count ×1.25 / ×1.5 / ×2 | POW | Medium (unsure): scaling another handler's ratio means wrapping the item handlers | Pushes vanilla extras; watch it (section 5) |
| Cheek Pouch | eating a berry also heals 1/6 / 1/4 / 1/3 HP | not damage | Medium: the item reaction (`CHECK_ITEM_REACTION`) | Gen 6's Cheek Pouch |

**Considered, not drafted:** a status-move and stall theme (Prankster, Leech Seed ×2, Protect heals); a separate Dragon
theme. Both fit the patterns above if wanted.

## 5. Balance check

### 5.1 The reference hit

A strong level-100 hit on a tanky boss, before buffs: about **400-800**, taken as **600**. It already includes STAB
×1.5, a super-effective ×2 and the highest roll. Example: power 120, Sp. Atk 400 against Sp. Def 300:
`120 × 400 × 42 / 300 / 50 + 2 = 136`, ×1.5 STAB = 204, ×2 = 408; a stronger attacker or a frailer boss gives 800.
Chart changes (Magnetised, Spectral) turn a neutral hit into this reference; they don't go above it.

### 5.2 Buckets at their caps (the ceiling of the buffs)

| Bucket | Max factor |
| --- | --- |
| ATK | 2.0 |
| POW | 2.0 |
| STAB | 2.25 / 1.5 = 1.5 |
| MATCH | 1.4 |
| COND | 2.25 |
| FINAL | 1.25 |
| CRIT (a critical hit) | 2.5 / 2 = 1.25 |

- Without a critical hit: 2.0 × 2.0 × 1.5 × 1.4 × 2.25 × 1.25 = **23.6**. On the reference: 600 × 23.6 = **14,200**;
  800 × 23.6 = **18,900**.
- A critical hit (vanilla ×2 on top, as every hit's critical is): 23.6 × 2 × 1.25 = **59.1**. 600 × 59.1 = **35,400**;
  800 × 59.1 = **47,300**.
- **Every bucket at its cap stays under 60,000.** Whether the ceiling is even reachable: filling it needs five golds at
  rank 3 (Galvanic, Overcharge, Adaptability, Expert, Sniper: 15 gold picks), eight Sp. Atk blues, two Power blues and
  a few purples, and a sure critical needs a sixth gold (Merciless or Focus). It isn't reachable in one run (5.4).

### 5.3 The user's paralysis set, late in a typical run

About 20 picks: 7 gold, 7 purple, 6 blue.
- Golds: Galvanic r2 (+80% COND), Overcharge r2 (+70% POW), Adaptability r1 (STAB ×2.0), Slipstream r1 (+10% COND),
  Magnetised r1.
- Purples: Type Affinity Electric ×2 (+30% POW), Opportunist (+12% COND), Expert Edge (+8% MATCH), and three that
  aren't damage.
- Blues: Sp. Atk ×3 (+30% ATK) and three defensive.

ATK 1.3 × POW 2.0 (1 + 0.7 + 0.3, at the cap) × STAB 1.33 × MATCH 1.08 × COND 2.02 = **7.6**: 600 × 7.6 = **4,500**,
800 × 7.6 = **6,100**. One Nasty Plot (+2, ×2) gives **9,100-12,100**: the "about 10,000 for an archetype" target
lands after one setup move. With Simple, one Nasty Plot is +4 (×3).

### 5.4 Picks per run

A run of 30-45 minutes is about 20 rewarded battles; say 12 enemies, 5 challenges and 3 bosses. The chance that a
reward shows at least one gold: enemy 1 − 0.95³ = 14%, challenge 1 − 0.85³ = 39%, boss 100%.
Expected gold picks: 12 × 0.14 + 5 × 0.39 + 3 = **about 6.6**, plus what shops sell. So a run ends with about four golds,
mostly at ranks 1-2. Rank 3 everywhere is out of reach in one run; that is open question 4.

### 5.5 Vanilla extras on top

Vanilla handlers multiply outside the buckets: stat stages (+2 ×2, +6 ×4), Huge Power ×2, Choice Band or Specs ×1.5,
Life Orb ×1.3, Expert Belt ×1.2, weather ×1.5, Helping Hand ×1.5, a 4× weakness ×2 over the reference.
- The ceiling with one +2 stage: 35,400-47,300 × 2 = **70,800-94,600**, over the cap: the final clamp shows **MAX**.
- The typical build (5.3) with +2 and Life Orb: 4,500-6,100 × 2.6 = **11,700-15,900**, well under.
- So the cap holds for buffs alone, and for typical builds with setup; only a near-ceiling build plus setup reaches MAX,
  which matches "a boss can be one-shot only with an extremely good combination". Open question 1 is whether vanilla
  boosts should count inside the buckets instead.
- **Entries to watch:** Booster (it scales the vanilla extras themselves), Simple with Opening Gambit and Baton (stages
  ×4 come cheaply), Merciless and Focus (a sure CRIT bucket). Trim those first if playtests overshoot.

### 5.6 The engine's limits

| Host event | The draft's max | With vanilla extras | Engine clamp (3.8) |
| --- | --- | --- | --- |
| `ATTACK_STAT` (ATK) | ×2.0 | ×6 (Huge Power, Choice, Guts) | ×32 |
| `MOVE_POWER_RATIO` (POW, COND) | ×4.5 | about ×8 (Technician, plates) | ×512 |
| `SAME_TYPE_BONUS` (STAB) | ×2.25 | the same (vanilla Adaptability adds into STAB: decide in the handler) | none checked |
| `DAMAGE_RATIO` (MATCH, CRIT, FINAL, GUARD) | ×2.19 | about ×10 (Life Orb, Expert Belt, Tinted Lens, Sniper) | ×32 |

- **Overflow** (3.8): power stays a u16 (150 × 8 = 1,200); `power × attack × 42` = 1,200 × 12,000 × 42 = 6.0e8, under
  2^32 (4.3e9) by ×7; `DAMAGE_RATIO`'s `value × ratio` at ×10 overflows only past about 104,000 damage. Safe, but the
  saturating multiply that 3.8 recommends is still worth adding under `#ifdef PAPERWHITE2`.
- **The final clamp** goes after `DAMAGE_CALCULATED` (0x48), on the u32 damage, before any `(u16)` cast, and sets the
  flag that shows MAX. Where the first u16 truncation happens isn't checked (unsure).

### 5.7 The defensive side

| Source | Max |
| --- | --- |
| DEF (blues +80%, Bulwark up to +100%) | ×2.0: damage ×0.5 |
| GUARD (Guard blues −40%, Type Ward, Prism, Smoulder, Weather Ward, Natural Cure; conditional ones only when they hold) | −50%: ×0.5 |
| HP (+50%, but 999 at most) | about ×1.4 for a typical 500-HP Pokémon |

- Buffs alone: 0.5 × 0.5 = **25% of the damage**, or about **18% of the HP share** with the HP bonus. Never immunity.
- With vanilla extras (Reflect ×0.5, +6 Defense ×0.25, Multiscale ×0.5): 0.25 × 0.5 × 0.25 = 3%, close to a wall.
  Vanilla answers exist (critical hits ignore screens and defensive boosts), and bosses could carry an Unaware-like
  aura: open question 7.
- **Enemy damage scaling** should be set against an expected defence: if the typical late run has about ×0.7 (three
  defensive blues), enemies scaled to that hurt a balanced team as early ones did, and a team with no defence takes
  about 1.4× the share: hits that already took half its HP then one-shot it, as decided.
- **Enemy Defense scaling** divides every number in 5.2-5.5. The draft assumes the bosses' Defense and Sp. Def grow at
  most ×1.3 and HP carries the rest (open question 3).

## 6. Open questions

1. **Vanilla boosts:** stay on top of the buckets (as drafted; MAX reachable with setup), or count inside them (stages,
   held items and Huge Power add into ATK, FINAL...)?
2. **Residual damage on enemies:** the drafted rule, a fraction of `min(max HP, 6,000)`? Toxic's ramp on bosses too
   (stop at 4/16?). Also Super Fang, Endeavor, Pain Split, Night Shade and OHKO moves against 50,000-HP bosses.
3. **Enemy Defense scaling:** how much of the depth scaling goes to Defense and Sp. Def rather than HP?
4. **Gold count:** about 6-7 gold picks a run. Enough, or raise gold odds, give a held gold's rank-up more weight, or
   sell rank-ups in shops?
5. **The clamp:** at 60,000 or 65,535 (the u16 limit)? Does the damage number show the full computed hit (overkill) or
   the HP actually lost?
6. **Status on bosses:** limits for sleep (at most 2 turns?), freeze (never?), full paralysis (halved?), confusion?
7. **Defence ceiling:** do bosses get an Unaware-like aura, or does an enemy hit have a minimum share of HP?
8. **Frost:** worth a new condition (Hard), or keep freeze and give it a sure thaw after one turn?
9. **Type cards:** do Type Affinity and Type Ward roll any of 17 types, or the team's types more often?
10. **Forecast vs rooms:** does a room's set weather win over the player's Forecast weather?
