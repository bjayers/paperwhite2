// The Pokémon Center page: the fees, rates and lists of the three upstairs attendants (Day Care, Training Services and
// the Wonder Trade), read from and saved to res/paperwhite2/pokemon_center/services.json through the document store, so
// undo, the build's check on Save and changes on disk work as for any file. The schema gives each field's range and
// its hint; docs/paperwhite2/design/pokemon-center.md says what each means. Laid out as the Ambients panel is: headed
// sections, a label column beside the controls, a hint under each.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { documents, useDocuments } from "../../documents.ts";
import { getIn, type JsonMap, type JsonPath, type JsonValue } from "../../../shared/json.ts";
import { validate, type Constants } from "../../../shared/schema.ts";
import { SearchSelect } from "../../shell/SearchSelect.tsx";
import type { ToolProps } from "../types.ts";
import { schemaAt, useHeld } from "../followers/DocForm.tsx";
import { constantOptions } from "../schema-form/form.tsx";
import { useToolActive } from "../active.ts";
import { SERVICES_PATH, itemChance, oneIn, percentOf, readTiers, sharesOf, tierShares } from "./model.ts";

type Attendant = "daycare" | "training" | "wonder";
const ATTENDANTS: [Attendant, string][] = [["daycare", "Day Care"], ["training", "Training Services"], ["wonder", "Wonder Trade"]];
const LANGUAGE_NAMES = ["japanese", "english", "french", "italian", "german", "spanish", "korean"];
const STATS = ["hp", "attack", "defense", "speed", "special_attack", "special_defense"] as const;
const STAT_LABELS: Record<(typeof STATS)[number], string> = {
  hp: "HP", attack: "Attack", defense: "Defense", speed: "Speed", special_attack: "Sp. Atk", special_defense: "Sp. Def",
};
const TITLES: Record<string, string> = { ev: "EV" };

const humanize = (key: string) => TITLES[key] ?? (key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()));
const asMap = (v: JsonValue | undefined): JsonMap => (v instanceof Map ? v : new Map());
const asList = (v: JsonValue | undefined): JsonValue[] => (Array.isArray(v) ? v : []);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

interface Ctx {
  data: JsonValue;
  constants: Constants;
  get(path: JsonPath): JsonValue | undefined;
  set(path: JsonPath, value: JsonValue | undefined): void;
  hint(path: JsonPath): string | undefined;
  range(path: JsonPath): { min: number; max: number };
  schemaFor(path: JsonPath): { min: number; max: number; description?: string };
}

/** One labelled row of the section's grid: the label, the controls, a hint under them. */
function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <>
      <span className="pc-label">{label}</span>
      <span className="pc-control">
        {children}
        {hint && <span className="muted pc-hint">{hint}</span>}
      </span>
    </>
  );
}

function Section({ title, summary, children }: { title: string; summary?: ReactNode; children: ReactNode }) {
  return (
    <section className="pc-box">
      <h5>{title} {summary !== undefined && <span className="muted">{summary}</span>}</h5>
      {children}
    </section>
  );
}

function NumberInput({ ctx, path, unit, width }: { ctx: Ctx; path: JsonPath; unit?: string; width?: number }) {
  const { min, max } = ctx.range(path);
  const value = Number(ctx.get(path) ?? 0);
  return (
    <>
      <input type="number" className="pc-number" style={width ? { width } : undefined} min={min} max={max} value={value}
             onChange={(e) => ctx.set(path, clamp(Math.round(Number(e.target.value) || 0), min, max))} />
      {unit && <span className="pc-unit">{unit}</span>}
    </>
  );
}

/** A field of the file: a number with its label, unit and the schema's description as the hint. */
function Num({ ctx, path, label, unit, hint }: { ctx: Ctx; path: JsonPath; label?: string; unit?: string; hint?: ReactNode }) {
  return (
    <Row label={label ?? humanize(String(path.at(-1)))} hint={hint ?? ctx.hint(path)}>
      <NumberInput ctx={ctx} path={path} unit={unit} />
    </Row>
  );
}

function Toggle({ ctx, path, label, text, hint }: { ctx: Ctx; path: JsonPath; label?: string; text?: string; hint?: ReactNode }) {
  const on = ctx.get(path) === true;
  return (
    <Row label={label ?? humanize(String(path.at(-1)))} hint={hint ?? ctx.hint(path)}>
      <label className="pc-check">
        <input type="checkbox" checked={on} onChange={(e) => ctx.set(path, e.target.checked)} />
        {text ?? (on ? "Yes" : "No")}
      </label>
    </Row>
  );
}

function Pick({ ctx, path, prefix, placeholder }: { ctx: Ctx; path: JsonPath; prefix: string; placeholder: string }) {
  return (
    <SearchSelect value={String(ctx.get(path) ?? "")} options={constantOptions(ctx.constants, prefix)} placeholder={placeholder}
                  onChange={(v) => ctx.set(path, v)} />
  );
}

function ConstRow({ ctx, path, prefix, label, hint }: { ctx: Ctx; path: JsonPath; prefix: string; label?: string; hint?: ReactNode }) {
  return (
    <Row label={label ?? humanize(String(path.at(-1)))} hint={hint ?? ctx.hint(path)}>
      <Pick ctx={ctx} path={path} prefix={prefix} placeholder={humanize(prefix.replace(/_$/, "").toLowerCase())} />
    </Row>
  );
}

/** A trade-odds field: the percent, with what it means in 1 in N. */
function Odds({ ctx, path, label, hint }: { ctx: Ctx; path: JsonPath; label: string; hint?: ReactNode }) {
  const percent = Number(ctx.get(path) ?? 0);
  return (
    <Row label={label} hint={hint ?? ctx.hint(path)}>
      <NumberInput ctx={ctx} path={path} unit="%" />
      <span className="pc-readout">{percent > 0 ? `1 in ${Math.round(100 / percent).toLocaleString("en-US")} trades` : "never"}</span>
    </Row>
  );
}

/** A list of constants (species, say) with a picker each, a remove button and an add. */
function ConstantList({ ctx, path, prefix, empty }: { ctx: Ctx; path: JsonPath; prefix: string; empty: string }) {
  const list = asList(ctx.get(path));
  const taken = new Set(list.map(String));
  const options = constantOptions(ctx.constants, prefix);
  return (
    <div className="pc-list">
      {!list.length && <span className="muted">{empty}</span>}
      <div className="pc-chips">
        {list.map((v, i) => (
          <span key={i} className="pc-chip">
            <SearchSelect value={String(v)} options={options} onChange={(n) => ctx.set([...path, i], n)} />
            <button className="pc-x" title="Remove" onClick={() => ctx.set(path, list.filter((_, j) => j !== i))}>×</button>
          </span>
        ))}
      </div>
      <span className="pc-add">
        <span className="muted">Add</span>
        <SearchSelect value="" options={options.filter((o) => !taken.has(o.value))} placeholder={`Add ${humanize(prefix.replace(/_$/, "").toLowerCase())}…`}
                      onChange={(n) => n && ctx.set(path, [...list, n])} />
      </span>
    </div>
  );
}

/** A list of {species, form} rows (the excluded and never-tradeable forms). */
function FormList({ ctx, path, empty }: { ctx: Ctx; path: JsonPath; empty: string }) {
  const list = asList(ctx.get(path));
  const options = constantOptions(ctx.constants, "SPECIES_");
  const { min, max } = ctx.range([...path, 0, "form"]);
  return (
    <div className="pc-list">
      {!list.length && <span className="muted">{empty}</span>}
      {list.map((row, i) => (
        <div key={i} className="pc-line">
          <SearchSelect value={String(asMap(row).get("species") ?? "")} options={options} onChange={(n) => ctx.set([...path, i, "species"], n)} />
          <span className="muted">form</span>
          <input type="number" className="pc-number pc-small" min={min} max={max} value={Number(asMap(row).get("form") ?? 0)}
                 onChange={(e) => ctx.set([...path, i, "form"], clamp(Math.round(Number(e.target.value) || 0), min, max))} />
          <button className="pc-x" title="Remove" onClick={() => ctx.set(path, list.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <span className="pc-add">
        <span className="muted">Add</span>
        <SearchSelect value="" options={options} placeholder="Add species…"
                      onChange={(n) => n && ctx.set(path, [...list, new Map<string, JsonValue>([["species", n], ["form", Math.max(min, 1)]])])} />
      </span>
    </div>
  );
}

function Shares({ weights, labels, max }: { weights: number[]; labels: string[]; max?: number }) {
  const shares = sharesOf(weights);
  const top = max ?? Math.max(...shares, 0.0001);
  return (
    <div className="pc-shares">
      {shares.map((s, i) => (
        <div key={i} className="pc-share" title={`${labels[i]}: ${percentOf(s)}`}>
          <span className="pc-share-label">{labels[i]}</span>
          <span className="pc-share-bar"><span style={{ width: `${(s / top) * 100}%` }} /></span>
          <span className="pc-share-value">{percentOf(s)}</span>
        </div>
      ))}
    </div>
  );
}

// ---- Day Care and Training ---------------------------------------------------------------------------------------

function DayCare({ ctx }: { ctx: Ctx }) {
  return (
    <Section title="Day Care attendant" summary={`₽${Number(ctx.get(["daycare", "transfer_fee"]))} a transfer, ${Number(ctx.get(["daycare", "required_badges"]))} badges`}>
      <div className="pc-grid">
        <Num ctx={ctx} path={["daycare", "transfer_fee"]} label="Transfer fee" unit="₽" />
        <Num ctx={ctx} path={["daycare", "required_badges"]} label="Badges needed" unit="badges" />
      </div>
    </Section>
  );
}

function Training({ ctx }: { ctx: Ctx }) {
  const grooming = asList(ctx.get(["training", "grooming"]));
  return (
    <>
      <Section title="Prices" summary="what each service costs">
        <div className="pc-grid">
          <Num ctx={ctx} path={["training", "name_rater", "price"]} label="Name Rater" unit="₽" />
          <Num ctx={ctx} path={["training", "move_deleter", "price"]} label="Move Deleter" unit="₽" />
          <Num ctx={ctx} path={["training", "ball_change", "price"]} label="Ball change" unit="₽" />
          <Num ctx={ctx} path={["training", "nature_change", "price"]} label="Nature change" unit="₽" />
        </div>
      </Section>
      <Section title="Move Relearner" summary="money and an item">
        <div className="pc-grid">
          <Num ctx={ctx} path={["training", "move_relearner", "price"]} label="Price" unit="₽" />
          <ConstRow ctx={ctx} path={["training", "move_relearner", "item"]} prefix="ITEM_" label="Item taken" />
          <Num ctx={ctx} path={["training", "move_relearner", "item_count"]} label="Item count" unit="of it" />
        </div>
      </Section>
      <Section title="Hyper Training" summary="a stat's IV to 31">
        <div className="pc-grid">
          <Num ctx={ctx} path={["training", "hyper_training", "bp_per_stat"]} label="Battle Points" unit="BP a stat" />
          <Toggle ctx={ctx} path={["training", "hyper_training", "requires_champion"]} label="Champion only" text="Needs the Hall of Fame" />
          <Num ctx={ctx} path={["training", "hyper_training", "level_after_champion"]} label="Least level" unit="level" />
        </div>
      </Section>
      <Section title="Effort values and abilities" summary="resets and changes">
        <div className="pc-grid">
          <Num ctx={ctx} path={["training", "effort_reset", "one_stat"]} label="Reset one stat" unit="₽" />
          <Num ctx={ctx} path={["training", "effort_reset", "all_stats"]} label="Reset all stats" unit="₽" />
          <Num ctx={ctx} path={["training", "ability", "swap"]} label="Swap abilities" unit="₽" />
          <Num ctx={ctx} path={["training", "ability", "hidden"]} label="Hidden ability" unit="₽" />
        </div>
      </Section>
      <Section title="Grooming" summary={`${grooming.length} courses`}>
        <p className="muted pc-note">{ctx.hint(["training", "grooming"])}</p>
        <div className="pc-grid">
          {grooming.map((g, i) => (
            <Row key={i} label={humanize(String(asMap(g).get("name") ?? ""))}>
              <span className="pc-pair"><NumberInput ctx={ctx} path={["training", "grooming", i, "friendship"]} unit="friendship" /></span>
              <span className="pc-pair"><NumberInput ctx={ctx} path={["training", "grooming", i, "price"]} unit="₽" width={100} /></span>
            </Row>
          ))}
        </div>
      </Section>
    </>
  );
}

// ---- Wonder Trade ----------------------------------------------------------------------------------------------

function WonderBasics({ ctx }: { ctx: Ctx }) {
  const w = ["wonder_trade"];
  return (
    <Section title="The trade" summary="fee and levels">
      <div className="pc-grid">
        <Num ctx={ctx} path={[...w, "fee"]} unit="₽" />
        <Num ctx={ctx} path={[...w, "level_spread"]} label="Level spread" unit="levels either way" />
        <Num ctx={ctx} path={[...w, "other_evolution_levels", "second_stage"]} label="Least level, 2nd stage" unit="level"
             hint="The least level of a second-stage species that evolves by anything but a level (friendship, a stone, a trade); a species received below its least level is its pre-evolution instead." />
        <Num ctx={ctx} path={[...w, "other_evolution_levels", "third_stage"]} label="Least level, 3rd stage" unit="level" hint="The same for a third-stage species." />
      </div>
    </Section>
  );
}

function WonderOdds({ ctx }: { ctx: Ctx }) {
  const w = ["wonder_trade"];
  const shiny = Number(ctx.get([...w, "shiny_one_in"]));
  return (
    <Section title="The received Pokémon's odds" summary="per trade">
      <div className="pc-grid">
        <Row label="Shiny" hint={ctx.hint([...w, "shiny_one_in"])}>
          <span className="muted">1 in</span>
          <NumberInput ctx={ctx} path={[...w, "shiny_one_in"]} />
          <span className="pc-readout">{shiny > 0 ? percentOf(1 / shiny) : ""}</span>
        </Row>
        <Odds ctx={ctx} path={[...w, "hidden_ability_percent"]} label="Hidden ability" />
        <Odds ctx={ctx} path={[...w, "perfect_ivs_percent"]} label="Perfect IVs" />
        <Num ctx={ctx} path={[...w, "perfect_iv_count"]} label="Perfect IV count" unit="stats at 31" />
        <Odds ctx={ctx} path={[...w, "pokerus_percent"]} label="Pokérus" />
        <Odds ctx={ctx} path={[...w, "nickname_percent"]} label="Nickname" />
        <Num ctx={ctx} path={[...w, "female_trainer_percent"]} label="Female trainer" unit="%" />
      </div>
    </Section>
  );
}

function HeldItems({ ctx }: { ctx: Ctx }) {
  const w = ["wonder_trade"];
  const tiersValue = ctx.get([...w, "item_tiers"]);
  const tiers = readTiers(tiersValue);
  const held = Number(ctx.get([...w, "held_item_percent"]) ?? 0);
  const shares = tierShares(tiers);
  const options = constantOptions(ctx.constants, "ITEM_");
  const list = asList(tiersValue);
  const [openTier, setOpenTier] = useState(0);
  const addTier = () => {
    let name = "tier";
    for (let n = 2; tiers.some((t) => t.name === name); n++) name = `tier_${n}`;
    ctx.set([...w, "item_tiers"], [...list, new Map<string, JsonValue>([["name", name], ["weight", 100], ["items", ["ITEM_ORAN_BERRY"]]])]);
    setOpenTier(list.length);
  };
  return (
    <Section title="Held items" summary={`${held}% of trades hold one, in ${tiers.length} tiers`}>
      <div className="pc-grid">
        <Odds ctx={ctx} path={[...w, "held_item_percent"]} label="Holds an item" />
        <Row label="Tiers" hint={ctx.hint([...w, "item_tiers"])}>
          <Shares weights={tiers.map((t) => t.weight)} labels={tiers.map((t) => t.name)} max={1} />
        </Row>
      </div>
      {tiers.map((tier, ti) => {
        const base = [...w, "item_tiers", ti];
        const items = asList(asMap(list[ti]).get("items"));
        const open = openTier === ti;
        return (
          <div key={ti} className="pc-tier">
            <div className="pc-tier-head" onClick={() => setOpenTier(open ? -1 : ti)}>
              <span className="pc-caret">{open ? "▾" : "▸"}</span>
              <input className="pc-text" value={tier.name} onClick={(e) => e.stopPropagation()}
                     onChange={(e) => ctx.set([...base, "name"], e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} />
              <span onClick={(e) => e.stopPropagation()}>
                <NumberInput ctx={ctx} path={[...base, "weight"]} unit="weight" width={80} />
              </span>
              <span className="pc-readout">{percentOf(shares[ti].share)} of held items; {oneIn((held / 100) * shares[ti].share) ?? "never"}</span>
              <span className="muted">{tier.items.length} items</span>
              <button className="pc-x" title="Remove the tier" onClick={(e) => { e.stopPropagation(); ctx.set([...w, "item_tiers"], list.filter((_, j) => j !== ti)); }}>×</button>
            </div>
            {open && (
              <div className="pc-tier-body">
                {tier.items.map((item, ii) => {
                  const chance = itemChance(tiers, held, item.item);
                  return (
                    <div key={ii} className="pc-line">
                      <SearchSelect value={item.item} options={options}
                                    onChange={(n) => ctx.set([...base, "items", ii], item.weight === null ? n : new Map<string, JsonValue>([["item", n], ["weight", item.weight]]))} />
                      <span className="muted">weight</span>
                      <input type="number" className="pc-number pc-small" min={1} max={1000} placeholder="1" value={item.weight ?? ""}
                             title="Empty is a plain item, which weighs 1"
                             onChange={(e) => {
                               const n = clamp(Math.round(Number(e.target.value)), 1, 1000);
                               ctx.set([...base, "items", ii], e.target.value === "" ? item.item : new Map<string, JsonValue>([["item", item.item], ["weight", n || 1]]));
                             }} />
                      <span className="pc-readout">{percentOf(shares[ti].items[ii])} of the tier; {oneIn(chance) ?? "never"}</span>
                      <button className="pc-x" title="Remove" disabled={items.length <= 1} onClick={() => ctx.set([...base, "items"], items.filter((_, j) => j !== ii))}>×</button>
                    </div>
                  );
                })}
                <span className="pc-add">
                  <span className="muted">Add</span>
                  <SearchSelect value="" options={options} placeholder="Add item…" onChange={(n) => n && ctx.set([...base, "items"], [...items, n])} />
                </span>
              </div>
            )}
          </div>
        );
      })}
      <div className="pc-actions"><button onClick={addTier} disabled={list.length >= ctx.range([...w, "item_tiers"]).max}>+ Add tier</button></div>
    </Section>
  );
}

function Balls({ ctx }: { ctx: Ctx }) {
  const path = ["wonder_trade", "balls"];
  const list = asList(ctx.get(path));
  const shares = sharesOf(list.map((b) => Number(asMap(b).get("weight") ?? 0)));
  const options = constantOptions(ctx.constants, "ITEM_");
  return (
    <Section title="Balls" summary={`${list.length} kinds`}>
      <p className="muted pc-note">{ctx.hint(path)}</p>
      {list.map((b, i) => (
        <div key={i} className="pc-line">
          <SearchSelect value={String(asMap(b).get("item") ?? "")} options={options} onChange={(n) => ctx.set([...path, i, "item"], n)} />
          <NumberInput ctx={ctx} path={[...path, i, "weight"]} unit="weight" width={80} />
          <span className="pc-readout">{percentOf(shares[i])}</span>
          <button className="pc-x" title="Remove" disabled={list.length <= 1} onClick={() => ctx.set(path, list.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <span className="pc-add">
        <span className="muted">Add</span>
        <SearchSelect value="" options={options} placeholder="Add ball…"
                      onChange={(n) => n && ctx.set(path, [...list, new Map<string, JsonValue>([["item", n], ["weight", 10]])])} />
      </span>
    </Section>
  );
}

const linesOf = (v: JsonValue | undefined) => asList(v).map(String).join("\n");

function Languages({ ctx }: { ctx: Ctx }) {
  const path = ["wonder_trade", "languages"];
  const list = asList(ctx.get(path));
  const shares = sharesOf(list.map((l) => Number(asMap(l).get("weight") ?? 0)));
  const used = new Set(list.map((l) => String(asMap(l).get("language"))));
  const free = LANGUAGE_NAMES.filter((l) => !used.has(l));
  const [open, setOpen] = useState(-1);
  return (
    <Section title="Original trainers' languages" summary={`${list.length} languages`}>
      <p className="muted pc-note">{ctx.hint(path)}</p>
      {list.map((l, i) => {
        const row = asMap(l);
        const show = open === i;
        const names = (key: string, label: string) => (
          <div className="pc-names">
            <span className="pc-label">{label}</span>
            <textarea rows={5} value={linesOf(row.get(key))} spellCheck={false}
                      onChange={(e) => ctx.set([...path, i, key], e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} />
          </div>
        );
        return (
          <div key={i} className="pc-tier">
            <div className="pc-tier-head" onClick={() => setOpen(show ? -1 : i)}>
              <span className="pc-caret">{show ? "▾" : "▸"}</span>
              <span className="pc-lang">{humanize(String(row.get("language")))}</span>
              <span onClick={(e) => e.stopPropagation()}><NumberInput ctx={ctx} path={[...path, i, "weight"]} unit="weight" width={80} /></span>
              <span className="pc-readout">{percentOf(shares[i])}</span>
              <span className="muted">{asList(row.get("male_names")).length} + {asList(row.get("female_names")).length} names, {asList(row.get("nicknames")).length} nicknames</span>
              <button className="pc-x" title="Remove" disabled={list.length <= 1} onClick={(e) => { e.stopPropagation(); ctx.set(path, list.filter((_, j) => j !== i)); }}>×</button>
            </div>
            {show && (
              <div className="pc-tier-body pc-name-cols">
                {names("male_names", "Male names")}
                {names("female_names", "Female names")}
                {names("nicknames", "Nicknames")}
                <span className="muted pc-hint">One a line; at most 7 characters (5 in Japanese and Korean), nicknames 10 (5).</span>
              </div>
            )}
          </div>
        );
      })}
      {free.length > 0 && (
        <div className="pc-actions">
          {free.map((l) => (
            <button key={l} onClick={() => ctx.set(path, [...list, new Map<string, JsonValue>([["language", l], ["weight", 5], ["male_names", ["Name"]], ["female_names", ["Name"]], ["nicknames", ["Nick"]]])])}>
              + {humanize(l)}
            </button>
          ))}
        </div>
      )}
    </Section>
  );
}

function Forms({ ctx }: { ctx: Ctx }) {
  const path = ["wonder_trade", "forms"];
  const list = asList(ctx.get(path));
  return (
    <Section title="Forms" summary={`${list.length} species with several forms`}>
      <p className="muted pc-note">{ctx.hint(path)}</p>
      {list.map((f, i) => {
        const row = asMap(f);
        const weights = asList(row.get("weights")).map(Number);
        const season = row.get("season") === true;
        const total = weights.reduce((a, b) => a + b, 0);
        return (
          <div key={i} className="pc-line pc-form">
            <SearchSelect value={String(row.get("species") ?? "")} options={constantOptions(ctx.constants, "SPECIES_")}
                          onChange={(n) => ctx.set([...path, i, "species"], n)} />
            {season ? <span className="muted">the season's form</span> : (
              <span className="pc-weights">
                {weights.map((wt, k) => (
                  <label key={k} className="pc-weight" title={total > 0 ? `${percentOf(wt / total)}` : ""}>
                    <span className="muted">{k}</span>
                    <input type="number" min={0} max={1000} value={wt}
                           onChange={(e) => ctx.set([...path, i, "weights", k], clamp(Math.round(Number(e.target.value) || 0), 0, 1000))} />
                  </label>
                ))}
              </span>
            )}
            <button className="pc-x" title="Remove" onClick={() => ctx.set(path, list.filter((_, j) => j !== i))}>×</button>
          </div>
        );
      })}
      <span className="pc-add">
        <span className="muted">Add</span>
        <SearchSelect value="" options={constantOptions(ctx.constants, "SPECIES_")} placeholder="Add species…"
                      onChange={(n) => n && ctx.set(path, [...list, new Map<string, JsonValue>([["species", n], ["weights", [1, 1]]])])} />
      </span>
    </Section>
  );
}

function Special({ ctx }: { ctx: Ctx }) {
  const p = ["wonder_trade", "special_reward"];
  const moves = asList(ctx.get([...p, "moves"]));
  const gender = String(ctx.get([...p, "gender"]));
  const slot = Number(ctx.get([...p, "ability_slot"]));
  const enabled = ctx.get([...p, "enabled"]) === true;
  return (
    <Section title="Special reward" summary={enabled ? `on, ${Number(ctx.get([...p, "percent"]))}% a trade, the ${Number(ctx.get([...p, "guaranteed_at"]))}th at the latest` : "off"}>
      <p className="muted pc-note">{ctx.hint(p)}</p>
      <div className="pc-grid">
        <Toggle ctx={ctx} path={[...p, "enabled"]} text={enabled ? "On" : "Off"} hint="Whether the reward can come at all." />
        <Odds ctx={ctx} path={[...p, "percent"]} label="Chance a trade" />
        <Num ctx={ctx} path={[...p, "guaranteed_at"]} label="Guaranteed at" unit="trades" />
        <ConstRow ctx={ctx} path={[...p, "species"]} prefix="SPECIES_" />
        <Num ctx={ctx} path={[...p, "form"]} unit="form number" />
        <Num ctx={ctx} path={[...p, "level"]} unit="level" />
        <Row label="Moves" hint={ctx.hint([...p, "moves"])}>
          <div className="pc-list">
            {moves.map((m, i) => (
              <div key={i} className="pc-line">
                <SearchSelect value={String(m)} options={constantOptions(ctx.constants, "MOVE_")} onChange={(n) => ctx.set([...p, "moves", i], n)} />
                <button className="pc-x" title="Remove" disabled={moves.length <= 1} onClick={() => ctx.set([...p, "moves"], moves.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            {moves.length < 4 && (
              <span className="pc-add"><span className="muted">Add</span>
                <SearchSelect value="" options={constantOptions(ctx.constants, "MOVE_")} placeholder="Add move…" onChange={(n) => n && ctx.set([...p, "moves"], [...moves, n])} />
              </span>
            )}
          </div>
        </Row>
        <ConstRow ctx={ctx} path={[...p, "nature"]} prefix="NATURE_" />
        <Row label="IVs">
          <span className="pc-ivs">
            {STATS.map((s) => (
              <label key={s} className="pc-weight"><span className="muted">{STAT_LABELS[s]}</span>
                <input type="number" min={0} max={31} value={Number(ctx.get([...p, "ivs", s]) ?? 0)}
                       onChange={(e) => ctx.set([...p, "ivs", s], clamp(Math.round(Number(e.target.value) || 0), 0, 31))} /></label>
            ))}
          </span>
        </Row>
        <Row label="Ability" hint={ctx.hint([...p, "ability_slot"])}>
          <span className="view-switch">
            {[[0, "First"], [1, "Second"], [2, "Hidden"]].map(([v, t]) => (
              <button key={v} className={slot === v ? "active" : ""} onClick={() => ctx.set([...p, "ability_slot"], v as number)}>{t}</button>
            ))}
          </span>
        </Row>
        <Row label="Gender" hint={ctx.hint([...p, "gender"])}>
          <span className="view-switch">
            {["male", "female", "random"].map((g) => (
              <button key={g} className={gender === g ? "active" : ""} onClick={() => ctx.set([...p, "gender"], g)}>{humanize(g)}</button>
            ))}
          </span>
        </Row>
        <ConstRow ctx={ctx} path={[...p, "ball"]} prefix="ITEM_" label="Ball" />
        <ConstRow ctx={ctx} path={[...p, "held_item"]} prefix="ITEM_" label="Held item" />
      </div>
    </Section>
  );
}

function WonderTrade({ ctx }: { ctx: Ctx }) {
  const w = ["wonder_trade"];
  return (
    <>
      <WonderBasics ctx={ctx} />
      <WonderOdds ctx={ctx} />
      <HeldItems ctx={ctx} />
      <Balls ctx={ctx} />
      <Languages ctx={ctx} />
      <Forms ctx={ctx} />
      <Section title="Never received" summary={`${asList(ctx.get([...w, "excluded_species"])).length} species, ${asList(ctx.get([...w, "excluded_forms"])).length} forms`}>
        <div className="pc-grid">
          <Row label="Excluded species" hint={ctx.hint([...w, "excluded_species"])}>
            <ConstantList ctx={ctx} path={[...w, "excluded_species"]} prefix="SPECIES_" empty="None: any species can be received." />
          </Row>
          <Row label="Excluded forms" hint={ctx.hint([...w, "excluded_forms"])}>
            <FormList ctx={ctx} path={[...w, "excluded_forms"]} empty="None." />
          </Row>
        </div>
      </Section>
      <Section title="Never sent" summary={`${asList(ctx.get([...w, "never_tradeable"])).length} forms`}>
        <div className="pc-grid">
          <Row label="Never tradeable" hint={ctx.hint([...w, "never_tradeable"])}>
            <FormList ctx={ctx} path={[...w, "never_tradeable"]} empty="None." />
          </Row>
        </div>
      </Section>
      <Special ctx={ctx} />
    </>
  );
}

// ---- The page ----------------------------------------------------------------------------------------------------

export function PokemonCenterEditor({ constants }: ToolProps) {
  const held = useHeld(SERVICES_PATH);
  const { docs } = useDocuments();
  const toolActive = useToolActive();
  const [attendant, setAttendant] = useState<Attendant>("wonder");
  const doc = docs.get(SERVICES_PATH);
  const { data, schema } = held;

  const save = useCallback(async () => {
    if (documents.get(SERVICES_PATH)?.dirty) await documents.save(SERVICES_PATH);
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

  const ctx: Ctx | null = useMemo(() => {
    if (data === null || !schema) return null;
    const lookup = (path: JsonPath) => {
      // Array positions all use the schema of the list's items
      return schemaAt(schema, path.map((k) => (typeof k === "number" ? 0 : k)));
    };
    const range = (path: JsonPath) => {
      const s = lookup(path);
      return { min: s.minimum ?? s.minItems ?? 0, max: s.maximum ?? s.maxItems ?? 1_000_000 };
    };
    return {
      data, constants,
      get: (path) => getIn(data, path),
      set: (path, value) => documents.edit(SERVICES_PATH, path, value),
      hint: (path) => lookup(path).description,
      range,
      schemaFor: (path) => ({ ...range(path), description: lookup(path).description }),
    };
  }, [data, schema, constants]);

  const errors = useMemo(() => (data !== null && schema ? validate(data, schema, constants) : []), [data, schema, constants]);
  const unsaved = !!doc?.dirty;
  const discount = ctx ? Number(ctx.get(["champion_discount_percent"])) : 0;

  return (
    <div className="pc-editor">
      <header className="pc-header">
        <h2>Pokémon Center</h2>
        <span className="muted pc-note">The three upstairs attendants' fees, rates and lists. Fees in money drop by the champion discount once the player is in the Hall of Fame.</span>
        <span className="spacer" />
        {unsaved && <span className="muted">unsaved</span>}
        <button onClick={() => documents.reload(SERVICES_PATH)} disabled={!unsaved}>Revert</button>
        <button className="primary" onClick={save} disabled={!unsaved} title="Ctrl+S">Save</button>
      </header>
      {doc?.saveError && <div className="pc-error pc-bar">{SERVICES_PATH}: {doc.saveError}</div>}
      {held.error ? <p className="pc-error pc-bar">{held.error}</p> : !ctx ? <p className="muted pc-bar">Reading the services…</p> : (
        <div className="pc-page">
          {errors.length > 0 && <div className="pc-error pc-bar">{errors.slice(0, 5).map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")}</div>}
          <Section title="Champion discount" summary={`${discount}% off every attendant's fees in money`}>
            <div className="pc-grid">
              <Num ctx={ctx} path={["champion_discount_percent"]} label="Discount" unit="%" />
              <Toggle ctx={ctx} path={["champion_discount_battle_points"]} label="Battle Points" text="Also discount Battle Points" />
              <Toggle ctx={ctx} path={["champion_discount_items"]} label="Items" text="Also discount items taken as a fee" />
            </div>
          </Section>
          <div className="pc-tabs view-switch">
            {ATTENDANTS.map(([id, label]) => (
              <button key={id} className={attendant === id ? "active" : ""} onClick={() => setAttendant(id)}>{label}</button>
            ))}
          </div>
          {attendant === "daycare" && <DayCare ctx={ctx} />}
          {attendant === "training" && <Training ctx={ctx} />}
          {attendant === "wonder" && <WonderTrade ctx={ctx} />}
        </div>
      )}
    </div>
  );
}
