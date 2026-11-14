// The Rig Editor's built-in guide ("? How rigs work"): the two modes, parenting, key poses and the baked keys, and the
// sequence, with the user's example worked through. Short, and accurate to how the editor works (battle-sprites.md 18-19).

export function Guide({ onClose }: { onClose(): void }) {
  return (
    <section className="rig-card rig-guide">
      <div className="rig-card-head">
        <h3>How rigs work</h3>
        <span className="muted small">for Blender users</span>
        <span className="spacer" />
        <button onClick={onClose}>Close</button>
      </div>
      <div className="rig-guide-body">
        <div>
          <h4>Two modes (Tab switches)</h4>
          <p><b>Edit mode</b> sets the sprite up at rest, with no time and nothing keyed. Cut the pictures on the sheet, order the layers, drag
            each part's <b>pivot</b> (the point it turns about; the picture stays where it is while the pivot moves), and <b>parent</b> parts
            (drag one onto another in Parenting, or Pick parent on the preview). What you do here applies to every frame of every action.</p>
          <p><b>Pose mode</b> is for animating. The Move, Rotate and Scale gizmos set a part's <b>key pose</b> at the playhead (auto-key); the
            Graph Editor shapes the curves between key poses.</p>
        </div>
        <div>
          <h4>Key poses in, game keys out</h4>
          <p>You set a few <b>key poses</b> with a curve between them. The editor <b>bakes</b> them into the held keys the game plays, one every
            6 frames like Game Freak's (the blocks under the diamonds, read only). Set a start and an end pose and the in-betweens are made.
            A child follows its parent's turn, scale and move as a Blender bone does; the game itself has no parents, so the bake writes that
            into each part's own keys.</p>
          <p>The first time you parent a part, or key one in Pose mode, a sprite from the game becomes an <b>armature</b> (it plays exactly as
            before until you change something; Ctrl+Z takes it back). <b>Remove armature</b> goes back to flat keys; the <b>Game keys</b> switch
            edits the game's own keys directly.</p>
          <p>An <b>action</b> (the file's pose) is a set of parts. The <b>Stay / Stop</b> row is like Blender's NLA strip: each block plays one
            action for N frames. Changing a block's length changes only how long that action plays; each part's track loops inside it at its
            own length.</p>
        </div>
        <div>
          <h4>Example: the eyes rock back and forth while the whole Applin tilts</h4>
          <ol>
            <li><b>Edit mode.</b> Choose an eye and drag its <b>Pivot</b> to where it should turn (the eye's picture stays put). Do the other eye.</li>
            <li>Still in Edit mode, <b>parent</b> each eye to the body: drag it onto the body in Parenting (or choose it, and pick the body under Bone, Parent).</li>
            <li><b>Tab to Pose mode.</b> Choose <b>Root</b> in the Parts list (the whole sprite). Make the Stay block as long as the tilt's loop: drag its
              right edge on the timeline to 120 frames.</li>
            <li>Playhead at 0: press <b>K</b> (a key pose). At 30: K, then type 3 in Turn (Key pose panel) and press Enter. At 90: K, Turn -3. The loop
              wraps from 90 back to 0, and new key poses go to the next by ease in and out, so those three make the tilt rock.</li>
            <li>Choose an <b>eye</b>. Under Bone set its Loop to something else, say 72 frames, and key its own turn: K at 0 with Turn 0, K at 36 with Turn 8.
              Its rhythm differs from the tilt's, and it follows the body's tilt as well.</li>
            <li>Press Space. The baked keys fill in every 6 frames under the diamonds. Ctrl+S saves the rig and its armature.</li>
          </ol>
        </div>
      </div>
    </section>
  );
}
