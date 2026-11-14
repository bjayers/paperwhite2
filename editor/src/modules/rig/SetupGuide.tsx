// The new Rig Editor's guide ("? How rigs work") for the rig setup: pieces, bones with their two ends, parenting
// connected or keeping the offset, the layers and the default pose. Sequences and the timeline come with step 3.

export function SetupGuide({ onClose }: { onClose(): void }) {
  return (
    <section className="rig-card rig-guide">
      <div className="rig-card-head">
        <h3>How rigs work</h3>
        <span className="muted small">the rig setup</span>
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
          <p className="muted">The game can't bend or skew a piece: a bend is a chain of connected bones, or pictures drawn bent and swapped.
            Sequences (Idle, Hop, ...) and the timeline come next; Save writes the rig and the game's keys made from it.</p>
        </div>
      </div>
    </section>
  );
}
