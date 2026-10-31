// The Follower Editor: everything about the Following Pokémon in one place (docs/paperwhite2/following-pokemon.md).
// Pokémon: each species' followers, their sprites and placement (the "follower" object of each field actor), and its
// own dialogue, with the shared rules that name it. Shared dialogue, Item pools and Interactions: the rules every
// follower has, the gifts' and pickups' item lists, and the HeartGold talks. Emotes & balls: the art the follower's
// effects use. Every file is edited through the document store, so it is checked by the build's validator on save.

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api.ts";
import { documents, useDocuments } from "../../documents.ts";
import { toPlain, type JsonValue } from "../../../shared/json.ts";
import type { ToolProps } from "../types.ts";
import { PalettePreview } from "../palettes/PaletteEditor.tsx";
import { parsePal, type Rgb } from "../palettes/pal.ts";
import { readIndexedPng, type IndexedImage } from "../palettes/png.ts";
import { DocForm, useHeld } from "./DocForm.tsx";
import { FOLLOWERS, FOLLOWING, INTERACTIONS, LINE_CHARACTERS, POOLS, SHARED_DIALOGUE, dialoguePath, loadFollowers,
  messagePages, messagesOf, speciesName, spriteFolder, variantLabel, type FollowerSpecies, type Variant } from "./data.ts";

type Page = "pokemon" | "shared" | "pools" | "interactions" | "art";
const PAGES: { id: Page; title: string }[] = [
  { id: "pokemon", title: "Pokémon" },
  { id: "shared", title: "Shared dialogue" },
  { id: "pools", title: "Item pools" },
  { id: "interactions", title: "Interactions" },
  { id: "art", title: "Emotes & balls" },
];

const DIALOGUE_SCHEMA = `${FOLLOWING}/dialogue.schema.json`;
// The compact layout the dialogue files are written in
const DIALOGUE_LAYOUT = { width: 120, indent: 4, compact: true };

/** Whether a file is one of the follower's, which the editor's Save saves. */
const isFollowerFile = (path: string) => path.startsWith(`${FOLLOWING}/`) || path.startsWith(`${FOLLOWERS}/`);

// ---------------------------------------------------------------- Pieces

function Sprite({ variant }: { variant: Variant }) {
  const [image, setImage] = useState<{ image: IndexedImage; colors: Rgb[] } | null>(null);
  const [missing, setMissing] = useState(false);
  const name = spriteFolder(variant);
  useEffect(() => {
    let live = true;
    setImage(null);
    setMissing(false);
    if (!name) return;
    const folder = `${FOLLOWERS}/${name}`;
    Promise.all([api.asset(`${folder}/sprite.png`).then(readIndexedPng), api.file(`${folder}/sprite.pal`)])
      .then(([img, pal]) => live && setImage({ image: img, colors: parsePal(pal.text) }))
      .catch(() => live && setMissing(true));
    return () => { live = false; };
  }, [name]);
  if (!name) return <p className="muted flw-note">Shows {variant.sprite}'s sprite.</p>;
  if (missing) return <p className="muted flw-note">{variant.placeholder ? "A placeholder: no sprite of its own." : "No sprite."}</p>;
  if (!image) return <p className="muted flw-note">Reading the sprite…</p>;
  return (
    <div className="flw-sprite">
      <PalettePreview image={image.image} colors={image.colors} offset={0} zoom={2} transparent highlight={null} />
      {name !== variant.name && <p className="muted flw-note">{variant.name} shares {name}'s sprite ({variant.sprite}).</p>}
    </div>
  );
}

function MessagePreview({ text }: { text: string }) {
  const pages = messagePages(text);
  return (
    <div className="flw-message">
      {pages.map((page, i) => (
        <div key={i} className="flw-message-page">
          {page.lines.map((line, j) => (
            <div key={j} className={`flw-message-line${line.text.length > LINE_CHARACTERS ? " long" : ""}`}
                 title={line.text.length > LINE_CHARACTERS ? "Probably too long for one line" : undefined}>
              {line.text || " "}{line.waits && <span className="flw-wait">▼</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Messages({ path }: { path: string }) {
  const { data } = useHeld(path);
  const messages = useMemo(() => (data !== null ? messagesOf(toPlain(data)) : []), [data]);
  if (!messages.length) return null;
  return (
    <details className="flw-messages">
      <summary>How its {messages.length} messages look <span className="muted">(with Snivy, Rosa, Route 20 and an Oran Berry for the words)</span></summary>
      <div className="flw-message-list">
        {messages.map((m, i) => (
          <div key={i} className="flw-message-item">
            <div className="muted flw-where">{m.where}</div>
            <MessagePreview text={m.text} />
          </div>
        ))}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------- The Pokémon page

function SpeciesPage({ entry, constants, onChanged, open }: {
  entry: FollowerSpecies;
  constants: ToolProps["constants"];
  onChanged(): void;
  open(path: string): void;
}) {
  const shared = useHeld(SHARED_DIALOGUE);
  const { docs } = useDocuments();
  const own = dialoguePath(entry.species);
  const hasOwn = entry.dialogue !== null || docs.has(own);
  const naming = useMemo(() => {
    const plain = shared.data !== null ? (toPlain(shared.data) as Record<string, unknown>) : {};
    const out: string[] = [];
    for (const kind of ["rules", "ambient", "pickup"]) {
      for (const rule of (plain[kind] as Record<string, unknown>[] | undefined) ?? []) {
        const when = rule.when as Record<string, unknown> | undefined;
        const species = when?.species;
        const names = Array.isArray(species) ? species.map((s) => (typeof s === "object" && s ? (s as { species?: string }).species : s)) : [];
        if (names.includes(entry.species)) out.push(`${kind}: ${String(rule.name ?? "(unnamed)")}`);
      }
    }
    return out;
  }, [shared.data, entry.species]);

  const addDialogue = () => {
    const data: JsonValue = new Map<string, JsonValue>([
      ["$schema", "../../dialogue.schema.json"],
      ["species", entry.species],
      ["rules", []],
    ]);
    documents.create(own, DIALOGUE_SCHEMA, data, DIALOGUE_LAYOUT);
    onChanged();
  };

  return (
    <div className="flw-page">
      <h2>#{entry.number} {speciesName(entry.species)}</h2>
      <section className="flw-card">
        <h3>Followers <span className="muted">{entry.variants.length}</span></h3>
        <p className="muted flw-note">Each form, sex and shininess is a follower of its own, a field actor under <code>{FOLLOWERS}/</code>:
          its sprite (colors in Graphics & Palettes, <code>sprite.pal</code>), and how it is drawn and keeps its distance.</p>
        {entry.variants.map((v, i) => (
          <details key={v.name} className="flw-variant" open={i === 0}>
            <summary>
              <strong>{variantLabel(v)}</strong> <span className="muted">{v.name}{v.placeholder ? " · placeholder" : ""}</span>
              <button className="link flw-open" onClick={(e) => { e.preventDefault(); open(v.path); }}>open data.json</button>
            </summary>
            <Sprite variant={v} />
            <DocForm path={v.path} at={["follower"]} constants={constants} hideDescription />
          </details>
        ))}
      </section>
      <section className="flw-card">
        <h3>Its own dialogue</h3>
        {hasOwn ? (
          <>
            <p className="muted flw-note"><code>{own}</code>: its own talk, ambient and pickup rules, beside the shared ones.</p>
            <DocForm path={own} constants={constants} hideDescription />
            <Messages path={own} />
          </>
        ) : (
          <p>{speciesName(entry.species)} has only the shared rules. <button onClick={addDialogue}>Give it its own dialogue</button></p>
        )}
        {naming.length > 0 && (
          <p className="muted flw-note">Shared rules that name it: {naming.join("; ")}.</p>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- The art page

function ArtPage() {
  const [emotes, setEmotes] = useState<string[]>([]);
  const [balls, setBalls] = useState<string[]>([]);
  useEffect(() => {
    api.list(`${FOLLOWING}/emotes/*.png`).then(setEmotes);
    api.list(`${FOLLOWING}/balls/*.png`).then(setBalls);
  }, []);
  const gallery = (paths: string[]) => (
    <div className="flw-gallery">
      {paths.map((p) => (
        <figure key={p}>
          <img className="pal-canvas" src={api.assetUrl(p)} alt="" style={{ width: 64 }} />
          <figcaption className="muted">{p.slice(p.lastIndexOf("/") + 1, -4)}</figcaption>
        </figure>
      ))}
    </div>
  );
  return (
    <div className="flw-page">
      <section className="flw-card">
        <h3>Emotes</h3>
        <p className="muted flw-note">The bubbles over the follower, two frames each, 32×32 in 16 colors (<code>{FOLLOWING}/emotes/</code>, each with its
          <code>.pal</code>, which Graphics & Palettes edits). Their names are what the rules' <code>emote</code> names, from Interactions' bubbles.</p>
        {gallery(emotes)}
      </section>
      <section className="flw-card">
        <h3>Balls</h3>
        <p className="muted flw-note">The follower's own ball as it is sent out and recalled, 16×16 (<code>{FOLLOWING}/balls/</code>).</p>
        {gallery(balls)}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- The frame

export function FollowerEditor({ constants, open }: ToolProps) {
  const [page, setPage] = useState<Page>("pokemon");
  const [list, setList] = useState<FollowerSpecies[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [onlyDialogue, setOnlyDialogue] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { docs } = useDocuments();

  const reload = useCallback(() => {
    loadFollowers(constants).then((l) => {
      setList(l);
      setChosen((c) => c ?? l[0]?.species ?? null);
    }).catch((e: Error) => setError(e.message));
  }, [constants]);
  useEffect(() => { reload(); }, [reload]);

  const dirty = [...docs.values()].filter((d) => d.dirty && isFollowerFile(d.path));
  const failed = [...docs.values()].filter((d) => d.saveError && isFollowerFile(d.path));

  const saveAll = useCallback(async () => {
    const paths = documents.dirtyPaths().filter(isFollowerFile);
    let saved = 0;
    for (const path of paths) if (await documents.save(path)) saved++;
    setMessage(saved === paths.length ? `Saved ${saved} file${saved === 1 ? "" : "s"}.` : `Saved ${saved} of ${paths.length}; see the problems below.`);
    if (paths.some((p) => p.includes("/dialogue/species/"))) reload();
  }, [reload]);

  const revertAll = async () => {
    if (!confirm(`Throw away the changes to ${dirty.length} file${dirty.length === 1 ? "" : "s"}?`)) return;
    for (const d of dirty) {
      if (d.version) await documents.reload(d.path);
      else documents.close(d.path);
    }
  };

  // Keys while the page is open: Ctrl+S saves the follower's files, Ctrl+Z and Ctrl+Y undo and redo the last one changed
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        e.stopPropagation();
        saveAll();
        return;
      }
      if ((key === "z" || key === "y") && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        const target = dirty.at(-1);
        if (!target) return;
        e.preventDefault();
        e.stopPropagation();
        if (key === "y" || e.shiftKey) documents.redo(target.path);
        else documents.undo(target.path);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [saveAll, dirty]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (list ?? []).filter((s) => (!onlyDialogue || s.dialogue) &&
      (!q || speciesName(s.species).toLowerCase().includes(q) || String(s.number) === q));
  }, [list, filter, onlyDialogue]);
  const entry = list?.find((s) => s.species === chosen) ?? null;

  if (error) return <div className="flw-editor"><p className="flw-error">{error}</p></div>;

  return (
    <div className="flw-editor">
      <header className="flw-header">
        <h2>Follower Editor</h2>
        <nav className="view-switch">
          {PAGES.map((p) => <button key={p.id} className={page === p.id ? "active" : ""} onClick={() => setPage(p.id)}>{p.title}</button>)}
        </nav>
        <span className="spacer" />
        {dirty.length > 0 && <span className="muted">{dirty.length} unsaved</span>}
        <button onClick={revertAll} disabled={!dirty.length}>Revert</button>
        <button className="primary" onClick={saveAll} disabled={!dirty.length} title="Ctrl+S">Save</button>
      </header>
      {message && <div className="flw-message-bar">{message} <button className="link" onClick={() => setMessage(null)}>✕</button></div>}
      {failed.map((d) => <div key={d.path} className="flw-error flw-message-bar">{d.path}: {d.saveError}</div>)}

      {page === "pokemon" && (
        <div className="flw-split">
          <div className="flw-list">
            <div className="flw-list-tools">
              <input className="filter" placeholder={`Filter ${list?.length ?? 0} species…`} value={filter} onChange={(e) => setFilter(e.target.value)} />
              <label className="flw-check"><input type="checkbox" checked={onlyDialogue} onChange={(e) => setOnlyDialogue(e.target.checked)} /> With their own dialogue</label>
            </div>
            <div className="flw-list-items">
              {!list && <p className="muted flw-note">Reading the followers…</p>}
              {shown.map((s) => (
                <button key={s.species} className={`flw-item${s.species === chosen ? " selected" : ""}`} onClick={() => setChosen(s.species)}>
                  <span className="muted flw-number">{s.number}</span>
                  <span className="flw-name">{speciesName(s.species)}</span>
                  {s.dialogue && <span className="flw-badge" title="Has its own dialogue">💬</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="flw-detail">
            {entry && <SpeciesPage key={entry.species} entry={entry} constants={constants} onChanged={reload} open={open} />}
          </div>
        </div>
      )}
      {page === "shared" && (
        <div className="flw-scroll"><div className="flw-page">
          <p className="muted flw-note">The rules every follower has (<code>{SHARED_DIALOGUE}</code>). Of the rules that match, the highest priority is kept and one is picked by weight; a
            species' own rules join these. Every rule's <b>when</b> is a condition of the conditions engine, whose subject is the follower.</p>
          <DocForm path={SHARED_DIALOGUE} constants={constants} hideDescription />
          <Messages path={SHARED_DIALOGUE} />
        </div></div>
      )}
      {page === "pools" && (
        <div className="flw-scroll"><div className="flw-page"><DocForm path={POOLS} constants={constants} /></div></div>
      )}
      {page === "interactions" && (
        <div className="flw-scroll"><div className="flw-page"><DocForm path={INTERACTIONS} constants={constants} /></div></div>
      )}
      {page === "art" && <div className="flw-scroll"><ArtPage /></div>}
    </div>
  );
}
