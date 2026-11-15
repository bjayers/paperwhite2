// The Shop Editor: the goods of every shop that Scrcmd_Shop_CallFriendlyShopBuy opens (res/field/shops/,
// tools/data/shop_data.py, docs/data.md's Shops). The list groups them as the game does: the Poké Mart, whose list grows
// with the badges (poke_mart.json's tiers), the fixed marts by their group (marts.json: the Pokémon Centers' second
// clerks, Shopping Mall Nine's counters, Driftveil's market), the BP exchange (bp_shops.json), the move tutors
// (move_tutors.json) and the unused special marts. A shop's page lists its goods with item or move pickers, the price
// (the item's own for a mart, the entry's for BP and shards), and drag to reorder, add and remove. The shops' kinds and
// limits come from the schemas; only how shops work is the game's C, which this editor doesn't change.
//
// A tutor's list is in bit order (a move's place is its bit in a species' tutor word, which species_data.py packs from
// the species' learnset.by_tutor), and the menu's order is each move's menu_position: dragging changes the menu order
// only; adding puts a move at the end of both. A move taken out of a list (or replaced) must leave the species' lists,
// so the editor offers to change those species' files as well, and saves them with the shops.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../../api.ts";
import { documents, useDocuments } from "../../documents.ts";
import type { JsonMap, JsonValue } from "../../../shared/json.ts";
import type { Schema } from "../../../shared/schema.ts";
import { navigate, useToolParams } from "../../navigation.ts";
import { SearchSelect, type Option } from "../../shell/SearchSelect.tsx";
import { DocForm, schemaAt, useHeld } from "../followers/DocForm.tsx";
import { constantLabel, isHiddenConstant } from "../schema-form/form.tsx";
import type { ToolProps } from "../types.ts";
import { useToolActive } from "../active.ts";

const DIR = "res/field/shops";
const FILES = {
  mart: `${DIR}/poke_mart.json`,
  marts: `${DIR}/marts.json`,
  special: `${DIR}/special_marts.json`,
  bp: `${DIR}/bp_shops.json`,
  tutors: `${DIR}/move_tutors.json`,
} as const;
const SPECIES_SCHEMA = "res/pokemon/species.schema.json";
// Paper White 2's build sells the Shiny Candy after this mart's items (SHOP_ID_VIRBANK_CITY in src/ov036/scrcmd_shop.c)
const VIRBANK_CITY = 22;
// marts.json's groups (its schema's enum), as the list shows them
const GROUP_TITLES: Record<string, string> = {
  pokemon_center: "Pokémon Centers (second clerk)",
  shopping_mall_nine: "Shopping Mall Nine (department store)",
  market: "Markets",
};

const map = (v: JsonValue | undefined | null): JsonMap => (v instanceof Map ? v : new Map<string, JsonValue>());
const list = (v: JsonValue | undefined | null): JsonValue[] => (Array.isArray(v) ? v : []);
const str = (v: JsonValue | undefined) => (typeof v === "string" ? v : "");
const num = (v: JsonValue | undefined) => (typeof v === "number" ? v : 0);

interface Thing { name: string; price?: number; type?: string; icon?: string | null }

/** The constant of a file named after it: res/items/poke_ball/data.json is ITEM_POKE_BALL. */
const constantOf = (prefix: string, path: string) => `${prefix}${path.split("/").at(-2)!.toUpperCase()}`;

/** The items' names and prices (res/items/), and their icons as the game shows them. */
function useItems(): Map<string, Thing> {
  const [items, setItems] = useState(new Map<string, Thing>());
  useEffect(() => {
    let live = true;
    api.data("res/items/item.schema.json", ["name", "price"]).then((files) => {
      if (!live) return;
      const found = new Map(files.map(({ path, data }) => [constantOf("ITEM_", path), { name: String(data.name ?? ""), price: Number(data.price ?? 0), icon: null } as Thing]));
      setItems(found);
      api.itemIcons().then((icons) => {
        if (!live) return;
        const next = new Map(found);
        for (const i of icons.items) {
          const t = next.get(i.constant);
          if (t) next.set(i.constant, { ...t, icon: i.preview });
        }
        setItems(next);
      }, () => undefined);
    }, () => undefined);
    return () => { live = false; };
  }, []);
  return items;
}

/** The moves' names and types (res/moves/). */
function useMoves(): Map<string, Thing> {
  const [moves, setMoves] = useState(new Map<string, Thing>());
  useEffect(() => {
    api.data("res/moves/move.schema.json", ["name", "type"]).then((files) => setMoves(new Map(files.map(({ path, data }) =>
      [constantOf("MOVE_", path), { name: String(data.name ?? ""), type: String(data.type ?? "") }]))), () => undefined);
  }, []);
  return moves;
}

interface Learner { path: string; species: string; form: number; label: string }

/** Which species' files list each tutor move (learnset.by_tutor), read when a tutor's page first opens. */
function useLearners(wanted: boolean): { byMove: Map<string, Learner[]>; ready: boolean } {
  const [files, setFiles] = useState<{ path: string; moves: string[] }[] | null>(null);
  const { docs } = useDocuments();
  useEffect(() => {
    if (!wanted || files) return;
    api.data(SPECIES_SCHEMA, ["learnset"]).then((found) => setFiles(found.map(({ path, data }) => ({
      path, moves: ((data.learnset as { by_tutor?: string[] } | undefined)?.by_tutor ?? []),
    }))), () => setFiles([]));
  }, [wanted, files]);
  const byMove = useMemo(() => {
    const out = new Map<string, Learner[]>();
    for (const f of files ?? []) {
      // A file open in the editor counts as it is now, unsaved changes and all
      const held = docs.get(f.path)?.data;
      const moves = held ? list(map(map(held).get("learnset")).get("by_tutor")).map(str) : f.moves;
      const parts = f.path.split("/");
      const dir = parts[2];
      const form = /^form_(\d+)\.json$/.exec(parts[3] ?? "")?.[1];
      const species = `SPECIES_${dir.toUpperCase()}`;
      const learner = { path: f.path, species, form: form ? Number(form) : 0, label: `${constantLabel(species, "SPECIES_")}${form ? ` (form ${form})` : ""}` };
      for (const m of moves) {
        if (!out.has(m)) out.set(m, []);
        out.get(m)!.push(learner);
      }
    }
    return out;
  }, [files, docs]);
  return { byMove, ready: files !== null };
}

// The shops in the list

type ShopRef =
  | { kind: "mart" }
  | { kind: "marts"; index: number }
  | { kind: "special"; index: number }
  | { kind: "bp"; index: number }
  | { kind: "tutor"; index: number };

const keyOf = (r: ShopRef) => ("index" in r ? `${r.kind}:${r.index}` : r.kind);
function refOf(key: string | null): ShopRef | null {
  if (!key) return null;
  const [kind, index] = key.split(":");
  if (kind === "mart") return { kind };
  if (["marts", "special", "bp", "tutor"].includes(kind) && index !== undefined) return { kind, index: Number(index) } as ShopRef;
  return null;
}
const fileOf = (r: ShopRef) => (r.kind === "tutor" ? FILES.tutors : FILES[r.kind]);

interface Listed { ref: ShopRef; name: string; detail: string; goods: string[] }

// The goods' rows: a drag handle, the row's controls, and Remove

function GoodsList({ count, limit, rows, onMove, onRemove }: {
  count: number;
  limit: number;
  rows: (i: number) => ReactNode;
  onMove(from: number, to: number): void;
  onRemove(i: number): void;
}) {
  const dragged = useRef<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  if (!count) return <p className="muted shp-empty">Nothing yet: + Add puts the first.</p>;
  return (
    <ol className="shp-goods">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className={`shp-row${over === i ? " shp-over" : ""}${i >= limit ? " shp-past" : ""}`}
            onDragOver={(e) => { if (dragged.current !== null) { e.preventDefault(); setOver(i); } }}
            onDragLeave={() => setOver((o) => (o === i ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              const from = dragged.current;
              dragged.current = null;
              setOver(null);
              if (from !== null && from !== i) onMove(from, i);
            }}>
          <span className="shp-handle" draggable title="Drag to reorder"
                onDragStart={(e) => { dragged.current = i; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); }}
                onDragEnd={() => { dragged.current = null; setOver(null); }}>⠿</span>
          <span className="shp-index muted">{i + 1}</span>
          {rows(i)}
          <button className="shp-remove" title="Remove" onClick={() => onRemove(i)}>✕</button>
        </li>
      ))}
    </ol>
  );
}

function moved<T>(items: T[], from: number, to: number): T[] {
  const copy = [...items];
  const [it] = copy.splice(from, 1);
  copy.splice(to, 0, it);
  return copy;
}

function Icon({ thing }: { thing: Thing | undefined }) {
  return thing?.icon ? <img className="shp-icon" alt="" src={`data:image/png;base64,${thing.icon}`} /> : <span className="shp-icon shp-icon-missing" />;
}

function TypeBadge({ type }: { type: string | undefined }) {
  if (!type) return <span className="shp-type" />;
  return <span className={`shp-type shp-type-${type.replace("TYPE_", "").toLowerCase()}`}>{constantLabel(type, "TYPE_")}</span>;
}

/** A headed section: its title, a one-line summary, its actions at the top, then its rows. */
function Section({ title, summary, actions, children, note }: { title: string; summary?: ReactNode; actions?: ReactNode; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="shp-section">
      <div className="shp-section-head">
        <h3>{title}{summary !== undefined && <span className="muted shp-summary"> {summary}</span>}</h3>
        <span className="spacer" />
        {actions}
      </div>
      {note && <p className="muted shp-note">{note}</p>}
      {children}
    </section>
  );
}

/** A list of items (a mart's, a tier's or a level's), edited as a whole array at a path of a file. */
function ItemList({ path, at, items, limit, options, info, previous, title, summary, extraActions, note }: {
  path: string;
  at: (string | number)[];
  items: string[];
  limit: number;
  options: Option[];
  info: Map<string, Thing>;
  /** The tier before's items, to mark what is new in this one. */
  previous?: string[];
  title: string;
  summary?: string;
  extraActions?: ReactNode;
  note?: ReactNode;
}) {
  const set = (next: string[]) => documents.edit(path, at, next);
  const tms = items.length > 0 && /^ITEM_(TM|HM)\d+$/.test(items[0]);
  const fresh = previous ? items.filter((i) => !previous.includes(i)).length : 0;
  const lead = `${items.length} / ${limit} items${previous ? `, ${fresh} new` : ""}${tms ? " · listed as TMs" : ""}`;
  return (
    <Section title={title} summary={summary ?? lead}
             actions={<>{extraActions}<button onClick={() => set([...items, options.find((o) => !items.includes(o.value))?.value ?? "ITEM_POTION"])} disabled={items.length >= limit}
                                                        title="Adds an item at the end; pick it in its row">+ Add item</button></>}
             note={note}>
      {items.length > limit && <p className="shp-error">The menu holds {limit}: the last {items.length - limit} won't be sold.</p>}
      <GoodsList count={items.length} limit={limit} onMove={(a, b) => set(moved(items, a, b))} onRemove={(i) => set(items.filter((_, j) => j !== i))}
        rows={(i) => {
          const item = items[i];
          const t = info.get(item);
          const twice = items.indexOf(item) !== i;
          return (
            <>
              <Icon thing={t} />
              <span className="shp-picker"><SearchSelect value={item} options={options} invalid={!t} onChange={(v) => set(items.map((x, j) => (j === i ? v : x)))} /></span>
              <span className="shp-price" title="A mart sells an item at the item's own price (its data's price × 10, GetItemParam), less with the Bargain Pass Power">
                {t ? `$${t.price * 10}` : ""}
              </span>
              <span className="shp-tags">
                {previous && !previous.includes(item) && <span className="shp-tag shp-new">new</span>}
                {twice && <span className="shp-tag shp-warn">listed twice</span>}
                {t && t.price === 0 && <span className="shp-tag shp-warn">price 0</span>}
              </span>
            </>
          );
        }} />
    </Section>
  );
}

const tierTitle = (badges: number[]) => {
  if (!badges.length) return "No badge count";
  const lo = Math.min(...badges);
  const hi = Math.max(...badges);
  const word = hi === 1 && lo === 1 ? "badge" : "badges";
  return lo === hi ? `${lo} ${word}` : `${lo}–${hi} badges`;
};

// The pages

function PokeMartPage({ data, schema, options, info }: { data: JsonMap; schema: Schema | null; options: Option[]; info: Map<string, Thing> }) {
  const tiers = list(data.get("tiers")).map(map);
  const limit = (schema && schemaAt(schema, ["tiers", 0, "items"]).maxItems) || 45;
  return (
    <>
      <p className="muted shp-lead">
        Every Pokémon Center's first clerk sells the tier for the player's badge count. Which counts a tier covers is
        the game's table (<code>BADGE_SHOP_DAT_IDS</code>), so each tier's goods are edited here but not its range.
        A later tier replaces the one before it, so keep what should still be sold.
      </p>
      <div className="shp-tiers">
        {tiers.map((tier, i) => {
          const items = list(tier.get("items")).map(str);
          const previous = i > 0 ? list(tiers[i - 1].get("items")).map(str) : undefined;
          return (
            <ItemList key={i} path={FILES.mart} at={["tiers", i, "items"]} items={items} limit={limit} options={options} info={info}
                      previous={previous} title={tierTitle(list(tier.get("badges")).map(num))}
                      extraActions={previous && <button title="Replace this tier's goods with the previous tier's" onClick={() => documents.edit(FILES.mart, ["tiers", i, "items"], [...previous])}>Copy previous</button>} />
          );
        })}
      </div>
    </>
  );
}

function MartPage({ index, data, schema, options, info }: { index: number; data: JsonMap; schema: Schema | null; options: Option[]; info: Map<string, Thing> }) {
  const mart = map(list(data.get("marts"))[index]);
  const shop = num(mart.get("shop"));
  const items = list(mart.get("items")).map(str);
  const max = (schema && schemaAt(schema, ["marts", 0, "items"]).maxItems) || 45;
  const limit = shop === VIRBANK_CITY ? max - 1 : max;
  return (
    <ItemList path={FILES.marts} at={["marts", index, "items"]} items={items} limit={limit} options={options} info={info} title="Goods"
              note={shop === VIRBANK_CITY ? "Paper White 2 also sells the Shiny Candy after these, for testing (scrcmd_shop.c), so this list holds one fewer." : undefined} />
  );
}

function SpecialMartPage({ index, data, options, info }: { index: number; data: JsonMap; options: Option[]; info: Map<string, Thing> }) {
  const mart = map(list(data.get("special_marts"))[index]);
  const levels = list(mart.get("levels")).map((l) => list(l).map(str));
  return (
    <>
      <p className="shp-warn-box">
        No script opens this shop in White 2, and its lists are empty: they are kept so the archive is whole. Its
        level follows the game's key-system progress (<code>KeyDataSave_GetProgress</code>). A script would have to
        open shop {num(mart.get("shop"))} for these goods to be seen.
      </p>
      {levels.map((items, i) => (
        <ItemList key={i} path={FILES.special} at={["special_marts", index, "levels", i]} items={items} limit={45} options={options} info={info} title={`Level ${i + 1}`} />
      ))}
    </>
  );
}

function BPShopPage({ index, data, schema, options, info }: { index: number; data: JsonMap; schema: Schema | null; options: Option[]; info: Map<string, Thing> }) {
  const at = ["shops", index, "items"];
  const entries = list(map(list(data.get("shops"))[index]).get("items")).map(map);
  const itemsSchema = schema ? schemaAt(schema, ["shops", 0, "items"]) : null;
  const limit = itemsSchema?.maxItems ?? 45;
  const priceMax = (schema && schemaAt(schema, ["shops", 0, "items", 0, "price"]).maximum) || 9999;
  const set = (next: JsonMap[]) => documents.edit(FILES.bp, at, next);
  const entry = (item: string, price: number): JsonMap => new Map<string, JsonValue>([["item", item], ["price", price]]);
  return (
    <Section title="Goods" summary={`${entries.length} / ${limit} items, priced in BP`}
             actions={<button disabled={entries.length >= limit} onClick={() => set([...entries, entry("ITEM_RARE_CANDY", 1)])}>+ Add item</button>}>
      <GoodsList count={entries.length} limit={limit} onMove={(a, b) => set(moved(entries, a, b))}
        onRemove={(i) => { if (entries.length > 1) set(entries.filter((_, j) => j !== i)); else alert("A BP shop needs at least one item."); }}
        rows={(i) => {
          const e = entries[i];
          const item = str(e.get("item"));
          const t = info.get(item);
          return (
            <>
              <Icon thing={t} />
              <span className="shp-picker"><SearchSelect value={item} options={options} invalid={!t} onChange={(v) => set(entries.map((x, j) => (j === i ? entry(v, num(x.get("price"))) : x)))} /></span>
              <label className="shp-price-input">
                <input type="number" min={1} max={priceMax} value={num(e.get("price"))}
                       onChange={(ev) => set(entries.map((x, j) => (j === i ? entry(item, Math.max(1, Math.min(priceMax, Math.round(Number(ev.target.value) || 1)))) : x)))} />
                <span className="muted">BP</span>
              </label>
              <span className="shp-tags">{entries.findIndex((x) => str(x.get("item")) === item) !== i && <span className="shp-tag shp-warn">listed twice</span>}</span>
            </>
          );
        }} />
    </Section>
  );
}

function TutorPage({ index, data, schema, moveOptions, moves, learners, touched }: {
  index: number;
  data: JsonMap;
  schema: Schema | null;
  moveOptions: Option[];
  moves: Map<string, Thing>;
  learners: { byMove: Map<string, Learner[]>; ready: boolean };
  touched: Set<string>;
}) {
  const tutor = map(list(data.get("tutors"))[index]);
  const at = ["tutors", index, "moves"];
  const entries = list(tutor.get("moves")).map(map);
  const limit = (schema && schemaAt(schema, ["tutors", 0, "moves"]).maxItems) || 32;
  const priceMax = (schema && schemaAt(schema, ["tutors", 0, "moves", 0, "price"]).maximum) || 999;
  const shard = str(tutor.get("shard"));
  // The menu's order: the bits sorted by their menu places
  const menu = entries.map((_, bit) => bit).sort((a, b) => num(entries[a].get("menu_position")) - num(entries[b].get("menu_position")));
  const entry = (move: string, price: number, place: number): JsonMap => new Map<string, JsonValue>([["move", move], ["price", price], ["menu_position", place]]);
  const set = (next: JsonMap[]) => documents.edit(FILES.tutors, at, next);
  const [open, setOpen] = useState<string | null>(null);

  /** Changes the species' files that list a move: drops it, or names another move in its place. */
  const changeLearners = async (move: string, to: string | null) => {
    for (const l of learners.byMove.get(move) ?? []) {
      const doc = documents.get(l.path) ?? await documents.hold(l.path);
      const by = list(map(map(doc.data).get("learnset")).get("by_tutor")).map(str);
      const next = to === null || by.includes(to) ? by.filter((m) => m !== move) : by.map((m) => (m === move ? to : m));
      documents.edit(l.path, ["learnset", "by_tutor"], next);
      touched.add(l.path);
    }
  };
  /** Asks before a move leaves this list while species learn it; false to keep it. */
  const confirmLeaving = async (move: string, to: string | null) => {
    const who = learners.byMove.get(move) ?? [];
    if (!who.length) return true;
    const names = who.slice(0, 8).map((l) => l.label).join(", ") + (who.length > 8 ? ` and ${who.length - 8} more` : "");
    const what = to ? `learn ${constantLabel(to, "MOVE_")} from this tutor instead` : "lose it from their tutor moves";
    if (!confirm(`${who.length} species learn ${constantLabel(move, "MOVE_")} here (${names}). They will ${what}, in their files, saved with the shops. Go on?`)) return false;
    await changeLearners(move, to);
    return true;
  };

  const add = () => {
    const taken = new Set(entries.map((e) => str(e.get("move"))));
    const first = moveOptions.find((o) => !taken.has(o.value))?.value ?? "MOVE_POUND";
    set([...entries, entry(first, 2, entries.length)]);
  };
  const remove = async (bit: number) => {
    if (entries.length <= 1) return alert("A tutor needs at least one move.");
    const e = entries[bit];
    if (!learners.ready) return alert("Still reading which species learn it; try again in a moment.");
    if (!await confirmLeaving(str(e.get("move")), null)) return;
    const place = num(e.get("menu_position"));
    set(entries.filter((_, j) => j !== bit).map((x) => {
      const p = num(x.get("menu_position"));
      return p > place ? entry(str(x.get("move")), num(x.get("price")), p - 1) : x;
    }));
  };
  const replace = async (bit: number, move: string) => {
    const e = entries[bit];
    const old = str(e.get("move"));
    if (move === old) return;
    if (entries.some((x, j) => j !== bit && str(x.get("move")) === move)) return alert(`${constantLabel(move, "MOVE_")} is already in this tutor's list.`);
    if (!learners.ready) return alert("Still reading which species learn it; try again in a moment.");
    if (!await confirmLeaving(old, move)) return;
    set(entries.map((x, j) => (j === bit ? entry(move, num(x.get("price")), num(x.get("menu_position"))) : x)));
  };
  const reorder = (from: number, to: number) => {
    const order = moved(menu, from, to);
    const placeOf = new Map(order.map((bit, place) => [bit, place]));
    set(entries.map((x, bit) => entry(str(x.get("move")), num(x.get("price")), placeOf.get(bit)!)));
  };

  return (
    <>
      <p className="muted shp-lead">
        This tutor's moves cost {constantLabel(shard, "ITEM_")}s. A move's place in the tutor's list (its <b>bit</b>, shown as #)
        is what a species' tutor moves name, so dragging only changes the menu's order. Adding a move here teaches it to
        no one until a species lists it in its <b>Tutor</b> moves (the Pokémon Editor's Moves); taking one out also takes it
        out of the species that learn it.
      </p>
      <Section title="Moves" summary={`${entries.length} / ${limit} moves, in menu order`}
               actions={<button disabled={entries.length >= limit} onClick={add}>+ Add move</button>}>
        <GoodsList count={menu.length} limit={limit} onMove={reorder} onRemove={(i) => remove(menu[i])}
          rows={(i) => {
            const bit = menu[i];
            const e = entries[bit];
            const move = str(e.get("move"));
            const m = moves.get(move);
            const who = learners.byMove.get(move) ?? [];
            return (
              <>
                <TypeBadge type={m?.type} />
                <span className="shp-picker"><SearchSelect value={move} options={moveOptions} invalid={!m} onChange={(v) => replace(bit, v)} /></span>
                <label className="shp-price-input">
                  <input type="number" min={1} max={priceMax} value={num(e.get("price"))}
                         onChange={(ev) => set(entries.map((x, j) => (j === bit ? entry(move, Math.max(1, Math.min(priceMax, Math.round(Number(ev.target.value) || 1))), num(x.get("menu_position"))) : x)))} />
                  <span className="muted">shards</span>
                </label>
                <span className="shp-bit muted" title="Its bit in a species' tutor word: its place in the tutor's list">#{bit}</span>
                <button className="shp-learners" onClick={() => setOpen(open === move ? null : move)} disabled={!learners.ready}
                        title="The species whose tutor moves list it">
                  {learners.ready ? `${who.length} species` : "…"}
                </button>
              </>
            );
          }} />
        {open && (
          <div className="shp-learner-list">
            <h4>Species that learn {constantLabel(open, "MOVE_")} here <span className="muted">(their Tutor moves)</span></h4>
            {(learners.byMove.get(open) ?? []).length === 0
              ? <p className="muted">None yet. Add it to a species' Tutor moves in the Pokémon Editor.</p>
              : <div className="shp-learner-links">{(learners.byMove.get(open) ?? []).map((l) => (
                  <button key={l.path} className="link" onClick={() => navigate("pokemon", { species: l.species, form: l.form })}>{l.label}{documents.get(l.path)?.dirty ? " •" : ""}</button>
                ))}</div>}
          </div>
        )}
      </Section>
      <p className="muted shp-note">The menu shows {constantLabel(shard, "ITEM_")}s as its currency; prices are 1 to {priceMax} shards.</p>
    </>
  );
}

// The editor

export function ShopEditor({ constants }: ToolProps) {
  const toolActive = useToolActive();
  const mart = useHeld(FILES.mart);
  const marts = useHeld(FILES.marts);
  const special = useHeld(FILES.special);
  const bp = useHeld(FILES.bp);
  const tutors = useHeld(FILES.tutors);
  const held = { mart, marts, special, bp, tutors };
  const items = useItems();
  const moves = useMoves();
  const [chosen, setChosen] = useState<string | null>("mart");
  const [filter, setFilter] = useState("");
  const [showUnused, setShowUnused] = useState(false);
  const [allFields, setAllFields] = useState(false);
  const touched = useRef(new Set<string>()).current;
  const ref = refOf(chosen);
  const learners = useLearners(ref?.kind === "tutor");
  const { docs } = useDocuments();
  const params = useToolParams("shops");
  useEffect(() => {
    const shop = params.get("shop");
    if (shop) setChosen(shop);
  }, [params]);

  const itemOptions = useMemo<Option[]>(() => [...items.entries()]
    .filter(([c]) => c !== "ITEM_NONE" && constants.has(c))
    .sort((a, b) => (constants.get(a[0]) ?? 0) - (constants.get(b[0]) ?? 0))
    .map(([c, t]) => ({ value: c, label: t.name || constantLabel(c, "ITEM_"), detail: String(constants.get(c)) })), [items, constants]);
  const moveOptions = useMemo<Option[]>(() => [...constants]
    .filter(([c]) => c.startsWith("MOVE_") && c !== "MOVE_NONE" && moves.has(c) && !isHiddenConstant(c))
    .sort((a, b) => a[1] - b[1])
    .map(([c, v]) => ({ value: c, label: moves.get(c)?.name || constantLabel(c, "MOVE_"), detail: String(v) })), [moves, constants]);

  const listed = useMemo(() => {
    const groups: { title: string; shops: Listed[]; unused?: boolean }[] = [];
    if (mart.data) {
      const tiers = list(map(mart.data).get("tiers")).map(map);
      groups.push({ title: "Poké Mart (by badges)", shops: [{ ref: { kind: "mart" }, name: str(map(mart.data).get("name")) || "Poké Mart", detail: `${tiers.length} tiers`, goods: tiers.flatMap((t) => list(t.get("items")).map(str)) }] });
    }
    if (marts.data) {
      const byGroup = new Map<string, Listed[]>();
      list(map(marts.data).get("marts")).map(map).forEach((m, index) => {
        const g = str(m.get("group"));
        if (!byGroup.has(g)) byGroup.set(g, []);
        const goods = list(m.get("items")).map(str);
        byGroup.get(g)!.push({ ref: { kind: "marts", index }, name: str(m.get("name")), detail: `${goods.length} items`, goods });
      });
      for (const [g, shops] of byGroup) groups.push({ title: GROUP_TITLES[g] ?? g, shops: shops.sort((a, b) => a.name.localeCompare(b.name)) });
    }
    if (bp.data) groups.push({ title: "BP exchange", shops: list(map(bp.data).get("shops")).map(map).map((s, index) => {
      const goods = list(s.get("items")).map((e) => str(map(e).get("item")));
      return { ref: { kind: "bp", index }, name: str(s.get("name")), detail: `${goods.length} items`, goods };
    }) });
    if (tutors.data) groups.push({ title: "Move tutors (shards)", shops: list(map(tutors.data).get("tutors")).map(map).map((t, index) => {
      const goods = list(t.get("moves")).map((e) => str(map(e).get("move")));
      return { ref: { kind: "tutor", index }, name: str(t.get("name")), detail: `${goods.length} moves`, goods };
    }) });
    if (special.data) groups.push({ title: "Unused special marts", unused: true, shops: list(map(special.data).get("special_marts")).map(map).map((s, index) => {
      const goods = list(s.get("levels")).flatMap((l) => list(l).map(str));
      return { ref: { kind: "special", index }, name: `Shop ${num(s.get("shop"))}`, detail: goods.length ? `${goods.length} items` : "empty", goods };
    }) });
    return groups;
  }, [mart.data, marts.data, bp.data, tutors.data, special.data]);

  const nameOf = (c: string) => (items.get(c) ?? moves.get(c))?.name ?? "";
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return listed.map((g) => ({ ...g, shops: g.shops.filter((s) => !q || s.name.toLowerCase().includes(q) ||
      s.goods.some((c) => nameOf(c).toLowerCase().includes(q) || c.toLowerCase().includes(q))) }))
      .filter((g) => g.shops.length && (!g.unused || showUnused || q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listed, filter, showUnused, items, moves]);

  const ownPaths = (p: string) => p.startsWith(`${DIR}/`) || touched.has(p);
  const unsaved = [...docs.values()].filter((d) => d.dirty && ownPaths(d.path));
  const save = useCallback(async () => {
    for (const p of documents.dirtyPaths().filter(ownPaths)) await documents.save(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const currentFile = ref ? fileOf(ref) : null;
  useEffect(() => {
    if (!toolActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "s") { e.preventDefault(); e.stopPropagation(); save(); }
      else if ((key === "z" || key === "y") && currentFile && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault(); e.stopPropagation();
        if (key === "y" || e.shiftKey) documents.redo(currentFile); else documents.undo(currentFile);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [save, currentFile, toolActive]);

  const current = ref ? listed.flatMap((g) => g.shops).find((s) => keyOf(s.ref) === chosen) : undefined;
  const page = () => {
    if (!ref) return <p className="muted shp-empty">Choose a shop.</p>;
    const h = ref.kind === "tutor" ? tutors : held[ref.kind];
    if (h.error) return <p className="shp-error">{fileOf(ref)}: {h.error}</p>;
    if (!h.data) return <p className="muted">Reading {fileOf(ref)}…</p>;
    const data = map(h.data);
    switch (ref.kind) {
      case "mart": return <PokeMartPage data={data} schema={h.schema} options={itemOptions} info={items} />;
      case "marts": return <MartPage index={ref.index} data={data} schema={h.schema} options={itemOptions} info={items} />;
      case "special": return <SpecialMartPage index={ref.index} data={data} options={itemOptions} info={items} />;
      case "bp": return <BPShopPage index={ref.index} data={data} schema={h.schema} options={itemOptions} info={items} />;
      case "tutor": return <TutorPage index={ref.index} data={data} schema={h.schema} moveOptions={moveOptions} moves={moves} learners={learners} touched={touched} />;
    }
  };
  // The shop's own record in its file, for its name and the raw form
  const recordAt = ref && ref.kind !== "mart" ? [{ marts: "marts", special: "special_marts", bp: "shops", tutor: "tutors" }[ref.kind], ref.index] : [];
  const shopId = (() => {
    if (!ref) return null;
    if (ref.kind === "mart") return 255;
    const h = ref.kind === "tutor" ? tutors : held[ref.kind];
    return num(map(list(map(h.data).get(String(recordAt[0])))[ref.index]).get("shop"));
  })();
  const named = ref && ref.kind !== "special";

  return (
    <div className="shp-editor">
      <header className="shp-header">
        <h2>Shop Editor</h2>
        <span className="spacer" />
        {unsaved.length > 0 && <span className="muted">{unsaved.length} unsaved</span>}
        <button onClick={() => unsaved.forEach((d) => documents.reload(d.path))} disabled={!unsaved.length}>Revert</button>
        <button className="primary" onClick={save} disabled={!unsaved.length} title="Ctrl+S">Save</button>
      </header>
      {unsaved.filter((d) => d.saveError).map((d) => <div key={d.path} className="shp-error shp-bar">{d.path}: {d.saveError}</div>)}
      <div className="shp-split">
        <div className="shp-list">
          <input className="filter" placeholder="Filter by shop, item or move…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <label className="shp-list-tools muted"><input type="checkbox" checked={showUnused} onChange={(e) => setShowUnused(e.target.checked)} /> Show the unused special marts</label>
          <div className="shp-list-items">
            {shown.map((g) => (
              <div key={g.title}>
                <div className="shp-group">{g.title} <span className="muted">{g.shops.length}</span></div>
                {g.shops.map((s) => (
                  <button key={keyOf(s.ref)} title={s.name} className={`shp-item${keyOf(s.ref) === chosen ? " selected" : ""}`} onClick={() => setChosen(keyOf(s.ref))}>
                    <span className="shp-item-name">{s.name}{docs.get(fileOf(s.ref))?.dirty ? " •" : ""}</span>
                    <span className="muted shp-item-detail">{s.detail}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="shp-detail">
          {ref && (
            <div className="shp-page">
              <div className="shp-top">
                {named
                  ? <input className="shp-name" value={current?.name ?? ""} title="Where the shop is: for you and the editor; the game doesn't show it"
                           onChange={(e) => documents.edit(fileOf(ref), [...recordAt, "name"], e.target.value)} />
                  : <h2>{current?.name}</h2>}
                <span className="muted">Shop {shopId}{ref.kind === "mart" ? " · every Pokémon Center's first clerk" : ""}</span>
              </div>
              {page()}
              <details className="shp-all" open={allFields} onToggle={(e) => setAllFields((e.target as HTMLDetailsElement).open)}>
                <summary>All fields</summary>
                {allFields && <DocForm path={fileOf(ref)} at={recordAt} constants={constants} />}
              </details>
            </div>
          )}
          {!ref && <p className="muted shp-empty">Choose a shop.</p>}
        </div>
      </div>
    </div>
  );
}
