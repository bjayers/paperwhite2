// The Encounter Editor lists its groups of areas alphabetically, ignoring case, with numbers in number order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sortedGroups, type AreaGroup } from "../src/modules/encounters/model.ts";

const group = (name: string, custom = true): AreaGroup => ({ id: `group:${name.toLowerCase().replace(/\W+/g, "_")}`, name, areas: [], custom });

test("groups sort by name, case-insensitively and in number order", () => {
  const groups = [group("Route 10"), group("Castelia Sewers", false), group("route 2"), group("Abyssal Ruins"), group("Route 20")];
  assert.deepEqual(sortedGroups(groups).map((g) => g.name), ["Abyssal Ruins", "Castelia Sewers", "route 2", "Route 10", "Route 20"]);
  assert.equal(groups[0].name, "Route 10", "the draft's own order is left alone");
});
