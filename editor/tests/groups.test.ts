// The spawn groups' members and chances as the Overworld Editor works them out (src/modules/overworld/groups.ts),
// against cases worked by hand: weights alone, members that can't always appear, the nobody weight, the sampling past
// the exact sizes, and the members found across zones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupMembers, groupOdds, groupWarnings, newGroupId, type Member } from "../src/modules/overworld/groups.ts";

const member = (weight: number, able = 1): Member => ({ zone: "z", kind: "ambient", ambient: 0, label: "m", weight, rolls: "hour", able });
const near = (a: number, b: number, within = 1e-9) => assert.ok(Math.abs(a - b) <= within, `${a} is not ${b}`);

test("members that always can appear share the picks by weight", () => {
  const odds = groupOdds([member(1), member(3)], 0);
  near(odds.members[0], 0.25);
  near(odds.members[1], 0.75);
  near(odds.nobody, 0);
});

test("the nobody weight takes its share", () => {
  const odds = groupOdds([member(1), member(1)], 2);
  near(odds.members[0], 0.25);
  near(odds.nobody, 0.5);
});

test("a member that can't always appear leaves the others its picks", () => {
  // Each can appear half the time: both 1/4 (half each), one alone 1/4 each, neither 1/4
  const odds = groupOdds([member(1, 0.5), member(1, 0.5)], 0);
  near(odds.members[0], 0.25 * 0.5 + 0.25);
  near(odds.members[1], 0.375);
  near(odds.nobody, 0.25);
});

test("past the exact sizes the chances are sampled, close to the exact ones", () => {
  const many = Array.from({ length: 20 }, (_, i) => member(i % 2 ? 1 : 3, 0.5));
  const odds = groupOdds(many, 5);
  const total = odds.members.reduce((a, b) => a + b, 0) + odds.nobody;
  near(total, 1, 1e-9);
  // Members of the same weight and chance come out alike
  near(odds.members[0], odds.members[2], 0.02);
  assert.ok(odds.members[0] > odds.members[1]);
});

test("members are found in every zone's file, and their conditions' chances counted", () => {
  const members = groupMembers([
    { zone: "a", npcs: [{ id: 3, when: { chance: 40 }, group: { id: "g", weight: 2 } }], ambients: [] },
    { zone: "b", npcs: [{ id: 5, instances: [{ npc: { flag: 0 }, when: { chance: 50 }, group: { id: "g" } }] }],
      ambients: [{ x: 0, z: 0, y: 0, group: { id: "h" } }] },
  ], null);
  const g = members.get("g")!;
  assert.equal(g.length, 2);
  assert.deepEqual([g[0].zone, g[0].kind, g[0].npcId, g[0].weight], ["a", "npc", 3, 2]);
  near(g[0].able, 0.4);
  assert.deepEqual([g[1].zone, g[1].kind, g[1].instance], ["b", "instance", 0]);
  near(g[1].able, 0.5);
  assert.equal(members.get("h")!.length, 1);
});

test("a group across zones can't roll each entry, which the build refuses", () => {
  const members = [member(1), { ...member(1), zone: "y" }];
  assert.equal(groupWarnings({ id: "g", name: "G", rolls: "entry" }, members, []).length, 1);
  assert.equal(groupWarnings({ id: "g", name: "G" }, members, []).length, 0);
  assert.equal(groupWarnings({ id: "g", name: "G", rolls: "entry" }, [member(1)], []).length, 0);
});

test("a new group's id comes from its name and is unique", () => {
  assert.equal(newGroupId("Birds on the roof", []), "birds_on_the_roof");
  assert.equal(newGroupId("Birds", ["birds", "birds_2"]), "birds_3");
});
