// The new Rig Editor's guide ("? How rigs work", rig-editor-v2.md, "Built: step 6"): the whole workflow, short, in the
// order it's done: the rig setup (pieces, bones and parents, the default pose), sequences and their keys and curves, loop
// clips, the timeline, the battle's pause, and where old rigs fit; with the eyes-and-tilt and fire-flicker examples.

export function SetupGuide({ onClose }: { onClose(): void }) {
  return (
    <section className="rig-card rig-guide">
      <div className="rig-card-head">
        <h3>How rigs work</h3>
        <span className="muted small">Rig setup → Sequences → loop clips → Timeline → the battle's pause</span>
        <span className="spacer" />
        <button onClick={onClose}>Close</button>
      </div>
      <div className="rig-guide-body">
        <div>
          <h4>1. Pieces <span className="muted">Rig setup</span></h4>
          <p>Draw the parts on the 256×128 sheet (Aseprite, then the art import), then drag a rectangle round each on the <b>Sheet</b>: a
            <b> piece</b>. Draw the pictures you'll swap too (eyes open and closed, three flames). Rectangles snap to tiles and to sizes the DS
            can draw; red art is outside every piece.</p>
          <h4>2. Bones and parents</h4>
          <p><b>+ Bone</b> on a piece gives it a bone: the round <b>head</b> is the pivot it turns about, the <b>tail</b> where children attach
            (Bones tool, B, drags either). Drag a bone onto another in <b>Bones</b> to parent it: <b>Connected</b> locks its head to the parent's
            tail (necks, tails, a chain for a bend), <b>offset</b> lets it sit anywhere. <b>Layers</b>: which piece is in front.</p>
          <h4>3. The default pose</h4>
          <p>Move (G), Rotate (R), Scale (S) here pose the <b>default</b>: every sequence starts and ends at it.</p>
        </div>
        <div>
          <h4>4. Sequences and keys <span className="muted">Sequences</span></h4>
          <p>Each sequence (Idle, Hop, ...) is a loop of the same bones, from the default pose (the hollow key at 0) back to it (the hollow end
            key). Put the playhead on a frame and pose a part with the gizmos, or type in <b>Part</b>: that's a key. <b>K</b> keys the chosen
            parts as they are, <b>Shift+K</b> all. Keys go by 6 frames, the game's rhythm (<b>Snap 6</b>; Alt for single frames).</p>
          <p className="muted"><b>Eyes and tilt:</b> in Idle (48), the head turned 10° at 24 (Rotate) tilts and comes back; the eyes' picture set to
            "closed" at 30 and "open" at 36 (Part → Picture) blinks while it tilts.</p>
          <h4>5. Curves</h4>
          <p>A key's curve is how it goes on to the next: ease in and out by default, linear, held, Bézier, or <b>Snap</b>, <b>Back</b>,
            <b> Bounce</b>, <b>Elastic</b>. The <b>Graph</b> shows them over the 6-frame steps the game holds.</p>
        </div>
        <div>
          <h4>6. Loop clips</h4>
          <p>A <b>loop clip</b> is a short loop of its own for one part, playing under the sequence's keys so it isn't keyed by hand while
            everything else moves. <b>+ Loop clip</b> (side panel) opens its own timeline: key pictures there (and small moves, turns, scales,
            which add to the part's). Its keys go by its own step: 2 or 3 suits a flicker. Then drag it from the list onto a part's row of a
            sequence (or <b>+ Loop clip</b> in Part); its bars show under the row, drag them to start it later.</p>
          <p className="muted"><b>Fire flicker:</b> a 12-frame clip with flame 1 at 0, flame 2 at 4, flame 3 at 8, placed on the flame in Idle:
            the flame flickers all through Idle while the body bobs. A clip whose length doesn't go into the sequence's (10 into 48) is marked ⚠:
            it restarts with each play of the sequence and costs more keys.</p>
        </div>
        <div>
          <h4>7. The timeline <span className="muted">Timeline</span></h4>
          <p>The strip is the loop the battle plays: clips of your sequences (Idle ×4, Hop, ...). Drag sequences on, drag clips to reorder,
            set repeats. Editing a sequence changes every clip of it; a sequence on no clip is never shown.</p>
          <h4>8. The battle's pause</h4>
          <p>Now and then, at a loop's end, the battle stops the sprite for about a second. <b>Keeps moving</b> on a part lets it go on through
            the pause, loop clips and all: the flame above keeps flickering while the rest stands still. <b>Preview a battle pause</b> shows one.</p>
          <h4>Old rigs</h4>
          <p className="muted">Vanilla sprites open as sequences with their keys as they are. A side made in the first editor (an armature)
            offers <b>Import into the new editor</b>; <b>Advanced (old editor)</b> still edits the game's keys as stored. Save writes the
            game's keys (the preview is exactly them) and this editor's source.</p>
        </div>
      </div>
    </section>
  );
}
