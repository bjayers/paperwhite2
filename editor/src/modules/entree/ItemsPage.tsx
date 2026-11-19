// The Entree page's Items tab: the item table (res/paperwhite2/entralink/items.json, items.schema.json beside it), the
// items a run hands out. A table of its entries (the item with its bag icon, weight, rounds, price and pools), with Add
// at its top; beside it each pool's live chances in a round (model.ts, poolChances), with the Nightmare Ball's rule. Held
// in the document store, so undo, the build's check on Save and changes on disk work as for any file; the page's Save
// saves it.

import { useEffect, useMemo, useState } from "react";
import { api } from "../../api.ts";
import { documents, useDocuments } from "../../documents.ts";
import { type JsonMap, type JsonValue } from "../../../shared/json.ts";
import { validate, type Constants, type Schema } from "../../../shared/schema.ts";
import { SearchSelect } from "../../shell/SearchSelect.tsx";
import { constantLabel, constantOptions } from "../schema-form/form.tsx";
import { NumberBox, Section, Switch } from "./parts.tsx";
import {
  ITEMS, ITEMS_SCHEMA, NIGHTMARE_BALL, POOLS, POOL_NAMES, POOL_NOTES, ROUNDS, ROUND_NOTES, checkItems, newItemEntry, percent, poolChances,
  readItems, type Pool, type Room, type Round,
} from "./model.ts";

const asMap = (v: JsonValue | undefined): JsonMap => (v instanceof Map ? v : new Map());
const asList = (v: JsonValue | undefined): JsonValue[] => (Array.isArray(v) ? v : []);

/** A record with a key set (or removed, for undefined), the keys kept in the schema's order. */
function put(record: JsonMap, key: string, value: JsonValue | undefined, order: string[]): JsonMap {
  const next = new Map(record);
  if (value === undefined) next.delete(key);
  else next.set(key, value);
  const rank = (k: string) => { const i = order.indexOf(k); return i < 0 ? order.length : i; };
  return new Map([...next].sort((a, b) => rank(a[0]) - rank(b[0])));
}

/** The items' bag icons as the game shows them, by constant (null until read, or for an item without one). */
function useItemIcons(): Map<string, string> {
  const [icons, setIcons] = useState(new Map<string, string>());
  useEffect(() => {
    let live = true;
    api.itemIcons().then((all) => {
      if (live) setIcons(new Map(all.items.flatMap((i) => (i.preview ? [[i.constant, i.preview] as [string, string]] : []))));
    }, () => undefined);
    return () => { live = false; };
  }, []);
  return icons;
}

function BagIcon({ item, icons }: { item: string; icons: Map<string, string> }) {
  const icon = icons.get(item);
  return icon ? <img className="en-bag-icon" alt="" src={`data:image/png;base64,${icon}`} /> : <span className="en-bag-icon en-bag-missing" />;
}

export function ItemsPage({ constants, rooms }: { constants: Constants; rooms: { id: string; room: Room }[] }) {
  const { docs } = useDocuments();
  const [schema, setSchema] = useState<Schema | null>(null);
  const [missing, setMissing] = useState(false);
  const [round, setRound] = useState<Round>(1);
  const [catchable, setCatchable] = useState(true);
  const icons = useItemIcons();
  useEffect(() => {
    documents.hold(ITEMS).then(() => setMissing(false), () => setMissing(true));
    api.schema(ITEMS_SCHEMA).then(setSchema, () => undefined);
  }, []);
  const doc = docs.get(ITEMS);
  const data = doc?.data instanceof Map ? doc.data : null;
  const entries = useMemo(() => readItems(data), [data]);
  const problems = useMemo(() => checkItems(entries), [entries]);
  const schemaErrors = useMemo(() => (data && schema ? validate(data, schema, constants) : []), [data, schema, constants]);
  const order = Object.keys(schema?.$defs?.entry?.properties ?? { item: 0, weight: 0, rounds: 0, price: 0, pools: 0 });
  const items = constantOptions(constants, "ITEM_");
  // The rooms' catchable enemies, which the Nightmare Ball's rule looks at
  const catchRooms = rooms.filter((r) => r.room.battles.some((b) => b.enemies.some((e) => e.catch)));
  const maxEntries = schema?.properties?.items?.maxItems ?? 128;

  if (!data) return (
    <div className="en-items-page">
      <Section title="Item table" summary={missing ? "items.json doesn't exist yet" : doc ? "items.json isn't in a layout the editor can write back: edit it as text" : "loading…"}
               actions={missing && <button onClick={() => { documents.create(ITEMS, ITEMS_SCHEMA, new Map<string, JsonValue>([["$schema", "items.schema.json"], ["items", [newItemEntry()]]])); setMissing(false); }}>Make it</button>}>
        <p className="muted small">{ITEMS}: the items item rooms, gift NPCs, shops and the ground hand out.</p>
      </Section>
    </div>
  );

  const list = asList(data.get("items"));
  const setEntries = (next: JsonValue[]) => documents.replace(ITEMS, put(data, "items", next, ["$schema", "items"]));
  const setField = (i: number, key: string, v: JsonValue | undefined) => setEntries(list.map((e, k) => (k === i ? put(asMap(e), key, v, order) : e)));
  const errors = problems.filter((p) => p.severity === "error").length + schemaErrors.length;
  const warnings = problems.length - problems.filter((p) => p.severity === "error").length;
  const ballPools = entries.filter((e) => e.item === NIGHTMARE_BALL).flatMap((e) => e.pools);

  return (
    <div className="en-items-page">
      <div className="en-items-main">
        <Section title="Item table" summary={`${entries.length} entr${entries.length === 1 ? "y" : "ies"}${doc?.dirty ? " •" : ""}`}
                 actions={<>
                   <button onClick={() => setEntries([...list, newItemEntry()])} disabled={list.length >= maxEntries} title="A Potion of weight 10 in the item room pool, at the end">+ Add an item</button>
                   <span className="muted small">An item's chance in a pool is its weight over the sum of the weights of the pool's entries in that round.</span>
                 </>}>
          <div className="en-item-table">
            <div className="en-item-row en-item-head muted small">
              <span>#</span><span>Item</span><span>Weight</span><span>Rounds</span><span title="Dream Dust, in a shop (step 7)">Price</span><span>Pools</span><span />
            </div>
            {entries.map((e, i) => {
              const bad = problems.some((p) => p.index === i && p.severity === "error") || schemaErrors.some((s) => s.path[0] === "items" && s.path[1] === i);
              return (
                <div key={i} className={`en-item-row ${bad ? "en-item-bad" : ""}`}>
                  <span className="muted small">{i + 1}</span>
                  <span className="en-item-pick">
                    <BagIcon item={e.item} icons={icons} />
                    <SearchSelect value={e.item} options={items} onChange={(v) => v && setField(i, "item", v)} />
                  </span>
                  <NumberBox value={e.weight} min={1} max={255} width={56} onChange={(n) => setField(i, "weight", n)} />
                  <span className="en-checks">
                    <label className="ow-check small" title="Every round"><input type="checkbox" checked={!e.rounds.length} disabled={!e.rounds.length} onChange={() => setField(i, "rounds", undefined)} /> Any</label>
                    {ROUNDS.map((r) => (
                      <label key={r} className="ow-check small" title={`Round ${r}, ${ROUND_NOTES[r]}${r === 3 ? " (the final room's too)" : ""}`}>
                        <input type="checkbox" checked={e.rounds.includes(r)} onChange={(ev) => {
                          const next = ROUNDS.filter((x) => (x === r ? ev.target.checked : e.rounds.includes(x)));
                          setField(i, "rounds", next.length ? [...next] : undefined);
                        }} /> {r}
                      </label>
                    ))}
                  </span>
                  <NumberBox value={e.price} min={0} max={9999} width={64} onChange={(n) => setField(i, "price", n || undefined)} title="Its price in Dream Dust (shops come in step 7); 0 is left out" />
                  <span className="en-checks">
                    {POOLS.map((p) => (
                      <label key={p} className="ow-check small" title={POOL_NOTES[p]}>
                        <input type="checkbox" checked={e.pools.includes(p)} disabled={e.pools.length === 1 && e.pools.includes(p)}
                               onChange={(ev) => setField(i, "pools", POOLS.filter((x) => (x === p ? ev.target.checked : e.pools.includes(x))))} /> {POOL_NAMES[p]}
                      </label>
                    ))}
                  </span>
                  <button className="icon" title="Remove the entry" disabled={list.length <= 1} onClick={() => setEntries(list.filter((_, k) => k !== i))}>×</button>
                </div>
              );
            })}
          </div>
        </Section>
        {(errors > 0 || warnings > 0) && (
          <Section title="Checks" summary={[errors && `${errors} error${errors > 1 ? "s" : ""}`, warnings && `${warnings} warning${warnings > 1 ? "s" : ""}`].filter(Boolean).join(", ")}>
            <ul className="en-problems">
              {schemaErrors.map((e) => <li key={`${e.path.join(".")}${e.message}`} className="en-error">{e.path.join(".") || "items.json"}: {e.message}</li>)}
              {problems.map((p) => <li key={p.message} className={p.severity === "error" ? "en-error" : "en-warn"}>{p.message}</li>)}
            </ul>
          </Section>
        )}
      </div>

      <div className="en-items-side">
        <Section title="Chances" summary={`round ${round}`}
                 actions={<>
                   <span className="muted">Round</span>
                   <Switch<string> value={String(round)} options={ROUNDS.map(String)} onChange={(v) => setRound(Number(v) as Round)} titles={ROUND_NOTES} />
                   <label className="ow-check small" title="Whether some enemy can be caught now: without it the Nightmare Ball isn't drawn">
                     <input type="checkbox" checked={catchable} onChange={(e) => setCatchable(e.target.checked)} /> Something catchable
                   </label>
                 </>}>
          <div className="en-pools">
            {POOLS.map((pool: Pool) => {
              const chances = poolChances(entries, pool, round, catchable).sort((a, b) => b.chance - a.chance || a.index - b.index);
              return (
                <div key={pool} className="en-pool">
                  <h6 className="en-sub">{POOL_NAMES[pool]} <span className="muted">{chances.length} item{chances.length === 1 ? "" : "s"}</span></h6>
                  <span className="muted small en-pool-note">{POOL_NOTES[pool]}</span>
                  {chances.length ? chances.map((c) => (
                    <div key={c.index} className="en-chance" title={`Entry ${c.index + 1}: weight ${c.weight}`}>
                      <BagIcon item={c.item} icons={icons} />
                      <span className="en-chance-name">{constantLabel(c.item, "ITEM_")}</span>
                      <span className="en-chance-bar"><span style={{ width: `${Math.min(100, c.chance)}%` }} /></span>
                      <span className="small en-chance-pct">{percent(c.chance)}</span>
                    </div>
                  )) : <p className="muted small">Nothing in round {round}.</p>}
                </div>
              );
            })}
          </div>
        </Section>
        <Section title="The Nightmare Ball" summary={ballPools.length ? `in ${[...new Set(ballPools)].map((p) => POOL_NAMES[p].toLowerCase()).join(", ")}` : "in no pool"}>
          <p className="small en-template-note">
            It is drawn, in any pool, only while something can be caught: some room still in this run's pools has an enemy whose catch
            conditions are met now and that hasn't been caught. While nothing can, its weight is left out and the others' chances rise
            (untick Something catchable to see them). {catchRooms.length
              ? `${catchRooms.length} room${catchRooms.length === 1 ? " has" : "s have"} a catchable enemy: ${catchRooms.map((r) => r.room.name || r.id).join(", ")}.`
              : "No room has a catchable enemy yet, so it would never be drawn."}
          </p>
        </Section>
      </div>
    </div>
  );
}
