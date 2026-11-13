// The Ability Editor: every ability (res/abilities/<ability>.json, ability.schema.json), the original game's and those
// Paper White 2 adds (docs/paperwhite2/design/moves-and-abilities.md), with a page of headed sections: Battle (where its
// battle code is, an added ability's "works like" and whether Mold Breaker ignores it), Text, and the Pokémon that
// have it (read only, with links). Add ability copies a template or starts blank; an added ability can be retired
// (hidden from the pickers) or, the last, removed. Adding, removing and retiring are tools/paperwhite2/abilities.py's,
// through /api/abilities/*; every edit goes through the document store, so saving runs the build's validator.

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type AbilitiesInfo, type AbilityUses, type AddedAbility, type EntryChange } from "../../api.ts";
import { documents, useDocuments } from "../../documents.ts";
import type { Constants } from "../../../shared/schema.ts";
import { navigate, useToolParams } from "../../navigation.ts";
import { SearchSelect, type Option } from "../../shell/SearchSelect.tsx";
import { useHeld } from "../followers/DocForm.tsx";
import { Row } from "../pokemon/FormPage.tsx";
import { constantLabel, constantOptions } from "../schema-form/form.tsx";
import type { ToolProps } from "../types.ts";
import { applyEntryChange, DescriptionInput, EntryHeader, NameInput, planText, Section } from "../moves/shared.tsx";

const SCHEMA = "res/abilities/ability.schema.json";
const PREFIXES = ["res/abilities/", "generated/abilities.txt"];
const BLANK = "blank";
const SLOT_NAMES: Record<string, string> = { "1": "first", "2": "second", hidden: "hidden" };

interface ListedAbility {
  ability: string;
  id: number;
  path: string;
  name: string;
  added: AddedAbility | null;
}

function listAbilities(files: { path: string; data: Record<string, unknown> }[], constants: Constants, info: AbilitiesInfo | null): ListedAbility[] {
  const added = new Map((info?.abilities ?? []).map((a) => [a.ability, a]));
  return files.map(({ path, data }) => {
    const ability = `ABILITY_${path.slice(path.lastIndexOf("/") + 1, -5).toUpperCase()}`;
    return { ability, id: constants.get(ability) ?? -1, path, name: String(data.name ?? ""), added: added.get(ability) ?? null };
  }).filter((a) => a.id > 0).sort((a, b) => a.id - b.id);
}

/** The original abilities with battle handlers, for "works like". */
function handlerOptions(constants: Constants, info: AbilitiesInfo | null): Option[] {
  const first = info?.firstAdded ?? 165;
  return constantOptions(constants, "ABILITY_").filter((o) => Number(o.detail) > 0 && Number(o.detail) < first && o.value in (info?.handlers ?? {}));
}

/** The species and forms that have the ability, and the files and code that name it, read only, with links. */
function Uses({ ability, epoch }: { ability: string; epoch: number }) {
  const [uses, setUses] = useState<AbilityUses | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUses(null);
    setError(null);
    api.abilityUses(ability).then((u) => live && setUses(u), (e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [ability, epoch]);
  if (error) return <p className="pkm-error">{error}</p>;
  if (!uses) return <p className="muted">Looking for it in res/…</p>;
  return (
    <div className="pkm-rows">
      <Row label="Pokémon" hint="A Pokémon keeps the ability it was made with: changing a species' abilities doesn't change those already caught.">
        {uses.species.length ? (
          <div className="mv-uses">
            {uses.species.map((s) => (
              <button key={s.path} className="link mv-use" title={`Open in the Pokémon Editor (${s.path})`}
                onClick={() => navigate("pokemon", { species: s.species, ...(s.form ? { form: s.form } : {}) })}>
                {s.name} <span className="muted">{s.slots.map((k) => SLOT_NAMES[k] ?? k).join(", ")}</span>
              </button>
            ))}
          </div>
        ) : <span className="muted">No Pokémon has it.</span>}
      </Row>
      {uses.other.length > 0 && <Row label="Other files" hint="The trainer AI's scripts check abilities by name.">{uses.other.join(", ")}</Row>}
      {uses.code.length > 0 && <Row label="Code">{uses.code.join(", ")}</Row>}
    </div>
  );
}

function AddedAbilityCard({ added, onChanged }: { added: AddedAbility; onChanged(select?: string): void }) {
  const [message, setMessage] = useState<string | null>(null);
  const run = async (change: () => Promise<EntryChange>, select?: string) => {
    const result = await applyEntryChange(change, PREFIXES);
    if (result) { setMessage(result.message); onChanged(select); }
  };
  const retire = (retired: boolean) => {
    if (retired && !confirm(`Retire ${added.name}? It keeps ID ${added.id} and its text, so Pokémon in saves that have it stay valid, `
      + "but the species' ability pickers leave it out. You can bring it back.")) return;
    void run(() => api.retireAbility({ ability: added.ability, retired }));
  };
  const remove = async () => {
    let plan: EntryChange;
    try {
      plan = await api.removeAbility({ ability: added.ability, check: true });
    } catch (e) {
      setMessage((e as Error).message);
      return;
    }
    if (!confirm(`${planText(plan)} Any Pokémon in a save with ${added.name} would have an invalid ability.`)) return;
    void run(() => api.removeAbility({ ability: added.ability }), "");
  };
  return (
    <Section title="Added ability" summary={`ID ${added.id} · ${added.ability}${added.retired ? " · retired" : ""}`} actions={<>
      <button onClick={() => retire(!added.retired)}>{added.retired ? "Bring back" : "Retire"}</button>
      <button className="danger" disabled={!added.last} onClick={remove}
        title={added.last ? "Undo everything Add ability wrote for it" : "Only the last added ability can be removed: retire it instead"}>Remove</button>
    </>}>
      <div className="pkm-rows">
        <Row label="Status">{added.retired
          ? "Retired: hidden from the species' ability pickers, keeping its ID and text so saved Pokémon stay valid."
          : "In the game after Teravolt; its name and description follow from its file."}</Row>
        {message && <Row label="Last change">{message}</Row>}
      </div>
    </Section>
  );
}

function AbilityPage({ entry, info, constants, epoch, onChanged }: {
  entry: ListedAbility; info: AbilitiesInfo | null; constants: Constants; epoch: number; onChanged(select?: string): void;
}) {
  const { data, error } = useHeld(entry.path);
  if (error) return <p className="pkm-error">{error}</p>;
  if (!(data instanceof Map)) return <p className="muted pkm-empty">Reading…</p>;
  const path = entry.path;
  const added = entry.added;
  const name = String(data.get("name") ?? "");
  const limit = info?.nameLength ?? 12;
  const like = data.has("handlers_like") ? String(data.get("handlers_like")) : null;
  const own = info?.handlers[entry.ability];
  const ignored = added ? data.get("mold_breaker_ignores") === true : (info?.moldBreakerIgnored ?? []).includes(entry.ability);
  const handlersText = added?.ownHandlers ? "handlers: C" : like ? `handlers like ${constantLabel(like, "ABILITY_")}` : added ? "does nothing in battle yet"
    : own ? "its own handlers" : "no battle handlers";
  return (
    <div className="pkm-page">
      <div className="mv-top">
        <h2><span className="muted">#{entry.id}</span> {name}
          {added && <span className="pkm-tag pkm-title-tag">added</span>}
          {added?.retired && <span className="pkm-tag pkm-tag-hidden pkm-title-tag">hidden</span>}
          {added?.ownHandlers && <span className="pkm-tag pkm-title-tag mv-c-tag">C</span>}</h2>
        <p className="muted pkm-note">{entry.ability} · {path}</p>
      </div>
      {added && <AddedAbilityCard added={added} onChanged={onChanged} />}
      <Section title="Battle" summary={handlersText}>
        {added?.ownHandlers && info && (
          <p className="mv-code-note">This one has battle code in <code>{info.battleCode}</code> (an <code>#ifdef {entry.ability}</code> there,
            with its row in <code>{info.handlersCode}</code>'s table): what it does is C, and this file is its text and flags.</p>
        )}
        {added && !added.ownHandlers && !like && (
          <p className="pkm-note pkm-error">It does nothing in battle yet: give it an original ability's handlers below (Works like), or write its own
            in <code>{info?.battleCode}</code>.</p>
        )}
        {!added && <p className="muted pkm-note">{own ? <>Its rules: <code>{own}</code> in <code>{info?.handlersCode}</code>.</> :
          "No battle handlers: what it does is elsewhere (the field's encounters, eggs) or checked by its ID in the battle code."}</p>}
        <div className="pkm-rows mv-rows">
          {added && (
            <Row label="Works like" hint={like ? `Takes ${constantLabel(like, "ABILITY_")}'s battle handlers, registered as this ability, so its popup shows its own name.`
              : added.ownHandlers ? "Its own handlers, in the hack's battle code." : "None."}>
              <SearchSelect value={like ?? ""} options={[{ value: "", label: "None", detail: "no handlers" }, ...handlerOptions(constants, info)]}
                onChange={(v) => documents.edit(path, ["handlers_like"], v || undefined)} />
            </Row>
          )}
          <Row label="Mold Breaker" hint={added ? "On: Mold Breaker, Teravolt and Turboblaze ignore it, as they do Levitate and Soundproof (the generated list in src/ov169/btl_tables.c)."
            : "The original list, sMoldBreakerIgnoredAbilities in src/ov169/btl_tables.c."}>
            {added ? (
              <label className="pkm-check"><input type="checkbox" checked={ignored}
                onChange={(e) => documents.edit(path, ["mold_breaker_ignores"], e.target.checked ? true : undefined)} /> Ignored by Mold Breaker</label>
            ) : <span>{ignored ? "Ignored by Mold Breaker" : "Not ignored"}</span>}
          </Row>
        </div>
      </Section>
      <Section title="Text" summary={`${name.length}/${limit} characters`}>
        <div className="pkm-rows mv-rows">
          <Row label="Name" hint={`Up to ${limit} characters, which the summary and the battle's popup fit; the name in capitals follows from it.`}>
            <NameInput value={name} limit={limit} onChange={(v) => documents.edit(path, ["name"], v)} />
          </Row>
          <Row label="Description" hint="As the summary shows it, in two lines.">
            <DescriptionInput value={String(data.get("description") ?? "")} onChange={(v) => documents.edit(path, ["description"], v)} />
          </Row>
        </div>
      </Section>
      <Section title="Who has it" summary="read only: edit abilities in the Pokémon Editor">
        <Uses ability={entry.ability} epoch={epoch} />
      </Section>
    </div>
  );
}

function AddAbilityDialog({ list, info, constants, onClose, onDone }: {
  list: ListedAbility[]; info: AbilitiesInfo | null; constants: Constants; onClose(): void; onDone(ability: string): void;
}) {
  const [name, setName] = useState("");
  const [from, setFrom] = useState(BLANK);
  const [handlers, setHandlers] = useState("");
  const [mold, setMold] = useState<boolean | null>(null);
  const [plan, setPlan] = useState<{ ok: boolean; text: string; warnings: string[]; handlers?: string | null; mold?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const templates = useMemo<Option[]>(() => [
    { value: BLANK, label: "Blank", detail: "no handlers: it does nothing in battle until given some" },
    ...list.filter((a) => !a.added?.retired).map((a) => ({ value: a.ability, label: a.name, detail: a.added ? `added, #${a.id}` : `#${a.id}` })),
  ], [list]);
  const body = (check: boolean) => ({ name: name.trim(), from, check, ...(handlers ? { handlersLike: handlers } : {}),
    ...(mold !== null ? { moldBreakerIgnores: mold } : {}) });
  useEffect(() => {
    if (!name.trim()) { setPlan(null); return; }
    let live = true;
    const timer = setTimeout(() => {
      api.addAbility(body(true)).then((r) => live && setPlan({ ok: true, text: planText(r), warnings: r.warnings ?? [],
        handlers: (r as { handlersLike?: string | null }).handlersLike, mold: (r as { moldBreakerIgnores?: boolean }).moldBreakerIgnores }),
      (e: Error) => live && setPlan({ ok: false, text: `Can't: ${e.message}`, warnings: [] }));
    }, 250);
    return () => { live = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, from, handlers, mold]);
  const apply = async () => {
    setBusy(true);
    const result = await applyEntryChange(() => api.addAbility(body(false)), PREFIXES);
    setBusy(false);
    if (result?.ability) onDone(result.ability);
  };
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="pkm-dialog" role="dialog" aria-label="Add ability" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pkm-card-head">
          <h3>Add ability <span className="muted">· ID {info?.nextId ?? "…"}</span></h3>
          <span className="spacer" />
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy || !plan?.ok} onClick={apply}>{busy ? "Writing…" : "Add ability"}</button>
        </div>
        <h4>The ability</h4>
        <div className="pkm-rows">
          <Row label="Name" hint={`Up to ${info?.nameLength ?? 12} characters, starting with a letter (Sweet Syrup: ABILITY_SWEET_SYRUP, res/abilities/sweet_syrup.json). At most ${info?.maxId ?? 255} abilities: a Pokémon keeps its ability in a byte.`}>
            <input autoFocus value={name} placeholder="Sweet Syrup" onChange={(e) => setName(e.target.value)} />
          </Row>
          <Row label="Copy of" hint="Its description, whose handlers it takes and whether Mold Breaker ignores it. An added template's own C rules don't come with it.">
            <SearchSelect value={from} options={templates} onChange={setFrom} />
          </Row>
        </div>
        <h4>In battle</h4>
        <div className="pkm-rows">
          <Row label="Works like" hint={handlers === "none" ? "No handlers: it does nothing in battle until the hack's battle code gives it some."
            : handlers ? `${constantLabel(handlers, "ABILITY_")}'s handlers.` : plan?.handlers ? `${constantLabel(plan.handlers, "ABILITY_")}'s handlers (the template's).`
            : "None (the template has no handlers): it does nothing in battle yet."}>
            <SearchSelect value={handlers} options={[{ value: "", label: "As the template" }, { value: "none", label: "None", detail: "no handlers" },
              ...handlerOptions(constants, info)]} onChange={setHandlers} />
          </Row>
          <Row label="Mold Breaker" hint={mold === null ? `As the template: ${plan?.mold ? "ignored" : "not ignored"}.` : mold ? "Ignored by Mold Breaker." : "Not ignored."}>
            <span className="view-switch">
              {([[null, "As the template"], [true, "Ignored"], [false, "Not ignored"]] as const).map(([v, l]) => (
                <button key={l} className={mold === v ? "active" : ""} onClick={() => setMold(v)}>{l}</button>
              ))}
            </span>
          </Row>
        </div>
        <h4>Dry run</h4>
        <p className={`pkm-note${plan && !plan.ok ? " pkm-error" : ""}`}>{plan?.text ?? "Name the ability to see what it will write."}</p>
        {plan?.warnings.map((w) => <p key={w} className="pkm-note mv-warning">⚠ {w}</p>)}
        <p className="muted pkm-note">The build does the rest: its name and description in the text banks, and the battle's handlers and Mold
          Breaker tables follow from these files. Give it to Pokémon in the Pokémon Editor.</p>
      </div>
    </div>
  );
}

export function AbilityEditor({ constants }: ToolProps) {
  const [files, setFiles] = useState<{ path: string; data: Record<string, unknown> }[] | null>(null);
  const [info, setInfo] = useState<AbilitiesInfo | null>(null);
  const [filter, setFilter] = useState("");
  const [addedOnly, setAddedOnly] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const { docs } = useDocuments();
  useEffect(() => {
    let live = true;
    Promise.all([api.data(SCHEMA, ["name"]), api.abilities().catch(() => null)]).then(([f, i]) => {
      if (live) { setFiles(f); setInfo(i); }
    });
    return () => { live = false; };
  }, [epoch, constants]);
  useEffect(() => documents.onFiles((paths) => {
    if (paths.some((p) => p.startsWith("res/abilities/") || p === "generated/abilities.txt")) setEpoch((n) => n + 1);
  }), []);
  const list = useMemo(() => (files ? listAbilities(files, constants, info) : []), [files, constants, info]);
  const params = useToolParams("abilities");
  useEffect(() => {
    const wanted = params.get("ability");
    if (wanted && list.some((a) => a.ability === wanted)) setChosen(wanted);
  }, [params, list]);
  const changed = useCallback((select?: string) => {
    setEpoch((n) => n + 1);
    if (select !== undefined) setChosen(select || null);
  }, []);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return list.filter((a) => (!addedOnly || a.added) && (!q || a.name.toLowerCase().includes(q) || a.ability.toLowerCase().includes(q) || String(a.id) === q));
  }, [list, filter, addedOnly]);
  const entry = list.find((a) => a.ability === chosen) ?? null;
  return (
    <div className="pkm-editor">
      <EntryHeader title="Ability Editor" prefix="res/abilities/" undoPath={entry?.path ?? null} onSaved={() => setEpoch((n) => n + 1)} />
      <div className="pkm-split">
        <div className="pkm-list">
          <div className="pkm-list-head">
            <input className="filter" placeholder={`Filter ${list.length} abilities…`} value={filter} onChange={(e) => setFilter(e.target.value)} />
            <button className="primary" onClick={() => setAdding(true)} title="A new ability, copied from a template">+ Add ability</button>
          </div>
          <div className="mv-list-filters">
            <label className="pkm-check"><input type="checkbox" checked={addedOnly} onChange={(e) => setAddedOnly(e.target.checked)} /> Added only</label>
          </div>
          <div className="pkm-list-items">
            {shown.map((a) => (
              <button key={a.ability} className={`pkm-item${a.ability === chosen ? " selected" : ""}`} onClick={() => setChosen(a.ability)}>
                <span className="muted pkm-number">{a.id}</span>
                <span className="pkm-name">{a.name}{docs.get(a.path)?.dirty ? " •" : ""}</span>
                {a.added && <span className="pkm-tag">added</span>}
                {a.added?.retired && <span className="pkm-tag pkm-tag-hidden">hidden</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="pkm-detail">
          {entry ? <AbilityPage key={entry.ability} entry={entry} info={info} constants={constants} epoch={epoch} onChanged={changed} />
            : <p className="muted pkm-empty">Choose an ability.</p>}
        </div>
      </div>
      {adding && <AddAbilityDialog list={list} info={info} constants={constants} onClose={() => setAdding(false)}
        onDone={(ability) => { setAdding(false); changed(ability); }} />}
    </div>
  );
}
