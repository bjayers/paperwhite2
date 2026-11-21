// The Entree page's Buffs tab: the buff catalogue (res/paperwhite2/entralink/buffs.json, buffs.schema.json beside it;
// the design in docs/paperwhite2/design/entralink-buffs.md). On the left the cards, filtered by tier, theme, pool and
// text, with Add, Duplicate and Delete at the top (ids stay as made: renaming a card keeps its id); in the middle the
// chosen card's sections: Basics (name, tier, its menu line or a line per rank, the icon as the game will show it),
// Offer (weight, rounds, pools, price), Effect (the kind from the schema's list and its parameters from the kind's
// definition, the bucket, and a blue's or purple's step, soft limit and cap or a gold's ranks) and Relations (a gold's
// theme and core, a purple's related themes and type card); on the right the balance meter (the strongest possible hit
// and an example build against the damage cap, buffs.ts), the themes, the offers' settings and the checks. Held in the
// document store, so undo, the build's check on Save and changes on disk work as for any file; the page's Save saves it.

import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "../../api.ts";
import { documents, useDocuments } from "../../documents.ts";
import { fromPlain, setIn, toPlain, type JsonMap, type JsonPath, type JsonValue } from "../../../shared/json.ts";
import { resolve, validate, type Constants, type Schema } from "../../../shared/schema.ts";
import { SearchSelect } from "../../shell/SearchSelect.tsx";
import { BaseField, constantLabel, constantOptions, defaultFor, humanize, type FormContext } from "../schema-form/form.tsx";
import { NumberBox, Row, Section, Switch, cap } from "./parts.tsx";
import { ROUNDS, ROUND_NOTES } from "./model.ts";
import { readIndexedPng } from "../palettes/png.ts";
import {
  BUFFS, BUFFS_SCHEMA, BUFF_POOLS, BUFF_POOL_NAMES, BUFF_POOL_NOTES, SOURCES, SOURCE_NOTES, TIERS, TIER_NOTES, categoryIconPath, ceilingHit,
  changeTier, checkBuffs, duplicateBuff, effectKinds, exampleHit, fieldOrder, filterBuffs, needsBucket, newBuff, readBuff, readCatalogue,
  tierPalettePath, tintIcon, uniqueId, withFields, type Buff, type BuffPool, type Catalogue, type Hit, type Tier,
} from "./buffs.ts";

const asMap = (v: JsonValue | undefined): JsonMap => (v instanceof Map ? v : new Map());
const asList = (v: JsonValue | undefined): JsonValue[] => (Array.isArray(v) ? v : []);
const round = (n: number) => Math.round(n).toLocaleString("en");
const TOP_ORDER = ["$schema", "settings", "buckets", "balance", "categories", "themes", "buffs"];

/** Each category's icon in each tier's palette, as a data URL, read once (the file changes after a reload). */
const tinted = new Map<string, Promise<string>>();
function tintedIcon(category: string, tier: Tier): Promise<string> {
  const key = `${category}/${tier}`;
  if (!tinted.has(key)) {
    const p = (async () => {
      const [icon, palette] = await Promise.all([api.asset(categoryIconPath(category)), api.asset(tierPalettePath(tier))]).then(([a, b]) => Promise.all([readIndexedPng(a), readIndexedPng(b)]));
      const canvas = document.createElement("canvas");
      canvas.width = icon.width;
      canvas.height = icon.height;
      canvas.getContext("2d")!.putImageData(new ImageData(tintIcon(icon.pixels, palette.colors), icon.width, icon.height), 0, 0);
      return canvas.toDataURL();
    })();
    p.catch(() => tinted.delete(key));
    tinted.set(key, p);
  }
  return tinted.get(key)!;
}

/** A card's icon: its category's picture in its tier's palette, as the game will draw it. */
function CategoryIcon({ category, tier, size = 24, title }: { category: string; tier: Tier; size?: number; title?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    tintedIcon(category, tier).then((s) => live && setSrc(s), () => live && setSrc(null));
    return () => { live = false; };
  }, [category, tier]);
  return src
    ? <img className="en-bag-icon en-buff-icon" src={src} width={size} height={size} alt="" title={title ?? `${category}, ${tier}`} />
    : <span className="en-bag-icon en-bag-missing" style={{ width: size, height: size }} title={`No icon for ${category}`} />;
}

function TierChip({ tier }: { tier: Tier }) {
  return <span className={`en-role en-tier-${tier}`}>{tier}</span>;
}

export function BuffsPage({ constants }: { constants: Constants }) {
  const { docs } = useDocuments();
  const [schema, setSchema] = useState<Schema | null>(null);
  const [missing, setMissing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [tier, setTier] = useState<Tier | "all">("all");
  const [theme, setTheme] = useState("");
  const [pool, setPool] = useState<BuffPool | "">("");
  const [text, setText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    documents.hold(BUFFS).then(() => setMissing(false), () => setMissing(true));
    api.schema(BUFFS_SCHEMA).then(setSchema, () => undefined);
  }, []);
  const doc = docs.get(BUFFS);
  const data = doc?.data instanceof Map ? doc.data : null;
  const cat = useMemo(() => readCatalogue(data), [data]);
  const problems = useMemo(() => checkBuffs(cat), [cat]);
  const schemaErrors = useMemo(() => (data && schema ? validate(data, schema, constants) : []), [data, schema, constants]);
  const kinds = useMemo(() => effectKinds(schema), [schema]);
  const listed = useMemo(() => filterBuffs(cat.buffs, { tier, theme, pool, text }), [cat, tier, theme, pool, text]);
  useEffect(() => setConfirmDelete(false), [selected]);

  if (!data) return (
    <div className="en-items-page">
      <Section title="Buff catalogue" summary={missing ? "buffs.json doesn't exist yet" : doc ? "buffs.json isn't in a layout the editor can write back: edit it as text" : "loading…"}>
        <p className="muted small">{BUFFS}: the buff cards a run of the Entralink roguelike offers.</p>
      </Section>
    </div>
  );

  const list = asList(data.get("buffs"));
  const index = cat.buffs.findIndex((b) => b.id === selected);
  const current = index >= 0 ? cat.buffs[index] : null;
  const ids = cat.buffs.map((b) => b.id);
  const setTop = (key: string, value: JsonValue) => documents.replace(BUFFS, withFields(data, { [key]: value }, TOP_ORDER));
  const setList = (next: JsonValue[]) => setTop("buffs", next);
  const setRecord = (i: number, record: JsonMap) => setList(list.map((e, k) => (k === i ? record : e)));
  const change = (i: number, changes: Record<string, JsonValue | undefined>) => {
    const record = asMap(list[i]);
    setRecord(i, withFields(record, changes, fieldOrder(schema, readBuff(record).tier)));
  };
  const add = () => {
    const t: Tier = tier === "all" ? "blue" : tier;
    const record = newBuff(t, ids, theme || cat.themes[0]?.id, fieldOrder(schema, t));
    setList([...list, record]);
    setSelected(readBuff(record).id);
  };
  const duplicate = () => {
    if (!current) return;
    const record = duplicateBuff(asMap(list[index]), ids, fieldOrder(schema, current.tier));
    setList([...list.slice(0, index + 1), record, ...list.slice(index + 1)]);
    setSelected(readBuff(record).id);
  };
  const remove = () => {
    if (!current) return;
    // The example build forgets it too
    const balance = asMap(data.get("balance"));
    const changes: Record<string, JsonValue> = { buffs: list.filter((_, k) => k !== index) };
    if (cat.example.some((p) => p.buff === current.id))
      changes.balance = withFields(balance, { example: asList(balance.get("example")).filter((p) => asMap(p).get("buff") !== current.id) }, ["reference_hit", "example", "typical_factor"]);
    documents.replace(BUFFS, withFields(data, changes, TOP_ORDER));
    setSelected(cat.buffs[index + 1]?.id ?? cat.buffs[index - 1]?.id ?? null);
  };
  const errors = problems.filter((p) => p.severity === "error").length + schemaErrors.length;
  const warnings = problems.length - problems.filter((p) => p.severity === "error").length;
  const bad = (i: number) => problems.some((p) => p.index === i && p.severity === "error") || schemaErrors.some((e) => e.path[0] === "buffs" && e.path[1] === i);

  return (
    <div className="en-body en-buffs-body">
      <aside className="en-list">
        <div className="en-list-section">
          <h5>Buffs <span className="muted">{listed.length === cat.buffs.length ? cat.buffs.length : `${listed.length} of ${cat.buffs.length}`}{doc?.dirty ? " •" : ""}</span></h5>
          <div className="en-list-actions">
            <button onClick={add} title={`A new ${tier === "all" ? "blue" : tier} card, at the end`}>+ Add</button>
            <button onClick={duplicate} disabled={!current} title="A copy of the chosen card, after it, with a new id">Duplicate</button>
            {confirmDelete
              ? <span className="en-confirm">Delete {current?.name}? <button onClick={() => { remove(); setConfirmDelete(false); }}>Yes</button><button onClick={() => setConfirmDelete(false)}>No</button></span>
              : <button onClick={() => setConfirmDelete(true)} disabled={!current || list.length <= 1}>Delete</button>}
          </div>
          <div className="en-filters">
            <span className="muted small">Tier</span>
            <Switch<string> value={tier} options={["all", ...TIERS]} onChange={(v) => setTier(v as Tier | "all")} titles={TIER_NOTES} />
            <span className="muted small">Theme</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value)} title="A gold theme: its golds and the purples related to it">
              <option value="">Any</option>
              {cat.themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <span className="muted small">Pool</span>
            <select value={pool} onChange={(e) => setPool(e.target.value as BuffPool | "")}>
              <option value="">Any</option>
              {BUFF_POOLS.map((p) => <option key={p} value={p} title={BUFF_POOL_NOTES[p]}>{BUFF_POOL_NAMES[p]}</option>)}
            </select>
            <span className="muted small">Text</span>
            <input type="search" value={text} placeholder="Name, id or description" onChange={(e) => setText(e.target.value)} />
          </div>
        </div>
        <div className="en-items">
          {listed.map((i) => {
            const b = cat.buffs[i];
            const t = cat.themes.find((x) => x.id === b.theme);
            return (
              <button key={b.id + i} className={`en-item en-buff-item ${b.id === selected ? "selected" : ""}`} onClick={() => setSelected(b.id)}>
                <span className="en-buff-line">
                  <CategoryIcon category={b.category} tier={b.tier} size={16} />
                  <span className={`en-item-name ${bad(i) ? "en-bad" : ""}`}>{b.name || b.id}</span>
                  {b.core && <span className="en-role en-tier-gold" title="Its theme's core">core</span>}
                </span>
                <span className="en-item-detail muted">
                  <TierChip tier={b.tier} />
                  {t ? t.name : b.bucket ? cat.buckets.find((x) => x.id === b.bucket)?.name ?? b.bucket : "not damage"}
                  <span className="en-buff-kind">{b.kind}</span>
                </span>
              </button>
            );
          })}
          {!listed.length && <p className="muted small en-empty">No card fits the filters.</p>}
        </div>
      </aside>

      <main className="en-buffs-main">
        {current ? (
          <BuffPanel key={current.id} index={index} buff={current} record={asMap(list[index])} cat={cat} schema={schema} constants={constants}
                     kinds={kinds} errors={schemaErrors} change={(c) => change(index, c)} replace={(r) => setRecord(index, r)} />
        ) : <p className="muted en-pad">Choose a card on the left, or add one.</p>}
      </main>

      <aside className="en-buffs-side">
        <BalanceMeter cat={cat} data={data} setTop={setTop} />
        <CategoriesSection cat={cat} data={data} setTop={setTop} />
        <ThemesSection cat={cat} data={data} setTop={setTop} constants={constants} />
        <SettingsSection cat={cat} data={data} setTop={setTop} />
        <DamageNumbersSection data={data} setTop={setTop} />
        <Section title="Checks" summary={errors || warnings ? [errors && `${errors} error${errors > 1 ? "s" : ""}`, warnings && `${warnings} warning${warnings > 1 ? "s" : ""}`].filter(Boolean).join(", ") : "none"}>
          {errors || warnings ? (
            <ul className="en-problems">
              {schemaErrors.map((e) => <li key={`${e.path.join(".")}${e.message}`} className="en-error">{e.path.join(".") || "buffs.json"}: {e.message}</li>)}
              {problems.map((p) => (
                <li key={p.message} className={p.severity === "error" ? "en-error" : "en-warn"}>
                  {p.index !== undefined ? <button className="link" onClick={() => setSelected(cat.buffs[p.index!].id)}>{p.message}</button> : p.message}
                </li>
              ))}
            </ul>
          ) : <p className="en-ok small">✓ No problems found in the catalogue.</p>}
        </Section>
      </aside>
    </div>
  );
}

// ---- The chosen card ------------------------------------------------------------------------------------------------

function BuffPanel({ index, buff: b, record, cat, schema, constants, kinds, errors, change, replace }: {
  index: number; buff: Buff; record: JsonMap; cat: Catalogue; schema: Schema | null; constants: Constants;
  kinds: ReturnType<typeof effectKinds>; errors: ReturnType<typeof validate>;
  change(c: Record<string, JsonValue | undefined>): void; replace(r: JsonMap): void;
}) {
  const kind = kinds.find((k) => k.kind === b.kind);
  const gold = b.tier === "gold";
  const unit = kind?.unit ? `in ${kind.unit}` : "";
  const defaultPrice = cat.settings.prices[b.tier];
  const coreHolder = gold && b.theme ? cat.buffs.find((x) => x.core && x.theme === b.theme && x.id !== b.id) : undefined;
  const base: JsonPath = ["buffs", index, "effect"];
  const ctx: FormContext | null = schema ? {
    root: schema, constants, errors, flat: true,
    edit: (p: JsonPath, v: JsonValue | undefined) => documents.edit(BUFFS, p, v),
    amend: (p: JsonPath, v: JsonValue | undefined) => documents.amend(BUFFS, p, v),
  } : null;
  const setEffect = (effect: JsonMap) => {
    const bucket = needsBucket(effect) ? b.bucket ?? cat.buckets.find((x) => x.side === "attack")?.id : undefined;
    change({ effect, bucket });
  };
  const pickKind = (k: string) => {
    const def = kinds.find((x) => x.kind === k);
    if (!def || !ctx) return;
    const effect: JsonMap = new Map([["kind", k]]);
    for (const p of def.required) effect.set(p, defaultFor(def.schema.properties![p], ctx));
    setEffect(effect);
  };
  const setParam = (key: string, value: JsonValue | undefined) => {
    const order2 = ["kind", ...(kind?.params ?? [])];
    setEffect(withFields(b.effect, { [key]: value }, order2));
  };
  const absent = (kind?.params ?? []).filter((p) => !b.effect.has(p));
  const ranks = b.ranks;
  const setRanks = (next: number[], lines: string[]) => change({ ranks: fromPlain(next), description: fromPlain(lines) });

  return (
    <>
      <Section title="Basics" summary={<><TierChip tier={b.tier} /> <span className="en-pid" title="The card's stable id: renaming it doesn't change it">{b.id}</span></>}>
        <div className="ow-condition">
          <Row label="Name" hint="On the card (24 letters at most)">
            <input className="en-wide" maxLength={24} value={b.name} onChange={(e) => change({ name: e.target.value })} />
          </Row>
          <Row label="Tier" hint={TIER_NOTES[b.tier]}>
            <span className="en-tier-switch">
              <Switch<Tier> value={b.tier} options={TIERS} titles={TIER_NOTES}
                            onChange={(t) => replace(changeTier(record, t, cat.settings.maxRank, cat.themes[0]?.id, fieldOrder(schema, t)))} />
            </span>
          </Row>
          {gold ? b.description.map((line, r) => (
            <Row key={r} label={r === 0 ? "Lines" : ""} hint={r === 0 ? "One menu line per rank" : undefined}>
              <span className="muted small en-rank-label">Rank {r + 1}</span>
              <input className="en-wide" maxLength={60} value={line} onChange={(e) => change({ description: fromPlain(b.description.map((d, k) => (k === r ? e.target.value : d))) })} />
            </Row>
          )) : (
            <Row label="Line" hint="Its menu line (60 letters at most)">
              <input className="en-wide" maxLength={60} value={b.description[0] ?? ""} onChange={(e) => change({ description: e.target.value })} />
            </Row>
          )}
          <Row label="Icon" hint={`Its category's icon in its tier's colors: ${cat.categories.find((c) => c.id === b.category)?.description ?? "pick a category"}`}>
            <span className="en-icon-pick">
              <span className="en-icon-frame"><CategoryIcon category={b.category} tier={b.tier} size={32} /></span>
              <select value={b.category} onChange={(e) => change({ category: e.target.value })}>
                {!cat.categories.some((c) => c.id === b.category) && <option value={b.category}>{b.category || "(none)"}</option>}
                {cat.categories.map((c) => <option key={c.id} value={c.id} title={c.description}>{c.name}</option>)}
              </select>
              <span className="en-icon-tiers" title="The same icon in the other tiers' palettes">
                {TIERS.filter((t) => t !== b.tier).map((t) => <CategoryIcon key={t} category={b.category} tier={t} size={16} />)}
              </span>
            </span>
          </Row>
        </div>
      </Section>

      <Section title="Offer" summary={`weight ${b.weight}`}>
        <div className="ow-condition">
          <Row label="Weight" hint="Its weight among the cards of its tier (held themes weigh more)">
            <NumberBox value={b.weight} min={1} max={255} onChange={(n) => change({ weight: n })} />
          </Row>
          <Row label="Rounds">
            <span className="en-checks">
              <label className="ow-check small" title="Every round"><input type="checkbox" checked={!b.rounds.length} disabled={!b.rounds.length} onChange={() => change({ rounds: undefined })} /> Any</label>
              {ROUNDS.map((r) => (
                <label key={r} className="ow-check small" title={`Round ${r}, ${ROUND_NOTES[r]}`}>
                  <input type="checkbox" checked={b.rounds.includes(r)} onChange={(ev) => {
                    const next = ROUNDS.filter((x) => (x === r ? ev.target.checked : b.rounds.includes(x)));
                    change({ rounds: next.length ? fromPlain([...next]) : undefined });
                  }} /> {r}
                </label>
              ))}
            </span>
          </Row>
          <Row label="Pools">
            <span className="en-checks">
              {BUFF_POOLS.map((p) => (
                <label key={p} className="ow-check small" title={BUFF_POOL_NOTES[p]}>
                  <input type="checkbox" checked={b.pools.includes(p)} disabled={b.pools.length === 1 && b.pools.includes(p)}
                         onChange={(ev) => change({ pools: fromPlain(BUFF_POOLS.filter((x) => (x === p ? ev.target.checked : b.pools.includes(x)))) })} /> {BUFF_POOL_NAMES[p]}
                </label>
              ))}
            </span>
          </Row>
          <Row label="Price" hint={b.price === undefined ? `Dream Dust; the ${b.tier} default, ${defaultPrice}` : "Dream Dust"}>
            <NumberBox value={b.price ?? defaultPrice} min={1} max={9999} onChange={(n) => change({ price: n === defaultPrice ? undefined : n })} />
            {b.price !== undefined && <button className="link small" onClick={() => change({ price: undefined })}>Use the default</button>}
          </Row>
        </div>
      </Section>

      <Section title="Effect" summary={b.kind}
               actions={absent.length > 0 && <>
                 <span className="muted">Add</span>
                 {absent.map((p) => (
                   <button key={p} title={resolve(kind!.schema.properties![p], schema!).description} onClick={() => ctx && setParam(p, defaultFor(kind!.schema.properties![p], ctx))}>+ {humanize(p)}</button>
                 ))}
               </>}>
        <div className="ow-condition">
          <Row label="Kind" hint={kind?.description}>
            <select value={b.kind} onChange={(e) => pickKind(e.target.value)}>
              {!kind && <option value={b.kind}>{b.kind || "(none)"}</option>}
              {kinds.map((k) => <option key={k.kind} value={k.kind} title={k.description}>{k.kind}</option>)}
            </select>
          </Row>
          {(kind?.params ?? []).filter((p) => b.effect.has(p)).map((p) => {
            const s = kind!.schema.properties![p];
            return (
              <Row key={p} label={humanize(p)} hint={resolve(s, schema!).description}>
                <span className="en-param">
                  {ctx && <BaseField schema={s} value={b.effect.get(p)!} path={[...base, p]} ctx={ctx} />}
                </span>
                {!kind!.required.includes(p) && <button className="icon" title={`Remove ${humanize(p)}`} onClick={() => setParam(p, undefined)}>×</button>}
              </Row>
            );
          })}
          <Row label="Bucket" hint={needsBucket(b.effect) ? cat.buckets.find((x) => x.id === b.bucket)?.description ?? "The damage bucket it adds to" : "Not damage: no bucket"}>
            <select value={b.bucket ?? ""} disabled={!needsBucket(b.effect) && b.bucket === undefined} onChange={(e) => change({ bucket: e.target.value || undefined })}>
              <option value="">None</option>
              {cat.buckets.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.side}, cap {x.cap})</option>)}
            </select>
          </Row>
          {gold ? (
            <Row label="Ranks" hint={`Each rank's value ${unit}, not added together`}>
              <span className="en-ranks">
                {ranks.map((v, r) => (
                  <span key={r} className="en-rank">
                    <span className="muted small">{r + 1}</span>
                    <NumberBox value={v} min={-100} max={1000} width={60} onChange={(n) => setRanks(ranks.map((x, k) => (k === r ? n : x)), b.description)} />
                  </span>
                ))}
                <button className="icon" title="Add a rank" disabled={ranks.length >= cat.settings.maxRank}
                        onClick={() => setRanks([...ranks, ranks[ranks.length - 1] ?? 0], [...b.description, b.description[b.description.length - 1] ?? ""])}>+</button>
                <button className="icon" title="Remove the last rank" disabled={ranks.length <= 1}
                        onClick={() => setRanks(ranks.slice(0, -1), b.description.slice(0, -1))}>−</button>
              </span>
            </Row>
          ) : (
            <>
              <Row label="Step" hint={`What one pick adds ${unit}`}>
                <NumberBox value={b.step} min={-100} max={1000} onChange={(n) => change({ step: n })} />
              </Row>
              <Row label="Soft limit" hint="Picks at the full step; later ones add half">
                <label className="ow-check small"><input type="checkbox" checked={b.softLimit !== undefined} onChange={(e) => change({ soft_limit: e.target.checked ? Math.max(1, Math.floor(b.cap / (b.step || 1))) : undefined })} /> Halve after</label>
                {b.softLimit !== undefined && <NumberBox value={b.softLimit} min={1} max={20} width={52} onChange={(n) => change({ soft_limit: n })} />}
                {b.softLimit !== undefined && <span className="muted small">picks</span>}
              </Row>
              <Row label="Cap" hint={`The most its picks add up to; ${Math.ceil(capPicks(b))} picks reach it`}>
                <NumberBox value={b.cap} min={-100} max={1000} onChange={(n) => change({ cap: n })} />
              </Row>
            </>
          )}
        </div>
      </Section>

      {!gold && ctx && (
        <Section title="More effects" summary={b.more.length ? b.more.map((m) => m.kind).join(", ") : "none"}
                 actions={<button title="A further effect at the card's picks, with its own step and cap (a merged card's)"
                                  onClick={() => change({ more_effects: fromPlain([...toPlain(record.get("more_effects") ?? []) as object[],
                                    { effect: { kind: "damage_ratio" }, step: 10, cap: 30, bucket: cat.buckets[0]?.id }]) })}>+ Effect</button>}>
          {b.more.length > 0 && (
            <div className="ow-condition">
              <BaseField schema={resolve(schema!.$defs!.stacking, schema!).properties!.more_effects} value={record.get("more_effects")!}
                         path={["buffs", index, "more_effects"]} ctx={ctx} />
            </div>
          )}
        </Section>
      )}

      <Section title="Relations" summary={gold ? cat.themes.find((t) => t.id === b.theme)?.name ?? b.theme : b.related.length ? `${b.related.length} theme${b.related.length > 1 ? "s" : ""}` : "none"}>
        {gold ? (
          <div className="ow-condition">
            <Row label="Theme">
              <select value={b.theme ?? ""} onChange={(e) => change({ theme: e.target.value, core: undefined })}>
                {!cat.themes.some((t) => t.id === b.theme) && <option value={b.theme ?? ""}>{b.theme || "(none)"}</option>}
                {cat.themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Row>
            <Row label="Core" hint={coreHolder ? `The theme's core is ${coreHolder.name}: a theme has one` : "The theme's centrepiece, the gold it is built around"}>
              <label className="ow-check small"><input type="checkbox" checked={b.core} disabled={!b.core && !!coreHolder} onChange={(e) => change({ core: e.target.checked || undefined })} /> Core</label>
            </Row>
          </div>
        ) : b.tier === "purple" ? (
          <div className="ow-condition">
            <Row label="Related" hint="Offered more while a gold of one of these themes is held">
              <span className="en-checks">
                {cat.themes.map((t) => (
                  <label key={t.id} className="ow-check small">
                    <input type="checkbox" checked={b.related.includes(t.id)}
                           onChange={(e) => {
                             const next = cat.themes.map((x) => x.id).filter((x) => (x === t.id ? e.target.checked : b.related.includes(x)));
                             change({ related: next.length ? fromPlain(next) : undefined });
                           }} /> {t.name}
                  </label>
                ))}
              </span>
            </Row>
            <Row label="Type card" hint="The card rolls a type when offered, weighted toward the team's types">
              <label className="ow-check small"><input type="checkbox" checked={b.typeCard} onChange={(e) => change({ type_card: e.target.checked || undefined })} /> Rolls a type</label>
            </Row>
          </div>
        ) : <p className="muted small">Blues have no relations: they are stats for every team.</p>}
      </Section>
    </>
  );
}

/** Picks a blue or purple takes to reach its cap. */
function capPicks(b: Buff): number {
  if (!b.step) return 0;
  const full = b.cap / b.step;
  if (b.softLimit === undefined || full <= b.softLimit) return full;
  return b.softLimit + (b.cap - b.step * b.softLimit) / (b.step / 2);
}

// ---- The balance meter ----------------------------------------------------------------------------------------------

function HitTable({ hit, cat, title }: { hit: Hit; cat: Catalogue; title: string }) {
  const name = (id: string) => cat.buffs.find((b) => b.id === id)?.name ?? id;
  return (
    <div className="en-meter-table">
      <div className="en-meter-row en-meter-head muted small"><span>{title}</span><span>Sum / cap</span><span>Factor</span></div>
      {hit.lines.filter((l) => l.bucket.side === "attack").map((l) => (
        <div key={l.bucket.id} className="en-meter-row" title={l.entries.length ? l.entries.map((e) => `${name(e.id)} ${e.value}`).join(", ") : "Nothing adds to it"}>
          <span>{l.bucket.name}{l.bucket.criticalOnly && <span className="muted small"> (critical)</span>}</span>
          <span className={l.capped ? "en-warn" : ""}>{Math.round(l.sum * 10) / 10} / {l.bucket.cap}</span>
          <span>×{l.factor.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function Gauge({ value, limit, label }: { value: number; limit: number; label: string }) {
  const over = value > limit;
  return (
    <div className="en-gauge-row" title={`${round(value)} of the ${round(limit)} cap`}>
      <span className="small">{label}</span>
      <span className={`en-gauge ${over ? "en-gauge-over" : ""}`}><span style={{ width: `${Math.min(100, (value * 100) / limit)}%` }} /></span>
      <span className={`small en-gauge-num ${over ? "en-error" : ""}`}>{round(value)}</span>
    </div>
  );
}

function BalanceMeter({ cat, data, setTop }: { cat: Catalogue; data: JsonMap; setTop(key: string, v: JsonValue): void }) {
  const top = useMemo(() => ceilingHit(cat), [cat]);
  const example = useMemo(() => exampleHit(cat), [cat]);
  const [adding, setAdding] = useState("");
  const balance = asMap(data.get("balance"));
  const setBalance = (changes: Record<string, JsonValue | undefined>) => setTop("balance", withFields(balance, changes, ["reference_hit", "example", "typical_factor"]));
  const [low, high] = cat.typicalFactor;
  const typical = example.factor >= low && example.factor <= high;
  const setExample = (picks: { buff: string; count: number }[]) => setBalance({ example: fromPlain(picks) });
  const limit = cat.settings.damageCap;
  const over = top.criticalHit > limit;
  const defense = top.lines.filter((l) => l.bucket.side === "defense");
  const share = defense.reduce((n, l) => n * (l.bucket.reduces ? l.factor : 1 / l.factor), 1);
  return (
    <Section title="Balance meter" summary={<>example ×{example.factor.toFixed(1)} {typical ? `in ×${low}-${high}` : <span className="en-error">outside ×{low}-{high}</span>}{over ? `, strongest past ${round(limit)}` : ""}</>}
             actions={<>
               <span className="muted">Reference hit</span>
               <NumberBox value={cat.referenceHit} min={1} max={9999} onChange={(n) => setBalance({ reference_hit: n })}
                          title="A strong hit on a tanky boss before buffs: STAB, super effective and the top roll included (the doc's 5.1)" />
               <span className="muted small">The strongest single hit from the data: each bucket's entries at their most, held to its cap; buckets multiply.</span>
             </>}>
      <HitTable hit={top} cat={cat} title="Strongest hit" />
      <Gauge label={`No critical ×${top.factor.toFixed(1)}`} value={top.hit} limit={limit} />
      <Gauge label={`Critical ×${top.criticalFactor.toFixed(1)}`} value={top.criticalHit} limit={limit} />
      {over
        ? <p className="small muted">The strongest combination passes the {round(limit)} clamp: fine for an extreme build (rebalance 2's target is ×60-80 there, the red tier). A typical build should stay in its band below.</p>
        : <p className="small muted">Every combination stays under the {round(limit)} clamp before vanilla's extras (stages, held items, weather), which multiply on top (the doc's 5.5).</p>}
      <p className="small muted">Defence at its most: damage taken ×{share.toFixed(2)} ({defense.map((l) => `${l.bucket.name} ×${(l.bucket.reduces ? l.factor : 1 / l.factor).toFixed(2)}`).join(", ")}).</p>

      <h6 className="en-sub">Example build <span className="muted">{cat.example.length} card{cat.example.length === 1 ? "" : "s"}: ×{example.factor.toFixed(2)} = {round(example.hit)}</span></h6>
      <div className="en-example">
        {cat.example.map((p, i) => {
          const b = cat.buffs.find((x) => x.id === p.buff);
          return (
            <div key={`${p.buff}${i}`} className="en-example-row">
              <span className={b ? "" : "en-bad"}>{b?.name ?? p.buff}</span>
              <span className="muted small">{b?.tier === "gold" ? "rank" : "picks"}</span>
              <NumberBox value={p.count} min={1} max={b?.tier === "gold" ? b.ranks.length : 20} width={48}
                         onChange={(n) => setExample(cat.example.map((x, k) => (k === i ? { ...x, count: n } : x)))} />
              <button className="icon" title="Remove it from the example" onClick={() => setExample(cat.example.filter((_, k) => k !== i))}>×</button>
            </div>
          );
        })}
        <div className="en-example-row">
          <SearchSelect value={adding} placeholder="Add a card…" options={cat.buffs.filter((b) => !cat.example.some((p) => p.buff === b.id)).map((b) => ({ value: b.id, label: b.name, detail: b.tier }))}
                        onChange={(v) => { if (v) { setExample([...cat.example, { buff: v, count: 1 }]); setAdding(""); } }} />
        </div>
      </div>
      <HitTable hit={example} cat={cat} title="Example build" />
      <Gauge label="Example" value={example.hit} limit={limit} />
      <div className="en-run">
        <span className="muted small">Typical band ×</span>
        <span className="en-run-controls">
          <NumberBox value={low} min={1} max={500} width={52} title="A typical late build's lowest factor" onChange={(n) => setBalance({ typical_factor: fromPlain([n, high]) })} />
          <span className="small">to</span>
          <NumberBox value={high} min={1} max={500} width={52} title="A typical late build's highest factor" onChange={(n) => setBalance({ typical_factor: fromPlain([low, n]) })} />
        </span>
      </div>
      <p className={`small ${typical ? "muted" : "en-error"}`}>The example build is ×{example.factor.toFixed(1)}: {typical ? "in" : "outside"} the band a typical late build should land in (entralink_sim.py shows the builds' factors along a run).</p>
    </Section>
  );
}

// ---- Themes and settings --------------------------------------------------------------------------------------------

/** The icon categories: each one's icon in the three tiers' palettes, its name and line, and how many cards use it.
 * The pictures and palettes are drawn on Graphics & Palettes (buff_icons/<category>.png, tier_<tier>.png). */
function CategoriesSection({ cat, data, setTop }: { cat: Catalogue; data: JsonMap; setTop(key: string, v: JsonValue): void }) {
  const list = asList(data.get("categories"));
  const order = ["id", "name", "description"];
  const setCategory = (i: number, changes: Record<string, JsonValue | undefined>) => setTop("categories", list.map((c, k) => (k === i ? withFields(asMap(c), changes, order) : c)));
  return (
    <Section title="Icon categories" summary={`${cat.categories.length} icons × ${TIERS.length} tier palettes`}>
      <p className="muted small en-template-note">A card shows its category's icon in its tier's palette. Draw the icons and the tier palettes on Graphics &amp; Palettes (Sprite sheets: Buff icon, Buff tier palette); a new category needs its PNG in buff_icons/.</p>
      <div className="en-categories">
        {cat.categories.map((c, i) => {
          const used = cat.buffs.filter((b) => b.category === c.id).length;
          return (
            <div key={c.id} className="en-category" title={c.description}>
              <span className="en-category-icons">{TIERS.map((t) => <CategoryIcon key={t} category={c.id} tier={t} size={24} />)}</span>
              <input value={c.name} maxLength={24} onChange={(e) => setCategory(i, { name: e.target.value })} />
              <span className="muted small">{used} card{used === 1 ? "" : "s"}</span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function ThemesSection({ cat, data, setTop, constants }: { cat: Catalogue; data: JsonMap; setTop(key: string, v: JsonValue): void; constants: Constants }) {
  const [name, setName] = useState("");
  const list = asList(data.get("themes"));
  const order = ["id", "name", "description", "team_tags"];
  const setTheme = (i: number, changes: Record<string, JsonValue | undefined>) => setTop("themes", list.map((t, k) => (k === i ? withFields(asMap(t), changes, order) : t)));
  const add = () => {
    const id = uniqueId(name || "theme", cat.themes.map((t) => t.id));
    setTop("themes", [...list, fromPlain({ id, name: (name || "New theme").slice(0, 24), description: "A new theme" })]);
    setName("");
  };
  return (
    <Section title="Themes" summary={`${cat.themes.length} themes`}
             actions={<span className="en-create"><input value={name} placeholder="New theme's name" maxLength={24} onChange={(e) => setName(e.target.value)} /><button onClick={add}>+ Add a theme</button></span>}>
      <div className="en-themes">
        {cat.themes.map((t, i) => {
          const golds = cat.buffs.filter((b) => b.theme === t.id);
          const related = cat.buffs.filter((b) => b.related.includes(t.id)).length;
          const core = golds.find((b) => b.core);
          return (
            <div key={t.id} className="en-theme">
              <span className="en-theme-head">
                <input value={t.name} maxLength={24} onChange={(e) => setTheme(i, { name: e.target.value })} />
                <span className="en-pid" title="Its stable id, which its golds name">{t.id}</span>
                <button className="icon" title={golds.length || related ? `${golds.length} golds and ${related} purples name it` : "Remove the theme"}
                        disabled={golds.length > 0 || related > 0} onClick={() => setTop("themes", list.filter((_, k) => k !== i))}>×</button>
              </span>
              <input className="en-wide" value={t.description} maxLength={80} onChange={(e) => setTheme(i, { description: e.target.value })} />
              <span className="en-theme-foot muted small">
                {golds.length} gold{golds.length === 1 ? "" : "s"}{core ? `, core ${core.name}` : ", no core"}; {related} related purple{related === 1 ? "" : "s"}
              </span>
              <TeamTags tags={asMap(asMap(list[i]).get("team_tags"))} constants={constants}
                        onChange={(tags) => setTheme(i, { team_tags: tags.size ? tags : undefined })} />
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/** A theme's team tags (rebalance 2): the moves and abilities that show a team member plays it, and whether its own-type
 * damaging moves count; each member that does weighs the theme's golds and related purples up (settings' Team row). */
function TeamTags({ tags, constants, onChange }: { tags: JsonMap; constants: Constants; onChange(tags: JsonMap): void }) {
  const order = ["moves", "abilities", "stab_moves"];
  const lists: [string, string, string][] = [["moves", "MOVE_", "Add a move…"], ["abilities", "ABILITY_", "Add an ability…"]];
  return (
    <div className="en-theme-tags">
      <span className="muted small" title="A team member with any of these plays the theme: its golds and related purples weigh more">Team tags</span>
      {lists.map(([key, prefix, placeholder]) => {
        const values = asList(tags.get(key)).map((v) => (typeof v === "string" ? v : ""));
        const set = (next: string[]) => onChange(withFields(tags, { [key]: next.length ? fromPlain(next) : undefined }, order));
        return (
          <span key={key} className="en-chips">
            {values.map((v) => (
              <span key={v} className="en-chip small">{constantLabel(v, prefix)}
                <button className="icon" title="Remove it" onClick={() => set(values.filter((x) => x !== v))}>×</button>
              </span>
            ))}
            <SearchSelect value="" placeholder={placeholder} options={constantOptions(constants, prefix).filter((o) => !values.includes(o.value))}
                          onChange={(v) => { if (v) set([...values, v]); }} />
          </span>
        );
      })}
      <label className="ow-check small" title="A damaging move of one of the member's own types counts too (type mastery: the team's STAB)">
        <input type="checkbox" checked={tags.get("stab_moves") === true} onChange={(e) => onChange(withFields(tags, { stab_moves: e.target.checked || undefined }, order))} /> Own-type damaging moves
      </label>
    </div>
  );
}

const DAMAGE_BATTLES = ["off", "run", "all"] as const;
const DAMAGE_SHINES = ["off", "critical", "always"] as const;

/** Phase 6's damage numbers (settings.damage_numbers): the battles, the colour tiers, the layout and the pop-up. Their
 * digits are the Graphics & Palettes page's "Damage numbers' digits" sheet. */
function DamageNumbersSection({ data, setTop }: { data: JsonMap; setTop(key: string, v: JsonValue): void }) {
  const settings = asMap(data.get("settings"));
  const numbers = asMap(settings.get("damage_numbers"));
  const set = (key: string, value: JsonValue) => setTop("settings", setIn(settings, ["damage_numbers", key], value));
  const n = (key: string) => (numbers.get(key) as number | undefined) ?? 0;
  const tiers = asList(numbers.get("tiers")).map(asMap);
  const setTier = (i: number, key: string, value: JsonValue) =>
    set("tiers", tiers.map((t, k) => (k === i ? new Map(t).set(key, value) : t)));
  const battles = (numbers.get("battles") as (typeof DAMAGE_BATTLES)[number] | undefined) ?? "run";
  const shine = (numbers.get("shine") as (typeof DAMAGE_SHINES)[number] | undefined) ?? "critical";
  return (
    <Section title="Damage numbers" summary={battles === "off" ? "off" : `${battles === "run" ? "the run's battles" : "all battles"}, ${tiers.length} tiers`}>
      <div className="ow-condition">
        <Row label="Battles" hint="Where a hit of the team's on a foe shows its full damage over it; all leaves out link battles">
          <Switch value={battles} options={DAMAGE_BATTLES} onChange={(v) => set("battles", v)}
                  labels={{ off: "Off", run: "Run's", all: "All" }} />
        </Row>
        <Row label="Tiers" hint="From this damage up, the digits take the tier's colours (palette entries 2-5), which Graphics & Palettes → Sprite sheets → Damage numbers' digits edits with a preview">
          <span className="en-damage-tiers">
            {tiers.map((t, i) => (
              <span key={i} className="en-damage-tier">
                <NumberBox value={(t.get("from") as number | undefined) ?? 0} min={0} max={65535} width={68} title="The tier's least damage"
                           onChange={(v) => setTier(i, "from", v)} />
                {asList(t.get("colors")).map((c, k) => (
                  <span key={k} className="en-damage-swatch" style={{ background: String(c) }} title={`Entry ${k + 2}: ${String(c)}`} />
                ))}
                <button className="icon" title="Remove the tier" disabled={tiers.length <= 1} onClick={() => set("tiers", tiers.filter((_, k) => k !== i))}>×</button>
              </span>
            ))}
            {/* A new tier starts with the last one's colours */}
            <button disabled={tiers.length >= 8} onClick={() => set("tiers", [...tiers, fromPlain({ from: Math.min(65535, ((tiers.at(-1)?.get("from") as number | undefined) ?? 0) + 1000), colors: toPlain(tiers.at(-1)?.get("colors") ?? fromPlain(["#777777", "#b9b9b9", "#efefef", "#ffffff"])) })])}>+ Tier</button>
          </span>
        </Row>
        <Row label="Layout" hint="Pixels the digits overlap, the space before the thousands (12 345), the number's height over the Pokémon's feet">
          <NumberBox value={n("overlap")} min={0} max={6} width={44} title="Pixels the digits overlap" onChange={(v) => set("overlap", v)} />
          <NumberBox value={n("group_space")} min={0} max={8} width={44} title="Pixels before the thousands" onChange={(v) => set("group_space", v)} />
          <NumberBox value={n("height")} min={0} max={96} width={52} title="Pixels over the Pokémon's feet" onChange={(v) => set("height", v)} />
        </Row>
        <Row label="Appear" hint="Starting size (percent) and opacity (of 31), and the frames it shrinks into place in">
          <NumberBox value={n("start_scale")} min={100} max={400} width={56} title="Starting size, percent" onChange={(v) => set("start_scale", v)} />
          <NumberBox value={n("start_alpha")} min={1} max={31} width={44} title="Starting opacity, of 31" onChange={(v) => set("start_alpha", v)} />
          <NumberBox value={n("shrink_frames")} min={1} max={30} width={44} title="Frames to shrink into place" onChange={(v) => set("shrink_frames", v)} />
        </Row>
        <Row label="Leave" hint="Frames it holds, frames it fades in, pixels it rises as it fades (60 frames a second)">
          <NumberBox value={n("hold_frames")} min={0} max={120} width={52} title="Frames it holds" onChange={(v) => set("hold_frames", v)} />
          <NumberBox value={n("fade_frames")} min={1} max={60} width={44} title="Frames it fades in" onChange={(v) => set("fade_frames", v)} />
          <NumberBox value={n("rise")} min={0} max={32} width={44} title="Pixels it rises" onChange={(v) => set("rise", v)} />
        </Row>
        <Row label="Shine" hint="When the digits play the sheet's shine rows left to right once it lands (critical: critical hits and hits at the damage cap); each row's frames, the delay from digit to digit">
          <Switch value={shine} options={DAMAGE_SHINES} onChange={(v) => set("shine", v)} />
          <NumberBox value={n("shine_frame_time")} min={1} max={15} width={44} title="Frames each shine row shows" onChange={(v) => set("shine_frame_time", v)} />
          <NumberBox value={n("shine_delay")} min={0} max={15} width={44} title="Frames from one digit to the next" onChange={(v) => set("shine_delay", v)} />
        </Row>
        <Row label="Foe HP" hint="In the run's battles a foe's gauge shows its HP (5 digits) and its bars left">
          <label className="ow-check small"><input type="checkbox" checked={numbers.get("hp_numbers") !== false} onChange={(e) => set("hp_numbers", e.target.checked)} /> Shown</label>
        </Row>
      </div>
    </Section>
  );
}

function SettingsSection({ cat, data, setTop }: { cat: Catalogue; data: JsonMap; setTop(key: string, v: JsonValue): void }) {
  const settings = asMap(data.get("settings"));
  const set = (at: string[], value: JsonValue) => setTop("settings", setIn(settings, at, value));
  const s = cat.settings;
  const n = (key: string) => (settings.get(key) as number | undefined) ?? 0;
  return (
    <Section title="Offers" summary={`${s.offers} cards, ${s.goldSlots} gold slots`}>
      <div className="en-odds">
        <span /><span className="muted small">Blue</span><span className="muted small">Purple</span><span className="muted small">Gold</span>
        {SOURCES.map((src) => (
          <Fragment key={src}>
            <span className="small" title={`${SOURCE_NOTES[src]}: the tiers' percents (they add up to 100)`}>{cap(src)}</span>
            {TIERS.map((t) => <NumberBox key={t} value={s.tierOdds[src][t]} min={0} max={100} width={52} onChange={(v) => set(["tier_odds", src, t], v)} title={`${cap(t)}'s percent: ${SOURCE_NOTES[src]}`} />)}
          </Fragment>
        ))}
        <span className="small">Price</span>
        {TIERS.map((t) => <NumberBox key={`p${t}`} value={s.prices[t]} min={1} max={9999} width={52} onChange={(v) => set(["prices", t], v)} title="The tier's default price in Dream Dust" />)}
      </div>
      <div className="ow-condition">
        <Row label="Boss gold" hint="A boss's offer has at least one gold card">
          <label className="ow-check small"><input type="checkbox" checked={s.bossGuaranteedGold} onChange={(e) => set(["boss_guaranteed_gold"], e.target.checked)} /> Guaranteed</label>
        </Row>
        <Row label="Weights" hint="Percent of the others': golds in shops, a held theme's cards, a held gold that can still rank up, a type card's team types">
          <NumberBox value={n("shop_gold_weight")} min={100} max={1000} width={56} title="Golds' weight in shops: the shop row's gold percent times this" onChange={(v) => set(["shop_gold_weight"], v)} />
          <NumberBox value={n("held_theme_weight")} min={100} max={1000} width={56} title="A held theme's other golds and its related purples" onChange={(v) => set(["held_theme_weight"], v)} />
          <NumberBox value={n("rank_up_weight") || 100} min={100} max={1000} width={56} title="A held gold, offered again until its last rank" onChange={(v) => set(["rank_up_weight"], v)} />
          <NumberBox value={n("type_card_team_weight")} min={100} max={1000} width={56} title="A type card's types that the team has" onChange={(v) => set(["type_card_team_weight"], v)} />
        </Row>
        <Row label="Team" hint="Team-aware offers: the percent a theme's golds and related purples weigh more for each team member that plays it (the themes' team tags; 0 turns it off), and the most it gives">
          <NumberBox value={n("team_theme_weight")} min={0} max={500} width={56} title="Percent more for each team member that plays the theme" onChange={(v) => set(["team_theme_weight"], v)} />
          <NumberBox value={n("team_theme_max") || 100} min={100} max={2000} width={56} title="The most, in percent of the card's weight" onChange={(v) => set(["team_theme_max"], v)} />
        </Row>
        <Row label="Gifts, shops" hint="A gift card's chance to be a buff rather than an item (percent); the buffs each shop sells">
          <NumberBox value={n("gift_buff_chance")} min={0} max={100} width={56} title="Percent of a gift NPC's cards that are buffs" onChange={(v) => set(["gift_buff_chance"], v)} />
          <NumberBox value={n("shop_buffs")} min={0} max={4} width={44} title="Buffs a shop sells beside its items" onChange={(v) => set(["shop_buffs"], v)} />
        </Row>
        <Row label="Limits" hint="Gold slots, max rank, the damage cap">
          <NumberBox value={s.goldSlots} min={1} max={8} width={44} onChange={(v) => set(["gold_slots"], v)} />
          <NumberBox value={s.maxRank} min={1} max={3} width={44} onChange={(v) => set(["max_rank"], v)} />
          <NumberBox value={s.damageCap} min={1} max={65535} width={72} onChange={(v) => set(["damage_cap"], v)} />
        </Row>
        <Row label="Bosses" hint="One health bar's most HP (a foe with more shows several; damage over time is a fraction of one bar), most sleep turns, bad poison's ramp in sixteenths, full paralysis in percent of a foe's, fixed damage in percent of a bar">
          <NumberBox value={n("boss_bar_hp")} min={1} max={65535} width={72} title="One health bar's most HP: a foe with more shows ceil(max HP / this) bars, and its damage over time is a fraction of one bar" onChange={(v) => set(["boss_bar_hp"], v)} />
          <NumberBox value={n("boss_sleep_turns")} min={1} max={4} width={44} title="The most turns a boss sleeps" onChange={(v) => set(["boss_sleep_turns"], v)} />
          <NumberBox value={n("boss_toxic_cap")} min={1} max={15} width={44} title="Bad poison's ramp on a boss stops at this many sixteenths" onChange={(v) => set(["boss_toxic_cap"], v)} />
          <NumberBox value={n("boss_full_paralysis")} min={0} max={100} width={52} title="A paralyzed boss's full paralysis chance, in percent of a foe's" onChange={(v) => set(["boss_full_paralysis"], v)} />
          <NumberBox value={n("boss_fixed_damage")} min={1} max={100} width={52} title="Fixed-damage moves on a boss deal at most this percent of one bar" onChange={(v) => set(["boss_fixed_damage"], v)} />
        </Row>
        <Row label="Health bars" hint="A foe with more max HP than a bar's (Bosses' first number) shows several bars of equal size: bar 1 is vanilla's (green, yellow, red), these colour bars 2 and up, each against the one before; their count + 1 is the most bars">
          {((settings.get("bar_colors") as JsonValue[] | undefined) ?? []).map((c, i, all) => (
            <input key={i} type="color" value={String(c)} title={`Bar ${i + 2}`}
                   onChange={(e) => set(["bar_colors"], fromPlain(all.map((v, j) => (j === i ? e.target.value : String(v)))))} />
          ))}
        </Row>
        <Row label="Skip" hint="Dream Dust for skipping an offer">
          <NumberBox value={n("skip_dust")} min={0} max={999} width={56} onChange={(v) => set(["skip_dust"], v)} />
        </Row>
      </div>
    </Section>
  );
}
