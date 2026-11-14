// The new Rig Editor's guide ("? How rigs work"): pieces, bones with their two ends, parenting connected or keeping the
// offset, the layers and the default pose (the rig setup), then sequences and their keyframes (step 3). The timeline
// strip comes with step 4.

export function SetupGuide({ onClose }: { onClose(): void }) {
  return (
    <section className="rig-card rig-guide">
      <div className="rig-card-head">
        <h3>How rigs work</h3>
        <span className="muted small">the rig setup, then sequences</span>
        <span className="spacer" />
        <button onClick={onClose}>Close</button>
      </div>
      <div className="rig-guide-body">
        <div>
          <h4>1. Pieces</h4>
          <p>Draw the sprite's parts on the 256×128 sheet (Aseprite, then the art import). On the <b>Sheet</b>, drag a rectangle round each part:
            that's a <b>piece</b>. Rectangles snap to whole tiles and to sizes the DS can draw (a side of 64 needs the other 32 or 64);
            Shift-drag adds a second rectangle to the chosen piece. Red art is outside every piece: the game never shows it.</p>
          <h4>2. Bones</h4>
          <p>Each piece is drawn by a <b>bone</b> (<b>+ Bone</b> on the piece). A bone has two ends: the round <b>head</b> is its pivot, where it
            turns and scales; the small <b>tail</b> is where its children attach. With the <b>Bones</b> tool (B), drag a head to move the pivot
            (the picture stays put), a tail to point the bone, the body to move the bone and its picture, a picture to place it on its bone.</p>
        </div>
        <div>
          <h4>3. Parenting</h4>
          <p>In <b>Bones</b> (the side panel), drag a bone onto another to make it that one's child: it keeps where it is and follows its parent from
            then on. <b>Connected</b> locks its head to the parent's tail (tails, necks, a chain of pieces for a bend); <b>offset</b> lets it sit
            anywhere and move on its own. <b>Layers</b> sets which pieces are in front: drag to reorder.</p>
          <h4>4. The default pose</h4>
          <p>Move (G), Rotate (R) and Scale (S) pose the chosen bones. What you see is the <b>default pose</b>: every sequence starts and ends
            at it, so the setup is all it takes. Front and back are separate rigs; on the back, <b>Copy front to back</b> starts it from the front.</p>
          <p className="muted">The game can't bend or skew a piece: a bend is a chain of connected bones, or pictures drawn bent and swapped.</p>
        </div>
        <div>
          <h4>5. Sequences</h4>
          <p>In <b>Sequences</b> (the switch at the top) each sequence (Idle, Hop, ...) is a loop of the same bones. It starts at the default pose
            (the hollow key at 0) and comes back to it at its end (the hollow end key, one step past the last frame the game holds, since it is
            the next loop's start). With no keys a part holds the default pose; a key between makes it go there and back; add as many as you like.</p>
          <h4>6. Keys</h4>
          <p>Put the playhead on a frame and pose the chosen parts with Move, Rotate or Scale: that keys them there (the preview pauses first).
            <b>K</b> keys the chosen parts as they are, <b>Shift+K</b> every part. Lengths, keys and the playhead go by 6 frames (<b>Snap 6</b>;
            Alt for single frames), the game's rhythm. Box-select keys on the timeline, drag them in time, Delete them, Ctrl+C and Ctrl+V them.</p>
        </div>
        <div>
          <h4>7. Curves</h4>
          <p>The <b>Graph</b> shows the chosen parts' curves and, faint underneath, the steps the game holds every 6 frames. A key's curve says how
            it goes on to the next: ease in and out by default, linear, constant (held), Bézier with handles, or a preset: <b>Snap</b>, <b>Back</b>
            (past the key and back), <b>Bounce</b> or <b>Elastic</b>.</p>
          <p className="muted">Save writes the rig and the game's keys made from it; the preview is those keys, as the battle plays them.</p>
        </div>
        <div>
          <h4>8. The timeline</h4>
          <p>In <b>Timeline</b> (the switch at the top) the strip at the bottom is the loop the battle plays: clips of your sequences, like a video
            editor's (Idle ×4, Hop, ...). Drag a sequence onto it, drag clips to reorder them, set a clip's repeats; a clip always plays its whole
            sequence, and editing a sequence changes every clip of it. A sequence on no clip is never shown in battle.</p>
          <h4>9. The battle's pause</h4>
          <p>Now and then, at the end of a loop, the battle stops the sprite for about a second. <b>Keeps moving</b> on a part lets it go on
            animating then (a flame, a blink); <b>Pauses in battle</b> off means it never stops. <b>Preview a battle pause</b> shows one.</p>
        </div>
      </div>
    </section>
  );
}
