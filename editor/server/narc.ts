// Reads one member of a Nitro archive (NARC): its file allocation table (BTAF) gives each member's start and end in
// the image (GMIF), after the name table (BTNF).

export function narcMember(data: Buffer, index: number): Buffer | null {
  if (data.toString("latin1", 0, 4) !== "NARC") return null;
  const headerSize = data.readUInt16LE(12);
  const btaf = headerSize;
  if (data.toString("latin1", btaf, btaf + 4) !== "BTAF") return null;
  const count = data.readUInt16LE(btaf + 8);
  if (index >= count) return null;
  const btnf = btaf + data.readUInt32LE(btaf + 4);
  const gmif = btnf + data.readUInt32LE(btnf + 4);
  const start = data.readUInt32LE(btaf + 12 + index * 8);
  const end = data.readUInt32LE(btaf + 16 + index * 8);
  return data.subarray(gmif + 8 + start, gmif + 8 + end);
}
