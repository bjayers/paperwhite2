// The Rig Editor (docs/paperwhite2/design/battle-sprites.md section 16, step 2): one side of a battle sprite's flat
// rig, res/pokemon/<folder>/<side>_rig.json, edited through the shell's documents (undo and redo, unsaved changes,
// Save checked by the build's validator and by mcss_rig.check for the game's limits). The preview draws the sprite live
// as MCSS does; the sheet shows the pictures' rectangles; the timeline the sequence and each part's keys; the side panel
// what is chosen. Opened from the Pokémon Editor's Battle sprite card (#tool/rig?folder=pichu/form_1&side=front).
//
// Step 3 (an armature and curves) will be a source layer above this flat rig, baked into it on save; the views here
// read and write only the flat rig, through the Editor of model.ts, so that layer can sit between them and the file.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type RigCheck } from "../../api.ts";
import { currentText, documents, useDocuments, useFileEpoch } from "../../documents.ts";
import { navigate, useToolParams } from "../../navigation.ts";
import { useToolActive } from "../active.ts";
import type { ToolProps } from "../types.ts";
import { fileText, fromPlain, getIn, type JsonValue, type Layout } from "../../../shared/json.ts";
import { readIndexedPng } from "../palettes/png.ts";
import { parsePal } from "../palettes/pal.ts";
import { lengthOf, type Rig } from "./mcss.ts";
import { dataOf, rigOf, sizeProblem, type Editor, type Phase } from "./model.ts";
import { bake, convertToArmature, DEFAULT_STEP, sequenceStep, withBones, type Source } from "./armature.ts";
import { Clock, SLOW } from "./player.ts";
import { NO_SELECTION, useClock, type Art, type RigView, type Selection, type SourceEditor } from "./context.ts";
import { Preview, TOOLS, type Tool } from "./Preview.tsx";
import { SheetView, uncovered } from "./SheetView.tsx";
import { TimeReadout, Timeline } from "./Timeline.tsx";
import { GraphEditor } from "./GraphEditor.tsx";
import { Inspector } from "./Inspector.tsx";
import "./rig.css";

const SIDES = ["front", "back"] as const;
type Side = (typeof SIDES)[number];
/** The measured guidance for a side's five files resident (battle-sprites.md section 15.6). */
const GUIDANCE = 40 * 1024;

const rigPath = (folder: string, side: Side) => `res/pokemon/${folder}/${side}_rig.json`;
/** A side's armature, beside its flat rig (armature.ts). */
const sourcePathOf = (folder: string, side: Side) => `res/pokemon/${folder}/${side}_rig_source.json`;
const SOURCE_SCHEMA = "res/pokemon/battle_sprite_rig_source.schema.json";
/** The armature's file layout: the flat rig's (datajson.dumps_compact), a key pose a line. */
const SOURCE_LAYOUT: Layout = { width: 120, indent: 2, compact: true };
const sourceData = (source: Source, schema: unknown): JsonValue =>
  fromPlain({ $schema: schema, ...Object.fromEntries(Object.entries(source).filter(([k]) => k !== "$schema")) });

/** The docked panel's height, per viewer (localStorage, which may be missing or refuse). */
const DOCK_KEY = "paperwhite2.rig.dockHeight";
const DOCK_VIEW_KEY = "paperwhite2.rig.dockView";
function stored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // (private windows, blocked storage: the panel just doesn't remember)
  }
}

export function RigEditor(_props: ToolProps) {
  const params = useToolParams("rig");
  const folder = params.get("folder");
  const side = (params.get("side") === "back" ? "back" : "front") as Side;
  if (!folder) return <Picker />;
  return <RigPage key={`${folder}/${side}`} folder={folder} side={side} />;
}

// ---------------------------------------------------------------- Choosing a sprite

function Picker() {
  const [folders, setFolders] = useState<string[] | null>(null);
  const [filter, setFilter] = useState("");
  useEffect(() => {
    api.list("res/pokemon/**/front_rig.json").then((paths) => setFolders(paths
      .map((p) => p.slice("res/pokemon/".length, -"/front_rig.json".length))
      .filter((f) => !f.split("/").includes("musical"))));
  }, []);
  const shown = (folders ?? []).filter((f) => f.includes(filter.trim().toLowerCase()));
  return (
    <div className="rig-picker">
      <h2>Rig Editor</h2>
      <p className="muted">A battle sprite's rig: its pictures cut from the sheet, its parts and their pivots, and their keys. Open one from a
        Pokémon's Battle sprite card (Edit rig…), or choose it here.</p>
      <input className="rig-filter" placeholder="Filter (pichu, form_1, pokestar)" value={filter} onChange={(e) => setFilter(e.target.value)} autoFocus />
      {!folders ? <p className="muted">Reading the rigs…</p> : (
        <div className="rig-picker-list">
          {shown.slice(0, 400).map((f) => (
            <button key={f} onClick={() => navigate("rig", { folder: f, side: "front" })}>{f}</button>
          ))}
          {shown.length > 400 && <span className="muted">and {shown.length - 400} more: filter to find them</span>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- One side

async function loadArt(folder: string, side: Side): Promise<Art> {
  const dir = `res/pokemon/${folder}`;
  const names = (await api.list(`${dir}/${side}*.png`)).map((p) => p.slice(dir.length + 1, -4)).filter((n) => n === side || n === `${side}_female`);
  const sheets: Record<string, Uint8Array> = {};
  for (const name of names) sheets[name] = (await readIndexedPng(await api.asset(`${dir}/${name}.png`))).pixels;
  const pal = async (name: string) => parsePal((await api.file(`${dir}/${name}.pal`)).text);
  return { sheets, normal: await pal("normal"), shiny: await pal("shiny").catch(() => pal("normal")) };
}

function RigPage({ folder, side }: { folder: string; side: Side }) {
  const path = rigPath(folder, side);
  const other = rigPath(folder, side === "front" ? "back" : "front");
  const toolActive = useToolActive();
  const { docs } = useDocuments();
  const doc = docs.get(path);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [art, setArt] = useState<Art | null>(null);
  const artEpoch = useFileEpoch(`res/pokemon/${folder}/${side}.png`);
  const [sel, setSel] = useState<Selection>(NO_SELECTION);
  const [sheet, setSheet] = useState<string>(side);
  const [shiny, setShiny] = useState(false);
  const [zoom, setZoom] = useState(3);
  const [sheetZoom, setSheetZoom] = useState(2);
  const [scale, setScale] = useState(3);
  const [onion, setOnion] = useState(false);
  const [guides, setGuides] = useState(true);
  const [follow, setFollow] = useState(true);
  const [tool, setTool] = useState<Tool>("move");
  const [message, setMessage] = useState<string | null>(null);
  const [check, setCheck] = useState<RigCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const [showBones, setShowBones] = useState(true);
  const [dockHeight, setDockHeight] = useState(() => Number(stored(DOCK_KEY)) || 300);
  const [dockView, setDockView] = useState<"timeline" | "graph" | "both">(() => (stored(DOCK_VIEW_KEY) as "timeline" | "graph" | "both") || "timeline");
  const clock = useRef<Clock>(null as unknown as Clock);
  if (!clock.current) clock.current = new Clock();
  const sourcePath = sourcePathOf(folder, side);
  const sourceDoc = docs.get(sourcePath);
  // Which document each step of undo went to: the flat rig's or the armature's (one Ctrl+Z for the page)
  const history = useRef<{ undo: string[]; redo: string[] }>({ undo: [], redo: [] });
  const noteStep = (p: string, phase: Phase) => {
    if (phase === "move" || phase === "end") return;
    history.current.undo.push(p);
    history.current.redo = [];
  };

  useEffect(() => {
    let live = true;
    documents.hold(path).then(() => live && setLoadError(null), (e: Error) => live && setLoadError(e.message));
    documents.hold(other).catch(() => undefined);
    // (no armature: the file isn't there, and the side edits flat)
    documents.hold(sourcePath).catch(() => undefined);
    return () => { live = false; };
  }, [path, other, sourcePath]);
  useEffect(() => {
    let live = true;
    loadArt(folder, side).then((a) => live && setArt(a), (e: Error) => live && setLoadError(e.message));
    return () => { live = false; };
  }, [folder, side, artEpoch]);

  const data = doc?.data ?? null;
  const flatRig = useMemo(() => (data ? rigOf(data) : null), [data]);
  const sourceJson = sourceDoc?.data ?? null;
  const source = useMemo(() => (sourceJson && flatRig ? withBones(rigOf(sourceJson) as unknown as Source, flatRig) : null), [sourceJson, flatRig]);
  const baked = useMemo(() => (source && flatRig ? bake(source, flatRig) : null), [source, flatRig]);
  const rig = baked?.rig ?? flatRig;

  // The armature's bake kept in the flat rig's document (no step of its own), so the checks, the size, Save and the
  // Build button all see what the game will get; and bones made for tracks added since
  useEffect(() => {
    if (!source || !sourceJson) return;
    if ((rigOf(sourceJson) as unknown as Source).bones.length !== source.bones.length) documents.amend(sourcePath, [], sourceData(source, getIn(sourceJson, ["$schema"])));
  }, [source, sourceJson, sourcePath]);
  useEffect(() => {
    const d = documents.get(path);
    if (!baked || !d?.data || !d.layout) return;
    const next = dataOf(baked.rig, getIn(d.data, ["$schema"]));
    if (fileText(next, d.layout) !== currentText(d)) documents.amend(path, [], next);
  }, [baked, path]);

  useEffect(() => {
    if (!rig) return;
    clock.current.setRig(rig);
  }, [rig]);
  useEffect(() => {
    if (!toolActive) { clock.current.stop(); return; }
    if (clock.current.state.playing) clock.current.start();
    return () => clock.current.stop();
  }, [toolActive]);

  const editor: Editor = useMemo(() => ({
    set(at, value, phase = "typed") {
      if (phase === "end") return;
      noteStep(path, phase);
      const inner = value === undefined ? undefined : fromPlain(value);
      if (phase === "move") documents.amend(path, at, inner);
      else documents.edit(path, at, inner);
    },
    replace(next, phase = "typed") {
      if (phase === "end") return;
      noteStep(path, phase);
      const d = documents.get(path);
      const sch = d?.data ? getIn(d.data, ["$schema"]) : undefined;
      if (phase === "move") documents.amend(path, [], dataOf(next, sch));
      else documents.replace(path, dataOf(next, sch));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [path]);
  const sourceEditor: SourceEditor = useMemo(() => ({
    set(at, value, phase = "typed") {
      if (phase === "end" || !documents.get(sourcePath)?.data) return;
      noteStep(sourcePath, phase);
      const inner = value === undefined ? undefined : fromPlain(value);
      if (phase === "move") documents.amend(sourcePath, at, inner);
      else documents.edit(sourcePath, at, inner);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [sourcePath]);

  const convert = () => {
    if (!flatRig || !doc?.data) return;
    const schema = String(getIn(doc.data, ["$schema"]) ?? "../battle_sprite_rig.schema.json").replace("battle_sprite_rig.schema.json", "battle_sprite_rig_source.schema.json");
    documents.create(sourcePath, SOURCE_SCHEMA, sourceData(convertToArmature(flatRig, DEFAULT_STEP), schema), SOURCE_LAYOUT);
    setMessage(`Converted to an armature: every part a bone of the root's, its keys held key poses (it bakes to the rig as it was). Parent the bones and key them; Save writes ${side}_rig_source.json with the baked rig.`);
  };
  const removeArmature = async () => {
    const d = documents.get(sourcePath);
    if (!d || !confirm(`Remove this side's armature (${side}_rig_source.json)? The rig keeps its keys as they bake now, and edits flat again.`)) return;
    if (d.savedText) await api.removeFile(sourcePath);
    await documents.reload(sourcePath);
    history.current.undo = history.current.undo.filter((p) => p !== sourcePath);
    history.current.redo = history.current.redo.filter((p) => p !== sourcePath);
    setSel((s) => ({ ...s, root: false, keyPose: null }));
    setMessage(`Removed the armature. Save to keep the rig as it baked.`);
  };

  const select = useCallback((next: Partial<Selection>) => setSel((s) => ({ ...s, ...next })), []);

  // The build's checks of the rig as it is now, a moment after each change
  const text = doc ? currentText(doc) : null;
  useEffect(() => {
    if (!text) return;
    let live = true;
    setChecking(true);
    const timer = setTimeout(() => {
      api.rigCheck(text).then((c) => live && setCheck(c), (e: Error) => live && setCheck({ errors: [e.message], warnings: [], sizes: null }))
        .finally(() => live && setChecking(false));
    }, 350);
    return () => { live = false; clearTimeout(timer); };
  }, [text]);

  const rigDocs = [path, other, sourcePath].map((p) => docs.get(p)).filter((d) => d !== undefined);
  const dirty = rigDocs.filter((d) => d.dirty);
  const saveAll = useCallback(async () => {
    const out: string[] = [];
    let refused = false;
    for (const d of [path, other].map((p) => documents.get(p)).filter((x) => x?.dirty)) {
      const result = await api.rigCheck(currentText(d!));
      if (result.errors.length) {
        if (d!.path === path) refused = true;
        out.push(`${d!.path.split("/").pop()} not saved: ${result.errors[0]}${result.errors.length > 1 ? ` (and ${result.errors.length - 1} more)` : ""}`);
        continue;
      }
      out.push((await documents.save(d!.path)) ? `Saved ${d!.path.split("/").pop()}.` : `${d!.path.split("/").pop()} not saved: ${documents.get(d!.path)?.saveError}`);
    }
    // The armature after the rig it bakes to, and only with it
    const s = documents.get(sourcePath);
    if (s?.dirty) {
      if (refused) out.push(`${side}_rig_source.json not saved with it.`);
      else out.push((await documents.save(sourcePath)) ? `Saved ${side}_rig_source.json.` : `${side}_rig_source.json not saved: ${documents.get(sourcePath)?.saveError}`);
    }
    setMessage(out.join(" ") || "Nothing to save.");
  }, [path, other, sourcePath, side]);
  const revert = async () => {
    if (!dirty.length || !confirm(`Throw away the changes to ${dirty.map((d) => d.path.split("/").pop()).join(" and ")}?`)) return;
    for (const d of dirty) await documents.reload(d.path);
  };

  // Keys while the page is shown
  const latest = useRef({ saveAll, rig, sel });
  latest.current = { saveAll, rig, sel };
  useEffect(() => {
    if (!toolActive) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName);
      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (key === "s") {
          e.preventDefault();
          e.stopPropagation();
          void latest.current.saveAll();
        } else if ((key === "z" || key === "y") && !typing) {
          e.preventDefault();
          e.stopPropagation();
          const h = history.current;
          if (key === "y" || e.shiftKey) {
            const p = h.redo.pop() ?? path;
            documents.redo(p);
            h.undo.push(p);
          } else {
            const p = h.undo.pop() ?? path;
            documents.undo(p);
            h.redo.push(p);
          }
        }
        return;
      }
      if (typing || e.altKey) return;
      const c = clock.current;
      if (key === " ") { e.preventDefault(); c.play(); }
      else if (key === "arrowleft") { e.preventDefault(); c.step(e.shiftKey ? -6 : -1); }
      else if (key === "arrowright") { e.preventDefault(); c.step(e.shiftKey ? 6 : 1); }
      else if (key === "home") { e.preventDefault(); c.seek(0); }
      else {
        const t = TOOLS.find((x) => x.key.toLowerCase() === key);
        if (t) setTool(t.tool);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [toolActive, path]);

  const copyFromOther = async () => {
    const otherSide = side === "front" ? "back" : "front";
    const o = await documents.hold(other);
    if (!o.data || !rig) return;
    if (!confirm(`Replace this ${side} rig with a copy of the ${otherSide} rig (its pictures, parts, keys and sequences)? `
      + `The rectangles will cut the ${side} sheet where the ${otherSide}'s pieces are, so draw the ${side} art there or move them. Undo takes it back.`)) return;
    editor.replace({ ...rigOf(o.data), side });
    setSel(NO_SELECTION);
    setMessage(`Copied the ${otherSide} rig. Save to keep it.`);
  };

  if (loadError) return <div className="rig-page"><p className="pkm-error">{loadError}</p></div>;
  if (!doc || !rig) return <div className="rig-page"><p className="muted">Reading {path}…</p></div>;
  if (doc.data === null) return <div className="rig-page"><p className="pkm-error">{path} isn't in a layout the editor writes back; edit it as text.</p></div>;

  const view: RigView = { rig, editor, sel, select, clock: clock.current, art, sheet: art?.sheets[sheet] ? sheet : side, shiny,
                          source, sourceEditor: source ? sourceEditor : null, baked, picking, setPicking };
  const resizeDock = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY, startHeight = dockHeight;
    const page = (e.currentTarget as HTMLElement).closest(".rig-page") as HTMLElement | null;
    const most = Math.max(160, (page?.clientHeight ?? window.innerHeight) - 160);
    let height = startHeight;
    const move = (ev: PointerEvent) => {
      height = Math.round(Math.min(most, Math.max(120, startHeight + startY - ev.clientY)));
      setDockHeight(height);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      store(DOCK_KEY, String(height));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const chooseDockView = (v: "timeline" | "graph" | "both") => {
    setDockView(v);
    store(DOCK_VIEW_KEY, v);
  };
  const part = sel.part !== null ? rig.poses[sel.pose]?.parts[sel.part] : undefined;
  const highlight = new Set<number>(part ? (rig.tracks[part.track]?.keys ?? []).map((k) => k.picture ?? 0) : []);
  const title = folder.split("/").map((s) => s.replace(/_/g, " ")).join(" · ");

  return (
    <div className="rig-page rig-docked">
      <div className="rig-upper">
      <header className="rig-head">
        <h2>Rig <span className="muted">{title}</span></h2>
        <span className="view-switch" title="Front and back are separate rigs">
          {SIDES.map((s) => (
            <button key={s} className={s === side ? "active" : ""} onClick={() => navigate("rig", { folder, side: s })}>{s === "front" ? "Front" : "Back"}{docs.get(rigPath(folder, s))?.dirty ? " •" : ""}</button>
          ))}
        </span>
        {art && Object.keys(art.sheets).length > 1 && (
          <span className="view-switch" title="A female sheet shares the rig">
            {Object.keys(art.sheets).map((s) => <button key={s} className={view.sheet === s ? "active" : ""} onClick={() => setSheet(s)}>{s.endsWith("female") ? "Female" : "Male"}</button>)}
          </span>
        )}
        <button onClick={copyFromOther} disabled={!!source} title={source ? "This side has an armature: remove it first (Armature, in the side panel) to start from a copy" : `Start this side from a copy of the ${side === "front" ? "back" : "front"} rig`}>Copy {side === "front" ? "back to front" : "front to back"}…</button>
        <button onClick={() => navigate("pokemon")} title="The Pokémon Editor">Pokémon Editor</button>
        <span className="spacer" />
        <SizeMeter check={check} checking={checking} rig={rig} />
        <span className={`rig-status${dirty.length ? " dirty" : ""}`}>{dirty.length ? `Unsaved: ${dirty.map((d) => d.path.split("/").pop()).join(", ")}` : "Saved"}</span>
        <button disabled={!dirty.length} onClick={revert}>Revert</button>
        <button className="primary" disabled={!dirty.length} onClick={saveAll} title="Ctrl+S: checks each changed side with the build's checks and validator, then writes it">Save</button>
      </header>
      {(message || doc.saveError) && <p className={`rig-message${doc.saveError || message?.includes("not saved") ? " pkm-error" : ""}`}>{doc.saveError ?? message}</p>}

      <div className="rig-main">
        <section className="rig-card rig-preview">
          <div className="rig-card-head">
            <h3>Preview</h3>
            <span className="muted small">as the battle draws it</span>
            <span className="spacer" />
            <span className="view-switch" title="The gizmo on the selected part">
              {TOOLS.map((t) => <button key={t.tool} className={tool === t.tool ? "active" : ""} title={`${t.note} (${t.key})`} onClick={() => setTool(t.tool)}>{t.label}</button>)}
            </span>
          </div>
          <div className="rig-stage">
            <Preview view={view} zoom={zoom} onion={onion} guides={guides} tool={tool} bones={showBones} onMessage={setMessage} />
          </div>
          <p className="muted ow-note">{TOOLS.find((t) => t.tool === tool)?.note} Click a part to choose it.</p>
          <Transport view={view} />
          <div className="rig-toggles">
            <label className="ow-check"><input type="checkbox" checked={shiny} onChange={(e) => setShiny(e.target.checked)} /> Shiny</label>
            <label className="ow-check" title="The frames 6 before and 6 after, faded"><input type="checkbox" checked={onion} onChange={(e) => setOnion(e.target.checked)} /> Onion skin</label>
            <ClockToggles view={view} />
            <label className="ow-check"><input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} /> Feet</label>
            {source && <label className="ow-check" title="The armature's bones and their links to their parents and the root"><input type="checkbox" checked={showBones} onChange={(e) => setShowBones(e.target.checked)} /> Bones</label>}
            <span className="view-switch">
              {[2, 3, 4].map((z) => <button key={z} className={zoom === z ? "active" : ""} onClick={() => setZoom(z)}>{z}×</button>)}
            </span>
          </div>
        </section>

        <section className="rig-card rig-sheet">
          <div className="rig-card-head">
            <h3>Sheet</h3>
            <span className="muted small">{view.sheet}.png, 256×128 · {rig.pictures.length} pictures</span>
            <span className="spacer" />
            <span className="view-switch">
              {[2, 3].map((z) => <button key={z} className={sheetZoom === z ? "active" : ""} onClick={() => setSheetZoom(z)}>{z}×</button>)}
            </span>
          </div>
          <div className="rig-sheet-scroll"><SheetView view={view} zoom={sheetZoom} highlight={highlight} /></div>
          <p className="muted ow-note">The chosen picture's rectangles in yellow (its second dashed), the chosen part's other pictures in their colours.
            Drag a rectangle to move it, its edges to resize it (snapped to 8 pixels; Alt for 1). Art outside every rectangle shows red: the game never draws it.</p>
          <SpriteSection view={view} />
          <ChecksSection view={view} check={check} checking={checking} />
        </section>

        <aside className="rig-side"><Inspector view={view} onTimeChanged={() => undefined} onConvert={convert} onRemoveArmature={removeArmature} /></aside>
      </div>
      </div>

      <section className="rig-card rig-dock" style={{ height: dockHeight }}>
        <div className="rig-dock-handle" onPointerDown={resizeDock} title="Drag to make the panel taller or shorter" />
        <div className="rig-card-head">
          <span className="view-switch" title="What the panel shows">
            {([["timeline", "Timeline"], ["graph", "Graph Editor"], ["both", "Both"]] as const).map(([v, label]) => (
              <button key={v} className={dockView === v ? "active" : ""} onClick={() => chooseDockView(v)}>{label}</button>
            ))}
          </span>
          <SequenceSwitch view={view} />
          {source && <StepControl view={view} />}
          <span className="muted small">the pose shown:</span>
          <span className="view-switch">
            {rig.poses.map((_, i) => <button key={i} className={sel.pose === i ? "active" : ""} onClick={() => { setFollow(false); select({ pose: i, part: null, key: null }); }}>{i}</button>)}
          </span>
          <label className="ow-check" title="Show the pose the playhead is in"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> follow the playhead</label>
          <span className="spacer" />
          <span className="muted small">zoom</span>
          <span className="view-switch">
            {[1, 2, 3, 5, 8].map((z) => <button key={z} className={scale === z ? "active" : ""} onClick={() => setScale(z)}>{z}</button>)}
          </span>
        </div>
        <div className={`rig-dock-body ${dockView}`}>
          {dockView !== "graph" && (
            <div className="rig-dock-pane">
              <Timeline view={view} scale={scale} follow={follow} />
              <p className="muted ow-note">{source
                ? "Diamonds are the armature's key poses (drag one to move it in time, Shift: steps of 6; click to choose it); the blocks under them are the keys they bake to, as the game holds them. Drag a part's name to change the layers."
                : "Drag a part's name to change the layers; click a key to choose it; drag its right edge to change how long it's held (Shift: steps of 6 frames). Faded keys are a looping track's later passes."}</p>
            </div>
          )}
          {dockView !== "timeline" && <div className="rig-dock-pane"><GraphEditor view={view} /></div>}
        </div>
      </section>
    </div>
  );
}

/** The step the armature bakes the shown sequence's tracks at (Game Freak's 6 by default). */
function StepControl({ view }: { view: RigView }) {
  const { source, sourceEditor } = view;
  const sequence = useClock(view.clock, (s) => Math.min(s.sequence, view.rig.sequences.length - 1));
  if (!source || !sourceEditor) return null;
  const own = source.sequences[sequence]?.step;
  const step = sequenceStep(source, sequence);
  return (
    <span className="rig-step" title="The bake holds each sampled key this many frames (and starts one at every key pose). Game Freak keyed every 6; 2 or 3 roughly triples the size (see the meter), so test such a sprite on every screen.">
      <span className="muted small">bake every</span>
      <select value={own ?? 0} onChange={(e) => sourceEditor.set(["sequences", sequence, "step"], Number(e.target.value) || undefined)}>
        <option value={0}>{source.step} frames (the sprite's)</option>
        {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n} frame{n > 1 ? "s" : ""}</option>)}
      </select>
      <span className="muted small">{step === 6 ? "Game Freak's rhythm" : step < 6 ? "finer than Game Freak's" : "coarser"}</span>
    </span>
  );
}

function Transport({ view }: { view: RigView }) {
  const { clock, rig } = view;
  const playing = useClock(clock, (s) => s.playing);
  const sequence = useClock(clock, (s) => Math.min(s.sequence, rig.sequences.length - 1));
  const time = useClock(clock, (s) => Math.floor(s.time));
  const length = lengthOf(rig.sequences[sequence]) || 1;
  return (
    <div className="rig-transport">
      <button title="To the start (Home)" onClick={() => clock.seek(0)}>⏮</button>
      <button title="A frame back (←; Shift: 6)" onClick={() => clock.step(-1)}>◀</button>
      <button className="primary rig-play" title="Play or pause (Space)" onClick={() => clock.play()}>{playing ? "❚❚" : "▶"}</button>
      <button title="A frame on (→; Shift: 6)" onClick={() => clock.step(1)}>▶|</button>
      <input type="range" min={0} max={length - 1} value={time % length} onChange={(e) => { clock.play(false); clock.seek(Number(e.target.value)); }} />
      <TimeReadout view={view} />
    </div>
  );
}

function ClockToggles({ view }: { view: RigView }) {
  const { clock, rig } = view;
  const [, redraw] = useState(0);
  return (
    <>
      <label className="ow-check" title={rig.idle_parts === null ? "This sprite never pauses (no idle parts list)" : "At each end of the stay loop, the battle's roll (1 in 3, 2, then 1) for an idle pause: sequence 1 if there is one, only the idle parts moving, for 48, 56 or 64 frames"}>
        <input type="checkbox" checked={clock.pauses} disabled={rig.idle_parts === null} onChange={(e) => { clock.pauses = e.target.checked; redraw((n) => n + 1); }} /> Battle pauses
      </label>
      <label className="ow-check" title={`Asleep or another status: the battle plays the animation at ${Math.round(SLOW * 100)}% (0x555)`}>
        <input type="checkbox" checked={clock.slow} onChange={(e) => { clock.slow = e.target.checked; redraw((n) => n + 1); }} /> Slowed (status)
      </label>
    </>
  );
}

function SequenceSwitch({ view }: { view: RigView }) {
  const { clock, rig, select } = view;
  const sequence = useClock(clock, (s) => s.sequence);
  return (
    <span className="view-switch" title="Sequence 0 is the loop the battle plays (stay); 1 the idle pause's pose (stop)">
      {rig.sequences.map((s, i) => (
        <button key={i} className={sequence === i ? "active" : ""} onClick={() => { clock.seek(0, i); select({ sequenceKey: null }); }}>
          {i === 0 ? "Stay" : i === 1 ? "Stop" : `Sequence ${i}`} <span className="muted small">{s.name} · {lengthOf(s)}</span>
        </button>
      ))}
    </span>
  );
}

function SizeMeter({ check, checking, rig }: { check: RigCheck | null; checking: boolean; rig: Rig }) {
  const sizes = check?.sizes;
  const loop = lengthOf(rig.sequences[0]);
  const share = sizes ? sizes.resident / GUIDANCE : 0;
  return (
    <span className="rig-size" title={sizes ? `The five files the build writes: bin ${sizes.info}, cells ${sizes.cells}, cell animations ${sizes.animations} (${sizes.animations_compressed} compressed in the archive), multi-cells ${sizes.multi_cells}, multi-cell animations ${sizes.multi_animations} bytes. They stay in memory while the sprite is shown; the originals' largest side is about 30 KB, and section 15.6 of battle-sprites.md measures ~40 KB as safe on every screen.` : "The checks are running"}>
      <span className="muted">loop {loop} frames ({(loop / 60).toFixed(1)} s)</span>
      <span className={`rig-size-bar ${share > 1 ? "over" : share > 0.8 ? "near" : "ok"}`}><span style={{ width: `${Math.min(share, 1) * 100}%` }} /></span>
      <span className={share > 1 ? "pkm-error" : "muted"}>{sizes ? `${(sizes.resident / 1024).toFixed(1)} KB of ~40 KB` : checking ? "…" : "—"}</span>
    </span>
  );
}

function SpriteSection({ view }: { view: RigView }) {
  const { rig, editor } = view;
  return (
    <section className="ow-panel-box ow-section">
      <h5>Sprite <span className="muted">{rig.poses.length} poses · {rig.tracks.length} tracks · {rig.sequences.length} sequences</span></h5>
      <div className="ow-condition">
        <span className="ow-condition-label">Idle pause</span>
        <span className="ow-xyz">
          <span className="view-switch">
            <button className={rig.idle_parts !== null ? "active" : ""} onClick={() => rig.idle_parts === null && editor.set(["idle_parts"], [])}>Pauses</button>
            <button className={rig.idle_parts === null ? "active" : ""} onClick={() => rig.idle_parts !== null && editor.set(["idle_parts"], null)}>Never pauses</button>
          </span>
          <span className="muted hint">{rig.idle_parts === null ? "the battle never stops it" : rig.idle_parts.length ? `now and then the battle stops it, all but its idle parts (layers ${rig.idle_parts.join(", ")})` : "now and then the battle stops it whole (no idle parts)"}</span>
        </span>
        <span className="ow-condition-label">Airborne</span>
        <span className="ow-xyz">
          <label className="ow-check"><input type="checkbox" checked={(rig.stop_flags & 1) === 1} onChange={(e) => editor.set(["stop_flags"], e.target.checked ? rig.stop_flags | 1 : rig.stop_flags & ~1)} /> flies or floats</label>
          <span className="muted hint">the stop flags, which move effects read (inferred: 1 for the 166 flying or floating fronts)</span>
        </span>
        <span className="ow-condition-label">Box</span>
        <span className="ow-xyz">
          <span className="muted">{rig.box.width}×{rig.box.height} at {rig.box.x}, {rig.box.y}</span>
          <span className="muted hint">what the egg hatching and evolution centre the sprite by; kept as it is</span>
        </span>
      </div>
    </section>
  );
}

function ChecksSection({ view, check, checking }: { view: RigView; check: RigCheck | null; checking: boolean }) {
  const { rig, art, sheet } = view;
  const local: string[] = [];
  rig.pictures.forEach((p, i) => p.rectangles.forEach((r, k) => {
    if (k > 0 && !r.size[0]) return;
    const problem = r.size[0] && r.size[1] ? sizeProblem(r.size[0], r.size[1]) : null;
    if (problem) local.push(`Picture ${i}'s ${k ? "second" : "first"} rectangle: ${problem}; its OBJs can't be made again (MCSS still draws it).`);
  }));
  const pixels = art?.sheets[sheet];
  if (pixels) {
    const out = uncovered(pixels, rig.pictures.flatMap((p) => p.rectangles));
    let count = 0;
    for (const v of out) count += v;
    if (count) local.push(`${count} pixels of ${sheet}.png are outside every rectangle (red on the sheet): the game never draws them.`);
  }
  const errors = check?.errors ?? [];
  // The armature's bake: shears it can't draw, parents keeping other clocks, unrolled loops
  const warnings = [...(view.baked?.warnings ?? []), ...(check?.warnings ?? []), ...local];
  return (
    <section className="ow-panel-box ow-section">
      <h5>Checks <span className="muted">{checking ? "checking…" : errors.length ? `${errors.length} errors: Save refuses` : warnings.length ? `${warnings.length} warnings` : "the build takes it"}</span></h5>
      {errors.length > 0 && <ul className="bsp-messages pkm-error">{errors.slice(0, 12).map((m, i) => <li key={i}>{m}</li>)}</ul>}
      {warnings.length > 0 && <ul className="bsp-messages bsp-warning">{warnings.slice(0, 12).map((m, i) => <li key={i}>⚠ {m}</li>)}</ul>}
      {!errors.length && !warnings.length && <p className="muted ow-note">No problems: mcss_rig.check (the game's limits) and the schema pass.</p>}
    </section>
  );
}
