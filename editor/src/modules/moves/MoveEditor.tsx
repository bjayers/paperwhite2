// The Move Editor: every move (res/moves/<move>/data.json, move.schema.json), the original game's and those Paper
// White 2 adds (docs/paperwhite2/design/moves-and-abilities.md), with a page of headed sections: Basics, Effect (the
// quality and the fields it reads, the flags as checkboxes), Battle (the AI's effect; an added move's animation and
// whose handlers it takes, and where its battle code is), Text, and who learns it (read only, with links). Add move
// copies a template or starts blank; an added move can be retired (hidden from the pickers) or, the last, removed.
// Adding, removing and retiring are tools/paperwhite2/moves.py's, through /api/moves/*; every edit goes through the
// document store, so saving runs the build's validator.

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type AddedMove, type EntryChange, type MoveUses, type MovesInfo } from "../../api.ts";
import { documents, useDocuments } from "../../documents.ts";
import type { JsonMap, JsonValue } from "../../../shared/json.ts";
import type { Constants } from "../../../shared/schema.ts";
import { navigate, useToolParams } from "../../navigation.ts";
import { SearchSelect, type Option } from "../../shell/SearchSelect.tsx";
import { DocForm, useHeld } from "../followers/DocForm.tsx";
import { Row } from "../pokemon/FormPage.tsx";
import { constantLabel, constantOptions } from "../schema-form/form.tsx";
import type { ToolProps } from "../types.ts";
import { applyEntryChange, DescriptionInput, EntryHeader, NameInput, planText, Section } from "./shared.tsx";

const SCHEMA = "res/moves/move.schema.json";
const PREFIXES = ["res/moves/", "generated/moves.txt"];
const BLANK = "blank";
// The qualities whose moves read each part of the record (the battle's dispatch on the quality, the comments of
// include/constants/battle.h's MOVE_QUALITY_*): the stat changes and the condition
const READS_STATS = /STAT/;
const READS_CONDITION = /INFLICT/;

interface ListedMove {
  move: string;
  id: number;
  path: string;
  name: string;
  type: string;
  category: string;
  power: number;
  added: AddedMove | null;
}

const moveConstant = (path: string) => `MOVE_${path.split("/")[2].toUpperCase()}`;

/** Every move by ID, with the added ones' facts. */
function listMoves(files: { path: string; data: Record<string, unknown> }[], constants: Constants, info: MovesInfo | null): ListedMove[] {
  const added = new Map((info?.moves ?? []).map((m) => [m.move, m]));
  return files.map(({ path, data }) => {
    const move = moveConstant(path);
    return { move, id: constants.get(move) ?? -1, path, name: String(data.name ?? ""), type: String(data.type ?? ""),
      category: String(data.category ?? ""), power: Number(data.power ?? 0), added: added.get(move) ?? null };
  }).filter((m) => m.id > 0).sort((a, b) => a.id - b.id);
}

/** The original moves (not MOVE_NONE), for the animation and "handlers like" pickers. */
function originalOptions(constants: Constants, info: MovesInfo | null, only?: (move: string) => boolean): Option[] {
  const first = info?.firstAdded ?? 560;
  return constantOptions(constants, "MOVE_").filter((o) => Number(o.detail) > 0 && Number(o.detail) < first && (!only || only(o.value)));
}

/** The flags as checkboxes, from MOVE_FLAG_*'s constants and their comments; flags kept in the order of their bits. */
function Flags({ path, data, constants, notes }: { path: string; data: JsonMap; constants: Constants; notes: Record<string, string> }) {
  const flags = ((data.get("flags") as JsonValue[] | undefined) ?? []);
  const options = constantOptions(constants, "MOVE_FLAG_");
  const value = (f: JsonValue) => (typeof f === "number" ? f : constants.get(String(f)) ?? 0);
  const toggle = (flag: string, on: boolean) => {
    const next = on ? [...flags, flag] : flags.filter((f) => f !== flag);
    documents.edit(path, ["flags"], [...next].sort((a, b) => value(a) - value(b)));
  };
  return (
    <div className="mv-flags">
      {options.map((o) => (
        <label key={o.value} className="pkm-check mv-flag" title={`${o.value} (bit ${Math.log2(Number(o.detail))})`}>
          <input type="checkbox" checked={flags.includes(o.value)} onChange={(e) => toggle(o.value, e.target.checked)} />
          <span>{o.label}{notes[o.value] && <span className="muted"> · {notes[o.value]}</span>}</span>
        </label>
      ))}
      {flags.filter((f) => typeof f === "number").map((f) => <span key={String(f)} className="muted">and the value {String(f)}</span>)}
    </div>
  );
}

/** Fields the move's quality doesn't read, folded away. */
function Unread({ what, children }: { what: string; children: React.ReactNode }) {
  return (
    <details className="mv-unread">
      <summary className="muted">This quality doesn't read {what}: show anyway</summary>
      {children}
    </details>
  );
}

/** Who learns the move (level-up, TM or HM, tutor, egg), evolves by it, and the trainers, sets, files and code that
 * name it, read only, with links. */
function Uses({ move, epoch }: { move: string; epoch: number }) {
  const [uses, setUses] = useState<MoveUses | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUses(null);
    setError(null);
    api.moveUses(move).then((u) => live && setUses(u), (e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [move, epoch]);
  if (error) return <p className="pkm-error">{error}</p>;
  if (!uses) return <p className="muted">Looking for it in res/…</p>;
  const how = (l: MoveUses["learners"][number]) => [
    ...l.levels.map((n) => (n ? `Lv. ${n}` : "Evolving")), ...l.tm, l.tutor ? "Tutor" : "", l.egg ? "Egg" : "", l.evolution ? "Evolves by it" : "",
  ].filter(Boolean).join(", ");
  return (
    <div className="pkm-rows">
      <Row label="Pokémon" hint={uses.tm.length ? `Taught by ${uses.tm.join(" and ")} (src/system/pml_item.c's TM_MOVE_LIST).` : undefined}>
        {uses.learners.length ? (
          <div className="mv-uses">
            {uses.learners.map((l) => (
              <button key={l.path} className="link mv-use" title={`Open in the Pokémon Editor (${l.path})`}
                onClick={() => navigate("pokemon", { species: l.species, ...(l.form ? { form: l.form } : {}) })}>
                {l.name} <span className="muted">{how(l)}</span>
              </button>
            ))}
          </div>
        ) : <span className="muted">No Pokémon learns it.</span>}
      </Row>
      <Row label="Trainers">
        {uses.trainers.length ? (
          <div className="mv-uses">
            {uses.trainers.map((t) => (
              <button key={t.path} className="link mv-use" onClick={() => navigate("trainers", { trainer: t.trainer })}>{t.name || t.trainer}
                <span className="muted"> {constantLabel(t.trainer, "TRAINER_")}</span></button>
            ))}
          </div>
        ) : <span className="muted">None.</span>}
      </Row>
      {uses.facilities.length > 0 && <Row label="Facility sets">{uses.facilities.length} sets (Battle Subway, PWT, Black Tower…)</Row>}
      {uses.other.length > 0 && <Row label="Other files">{uses.other.join(", ")}</Row>}
      {uses.code.length > 0 && <Row label="Code">{uses.code.join(", ")}</Row>}
    </div>
  );
}

/** An added move's card: its ID and constant, its status, Retire or Bring back, and Remove for the last. */
function AddedMoveCard({ added, onChanged }: { added: AddedMove; onChanged(select?: string): void }) {
  const [message, setMessage] = useState<string | null>(null);
  const run = async (change: () => Promise<EntryChange>, select?: string) => {
    const result = await applyEntryChange(change, PREFIXES);
    if (result) { setMessage(result.message); onChanged(select); }
  };
  const retire = (retired: boolean) => {
    if (retired && !confirm(`Retire ${added.name}? It keeps ID ${added.id} and its data, so Pokémon in saves that know it stay valid, `
      + "but the editor's pickers (learnsets, trainers) leave it out. You can bring it back.")) return;
    void run(() => api.retireMove({ move: added.move, retired }));
  };
  const remove = async () => {
    let plan: EntryChange;
    try {
      plan = await api.removeMove({ move: added.move, check: true });
    } catch (e) {
      setMessage((e as Error).message);
      return;
    }
    if (!confirm(`${planText(plan)} Any Pokémon in a save that knows ${added.name} would know an invalid move.`)) return;
    void run(() => api.removeMove({ move: added.move }), "");
  };
  return (
    <Section title="Added move" summary={`ID ${added.id} · ${added.move}${added.retired ? " · retired" : ""}`} actions={<>
      <button onClick={() => retire(!added.retired)}>{added.retired ? "Bring back" : "Retire"}</button>
      <button className="danger" disabled={!added.last} onClick={remove}
        title={added.last ? "Undo everything Add move wrote for it" : "Only the last added move can be removed (removing another would renumber those after it): retire it instead"}>Remove</button>
    </>}>
      <div className="pkm-rows">
        <Row label="Status">{added.retired
          ? "Retired: hidden from the pickers (learnsets, trainers), keeping its ID and data so saved Pokémon stay valid."
          : "In the game after Fusion Bolt; its name, description and \"used\" messages follow from its file."}</Row>
        {message && <Row label="Last change">{message}</Row>}
      </div>
    </Section>
  );
}

/** Where a move's battle behaviour comes from: the hack's C, an original move's handlers, or its data alone. */
function BattleCodeNote({ move, added, info }: { move: string; added: AddedMove | null; info: MovesInfo | null }) {
  if (!info) return null;
  if (added?.ownHandlers) {
    return <p className="mv-code-note">This one has battle code in <code>{info.battleCode}</code> (an <code>#ifdef {move}</code>{" "}
      there, with its row in <code>{info.handlersCode}</code>'s table): its own rules are C, and the fields here are its data.</p>;
  }
  const like = added ? added.handlersLike : move;
  const fn = like ? info.handlers[like] : undefined;
  if (fn) return <p className="muted pkm-note">Its rules beyond its data: {added ? `${constantLabel(like!, "MOVE_")}'s handlers, ` : ""}<code>{fn}</code> in <code>{info.handlersCode}</code>.</p>;
  return <p className="muted pkm-note">No handlers: it runs on its data alone (its quality and the fields below).</p>;
}

function MovePage({ entry, info, constants, epoch, onChanged }: {
  entry: ListedMove; info: MovesInfo | null; constants: Constants; epoch: number; onChanged(select?: string): void;
}) {
  const { data, error } = useHeld(entry.path);
  const [notes, setNotes] = useState<Record<string, Record<string, string>>>({});
  useEffect(() => {
    let live = true;
    Promise.all(["MOVE_QUALITY_", "MOVE_FLAG_", "MOVE_TARGET_"].map((p) => api.constantNotes(p).catch(() => ({}))))
      .then(([quality, flag, target]) => live && setNotes({ quality, flag, target }));
    return () => { live = false; };
  }, []);
  if (error) return <p className="pkm-error">{error}</p>;
  if (!(data instanceof Map)) return <p className="muted pkm-empty">Reading…</p>;
  const path = entry.path;
  const added = entry.added;
  const field = (key: string) => data.has(key) ? <DocForm path={path} at={[key]} constants={constants} hideDescription /> : <span className="muted">—</span>;
  const quality = String(data.get("quality") ?? "");
  const accuracy = Number(data.get("accuracy") ?? 0);
  const name = String(data.get("name") ?? "");
  const limit = info?.nameLength ?? 12;
  const handlerMoves = (m: string) => m in (info?.handlers ?? {}) && !(info?.subIdCompared ?? []).includes(m);
  return (
    <div className="pkm-page">
      <div className="mv-top">
        <h2><span className="muted">#{entry.id}</span> {name}
          {added && <span className="pkm-tag pkm-title-tag">added</span>}
          {added?.retired && <span className="pkm-tag pkm-tag-hidden pkm-title-tag">hidden</span>}
          {added?.ownHandlers && <span className="pkm-tag pkm-title-tag mv-c-tag">C</span>}</h2>
        <p className="muted pkm-note">{entry.move} · {path}</p>
      </div>
      {added && <AddedMoveCard added={added} onChanged={onChanged} />}
      <Section title="Basics" summary={`${constantLabel(String(data.get("type") ?? ""), "TYPE_")}, ${constantLabel(String(data.get("category") ?? ""), "MOVE_CATEGORY_")}`}>
        <div className="pkm-rows mv-rows">
          <Row label="Type">{field("type")}</Row>
          <Row label="Category" hint="Physical moves use Attack and Defense, special ones Sp. Atk and Sp. Def; status moves deal no damage.">{field("category")}</Row>
          <Row label="Power" hint="0 for a move whose damage isn't from its power (status moves, fixed or varied damage).">{field("power")}</Row>
          <Row label="Accuracy" hint={accuracy === 101 ? "101: it never misses." : "In percent; 101 for a move that never misses."}>{field("accuracy")}</Row>
          <Row label="PP" hint="Its base PP; PP Ups add a fifth each, up to three.">{field("pp")}</Row>
          <Row label="Priority" hint="Higher goes first in the turn (Quick Attack +1, Protect +4, Trick Room −7).">{field("priority")}</Row>
          <Row label="Target" hint={notes.target?.[String(data.get("target"))]}>{field("target")}</Row>
        </div>
      </Section>
      <Section title="Effect" summary={notes.quality?.[quality] ?? constantLabel(quality, "MOVE_QUALITY_")}>
        <div className="pkm-rows mv-rows">
          <Row label="Quality" hint="What the battle does with the move: the quality chooses which of the fields below it reads.">{field("quality")}</Row>
          <Row label="Stat changes" hint={READS_STATS.test(quality) ? "Read by this quality: up to three stats, the stages each changes by and its chance." : undefined}>
            {READS_STATS.test(quality) ? field("stat_changes") : <Unread what="them">{field("stat_changes")}</Unread>}
          </Row>
          <Row label="Condition" hint={READS_CONDITION.test(quality) ? "Read by this quality: the condition, its chance and how long it lasts (duration 1 permanent, 2 turns, 3 while the user stays in, 4 that and turns)." : undefined}>
            {READS_CONDITION.test(quality) ? field("inflicts") : <Unread what="it">{field("inflicts")}</Unread>}
          </Row>
          <Row label="Hits" hint="Multi-hit moves: the fewest and most hits; 0 and 0 for one hit.">{field("hits")}</Row>
          <Row label="Critical hits" hint="The critical hit stage it adds; 6 always lands one.">{field("crit_stage")}</Row>
          <Row label="Flinch" hint="The chance in percent that the target flinches.">{field("flinch_chance")}</Row>
          <Row label="Drain or recoil" hint="Of the damage dealt, in percent: positive drains it, negative is recoil.">{field("drain")}</Row>
          <Row label="Heal" hint="Of the user's HP, in percent.">{field("heal")}</Row>
          <Row label="Flags"><Flags path={path} data={data} constants={constants} notes={notes.flag ?? {}} /></Row>
        </div>
      </Section>
      <Section title="Battle" summary={added ? `plays ${constantLabel(added.animation, "MOVE_")}'s animation` : undefined}>
        <BattleCodeNote move={entry.move} added={added} info={info} />
        <div className="pkm-rows mv-rows">
          {added && (
            <Row label="Animation" hint={`Plays ${constantLabel(String(data.get("animation") ?? ""), "MOVE_")}'s animation and its sounds: the battle view takes a move ID past 560 for one of its own effects, so an added move borrows an original one's.`}>
              <SearchSelect value={String(data.get("animation") ?? "")} options={originalOptions(constants, info)}
                onChange={(v) => documents.edit(path, ["animation"], v)} />
            </Row>
          )}
          {added && (
            <Row label="Works like" hint={data.has("handlers_like")
              ? `Takes ${constantLabel(String(data.get("handlers_like")), "MOVE_")}'s battle handlers (its rules beyond the data), registered as this move.`
              : added.ownHandlers ? "Its own handlers, in the hack's battle code." : "None: it runs on its data alone."}>
              <SearchSelect value={String(data.get("handlers_like") ?? "")}
                options={[{ value: "", label: added.ownHandlers ? "None (its own, in C)" : "Its data alone", detail: "no original move's handlers" }, ...originalOptions(constants, info, handlerMoves)]}
                onChange={(v) => documents.edit(path, ["handlers_like"], v || undefined)} />
            </Row>
          )}
          <Row label="AI effect" hint="How the trainer AI sees the move: its scripts branch on this effect. A new rule borrows the nearest existing one.">{field("effect")}</Row>
        </div>
      </Section>
      <Section title="Text" summary={`${name.length}/${limit} characters`}>
        <div className="pkm-rows mv-rows">
          <Row label="Name" hint={`Up to ${limit} characters, which the summary and the battle menu fit. The names in capitals and the battle's "used" messages follow from it.`}>
            <NameInput value={name} limit={limit} onChange={(v) => documents.edit(path, ["name"], v)} />
          </Row>
          <Row label="Description" hint="As the summary and the Move Reminder show it, line by line (three lines, as the originals).">
            <DescriptionInput value={String(data.get("description") ?? "")} onChange={(v) => documents.edit(path, ["description"], v)} />
          </Row>
        </div>
      </Section>
      <Section title="Who learns it" summary="read only: edit learnsets in the Pokémon Editor">
        <Uses move={entry.move} epoch={epoch} />
      </Section>
    </div>
  );
}

/** Add move: a name, a template (a move, or blank), and optionally its animation, "works like" and AI effect, with a
 * dry run of what it will write. */
export function AddMoveDialog({ list, info, constants, onClose, onDone }: {
  list: ListedMove[]; info: MovesInfo | null; constants: Constants; onClose(): void; onDone(move: string): void;
}) {
  const [name, setName] = useState("");
  const [from, setFrom] = useState("MOVE_TACKLE");
  const [animation, setAnimation] = useState("");
  const [handlers, setHandlers] = useState("");
  const [effect, setEffect] = useState("");
  const [plan, setPlan] = useState<{ ok: boolean; text: string; warnings: string[]; animation?: string; handlers?: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const templates = useMemo<Option[]>(() => [
    { value: BLANK, label: "Blank", detail: "Normal, physical, 40 power, Pound's animation" },
    ...list.filter((m) => !m.added?.retired).map((m) => ({ value: m.move, label: m.name, detail: m.added ? `added, #${m.id}` : `#${m.id}` })),
  ], [list]);
  const templateName = templates.find((t) => t.value === from)?.label ?? from;
  const body = (check: boolean) => ({ name: name.trim(), from, check, ...(animation ? { animation } : {}),
    ...(handlers ? { handlersLike: handlers } : {}), ...(effect ? { effect } : {}) });
  useEffect(() => {
    if (!name.trim()) { setPlan(null); return; }
    let live = true;
    const timer = setTimeout(() => {
      api.addMove(body(true)).then((r) => live && setPlan({ ok: true, text: planText(r), warnings: r.warnings ?? [],
        animation: (r as { animation?: string }).animation, handlers: (r as { handlersLike?: string | null }).handlersLike }),
      (e: Error) => live && setPlan({ ok: false, text: `Can't: ${e.message}`, warnings: [] }));
    }, 250);
    return () => { live = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, from, animation, handlers, effect]);
  const apply = async () => {
    setBusy(true);
    const result = await applyEntryChange(() => api.addMove(body(false)), PREFIXES);
    setBusy(false);
    if (result?.move) onDone(result.move);
  };
  const handlerMoves = (m: string) => m in (info?.handlers ?? {}) && !(info?.subIdCompared ?? []).includes(m);
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="pkm-dialog" role="dialog" aria-label="Add move" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pkm-card-head">
          <h3>Add move <span className="muted">· ID {info?.nextId ?? "…"}</span></h3>
          <span className="spacer" />
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy || !plan?.ok} onClick={apply}>{busy ? "Writing…" : "Add move"}</button>
        </div>
        <h4>The move</h4>
        <div className="pkm-rows">
          <Row label="Name" hint={`Up to ${info?.nameLength ?? 12} characters, starting with a letter. Its constant and folder follow from it (Body Press: MOVE_BODY_PRESS, res/moves/body_press/).`}>
            <input autoFocus value={name} placeholder="Body Press" onChange={(e) => setName(e.target.value)} />
          </Row>
          <Row label="Copy of" hint="Its record: type, category, power, accuracy, PP, quality, effects, flags, AI effect and description, all editable after. An added template's own C rules don't come with it.">
            <SearchSelect value={from} options={templates} onChange={setFrom} />
          </Row>
        </div>
        <h4>In battle</h4>
        <div className="pkm-rows">
          <Row label="Animation" hint={`The original move whose animation and sounds it plays: ${animation ? constantLabel(animation, "MOVE_") : from === BLANK ? "Pound" : `${templateName}'s`}${animation ? "" : " (the template's)"}.`}>
            <SearchSelect value={animation} options={[{ value: "", label: "As the template", detail: plan?.animation ? constantLabel(plan.animation, "MOVE_") : "" }, ...originalOptions(constants, info)]} onChange={setAnimation} />
          </Row>
          <Row label="Works like" hint={handlers === "none" ? "Its data alone: no handlers." : handlers ? `${constantLabel(handlers, "MOVE_")}'s handlers, its rules beyond the data.`
            : plan?.handlers ? `${constantLabel(plan.handlers, "MOVE_")}'s handlers (the template's).` : "Its data alone (the template has no handlers to take)."}>
            <SearchSelect value={handlers} options={[{ value: "", label: "As the template" }, { value: "none", label: "Its data alone", detail: "no handlers" },
              ...originalOptions(constants, info, handlerMoves)]} onChange={setHandlers} />
          </Row>
          <Row label="AI effect" hint="How the trainer AI scores it; the template's unless chosen.">
            <SearchSelect value={effect} options={[{ value: "", label: "As the template" }, ...constantOptions(constants, "BATTLE_EFFECT_")]} onChange={setEffect} />
          </Row>
        </div>
        <h4>Dry run</h4>
        <p className={`pkm-note${plan && !plan.ok ? " pkm-error" : ""}`}>{plan?.text ?? "Name the move to see what it will write."}</p>
        {plan?.warnings.map((w) => <p key={w} className="pkm-note mv-warning">⚠ {w}</p>)}
        <p className="muted pkm-note">The build does the rest: the move's record, its names and description in the text banks, the battle's "used"
          messages and the animation table follow from these files. Give it to Pokémon in the Pokémon Editor's learnsets.</p>
      </div>
    </div>
  );
}

export function MoveEditor({ constants }: ToolProps) {
  const [files, setFiles] = useState<{ path: string; data: Record<string, unknown> }[] | null>(null);
  const [info, setInfo] = useState<MovesInfo | null>(null);
  const [filter, setFilter] = useState("");
  const [type, setType] = useState("");
  const [addedOnly, setAddedOnly] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const { docs } = useDocuments();
  useEffect(() => {
    let live = true;
    Promise.all([api.data(SCHEMA, ["name", "type", "category", "power"]), api.moves().catch(() => null)]).then(([f, i]) => {
      if (live) { setFiles(f); setInfo(i); }
    });
    return () => { live = false; };
  }, [epoch, constants]);
  useEffect(() => documents.onFiles((paths) => {
    if (paths.some((p) => p.startsWith("res/moves/") || p === "generated/moves.txt")) setEpoch((n) => n + 1);
  }), []);
  const list = useMemo(() => (files ? listMoves(files, constants, info) : []), [files, constants, info]);
  const params = useToolParams("moves");
  useEffect(() => {
    const wanted = params.get("move");
    if (wanted && list.some((m) => m.move === wanted)) setChosen(wanted);
  }, [params, list]);
  const changed = useCallback((select?: string) => {
    setEpoch((n) => n + 1);
    if (select !== undefined) setChosen(select || null);
  }, []);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return list.filter((m) => (!addedOnly || m.added) && (!type || m.type === type)
      && (!q || m.name.toLowerCase().includes(q) || m.move.toLowerCase().includes(q) || String(m.id) === q));
  }, [list, filter, type, addedOnly]);
  const entry = list.find((m) => m.move === chosen) ?? null;
  return (
    <div className="pkm-editor">
      <EntryHeader title="Move Editor" prefix="res/moves/" undoPath={entry?.path ?? null} onSaved={() => setEpoch((n) => n + 1)} />
      <div className="pkm-split">
        <div className="pkm-list">
          <div className="pkm-list-head">
            <input className="filter" placeholder={`Filter ${list.length} moves…`} value={filter} onChange={(e) => setFilter(e.target.value)} />
            <button className="primary" onClick={() => setAdding(true)} title="A new move, copied from a template">+ Add move</button>
          </div>
          <div className="mv-list-filters">
            <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
              <option value="">Every type</option>
              {constantOptions(constants, "TYPE_").filter((o) => o.value !== "TYPE_NULL").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <label className="pkm-check"><input type="checkbox" checked={addedOnly} onChange={(e) => setAddedOnly(e.target.checked)} /> Added</label>
          </div>
          <div className="pkm-list-items">
            {shown.map((m) => (
              <button key={m.move} className={`pkm-item${m.move === chosen ? " selected" : ""}`} onClick={() => setChosen(m.move)}>
                <span className="muted pkm-number">{m.id}</span>
                <span className="pkm-name">{m.name}{docs.get(m.path)?.dirty ? " •" : ""}</span>
                <span className={`mv-type mv-type-${m.type.replace("TYPE_", "").toLowerCase()}`}>{constantLabel(m.type, "TYPE_")}</span>
                {m.added && <span className="pkm-tag">added</span>}
                {m.added?.retired && <span className="pkm-tag pkm-tag-hidden">hidden</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="pkm-detail">
          {entry ? <MovePage key={entry.move} entry={entry} info={info} constants={constants} epoch={epoch} onChanged={changed} />
            : <p className="muted pkm-empty">Choose a move.</p>}
        </div>
      </div>
      {adding && <AddMoveDialog list={list} info={info} constants={constants} onClose={() => setAdding(false)}
        onDone={(move) => { setAdding(false); changed(move); }} />}
    </div>
  );
}
