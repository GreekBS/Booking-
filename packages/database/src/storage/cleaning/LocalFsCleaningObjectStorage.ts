import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { ICleaningObjectStorage } from "@hcp/domain";

export const DEFAULT_LOCAL_CLEANING_PHOTOS_DIR = resolve(
  process.cwd(),
  ".data",
  "cleaning-photos",
);

/**
 * Filesystem driver for local demo and real-database verification runs.
 * Not for production: `createReadUrl` returns a `file://` URL, so bytes are
 * only reachable from the machine that wrote them.
 */
export class LocalFsCleaningObjectStorage implements ICleaningObjectStorage {
  readonly driver = "fs";

  private readonly root: string;

  constructor(root: string = DEFAULT_LOCAL_CLEANING_PHOTOS_DIR) {
    this.root = resolve(root);
  }

  private resolveKey(key: string): string {
    const target = resolve(join(this.root, key));
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      throw new Error("Cleaning photo key escapes the storage root");
    }
    return target;
  }

  async upload(input: {
    key: string;
    contentType: string;
    body: Uint8Array;
  }): Promise<void> {
    const target = this.resolveKey(input.key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, input.body);
  }

  async createReadUrl(key: string): Promise<string> {
    const target = this.resolveKey(key);
    return `file://${target.split(sep).join("/")}`;
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  /** Verification helper — reads bytes straight back from disk. */
  async read(key: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.resolveKey(key)));
  }
}
