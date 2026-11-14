// The new Rig Editor (rig-editor-v2.md, "Built: step 2"): one side of a battle sprite as the user thinks of it, its
// source res/pokemon/<folder>/<side>_rig_v2.json (v2.ts) baked on every change into the flat <side>_rig.json the build
// packs. This step is the rig setup: the pieces cut from the sheet, the bones with their heads and tails, parenting
// connected or keeping the offset, the layers, and the default pose. A side without a _rig_v2.json opens as its flat rig
// converted (convertToV2, which bakes back to it byte for byte), in memory: the file is made by the first edit, so an
// untouched side writes nothing. Undo and redo are one history over the source and its bake (history.ts), Save checks
// the bake with the build's checks (the rig-check route) and writes both files. The first editor stays as the Advanced
// view (RigEditor.tsx, #tool/rig?...&editor=old).
//
// Sequences mode ("Built: step 3"): the sequences list, the open sequence's preview (the bake playing it, sequences.ts
// sequenceRig, on the clock of player.ts), its timeline and graph editor docked at the bottom (SequenceTimeline.tsx,
// SequenceGraph.tsx), the chosen part at the playhead (SequencePanel.tsx); keys snap to 6 (Snap 6, Alt bypasses), the
// gizmos, K and Shift+K key at the playhead (never while playing: it pauses), Delete deletes the chosen keys.

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
import { copySide, defaultPoseRig, deleteBone, freshV2, restMaps, setDefault } from "./setup.ts";
import { armaturePathOf, flatData, rigPathOf, v2Data, v2PathOf, v2SchemaFor, V2_LAYOUT, V2_SCHEMA_PATH, type Side } from "./setupFiles.ts";
import { NO_SETUP_SELECTION, type PoseEdit, type SequenceView, type SetupSelection, type SetupView } from "./setupContext.ts";
import { SETUP_TOOLS, SetupPreview, type SetupTool } from "./SetupPreview.tsx";
import { PieceList, SetupSheet } from "./SetupSheet.tsx";
import { BoneSection, LayersSection, OutlinerSection, PieceSection, PoseSection, SequencesSection, SetupChecks } from "./SetupPanel.tsx";
import { SetupGuide } from "./SetupGuide.tsx";
import { Clock } from "./player.ts";
import { useClock } from "./context.ts";
import { copyKeys, deleteKeys, keyFrameOf, keyParts, lastFrame, liveRefs, pasteKeys, pauseForKeying, posedMaps, refId, refOf, sequenceBones, sequenceRig,
         setKeyAt, type CopiedKeys } from "./sequences.ts";
import { SequenceTimeline } from "./SequenceTimeline.tsx";
import { SequenceGraph } from "./SequenceGraph.tsx";
import { KeySection, SequenceListSection, SequenceSection } from "./SequencePanel.tsx";
import { cantDeleteClip, clipAt, clipsOf, deleteClip, keepsMovingOf, stripFrames } from "./timeline.ts";
import { StripTimeline } from "./StripTimeline.tsx";
import { StripPreview } from "./StripPreview.tsx";
import { ClipSection, PauseSection, StripSequencesSection } from "./StripPanel.tsx";
import "./rig.css";

const SIDES: Side[] = ["front", "back"];
const TOOL_KEY = "paperwhite2.rig2.tool";
const GUIDE_KEY = "paperwhite2.rig2.guide";
const ZOOM_KEY = "paperwhite2.rig2.zoom";
const MODE_KEY = "paperwhite2.rig2.mode";
const SNAP_KEY = "paperwhite2.rig2.snap";
const DOCK_KEY = "paperwhite2.rig2.dockHeight";
const DOCK_VIEW_KEY = "paperwhite2.rig2.dockView";
const SCALE_KEY = "paperwhite2.rig2.timelineScale";
const STRIP_SCALE_KEY = "paperwhite2.rig2.stripScale";
const BATTLE_PAUSES_KEY = "paperwhite2.rig2.battlePauses";
type Mode = "setup" | "sequences" | "timeline";
const MODES: Mode[] = ["setup", "sequences", "timeline"];
type DockView = "timeline" | "graph" | "both";
/** The tools of Sequences mode: the gizmos, which key the chosen parts at the playhead. */
const SEQUENCE_TOOLS = SETUP_TOOLS.filter((t) => t.tool !== "bones").map((t) => ({
  ...t, note: t.tool === "move" ? "Drag to move the chosen parts: it keys them at the playhead (a connected bone turns and scales only)."
    : t.tool === "rotate" ? "Drag round the chosen part's head to turn the chosen parts: it keys them at the playhead (Shift: 5° steps)."
    : "Drag the red X handle to scale across only, the green Y handle up and down only, the ring for both: it keys the chosen parts at the playhead.",
}));

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
  // Sequences mode: the open sequence, the preview's clock, the snap, the dock
  const [mode, setModeState] = useState<Mode>(() => (MODES.find((m) => m === stored(MODE_KEY)) ?? "setup"));
  const setMode = (m: Mode) => { setModeState(m); store(MODE_KEY, m); setMessage(null); };
  const [open, setOpenState] = useState(0);
  const [snap, setSnapState] = useState(() => stored(SNAP_KEY) !== "off");
  const setSnap = (on: boolean) => { setSnapState(on); store(SNAP_KEY, on ? "on" : "off"); };
  const [onion, setOnion] = useState(false);
  const [dockHeight, setDockHeight] = useState(() => Number(stored(DOCK_KEY)) || 360);
  const [dockView, setDockViewState] = useState<DockView>(() => (["timeline", "graph", "both"].includes(stored(DOCK_VIEW_KEY) ?? "") ? stored(DOCK_VIEW_KEY) as DockView : "timeline"));
  const setDockView = (v: DockView) => { setDockViewState(v); store(DOCK_VIEW_KEY, v); };
  const [scale, setScaleState] = useState(() => Number(stored(SCALE_KEY)) || 8);
  const setScale = (n: number) => { setScaleState(n); store(SCALE_KEY, String(n)); };
  const [copied, setCopied] = useState<CopiedKeys | null>(null);
  const clockRef = useRef<Clock>(null as unknown as Clock);
  if (!clockRef.current) clockRef.current = new Clock();
  const clock = clockRef.current;
  const keyFrame = useClock(clock, (st) => keyFrameOf(st.time, snap));
  const playing = useClock(clock, (st) => st.playing);
  // Timeline mode: the strip's own clock (the whole of sequence 0, with the battle's pauses), the chosen clip
  const stripClockRef = useRef<Clock>(null as unknown as Clock);
  if (!stripClockRef.current) stripClockRef.current = new Clock();
  const stripClock = stripClockRef.current;
  const [clip, setClip] = useState<number | null>(null);
  const [stripScale, setStripScaleState] = useState(() => Number(stored(STRIP_SCALE_KEY)) || 3);
  const setStripScale = (n: number) => { setStripScaleState(n); store(STRIP_SCALE_KEY, String(n)); };
  const [battlePauses, setBattlePausesState] = useState(() => stored(BATTLE_PAUSES_KEY) === "on");
  const setBattlePauses = (on: boolean) => { setBattlePausesState(on); store(BATTLE_PAUSES_KEY, on ? "on" : "off"); };
  stripClock.pauses = battlePauses;

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
  const sequencing = mode === "sequences" && !!src && src.sequences.length > 0;
  const openSeq = src ? Math.min(open, Math.max(0, src.sequences.length - 1)) : 0;
  const seqFrames = src?.sequences[openSeq]?.frames ?? 6;
  const maps = useMemo(() => (src ? (sequencing ? posedMaps(src, openSeq, keyFrame) : restMaps(src)) : []), [src, sequencing, openSeq, keyFrame]);
  const preview = useMemo(() => (src ? defaultPoseRig(src) : null), [src]);
  const srcRef = useRef(src);
  srcRef.current = src;

  // The preview of the open sequence: the side's bake with one strip playing it, looping at the game's speed
  const seqRig = useMemo(() => (sequencing && baked?.baked ? sequenceRig(baked.baked.rig, openSeq, seqFrames) : null), [sequencing, baked, openSeq, seqFrames]);
  useEffect(() => {
    if (seqRig) clock.setRig(seqRig);
  }, [seqRig, clock]);
  useEffect(() => {
    if (!sequencing || !toolActive) return;
    if (clock.state.playing) clock.start();
    return () => clock.stop();
  }, [sequencing, clock, toolActive]);
  // The playhead kept inside the open sequence's loop (the clock counts on)
  useEffect(() => {
    if (!sequencing) return;
    const wrap = () => {
      const t = clock.state.time;
      if (t >= seqFrames) clock.seek(t % seqFrames);
    };
    wrap();
    return clock.subscribe(wrap);
  }, [sequencing, clock, seqFrames]);
  const openSequence = useCallback((s: number) => {
    setOpenState(s);
    clock.seek(0);
    setSel((x) => ({ ...x, keys: [] }));
  }, [clock]);

  // The strip's preview: the side's bake itself (its sequence 0 is the timeline as the battle plays it), looping
  const stripping = mode === "timeline" && !!src && src.sequences.length > 0;
  const stripRig = stripping ? baked?.baked?.rig ?? null : null;
  const total = src ? stripFrames(src) : 0;
  useEffect(() => {
    if (stripRig) stripClock.setRig(stripRig);
  }, [stripRig, stripClock]);
  useEffect(() => {
    if (!stripping || !toolActive) return;
    if (stripClock.state.playing) stripClock.start();
    return () => stripClock.stop();
  }, [stripping, stripClock, toolActive]);
  useEffect(() => {
    if (!stripping || !total) return;
    const wrap = () => {
      const st = stripClock.state;
      if (!st.pause && st.sequence === 0 && st.time >= total) stripClock.seek(st.time % total);
    };
    wrap();
    return stripClock.subscribe(wrap);
  }, [stripping, stripClock, total]);
  /** A clip's sequence opened for editing: Sequences mode. */
  const editSequence = useCallback((s: number) => {
    setModeState("sequences");
    store(MODE_KEY, "sequences");
    openSequence(s);
  }, [openSequence]);
  /** Keys are never made while the preview plays: it pauses on the frame they go to. */
  const keying = useCallback(() => pauseForKeying(clock, snap), [clock, snap]);
  const pose = useMemo<PoseEdit>(() => (sequencing
    ? (s0, b, change) => setKeyAt(s0, openSeq, b, keyFrame, (now) => change(now))
    : (s0, b, change) => setDefault(s0, b, (t) => {
      const { piece: _p, hidden: _h, ...c } = change(t);
      return { ...t, ...c };
    })), [sequencing, openSeq, keyFrame]);

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
    setSel({ bones: [0], piece: 0, rectangle: 0, keys: [] });
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
  const latest = useRef({ saveAll, sel, src, commit, readOnly, sequencing, openSeq, keying, copied, snap, seqFrames, stripping, clip, total });
  latest.current = { saveAll, sel, src, commit, readOnly, sequencing, openSeq, keying, copied, snap, seqFrames, stripping, clip, total };
  useEffect(() => {
    if (!toolActive) return;
    /** Timeline mode's keys: Space, the arrows (by 6), Home, Delete for the chosen clip, Escape. */
    const stripKey = (e: KeyboardEvent, key: string): boolean => {
      const l = latest.current;
      if (!l.stripping || !l.src || e.ctrlKey || e.metaKey || isTyping(e.target)) return false;
      if (key === " ") { stripClock.play(); return true; }
      if (key === "arrowleft" || key === "arrowright") {
        const last = Math.max(0, l.total - 1);
        const t = Math.floor(stripClock.state.time) + (key === "arrowleft" ? -6 : 6);
        stripClock.step(0);
        stripClock.seek(t < 0 ? Math.floor(last / 6) * 6 : t > last ? 0 : t, 0);
        return true;
      }
      if (key === "home") { stripClock.play(false); stripClock.seek(0, 0); return true; }
      if ((key === "delete" || key === "backspace" || key === "x") && !l.readOnly) {
        if (l.clip === null) { setMessage("Choose a clip on the timeline to delete it."); return true; }
        const why = cantDeleteClip(l.src, l.clip);
        if (why) { setMessage(why); return true; }
        l.commit(deleteClip(l.src, l.clip));
        setClip(null);
        setMessage("Deleted the clip (Ctrl+Z brings it back).");
        return true;
      }
      if (key === "escape") { setClip(null); setSel((x) => ({ ...x, bones: [] })); return true; }
      return false;
    };
    /** Sequences mode's keys: K and Shift+K, Delete for the chosen keys, Ctrl+C and Ctrl+V, Space, the arrows. */
    const sequenceKey = (e: KeyboardEvent, key: string): boolean => {
      const l = latest.current;
      const cur = l.src;
      if (!l.sequencing || !cur) return false;
      const s = l.openSeq;
      const refs = liveRefs(cur, s, l.sel.keys.map(refOf));
      if (e.ctrlKey || e.metaKey) {
        if (key === "c" && refs.length && !isTyping(e.target)) {
          setCopied(copyKeys(cur, s, refs));
          setMessage(`Copied ${refs.length} key${refs.length > 1 ? "s" : ""}: Ctrl+V pastes them at the playhead.`);
          return true;
        }
        if (key === "v" && l.copied?.keys.length && !isTyping(e.target) && !l.readOnly) {
          const at = l.keying();
          const r = pasteKeys(cur, s, l.copied, at);
          l.commit(r.src);
          setSel((x) => ({ ...x, keys: r.refs.map(refId) }));
          setMessage(`Pasted ${r.refs.length} key${r.refs.length > 1 ? "s" : ""} at frame ${at}.`);
          return true;
        }
        return false;
      }
      if (isTyping(e.target)) return false;
      if (key === "k" && !l.readOnly) {
        const at = l.keying();
        const bones = e.shiftKey ? sequenceBones(cur, s) : l.sel.bones;
        if (!bones.length) { setMessage("Choose a part to key (or Shift+K for every part)."); return true; }
        const r = keyParts(cur, s, bones, at);
        l.commit(r.src);
        setMessage(r.made ? `Keyed ${e.shiftKey ? "every part" : bones.map((b) => cur.bones[b].name).join(", ")} at frame ${at}.` : `Already keyed at frame ${at}.`);
        return true;
      }
      if ((key === "delete" || key === "x" || key === "backspace") && !l.readOnly) {
        if (!refs.length) { setMessage("Choose keys to delete (click, Shift-click, or drag a box on the timeline)."); return true; }
        const r = deleteKeys(cur, s, refs);
        if (r.deleted) l.commit(r.src);
        setSel((x) => ({ ...x, keys: [] }));
        setMessage(r.deleted ? `Deleted ${r.deleted} key${r.deleted > 1 ? "s" : ""} (Ctrl+Z brings ${r.deleted > 1 ? "them" : "it"} back).` : "The start and end keys are the default pose: they can't be deleted.");
        return true;
      }
      if (key === " ") { clock.play(); return true; }
      if (key === "arrowleft" || key === "arrowright") {
        const by = (key === "arrowleft" ? -1 : 1) * (l.snap && !e.altKey ? 6 : 1);
        const last = lastFrame(l.seqFrames, l.snap && !e.altKey);
        const t = Math.floor(clock.state.time) + by;
        clock.step(0);
        clock.seek(t < 0 ? last : t > last ? 0 : t);
        return true;
      }
      if (key === "home") { clock.play(false); clock.seek(0); return true; }
      if (key === "escape") { setSel((x) => ({ ...x, keys: [], bones: [] })); return true; }
      return false;
    };
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!e.altKey && (sequenceKey(e, key) || stripKey(e, key))) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
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
      const t = (latest.current.sequencing ? SEQUENCE_TOOLS : SETUP_TOOLS).find((x) => x.key.toLowerCase() === key);
      if (t) { setTool(t.tool); return; }
      if (latest.current.sequencing || latest.current.stripping) return;
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
  }, [toolActive, flatPath, clock, stripClock]);

  if (loadError) return <div className="rig-page"><p className="pkm-error">{loadError}</p></div>;
  if (!flatDoc || (!src && !(converted instanceof Error))) return <div className="rig-page"><p className="muted">Reading {flatPath}…</p></div>;
  if (!src) return <div className="rig-page"><p className="pkm-error">This side's rig couldn't be opened in the new editor: {(converted as Error).message}. The Advanced editor still edits it.</p>
    <button onClick={() => navigate("rig", { folder, side, editor: "old" })}>Advanced (old editor)</button></div>;

  const sheet = art?.sheets[sheetName] ? sheetName : side;
  const seqView: SequenceView | undefined = sequencing ? { sequence: openSeq, rig: seqRig, clock, keyFrame, snap, onion, keying } : undefined;
  const liveSel = sequencing ? { ...sel, keys: liveRefs(src, openSeq, sel.keys.map(refOf)).map(refId) } : sel;
  const view: SetupView = { src, maps, preview: preview?.baked ?? null, art, sheet, shiny, sel: liveSel, select, commit, say: setMessage, readOnly, seq: seqView, pose, copied };
  const shownTool: SetupTool = sequencing && tool === "bones" ? "move" : tool;
  const tools = sequencing ? SEQUENCE_TOOLS : SETUP_TOOLS;
  const sizes = baked?.baked ? rigSizes(baked.baked.rig) : null;
  const share = sizes ? sizes.resident / RESIDENT_GUIDANCE : 0;
  const title = folder.split("/").map((s) => s.replace(/_/g, " ")).join(" · ");
  const toolNote = tools.find((t) => t.tool === shownTool)?.note;
  const openName = src.sequences[openSeq]?.name ?? "";
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
  const warnings = [...(baked?.error ? [`The rig can't be baked: ${baked.error}`] : []), ...(baked?.baked?.warnings ?? []), ...(preview?.error ? [preview.error] : [])];

  return (
    <div className={`rig-page rig-docked rig-setup${sequencing || stripping ? " rig-sequences" : ""}`}>
      <div className="rig-left">
        <div className="rig-upper">
          <header className="rig-head">
            <h2>Rig <span className="muted">{title}</span></h2>
            <span className="view-switch rig-mode" title="What the editor edits: the rig setup (pieces, bones, the default pose), or the sequences (Idle, Hop, ...) and their keyframes">
              <button className={mode === "setup" ? "active" : ""} onClick={() => setMode("setup")}>Rig setup <span className="muted small">pieces, bones, default pose</span></button>
              <button className={mode === "sequences" ? "active" : ""} onClick={() => setMode("sequences")}>Sequences <span className="muted small">keyframes</span></button>
              <button className={mode === "timeline" ? "active" : ""} onClick={() => setMode("timeline")} title="The loop the battle plays: sequences laid out as clips, and the battle's pause">Timeline <span className="muted small">what the battle plays</span></button>
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
          {sequencing ? (
            <div className="rig-main rig-main-sequence">
              <section className="rig-card rig-preview">
                <div className="rig-card-head">
                  <h3>{openName}</h3>
                  <span className="muted small">{seqFrames} frames, looping at the game's speed: what the battle plays</span>
                  <span className="spacer" />
                  <span className="view-switch" title="The gizmo on the chosen parts: it keys them at the playhead">
                    {SEQUENCE_TOOLS.map((t) => <button key={t.tool} className={shownTool === t.tool ? "active" : ""} title={`${t.note} (${t.key})`} onClick={() => setTool(t.tool)}>{t.label} <kbd>{t.key}</kbd></button>)}
                  </span>
                </div>
                <div className="rig-stage">
                  <SetupPreview view={view} zoom={zoom} tool={shownTool} showBones={showBones} feet={feet} />
                </div>
                <p className="muted ow-note">{toolNote} Pressing pauses the preview first: keys are never made while it plays. Click a part to choose it (Shift or Ctrl: one more).</p>
                <Transport clock={clock} frames={seqFrames} snap={snap} playing={playing} />
                <div className="rig-toggles">
                  <span className="rig-keybuttons">
                    <button disabled={readOnly || !sel.bones.length} title="A key at the playhead for the chosen parts, from what they show there (K)" onClick={() => {
                      const at = keying();
                      const r = keyParts(src, openSeq, sel.bones, at);
                      commit(r.src);
                      setMessage(r.made ? `Keyed ${sel.bones.map((b) => src.bones[b].name).join(", ")} at frame ${at}.` : `Already keyed at frame ${at}.`);
                    }}>◇ Key <kbd>K</kbd></button>
                    <button disabled={readOnly} title="A key for every part at the playhead (Shift+K)" onClick={() => {
                      const at = keying();
                      const r = keyParts(src, openSeq, sequenceBones(src, openSeq), at);
                      commit(r.src);
                      setMessage(r.made ? `Keyed ${r.made} part${r.made > 1 ? "s" : ""} at frame ${at}.` : `Every part already has a key at frame ${at}.`);
                    }}>◆ Key all parts <kbd>⇧K</kbd></button>
                  </span>
                  <label className="ow-check" title="The frames a step (6) before and after, faded"><input type="checkbox" checked={onion} onChange={(e) => setOnion(e.target.checked)} /> Onion skin</label>
                  <label className="ow-check"><input type="checkbox" checked={showBones} onChange={(e) => setShowBones(e.target.checked)} /> Bones</label>
                  <label className="ow-check"><input type="checkbox" checked={feet} onChange={(e) => setFeet(e.target.checked)} /> Feet</label>
                  <label className="ow-check"><input type="checkbox" checked={shiny} onChange={(e) => setShiny(e.target.checked)} /> Shiny</label>
                  <span className="view-switch">
                    {[2, 3, 4, 5, 6].map((z) => <button key={z} className={zoom === z ? "active" : ""} onClick={() => setZoom(z)}>{z}×</button>)}
                  </span>
                </div>
              </section>
            </div>
          ) : stripping ? (
            <div className="rig-main rig-main-sequence">
              <section className="rig-card rig-preview">
                <div className="rig-card-head">
                  <h3>Timeline</h3>
                  <span className="muted small">{total} frames ({(total / 60).toFixed(2)} s), looping at the game's speed: exactly what the battle plays</span>
                </div>
                <div className="rig-stage">
                  <StripPreview view={view} rig={stripRig} clock={stripClock} zoom={zoom} feet={feet} />
                </div>
                <StripTransport clock={stripClock} src={src} total={total} battlePauses={battlePauses} onBattlePauses={setBattlePauses} keeps={keepsMovingOf(src).length} />
                <div className="rig-toggles">
                  <label className="ow-check"><input type="checkbox" checked={feet} onChange={(e) => setFeet(e.target.checked)} /> Feet</label>
                  <label className="ow-check"><input type="checkbox" checked={shiny} onChange={(e) => setShiny(e.target.checked)} /> Shiny</label>
                  <span className="view-switch">
                    {[2, 3, 4, 5, 6].map((z) => <button key={z} className={zoom === z ? "active" : ""} onClick={() => setZoom(z)}>{z}×</button>)}
                  </span>
                  <span className="muted small">Click a part to choose it (its Keeps moving is in the side panel).</span>
                </div>
              </section>
            </div>
          ) : (
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
          )}
        </div>
        {sequencing && (
          <section className="rig-card rig-dock" style={{ height: dockHeight }}>
            <div className="rig-dock-handle" onPointerDown={resizeDock} title="Drag to make the panel taller or shorter" />
            <div className="rig-card-head">
              <span className="view-switch" title="What the panel shows">
                {([["timeline", "Timeline"], ["graph", "Graph"], ["both", "Both"]] as const).map(([v, label]) => (
                  <button key={v} className={dockView === v ? "active" : ""} onClick={() => setDockView(v)}>{label}</button>
                ))}
              </span>
              <b>{openName}</b>
              <span className="muted small">{seqFrames} frames</span>
              <label className={`ow-check rig-snap${snap ? " on" : ""}`} title="The playhead, keys and the length snap to 6 frames (Game Freak's rhythm, the bake's step). Hold Alt while dragging to go by frames.">
                <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snap 6 <kbd>Alt</kbd>
              </label>
              <span className="spacer" />
              {copied?.keys.length ? <span className="muted small">{copied.keys.length} key{copied.keys.length > 1 ? "s" : ""} copied (Ctrl+V pastes at the playhead)</span> : null}
              <span className="muted small">zoom</span>
              <span className="view-switch">
                {[4, 6, 8, 12, 16].map((z) => <button key={z} className={scale === z ? "active" : ""} onClick={() => setScale(z)}>{z}</button>)}
              </span>
            </div>
            <div className={`rig-dock-body ${dockView}`}>
              {dockView !== "graph" && (
                <div className="rig-dock-pane">
                  <SequenceTimeline view={view} scale={scale} />
                  <p className="muted ow-note">Click a key to choose it (Shift or Ctrl: one more), drag empty space to box-select, drag chosen keys to move them in time,
                    Delete deletes them, Ctrl+C and Ctrl+V copy them to the playhead. The hollow keys are the default pose: at 0, and the end key at {seqFrames}{" "}
                    (drag it back to settle earlier). K keys the chosen parts, Shift+K every part; Space plays, the arrows step.</p>
                </div>
              )}
              {dockView !== "timeline" && <div className="rig-dock-pane"><SequenceGraph view={view} /></div>}
            </div>
          </section>
        )}
        {stripping && (
          <section className="rig-card rig-dock rig-strip-dock">
            <div className="rig-card-head">
              <b>Timeline</b>
              <span className="muted small">the game's stay loop · {clipsOf(src).length} clips · {total} frames · {sizes ? `${sizes.multi_animations} bytes` : "—"}</span>
              <span className="spacer" />
              <span className="muted small">zoom</span>
              <span className="view-switch">
                {[1, 2, 3, 4, 6].map((z) => <button key={z} className={stripScale === z ? "active" : ""} onClick={() => setStripScale(z)}>{z}</button>)}
              </span>
            </div>
            <StripTimeline view={view} clock={stripClock} scale={stripScale} chosen={clip} onChoose={setClip} onOpen={editSequence} />
            <p className="muted ow-note">Drag a sequence from the side panel onto the strip to add it there; drag a clip to move it; click to choose it (Delete deletes it),
              double-click to edit its sequence (every clip of it changes). Clips of one sequence in a row are one clip ×N. Space plays, the arrows step by 6.</p>
          </section>
        )}
      </div>
      {stripping ? (
        <aside className="rig-side rig-inspector">
          <StripSequencesSection view={view} onOpen={editSequence} onAdded={setClip} />
          <ClipSection view={view} clip={clip !== null && clip < clipsOf(src).length ? clip : null} onChoose={setClip} onOpen={editSequence} sizes={sizes} />
          <PauseSection view={view} />
          <SetupChecks view={view} check={check} checking={checking} warnings={warnings} />
        </aside>
      ) : sequencing ? (
        <aside className="rig-side rig-inspector">
          <SequenceListSection view={view} open={openSeq} onOpen={openSequence} />
          <SequenceSection view={view} open={openSeq} />
          <KeySection view={view} open={openSeq} onMessage={setMessage} />
          <SetupChecks view={view} check={check} checking={checking} warnings={warnings} />
        </aside>
      ) : (
        <aside className="rig-side rig-inspector">
          <OutlinerSection view={view} />
          <BoneSection view={view} />
          <PoseSection view={view} />
          <LayersSection view={view} />
          <PieceSection view={view} />
          <SequencesSection view={view} />
          <SetupChecks view={view} check={check} checking={checking} warnings={warnings} />
        </aside>
      )}
    </div>
  );
}

/** Play, pause and step the whole strip (by 6), where the playhead is and which clip plays; the battle's pauses (random,
 * as the battle rolls them at each loop's end) and "Preview a battle pause" (one now, as it starts at a loop's end). */
function StripTransport({ clock, src, total, battlePauses, onBattlePauses, keeps }: {
  clock: Clock; src: V2; total: number; battlePauses: boolean; onBattlePauses(on: boolean): void; keeps: number;
}) {
  const st = useClock(clock, (s) => s);
  const time = Math.floor(st.time);
  const last = Math.max(0, total - 1);
  const step = (by: number) => {
    const t = time + by;
    clock.step(0);
    clock.seek(t < 0 ? Math.floor(last / 6) * 6 : t > last ? 0 : t, 0);
  };
  const at = st.pause ? null : clipAt(src, time);
  const k = at ? clipsOf(src)[at.clip] : undefined;
  const name = k ? src.sequences[k.sequence]?.name : null;
  const why = !src.pause ? "Pauses in battle is off (side panel): this sprite never pauses." : null;
  return (
    <>
      <div className="rig-transport">
        <button onClick={() => { clock.play(false); clock.seek(0, 0); }} title="To the start (Home)">⏮</button>
        <button onClick={() => step(-6)} title="Back 6 frames (←)">◀ 6</button>
        <button className="primary" onClick={() => clock.play()} title="Play or pause (Space): the strip loops at the game's 60 frames a second">{st.playing ? "⏸ Pause" : "▶ Play"}</button>
        <button onClick={() => step(6)} title="On 6 frames (→)">6 ▶</button>
        <span className="rig-time">
          {st.pause ? <>battle pause <b>{Math.floor(st.pause.elapsed)}</b> of {st.pause.wait}</>
            : <>frame <b>{time}</b> of {total} <span className="muted">({(time / 60).toFixed(2)} s){name ? ` · ${name}${k!.count > 1 ? ` ${at!.instance + 1} of ${k!.count}` : ""}, frame ${at!.since}` : ""}</span></>}
        </span>
        <input type="range" min={0} max={last} step={6} value={st.pause ? 0 : Math.min(time, last)} title="Scrub the strip"
               onChange={(e) => { clock.play(false); clock.seek(Number(e.target.value), 0); }} />
      </div>
      <div className="rig-toggles rig-pause-tools">
        <button disabled={!!why} className={st.pause ? "active" : ""} onClick={() => (st.pause ? clock.seek(0, 0) : clock.pauseNow())}
                title={why ?? "Plays one battle pause now, as the battle starts it at a loop's end: the sprite stops, only the Keeps moving parts go on, for 48, 56 or 64 frames. Press again to end it."}>
          {st.pause ? "■ End the pause" : "⏸ Preview a battle pause"}
        </button>
        <label className="ow-check" title={why ?? "At each loop's end, a roll as the battle's (1 in 3, then 1 in 2, then surely) starts a pause"}>
          <input type="checkbox" checked={battlePauses && !why} disabled={!!why} onChange={(e) => onBattlePauses(e.target.checked)} /> Random pauses, as in battle
        </label>
        <span className="muted small">{why ?? (keeps ? `${keeps} part${keeps > 1 ? "s" : ""} keep${keeps > 1 ? "" : "s"} moving during a pause (outlined green)` : "No part keeps moving: the whole sprite freezes during a pause")}</span>
      </div>
    </>
  );
}

/** Play, pause and step the open sequence (by 6 with the snap), and where the playhead is. */
function Transport({ clock, frames, snap, playing }: { clock: Clock; frames: number; snap: boolean; playing: boolean }) {
  const time = useClock(clock, (st) => Math.floor(st.time));
  const last = lastFrame(frames, snap);
  const step = (by: number) => {
    const t = time + by;
    clock.step(0);
    clock.seek(t < 0 ? last : t > last ? 0 : t);
  };
  const by = snap ? 6 : 1;
  return (
    <div className="rig-transport">
      <button onClick={() => { clock.play(false); clock.seek(0); }} title="To the start (Home)">⏮</button>
      <button onClick={() => step(-by)} title={`Back ${by} frame${by > 1 ? "s" : ""} (←)`}>◀ {by}</button>
      <button className="primary" onClick={() => clock.play()} title="Play or pause (Space): the sequence loops at the game's 60 frames a second">{playing ? "⏸ Pause" : "▶ Play"}</button>
      <button onClick={() => step(by)} title={`On ${by} frame${by > 1 ? "s" : ""} (→)`}>{by} ▶</button>
      <span className="rig-time">frame <b>{time}</b> of {frames} <span className="muted">({(time / 60).toFixed(2)} s)</span></span>
      <input type="range" min={0} max={Math.max(0, frames - 1)} step={snap ? 6 : 1} value={time} title="Scrub"
             onChange={(e) => { clock.play(false); clock.seek(Number(e.target.value)); }} />
    </div>
  );
}
