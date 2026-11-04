// The spawn groups in the Overworld Editor (groups.ts): the state every panel reads, a member's Group section (in an
// NPC's, an instance's and an ambient's panel), and the Groups panel over the map, which lists the zone's groups (its
// own and those it has a member of) or every group, and adds the chosen NPC, instance or ambient to one.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../../api.ts";
import { documents, useDocuments } from "../../documents.ts";
import { fromPlain, toPlain } from "../../../shared/json.ts";
import { useHeld } from "../followers/DocForm.tsx";
import { ScrubNumber, type ScrubPhase } from "./ScrubNumber.tsx";
import { GROUPS_PATH, groupMembers, groupOdds, groupWarnings, newGroupId, sameRef, type Group, type Member, type MemberRef,
  type Membership, type ZoneSpawns } from "./groups.ts";
import { SPAWN_SCHEMA, spawnPath, type Ambient, type PreviewWorld, type Rolls, type SpawnEntry } from "./spawns.ts";

const SPAWN_FOLDER = "res/paperwhite2/overworld/";
const ROLLS: { value: Rolls; label: string }[] = [
  { value: "hour", label: "the hour" }, { value: "period", label: "the time of day" }, { value: "day", label: "the day" },
  { value: "entry", label: "each zone entry" },
];
const percent = (p: number) => (p >= 0.995 ? "100%" : p < 0.005 && p > 0 ? "<1%" : `${Math.round(p * 100)}%`);
const zoneLabel = (zone: string) => zone.replace(/_/g, " ");

export interface GroupsState {
  /** The open zone, a spawn file's name. */
  zone: string;
  groups: Group[];
  /** Each group's members, by its id, and their chances of being picked (with nobody's). */
  members: Map<string, Member[]>;
  odds: Map<string, { members: number[]; nobody: number }>;
  files: ZoneSpawns[];
  /** The group whose members the map shows, the others faded. */
  focus: string | null;
  setFocus(id: string | null): void;
  /** Makes a group, at home in the open zone; its id. */
  createGroup(name: string): string;
  /** Changes a group's fields, or deletes it (null); a drag's moves amend the step its start made. */
  editGroup(id: string, next: Group | null, phase?: ScrubPhase): void;
  /** Puts a member in a group, or takes it out of its own (undefined); a drag's moves amend the step its start made. */
  setMembership(ref: MemberRef, membership: Membership | undefined, phase?: ScrubPhase): void;
  /** Shows a member: selects it in the open zone, or opens its zone. */
  openMember(ref: MemberRef): void;
  /** Whether the Groups panel is open over the map. */
  panelOpen: boolean;
  setPanelOpen(open: boolean): void;
}

const GroupsContext = createContext<GroupsState | null>(null);
export const GroupsProvider = ({ value, children }: { value: GroupsState; children: ReactNode }) =>
  <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
export const useGroups = () => useContext(GroupsContext);

/** The groups' state for the open zone, its spawns as they are now; with the preview's world, the chances as they are
 * in it. */
export function useGroupsState({ zone, world, onEdit, onOpenMember }: {
  zone: string;
  world: PreviewWorld | null;
  onEdit(paths: string[]): void;
  onOpenMember(ref: MemberRef): void;
}): GroupsState {
  const { docs } = useDocuments();
  const { data: groupsData } = useHeld(GROUPS_PATH);
  const groups = useMemo(() => (groupsData instanceof Map ? ((toPlain(groupsData) as { groups?: Group[] }).groups ?? []) : []), [groupsData]);
  // Every zone's spawn file as saved, read again when one changes on disk; those open are taken as they are now
  const [saved, setSaved] = useState<ZoneSpawns[]>([]);
  const [epoch, setEpoch] = useState(0);
  useEffect(() => documents.onFiles((paths) => { if (paths.some((p) => p.startsWith(SPAWN_FOLDER))) setEpoch((n) => n + 1); }), []);
  useEffect(() => {
    let live = true;
    api.data(SPAWN_SCHEMA).then((files) => {
      if (live) setSaved(files.map(({ path, data }) => toZoneSpawns(path, data)));
    }, () => undefined);
    return () => { live = false; };
  }, [epoch]);
  const files = useMemo(() => {
    const byZone = new Map(saved.map((f) => [f.zone, f]));
    for (const [path, doc] of docs) {
      if (path.startsWith(SPAWN_FOLDER) && !path.endsWith(".schema.json") && path !== GROUPS_PATH && doc.data instanceof Map) {
        const f = toZoneSpawns(path, toPlain(doc.data) as Record<string, unknown>);
        byZone.set(f.zone, f);
      }
    }
    return [...byZone.values()];
  }, [saved, docs]);
  const members = useMemo(() => groupMembers(files, world), [files, world]);
  const odds = useMemo(() => new Map(groups.map((g) => [g.id, groupOdds(members.get(g.id) ?? [], g.nobody ?? 0)])), [groups, members]);
  const [focus, setFocus] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const writeGroups = (list: Group[], phase: ScrubPhase = "typed") => {
    if (phase === "end") return;
    if (phase === "move") { documents.amend(GROUPS_PATH, ["groups"], fromPlain(list)); return; }
    documents.edit(GROUPS_PATH, ["groups"], fromPlain(list));
    onEdit([GROUPS_PATH]);
  };
  return {
    zone, groups, members, odds, files, focus, setFocus, panelOpen, setPanelOpen,
    createGroup(name) {
      const id = newGroupId(name, groups.map((g) => g.id));
      writeGroups([...groups, { id, name, zone: `ZONE_${zone.toUpperCase()}` }]);
      return id;
    },
    editGroup(id, next, phase) {
      writeGroups(next ? groups.map((g) => (g.id === id ? next : g)) : groups.filter((g) => g.id !== id), phase);
      if (!next && focus === id) setFocus(null);
    },
    setMembership(ref, membership, phase = "typed") {
      if (phase === "end") return;
      void writeMembership(ref, membership, phase === "move").then((path) => { if (path && phase !== "move") onEdit([path]); });
    },
    openMember: onOpenMember,
  };
}

function toZoneSpawns(path: string, data: Record<string, unknown>): ZoneSpawns {
  return { zone: path.slice(path.lastIndexOf("/") + 1).replace(/\.json$/, ""), npcs: (data.npcs as SpawnEntry[] | undefined) ?? [],
           ambients: (data.ambients as Ambient[] | undefined) ?? [] };
}

/** A member's group written into its zone's spawn file, which is made if it has none, as a step or amending the last;
 * the file's path. */
async function writeMembership(ref: MemberRef, membership: Membership | undefined, amend: boolean): Promise<string | null> {
  const path = spawnPath(ref.zone);
  if (!documents.get(path)) {
    const found = await api.list(path);
    if (found.length) await documents.hold(path);
    else documents.create(path, SPAWN_SCHEMA, fromPlain({ $schema: "overworld.schema.json", npcs: [] }));
  }
  const doc = documents.get(path);
  if (!doc || !(doc.data instanceof Map)) return null;
  const plain = toPlain(doc.data) as { npcs?: SpawnEntry[]; ambients?: Ambient[] };
  const value = membership ? fromPlain(membership) : undefined;
  const write = (at: (string | number)[], v: ReturnType<typeof fromPlain> | undefined) =>
    (amend ? documents.amend(path, at, v) : documents.edit(path, at, v));
  if (ref.kind === "ambient") {
    write(["ambients", ref.ambient!, "group"], value);
    return path;
  }
  const npcs = [...(plain.npcs ?? [])];
  const at = npcs.findIndex((e) => e.id === ref.npcId);
  if (ref.kind === "instance") {
    if (at < 0) return null;
    write(["npcs", at, "instances", ref.instance!, "group"], value);
    return path;
  }
  // A whole NPC: its entry made for it, or dropped once it has nothing left
  if (at < 0) {
    if (!membership) return null;
    npcs.push({ id: ref.npcId!, group: membership });
  } else {
    const { group: _old, ...rest } = npcs[at];
    const next: SpawnEntry = membership ? { ...rest, group: membership } : rest;
    if (next.when || next.instances?.length || next.group) npcs[at] = next;
    else npcs.splice(at, 1);
  }
  write(["npcs"], fromPlain(npcs));
  return path;
}

/** A member's chance of being picked, and its group's, or null where it's in none. */
export function memberOdds(state: GroupsState, ref: MemberRef): { group: Group; member: Member; chance: number; count: number } | null {
  for (const group of state.groups) {
    const list = state.members.get(group.id) ?? [];
    const i = list.findIndex((m) => sameRef(m, ref));
    if (i >= 0) return { group, member: list[i], chance: state.odds.get(group.id)?.members[i] ?? 0, count: list.length };
  }
  return null;
}

/** The groups the open zone lists: its own and those it has a member of. */
export function zoneGroups(state: GroupsState): Group[] {
  const home = `ZONE_${state.zone.toUpperCase()}`;
  return state.groups.filter((g) => g.zone === home || (state.members.get(g.id) ?? []).some((m) => m.zone === state.zone));
}

/** A member's Group section, for its panel: its group, its weight among the members, and its chance of appearing. */
export function GroupSection({ member: where, membership, blocked }: {
  /** The member in the open zone. */
  member: Omit<MemberRef, "zone">;
  membership: Membership | undefined;
  /** Why it can't be in a group (an NPC whose instance is in one, or the reverse). */
  blocked?: string;
}) {
  const state = useGroups();
  if (!state) return null;
  const member: MemberRef = { ...where, zone: state.zone };
  const odds = membership ? memberOdds(state, member) : null;
  const listed = zoneGroups(state);
  const others = state.groups.filter((g) => !listed.includes(g));
  const set = (m: Membership | undefined, phase?: ScrubPhase) => state.setMembership(member, m, phase);
  return (
    <section className="ow-panel-box ow-section">
      <h5>Group <span className="muted">{membership
        ? `${state.groups.find((g) => g.id === membership.id)?.name ?? membership.id}${odds ? ` · ${percent(odds.chance)} of the time` : ""}`
        : "none"}</span></h5>
      <div className="ow-section-actions">
        <button onClick={() => set({ id: state.createGroup(`Group ${state.groups.length + 1}`) })} disabled={!!blocked}>New group</button>
        <button onClick={() => state.setPanelOpen(true)}>Groups…</button>
        {membership && (
          <button className={state.focus === membership.id ? "active" : ""}
                  onClick={() => state.setFocus(state.focus === membership.id ? null : membership.id)}>Show only its group</button>
        )}
      </div>
      {blocked ? <p className="muted ow-note">{blocked}</p> : (
        <div className="ow-condition">
          <span className="ow-condition-label">Group</span>
          <span className="ow-event-control">
            <select value={membership?.id ?? ""} onChange={(e) => set(e.target.value ? { ...membership, id: e.target.value } : undefined)}>
              <option value="">none</option>
              {listed.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              {others.length > 0 && <optgroup label="Other zones' groups">
                {others.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</optgroup>}
            </select>
            <span className="muted hint">at most one of a group's members appears at a time</span>
          </span>
          {membership && (
            <>
              <span className="ow-condition-label">Weight</span>
              <span className="ow-event-control">
                <ScrubNumber label="×" value={membership.weight ?? 1} step={0.1} digits={0}
                             onChange={(n, phase) => set({ ...membership, weight: clampWeight(n) === 1 ? undefined : clampWeight(n) }, phase)} />
                <span className="muted hint">its share of the group's picks among the members that can appear</span>
              </span>
              <span className="ow-condition-label">Chance</span>
              <span className="ow-event-control">
                <span>{odds ? percent(odds.chance) : "—"}</span>
                <span className="muted hint">{odds
                  ? `of the time it's the one of the ${odds.count} that appears, by their chances and weights and the group's nobody weight`
                  : "its group isn't in groups.json"}</span>
              </span>
            </>
          )}
        </div>
      )}
    </section>
  );
}

const clampWeight = (n: number) => Math.max(1, Math.min(65535, Math.round(n)));

/** The Groups panel over the map. */
export function GroupsPanel({ selected, onClose }: {
  /** The chosen NPC, instance or ambient, which a group can add, with its label and its group if it has one. */
  selected: { ref: MemberRef; label: string; membership: Membership | undefined; blocked?: string } | null;
  onClose(): void;
}) {
  const state = useGroups();
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  if (!state) return null;
  const listed = all ? state.groups : zoneGroups(state);
  const add = () => {
    const id = state.createGroup(`Group ${state.groups.length + 1}`);
    setOpen(id);
  };
  return (
    <div className="ow-wild-panel ow-groups-panel">
      <div className="me-overworld-head">
        <strong>Spawn groups</strong>
        <span className="muted" title="All groups lists every group, this zone's among them">{zoneGroups(state).length} listed in this zone · {state.groups.length} in all</span>
        <span className="view-switch">
          <button className={!all ? "active" : ""} onClick={() => setAll(false)}>This zone</button>
          <button className={all ? "active" : ""} onClick={() => setAll(true)}>All groups</button>
        </span>
        <span className="spacer" />
        <button onClick={add}>New group</button>
        <button onClick={onClose}>Close</button>
      </div>
      <p className="muted ow-note">At most one member of a group appears at a time: among the members whose conditions hold, the game picks one
        by weight, or nobody by the group's nobody weight. A zone lists the groups at home in it and those it has a member of.</p>
      <div className="ow-groups-list">
        {!listed.length && <p className="muted">{all ? "No groups yet." : "No groups in this zone. New group makes one here, or All groups shows the others."}</p>}
        {listed.map((group) => (
          <GroupBox key={group.id} group={group} open={open === group.id} onToggle={() => setOpen(open === group.id ? null : group.id)}
                    selected={selected} />
        ))}
      </div>
    </div>
  );
}

function GroupBox({ group, open, onToggle, selected }: {
  group: Group;
  open: boolean;
  onToggle(): void;
  selected: { ref: MemberRef; label: string; membership: Membership | undefined; blocked?: string } | null;
}) {
  const state = useGroups()!;
  const members = state.members.get(group.id) ?? [];
  const odds = state.odds.get(group.id);
  const warnings = groupWarnings(group, members, state.files);
  const home = `ZONE_${state.zone.toUpperCase()}`;
  const set = (patch: Partial<Group>, phase?: ScrubPhase) => {
    const next = { ...group, ...patch };
    for (const k of Object.keys(patch) as (keyof Group)[]) if (patch[k] === undefined) delete next[k];
    state.editGroup(group.id, next, phase);
  };
  const zones = new Set(members.map((m) => m.zone));
  const canAdd = selected && !selected.blocked && selected.membership?.id !== group.id;
  return (
    <section className="ow-panel-box ow-section">
      <h5 className="ow-group-head" onClick={onToggle}>
        {open ? "▾" : "▸"} {group.name}
        <span className="muted">{members.length} member{members.length === 1 ? "" : "s"}{zones.size > 1 ? ` in ${zones.size} zones` : ""}
          {odds && ` · nobody ${percent(odds.nobody)}`}{group.zone && group.zone !== home ? ` · at home in ${zoneLabel(group.zone.replace(/^ZONE_/, "").toLowerCase())}` : ""}</span>
      </h5>
      <div className="ow-section-actions">
        <button className={state.focus === group.id ? "active" : ""} onClick={() => state.setFocus(state.focus === group.id ? null : group.id)}
                title="The map shows this group's members in this zone, the rest faded">Show only this group</button>
        {selected && (
          <button disabled={!canAdd} onClick={() => state.setMembership(selected.ref, { id: group.id })}
                  title={selected.blocked ?? (selected.membership ? `It's in ${selected.membership.id} now; this moves it` : undefined)}>
            Add {selected.label}</button>
        )}
      </div>
      {warnings.map((w) => <p key={w} className="ow-error ow-note">{w}</p>)}
      <table className="ow-wild-table ow-group-members">
        <tbody>
          {members.map((m, i) => (
            <tr key={`${m.zone}:${m.kind}:${m.npcId}:${m.instance}:${m.ambient}`}>
              <td><button className="link" onClick={() => state.openMember(m)}>{m.label}</button>
                {m.zone !== state.zone && <span className="muted small"> in {zoneLabel(m.zone)}</span>}</td>
              <td className="muted small">{m.kind === "npc" ? "NPC" : m.kind}</td>
              <td className="muted small">weight {m.weight}{m.able < 1 ? ` · can appear ${percent(m.able)}` : ""}</td>
              <td><span className="ow-group-bar"><span style={{ width: `${Math.round((odds?.members[i] ?? 0) * 100)}%` }} /></span> {percent(odds?.members[i] ?? 0)}</td>
              <td>{m.zone === state.zone && <button className="icon" title="Take it out of the group" onClick={() => state.setMembership(m, undefined)}>×</button>}</td>
            </tr>
          ))}
          {!members.length && <tr><td className="muted">No members yet: choose an NPC, an instance or an ambient on the map and Add it.</td></tr>}
        </tbody>
      </table>
      {open && (
        <div className="ow-condition">
          <span className="ow-condition-label">Name</span>
          <input value={group.name} onChange={(e) => set({ name: e.target.value })} />
          <span className="ow-condition-label">Home</span>
          <span className="ow-event-control">
            <span className="view-switch">
              <button className={group.zone === home ? "active" : ""} onClick={() => set({ zone: home })}>This zone</button>
              <button className={!group.zone ? "active" : ""} onClick={() => set({ zone: undefined })}>No zone</button>
              {group.zone && group.zone !== home && <button className="active">{zoneLabel(group.zone.replace(/^ZONE_/, "").toLowerCase())}</button>}
            </span>
            <span className="muted hint">{group.zone
              ? "the zone that lists it; it's also listed in every zone with a member of it, and under All groups"
              : "no zone lists it for itself: it's listed in the zones with a member of it, and under All groups"}</span>
          </span>
          <span className="ow-condition-label">Picks for</span>
          <span className="ow-event-control">
            <select value={group.rolls ?? "hour"} onChange={(e) => set({ rolls: e.target.value === "hour" ? undefined : e.target.value as Rolls })}>
              {ROLLS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <span className="muted hint">how long its pick holds before it's rolled again; the same in every zone</span>
          </span>
          <span className="ow-condition-label">Nobody</span>
          <span className="ow-event-control">
            <ScrubNumber label="×" value={group.nobody ?? 0} step={0.1} digits={0}
                         onChange={(n, phase) => set({ nobody: Math.round(n) <= 0 ? undefined : Math.min(65535, Math.round(n)) }, phase)} />
            <span className="muted hint">the weight of no member appearing, against the members' weights: {odds ? percent(odds.nobody) : "—"} of the time now</span>
          </span>
          <span className="ow-condition-label">Id</span>
          <span className="ow-event-control"><code>{group.id}</code><span className="muted hint">what its members name it by</span></span>
          <span />
          <span><button disabled={members.length > 0} onClick={() => state.editGroup(group.id, null)}
                        title={members.length ? "Take its members out first" : undefined}>Delete the group</button></span>
        </div>
      )}
    </section>
  );
}
