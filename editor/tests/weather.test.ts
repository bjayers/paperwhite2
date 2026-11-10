// The Weather Editor's calendar logic (src/modules/weather/calendar.ts) on the real res/field/weather_calendar/: every
// calendar reads into a year and writes back byte for byte, a painted month is written as the packer's dump writes
// it, the packer's checks, the even fill, the table's limit (and where the server reads it), and the indoor rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileText, parseJson, setIn, type JsonValue } from "../shared/json.ts";
import {
  MONTH_DAYS, areaStem, canAddCalendar, checkTable, emptyYear, fillOrder, fillSeason, isOutdoor, monthJson, monthsOf, newCalendar,
  paint, readYear, seasonDates, seasonShares, sharedGroups, writeMonths,
} from "../src/modules/weather/calendar.ts";
import { calendarLimitIn, removable, weatherCalendarLimit } from "../server/weather.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const DIR = join(ROOT, "res/field/weather_calendar");
const schema = JSON.parse(readFileSync(join(DIR, "weather_calendar.schema.json"), "utf8"));
const WEATHERS: string[] = schema.$defs.weather.enum;
const calendars = globSync("*.json", { cwd: DIR }).filter((f) => f !== "order.json" && !f.endsWith(".schema.json"));
const RAIN = WEATHERS.indexOf("WEATHER_RAIN");
const THUNDER = WEATHERS.indexOf("WEATHER_THUNDERSTORM");

const readFile = (name: string) => {
  const text = readFileSync(join(DIR, name), "utf8");
  const data = parseJson(text) as Map<string, JsonValue>;
  return { text, data, months: monthsOf(data.get("months")) };
};

test("the schema's weathers are the header's enum, Thunderstorm among them", () => {
  const header = readFileSync(join(ROOT, "include/system/zone_weather.h"), "utf8");
  const body = /enum \{(.*?)\};/s.exec(header)![1];
  const names = [...body.matchAll(/\b(WEATHER_\w+),/g)].map((m) => m[1]).filter((n) => n !== "WEATHER_MAX");
  assert.deepEqual(WEATHERS, names);
  assert.ok(THUNDER > 0);
});

test("every calendar reads without a problem and writes back byte for byte", () => {
  assert.ok(calendars.length >= 24);
  for (const name of calendars) {
    const { text, data, months } = readFile(name);
    const { year, errors } = readYear(months, WEATHERS);
    assert.deepEqual(errors, [], name);
    assert.deepEqual(year.map((m) => m.length), MONTH_DAYS);
    // Unchanged: every month kept as it was
    const kept = fileText(setIn(data, ["months"], writeMonths(months, year, WEATHERS)));
    assert.equal(kept, text, name);
    // Rebuilt from the days alone: the dump's form, which these files are in
    const rebuilt = fileText(setIn(data, ["months"], writeMonths(new Map(), year, WEATHERS)));
    assert.equal(rebuilt, text, `${name} rebuilt`);
  }
});

test("painting writes only the changed month, in the dump's form", () => {
  const { months: before } = readFile("route_20.json");
  const { year } = readYear(before, WEATHERS);
  // January 4 and 5 rain beside the 3rd's and the 5th's: one range 3-5
  const painted = paint(year, [{ month: 0, day: 4 }], RAIN);
  const months = writeMonths(before, painted, WEATHERS);
  assert.deepEqual([...months.get("january")!.keys()].slice(0, 2), ["3-5", "11"]);
  for (const m of [...before.keys()].filter((m) => m !== "january")) assert.equal(months.get(m), before.get(m));
  // Erasing with sunny takes the day out
  const erased = writeMonths(before, paint(year, [{ month: 0, day: 3 }], 0), WEATHERS);
  assert.ok(!erased.get("january")!.has("3"));
  // One weather a date: painting over replaces
  const over = paint(painted, [{ month: 0, day: 4 }], THUNDER);
  assert.equal(over[0][3], THUNDER);
  assert.equal(monthJson(over[0], WEATHERS).get("4"), "WEATHER_THUNDERSTORM");
});

test("the packer's checks", () => {
  const bad = monthsOf({ january: { "0": "WEATHER_RAIN", "2-1": "WEATHER_RAIN", x: "WEATHER_RAIN" }, february: { "30": "WEATHER_RAIN" },
    march: { "1-3": "WEATHER_RAIN", "3": "WEATHER_FLAKE", "5": "WEATHER_HARSH_SUN" }, smarch: {} });
  const { errors } = readYear(bad, WEATHERS);
  assert.equal(errors.length, 7, errors.join("\n"));
  assert.ok(errors.some((e) => e.includes("day 3 has a weather already")));
  assert.ok(errors.some((e) => e.includes("WEATHER_HARSH_SUN")));
  assert.ok(errors.some((e) => e.startsWith("smarch")));
  // February has a 29th
  assert.deepEqual(readYear(monthsOf({ february: { "29": "WEATHER_RAIN" } }), WEATHERS).errors, []);
});

test("a new calendar has every month, sunny", () => {
  const data = newCalendar(emptyYear(), WEATHERS);
  const months = data.get("months") as Map<string, Map<string, string>>;
  assert.equal(months.size, 12);
  assert.ok([...months.values()].every((m) => m.size === 0));
  assert.equal(data.get("$schema"), "weather_calendar.schema.json");
  assert.match(fileText(data), /^\{\n    "\$schema": "weather_calendar.schema.json",\n    "months": \{\n        "january": \{\},/);
});

test("seasons have their 90-92 dates", () => {
  assert.deepEqual([0, 1, 2, 3].map((s) => seasonDates(s).length), [92, 90, 92, 92]);
  assert.deepEqual(seasonDates(0).slice(30, 33), [{ month: 0, day: 31 }, { month: 4, day: 1 }, { month: 4, day: 2 }]);
});

test("shares count each weather's days of a season", () => {
  const { year } = readYear(readFile("route_20.json").months, WEATHERS);
  const spring = seasonShares(year, 0);
  assert.equal(spring.total, 92);
  assert.equal(spring.counts.get(RAIN), 21);
  assert.equal(seasonShares(year, 2).counts.get(0), 92);
});

test("the fill is even, exact, the same each time, and nested", () => {
  for (const n of [90, 92]) {
    const order = fillOrder(n);
    assert.deepEqual([...order].sort((a, b) => a - b), Array.from({ length: n }, (_, i) => i));
  }
  const year = fillSeason(emptyYear(), 0, 10, RAIN);
  assert.equal(seasonShares(year, 0).counts.get(RAIN), 10);
  assert.deepEqual(fillSeason(emptyYear(), 0, 10, RAIN), year);
  // Other seasons untouched
  assert.equal(seasonShares(year, 1).counts.get(RAIN), undefined);
  // Nested: every rainy date of 10 is rainy in 20
  const twenty = fillSeason(emptyYear(), 0, 20, RAIN);
  for (const { month, day } of seasonDates(0)) if (year[month][day - 1] === RAIN) assert.equal(twenty[month][day - 1], RAIN);
  // Spread: no gap between rainy dates much more than the even spacing
  const dates = seasonDates(0).map(({ month, day }, i) => (year[month][day - 1] === RAIN ? i : -1)).filter((i) => i >= 0);
  const gaps = dates.slice(1).map((d, i) => d - dates[i]);
  assert.ok(Math.max(...gaps) <= 2 * (92 / 10), `gaps ${gaps}`);
  // Filling fewer takes the weather off the rest, so the count is exact
  assert.equal(seasonShares(fillSeason(twenty, 0, 5, RAIN), 0).counts.get(RAIN), 5);
  // It replaces other weathers on its dates
  const snowy = paint(emptyYear(), seasonDates(3), WEATHERS.indexOf("WEATHER_FLAKE"));
  assert.equal(seasonShares(fillSeason(snowy, 3, 30, THUNDER), 3).counts.get(THUNDER), 30);
});

test("the limit blocks a calendar past it", () => {
  assert.equal(canAddCalendar(23, 24).ok, true);
  const full = canAddCalendar(24, 24);
  assert.equal(full.ok, false);
  assert.match(full.message, /holds 24/);
  assert.equal(canAddCalendar(24, 40).ok, true);
  const zones = new Set(["ZONE_A", "ZONE_B", "ZONE_C"]);
  assert.deepEqual(checkTable(["ZONE_A", "ZONE_B"], ["ZONE_A", "ZONE_B"], zones, 2), []);
  assert.equal(checkTable(["ZONE_A", "ZONE_B"], ["ZONE_A", "ZONE_B", "ZONE_C"], zones, 2).length, 1);
  assert.equal(checkTable(["ZONE_A", "ZONE_A"], ["ZONE_A"], zones, 2).length, 1);
  assert.equal(checkTable(["ZONE_A", "ZONE_B"], ["ZONE_A"], zones, 2).length, 1);
});

test("the server reads CALENDAR_ZONE_MAX from the packer, else 24", () => {
  assert.equal(calendarLimitIn("ZONE_MAX = 24\nCALENDAR_ZONE_MAX = 40\n"), 40);
  assert.equal(calendarLimitIn("ZONE_MAX = 24\n"), null);
  assert.equal(calendarLimitIn("    CALENDAR_ZONE_MAX = 40\n"), null);
  const real = weatherCalendarLimit(ROOT);
  assert.ok(real.max >= 24);
  assert.equal(weatherCalendarLimit("/nonexistent").max, 24);
  assert.ok(removable("res/field/weather_calendar/route_19.json"));
  assert.ok(!removable("res/field/weather_calendar/order.json"));
  assert.ok(!removable("res/field/weather_calendar/weather_calendar.schema.json"));
  assert.ok(!removable("res/field/zones/route_19.json"));
  assert.ok(removable("res/paperwhite2/encounters/species/pikachu.json"));
});

test("indoors is an area without exterior: every calendar zone is outdoors, gyms aren't", () => {
  const exterior = new Map<string, boolean>();
  for (const f of globSync("*.json", { cwd: join(ROOT, "res/field/areas") })) {
    if (f.endsWith(".schema.json")) continue;
    exterior.set(f.slice(0, -5), JSON.parse(readFileSync(join(ROOT, "res/field/areas", f), "utf8")).exterior === true);
  }
  const zone = (stem: string) => JSON.parse(readFileSync(join(ROOT, "res/field/zones", `${stem}.json`), "utf8"));
  for (const name of calendars) assert.ok(isOutdoor(zone(name.slice(0, -5)).area, exterior), name);
  assert.equal(isOutdoor(zone("driftveil_city_gym").area, exterior), false);
  assert.equal(isOutdoor(zone("route_19").area, exterior), true);
  assert.equal(isOutdoor(null, exterior), false);
  assert.equal(isOutdoor("AREA_NOWHERE", exterior), false);
  assert.equal(areaStem("AREA_VIRBANK_CITY"), "virbank_city");
  assert.equal(areaStem(179), "179");
});

test("zones with the same dates are a group: Virbank City and both Virbank Complex zones", () => {
  const years = new Map(calendars.map((f) => [f.slice(0, -5), readYear(readFile(f).months, WEATHERS).year]));
  const virbank = sharedGroups(years).find((g) => g.includes("virbank_city"))!;
  assert.deepEqual([...virbank].sort(), ["virbank_city", "virbank_complex", "virbank_complex_2"]);
});
