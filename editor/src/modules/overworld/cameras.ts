// The field's special cameras (res/field/cameras/, tools/data/camera_data.py): a zone's camera areas, the parts of the
// map where the camera changes as the player walks in, and the default cameras. Read from
// src/ov036/fld_scenearea_loader.c and field_camera.c:
//
// - A grid zone's file is the one whose "zones" lists it; a rail map's, the one res/field/rails/maps.json's
//   camera_areas numbers (rail_areas/, by order.json).
// - A rect area is tiles x to x + width - 1 by z to z + height - 1; its camera blends from its first setting to its
//   second as the player goes from its first row to its last (t = progress along z / (height * 16)): pitch, yaw and
//   distance, and with stay functions 5 to 7 the target offset and field of view too. Paper White 2 turns the yaw the
//   short way round (0 to 300 degrees is 60 back); the original game turned by the plain difference.
// - A circle area is the ring between its radii and its angles (atan2 of x and z from its center); with stay function
//   0 the camera looks at the center from beyond the player, with 1 from a fixed position at a fixed target.
// - The camera: eye = target + distance (sin yaw cos pitch, sin pitch, cos yaw cos pitch), looking at target plus its
//   offset; angles in 65536ths of a turn; the stored field of view is half the vertical angle; the screen is 4:3.

import { api } from "../../api.ts";
import type { Entity } from "./entities.ts";

export const FX = 4096;
const TURN = 65536;
export const angle = (v: number) => (v / TURN) * 2 * Math.PI;
export const degrees = (v: number) => (v / TURN) * 360;
export const fromDegrees = (d: number) => Math.round((d / 360) * TURN) & 0xffff;

export interface RectArea {
  x: number; z: number; width: number; unk06: number; height: number; unk0a: number;
  pitch: number[]; yaw: number[]; distance: number[]; forbid_delay: boolean; target_offset: number[][]; fov: number[];
}
export interface CircleArea {
  angle: number[]; radius: number[]; center: number[]; pitch: number; distance: number; target: number[]; position: number[];
}
export interface CameraArea { check: "rect" | "circle"; stay: number; enter: number; exit: number; rect?: RectArea; circle?: CircleArea }
export interface DefaultCamera { zoom: number; pitch: number; yaw: number; fov: number; near: number; far: number; bind: boolean; target: number[] }

/** A camera as the editor's view takes it: in world units, and its vertical field of view in degrees. */
export interface ViewCamera { eye: [number, number, number]; target: [number, number, number]; fov: number }

/** The file of a zone's camera areas, or where a new one would go. */
export async function cameraFileOf(zone: string, rails: string | null): Promise<{ path: string; exists: boolean }> {
  const constant = `ZONE_${zone.toUpperCase()}`;
  if (rails) {
    const maps = JSON.parse((await api.file("res/field/rails/maps.json")).text) as { maps: { rails: string; camera_areas: number | null }[] };
    const order = JSON.parse((await api.file("res/field/cameras/order.json")).text) as { rail_areas: string[] };
    const number = maps.maps.find((m) => m.rails === rails)?.camera_areas;
    const name = number === null || number === undefined ? null : order.rail_areas[number];
    return name ? { path: `res/field/cameras/rail_areas/${name}.json`, exists: true } : { path: "", exists: false };
  }
  const found = await api.scan("res/field/cameras/areas/*.json", `"${constant}"`);
  if (found.length) return { path: found[0].path, exists: true };
  return { path: `res/field/cameras/areas/${zone}.json`, exists: false };
}

/** The camera that looks from a distance at pitch and yaw at a point, then at the point plus an offset. */
function camera(target: number[], pitch: number, yaw: number, distance: number, offset: number[], fov: number): ViewCamera {
  const p = angle(pitch), y = angle(yaw);
  const cos = Math.max(Math.abs(Math.cos(p)), 0x200 / FX) * Math.sign(Math.cos(p) || 1);
  const dir = [Math.sin(y) * cos, Math.sin(p), Math.cos(y) * cos];
  const n = Math.hypot(dir[0], dir[1], dir[2]);
  return {
    eye: [target[0] + (distance * dir[0]) / n, target[1] + (distance * dir[1]) / n, target[2] + (distance * dir[2]) / n],
    target: [target[0] + offset[0], target[1] + offset[1], target[2] + offset[2]],
    fov: 2 * degrees(fov),
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A rect area's camera with the player at t across it (0 its first row, 1 its last), on its middle column, at a
 * height. */
export function rectCamera(r: RectArea, t: number, height: number): ViewCamera {
  const alongX = r.width === 1;
  const span = r.height * 16;
  const player = alongX
    ? [r.x * 16 + 8 + t * span, height, r.z * 16 + 8 + (r.unk06 * 16) / 2]
    : [r.x * 16 + (r.width * 16) / 2, height, r.z * 16 + 8 + t * span];
  const offset = [0, 1, 2].map((i) => lerp(r.target_offset[0][i], r.target_offset[1][i], t) / FX);
  // Paper White 2's game turns the short way round between the two yaws (fld_scenearea_loader.c)
  let turn = r.yaw[1] - r.yaw[0];
  if (turn > 0x8000) turn -= 0x10000;
  else if (turn < -0x8000) turn += 0x10000;
  return camera(player, lerp(r.pitch[0], r.pitch[1], t), r.yaw[0] + turn * t, lerp(r.distance[0], r.distance[1], t) / FX,
                offset, lerp(r.fov[0], r.fov[1], t));
}

/** A circle area's camera with the player at its middle angle and radius. */
export function circleCamera(c: CircleArea, stay: number): ViewCamera {
  if (stay === 1) return { eye: c.position.map((v) => v / FX) as [number, number, number], target: c.target.map((v) => v / FX) as [number, number, number], fov: 40 };
  const center = c.center.map((v) => v / FX);
  const a = angle((c.angle[0] + c.angle[1]) / 2);
  const n = [Math.sin(a), Math.cos(a)];
  const p = angle(c.pitch);
  return {
    eye: [center[0] + n[0] * Math.cos(p) * c.distance, center[1] + Math.sin(p) * c.distance, center[2] + n[1] * Math.cos(p) * c.distance],
    target: [center[0], center[1], center[2]],
    fov: 40,
  };
}

/** A default camera with the player at a point. */
export function defaultCamera(d: DefaultCamera, player: number[]): ViewCamera {
  const target = d.bind ? player : [0, 0, 0];
  return camera(target, d.pitch, d.yaw, d.zoom, d.target.map((v) => v / FX), d.fov);
}

/** The areas as the map's entities, at their first tile (a circle at its center). */
export function cameraEntities(areas: CameraArea[]): Entity[] {
  return areas.map((a, index) => {
    const r = a.rect, c = a.circle;
    const x = r ? r.x : c ? Math.floor(c.center[0] / FX / 16) : null;
    const z = r ? r.z : c ? Math.floor(c.center[2] / FX / 16) : null;
    return {
      kind: "camera", index, x, z, y: c ? c.center[1] / FX : 0,
      width: r ? (r.width === 1 ? r.height : r.width) : 1, depth: r ? (r.width === 1 ? r.unk06 : r.height) : 1,
      label: `Camera area ${index} (${a.check})`,
    } as Entity;
  });
}

/** A new rect area of 4 by 4 tiles from a tile, with the normal camera at both ends. */
export function newRectArea(x: number, z: number, d: DefaultCamera | undefined): CameraArea {
  const pitch = d?.pitch ?? 0x25d8, yaw = d?.yaw ?? 0, distance = (d?.zoom ?? 237) * FX, fov = d?.fov ?? 0xe38;
  const offset = d?.target ?? [0, 4 * FX, 0];
  return {
    check: "rect", stay: 5, enter: 6, exit: 7,
    rect: { x, z, width: 4, unk06: 1, height: 4, unk0a: 0, pitch: [pitch, pitch], yaw: [yaw, yaw], distance: [distance, distance],
            forbid_delay: false, target_offset: [[...offset], [...offset]], fov: [fov, fov] },
  };
}
