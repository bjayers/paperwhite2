// The Script Editor's sidebar for the script language: what the call at the caret is (a command from the command
// reference, a shortcut, a named global, a flag's or a variable's test) with each argument's name, kind and meaning;
// the argument at the caret's value shown (a message in the talk window's preview, to edit; a species' name and icon;
// a flag's or a variable's name, what the user noted it does, and the scripts that use it); and every choice of the
// argument's kind, filtered, one click to put it in (sounds, species, items, moves, flags, variables, zones, ...).

import { useEffect, useMemo, useState } from "react";
import { api } from "../../api.ts";
import { documents, useDocuments } from "../../documents.ts";
import { fromPlain, toPlain } from "../../../shared/json.ts";
import { navigate } from "../../navigation.ts";
import { MessageEditor } from "../text/TextEditor.tsx";
import { SpeciesIcon } from "../pokemon/SpeciesIcon.tsx";
import { SHORTCUT_NAMES } from "../../../shared/scriptlang/shortcuts.ts";
import { numberOf } from "../../../shared/scriptlang/values.ts";
import type { CaretCall, LangEnv, Outline } from "./lang.ts";

export const NOTES = "res/paperwhite2/scripts/notes.json";

interface ArgInfo { name: string; kind?: string; description?: string; type?: string }

/** What a call is, for the sidebar: its title, what it does, its arguments. */
function describe(name: string, env: LangEnv): { title: string; sub?: string; description?: string; args: ArgInfo[] } | null {
  if (name === "flag") return { title: "flag(F)", description: "A flag's test: flag(F) == 1 while it's set, == 0 while it isn't", args: [{ name: "flag", kind: "flag" }] };
  if (name === "var") return { title: "var(X)", description: "A variable's value (0x4000 to 0x40FF are saved, 0x8000 and up the script's own)", args: [{ name: "variable", kind: "var" }] };
  const step = env.names.movements.get(name);
  if (step || /^action_\d+$/.test(name)) {
    return { title: name, sub: `movement action ${step?.code ?? name.slice(7)}`, description: step?.description,
             args: [{ name: "count", kind: "number", description: "how many times in a row; 1 when left out" }] };
  }
  const shortcut = SHORTCUT_NAMES.get(name);
  if (shortcut) {
    return { title: name, sub: `shortcut: ${shortcut.macro}, then ${shortcut.after.join(" and ")}`, description: shortcut.description,
             args: shortcut.params.map((p) => ({ name: p.name, kind: p.kind ?? "number", description: p.default !== undefined ? `${p.default} when left out` : undefined })) };
  }
  const global = env.names.globals.get(name);
  if (global) {
    return { title: name, sub: `global script ${global.script}${global.result ? `, its result in var(${global.result})` : ""}`, description: global.description,
             args: global.inputs.map((i) => ({ name: i.name, kind: i.kind, description: `${i.description ? `${i.description}; ` : ""}set in var(${i.var})` })) };
  }
  const macro = env.names.toMacro.get(name);
  const ref = macro ? env.names.commands.get(macro) : undefined;
  if (!macro) return null;
  return {
    title: name, sub: [macro !== name && `macro ${macro}`, ref?.frost && !ref.frost.startsWith("c0x") && `Frost's ${ref.frost}`, ref && `command ${ref.op} (0x${ref.op.toString(16)})`]
      .filter(Boolean).join(" · "),
    description: ref?.description, args: ref?.args ?? [],
  };
}

/** The constants' prefixes each kind's choices come from, and how a choice is put in (by number or by name). */
const CHOICES: Record<string, { prefixes: string[]; as: "number" | "name" | "var" }> = {
  sound: { prefixes: ["SEQ_SE_", "SEQ_BGM_", "SEQ_ME_"], as: "name" },
  species: { prefixes: ["SPECIES_"], as: "number" },
  item: { prefixes: ["ITEM_"], as: "name" },
  move: { prefixes: ["MOVE_"], as: "name" },
  flag: { prefixes: ["EVENT_FLAG_"], as: "number" },
  var: { prefixes: ["EVENT_WORK_"], as: "var" },
  zone: { prefixes: ["ZONE_"], as: "name" },
  trainer: { prefixes: ["TRAINER_"], as: "name" },
  ability: { prefixes: ["ABILITY_"], as: "name" },
  nature: { prefixes: ["NATURE_"], as: "name" },
  type: { prefixes: ["TYPE_"], as: "name" },
};

export function LangSide({ call, word, named, env, bank, onInsert, onReplaceName, onAddStep, onOpenText }: {
  call: CaretCall | null;
  /** The word at the caret, and the routines and aliases the script can name. */
  word: string | null;
  named?: Outline;
  env: LangEnv;
  /** The file's text bank's path. */
  bank: string | null;
  /** Puts text in place of the argument at the caret. */
  onInsert(text: string): void;
  /** Puts a name in place of the call's at the caret (a movement's step). */
  onReplaceName(name: string): void;
  /** Adds a step at the end of the movement at the caret. */
  onAddStep(name: string): void;
  onOpenText(): void;
}) {
  const alias = word ? named?.aliases.get(word) : undefined;
  if (alias) {
    const kind = /^flag\(/.test(alias.value) ? "flag" : "var";
    return (
      <div className="scr-lang-side">
        <div className="scr-help">
          <code>{word}</code><div className="muted small">alias of {alias.value}, written in {alias.where}</div>
          <p className="scr-note">A name for the {kind === "flag" ? "flag" : "variable"} through the whole file: {kind === "flag" ? `${word} == 1 while it's set` : `${word} == 1, ${word} += 1, or as a command's argument`}.
            Saving writes the {kind === "flag" ? "flag" : "variable"} itself; the alias is kept as a comment line in the script that writes it.</p>
        </div>
        <ArgHelper kind={kind} value={alias.value.replace(/^(flag|var)\((.*)\)$/, "$2")} env={env} bank={bank} onInsert={() => {}} onOpenText={onOpenText} noChoices />
      </div>
    );
  }
  if (call && named?.routines.has(call.name) && !env.names.toMacro.has(call.name)) {
    return (
      <div className="scr-lang-side">
        <div className="scr-help">
          <code>{call.name}()</code><div className="muted small">routine: {named.routines.get(call.name)} · call_routine (VMCall)</div>
          <p className="scr-note">Runs the routine's commands, then comes back here at its return(). A sub is written after the script: <code>sub {call.name} {"{ ... return(); }"}</code>; it needs no ScriptEntry, so no script is renumbered.</p>
        </div>
      </div>
    );
  }
  if (!call) {
    return <p className="muted scr-note">Click a command: what it does and its arguments show here; on an argument, its value and every choice of its kind.</p>;
  }
  const info = describe(call.name, env);
  if (!info) return <div className="scr-error scr-note">No command {call.name}: the command reference has no such name.</div>;
  const arg = call.arg >= 0 ? info.args[call.arg] : undefined;
  const isStep = env.names.movements.has(call.name) || /^action_\d+$/.test(call.name);
  const runsMovement = env.names.toMacro.get(call.name) === "ActorCmdExec" && call.arg === 1;
  return (
    <div className="scr-lang-side">
      <div className="scr-help">
        <code>{info.title}</code>{info.sub && <div className="muted small">{info.sub}</div>}
        {info.description && <p className="scr-note">{info.description}</p>}
        {info.args.length > 0 ? (
          <ol className="scr-args">
            {info.args.map((a, i) => (
              <li key={i} className={i === call.arg ? "current" : ""}>
                <code>{a.name}</code> <span className="muted small">{a.kind && a.kind !== "number" ? a.kind : ""}{a.type ? ` · ${a.type}` : ""}</span>
                {a.description && <div className="muted small">{a.description}</div>}
              </li>
            ))}
          </ol>
        ) : <p className="muted small">No arguments.</p>}
      </div>
      {arg && !runsMovement && <ArgHelper kind={arg.kind ?? "number"} value={call.argText} env={env} bank={bank} onInsert={onInsert} onOpenText={onOpenText} />}
      {(isStep || runsMovement) && (
        <MovementChoices env={env} current={isStep ? call.name : null} onPick={isStep ? onReplaceName : onAddStep}
                         hint={isStep ? "A click puts it in this step's place (its count stays)." : "A click adds it at the movement's end; [walk_up(2), face_left] is its form."} />
      )}
    </div>
  );
}

/** Every movement action, filtered by name or what it does; a click puts it in. */
function MovementChoices({ env, current, onPick, hint }: { env: LangEnv; current: string | null; onPick(name: string): void; hint: string }) {
  const [filter, setFilter] = useState("");
  const all = useMemo(() => [...env.names.movements.values()], [env]);
  const q = filter.trim().toLowerCase();
  const shown = q ? all.filter((m) => m.name.includes(q.replace(/\s+/g, "_")) || (m.description ?? "").toLowerCase().includes(q) || String(m.code) === q) : all;
  return (
    <div className="scr-choices">
      <div className="scr-section-head"><strong>Movements</strong> <span className="muted small">{all.length}</span></div>
      <p className="muted small">{hint}</p>
      <input className="filter" placeholder="Filter: walk, jump, face, emote, up…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="scr-choice-list">
        {shown.map((m) => (
          <button key={m.code} className={`scr-choice${m.name === current ? " current" : ""}`} onClick={() => onPick(m.name)} title={m.description}>
            <span>{m.name}</span><span className="muted small">{m.code}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ArgHelper({ kind, value, env, bank, onInsert, onOpenText, noChoices }: {
  kind: string;
  /** Without the list of choices. */
  noChoices?: boolean;
  value: string;
  env: LangEnv;
  bank: string | null;
  onInsert(text: string): void;
  onOpenText(): void;
}) {
  const plain = value.replace(/^var\((.*)\)$/, "$1").trim();
  const n = numberOf(plain, env.ctx);
  const nameOf = (prefixes: string[]) => {
    if (n === undefined) return null;
    for (const [name, v] of env.ctx.constants) if (v === n && prefixes.some((p) => name.startsWith(p))) return name;
    return null;
  };
  return (
    <div className="scr-arg-helper">
      {kind === "message" && (
        <>
          <div className="scr-section-head"><strong>Line {plain}</strong>
            <button onClick={onOpenText} disabled={!bank}>Text file…</button></div>
          {!bank ? <p className="muted scr-note">The file includes no text bank.</p>
            : n !== undefined && env.ctx.messages[n] ? <MessageEditor path={bank} id={env.ctx.messages[n]} />
            : /^\d+$/.test(plain) ? <p className="notice warning scr-note">The text file has no line {plain} (it has {env.ctx.messages.length}, 0 to {env.ctx.messages.length - 1}).</p>
            : <p className="muted scr-note">Not a line of this file's text.</p>}
        </>
      )}
      {kind === "species" && n !== undefined && (
        <div className="scr-section-head">{nameOf(["SPECIES_"]) && <SpeciesIcon species={nameOf(["SPECIES_"])!} size={32} />}
          <strong>{nameOf(["SPECIES_"])?.replace(/^SPECIES_/, "").toLowerCase().replace(/_/g, " ") ?? `species ${n}`}</strong> <span className="muted">#{n}</span></div>
      )}
      {(kind === "flag" || kind === "var") && n !== undefined && <FlagNote kind={kind} n={n} name={nameOf(kind === "flag" ? ["EVENT_FLAG_"] : ["EVENT_WORK_"])} />}
      {CHOICES[kind] && !noChoices && <Choices kind={kind} env={env} current={n} onInsert={onInsert} />}
    </div>
  );
}

/** A flag's or a variable's name, the user's note on what it does, and the scripts that use it. */
function FlagNote({ kind, n, name }: { kind: "flag" | "var"; n: number; name: string | null }) {
  const { docs } = useDocuments();
  const key = kind === "flag" ? String(n) : `0x${n.toString(16).padStart(4, "0")}`;
  const list = kind === "flag" ? "flags" : "vars";
  useEffect(() => { if (!documents.get(NOTES)) documents.hold(NOTES).catch(() => undefined); }, []);
  const doc = docs.get(NOTES);
  const notes = doc?.data instanceof Map ? (toPlain(doc.data) as Record<string, Record<string, string>>) : null;
  const note = notes?.[list]?.[key] ?? "";
  const [uses, setUses] = useState<{ path: string; line: number; text: string }[] | null>(null);
  useEffect(() => {
    setUses(null);
    const words = [name, kind === "var" ? key : null].filter(Boolean).map((w) => w!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!words.length) { setUses([]); return; }
    let live = true;
    api.scan("res/field/scripts/*.s", `\\b(${words.join("|")})\\b`, { limit: 300 }).then((m) => { if (live) setUses(m); }, () => { if (live) setUses([]); });
    return () => { live = false; };
  }, [name, key, kind]);
  const byFile = useMemo(() => {
    const out = new Map<string, number>();
    for (const u of uses ?? []) out.set(u.path, (out.get(u.path) ?? 0) + 1);
    return [...out];
  }, [uses]);
  const setNote = (text: string) => {
    if (!notes) {
      documents.create(NOTES, "res/paperwhite2/scripts/notes.schema.json", fromPlain({ $schema: "notes.schema.json", flags: {}, vars: {}, [list]: text ? { [key]: text } : {} }));
      return;
    }
    const next = { ...(notes[list] ?? {}) };
    if (text) next[key] = text; else delete next[key];
    documents.edit(NOTES, [list], fromPlain(next));
  };
  return (
    <div className="scr-flag-note">
      <div className="scr-section-head"><strong>{kind === "flag" ? `Flag ${n}` : `Variable ${key}`}</strong> {name && <code className="muted small">{name}</code>}</div>
      <textarea className="scr-note-edit" rows={2} placeholder={`What this ${kind === "flag" ? "flag" : "variable"} is for (your note, kept in ${NOTES})`}
                value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="muted small">{uses === null ? "Finding the scripts that use it…" : !uses.length ? "No script names it." : `${uses.length} uses in ${byFile.length} files:`}</div>
      {byFile.length > 0 && (
        <div className="scr-uses">
          {byFile.slice(0, 30).map(([path, count]) => (
            <button key={path} className="link" onClick={() => navigate("scripts", { file: path })}>
              {path.slice(path.lastIndexOf("/") + 1, -2)}{count > 1 ? ` (${count})` : ""}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Every choice of a kind, filtered; a click puts it in. */
function Choices({ kind, env, current, onInsert }: { kind: string; env: LangEnv; current?: number; onInsert(text: string): void }) {
  const [filter, setFilter] = useState("");
  const spec = CHOICES[kind];
  const all = useMemo(() => {
    // (by the prefixes' order: a sound's SE first)
    const out: { name: string; value: number; group: number }[] = [];
    for (const [name, value] of env.ctx.constants) {
      const group = spec.prefixes.findIndex((p) => name.startsWith(p));
      if (group >= 0) out.push({ name, value, group });
    }
    return out.sort((a, b) => a.group - b.group || a.value - b.value);
  }, [env, spec]);
  const q = filter.trim().toLowerCase().replace(/\s+/g, "_");
  const shown = (q ? all.filter((c) => c.name.toLowerCase().includes(q) || String(c.value) === q) : all).slice(0, 300);
  const text = (c: { name: string; value: number }) =>
    spec.as === "number" ? String(c.value) : spec.as === "var" ? `var(0x${c.value.toString(16).padStart(4, "0")})` : c.name;
  return (
    <div className="scr-choices">
      <div className="scr-section-head"><strong>Choices</strong> <span className="muted small">{all.length}</span></div>
      <input className="filter" placeholder={`Filter the ${kind === "var" ? "variables" : `${kind}s`}…`} value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="scr-choice-list">
        {shown.map((c) => (
          <button key={c.name} className={`scr-choice${c.value === current ? " current" : ""}`} onClick={() => onInsert(text(c))} title={`Put in ${text(c)}`}>
            {kind === "species" && <SpeciesIcon species={c.name} size={24} />}
            <span>{c.name.replace(spec.prefixes[c.group], "")}</span>
            {spec.prefixes.length > 1 && <span className="muted small">{spec.prefixes[c.group].replace(/^SEQ_|_$/g, "")}</span>}
            <span className="muted small">{spec.as === "var" ? `0x${c.value.toString(16)}` : c.value}</span>
          </button>
        ))}
        {all.length > shown.length && !q && <p className="muted small">The first 300; filter for the rest.</p>}
      </div>
    </div>
  );
}
