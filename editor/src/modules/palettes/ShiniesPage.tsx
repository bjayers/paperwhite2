// Every Pokémon's normal and shiny colors side by side: each species' and form's front sprite (front_single.png) in its
// normal.pal and its shiny.pal, the shinies whose colors are the same as the normal ones found, and a click opens the
// shiny palette on the Palettes page with the normal one beside it.

import { useEffect, useMemo, useState } from "react";
import { api } from "../../api.ts";
import type { Constants } from "../../../shared/schema.ts";
import { PalettePreview } from "./PaletteEditor.tsx";
import { sameColor, snap, type Rgb } from "./pal.ts";
import { readIndexedPng, type IndexedImage } from "./png.ts";

const PAGE_SIZE = 48;

interface Pair {
  /** The folder of its sprites: "res/pokemon/sawsbuck/form_1". */
  folder: string;
  label: string;
  number: number;
  normal: Rgb[];
  shiny: Rgb[];
  /** How many colors the shiny palette changes, as the DS shows them. */
  changed: number;
}

type Show = "all" | "same" | "changed";

const images = new Map<string, Promise<IndexedImage>>();
function spriteOf(folder: string): Promise<IndexedImage> {
  if (!images.has(folder)) images.set(folder, api.asset(`${folder}/front_single.png`).then(readIndexedPng));
  return images.get(folder)!;
}

function Card({ pair, onOpen }: { pair: Pair; onOpen(path: string): void }) {
  const [image, setImage] = useState<IndexedImage | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    spriteOf(pair.folder).then((i) => live && setImage(i), () => live && setMissing(true));
    return () => { live = false; };
  }, [pair.folder]);
  return (
    <div className={`shiny-card${pair.changed === 0 ? " same" : ""}`}>
      <div className="shiny-title">
        <span className="muted">{pair.number || ""}</span> <strong>{pair.label}</strong>
      </div>
      <div className="shiny-sprites">
        {image ? (
          <>
            <PalettePreview image={image} colors={pair.normal.map(snap)} offset={0} zoom={1} transparent highlight={null} />
            <PalettePreview image={image} colors={pair.shiny.map(snap)} offset={0} zoom={1} transparent highlight={null} />
          </>
        ) : <span className="muted">{missing ? "No front sprite" : "…"}</span>}
      </div>
      <div className="shiny-foot">
        <span className={pair.changed === 0 ? "pal-error" : "muted"}>
          {pair.changed === 0 ? "Same as normal" : `${pair.changed} color${pair.changed === 1 ? "" : "s"} changed`}
        </span>
        <button className="link" onClick={() => onOpen(`${pair.folder}/shiny.pal`)}>Edit shiny</button>
      </div>
    </div>
  );
}

export function ShiniesPage({ constants, onOpenPalette }: { constants: Constants; onOpenPalette(path: string): void }) {
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [page, setPage] = useState(0);

  useEffect(() => {
    // Every color line of every normal and shiny palette in one request
    api.scan("res/pokemon/**/*.pal", "^\\d+ \\d+ \\d+$").then((lines) => {
      const byFile = new Map<string, Rgb[]>();
      for (const { path, text } of lines) {
        // The musical's sprites are another sprite's, with its own palettes
        if (!/\/(normal|shiny)\.pal$/.test(path) || path.includes("/musical/")) continue;
        if (!byFile.has(path)) byFile.set(path, []);
        byFile.get(path)!.push(text.split(" ").map(Number) as Rgb);
      }
      const found: Pair[] = [];
      for (const [path, normal] of byFile) {
        if (!path.endsWith("/normal.pal")) continue;
        const folder = path.slice(0, -"/normal.pal".length);
        const shiny = byFile.get(`${folder}/shiny.pal`);
        if (!shiny) continue;
        const parts = folder.split("/").slice(2);
        const species = parts[0];
        const number = constants.get(`SPECIES_${species.toUpperCase()}`) ?? 0;
        const label = species.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") +
          (parts.length > 1 ? ` (${parts.slice(1).join(" ").replace(/_/g, " ")})` : "");
        const changed = normal.filter((c, i) => !shiny[i] || !sameColor(snap(c), snap(shiny[i]))).length;
        found.push({ folder, label, number, normal, shiny, changed });
      }
      // By number, the sprites of no species (the Pokéstar Studios' props, the placeholder) after them
      found.sort((a, b) => (a.number || 1e9) - (b.number || 1e9) || a.folder.localeCompare(b.folder));
      setPairs(found);
    }).catch((e) => setError((e as Error).message));
  }, [constants]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (pairs ?? []).filter((p) => (show === "all" || (show === "same") === (p.changed === 0)) &&
      (!q || p.label.toLowerCase().includes(q) || String(p.number) === q));
  }, [pairs, filter, show]);
  useEffect(() => setPage(0), [filter, show]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const same = pairs?.filter((p) => p.changed === 0).length ?? 0;

  if (error) return <div className="pal-empty pal-error">{error}</div>;
  return (
    <div className="pal-main shiny-page">
      <header className="pal-header">
        <h2>Shinies</h2>
        <input className="filter" placeholder="Filter by name or number…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <select value={show} onChange={(e) => setShow(e.target.value as Show)}>
          <option value="all">Every Pokémon and form ({pairs?.length ?? 0})</option>
          <option value="same">Shiny the same as normal ({same})</option>
          <option value="changed">Shiny different ({(pairs?.length ?? 0) - same})</option>
        </select>
        <span className="spacer" />
        <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>‹</button>
        <span className="muted">Page {page + 1} of {pages}</span>
        <button onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}>›</button>
      </header>
      <div className="pal-body">
        {!pairs && <p className="muted">Reading the palettes…</p>}
        <p className="muted pal-hint shiny-hint">Each front sprite in its normal colors, then its shiny ones, as the DS shows them. <b>Edit shiny</b> opens
          the shiny palette with the normal one beside it.</p>
        <div className="shiny-grid">
          {shown.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((p) => <Card key={p.folder} pair={p} onOpen={onOpenPalette} />)}
        </div>
      </div>
    </div>
  );
}
