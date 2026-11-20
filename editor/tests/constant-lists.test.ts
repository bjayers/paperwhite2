// The pickers offer a generated/ list's own names for its prefix (schema-form/form.tsx, setConstantLists): MOVE_ is the
// moves, not also the MOVE_CODE_ and MOVE_CATEGORY_ constants that start the same.
import { test } from "node:test";
import assert from "node:assert/strict";
import { constantOptions, setConstantLists, sharedPrefix } from "../src/modules/schema-form/form.tsx";

test("a list's shared prefix stops at an underscore", () => {
  assert.equal(sharedPrefix(["MOVE_NONE", "MOVE_POUND", "MOVE_KARATE_CHOP"]), "MOVE_");
  assert.equal(sharedPrefix(["MOVE_CODE_NONE", "MOVE_CODE_1"]), "MOVE_CODE_");
  assert.equal(sharedPrefix([]), "");
});

test("a picker of a list's prefix offers that list's names alone", () => {
  const constants = new Map([["MOVE_NONE", 0], ["MOVE_POUND", 1], ["MOVE_CODE_NONE", 0], ["MOVE_CATEGORY_STATUS", 0],
    ["BTL_WEATHER_RAIN", 1]]);
  setConstantLists({ moves: ["MOVE_NONE", "MOVE_POUND"], move_codes: ["MOVE_CODE_NONE"] });
  assert.deepEqual(constantOptions(constants, "MOVE_").map((o) => o.value), ["MOVE_NONE", "MOVE_POUND"]);
  assert.deepEqual(constantOptions(constants, "MOVE_CODE_").map((o) => o.value), ["MOVE_CODE_NONE"]);
  // (no list shares BTL_WEATHER_ exactly: every constant that starts with it, as before)
  assert.deepEqual(constantOptions(constants, "BTL_WEATHER_").map((o) => o.value), ["BTL_WEATHER_RAIN"]);
  setConstantLists({});
});
