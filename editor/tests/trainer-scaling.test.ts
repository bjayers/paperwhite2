// The Trainer Editor's preview of trainer level scaling agrees with the game's rule (scaling.ts mirrors
// src/paperwhite2/main/paperwhite2_trainer_scaling.c) and reads the real trainer_scaling.json.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { scaleTeam, scalingBasis, tierOf, type Scaling } from "../src/modules/trainers/scaling.ts";

const scaling = JSON.parse(readFileSync(new URL("../../res/paperwhite2/trainer_scaling/trainer_scaling.json", import.meta.url), "utf8")) as Scaling;
const tier = (name: string) => scaling.tiers.find((t) => t.name === name)!;

test("tiers by class and by trainer", () => {
  assert.equal(tierOf(scaling, "TRAINER_LEADER_CHEREN", "TRAINER_CLASS_LEADER_CHEREN").tier, "strong");
  assert.equal(tierOf(scaling, "TRAINER_CHAMPION_IRIS", "TRAINER_CLASS_CHAMPION").tier, "boss");
  assert.equal(tierOf(scaling, "TRAINER_YOUNGSTER_X", "TRAINER_CLASS_YOUNGSTER").tier, scaling.default_tier);
});

test("the ace at the top, the others by their gap, no lower than the bottom", () => {
  // Cheren, strong (0 to -3), at party level 20: the ace at 20, the others two below as in the original
  assert.deepEqual(scaleTeam([11, 11, 11, 13], tier("strong"), 20), [18, 18, 18, 20]);
  // A normal trainer (-2 to -5) with a filler far below its ace: no lower than 15
  assert.deepEqual(scaleTeam([5, 15], tier("normal"), 20), [15, 18]);
  // With Normal's -1 after
  assert.deepEqual(scaleTeam([5, 15], tier("normal"), 20, -1), [14, 17]);
  // Within 1 to 100
  assert.deepEqual(scaleTeam([50, 52], tier("boss"), 100, 2), [100, 100]);
  assert.deepEqual(scaleTeam([3], tier("normal"), 2, -4), [1]);
});

test("the badge floor raises an under-levelled party", () => {
  assert.equal(scalingBasis(scaling, 8, 1), scaling.badge_floor[1]);
  assert.equal(scalingBasis(scaling, 40, 1), 40);
});
