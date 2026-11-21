# Entralink roguelike: an audit of the blue and purple buffs

Written 2026-11-21 for the user's review, after the playtests' feedback: many buffs, mostly purples, barely matter;
purple should feel stronger than blue; the type-specific defences (Type Ward) fall flat. Review only: nothing in the
data or code is changed. The catalogue is `entralink-buffs.md` (sections 1-3, 5, 15); the values below are
`res/paperwhite2/entralink/buffs.json` as of commit `4bd3828f02`.

## 1. Method and assumptions

**The run** (`entralink_sim.py`, 5 rooms a round): about **14 picks** before the final room, on average **7.2 blue,
4.6 purple and 2.0 gold**. So a player sees about 3 purples for every 2 blues *offered*, but takes roughly half as
many purples as blues.

**The blue yardstick.** Buckets add inside and multiply across, so a pick's worth depends on what the bucket already
holds. A purple usually lands in an emptier bucket than Offense, so the fair comparison is a **mid-run blue**, the
3rd pick of its kind (two already held):

| Blue | 1st pick | 3rd pick (the yardstick) | 6th pick |
| --- | --- | --- | --- |
| Offense (+25% ATK) | +25% damage | **+17%** (1.75 / 1.50) | +11% |
| Bulwark (+20% DEF) | −17% damage taken | **−12.5%** (1/1.6 vs 1/1.4) | −8% |

**BE (blue-equivalents)** below is a card's average gain over a typical team's hits divided by that yardstick: 17%
for damage, 12.5% for damage taken. **1.0 = as good as the blue you would take instead; a purple should be about 1.5.**
For cards that aren't damage (chances, turns, heals) the BE is a judgement, marked ~.

**How often a condition holds** (a typical 6-Pokémon team at level 100, half physical and half special; assumptions
unless marked *measured*):

| Condition | Share of the team's hits | Note |
| --- | --- | --- |
| STAB move | 65% | |
| Super effective / neutral / resisted | 45% / 45% / 10% | players aim for super-effective hits |
| Contact | 35% | 70-85% for a physical contact attacker, 0% for a special one |
| Power 60 or less, or priority | 12% | ~40% for a Technician or priority user; 22% at power 75 or less |
| One type's moves (Type Affinity) | ~15% across the team | about 60% for the Pokémon whose STAB it is. With `type_card_team_weight` 300 a card rolls a team type 77% of the time (6 Pokémon, ~9 types) or 56% (3 Pokémon) |
| Foe has a major status | 10% without status moves, 60% for a status team | average 25% |
| Weather-boosted move | 5% without a weather team, 50% with one | |
| Attacker below half HP | 25% | HP carries over from room to room |
| Each Pokémon's first turn out | 30% | rooms take 1.5-4 hits |
| A boss or raid target | **~60% of the run's damage** | the sim's boss HP (2×1,314 + 3×3,963 + 22,300 = 36,800) vs its battle rooms (~62% of 30,200 = 18,700) |
| Critical hit | 6.25% (stage 0), 12.5% (+1), 25% (+2) | |
| **Foes' damaging moves that are STAB** | **72% of moves, 80% of their power** | *measured* over the 13 rooms' 58 damaging enemy moves |
| **One given type among foes' attacks** | **1/16 on average; the most common, Dragon, 17%** | *measured*: 16 types used. Inside a room one type is 33-100%, but rooms are drawn at random |

## 2. Blues

| Blue | Value of one pick | BE | Notes |
| --- | --- | --- | --- |
| Offense | +25% → +17% → +11% (1st, 3rd, 6th) | 1.0 | The yardstick |
| Bulwark | −17% → −12.5% → −8% damage taken | 1.0 | The yardstick |
| HP | +8% bulk ≈ −7.4% damage taken; the gain is healed | ~0.6 | Weaker than Bulwark. Nothing above 999 HP |
| Speed | +8% Speed | ~0.5 | Situational: the sim's base-90 player outspeeds the foes until round 3, where they catch up (216 vs 215 in the last room). Matters late and next to Slipstream |
| Guard | −5% damage taken | **0.4** | **Clearly weaker than Bulwark** (a third of a 1st Bulwark) |
| Power | +10% all damage (FINAL) | 0.6 | Weaker than Offense early, as good once Offense is 4-5 deep. It shares FINAL's +40% cap with Giant Slayer |
| Accuracy | +4%: about +1% damage (it only helps the ~25% of hits from moves under 100%, and against evasion) | **~0.06** | **The weakest card in the game.** 1.3x accuracy (Compound Eyes) would be what makes a pick felt |
| Vigor | Heals 8% of max HP after each battle (~17 battles, so up to ~1.4 max HP a run) | ~0.8 | Good for attrition, since HP carries over and rest rooms are only ~10% |

No blue has a bug. Accuracy and Guard are the clear outliers; HP and Power are about half a yardstick blue.

## 3. Purples

"Fits" is a team the card is made for (a contact attacker, a status team, a weather team...). **Too specific** means
a typical player passes it most of the time.

| # | Purple (step, cap, bucket) | Value of one pick, typical team | BE typical / fits | Too specific? | Recommendation |
| --- | --- | --- | --- | --- | --- |
| 1 | Type Affinity (+40%, 120, POW) | +40% on ~15% of hits = +6% | 0.35 / 1.4 on its Pokémon | Partly: the type is rolled, and 23-44% of cards are an off-team type | Roll only the team's types (and the held golds' theme types); +50% (cap 150) |
| 2 | Type Ward (−15%, 45, GUARD) | −15% on 1/16 of the hits taken = −0.9% | **0.07** / 1.2 in a room of its type | **Yes**: you can't plan for the rooms. It is also weighted toward the team's *own* types, which are not the types that hit it | Replace the 17 cards with one **Ward: STAB hits on you −20%** (cap 40) |
| 3 | Expert Edge (+20%, 60, MATCH) | +20% on 45% = +9% | 0.53 / 1.2 on good hits | No | Absorb Glancing Blow; +25% |
| 4 | Glancing Blow (+30%, 120, MATCH, exempt from the cap) | +30% on 10% = +3% | 0.18 / 0.5 | Yes | Merge into Expert Edge |
| 5 | Kinship (STAB +0.15, 60, STAB) | ×1.65 / ×1.5 = +10% on 65% = +6.5% | 0.38 / 0.6 | No, just weak | +0.35 (cap 1.05): +23% on STAB hits, +15% average |
| 6 | Keen Edge (crit stage +1, 2) | crits 6.25% → 12.5%: +6% | 0.37 / 0.75 (2nd pick) | No | Absorb Heavy Crit |
| 7 | Heavy Crit (crit +0.2, 60, CRIT) | +10% on 6.25% of hits = +0.6% | **0.04** / 0.15 with stage +2 | Yes, without crit stages | Merge into Keen Edge |
| 8 | Lingering Ailment (+15%, 60, residual) | 0 for most; +15% of a status team's ~25% residual share = +4% | 0.05 / 0.22 | Yes | Merge into Opportunist |
| 9 | Serene Touch (×1.2, ×2) | 10% → 12% added effects | ~0.1 / ~0.3 | Mostly | Absorb Sure Hand and Flinch Edge; ×1.5 |
| 10 | Sure Hand (+10%, 100) | Will-O-Wisp 75 → 85, Hypnosis 60 → 70 | ~0.05 / ~0.2 | Yes | Merge into Serene Touch |
| 11 | Opportunist (+30%, 90, COND) | +30% on 25% = +7.5% | 0.44 / 1.06 | No for status teams | Absorb Lingering Ailment; +45% |
| 12 | Hardy (−15%, 60) | One status in ~5-10 battles, 15% fewer | ~0.15 / ~0.3 | Mostly | Absorb Shed Skin and Quick Recovery; −25% |
| 13 | Quick Recovery (−1 turn, 2) | Only your own sleep and confusion | ~0.05 | Yes | Merge into Hardy |
| 14 | Damp Rock (+2 turns, 6) | Battles last 3-6 turns, so a 5-turn weather rarely runs out | ~0.05 / ~0.2 on bosses | Yes | Merge into Climate |
| 15 | Climate (+20%, 80, COND) | +20% on 5% = +1% | 0.06 / 0.6 | Yes, without a weather team | Absorb Damp Rock (and Overcoat); +35% |
| 16 | Overcoat (once) | 1/16 a turn in sand or hail only | ~0.05 | Yes | Fold into Climate, or cut (Sandblast already says "never you") |
| 17 | Tough Claws (+20%, 60, POW) | +20% on 35% = +7% | 0.41 / 1.0 | No (your own moves) | Absorb Rock Skin; +35% |
| 18 | Technique (+40%, 120, POW) | +40% on 12% = +5% | 0.28 / 0.94 | Mostly | Absorb Second Hit; power 75 or less; +50% |
| 19 | Second Hit (+1 hit, 3) | Multi-hit moves ~3% of hits, +32% on them = +1% | 0.06 / 0.5 | Yes | Merge into Technique |
| 20 | Big Root (+25%, 75) | Late, a draining hit already heals far past max HP (half of ~1,000 against ~320) | ~0.05 | Yes | Merge into Vampiric, or cut |
| 21 | Vampiric (3%, 15) | Early 2% of max HP a hit (230 damage); **late 9-12% a hit** (1,000-1,300 damage, ~320 HP) | 0.15 early / **2+ late** | No | Keep. Watch it: it grows with every damage buff, and 5 picks heal ~50% a hit late. See 4 |
| 22 | Rock Skin (−20%, 100) | Late recoil (1/3 of ~1,000) is more than a Pokémon's whole HP, so −20% still faints it | ~0 | Yes | Merge into Tough Claws (recoil moves are nearly all contact); see 4 |
| 23 | Flinch Edge (+5%, 20) | Flinch moves ~5% of hits, and bosses may ignore it | ~0.05 | Yes | Merge into Serene Touch |
| 24 | Pinch Power (+24%, 72, COND) | +24% on 25% = +6% | 0.35 / 0.7 | No, just weak | Absorb Focus Band; +40% |
| 25 | Focus Band (8%, 32) | ~6 faints a run × 8% = 0.5 saves | ~0.2 | Mostly | Merge into Pinch Power |
| 26 | Light Clay (+2 turns, 4) | Screens rarely run out in 3-6-turn battles | ~0.05 | Yes | Cut |
| 27 | Clear Amulet (1 drop, 2) | One foe-given drop per Pokémon per battle (Intimidate, Growl, Icy Wind...) | ~0.2 | Mostly | Keep; 2 drops a pick (cap 4) |
| 28 | Tempo (15%, 60) | +0.15 stage per boosting move, for setup teams only | 0 / 0.2 | Yes | Merge into Momentum Strike |
| 29 | Momentum Strike (+10%/stage, 60, COND) | 0 without setup; +1.5 stages on half a setup team's hits = +7.5% | 0 / 0.44 | Yes, without setup | Absorb Tempo; +15% a stage |
| 30 | First Blood (+30%, 90, COND) | +30% on 30% = +9% | 0.53 / 0.7 | No | Each Pokémon's first **two** turns out; +35% |
| 31 | Giant Slayer (+20%, 40, FINAL) | +20% on ~60% of the run's damage = +12%, all of it in the hard fights | 0.7 / 1.2 in boss fights | No: bosses always come | Move to COND (FINAL's cap 40 is shared with Power, so 4 Powers make it dead); +35% (cap 70) |
| 32 | Thrifty (15%, 45) | PP rarely binds: ~24 moves of 5-30 PP for ~17 battles, and rest rooms | ~0.1 | Yes | Cut, unless a playtest shows PP binding |
| 33 | Shed Skin (10%/turn, 30) | Cures a status in ~3 turns of 10 | ~0.15 | Mostly | Merge into Hardy |

**Counts.** For a typical team **all 33 purples are worth less than a mid-run blue**, most of them under half of one.
Even for the team they fit, **28 of 33** are under one blue; the 5 that reach a blue are Type Affinity (on its
type's Pokémon), Opportunist (status team), Tough Claws (contact attacker), Giant Slayer (in boss fights) and
Vampiric (late). **18 are too specific**, passed by most players most of the time: Type Ward, Glancing Blow, Heavy
Crit, Lingering Ailment, Sure Hand, Quick Recovery, Damp Rock, Climate, Overcoat, Second Hit, Big Root, Rock Skin,
Flinch Edge, Light Clay, Tempo, Momentum Strike, Thrifty, and Type Affinity in part. The cause is plain: a purple's
step is about a blue's (Expert Edge +20 and Tough Claws +20 against Offense +25), but it holds on only 10-45% of hits.

## 4. Other findings

- **Recoil moves faint their user late.** Recoil is a fraction of the damage dealt, and late a hit deals 1,000+ to
  scaled foes, so Brave Bird, Flare Blitz, Double-Edge, Head Smash and Wild Charge cost a ~320-HP Pokémon more than
  its HP. Rock Skin's −20% doesn't change that; only Reckless III (half recoil) and 5 Rock Skins do. Worth deciding
  whether a run caps recoil (say at 1/3 of the user's max HP) before balancing Rock Skin or Reckless.
- **Drain overheals late** for the same reason, so Big Root does nothing then. Vampiric is the reverse: weak early,
  probably the strongest defensive purple late. Capping it (per hit, e.g. at 25% of max HP) would keep it in line.
- **The simulator overrates Type Ward.** `CONDITIONAL["type_ward"]` is 0.33; the measured share is ~0.06. With 0.06
  the balanced build takes about 21-23% of its HP from a late room hit instead of 19-21%, so the enemy Attack curve
  was fitted to a defence the card doesn't give.
- **Prism** (gold, super-effective hits on you −15/25/35%) is weak for the same reason as Type Ward: super-effective
  hits are perhaps a third of the hits taken, so rank I is about −5%. The proposed Ward (below) would be better than
  Prism I. Not in this audit's scope, but worth a look: Prism III could become "and STAB hits −15%".
- **Type Ward's team weighting points the wrong way:** it favours the team's own types, but the hits that hurt are
  the team's *weaknesses*.

## 5. Proposed purples: 33 → 17

Every merged card keeps the name and id of the survivor. **Data** means it needs only `buffs.json`; **code** means a new
condition or more than one effect on a card (see 7).

| Purple | Proposed effect a pick (cap) | Bucket | Value, typical / fits (BE) | Absorbs | Needs |
| --- | --- | --- | --- | --- | --- |
| Type Affinity (X) | X moves +50% (150); X rolled only from the team's types and the held golds' themes | POW | +9% / +30% (0.5 / 1.8) | | data (step), code or a very large `type_card_team_weight` (team only) |
| Kinship | STAB +0.35 (1.05) | STAB | +15% (0.9 / 1.3) | | data |
| Expert Edge | Super-effective hits +25% (75); resisted hits +50% (150, exempt from the cap) | MATCH | +16% (0.95 / 1.5 on good hits) | Glancing Blow | code (two values) |
| Opportunist | +45% to foes with a major status (135); your residual damage on foes +30% (90) | COND | +11% / +32% (0.65 / 1.9) | Lingering Ailment | code |
| Climate | Weather-boosted moves +35% (105); weather you set +2 turns (6); sand and hail don't hurt you | COND | +2% / +20% (0.1 / 1.2) | Damp Rock, Overcoat | code |
| Tough Claws | Contact moves +35% (105); recoil −35% (100) | POW | +12% / +28% (0.7 / 1.7) | Rock Skin | code |
| Technique | Moves of power 75 or less, and priority moves, +50% (150); multi-hit moves hit once more (to 5) | POW | +11% / +20% (0.65 / 1.2) | Second Hit | data (power 75, step), code (two effects) |
| Pinch Power | +40% below half HP (120); 10% chance to survive a KO with 1 HP (30%) | COND | +10% / +20% (0.6 / 1.2) | Focus Band | code |
| Momentum Strike | +15% a boost of the attacking stat (90); 25% chance a stat boost gives +1 more (75%) | COND | 0 / +15% (0 / 0.9) | Tempo | code |
| First Blood | +35% on each Pokémon's first two turns out (105) | COND | +19% (1.1) | | code (a turn count, not a flag) |
| Giant Slayer | +35% to bosses and raid targets (70) | COND (was FINAL) | +21%, +35% in boss fights (1.2 / 2.0) | | data |
| Keen Edge | Critical stage +1 (+2); critical hits +0.25 (0.5) | CRIT | +9%, 2nd pick +19% (0.5 / 1.1) | Heavy Crit | code |
| Serene Touch | Added-effect chances, flinch included, ×1.5 (×2); status moves +10% accuracy (30) | | ~0.3 / ~0.8 | Sure Hand, Flinch Edge | code |
| Ward | STAB hits on you −20% (40) | GUARD | −16% damage taken (1.3) | Type Ward (17 cards) | code (a new condition: the attacker's STAB) |
| Hardy | −25% chance to be given a status (75%); your sleep and confusion 1 turn shorter (2); 10% a turn to cure your status (30%) | | ~0.4 | Quick Recovery, Shed Skin | code |
| Vampiric | Heal 3% of the damage you deal (15%); draining moves heal +25% | | 0.15 early / 2+ late | Big Root | code, or cut Big Root instead |
| Clear Amulet | Blocks the first 2 foe-given stat drops each battle (4) | | ~0.3 | | data |
| *Cut* | Light Clay, Thrifty | | | | data |

- **Still under 1.5 BE for a typical team:** most of them, deliberately: a theme purple (Climate, Momentum, Opportunist)
  should be great for its team and a pass for others, and the team-aware offers (section 15.7) already push them to
  the teams that use them. What changes is that each now beats a blue **for the team it fits** (1.2-2.0 BE), and the
  broad ones (First Blood, Giant Slayer, Ward, Kinship, Expert Edge) are about a blue for everyone.
- **Fewer cards means each comes up about twice as often** (17 purples instead of 33, plus Type Ward's 17 variants
  gone), so stacking a purple you planned for becomes realistic. That is itself the biggest lever on "barely matters".
- **Ward alternative:** "−30% from the type of the last move that hit this Pokémon" (inside a room one type is 33-100%
  of the hits, so about −13% on average). It reads more like a reaction than a plan, and needs a byte per Pokémon.
- **A data-only first step** (no code), if the user wants a quick playtest: raise the steps as in the table, move
  Giant Slayer to COND, Technique to power 75, Clear Amulet to 2, set `type_card_team_weight` very high, and take the
  absorbed cards plus Light Clay and Thrifty out of the pools (pools `[]`). Type Ward would then have to go too.

## 6. What it does to the balance meter and the simulator

| Number | Today | Proposed | Why |
| --- | --- | --- | --- |
| Ceiling (every bucket at its cap) | x77, crit x212 | x77, crit x212 | The bucket caps bind; no cap changes |
| Example build (5.4) | x21.7 | **x22.6** | Only Expert Edge +20 → +25 changes it: POW and COND are already at their caps in the example. That is just past the typical band's top (15-22): raise the band to 15-23, or ignore it |
| Sim, balanced, good-hit factor R1 boss / R2 boss / final room | x1.62 / x5.60 / x7.60 | x1.72 / x6.12 / x8.50 | The sim's purples are Type Affinity, Opportunist, Expert Edge and Kinship |
| Sim, balanced, good hits for the final room | 8.3 | 7.4 | |
| Sim, glass cannon, final room factor | x14.4 | x16.1 | |
| Sim, balanced, share of HP a late hit takes | 19-21% (23% with Type Ward's real share) | 15-16% | Ward on 80% of the damage taken |

Run with the proposed values set in memory (`entralink_sim.simulate` and `entralink_buffs.example_hit`, 5 rooms a
round). The attack side moves by about 10%, inside the targets. The defence side moves more (Ward is the first
defensive purple that works), so after the change `entralink_sim.py --fit` would propose a slightly higher enemy
Attack curve, or Ward could start at −15%. The meter's "strongest hit" must count only Expert Edge's
super-effective part (it already leaves out resisted-only bonuses).

## 7. Cost

Most merges need **a card to carry two or three effects**, each with its own step and cap. Today a card has one
`effect`. That is one change to the schema, the packer's tables, the battle's per-kind sums (`SumKind`), the card
text (the merged descriptions must fit the chooser's width) and the SELECT viewer, made once for every merge. Ward
needs one new condition (the attacker shares the move's type); First Blood a per-Pokémon turn count instead of a flag.

## 8. Open questions for the user

1. **Merge or cut?** Merging keeps the effects as secondary lines (needs the multi-effect change). Cutting the narrow
   cards and raising the survivors is data only and quicker to playtest. Which first?
2. **Ward:** "STAB hits on you −20%" (plannable, ~−16%) or "the type that hit you last −30%" (reactive, ~−13%)?
   And should Prism (gold) change with it?
3. **Type Affinity:** only the team's types, or keep a small chance of an off-team type for a team change?
4. **Recoil late:** cap a run's recoil (e.g. at 1/3 of the user's max HP)? Rock Skin's (Tough Claws') value depends
   on it.
5. **Vampiric late:** cap its heal per hit, or let it be the stall build's late payoff?
6. **The target:** is about 1.2-2 blues for the team a card fits, and about one blue for the broad ones, the feel
   wanted, or should every purple beat a blue for everyone (that would mean steps of +50-80% on conditional cards)?
7. **Blues:** leave Accuracy and Guard as they are, as asked, or raise them later (Accuracy ×1.1 a pick, Guard 8%)?
