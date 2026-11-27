// How the Weather Editor shows each weather: its name (the Encounter Editor's where it has one), a swatch colour, and
// what it does in battle (ConvFieldWeatherToBtl, src/ov036/field_encount.c) or otherwise. The weathers themselves,
// and their values, are the calendar schema's enum (include/system/zone_weather.h's order); a weather this list
// doesn't know still shows, by its constant's name, in grey.

import { WEATHERS as ENCOUNTER_WEATHERS } from "../encounters/model.ts";

interface WeatherLook { label?: string; color: string; note: string; special?: boolean }

// Paper White 2's own tints: slot n is the nth tint of res/paperwhite2/field_tints/tints.json, whose name says its colour
const customTint = (slot: number): WeatherLook => ({
  label: `Custom tint ${slot}`, color: "#5a3a6e", special: true,
  note: `Paper White 2's tint ${slot} of res/paperwhite2/field_tints/tints.json: a fog in its own colour (empty slots are clear). No battle weather.`,
});

const LOOKS: Record<string, WeatherLook> = {
  WEATHER_SUNNY: { color: "#f3d36b", note: "Clear sky with the zone's own light and fog. No battle weather." },
  WEATHER_FLAKE: { color: "#cfe3f7", note: "Snowflakes that sway down. No battle weather." },
  WEATHER_RAIN: { color: "#4f86d9", note: "Rain, with its sound. Rain in battle." },
  WEATHER_SANDSTORM: { color: "#c99a56", note: "A sandstorm with a scrolling layer. Sandstorm in battle." },
  WEATHER_BLIZZARD: { color: "#8fb3d9", note: "Flakes rushing over a scrolling layer. Hail in battle." },
  WEATHER_FLUTTER: { label: "Flutter (hail snow)", color: "#a9c9ea", note: "Fluttering snow: Driftveil's and Mistralton's winter. Hail in battle." },
  WEATHER_THUNDERSTORM: { color: "#3b4f8c", note: "Heavy rain with lightning flashes. Rain in battle." },
  WEATHER_GUSTY_RAIN: { color: "#5e9fb5", note: "Rain with gusts (Black 2's Route 7). Rain in battle." },
  WEATHER_DIAMOND_DUST: { color: "#e9e3ff", note: "Drifting specks; being in it gives a medal. No battle weather." },
  WEATHER_TINT_9: { label: "White mist", color: "#d8d8d8", note: "Giant Chasm's white mist (fog and light). No battle weather." },
  WEATHER_TINT_10: { label: "Entralink tint 10", color: "#9ccf9a", note: "One of the Entralink's tints, by the camera's defaults: meant for the Entralink.", special: true },
  WEATHER_TINT_11: { label: "Entralink tint 11", color: "#7fb98d", note: "One of the Entralink's tints, by the camera's defaults: meant for the Entralink.", special: true },
  WEATHER_SANDSTORM_2: { label: "Desert sandstorm", color: "#a8743a", note: "Desert Resort's inner sandstorm. Sandstorm in battle." },
  WEATHER_TINT_13: { label: "Entralink tint 13", color: "#b7a6d6", note: "One of the Entralink's tints, by the camera's defaults: meant for the Entralink.", special: true },
  WEATHER_TINT_14: { label: "Entralink tint 14", color: "#d6a6c4", note: "One of the Entralink's tints, by the camera's defaults: meant for the Entralink.", special: true },
  WEATHER_CUSTOM_TINT_1: customTint(1),
  WEATHER_CUSTOM_TINT_2: customTint(2),
  WEATHER_CUSTOM_TINT_3: customTint(3),
  WEATHER_CUSTOM_TINT_4: customTint(4),
  WEATHER_CUSTOM_TINT_5: customTint(5),
  WEATHER_CUSTOM_TINT_6: customTint(6),
  WEATHER_CUSTOM_TINT_7: customTint(7),
  WEATHER_CUSTOM_TINT_8: customTint(8),
  WEATHER_CUSTOM_TINT_9: customTint(9),
  WEATHER_CUSTOM_TINT_10: customTint(10),
  WEATHER_CUSTOM_TINT_11: customTint(11),
  WEATHER_CUSTOM_TINT_12: customTint(12),
  WEATHER_HARSH_SUN: { label: "Harsh sun", color: "#f08a24",
    note: "Paper White 2's harsh sun: warm bright light, a heat shimmer and a pulsing lens flare by day, an orange evening, rising embers at night. Sun in battle; clear for encounters." },
  WEATHER_DRY_THUNDERSTORM: { label: "Dry thunderstorm", color: "#5a5f7a",
    note: "Paper White 2's dry thunderstorm: the thunderstorm's dark light, lightning and thunder with no rain. No battle weather; a thunderstorm for encounters." },
};

const plain = (name: string) => {
  const s = name.replace(/^WEATHER_/, "").replace(/_/g, " ").toLowerCase();
  return s[0].toUpperCase() + s.slice(1);
};

export function weatherLabel(name: string): string {
  return LOOKS[name]?.label ?? ENCOUNTER_WEATHERS.find((w) => w.id === name)?.label ?? plain(name);
}

export const weatherColor = (name: string) => LOOKS[name]?.color ?? "#888888";
export const weatherNote = (name: string) => LOOKS[name]?.note ?? "";
/** The Entralink's tints and Paper White 2's own, listed apart in the palette. */
export const isSpecialWeather = (name: string) => LOOKS[name]?.special === true;
