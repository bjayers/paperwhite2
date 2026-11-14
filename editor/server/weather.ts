// The Weather Editor's server side: the weather calendar's zone limit, read from its packer, and which files the
// editor may remove.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const CALENDAR_PACKER = "tools/data/weather_calendar_data.py";
/** The original game's table: calender.c's 24 entries. */
export const DEFAULT_CALENDAR_LIMIT = 24;

/** CALENDAR_ZONE_MAX as a packer's text sets it at module level, or null where it doesn't. */
export function calendarLimitIn(text: string): number | null {
  const m = /^CALENDAR_ZONE_MAX\s*=\s*(\d+)\b/m.exec(text);
  return m ? Number(m[1]) : null;
}

/** How many zones the calendar's table holds: the packer's CALENDAR_ZONE_MAX, or the original 24 without one. */
export function weatherCalendarLimit(root: string): { max: number; source: string } {
  let max: number | null = null;
  try {
    max = calendarLimitIn(readFileSync(join(root, CALENDAR_PACKER), "utf8"));
  } catch { /* the default */ }
  return max !== null
    ? { max, source: `CALENDAR_ZONE_MAX in ${CALENDAR_PACKER}` }
    : { max: DEFAULT_CALENDAR_LIMIT, source: `the original table (${CALENDAR_PACKER} names no CALENDAR_ZONE_MAX)` };
}

/** The files DELETE /api/file may remove: a species' encounter file, a zone's weather calendar (not order.json or
 * the schema), or a battle sprite side's rig source, the first Rig Editor's armature or the second's (Remove armature
 * and Start fresh; never the flat rig the build packs). */
export function removable(path: string): boolean {
  if (/^res\/pokemon\/[a-z0-9_]+(\/[a-z0-9_]+)*\/(front|back)_rig_(source|v2)\.json$/.test(path)) return true;
  if (/^res\/paperwhite2\/encounters\/species\/[a-z0-9_]+\.json$/.test(path)) return true;
  const m = /^res\/field\/weather_calendar\/([a-z0-9_]+)\.json$/.exec(path);
  return m !== null && m[1] !== "order";
}
