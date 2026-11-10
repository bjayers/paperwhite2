// The weather calendar as the Weather Editor works it (docs/paperwhite2/design/weather-editor.md): the files of
// res/field/weather_calendar/ (<zone>.json, order.json), read into a year of weather values per zone and written back
// in the packer's own form (tools/data/weather_calendar_data.py: month_json and year_bytes), the seasons' dates, the
// shares, the even fill, the table's limit and which zones may have weather at all. Nothing here touches the browser,
// so the tests run it as it is.

export const CALENDAR_DIR = "res/field/weather_calendar";
export const CALENDAR_SCHEMA = `${CALENDAR_DIR}/weather_calendar.schema.json`;
export const ORDER = `${CALENDAR_DIR}/order.json`;
export const ZONES_DIR = "res/field/zones";
export const AREAS_DIR = "res/field/areas";

/** The calendar's months, and their days as Calendar_GetDayOfYear counts them (February with its 29th). */
export const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
  "november", "december"] as const;
export const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];

/** A zone's year: for each month, a weather value (the WEATHER_ enum's index) per day. */
export type Year = number[][];
/** A calendar file's months: month name to its days, "day" or "first-last" to a WEATHER_ name, in the file's order (a
 * Map, as the documents hold JSON: a plain object would put "13" before "1-4"). */
export type Month = Map<string, string>;
export type Months = Map<string, Month>;

/** The months of a file's data (its JsonMap, or plain JSON in the tests); anything else is left out. */
export function monthsOf(data: unknown): Months {
  const months: Months = new Map();
  const entries = (v: unknown): [string, unknown][] => (v instanceof Map ? [...v] : v && typeof v === "object" && !Array.isArray(v) ? Object.entries(v) : []);
  for (const [name, days] of entries(data)) {
    months.set(name, new Map(entries(days).map(([k, w]) => [k, String(w)])));
  }
  return months;
}

/** The months of a season: those with (month - 1) % 4 equal to it (the schema's rule), as month indexes from 0. */
export const seasonMonths = (season: number): number[] => [season, season + 4, season + 8];

/** A season's dates in strip order: its three months' days in month order. */
export function seasonDates(season: number): { month: number; day: number }[] {
  return seasonMonths(season).flatMap((month) => Array.from({ length: MONTH_DAYS[month] }, (_, d) => ({ month, day: d + 1 })));
}

/** The calendar's file of a zone: its ZONE_ constant lowercased without the prefix. */
export const calendarPath = (zone: string) => `${CALENDAR_DIR}/${zone.replace(/^ZONE_/, "").toLowerCase()}.json`;
export const zoneOfStem = (stem: string) => `ZONE_${stem.toUpperCase()}`;

export const emptyYear = (): Year => MONTH_DAYS.map((n) => new Array<number>(n).fill(0));

const DAYS = /^(\d+)(?:-(\d+))?$/;

/** A calendar's year and the packer's complaints about it (year_bytes): a key that isn't a day or a range, days past
 * the month's end or backwards, a weather the enum lacks, a day given twice, a month the calendar doesn't have. */
export function readYear(months: Months, weathers: readonly string[]): { year: Year; errors: string[] } {
  const year = emptyYear();
  const errors: string[] = [];
  for (const month of months.keys()) if (!(MONTHS as readonly string[]).includes(month)) errors.push(`${month}: not a month`);
  MONTHS.forEach((month, m) => {
    const seen = new Array<boolean>(MONTH_DAYS[m]).fill(false);
    for (const [key, weather] of months.get(month) ?? []) {
      const at = `${month}: ${key}`;
      const match = DAYS.exec(key);
      if (!match) { errors.push(`${at}: not a day or a range of days, such as "4" or "4-5"`); continue; }
      const first = Number(match[1]);
      const last = Number(match[2] ?? first);
      if (!(1 <= first && first <= last && last <= MONTH_DAYS[m])) { errors.push(`${at}: not days from 1 to ${MONTH_DAYS[m]}, the first before the last`); continue; }
      const value = weathers.indexOf(weather);
      if (value < 0) { errors.push(`${at}: ${JSON.stringify(weather)} is not a weather`); continue; }
      for (let day = first - 1; day < last; day++) {
        if (seen[day]) { errors.push(`${at}: day ${day + 1} has a weather already`); break; }
        seen[day] = true;
        year[m][day] = value;
      }
    }
  });
  return { year, errors };
}

/** A month's days with weather as the packer's dump writes them (month_json): runs of one weather as a range, sunny
 * days left out. */
export function monthJson(days: number[], weathers: readonly string[]): Month {
  const out: Month = new Map();
  for (let day = 0; day < days.length;) {
    let last = day;
    while (last + 1 < days.length && days[last + 1] === days[day]) last++;
    if (days[day]) out.set(last === day ? `${day + 1}` : `${day + 1}-${last + 1}`, weathers[days[day]]);
    day = last + 1;
  }
  return out;
}

const sameDays = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** The months to write for a year: every month in calendar order, a month whose days didn't change kept as the file
 * had it (so an untouched month never changes in git), a changed one in the dump's form. */
export function writeMonths(before: Months, year: Year, weathers: readonly string[]): Months {
  const old = readYear(before, weathers).year;
  const out: Months = new Map();
  MONTHS.forEach((month, m) => {
    const kept = before.get(month);
    out.set(month, kept && sameDays(old[m], year[m]) ? kept : monthJson(year[m], weathers));
  });
  return out;
}

/** A new calendar file's data: every month, sunny unless the year says otherwise. */
export const newCalendar = (year: Year, weathers: readonly string[]) =>
  new Map<string, string | Months>([["$schema", "weather_calendar.schema.json"], ["months", writeMonths(new Map(), year, weathers)]]);

export const copyYear = (year: Year): Year => year.map((m) => [...m]);

/** Paints dates of a year with a weather (0, sunny, erases). */
export function paint(year: Year, dates: { month: number; day: number }[], weather: number): Year {
  const out = copyYear(year);
  for (const { month, day } of dates) out[month][day - 1] = weather;
  return out;
}

/** Each weather's days in a season, most first, and the season's number of dates. */
export function seasonShares(year: Year, season: number): { total: number; counts: Map<number, number> } {
  const counts = new Map<number, number>();
  const dates = seasonDates(season);
  for (const { month, day } of dates) counts.set(year[month][day - 1], (counts.get(year[month][day - 1]) ?? 0) + 1);
  return { total: dates.length, counts: new Map([...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])) };
}

/** The season's dates in fill order: the van der Corput sequence over the strip, so the first N of them are spread
 * evenly for every N and each N's choice holds the smaller ones' (10 rainy days are among the 20-day choice's). */
export function fillOrder(count: number): number[] {
  const order: number[] = [];
  const taken = new Array<boolean>(count).fill(false);
  // The first 2^b terms, 2^b at least count, are every multiple of 1/2^b, so each date's cell gets one
  for (let k = 0; order.length < count; k++) {
    let x = 0;
    for (let bit = 0.5, n = k; n; n >>= 1, bit /= 2) if (n & 1) x += bit;
    const at = Math.floor(x * count);
    if (!taken[at]) { taken[at] = true; order.push(at); }
  }
  return order;
}

/** "N days of W in a season": W on the first N dates of the fill order, whatever they had, and W's other dates of the
 * season back to sunny, so the season has W on exactly N dates; the same N always gives the same dates. */
export function fillSeason(year: Year, season: number, n: number, weather: number): Year {
  const dates = seasonDates(season);
  const chosen = new Set(fillOrder(dates.length).slice(0, Math.max(0, Math.min(n, dates.length))));
  const out = copyYear(year);
  dates.forEach(({ month, day }, i) => {
    if (chosen.has(i)) out[month][day - 1] = weather;
    else if (out[month][day - 1] === weather) out[month][day - 1] = 0;
  });
  return out;
}

/** Whether another zone can get a calendar: the table holds max zones (the packer's CALENDAR_ZONE_MAX). */
export function canAddCalendar(count: number, max: number): { ok: boolean; message: string } {
  return count < max
    ? { ok: true, message: `${count} / ${max} zones have a calendar` }
    : { ok: false, message: `The calendar holds ${max} zones and ${count} have one: remove one, or raise CALENDAR_ZONE_MAX in the game first (the ROM side's change).` };
}

/** Whether a zone is outdoors, which alone gets weather: its zone header's area (res/field/areas/<area>.json) has
 * "exterior": true (the flag that picks the area's props, the game's AreaData.isExterior). The weather system itself
 * doesn't check (the debug menu's Force weather rains in buildings), so the editor keeps weather off the rest, an area
 * it can't find too. */
export function isOutdoor(area: string | number | null | undefined, exterior: ReadonlyMap<string, boolean>): boolean {
  if (area === null || area === undefined) return false;
  return exterior.get(areaStem(area)) === true;
}

/** An area's file stem: AREA_VIRBANK_CITY is virbank_city, a number its own. */
export const areaStem = (area: string | number) => (typeof area === "number" ? String(area) : area.replace(/^AREA_/, "").toLowerCase());

/** The calendar zones that share all their dates (Virbank City and both Virbank Complex zones), each list in the
 * table's order: the editor's groups, which painting one paints together. */
export function sharedGroups(years: ReadonlyMap<string, Year>): string[][] {
  const byKey = new Map<string, string[]>();
  for (const [zone, year] of years) {
    const key = year.map((m) => m.join(",")).join("|");
    byKey.set(key, [...(byKey.get(key) ?? []), zone]);
  }
  return [...byKey.values()];
}

/** The zones in the table's order as the packer takes them: order.json's, then the other files' by zone number. */
export function tableOrder(order: string[], files: string[], number: (zone: string) => number): string[] {
  const listed = new Set(order);
  return [...order, ...files.filter((z) => !listed.has(z)).sort((a, b) => number(a) - number(b))];
}

/** The packer's checks of the table: zones in order.json twice, without a file, or not zones, and more than max. */
export function checkTable(order: string[], files: string[], zones: ReadonlySet<string>, max: number): string[] {
  const errors: string[] = [];
  if (new Set(order).size !== order.length) errors.push("order.json lists a zone twice");
  for (const zone of order) {
    if (!zones.has(zone)) errors.push(`order.json: ${zone} is not a zone`);
    else if (!files.includes(zone)) errors.push(`order.json: ${zone} has no calendar file`);
  }
  for (const zone of files) if (!zones.has(zone)) errors.push(`${calendarPath(zone)}: no such zone`);
  const count = new Set([...order, ...files]).size;
  if (count > max) errors.push(`${count} zones have a calendar, but the table holds ${max}`);
  return errors;
}

// Zones whose weather a rule of GetWeatherAll (src/system/zone_weather.c) gives before the calendar's, by number

/** The Entralink's forest zones (ENTRALINK_WEATHER_FLAG_ZONE_LOOKUP). */
const ENTRALINK_ZONES = new Set([0x121, 0x122, 0x123, 0x124, 0x125, 0x126, 0x127, 0x129, 0x12a, 0x12d, 0x12e, 0x12f,
  0x130, 0x131, 0x132, 0x133, 0x134, 0x135, 0x136, 0x137, 0x138, 0x139, 0x13a, 0x13b, 0x13c]);

/** What wins over a zone's calendar, in words, or null. */
export function specialRule(zone: string, number: number): string | null {
  if (ENTRALINK_ZONES.has(number)) return "The Entralink's forest: its tint comes from the connected game and a flag, over the calendar.";
  if (zone === "ZONE_ROUTE_7") return "Once Route 7's event flag (0x96d) is set, a thunderstorm, over the calendar.";
  if (zone === "ZONE_ROUTE_14" || zone === "ZONE_ROUTE_15") return "Sunny on the player's birthday (the DS's owner settings), over the calendar.";
  return null;
}
