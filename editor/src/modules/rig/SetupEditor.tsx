// The new Rig Editor (rig-editor-v2.md, "Built: step 2"): one side of a battle sprite as the user thinks of it, its
// source res/pokemon/<folder>/<side>_rig_v2.json (v2.ts) baked on every change into the flat <side>_rig.json the build
// packs. This step is the rig setup: the pieces cut from the sheet, the bones with their heads and tails, parenting
// connected or keeping the offset, the layers, and the default pose. A side without a _rig_v2.json opens as its flat rig
// converted (convertToV2, which bakes back to it byte for byte), in memory: the file is made by the first edit, so an
// untouched side writes nothing. Undo and redo are one history over the source and its bake (history.ts), Save checks
// the bake with the build's checks (the rig-check route) and writes both files. The first editor stays as the Advanced
// view (RigEditor.tsx, #tool/rig?...&editor=old).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type RigCheck } from "../../api.ts";
import { currentText, documents, useDocuments, useFileEpoch } from "../../documents.ts";
import { navigate } from "../../navigation.ts";
import { useToolActive } from "../active.ts";
import { fileText, getIn } from "../../../shared/json.ts";
import { artBounds, freshRectangle, plainOf, rigOf, type Phase } from "./model.ts";
import type { Art } from "./context.ts";
import { RigHistory } from "./history.ts";
import { isTyping, loadArt, store, stored } from "./RigEditor.tsx";
import { bakeV2, convertToV2, type V2 } from "./v2.ts";
import { rigSizes, RESIDENT_GUIDANCE } from "./sizes.ts";
import { copySide, defaultPoseRig, deleteBone, freshV2, restMaps } from "./setup.ts";
import { armaturePathOf, flatData, rigPathOf, v2Data, v2PathOf, v2SchemaFor, V2_LAYOUT, V2_SCHEMA_PATH, type Side } from "./setupFiles.ts";
import { NO_SETUP_SELECTION, type SetupSelection, type SetupView } from "./setupContext.ts";
import { SETUP_TOOLS, SetupPreview, type SetupTool } from "./SetupPreview.tsx";
import { PieceList, SetupSheet } from "./SetupSheet.tsx";
import { BoneSection, LayersSection, OutlinerSection, PieceSection, PoseSection, SequencesSection, SetupChecks } from "./SetupPanel.tsx";
import { SetupGuide } from "./SetupGuide.tsx";
import "./rig.css";

const SIDES: Side[] = ["front", "back"];
const TOOL_KEY = "paperwhite2.rig2.tool";
const GUIDE_KEY = "paperwhite2.rig2.guide";
const ZOOM_KEY = "paperwhite2.rig2.zoom";

export function SetupPage({ folder, side }: { folder: string; side: Side }) {
  const flatPath = rigPathOf(folder, side);
  const v2Path = v2PathOf(folder, side);
  const armPath = armaturePathOf(folder, side);
  const toolActive = useToolActive();
  const { docs } = useDocuments();
  const flatDoc = docs.get(flatPath);
  const v2Doc = docs.get(v2Path);
  const armDoc = docs.get(armPath);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [art, setArt] = useState<Art | null>(null);
  const artEpoch = useFileEpoch(`res/pokemon/${folder}/${side}.png`);
  const [sel, setSel] = useState<SetupSelection>(NO_SETUP_SELECTION);
  const [tool, setToolState] = useState<SetupTool>(() => SETUP_TOOLS.find((t) => t.tool === stored(TOOL_KEY))?.tool ?? "bones");
  const setTool = (t: SetupTool) => { setToolState(t); store(TOOL_KEY, t); };
  const [zoom, setZoomState] = useState(() => Number(stored(ZOOM_KEY)) || 4);
  const setZoom = (z: number) => { setZoomState(z); store(ZOOM_KEY, String(z)); };
  const [sheetZoom, setSheetZoom] = useState(2);
  const [sheetName, setSheetName] = useState<string>(side);
  const [shiny, setShiny] = useState(false);
  const [showBones, setShowBones] = useState(true);
  const [feet, setFeet] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [check, setCheck] = useState<RigCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [guideOpen, setGuideOpenState] = useState(() => stored(GUIDE_KEY) === "open");
  const setGuideOpen = (open: boolean) => { setGuideOpenState(open); store(GUIDE_KEY, open ? "open" : "closed"); };

  // One history for the page over the source and its bake (history.ts): the source made by the first edit is part of
  // that edit's step, so undoing it takes the file away again (hidden, for redo) and gives the flat rig back
  const stashed = useRef<ReturnType<typeof documents.stash>>(undefined);
  const v2PathRef = useRef(v2Path);
  v2PathRef.current = v2Path;
  const history = useRef<RigHistory>(null as unknown as RigHistory);
  if (!history.current) {
    history.current = new RigHistory({
      canUndo: (p) => documents.canUndo(p), canRedo: (p) => documents.canRedo(p),
      undo: (p) => documents.undo(p), redo: (p) => documents.redo(p),
      restore: (p, data) => documents.amend(p, [], data),
    }, (hidden) => {
      if (hidden) stashed.current = documents.stash(v2PathRef.current);
      else if (stashed.current) { documents.restore(stashed.current); stashed.current = undefined; }
    });
  }

  useEffect(() => {
    let live = true;
    documents.hold(flatPath).then(() => live && setLoadError(null), (e: Error) => live && setLoadError(e.message));
    // (no source yet: the side opens converted; no armature: the usual)
    documents.hold(v2Path).catch(() => undefined);
    documents.hold(armPath).catch(() => undefined);
    for (const s of SIDES) if (s !== side) {
      documents.hold(rigPathOf(folder, s)).catch(() => undefined);
      documents.hold(v2PathOf(folder, s)).catch(() => undefined);
    }
    return () => { live = false; };
  }, [flatPath, v2Path, armPath, folder, side]);
  useEffect(() => {
    let live = true;
    loadArt(folder, side).then((a) => live && setArt(a), (e: Error) => live && setLoadError(e.message));
    return () => { live = false; };
  }, [folder, side, artEpoch]);

  const flat = flatDoc?.data ?? null;
  const flatRig = useMemo(() => (flat ? rigOf(flat) : null), [flat]);
  const sourceJson = v2Doc?.data ?? null;
  // The side as a source: its file's, or its flat rig converted (only while it has no file, so the bake kept in the flat
  // rig's document can't feed back into it)
  const converted = useMemo(() => {
    if (sourceJson || !flatRig) return null;
    try {
      return convertToV2(flatRig);
    } catch (e) {
      return e as Error;
    }
  }, [sourceJson, flatRig]);
  const src = useMemo<V2 | null>(() => (sourceJson ? (plainOf(sourceJson) as V2) : converted instanceof Error ? null : converted), [sourceJson, converted]);
  const readOnly = !!armDoc?.data && !sourceJson;
  const baked = useMemo(() => {
    if (!src) return null;
    try {
      return { baked: bakeV2(src), error: null };
    } catch (e) {
      return { baked: null, error: (e as Error).message };
    }
  }, [src]);
  const maps = useMemo(() => (src ? restMaps(src) : []), [src]);
  const preview = useMemo(() => (src ? defaultPoseRig(src) : null), [src]);
  const srcRef = useRef(src);
  srcRef.current = src;

  // The bake kept in the flat rig's document (no step of its own), so the checks, the size, Save and the Build button
  // see what the game will get
  useEffect(() => {
    const d = documents.get(flatPath);
    if (!sourceJson || !baked?.baked || !d?.data || !d.layout) return;
    const next = flatData(baked.baked.rig, d.data);
    if (fileText(next, d.layout) !== currentText(d)) documents.amend(flatPath, [], next);
  }, [baked, flatPath, sourceJson]);

  // The build's checks of the flat rig as it is now, a moment after each change
  const text = flatDoc ? currentText(flatDoc) : null;
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

  /** The source changed: one step (a drag's later moves amend it). The first edit of a side with no file makes it. */
  const commit = useCallback((next: V2, phase: Phase = "typed") => {
    if (phase === "end") return;
    const f = documents.get(flatPath);
    if (!documents.get(v2Path)?.data) {
      const start = srcRef.current;
      if (!f?.data || !start) return;
      stashed.current = undefined;
      history.current.created({ source: v2Path, flat: flatPath, flatData: f.data }, true);
      documents.create(v2Path, V2_SCHEMA_PATH, v2Data(start, v2SchemaFor(f.data)), V2_LAYOUT);
    }
    const doc = documents.get(v2Path)!;
    const data = v2Data(next, getIn(doc.data!, ["$schema"]) ?? v2SchemaFor(f?.data ?? null));
    if (phase === "move") documents.amend(v2Path, [], data);
    else documents.replace(v2Path, data);
    history.current.note([v2Path], phase);
  }, [flatPath, v2Path]);

  const select = useCallback((next: Partial<SetupSelection>) => setSel((s) => ({ ...s, ...next })), []);

  const sideDocs = SIDES.flatMap((s) => [rigPathOf(folder, s), v2PathOf(folder, s)]).map((p) => docs.get(p)).filter((d) => d !== undefined);
  const dirty = sideDocs.filter((d) => d.dirty);
  const saveAll = useCallback(async () => {
    const out: string[] = [];
    for (const s of SIDES) {
      const fp = rigPathOf(folder, s), vp = v2PathOf(folder, s);
      const f = documents.get(fp), v = documents.get(vp);
      if (!f?.dirty && !v?.dirty) continue;
      if (f) {
        const result = await api.rigCheck(currentText(f));
        if (result.errors.length) {
          out.push(`The ${s} isn't saved: ${result.errors[0]}${result.errors.length > 1 ? ` (and ${result.errors.length - 1} more)` : ""}`);
          continue;
        }
      }
      let ok = true;
      if (f?.dirty) {
        ok = await documents.save(fp);
        out.push(ok ? `Saved ${s}_rig.json.` : `${s}_rig.json not saved: ${documents.get(fp)?.saveError}`);
      }
      // The source after the rig it bakes to, and only with it
      if (v?.dirty) {
        if (!ok) out.push(`${s}_rig_v2.json not saved with it.`);
        else out.push((await documents.save(vp)) ? `Saved ${s}_rig_v2.json.` : `${s}_rig_v2.json not saved: ${documents.get(vp)?.saveError}`);
      }
    }
    setMessage(out.join(" ") || "Nothing to save.");
  }, [folder]);
  const revert = async () => {
    if (!dirty.length || !confirm(`Throw away the changes to ${dirty.map((d) => d.path.split("/").slice(-2).join("/")).join(" and ")}?`)) return;
    for (const d of dirty) await documents.reload(d.path);
    history.current.clear();
    stashed.current = undefined;
    setSel(NO_SETUP_SELECTION);
  };

  const startFresh = async () => {
    const hasArmature = !!documents.get(armPath)?.data;
    if (!confirm(`Start this ${side} rig fresh? Everything on this side is replaced by one piece (a rectangle round the sheet's first art) and one bone showing it, `
      + `with one sequence holding the default pose; the sheet stays as it is.${hasArmature ? ` The side's first-editor armature (${side}_rig_source.json) is deleted, which Undo does not bring back.` : ""} `
      + `Undo takes the rig back until you save.`)) return;
    if (hasArmature) {
      const d = documents.get(armPath)!;
      if (d.savedText) {
        try {
          await api.removeFile(armPath);
        } catch (e) {
          setMessage(`Couldn't delete ${side}_rig_source.json, so nothing changed: ${(e as Error).message}`);
          return;
        }
      }
      await documents.reload(armPath);
      history.current.forget(armPath);
    }
    const pixels = art?.sheets[side];
    const { sheet, size } = freshRectangle(pixels ? artBounds(pixels) : null);
    commit(freshV2(side, sheet, size));
    setSel({ bones: [0], piece: 0, rectangle: 0 });
    setMessage("Started fresh: one piece and one bone. Resize the piece on the sheet (or draw more), give each a bone, and parent them. Save to keep it.");
  };

  const copyFront = async () => {
    let front: V2 | null = null;
    try {
      const d = await documents.hold(v2PathOf(folder, "front"));
      if (d.data) front = plainOf(d.data) as V2;
    } catch { /* (the front has no source: its flat rig converted) */ }
    if (!front) {
      try {
        const d = await documents.hold(rigPathOf(folder, "front"));
        if (d.data) front = convertToV2(rigOf(d.data));
      } catch (e) {
        setMessage(`Couldn't read the front: ${(e as Error).message}`);
        return;
      }
    }
    if (!front || !src) return;
    if (!confirm("Replace this back rig with a copy of the front's (its pieces, bones, parents, layers, default pose and sequences)? The pieces will cut the back sheet where the front's are, so draw the back art there or move them. Undo takes it back.")) return;
    commit({ ...copySide(front, "back"), box: src.box, stop_flags: src.stop_flags });
    setSel(NO_SETUP_SELECTION);
    setMessage("Copied the front's rig to the back. Save to keep it.");
  };

  // Keys while the page is shown
  const latest = useRef({ saveAll, sel, src, commit, readOnly });
  latest.current = { saveAll, sel, src, commit, readOnly };
  useEffect(() => {
    if (!toolActive) return;
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (key === "s") {
          e.preventDefault();
          e.stopPropagation();
          void latest.current.saveAll();
        } else if ((key === "z" || key === "y") && !isTyping(e.target, true)) {
          e.preventDefault();
          e.stopPropagation();
          const others = [v2PathRef.current, flatPath];
          if (key === "y" || e.shiftKey) history.current.redo(others);
          else history.current.undo(others);
        }
        return;
      }
      if (isTyping(e.target) || e.altKey) return;
      const t = SETUP_TOOLS.find((x) => x.key.toLowerCase() === key);
      if (t) { setTool(t.tool); return; }
      const { sel: s, src: cur, readOnly: ro } = latest.current;
      if ((key === "delete" || key === "x") && s.bones.length && cur && !ro) {
        e.preventDefault();
        let next = cur;
        for (const b of [...s.bones].sort((a, b) => b - a)) next = deleteBone(next, b);
        latest.current.commit(next);
        setSel((x) => ({ ...x, bones: [] }));
        setMessage(`Deleted ${s.bones.map((b) => cur.bones[b]?.name).join(", ")} (Ctrl+Z brings ${s.bones.length > 1 ? "them" : "it"} back).`);
      } else if (key === "escape") setSel((x) => ({ ...x, bones: [] }));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [toolActive, flatPath]);

  if (loadError) return <div className="rig-page"><p className="pkm-error">{loadError}</p></div>;
  if (!flatDoc || (!src && !(converted instanceof Error))) return <div className="rig-page"><p className="muted">Reading {flatPath}…</p></div>;
  if (!src) return <div className="rig-page"><p className="pkm-error">This side's rig couldn't be opened in the new editor: {(converted as Error).message}. The Advanced editor still edits it.</p>
    <button onClick={() => navigate("rig", { folder, side, editor: "old" })}>Advanced (old editor)</button></div>;

  const sheet = art?.sheets[sheetName] ? sheetName : side;
  const view: SetupView = { src, maps, preview: preview?.baked ?? null, art, sheet, shiny, sel, select, commit, say: setMessage, readOnly };
  const sizes = baked?.baked ? rigSizes(baked.baked.rig) : null;
  const share = sizes ? sizes.resident / RESIDENT_GUIDANCE : 0;
  const title = folder.split("/").map((s) => s.replace(/_/g, " ")).join(" · ");
  const toolNote = SETUP_TOOLS.find((t) => t.tool === tool)?.note;
  const warnings = [...(baked?.error ? [`The rig can't be baked: ${baked.error}`] : []), ...(baked?.baked?.warnings ?? []), ...(preview?.error ? [preview.error] : [])];

  return (
    <div className="rig-page rig-docked rig-setup">
      <div className="rig-left">
        <div className="rig-upper">
          <header className="rig-head">
            <h2>Rig <span className="muted">{title}</span></h2>
            <span className="view-switch rig-mode" title="What the editor edits: the rig setup now; sequences come in the next step">
              <button className="active">Rig setup <span className="muted small">pieces, bones, default pose</span></button>
              <button disabled title="Sequences (Idle, Hop, ...) and their keyframes: the next step">Sequences <span className="muted small">soon</span></button>
            </span>
            <span className="view-switch" title="Front and back are separate rigs">
              {SIDES.map((s) => (
                <button key={s} className={s === side ? "active" : ""} onClick={() => navigate("rig", { folder, side: s })}>
                  {s === "front" ? "Front" : "Back"}{docs.get(rigPathOf(folder, s))?.dirty || docs.get(v2PathOf(folder, s))?.dirty ? " •" : ""}
                </button>
              ))}
            </span>
            {art && Object.keys(art.sheets).length > 1 && (
              <span className="view-switch" title="A female sheet shares the rig">
                {Object.keys(art.sheets).map((s) => <button key={s} className={sheet === s ? "active" : ""} onClick={() => setSheetName(s)}>{s.endsWith("female") ? "Female" : "Male"}</button>)}
              </span>
            )}
            <span className="spacer" />
            <span className="rig-size" title={sizes ? `The five files the build writes for this side stay in memory while it's shown: ${sizes.resident} bytes. The originals' largest side is about 30 KB; ~40 KB is measured safe on every screen.` : "The rig can't be baked"}>
              <span className={`rig-size-bar ${share > 1 ? "over" : share > 0.8 ? "near" : "ok"}`}><span style={{ width: `${Math.min(share, 1) * 100}%` }} /></span>
              <span className={share > 1 ? "pkm-error" : "muted"}>{sizes ? `${(sizes.resident / 1024).toFixed(1)} KB of ~40 KB` : "—"}</span>
            </span>
            <span className={`rig-status${dirty.length ? " dirty" : ""}`}>{dirty.length ? `Unsaved: ${dirty.map((d) => d.path.split("/").pop()).join(", ")}` : "Saved"}</span>
            <button disabled={!dirty.length} onClick={revert}>Revert</button>
            <button className="primary" disabled={!dirty.length} onClick={saveAll} title="Ctrl+S: checks the baked rig with the build's checks, then writes it and its source">Save</button>
          </header>
          <div className="rig-head rig-head-actions">
            <span className="muted small">This side</span>
            <button onClick={copyFront} disabled={side !== "back" || readOnly} title={side === "back" ? "Start the back from a copy of the front's rig" : "Open the back to copy the front onto it"}>Copy front to back…</button>
            <button onClick={startFresh} title="Replace this side's rig with one piece and one bone (and delete a first-editor armature, if it has one)">Start fresh…</button>
            <span className="muted small rig-head-gap">Other views</span>
            <button onClick={() => navigate("rig", { folder, side, editor: "old" })} title="The first Rig Editor: the game's poses, tracks and keys as stored, and its own armatures">Advanced (old editor)</button>
            <button onClick={() => navigate("pokemon")} title="The Pokémon Editor">Pokémon Editor</button>
            <button className={guideOpen ? "active" : ""} onClick={() => setGuideOpen(!guideOpen)} title="How rigs work: pieces, bones, parenting and the default pose">? How rigs work</button>
          </div>
          {(message || flatDoc.saveError || v2Doc?.saveError) && (
            <p className={`rig-message${flatDoc.saveError || v2Doc?.saveError || message?.includes("not saved") || message?.includes("isn't saved") ? " pkm-error" : ""}`}>
              {flatDoc.saveError ?? v2Doc?.saveError ?? message}
            </p>
          )}
          {guideOpen && <SetupGuide onClose={() => setGuideOpen(false)} />}
          {readOnly && (
            <section className="rig-card rig-notice">
              <h3>This side has a first-editor armature</h3>
              <p className="muted">{side}_rig_source.json is the first Rig Editor's armature, which the new editor doesn't open yet (a later step converts them).
                Edit it in the Advanced editor, or start this side fresh in the new one, which deletes the armature.</p>
              <div className="rig-head">
                <button onClick={() => navigate("rig", { folder, side, editor: "old" })}>Open in the Advanced editor</button>
                <button onClick={startFresh}>Start fresh…</button>
              </div>
            </section>
          )}
          <div className="rig-main">
            <section className="rig-card rig-preview">
              <div className="rig-card-head">
                <h3>Default pose</h3>
                <span className="muted small">the rig setup: where every sequence starts and ends</span>
                <span className="spacer" />
                <span className="view-switch" title="The preview's tool">
                  {SETUP_TOOLS.map((t) => <button key={t.tool} className={tool === t.tool ? "active" : ""} title={`${t.note} (${t.key})`} onClick={() => setTool(t.tool)}>{t.label} <kbd>{t.key}</kbd></button>)}
                </span>
              </div>
              <div className="rig-stage">
                <SetupPreview view={view} zoom={zoom} tool={tool} showBones={showBones} feet={feet} />
              </div>
              <p className="muted ow-note">{toolNote} Click a bone or a picture to choose it (Shift or Ctrl: one more); Delete deletes the chosen bones.</p>
              <div className="rig-toggles">
                <label className="ow-check"><input type="checkbox" checked={showBones} onChange={(e) => setShowBones(e.target.checked)} /> Bones</label>
                <label className="ow-check"><input type="checkbox" checked={feet} onChange={(e) => setFeet(e.target.checked)} /> Feet</label>
                <label className="ow-check"><input type="checkbox" checked={shiny} onChange={(e) => setShiny(e.target.checked)} /> Shiny</label>
                <span className="view-switch">
                  {[2, 3, 4, 5, 6].map((z) => <button key={z} className={zoom === z ? "active" : ""} onClick={() => setZoom(z)}>{z}×</button>)}
                </span>
              </div>
            </section>
            <div className="rig-column">
              <section className="rig-card rig-sheet">
                <div className="rig-card-head">
                  <h3>Pieces</h3>
                  <span className="muted small">{sheet}.png, 256×128 · {src.pieces.length} piece{src.pieces.length === 1 ? "" : "s"}</span>
                  <span className="spacer" />
                  <span className="view-switch">
                    {[2, 3].map((z) => <button key={z} className={sheetZoom === z ? "active" : ""} onClick={() => setSheetZoom(z)}>{z}×</button>)}
                  </span>
                </div>
                <div className="rig-sheet-scroll"><SetupSheet view={view} zoom={sheetZoom} /></div>
                <p className="muted ow-note">Drag on the sheet to cut a new piece (Shift: the chosen piece's second rectangle). Drag a rectangle to move it, an edge
                  or corner to resize it: whole tiles (Alt: single pixels), and sizes the DS can draw. The chosen piece is yellow; the chosen bone's pieces in colour.</p>
                <PieceList view={view} />
              </section>
            </div>
          </div>
        </div>
      </div>
      <aside className="rig-side rig-inspector">
        <OutlinerSection view={view} />
        <BoneSection view={view} />
        <PoseSection view={view} />
        <LayersSection view={view} />
        <PieceSection view={view} />
        <SequencesSection view={view} />
        <SetupChecks view={view} check={check} checking={checking} warnings={warnings} />
      </aside>
    </div>
  );
}
