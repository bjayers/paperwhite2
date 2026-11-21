# Entralink roguelike: the buff catalogue

First draft, 2026-11-19, marked up by the user the same day: their answers are the decisions of section 6, and the
Stall theme (4.13) replaces Tag team and Harvest. The catalogue is data since phase 1 (section 7):
`res/paperwhite2/entralink/buffs.json`, edited on the Entree page's Buffs tab and checked by
`tools/paperwhite2/entralink_buffs.py`. Since phase 2 (section 9) the game offers the cards and the run holds them;
since phase 3 (section 10) most of them work in battle, and since phase 4 (section 11) all of them. Section 15 (rebalance 2) merged four cards, doubled the attack values and put the bosses on the room curve. The mode itself is in `entralink-roguelike.md`
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
  several health bars, visual layers of one HP pool, and a tick on a boss is its fraction of **one bar**. The bars
  are built since phase 5 (section 12: at most `boss_bar_hp`, 5,000, a bar); the numbers below took 6,000 for one bar.
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
| Wildfire | your Fire moves burn 10% / 20% / 30% (or the move's own chance if higher) / and can burn Fire types at r3 (reworked in section 16) | not damage | Easy for moves that already burn (vanilla Serene Grace); Medium for the rest and the Fire-type immunity | |
| Fire Within | each burned foe on the field gives +15% / +25% / +35% Attack and Sp. Atk (reworked in section 16; was: burned, no Attack drop and +Attack) | ATK | Easy | Pairs with the burn theme's spreaders |

### 4.5 Frost (frostbite)

| Gold | Effect (r1 / r2 / r3) | Bucket | Feasibility | Notes |
| --- | --- | --- | --- | --- |
| **Frostbite** (core) | your Ice moves frostbite 10% / 20% / 30% instead of freezing: 1/16 HP a turn, Sp. Atk halved | residual | Hard: a new condition with its icon and messages; Syrup Bomb's condition slot is the precedent (`moves-and-abilities.md` 4.1) | Legends: Arceus's frostbite, built in phase 4 (section 11); bosses are never frozen, but get frostbite |
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

Rewritten for the second rebalance (section 15, 2026-11-20). The first draft's numbers (buckets at most x23.6 against
bosses scaled x25 to x224) are in git history; the cards' values in sections 2-4 are the first draft's, and
`buffs.json` holds today's (attack-side steps, gold ranks and bucket caps roughly doubled, section 15.3).

### 5.1 The reference hit

A strong level-100 hit on a tanky foe, before buffs: about **400-800**, taken as **600**. It already includes STAB
x1.5, a super-effective x2 and the highest roll. Example: power 120, Sp. Atk 400 against Sp. Def 300:
`120 × 400 × 42 / 300 / 50 + 2 = 136`, x1.5 STAB = 204, x2 = 408; a stronger attacker or a frailer foe gives 800.
Chart changes (Magnetised, Spectral) turn a neutral hit into this reference; they don't go above it.

### 5.2 The targets (decided with the user, 2026-11-20)

- **A typical late build is about x15-20** (gold-tier hits: 10,000+ on a good hit); `balance.typical_factor` holds the
  band (15-22 today) and the meter marks the example build outside it.
- **An extreme build reaches x60-80**, and with a critical hit or setup it passes the 60,000 clamp (red, the top tier):
  that is fine, and the meter says so instead of warning.
- **With 5 rooms a round,** a balanced build needs about **1.5-4 typical hits** for a room enemy and **5-10 good hits**
  (super effective) for a boss's foes together across the run; an enemy's hit costs it **15-25%** of its HP, a boss's
  **25-30%** (the bosses' Attack bonus is held to x1.1 as decided, so the simulator gives 20-22% a hit, but a boss is
  two or three foes hitting each turn).

### 5.3 Buckets at their caps (the extreme build)

| Bucket | Cap of the sum | Max factor |
| --- | --- | --- |
| ATK | +150% | 2.5 |
| POW | +150% | 2.5 |
| STAB | +150 (x1.5 to x3.0) | 2.0 |
| MATCH | +60% | 1.6 |
| COND | +175% | 2.75 |
| FINAL | +40% | 1.4 |
| CRIT (a critical hit) | +75 (x2 to x2.75) | 1.375 |
| DEF | +150% | 2.5 (damage x0.4) |
| GUARD | -50% | 0.5 |

- Without a critical hit: 2.5 × 2.5 × 2.0 × 1.6 × 2.75 × 1.4 = **x77**: 600 × 77 = **46,200**.
- A critical hit (vanilla x2 on top): x77 × 2 × 1.375 = **x212**, 127,000: held to the clamp at 60,000.
- Filling every bucket needs five golds at rank 3 and a dozen blues and purples: an extreme run, as decided.

### 5.4 The example build (section 5.3 of the first draft, the user's paralysis set, about 20 picks)

Golds Galvanic II (+140% COND), Overcharge II (+120% POW), Adaptability I (STAB x2.25), Slipstream I (+20% COND),
Magnetised I; purples Type Affinity (Electric) x2 (+80% POW), Opportunist (+30% COND), Expert Edge (+20% MATCH); blues
Offense x3 (+75% ATK). ATK 1.75 × POW 2.5 (capped) × STAB 1.5 × MATCH 1.2 × COND 2.75 (capped) = **x21.7**:
600 × 21.7 = **13,000** on a good hit. One Nasty Plot (+2) doubles it.

### 5.5 Picks per run and the builds along it (the simulator)

`tools/paperwhite2/entralink_sim.py` (section 12.1, updated in 15.4) takes the expected picks of a run and three builds
(balanced: attack and defence in turn; glass cannon: attack only; defensive). With **5 rooms a round** a run gives about
**14 picks** before the final room: the glass cannon (all of them attack) reaches about **x14** on a good hit by the
final room (x10 by round 3), the balanced build (half of them attack) about x7.6. The 20-pick example is x21.7. The
tables, with the curves of 15.2, are in 15.4.

### 5.6 Vanilla extras on top

Vanilla handlers multiply outside the buckets: stat stages (+2 x2, +6 x4), Huge Power x2, Choice Band or Specs x1.5,
Life Orb x1.3, Expert Belt x1.2, weather x1.5, Helping Hand x1.5, a 4x weakness x2 over the reference.
- The typical build with one +2 setup: 13,000 × 2 = **26,000**; with Life Orb as well about 34,000, under the clamp.
- The extreme build with any of these passes the clamp, which holds it at 60,000: the red tier, the one to work toward.
- **Entries to watch:** Simple with Opening Gambit and Baton (stages x4 come cheaply), Merciless and Focus (a sure CRIT
  bucket), Spectral (super effective on any matchup: with Expert it turns a neutral hit into x3.2, 15.1's Flame
  Charge).
- **The balance meter** (the Buffs tab; `ceiling()` and `example_hit()` in `entralink_buffs.py`) computes 5.3 and 5.4
  from the data: each attack bucket's entries at their most, held to the bucket's cap, multiplied, times the reference
  hit (it leaves out the resisted-only bonuses, Glancing Blow and Tinted, and Coverage). Since rebalance 2 the
  strongest hit past the clamp is noted as fine for an extreme build; the packer and the editor warn only when the
  **example** build passes the clamp or falls outside the typical band.

### 5.7 The engine's limits

| Host event | Max from the buckets | With vanilla extras | Engine clamp (3.8) |
| --- | --- | --- | --- |
| `ATTACK_STAT` (ATK) | x2.5 | x7.5 (Huge Power, Choice, Guts) | x32 |
| `MOVE_POWER_RATIO` (POW, COND) | x6.9 | about x12 (Technician, plates) | x512 |
| `SAME_TYPE_BONUS` (STAB) | x3.0 | the same | none checked |
| `DAMAGE_RATIO` (MATCH, CRIT, FINAL, GUARD) | x3.1 | about x14 | x32 |

- **Overflow** (3.8): power stays a u16 (150 × 12 = 1,800); `power × attack × 42` = 1,800 × 12,000 × 42 = 9.1e8, under
  2^32 by x4.7. `fixed_round` saturates (phase 3), and the hit is clamped at 60,000 after `DAMAGE_CALCULATED`.

### 5.8 The defensive side

- Buffs alone: DEF x2.5 (damage x0.4) and GUARD -50%: **20% of the damage**, about 14% of the HP share with the HP
  blue. Never immunity.
- The enemies' Attack and Sp. Atk curve (15.2) is fitted so a balanced build (half its picks defensive) takes about 20%
  of its HP a room enemy's hit; a glass cannon takes 30-45% late, a defensive build 11-15%.
- Enemy Defense and Sp. Def still grow at most x1.3 (decision 3); HP carries the rest.

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
settings as `ENTRALINK_BUFF_*` values, and since phase 2 the cards' table and the offers' sources, section 9).

- **settings:** `offers` (3), `tier_odds` by source (enemy, challenge, boss, and since phase 2 gift, buff_room,
  shop), `boss_guaranteed_gold`, `shop_gold_weight`, `held_theme_weight` and (phase 2) `rank_up_weight` (percent of
  the others' weight), `gold_slots` (5), `max_rank` (3), `damage_cap` (60,000), `skip_dust` (Dream Dust for skipping
  an offer, 20), (phase 2) `gift_buff_chance` (50) and `shop_buffs` (2), `type_card_team_weight`, and the tiers'
  default `prices` in Dream Dust (blue 60, purple 150, gold 400; tunable). Section 9 says how the offers use them.
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
full value at 1 HP), `speed_gap` (at twice the target's Speed), `attack_stage` (per positive stage) or `burned_foes` (per
burned foe on the field, section 16).

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
| `status_chance_on_hit` | percent | status, condition, replaces_freeze, at_least_move_chance, ignores_immunity_at_rank | Static Field, Wildfire, Frostbite, Daze |
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

## 9. Phase 2: choosing buffs (2026-11-20)

The game now offers the cards and the run holds them; what they do in battle is phase 3. Code:
`include/paperwhite2/entralink_buffs.h`, `src/paperwhite2/main/paperwhite2_entralink_buffs.c` (what the run holds, ARM9
main, for the battle), `src/paperwhite2/ov012/paperwhite2_entralink_buff_offers.c` (the offers, the cards' text and
lists, overlay 12), the run's actions in `paperwhite2_entralink_run.c` (`ENTRALINK_RUN_ACTION_OFFER` to
`_COUNT_CARDS`, `paperwhite2/entralink_run_actions.h`) and the scripts in `res/field/scripts/global_10490.s`.

### 9.1 What the run holds

In `EntralinkRunState` (RAM only, like the rest of the run): `buffLevels[]`, one byte a card (a blue's or purple's
count, a gold's rank, 0 not held), `goldSlots[5]` (a gold's ID or free), and `typeCounts[type card][type]` (a type card's
count is the sum of its types'). `EntralinkRun_Start` and `EntralinkRun_End` empty them (`EntralinkBuffs_Clear`), so
every way a run ends (a win, a loss, the forfeit, the back door, a warp away, any map outside the forest) loses them,
and a reset finds none. Phase 3 reads them with `EntralinkBuffs_GetCount`, `_GetTypeCount`, `_GetGoldRank`,
`_GetGoldSlot`, `_GetLevel` and `_ListHeld`; the soft limits, steps and caps apply there (here a count stops at the
picks that reach a card's cap: past them a card isn't offered).

### 9.2 Offers

- **After a battle won** (a capture counts) in any room but the final one, right after the battle's Dream Dust
  message and before the room opens: `offers` cards (3). The row of `tier_odds`: a boss's, a challenge room's, else
  `enemy` (enemy and enemy-choice rooms, a rest room's bonus battle). With `boss_guaranteed_gold`, a boss's offer
  without a gold has one card (at random) redrawn as a gold.
- **A card:** its tier rolled by the row (a tier with no card left to draw doesn't count), then a card of that tier by
  weight among those whose `pools` hold the source's pool and whose `rounds` fit, below their highest level, and not
  already in the offer. Weights: the card's `weight`; a gold held that can still rank up times `rank_up_weight` (200);
  another gold of a held gold's theme, or a purple related to one, times `held_theme_weight` (200). A gold not held is
  offered whatever the slots: taking it with all five full asks for the gold it replaces. A type card's type is drawn
  among the 17 (Normal to Dark), the team's types (the run party's first and second types) weighted
  `type_card_team_weight` (300), never guaranteed; a type at the card's highest count isn't drawn.
- **Gift NPCs** (the rest room's and the pre-boss rest's): 3 cards drawn as the room is entered, each a buff of the
  gift pool at `gift_buff_chance` (50%, row `gift`), else (or if no buff fits) an item of the item table's gift pool.
  Blues have no gift pool, so a gift's buffs are purples and golds.
- **Buff rooms:** the room's offer of 3 (pool and row `buff_room`) is drawn as it is entered; talking to the buff ball
  shows it, taking one is the room's choice (B leaves it open), and no card left says so and makes the choice. The
  buff template has one ball now (it had three, which all showed the same offer).
- **Shops:** each stock adds `shop_buffs` (2) buffs of the shop pool (row `shop`, its gold percent times
  `shop_gold_weight`, 200), each at its `price` or the tier's. The Mart's screen shows only items, so a shop with buffs
  left asks first: **Items** (the Mart, as before), **Buffs** (a list with prices, a buy asked with Yes/No and refused
  without the Dust; a bought one leaves the list), **Leave**. With none left it opens the Mart at once, as before.
  Talking to it is still the room's choice.

### 9.3 The chooser and the viewer

- **A list menu** (`ListMenuAnchorTopLeft`), its lines built in C (`EntralinkBuffs_AddCardOptions` with
  `AppendListMenuOption`): each card's title in its tier's colour, a gold's with its rank's numeral (the rank taking it
  gives: "Galvanic II" for a held Galvanic I), a type card's with its type ("Type Affinity (Fire)"), a shop's with its
  price. The description is the game's own list description: the system window under the list shows the card's line
  (its rank's, wrapped to two lines; the packer and the editor refuse one that needs three) as the cursor moves.
  After a battle the last line is **Skip (+20 Dream Dust)**; B shows the cards again.
- **Colours:** the text's colour codes, `{ff00:2}` (the font palette's blue, 5 and 6), `{ff00:478}` (purple: the
  palette's magenta, 13 with 14 as its shadow, in the hack's colour code of 256 + letter × 16 + shadow) and
  `{ff00:444}` (gold: 11 with 12), and `{ff00:0}` back to the window's text colour. They read on the list's white and
  in the message window's dark alike. No rarity word.
- **Taking:** a blue or purple adds a stack ("Riku gained Big Root!"), a gold held ranks up ("Riku's buff rose to
  Galvanic II!"), a new gold takes a free slot or, with all five held, a second list of the five golds (each with its
  line) and Cancel (back to the cards) asks which it replaces ("Nightmare Field I made way for Overcharge I!").
- **The viewer:** SELECT in a run (`fieldmap_event.c`; the original's field doesn't use SELECT) lists the golds with
  their ranks, then the blues and purples with their counts (a type card a line a type), each one's line in the window,
  and the run's Dream Dust; or says none is held.
- **Debug:** Player... > Entralink buffs...: **Set a buff...** (its ID, the number entry showing its title, then a level:
  a count, or a gold's rank in its slot, a free one or else the first; 0 takes it away; a type card's count for the
  target Pokémon's first type) and **Show held** (the viewer's list).
- **Text:** the cards' titles and descriptions are the script text bank `entralink_buffs`, generated from buffs.json
  (`text_lines()`, `\from{entralink.buffs}`); the messages are global_10490's.

### 9.4 Tested (py-desmume, the user's save copy, scripts in the session's scratchpad `buffs2/`)

- **An enemy room's battle** (Dialga, room 1): the chooser after the Dust message, Big Root (purple), Sp. Atk and Guard
  (blue) with Skip; taking Big Root set its count to 1 and emptied the offer; the room opened after. Skip gave 20 Dust
  (40 to 60) and no card; B showed the cards again.
- **Ranking up:** Galvanic held at I and offered showed "Galvanic II" with its rank II line; taking it made rank 2.
- **Replacing:** five golds held, a new gold (Overcharge) taken: the list of the five and Cancel; Cancel went back to
  the offer with nothing changed; slot 2 then made Overcharge rank 1 there and Nightmare Field gone (level 0).
- **A boss:** the room's role poked to boss and the boss row to 100/0/0: two blues and one gold (the guarantee).
  **A challenge:** the room's type poked to challenge and its row to 0/0/100: three golds (the row by the room).
- **A gift:** cards mixed (for example Climate, Cold Snap I and a Super Potion); a buff taken was the room's choice.
- **A buff room:** its offer of 3 on entry, B left it open, a card taken made the choice and emptied the offer.
- **A shop:** Items / Buffs / Leave; Attack bought for 60 (500 to 440 Dust, the list keeping Technique); with 1 Dust
  "You don't have enough Dream Dust" and nothing changed.
- **The run's end:** after buying, the back door ended the run with every buff gone; a new run started with none, and
  SELECT said none is held. **The viewer** with golds, stacks and a type card ("Type Affinity (Fire) x2").
- **Debug:** Set a buff made Type Affinity 2 (Fire, the first Pokémon's type) and Galvanic rank 3 in a slot.
- **Type cards:** 10 buff rooms with every other purple poked out of the pool: 18 of 20 type cards rolled a team type
  (team of 8 types, weight 300: about 73% expected), never Normal or a NULL type.
- Build clean (no warnings in the hack's files), `verify_dsi_rom.py` intact, the plain build's modules match, Python
  tests (`test_entralink_buffs.py`, `test_entralink_run.py`) and the editor's (`tsc`, `npm test`) pass.

### 9.5 Memory

`EntralinkRunState` grew by 208 bytes (360 now, ARM9 main's BSS); the read functions are about 0.2 KB of main's code.
Overlay 12 grew by about 6.5 KB (the table, 113 cards of 20 bytes, and the offers' code), which overlay 12 being the
field's largest set moves the main arena's start: 43 KB were left before 0x023e0000, 36 KB now. The lists' strings are
heap allocations freed with the list (four of 128 characters while one is built). No VRAM.

### 9.6 Left for later

- Phase 3: the battle effects (section 10).
- Icons on the cards (the category icons in the tier palettes) wait for a screen of their own; the list shows text.
- The C-Gear's run display (a later project).

## 10. Phase 3: the battle effects (2026-11-20)

The run's buffs now work in its battles. Code: `src/paperwhite2/ov167/paperwhite2_entralink_battle.c` (overlay 167),
`include/paperwhite2/entralink_battle.h` (its hooks), the values in ARM9 main (`EntralinkBuffs_GetValue`,
`_GetKind`), and the packer's two new tables.

### 10.1 How it works

- **The data:** the packer writes `ENTRALINK_BUFF_EFFECTS` (each card's kind, bucket, condition as test bits, the
  tests' values, scale, parameter, flags, rank parameter, statuses, stats a rank, HP cost; overlay 167's, 3.2 KB) and
  `ENTRALINK_BUFF_VALUES` (a stack's step, soft limit and cap or a gold's ranks, and the kind; ARM9 main's, 0.9 KB),
  with the enumerations they use numbered from the schema (`ENTRALINK_BUFF_STAT_*`, `_STATUS_*`, `_COND_*`,
  `_HANDLER_*`...), each bucket's cap and vanilla factor, and the bosses' settings. The game implements kinds: a new
  card of an existing kind needs no code. A condition's `any` is a list of single tests (the packer refuses more), and
  the header refuses an ID that spells another name (a buff `stat_speed`).
- **Into the battle:** the run state stays in ARM9 main. At a run battle's start (`BtlServerFlow_InitWork`, battles
  with `ENTRALINK_RUN_BTL_SETUP_FLAG`) the battle reads every buff held into a table of its own (a type card once a
  type), each with its value: a gold's rank's, a stack's full step to the soft limit and half a step past it, at most
  its own cap. A boss battle (the room's role boss or final, or a raid) also has `ENTRALINK_RUN_BOSS_BTL_SETUP_FLAG`,
  set by `EntralinkRun_CreateBattle`. Only the player's side (the player's client and its ally) gets the buffs.
- **Two event items,** field effects at the lowest priority, so every vanilla handler runs first (decision 1): the
  main one with a handler a host event, and a second for the events the main one's own stat changes and statuses call
  while its handler runs (an item isn't called again while it runs: Opening Gambit's boosts must reach Simple).
- **The buckets:** each handler sums the bucket's entries whose condition holds, holds the sum to the bucket's cap and
  multiplies once: ATK (`ATTACK_STAT`), DEF (`DEFENSE_STAT`), POW and COND (`MOVE_POWER_RATIO`), STAB
  (`SAME_TYPE_BONUS`, rewritten on top of any vanilla rewrite such as Adaptability's: (150 + sum) / 150; a non-STAB move
  gets the best `non_stab` entry, Coverage), MATCH, CRIT (critical hits only, (200 + sum) / 200) and FINAL
  (`DAMAGE_RATIO` on the team's hits), GUARD (`DAMAGE_RATIO` on the hits the team takes). MATCH's entries exempt from
  its cap (Glancing Blow, Tinted) multiply apart, at most up to a neutral hit (×2 on a halved hit, ×4 on a quartered).
- **The damage clamp:** the hit's damage is first cut to 16 bits at the end of `ServerEvent_CalcDamage`
  (`*damage = result`, after `DAMAGE_CALCULATED`); there `EntralinkBattle_ClampDamage` holds a run's hit to
  `damage_cap` (60,000) and keeps the full damage, its target and whether it was cut (`EntralinkBattle_GetLastHitDamage`,
  for phase 6's numbers). `fixed_round` saturates instead of wrapping past 32 bits (every hack build; vanilla only
  differs where it overflowed).

### 10.2 The kinds built

| Kind | Where | Cards |
| --- | --- | --- |
| `stat_ratio` | ATK, DEF buckets; Speed outside them (`CALCULATE_SPEED`, each card multiplies); `ignore_burn_drop` in `ServerEvent_CalcDamage` (hook) | Attack, Sp. Atk, Defense, Sp. Def, Speed, Fire Within, Storm Speed, Bulwark |
| `damage_ratio` | its bucket; `hp_cost` after the hit (Life Orb's message); `halves_recoil_at_rank` in `CALC_RECOIL`; `immune_to` in `MOVE_CONDITION_CHECK_FAIL` | Guard, Power, Type Affinity, Type Ward, Expert Edge, Glancing Blow, Opportunist, Climate, Tough Claws, Iron Fist, Technique, Swift Hand, Pinch Power, Momentum Strike, First Blood, Giant Slayer, Galvanic, Overcharge, Dream Eater, Venom Strike, Kindling, Smoulder, Shatter (frozen foes), Cold Snap, Thaw-proof, Dizzy Strike, Heatwave, Weather Ward, Expert, Tinted, Prism, Last Stand, Blood Price, Reckless, Slipstream, Siphon |
| `stab_bonus` | STAB bucket | Kinship, Lullaby, Adaptability, Coverage |
| `crit_stage` | `CHECK_CRITICAL`; stage 5 or more is a sure critical hit in a run (hook in `ServerEvent_CheckCritical`) | Keen Edge, Merciless, Keen Eye |
| `crit_damage` | CRIT bucket | Heavy Crit, Sniper |
| `accuracy` | `GET_MOVE_ACCURACY` | Accuracy, Sure Hand |
| `residual_ratio` | `CONDITION_DAMAGE` (poison, burn, Nightmare as sleep, any), `CHECK_WEATHER_DAMAGE` (weather; `team_immune`) | Lingering Ailment, Virulence, Searing, Sandblast |
| `residual_fraction` | `TURN_CHECK` on sleeping foes, Bad Dreams' message, a fraction of one bar | Nightmare Field |
| `heal_per_turn` | `TURN_CHECK` | Regrowth |
| `heal_after_battle` | the run, after a battle won (`EntralinkRun_HealAfterBattle`): the standing Pokémon only | Vigor |
| `heal_on_damage` | after the hit (HP damage dealt) | Vampiric |
| `heal_ratio` | `CALC_DRAIN_AMOUNT` (drain); recovery moves in `ServerEvent_CalcMoveHealAmount` (hook) | Big Root, Mending |
| `recoil_ratio` | `CALC_RECOIL` | Rock Skin |
| `added_effect_chance` | `CHECK_MOVE_ADD_CONDITION`, `ADDED_STAT_CHANGE_CHANCE` | Serene Touch |
| `flinch_chance` | `ServerEvent_GetFlinchChance` (hook: the event can't add to a move that flinches) | Flinch Edge |
| `multi_hit` | `CHECK_MULTIHIT_HITS` | Second Hit |
| `pp_save_chance` | `CALC_PP_DECREMENT` | Thrifty |
| `status_chance_on_hit` | after the hit, on each foe hit | Static Field, Wildfire (without its rank-3 immunity), Daze |
| `status_duration` | `ServerControl_AddCondition` (hook): sleep's and confusion's count | Quick Recovery, Deep Sleep, Vertigo |
| `status_resist` | `MOVE_CONDITION_CHECK_FAIL`, a foe's statuses | Hardy |
| `status_cure_chance` | `TURN_CHECK_EARLY` | Shed Skin |
| `status_roll` | the fixed rolls (hooks in `ServerControl_CheckMoveFail` and `ServerControl_CheckConfusion`), on foes | Lockjaw, Madness |
| `weather_turns` | `INCREASE_MOVE_WEATHER_TURNS` (set, then add; 255 the whole battle) | Damp Rock, Stormcaller |
| `screen_turns` | `CHECK_SIDE_EFFECT_PARAM` | Light Clay |
| `endure_chance`, `endure_once` | `CHECK_ENDURE` ("endured the hit!"); Second Wind once a battle each | Focus Band, Second Wind |
| `stat_stage_on_entry` | `MEMBER_IN`, each Pokémon's first entry | Opening Gambit |
| `ability_like` | Overcoat (weather damage), Simple (doubled boosts; rank 2 halves a foe's drops; rank 3 the first boost +1), Defiance (a foe's drop: +2 Attack; rank 2 the higher attacking stat), Speed Boost (rank 1 every second turn, rank 3 +1 on entry), Afterburner (a KO: +1 Speed, rank 2 the higher attacking stat, rank 3 heals 10%), Unaware (vanilla's three events: the foe's defending stages, rank 2 its attacking ones, rank 3 accuracy and evasion) | Overcoat, Simple, Defiance, Speed Boost, Afterburner, Unaware |
| `custom` | Clear Amulet (`CHECK_STAT_CHANGE`, a count a Pokémon), Tempo (`STAT_CHANGE_AMOUNT`), Sandman (sleep moves never miss; ranks 2-3 sleep on a hit), First Strike (`GET_MOVE_PRIORITY` on the first move(s) a battle, rank 2's +25% in COND), Quick Draw (`CHECK_SPECIAL_PRIORITY`), Focus (a status move, rank 2 entering, rank 3 being hit ready a sure critical hit for the next attack) | |

**Left for phase 4** (built there, section 11): the HP blue, Spectral, Magnetised, Frostbite, Permafrost, Corrosion,
Wildfire's rank 3, Contagion, Self-harm, Forecast, Baton, Follow-through, Shattering Blow, Defiance's rank 3, Parasite,
Overflow and Thorn Guard.

### 10.3 Bosses (decisions 2 and 6)

- **Damage over time** on any foe of a run battle is a fraction of the smaller of its max HP and `boss_bar_hp` (6,000,
  until phase 5's bars; since phase 5, of one bar, section 12.3): poison, burn, bad poison, Nightmare, Curse (`BattleMon_GetResidualDamage`), Leech Seed and
  binding (`condition_effects.c`), sand and hail (`BtlCalc_GetWeatherDamage`), Nightmare Field. A foe under 6,000 HP is
  unchanged, so in effect only bosses' pools are touched. Bad poison's ramp on a boss stops at `boss_toxic_cap` (4/16).
- **Fixed damage** (Super Fang, Endeavor, Night Shade...) on a boss is capped at `boss_fixed_damage` (50%) of one bar,
  3,000; **OHKO moves and Pain Split don't affect** a boss ("It doesn't affect...").
- **Statuses:** a boss sleeps `boss_sleep_turns` (2) turns at most (Deep Sleep included), is never frozen, and its full
  paralysis chance is `boss_full_paralysis` (50%) of a foe's, Lockjaw's included (25% to 12%).
- The settings are new in buffs.json (`boss_bar_hp`, `boss_sleep_turns`, `boss_toxic_cap`, `boss_full_paralysis`,
  `boss_fixed_damage`) and on the Buffs tab's Offers section (Bosses row).

### 10.4 Tested (py-desmume, the user's save copy, scripts in the session's scratchpad `buffs3/`)

Room 1's Gardevoir battle, the lead Pignite using Flame Charge, each variant from the same savestate (the same random
state) with the battle's table written; the damage as the clamp sees it:

- None 105; Attack ×3 135 (×1.3); Adaptability I 140 (×1.33); Galvanic III on a paralyzed foe 207 (×2.0, 105
  paralyzed without it); Keen Eye III + Keen Edge ×2 a sure critical 201, with Sniper III 251 (×1.25).
- **Caps:** Type Affinity (Fire) ×4 + Tough Claws ×3 + Technique ×3 (+150%) gives 207, POW held at ×2.0 (Affinity alone
  166, ×1.6); Power ×7 + Blood Price III (+60%) gives 131, FINAL held at ×1.25.
- **Guard ×10** (+30%: five full steps and five half): the foe's hit 218 to 153.
- A second run on the final ROM (another random state, base 130) gave the same factors; **Unaware I** against a foe at
  +6 Defense: 34 without it, 130 with it.
- **The clamp:** a 1-Defense foe with 65,000 HP and a stack of buffs: the hit computed 141,699, the foe lost 60,000.
- **Bosses:** a poisoned 50,000-HP boss lost 750 to the tick (6,000 / 8); Super Fang dealt 25,000 to a normal foe and
  3,000 to a boss; Spore's sleep count 4 without buffs, 7 with Deep Sleep III, 3 (2 turns) on a boss with or without it.
- **Vigor ×3** after a battle won: a Pokémon at 10/318 HP rose to 86 (+24%), a fainted one stayed at 0.
- **From the run state:** buffs set as the debug menu sets them reach the battle's table (types a line each); a battle
  with Opening Gambit III and Simple III: Attack +3, the other four +2 ("Defense rose sharply!"); Second Wind kept the
  lead at 1 HP, Regrowth then healed 36, Vampiric 15% of a 271 hit.
- Hack build clean, `verify_dsi_rom.py` intact, the plain build's modules match, Python and editor tests pass.

### 10.5 Memory

Overlay 167 grew 0x2e80 (11.6 KB: 3.2 KB of effects table, the code, 0.5 KB of BSS for the battle's table); ARM9 main
+1 KB (the values table and two functions), overlay 12 +0.2 KB (Vigor). The DS main arena's start moved 1.2 KB: 35 KB
left before 0x023e0000. Two of the battle's 0x84 event items. No heap, no VRAM.

## 11. Phase 4: the harder effects (2026-11-20)

Every card of the catalogue now works. Code: the same files as phase 3 (`paperwhite2_entralink_battle.c`, its header's
new hooks), the max HP in ARM9 main (`paperwhite2_entralink_run_party.c`, a hook in `PokeParty_RecalcStats`), Forecast's
weather in the run state and script, and the new condition in the battle's original code (`#ifdef PAPERWHITE2`).

### 11.1 What was built

| Card | How |
| --- | --- |
| HP (blue, `max_hp`) | `PokeParty_RecalcStats` (poke_tool.c, hook) gives a run copy, found by PID while a run is on (the copies and the battle's own copies of them, never the real party), max HP × (100 + the cards' percent) / 100, at most `ENTRALINK_BUFF_MAX_HP_LIMIT` (the cards' `limit`, 999) and never below its own. Taking a card (or the debug menu's Set) works the copies' stats out again, so the gain is healed and a fainted Pokémon stays fainted; every later recalculation (the battle's switches and write-back) keeps it |
| Spectral (`type_chart`) | `ServerControl_CheckMoveEffectiveness` (hook after the two types are combined, before the immune check): the team's damaging move on a foe, with the move's own check (`flag`, once a use and target; the AI's and the menu's checks aren't rolled), rolls the cards' summed chance: a hit is super effective (×2), a type's immunity included with `overrides_immunity`. Never lowers a ×4 hit. Abilities' immunities hold: Levitate and the floats come after it (a Ground move still misses), a Wonder Guard target isn't rolled |
| Magnetised (custom) | `CHECK_FLOATING`: a paralyzed foe floats (Ground moves "doesn't affect"); in the same hook a paralyzed foe that isn't Flying counts as Flying too for the team's Electric moves (rank 2 all its moves); rank 3 a paralyzed Ground type's type counts as neutral to Electric |
| Frostbite (`status_chance_on_hit`, `replaces_freeze`) | A new condition, `CONDITION_FROSTBITE` 38 (the battle counts 39, as Syrup Bomb's 37 did: `BattleMonCore` +5 bytes): 1/16 of max HP a turn (one bar's on a boss), Sp. Atk halved (`ATTACK_STAT`, anyone's), messages "got frostbite!" and "was hurt by its frostbite!" (bank 0018), freeze's animation, and its own gauge icon "FRB" (**placeholder art**, see 11.2). It stands in for a major status: not given to a Pokémon with one (nor to Ice types, or twice), and none given to a frostbitten one. It is volatile: it ends when the foe leaves, and a caught foe keeps nothing. With the card held, the team's freezes become frostbite (`CHECK_MOVE_ADD_CONDITION`), and its Ice moves frostbite by the rank's chance after the hit. The `frostbite` status and residual source of the conditions and `residual_ratio` now mean it |
| Permafrost (custom) | `TURN_CHECK`: a frostbitten foe -1 Speed (rank 2 and Attack, rank 3 and Sp. Atk) |
| Shatter | its condition (frostbitten or frozen) now holds on frostbite |
| Corrosion (custom) | `ServerControl_AddConditionCheckFail` (hook on the type-immunity cause): the team poisons Steel and Poison types (Toxic too); rank 2 the team's poison is bad poison (`EntralinkBattle_GetConditionValue`); rank 3 its counter starts a turn on (2/16 first, `CONDITION_CONFIRMED`) |
| Wildfire rank 3 | the same hook: a `status_chance_on_hit` card from its `ignores_immunity_at_rank` gives its status past the type's immunity (Fire types burned) |
| Contagion (custom) | `BEFORE_FAINT`: a poisoned foe that faints poisons the foes beside it (its side's next positions; as the team's poison, so Corrosion applies); ranks 2-3 the team's Poison moves poison by the rank's percent after the hit |
| Self-harm (custom) | `ServerControl_ConfusionDamage` (hook): a foe's self-hit power 40 × the rank's percent |
| Forecast (custom) | Taking it the first time asks for the weather (a list after the "gained" message: Harsh sunlight, Rain, Sandstorm, Hail, each with its line; B asks again), kept in the run state (`forecastWeather`, emptied with the buffs; `ENTRALINK_RUN_ACTION_FORECAST`). The team's first entry in a battle starts it for the rank's turns (3 / 5 / 8) unless the battle has a weather already, so a room's set weather (or the zone's) wins (decision 10). A card set by the debug menu, with no choice, gives sun |
| Baton (custom) | `SWITCH_OUT` keeps a team Pokémon's stages for its position, `MEMBER_IN` gives them to the one entering (`BATTLE_HANDLER_SET_STAT_STAGE`, no message, not amounted by Simple): rank 1 its boosts at half, rank 2 every stage (as Baton Pass: drops too), rank 3 its boosts in full (drops dropped), as the cards' lines say. A stage higher than the entering Pokémon's own replaces it; a fainted Pokémon keeps nothing |
| Follow-through, Shattering Blow (custom) | `DAMAGE_REACTION` on the team's critical hit on a foe: the attacking stat +1 (rank 2 and Speed +1, rank 3 the stat +2); the defence it hit -1 (rank 2 and the other -1, rank 3 the one hit -2; not through a substitute) |
| Defiance rank 3 | `CHECK_STAT_CHANGE`: a foe's drop on the team is blocked and still gives the +2 |
| Parasite (`residual_fraction`, leech_seed) | `ConditionEndTurnLeechSeed` (hook, `EntralinkBattle_GetLeechSeedDamage`): a foe's drain is the rank's fraction of one bar (vanilla 1/8), times the residual buffs (`leech_seed` and `any` sources); rank 3 a seeded foe that faints seeds the foes beside it, draining to the same position |
| Overflow (custom) | `ServerControl_RecoverHPCore` (hook): every heal of the team (moves, drain, Leech Seed, items, Regrowth, Vampiric...) that passes max HP deals the rank's percent of the excess to the foe opposite (else the first), "[foe] was hurt!". A heal at full HP is still refused before it, so only heals that cross the max overflow |
| Thorn Guard (custom) | After Protect's block message (`ServerControl_RemoveNoEffectTargets`, hook): the team's protected Pokémon heals 1/the rank's value of max HP (which can overflow), and a foe's blocked contact move costs it 1/8 of its max HP (one bar's on a boss) |

Also: the packer numbers the game's custom handlers in a fixed order (`GAME_HANDLERS`), so a catalogue without one of
them still builds (one the game doesn't know is numbered after them and does nothing); Nightmare Field now finds its own
card when Parasite (the other `residual_fraction`) is held too.

### 11.2 The frostbite icon (placeholder)

The status icons are app_menu_common's 012 (characters, a row of 4 tiles an icon), 013-015 (cells, one a VRAM mapping)
and 016-018 (animations). Row 8 is new, "FRB" from FRZ's colours with BRN's B; the cells and animations gain an empty
cell and sequence 8 (the screens' "no status" sequence had none) and the icon's 9. The battle's gauge shows it
(`GAUGE_FROSTBITE_STATUS` 7 to sequence 9). The summary and party screens never see frostbite (it is volatile). The user
may redraw row 8 on the Sprite sheets page.

### 11.3 Tested (py-desmume, the user's save copy, scripts in the session's scratchpad `buffs4/`)

Darkrai's single battle (room 2) from one command menu each, the lead Pignite with test movesets set on its run copy,
Darkrai's moves set in the room table, the battle's table written; Ho-Oh's double battle for the spreads:

- **Spectral:** Shadow Ball on a Normal-typed foe: no damage without, 138 (super effective, "It's super effective!",
  screenshot) at 100%; a neutral Thundershock became ×2.
- **Magnetised:** Thundershock on a paralyzed Ground type: none without or at I, 70 at III (×2: neutral Ground, Flying);
  Mud-Slap on a paralyzed foe: 18 without, missed at I; Thundershock on a paralyzed Dark type 35, 70 at I.
- **Frostbite:** Powder Snow with Frostbite III: frostbitten, "got frostbite!", 375 a turn (6,000 / 16), "was hurt by
  its frostbite!", the FRB icon (screenshot); Powder Snow's own freeze (Serene Touch ×10) became frostbite with the card
  and stayed freeze without; Permafrost III: Speed, Attack, Sp. Atk -1; Shatter III 54 to 93; a frostbitten foe's Dark
  Pulse 62 to 31.
- **Corrosion:** Toxic on a Steel type: nothing without, badly poisoned at I; Poison Powder: bad poison at II (187, 1/16),
  374 at III (2/16), plain poison 375 without. **Wildfire:** Ember on a Fire type burned at III, not at II.
- **Self-harm III:** a confused foe's self-hit 25 to 73 (Madness at 100%).
- **Follow-through III + Shattering Blow III** on a sure critical Ember: Sp. Atk +2, Speed +1; the foe Sp. Def -2,
  Defense -1; at I and II with Tackle: Attack +1; Defense and Sp. Def -1.
- **Defiance:** a Growl: Attack -1 without, +1 at I (-1, +2), +2 at III (blocked).
- **Parasite:** Leech Seed on a 3,000-HP foe 375, 500 at I, 750 at III. **Contagion and Parasite's spread:** Ho-Oh,
  seeded and poisoned, fainted: Lugia beside it was poisoned and seeded.
- **Overflow III:** Regrowth's 36 on a lead 10 below max: the foe lost 26. **Thorn Guard III:** Protect against Tackle
  healed 73 (1/4) and the foe lost 375 (1/8).
- **Baton** (the lead at +2 Attack, -2 Defense switched for Klink): Klink +1 at I, +2/-2 at II, +2 at III.
- **Forecast:** taken from an offer: the weather list (screenshot), B asked again, Rain chosen and kept; a battle with
  Forecast II started "It started to rain!".
- **HP:** the third HP card taken: the copies' max HP +24% (Pignite 293 to 363, Klink 215 to 266), each healed by the
  gain; earlier, two poked cards were applied by the battle's own recalculations.
- Not checked in the emulator: Contagion's on-hit poison (Smog poisoned by its own chance in both runs), the 999 limit,
  Wonder Guard and Levitate with Spectral (code paths read).
- Hack build clean, `verify_dsi_rom.py` intact, the plain build's modules match, Python and editor tests pass.

### 11.4 Memory

Overlay 167 about +2.9 KB of code and 38 bytes of BSS (`sBattle`: Forecast's flag, Spectral's count, Baton's stages);
ARM9 main about +0.25 KB (the max HP and Forecast's reads), so the main arena's start moves about 0.25 KB; overlay 12
+0.1 KB; a `BattleMon` +4 bytes (the new condition), from the battle's heap; the status icons' characters +128 bytes
of OBJ VRAM where they're loaded. Two new texts in bank 0018 (6 lines), nine in the run script's bank.

### 11.5 Calls made, for the user

- Frostbite is a volatile condition that behaves as a major status (excludes and is excluded by them), rather than a
  sixth major status: no party, summary or save changes, and a caught foe loses it.
- Baton's rank 2 carries drops too, rank 3 only boosts, as the cards' lines read.
- Spectral skips Wonder Guard targets (a super-effective hit would pass it); Magnetised's float affects every Ground
  move on the paralyzed foe, the foes' too.
- Forecast is chosen once, the first time it is taken; a rank-up keeps the choice.

## 12. Phase 5: enemy scaling and health bars (2026-11-20)

The run's enemies now grow with its depth, and a foe whose HP passes one bar shows stacked health bars. Code: the
simulator `tools/paperwhite2/entralink_sim.py`; the curves in `run.json` (`enemy_scaling`) and each enemy's `scale`
(room data), packed by `entralink_run.py`; the multipliers chosen in overlay 12 (`EntralinkRun_SetEnemyScale`, into
`EntralinkRunState.enemyScale`); the scaling in overlay 167 (`EntralinkBattle_ScaleMon`, `_ScaleHP`, `_ScaleStats`,
`_GetSrcHP`, hooks in `btl_main.c` and `btl_pokeparam.c`); the bars' rule in `include/paperwhite2/entralink_bars.h`;
their drawing in overlay 168 (`src/paperwhite2/ov168/paperwhite2_health_bars.c`, hooks in `btlv_gauge.c`).

### 12.1 The simulator and the starting curves

`entralink_sim.py` models a run from the data (its docstring has the model): run.json's rounds and room-type weights,
the expected picks a place gives (buffs.json's tier odds by source, gifts, buff rooms, a shop half the time), three
builds taking them (balanced: attack and defence in turn; glass cannon: section 5.3's themed attack only; defensive),
the buckets' maths, and Gen 5's damage formula at level 100 (a dedicated attacker, base 110 and full EVs; the rest base
90) against the rooms' level-70 enemies (base 95). `--fit` proposes curves from the decisions: Defense and Sp. Def to
×1.3 by the final room; Speed so the final room's enemy is about as fast as the unbuffed team; room HP so a balanced
build needs 2.5 typical hits in the first room growing to 4; bosses 6 and 9 of its strong hits, the final room 50,000;
Attack and Sp. Atk so a room enemy's hit costs a balanced build the share it costs in the first room (about 17%) and a
boss's three times that. The curves in run.json are its proposal, rounded and smoothed by hand. `--markdown` prints:

| Place | Picks | Enemy HP | HP, Atk, Def, Spe % | Balanced: hit, hits (strong) | Balanced: hit taken | Glass cannon: hits (strong) | Glass cannon: hit taken | Defensive: hit taken |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 room 1 | 0 | 580 | 260, 100, 100, 100 | 228, 2.5 (0.6) | 17% | 2.5 (0.6) | 17% | 17% |
| R1 room 2 | 0 | 658 | 295, 105, 105, 105 | 218, 3.0 (0.8) | 17% | 3.0 (0.8) | 17% | 17% |
| R1 room 3 | 2 | 736 | 330, 110, 110, 110 | 255, 2.9 (0.7) | 18% | 2.9 (0.7) | 18% | 16% |
| R1 boss | 2 | 6,132 | 2750, 300, 110, 115 | 255, 24.1 (6.0) | 49% | 24.1 (6.0) | 49% | 44% |
| R2 room 1 | 4 | 1,226 | 550, 110, 110, 115 | 408, 3.0 (0.8) | 17% | 2.8 (0.7) | 18% | 12% |
| R2 room 2 | 4 | 1,260 | 565, 120, 115, 120 | 388, 3.2 (0.8) | 19% | 3.0 (0.7) | 20% | 13% |
| R2 room 3 | 5 | 1,293 | 580, 130, 120, 125 | 372, 3.5 (0.9) | 20% | 2.9 (0.7) | 22% | 13% |
| R2 boss | 6 | 14,718 | 6600, 330, 120, 130 | 406, 36.2 (9.1) | 49% | 30.4 (7.6) | 54% | 31% |
| R3 room 1 | 6 | 1,450 | 650, 120, 120, 135 | 406, 3.6 (0.9) | 18% | 3.0 (0.7) | 20% | 12% |
| R3 room 2 | 7 | 1,550 | 695, 135, 125, 140 | 431, 3.6 (0.9) | 20% | 3.0 (0.8) | 22% | 12% |
| R3 room 3 | 9 | 1,650 | 740, 150, 130, 145 | 414, 4.0 (1.0) | 16% | 2.8 (0.7) | 25% | 11% |
| R3 final | 9 | 49,952 | 22400, 450, 130, 150 | 414, 120.5 (30.1) | 46% | 84.1 (21.0) | 73% | 33% |

"Hits" are a lone attacker's typical hits to faint the enemy, "strong" a super-effective hit after one +2 setup;
"hit taken" is the enemy's typical hit as a share of the build's HP. What it shows:
- Room enemies stay at 2.5-4 hits and about 17-20% a hit for a balanced build all run; a defensive build takes 11-13%,
  a glass cannon up to 25%. A boss hits a balanced build for about half its HP and a glass cannon for 73% at the end,
  so a boss's super-effective hit one-shots a team without defence, as decided.
- **The final room at 50,000 is long with today's run.json:** 3 rooms a round give only about 9 picks, so a strong
  late hit is about 1,600-2,400, and the final takes 21-30 strong hits of one attacker (7-10 turns of a raid's three).
  The decision's "a few turns of a strong build" assumed section 5.4's ~20 picks; `--rooms 5` (a 20-place run) gives
  14 picks and still 21-32 strong hits. Lowering `boss[2]` of HP (22,400%) is the one-number lever if playtests
  agree; I kept 50,000 as decided.
- The model is deliberately plain: real enemies differ in base stats and moves, and players pick for their team.

### 12.2 Scaling in battle

- **The data:** `enemy_scaling` in run.json, for each of HP, Attack, Defense, Sp. Atk, Sp. Def and Speed: a room curve
  (`start`, `end`, `curve`) and a `boss` value for each round (round 3's is the final room). Each room enemy has `scale`
  (percent, 100 by default) on top, on every stat: the lever for Darkrai. Phase 5 first had the first room's value and
  a step for each round, and raids took the boss values; section 12.7 replaced that (2026-11-20).
- **In the run (overlay 12):** `EntralinkRun_CreateBattle` works out each enemy's six percents (the room's depth across the run, or the boss values; times its scale; at most 65,535) into `EntralinkRunState.enemyScale`.
- **In the battle (overlay 167):** `PokeCon_CreateClientParty` creates the battle's Pokémon for the server's and the
  client's copies; for a run battle's foe it marks the `BattleMon` with its party slot (`BattleMonCore.entralinkScale`)
  and scales its max HP, HP and stats. `setupBySrcData` and `setupBySrcDataBase` re-read them from the party data
  (switch-ins, form changes) and scale them again, so they stay scaled. The marker is in the core, which Transform
  keeps: a Pokémon transformed into an enemy copies its scaled stats (vanilla's rule) but isn't scaled itself.
- **Caught foes keep their own stats:** the party data is never scaled; `BattleMon_WriteToSrc` gives a scaled foe's
  source its share of its own max HP (777 of 1,591 became 111 of 229).
- **HP past 999:** the battle's HP is 16 bits throughout (max 65,535; the server's HP commands carry 16 bits; the
  damage clamp is 60,000), the gauge's sums fit in 32 bits, and the foe's HP numbers (vanilla's three digits, never
  shown for a foe) are skipped past 999.

### 12.3 Health bars

- **The rule (the simplest readable):** a foe with more max HP than `boss_bar_hp` (now **5,000**) shows ceil(max HP /
  5,000) bars, at most 10, of equal size: ceil(max HP / bars). A 50,000-HP boss has 10 bars of 5,000, a 15,000 one 3
  bars, a 43,000 one 9 of 4,779. Bar 1 (the last) may hold a little less, so that the top bar is full at full HP.
- **Drawing:** the current bar fills the gauge's 48 pixels and drains; behind it, where vanilla shows the empty white
  and gray, the next bar's colour. Bar 1 is vanilla's bar by its own HP (green, yellow, red). Bars 2-10 take
  `bar_colors` (buffs.json, 9 colours, editable on the Buffs tab's Offers section; each bar's dark rows its colour at
  55%): blue, purple, orange, cyan, magenta, gold, indigo, teal, white, chosen so each contrasts with the one below,
  and without red or yellow, which read as low HP. The colours go into the gauge's own palette (each gauge has one):
  the current bar in the green bar's entries, the bar behind in the red bar's, or for a female foe (whose sign is red)
  in the Exp. bar's blue. The yellow entries are the level's "Lv", left alone.
- **The count:** "×N", the bars left with the current one, from 2 up, in the gauge's HP-numbers actor (unused on a
  foe's gauge) under the bar's right end; gone on the last bar.
- **Speed:** past 999 max HP the bar drains a bar in about 32 frames (vanilla: 1 HP a frame, which at 50,000 HP would
  take minutes). The lost HP's blink is left out on a gauge with bars.
- **Damage over time:** a fraction of one bar (`EntralinkBattle_GetResidualMaxHP`: the bar's HP; a foe with one bar,
  its max HP), so poison on a 43,008-HP Darkrai (9 bars of 4,779) ticks 597; the fixed-damage cap is half a bar.

### 12.4 Tested (py-desmume, the user's save copy, scripts in the session's scratchpad `buffs5/`)

Battles started from the run's room 1 through a door to a chosen room, with the run's place set by hand; the foe's
stats in battle against its party data:
- **Room 1** (the Rayquaza raid, round 1's boss values): max HP 6,627 (×27.5), Attack and Sp. Atk ×3.
- **Round 1, room 2** (Dialga): HP 234 to 690 (×2.95), the others ×1.05. **Round 3, room 2:** 1,626 (×6.95), Attack and
  Sp. Atk ×1.35, Defense and Sp. Def ×1.25, Speed ×1.4. Both copies (server and client) the same.
- **The final room** (Darkrai, place 15): 43,008 / 41,888 HP in two runs (×224), Sp. Atk 792-967 (×4.5), defences ×1.3,
  Speed ×1.5. **Its `scale` at 150** (poked in the room table): ×336 → 64,512 HP, ×6.75, ×1.95, ×2.25.
- **Round 2's boss** (the Dialga, Giratina, Palkia triple): 15,114 HP each, ×66; three gauges with 4, 5 and 3 bars,
  each in its own colours (screenshot `shots/tri_menu.png`).
- **Draining:** the lead at 65,535 Attack hit Darkrai four times (Arm Thrust, about 6,000 each): the gauge drained from
  9 bars (teal) through indigo, gold and pink to 5, "×9" to "×7", the "Lv" kept its gold (`shots/dk2_*.png`).
- **Poison per bar:** Darkrai at 43,008 (9 bars) lost 597 a turn, one bar's 1/8.
- **A catch:** Dialga in round 3's room 2, made catchable, at 777 / 1,591: caught at level 70 with 111 / 229 HP and its
  own stats (229, 171, 194, 150, 236, 146).
- Hack build clean, `verify_dsi_rom.py` intact, the plain build's modules match, Python tests (the packers', the new
  simulator's) and the editor's tests pass; the editor's Run section and enemy card checked in a screenshot.

### 12.5 Memory

ARM9 main +64 bytes (the run state's 36-byte `enemyScale`), overlay 12 +0.4 KB (the curves and their code), overlay
167 +0.5 KB, overlay 168 +1.4 KB (the bars); the DS main arena's start moved 0.5 KB, 34 KB left before 0x023e0000. A
`BattleMon` +4 bytes (the marker; up to 24 a copy, from the battle's heap), a gauge +10 bytes. No VRAM: the bars reuse
the gauge's tiles, palettes and HP-numbers actor.

### 12.6 Calls made, for the user

- (Replaced by 12.7: raids take the room curve, times a raid HP factor.)
- The per-enemy `scale` multiplies every stat (Defense and Speed too), as a plain "harder/easier" knob.
- The bars' rule is a fixed most HP a bar (5,000) with equal bars, at most 10; the count is "×N" under the bar.
- The final room's ~50,000 is kept though the simulator says it is long for today's run length (12.1).
- Speed scales to ×1.5 by the end: late enemies match an unbuffed team, the Speed blue wins it back.
- Not done: a Pokémon transformed into a scaled enemy copies its scaled stats (vanilla Transform); the bar count in a
  triple battle sits tight between the stacked gauges.

### 12.7 Rebalance (2026-11-20)

(Bosses since rebalance 2, section 15.2: the room curve times a boss bonus, not absolute values; the tables below are the first rebalance's.)

After the user's first playtest: room 2 was the Rayquaza raid, which phase 5 had given round 1's boss values (6,627 HP,
×27.5, Attack ×3), so their Dipplin's Dragon Breath, which one-shot it unscaled, barely dented it. Changed:

- **Raids use the room curve,** not the boss values, and their HP takes an extra factor, `raid_hp_factor` in run.json
  (3.0; the three attackers; the other stats as the room's). A raid as a boss or final room (none today) keeps the
  boss values.
- **The room curve is `start`, `end` and `curve` for each stat, keyed by depth across the whole run:**
  percent = start + (end - start) x depth^(curve / 100), the depth 0 in the run's first room to 1 in its last room
  (before the final), by the room's place among all the run's rooms. Curve 100 is a straight line, 200 squares the depth:
  it stays near `start` for the first rooms and climbs late (the buffs multiply late). The editor's table shows one row a
  stat: First room, Last room, Curve, Boss R1..R3, with a Raid HP box below. The packer works the curve out for every
  room (`entralink_run.room_percent`) into a table of up to 24 percents a stat, so the game only indexes it
  (`EntralinkRun_GetRoomDepth`; no maths on the DS).
- **Keyed by depth across the run, not by position in a round**, so that changing a round's rooms keeps the arc: the
  first room is always at `start`, the last at `end`, and a 5-room round is a finer sampling of the same curve instead of
  running past the last round's end value or restarting each round. The boss values stay per round (they don't depend
  on the room count).
- **Values (run.json):** HP 140% rising to 750% (curve 130), Attack and Sp. Atk 100 to 150 (curve 200), Defense and
  Sp. Def 100 to 130 (curve 150), Speed 100 to 145 (curve 150); the bosses unchanged (HP 2,750 / 6,600 / 22,400, the
  last the final room at about 50,000 HP, Attack and Sp. Atk 300 / 330 / 450, Defense and Sp. Def 110 / 120 / 130,
  Speed 115 / 130 / 150). `entralink_sim.py --fit` now proposes start, end, curve and bosses (targets: the balanced
  build's hits to kill 1.5 in the first room rising to 4 in the last, its hit taken level at about 17%); I rounded its
  proposal by hand, and curved HP 130 instead of its straight line so the first rooms stay lighter.

Simulated, balanced build, **3 rooms a round (run.json's, 9 rooms):**

| Place | Buff picks so far | Enemy HP | Balanced build's typical hit | Hits to kill | Enemy hit, share of HP |
| --- | --- | --- | --- | --- | --- |
| R1 room 1 | 0 | 312 | 228 | 1.4 | 17% |
| R1 room 2 | 0 | 404 | 226 | 1.8 | 17% |
| R1 room 3 | 2 | 537 | 268 | 2.0 | 17% |
| R1 boss | 2 | 6,132 | 255 | 24.1 | 49% |
| R2 room 1 | 4 | 691 | 418 | 1.7 | 17% |
| R2 room 2 | 4 | 865 | 402 | 2.2 | 18% |
| R2 room 3 | 5 | 1,050 | 388 | 2.7 | 18% |
| R2 boss | 6 | 14,718 | 406 | 36.2 | 49% |
| R3 room 1 | 6 | 1,249 | 409 | 3.1 | 19% |
| R3 room 2 | 7 | 1,456 | 431 | 3.4 | 21% |
| R3 room 3 | 9 | 1,672 | 414 | 4.0 | 16% |
| R3 final | 9 | 49,952 | 414 | 120.5 | 46% |

**5 rooms a round (15 rooms), the same data:**

| Place | Buff picks so far | Enemy HP | Balanced build's typical hit | Hits to kill | Enemy hit, share of HP |
| --- | --- | --- | --- | --- | --- |
| R1 room 1 | 0 | 312 | 228 | 1.4 | 17% |
| R1 room 2 | 0 | 357 | 226 | 1.6 | 17% |
| R1 room 3 | 2 | 421 | 273 | 1.5 | 17% |
| R1 room 4 | 2 | 495 | 272 | 1.8 | 17% |
| R1 room 5 | 3 | 580 | 267 | 2.2 | 16% |
| R1 boss | 3 | 6,132 | 255 | 24.1 | 47% |
| R2 room 1 | 5 | 669 | 421 | 1.6 | 16% |
| R2 room 2 | 6 | 765 | 450 | 1.7 | 16% |
| R2 room 3 | 6 | 865 | 439 | 2.0 | 17% |
| R2 room 4 | 7 | 970 | 433 | 2.2 | 16% |
| R2 room 5 | 8 | 1,077 | 467 | 2.3 | 17% |
| R2 boss | 9 | 14,718 | 484 | 30.4 | 46% |
| R3 room 1 | 10 | 1,191 | 495 | 2.4 | 13% |
| R3 room 2 | 11 | 1,307 | 481 | 2.7 | 13% |
| R3 room 3 | 12 | 1,425 | 470 | 3.0 | 13% |
| R3 room 4 | 12 | 1,548 | 460 | 3.4 | 14% |
| R3 room 5 | 13 | 1,672 | 484 | 3.5 | 14% |
| R3 final | 14 | 49,952 | 528 | 94.6 | 42% |

What it shows: with 3 rooms a round the balanced build needs 1.4 hits in the first room (an unscaled enemy takes 1)
and 4.0 in the last, in steps (1.4, 1.8, 2.0, 1.7, 2.2, 2.7, 3.1, 3.4, 4.0: the dip at the start of round 2 is a round
of picks arriving at the boss); an enemy's hit stays 16 to 21% of the build's HP. Rooms 1 and 2 are at ×1.4 and ×1.8 HP,
Attack and the defences nearly ×1. The late rooms and the final room are where phase 5 had them (round 3's last room
750% against 740%, the final room 49,952 HP). **5 rooms change** little in the curve (the same ends, smaller steps) but
the player takes more picks along it (14 before the final against 9), so the later rooms are easier for the build
(2.4 to 3.5 hits in round 3 against 3.1 to 4.0) and the bosses, whose values don't change, fall shorter
(the final room 95 strong hits against 120); someone running 5 rooms would want somewhat higher boss values (a `boss`
edit only).

Tested (py-desmume, the user's save copy, scripts in the session's scratchpad `rebalance/h/`; the stats of the foe in
battle, its party data's in brackets):
- **The Rayquaza raid in round 1** (place 2): max HP **1,270** (234, ×5.43: the curve's ×1.81 times 3), Attack 238
  (236), the others ×1.01 to ×1.02. Before: 6,627 HP (×27.5) and Attack ×3.
- **Round 1, room 1** (Dialga, place 1): HP **324** (232, ×1.40), the other stats ×1.00. Before: ×2.6 HP and ×1.0.
- **Round 3, room 3** (Dialga, place 13): HP 1,740 (×7.5), Attack and Sp. Atk ×1.5, Defense and Sp. Def ×1.3, Speed
  ×1.45. Before: ×7.4, ×1.5, ×1.3, ×1.45.
- **The final room** (Darkrai, place 15): HP 42,560 (×224), Sp. Atk 954 (×4.5), Defense and Sp. Def ×1.3, Speed ×1.5:
  as before (43,008 and 41,888 in phase 5's runs, which differ by the Pokémon's rolled stats).
- The hack build is clean (the data warnings are the rooms'), `verify_dsi_rom.py` intact, the packers' and simulator's
  tests and the editor's (`tsc`, `npm test`) pass, and the plain build's modules match.

Calls I made:
- A polynomial curve (start, end, exponent) rather than a growth multiplier a room: a growth rate per room would
  depend on the room count, the exponent doesn't.
- The raid's other stats follow the room's; only HP takes the factor. A raid in a boss or final room takes the boss values
  without the factor.
- The user's 3 rooms a round are untouched.

## 13. Phase 6: damage numbers and a foe's HP numbers (2026-11-20)

Each hit of the team's on a foe pops its damage over the foe, and a foe's gauge shows its HP to five digits with the
bars left. Code: `src/paperwhite2/ov168/paperwhite2_damage_numbers.c` (`include/paperwhite2/damage_numbers.h`), the
server's `EntralinkBattle_PutDamageNumbers` and the per-target damage in `EntralinkBattle_ClampDamage`
(`paperwhite2_entralink_battle.c`), the new server command `SC_DAMAGE_NUMBER` (`btl_server_cmd.h`, its client
handler in `btl_client.c`), the HP line in `paperwhite2_health_bars.c`; the sheet's tool
`tools/paperwhite2/damage_digits.py`; the settings `buffs.json`'s `settings.damage_numbers` (the editor's Entree →
Buffs, **Damage numbers** section).

### 13.1 How it is drawn

- **3D, not OBJ.** The numbers are textured quads drawn after the scene's 3D each frame (`BtlvEffect_Main`, after the
  particles), in an orthographic projection of the screen. A polygon has its own alpha (0-31) and any size, so the
  number can start very large and see-through and shrink smoothly. OBJ couldn't: a double-size affine OBJ clips past
  ×2, and see-through OBJ use the one blend register pair that the message window's fade owns (`BtlvScuWinFade`). So
  the numbers use **no OBJ, no affine parameters and no 2D palette**; they sit over the Pokémon and effects and under
  the gauges and the message window (OBJ and BG1 are above the 3D layer).
- **VRAM:** each digit of each sheet row is a 16×32 texture of 16 colours (256 bytes): 10 KB of texture VRAM with the
  sheet's 4 rows, at 0x3500 in a battle (the stage's textures below it; the Pokémon sprites' fixed area starts
  at 0x24000, so there is room). Each colour tier is a 16-colour palette in texture palette VRAM (5 tiers: 160 bytes,
  at 0x1c0, below the sprites' 0x1000), which the packer makes (13.8) and a number is drawn in. Loaded once a battle
  by the VRAM transfer manager; the 10.4 KB file is in the battle's heap for three frames only. If either allocation fails, the battle simply shows no numbers.
- **Timing:** the server puts `SC_DAMAGE_NUMBER (target, flags, full damage)` just before each hit's damage display
  (`ServerControl_DamageListCore`, before `ServerDisplay_Damage` puts `SC_OP_SUBTRACT_HP`), so the client pops the
  number as the hit's HP drain starts, once per hit of a multi-hit move and once per foe of a spread move. Nothing waits
  for it. A new number on a Pokémon sends its last one into its fade; six can be up at once.
- **Which hits:** the attacker on the player's side (the lead or a partner), the target a foe; direct hits only (not a
  substitute's, not recoil, poison or confusion). The number is the hit's **full computed damage** (overkill
  included), at most the damage cap in a run (60,000: a capped hit shows 60 000, red).
- **Where:** the foe's position on screen as the battle camera shows it at rest (13.9), `height` pixels over its feet,
  kept 4 pixels inside the screen at every size; fixed once it pops (the camera's moves during an attack don't carry it).

### 13.2 The animation (all settings, `settings.damage_numbers`)

| Setting | Now | What |
| --- | --- | --- |
| `battles` | `run` | `off`, `run` (the run's battles), `all` (every battle but link battles) |
| `start_scale`, `start_alpha` | 300, 8 | it appears at 300% and 8/31 opaque... |
| `shrink_frames` | 5 | ...and shrinks to 100% and opaque in 5 frames, ease-out (the square of the frames left) |
| `hold_frames` | 30 | holds |
| `fade_frames`, `rise` | 12, 10 | fades out over 12 frames, rising 10 pixels |
| `height` | 48 | pixels over the Pokémon's feet |
| `overlap`, `group_space` | 2, 4 | pixels each digit's glyph overlaps the one before (the digits spaced by their glyphs' widths, 13.9); the gap before the thousands (`12 345`) |
| `shine` | `critical` | the shine rows play: `off`, `critical` (critical hits and hits at the cap), `always` |
| `shine_frame_time`, `shine_delay` | 2, 2 | frames a shine row shows; the delay from one digit to the next (a sweep left to right) |
| `hp_numbers` | true | a foe's gauge shows its HP in the run's battles |
| `outline` | `#151515` | palette entry 1, the outline, in every tier |
| `tiers` | 0 white, 1,000 blue, 5,000 purple, 10,000 gold, 40,000 red | each `{from, colors}`: entries 2-5 (13.8) |

The ease is one function, `DamageNumbers_Scale`: an elastic curve (overshoot and settle) goes there later. The shine
starts once the number has landed.

### 13.3 The sheet spec, for the user's art

`res/paperwhite2/battle/damage_digits.png`, on the Graphics & Palettes → **Sprite sheets** page as "Damage numbers'
digits" (it checks an import, previews it with a sample `12 345` in each tier, edits its 16 colours, and has the
**Tier colours** panel, 13.8). The user's art replaced the placeholder on 2026-11-20 (4 rows: the digits and 3 shine
frames, indices 0-5 only):
- **An indexed PNG of 16 colours, 160 pixels wide.** Cells of **16×32**, the digits **0 to 9 left to right**, every 16
  pixels; each cell keeps **one blank column at each side** (the glyph is at most 14 wide). The check warns if a cell
  draws in its side columns.
- **Row 1** (y 0-31) is the digits as they show. **Each row under it is one shine frame**, played in order and back to
  row 1: 1 to 8 rows in all, so the height is 32, 64, ... up to 256 (the placeholder has 4: 3 shine frames). The game
  reads the row count from the sheet.
- **Index 0 is transparent; 1 is the outline** (every tier's); **2-5 are the tier colours**: 2 the dark shadow, 3 the
  light shadow, 4 the main colour, 5 the shine (the "reflection" the shine rows animate). Each tier replaces 1-5 with
  the settings' outline and its four colours, so the sheet's own 1-5 are only a preview (the user's sheet has the white
  tier's). Entries 6-15 show as the sheet has them in every tier.
- **Layout in game** (13.9): each digit's glyph is its opaque columns in row 1 (measured by the packer); each glyph is
  placed `overlap` (2) pixels into the one before, plus `group_space` (4) before the thousands; no comma, no "MAX". Each
  digit is drawn over the one before. A narrower 1 or 7 simply takes less room.
- `tools/paperwhite2/damage_digits.py placeholder` writes a placeholder (bold digits in the main colour above and
  the light shadow from two-thirds down, a band of the shine colour sweeping across them in the shine rows).

### 13.4 A foe's HP numbers

In the run's battles a foe's gauge shows its HP under its bar, right-aligned to the bar's end: up to 5 digits in the
gauge's own slanted digits, 7 pixels apart, a 2-pixel gap before the thousands, then `×N` (the bars left, phase 5) after
a 3-pixel gap: `43 232 ×9`, at most 62 pixels. The foe's HP-numbers actor (vanilla's, unused on a foe) takes a new
64-pixel cell (two 32×8 pieces, the archive's member 574, made from vanilla's member 457 by `damage_digits.py`). The
number follows the drain. Outside the run a foe's gauge is as vanilla (the HP line shows only past 999 max HP, which
only a run foe has).

### 13.5 Tested (py-desmume, the user's save copy, scripts in the session's scratchpad `buffs6/h/`)

Battles entered from the run's room 1 through a door at a set place (`t6.py make`), the foes' moves set to Splash where
it held and the lead's Attack poked to reach each tier; `PaperWhite2_DamageNumbersShow` and `ClampDamage` hooked:
- **Single** (Dialga, place 2): Arm Thrust's three hits popped 38, 36, 36, one per hit as its drain starts; the foe's
  hit on the lead showed none. Frames 0-1 nothing (the 3D's one-frame lag), 2-3 large and see-through, landed by 6,
  faded and gone by about frame 50 (`shots/single1_sheet.png`).
- **Tiers:** 746 white, 2,418 and 2,792 blue, 6,042 purple, 18,524 and 16,824 gold (Darkrai, a two-hit Arm Thrust),
  and a critical hit of 76,802 computed: capped at 60,000, flags critical and capped, **red with the shine sweeping**
  left to right (`shots/red_sheet.png`, `shots/shrink_gold.png`).
- **Double** (Ho-Oh and Lugia, place 5): Klink's hit on Lugia popped over Lugia (`shots/dbl_sheet.png`). **Triple**
  (Dialga, Giratina, Palkia, place 10): the hit on Giratina popped over the middle foe (`shots/tri_sheet.png`).
- **HP numbers:** `6 765 ×2` (the raid's Rayquaza), `43 232 ×9` (Darkrai, draining to `37 382 ×8`), `15 510 ×4`,
  `20 370 ×5`, `14 784 ×3` in the triple, each under its bar; the gauges, status icons, the player's numbers and the
  move and target menus were untouched in every screenshot.
- The textures load in every battle checked (key at 0x3500, palettes at 0x1c0). Hack build clean, `verify_dsi_rom.py`
  intact, the plain build's modules match; Python tests (`test_damage_digits.py` and the buffs' and run's) and the
  editor's typecheck and tests pass.
- **Not tested:** `battles: all` in a non-run battle (the same path with the run check off), a spread move (the test
  couldn't set the lead's move; one `SC_DAMAGE_NUMBER` per target is put the same way).

### 13.6 Memory

Overlay 168 +1.9 KB code (the numbers 1.6 KB, the HP line 0.3 KB) and 176 bytes of BSS; overlay 167 about 0.2 KB of
code and its battle state +46 bytes (each Pokémon's last hit). Texture VRAM 10 KB and texture palette VRAM 160 bytes in a battle
that shows numbers; 10 KB of the battle heap for three frames. No OBJ, OAM, affine or 2D palette slots; at most 30
quads a frame. The battle view's archive +10.3 KB (the sheet) and 111 bytes (the cell).

### 13.7 Calls made, for the user

- Drawn as 3D quads (13.1) rather than affine OBJ: real transparency and any size, and no OBJ budget to share.
- The HP line shows the foe's current HP only (no max), so that five digits and `×10` fit the 64-pixel line.
- Tier colours were palette entries 14 and 15 (replaced by 13.8's four); the shine plays on critical and capped hits,
  left to right after the number lands; a new number on a foe fades the previous one.
- `battles: all` is implemented (not link battles) but the setting stays `run`.
- `EntralinkBattle_GetLastHitDamage` (phase 3, unused) gave way to each Pokémon's last hit, which every battle keeps.

### 13.8 The user's sheet and four tier colours (2026-11-20)

The user's digits (`damage_digits.png`, italic with a drop shadow, 4 rows: the digits and 3 shine frames that sweep
a highlight down each digit) replaced the placeholder, with a new palette scheme: entry 1 the outline, shared, and
**four colours a tier**, entries 2-5 (dark shadow, light shadow, main, shine).
- **Data:** `settings.damage_numbers.outline` and each tier's `colors` (four `#rrggbb`), in place of `light`/`dark`
  (schema updated). The white tier is the sheet's own colours; the others were designed on its ramp:

  | Tier | from | dark shadow | light shadow | main | shine |
  | --- | --- | --- | --- | --- | --- |
  | white | 0 | `#777777` | `#b9b9b9` | `#efefef` | `#ffffff` |
  | blue | 1,000 | `#1c3c94` | `#3878e0` | `#70b8ff` | `#d0ecff` |
  | purple | 5,000 | `#4c1c88` | `#8840d8` | `#c084ff` | `#f0d8ff` |
  | gold | 10,000 | `#8c4c00` | `#d09000` | `#ffd030` | `#fff6b8` |
  | red | 40,000 | `#780c0c` | `#d02418` | `#ff5844` | `#ffd0c4` |

  Outline `#151515`. `overlap` 3 and `group_space` 4 for this italic face (the digits' slant tucks under the one
  before; the user asked for 2-3 px and a small thousands space).
- **Packer:** `damage_digits.py` makes each tier's 16-colour palette (the sheet's, with the outline and the tier's
  four over 1-5, RGB555) into the digits' member: its header's 4th byte is the tier count, the palettes follow it,
  then the cells. The archive now depends on `buffs.json`. The C (`PaperWhite2_DamageNumbersInit`) uploads the
  palettes as they are (no more building them in the heap: 160 bytes less of it) and checks the tier count against
  `ENTRALINK_DAMAGE_NUMBERS_TIER_COUNT`; the generated header keeps only the thresholds (`..._TIER_FROM`). A number
  picks its tier's palette as before.
- **Editor:** the Sprite sheets page's "Damage numbers' digits" has a **Tier colours** panel (`TierColorsPanel.tsx`,
  driven by the sheet's `tierColors` entry from `damage_digits.py list`): the shared outline and each tier's four
  colours (pickers rounded to 5 bits an axis), a live 2× preview of `12 345` in each tier drawn from the sheet's
  pixels at the settings' spacing, "Play the shine" (the game's timing), and Save, which writes `buffs.json` through
  the editor's validated save. Entree → Buffs → Damage numbers keeps the thresholds and shows each tier's colours as
  swatches; a new tier starts with the last one's colours.
- **Tested** (py-desmume, the user's save copy, harness in the session's scratchpad `digits2/h/`): a battle with the
  run's Darkrai, the lead's Attack (and the foe's Defense) poked: 138 white, 2,276 / 2,396 / 2,180 blue (Arm Thrust's
  three hits), 6,822 purple, 11,576 gold, and a critical 59,708 red with the shine sweeping left to right, each digit
  top to bottom (`digits2/shots/tiers_closeup.png`, `tiers_screens.png`, `red_shine.png`); the textures and the five
  palettes load (0x3500, 0x1c0). Editor panel: `digits2/editor_tiers.png`.

### 13.9 Playtest fixes: placement, depth, triples' HP lines, digit widths, HP drain (2026-11-20)

From the user's playtest. Code: `paperwhite2_damage_numbers.c`, `paperwhite2_health_bars.c` (overlay 168), the hook
comment in `btlv_gauge.c`, `damage_digits.py`, the editor's `TierColorsPanel.tsx` and `digitLayout.ts`.

- **A number stays on its foe and on screen.** It was placed by the camera of the moment, which during an attack is
  zoomed in and then moves back, so a hit on a triple's right-edge foe landed partly off screen. Now
  `DamageNumbers_RestingScreenPos` projects the foe's place (`BtlvMcss_GetDefaultPos`) with the battle camera at rest
  (`BtlvCamera_GetDefaultPosTarget`, the camera's 13-degree half field of view and 1.35 aspect from
  `BtlvCamera_Create`), in screen space, fixed once it pops; and each frame the number is kept 4 pixels inside the
  screen **at the size it has then** (the 300% start too), horizontally and vertically.
- **In front of everything.** The battle's 3D is W-buffered: a pixel's depth is its w. The numbers' orthographic
  projection had w = 1, the same as MCSS's flat (orthographic) sprites and the particles' orthographic projections and
  the camera's near plane, so a tie could let a big foe's sprite cover a number. Each digit now loads its own
  projection with a scaleW of 1/8 minus 1/256 for each digit drawn before it (`DIGIT_W_FIRST`, `DIGIT_W_STEP`): every
  digit is in front of the whole scene, and a later digit in front of an earlier one's overlap (the old z steps did
  nothing under W-buffering). In py-desmume the Primal Dialga raid showed the number over the sprite before and after
  (DeSmuME didn't reproduce the cover in the frames checked, translucent or opaque); the fix removes the tie by
  design. **For the user:** check a raid in RetroArch, where it was seen.
- **Triples' HP lines** (`HealthBars_LineBeside`): a triple's or rotation's foe boxes are 19 pixels apart, so the line
  under one bar covered the next box's name. There the line now sits **beside the bar's strip, on its row**,
  left-aligned (from the name box's x + 64 to x + 128); raids are triples, so they take it too. Singles and doubles
  keep it under the bar, right-aligned to its end.
- **Digits spaced by their real widths.** The packer measures each digit's glyph, its opaque columns in row 1, and
  writes (left column, width) for 0-9 into the digits' member's header (now 24 bytes: rows, cell width, height, tiers,
  then the ten glyphs). The game places each glyph `overlap` pixels into the one before, `group_space` more before the
  thousands (`DamageNumbers_Layout`); the shine rows use the same places. `overlap` is now **2** (was 3, in the old
  sense of the cells' spacing). The user's current sheet measures 14 for every digit (the italic face fills the cell);
  a narrower 1 or 7 will close up by itself.
- **Editor:** the Damage numbers' digits page's panel has a **Layout** part under the tiers: Overlap and Thousands gap
  (0-8, saved with the colours to `settings.damage_numbers` by the panel's Save, now "Save colours and layout"), and
  each digit's measured width (read-only, from the sheet's pixels: `digitLayout.ts`, the packer's rule; a test checks
  they agree on the real sheet). The `12 345` previews use the real advances.
- **HP drain by share, in every battle** (`PaperWhite2_HealthBarsSpeed`, `health_bars.h`): vanilla drains 1 HP a
  frame (a Blissey's or a boss's big hit took seconds). Now a change takes `HP_DRAIN_FRAMES_MIN` (12) frames plus its
  share of the bar of the rest up to `HP_DRAIN_FRAMES_MAX` (36); on a gauge with several bars the share is of one bar,
  and each whole bar past one takes 36 (per bar, as phase 5 had at 32). Never slower than vanilla (a few HP still
  drain 1 a frame); under 48 max HP vanilla's pixel a frame stays (at most 48 frames). The numbers, the player's box
  included, follow the bar as before (they are drawn from the same value each frame); heals use it too.

**Tested** (py-desmume, the user's save copy; harness in the session's scratchpad `visuals/h/`, `t6.py` with drain
timing from the gauge's `hpMoving` and speed; screenshots in `visuals/shots/`):
- **Triple, right-edge foe:** Keldeo's hit on Dialga, the foe at the screen's right edge: `59` centred over it, fully on
  screen with its margin (`tri_right_sheet.png`).
- **Raid over a big foe:** the Primal Dialga raid, `55` over Dialga in every frame, translucent and opaque
  (`raid_dialga_sheet.png`, before and after: `raid_before_after.png`, `raid_ba2.png`, `raid_ba3.png`); the Nightmare
  Rayquaza raid, `66`.
- **HP lines** (`hp_lines_formats.png`): doubles (Ho-Oh and Lugia, `6 572 ×2` under each bar, clear of the next box),
  single (Darkrai `42 336 ×9` under its bar), raid (`1 330` beside the bar), triple (`15 246 ×4`, `19 866 ×4`,
  `13 728 ×3`, each beside its own bar; close-up `tri_line_zoom.png`).
- **Digits:** the textures load with the new header (the glyphs read back as 14 wide each); the editor's Layout part
  (`visuals/editor_layout.png`, and with overlap 5, `editor_layout_overlap5.png`).
- **Drain** (game frames = ceil(change / speed), the HP shown changing for that many updates):

  | Hit | Max HP (bar) | Change | Speed | Game frames | Vanilla / before |
  | --- | --- | --- | --- | --- | --- |
  | Lead on the raid's Dialga (small) | 1,330 | 55 | 5 | 11 | 2 (phase 5's 1/32 of max past 999) |
  | Lead on the raid's Dialga (big) | 1,330 | 594 | 27 | 22 | 15 |
  | Dialga on the player's Oinkums (a run battle's player box: vanilla's path) | 293 | 271 | 8 | 34 | 271 |
  | A small hit on the player | 293 | 36 | 3 | 12 | 36 |
  | Keldeo on the triple's Dialga (4 bars of 3,812) | 15,246 | 6,517 | 107 | 61 | 55 |

  **Finding:** py-desmume's frames per drain were about the game frames in a single, 1.2 times in the raid and 2 times
  in the triple (the battle drops to about 30 updates a second there, so a triple's drain takes twice the real time).
  A drain by real time (VBlank count) would be a follow-up if the user wants it.
- Not tested: a non-run battle (the drain code has no battle-type check; the player's box above is that same path),
  a rotation battle's HP lines.

Memory: overlay 168 +0.5 KB code (3,176 to 3,660 bytes for the two files), +12 bytes read-only, +20 bytes BSS (the
glyphs); the digits' member +20 bytes (in the battle heap for three frames). No VRAM, OBJ or heap change.

Calls I made:
- The settings keep their keys: `overlap` (now glyph to glyph, 2) and `group_space` (the gap, 4); the editor calls them
  Overlap and Thousands gap.
- Raids take the beside-the-bar HP line like triples (they are triple battles); rotations too.
- Drain 12 + 24 × share frames, 36 a bar; constants in `health_bars.h`, not settings (it is every battle's).
- An empty digit cell counts as 14 wide.

## 14. Phase 7: the Reserve Box and the rest stops' swaps (2026-11-20)

Decided with the user on 2026-11-19 and 20: Pokémon set aside in the hub before a run, as live links to the PC boxes,
which a rest stop's swap NPC brings into the run's team for Dream Dust.

### 14.1 The Reserve Box

- **Live links, not copies:** for each reserved Pokémon only its PID is saved, in the progress block (the Symbol
  block's free area, prototype doc Step 3: `reserveSlots`, a bit per slot, and `reservePids[30]` at 0xc8-0x143; zero in
  an older block, an empty box, so the version stays 1). Whenever the box is used (its list, a swap) the PC boxes are
  searched for each PID (`EntralinkRun_FindBoxPkm`, ARM9 main: the PID is a BoxPkm's unencrypted first word, so only a
  match is decrypted) and the Pokémon is used as it is then: moves, EVs, level, item. Moving it between boxes keeps
  the link; one that isn't in a box any more (released, moved into the party) **drops off**, and its slot is freed the
  next time the list is read. During a run the boxes don't change, so the hub's list and the rest stop's agree.
- **Its size** is `run.json`'s `reserve_slots` (1-30, 6); the block holds 30 (`ENTRALINK_RESERVE_MAX`), so a smaller
  setting only limits Add.
- **The hub's NPC** (`res/field/events/entralink.json`, id 5, `OBJ_CODE_CLERK_F` at (28, 43) facing down, left of the
  exit Lady; the user moves it later; script 15 of `entralink.s`): "Welcome, dreamer. What can I do for you?" with
  - **Use the PC**: "The Pokémon Storage System was accessed." and the PC's Box modes (Move Pokémon, Deposit,
    Withdraw, Move Items, See ya!), each the PC Box (`CallPC`, as a Pokémon Center's PC), the Box's close button
    ending it all; no Battle Box (a Center's PC offers it only once it's unlocked).
  - **Reserve Box**: "Your Reserve Box holds N of M." over a list of its Pokémon (name and level, with species and box
    as the cursor's description; `ENTRALINK_RUN_ACTION_RESERVE_ADD_OPTIONS`), **Add a Pokémon** and **Close**. A
    Pokémon picked asks "Take X out of the Reserve Box? It will stay in its Box." **Add** opens the PC Box in a pick
    mode (the Dream World's pick mode that the Wonder Trade already uses, every species allowed so it refuses only eggs;
    title "SELECT A POKÉMON TO RESERVE", button RESERVE, "Put X in the Reserve Box?"; `Box2Param`'s `wonderTrade`
    became `pick`, `BOX2_PICK_*`), then "X was put in the Reserve Box.", "X is already in the Reserve Box." or "Your
    Reserve Box is full." (also before opening the Box when full).
  - Text: 23 lines at the end of `res/text/script/entralink.txt` (`Entralink_Text_Reserve*`), two in `box2_bmp.txt`,
    one in `btl_pokeparam_box_main_save_init.txt`; placeholders for the user to edit.

### 14.2 The swap NPC

- **NPC type `swap`** (`ENTRALINK_NPC_SWAP`, 10; the scripts' ground and done results moved to 100 and 101), a choice
  NPC like heal, revive and gift; its marker `npc_markers/swap.png` (a placeholder "S" on teal). The templates `rest`
  (x 21) and `pre_boss_rest` (x 8) have one, with the dialogue "Need a fresh face on your team? I can call one from your
  Reserve Box."
- **Talking** (`global_10490.s` `L_RunSwapNpc`): its dialogue, then `ENTRALINK_RUN_ACTION_SWAP_CHECK`. **Refused**, the
  choice left open: no reserved Pokémon that can join ("There's no one in your Reserve Box who can join you now."),
  less Dust than `run.json`'s `swap_dust` (0-9999, 100: "Calling on a Pokémon costs 100 Dream Dust. You have 50."),
  or every copy fainted ("Every Pokémon on your team has fainted. No one can make way."). Else "Who will join your
  team? It costs 100 Dream Dust. (You have N.)" over the joinable reserved Pokémon (as the hub lists them) and Cancel;
  then "Who will make way for X?" and the party screen (B back to the list); a fainted copy or an egg: "A fainted
  Pokémon can't make way. Choose another."; then "Y will leave the run, and X will join it for 100 Dream Dust. OK?"
  Yes: the Dust taken, "Y left the run. X joined your team!", and the room's choice made (the other choice NPCs go).
  No or Cancel leave the choice open.
- **The copy** (`EntralinkRun_SwapIn`, ARM9 main): the box Pokémon made a party Pokémon as it is now
  (`boxPkmRegenToPartyPkm`), put in the leaving copy's slot of the run's team and made the run's way
  (`EntralinkRun_PrepareCopy`, which `EntralinkRun_KeepParty` now uses too): level 100, healed (HP, PP, status), its
  held item cleared unless it decides its form, its stats with the max_hp buffs. The leaving copy simply leaves the
  run; the real Pokémon (in the save's party block, or the box) is never touched.
- **Once a run:** each swap is recorded (`RunSwap`, at most `ENTRALINK_RUN_SWAPS_MAX`, one a room), and a Pokémon that
  joined (still in the team or swapped out again) isn't listed at a later swap.
- **Prestige:** a joined copy may gain prestige if its box Pokémon was level 100 when it joined (the same rule as the
  party's, `EntralinkRun_CanGainPrestige`). At the run's end (`EntralinkRun_RestoreParty`) the real party gets its
  prestige back as before, and each joined Pokémon's box self gets its copy's prestige, found again by PID in the boxes,
  written only if it is still level 100 and the value changed. A copy that left in a swap counts with its prestige as
  it left (kept in its `RunSwap`), for a party member and a joined one alike.

### 14.3 Tested (py-desmume, the user's save copy, scripts in the session's scratchpad `buffs7/h/`)

- **The hub NPC** (`shots/hub_menu.png`): its menu; Use the PC, Move Pokémon: the Box in its own mode, closed back to the
  field (`pc_box.png`, `pc_out1.png`).
- **Add:** the empty Reserve Box, Add, the Box in the pick mode (`box_ask.png`: "SELECT A POKÉMON TO RESERVE", "Put
  Trubbish in the Reserve Box?"), Yes: "Trubbish was put in the Reserve Box." (`box_after.png`), the slot's PID in the
  progress block, the list "Trubbish Lv. 4 / Add a Pokémon / Close" with "Trubbish, in BOX 1." (`after_add1.png`).
- **The list** with the block poked to Trubbish, Grimer, a PID in no box and Shinx: three listed (`list3.png`), the lost
  one's slot freed; Grimer taken out with Yes (`remove_ask.png`), its slot freed; Trubbish added again: "already"
  (`already.png`); poked full: "Your Reserve Box is full." (`full.png`).
- **The swap** (a run started from the hub, room 1's doors poked to the rest template; Grimer edited in its box to
  moves 1-4 holding Leftovers, Trubbish's Exp. poked to level 100): with 50 Dust, "costs 100 ... You have 50."
  (`swap_nodust.png`); every copy poked fainted: refused (`swap_allfainted.png`); the three box slots cleared: refused,
  and all three slots freed; nothing changed the room's choice. With 300 Dust: the list "Trubbish Lv. 100, Grimer
  Lv. 12, Shinx Lv. 10, Cancel" (`swap_list_grimer.png`), Grimer; the fainted slot 1 refused (`swap_cant.png`); slot 0
  (Pignite, "Oinkums"): "Oinkums left the run. Grimer joined your team!" (`swap_ask.png`). The copy in slot 0: Grimer's
  PID, level 100, moves 1-4 (the box edit), no item (Leftovers cleared), HP 273/273; 200 Dust; the room done, the other
  NPCs gone, the swap NPC then "Go on. The nightmare awaits."; the follower became Grimer.
- **A second rest room:** the list without Grimer (`swap2_list.png`); Trubbish (its box PP poked to 1) for slot 2
  (Keldeo), the question (`swap2_ask.png`), Yes: level 100, PP full (35, 40, 10), 100 Dust.
- **The run's end** (the back door), with the Trubbish copy's prestige poked to level 3 progress 50 and the Grimer
  copy's to 2/7: the real party byte for byte as before; in the boxes only Trubbish changed, its prestige written
  (51203; its PP still 1, the rest as before); Grimer (level 12) untouched, still holding Leftovers with moves 1-4; the
  Reserve Box kept.
- The packer's tests (`test_swap_and_reserve`), the editor's (typecheck, all tests; two Entree tests updated for the
  new type, one new), `verify_dsi_rom.py`, the plain build's module check; the editor's Run section and a rest
  template's swap NPC (`shots/editor_rest_swap.png`).
- **Not tested:** the No answer and Cancel (script branches to the same end as B); the pre-boss rest's swap NPC (the
  same NPC type, at x 8); a swapped-out party member's prestige write-back (none of the save's party is level 100;
  the record is the same as the joined one's); a form item kept on a joined copy (the shared `PrepareCopy`); real
  hardware.

### 14.4 Memory

ARM9 main +0.9 KB (code 0.6 KB, the swaps' records 0.3 KB of BSS), overlay 12 +1.7 KB (the Reserve Box 1.6 KB),
overlay 255 (the PC Box) +86 bytes. The DS arena: 32 KB left (from 34). At run time: the Box's pick 0.3 KB of the
event heap while it is open, the list's strings while it shows; no VRAM.

### 14.5 Calls made, for the user

- **Size 6** as a setting (`reserve_slots`, 1-30); the save always has room for 30.
- **Dropped-off links are freed** the next time the list is read (a released Pokémon doesn't hold a slot forever; one
  moved into the party and back must be added again).
- **The pick** is the PC Box's own pick mode (as the Wonder Trade's), not a list of box Pokémon; eggs can't be reserved.
- **Use the PC** offers Move Pokémon first (as this hack's Centers do), then Deposit, Withdraw and Move Items; no Battle
  Box.
- **A swapped-out copy can't come back:** it isn't in a box; and a reserved Pokémon joins once a run.
- **The swap is the room's choice**, like heal, revive and gift; a refusal, Cancel or No leave it open.
- The hub NPC's look and place (`OBJ_CODE_CLERK_F`, (28, 43)) and the swap NPCs' places (rest x 21, pre-boss rest x 8,
  the Lady by default) are placeholders.

## 15. Rebalance 2: buffs, bosses, broken bars, merged cards, team-aware offers (2026-11-20)

After the user's second playtest (5 rooms a round): the round 1 boss (Ho-Oh and Lugia) had about 6,000 HP each, round
2's three foes about 15,000 each; a debug-granted build (Adaptability, Expert, Tinted, Spectral and Prism at rank 3,
five attack blues and purples, 31 IVs) hit them for 400-1,200, the bosses were nearly impossible and the rooms after
them easy. The cause: the buffs multiplied at most x23.6 by design (5.2 of the first draft) while bosses were scaled
x25 (round 1) to x224 (the final room) in HP, as absolute boss values unrelated to the room curve. Decided with the
user: verify the buffs first, then bosses on the room curve with a modest bonus, stronger buffs tuned with the
simulator, heals stopped at a broken bar, fewer cards, team-aware offers, and the buffed stats on the summary.

### 15.1 Verification: the buffs apply as designed (no bug found)

The user's build was set in the run state as the debug menu sets it (Adaptability, Expert, Tinted, Spectral, Prism at
rank 3; Attack x5; Expert Edge, Opportunist, Tough Claws, Technique x1; Type Affinity left out, as it needs a type),
then the Illusionist's Zoroark (Dark) fought at place 1, each of Pignite's moves from the same savestate with the
battle's table as read and again with it emptied (the foe's moves Splash, Pignite made faster). The table the battle
read held exactly the cards' values (Attack 50, Adaptability 75, Expert 40, Spectral 60, Tinted 100, Prism 35...).
Before the rebalance:

| Move | Without buffs | With | Ratio | The buckets' maths |
| --- | --- | --- | --- | --- |
| Arm Thrust (Fighting, physical, contact, power 15, super effective) | 50, 54 | 182, 213 | x3.9 | ATK 1.5 × POW 1.3 (Tough Claws, Technique) × STAB 1.5 × MATCH 1.4 = x4.1, less the formula's +2 and power rounding (15 × 1.3 = 19): 182-218 expected |
| Smog (Poison, special, power 20, no STAB) | 14 | 19 | x1.36 | POW 1.2 (Technique) on 20 power: 17-20 expected |
| Ember (Fire, special, power 40, STAB) | 42 | 85 | x2.0 | POW 1.2 × STAB 1.5 (Attack doesn't raise Sp. Atk): 74-87 expected |
| Flame Charge (Fire, physical, contact, power 50, STAB) | 76 | 254 | x3.3 | ATK 1.5 × POW 1.3 × STAB 1.5 = x2.9 on the base before the roll: 221-261 expected |

So the user's build multiplied a neutral STAB hit by about x2-3 and a super-effective one by x4, as the first draft's
values said: no bug, the design itself was too weak against the bosses' x25-x224. **After** (same build, today's
values, a place-1 Zoroark): Arm Thrust 490 (x10.5), Ember 989 (x20.6: Offense raises Sp. Atk too, Spectral made it
super effective, Expert x1.6), Flame Charge 1,622 (x23). Scripts: the session's scratchpad `rebalance2/h/v1.py`.

### 15.2 Bosses on the room curve

- **The rule:** a boss's (and the final room's) multiplier is the room curve at its round's last room (the final
  room's at the run's last room) times its round's **`boss_bonus`** (percent, a stat each, run.json's
  `enemy_scaling.<stat>.boss_bonus`, replacing the absolute `boss` values), then the enemy's own `scale`. A raid's HP
  takes `raid_hp_factor` wherever it is (a room, a boss, the final room). The packer works the bosses' percents out
  (`entralink_run.enemy_scaling`, `boss_room_index`), so the game's table and code are unchanged but for the raid
  factor on a boss raid.
- **Values** (the simulator's fit for 5 rooms a round, rounded): HP 150% rising to 2,000% (curve 150), bosses' HP bonus
  x2.2 / x2.3 / x5.0 (the final room is a single Darkrai, so its own bonus is larger, as decided: "the final room the
  same rule, its own bonus"); Attack and Sp. Atk 120% to 250% (curve 175), bosses x1.1; Defense and Sp. Def 100% to
  130% (straight), Speed 100% to 145%, bosses x1.0.
- **In the game** (py-desmume, the user's save copy, `rebalance2/h/t2_stats.py`): the round 1 boss (Ho-Oh and Lugia,
  place 7) **2,182-2,315 HP** each (x9.53 of their own 229-243; before about 6,000+), Attack and Sp. Atk x1.48,
  Defense and Sp. Def x1.09, Speed x1.13. A round 2 room (Spooktober's Gengar, place 9) **1,143 HP** (x6.69), Attack
  and Sp. Atk x1.5, defences x1.13, Speed x1.19.
- **The editor:** the Run section's table shows Boss bonus R1-R3 (titles say "in percent of the curve at its round's
  last room"); the notes under it and the Raid HP box say the new rule.

### 15.3 Stronger buffs

Attack-side steps, gold rank values and the bucket caps roughly doubled (`buffs.json`), so a typical late build is
about x15-20 and an extreme one x60-80 (5.2-5.4):

- **Bucket caps:** ATK and POW +150%, STAB +150 (x3.0 at most), MATCH +60%, COND +175%, CRIT +75, FINAL +40%, DEF
  +150%; GUARD stays -50%.
- **Blues:** Offense +25% a pick (to +150), Bulwark +20% (to +150), Power +10% (to +40), Guard 5% (to 40%); HP, Speed,
  Accuracy and Vigor as they were.
- **Purples:** Type Affinity +40% (to 120), Expert Edge +20% (60), Glancing Blow +30% (120), Kinship +0.15 (0.6),
  Heavy Crit +0.2 (0.6), Opportunist +30% (90), Climate +20% (80), Tough Claws +20% (60), Technique +40% (120),
  Pinch Power +24% (72), Momentum Strike +10% (60), First Blood +30% (90), Giant Slayer +20% (40).
- **Golds:** Galvanic and Last Stand 100/140/175, Overcharge and Cold Snap 80/120/150, Dream Eater, Venom Strike,
  Kindling and Shatter 60/100/150, Dizzy Strike and Heatwave 50/80/120, Lullaby 50/80/100, Fire Within, Reckless and
  Siphon 40/70/100, Adaptability x2.25/x2.6/x3.0, Expert 30/45/60, Coverage x1.4/x1.6/x1.8, Bastion (the gold Bulwark)
  60/100/150, Blood Price 25/35/40, Slipstream 20/40/60, Sniper x2.4/x2.6/x2.75. The others (chances, turns, the
  defensive golds) are unchanged.
- **The balance meter** (editor and packer): the strongest critical hit past the clamp is no longer a warning; the meter
  says "past the clamp: fine for an extreme build". It warns instead when the **example** build passes the clamp or
  falls outside the typical band, `balance.typical_factor` (new, 15-22: the 20-pick example is x21.7), which the Buffs
  tab's meter edits under the example build ("Typical band x"), and its summary shows the example's factor against
  the band.

### 15.4 The simulator and its tables

`entralink_sim.py` now: reads `boss_bonus`; counts a boss's foes (the average of the boss rooms each round can draw, a
raid one foe) and its **good hits** (super effective, with the cards that hold only then) for all of them; the builds
take Offense and Bulwark; `--fit` proposes the curves and the boss bonuses from the targets (rooms 1.5 rising to 4
typical hits, bosses 6 / 8 / 9 good hits, a room enemy's hit 20% of a balanced build's HP, a boss's 25%, the bonuses
held to HP x1.5-x5 and the other stats x1.0-x1.1).

**5 rooms a round** (run.json today):

| Place | Picks | Enemy HP (foes) | HP, Atk, Def, Spe % | Balanced: factor on a good hit | Balanced: typical hit, hits | Balanced: good hit, good hits for all foes | Balanced: hit taken | Glass cannon: hits (good hits) | Glass cannon: hit taken | Defensive: hit taken |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 room 1 | 0 | 334 | 150, 120, 100, 100 | x1.0 | 228, 1.5 | 455, 0.7 | 20% | 1.5 (0.7) | 20% | 20% |
| R1 room 2 | 0 | 413 | 185, 121, 102, 103 | x1.0 | 223, 1.8 | 447, 0.9 | 20% | 1.8 (0.9) | 20% | 20% |
| R1 room 3 | 2 | 558 | 250, 124, 104, 106 | x1.6 | 356, 1.6 | 712, 0.8 | 20% | 1.6 (0.8) | 20% | 16% |
| R1 room 4 | 2 | 745 | 334, 129, 106, 110 | x1.6 | 349, 2.1 | 699, 1.1 | 21% | 2.1 (1.1) | 21% | 17% |
| R1 room 5 | 3 | 966 | 433, 135, 109, 113 | x1.6 | 340, 2.8 | 681, 1.4 | 18% | 2.4 (1.2) | 22% | 15% |
| R1 boss | 3 | 2,125 (x2) | 953, 148, 109, 113 | x1.6 | 340, 6.2 | 681, 6.2 | 20% | 5.2 (5.2) | 24% | 16% |
| R2 room 1 | 5 | 1,215 | 545, 141, 111, 116 | x3.2 | 667, 1.8 | 1,335, 0.9 | 18% | 1.2 (0.6) | 23% | 12% |
| R2 room 2 | 6 | 1,492 | 669, 150, 113, 119 | x3.9 | 790, 1.9 | 1,580, 0.9 | 20% | 1.3 (0.7) | 25% | 12% |
| R2 room 3 | 6 | 1,793 | 804, 159, 115, 122 | x3.9 | 774, 2.3 | 1,548, 1.2 | 21% | 1.6 (0.8) | 26% | 12% |
| R2 room 4 | 7 | 2,116 | 949, 169, 117, 126 | x3.9 | 763, 2.8 | 1,526, 1.4 | 19% | 1.7 (0.8) | 28% | 12% |
| R2 room 5 | 8 | 2,462 | 1104, 180, 119, 129 | x4.8 | 919, 2.7 | 1,838, 1.3 | 20% | 1.7 (0.8) | 29% | 12% |
| R2 boss | 9 | 5,662 (x3) | 2539, 198, 119, 129 | x5.6 | 1,072, 5.3 | 2,145, 7.9 | 22% | 3.5 (5.2) | 32% | 12% |
| R3 room 1 | 10 | 2,825 | 1267, 192, 121, 132 | x5.6 | 1,057, 2.7 | 2,113, 1.3 | 18% | 1.5 (0.7) | 32% | 11% |
| R3 room 2 | 11 | 3,207 | 1438, 205, 124, 135 | x5.6 | 1,033, 3.1 | 2,067, 1.6 | 18% | 1.5 (0.8) | 33% | 11% |
| R3 room 3 | 12 | 3,608 | 1618, 219, 126, 139 | x5.6 | 1,018, 3.5 | 2,036, 1.8 | 17% | 1.5 (0.8) | 36% | 12% |
| R3 room 4 | 12 | 4,025 | 1805, 234, 128, 142 | x5.6 | 1,002, 4.0 | 2,005, 2.0 | 18% | 1.8 (0.9) | 38% | 13% |
| R3 room 5 | 13 | 4,460 | 2000, 250, 130, 145 | x6.4 | 1,128, 4.0 | 2,256, 2.0 | 19% | 1.8 (0.9) | 41% | 14% |
| R3 final | 14 | 22,300 | 10000, 275, 130, 145 | x7.6 | 1,339, 16.7 | 2,678, 8.3 | 21% | 8.8 (4.4) | 45% | 15% |

**3 rooms a round** (the same data):

| Place | Picks | Enemy HP (foes) | HP, Atk, Def, Spe % | Balanced: factor on a good hit | Balanced: typical hit, hits | Balanced: good hit, good hits for all foes | Balanced: hit taken | Glass cannon: hits (good hits) | Glass cannon: hit taken | Defensive: hit taken |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 room 1 | 0 | 334 | 150, 120, 100, 100 | x1.0 | 228, 1.5 | 455, 0.7 | 20% | 1.5 (0.7) | 20% | 20% |
| R1 room 2 | 0 | 517 | 232, 123, 104, 106 | x1.0 | 219, 2.4 | 438, 1.2 | 20% | 2.4 (1.2) | 20% | 20% |
| R1 room 3 | 2 | 850 | 381, 131, 108, 111 | x1.6 | 343, 2.5 | 685, 1.2 | 22% | 2.5 (1.2) | 22% | 17% |
| R1 boss | 2 | 1,869 (x2) | 838, 144, 108, 111 | x1.6 | 343, 5.5 | 685, 5.5 | 24% | 5.5 (5.5) | 24% | 19% |
| R2 room 1 | 4 | 1,282 | 575, 143, 111, 117 | x3.2 | 667, 1.9 | 1,335, 1.0 | 19% | 1.6 (0.8) | 23% | 13% |
| R2 room 2 | 4 | 1,793 | 804, 159, 115, 122 | x3.2 | 645, 2.8 | 1,290, 1.4 | 22% | 2.3 (1.2) | 26% | 15% |
| R2 room 3 | 5 | 2,373 | 1064, 177, 119, 128 | x3.2 | 622, 3.8 | 1,245, 1.9 | 23% | 2.6 (1.3) | 29% | 15% |
| R2 boss | 6 | 5,457 (x3) | 2447, 195, 119, 128 | x3.9 | 747, 7.3 | 1,494, 11.0 | 25% | 5.1 (7.6) | 32% | 15% |
| R3 room 1 | 6 | 3,015 | 1352, 199, 122, 134 | x3.9 | 731, 4.1 | 1,461, 2.1 | 26% | 2.9 (1.4) | 32% | 15% |
| R3 room 2 | 7 | 3,711 | 1664, 223, 126, 139 | x4.8 | 872, 4.3 | 1,745, 2.1 | 29% | 3.1 (1.5) | 36% | 16% |
| R3 room 3 | 9 | 4,460 | 2000, 250, 130, 145 | x4.8 | 846, 5.3 | 1,692, 2.6 | 23% | 2.8 (1.4) | 41% | 15% |
| R3 final | 9 | 22,300 | 10000, 275, 130, 145 | x4.8 | 846, 26.4 | 1,692, 13.2 | 25% | 13.9 (6.9) | 45% | 16% |

What it shows: with 5 rooms a balanced build needs 1.5 to 4 typical hits a room enemy, about 6 good hits for round 1's
two bosses, 8 for round 2's three and 8 for the final room; a room enemy's hit costs it 17-21%, a boss's 20-22% (the
bosses' Attack bonus is held to x1.1). The glass cannon kills everything faster and takes 30-45% a hit late; the
defensive build is slow (it has no attack picks) and takes 11-16%. With 3 rooms a round the run gives 9 picks, not 14,
so the late rooms (4-5 hits) and the final room (13 good hits) are longer: someone running 3 rooms would lower the
final room's HP bonus (`--fit --rooms 3` proposes HP 155-1,500% and bonuses x2.3 / x2.0 / x4.5).

### 15.5 Heals stop at a broken bar

Once a foe with health bars has lost a bar, no heal brings it back above that bar's top: `HPAdd` (every heal, on the
server's and the client's copies alike: Recover and the like, drain, Leech Seed, berries, Leftovers, Wish,
Regenerator, abilities) is held to `EntralinkBattle_GetHealLimit` (the top of the bar the HP is in, for a run's scaled
foe with more than one bar), worked out in 32 bits (a scaled foe's HP near 65,535 could wrap in vanilla's u16 sum);
`ServerControl_RecoverHPCheckFail` fails a heal at that top, and a recovery move there says "But it failed!".
Tested (`rebalance2/h/t3_heal.py`): round 1's Lugia with its scale poked to 500% (11,102 HP, 3 bars of 3,701), its HP
set to 7,102 (bar 2, whose top is 7,401), its moves all Recover: the first Recover healed it to **7,401** ("×2", a full
bar 2; vanilla would have healed 5,551 to 11,102), the second did nothing ("The wild Lugia used Recover!", then the
next move). Screenshots `rebalance2/shots/t3_t2_*.png` and `t3_t3_*.png`.

### 15.6 Fewer, merged cards

- **Offense** (id `attack`, kept): Attack and Sp. Atk +25% (stat `attacking`); **Sp. Atk** (`sp_attack`) removed.
- **Bulwark** (id `defense`, kept): Defense and Sp. Def +20% (stat `defending`); **Sp. Def** (`sp_defense`) removed.
  The gold that was called Bulwark keeps its id `bulwark` and is now **Bastion**.
- **Tough Claws** absorbs **Iron Fist** (`iron_fist` removed): every punching move makes contact, so "contact moves
  (punches too) +20%" covers both.
- **Technique** absorbs **Swift Hand** (`swift_hand` removed): moves of power 60 or less, **or** priority moves, +40%
  (a condition `any` of the two tests); both were the Speed theme's power purples.
- Left apart: Expert Edge and Glancing Blow (one is super effective, the other resisted: two conditions of opposite
  sense), Big Root and Vampiric, Hardy and Shed Skin (different kinds). 109 cards now (from 113); the ids kept keep
  their places' meaning, and the removed ids are gone from the catalogue (no code named them).
- Tested (`rebalance2/h/t7_offer.py`): an offer of Offense, Bulwark and Technique after a battle, each with its new
  text, Offense taken ("Riku gained Offense!"); screenshot `rebalance2/shots/t7_02.png`.

### 15.7 Team-aware offers

- **The data:** each theme has `team_tags` in buffs.json: `moves`, `abilities` (constants) and `stab_moves` (type
  mastery: a damaging move of the Pokémon's own type). The lists today: weather setters and users (Rain Dance, Sunny
  Day, Sandstorm, Hail, Weather Ball, Thunder, Hurricane, Blizzard, Solar Beam, the weather abilities and their users),
  sleep moves and Bad Dreams / Effect Spore, poison and burn moves and their contact abilities, Ice moves for frost,
  confusing moves, recoil / Reversal / Flail / Endure with Guts-likes and the pinch abilities for last stand, boosting
  moves and Simple / Moody / Contrary / Moxie / Defiant / Unaware for stat stages, priority and Speed moves with Speed
  Boost / Prankster / Unburden for speed, high-critical moves with Super Luck / Sniper, drain, recovery, Leech Seed,
  Protect and Regenerator / Poison Heal for stall. Editable on the Buffs tab's Themes section (Team tags: chips with a
  move or ability picker each, and the own-type checkbox).
- **The weights** (settings, the Buffs tab's Team row): `team_theme_weight` **75** (+75% for each Pokémon of the run's
  team that plays the theme) and `team_theme_max` **400** (at most x4); a theme's golds and the purples related to it
  (their best theme) are multiplied by it on top of the held-theme and rank-up weights. Others still come up.
- **In the game** (overlay 12): the run's team is scanned once an offer (and once a shop's or gift's card), so a swap
  counts at once: each Pokémon's ability, moves and, for themes that count them, whether a move is a damaging one of
  its own types (the type read first, the power only for those). The tables are the packer's
  (`ENTRALINK_BUFF_TEAM_*`).
- **Tested** (`rebalance2/h/t5_weight.py`): the Illusionist's battle won, the frame before the after-battle draw kept;
  300 draws each from it with the same 300 seeds (the RNG poked at the draw's entry), the source's odds set to all gold
  or all purple, and the team set at the draw to a neutral one (Growl, Leer, Tail Whip, Splash; Keen Eye) or the same
  with Sunny Day on the lead and Spore on the second:

| 900 cards each | Neutral team | Weather + sleep team |
| --- | --- | --- |
| Weather golds | 80 | **120** (x1.5) |
| Sleep golds | 66 | **106** (x1.6) |
| Other themes' golds (each) | 64-82 | 56-74 |
| Purples related to weather | 138 | **198** |
| Purples related to sleep | 157 | **227** |

  The offer is drawn in about 7 frames after its first (as before: the draw runs over a message).

### 15.8 Buffed stats on the summary

During a run (the game's party is the run's copies), the summary's stats page shows Attack, Defense, Sp. Atk, Sp. Def
and Speed with the run's **stat cards that hold on every hit** applied, as the battle applies them: the `stat_ratio`
cards with no condition and no scale (today Offense on Attack and Sp. Atk, Bulwark on Defense and Sp. Def, Speed),
the ones in a bucket summed and held to its cap, Speed each multiplying. Conditional stat cards (Fire Within when
burned, Storm Speed in weather, Bastion by missing HP) aren't shown; the HP blue already raises the copies' own max
HP. A raised value is drawn in the summary font's blue (colour 10) instead of its dark grey, with 4 digits past 999.
Code: `EntralinkBuffs_GetBuffedStat` (ARM9 main, the packer's `ENTRALINK_BUFF_STAT_CARDS`), a hook in
`PStaSkill_PrintStatRows` (overlay 207). Tested (`rebalance2/h/t6_summary.py`): with Offense x5, Bulwark x3, Speed
x2, Pignite's Attack 195 showed **438** (x2.25), Defense 131 **209** (x1.6), Sp. Atk 160 **360**, Sp. Def 124
**198**, Speed 161 **186** (x1.16); screenshot `rebalance2/shots/s_sum.png`.

### 15.9 Memory

ARM9 main about +0.2 KB (the stat cards and the bucket caps, one function); overlay 12 about +1 KB (the team tags'
tables, 0.6 KB, and the scan); overlay 167 +0.1 KB; overlay 207 +32 bytes; the catalogue's four fewer cards save a
little in each table and 4 bytes of the run state. The DS main arena's start moved about 1.2 KB with this branch's
base (28 KB left before 0x023e0000). No heap (the scan's work is on the stack), no VRAM.

### 15.10 Calls made, for the user

- "Good hit" in the targets is a super-effective hit without setup; a boss's good hits count all its foes.
- The final room's HP bonus is x5 (it is one foe); rounds 1 and 2's are x2.2 and x2.3 as asked.
- The bosses' Attack bonus is x1.1, the most decided, so a boss's hit is 20-22% a foe rather than 25-30%.
- The gold Bulwark is renamed Bastion so the merged blue can be Bulwark.
- The team is scanned as the cards are drawn (not once at the run's start) so the Reserve Box's swaps count.
- The summary's buffed colour is the summary font's blue; easy to change (`BUFFED_STAT_COLOR` in `p_sta_skill.c`).
- The typical band is 15-22 (the example build at 20 picks is x21.7).
- The tests that asserted the user's own catalogue (card counts, the meter's numbers on the real data) now use
  fixtures.

## 16. Fixes from the third playtest (2026-11-20)

Six fixes the user asked for after the third playtest. Scripts in the session's scratchpad `fixes9/h/`, screenshots in
`fixes9/shots/`.

### 16.1 Boss HP: lower round 1, and shared by a boss's foes

- `enemy_scaling.hp.boss_bonus` is now **x1.6 / x2.3 / x5** (round 1 was x2.2; other stats unchanged).
- **New settings** (run.json, schema, the editor's Run section under Raid HP: "Boss HP bonus, 2 foes x" and "3 foes
  x"): `boss_double_factor` **0.85** and `boss_triple_factor` **0.7**. A boss battle's (or the final room's) foes'
  HP bonus is multiplied by the one for its foe count (2 or 3 enemies; a raid is one foe and takes none), so each foe's
  HP percent is curve x bonus x factor. The packer writes them as `ENTRALINK_RUN_BOSS_DOUBLE_HP_PERCENT` and
  `..._TRIPLE_...` (85, 70); `EntralinkRun_SetEnemyScale` applies them by `battle->enemyCount`.
- **The simulator** (`entralink_sim.py`) applies the factors to its boss places (the average over each round's boss
  pool, `boss_hp_factors`), and `--fit` divides them out of the proposed bonus. Its new boss lines (5 rooms a round,
  balanced build): **R1 boss 1,314 HP a foe (x2), 3.9 good hits for both** (was 2,125 and 6.2); **R2 boss 3,963 a foe
  (x3), 5.5 good hits for all three** (was 5,662 and 7.9); the final room unchanged (22,300, 8.3 good hits). The
  glass cannon: 3.2 and 3.6 good hits; the hit taken unchanged (20% / 22% balanced).
- **In the game:** the round 1 boss (Ho-Oh and Lugia, place 7): scale **589%** each (433 x 1.6 x 0.85), **1,466** and
  **1,401** HP (was 2,182-2,315). The round 2 boss (Dialga, Palkia, Giratina, place 14): **1,777%** (1,104 x 2.3 x 0.7),
  **4,282 / 3,660 / 5,313** HP.

### 16.2 A foe's HP line in doubles: not reproduced

The user saw no foe HP numbers in a double. In py-desmume, the round 1 double boss (Ho-Oh and Lugia) showed both foes'
lines (`1 466`, `1 407`) in every frame checked: entering the battle, the intro messages, the command menu, target
selection, a turn of attacks with the gauges hidden and shown again around the animations, damage draining the line
(`1 466` to `1 395`), a 4-hit move, the player's Pokémon fainting and the next sent in, a foe fainting (its line `0`),
over several turns (sheets `s_dbl.png`, `s_dbf.png`, `s_dbr.png`). The OAM read back in the double (`t_oam.py`) has
both lines' two 32x8 OBJs where they belong (Ho-Oh's at y 33, Lugia's at 57), and at most 352 OBJ pixels on a line,
far under the hardware's per-line limit; the line's character data (member 456) is 8 tiles, as many as the line
writes. Singles and triples (and the raid) showed theirs too (16.3's and 16.5's shots). So the cause isn't found and
nothing was changed. **For the user:** which double was it (the Ho-Oh and Lugia boss, or another room), and was it in
RetroArch with the melonDS or the DeSmuME core? A screenshot would point to it.

### 16.3 Battle-ending moves fail in a run, as in a trainer battle

- `ServerControl_GetForceSwitchMode` returns the trainer battles' mode in a run battle (it is a wild battle, battle
  type 0, whose singles vanilla ends by a forced switch): **Roar, Whirlwind, Dragon Tail, Circle Throw and Red Card**
  send the target out for a random Pokémon of its side's bench, and with none (a run's foes never have one: every
  enemy is on the field) do nothing: Roar and Whirlwind say "But it failed!", Dragon Tail and Circle Throw just deal
  their damage. Wild doubles and triples already used that mode in vanilla.
- **Teleport** fails in a run (`HandlerTeleportCheckFail`), as in a trainer battle.
- The other ways a wild battle ends early: the player's Run (Run Away, Smoke Ball) is already the run's forfeit
  (`GetRunMode`); an escape item from the bag (Poke Doll, Fluffy Tail, Poke Toy) would end it, but none is in the run's
  item pools (items.json); nothing else in the code ends a wild battle (no Emergency Exit in Gen 5).
- **The foe's Roar on the player** now drags the player's next Pokémon out, as a trainer's does (before: a wild
  battle's Roar on the player ended it).
- **Tested** (Spooktober's Gengar, place 2): the lead's **Roar**: "But it failed!", the battle goes on (`s_roar1.png`);
  **Teleport**: "But it failed!" (`s_tel.png`); **Dragon Tail**: 80 damage, no switch, the battle goes on (`s_dt.png`);
  the foe's **Roar**: "Zekrom was dragged out!" (`s_roarfoe.png`). In the triple boss the code path is the same mode as
  vanilla's wild triples (the foes have no bench, so Roar fails); the harness's triple inputs didn't land, so that one
  is by the code, not a screenshot.

### 16.4 A buff room's box goes once a card is taken

`EntralinkRun_MakeChoice` takes the talked-to NPC away too when it is a buff box (`ENTRALINK_NPC_BUFF_CHOICE`), as an
item room's ball goes when its item is taken; an empty box (no card fitted) goes as well once its message is read.
Tested: a buff room entered from the first room, the box talked to, Rock Skin taken: the NPC's gone bit set, its
marker and the box gone, the doors' markers up (`s_box.png`).

### 16.5 Fire Within and Wildfire reworked

- **Fire Within** (gold, Burn): `stat_ratio`, stat `attacking`, ATK bucket, the new scale **`burned_foes`**: +15% /
  +25% / +35% Attack and Sp. Atk **for each burned foe on the field** (the foes facing the attacker that haven't
  fainted, `CountBurnedFoes`), added in the ATK bucket and held to its cap. The old version's burned-attacker condition
  and `ignore_burn_drop` are gone. Tested in the double boss with Fire Within III, the lead's Flame Charge on Ho-Oh
  (same state and roll): **53** damage with no foe burned, **70** with one (x1.32; +35% on the stat), **90** with both
  (x1.70; +70%).
- **Wildfire** (gold, Burn): its burn chance is the card's **or the move's own if higher**, not an extra roll on top:
  the new effect flag **`at_least_move_chance`** (schema, packer `EFFECT_FLAGS` bit 6). After a hit,
  `GetHitStatusChance` rolls what the move's own chance of that status leaves to reach the card's value, (card - own)
  / (100 - own), so the two rolls together burn exactly at the higher chance: Flame Charge (no burn) 20% at rank II,
  Flamethrower (10%) 20%, Fire Blast (30%) 30% at rank II. Rank III still burns Fire types. Descriptions: "Your Fire
  moves burn 20% (or their own chance)".
- **Tested** (`t_wf.py`, Spooktober's Gengar, the same state with the battle RNG seeded differently each try; the
  hit's roll read back each try and matched): Flame Charge with Wildfire II burned **24 of 112** (21%), Flamethrower
  with Wildfire II **22 of 112** (20%; the old extra roll would give 28%), Flame Charge without Wildfire 0 of 60.

### 16.6 The multipliers in the SELECT viewer

SELECT in a run now opens on two lines before the buffs held, each with its values in the window under the list:
- **Damage multipliers:** `ATK x1.75+ POW x1.00+ STAB x2.40` / `MATCH x1.00 FINAL x1.10`;
- **Other multipliers:** `COND x1.00 CRIT x2.60` / `DEF x1.20 GUARD -10% (+ varies)`.

Each is what the cards held give **every hit** of that bucket: its vanilla factor plus the sum of the cards with no
condition and no scale, held to the bucket's cap (STAB and CRIT the whole factor over vanilla's x1.5 and x2; GUARD the
damage taken cut). A **+** after a value means a card held adds more on some hits (a condition, a scale, Coverage's
non-STAB bonus, a cap-exempt one). The packer writes the bucket cards (`ENTRALINK_BUFF_BUCKET_CARDS`: card, bucket,
plain) and the two messages and their titles into the `entralink_buffs` bank (fixed messages 5-8, words 23-27).
Tested (`s_view.png`): Offense x3, Power, Guard x2, Bulwark, Technique, Kinship, Heavy Crit, Adaptability I, Fire
Within I, Sniper I: ATK x1.75+ (Offense 75, Fire Within conditional), POW x1.00+ (Technique), STAB x2.40 (150 + 15 +
75), FINAL x1.10, CRIT x2.60, DEF x1.20, GUARD -10%.

### 16.7 Memory

Overlay 12 about +0.7 KB (the viewer's code 0x210 bytes, the bucket cards 132 bytes and the caps and vanillas 36, the
choice and scaling lines); overlay 167 about +0.25 KB (`CountBurnedFoes`, `GetHitStatusChance`, the two hooks); the
text bank +4 short messages. ARM9 main, heaps and VRAM unchanged.

### 16.8 Calls made, for the user

- The boss factors multiply the whole boss HP percent (curve x bonus), which is the bonus times the factor; a boss of
  one foe (the final room) takes neither.
- Fire Within counts the burned foes on the field facing the attacker; a fainted one doesn't count.
- `at_least_move_chance` is a flag, so only Wildfire changed; Static Field, Frostbite and Daze still roll on top.
- The viewer shows STAB and CRIT as their whole factor (x2.40, as the cards say "x2.25"), the others over 1.
- The double's HP line: nothing changed without a cause found (16.2).

