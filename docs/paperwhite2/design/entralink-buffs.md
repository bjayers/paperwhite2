# Entralink roguelike: the buff catalogue

First draft, 2026-11-19, marked up by the user the same day: their answers are the decisions of section 6, and the
Stall theme (4.13) replaces Tag team and Harvest. The catalogue is data since phase 1 (section 7):
`res/paperwhite2/entralink/buffs.json`, edited on the Entree page's Buffs tab and checked by
`tools/paperwhite2/entralink_buffs.py`; the game reads none of it yet. The mode itself is in `entralink-roguelike.md`
(sections 1-2 for the design, 3.8 for the damage pipeline); how the hack adds battle effects is in
`moves-and-abilities.md`. Every number below is a starting value to tune in playtests.

## 1. How it works

**Three tiers.** After every battle the player picks 1 of 3 cards. Each card rolls its tier by the battle's source:

| Source | Blue | Purple | Gold |
| --- | --- | --- | --- |
| Enemy | 70% | 25% | 5% |
| Challenge | 40% | 45% | 15% |
| Boss | 10% | 40% | 50%, and at least one gold card |

Shops sell golds more often, and their rank-ups are the lever for more gold ranks in a run (decision 4). There is no
pity counter. Cards are also offered by gift NPCs and buff rooms, and sold in shops (each card's pools).

- **Blue:** stat buffs, team-wide, stacking freely (section 2).
- **Purple:** generic mechanics that most teams can use, stacking like blues, with no slots (section 3). Some are
  **related** to a gold theme and are offered more while the player holds a gold of that theme.
- **Gold:** themed boons that change a mechanic (section 4). There are **5 gold slots**. Each gold has ranks 1-3, and
  picking a gold already held ranks it up. With all five slots full, a new gold replaces one. The themes held make
  their golds and related purples come up more often (they steer the run's theme).

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
  multiply the tick. Against 50,000-HP bosses, vanilla's "1/8 of max HP" is far too strong, so (decision 2) bosses get
  several health bars, visual layers of one HP pool, and a tick on a boss is its fraction of **one bar**. The bars'
  design is pending; the numbers below take 6,000 for one bar.
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
| 8 | Lingering Ailment | your residual damage on foes +15% | +60% | residual | Poison, Burn, Sleep, Weather, Stall | Easy: `CONDITION_DAMAGE`; vanilla Poison Heal (reverse) |
| 9 | Serene Touch | added-effect chances of your moves ×1.2 | ×2 | not damage | every status theme | Easy: vanilla Serene Grace |
| 10 | Sure Hand | status moves +10% accuracy | 100% | not damage | Paralysis, Sleep, Poison, Confusion | Easy: `GET_MOVE_ACCURACY` |
| 11 | Opportunist | +12% damage to foes with a major status | +36% | COND | every status theme | Easy: read the defender's condition |
| 12 | Hardy | −15% chance to be given a status | −60% | not damage (defence) | Stall | Medium: `CHECK_MOVE_ADD_CONDITION` on the target (unsure the target side is exposed) |
| 13 | Quick Recovery | your sleep and confusion last 1 turn less | −2 turns | not damage | Sleep, Confusion | Medium: Early Bird is hard-coded in `BattleMon_TickSleep`; `#ifdef` hook |
| 14 | Damp Rock | weather you set +2 turns | +6 | not damage | Weather | Easy: `INCREASE_MOVE_WEATHER_TURNS`; vanilla Damp Rock |
| 15 | Climate | +10% to the moves your weather boosts (Fire in sun, Water in rain, Rock/Ground/Steel in sand, Ice in hail) | +40% | COND | Weather | Easy: vanilla Sand Force |
| 16 | Overcoat (once) | no damage from sand and hail | once | not damage | Weather | Easy: `CHECK_WEATHER_DAMAGE`; vanilla Overcoat |
| 17 | Tough Claws | contact moves +10% power | +30% | POW | Last stand | Easy: move flag check in `MOVE_POWER_RATIO` |
| 18 | Iron Fist | punching moves +15% power | +45% | POW | none | Easy: vanilla Iron Fist |
| 19 | Technique | moves of power 60 or less +20% | +60% | POW | Speed | Easy: vanilla Technician |
| 20 | Swift Hand | priority moves +20% power | +60% | POW | Speed | Easy: `MOVE_POWER_RATIO` on the move's priority |
| 21 | Second Hit | multi-hit moves hit at least one more time (2 → 3 → 4 → 5) | 5 hits | not damage (hits) | Critical | Easy: `CHECK_MULTIHIT_HITS`; vanilla Skill Link |
| 22 | Big Root | draining moves heal +25% | +75% | not damage | Last stand, Stall | Easy: `CALC_DRAIN_AMOUNT`; vanilla Big Root |
| 23 | Vampiric | heal 3% of the damage you deal | 15% | not damage | Last stand, Stall | Medium: after-damage heal; vanilla Shell Bell (item). Big hits heal to full, which is fine |
| 24 | Rock Skin | recoil −20% | −100% | not damage | Last stand | Easy: `CALC_RECOIL`; vanilla Rock Head |
| 25 | Flinch Edge | +5% flinch chance on moves that flinch | +20% | not damage | Speed | Easy: `GET_FLINCH_CHANCE`. Bosses may need to ignore it |
| 26 | Pinch Power | +12% damage while below 50% HP | +36% | COND | Last stand | Easy: read the attacker's HP |
| 27 | Focus Band | 8% chance to survive a KO with 1 HP | 32% | not damage | Last stand, Stall | Easy: `CHECK_ENDURE`; vanilla Focus Band |
| 28 | Light Clay | your screens last +2 turns | +4 | not damage | Weather (field play), Stall | Easy: vanilla Light Clay |
| 29 | Clear Amulet | the first stat drop on each of your Pokémon each battle is blocked; a 2nd pick blocks two | 2 | not damage | Stat stages | Medium: `CHECK_STAT_CHANGE` plus a counter; vanilla Clear Body |
| 30 | Tempo | 15% chance your stat-raising moves give +1 more stage | 60% | not damage | Stat stages | Easy: `STAT_CHANGE_AMOUNT` with a roll; vanilla Simple |
| 31 | Momentum Strike | +5% damage per positive stage of the attacking stat | +30% | COND | Stat stages | Easy: read the stage |
| 32 | First Blood | +15% damage on each Pokémon's first turn out | +45% | COND | Speed | Medium: a flag per Pokémon |
| 33 | Giant Slayer | +10% damage to bosses and raid targets | +20% | FINAL | Last stand | Easy: the battle's setup flags the boss |
| 34 | Thrifty | 15% chance a move uses no PP (PP carries between rooms) | 45% | not damage | none | Medium: `CALC_PP_DECREMENT`; vanilla Pressure (reverse) |
| 35 | Shed Skin | 10% chance each turn's end to cure your own major status | 30% | not damage | Sleep, Paralysis, Stall | Easy: `TURN_CHECK_EARLY`; vanilla Shed Skin |

35 purples, 2 of them rolling a type (17 variants each), weighted toward the team's types but any of them possible
(decision 9).

## 4. Gold: themed boons

Values at rank 1 / 2 / 3. **Core** marks the theme's centrepiece, the one gold the theme is built around. 13 themes,
68 golds.

### 4.1 Paralysis (the user's set)

| Gold | Effect (r1 / r2 / r3) | Bucket | Feasibility | Notes |
| --- | --- | --- | --- | --- |
| **Galvanic** (core) | +60% / +80% / +100% damage to paralyzed foes | COND | Easy: read the defender's condition | The user's "2× vs paralyzed" at rank 3 |
| Overcharge | Electric moves +40% / +70% / +100% power | POW | Easy: vanilla Technician's shape | The user's "Electric 2×" at rank 3; fills POW alone |
| Magnetised | paralyzed foes float (Ground moves miss) and count as Flying for your Electric moves / for all your moves / and a paralyzed Ground type loses its Electric immunity | type chart | Medium (unsure): `CHECK_FLOATING` is Easy (vanilla Levitate); adding Flying's matchup means recomputing effectiveness in `CHECK_TYPE_EFFECTIVENESS` with `poke_type_pair.c` | Turns neutral hits into super-effective ones; covered by the reference hit (section 5) |
| Static Field | your contact and Electric hits paralyze 10% / 20% / 30% | not damage | Medium: add the condition after the hit (`DAMAGE_PROCESS_END_HIT_REAL`); vanilla Static is the defender's version | Feeds Galvanic |
| Lockjaw | paralyzed foes are fully paralyzed 30% / 35% / 40% of turns (vanilla 25%) | not damage | Medium: fixed `RollEffectChance(0x19)` at `btl_server_flow.c:2718`, `#ifdef` hook | Halved on bosses (decision 6) |

Related purples: Type Affinity (Electric), Opportunist, Serene Touch, Sure Hand. Pairs with Speed (Slipstream) and Stat
stages (Simple), as in the user's example; Adaptability is in Type mastery.

### 4.2 Sleep

| Gold | Effect (r1 / r2 / r3) | Bucket | Feasibility | Notes |
| --- | --- | --- | --- | --- |
| **Nightmare Field** (core) | sleeping foes lose 1/16 / 1/10 / 1/8 of their max HP each turn | residual | Easy: `TURN_CHECK`; vanilla Bad Dreams | Under the residual rule: at most 750 a turn on a boss before buffs |
| Deep Sleep | sleep you inflict lasts +1 / +2 / +3 turns | not damage | Medium (unsure): the turn count is set when the condition is added; Early Bird shows the counter is plain data | On bosses sleep lasts 2 turns at most (decision 6) |
| Dream Eater | +30% / +50% / +75% damage to sleeping foes | COND | Easy | |
| Lullaby | STAB +0.25 / +0.4 / +0.5 against sleeping foes | STAB | Easy: `SAME_TYPE_BONUS`, reading the defender | The user's "bigger STAB vs sleeping foes" |
| Sandman | your sleep moves never miss / and your damaging moves sleep 5% / 10% | not damage | Easy (accuracy, `GET_MOVE_ACCURACY`); Medium (the added sleep) | |

### 4.3 Poison

| Gold | Effect (r1 / r2 / r3) | Bucket | Feasibility | Notes |
| --- | --- | --- | --- | --- |
| **Virulence** (core) | poison damage ×1.5 / ×2 / ×2.5 | residual | Easy: `CONDITION_DAMAGE`; vanilla Poison Heal | Ticks on bosses are fractions of one bar (decision 2) |
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
| **Frostbite** (core) | your Ice moves frostbite 10% / 20% / 30% instead of freezing: 1/16 HP a turn, Sp. Atk halved | residual | Hard: a new condition with its icon and messages; Syrup Bomb's condition slot is the precedent (`moves-and-abilities.md` 4.1) | Legends: Arceus's frostbite, a later phase (decision 8). Until then it gives freeze with a sure thaw after one turn; bosses are never frozen |
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
| Forecast | pick a weather when taking this gold; every battle starts in it for 3 / 5 / 8 turns | not damage | Medium: `MEMBER_IN` as vanilla Drought, plus a choice menu when picked | A room's set weather wins at battle start (decision 10) |
| Heatwave | the weather boost on your moves +25% / +40% / +60% (on top of vanilla ×1.5) | COND | Easy: `MOVE_POWER_RATIO` reading the weather; vanilla Sand Force | One gold for all four weathers |
| Sandblast | sand and hail hurt foes ×2 / ×3 / ×4 and never your team | residual | Easy: `CHECK_WEATHER_DAMAGE`; vanilla Overcoat, Sand Force | |
| Weather Ward | in any weather, your Pokémon take −10% / −20% / −30% damage | GUARD | Easy | |
| Storm Speed | in any weather, your Speed ×1.25 / ×1.5 / ×2 | not damage | Easy: `CALCULATE_SPEED`; vanilla Swift Swim, Chlorophyll | |

### 4.8 Type mastery (the type chart, STAB)

| Gold | Effect (r1 / r2 / r3) | Bucket | Feasibility | Notes |
| --- | --- | --- | --- | --- |
| **Adaptability** (core) | STAB ×2.0 / ×2.15 / ×2.25 | STAB | Easy: vanilla Adaptability | The user's "STAB twice as effective"; fills STAB at r3 |
| Spectral | 20% / 40% / 60% chance that a hit is super effective (×2) whatever the chart says, **even against a type immune to it** (a Ghost move on a Normal type); otherwise the usual result, the usual immunity included | type chart | Medium: `CHECK_TYPE_EFFECTIVENESS` (`ServerEvent_CheckTypeEffectiveness`, `btl_server_flow.c:6724`) only offers the ignore-immunity and force-neutral flags. The `#ifdef` hook goes at the top of `ServerControl_CheckMoveEffectiveness` (:6640, after the `TYPE_NULL` check), before the two types' results are combined and before the immune result shows "doesn't affect" (:6669): a successful roll returns super effective there, so the immunity is never reached. Rolled once a hit and target; whether that function is called more than once for one hit (a check with `flag` false) isn't checked (unsure), so the roll may need keeping for the move. Type immunity only: abilities' immunities (Levitate, Volt Absorb, Wonder Guard...) still hold | The user's idea, Ghost moves usable on Normal types, made generic on 2026-11-19. On a resisted matchup it lifts ×0.5 to ×2, never above the reference hit (5.1) |
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

### 4.13 Stall (heal, protect, drain)

Added 2026-11-19 in place of Tag team and Harvest, which the user removed. Its payoff is the core: healing that would
pass max HP isn't lost but hits a foe, so every heal of the theme (and the related purples Big Root, Vampiric, Focus
Band, Light Clay, Shed Skin, Hardy and Lingering Ailment) feeds it.

| Gold | Effect (r1 / r2 / r3) | Bucket | Feasibility | Notes |
| --- | --- | --- | --- | --- |
| **Overflow** (core) | healing past max HP deals 50% / 75% / 100% of the excess to a foe (the one opposite, else the first) | not damage (fixed damage) | Medium: every heal passes `ServerControl_RecoverHPCore` (`btl_server_flow.c:4436`, from `BattleHandler_RecoverHP` :8145 and `ServerControl_RecoverHP` :4407), where an `#ifdef` hook sees the amount against the missing HP and pushes a damage work for the rest. A heal at full HP is refused earlier (`ServerControl_RecoverHPCheckFail`'s `IsMonFullHP`, :4415), so only heals that cross the max overflow, unless the hook goes there too | Fixed damage of at most a few hundred (999 HP at most), so no bucket and nothing for the cap. On bosses it is plain damage to the pool |
| Parasite | Leech Seed drains 1/6 / 1/5 / 1/4 of the foe's max HP (vanilla 1/8), and at r3 a seeded foe that faints seeds the foes beside it | residual | Medium: the 1/8 is fixed, `DivideMaxHPZeroCheck(mon, 8)` in `ConditionEndTurnLeechSeed` (`src/ov169/condition_effects.c:141`), an `#ifdef` hook; the spread Medium (unsure): adding `CONDITION_LEECH_SEED` from a faint handler | On bosses a fraction of one bar (decision 2). Its drain heals, so it feeds Overflow |
| Thorn Guard | Protect and Detect also heal 1/8 / 1/6 / 1/4 of max HP when they block a move, and a blocked contact move costs its user 1/8 of its max HP (one bar on a boss) | not damage | Medium (unsure): the block is `GetTurnFlag(target, 7)` at `btl_server_flow.c:2335`, which asks `CHECK_PROTECT_BREAK` (`ServerEvent_CheckProtectBreak`, :6313) for each blocked target; a handler there, or an `#ifdef` hook after the blocked message (:2337), heals and hurts. Vanilla Rough Skin (`DAMAGE_REACTION`, `ability_handlers.c:2125`) shows the contact damage | The user's "Protect heals and damages attackers that are blocked" |
| Mending | recovery moves (Recover, Roost, Synthesis, Wish, Rest's heal) heal 25% / 50% / 100% more | not damage | Easy: `CALC_MOVE_HEAL_AMOUNT` (0x8f), as vanilla Swallow and Morning Sun; Wish and Rest (unsure: whether they pass that event) | Past 50% of max HP every Recover overflows: the theme's engine with Overflow |
| Regrowth | heal 1/16 / 1/12 / 1/8 of max HP each turn's end | not damage | Easy: `TURN_CHECK`, as vanilla Leftovers (`item_handlers.c`, `EventAddLeftovers`) | At full HP it heals nothing (and overflows nothing) unless Overflow's hook takes refused heals |
| Siphon | draining moves (Giga Drain, Drain Punch, Horn Leech...) +20% / +35% / +50% power, so they heal more too | POW | Easy: `MOVE_POWER_RATIO` on `MOVE_QUALITY_DAMAGE_DRAIN` (`include/constants/battle.h`) | The user's "drain stronger"; Big Root (purple) is its heal side |

Left out: Wish-style delayed heals of the theme's own (Wish exists; Mending covers it) and Leech Seed on Grass types
(the immunity check wasn't looked at). **Considered, not drafted:** a separate Dragon theme; it fits the patterns above
if wanted.

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
mostly at ranks 1-2. Rank 3 everywhere is out of reach in one run; shops selling rank-ups are the lever (decision 4).

### 5.5 Vanilla extras on top

Vanilla handlers multiply outside the buckets: stat stages (+2 ×2, +6 ×4), Huge Power ×2, Choice Band or Specs ×1.5,
Life Orb ×1.3, Expert Belt ×1.2, weather ×1.5, Helping Hand ×1.5, a 4× weakness ×2 over the reference.
- The ceiling with one +2 stage: 35,400-47,300 × 2 = **70,800-94,600**, over the cap: the final clamp at 60,000 holds them (the number is red, the top tier, from 40,000).
- The typical build (5.3) with +2 and Life Orb: 4,500-6,100 × 2.6 = **11,700-15,900**, well under.
- So the cap holds for buffs alone, and for typical builds with setup; only a near-ceiling build plus setup reaches the clamp,
  which matches "a boss can be one-shot only with an extremely good combination". Vanilla boosts stay on top of the
  buckets (decision 1): the clamp should be very hard to reach, not impossible.
- **Entries to watch:** Simple with Opening Gambit and Baton (stages ×4 come cheaply), Merciless and Focus (a sure CRIT
  bucket), Spectral (super effective on any matchup). Trim those first if playtests overshoot.
- **The balance meter** (the Buffs tab; `ceiling()` in `entralink_buffs.py`) computes 5.2 and 5.3 from the data: each
  attack bucket's entries at their most (a blue's or purple's cap, a gold's top rank), held to the bucket's cap,
  multiplied, times the reference hit. It leaves out the resisted-only bonuses (Glancing Blow, Tinted) and Coverage, as
  the strongest hit is super effective with STAB, and counts every other entry whether or not its conditions can hold
  together, so it is an upper bound. With today's data every attack bucket reaches its cap: ×23.6, **14,175** on 600,
  and **35,438** on a critical hit (47,250 on 800), under 60,000; the example build (5.3) gives ×7.56, **4,538**.

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
- **The final clamp** goes after `DAMAGE_CALCULATED` (0x48), on the u32 damage, before any `(u16)` cast. There is no MAX text:
  the damage number's colour tier shows the size, red (from 40,000) the top one (section 8). Where the first u16 truncation happens isn't checked (unsure).

### 5.7 The defensive side

| Source | Max |
| --- | --- |
| DEF (blues +80%, Bulwark up to +100%) | ×2.0: damage ×0.5 |
| GUARD (Guard blues −40%, Type Ward, Prism, Smoulder, Weather Ward, Thaw-proof; conditional ones only when they hold) | −50%: ×0.5 |
| HP (+50%, but 999 at most) | about ×1.4 for a typical 500-HP Pokémon |

- Buffs alone: 0.5 × 0.5 = **25% of the damage**, or about **18% of the HP share** with the HP bonus. Never immunity.
- With vanilla extras (Reflect ×0.5, +6 Defense ×0.25, Multiscale ×0.5): 0.25 × 0.5 × 0.25 = 3%, close to a wall.
  Vanilla answers exist (critical hits ignore screens and defensive boosts), and bosses could carry an Unaware-like
  aura; for now there is no defence-ceiling rule (decision 7).
- **Enemy damage scaling** should be set against an expected defence: if the typical late run has about ×0.7 (three
  defensive blues), enemies scaled to that hurt a balanced team as early ones did, and a team with no defence takes
  about 1.4× the share: hits that already took half its HP then one-shot it, as decided.
- **Enemy Defense scaling** divides every number in 5.2-5.5. The draft assumes the bosses' Defense and Sp. Def grow at
  most ×1.3 and HP carries the rest (decision 3).

## 6. Decisions (the user, 2026-11-19)

The draft's open questions, answered:

1. **Vanilla boosts** stay on top of the buckets, outside their caps. The clamp stays reachable with setup, but very hard.
2. **Bosses get several health bars** (design pending): visual layers of one HP pool, and damage over time is a
   fraction of one bar, not of the whole pool. Bosses are mostly triple and raid battles (content). Fixed-damage moves
   (Super Fang, Endeavor, OHKO moves, Night Shade and the like) are blocked or capped on bosses.
3. **Enemy Defense and Sp. Def** grow at most ×1.3 with depth; HP carries the rest of the scaling.
4. **About four golds a run** is right; shops selling golds' rank-ups are the lever for more ranks.
5. **The clamp** is at 60,000, and the damage number shows the full computed hit (overkill), not the HP lost.
6. **Incapacitating statuses are limited on bosses:** sleep lasts 2 turns at most, they are never frozen, and full
   paralysis is halved (Lockjaw's chances too).
7. **No defence-ceiling rule** for now (no Unaware-like aura, no minimum share of HP).
8. **Frostbite** becomes a new condition in a later phase; meanwhile the Frost theme gives freeze with a sure thaw after
   one turn.
9. **Type cards** (Type Affinity, Type Ward) roll any of the 17 types, weighted toward the team's types, never
   guaranteed (`type_card_team_weight`).
10. **Weather:** a room's set weather wins at battle start (over Forecast); weathers set in battle work normally.

Also decided: purples stack like blues, with no slots; golds have 5 slots and ranks; each battle offers 1 of 3 cards,
their tiers by source (enemy 70/25/5, challenge 40/45/15, boss 10/40/50 with at least one gold); golds are more common
in shops; no pity; the golds held steer the themes offered; purples can be marked related to gold themes. Type
mastery's Spectral is generic and works through type immunities (4.8); Tag team and Harvest are gone and Stall (4.13)
is new. Icons are one per category, coloured by tier (section 7); the later phases' decisions are in section 8.

## 7. The data (phase 1)

`res/paperwhite2/entralink/buffs.json` holds the whole catalogue, against `buffs.schema.json` beside it. The Entree
page's **Buffs** tab edits it; `tools/paperwhite2/entralink_buffs.py` checks it in the hack's build and writes
`paperwhite2/entralink_buffs_config.h` (the buffs', categories', themes', buckets', effect kinds' and tiers' IDs and the
settings as `ENTRALINK_BUFF_*` values), which nothing includes yet: the next phase adds the tables with the C that
reads them.

- **settings:** `offers` (3), `tier_odds` by source, `boss_guaranteed_gold`, `shop_gold_weight` and
  `held_theme_weight` (percent of the others' weight), `gold_slots` (5), `max_rank` (3), `damage_cap` (60,000),
  `skip_dust` (Dream Dust for skipping an offer, 20), `type_card_team_weight`, and the tiers' default `prices` in Dream
  Dust (blue 60, purple 150, gold 400; tunable).
- **buckets:** section 1's table: `id`, `name`, `side` (attack, defense), `vanilla` (the factor the sum adds to in
  hundredths: STAB 150, CRIT 200), `cap`, `critical_only` (CRIT), `reduces` (GUARD), `event`. A bucket's factor is
  (vanilla + sum) / vanilla, or / 100 for a critical-only one; a reducing one's (100 − sum) / 100.
- **balance:** the meter's `reference_hit` (600) and its `example` build (5.3's picks; a gold's count is its rank).
- **categories:** the icons' categories, `id`, `name`, `description`: attack, defense, speed, hp, power, critical,
  type, status, weather, stages, heal, utility (12).
- **themes:** `id` (stable), `name`, `description`.
- **buffs:** every card. All have `id` (stable snake_case; renaming the card keeps it), `name`, `tier`, `description`
  (one menu line; a line per rank for golds), `category` (its icon), `weight`, `rounds` (optional), `price` (optional;
  the tier's default), `pools` (`after_battle`, `gift`, `buff_room`, `shop`), `bucket` (where the kind adds to one) and
  `effect`. Blues and purples have `step`, `soft_limit` (optional: picks past it add half), `cap`, and purples
  `related` (gold themes) and `type_card`. Golds have `theme`, `core` and `ranks` (1-3 values, each rank's own).
- **Icons (decided 2026-11-19):** no icon of its own per card. A card shows its **category's** icon, and its **tier
  decides the palette**, so one picture serves the three tiers. `buff_icons/<category>.png` is 16 by 16, its pixels
  palette indices (0 clear; the placeholders use 1 the outline, 2-4 the badge's dark, mid and light, 5 the symbol, 6 its
  shadow); its own PNG colours are only a preview. `buff_icons/tier_<tier>.png` is the tier's palette: a 16 by 16 swatch
  (colour i in the 4 by 4 cell i) whose PNG palette is the 16 colours. Chosen as the simplest for the game: each icon
  becomes one 16-colour texture (`GX_TEXFMT_PLTT16`, as the markers are) and each tier one 16-colour palette, and the
  card is drawn with the texture and its tier's palette, nothing recoloured at run time. Both are placeholders for the
  user to draw on Graphics & Palettes' Sprite sheets page (Buff icon, Buff tier palette; `entralink_marker_art.py`
  lists them with the markers); the editor shows every card's icon in its tier's colours.

### 7.1 Effect kinds

Each card's `effect` is one kind with its parameters, so the game implements kinds, not cards. The number is the
card's step and cap (blue, purple) or its ranks (gold), in the kind's unit. A `condition` (where a kind takes one) is
every field given holding: `defender_status` and `attacker_status` (lists, `any_major` for any major status),
`move_type`, `card_type` (the type the card rolled), `category`, `stab`, `super_effective`, `resisted`, `critical`,
`attacker_hp_below`, `contact`, `punch`, `recoil_move`, `drain_move`, `priority`, `power_at_most`, `weather` (a list,
`any`), `weather_boosted`, `first_turn`, `boss`, and `any` (one of several conditions). A `scale` is `missing_hp` (the
full value at 1 HP), `speed_gap` (at twice the target's Speed) or `attack_stage` (per positive stage).

| Kind | Unit | Parameters | Cards |
| --- | --- | --- | --- |
| `damage_ratio` | percent added to the bucket (GUARD: less damage taken) | condition, scale, exempt_from_bucket_cap, hp_cost, halves_recoil_at_rank, immune_to | Guard, Power, Type Affinity, Type Ward, Expert Edge, Glancing Blow, Opportunist, Climate, Tough Claws, Iron Fist, Technique, Swift Hand, Pinch Power, Momentum Strike, First Blood, Giant Slayer, Galvanic, Overcharge, Dream Eater, Venom Strike, Kindling, Smoulder, Shatter, Cold Snap, Thaw-proof, Dizzy Strike, Heatwave, Weather Ward, Expert, Tinted, Prism, Last Stand, Blood Price, Reckless, Slipstream, Siphon |
| `stat_ratio` | percent of the stat | stat (attack, sp_attack, defense, sp_defense, speed, attacking, defending), condition, scale, ignore_burn_drop | Attack, Sp. Atk, Defense, Sp. Def, Speed, Fire Within, Storm Speed, Bulwark |
| `max_hp` | percent of max HP | limit (999) | HP |
| `stab_bonus` | hundredths added to ×1.5 | condition, non_stab (then the STAB non-STAB moves get) | Kinship, Lullaby, Adaptability, Coverage |
| `crit_stage` | stages; 5 or more is a sure critical | condition | Keen Edge, Merciless, Keen Eye |
| `crit_damage` | hundredths added to ×2 | | Heavy Crit, Sniper |
| `accuracy` | percent of the accuracy | condition | Accuracy, Sure Hand |
| `residual_ratio` | percent added to the tick | source (any, poison, burn, sleep, frostbite, weather, leech_seed), team_immune | Lingering Ailment, Virulence, Searing, Sandblast |
| `residual_fraction` | the denominator (8 is 1/8 a turn; one bar on a boss) | source (sleeping_foes, leech_seed), spreads_at_rank | Nightmare Field, Parasite |
| `heal_per_turn` | the denominator | | Regrowth |
| `heal_after_battle` | percent of max HP | | Vigor |
| `heal_on_damage` | percent of the damage dealt | | Vampiric |
| `heal_ratio` | percent more | source (drain, recovery_moves) | Big Root, Mending |
| `recoil_ratio` | percent less | | Rock Skin |
| `added_effect_chance` | percent added to the multiplier | | Serene Touch |
| `flinch_chance` | percentage points | | Flinch Edge |
| `multi_hit` | hits | | Second Hit |
| `pp_save_chance` | percent | | Thrifty |
| `status_chance_on_hit` | percent | status, condition, replaces_freeze, ignores_immunity_at_rank | Static Field, Wildfire, Frostbite, Daze |
| `status_duration` | turns | statuses (sleep, confusion), target (foes, own) | Quick Recovery, Deep Sleep, Vertigo |
| `status_resist` | percent less | | Hardy |
| `status_cure_chance` | percent a turn | | Shed Skin |
| `status_roll` | percent (vanilla 25, 50) | roll (full_paralysis, confusion_self_hit) | Lockjaw, Madness |
| `type_chart` | percent chance a hit is affected | mode (super_effective_chance), overrides_immunity (Spectral: true, even on an immune type) | Spectral |
| `weather_turns` | turns; 255 is the whole battle | mode (add, set) | Damp Rock, Stormcaller |
| `screen_turns` | turns | | Light Clay |
| `endure_chance` | percent | | Focus Band |
| `endure_once` | the percent of max HP needed (100 from full, 0 always) | | Second Wind |
| `stat_stage_on_entry` | stages | stats_by_rank | Opening Gambit |
| `ability_like` | the rank's level for the handler | ability (`ABILITY_*`) | Overcoat, Simple, Unaware, Defiance, Speed Boost (`ABILITY_SPEED_BOOST`), Afterburner (`ABILITY_MOXIE`) |
| `custom` | the handler's number for the rank | handler | Clear Amulet, Tempo, Magnetised, Sandman, Corrosion, Contagion, Permafrost, Self-harm, Forecast, Baton, First Strike, Quick Draw, Focus, Follow-through, Shattering Blow, Overflow, Thorn Guard |

A new kind is a new `effect_<kind>` definition in the schema (the editor's kind picker and parameter rows read it from
there), a number in the header, and its handler in the game.

## 8. Decisions for the later phases (the user, 2026-11-19)

Recorded now, built later; none of it is in phase 1.

- **Boss health bars:** automatic, by the boss's HP, up to **10 bars** for the strongest bosses. They are visual layers
  of one HP pool, each bar's colour contrasting with the one before. Damage over time counts as a fraction of **one
  bar** (decision 2). Later, the editor gets a **per-enemy scaling multiplier** on top of the automatic scaling, for
  enemies that come out too easy or too hard (Darkrai is too easy now).
- **The chooser:** no rarity word on the cards; the text is coloured by tier (blue, purple, gold), with a gold's rank
  as a numeral: "Galvanic II — +80% damage to paralyzed foes". **Skipping** an offer is allowed and gives a little
  Dream Dust (`settings.skip_dust`, 20 to start).
- **Prices:** blue 60, purple 150, gold 400 Dream Dust (`settings.prices`), tunable.
- **Damage numbers:** drawn from the user's sheet (coming). Each digit is a 16 by 32 cell with one blank column on
  each side; row 1 holds the digits 0-9 every 16 pixels, and the rows below it each digit's shine frames. The size
  tiers swap two palette colours. There is **no "MAX" text**: red is the top tier, the one to work toward, from
  **40,000**; the clamp stays at 60,000 (`damage_cap`).
- **Enemy scaling** is tunable data; a later phase simulates runs outside the game to suggest its starting values.
- **A separate later project:** the C-Gear's run display, the hub and Dream Shards.
