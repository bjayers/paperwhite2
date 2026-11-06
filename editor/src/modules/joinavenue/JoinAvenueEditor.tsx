// The Join Avenue Editor: the people of the avenue's people table (res/field/join_avenue/09_people.json,
// tools/data/join_avenue_data.py, docs/paperwhite2/design/join-avenue.md) that Paper White 2 uses: the owners (type 8),
// one of whom joins the visitors each day and alone can be invited to open the shop they want, and the random visitors
// (type 2), who come and go and can only be recommended to. The first owner who can arrive is the tutorial's, whom the
// avenue's guide asks the player to invite (ResortSys_AddEntryOrRecord); the rest arrive in the table's order. The
// tutorial's second person, whom the guide asks the player to recommend the first shop to, is the type-1 row. Each has a name, a look, a gender, a trainer ID, an
// eight-character greeting and two messages; an owner also a shop. The texts are messages of the avenue's text bank
// (res/text/script/global_10685.txt) that the rows name; a text that other rows share gets a message of its own when it
// is changed, so changing one person's never changes another's. The special visitors and the Gym Leaders (the other
// types, Janus among them) are left as they are.

import { useCallback, useEffect, useMemo, useState } from "react";
import { documents, useDocuments } from "../../documents.ts";
import type { JsonMap, JsonValue } from "../../../shared/json.ts";
import type { Constants } from "../../../shared/schema.ts";
import type { ToolProps } from "../types.ts";
import { DocForm, useHeld } from "../followers/DocForm.tsx";
import { constantLabel } from "../schema-form/form.tsx";
import { ModelPicker, SpriteImage } from "../overworld/fields.tsx";
import { useBank } from "../text/TextEditor.tsx";
import { TextBox } from "../text/TextBox.tsx";
import type { Message } from "../text/banks.ts";
import { fromEditable, toEditable } from "../text/message.ts";
import { useToolActive } from "../active.ts";

const DIR = "res/field/join_avenue";
const PEOPLE = `${DIR}/09_people.json`;
const SHOPS = `${DIR}/01_shops.json`;
const GOODS = `${DIR}/02_goods.json`;
const BANK = "res/text/script/global_10685.txt";
const PREFIX = "Global10685_Text_";
const MODEL_PREFIX = "OBJ_CODE_";

// The people's types this editor shows (include/paperwhite2/join_avenue.h, ResortSys_MakeShopEntry)
const OWNER = 8;
const VISITOR = 2;
const TUTORIAL_VISITOR = 1;
// The texts' lengths: the profile's name holds 7 characters and its greeting and messages 8 (JoinAvenueProfile)
const NAME_LENGTH = 7;
const MESSAGE_LENGTH = 8;
// The shops' kinds (JoinAvenue_ChooseShop), their variants and the Nursery's unlock (rank 15)
const KINDS = ["Raffle", "Beauty Salon", "Market", "Flower Shop", "Dojo", "Nursery", "Antique", "Café"];
const NURSERY = 5;
const VARIANTS = 4;
const TOP_LEVEL = 9;
const NONE = 0xffff;
const GENDERS = [["Male", 0], ["Female", 1]] as const;
const TEXTS = [
  ["greeting", "Greeting"],
  ["message_1", "Message 1"],
  ["message_2", "Message 2"],
] as const;
// An owner's own lines (PaperWhite2_JoinAvenue_GetOwnLine, src/paperwhite2/ov137/paperwhite2_join_avenue.c): the
// table's line columns each moment reads in place of the generic line, which an empty one keeps. Their name is word 0
// in each, and the dream's line stays on screen under the invite's menu, so it ends without a pause
const OWN_LINES = [
  { column: "line_1", label: "Waiting", hint: "When you talk to them on the avenue, before they're invited.", start: "{0100:0}: " },
  { column: "line_2", label: "Their dream", hint: "When you choose Invite: what they want to build. It stays on screen under the menu that asks to make them a resident, so it ends without a pause.", start: "If I could make one dream come true...{be01}\n", open: true },
  { column: "line_3", label: "Invited", hint: "Their thanks once they're made a resident, before their shop is built.", start: "{0100:0}: " },
  { column: "line_4", label: "In their shop", hint: "Their welcome when you talk to them in their shop, before its menu.", start: "{0100:0}: " },
] as const;
// The game keeps a person's look in a byte (resort_people.c), so only the first 256 object codes show
const MODEL_LIMIT = 256;
const MESSAGE_COLUMNS = ["name", "greeting", "message_1", "message_2", ...Array.from({ length: 12 }, (_, i) => `line_${i + 1}`)];

const map = (v: JsonValue | undefined) => (v instanceof Map ? v : new Map<string, JsonValue>());
const rowsOf = (data: JsonValue | null): JsonMap[] => ((data instanceof Map ? (data.get("rows") as JsonValue[] | undefined) : undefined) ?? []).map(map);
const num = (row: JsonMap | undefined, key: string) => Number(row?.get(key) ?? 0);
const str = (row: JsonMap, key: string) => (typeof row.get(key) === "string" ? String(row.get(key)) : null);

interface Bank {
  /** Message ID to its message. */
  byId: Map<string, Message>;
  /** Messages by number, as the tables' numbers name them. */
  byNumber: Message[];
}

function readBank(messages: Message[] | null): Bank | null {
  if (!messages) return null;
  const byNumber = messages.filter((m) => m.id !== null);
  return { byId: new Map(byNumber.map((m) => [m.id!, m])), byNumber };
}

/** A message's text as the editor shows it: "" for the bank's empty one. */
const shown = (m: Message | undefined) => (m && m.text.trim() !== "\\x{ffff}" ? toEditable(m.text) : "");

/** A text's ID made from the person's name ID and the field, not yet in the bank. */
function freshId(bank: Bank, stem: string, field: string): string {
  const base = `${PREFIX}${stem}${field}`;
  let id = base;
  for (let n = 2; bank.byId.has(id); n++) id = `${base}${n}`;
  return id;
}

/** Sets one of a row's texts: the message it names when only this row uses it, else a new message at the bank's end. */
function setText(bank: Bank, rows: JsonMap[], index: number, column: string, text: string, stem: string) {
  const bankDoc = documents.get(BANK);
  if (!bankDoc) return;
  const label = str(rows[index], column);
  const shared = label === null || label === `${PREFIX}Empty` ||
    rows.some((r, i) => i !== index && MESSAGE_COLUMNS.some((c) => r.get(c) === label));
  const value = fromEditable(text);
  if (!shared && bank.byId.has(label!)) {
    const lines = bankDoc.text.split("\n");
    const m = bank.byId.get(label!)!;
    lines[m.line - 1] = `${m.id} = ${value}`;
    documents.editText(BANK, lines.join("\n"));
    return;
  }
  // The person's own message for the field when no row names it any more (its line was given back to the usual one),
  // else a new one
  const own = `${PREFIX}${stem}${column === "name" ? "" : column.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join("")}`;
  const unused = bank.byId.get(own);
  if (unused && !rows.some((r) => MESSAGE_COLUMNS.some((c) => r.get(c) === own))) {
    const lines = bankDoc.text.split("\n");
    lines[unused.line - 1] = `${own} = ${value}`;
    documents.editText(BANK, lines.join("\n"));
    documents.edit(PEOPLE, ["rows", index, column], own);
    return;
  }
  const id = freshId(bank, stem, own.slice(PREFIX.length + stem.length));
  const body = bankDoc.text.endsWith("\n") ? bankDoc.text : `${bankDoc.text}\n`;
  documents.editText(BANK, `${body}${id} = ${value}\n`);
  documents.edit(PEOPLE, ["rows", index, column], id);
}

/** The stem of a person's own message IDs: its name's ID without the bank's prefix, or a new one from its name. */
const stemOf = (row: JsonMap, name: string) => {
  const label = str(row, "name");
  if (label?.startsWith(PREFIX)) return label.slice(PREFIX.length);
  return `${num(row, "type") === OWNER ? "Owner" : "Visitor"}${name.replace(/[^A-Za-z0-9]/g, "") || num(row, "trainer_id")}`;
};

interface Shop { row: number; kind: number; variant: number; level: number; nameMessage: number; goods: number[] }

function readShops(data: JsonValue | null): Shop[] {
  return rowsOf(data).map((r, row) => ({
    row, kind: num(r, "kind"), variant: num(r, "variant"), level: num(r, "level"), nameMessage: num(r, "name_message"),
    goods: Array.from({ length: 16 }, (_, n) => num(r, `goods_${n}`)).filter((g) => g !== 0 && g !== NONE),
  }));
}

/** The level-0 shop of a kind and variant, the one a person wants (the first, as row 0 is an empty one). */
const wantedRow = (shops: Shop[], kind: number, variant: number) => shops.find((s) => s.row > 0 && s.kind === kind && s.variant === variant && s.level === 0)?.row;

function TextField({ label, value, limit, hint, onChange }: { label: string; value: string; limit: number; hint: string; onChange(v: string): void }) {
  const over = [...value].length > limit;
  return (
    <>
      <span className="ja-label">{label}</span>
      <span className="ja-control">
        <input className={`ja-text${over ? " invalid" : ""}`} value={value} onChange={(e) => onChange(e.target.value.replace(/\n/g, ""))} />
        <span className={over ? "ja-count ja-error" : "ja-count muted"}>{[...value].length} / {limit}</span>
        <span className="muted ja-hint">{over ? `The game keeps only the first ${limit} characters.` : hint}</span>
      </span>
    </>
  );
}

function PersonPage({ index, rows, bank, shops, goods, constants, usedModels, order, tutorial, onRemoved, onMove }: {
  index: number;
  rows: JsonMap[];
  bank: Bank;
  shops: Shop[];
  goods: JsonMap[];
  constants: Constants;
  usedModels: ReadonlySet<string>;
  /** An owner's place among the owners, from 0, and how many there are. */
  order: { place: number; count: number } | null;
  /** Whether this is the owner the tutorial brings in. */
  tutorial: boolean;
  onRemoved(): void;
  /** Moves an owner earlier (-1) or later (1) among the owners. */
  onMove(by: number): void;
}) {
  const [picking, setPicking] = useState(false);
  const [allFields, setAllFields] = useState(false);
  const row = rows[index];
  const owner = num(row, "type") === OWNER;
  const textOf = (column: string) => shown(bank.byId.get(str(row, column) ?? ""));
  const isEmpty = (column: string) => { const l = str(row, column); return l === null || l === `${PREFIX}Empty` || !bank.byId.has(l); };
  const name = textOf("name");
  const stem = stemOf(row, name);
  const set = (key: string, value: JsonValue) => documents.edit(PEOPLE, ["rows", index, key], value);
  const model = String(row.get("model") ?? "");
  const id = num(row, "trainer_id");
  // The avenue knows an owner by trainer ID alone (PaperWhite2_JoinAvenue_IsOwner), so an owner's ID is theirs only;
  // the original's visitors share some, told apart by name and gender
  const sameId = rows.filter((r, i) => i !== index && num(r, "trainer_id") === id && (owner || num(r, "type") === OWNER));
  const shop = shops[num(row, "wanted_shop")];
  const kind = shop?.kind ?? 0;
  const variant = shop?.variant ?? 0;
  const sign = shop ? shown(bank.byNumber[shop.nameMessage]).replace(/\{0100:0\}/g, name || "…") : "";
  const top = shops.find((s) => s.kind === kind && s.variant === variant && s.level === TOP_LEVEL);
  const goodsName = (g: number) => {
    const r = goods[g];
    return r && num(r, "has_name") ? shown(bank.byNumber[num(r, "name_message")]) : null;
  };
  const otherOwners = rows.filter((r, i) => i !== index && num(r, "type") === OWNER && shops[num(r, "wanted_shop")]?.kind === kind);
  const remove = () => {
    if (!confirm(`Remove ${name || "this owner"}? Their texts stay in the text bank, unused.`)) return;
    documents.edit(PEOPLE, ["rows", index], undefined);
    onRemoved();
  };

  return (
    <div className="ja-page">
      <div className="ja-top">
        <span className="ja-portrait"><SpriteImage model={model} size={64} /></span>
        <div>
          <h2>{name || "(no name)"}</h2>
          <p className="muted ja-note">
            {owner ? `${tutorial ? "Tutorial owner" : `Owner ${order ? `${order.place + 1} of ${order.count}` : ""}`} · wants ${KINDS[kind] ?? "a shop"}`
              : num(row, "type") === TUTORIAL_VISITOR ? "Tutorial visitor" : "Random visitor"} · row {index} of {PEOPLE.slice(PEOPLE.lastIndexOf("/") + 1)}
          </p>
        </div>
        <span className="spacer" />
        {owner && order && (
          <span className="ja-actions">
            <button onClick={() => onMove(-1)} disabled={order.place === 0} title="Arrives earlier: the first is the tutorial's">↑ Earlier</button>
            <button onClick={() => onMove(1)} disabled={order.place === order.count - 1} title="Arrives later">↓ Later</button>
            <button onClick={remove} title="Remove this owner from the avenue's people">Remove owner</button>
          </span>
        )}
      </div>
      <div className="muted ja-note ja-arrival">
        {owner ? (tutorial ? "Arrives in the avenue's tutorial, as the person the guide asks you to invite; the other owners then arrive one a day, in the list's order."
          : kind === NURSERY ? "Arrives in the list's order, one owner a day, but only once the avenue reaches rank 15 (the Nursery's unlock); until then the next one comes instead."
            : "Arrives in the list's order, one owner a day after the tutorial's.")
          : num(row, "type") === TUTORIAL_VISITOR ? "Arrives in the avenue's tutorial after its first shop opens, as the person the guide asks you to recommend it to."
            : "One of the visitors who come and go each day; they can be recommended to, not invited."}
      </div>

      <section className="ja-box">
        <h5>Who they are <span className="muted">{name || "no name"}, {num(row, "gender") ? "female" : "male"}, ID {id}</span></h5>
        <div className="ja-grid">
          <TextField label="Name" value={name} limit={NAME_LENGTH} onChange={(v) => setText(bank, rows, index, "name", v, stem)}
                     hint={owner ? "As the avenue shows it, and on their shop's sign." : "As the avenue shows it."} />
          <span className="ja-label">Gender</span>
          <span className="ja-control">
            <span className="view-switch">
              {GENDERS.map(([label, value]) => (
                <button key={value} className={num(row, "gender") === value ? "active" : ""} onClick={() => set("gender", value)}>{label}</button>
              ))}
            </span>
            <span className="muted ja-hint">Picks the generic lines they speak, which differ by gender.</span>
          </span>
          <span className="ja-label">Look</span>
          <span className="ja-control">
            <span className="ja-model">
              <SpriteImage model={model} size={32} />
              <span>{constantLabel(model, MODEL_PREFIX)}</span>
              <button onClick={() => setPicking(true)}>Browse…</button>
            </span>
            <span className={(constants.get(model) ?? 0) >= MODEL_LIMIT ? "ja-error ja-hint" : "muted ja-hint"}>
              {(constants.get(model) ?? 0) >= MODEL_LIMIT ? `The avenue only shows the first ${MODEL_LIMIT} looks (object codes 0 to ${MODEL_LIMIT - 1}): this one is ${constants.get(model)}, so choose another.`
                : "The sprite they walk the avenue with; the original's visitors wear the Union Room's looks."}
            </span>
          </span>
          <span className="ja-label">Trainer ID</span>
          <span className="ja-control">
            <input type="number" className="ja-number" min={0} max={65535} value={id}
                   onChange={(e) => set("trainer_id", Math.max(0, Math.min(65535, Math.round(Number(e.target.value) || 0))))} />
            <span className={sameId.length ? "ja-error ja-hint" : "muted ja-hint"}>
              {sameId.length ? `${shown(bank.byId.get(str(sameId[0], "name") ?? ""))} has this ID too, and the avenue would take ${owner ? "them" : "this visitor"} for an owner: give ${owner ? "the owner" : "them"} an ID of their own.`
                : owner ? "The avenue knows an owner by it alone, so it must be theirs only."
                  : "Who they are to the avenue, with their name and gender; another visitor may share it, but never an owner."}
            </span>
          </span>
        </div>
      </section>

      {owner && (
        <section className="ja-box">
          <h5>Their shop <span className="muted">{sign || KINDS[kind]}</span></h5>
          <div className="ja-grid">
            <span className="ja-label">Kind</span>
            <span className="ja-control">
              <span className="view-switch ja-wrap">
                {KINDS.map((label, k) => (
                  <button key={k} className={kind === k ? "active" : ""} onClick={() => { const r = wantedRow(shops, k, variant); if (r !== undefined) set("wanted_shop", r); }}>{label}</button>
                ))}
              </span>
              <span className="muted ja-hint">
                {kind === NURSERY ? "The Nursery's owner arrives only once the avenue reaches rank 15 (its unlock 6)." : "The shop they open on a free lot when invited."}
                {otherOwners.length > 0 && ` ${otherOwners.map((r) => shown(bank.byId.get(str(r, "name") ?? ""))).join(", ")} wants one too.`}
              </span>
            </span>
            <span className="ja-label">Variant</span>
            <span className="ja-control">
              <span className="view-switch">
                {Array.from({ length: VARIANTS }, (_, v) => (
                  <button key={v} className={variant === v ? "active" : ""} onClick={() => { const r = wantedRow(shops, kind, v); if (r !== undefined) set("wanted_shop", r); }}>{v + 1}</button>
                ))}
              </span>
              <span className="muted ja-hint">
                The variants start the same and sell different goods as the shop grows; at its top level this one has{" "}
                {top ? top.goods.map(goodsName).filter((g): g is string => !!g).join(", ") || "only its prizes" : "nothing listed"}.
              </span>
            </span>
            <span className="ja-label">Sign</span>
            <span className="ja-control">
              <span className="ja-sign">{sign}</span>
              <span className="muted ja-hint">The shop's name, from its kind, with the owner's name put in.</span>
            </span>
          </div>
        </section>
      )}

      <section className="ja-box">
        <h5>What they say <span className="muted">{TEXTS.map(([c]) => textOf(c) || "…").join(" · ")}</span></h5>
        <div className="ja-grid">
          {TEXTS.map(([column, label]) => (
            <TextField key={column} label={label} value={textOf(column)} limit={MESSAGE_LENGTH} onChange={(v) => setText(bank, rows, index, column, v, stem)}
                       hint={column === "greeting" ? "The greeting of their profile, which the avenue's lines put in." : "One of their profile's two messages, which the avenue's lines put in."} />
          ))}
        </div>
        <p className="muted ja-note">A text that others share becomes {name ? `${name}'s` : "their"} own once it's changed, so no one else's changes with it.</p>
      </section>

      {owner && (
        <section className="ja-box">
          <h5>Their own lines <span className="muted">{OWN_LINES.filter((l) => !isEmpty(l.column)).length} of {OWN_LINES.length}, the rest the avenue's usual lines</span></h5>
          <div className="ja-grid">
            {OWN_LINES.map((l) => {
              const message = bank.byId.get(str(row, l.column) ?? "");
              const empty = isEmpty(l.column);
              const raw = message?.text ?? "";
              const paused = /\{be0[01]\}\s*$/.test(raw);
              return (
                <div key={l.column} className="ja-line">
                  <span className="ja-label">{l.label}</span>
                  <span className="ja-control">
                    {empty ? (
                      <button onClick={() => setText(bank, rows, index, l.column, toEditable(l.start), stem)}>Write their own</button>
                    ) : (
                      <>
                        <textarea className="ja-line-text" value={toEditable(raw)} rows={Math.max(3, toEditable(raw).split("\n").length + 1)}
                                  onChange={(e) => setText(bank, rows, index, l.column, e.target.value, stem)} spellCheck />
                        <button onClick={() => set(l.column, `${PREFIX}Empty`)} title="Say the avenue's usual line here instead">Use the usual line</button>
                        <span className="ja-preview"><TextBox text={raw} words={{ 0: name || "…" }} /></span>
                      </>
                    )}
                    <span className={"open" in l && paused ? "ja-error ja-hint" : "muted ja-hint"}>
                      {"open" in l && paused ? "This ends with a pause, so it would close before the menu shows: remove the last {be01}." : l.hint}
                      {!empty && !("open" in l) && !paused && " It should end with {be01}, a pause, so it waits for A."}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
          <p className="muted ja-note">{"{0100:0}"} is their name. {"{be01}"} waits for A and scrolls on, {"{be00}"} waits for A and starts a new box.</p>
        </section>
      )}

      <section className="ja-box">
        <h5>
          <button className="link" onClick={() => setAllFields(!allFields)}>{allFields ? "▾" : "▸"} All fields</button>
          <span className="muted">the row as the table has it, message IDs and all</span>
        </h5>
        {allFields && <DocForm path={PEOPLE} at={["rows", index]} constants={constants} hideDescription flat />}
      </section>

      {picking && <ModelPicker constants={constants} value={model} used={usedModels}
                               onPick={(m) => { set("model", m); setPicking(false); }} onClose={() => setPicking(false)} />}
    </div>
  );
}

export function JoinAvenueEditor({ constants }: ToolProps) {
  const toolActive = useToolActive();
  const people = useHeld(PEOPLE);
  const shopsData = useHeld(SHOPS).data;
  const goodsData = useHeld(GOODS).data;
  const { messages, error: bankError } = useBank(BANK);
  const bank = useMemo(() => readBank(messages), [messages]);
  const shops = useMemo(() => readShops(shopsData), [shopsData]);
  const goods = useMemo(() => rowsOf(goodsData), [goodsData]);
  const rows = useMemo(() => rowsOf(people.data), [people.data]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const { docs } = useDocuments();

  const listed = useMemo(() => rows.map((r, i) => ({ index: i, type: num(r, "type"), row: r })).filter((p) => [OWNER, VISITOR, TUTORIAL_VISITOR].includes(p.type)), [rows]);
  const nameOf = (r: JsonMap) => (bank ? shown(bank.byId.get(str(r, "name") ?? "")) : "");
  const usedModels = useMemo(() => new Set(listed.map((p) => String(p.row.get("model") ?? ""))), [listed]);
  useEffect(() => {
    if (chosen === null && listed.length) setChosen(listed[0].index);
    if (chosen !== null && chosen >= rows.length) setChosen(listed.at(-1)?.index ?? null);
  }, [chosen, listed, rows.length]);

  const paths = [PEOPLE, BANK];
  const unsaved = [...docs.values()].filter((d) => d.dirty && paths.includes(d.path));
  // The bank first: the table names its new messages
  const save = useCallback(async () => {
    for (const p of [BANK, PEOPLE]) if (documents.get(p)?.dirty) await documents.save(p);
  }, []);
  useEffect(() => {
    if (!toolActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
      e.preventDefault(); e.stopPropagation(); save();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [save, toolActive]);

  /** A new owner after the others: the last owner's look and texts, the next free trainer ID, and a shop kind no owner
   * wants yet. */
  const addOwner = () => {
    if (!bank) return;
    const owners = rows.filter((r) => num(r, "type") === OWNER);
    const last = owners.at(-1) ?? rows.find((r) => num(r, "type") === VISITOR);
    const bankDoc = documents.get(BANK);
    if (!last || !bankDoc) return;
    const taken = new Set(owners.map((r) => shops[num(r, "wanted_shop")]?.kind));
    const kind = KINDS.findIndex((_, k) => !taken.has(k));
    const ids = new Set(rows.map((r) => num(r, "trainer_id")));
    let id = Math.max(...owners.map((r) => num(r, "trainer_id")), 61000) + 1;
    while (ids.has(id)) id++;
    const nameId = freshId(bank, "OwnerNew", "");
    const body = bankDoc.text.endsWith("\n") ? bankDoc.text : `${bankDoc.text}\n`;
    documents.editText(BANK, `${body}${nameId} = New\n`);
    const row = new Map(last);
    row.set("type", OWNER);
    row.set("name", nameId);
    row.set("trainer_id", id);
    row.set("wanted_shop", wantedRow(shops, kind < 0 ? 0 : kind, 0) ?? num(last, "wanted_shop"));
    documents.edit(PEOPLE, ["rows", rows.length], row);
    setChosen(rows.length);
  };

  const q = filter.trim().toLowerCase();
  const group = (type: number) => listed.filter((p) => p.type === type && (!q || nameOf(p.row).toLowerCase().includes(q) ||
    String(p.row.get("model") ?? "").toLowerCase().includes(q.replace(/ /g, "_")) || String(num(p.row, "trainer_id")) === q));
  const item = (p: (typeof listed)[number]) => (
    <button key={p.index} className={`ja-item${p.index === chosen ? " selected" : ""}`} onClick={() => setChosen(p.index)}>
      <SpriteImage model={String(p.row.get("model") ?? "")} size={24} />
      <span className="ja-item-name">{nameOf(p.row) || "(no name)"}{p.index === tutorialOwner && <span className="ja-badge" title="Arrives in the tutorial">tutorial</span>}</span>
      <span className="muted ja-item-detail">{p.type === OWNER ? KINDS[shops[num(p.row, "wanted_shop")]?.kind ?? -1] ?? "" : num(p.row, "gender") ? "♀" : "♂"}</span>
    </button>
  );
  const owners = group(OWNER);
  const tutorialVisitors = group(TUTORIAL_VISITOR);
  // The owners in their order, unfiltered, and the tutorial's: the first but the Nursery's, which can't arrive yet
  const ownerRows = listed.filter((p) => p.type === OWNER).map((p) => p.index);
  const tutorialOwner = ownerRows.find((i) => shops[num(rows[i], "wanted_shop")]?.kind !== NURSERY);
  const move = (index: number, by: number) => {
    const place = ownerRows.indexOf(index);
    const other = ownerRows[place + by];
    const all = (people.data instanceof Map ? (people.data.get("rows") as JsonValue[]) : []).slice();
    if (other === undefined) return;
    [all[index], all[other]] = [all[other], all[index]];
    documents.edit(PEOPLE, ["rows"], all);
    setChosen(other);
  };
  const visitors = group(VISITOR);
  const error = people.error ?? bankError;

  return (
    <div className="ja-editor">
      <header className="ja-header">
        <h2>Join Avenue</h2>
        <span className="muted ja-note">The first owner arrives in the tutorial, then one a day in the list's order; only owners can be invited, and visitors only recommended to.</span>
        <span className="spacer" />
        {unsaved.length > 0 && <span className="muted">{unsaved.length} unsaved</span>}
        <button onClick={() => unsaved.forEach((d) => documents.reload(d.path))} disabled={!unsaved.length}>Revert</button>
        <button className="primary" onClick={save} disabled={!unsaved.length} title="Ctrl+S">Save</button>
      </header>
      {unsaved.filter((d) => d.saveError).map((d) => <div key={d.path} className="ja-error ja-bar">{d.path}: {d.saveError}</div>)}
      {error ? <p className="ja-error ja-bar">{error}</p> : !bank || !(people.data instanceof Map) || !shops.length ? <p className="muted ja-bar">Reading the avenue…</p> : (
        <div className="ja-split">
          <div className="ja-list">
            <input className="filter" placeholder={`Filter ${listed.length} people by name, look or ID…`} value={filter} onChange={(e) => setFilter(e.target.value)} />
            <div className="ja-list-items">
              <div className="ja-group">
                <span>Owners <span className="muted">{owners.length}</span></span>
                <button className="ja-group-add" onClick={addOwner} title="A new owner, after the others">+ Add</button>
              </div>
              {owners.map(item)}
              {!owners.length && <p className="muted ja-note ja-pad">No owners{q ? " match" : " yet"}.</p>}
              <div className="ja-group"><span>Tutorial visitor</span></div>
              {tutorialVisitors.map(item)}
              <div className="ja-group"><span>Random visitors <span className="muted">{visitors.length}</span></span></div>
              {visitors.map(item)}
            </div>
          </div>
          <div className="ja-detail">
            {chosen !== null && rows[chosen] && [OWNER, VISITOR, TUTORIAL_VISITOR].includes(num(rows[chosen], "type"))
              ? <PersonPage key={chosen} index={chosen} rows={rows} bank={bank} shops={shops} goods={goods} constants={constants} usedModels={usedModels}
                            order={ownerRows.includes(chosen) ? { place: ownerRows.indexOf(chosen), count: ownerRows.length } : null}
                            tutorial={chosen === tutorialOwner} onRemoved={() => setChosen(null)} onMove={(by) => move(chosen, by)} />
              : <p className="muted ja-pad">Choose someone.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
