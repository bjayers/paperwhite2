#!/usr/bin/env python3
"""Paper White 2's Entralink roguelike: a run simulated outside the game, for the enemies' scaling (entralink-buffs.md,
section 12).

    entralink_sim.py                  # the run with run.json's enemy_scaling: a table per archetype
    entralink_sim.py --fit            # proposes enemy_scaling's curves from the decisions' targets
    entralink_sim.py --markdown       # the doc's short table (the balanced and glass-cannon builds)

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
  effectiveness ("typical"); "strong" adds a super-effective hit and one +2 setup (x4). The player's Pokémon are
  level 100, IVs 31, their attacking stat a dedicated attacker's (base 110, full EVs) and the others base 90 with no
  EVs; the enemies the rooms' level 70 with base 95 stats and IVs 15.
  Physical and special hits count half each, so a stat bucket counts at the average of its two stats.
- **The enemies' multipliers** (enemy_scaling, percent): a stat's multiplier in a round's room n (from 0) is
  rooms[round] + n x room_step[round]; a boss's, the final room's and a raid's is boss[round].

Output per place: the enemy's HP and multipliers; for each build its typical hit, the hits a lone attacker needs
(typical and strong), the enemy's typical hit as a share of the build's HP, and who moves first.
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
STRONG = 4.0

# The builds' preferences by tier, in order; a gold's ranks come from the data. The attack side is section 5.3's
# themed build (the user's paralysis set: its golds' conditions hold, as the player plays for them)
ATTACK = {"blue": ["sp_attack", "power"], "purple": ["type_affinity", "opportunist", "expert_edge", "kinship"],
          "gold": ["galvanic", "overcharge", "adaptability", "slipstream", "expert"]}
DEFENCE = {"blue": ["defense", "sp_defense", "guard", "hp"], "purple": ["type_ward", "focus_band", "vampiric"],
           "gold": ["bulwark", "prism", "regrowth", "second_wind"]}
# The share of hits a conditional card holds for: a type card's type (the moves of the type it rolled), Slipstream's
# speed gap, Prism on the super-effective hits taken; defense and sp_defense each guard one of the two halves of the
# hits taken (physical, special)
CONDITIONAL = {"type_affinity": 0.75, "type_ward": 0.33, "slipstream": 0.5, "prism": 0.3, "defense": 0.5,
               "sp_defense": 0.5}
# Cards that hold only on a super-effective hit (the strong hit's), or on a boss
SUPER_EFFECTIVE_ONLY = {"expert_edge", "expert"}
BOSS_ONLY = {"giant_slayer"}
ARCHETYPES = ["balanced", "glass_cannon", "defensive"]
# The fit's targets (fit()): a round's boss in strong hits of a balanced build (rounds 1 and 2), the final room's HP
# (decision 3's "toward 50,000 by the end"), and a boss's hit as a share of a balanced build's HP, in times a room
# enemy's
BOSS_STRONG_HITS = [6, 9, 9]
FINAL_HP = 50000
BOSS_SHARE = 3.0


def load(directory: Path = SOURCE) -> tuple[dict, dict]:
    run = json.loads((directory / "run.json").read_text(encoding="utf-8"))
    buffs = json.loads((directory / "buffs.json").read_text(encoding="utf-8"))
    return run, buffs


def multiplier(curves: dict, stat: str, round_index: int, room: int | None) -> int:
    """A stat's percent in a round's room n (from 0), or for its boss (room None)."""
    curve = curves[stat]
    if room is None:
        return curve["boss"][round_index]
    return curve["rooms"][round_index] + room * curve["room_step"][round_index]


def places(run: dict) -> list[dict]:
    out = []
    for r, round_ in enumerate(run["rounds"]):
        for n in range(round_["rooms"]):
            out.append({"label": f"R{r + 1} room {n + 1}", "round": r, "room": n,
                        "weights": {**DEFAULT_TYPE_WEIGHTS, **round_.get("type_weights", {})}})
        last = r == len(run["rounds"]) - 1
        if round_.get("boss") or last:
            out.append({"label": f"R{r + 1} {'final' if last else 'boss'}", "round": r, "room": None,
                        "final": last})
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
        e = self.entries[card]
        level = self.levels.get(card, 0)
        if level == 0:
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


def simulate(run: dict, buffs: dict, curves: dict | None = None) -> dict[str, list[dict]]:
    curves = curves or entralink_run.enemy_scaling(run)
    player = player_stats()
    enemy = enemy_stats()
    settings = buffs["settings"]
    results = {}
    for archetype in ARCHETYPES:
        build = Build(archetype, buffs)
        totals = {"blue": 0.0, "purple": 0.0, "gold": 0.0}
        taken = {"blue": 0, "purple": 0, "gold": 0}
        rows = []
        for place in places(run):
            boss = place["room"] is None
            m = {s: multiplier(curves, s, place["round"], place["room"]) / 100 for s in STATS}
            e = {s: enemy[s] * m[s] for s in STATS}
            e["hp"] = min(e["hp"], 65535)
            f = build.factors(buffs, boss)
            # The battle: the build's buffs from the picks before it
            hit = damage(PLAYER_LEVEL, player["attack"], e["defense"]) * f["attack"]
            strong = damage(PLAYER_LEVEL, player["attack"], e["defense"]) * STRONG * \
                build.factors(buffs, boss, True)["attack"]
            taken_hit = damage(ENEMY_LEVEL, e["attack"], player["defense"]) * f["defence"]
            player_hp = min(player["hp"] * f["hp"], 999)
            rows.append({
                "place": place["label"], "picks": sum(taken.values()), "golds": taken["gold"],
                "enemy_hp": round(e["hp"]), "mult": {s: round(m[s] * 100) for s in STATS},
                "hit": round(hit), "hits": e["hp"] / hit, "strong": round(strong), "strong_hits": e["hp"] / strong,
                "share": taken_hit / player_hp, "first": "you" if player["speed"] * f["speed"] >= e["speed"] else "foe",
                "attack": f["attack"], "defence": f["defence"],
            })
            for tier, n in expected_picks(place, settings).items():
                totals[tier] += n
                while taken[tier] + 1 <= totals[tier] + 0.5:
                    taken[tier] += 1
                    build.take(tier)
        results[archetype] = rows
    return results


def fit(run: dict, buffs: dict) -> dict:
    """enemy_scaling's curves from the decisions (section 6): Defense and Sp. Def to x1.3 by the final room; Speed so
    the final room's enemy matches the unbuffed player; HP so a balanced build's typical hit takes 2.5 hits in round
    1's first room growing to 4 by round 3's last, a boss BOSS_STRONG_HITS of its strong hits and the final room
    FINAL_HP; Attack and Sp. Atk so the enemy's hit costs a balanced build the share it costs in the first room, a
    boss's BOSS_SHARE times that."""
    boss_strong_hits = BOSS_STRONG_HITS
    final_hp = FINAL_HP
    boss_share = BOSS_SHARE
    rounds = len(run["rounds"])
    all_places = places(run)
    count = len(all_places)
    flat = {s: {"rooms": [100] * rounds, "room_step": [0] * rounds, "boss": [100] * rounds} for s in STATS}
    player = player_stats()
    enemy = enemy_stats()
    balanced = simulate(run, buffs, flat)["balanced"]
    base_share = balanced[0]["share"]
    wanted = {s: [] for s in STATS}
    for i, (place, row) in enumerate(zip(all_places, balanced)):
        depth = i / (count - 1)
        boss = place["room"] is None
        defense = 1 + 0.3 * depth
        speed = 1 + (player["speed"] / enemy["speed"] - 1) * depth
        # the share with no attack multiplier is row's share (Defense flat); with this defence it is the same, since
        # the enemy's defence doesn't enter its own hit
        attack = base_share * (boss_share if boss else 1) / row["share"]
        hit = row["hit"] / defense
        if boss:
            target = final_hp if place.get("final") else boss_strong_hits[place["round"]] * row["strong"] / defense
        else:
            target = (2.5 + 1.5 * depth) * hit
        hp = target / enemy["hp"]
        for s, v in (("hp", hp), ("attack", attack), ("sp_attack", attack), ("defense", defense),
                     ("sp_defense", defense), ("speed", speed)):
            wanted[s].append(v)
    out = {}
    for s in STATS:
        curve = {"rooms": [], "room_step": [], "boss": []}
        i = 0
        for r, round_ in enumerate(run["rounds"]):
            n = round_["rooms"]
            values = wanted[s][i:i + n]
            first = values[0] if values else 1
            step = (values[-1] - values[0]) / (n - 1) if n > 1 else 0
            curve["rooms"].append(nice(first * 100))
            curve["room_step"].append(nice(step * 100))
            i += n
            if round_.get("boss") or r == rounds - 1:
                curve["boss"].append(nice(wanted[s][i] * 100))
                i += 1
            else:
                curve["boss"].append(curve["rooms"][-1])
        out[s] = curve
    return out


def nice(value: float) -> int:
    """A round percent: to 5 under 200, 10 under 1,000, 50 under 5,000, else 100."""
    for limit, unit in ((200, 5), (1000, 10), (5000, 50)):
        if value < limit:
            return max(unit, int(round(value / unit) * unit))
    return int(round(value / 100) * 100)


def print_table(results: dict[str, list[dict]]):
    for archetype, rows in results.items():
        print(f"\n{archetype}")
        print(f"{'place':12s} {'picks':>5s} {'HP':>6s} {'hp%':>6s} {'atk%':>5s} {'def%':>5s} {'spe%':>5s} "
              f"{'hit':>5s} {'hits':>5s} {'strong':>6s} {'hits':>5s} {'taken':>6s} {'first':>5s} {'xatk':>5s} "
              f"{'xdef':>5s}")
        for r in rows:
            m = r["mult"]
            print(f"{r['place']:12s} {r['picks']:5d} {r['enemy_hp']:6d} {m['hp']:6d} {m['attack']:5d} "
                  f"{m['defense']:5d} {m['speed']:5d} {r['hit']:5d} {r['hits']:5.1f} {r['strong']:6d} "
                  f"{r['strong_hits']:5.1f} "
                  f"{r['share'] * 100:5.0f}% {r['first']:>5s} {r['attack']:5.2f} {r['defence']:5.2f}")


def markdown(results: dict[str, list[dict]]) -> str:
    lines = ["| Place | Picks | Enemy HP | HP, Atk, Def, Spe % | Balanced: hit, hits (strong) | Balanced: hit taken | "
             "Glass cannon: hits (strong) | Glass cannon: hit taken | Defensive: hit taken |",
             "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    for b, g, d in zip(results["balanced"], results["glass_cannon"], results["defensive"]):
        m = b["mult"]
        lines.append(f"| {b['place']} | {b['picks']} | {b['enemy_hp']:,} | {m['hp']}, {m['attack']}, {m['defense']}, "
                     f"{m['speed']} | {b['hit']:,}, {b['hits']:.1f} ({b['strong_hits']:.1f}) | {b['share']:.0%} | "
                     f"{g['hits']:.1f} ({g['strong_hits']:.1f}) | {g['share']:.0%} | {d['share']:.0%} |")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--fit", action="store_true", help="propose enemy_scaling's curves")
    parser.add_argument("--markdown", action="store_true", help="the doc's table")
    parser.add_argument("--rooms", type=int, help="every round's rooms instead of run.json's (a longer run)")
    args = parser.parse_args()
    run, buffs = load()
    if args.rooms is not None:
        for round_ in run["rounds"]:
            round_["rooms"] = args.rooms
    if args.fit:
        curves = fit(run, buffs)
        print(json.dumps(curves, indent=4))
        print_table(simulate(run, buffs, curves))
        return
    results = simulate(run, buffs)
    if args.markdown:
        print(markdown(results))
    else:
        print_table(results)


if __name__ == "__main__":
    main()
