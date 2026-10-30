// The Encounter Editor's draft from the real res/: the current tables' shares are exact, every one of them is covered by
// a habitat of the draft, levels follow the evolutions, and the evaluation's shares of a place make 100%.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readShares, tierFor } from "../src/modules/encounters/convert.ts";
import { buildDraft } from "../src/modules/encounters/load.ts";
import { DEFAULT_SETTINGS, METHODS, SEASONS, TIMES } from "../src/modules/encounters/model.ts";
import { levelRange, namesArea, placeOdds } from "../src/modules/encounters/resolve.ts";
import { loadFromDisk } from "../scripts/encounter-files.ts";

const loaded = loadFromDisk();
const draft = buildDraft(loaded, DEFAULT_SETTINGS);

test("each place's shares in the current tables add up to 100%", () => {
  const { shares } = readShares(loaded.tables);
  assert.ok(shares.length > 1000);
  const totals = new Map<string, number>();
  for (const s of shares) totals.set(`${s.area}|${s.season}|${s.method}`, (totals.get(`${s.area}|${s.season}|${s.method}`) ?? 0) + s.share);
  for (const [place, total] of totals) assert.ok(total <= 100 + 1e-9, `${place}: ${total}`);
  const full = [...totals.values()].filter((t) => Math.abs(t - 100) < 1e-9).length;
  assert.ok(full / totals.size > 0.95, "nearly every place has all its slots filled");
});

test("every species, place, season and method of the current tables is a habitat of the draft, with its tier", () => {
  for (const s of draft.oldShares) {
    if (s.method === "rustling" && s.species === DEFAULT_SETTINGS.rustling.grass.species) continue;
    const entry = draft.species.get(s.species);
    assert.ok(entry, s.species);
    const habitat = entry.habitats.find((h) => namesArea(h, s.area, draft.groups) && h.form === s.form &&
      h.seasons[s.season]?.methods.includes(s.method) && h.seasons[s.season]?.tier === tierFor(s.share, DEFAULT_SETTINGS));
    assert.ok(habitat, `${s.species} in ${s.area} ${s.season} ${s.method}`);
  }
  assert.ok(draft.areas.some((a) => a.id === "route_20" && a.zones.includes("ZONE_ROUTE_20")));
});

test("the import merges methods, seasons and groups", () => {
  const sewers = draft.groups.find((g) => g.id === "group:castelia_sewers");
  assert.ok(sewers && sewers.areas.length === 5);
  const habitatsPerSpecies = [...draft.species.values()].map((e) => e.habitats.length);
  const slots = draft.oldShares.length;
  const habitats = habitatsPerSpecies.reduce((a, b) => a + b, 0);
  assert.ok(habitats * 4 < slots, `${habitats} habitats for ${slots} species-place-season-method shares`);
  // A habitat's coupled seasons share one slot
  for (const e of draft.species.values()) {
    for (const h of e.habitats) {
      const present = SEASONS.filter((s) => h.seasons[s]);
      assert.ok(present.length > 0);
      if (h.coupled) for (const s of present) assert.deepEqual(h.seasons[s], h.seasons[present[0]]);
    }
  }
});

test("levels follow the evolutions", () => {
  const pidgey = draft.species.get("SPECIES_PIDGEY");
  if (pidgey) assert.ok(pidgey.levels.max <= 18 + DEFAULT_SETTINGS.importEvolutionMargin, JSON.stringify(pidgey.levels));
  const tranquill = draft.species.get("SPECIES_TRANQUILL");
  if (tranquill) assert.ok(tranquill.levels.min >= 21 && tranquill.levels.max <= 34, JSON.stringify(tranquill.levels));
  for (const e of draft.species.values()) assert.ok(e.levels.min <= e.levels.max, e.species);
});

test("a place's shares under any context make 100%, and levels stay within the species' range", () => {
  const settings = DEFAULT_SETTINGS;
  for (const area of draft.areas.slice(0, 50)) {
    for (const method of METHODS) {
      for (const season of SEASONS) {
        const odds = placeOdds(draft, settings, { season, time: TIMES[1], weather: "WEATHER_SUNNY", partyLevel: 100, outbreak: true }, area.id, method.id);
        if (!odds.length) continue;
        const total = odds.reduce((sum, o) => sum + o.share, 0);
        assert.ok(Math.abs(total - 100) < 1e-6, `${area.id} ${method.id} ${season}: ${total}`);
      }
    }
  }
  const levels = { min: 30, max: 60 };
  assert.deepEqual(levelRange(levels, 26, settings), [30, 30]);
  assert.deepEqual(levelRange(levels, 71, settings), [53, 59]);
  assert.deepEqual(levelRange({ min: 2, max: 25 }, 71, settings), [25, 25]);
});

test("rustling spots give Audino in grass and items in caves, or all of it with no Pokémon", () => {
  const ctx = { season: "spring" as const, time: TIMES[1], weather: "WEATHER_SUNNY", partyLevel: 100, outbreak: false };
  const kinds = new Set(draft.areas.map((a) => a.spots));
  assert.ok(kinds.has("grass") && kinds.has("dust") && kinds.has("shadow"), [...kinds].join());
  assert.equal(draft.areas.find((a) => a.id === "chargestone_cave")?.spots, "dust");
  for (const area of draft.areas.filter((a) => a.rates.spring.rustling)) {
    const odds = placeOdds(draft, DEFAULT_SETTINGS, ctx, area.id, "rustling");
    const fixed = odds.find((o) => o.special)!;
    assert.ok(fixed, area.id);
    if (area.spots === "grass") assert.equal(fixed.species, "SPECIES_AUDINO");
    else assert.ok(fixed.item, area.id);
    assert.equal(fixed.share, odds.length > 1 ? 30 : 100, area.id);
  }
  // No area without rustling spots has them
  const none = draft.areas.find((a) => !a.rates.spring.rustling)!;
  assert.deepEqual(placeOdds(draft, DEFAULT_SETTINGS, ctx, none.id, "rustling"), []);
});

test("outbreaks and Hidden Grottoes", () => {
  const farfetchd = draft.species.get("SPECIES_FARFETCHD");
  assert.ok(farfetchd?.outbreaks.some((o) => o.places.includes("route_1")), JSON.stringify(farfetchd?.outbreaks));
  assert.ok(draft.species.get("SPECIES_MINUN")?.outbreaks.length, "White 2's swarms, not Black 2's");
  assert.ok(!draft.species.get("SPECIES_PLUSLE")?.outbreaks.length);
  const ctx = { season: "spring" as const, time: TIMES[1], weather: "WEATHER_SUNNY", partyLevel: 100, outbreak: true };
  const odds = placeOdds(draft, DEFAULT_SETTINGS, ctx, "route_1", "grass");
  assert.equal(odds.find((o) => o.outbreak)?.species, "SPECIES_FARFETCHD");
  assert.equal(odds.find((o) => o.outbreak)?.share, 40);
  assert.ok(draft.grottoes.length > 10 && draft.grottoes.every((g) => g.slots.length === 3 && g.slots.every((s) => s.length === 4)));
});

test("the other sources are found", () => {
  const sources = (id: string) => (loaded.sources.get(id) ?? []).map((s) => s.source);
  assert.ok(sources("SPECIES_ALAKAZAM").includes("trade"));
  assert.ok([...loaded.sources.values()].some((list) => list.some((s) => s.source === "static")));
  // The starters are given through a variable that the script sets first
  assert.ok(sources("SPECIES_SNIVY").includes("gift"), JSON.stringify(loaded.sources.get("SPECIES_SNIVY")));
});
