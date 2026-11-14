// The new Rig Editor's side panel for the rig setup, laid out as the Ambients panel: the chosen bone (its name, piece,
// parent and link, its head and tail), its default pose, the bones' tree (drag one onto another to parent it, keeping
// where it is), the layers front to back (drag to reorder), the chosen piece, the sequences (read only until step 3)
// and the checks.

import { useState, type ReactNode } from "react";
import type { RigCheck } from "../../api.ts";
import { ScrubNumber, type ScrubPhase } from "../overworld/ScrubNumber.tsx";
import { sizeProblem } from "./model.ts";
import { hue } from "./context.ts";
import type { Pair } from "./mcss.ts";
import { addBone, addBoneForPiece, boneTree, bonesShowing, connectedChildren, deleteBone, deletePiece, layersOfSetup, moveHead, moveLayer, moveTail,
         ownLayerSequences, parentOf, pivotOf, removeRectangle, renameBone, renamePiece, reparentKeep, setBonePiece, setConnected, setDefault, setInLayers,
         wouldCycle } from "./setup.ts";
import { uncovered } from "./SheetView.tsx";
import { PieceThumb } from "./SetupSheet.tsx";
import type { SetupView } from "./setupContext.ts";
import type { V2 } from "./v2.ts";

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <>
      <span className="ow-condition-label">{label}</span>
      <span className="ow-xyz">
        {children}
        {hint && <span className="muted hint">{hint}</span>}
      </span>
    </>
  );
}

/** A name box that commits on Enter or leaving it. */
function NameInput({ value, onCommit, disabled }: { value: string; onCommit(name: string): void; disabled?: boolean }) {
  const [typed, setTyped] = useState<string | null>(null);
  const done = () => {
    if (typed !== null && typed !== value) onCommit(typed);
    setTyped(null);
  };
  return <input className="rig-name-input" value={typed ?? value} disabled={disabled} onChange={(e) => setTyped(e.target.value)} onBlur={done}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setTyped(null); }} />;
}

const phaseOf = (p: ScrubPhase) => p;

// ---------------------------------------------------------------- The chosen bone

export function BoneSection({ view }: { view: SetupView }) {
  const { src, sel, select, commit, readOnly, say } = view;
  const b = sel.bones[0];
  const bone = b !== undefined ? src.bones[b] : undefined;
  const addRoot = () => {
    const made = addBone(src, { head: [0, -16], tail: [0, -32] });
    commit(made.src);
    select({ bones: [made.bone] });
  };
  if (!bone) {
    return (
      <section className="ow-panel-box ow-section">
        <h5>Bone <span className="muted">none chosen</span></h5>
        <div className="ow-section-actions">
          <button disabled={readOnly} onClick={addRoot} title="A new bone at the feet, parented to the root">+ Bone</button>
        </div>
        <p className="muted ow-note">Click a bone or a picture on the preview, or a bone in the Bones list. A piece's <b>+ Bone</b> makes a bone showing it;
          with the Bones tool, dragging on empty space draws a bone from head to tail.</p>
      </section>
    );
  }
  if (sel.bones.length > 1) {
    return (
      <section className="ow-panel-box ow-section">
        <h5>Bones <span className="muted">{sel.bones.length} chosen</span></h5>
        <p className="muted ow-note">{sel.bones.map((x) => src.bones[x]?.name).join(", ")}: the Move, Rotate and Scale gizmos change all of their default poses.
          Click one alone to edit it here.</p>
      </section>
    );
  }
  const p = parentOf(src, b);
  const connected = !!bone.connected && p !== null;
  const head = pivotOf(src, b);
  const set = (next: V2, phase: ScrubPhase = "typed") => commit(next, phaseOf(phase));
  const addChild = () => {
    const dir: Pair = [bone.tail[0] - head[0], bone.tail[1] - head[1]];
    const len = Math.hypot(...dir) || 1;
    const step = Math.max(8, Math.round(len * 0.75));
    const made = addBone(src, { head: bone.tail, tail: [Math.round(bone.tail[0] + (dir[0] / len) * step), Math.round(bone.tail[1] + (dir[1] / len) * step)], parent: b, connected: true,
                                name: `${bone.name} 2` });
    commit(made.src);
    select({ bones: [made.bone] });
  };
  const parents = src.bones.map((x, i) => [x, i] as const).filter(([, i]) => i !== b && !wouldCycle(src, b, i));
  return (
    <section className="ow-panel-box ow-section">
      <h5>Bone <span className="muted">{bone.name}{p !== null ? `, ${connected ? "connected to" : "child of"} ${src.bones[p].name}` : ", a root bone"}</span></h5>
      <div className="ow-section-actions">
        <button disabled={readOnly} onClick={addChild} title="A new bone connected to this one's tail (Blender's extrude)">+ Child bone</button>
        <button disabled={readOnly} onClick={() => { commit(deleteBone(src, b)); select({ bones: [] }); }}
                title="Delete this bone (Delete): its children go to its parent, keeping where they are; its pieces stay">Delete bone</button>
      </div>
      <div className="ow-condition">
        <Row label="Name"><NameInput value={bone.name} disabled={readOnly} onCommit={(n) => commit(renameBone(src, b, n))} /></Row>
        <Row label="Shows" hint="the piece it draws in the default pose; sequences can swap it (blinks, mouths)">
          <select value={bone.default?.piece ?? -1} disabled={readOnly} onChange={(e) => commit(setBonePiece(src, b, Number(e.target.value) < 0 ? undefined : Number(e.target.value)))}>
            <option value={-1}>nothing (hidden)</option>
            {src.pieces.map((x, i) => <option key={i} value={i}>{x.name}</option>)}
          </select>
        </Row>
        <Row label="Parent" hint="changing it keeps the bone where it is (Keep Transform); it follows its parent from then on">
          <select value={p ?? -1} disabled={readOnly} onChange={(e) => {
            const next = Number(e.target.value) < 0 ? null : Number(e.target.value);
            commit(reparentKeep(src, b, next));
            say(`${bone.name} is now ${next === null ? "a root bone" : `${src.bones[next].name}'s child`}; it stays where it is.`);
          }}>
            <option value={-1}>the root</option>
            {parents.map(([x, i]) => <option key={i} value={i}>{x.name}</option>)}
          </select>
        </Row>
        <Row label="Link" hint={p === null ? "a root bone has no parent to link to" : connected
          ? "its head is locked to the parent's tail, and it only turns and scales: tails, spines, necks"
          : "it follows its parent from where it is, and can move on its own"}>
          <span className="view-switch">
            <button className={connected ? "active" : ""} disabled={readOnly || p === null} onClick={() => {
              const r = setConnected(src, b, true);
              commit(r.src);
              if (r.dropped) say(`${bone.name} is connected now: its own moves are locked (they were dropped), so it only turns and scales.`);
            }}>Connected</button>
            <button className={!connected ? "active" : ""} disabled={readOnly || p === null} onClick={() => commit(setConnected(src, b, false).src)}>Keep offset</button>
          </span>
        </Row>
        <Row label="Head" hint={connected ? `the pivot: ${src.bones[p!].name}'s tail (connected), which moves with it` : "the pivot it turns and scales about (pixels from the feet, y down); the pictures stay where they are"}>
          <ScrubNumber label="X" value={head[0]} step={0.25} digits={0} onChange={(n, ph) => !readOnly && set(moveHead(src, b, [Math.round(n) - head[0], 0]).src, ph)} />
          <ScrubNumber label="Y" value={head[1]} step={0.25} digits={0} onChange={(n, ph) => !readOnly && set(moveHead(src, b, [0, Math.round(n) - head[1]]).src, ph)} />
        </Row>
        <Row label="Tail" hint={connectedChildren(src, b).length ? "where its children attach: the connected ones' heads follow it" : "where children attach, and which way the bone points"}>
          <ScrubNumber label="X" value={bone.tail[0]} step={0.25} digits={0} onChange={(n, ph) => !readOnly && set(moveTail(src, b, [Math.round(n) - bone.tail[0], 0]).src, ph)} />
          <ScrubNumber label="Y" value={bone.tail[1]} step={0.25} digits={0} onChange={(n, ph) => !readOnly && set(moveTail(src, b, [0, Math.round(n) - bone.tail[1]]).src, ph)} />
        </Row>
      </div>
    </section>
  );
}

export function PoseSection({ view }: { view: SetupView }) {
  const { src, sel, commit, readOnly } = view;
  const b = sel.bones[0];
  const bone = b !== undefined ? src.bones[b] : undefined;
  if (!bone || sel.bones.length > 1) return null;
  const d = bone.default ?? {};
  const connected = !!bone.connected && parentOf(src, b) !== null;
  const move = d.move ?? [0, 0], scale = d.scale ?? [1, 1];
  const set = (change: Parameters<typeof setDefault>[2], ph: ScrubPhase) => !readOnly && commit(setDefault(src, b, change), phaseOf(ph));
  const identity = !move[0] && !move[1] && !d.rotation && scale[0] === 1 && scale[1] === 1;
  return (
    <section className="ow-panel-box ow-section">
      <h5>Default pose <span className="muted">{identity ? "at rest" : "moved from rest"}</span></h5>
      <div className="ow-section-actions">
        <button disabled={readOnly || identity} onClick={() => commit(setDefault(src, b, (t) => ({ ...t, move: [0, 0], rotation: 0, scale: [1, 1] })))}
                title="Back to rest: no move, turn or scale">Reset pose</button>
      </div>
      <p className="muted ow-note">The rig setup is the default pose: every sequence starts and ends at what you see here, so there's no "set as default" step.</p>
      <div className="ow-condition">
        <Row label="Move" hint={connected ? "locked: a connected bone's head stays on its parent's tail" : "pixels, from where its head is, in its parent's frame"}>
          <ScrubNumber label="X" value={move[0]} step={0.25} digits={0} onChange={(n, ph) => !connected && set((t) => ({ ...t, move: [Math.round(n), move[1]] }), ph)} />
          <ScrubNumber label="Y" value={move[1]} step={0.25} digits={0} onChange={(n, ph) => !connected && set((t) => ({ ...t, move: [move[0], Math.round(n)] }), ph)} />
        </Row>
        <Row label="Turn" hint="degrees about the head, clockwise">
          <ScrubNumber label="°" value={d.rotation ?? 0} step={0.5} digits={1} onChange={(n, ph) => set((t) => ({ ...t, rotation: n }), ph)} />
        </Row>
        <Row label="Scale" hint="1 is the drawn size; an uneven scale over a turned child can't be drawn (the checks warn)">
          <ScrubNumber label="X" value={scale[0]} step={0.01} digits={3} onChange={(n, ph) => set((t) => ({ ...t, scale: [n, scale[1]] }), ph)} />
          <ScrubNumber label="Y" value={scale[1]} step={0.01} digits={3} onChange={(n, ph) => set((t) => ({ ...t, scale: [scale[0], n] }), ph)} />
        </Row>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- The bones' tree

export function OutlinerSection({ view }: { view: SetupView }) {
  const { src, sel, select, commit, readOnly, say, art, sheet, shiny } = view;
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | "root" | null>(null);
  const tree = boneTree(src);
  const drop = (target: number | null) => {
    const b = drag;
    setDrag(null);
    setOver(null);
    if (b === null || target === b || readOnly) return;
    if (wouldCycle(src, b, target)) {
      say(`${src.bones[target!].name} can't be ${src.bones[b].name}'s parent: it's ${src.bones[b].name}'s child, so they'd go round in a circle.`);
      return;
    }
    commit(reparentKeep(src, b, target));
    say(`${src.bones[b].name} is now ${target === null ? "a root bone" : `${src.bones[target].name}'s child`}, keeping where it is. "Connected" (the chip on its row) locks its head to the parent's tail.`);
  };
  return (
    <section className="ow-panel-box ow-section">
      <h5>Bones <span className="muted">{src.bones.length} bone{src.bones.length === 1 ? "" : "s"}, children under their parents</span></h5>
      <div className="rig-outliner">
        <div className={`rig-outliner-row${over === "root" ? " drop" : ""}`} onDragOver={(e) => { if (drag !== null) { e.preventDefault(); setOver("root"); } }}
             onDragLeave={() => setOver(null)} onDrop={(e) => { e.preventDefault(); drop(null); }} title="Drop a bone here to make it a root bone">
          <span className="rig-bone-icon">◆</span><b>Root</b><span className="muted">the sprite's feet</span>
        </div>
        {tree.map(({ bone: b, depth }) => {
          const bone = src.bones[b];
          const p = parentOf(src, b);
          return (
            <div key={b} className={`rig-outliner-row${sel.bones[0] === b ? " selected" : sel.bones.includes(b) ? " multi" : ""}${over === b ? " drop" : ""}${drag === b ? " dragging" : ""}`}
                 style={{ paddingLeft: 8 + (depth + 1) * 14 }} draggable={!readOnly}
                 onDragStart={(e) => { setDrag(b); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { setDrag(null); setOver(null); }}
                 onDragOver={(e) => { if (drag !== null && drag !== b) { e.preventDefault(); setOver(b); } }} onDragLeave={() => setOver(null)}
                 onDrop={(e) => { e.preventDefault(); drop(b); }}
                 onClick={(e) => select(e.shiftKey || e.ctrlKey || e.metaKey
                   ? { bones: sel.bones.includes(b) ? sel.bones.filter((x) => x !== b) : [b, ...sel.bones] }
                   : { bones: [b], piece: bone.default?.piece ?? sel.piece })}
                 title="Click to choose (Shift or Ctrl: one more). Drag onto another bone to parent it to that one, or onto Root; it stays where it is.">
              <span className="rig-grip">⠿</span>
              <span className="rig-swatch" style={{ background: hue(b, 70, 70) }} />
              <PieceThumb art={art} sheet={sheet} shiny={shiny} rectangles={bone.default?.piece !== undefined ? src.pieces[bone.default.piece]?.rectangles : undefined} size={22} />
              <b>{bone.name}</b>
              {p !== null && (
                <button className={`rig-chip${bone.connected ? " on" : ""}`} disabled={readOnly}
                        title={bone.connected ? "Connected: its head is locked to the parent's tail. Click to keep its offset instead." : "Keeps its offset from the parent. Click to connect its head to the parent's tail (the pictures stay)."}
                        onClick={(e) => { e.stopPropagation(); commit(setConnected(src, b, !bone.connected).src); }}>
                  {bone.connected ? "connected" : "offset"}
                </button>
              )}
              {bone.default?.piece === undefined && <span className="muted">no piece</span>}
            </div>
          );
        })}
      </div>
      <p className="muted ow-note">Drag a bone onto another to parent it (it keeps where it is, Blender's Keep Transform), onto Root to free it.
        The chip says how it's linked: <b>connected</b> (its head on the parent's tail) or <b>offset</b>.</p>
    </section>
  );
}

// ---------------------------------------------------------------- The layers

export function LayersSection({ view }: { view: SetupView }) {
  const { src, sel, select, commit, readOnly, art, sheet, shiny } = view;
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const layers = layersOfSetup(src);
  const left = src.bones.map((_, i) => i).filter((i) => !layers.includes(i));
  const own = ownLayerSequences(src);
  return (
    <section className="ow-panel-box ow-section">
      <h5>Layers <span className="muted">{layers.length} drawn, front first</span></h5>
      <div className="rig-outliner">
        {layers.map((b, k) => {
          const bone = src.bones[b];
          if (!bone) return null;
          return (
            <div key={b} className={`rig-outliner-row${sel.bones.includes(b) ? " selected" : ""}${over === k ? " drop" : ""}${drag === k ? " dragging" : ""}`}
                 draggable={!readOnly} onDragStart={(e) => { setDrag(k); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { setDrag(null); setOver(null); }}
                 onDragOver={(e) => { if (drag !== null) { e.preventDefault(); setOver(k); } }} onDragLeave={() => setOver(null)}
                 onDrop={(e) => { e.preventDefault(); if (drag !== null) commit(moveLayer(src, drag, k)); setDrag(null); setOver(null); }}
                 onClick={() => select({ bones: [b] })} title={`Layer ${k}${k === 0 ? " (front)" : k === layers.length - 1 ? " (back)" : ""}: drag to reorder`}>
              <span className="rig-grip">⠿</span>
              <span className="muted rig-layer-no">{k}</span>
              <PieceThumb art={art} sheet={sheet} shiny={shiny} rectangles={bone.default?.piece !== undefined ? src.pieces[bone.default.piece]?.rectangles : undefined} size={22} />
              <b>{bone.name}</b>
              <span className="spacer" />
              {!readOnly && <button className="small" title="Take it out of the layers: it isn't drawn (a bone only for its children)" onClick={(e) => { e.stopPropagation(); commit(setInLayers(src, b, false)); }}>Hide</button>}
            </div>
          );
        })}
        {left.map((b) => (
          <div key={`left-${b}`} className="rig-outliner-row hidden-layer" onClick={() => select({ bones: [b] })}>
            <span className="muted">not drawn</span><b>{src.bones[b].name}</b><span className="spacer" />
            {!readOnly && <button className="small" onClick={(e) => { e.stopPropagation(); commit(setInLayers(src, b, true)); }} title="Draw it, in front">Draw</button>}
          </div>
        ))}
      </div>
      <p className="muted ow-note">Front to back: drag a row to reorder. Every sequence draws this order{own.length ? `, except ${own.length} converted sequence${own.length > 1 ? "s" : ""} that keep their own (the originals' actions)` : ""}.</p>
    </section>
  );
}

// ---------------------------------------------------------------- The chosen piece

export function PieceSection({ view }: { view: SetupView }) {
  const { src, sel, select, commit, readOnly } = view;
  const n = sel.piece;
  const piece = n !== null ? src.pieces[n] : undefined;
  if (!piece || n === null) {
    return (
      <section className="ow-panel-box ow-section">
        <h5>Piece <span className="muted">none chosen</span></h5>
        <p className="muted ow-note">Drag a rectangle round a piece of art on the sheet to cut a new piece; click a rectangle to choose its piece.</p>
      </section>
    );
  }
  const showers = bonesShowing(src, n);
  const place = (k: number, axis: 0 | 1, value: number, ph: ScrubPhase) => {
    // The whole piece moves on its bone (both rectangles together)
    const delta = value - piece.rectangles[k].at[axis];
    const next: V2 = { ...src, pieces: src.pieces.map((p, i) => (i !== n ? p : {
      ...p, rectangles: p.rectangles.map((r) => ({ ...r, at: (axis === 0 ? [r.at[0] + delta, r.at[1]] : [r.at[0], r.at[1] + delta]) as Pair })),
    })) };
    if (!readOnly) commit(next, phaseOf(ph));
  };
  return (
    <section className="ow-panel-box ow-section">
      <h5>Piece <span className="muted">{piece.name}, {showers.length ? `on ${showers.map((b) => src.bones[b].name).join(", ")}` : "on no bone"}</span></h5>
      <div className="ow-section-actions">
        <button disabled={readOnly} onClick={() => { const made = addBoneForPiece(src, n); commit(made.src); select({ bones: [made.bone] }); }}
                title="A new bone showing this piece">+ Bone for it</button>
        <button disabled={readOnly || piece.rectangles.length < 2} onClick={() => { commit(removeRectangle(src, n, 1)); select({ rectangle: 0 }); }}>Remove second rectangle</button>
        <button disabled={readOnly} onClick={() => { commit(deletePiece(src, n)); select({ piece: null }); }}>Delete piece</button>
      </div>
      <div className="ow-condition">
        <Row label="Name"><NameInput value={piece.name} disabled={readOnly} onCommit={(name) => commit(renamePiece(src, n, name))} /></Row>
        {piece.rectangles.map((r, k) => (
          <Row key={k} label={k ? "Second" : "Rectangle"} hint={sizeProblem(r.size[0], r.size[1]) ?? (k ? "drawn with the first, placed beside it as on the sheet" : "on the sheet; Shift-drag on the sheet adds a second rectangle")}>
            <span className={sizeProblem(r.size[0], r.size[1]) ? "pkm-error" : "muted"}>{r.size[0]}×{r.size[1]} at {r.sheet[0]}, {r.sheet[1]}</span>
            <button className={sel.rectangle === k ? "active small" : "small"} onClick={() => select({ rectangle: k })}>Edit on sheet</button>
          </Row>
        ))}
        {piece.rectangles[0] && (
          <Row label="On its bone" hint="where the picture's top left is from its bone's head (pixels, y up); the Bones tool drags it on the preview">
            <ScrubNumber label="X" value={piece.rectangles[0].at[0]} step={0.25} digits={0} onChange={(v, ph) => place(0, 0, Math.round(v), ph)} />
            <ScrubNumber label="Y" value={piece.rectangles[0].at[1]} step={0.25} digits={0} onChange={(v, ph) => place(0, 1, Math.round(v), ph)} />
          </Row>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Sequences (step 3) and the checks

export function SequencesSection({ view }: { view: SetupView }) {
  const { src } = view;
  return (
    <section className="ow-panel-box ow-section">
      <h5>Sequences <span className="muted">{src.sequences.length}, read only for now</span></h5>
      <div className="rig-outliner">
        {src.sequences.map((s, i) => {
          const keyed = s.parts.filter((l) => l.keys.length).length;
          const uses = src.timeline.blocks.filter((bl) => bl.sequence === i).length;
          return (
            <div key={i} className="rig-outliner-row" title={s.layers ? "Keeps its own layers (a converted original's action)" : undefined}>
              <b>{s.name}</b><span className="muted">{s.frames} frames ({(s.frames / 60).toFixed(1)} s)</span>
              <span className="muted">{keyed ? `${keyed} part${keyed > 1 ? "s" : ""} keyed` : "holds the default pose"}</span>
              <span className="spacer" /><span className="muted">{uses ? `×${uses} on the timeline` : "not on the timeline"}</span>
            </div>
          );
        })}
      </div>
      <p className="muted ow-note">Sequences and their keyframes come in the next step. Until then a new rig holds its default pose, and the
        Advanced (old) editor still edits a converted original's keys.</p>
    </section>
  );
}

export function SetupChecks({ view, check, checking, warnings }: { view: SetupView; check: RigCheck | null; checking: boolean; warnings: string[] }) {
  const { src, art, sheet } = view;
  const local: string[] = [];
  src.pieces.forEach((p) => p.rectangles.forEach((r, k) => {
    if (k > 0 && !r.size[0]) return;
    const problem = r.size[0] && r.size[1] ? sizeProblem(r.size[0], r.size[1]) : null;
    if (problem) local.push(`${p.name}'s ${k ? "second" : "first"} rectangle: ${problem}.`);
  }));
  const pixels = art?.sheets[sheet];
  if (pixels) {
    const out = uncovered(pixels, src.pieces.flatMap((p) => p.rectangles));
    let count = 0;
    for (const v of out) count += v;
    if (count) local.push(`${count} pixels of ${sheet}.png are outside every piece (red on the sheet): the game never draws them.`);
  }
  if (!src.bones.length) local.push("The rig has no bones: the game needs at least one part. Give a piece a bone.");
  const errors = check?.errors ?? [];
  const all = [...warnings, ...(check?.warnings ?? []), ...local];
  return (
    <section className="ow-panel-box ow-section">
      <h5>Checks <span className="muted">{checking ? "checking…" : errors.length ? `${errors.length} errors: Save refuses` : all.length ? `${all.length} warnings` : "the build takes it"}</span></h5>
      {errors.length > 0 && <ul className="bsp-messages pkm-error">{errors.slice(0, 12).map((m, i) => <li key={i}>{m}</li>)}</ul>}
      {all.length > 0 && <ul className="bsp-messages bsp-warning">{all.slice(0, 12).map((m, i) => <li key={i}>⚠ {m}</li>)}</ul>}
      {!errors.length && !all.length && <p className="muted ow-note">No problems: the bake, mcss_rig.check (the game's limits) and the schema pass.</p>}
    </section>
  );
}
