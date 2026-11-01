// The Overworld Editor's own controls for some of the events' fields, in the side panel's form: a height in tiles in
// place of each kind's units, a model with its sprite and a picker of every model's sprite, and a script with the
// button that opens it below the map.

import { useEffect, useMemo, useRef, useState } from "react";
import type { JsonPath, JsonValue } from "../../../shared/json.ts";
import type { Constants, Schema } from "../../../shared/schema.ts";
import { BaseField, constantLabel, type FormContext } from "../schema-form/form.tsx";
import { HEIGHT_FIELDS, KIND_LISTS, heightInTiles, storedHeight, type EntityKind } from "./entities.ts";
import { spriteUrl } from "./sprites.ts";
import { ScrubNumber } from "./ScrubNumber.tsx";

const MODEL_PREFIX = "OBJ_CODE_";

/** The object codes' banks: the code's high digit (generated/obj_codes.txt). */
const BANKS: { bank: number; label: string }[] = [
  { bank: 0, label: "People and objects" },
  { bank: 1, label: "Walking Pokémon" },
  { bank: 2, label: "3D models" },
  { bank: 3, label: "Followers" },
  { bank: 4, label: "Paper White 2 Pokémon" },
];

/** A sprite frame as an image, loaded when it is first on screen. */
export function SpriteImage({ model, direction, size = 32 }: { model: string; direction?: string; size?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setShown(true); io.disconnect(); } });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (shown && model) spriteUrl(model, direction).then((u) => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [model, direction, shown]);
  return (
    <span ref={ref} className="ow-sprite" style={{ width: size, height: size }}>
      {url ? <img src={url} alt="" width={size} height={size} /> : null}
    </span>
  );
}

/** Every model by its sprite, filtered by name and bank; choosing one closes it. */
function ModelPicker({ constants, value, onPick, onClose }: {
  constants: Constants; value: string; onPick(model: string): void; onClose(): void;
}) {
  const [filter, setFilter] = useState("");
  const [bank, setBank] = useState<number | null>(() => {
    const v = constants.get(value);
    return v === undefined ? null : v >> 12;
  });
  const models = useMemo(() => [...constants.entries()].filter(([k]) => k.startsWith(MODEL_PREFIX)).sort((a, b) => a[1] - b[1]), [constants]);
  const q = filter.trim().toLowerCase();
  const shown = models.filter(([k, v]) => (bank === null || v >> 12 === bank) &&
    (!q || k.toLowerCase().includes(q.replace(/ /g, "_")) || String(v) === q || constantLabel(k, MODEL_PREFIX).toLowerCase().includes(q)));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="ow-picker" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ow-picker-head">
          <input className="filter" autoFocus placeholder={`Filter ${models.length} models by name or number…`} value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="view-switch">
            <button className={bank === null ? "active" : ""} onClick={() => setBank(null)}>All</button>
            {BANKS.map((b) => (
              <button key={b.bank} className={bank === b.bank ? "active" : ""} onClick={() => setBank(b.bank)} title={`Bank ${b.bank}: codes from 0x${(b.bank << 12).toString(16)}`}>
                {b.bank} · {b.label}
              </button>
            ))}
          </div>
          <span className="muted">{shown.length}</span>
          <button className="icon" onClick={onClose} title="Close (Esc)">×</button>
        </div>
        <div className="ow-picker-grid">
          {shown.map(([k, v]) => (
            <button key={k} className={`ow-picker-item${k === value ? " selected" : ""}`} onClick={() => onPick(k)} title={`${k} (${v}, 0x${v.toString(16)})`}>
              <SpriteImage model={k} size={48} />
              <span className="ow-picker-name">{constantLabel(k, MODEL_PREFIX)}</span>
              <span className="muted ow-picker-number">{v}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ModelField({ schema, value, path, ctx }: { schema: Schema; value: JsonValue; path: JsonPath; ctx: FormContext }) {
  const [picking, setPicking] = useState(false);
  const model = typeof value === "string" ? value : "";
  return (
    <div className="ow-model">
      {model && <SpriteImage model={model} size={40} />}
      <div className="ow-model-field"><BaseField schema={schema} value={value} path={path} ctx={ctx} /></div>
      <button onClick={() => setPicking(true)} title="Choose by sprite">Browse…</button>
      {picking && <ModelPicker constants={ctx.constants} value={model} onClose={() => setPicking(false)}
                               onPick={(m) => { ctx.edit(path, m); setPicking(false); }} />}
    </div>
  );
}

/** A height in tiles (half a tile is 0.5), stored in the kind's own units; its label drags it. */
function HeightField({ kind, value, path, ctx }: { kind: EntityKind; value: JsonValue; path: JsonPath; ctx: FormContext }) {
  const stored = typeof value === "number" ? value : 0;
  const units = HEIGHT_FIELDS[kind]!.perTile;
  return (
    <span className="ow-xyz">
      <ScrubNumber label="tiles" value={heightInTiles(kind, stored)} step={0.05} digits={3}
                   onChange={(n, phase) => {
                     if (phase === "end") return;
                     if (phase === "move" && ctx.amend) ctx.amend(path, storedHeight(kind, n));
                     else ctx.edit(path, storedHeight(kind, n));
                   }} />
      <span className="muted range" title={`The file stores ${units} a tile`}>stored {stored}</span>
    </span>
  );
}

/** The panel's field controls for an entity at [list, index]: its height, model and script. */
export function entityFields(kind: EntityKind, onOpenScript: () => void): FormContext["render"] {
  const list = KIND_LISTS[kind];
  const height = HEIGHT_FIELDS[kind];
  return (path, value, schema, ctx) => {
    if (path[0] !== list || path.length < 3) return undefined;
    const rest = path.slice(2).join(".");
    if (height && rest === `grid.${height.field}`) return <HeightField kind={kind} value={value} path={path} ctx={ctx} />;
    if (kind === "npc" && rest === "model") return <ModelField schema={schema} value={value} path={path} ctx={ctx} />;
    if (rest === "script") return <ScriptField schema={schema} value={value} path={path} ctx={ctx} onOpen={onOpenScript} />;
    return undefined;
  };
}

function ScriptField({ onOpen, ...p }: { schema: Schema; value: JsonValue; path: JsonPath; ctx: FormContext; onOpen(): void }) {
  return (
    <div className="ow-model">
      <div className="ow-model-field"><BaseField {...p} /></div>
      <button onClick={onOpen} disabled={typeof p.value !== "number" || p.value <= 0} title="Its script below the map">Show script</button>
    </div>
  );
}


