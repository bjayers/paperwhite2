// The Encounter Editor's frame: it loads res/, builds the draft, and holds the settings, the draft's edits and the
// preview's context, which every page shares. Nothing is written: the new format isn't in res/ yet.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ToolProps } from "../types.ts";
import type { Draft } from "./convert.ts";
import { buildDraft, load, type Loaded } from "./load.ts";
import { DEFAULT_CONTEXT, DEFAULT_SETTINGS, type Area, type AreaGroup, type Context, type EncounterSettings, type Grotto,
  type SpeciesEncounters } from "./model.ts";
import { AreasPage } from "./AreasPage.tsx";
import { MapPage } from "./MapPage.tsx";
import { SettingsPage } from "./SettingsPage.tsx";
import { SpeciesPage } from "./SpeciesPage.tsx";
import { ContextBar } from "./ui.tsx";

type Page = "pokemon" | "areas" | "map" | "settings";
const PAGES: { id: Page; title: string }[] = [
  { id: "pokemon", title: "Pokémon" },
  { id: "areas", title: "Areas" },
  { id: "map", title: "Map" },
  { id: "settings", title: "Settings" },
];

export interface EditorState {
  loaded: Loaded;
  draft: Draft;
  settings: EncounterSettings;
  ctx: Context;
  /** Replaces one species' entry in the draft (null removes it from the wild). */
  setSpecies(species: string, entry: SpeciesEncounters | null): void;
  /** Replaces several species' entries in one change, as a family's shared habitats do. */
  setSpeciesMany(entries: SpeciesEncounters[]): void;
  setGroups(groups: AreaGroup[], species?: Map<string, SpeciesEncounters>): void;
  setGrottoes(grottoes: Grotto[]): void;
  setAreas(areas: Area[]): void;
  /** The families (by base species) whose members share their habitats in the editor. */
  sharedFamilies: Set<string>;
  setShared(family: string, shared: boolean): void;
  showSpecies(species: string): void;
  showArea(area: string): void;
  open(path: string): void;
}

export function EncounterEditor({ constants, open }: ToolProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<EncounterSettings>(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [ctx, setCtx] = useState<Context>(DEFAULT_CONTEXT);
  const [page, setPage] = useState<Page>("pokemon");
  const [species, setSelectedSpecies] = useState<string | null>(null);
  const [area, setSelectedArea] = useState<string | null>(null);
  const [sharedFamilies, setSharedFamilies] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!constants.size || loaded) return;
    load(constants).then((l) => {
      setLoaded(l);
      setDraft(buildDraft(l, DEFAULT_SETTINGS));
    }, (e: Error) => setError(e.message));
  }, [constants, loaded]);

  const setSpecies = useCallback((id: string, entry: SpeciesEncounters | null) => {
    setDraft((d) => {
      if (!d) return d;
      const next = new Map(d.species);
      if (entry) next.set(id, entry);
      else next.delete(id);
      return { ...d, species: next };
    });
  }, []);

  const setSpeciesMany = useCallback((entries: SpeciesEncounters[]) => {
    setDraft((d) => {
      if (!d) return d;
      const next = new Map(d.species);
      for (const e of entries) next.set(e.species, e);
      return { ...d, species: next };
    });
  }, []);
  const setGroups = useCallback((groups: AreaGroup[], species?: Map<string, SpeciesEncounters>) =>
    setDraft((d) => (d ? { ...d, groups, species: species ?? d.species } : d)), []);
  const setGrottoes = useCallback((grottoes: Grotto[]) => setDraft((d) => (d ? { ...d, grottoes } : d)), []);
  const setAreas = useCallback((areas: Area[]) => setDraft((d) => (d ? { ...d, areas } : d)), []);
  const setShared = useCallback((family: string, shared: boolean) => setSharedFamilies((s) => {
    const next = new Set(s);
    if (shared) next.add(family);
    else next.delete(family);
    return next;
  }), []);

  const reimport = () => {
    if (!loaded) return;
    if (!confirm("Build the draft again from the current tables with these settings? Your edits in the editor are lost.")) return;
    setDraft(buildDraft(loaded, settings));
  };

  const state: EditorState | null = useMemo(() => loaded && draft ? {
    loaded, draft, settings, ctx, setSpecies, setSpeciesMany, setGroups, setGrottoes, setAreas, sharedFamilies, setShared, open,
    showSpecies: (id) => {
      setSelectedSpecies(id);
      setPage("pokemon");
    },
    showArea: (id) => {
      setSelectedArea(id);
      setPage("areas");
    },
  } : null, [loaded, draft, settings, ctx, setSpecies, setSpeciesMany, setGroups, setGrottoes, setAreas, sharedFamilies, setShared, open]);

  if (error) return <div className="enc-page"><p className="notice error">Couldn't read the encounter data: {error}</p></div>;
  if (!state) return <div className="enc-page"><p className="muted pad">Reading the encounter tables, zones and species…</p></div>;

  return (
    <div className="enc-editor">
      <header className="enc-header">
        <h2>Encounter Editor</h2>
        <div className="view-switch">
          {PAGES.map((p) => (
            <button key={p.id} className={page === p.id ? "active" : ""} onClick={() => setPage(p.id)}>{p.title}</button>
          ))}
        </div>
        <span className="spacer" />
        <ContextBar ctx={ctx} setCtx={setCtx} settings={settings} />
      </header>
      <p className="notice warning enc-draft">
        Draft: built from the current encounter tables, so you can check that everything you want is here. Nothing is
        saved yet, since the new format isn't in res/; edits last until the page is reloaded.
      </p>
      <div className="enc-body">
        {page === "pokemon" && <SpeciesPage state={state} constants={constants} selected={species} select={setSelectedSpecies} />}
        {page === "areas" && <AreasPage state={state} selected={area} select={setSelectedArea} />}
        {page === "map" && <MapPage state={state} />}
        {page === "settings" && <SettingsPage settings={settings} setSettings={setSettings} reimport={reimport}
                                             species={[...loaded!.species.values()].sort((a, b) => a.name.localeCompare(b.name))} />}
      </div>
    </div>
  );
}
