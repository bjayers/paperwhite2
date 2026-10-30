// Every page of the Encounter Editor renders on the real res/ without throwing, in each of its main states.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { AreasPage } from "../src/modules/encounters/AreasPage.tsx";
import type { EditorState } from "../src/modules/encounters/EncounterEditor.tsx";
import { buildDraft } from "../src/modules/encounters/load.ts";
import { MapPage } from "../src/modules/encounters/MapPage.tsx";
import { DEFAULT_CONTEXT, DEFAULT_SETTINGS } from "../src/modules/encounters/model.ts";
import { SettingsPage } from "../src/modules/encounters/SettingsPage.tsx";
import { SpeciesPage } from "../src/modules/encounters/SpeciesPage.tsx";
import { loadFromDisk } from "./encounter-files.ts";

test("the Encounter Editor's pages render", () => {
  const constants = new Map<string, number>();
  const loaded = loadFromDisk();
  const draft = buildDraft(loaded, DEFAULT_SETTINGS);
  const state: EditorState = {
    loaded, draft, settings: DEFAULT_SETTINGS, ctx: DEFAULT_CONTEXT,
    setSpecies: () => {}, setSpeciesMany: () => {}, setGroups: () => {}, setGrottoes: () => {}, setAreas: () => {},
    sharedFamilies: new Set(["SPECIES_PIDOVE"]), setShared: () => {}, showSpecies: () => {}, showArea: () => {}, open: () => {},
  };
  assert.ok(loaded.places.length > 50 && loaded.species.size > 600);

  const pidove = renderToString(createElement(SpeciesPage, { state, constants, selected: "SPECIES_PIDOVE", select: () => {} }));
  assert.match(pidove, /Pidove/);
  assert.match(pidove, /Habitats/);
  // A species not in the wild offers to add it
  assert.match(renderToString(createElement(SpeciesPage, { state, constants, selected: "SPECIES_MEW", select: () => {} })), /Add it to the wild/);
  assert.match(renderToString(createElement(AreasPage, { state, selected: "route_20", select: () => {} })), /Route 20/);
  // A family whose habitats are shared opens on the family view
  assert.match(renderToString(createElement(SpeciesPage, { state, constants, selected: "SPECIES_TRANQUILL", select: () => {} })), /Same habitats for the whole family/);
  assert.match(renderToString(createElement(MapPage, { state })), /<svg/);
  assert.match(renderToString(createElement(SettingsPage, { settings: DEFAULT_SETTINGS, setSettings: () => {}, reimport: () => {}, species: [...loaded.species.values()] })), /Rarity tiers/);
});
