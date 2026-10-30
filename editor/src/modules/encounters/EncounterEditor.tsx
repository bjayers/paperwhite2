// The Encounter Editor's frame: it reads the encounter data (res/paperwhite2/encounters/, or an import of the original
// tables when there is none yet) and holds the settings, the draft's edits and the preview's context, which every page
// shares. Save writes the files that changed, in the data tools' layout, each checked by the build's validator.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ToolProps } from "../types.ts";
import type { Draft } from "./convert.ts";
import { api } from "../../api.ts";
import { allTexts, speciesPath, type Json } from "./files.ts";
import { buildDraft, draftFromFiles, load, loadEncounterFiles, type Loaded } from "./load.ts";
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
  // The files as they were read or last saved, and the level scaling's own fields, which the texts keep
  const [saved, setSaved] = useState<Map<string, string>>(new Map());
  const [levelScaling, setLevelScaling] = useState<Json>({});
  const [fromFiles, setFromFiles] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const read = useCallback(async () => {
    const l = await load(constants);
    const files = await loadEncounterFiles();
    const grottoFiles = l.grottoes;
    if (files) {
      const { settings: s, draft: d } = draftFromFiles(l, files);
      setSettings(s);
      setDraft(d);
      setLevelScaling(files.levelScaling);
      setSaved(allTexts(d, s, l.species, files.levelScaling, grottoFiles));
    } else {
      const d = buildDraft(l, DEFAULT_SETTINGS);
      const scaling = JSON.parse((await api.file("res/paperwhite2/level_scaling.json")).text);
      setSettings(DEFAULT_SETTINGS);
      setDraft(d);
      setLevelScaling(scaling);
      setSaved(new Map());
    }
    setFromFiles(!!files);
    setLoaded(l);
  }, [constants]);

  useEffect(() => {
    if (!constants.size || loaded) return;
    read().catch((e: Error) => setError(e.message));
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
    if (!confirm("Import the original tables again with these settings? Every habitat is replaced; nothing is written until you save.")) return;
    setDraft(buildDraft(loaded, settings));
  };

  // What saving would write: the texts that differ from the files, and the species files to remove
  const texts = useMemo(() => (loaded && draft ? allTexts(draft, settings, loaded.species, levelScaling, loaded.grottoes) : new Map<string, string>()),
    [loaded, draft, settings, levelScaling]);
  const changed = [...texts].filter(([path, text]) => saved.get(path) !== text).map(([path]) => path);
  const removed = [...saved.keys()].filter((path) => path.startsWith(speciesPath("")) && !texts.has(path));
  const dirty = changed.length + removed.length;

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const next = new Map(saved);
    try {
      for (const path of changed) {
        const result = await api.save({ path, text: texts.get(path)!, baseVersion: null });
        if (!result.ok) throw new Error(`${path}: ${result.reason === "invalid" ? result.message : "changed on disk"}`);
        next.set(path, texts.get(path)!);
      }
      for (const path of removed) {
        await api.removeFile(path);
        next.delete(path);
      }
      setFromFiles(true);
      setMessage(`Saved ${changed.length + removed.length} file${changed.length + removed.length === 1 ? "" : "s"}.`);
    } catch (e) {
      setMessage(`Not everything was saved: ${(e as Error).message}`);
    } finally {
      setSaved(next);
      setSaving(false);
    }
  };

  const revert = async () => {
    if (dirty && !confirm(`Throw away ${dirty} unsaved change${dirty === 1 ? "" : "s"} and read the files again?`)) return;
    setMessage(null);
    await read();
  };

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

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
        <span className={`small ${dirty ? "" : "muted"}`} title={[...changed, ...removed.map((p) => `${p} (removed)`)].join("\n")}>
          {dirty ? `${dirty} file${dirty === 1 ? "" : "s"} to save` : "Saved"}
        </span>
        <button className="primary" disabled={!dirty || saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
        <button disabled={saving} onClick={revert} title="Read the files again">Revert</button>
      </header>
      <div className="enc-header enc-header-2">
        <ContextBar ctx={ctx} setCtx={setCtx} settings={settings} />
      </div>
      {!fromFiles && (
        <p className="notice warning enc-draft">
          There is no encounter data in res/paperwhite2/encounters/ yet: this is an import of the original tables.
          Save writes it.
        </p>
      )}
      {message && <p className={`notice ${message.startsWith("Not") ? "error" : ""} enc-draft`}>{message}</p>}
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
