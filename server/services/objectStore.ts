import { createHash, randomUUID } from "node:crypto";
import { promises as fs, createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";

export interface ObjectStore {
  put(data: Buffer): Promise<string>;
  get(key: string): Promise<Buffer>;
  open(key: string): Promise<Readable>;
}
export const objectDigest = (data: Buffer) =>
  createHash("sha256").update(data).digest("hex");
export class DocumentInputError extends Error {}

export function decodeDocument(value: string): Buffer {
  const base64 = value.startsWith("data:")
    ? value.slice(value.indexOf(",") + 1)
    : value;
  if (!base64.length || base64.length > Math.ceil((10 * 1024 * 1024) / 3) * 4)
    throw new DocumentInputError("Document must be between 1 byte and 10 MiB");
  const data = Buffer.from(base64, "base64");
  if (data.toString("base64") !== base64)
    throw new DocumentInputError("Invalid base64 document");
  if (!data.length || data.length > 10 * 1024 * 1024)
    throw new DocumentInputError("Document must be between 1 byte and 10 MiB");
  return data;
}

/** Immutable content-addressed objects on a persistent volume, outside SQL and the web root. */
export class FileObjectStore implements ObjectStore {
  constructor(private readonly directory: string) {}
  private location(key: string) {
    if (!/^[a-f0-9]{64}$/.test(key))
      throw new Error("Invalid document object key");
    return path.join(this.directory, key.slice(0, 2), key);
  }
  async put(data: Buffer) {
    const key = objectDigest(data),
      target = this.location(key);
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const temporary = `${target}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, data, { mode: 0o600, flag: "wx" });
    await fs.rename(temporary, target);
    return key;
  }
  async get(key: string) {
    const data = await fs.readFile(this.location(key));
    if (objectDigest(data) !== key)
      throw new Error("Corrupted document object");
    return data;
  }
  async open(key: string) {
    const target = this.location(key);
    await fs.access(target);
    return createReadStream(target);
  }
}
export const objectStore = new FileObjectStore(
  process.env.DOCUMENT_OBJECT_DIR || "/var/finance-duck/objects",
);
