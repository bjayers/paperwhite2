// Paper White 2's spawn groups in the Overworld Editor (res/paperwhite2/overworld/groups.json, groups.schema.json;
// docs/paperwhite2/design/overworld-editor.md, Groups): sets of NPCs, instances and ambients of which at most one
// member appears at a time, in one zone or across several. A group is defined in groups.json; a member names it where
// it is defined, in its zone's spawn file ("group": {"id", "weight"}), so its members are found by looking through
// the zones' files.
//
// A member's chance of appearing is worked out as the game picks (paperwhite2_spawns.c, Spawns_GroupDenied): each
// member can appear by its own conditions' chances, and among those that can, the group picks one by weight, or nobody
// by its nobody weight. Exactly, over every set of members that can appear, for up to EXACT_MEMBERS; by sampling past
// that. Conditions other than a chance count as holding, or, with the preview's world, as they are there.

import { holds, type Ambient, type Condition, type Membership, type PreviewWorld, type Rolls, type SpawnEntry } from "./spawns.ts";

export type { Membership };

export const GROUPS_PATH = "res/paperwhite2/overworld/groups.json";
export const GROUPS_SCHEMA = "res/paperwhite2/overworld/groups.schema.json";

export interface Group {
  id: string;
  name: string;
  /** Its home zone, a ZONE_* constant: where the editor lists it. */
  zone?: string;
  rolls?: Rolls;
  nobody?: number;
}

/** Where a member is: its zone (the spawn file's name) and what it is there. */
export interface MemberRef {
  zone: string;
  kind: "npc" | "instance" | "ambient";
  /** An NPC's id, or an instance's host's. */
  npcId?: number;
  /** An instance's index among its host's. */
  instance?: number;
  /** An ambient's index in the zone's list. */
  ambient?: number;
}

export interface Member extends MemberRef {
  label: string;
  weight: number;
  rolls: Rolls;
  /** Its chance of being able to appear, from its conditions (0 to 1). */
  able: number;
}

/** A zone's spawn file, as the groups read it. */
export interface ZoneSpawns { zone: string; npcs: SpawnEntry[]; ambients: Ambient[] }

export const sameRef = (a: MemberRef, b: MemberRef) =>
  a.zone === b.zone && a.kind === b.kind && a.npcId === b.npcId && a.instance === b.instance && a.ambient === b.ambient;

/** A condition's chance of holding: its chance clause's, or 0 where the preview's world fails the rest of it. */
function chanceOf(c: Condition | undefined, world: PreviewWorld | null): number {
  if (!c) return 1;
  if (world) {
    const { chance: _chance, ...rest } = c;
    if (!holds(rest, world, 0)) return 0;
  }
  return c.chance !== undefined ? c.chance / 100 : 1;
}

/** An instance's chance of holding, its flag counted where the preview has it set. */
function instanceChance(entry: SpawnEntry, k: number, world: PreviewWorld | null): number {
  const inst = entry.instances![k];
  const flag = inst.npc.flag;
  if (world && flag && flag !== 0 && world.flags.has(String(flag))) return 0;
  return chanceOf(inst.when, world);
}

/** Each group's members, by its id, from every zone's spawn file (the open zone's as it is now). */
export function groupMembers(files: ZoneSpawns[], world: PreviewWorld | null): Map<string, Member[]> {
  const out = new Map<string, Member[]>();
  const add = (membership: Membership | undefined, member: Omit<Member, "weight">) => {
    if (!membership) return;
    const list = out.get(membership.id) ?? [];
    list.push({ ...member, weight: membership.weight ?? 1 });
    out.set(membership.id, list);
  };
  for (const { zone, npcs, ambients } of files) {
    for (const entry of npcs) {
      const gate = chanceOf(entry.when, world);
      const rolls = entry.rolls ?? "hour";
      const instances = entry.instances ?? [];
      const chances = instances.map((_, k) => instanceChance(entry, k, world));
      add(entry.group, {
        zone, kind: "npc", npcId: entry.id, label: `NPC ${entry.id}`, rolls,
        able: gate * (instances.length ? 1 - chances.reduce((p, c) => p * (1 - c), 1) : 1),
      });
      instances.forEach((inst, k) => add(inst.group, {
        zone, kind: "instance", npcId: entry.id, instance: k, label: `${inst.name || `Instance ${k + 1}`} of NPC ${entry.id}`, rolls,
        able: gate * chances[k],
      }));
    }
    ambients.forEach((a, i) => add(a.group, {
      zone, kind: "ambient", ambient: i, label: a.name || `Ambient ${i + 1}`, rolls: a.rolls ?? "hour", able: chanceOf(a.when, world),
    }));
  }
  return out;
}

/** Past this many members, the odds are sampled rather than worked out over every set. */
const EXACT_MEMBERS = 14;
const SAMPLES = 40000;

/** Each member's chance of being the group's pick (0 to 1), in the members' order, and nobody's after them. */
export function groupOdds(members: Member[], nobody: number): { members: number[]; nobody: number } {
  const n = members.length;
  const picked = new Array<number>(n).fill(0);
  if (n <= EXACT_MEMBERS) {
    for (let set = 0; set < 1 << n; set++) {
      let p = 1;
      let total = nobody;
      for (let i = 0; i < n; i++) {
        if (set & (1 << i)) { p *= members[i].able; total += members[i].weight; } else p *= 1 - members[i].able;
      }
      if (p === 0 || total === 0) continue;
      for (let i = 0; i < n; i++) if (set & (1 << i)) picked[i] += (p * members[i].weight) / total;
    }
  } else {
    // (a fixed sequence, so the numbers don't jump between renders)
    let state = 0x9e3779b9;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
    for (let s = 0; s < SAMPLES; s++) {
      const able = members.map((m) => random() < m.able);
      const total = nobody + members.reduce((t, m, i) => t + (able[i] ? m.weight : 0), 0);
      if (total === 0) continue;
      let pick = random() * total;
      for (let i = 0; i < n; i++) {
        if (!able[i]) continue;
        if (pick < members[i].weight) { picked[i]++; break; }
        pick -= members[i].weight;
      }
    }
    for (let i = 0; i < n; i++) picked[i] /= SAMPLES;
  }
  return { members: picked, nobody: 1 - picked.reduce((a, b) => a + b, 0) };
}

/** A group's id from its name: lowercase words joined by underscores, made unique among the ids taken. */
export function newGroupId(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "group";
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}_${n}`;
  return id;
}

/** What's wrong with a group, for its warnings: rolling each entry across zones (which the build refuses), and
 * members across zones whose conditions read what another zone can't know. */
export function groupWarnings(group: Group, members: Member[], files: ZoneSpawns[]): string[] {
  const zones = new Set(members.map((m) => m.zone));
  if (zones.size < 2) return [];
  const out: string[] = [];
  if (group.rolls === "entry" || members.some((m) => m.rolls === "entry")) {
    out.push("It has members in several zones, so neither it nor its members can roll each entry: the build refuses it.");
  }
  const local = members.filter((m) => {
    const file = files.find((f) => f.zone === m.zone);
    const c = m.kind === "ambient" ? file?.ambients[m.ambient!]?.when
      : m.kind === "instance" ? file?.npcs.find((e) => e.id === m.npcId)?.instances?.[m.instance!]?.when
      : file?.npcs.find((e) => e.id === m.npcId)?.when;
    return !!c && ["weather", "terrain", "tile", "exterior"].some((k) => k in c);
  });
  if (local.length) {
    out.push(`${local.map((m) => m.label).join(", ")}: the weather, the terrain or the tile are read where the player is, not in the member's zone.`);
  }
  return out;
}
