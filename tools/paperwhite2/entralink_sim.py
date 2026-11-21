#!/usr/bin/env python3
"""Paper White 2's Entralink roguelike: a run simulated outside the game, for the enemies' scaling and the buffs'
values together (entralink-buffs.md, sections 5 and 12).

    entralink_sim.py                  # the run with run.json's enemy_scaling: a table per archetype
    entralink_sim.py --fit            # proposes enemy_scaling's curves and boss bonuses from the targets below
    entralink_sim.py --markdown       # the doc's short table (the balanced and glass-cannon builds)
    entralink_sim.py --rooms 5        # every round with 5 rooms instead of run.json's

The model, stdlib only and deliberately plain:
- **The run:** run.json's rounds (their rooms, then a boss for a round with one, the final room after the last), each
  room's type by the round's type_weights (their defaults where left out). A battle room (enemy, enemy_choice,
  challenge) and a boss each give an offer after the battle (the final room none), a buff room a card, an item room
  its gift NPC's card at gift_buff_chance, a shop a card half the time. The expected picks of each tier add up from
  buffs.json's tier_odds by source, and a build takes them as whole picks as their running total passes each one.
- **The builds (archetypes):** each tier's picks go down a list of cards that build favours, a blue or purple until
  its cap, a gold first to rank 2, then a new one (5 slots), then to rank 3: balanced alternates attack and defence,
  glass cannon only attacks, defensive only defends. A conditional card counts at the share of hits it holds for
  (CONDITIONAL below). The buckets' maths is buffs.json's (entralink_buffs.factor: sums held to the caps).
- **The hits:** Gen 5's damage formula, the average roll (x0.925), a 90-power move with STAB and neutral
  effectiveness ("typical"); a "good" hit is super effective (x2, with the cards that hold only then). The player's
  Pokémon are level 100, IVs 31, their attacking stat a dedicated attacker's (base 110, full EVs) and the others base
  90 with no EVs; the enemies the rooms' level 70 with base 95 stats and IVs 15.
- **The enemies' multipliers** (enemy_scaling, percent; entralink_run.enemy_scaling works them out): a room's is the
  stat's curve at the room's depth across the whole run, start + (end - start) x depth^(curve / 100); a boss's and
  the final room's the curve at its round's last room times its boss_bonus. A raid in a room takes the room's, with
  its HP times raid_hp_factor (not modelled here: the table is a lone enemy room). Keyed by depth across the run, so
  --rooms N keeps the arc.
- **Bosses fight as a team:** a boss place has the average foe count of the boss rooms that can come up there (a
  raid's one foe counts once, as three players share it), and its "good hits" are the good hits to faint them all;
  each foe's HP bonus takes run.json's boss_double_factor or boss_triple_factor by its battle's foes (the average
  over the pool).

Output per place: the enemy's HP and multipliers; for each build its attack factor (the buckets on a good hit), its
typical hit and the hits a lone attacker needs on one foe, the good hits to faint all the place's foes, the enemy's
typical hit as a share of the build's HP, and who moves first.
"""
import argparse
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.paperwhite2 import entralink_buffs, entralink_run  # noqa: E402

SOURCE = ROOT / "res" / "paperwhite2" / "entralink"
STATS = entralink_run.SCALED_STATS
DEFAULT_TYPE_WEIGHTS = entralink_run.DEFAULT_TYPE_WEIGHTS
BATTLE_SOURCES = {"enemy": "enemy", "enemy_choice": "enemy", "challenge": "challenge"}
SHOP_CARD_CHANCE = 0.5

# The typical Pokémon (see the module's docstring)
PLAYER_LEVEL = 100
PLAYER_BASE = 90
ATTACKER_BASE = 110
PLAYER_IV = 31
ENEMY_LEVEL = 70
ENEMY_BASE = 95
ENEMY_IV = 15
MOVE_POWER = 90
STAB = 1.5
AVERAGE_ROLL = 0.925
SUPER_EFFECTIVE = 2.0
# The most a foe's max HP can be in battle
MAX_HP = 65535

# The builds' preferences by tier, in order; a gold's ranks come from the data. The attack side is section 5.3's
# themed build (the user's paralysis set: its golds' conditions hold, as the player plays for them)
ATTACK = {"blue": ["attack", "power"], "purple": ["type_affinity", "opportunist", "expert_edge", "kinship"],
          "gold": ["galvanic", "overcharge", "adaptability", "slipstream", "expert"]}
DEFENCE = {"blue": ["defense", "guard", "hp"], "purple": ["type_ward", "focus_band", "vampiric"],
           "gold": ["bulwark", "prism", "regrowth", "second_wind"]}
# The share of hits a conditional card holds for: a type card's type (the moves of the type it rolled), Slipstream's
# speed gap, Prism on the super-effective hits taken, the gold Bulwark (Bastion) by missing HP (about half on average)
CONDITIONAL = {"type_affinity": 0.75, "type_ward": 0.33, "slipstream": 0.5, "prism": 0.3, "bulwark": 0.5}
# Cards that hold only on a super-effective hit (the good hit's), or on a boss
SUPER_EFFECTIVE_ONLY = {"expert_edge", "expert"}
BOSS_ONLY = {"giant_slayer"}
ARCHETYPES = ["balanced", "glass_cannon", "defensive"]
# The fit's targets (rebalance 2, decided with the user): a room enemy in typical hits of a balanced build, from the
# first room's to the last room's along the depth; a boss's foes together in good hits of a balanced build, a round
# each (round 3's: the final room); the enemy's typical hit as a share of a balanced build's HP in rooms and a boss's
FIRST_HITS = 1.5
LAST_HITS = 4.0
BOSS_GOOD_HITS = [6, 8, 9]
ROOM_SHARE = 0.20
BOSS_SHARE = 0.25
# The boss bonus the fit may propose: HP's, and the other stats' (decided: x1.0 to x1.1)
BOSS_HP_BONUS = (150, 500)
BOSS_STAT_BONUS = (100, 110)


def load(directory: Path = SOURCE) -> tuple[dict, dict]:
    run = json.loads((directory / "run.json").read_text(encoding="utf-8"))
    buffs = json.loads((directory / "buffs.json").read_text(encoding="utf-8"))
    return run, buffs


def boss_pools(run: dict, directory: Path = SOURCE) -> list[list[dict]]:
    """The boss rooms each round can end with (rounds 1 and 2: the boss pool; round 3: the final rooms)."""
    try:
        rooms = {path.stem: json.loads(path.read_text(encoding="utf-8"))
                 for path in sorted((directory / "rooms").glob("*.json"))}
    except OSError:
        rooms = {}
    out = []
    for number in (1, 2, 3):
        if number < 3:
            out.append([rooms[n] for n in entralink_run.boss_pool(rooms, number)] if rooms else [])
        else:
            out.append([r for r in rooms.values() if r.get("role") == "final"])
    return out


def battle_foes(room: dict) -> list[tuple[int, bool]]:
    """Each battle of a room: its foe count and whether it is a raid (one foe)."""
    battles = room.get("battles", [])
    return [(1, True) if b.get("format") == "raid" else (len(b.get("enemies", [])) or 1, False)
            for b in battles] or [(1, False)]


def boss_foes(run: dict, directory: Path = SOURCE) -> list[float]:
    """The average foe count of the boss rooms each round can end with, 1 where none is found; a raid counts as one
    foe."""
    out = []
    for pool in boss_pools(run, directory):
        counts = [sum(n for n, _ in battle_foes(r)) / len(battle_foes(r)) for r in pool]
        out.append(sum(counts) / len(counts) if counts else 1.0)
    return out


def boss_hp_factors(run: dict, directory: Path = SOURCE) -> list[float]:
    """The average factor on each round's boss's HP bonus by its foes (fixes 9: run.json's boss_double_factor with
    two, boss_triple_factor with three; a raid none), 1 where no boss room is found."""
    double, triple = (p / 100 for p in entralink_run.boss_multi_percents(run))
    out = []
    for pool in boss_pools(run, directory):
        factors = []
        for room in pool:
            each = [1.0 if raid or n < 2 else (double if n == 2 else triple) for n, raid in battle_foes(room)]
            factors.append(sum(each) / len(each))
        out.append(sum(factors) / len(factors) if factors else 1.0)
    return out


def multiplier(curves: dict, stat: str, place: dict) -> int:
    """A stat's percent in a place: its room's depth in the run's table, or its round's boss value."""
    curve = curves[stat]
    if place["room"] is None:
        return curve["boss"][place["round"]]
    return curve["rooms"][place["index"]]


def places(run: dict, foes: list[float] | None = None) -> list[dict]:
    foes = foes or [1.0, 1.0, 1.0]
    out = []
    index = 0
    for r, round_ in enumerate(run["rounds"]):
        for n in range(round_["rooms"]):
            index += 1
            out.append({"label": f"R{r + 1} room {n + 1}", "round": r, "room": n, "index": index - 1, "foes": 1.0,
                        "weights": {**DEFAULT_TYPE_WEIGHTS, **round_.get("type_weights", {})}})
        last = r == len(run["rounds"]) - 1
        if round_.get("boss") or last:
            out.append({"label": f"R{r + 1} {'final' if last else 'boss'}", "round": r, "room": None,
                        "final": last, "foes": foes[2 if last else r]})
    return out


def expected_picks(place: dict, settings: dict) -> dict[str, float]:
    """The cards a place gives on average, by tier."""
    odds = settings["tier_odds"]
    picks = {"blue": 0.0, "purple": 0.0, "gold": 0.0}

    def add(source: str, chance: float):
        row = odds[source]
        total = sum(row.values())
        for tier in picks:
            picks[tier] += chance * row.get(tier, 0) / total

    if place["room"] is None:
        if not place.get("final"):
            add("boss", 1.0)
        return picks
    weights = place["weights"]
    total = sum(weights.values())
    for kind, weight in weights.items():
        chance = weight / total
        if kind in BATTLE_SOURCES:
            add(BATTLE_SOURCES[kind], chance)
        elif kind == "buff":
            add("buff_room", chance)
        elif kind == "item":
            add("gift", chance * settings.get("gift_buff_chance", 50) / 100)
        elif kind == "shop":
            add("shop", chance * SHOP_CARD_CHANCE)
    return picks


class Build:
    """A build's cards (a count, or a gold's rank) as it takes picks."""

    def __init__(self, archetype: str, buffs: dict):
        self.archetype = archetype
        self.entries = {e["id"]: e for e in buffs["buffs"]}
        self.levels: dict[str, int] = {}
        self.turn = {"blue": 0, "purple": 0, "gold": 0}
        self.slots = buffs["settings"].get("gold_slots", 5)
        self.max_rank = buffs["settings"].get("max_rank", 3)

    def lists(self, tier: str) -> list[list[str]]:
        if self.archetype == "glass_cannon":
            return [ATTACK[tier]]
        if self.archetype == "defensive":
            return [DEFENCE[tier]]
        # balanced: attack and defence in turn
        order = [ATTACK[tier], DEFENCE[tier]]
        return order[self.turn[tier] % 2:] + order[:self.turn[tier] % 2]

    def stack_room(self, card: str) -> bool:
        e = self.entries[card]
        picks = self.levels.get(card, 0)
        return entralink_buffs.picked_value(e["step"], e.get("soft_limit"), e["cap"], picks + 1) != \
            entralink_buffs.picked_value(e["step"], e.get("soft_limit"), e["cap"], picks)

    def take(self, tier: str):
        for cards in self.lists(tier):
            if tier == "gold":
                held = [c for c in cards if c in self.levels]
                for limit in (2, self.max_rank):
                    for card in held:
                        if self.levels[card] < limit:
                            self.levels[card] += 1
                            self.turn[tier] += 1
                            return
                    if limit == 2 and sum(1 for c, e in self.entries.items()
                                          if c in self.levels and e["tier"] == "gold") < self.slots:
                        new = [c for c in cards if c not in self.levels and c in self.entries]
                        if new:
                            self.levels[new[0]] = 1
                            self.turn[tier] += 1
                            return
            else:
                for card in cards:
                    if card in self.entries and self.stack_room(card):
                        self.levels[card] = self.levels.get(card, 0) + 1
                        self.turn[tier] += 1
                        return

    def value(self, card: str) -> float:
        e = self.entries.get(card)
        level = self.levels.get(card, 0)
        if e is None or level == 0:
            return 0
        if e["tier"] == "gold":
            return e["ranks"][min(level, len(e["ranks"])) - 1]
        return entralink_buffs.picked_value(e["step"], e.get("soft_limit"), e["cap"], level)

    def factors(self, buffs: dict, boss: bool, super_effective: bool = False) -> dict[str, float]:
        """The build's attack factor (the attack buckets on a typical hit, or a super-effective one), its defence
        factor (the share of an enemy's hit it takes: DEF and GUARD), its max HP factor and its speed factor."""
        sums = {b["id"]: 0.0 for b in buffs["buckets"]}
        for card in self.levels:
            e = self.entries[card]
            if (card in BOSS_ONLY and not boss) or (card in SUPER_EFFECTIVE_ONLY and not super_effective):
                continue
            if e.get("bucket") in sums:
                sums[e["bucket"]] += self.value(card) * CONDITIONAL.get(card, 1.0)
        attack = 1.0
        defence = 1.0
        for bucket in buffs["buckets"]:
            if bucket.get("critical_only"):
                continue
            f = entralink_buffs.factor(bucket, sums[bucket["id"]])
            if bucket["side"] == "attack":
                attack *= f
            elif bucket.get("reduces"):
                defence *= f
            else:
                defence /= f
        hp = 1 + self.value("hp") / 100
        speed = 1 + self.value("speed") / 100
        return {"attack": attack, "defence": defence, "hp": hp, "speed": speed}


def stat(base: int, iv: int, level: int, hp: bool = False, ev: int = 0) -> int:
    if hp:
        return (2 * base + iv + ev // 4) * level // 100 + level + 10
    return (2 * base + iv + ev // 4) * level // 100 + 5


def player_stats() -> dict[str, int]:
    """The typical team member: its attacking stat a dedicated attacker's (ATTACKER_BASE, full EVs), the rest
    PLAYER_BASE with no EVs. The attack and sp_attack keys both hold the attacking stat."""
    out = {s: stat(PLAYER_BASE, PLAYER_IV, PLAYER_LEVEL, s == "hp") for s in STATS}
    out["attack"] = out["sp_attack"] = stat(ATTACKER_BASE, PLAYER_IV, PLAYER_LEVEL, ev=252)
    return out


def enemy_stats() -> dict[str, int]:
    return {s: stat(ENEMY_BASE, ENEMY_IV, ENEMY_LEVEL, s == "hp") for s in STATS}


def damage(level: int, attack: float, defense: float, power: int = MOVE_POWER) -> float:
    base = math.floor(math.floor((2 * level // 5 + 2) * power * attack / defense) / 50) + 2
    return base * STAB * AVERAGE_ROLL


def simulate(run: dict, buffs: dict, curves: dict | None = None, foes: list[float] | None = None,
             hp_factors: list[float] | None = None) -> dict[str, list[dict]]:
    curves = curves or entralink_run.enemy_scaling(run)
    hp_factors = hp_factors or [1.0, 1.0, 1.0]
    player = player_stats()
    enemy = enemy_stats()
    settings = buffs["settings"]
    results = {}
    for archetype in ARCHETYPES:
        build = Build(archetype, buffs)
        totals = {"blue": 0.0, "purple": 0.0, "gold": 0.0}
        taken = {"blue": 0, "purple": 0, "gold": 0}
        rows = []
        for place in places(run, foes):
            boss = place["room"] is None
            m = {s: multiplier(curves, s, place) / 100 for s in STATS}
            e = {s: enemy[s] * m[s] for s in STATS}
            if boss:
                e["hp"] *= hp_factors[2 if place.get("final") else place["round"]]
            e["hp"] = min(e["hp"], MAX_HP)
            f = build.factors(buffs, boss)
            good_f = build.factors(buffs, boss, True)
            # The battle: the build's buffs from the picks before it
            base = damage(PLAYER_LEVEL, player["attack"], e["defense"])
            hit = base * f["attack"]
            good = base * SUPER_EFFECTIVE * good_f["attack"]
            taken_hit = damage(ENEMY_LEVEL, e["attack"], player["defense"]) * f["defence"]
            player_hp = min(player["hp"] * f["hp"], 999)
            rows.append({
                "place": place["label"], "picks": sum(taken.values()), "golds": taken["gold"],
                "enemy_hp": round(e["hp"]), "foes": place["foes"], "mult": {s: round(m[s] * 100) for s in STATS},
                "hit": round(hit), "hits": e["hp"] / hit, "good": round(good),
                "good_hits": e["hp"] * place["foes"] / good,
                "share": taken_hit / player_hp, "first": "you" if player["speed"] * f["speed"] >= e["speed"] else "foe",
                "attack": f["attack"], "good_attack": good_f["attack"], "defence": f["defence"],
            })
            for tier, n in expected_picks(place, settings).items():
                totals[tier] += n
                while taken[tier] + 1 <= totals[tier] + 0.5:
                    taken[tier] += 1
                    build.take(tier)
        results[archetype] = rows
    return results


def fit(run: dict, buffs: dict, foes: list[float] | None = None, hp_factors: list[float] | None = None) -> dict:
    """enemy_scaling's curves and boss bonuses from the targets (rebalance 2): Defense and Sp. Def to x1.3 by the last
    room; Speed so the last room's enemy matches the unbuffed player; HP so a balanced build's typical hit takes
    FIRST_HITS hits in the first room growing to LAST_HITS by the last; Attack and Sp. Atk so a room enemy's hit costs
    a balanced build ROOM_SHARE of its HP. A stat's start and end are the wanted values in the first and last room,
    its curve exponent the best (least squared error in the log) for the rooms between. A boss's HP bonus makes its
    foes together BOSS_GOOD_HITS good hits of the balanced build, its Attack's and Sp. Atk's a boss's hit BOSS_SHARE
    (both held to the decided ranges), the others none."""
    foes = foes or [1.0, 1.0, 1.0]
    hp_factors = hp_factors or [1.0, 1.0, 1.0]
    room_count = entralink_run.run_room_count(run)
    flat = entralink_run.enemy_scaling({"rounds": run["rounds"]})
    player = player_stats()
    enemy = enemy_stats()
    all_places = places(run, foes)
    balanced = simulate(run, buffs, flat, foes)["balanced"]
    wanted = {s: [] for s in STATS}
    for place, row in zip(all_places, balanced):
        if place["room"] is not None:
            depth = place["index"] / max(1, room_count - 1)
            defense = 1 + 0.3 * depth
            speed = 1 + (player["speed"] / enemy["speed"] - 1) * depth
            attack = ROOM_SHARE / row["share"]
            hp = (FIRST_HITS + (LAST_HITS - FIRST_HITS) * depth) * row["hit"] / defense / enemy["hp"]
            for s, v in (("hp", hp), ("attack", attack), ("sp_attack", attack), ("defense", defense),
                         ("sp_defense", defense), ("speed", speed)):
                wanted[s].append(v)
    out = {}
    for s in STATS:
        values = wanted[s]
        start = nice(values[0] * 100)
        end = nice(values[-1] * 100)
        out[s] = {"start": start, "end": end, "curve": best_curve(values, start, end), "boss_bonus": [100, 100, 100]}
    # The bosses, against the fitted rooms
    curves = entralink_run.enemy_scaling({"rounds": run["rounds"], "enemy_scaling": out})
    for place, row in zip(all_places, balanced):
        if place["room"] is not None:
            continue
        r = 2 if place.get("final") else place["round"]
        room = {s: curves[s]["boss"][r] / 100 for s in STATS}
        good = row["good"] / room["defense"]
        hp = BOSS_GOOD_HITS[r] * good / place["foes"] / (enemy["hp"] * room["hp"] * hp_factors[r])
        out["hp"]["boss_bonus"][r] = clamp(nice(hp * 100), *BOSS_HP_BONUS)
        attack = BOSS_SHARE / (row["share"] * room["attack"])
        for s in ("attack", "sp_attack"):
            out[s]["boss_bonus"][r] = clamp(nice(attack * 100), *BOSS_STAT_BONUS)
    return out


def clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))


def best_curve(values: list[float], start: int, end: int) -> int:
    """The curve exponent (hundredths, steps of 25) that puts start..end closest to the wanted values."""
    n = len(values)
    best = (1e18, 100)
    for curve in range(25, 801, 25):
        error = 0.0
        for i, v in enumerate(values):
            model = start + (end - start) * ((i / (n - 1)) ** (curve / 100) if n > 1 else 0)
            error += (math.log(max(model, 1)) - math.log(max(v * 100, 1))) ** 2
        best = min(best, (error, curve))
    return best[1]


def nice(value: float) -> int:
    """A round percent: to 5 under 200, 10 under 1,000, 50 under 5,000, else 100."""
    for limit, unit in ((200, 5), (1000, 10), (5000, 50)):
        if value < limit:
            return max(unit, int(round(value / unit) * unit))
    return int(round(value / 100) * 100)


def print_table(results: dict[str, list[dict]]):
    for archetype, rows in results.items():
        print(f"\n{archetype}")
        print(f"{'place':12s} {'picks':>5s} {'HP':>6s} {'foes':>4s} {'hp%':>6s} {'atk%':>5s} {'def%':>5s} {'spe%':>5s} "
              f"{'hit':>6s} {'hits':>5s} {'good':>6s} {'goods':>5s} {'taken':>6s} {'first':>5s} {'xatk':>5s} "
              f"{'xgood':>5s} {'xdef':>5s}")
        for r in rows:
            m = r["mult"]
            print(f"{r['place']:12s} {r['picks']:5d} {r['enemy_hp']:6d} {r['foes']:4.1f} {m['hp']:6d} {m['attack']:5d} "
                  f"{m['defense']:5d} {m['speed']:5d} {r['hit']:6d} {r['hits']:5.1f} {r['good']:6d} "
                  f"{r['good_hits']:5.1f} {r['share'] * 100:5.0f}% {r['first']:>5s} {r['attack']:5.2f} "
                  f"{r['good_attack']:5.1f} {r['defence']:5.2f}")


def markdown(results: dict[str, list[dict]]) -> str:
    lines = ["| Place | Picks | Enemy HP (foes) | HP, Atk, Def, Spe % | Balanced: factor on a good hit | "
             "Balanced: typical hit, hits | Balanced: good hit, good hits for all foes | Balanced: hit taken | "
             "Glass cannon: hits (good hits) | Glass cannon: hit taken | Defensive: hit taken |",
             "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    for b, g, d in zip(results["balanced"], results["glass_cannon"], results["defensive"]):
        m = b["mult"]
        foes = f" (x{b['foes']:g})" if b["foes"] != 1 else ""
        lines.append(f"| {b['place']} | {b['picks']} | {b['enemy_hp']:,}{foes} | {m['hp']}, {m['attack']}, "
                     f"{m['defense']}, {m['speed']} | x{b['good_attack']:.1f} | {b['hit']:,}, {b['hits']:.1f} | "
                     f"{b['good']:,}, {b['good_hits']:.1f} | {b['share']:.0%} | "
                     f"{g['hits']:.1f} ({g['good_hits']:.1f}) | {g['share']:.0%} | {d['share']:.0%} |")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--fit", action="store_true", help="propose enemy_scaling's curves and boss bonuses")
    parser.add_argument("--markdown", action="store_true", help="the doc's table")
    parser.add_argument("--rooms", type=int, help="every round's rooms instead of run.json's (a longer run)")
    args = parser.parse_args()
    run, buffs = load()
    if args.rooms is not None:
        for round_ in run["rounds"]:
            round_["rooms"] = args.rooms
    foes = boss_foes(run)
    hp_factors = boss_hp_factors(run)
    if args.fit:
        curves = fit(run, buffs, foes, hp_factors)
        print(json.dumps(curves, indent=4))
        applied = {**run, "enemy_scaling": curves}
        print_table(simulate(applied, buffs, foes=foes, hp_factors=hp_factors))
        return
    results = simulate(run, buffs, foes=foes, hp_factors=hp_factors)
    if args.markdown:
        print(markdown(results))
    else:
        print_table(results)


if __name__ == "__main__":
    main()
