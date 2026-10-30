// editor/settings.local.json: per-user settings, never committed. Missing fields take their defaults, and the file is
// written with every field so it is easy to edit by hand.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface Settings {
  /** Run in the repository's root by the Build button. The hack build copies the ROM to the playtest folder itself. */
  buildCommand: string;
  /** The Commit button stays disabled until this is true: the Claude sessions commit for now. */
  commitEnabled: boolean;
  port: number;
}

const DEFAULTS: Settings = {
  buildCommand: "python3 configure.py w2_us --hack && ninja",
  commitEnabled: false,
  port: 7420,
};

export const SETTINGS_PATH = join(import.meta.dirname, "..", "settings.local.json");

export function loadSettings(): Settings {
  let saved: Partial<Settings> = {};
  if (existsSync(SETTINGS_PATH)) {
    try {
      saved = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
    } catch (error) {
      console.warn(`settings.local.json: ${(error as Error).message}; using the defaults`);
    }
  }
  const settings = { ...DEFAULTS, ...saved };
  if (!existsSync(SETTINGS_PATH)) writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
  return settings;
}
