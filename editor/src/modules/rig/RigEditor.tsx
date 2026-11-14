// The Rig Editor (docs/paperwhite2/design/battle-sprites.md section 16, step 2): one side of a battle sprite's flat
// rig, res/pokemon/<folder>/<side>_rig.json, edited through the shell's documents (undo and redo, unsaved changes,
// Save checked by the build's validator and by mcss_rig.check for the game's limits). The preview draws the sprite live
// as MCSS does; the sheet shows the pictures' rectangles; the timeline the sequence and each part's keys; the side panel
// what is chosen. Opened from the Pokémon Editor's Battle sprite card (#tool/rig?folder=pichu/form_1&side=front).
//
// Since the Rig Editor's second version (rig-editor-v2.md), this first editor is its Advanced view
// (#tool/rig?folder=...&side=...&editor=old); the address without `editor=old` opens the new one (SetupEditor.tsx).

import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type RigCheck } from "../../api.ts";
import { currentText, documents, useDocuments, useFileEpoch } from "../../documents.ts";
import { navigate, useToolParams } from "../../navigation.ts";
import { useToolActive } from "../active.ts";
import type { ToolProps } from "../types.ts";
import { fileText, fromPlain, getIn, type JsonValue, type Layout } from "../../../shared/json.ts";
import { readIndexedPng } from "../palettes/png.ts";
import { parsePal } from "../palettes/pal.ts";
import { keyAt, lengthOf, type Rig } from "./mcss.ts";
import { artBounds, dataOf, freshRig, partClock, rigOf, sizeProblem, type Editor, type Phase } from "./model.ts";
import { bake, convertToArmature, DEFAULT_STEP, reparent, sequenceStep, withBones, wouldCycle, type Curve, type Source } from "./armature.ts";
import { Clock, SLOW } from "./player.ts";
import { NO_SELECTION, selectedParts, useClock, type Art, type Mode, type RigView, type Selection, type SourceEditor } from "./context.ts";
import { POSE_TOOLS, Preview, TOOLS, type Tool } from "./Preview.tsx";
import { RigHistory } from "./history.ts";
import { Guide } from "./Guide.tsx";
import { keyAtPlayhead } from "./keying.ts";
import { SheetView, uncovered } from "./SheetView.tsx";
import { TimeReadout, Timeline } from "./Timeline.tsx";
import { GraphEditor } from "./GraphEditor.tsx";
import { Inspector } from "./Inspector.tsx";
import { SetupPage } from "./SetupEditor.tsx";
import { v2PathOf } from "./setupFiles.ts";
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
const AUTOKEY_KEY = "paperwhite2.rig.autoKey";
const MODE_KEY = "paperwhite2.rig.mode";
const GUIDE_KEY = "paperwhite2.rig.guide";
const CURVE_KEY = "paperwhite2.rig.newCurve";
/** Whether keys go to a field: text boxes and the like. A checkbox, a slider or a button with the focus is not typing, so
 * the page's shortcuts still work after using one; a list (select) takes the letters, but not undo. */
export function isTyping(target: EventTarget | null, forUndo = false): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
  if (el.tagName === "SELECT") return !forUndo;
  if (el.tagName !== "INPUT") return false;
  return !["checkbox", "radio", "range", "button", "submit", "reset", "color", "file", "image"].includes((el as HTMLInputElement).type);
}
export function stored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function store(key: string, value: string) {
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
  // The new editor (SetupEditor.tsx) unless the address asks for the first one, the Advanced view
  const old = params.get("editor") === "old";
  if (!folder) return <Picker />;
  return (
    <RigErrorBoundary key={`${folder}/${side}/${old ? "old" : "new"}`}>
      {old ? <RigPage folder={folder} side={side} /> : <SetupPage folder={folder} side={side} />}
    </RigErrorBoundary>
  );
}

/** An error in a part of the Rig Editor shows here instead of blanking the page; its remembered view (the docked panel's
 * height and view) can be reset, since a bad one would otherwise come back with every sprite. */
class RigErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const reset = () => {
      try {
        window.localStorage.removeItem(DOCK_KEY);
        window.localStorage.removeItem(DOCK_VIEW_KEY);
      } catch {
        // (blocked storage: nothing was remembered)
      }
      this.setState({ error: null });
    };
    return (
      <div className="rig-card">
        <h3>The Rig Editor hit an error</h3>
        <p className="muted">Nothing was saved or changed. Resetting its view (the docked panel's height and view) and
          trying again usually helps; if it happens again, the message below says where.</p>
        <pre className="muted">{error.message}</pre>
        <button onClick={reset}>Reset the view and try again</button>
      </div>
    );
  }
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

export async function loadArt(folder: string, side: Side): Promise<Art> {
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
  const [mode, setModeState] = useState<Mode>(() => (stored(MODE_KEY) === "edit" ? "edit" : "pose"));
  const [poseTool, setPoseTool] = useState<Tool>("move");
  const [gameKeys, setGameKeys] = useState(false);
  const [guideOpen, setGuideOpenState] = useState(() => stored(GUIDE_KEY) === "open");
  const setGuideOpen = (open: boolean) => { setGuideOpenState(open); store(GUIDE_KEY, open ? "open" : "closed"); };
  const [newCurve, setNewCurveState] = useState<Curve>(() => (["linear", "ease_in", "ease_out", "ease_in_out", "constant"] as Curve[]).find((c) => c === stored(CURVE_KEY)) ?? "ease_in_out");
  const setNewCurve = (c: Curve) => { setNewCurveState(c); store(CURVE_KEY, c); };
  // Edit mode has one tool (Pivot); Pose mode the three gizmos
  const tool: Tool = mode === "edit" ? "pivot" : poseTool;
  const setTool = (t: Tool) => { if (t === "pivot") setMode("edit"); else { setPoseTool(t); setMode("pose"); } };
  const [autoKey, setAutoKeyState] = useState(() => stored(AUTOKEY_KEY) !== "off");
  const setAutoKey = (on: boolean) => { setAutoKeyState(on); store(AUTOKEY_KEY, on ? "on" : "off"); };
  const [message, setMessage] = useState<string | null>(null);
  const [check, setCheck] = useState<RigCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const [showBones, setShowBones] = useState(true);
  // Tracks hidden in the preview by the layer list's eyes: editor state only, not part of any file
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());
  const toggleHidden = useCallback((track: number) => setHidden((h) => {
    const next = new Set(h);
    if (!next.delete(track)) next.add(track);
    return next;
  }), []);
  const [dockHeight, setDockHeight] = useState(() => Number(stored(DOCK_KEY)) || 340);
  const [dockView, setDockView] = useState<"timeline" | "graph" | "both">(() => (stored(DOCK_VIEW_KEY) as "timeline" | "graph" | "both") || "timeline");
  const clock = useRef<Clock>(null as unknown as Clock);
  if (!clock.current) clock.current = new Clock();
  const clockSequence = useClock(clock.current, (s) => s.sequence);
  const sourcePath = sourcePathOf(folder, side);
  const sourceDoc = docs.get(sourcePath);
  const v2Doc = docs.get(v2PathOf(folder, side));
  // One history for the page across the flat rig's document and the armature's (history.ts), which takes an armature
  // made automatically away again, and back, with the step that made it
  const stashed = useRef<ReturnType<typeof documents.stash>>(undefined);
  const history = useRef<RigHistory>(null as unknown as RigHistory);
  if (!history.current) {
    history.current = new RigHistory({
      canUndo: (p) => documents.canUndo(p), canRedo: (p) => documents.canRedo(p),
      undo: (p) => documents.undo(p), redo: (p) => documents.redo(p),
      restore: (p, data) => documents.amend(p, [], data),
    }, (hidden) => {
      if (hidden) stashed.current = documents.stash(sourcePathRef.current);
      else if (stashed.current) { documents.restore(stashed.current); stashed.current = undefined; }
    });
  }
  const sourcePathRef = useRef(sourcePath);
  sourcePathRef.current = sourcePath;
  const noteStep = (paths: string[], phase: Phase) => history.current.note(paths, phase);

  useEffect(() => {
    let live = true;
    documents.hold(path).then(() => live && setLoadError(null), (e: Error) => live && setLoadError(e.message));
    documents.hold(other).catch(() => undefined);
    // (no armature: the file isn't there, and the side edits flat)
    documents.hold(sourcePath).catch(() => undefined);
    documents.hold(v2PathOf(folder, side)).catch(() => undefined);
    return () => { live = false; };
  }, [path, other, sourcePath, folder, side]);
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
      noteStep([path], phase);
      const inner = value === undefined ? undefined : fromPlain(value);
      if (phase === "move") documents.amend(path, at, inner);
      else documents.edit(path, at, inner);
    },
    replace(next, phase = "typed") {
      if (phase === "end") return;
      noteStep([path], phase);
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
      noteStep([sourcePath], phase);
      const inner = value === undefined ? undefined : fromPlain(value);
      if (phase === "move") documents.amend(sourcePath, at, inner);
      else documents.edit(sourcePath, at, inner);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [sourcePath]);

  /** The flat rig and/or the armature changed together: one step of the history (a drag's later moves amend it). */
  const commit = (next: { rig?: Rig; source?: Source }, phase: Phase = "typed") => {
    if (phase === "end") return;
    const paths: string[] = [];
    const d = documents.get(path);
    if (next.rig && d?.data) {
      const data = dataOf(next.rig, getIn(d.data, ["$schema"]));
      if (phase === "move") documents.amend(path, [], data);
      else documents.replace(path, data);
      paths.push(path);
    }
    const sd = documents.get(sourcePath);
    if (next.source && sd?.data) {
      const data = sourceData(next.source, getIn(sd.data, ["$schema"]));
      if (phase === "move") documents.amend(sourcePath, [], data);
      else documents.replace(sourcePath, data);
      paths.push(sourcePath);
    }
    if (paths.length) noteStep(paths, phase);
  };

  /** The armature of this side, made now if it has none: the flat rig converted as it is (it bakes back to it byte for
   * byte), optionally changed by `apply` (a parenting), as part of the step being made. */
  const ensureArmature = (joinNext = false, apply?: (source: Source) => Source): RigView | null => {
    const cur = viewRef.current;
    if (!cur) return null;
    if (cur.source) return cur;
    if (!flatRig || !doc?.data) return null;
    let made = convertToArmature(flatRig, DEFAULT_STEP);
    if (apply) made = apply(made);
    const schema = String(getIn(doc.data, ["$schema"]) ?? "../battle_sprite_rig.schema.json").replace("battle_sprite_rig.schema.json", "battle_sprite_rig_source.schema.json");
    stashed.current = undefined;
    history.current.created({ source: sourcePath, flat: path, flatData: doc.data }, joinNext);
    documents.create(sourcePath, SOURCE_SCHEMA, sourceData(made, schema), SOURCE_LAYOUT);
    setMessage(`This sprite is now an armature, so its parts can have parents and curves: it plays exactly as before until you change something (Ctrl+Z takes the armature away again). Save writes ${side}_rig_source.json with the baked ${side}_rig.json.`);
    return { ...cur, source: made, sourceEditor, baked: bake(made, flatRig) };
  };

  /** Parenting (Edit mode): the bone's key poses are written again relative to its new parent, so it stays where it is. */
  const parentBone = (bone: number, parent: number | null): string | null => {
    const cur = viewRef.current;
    if (!cur || !flatRig) return null;
    const name = (t: number | null) => (t === null ? "the root" : rig?.tracks[t]?.name ?? `track ${t}`);
    if (cur.source) {
      if (wouldCycle(cur.source, bone, parent)) return `${name(parent)} can't be ${name(bone)}'s parent: they'd go round in a circle.`;
      commit({ source: reparent(cur.source, flatRig, bone, parent) });
    } else {
      ensureArmature(false, (s) => reparent(s, flatRig, bone, parent));
    }
    return `${name(bone)} is now parented to ${name(parent)}; it stays where it is, and follows its parent from now on.`;
  };

  const removeArmature = async (confirmed = false) => {
    const d = documents.get(sourcePath);
    if (!d || (!confirmed && !confirm(`Remove this side's armature (${side}_rig_source.json)? The rig keeps its keys as they bake now, and edits flat again (the Game keys view).`))) return;
    if (d.savedText) {
      try {
        await api.removeFile(sourcePath);
      } catch (e) {
        setMessage(`Couldn't remove ${side}_rig_source.json: ${(e as Error).message}`);
        return false;
      }
    }
    await documents.reload(sourcePath);
    history.current.forget(sourcePath);
    stashed.current = undefined;
    setSel((s) => ({ ...s, root: false, keyPose: null }));
    setMessage(`Removed the armature. Save to keep the rig as it baked.`);
    return true;
  };
  const setMode = (m: Mode) => {
    setModeState(m);
    store(MODE_KEY, m);
    if (m === "edit") {
      clock.current.play(false);
      setPicking(null);
      setSel((s) => ({ ...s, root: false, key: null, keyPose: null, sequenceKey: null, more: [] }));
    }
  };

  // (choosing another part or pose drops the extra chosen parts, unless the change says which are)
  const select = useCallback((next: Partial<Selection>) => setSel((s) => ({
    ...s, ...next,
    more: next.more ?? ((next.part !== undefined && next.part !== s.part) || (next.pose !== undefined && next.pose !== s.pose) || next.root ? [] : s.more),
  })), []);
  const viewRef = useRef<RigView | null>(null);

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
  const latest = useRef({ saveAll, rig, sel, mode });
  latest.current = { saveAll, rig, sel, mode };
  useEffect(() => {
    if (!toolActive) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = isTyping(e.target);
      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (key === "s") {
          e.preventDefault();
          e.stopPropagation();
          void latest.current.saveAll();
        } else if ((key === "z" || key === "y") && !isTyping(e.target, true)) {
          // (a checkbox, a slider or a button that has the focus is not typing: the page's undo is still the page's)
          e.preventDefault();
          e.stopPropagation();
          const others = [sourcePathRef.current, path];
          if (key === "y" || e.shiftKey) history.current.redo(others);
          else history.current.undo(others);
        }
        return;
      }
      if (typing || e.altKey) return;
      const c = clock.current;
      if (key === "tab") { e.preventDefault(); setMode(latest.current.mode === "edit" ? "pose" : "edit"); }
      else if (key === " ") { e.preventDefault(); c.play(); }
      else if (key === "arrowleft") { e.preventDefault(); c.step(e.shiftKey ? -6 : -1); }
      else if (key === "arrowright") { e.preventDefault(); c.step(e.shiftKey ? 6 : 1); }
      else if (key === "home") { e.preventDefault(); c.seek(0); }
      else {
        const t = TOOLS.find((x) => x.key.toLowerCase() === key);
        const inEdit = latest.current.mode === "edit";
        if (t && t.tool === "pivot") { if (!inEdit) setMessage("Pivot is an Edit mode tool: Edit mode sets the sprite up at rest (pivots, parents), Pose mode animates it. Switched to Edit mode."); setMode("edit"); }
        else if (t && inEdit) setMessage(`${t.label} poses the sprite, which is Pose mode's work (Tab). Edit mode sets it up at rest: the Pivot tool, parenting and the pictures.`);
        else if (t) setPoseTool(t.tool);
        else if (key === "k" && viewRef.current) {
          e.preventDefault();
          setMessage(inEdit ? "Key poses are made in Pose mode (Tab): Edit mode changes the rest setup for every frame." : keyAtPlayhead(viewRef.current, e.shiftKey));
        }
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

  // Start fresh: a minimal valid rig (freshRig) cut from the sheet's art, in place of everything on this side
  const startFresh = async () => {
    const hasSource = !!documents.get(sourcePath)?.data;
    if (!confirm(`Start this ${side} rig fresh? Everything on this side is replaced by one picture (a rectangle round the sheet's first piece of art), one part holding it `
      + `and the stay loop; the sheet stays as it is.${hasSource ? ` The side's armature (${side}_rig_source.json) is deleted, which Undo does not bring back.` : ""} `
      + `Undo takes the rig back until you save.`)) return;
    if (hasSource && !(await removeArmature(true))) return;
    const sheetPixels = art?.sheets[side];
    editor.replace(freshRig(side, sheetPixels ? artBounds(sheetPixels) : null));
    setSel(NO_SELECTION);
    setHidden(new Set());
    clock.current.seek(0);
    setMessage("Started fresh: one picture, one part, the stay loop. Draw the art on the sheet, then cut and add parts. Save to keep it.");
  };

  if (loadError) return <div className="rig-page"><p className="pkm-error">{loadError}</p></div>;
  if (!doc || !rig) return <div className="rig-page"><p className="muted">Reading {path}…</p></div>;
  if (doc.data === null) return <div className="rig-page"><p className="pkm-error">{path} isn't in a layout the editor writes back; edit it as text.</p></div>;

  const view: RigView = { rig, editor, sel, select, clock: clock.current, art, sheet: art?.sheets[sheet] ? sheet : side, shiny,
                          source, sourceEditor: source ? sourceEditor : null, baked, picking, setPicking, hidden, toggleHidden, autoKey,
                          mode, gameKeys: gameKeys && !source, commit, ensureArmature, parentBone, newCurve };
  viewRef.current = view;
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
      <div className="rig-left">
      <div className="rig-upper">
      <header className="rig-head">
        <h2>Rig <span className="muted">{title}</span></h2>
        <span className="view-switch rig-mode" title="Tab switches. Edit mode sets the sprite up at rest, with no time: the pictures, the parts and their layers, each part's pivot, and which part follows which. Pose mode animates it: key poses on the timeline, curves between them, and the game's keys baked from them.">
          <button className={mode === "edit" ? "active" : ""} onClick={() => setMode("edit")}>Edit <span className="muted small">set up</span></button>
          <button className={mode === "pose" ? "active" : ""} onClick={() => setMode("pose")}>Pose <span className="muted small">animate</span></button>
        </span>
        <span className="view-switch" title="Front and back are separate rigs">
          {SIDES.map((s) => (
            <button key={s} className={s === side ? "active" : ""} onClick={() => navigate("rig", { folder, side: s, editor: "old" })}>{s === "front" ? "Front" : "Back"}{docs.get(rigPath(folder, s))?.dirty ? " •" : ""}</button>
          ))}
        </span>
        {art && Object.keys(art.sheets).length > 1 && (
          <span className="view-switch" title="A female sheet shares the rig">
            {Object.keys(art.sheets).map((s) => <button key={s} className={view.sheet === s ? "active" : ""} onClick={() => setSheet(s)}>{s.endsWith("female") ? "Female" : "Male"}</button>)}
          </span>
        )}
        <button onClick={copyFromOther} disabled={!!source} title={source ? "This side has an armature: remove it first (Armature, in the side panel) to start from a copy" : `Start this side from a copy of the ${side === "front" ? "back" : "front"} rig`}>Copy {side === "front" ? "back to front" : "front to back"}…</button>
        <button onClick={startFresh} title="Replace this side's rig with a minimal one: one picture cut round the sheet's art, one part, the stay loop (and delete its armature, if any)">Start fresh…</button>
        <button onClick={() => navigate("rig", { folder, side })} title="The new Rig Editor: pieces, bones with heads and tails, parenting, the default pose">New editor</button>
        <button onClick={() => navigate("pokemon")} title="The Pokémon Editor">Pokémon Editor</button>
        <button className={guideOpen ? "active" : ""} onClick={() => setGuideOpen(!guideOpen)} title="How rigs work: Edit and Pose mode, parenting, key poses and the baked keys, with an example">? How rigs work</button>
        <span className="spacer" />
        <SizeMeter check={check} checking={checking} rig={rig} />
        <span className={`rig-status${dirty.length ? " dirty" : ""}`}>{dirty.length ? `Unsaved: ${dirty.map((d) => d.path.split("/").pop()).join(", ")}` : "Saved"}</span>
        <button disabled={!dirty.length} onClick={revert}>Revert</button>
        <button className="primary" disabled={!dirty.length} onClick={saveAll} title="Ctrl+S: checks each changed side with the build's checks and validator, then writes it">Save</button>
      </header>
      {v2Doc?.data && <p className="rig-message bsp-warning">This side has a source from the new editor ({side}_rig_v2.json): the new editor bakes this rig from it, so changes made here are replaced the next time it edits this side. Use the New editor for it.</p>}
      {(message || doc.saveError) && <p className={`rig-message${doc.saveError || message?.includes("not saved") ? " pkm-error" : ""}`}>{doc.saveError ?? message}</p>}

      {guideOpen && <Guide onClose={() => setGuideOpen(false)} />}
      <div className="rig-main">
        <section className={`rig-card rig-preview rig-mode-${mode}`}>
          <div className="rig-card-head">
            <h3>{mode === "edit" ? "Edit mode" : "Pose mode"}</h3>
            <span className="muted small">{mode === "edit" ? "the sprite at rest: no time, nothing keyed" : "as the battle draws it"}</span>
            <span className="spacer" />
            {mode === "edit" && <ActionSwitch view={view} />}
            <span className="view-switch" title={mode === "edit" ? "Edit mode's tool" : "The gizmo on the selected part: it keys the part's pose at the playhead"}>
              {(mode === "edit" ? TOOLS.filter((t) => t.tool === "pivot") : POSE_TOOLS).map((t) => <button key={t.tool} className={tool === t.tool ? "active" : ""} title={`${t.note} (${t.key})`} onClick={() => setTool(t.tool)}>{t.label}</button>)}
            </span>
          </div>
          <div className="rig-stage">
            <Preview view={view} zoom={zoom} onion={onion} guides={guides} tool={tool} bones={showBones} onMessage={setMessage} />
          </div>
          <p className="muted ow-note">{TOOLS.find((t) => t.tool === tool)?.note} Click a part to choose it.
            {mode === "edit" ? " Edit mode changes the rest setup, so it applies to every frame of every action; nothing is keyed here. Tab goes to Pose mode." : " Tab goes to Edit mode, to move pivots or change parents."}</p>
          {mode === "pose" && <Transport view={view} />}
          {mode === "pose" && (
            <div className="rig-toggles">
              <KeyButtons view={view} onMessage={setMessage} />
              <label className="ow-check" title="A gizmo drag at a frame where no key pose begins makes one there, as Blender's auto-key does"><input type="checkbox" checked={autoKey} onChange={(e) => setAutoKey(e.target.checked)} /> Auto-key</label>
              <label className="ow-check" title="The curve a new key pose goes to the next key pose by: the in-betweens are filled in every 6 frames, as Game Freak's are">
                New key poses <select value={newCurve} onChange={(e) => setNewCurve(e.target.value as Curve)}>
                  <option value="ease_in_out">ease in and out</option><option value="linear">linear</option><option value="ease_in">ease in</option><option value="ease_out">ease out</option><option value="constant">held (no in-betweens)</option>
                </select>
              </label>
              {!source && <label className="ow-check" title="Advanced: edit the game's own held keys of a sprite with no armature, as the game stores them (no key poses, no curves). Off, the first key you set makes an armature of the sprite, which plays exactly as before until you change something."><input type="checkbox" checked={gameKeys} onChange={(e) => setGameKeys(e.target.checked)} /> Game keys</label>}
            </div>
          )}
          {mode === "pose" && gameKeys && !source && <EditingNote view={view} tool={tool} />}
          <div className="rig-toggles">
            <label className="ow-check"><input type="checkbox" checked={shiny} onChange={(e) => setShiny(e.target.checked)} /> Shiny</label>
            <label className="ow-check" title="The frames 6 before and 6 after, faded"><input type="checkbox" checked={onion} onChange={(e) => setOnion(e.target.checked)} /> Onion skin</label>
            <ClockToggles view={view} />
            <label className="ow-check"><input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} /> Feet</label>
            {source && <label className="ow-check" title="The armature's bones and their links to their parents and the root"><input type="checkbox" checked={showBones} onChange={(e) => setShowBones(e.target.checked)} /> Bones</label>}
            <span className="view-switch">
              {[2, 3, 4, 5, 6].map((z) => <button key={z} className={zoom === z ? "active" : ""} onClick={() => setZoom(z)}>{z}×</button>)}
            </span>
          </div>
        </section>

        <div className="rig-column">
          {mode === "edit" && (
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
            </section>
          )}
          <section className="rig-card rig-facts">
            <SpriteSection view={view} />
            <ChecksSection view={view} check={check} checking={checking} />
          </section>
        </div>

      </div>
      </div>

      {mode === "pose" && <section className="rig-card rig-dock" style={{ height: dockHeight }}>
        <div className="rig-dock-handle" onPointerDown={resizeDock} title="Drag to make the panel taller or shorter" />
        <div className="rig-card-head">
          <span className="view-switch" title="What the panel shows">
            {([["timeline", "Timeline"], ["graph", "Graph Editor"], ["both", "Both"]] as const).map(([v, label]) => (
              <button key={v} className={dockView === v ? "active" : ""} onClick={() => chooseDockView(v)}>{label}</button>
            ))}
          </span>
          <SequenceSwitch view={view} />
          {source && <StepControl view={view} />}
          <ActionSwitch view={view} onChosen={() => setFollow(false)} />
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
              <div className="rig-tl-legend">
                {source || !gameKeys ? (
                  <>
                    <span><span className="rig-diamond-legend" /> <b>Key poses (yours)</b> <span className="muted">you set these; the curve between two fills in the rest</span></span>
                    <span><span className="rig-block-legend" /> <b>Baked keys (what the game plays, every {source ? sequenceStep(source, Math.min(clockSequence, rig.sequences.length - 1)) : DEFAULT_STEP} frames)</b> <span className="muted">made from the key poses; read only</span></span>
                  </>
                ) : <span><span className="rig-block-legend" /> <b>Game keys (what the game plays)</b> <span className="muted">edited directly, as stored: no key poses, no curves</span></span>}
              </div>
              <Timeline view={view} scale={scale} follow={follow} />
              <p className="muted ow-note">{source
                ? "Diamonds are your key poses (drag one to move it in time, Shift: steps of 6; click to choose it); the blocks under them are the keys they bake to, as the game holds them. The Stay / Stop row is like Blender's NLA strip: each block plays one action for N frames. Drag a block's right edge to change how long that action plays (the blocks after it move along); each part's own track loops inside it at its own length."
                : (gameKeys
                  ? "Game keys: click a key to choose it; drag its right edge to change how long it's held (Shift: steps of 6 frames). Faded keys are a looping track's later passes. "
                  : "These are the game's own keys as the sprite has them. The first key pose you set makes an armature and puts key poses above them; Game keys (under the preview) edits them directly instead. ")
                  + "Drag a part's name to change the layers. The Stay / Stop row is like Blender's NLA strip: each block plays one action for N frames; drag a block's right edge to change how long that action plays, nothing else."}</p>
            </div>
          )}
          {dockView !== "timeline" && <div className="rig-dock-pane"><GraphEditor view={view} /></div>}
        </div>
      </section>}
      </div>
      <aside className="rig-side"><Inspector view={view} onMessage={setMessage} onTimeChanged={() => undefined} onRemoveArmature={() => void removeArmature()} /></aside>
    </div>
  );
}

/** Key at playhead for the chosen parts, and for every part of the pose (the pose workflow: set a key, move the parts, set a key). */
function KeyButtons({ view, onMessage }: { view: RigView; onMessage(message: string): void }) {
  return (
    <span className="rig-keybuttons">
      <button title="A key beginning at the playhead for the chosen part(s): splits the key the playhead is in, or makes one on an empty track (K)"
              onClick={() => onMessage(keyAtPlayhead(view, false))}>◇ Key at playhead <kbd>K</kbd></button>
      <button title="The same for every part of the pose shown: the pose workflow (position the parts, set a key; move the playhead, move the parts, set a key) (Shift+K)"
              onClick={() => onMessage(keyAtPlayhead(view, true))}>◆ Key all parts <kbd>⇧K</kbd></button>
    </span>
  );
}

/** Which key a gizmo drag edits, and what auto-key does. */
function EditingNote({ view, tool }: { view: RigView; tool: Tool }) {
  useClock(view.clock, (s) => `${s.sequence}|${Math.floor(s.time)}`);
  const { rig, sel, clock } = view;
  if (view.source || sel.part === null || tool === "pivot") return null;
  const c = partClock(rig, Math.min(clock.state.sequence, rig.sequences.length - 1), clock.frameTime, sel.pose, sel.part);
  if (!c) return <p className="muted ow-note rig-editing">The playhead is in another pose than the one shown: the part isn't playing here.</p>;
  const track = rig.tracks[c.track];
  const at = keyAt(track, c.local);
  const first = clock.frameTime - at.since;
  const more = selectedParts(sel).length;
  return (
    <p className="muted ow-note rig-editing">
      The gizmo edits <b>{track.name}</b> key {at.index} (frames {first}–{first + at.key.frames - 1}, picture {at.key.picture ?? 0})
      {more > 1 ? ` and the same time's key of ${more - 1} other chosen part${more > 2 ? "s" : ""}` : ""}.
      {at.since > 0 ? (view.autoKey ? ` Dragging now starts a new key at frame ${clock.frameTime} (Auto-key).` : " Auto-key is off: it changes the whole key.") : " The key begins here."}
    </p>
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

/** The action (the file's pose) being edited: the parts with their pivots and layers that the sequence's blocks show. */
function ActionSwitch({ view, onChosen }: { view: RigView; onChosen?(): void }) {
  const { rig, sel, select } = view;
  return (
    <span className="rig-actions">
      <span className="muted small" title="An action is what Blender calls a pose here: a set of parts, each with its own pivot and track. The sequence below strings actions together like the NLA: each block plays one action for N frames.">Action</span>
      <span className="view-switch">
        {rig.poses.map((_, i) => <button key={i} className={sel.pose === i ? "active" : ""} title={`Action ${i} (the file's pose ${i})`} onClick={() => { onChosen?.(); select({ pose: i, part: null, key: null, sequenceKey: null }); }}>{i}</button>)}
      </span>
    </span>
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
