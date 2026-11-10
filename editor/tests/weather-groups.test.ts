// The editor's weather groups are the game's (include/paperwhite2/weather_groups.h), and a habitat's weather matches its
// whole group, as the game's conditions compile it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WEATHER_GROUPS, weatherGroup } from "../src/modules/encounters/model.ts";

const header = readFileSync(fileURLToPath(new URL("../../include/paperwhite2/weather_groups.h", import.meta.url)), "utf8");

test("the groups match weather_groups.h", () => {
  const found: Record<string, string[]> = {};
  for (const m of header.matchAll(/#define WEATHER_GROUP_(\w+)_WEATHERS\s*((?:.|\\\n)*?)(?=\n#|\n\n|$)/g)) {
    found[m[1].toLowerCase()] = [...m[2].matchAll(/WEATHER_BIT\((WEATHER_\w+)\)/g)].map((b) => b[1]).sort();
  }
  const ours = Object.fromEntries(Object.entries(WEATHER_GROUPS).map(([g, ws]) => [g, [...ws].sort()]));
  assert.deepEqual(ours, found);
});

test("a weather matches its group", () => {
  assert.equal(weatherGroup("WEATHER_GUSTY_RAIN"), weatherGroup("WEATHER_RAIN"));
  assert.equal(weatherGroup("WEATHER_FLUTTER"), "snow");
  assert.notEqual(weatherGroup("WEATHER_THUNDERSTORM"), weatherGroup("WEATHER_RAIN"));
});
