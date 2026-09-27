// A reader for STORED zips — what `zip -0` writes for the photo album (DEC-182).
// About thirty lines, so the album's tests (the unit here, the real-worker e2e)
// can open a part and hash every entry without an `unzip` on the runner and
// without a dependency. It refuses anything but method 0: an album part that
// deflates is itself a finding.

export interface ZipEntry {
  name: string;
  method: number;
  extraLength: number;
  data: Buffer;
}

export function readStoredZip(zip: Buffer): ZipEntry[] {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i -= 1) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip: no end-of-central-directory record");
  const count = zip.readUInt16LE(eocd + 10);
  let at = zip.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n += 1) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error(`bad central directory header at ${at}`);
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    if (method !== 0) throw new Error(`${name} is not stored (method ${method})`);
    const dataAt = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    entries.push({ name, method, extraLength, data: zip.subarray(dataAt, dataAt + size) });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
