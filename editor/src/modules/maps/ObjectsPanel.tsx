// The Map Editor's Objects tab: the library of whole objects (res/paperwhite2/map_objects/), saved from maps' faces in
// the Faces tab, placed on the chosen chunk where a click says (its faces pasted into the model, its collision
// painted), and on painted maps in the Paint tab.

import { useState } from "react";
import { ObjectBrowser } from "./ObjectBrowser.tsx";
import type { LibraryObject } from "./painting.ts";

export function ObjectsPanel({ objects, chosen, setChosen, placing, setPlacing, missing, onImport, onDelete, onLibraryChanged, busy }: {
  objects: LibraryObject[];
  chosen: string;
  setChosen(id: string): void;
  placing: boolean;
  setPlacing(on: boolean): void;
  missing: string[];
  onImport(): void;
  onDelete(id: string): void;
  onLibraryChanged(): void;
  busy: boolean;
}) {
  const [browsing, setBrowsing] = useState(false);
  const object = objects.find((o) => o.id === chosen);
  const categories = [...new Set(objects.map((o) => o.category ?? ""))].sort();
  return (
    <>
      <section className="me-section">
        <h4>Library</h4>
        <div className="me-actions"><button onClick={() => setBrowsing(true)} title="Every object with a preview: view, rename, change its category">Browse…</button></div>
        {browsing && <ObjectBrowser objects={objects} chosen={chosen} onClose={() => setBrowsing(false)} onChanged={onLibraryChanged}
                                    onChoose={(id) => { setChosen(id); setBrowsing(false); }} />}
        {objects.length === 0 ? (
          <p className="muted ow-note">The library is empty. Select an object's faces in the Faces tab (Select the stack takes a whole tree),
            then Save as an object.</p>
        ) : categories.map((c) => (
          <div key={c} className="me-category">
            <div className="muted me-category-name">{c || "Uncategorized"}</div>
            {objects.filter((o) => (o.category ?? "") === c).map((o) => (
              <button key={o.id} className={`me-object${o.id === chosen ? " selected" : ""}`} onClick={() => setChosen(o.id)}>
                {o.name} <span className="muted">{o.size[0]}×{o.size[1]}</span>
              </button>
            ))}
          </div>
        ))}
      </section>
      {object && (
        <section className="me-section">
          <h4>{object.name}</h4>
          <div className="me-row"><label>Footprint</label><span>{object.size[0]} × {object.size[1]} tiles</span></div>
          <div className="me-row"><label>Triangles</label><span>{object.triangles ?? "?"}</span></div>
          <div className="me-row"><label>Textures</label><span className="me-mono">{(object.textures ?? []).map((t) => t.slice(t.indexOf("/") + 1, -4)).join(", ")}</span></div>
          <div className="me-row"><label>Collision</label>
            <span className="me-mono">{(object.collision ?? []).map((r) => r.map((v) => (v === null ? "·" : `0x${(v >>> 0).toString(16)}`)).join(" ")).join(" / ")}</span>
          </div>
          <div className="me-actions">
            <label className="ow-check"><input type="checkbox" checked={placing} onChange={(e) => setPlacing(e.target.checked)} /> Place it where I click</label>
            <button className="danger" onClick={() => onDelete(object.id)} disabled={busy}>Delete from the library</button>
          </div>
          <p className="muted ow-note">On an existing chunk: click the tile its north-west corner goes on. Its faces join the chunk's model, standing on
            that tile's ground, and its collision is painted under it; Ctrl+Z undoes the model, and Revert the collision. On a painted map,
            place it in the Paint tab instead, where it stays an object to drag.</p>
        </section>
      )}
      {missing.length > 0 && (
        <section className="me-section">
          <p className="ow-note">{missing.length} texture(s) aren't in every season's set of this area.</p>
          <div className="me-actions"><button className="primary" disabled={busy} onClick={onImport}>Import them into the area's sets</button></div>
        </section>
      )}
    </>
  );
}
