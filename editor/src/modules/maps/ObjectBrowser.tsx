// The object library's browser (res/paperwhite2/map_objects/): every object with a preview of its model, its name and
// category, grouped or filtered by category; each can be opened in a viewer with its data, renamed and given another
// category. A rename changes the name shown, not the object's folder, which paintings place it by.

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { documents } from "../../documents.ts";
import { fromPlain, toPlain } from "../../../shared/json.ts";
import { objectModel } from "./ChunkScene.ts";
import type { LibraryObject } from "./painting.ts";

const objectFile = (id: string) => `res/paperwhite2/map_objects/${id}/object.json`;

/** Draws an object's model as seen from above at an angle, framed to fit: a scene, a camera and its distance. */
function framed(model: THREE.Object3D, aspect: number) {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(1, 2, 1.5);
  scene.add(sun);
  const copy = model.clone();
  scene.add(copy);
  const box = new THREE.Box3().setFromObject(copy);
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length() || 16;
  const camera = new THREE.PerspectiveCamera(35, aspect, 0.5, size * 20);
  camera.position.copy(centre).add(new THREE.Vector3(0.6, 0.8, 1).normalize().multiplyScalar(size * 1.6));
  camera.lookAt(centre);
  return { scene, camera, centre };
}

let thumbRenderer: THREE.WebGLRenderer | null = null;
const thumbs = new Map<string, Promise<string | null>>();
/** An object's preview as an image (made once, by one renderer kept for previews). */
function thumbnail(id: string): Promise<string | null> {
  if (!thumbs.has(id)) {
    thumbs.set(id, objectModel(id).then((model) => {
      if (!model) return null;
      thumbRenderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      thumbRenderer.setSize(128, 128);
      const { scene, camera } = framed(model, 1);
      thumbRenderer.render(scene, camera);
      return thumbRenderer.domElement.toDataURL("image/png");
    }, () => null));
  }
  return thumbs.get(id)!;
}

function Thumb({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { let live = true; thumbnail(id).then((s) => { if (live) setSrc(s); }); return () => { live = false; }; }, [id]);
  return src ? <img className="me-thumb" src={src} alt="" /> : <span className="me-thumb me-thumb-empty" />;
}

/** Writes an object's name and category into its object.json, as the data tools would. */
async function rewrite(id: string, change: { name?: string; category?: string | null }) {
  const path = objectFile(id);
  const doc = await documents.hold(path);
  const data = toPlain(doc.data) as Record<string, unknown>;
  if (change.name !== undefined) data.name = change.name;
  if (change.category !== undefined) {
    if (change.category) data.category = change.category;
    else delete data.category;
  }
  documents.replace(path, fromPlain(data as never));
  if (!(await documents.save(path))) throw new Error(documents.get(path)?.saveError ?? `${path} didn't save`);
}

export function ObjectBrowser({ objects, chosen, onChoose, onClose, onChanged }: {
  objects: LibraryObject[];
  chosen?: string;
  /** Choosing an object (to place it), where the browser was opened to choose one. */
  onChoose?(id: string): void;
  onClose(): void;
  /** The library changed on disk (a rename or a new category): read it again. */
  onChanged(): void;
}) {
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState("");
  const [group, setGroup] = useState(true);
  const [viewing, setViewing] = useState<LibraryObject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const categories = useMemo(() => [...new Set(objects.map((o) => o.category ?? ""))].sort(), [objects]);
  const shown = objects.filter((o) => (!category || (o.category ?? "") === (category === "—" ? "" : category))
    && (!filter || `${o.name} ${o.id} ${o.category ?? ""}`.toLowerCase().includes(filter.toLowerCase())));
  const groups = group ? categories.filter((c) => shown.some((o) => (o.category ?? "") === c)) : [null];

  const act = async (fn: () => Promise<void>) => {
    try { setError(null); await fn(); onChanged(); } catch (e) { setError((e as Error).message); }
  };
  const rename = (o: LibraryObject) => {
    const name = window.prompt(`A new name for ${o.name} (its folder stays ${o.id}):`, o.name);
    if (name && name.trim() && name.trim() !== o.name) act(() => rewrite(o.id, { name: name.trim() }));
  };
  const recategorize = (o: LibraryObject) => {
    const c = window.prompt(`A category for ${o.name} (one of ${categories.filter(Boolean).join(", ") || "none yet"}, or a new one; empty for none):`, o.category ?? "");
    if (c !== null && c.trim() !== (o.category ?? "")) act(() => rewrite(o.id, { category: c.trim() || null }));
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="ow-picker" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ow-picker-head">
          <strong>Object library</strong>
          <input className="filter" placeholder="Filter by name or category" value={filter} onChange={(e) => setFilter(e.target.value)} autoFocus />
          <label>Category <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">all</option>
            {categories.map((c) => <option key={c || "—"} value={c || "—"}>{c || "uncategorized"}</option>)}
          </select></label>
          <label className="ow-check"><input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} /> group by category</label>
          <span className="muted">{shown.length} of {objects.length}</span>
          <button onClick={onClose}>Close</button>
        </div>
        {error && <p className="ow-note">{error}</p>}
        <div className="me-browser-body">
          {groups.map((g) => (
            <div key={g ?? "all"}>
              {g !== null && <h4 className="me-browser-group">{g || "Uncategorized"}</h4>}
              <div className="ow-picker-grid">
                {shown.filter((o) => g === null || (o.category ?? "") === g).map((o) => (
                  <div key={o.id} className={`ow-picker-item me-object-card${o.id === chosen ? " selected" : ""}`}>
                    <button className="me-card-pick" onClick={() => (onChoose ? onChoose(o.id) : setViewing(o))}
                            title={onChoose ? "Choose it" : "Open it in the viewer"}>
                      <Thumb id={o.id} />
                      <span className="ow-picker-name">{o.name}</span>
                      <span className="muted ow-picker-number">{o.category ?? "uncategorized"} · {o.size[0]}×{o.size[1]}</span>
                    </button>
                    <span className="me-card-actions">
                      <button onClick={() => setViewing(o)} title="The viewer, with its data">View</button>
                      <button onClick={() => rename(o)}>Rename</button>
                      <button onClick={() => recategorize(o)}>Category</button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!shown.length && <p className="muted ow-note">No objects{filter || category ? " match" : " yet: save one from the Faces tab"}.</p>}
        </div>
      </div>
      {viewing && <ObjectViewer object={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

/** One object in a 3D view to turn and zoom, with its data. */
function ObjectViewer({ object, onClose }: { object: LibraryObject; onClose(): void }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let live = true;
    let frame = 0;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setClearColor(0x1b1d22);
    el.appendChild(renderer.domElement);
    objectModel(object.id).then((model) => {
      if (!live || !model) return;
      const { scene, camera, centre } = framed(model, el.clientWidth / el.clientHeight);
      scene.add(new THREE.GridHelper(Math.max(object.size[0], object.size[1]) * 16 * 2, Math.max(object.size[0], object.size[1]) * 2, 0x555b66, 0x33373e));
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(centre);
      controls.update();
      const draw = () => { if (el.clientWidth) renderer.render(scene, camera); frame = requestAnimationFrame(draw); };
      draw();
    });
    return () => { live = false; cancelAnimationFrame(frame); renderer.dispose(); el.removeChild(renderer.domElement); };
  }, [object.id]);
  const collision = (object.collision ?? []).map((r) => r.map((v) => (v === null ? "·" : `0x${(v >>> 0).toString(16)}`)).join(" ")).join("\n");
  return (
    <div className="overlay" onMouseDown={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="ow-picker me-viewer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ow-picker-head"><strong>{object.name}</strong><span className="muted">{object.id}</span><span className="spacer" />
          <button onClick={onClose}>Close</button></div>
        <div className="me-viewer-body">
          <div className="me-viewer-view" ref={host} />
          <section className="me-section me-viewer-data">
            <div className="me-row"><label>Name</label><span>{object.name}</span></div>
            <div className="me-row"><label>Folder</label><span className="me-mono">{object.id}</span></div>
            <div className="me-row"><label>Category</label><span>{object.category ?? "uncategorized"}</span></div>
            <div className="me-row"><label>Footprint</label><span>{object.size[0]} × {object.size[1]} tiles</span></div>
            <div className="me-row"><label>Triangles</label><span>{object.triangles ?? "?"}</span></div>
            <div className="me-row"><label>Textures</label><span className="me-mono">{(object.textures ?? []).join("\n")}</span></div>
            <div className="me-row"><label>Collision</label><pre className="me-mono">{collision || "none"}</pre></div>
          </section>
        </div>
      </div>
    </div>
  );
}
